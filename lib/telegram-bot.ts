import https from 'https';
import http from 'http';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
}

export interface TgMessage {
  message_id: number;
  from?: { id: number; first_name: string; last_name?: string; username?: string };
  chat: { id: number; type: string };
  date: number;
  text?: string;
  photo?: TgPhotoSize[];
  caption?: string;
}

interface TgPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

interface TgFile {
  file_id: string;
  file_path?: string;
}

function apiRequest(method: string, body?: object): Promise<any> {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const url = new URL(`${API_BASE}/${method}`);

    const options: https.RequestOptions = {
      method: 'POST',
      hostname: url.hostname,
      path: url.pathname,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    };

    const req = https.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(Buffer.concat(chunks).toString());
          if (json.ok) resolve(json.result);
          else reject(new Error(json.description || 'Telegram API error'));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

export async function sendMessage(chatId: number | string, text: string, parseMode?: string): Promise<void> {
  await apiRequest('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: parseMode || 'HTML',
  });
}

export async function sendChatAction(chatId: number | string, action: string): Promise<void> {
  await apiRequest('sendChatAction', { chat_id: chatId, action });
}

export async function getFile(fileId: string): Promise<TgFile> {
  return apiRequest('getFile', { file_id: fileId });
}

export function downloadFileBuffer(filePath: string): Promise<Buffer> {
  const url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

export async function setMyCommands(): Promise<void> {
  await apiRequest('setMyCommands', {
    commands: [
      { command: 'start', description: '开始使用 / Get started' },
      { command: 'setkey', description: '设置 Google API Key' },
      { command: 'stats', description: '查看消费统计' },
      { command: 'history', description: '查看最近账单' },
      { command: 'help', description: '帮助信息' },
    ],
  });
}

export type MessageHandler = (msg: TgMessage) => Promise<void>;

let running = false;

export async function startPolling(handler: MessageHandler): Promise<void> {
  if (!BOT_TOKEN) {
    console.error('[Telegram] TELEGRAM_BOT_TOKEN not set, bot disabled');
    return;
  }

  running = true;
  let offset = 0;

  await setMyCommands();
  console.log('[Telegram] Bot started polling');

  while (running) {
    try {
      const updates: TgUpdate[] = await apiRequest('getUpdates', {
        offset,
        timeout: 30,
        allowed_updates: ['message'],
      });

      for (const update of updates) {
        offset = update.update_id + 1;
        if (update.message) {
          handler(update.message).catch((err) =>
            console.error('[Telegram] Handler error:', err)
          );
        }
      }
    } catch (err: any) {
      console.error('[Telegram] Polling error:', err.message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

export function stopPolling(): void {
  running = false;
}
