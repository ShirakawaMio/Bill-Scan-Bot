import { GoogleGenerativeAI } from "@google/generative-ai";
import { ReceiptAnalysisResult } from "../types/receipt.js";

const RECEIPT_ANALYSIS_PROMPT = `
You are an expert receipt analysis assistant. Your task is to extract structured data from the provided receipt image.
Return strictly valid JSON with no markdown formatting.

Extract the following fields:
- store_name (string): Name of the merchant.
- date (string, YYYY-MM-DD): Date of purchase.
- time (string, HH:MM): Time of purchase (24h format).
- items (array): List of purchased items. Each item should have:
  - name (string)
  - quantity (number, default 1 if not specified)
  - unit_price (number)
  - total_price (number)
  - category (string): Appropriate category for the item (e.g., Beverages, Snacks, Groceries, Electronics, Clothing, etc.)
    * Special case: If the item is a deposit (Pfand), categorize it as "Pfand"
- subtotal (number): Sum of items before tax.
- tax (number): Tax amount.
- total_amount (number): Final total paid.
- currency (string): Currency symbol or code (e.g., USD, EUR, ¥).
- payment_method (string): e.g., Cash, Credit Card, Apple Pay.

Constraint Checklist & Confidence Score:
1. If the image is blurry, cut off, or not a receipt, set the "error" field to a descriptive message (e.g., "Image too blurry", "Not a receipt").
2. If specific fields are missing/illegible, use null.
3. Ensure all numbers are parsed as numbers (not strings).
4. Special handling: Identify Pfand (deposits) items and categorize them as "pfand" instead of other categories.

JSON Structure:
{
  "store_name": "...",
  "date": "...",
  "time": "...",
  "items": [
    {
      "name": "...",
      "quantity": 1,
      "unit_price": ...,
      "total_price": ...,
      "category": "..."
    },
    {
      "name": "Pfand Bottle",
      "quantity": 1,
      "unit_price": ...,
      "total_price": ...,
      "category": "pfand"
    }
  ],
  "subtotal": ...,
  "tax": ...,
  "total_amount": ...,
  "currency": "...",
  "payment_method": "...",
  "error": null // or string if fatal issue
}
`;

export function parseBase64Image(image: string): { mimeType: string; imageBase64: string } {
  let mimeType = "image/jpeg"; // Default
  let imageBase64 = image;

  if (image.includes(";base64,")) {
    const parts = image.split(";base64,");
    mimeType = parts[0].replace("data:", "");
    imageBase64 = parts[1];
  }

  return { mimeType, imageBase64 };
}

export function createGeminiModel(apiKey?: string) {
  const genAI = new GoogleGenerativeAI(apiKey || process.env.GOOGLE_API_KEY || "");
  
  return genAI.getGenerativeModel({
    model: "gemini-2.5-flash-lite",
    generationConfig: {
      responseMimeType: "application/json"
    },
    systemInstruction: RECEIPT_ANALYSIS_PROMPT
  });
}

export async function analyzeReceiptImage(
  image: string,
  apiKey?: string
): Promise<string> {
  const model = createGeminiModel(apiKey);
  const { mimeType, imageBase64 } = parseBase64Image(image);

  const prompt = "Analyze this receipt.";

  const result = await model.generateContent([
    prompt,
    {
      inlineData: {
        data: imageBase64,
        mimeType: mimeType
      }
    }
  ]);

  const response = await result.response;
  return response.text();
}
