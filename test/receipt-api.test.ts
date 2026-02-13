import { jest, describe, it, expect, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DB_PATH = path.join(__dirname, 'test_api_receipts.db');
process.env.DB_PATH = TEST_DB_PATH;

const mockGenerateContent = jest.fn() as jest.Mock<any>;
const mockGetGenerativeModel = jest.fn().mockReturnValue({
  generateContent: mockGenerateContent
}) as jest.Mock<any>;

jest.unstable_mockModule('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  })),
}));

const { server } = await import('../server.js');
const { db } = await import('../lib/database.js');

describe('Receipt API Tests', () => {
  let authToken: string;
  let userId: string;

  afterAll((done) => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    if (server.listening) {
      server.close(done);
    } else {
      done();
    }
  });

  beforeEach(async () => {
    db.exec('DELETE FROM user_receipts');
    db.exec('DELETE FROM receipt_items');
    db.exec('DELETE FROM receipts');
    db.exec('DELETE FROM users');
    mockGenerateContent.mockClear();

    // create test user and get token
    const registerRes = await request(server)
      .post('/api/auth/register')
      .send({
        email: 'api-test@example.com',
        password: 'password123',
        name: 'API Test User',
      });

    authToken = registerRes.body.token;
    userId = registerRes.body.user.id;
  });

  describe('POST /api/receipts', () => {
    const mockReceipt = {
      store_name: 'API Test Store',
      date: '2026-01-07',
      time: '15:00',
      items: [
        { name: 'Test Item', quantity: 1, unit_price: 10, total_price: 10, category: 'Groceries' },
      ],
      subtotal: 10,
      tax: 1,
      total_amount: 11,
      currency: 'EUR',
      payment_method: 'Card',
      error: null,
    };

    it('should save receipt for authenticated user', async () => {
      const res = await request(server)
        .post('/api/receipts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ receipt: mockReceipt, notes: 'Test notes' });

      expect(res.statusCode).toBe(201);
      expect(res.body.store_name).toBe('API Test Store');
      expect(res.body.notes).toBe('Test notes');
      expect(res.body.id).toBeDefined();
    });

    it('should return 401 without auth token', async () => {
      const res = await request(server)
        .post('/api/receipts')
        .send({ receipt: mockReceipt });

      expect(res.statusCode).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('should return 400 without receipt data', async () => {
      const res = await request(server)
        .post('/api/receipts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Receipt data is required');
    });
  });

  describe('GET /api/receipts', () => {
    it('should get all receipts for authenticated user', async () => {
      // save a receipt first
      await request(server)
        .post('/api/receipts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          receipt: {
            store_name: 'Get All Store',
            date: '2026-01-07',
            time: '16:00',
            items: [],
            subtotal: 20,
            tax: 2,
            total_amount: 22,
            currency: 'EUR',
            payment_method: 'Cash',
            error: null,
          },
        });

      const res = await request(server)
        .get('/api/receipts')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(1);
      expect(res.body[0].store_name).toBe('Get All Store');
    });

    it('should return 401 without auth token', async () => {
      const res = await request(server).get('/api/receipts');

      expect(res.statusCode).toBe(401);
    });

    it('should return empty array for user with no receipts', async () => {
      const res = await request(server)
        .get('/api/receipts')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('GET /api/receipts/:id', () => {
    it('should get single receipt by id', async () => {
      const createRes = await request(server)
        .post('/api/receipts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          receipt: {
            store_name: 'Single Receipt Store',
            date: '2026-01-07',
            time: '17:00',
            items: [{ name: 'Item', quantity: 1, unit_price: 5, total_price: 5, category: 'Snacks' }],
            subtotal: 5,
            tax: 0.5,
            total_amount: 5.5,
            currency: 'EUR',
            payment_method: 'Card',
            error: null,
          },
          notes: 'Single receipt notes',
        });

      const receiptId = createRes.body.id;

      const res = await request(server)
        .get(`/api/receipts/${receiptId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.id).toBe(receiptId);
      expect(res.body.store_name).toBe('Single Receipt Store');
      expect(res.body.notes).toBe('Single receipt notes');
    });

    it('should return 404 for non-existent receipt', async () => {
      const res = await request(server)
        .get('/api/receipts/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.statusCode).toBe(404);
      expect(res.body.error).toBe('Receipt not found');
    });
  });

  describe('DELETE /api/receipts/:id', () => {
    it('should delete receipt', async () => {
      const createRes = await request(server)
        .post('/api/receipts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          receipt: {
            store_name: 'Delete Store',
            date: '2026-01-07',
            time: '18:00',
            items: [],
            subtotal: 30,
            tax: 3,
            total_amount: 33,
            currency: 'EUR',
            payment_method: 'Cash',
            error: null,
          },
        });

      const receiptId = createRes.body.id;

      const deleteRes = await request(server)
        .delete(`/api/receipts/${receiptId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(deleteRes.statusCode).toBe(200);
      expect(deleteRes.body.message).toBe('Receipt deleted successfully');

      // validate it's deleted
      const getRes = await request(server)
        .get(`/api/receipts/${receiptId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(getRes.statusCode).toBe(404);
    });

    it('should return 404 when deleting non-existent receipt', async () => {
      const res = await request(server)
        .delete('/api/receipts/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.statusCode).toBe(404);
    });
  });

  describe('PUT /api/receipts/:id/notes', () => {
    it('should update receipt notes', async () => {
      const createRes = await request(server)
        .post('/api/receipts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          receipt: {
            store_name: 'Notes Store',
            date: '2026-01-07',
            time: '19:00',
            items: [],
            subtotal: 40,
            tax: 4,
            total_amount: 44,
            currency: 'EUR',
            payment_method: 'Card',
            error: null,
          },
          notes: 'Original notes',
        });

      const receiptId = createRes.body.id;

      const updateRes = await request(server)
        .put(`/api/receipts/${receiptId}/notes`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ notes: 'Updated notes' });

      expect(updateRes.statusCode).toBe(200);

      // validate it's updated
      const getRes = await request(server)
        .get(`/api/receipts/${receiptId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(getRes.body.notes).toBe('Updated notes');
    });
  });

  describe('GET /api/receipts/stats', () => {
    it('should get receipt statistics', async () => {
      // create two receipts
      await request(server)
        .post('/api/receipts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          receipt: {
            store_name: 'Stats Store 1',
            date: '2026-01-07',
            time: '20:00',
            items: [],
            subtotal: 100,
            tax: 10,
            total_amount: 110,
            currency: 'EUR',
            payment_method: 'Card',
            error: null,
          },
        });

      await request(server)
        .post('/api/receipts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          receipt: {
            store_name: 'Stats Store 2',
            date: '2026-01-07',
            time: '21:00',
            items: [],
            subtotal: 200,
            tax: 20,
            total_amount: 220,
            currency: 'EUR',
            payment_method: 'Cash',
            error: null,
          },
        });

      const res = await request(server)
        .get('/api/receipts/stats')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.totalReceipts).toBe(2);
      expect(res.body.totalAmount).toBe(330);
      expect(res.body.averageAmount).toBe(165);
    });

    it('should return 401 without auth token', async () => {
      const res = await request(server).get('/api/receipts/stats');

      expect(res.statusCode).toBe(401);
    });
  });
});
