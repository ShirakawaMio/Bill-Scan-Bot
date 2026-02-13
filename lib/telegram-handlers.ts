import {
  TgMessage,
  sendMessage,
  sendChatAction,
  getFile,
  downloadFileBuffer,
} from './telegram-bot.js';
import {
  getOrCreateTelegramUser,
  findTelegramUser,
  setGoogleApiKey,
  getGoogleApiKey,
} from './telegram-users.js';
import { analyzeReceiptImage, createGeminiModel } from './receipt.js';
import {
  createReceiptForUser,
  getUserReceipts,
  getUserReceiptById,
  deleteReceipt,
  unlinkReceiptFromUser,
  getUserReceiptStats,
} from './receipt-storage.js';
import { ReceiptAnalysisResult } from '../types/receipt.js';

function getUserName(msg: TgMessage): string {
  if (!msg.from) return 'User';
  return [msg.from.first_name, msg.from.last_name].filter(Boolean).join(' ');
}

function formatReceipt(r: any): string {
  let text = `🧾 <b>${r.store_name || '未知商店'}</b>\n`;
  text += `📅 ${r.date || '未知日期'}  🕐 ${r.time || ''}\n`;
  if (r.items && r.items.length > 0) {
    text += `\n📦 <b>商品明细:</b>\n`;
    for (const item of r.items) {
      text += `  • ${item.name}  ×${item.quantity}  ${item.total_price}\n`;
    }
  }
  if (r.subtotal != null) text += `\n小计: ${r.subtotal}`;
  if (r.tax != null) text += `  税: ${r.tax}`;
  text += `\n💰 <b>总计: ${r.total_amount ?? '未知'} ${r.currency || ''}</b>`;
  if (r.payment_method) text += `\n💳 ${r.payment_method}`;
  return text;
}

async function handleStart(msg: TgMessage): Promise<void> {
  const chatId = msg.chat.id;
  const name = getUserName(msg);
  getOrCreateTelegramUser(String(chatId), name);

  await sendMessage(chatId,
    `👋 你好 <b>${name}</b>！欢迎使用 UniBon 账单管理助手。\n\n` +
    `📋 <b>使用步骤:</b>\n` +
    `1️⃣ 先设置你的 Google API Key:\n` +
    `   /setkey YOUR_API_KEY\n\n` +
    `2️⃣ 然后直接发送账单照片或文字描述\n\n` +
    `📌 <b>可用命令:</b>\n` +
    `/setkey - 设置/更新 Google API Key\n` +
    `/stats - 查看消费统计\n` +
    `/history - 查看最近账单\n` +
    `/help - 帮助信息`
  );
}

async function handleSetKey(msg: TgMessage): Promise<void> {
  const chatId = msg.chat.id;
  const name = getUserName(msg);
  getOrCreateTelegramUser(String(chatId), name);

  const text = msg.text || '';
  const parts = text.split(/\s+/);
  if (parts.length < 2 || !parts[1]) {
    await sendMessage(chatId, '⚠️ 请提供 API Key:\n<code>/setkey YOUR_GOOGLE_API_KEY</code>');
    return;
  }

  const apiKey = parts[1];
  setGoogleApiKey(String(chatId), apiKey);
  await sendMessage(chatId, '✅ Google API Key 已更新！现在你可以发送账单照片或文字来分析了。');
}

async function handleStats(msg: TgMessage): Promise<void> {
  const chatId = msg.chat.id;
  const tgUser = findTelegramUser(String(chatId));
  if (!tgUser) {
    await sendMessage(chatId, '⚠️ 请先使用 /start 注册。');
    return;
  }

  const stats = getUserReceiptStats(tgUser.user_id);
  await sendMessage(chatId,
    `📊 <b>消费统计</b>\n\n` +
    `🧾 账单总数: <b>${stats.totalReceipts}</b>\n` +
    `💰 总消费: <b>${stats.totalAmount.toFixed(2)}</b>\n` +
    `📈 平均每单: <b>${stats.averageAmount.toFixed(2)}</b>`
  );
}

async function handleHistory(msg: TgMessage): Promise<void> {
  const chatId = msg.chat.id;
  const tgUser = findTelegramUser(String(chatId));
  if (!tgUser) {
    await sendMessage(chatId, '⚠️ 请先使用 /start 注册。');
    return;
  }

  const receipts = getUserReceipts(tgUser.user_id);
  if (receipts.length === 0) {
    await sendMessage(chatId, '📭 暂无账单记录。发送一张账单照片开始吧！');
    return;
  }

  const recent = receipts.slice(0, 10);
  let text = `📋 <b>最近 ${recent.length} 条账单</b>\n\n`;
  for (const r of recent) {
    const shortId = r.id.substring(0, 8);
    text += `🧾 <code>${shortId}</code> | ${r.date || '未知'} | ${r.store_name || '未知'} | ${r.total_amount ?? '?'} ${r.currency || ''}\n`;
  }
  text += `\n查看详情: /receipt_ID前8位`;
  await sendMessage(chatId, text);
}

async function handleReceiptDetail(msg: TgMessage, receiptIdPrefix: string): Promise<void> {
  const chatId = msg.chat.id;
  const tgUser = findTelegramUser(String(chatId));
  if (!tgUser) {
    await sendMessage(chatId, '⚠️ 请先使用 /start 注册。');
    return;
  }

  const receipts = getUserReceipts(tgUser.user_id);
  const match = receipts.find((r) => r.id.startsWith(receiptIdPrefix));
  if (!match) {
    await sendMessage(chatId, '❌ 未找到该账单。使用 /history 查看所有账单。');
    return;
  }

  await sendMessage(chatId, formatReceipt(match));
}

async function handleDelete(msg: TgMessage): Promise<void> {
  const chatId = msg.chat.id;
  const tgUser = findTelegramUser(String(chatId));
  if (!tgUser) {
    await sendMessage(chatId, '⚠️ 请先使用 /start 注册。');
    return;
  }

  const text = msg.text || '';
  const parts = text.split(/\s+/);
  if (parts.length < 2) {
    await sendMessage(chatId, '⚠️ 请提供账单ID:\n<code>/delete ID前8位</code>');
    return;
  }

  const idPrefix = parts[1];
  const receipts = getUserReceipts(tgUser.user_id);
  const match = receipts.find((r) => r.id.startsWith(idPrefix));
  if (!match) {
    await sendMessage(chatId, '❌ 未找到该账单。');
    return;
  }

  unlinkReceiptFromUser(tgUser.user_id, match.id);
  deleteReceipt(match.id);
  await sendMessage(chatId, `✅ 账单 <code>${match.id.substring(0, 8)}</code> 已删除。`);
}

async function handleHelp(msg: TgMessage): Promise<void> {
  await sendMessage(msg.chat.id,
    `📖 <b>UniBon 使用帮助</b>\n\n` +
    `📸 <b>分析账单:</b> 直接发送账单照片\n` +
    `✏️ <b>文字记账:</b> 直接发送文字描述（如"星巴克 拿铁 28元"）\n\n` +
    `📌 <b>命令列表:</b>\n` +
    `/start - 开始使用\n` +
    `/setkey KEY - 设置 Google API Key\n` +
    `/stats - 消费统计\n` +
    `/history - 最近账单\n` +
    `/receipt_ID - 查看账单详情（ID为前8位）\n` +
    `/delete ID - 删除账单\n` +
    `/help - 帮助信息`
  );
}

async function handlePhoto(msg: TgMessage): Promise<void> {
  const chatId = msg.chat.id;
  const tgUser = findTelegramUser(String(chatId));
  if (!tgUser) {
    getOrCreateTelegramUser(String(chatId), getUserName(msg));
  }

  const user = findTelegramUser(String(chatId))!;
  const apiKey = user.google_api_key;
  if (!apiKey) {
    await sendMessage(chatId, '⚠️ 请先设置 Google API Key:\n/setkey YOUR_API_KEY');
    return;
  }

  await sendChatAction(chatId, 'typing');

  try {
    // Get the largest photo
    const photos = msg.photo!;
    const largest = photos[photos.length - 1];
    const file = await getFile(largest.file_id);

    if (!file.file_path) {
      await sendMessage(chatId, '❌ 无法获取照片文件。');
      return;
    }

    const buffer = await downloadFileBuffer(file.file_path);
    const base64 = buffer.toString('base64');
    const mimeType = file.file_path.endsWith('.png') ? 'image/png' : 'image/jpeg';
    const imageData = `data:${mimeType};base64,${base64}`;

    await sendMessage(chatId, '🔍 正在分析账单...');
    const rawResult = await analyzeReceiptImage(imageData, apiKey);

    let analysisResult: ReceiptAnalysisResult;
    try {
      analysisResult = JSON.parse(rawResult);
    } catch {
      await sendMessage(chatId, '❌ AI 返回的结果无法解析，请重试。');
      return;
    }

    if (analysisResult.error) {
      await sendMessage(chatId, `⚠️ 分析结果: ${analysisResult.error}`);
      return;
    }

    // Save to database
    const saved = createReceiptForUser(user.user_id, analysisResult, msg.caption || undefined, rawResult);

    await sendMessage(chatId, formatReceipt(saved) + `\n\n✅ 已保存 (ID: <code>${saved.id.substring(0, 8)}</code>)`);
  } catch (err: any) {
    console.error('[Telegram] Photo analysis error:', err);
    await sendMessage(chatId, `❌ 分析失败: ${err.message || '未知错误'}`);
  }
}

async function handleTextReceipt(msg: TgMessage): Promise<void> {
  const chatId = msg.chat.id;
  const tgUser = findTelegramUser(String(chatId));
  if (!tgUser) {
    getOrCreateTelegramUser(String(chatId), getUserName(msg));
  }

  const user = findTelegramUser(String(chatId))!;
  const apiKey = user.google_api_key;
  if (!apiKey) {
    await sendMessage(chatId, '⚠️ 请先设置 Google API Key:\n/setkey YOUR_API_KEY');
    return;
  }

  await sendChatAction(chatId, 'typing');

  try {
    const model = createGeminiModel(apiKey);
    const result = await model.generateContent([
      `Analyze this text description of a receipt or expense and extract structured data. The text may be in any language. Text: "${msg.text}"`,
    ]);
    const rawResult = result.response.text();

    let analysisResult: ReceiptAnalysisResult;
    try {
      analysisResult = JSON.parse(rawResult);
    } catch {
      await sendMessage(chatId, '❌ AI 返回的结果无法解析，请重试。');
      return;
    }

    if (analysisResult.error) {
      await sendMessage(chatId, `⚠️ ${analysisResult.error}`);
      return;
    }

    const saved = createReceiptForUser(user.user_id, analysisResult, undefined, rawResult);
    await sendMessage(chatId, formatReceipt(saved) + `\n\n✅ 已保存 (ID: <code>${saved.id.substring(0, 8)}</code>)`);
  } catch (err: any) {
    console.error('[Telegram] Text analysis error:', err);
    await sendMessage(chatId, `❌ 处理失败: ${err.message || '未知错误'}`);
  }
}

export async function handleMessage(msg: TgMessage): Promise<void> {
  const text = msg.text || '';

  // Commands
  if (text.startsWith('/start')) return handleStart(msg);
  if (text.startsWith('/setkey')) return handleSetKey(msg);
  if (text.startsWith('/stats')) return handleStats(msg);
  if (text.startsWith('/history')) return handleHistory(msg);
  if (text.startsWith('/delete')) return handleDelete(msg);
  if (text.startsWith('/help')) return handleHelp(msg);

  // /receipt_XXXXXXXX pattern
  const receiptMatch = text.match(/^\/receipt[_]?([a-f0-9]+)/i);
  if (receiptMatch) return handleReceiptDetail(msg, receiptMatch[1]);

  // Photo message
  if (msg.photo && msg.photo.length > 0) return handlePhoto(msg);

  // Plain text → treat as text receipt
  if (text && !text.startsWith('/')) return handleTextReceipt(msg);

  // Unknown command
  if (text.startsWith('/')) {
    await sendMessage(msg.chat.id, '❓ 未知命令。使用 /help 查看可用命令。');
  }
}
