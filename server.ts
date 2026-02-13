import http from "http";
import dotenv from "dotenv";
import {
  handleRegister,
  handleLogin,
  handleGetCurrentUser,
  handleLogout,
  corsHeaders,
} from "./routes/auth.js";
import {
  handleAnalyzeReceipt,
  handleSaveReceipt,
  handleGetUserReceipts,
  handleGetReceiptById,
  handleDeleteReceipt,
  handleUpdateReceiptNotes,
  handleGetReceiptStats,
} from "./routes/receipt.js";
import { startPolling } from "./lib/telegram-bot.js";
import { handleMessage } from "./lib/telegram-handlers.js";

dotenv.config();

const server = http.createServer(async (req, res) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);

  // CORS Headers
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json",
  };

  if (req.method === "OPTIONS") {
    res.writeHead(204, headers);
    res.end();
    return;
  }

  // Auth routes
  if (req.url === "/api/auth/register" && req.method === "POST") {
    return handleRegister(req, res);
  }

  if (req.url === "/api/auth/login" && req.method === "POST") {
    return handleLogin(req, res);
  }

  if (req.url === "/api/auth/me" && req.method === "GET") {
    return handleGetCurrentUser(req, res);
  }

  if (req.url === "/api/auth/logout" && req.method === "POST") {
    return handleLogout(req, res);
  }

  // Receipt analysis route
  if (req.method === "POST" && req.url === "/api/analyze-receipt") {
    return handleAnalyzeReceipt(req, res);
  }

  // Receipt CRUD routes
  if (req.url === "/api/receipts/stats" && req.method === "GET") {
    return handleGetReceiptStats(req, res);
  }

  if (req.url === "/api/receipts" && req.method === "POST") {
    return handleSaveReceipt(req, res);
  }

  if (req.url === "/api/receipts" && req.method === "GET") {
    return handleGetUserReceipts(req, res);
  }

  // Handle /api/receipts/:id routes
  const receiptMatch = req.url?.match(/^\/api\/receipts\/([a-f0-9-]+)$/);
  if (receiptMatch) {
    const receiptId = receiptMatch[1];
    if (req.method === "GET") {
      return handleGetReceiptById(req, res, receiptId);
    }
    if (req.method === "DELETE") {
      return handleDeleteReceipt(req, res, receiptId);
    }
  }

  // Handle /api/receipts/:id/notes route
  const notesMatch = req.url?.match(/^\/api\/receipts\/([a-f0-9-]+)\/notes$/);
  if (notesMatch && req.method === "PUT") {
    const receiptId = notesMatch[1];
    return handleUpdateReceiptNotes(req, res, receiptId);
  }

  res.writeHead(404, headers);
  res.end(JSON.stringify({ error: "Not found" }));
});

if (process.env.NODE_ENV !== 'test') {
  server.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
  });

  // Start Telegram bot
  startPolling(handleMessage);
}

export { server };