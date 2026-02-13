export interface ReceiptItem {
  id?: string;
  receipt_id?: string;
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  category: string | null;
}

export interface ReceiptAnalysisResult {
  store_name: string | null;
  date: string | null;
  time: string | null;
  items: ReceiptItem[];
  subtotal: number | null;
  tax: number | null;
  total_amount: number | null;
  currency: string | null;
  payment_method: string | null;
  error: string | null;
}

export interface Receipt {
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
  items?: ReceiptItem[];
}

export interface UserReceipt {
  id: string;
  user_id: string;
  receipt_id: string;
  added_at: string;
  notes: string | null;
}

export interface UserReceiptWithDetails extends Receipt {
  user_receipt_id: string;
  added_at: string;
  notes: string | null;
}

export interface AnalyzeReceiptRequest {
  image: string;
  apiKey?: string;
}

export interface SaveReceiptRequest {
  receipt: ReceiptAnalysisResult;
  notes?: string;
}
