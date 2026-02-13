import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DB_PATH = path.join(__dirname, 'test_unibon.db');

process.env.DB_PATH = TEST_DB_PATH;

const { createUser, findUserByEmail, findUserById, verifyPassword } = await import('../lib/auth.js');
const {
  createReceipt,
  getReceiptById,
  getReceiptItems,
  deleteReceipt,
  linkReceiptToUser,
  unlinkReceiptFromUser,
  getUserReceipts,
  getUserReceiptById,
  updateUserReceiptNotes,
  createReceiptForUser,
  getUserReceiptStats,
} = await import('../lib/receipt-storage.js');
const { db } = await import('../lib/database.js');

describe('Database Tests', () => {
  afterAll(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  beforeEach(() => {
    db.exec('DELETE FROM user_receipts');
    db.exec('DELETE FROM receipt_items');
    db.exec('DELETE FROM receipts');
    db.exec('DELETE FROM users');
  });

  describe('User Operations', () => {
    it('should create a new user', () => {
      const user = createUser('test@example.com', 'password123', 'Test User');

      expect(user).toBeDefined();
      expect(user.id).toBeDefined();
      expect(user.email).toBe('test@example.com');
      expect(user.name).toBe('Test User');
      expect(user.password).not.toBe('password123'); // should be hashed
      expect(user.createdAt).toBeInstanceOf(Date);
    });

    it('should find user by email', () => {
      createUser('find@example.com', 'password123', 'Find User');

      const foundUser = findUserByEmail('find@example.com');

      expect(foundUser).toBeDefined();
      expect(foundUser?.email).toBe('find@example.com');
      expect(foundUser?.name).toBe('Find User');
    });

    it('should return undefined for non-existent email', () => {
      const foundUser = findUserByEmail('nonexistent@example.com');

      expect(foundUser).toBeUndefined();
    });

    it('should find user by id', () => {
      const user = createUser('id@example.com', 'password123', 'ID User');

      const foundUser = findUserById(user.id);

      expect(foundUser).toBeDefined();
      expect(foundUser?.id).toBe(user.id);
      expect(foundUser?.email).toBe('id@example.com');
    });

    it('should verify correct password', () => {
      const user = createUser('verify@example.com', 'mypassword', 'Verify User');

      const isValid = verifyPassword('mypassword', user.password);

      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', () => {
      const user = createUser('reject@example.com', 'correctpassword', 'Reject User');

      const isValid = verifyPassword('wrongpassword', user.password);

      expect(isValid).toBe(false);
    });

    it('should not create duplicate users with same email', () => {
      createUser('duplicate@example.com', 'password123', 'First User');

      expect(() => {
        createUser('duplicate@example.com', 'password456', 'Second User');
      }).toThrow();
    });
  });

  describe('Receipt Operations', () => {
    const mockReceiptData = {
      store_name: 'Test Store',
      date: '2026-01-07',
      time: '14:30',
      items: [
        { name: 'Apple', quantity: 2, unit_price: 1.5, total_price: 3.0, category: "Groceries" },
        { name: 'Banana', quantity: 3, unit_price: 0.5, total_price: 1.5, category: "Groceries" },
      ],
      subtotal: 4.5,
      tax: 0.45,
      total_amount: 4.95,
      currency: 'EUR',
      payment_method: 'Card',
      error: null,
    };

    it('should create a receipt with items', () => {
      const receipt = createReceipt(mockReceiptData);

      expect(receipt).toBeDefined();
      expect(receipt.id).toBeDefined();
      expect(receipt.store_name).toBe('Test Store');
      expect(receipt.total_amount).toBe(4.95);
      expect(receipt.items).toHaveLength(2);
    });

    it('should get receipt by id', () => {
      const created = createReceipt(mockReceiptData);

      const receipt = getReceiptById(created.id);

      expect(receipt).toBeDefined();
      expect(receipt?.id).toBe(created.id);
      expect(receipt?.store_name).toBe('Test Store');
    });

    it('should return undefined for non-existent receipt', () => {
      const receipt = getReceiptById('non-existent-id');

      expect(receipt).toBeUndefined();
    });

    it('should get receipt items', () => {
      const receipt = createReceipt(mockReceiptData);

      const items = getReceiptItems(receipt.id);

      expect(items).toHaveLength(2);
      expect(items[0].name).toBe('Apple');
      expect(items[1].name).toBe('Banana');
    });

    it('should delete receipt', () => {
      const receipt = createReceipt(mockReceiptData);

      const deleted = deleteReceipt(receipt.id);

      expect(deleted).toBe(true);
      expect(getReceiptById(receipt.id)).toBeUndefined();
    });

    it('should return false when deleting non-existent receipt', () => {
      const deleted = deleteReceipt('non-existent-id');

      expect(deleted).toBe(false);
    });

    it('should cascade delete receipt items when receipt is deleted', () => {
      const receipt = createReceipt(mockReceiptData);
      const receiptId = receipt.id;

      deleteReceipt(receiptId);

      const items = getReceiptItems(receiptId);
      expect(items).toHaveLength(0);
    });
  });

  describe('User-Receipt Association', () => {
    const mockReceiptData = {
      store_name: 'Association Store',
      date: '2026-01-07',
      time: '10:00',
      items: [{ name: 'Item', quantity: 1, unit_price: 10, total_price: 10, category: null }],
      subtotal: 10,
      tax: 1,
      total_amount: 11,
      currency: 'EUR',
      payment_method: 'Cash',
      error: null,
    };

    it('should link receipt to user', () => {
      const user = createUser('link@example.com', 'password', 'Link User');
      const receipt = createReceipt(mockReceiptData);

      const userReceipt = linkReceiptToUser(user.id, receipt.id, 'Test notes');

      expect(userReceipt).toBeDefined();
      expect(userReceipt.user_id).toBe(user.id);
      expect(userReceipt.receipt_id).toBe(receipt.id);
      expect(userReceipt.notes).toBe('Test notes');
    });

    it('should unlink receipt from user', () => {
      const user = createUser('unlink@example.com', 'password', 'Unlink User');
      const receipt = createReceipt(mockReceiptData);
      linkReceiptToUser(user.id, receipt.id);

      const unlinked = unlinkReceiptFromUser(user.id, receipt.id);

      expect(unlinked).toBe(true);
    });

    it('should get user receipts', () => {
      const user = createUser('getreceipts@example.com', 'password', 'Get Receipts User');
      const receipt1 = createReceipt({ ...mockReceiptData, store_name: 'Store 1' });
      const receipt2 = createReceipt({ ...mockReceiptData, store_name: 'Store 2' });
      linkReceiptToUser(user.id, receipt1.id);
      linkReceiptToUser(user.id, receipt2.id);

      const userReceipts = getUserReceipts(user.id);

      expect(userReceipts).toHaveLength(2);
    });

    it('should get user receipt by id', () => {
      const user = createUser('getone@example.com', 'password', 'Get One User');
      const receipt = createReceipt(mockReceiptData);
      linkReceiptToUser(user.id, receipt.id, 'My notes');

      const userReceipt = getUserReceiptById(user.id, receipt.id);

      expect(userReceipt).toBeDefined();
      expect(userReceipt?.id).toBe(receipt.id);
      expect(userReceipt?.notes).toBe('My notes');
    });

    it('should return undefined when user does not own receipt', () => {
      const user1 = createUser('owner@example.com', 'password', 'Owner');
      const user2 = createUser('notowner@example.com', 'password', 'Not Owner');
      const receipt = createReceipt(mockReceiptData);
      linkReceiptToUser(user1.id, receipt.id);

      const userReceipt = getUserReceiptById(user2.id, receipt.id);

      expect(userReceipt).toBeUndefined();
    });

    it('should update user receipt notes', () => {
      const user = createUser('updatenotes@example.com', 'password', 'Update Notes User');
      const receipt = createReceipt(mockReceiptData);
      linkReceiptToUser(user.id, receipt.id, 'Original notes');

      const updated = updateUserReceiptNotes(user.id, receipt.id, 'Updated notes');

      expect(updated).toBe(true);
      const userReceipt = getUserReceiptById(user.id, receipt.id);
      expect(userReceipt?.notes).toBe('Updated notes');
    });

    it('should create receipt for user in one operation', () => {
      const user = createUser('createfor@example.com', 'password', 'Create For User');

      const userReceipt = createReceiptForUser(user.id, mockReceiptData, 'Combined notes');

      expect(userReceipt).toBeDefined();
      expect(userReceipt.store_name).toBe('Association Store');
      expect(userReceipt.notes).toBe('Combined notes');
      expect(userReceipt.user_receipt_id).toBeDefined();
    });

    it('should not allow duplicate user-receipt association', () => {
      const user = createUser('nodupe@example.com', 'password', 'No Dupe User');
      const receipt = createReceipt(mockReceiptData);
      linkReceiptToUser(user.id, receipt.id);

      expect(() => {
        linkReceiptToUser(user.id, receipt.id);
      }).toThrow();
    });
  });

  describe('User Receipt Statistics', () => {
    it('should calculate user receipt stats', () => {
      const user = createUser('stats@example.com', 'password', 'Stats User');

      createReceiptForUser(user.id, {
        store_name: 'Store 1',
        date: '2026-01-01',
        time: '10:00',
        items: [],
        subtotal: 100,
        tax: 10,
        total_amount: 110,
        currency: 'EUR',
        payment_method: 'Card',
        error: null,
      });

      createReceiptForUser(user.id, {
        store_name: 'Store 2',
        date: '2026-01-02',
        time: '11:00',
        items: [],
        subtotal: 200,
        tax: 20,
        total_amount: 220,
        currency: 'EUR',
        payment_method: 'Cash',
        error: null,
      });

      const stats = getUserReceiptStats(user.id);

      expect(stats.totalReceipts).toBe(2);
      expect(stats.totalAmount).toBe(330);
      expect(stats.averageAmount).toBe(165);
    });

    it('should return zero stats for user with no receipts', () => {
      const user = createUser('nostats@example.com', 'password', 'No Stats User');

      const stats = getUserReceiptStats(user.id);

      expect(stats.totalReceipts).toBe(0);
      expect(stats.totalAmount).toBe(0);
      expect(stats.averageAmount).toBe(0);
    });
  });
});
