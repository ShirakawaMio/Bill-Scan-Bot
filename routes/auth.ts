import http from 'http';
import {
  createUser,
  findUserByEmail,
  findUserById,
  verifyPassword,
  signToken,
  verifyToken,
  sanitizeUser,
} from '../lib/auth.js';
import { RegisterRequest, LoginRequest, AuthResponse } from '../types/auth.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

async function parseBody<T>(req: http.IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString();
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// Get token from Authorization header
function getTokenFromHeader(req: http.IncomingMessage): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
}

// Mail format validation
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// POST /api/auth/register
export async function handleRegister(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  try {
    const { email, password, name } = await parseBody<RegisterRequest>(req);

    // Validate input
    if (!email || !password || !name) {
      res.writeHead(400, corsHeaders);
      res.end(JSON.stringify({ error: 'Email, password and name are required' }));
      return;
    }

    if (!isValidEmail(email)) {
      res.writeHead(400, corsHeaders);
      res.end(JSON.stringify({ error: 'Invalid email format' }));
      return;
    }

    if (password.length < 6) {
      res.writeHead(400, corsHeaders);
      res.end(JSON.stringify({ error: 'Password must be at least 6 characters' }));
      return;
    }

    // Check if user already exists
    if (findUserByEmail(email)) {
      res.writeHead(409, corsHeaders);
      res.end(JSON.stringify({ error: 'User already exists' }));
      return;
    }

    // Create user
    const user = createUser(email, password, name);
    const token = signToken({ userId: user.id, email: user.email });

    const response: AuthResponse = {
      user: sanitizeUser(user),
      token,
    };

    res.writeHead(201, corsHeaders);
    res.end(JSON.stringify(response));
  } catch (err: any) {
    console.error('Register error:', err);
    res.writeHead(500, corsHeaders);
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
}

// POST /api/auth/login
export async function handleLogin(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  try {
    const { email, password } = await parseBody<LoginRequest>(req);

    // Validate input
    if (!email || !password) {
      res.writeHead(400, corsHeaders);
      res.end(JSON.stringify({ error: 'Email and password are required' }));
      return;
    }

    // Find user
    const user = findUserByEmail(email);
    if (!user) {
      res.writeHead(401, corsHeaders);
      res.end(JSON.stringify({ error: 'Invalid credentials' }));
      return;
    }

    // Validate password
    if (!verifyPassword(password, user.password)) {
      res.writeHead(401, corsHeaders);
      res.end(JSON.stringify({ error: 'Invalid credentials' }));
      return;
    }

    // Generate token
    const token = signToken({ userId: user.id, email: user.email });

    const response: AuthResponse = {
      user: sanitizeUser(user),
      token,
    };

    res.writeHead(200, corsHeaders);
    res.end(JSON.stringify(response));
  } catch (err: any) {
    console.error('Login error:', err);
    res.writeHead(500, corsHeaders);
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
}

// GET /api/auth/me - Get current user info
export async function handleGetCurrentUser(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  try {
    const token = getTokenFromHeader(req);
    
    if (!token) {
      res.writeHead(401, corsHeaders);
      res.end(JSON.stringify({ error: 'No token provided' }));
      return;
    }

    const payload = verifyToken(token);
    if (!payload) {
      res.writeHead(401, corsHeaders);
      res.end(JSON.stringify({ error: 'Invalid or expired token' }));
      return;
    }

    const user = findUserById(payload.userId);
    if (!user) {
      res.writeHead(404, corsHeaders);
      res.end(JSON.stringify({ error: 'User not found' }));
      return;
    }

    res.writeHead(200, corsHeaders);
    res.end(JSON.stringify({ user: sanitizeUser(user) }));
  } catch (err: any) {
    console.error('Get current user error:', err);
    res.writeHead(500, corsHeaders);
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
}

// POST /api/auth/logout - Logout (client needs to clear token)
export async function handleLogout(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  // For JWT, the server does not need to do anything
  // The client just needs to delete the stored token
  res.writeHead(200, corsHeaders);
  res.end(JSON.stringify({ message: 'Logged out successfully' }));
}

// Export CORS headers for main server use
export { corsHeaders };
