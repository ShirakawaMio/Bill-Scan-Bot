export interface User {
  id: string;
  email: string;
  password: string; // hashed password
  name: string;
  createdAt: Date;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: Omit<User, 'password'>;
  token: string;
}

export interface JwtPayload {
  userId: string;
  email: string;
}
