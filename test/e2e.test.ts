import { describe, it, expect, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DB_PATH = path.join(__dirname, 'test_e2e.db');
process.env.DB_PATH = TEST_DB_PATH;

const { server } = await import('../server.js');
const { db } = await import('../lib/database.js');

const hasApiKey = !!process.env.GOOGLE_API_KEY;

describe('End-to-End Receipt Analysis and Storage Tests (Real API)', () => {
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

    const registerRes = await request(server)
      .post('/api/auth/register')
      .send({
        email: 'e2e-test@example.com',
        password: 'password123',
        name: 'E2E Test User',
      });

    authToken = registerRes.body.token;
    userId = registerRes.body.user.id;
  });

  describe('Full Receipt Workflow with Real API', () => {
    it('should analyze real receipt image using Google AI', async () => {
      if (!hasApiKey) {
        console.warn('Skipping test: GOOGLE_API_KEY not configured');
        return;
      }

      // read test image
      const imagePath = path.join(__dirname, 'test2.jpg');
      
      if (!fs.existsSync(imagePath)) {
        console.warn('Skipping test: test2.jpg not found');
        return;
      }

      const imageBuffer = fs.readFileSync(imagePath);
      const base64Image = imageBuffer.toString('base64');

      // real API call to analyze receipt
      const analyzeRes = await request(server)
        .post('/api/analyze-receipt')
        .send({ image: base64Image });

      expect(analyzeRes.statusCode).toBe(200);
      
      // validate response structure
      expect(analyzeRes.body).toHaveProperty('store_name');
      expect(analyzeRes.body).toHaveProperty('items');
      expect(analyzeRes.body).toHaveProperty('total_amount');
      
      // validate content based on test.jpg (REWE receipt)
      expect(analyzeRes.body.store_name).toMatch(/REWE/i);
      expect(Array.isArray(analyzeRes.body.items)).toBe(true);
      expect(analyzeRes.body.items.length).toBeGreaterThan(0);

      console.log('Real API Response:', JSON.stringify(analyzeRes.body, null, 2));
    }, 30000); // 30 seconds timeout

    it('should complete full workflow: analyze -> save -> retrieve -> delete', async () => {
      if (!hasApiKey) {
        console.warn('Skipping test: GOOGLE_API_KEY not configured');
        return;
      }

      const imagePath = path.join(__dirname, 'test.jpg');
      
      if (!fs.existsSync(imagePath)) {
        console.warn('Skipping test: test.jpg not found');
        return;
      }

      const imageBuffer = fs.readFileSync(imagePath);
      const base64Image = imageBuffer.toString('base64');

      // Step 1: Analyzing receipt with real API...
      console.log('Step 1: Analyzing receipt with real API...');
      const analyzeRes = await request(server)
        .post('/api/analyze-receipt')
        .send({ image: base64Image });

      expect(analyzeRes.statusCode).toBe(200);
      const analysisResult = analyzeRes.body;
      console.log('Analysis result:', analysisResult.store_name, '- Total:', analysisResult.total_amount);

      // Step 2: Saving receipt to user account...
      console.log('Step 2: Saving receipt...');
      const saveRes = await request(server)
        .post('/api/receipts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          receipt: analysisResult,
          notes: 'REWE Receipt - Real API Test',
        });

      expect(saveRes.statusCode).toBe(201);
      const savedReceipt = saveRes.body;
      expect(savedReceipt.id).toBeDefined();
      expect(savedReceipt.notes).toBe('REWE Receipt - Real API Test');

      // Step 3: Getting user receipts...
      console.log('Step 3: Getting user receipts...');
      const listRes = await request(server)
        .get('/api/receipts')
        .set('Authorization', `Bearer ${authToken}`);

      expect(listRes.statusCode).toBe(200);
      expect(listRes.body).toHaveLength(1);
      expect(listRes.body[0].id).toBe(savedReceipt.id);

      // Step 4: Getting receipt details...
      console.log('Step 4: Getting receipt details...');
      const detailRes = await request(server)
        .get(`/api/receipts/${savedReceipt.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(detailRes.statusCode).toBe(200);
      expect(detailRes.body.id).toBe(savedReceipt.id);
      expect(Array.isArray(detailRes.body.items)).toBe(true);

      // Step 5: Updating notes...
      console.log('Step 5: Updating notes...');
      const updateRes = await request(server)
        .put(`/api/receipts/${savedReceipt.id}/notes`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ notes: 'Updated notes: Daily shopping' });

      expect(updateRes.statusCode).toBe(200);

      // Step 6: Validate notes updated
      const verifyRes = await request(server)
        .get(`/api/receipts/${savedReceipt.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(verifyRes.body.notes).toBe('Updated notes: Daily shopping');

      // Step 7: Checking stats...
      console.log('Step 7: Checking stats...');
      const statsRes = await request(server)
        .get('/api/receipts/stats')
        .set('Authorization', `Bearer ${authToken}`);

      expect(statsRes.statusCode).toBe(200);
      expect(statsRes.body.totalReceipts).toBe(1);
      expect(statsRes.body.totalAmount).toBeGreaterThan(0);

      // Step 8: Deleting receipt
      console.log('Step 8: Deleting receipt...');
      const deleteRes = await request(server)
        .delete(`/api/receipts/${savedReceipt.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(deleteRes.statusCode).toBe(200);

      // Step 9: Validate it's deleted
      const finalListRes = await request(server)
        .get('/api/receipts')
        .set('Authorization', `Bearer ${authToken}`);

      expect(finalListRes.body).toHaveLength(0);
      console.log('Full workflow completed successfully!');
    }, 60000); // 60 seconds timeout

    it('should handle data:URI format image', async () => {
      if (!hasApiKey) {
        console.warn('Skipping test: GOOGLE_API_KEY not configured');
        return;
      }

      const imagePath = path.join(__dirname, 'test2.jpg');
      
      if (!fs.existsSync(imagePath)) {
        console.warn('Skipping test: test2.jpg not found');
        return;
      }

      const imageBuffer = fs.readFileSync(imagePath);
      const base64Image = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;

      const res = await request(server)
        .post('/api/analyze-receipt')
        .send({ image: base64Image });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('store_name');
      expect(res.body).toHaveProperty('items');
    }, 30000);
  });

  describe('User isolation tests (no API needed)', () => {
    // These tests do not require the real API and can use predefined data
    const mockReceipt = {
      store_name: "Test Store",
      date: "2026-01-07",
      time: "12:00",
      items: [
        { name: "Test Item", quantity: 1, unit_price: 10, total_price: 10 },
      ],
      subtotal: 10,
      tax: 1,
      total_amount: 11,
      currency: "EUR",
      payment_method: "Card",
      error: null,
    };

    it('should isolate receipts between different users', async () => {
      // create second user
      const user2Res = await request(server)
        .post('/api/auth/register')
        .send({
          email: 'user2@example.com',
          password: 'password123',
          name: 'User 2',
        });

      const user2Token = user2Res.body.token;

      // User 1 saves a receipt
      await request(server)
        .post('/api/receipts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          receipt: { ...mockReceipt, store_name: 'User1 Store' },
        });

      // User 2 saves a receipt
      const user2Receipt = await request(server)
        .post('/api/receipts')
        .set('Authorization', `Bearer ${user2Token}`)
        .send({
          receipt: { ...mockReceipt, store_name: 'User2 Store' },
        });

      // User 1 can only see their own receipts
      const user1List = await request(server)
        .get('/api/receipts')
        .set('Authorization', `Bearer ${authToken}`);

      expect(user1List.body).toHaveLength(1);
      expect(user1List.body[0].store_name).toBe('User1 Store');

      // User 2 can only see their own receipts
      const user2List = await request(server)
        .get('/api/receipts')
        .set('Authorization', `Bearer ${user2Token}`);

      expect(user2List.body).toHaveLength(1);
      expect(user2List.body[0].store_name).toBe('User2 Store');

      // User 1 cannot access User 2's receipt
      const crossAccessRes = await request(server)
        .get(`/api/receipts/${user2Receipt.body.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(crossAccessRes.statusCode).toBe(404);
    });

    it('should handle multiple receipts for one user', async () => {
      // save multiple receipts
      const receipts = [
        { ...mockReceipt, store_name: 'Store 1', total_amount: 10 },
        { ...mockReceipt, store_name: 'Store 2', total_amount: 20 },
        { ...mockReceipt, store_name: 'Store 3', total_amount: 30 },
      ];

      for (const receipt of receipts) {
        await request(server)
          .post('/api/receipts')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ receipt });
      }

      // get all receipts
      const listRes = await request(server)
        .get('/api/receipts')
        .set('Authorization', `Bearer ${authToken}`);

      expect(listRes.body).toHaveLength(3);

      // check stats
      const statsRes = await request(server)
        .get('/api/receipts/stats')
        .set('Authorization', `Bearer ${authToken}`);

      expect(statsRes.body.totalReceipts).toBe(3);
      expect(statsRes.body.totalAmount).toBe(60);
      expect(statsRes.body.averageAmount).toBe(20);
    });
  });
});
