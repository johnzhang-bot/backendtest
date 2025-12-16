/**
 * AUTH data access layer.
 *
 * Uses the shared PostgreSQL configuration to manage user authentication.
 * Handles user registration, login, and logout operations.
 */

import pg from 'pg';
const { Client } = pg;
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import databaseConfig from '../databaseConfig.js';
import { validateAuthDatabaseConfig } from './auth.schema.js';

/**
 * JWT secret key from environment variable or default (should be set in production).
 */
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

function validateAuthQueryConfig() {
  const issues = [];

  if (!databaseConfig.url) {
    issues.push('DB_HOST (databaseConfig.url) is not defined');
  }

  if (Number.isNaN(databaseConfig.port) || databaseConfig.port <= 0) {
    issues.push('DB_PORT (databaseConfig.port) must be a positive number');
  }

  if (!databaseConfig.username) {
    issues.push('DB_USER (databaseConfig.username) is not defined');
  }

  if (issues.length > 0) {
    const error = new Error(
      `[AUTH_REPOSITORY] Invalid DB configuration: ${issues.join('; ')}`
    );
    error.code = 'AUTH_REPOSITORY_INVALID_DB_CONFIG';
    throw error;
  }
}

function withTimeout(promise, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error(
        `[AUTH_REPOSITORY][TIMEOUT] Operation "${label}" exceeded ${timeoutMs}ms`
      );
      error.code = 'AUTH_REPOSITORY_TIMEOUT';
      reject(error);
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function buildConnectionConfig() {
  return {
    host: databaseConfig.url,
    port: databaseConfig.port,
    user: databaseConfig.username,
    password: databaseConfig.password || undefined,
    database: databaseConfig.database || 'agilon_db',
  };
}

/**
 * Create a new user account.
 *
 * @param {{ email: string; password: string }} payload
 * @returns {Promise<{ id: number; email: string; createdAt: Date; updatedAt: Date }>}
 */
export async function createAccount(payload) {
  validateAuthDatabaseConfig();
  validateAuthQueryConfig();

  const email = String(payload.email ?? '').trim().toLowerCase();
  const password = String(payload.password ?? '');

  const issues = [];
  if (!email) {
    issues.push('email is required');
  } else {
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      issues.push('email must be a valid email address');
    }
  }

  if (!password) {
    issues.push('password is required');
  } else if (password.length < 8) {
    issues.push('password must be at least 8 characters long');
  }

  if (issues.length > 0) {
    const error = new Error(
      `[AUTH_REPOSITORY] Invalid account payload: ${issues.join(', ')}`
    );
    error.code = 'AUTH_REPOSITORY_INVALID_ACCOUNT';
    throw error;
  }

  const config = buildConnectionConfig();
  const now = new Date();

  // Hash password before storing
  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash(password, saltRounds);

  const operation = async () => {
    const client = new Client(config);
    try {
      await client.connect();

      // Check if user already exists
      const existingUser = await client.query(
        'SELECT id FROM users WHERE email = $1',
        [email]
      );

      if (existingUser.rows.length > 0) {
        const error = new Error('[AUTH_REPOSITORY] User with this email already exists');
        error.code = 'AUTH_REPOSITORY_USER_EXISTS';
        throw error;
      }

      // Insert new user
      const result = await client.query(
        `
        INSERT INTO users
          (email, password, "createdAt", "updatedAt")
        VALUES
          ($1, $2, $3, $4)
        RETURNING id, email, "createdAt", "updatedAt"
        `,
        [email, hashedPassword, now, now],
      );

      const user = result.rows[0];
      if (!user) {
        const error = new Error('[AUTH_REPOSITORY] Failed to create account (no user returned)');
        error.code = 'AUTH_REPOSITORY_INSERT_FAILED';
        throw error;
      }

      // Return user without password
      return {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
    } finally {
      try {
        await client.end();
      } catch {
        // Ignore close errors.
      }
    }
  };

  return withTimeout(operation(), 8000, 'createAccount');
}

/**
 * Authenticate user and generate JWT token.
 *
 * @param {{ email: string; password: string }} payload
 * @returns {Promise<{ token: string; user: { id: number; email: string } }>}
 */
export async function login(payload) {
  validateAuthDatabaseConfig();
  validateAuthQueryConfig();

  const email = String(payload.email ?? '').trim().toLowerCase();
  const password = String(payload.password ?? '');

  const issues = [];
  if (!email) {
    issues.push('email is required');
  }
  if (!password) {
    issues.push('password is required');
  }

  if (issues.length > 0) {
    const error = new Error(
      `[AUTH_REPOSITORY] Invalid login payload: ${issues.join(', ')}`
    );
    error.code = 'AUTH_REPOSITORY_INVALID_LOGIN';
    throw error;
  }

  const config = buildConnectionConfig();

  const operation = async () => {
    const client = new Client(config);
    try {
      await client.connect();

      // Find user by email
      const result = await client.query(
        'SELECT id, email, password FROM users WHERE email = $1',
        [email]
      );

      if (result.rows.length === 0) {
        const error = new Error('[AUTH_REPOSITORY] Invalid email or password');
        error.code = 'AUTH_REPOSITORY_INVALID_CREDENTIALS';
        throw error;
      }

      const user = result.rows[0];

      // Verify password
      const passwordMatch = await bcrypt.compare(password, user.password);
      if (!passwordMatch) {
        const error = new Error('[AUTH_REPOSITORY] Invalid email or password');
        error.code = 'AUTH_REPOSITORY_INVALID_CREDENTIALS';
        throw error;
      }

      // Generate JWT token
      const token = jwt.sign(
        { id: user.id, email: user.email },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      return {
        token,
        user: {
          id: user.id,
          email: user.email,
        },
      };
    } finally {
      try {
        await client.end();
      } catch {
        // Ignore close errors.
      }
    }
  };

  return withTimeout(operation(), 8000, 'login');
}

/**
 * Verify JWT token and return user information.
 *
 * @param {string} token - JWT token to verify
 * @returns {Promise<{ id: number; email: string }>}
 */
export async function verifyToken(token) {
  validateAuthQueryConfig();

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return {
      id: decoded.id,
      email: decoded.email,
    };
  } catch (error) {
    const authError = new Error('[AUTH_REPOSITORY] Invalid or expired token');
    authError.code = 'AUTH_REPOSITORY_INVALID_TOKEN';
    throw authError;
  }
}

/**
 * Logout is handled client-side by removing the token.
 * This function exists for consistency but doesn't need database operations
 * since we're using stateless JWT tokens.
 *
 * @returns {Promise<void>}
 */
export async function logout() {
  // JWT tokens are stateless, so logout is handled client-side
  // by removing the token from storage.
  // If you need server-side logout (e.g., token blacklisting),
  // you would implement that here.
  return Promise.resolve();
}

export default {
  createAccount,
  login,
  logout,
  verifyToken,
};

