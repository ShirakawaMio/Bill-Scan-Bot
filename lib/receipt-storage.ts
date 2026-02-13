import crypto from 'crypto';
import db from './database.js';
import {
  Receipt,
  ReceiptItem,
  ReceiptAnalysisResult,
  UserReceipt,
  UserReceiptWithDetails,
} from '../types/receipt.js';

interface ReceiptRow {
  id: string;
  store_name: string | null;
  date: string | null;
  time: string | null;
  subtotal: number | null;
  tax: number | null;
  total_amount: number | null;
  currency: string | null;
  payment_method: string | null;
  raw_response: string | null;
  created_at: string;
}

interface ReceiptItemRow {
  id: string;
  receipt_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  category: string | null;
}

interface UserReceiptRow {
  id: string;
  user_id: string;
  receipt_id: string;
  added_at: string;
  notes: string | null;
}

function rowToReceipt(row: ReceiptRow): Receipt {
  return {
    id: row.id,
    store_name: row.store_name,
    date: row.date,
    time: row.time,
    subtotal: row.subtotal,
    tax: row.tax,
    total_amount: row.total_amount,
    currency: row.currency,
    payment_method: row.payment_method,
    raw_response: row.raw_response,
    created_at: row.created_at,
  };
}

function rowToReceiptItem(row: ReceiptItemRow): ReceiptItem {
  return {
    id: row.id,
    receipt_id: row.receipt_id,
    name: row.name,
    quantity: row.quantity,
    unit_price: row.unit_price,
    total_price: row.total_price,
    category: row.category,
  };
}

export function createReceipt(
  analysisResult: ReceiptAnalysisResult,
  rawResponse?: string
): Receipt {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  const insertReceipt = db.prepare(`
    INSERT INTO receipts (id, store_name, date, time, subtotal, tax, total_amount, currency, payment_method, raw_response, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertItem = db.prepare(`
    INSERT INTO receipt_items (id, receipt_id, name, quantity, unit_price, total_price, category)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    insertReceipt.run(
      id,
      analysisResult.store_name,
      analysisResult.date,
      analysisResult.time,
      analysisResult.subtotal,
      analysisResult.tax,
      analysisResult.total_amount,
      analysisResult.currency,
      analysisResult.payment_method,
      rawResponse || JSON.stringify(analysisResult),
      createdAt
    );

    for (const item of analysisResult.items) {
      const itemId = crypto.randomUUID();
      insertItem.run(
        itemId,
        id,
        item.name,
        item.quantity,
        item.unit_price,
        item.total_price,
        item.category
      );
    }
  });

  transaction();

  return {
    id,
    store_name: analysisResult.store_name,
    date: analysisResult.date,
    time: analysisResult.time,
    subtotal: analysisResult.subtotal,
    tax: analysisResult.tax,
    total_amount: analysisResult.total_amount,
    currency: analysisResult.currency,
    payment_method: analysisResult.payment_method,
    raw_response: rawResponse || JSON.stringify(analysisResult),
    created_at: createdAt,
    items: analysisResult.items,
  };
}

export function getReceiptById(id: string): Receipt | undefined {
  const stmt = db.prepare('SELECT * FROM receipts WHERE id = ?');
  const row = stmt.get(id) as ReceiptRow | undefined;

  if (!row) return undefined;

  const receipt = rowToReceipt(row);
  receipt.items = getReceiptItems(id);
  return receipt;
}

export function getReceiptItems(receiptId: string): ReceiptItem[] {
  const stmt = db.prepare('SELECT * FROM receipt_items WHERE receipt_id = ?');
  const rows = stmt.all(receiptId) as ReceiptItemRow[];
  return rows.map(rowToReceiptItem);
}

export function deleteReceipt(id: string): boolean {
  const stmt = db.prepare('DELETE FROM receipts WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

export function linkReceiptToUser(
  userId: string,
  receiptId: string,
  notes?: string
): UserReceipt {
  const id = crypto.randomUUID();
  const addedAt = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO user_receipts (id, user_id, receipt_id, added_at, notes)
    VALUES (?, ?, ?, ?, ?)
  `);

  stmt.run(id, userId, receiptId, addedAt, notes || null);

  return {
    id,
    user_id: userId,
    receipt_id: receiptId,
    added_at: addedAt,
    notes: notes || null,
  };
}

export function unlinkReceiptFromUser(userId: string, receiptId: string): boolean {
  const stmt = db.prepare(
    'DELETE FROM user_receipts WHERE user_id = ? AND receipt_id = ?'
  );
  const result = stmt.run(userId, receiptId);
  return result.changes > 0;
}

export function getUserReceipts(userId: string): UserReceiptWithDetails[] {
  const stmt = db.prepare(`
    SELECT 
      r.*,
      ur.id as user_receipt_id,
      ur.added_at,
      ur.notes
    FROM receipts r
    INNER JOIN user_receipts ur ON r.id = ur.receipt_id
    WHERE ur.user_id = ?
    ORDER BY ur.added_at DESC
  `);

  const rows = stmt.all(userId) as (ReceiptRow & {
    user_receipt_id: string;
    added_at: string;
    notes: string | null;
  })[];

  return rows.map((row) => {
    const receipt = rowToReceipt(row);
    receipt.items = getReceiptItems(row.id);
    return {
      ...receipt,
      user_receipt_id: row.user_receipt_id,
      added_at: row.added_at,
      notes: row.notes,
    };
  });
}

export function getUserReceiptById(
  userId: string,
  receiptId: string
): UserReceiptWithDetails | undefined {
  const stmt = db.prepare(`
    SELECT 
      r.*,
      ur.id as user_receipt_id,
      ur.added_at,
      ur.notes
    FROM receipts r
    INNER JOIN user_receipts ur ON r.id = ur.receipt_id
    WHERE ur.user_id = ? AND r.id = ?
  `);

  const row = stmt.get(userId, receiptId) as
    | (ReceiptRow & {
        user_receipt_id: string;
        added_at: string;
        notes: string | null;
      })
    | undefined;

  if (!row) return undefined;

  const receipt = rowToReceipt(row);
  receipt.items = getReceiptItems(row.id);

  return {
    ...receipt,
    user_receipt_id: row.user_receipt_id,
    added_at: row.added_at,
    notes: row.notes,
  };
}

export function updateUserReceiptNotes(
  userId: string,
  receiptId: string,
  notes: string
): boolean {
  const stmt = db.prepare(`
    UPDATE user_receipts 
    SET notes = ? 
    WHERE user_id = ? AND receipt_id = ?
  `);
  const result = stmt.run(notes, userId, receiptId);
  return result.changes > 0;
}

export function createReceiptForUser(
  userId: string,
  analysisResult: ReceiptAnalysisResult,
  notes?: string,
  rawResponse?: string
): UserReceiptWithDetails {
  const receipt = createReceipt(analysisResult, rawResponse);
  const userReceipt = linkReceiptToUser(userId, receipt.id, notes);

  return {
    ...receipt,
    user_receipt_id: userReceipt.id,
    added_at: userReceipt.added_at,
    notes: userReceipt.notes,
  };
}

export function getUserReceiptStats(userId: string): {
  totalReceipts: number;
  totalAmount: number;
  averageAmount: number;
} {
  const stmt = db.prepare(`
    SELECT 
      COUNT(*) as total_receipts,
      COALESCE(SUM(r.total_amount), 0) as total_amount,
      COALESCE(AVG(r.total_amount), 0) as average_amount
    FROM receipts r
    INNER JOIN user_receipts ur ON r.id = ur.receipt_id
    WHERE ur.user_id = ?
  `);

  const row = stmt.get(userId) as {
    total_receipts: number;
    total_amount: number;
    average_amount: number;
  };

  return {
    totalReceipts: row.total_receipts,
    totalAmount: row.total_amount,
    averageAmount: row.average_amount,
  };
}
