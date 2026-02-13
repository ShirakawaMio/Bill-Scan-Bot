import crypto from 'crypto';
import db from './database.js';
import { createUser } from './auth.js';

export interface TelegramUser {
  chat_id: string;
  user_id: string;
  google_api_key: string | null;
  created_at: string;
}

export function findTelegramUser(chatId: string): TelegramUser | undefined {
  const stmt = db.prepare('SELECT * FROM telegram_users WHERE chat_id = ?');
  return stmt.get(String(chatId)) as TelegramUser | undefined;
}

export function createTelegramUser(chatId: string, name: string): TelegramUser {
  const email = `tg_${chatId}@telegram.local`;
  const password = crypto.randomUUID();
  const user = createUser(email, password, name);

  const createdAt = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO telegram_users (chat_id, user_id, google_api_key, created_at)
    VALUES (?, ?, NULL, ?)
  `);
  stmt.run(String(chatId), user.id, createdAt);

  return { chat_id: String(chatId), user_id: user.id, google_api_key: null, created_at: createdAt };
}

export function getOrCreateTelegramUser(chatId: string, name: string): TelegramUser {
  const existing = findTelegramUser(chatId);
  if (existing) return existing;
  return createTelegramUser(chatId, name);
}

export function setGoogleApiKey(chatId: string, apiKey: string): boolean {
  const stmt = db.prepare('UPDATE telegram_users SET google_api_key = ? WHERE chat_id = ?');
  const result = stmt.run(apiKey, String(chatId));
  return result.changes > 0;
}

export function getGoogleApiKey(chatId: string): string | null {
  const user = findTelegramUser(chatId);
  return user?.google_api_key || null;
}
