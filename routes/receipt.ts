import http from "http";
import { analyzeReceiptImage } from "../lib/receipt.js";
import {
  createReceiptForUser,
  getUserReceipts,
  getUserReceiptById,
  deleteReceipt,
  unlinkReceiptFromUser,
  updateUserReceiptNotes,
  getUserReceiptStats,
} from "../lib/receipt-storage.js";
import { verifyToken } from "../lib/auth.js";
import {
  AnalyzeReceiptRequest,
  ReceiptAnalysisResult,
  SaveReceiptRequest,
} from "../types/receipt.js";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

async function parseBody<T>(req: http.IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const body = Buffer.concat(chunks).toString();
        if (!body) {
          reject(new Error("Empty request body"));
          return;
        }
        resolve(JSON.parse(body));
      } catch (e) {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

// get token from Authorization header
function getTokenFromHeader(req: http.IncomingMessage): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }
  return null;
}

// authenticate user
function authenticateUser(req: http.IncomingMessage): string | null {
  const token = getTokenFromHeader(req);
  if (!token) return null;

  const payload = verifyToken(token);
  if (!payload) return null;

  return payload.userId;
}

// POST /api/analyze-receipt
export async function handleAnalyzeReceipt(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  try {
    const { image, apiKey } = await parseBody<AnalyzeReceiptRequest>(req);

    // Validate input
    if (!image) {
      res.writeHead(400, corsHeaders);
      res.end(JSON.stringify({ error: "Image data is required" }));
      return;
    }

    // Call analysis service
    const result = await analyzeReceiptImage(image, apiKey);

    res.writeHead(200, corsHeaders);
    res.end(result);
  } catch (err: any) {
    console.error("Error processing receipt:", err.message || err);

    // Handle specific errors
    if (err.message === "Empty request body") {
      res.writeHead(400, corsHeaders);
      res.end(JSON.stringify({ error: "Empty request body" }));
      return;
    }

    if (err.message === "Invalid JSON") {
      res.writeHead(400, corsHeaders);
      res.end(JSON.stringify({ error: "Invalid JSON" }));
      return;
    }

    const errorMessage = err.message || "Internal Server Error";
    res.writeHead(500, corsHeaders);
    res.end(JSON.stringify({ error: errorMessage }));
  }
}

// POST /api/receipts - Save receipt to user account
export async function handleSaveReceipt(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  try {
    const userId = authenticateUser(req);
    if (!userId) {
      res.writeHead(401, corsHeaders);
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    const { receipt, notes } = await parseBody<SaveReceiptRequest>(req);

    if (!receipt) {
      res.writeHead(400, corsHeaders);
      res.end(JSON.stringify({ error: "Receipt data is required" }));
      return;
    }

    const savedReceipt = createReceiptForUser(
      userId,
      receipt,
      notes,
      JSON.stringify(receipt)
    );

    res.writeHead(201, corsHeaders);
    res.end(JSON.stringify(savedReceipt));
  } catch (err: any) {
    console.error("Error saving receipt:", err.message || err);
    res.writeHead(500, corsHeaders);
    res.end(JSON.stringify({ error: "Internal server error" }));
  }
}

// GET /api/receipts - Get all user receipts
export async function handleGetUserReceipts(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  try {
    const userId = authenticateUser(req);
    if (!userId) {
      res.writeHead(401, corsHeaders);
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    const receipts = getUserReceipts(userId);

    res.writeHead(200, corsHeaders);
    res.end(JSON.stringify(receipts));
  } catch (err: any) {
    console.error("Error getting receipts:", err.message || err);
    res.writeHead(500, corsHeaders);
    res.end(JSON.stringify({ error: "Internal server error" }));
  }
}

// GET /api/receipts/:id - Get single receipt details
export async function handleGetReceiptById(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  receiptId: string
): Promise<void> {
  try {
    const userId = authenticateUser(req);
    if (!userId) {
      res.writeHead(401, corsHeaders);
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    const receipt = getUserReceiptById(userId, receiptId);

    if (!receipt) {
      res.writeHead(404, corsHeaders);
      res.end(JSON.stringify({ error: "Receipt not found" }));
      return;
    }

    res.writeHead(200, corsHeaders);
    res.end(JSON.stringify(receipt));
  } catch (err: any) {
    console.error("Error getting receipt:", err.message || err);
    res.writeHead(500, corsHeaders);
    res.end(JSON.stringify({ error: "Internal server error" }));
  }
}

// DELETE /api/receipts/:id - Delete receipt
export async function handleDeleteReceipt(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  receiptId: string
): Promise<void> {
  try {
    const userId = authenticateUser(req);
    if (!userId) {
      res.writeHead(401, corsHeaders);
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    // First check if the user owns the receipt
    const receipt = getUserReceiptById(userId, receiptId);
    if (!receipt) {
      res.writeHead(404, corsHeaders);
      res.end(JSON.stringify({ error: "Receipt not found" }));
      return;
    }

    // Delete association and receipt
    unlinkReceiptFromUser(userId, receiptId);
    deleteReceipt(receiptId);

    res.writeHead(200, corsHeaders);
    res.end(JSON.stringify({ message: "Receipt deleted successfully" }));
  } catch (err: any) {
    console.error("Error deleting receipt:", err.message || err);
    res.writeHead(500, corsHeaders);
    res.end(JSON.stringify({ error: "Internal server error" }));
  }
}

// PUT /api/receipts/:id/notes - Update receipt notes
export async function handleUpdateReceiptNotes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  receiptId: string
): Promise<void> {
  try {
    const userId = authenticateUser(req);
    if (!userId) {
      res.writeHead(401, corsHeaders);
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    const { notes } = await parseBody<{ notes: string }>(req);

    const success = updateUserReceiptNotes(userId, receiptId, notes);

    if (!success) {
      res.writeHead(404, corsHeaders);
      res.end(JSON.stringify({ error: "Receipt not found" }));
      return;
    }

    res.writeHead(200, corsHeaders);
    res.end(JSON.stringify({ message: "Notes updated successfully" }));
  } catch (err: any) {
    console.error("Error updating notes:", err.message || err);
    res.writeHead(500, corsHeaders);
    res.end(JSON.stringify({ error: "Internal server error" }));
  }
}

// GET /api/receipts/stats - Get user receipt statistics
export async function handleGetReceiptStats(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  try {
    const userId = authenticateUser(req);
    if (!userId) {
      res.writeHead(401, corsHeaders);
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    const stats = getUserReceiptStats(userId);

    res.writeHead(200, corsHeaders);
    res.end(JSON.stringify(stats));
  } catch (err: any) {
    console.error("Error getting stats:", err.message || err);
    res.writeHead(500, corsHeaders);
    res.end(JSON.stringify({ error: "Internal server error" }));
  }
}