import { Router } from 'express';
import { createAccount, login, logout } from './auth.repository.js';

/**
 * AUTH module router
 *
 * Provides authentication API endpoints for user registration, login, and logout.
 * All handlers are backed by the shared PostgreSQL database.
 */
const authRouter = Router();

/**
 * Utility to safely handle async route handlers with consistent error reporting.
 */
const asyncHandler = (handler) => {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      // Centralised error logging for this module
      // Do not log sensitive values like passwords
      console.error('[AUTH][ERROR]', {
        path: req.path,
        method: req.method,
        message: error.message,
        code: error.code,
      });
      next(error);
    }
  };
};

/**
 * Register a new user account.
 * POST /api/auth/register
 */
authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const payload = req.body ?? {};
    const { email, password } = payload;

    // Note: company_id is accepted for compatibility but not used in this implementation
    const user = await createAccount({ email, password });

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
      },
    });
  }),
);

/**
 * Login endpoint - authenticates user and returns JWT token.
 * POST /api/auth/login
 */
authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const payload = req.body ?? {};
    const { email, password } = payload;

    // Note: company_id is accepted for compatibility but not used in this implementation
    const result = await login({ email, password });

    res.status(200).json({
      token: result.token,
      user: {
        id: result.user.id,
        email: result.user.email,
      },
    });
  }),
);

/**
 * Logout endpoint - clears authentication (client-side token removal).
 * POST /api/auth/logout
 */
authRouter.post(
  '/logout',
  asyncHandler(async (_req, res) => {
    await logout();
    res.status(200).json({
      message: 'Logged out successfully',
    });
  }),
);

/**
 * Health/status endpoint for the AUTH module.
 */
authRouter.get(
  '/status',
  asyncHandler(async (_req, res) => {
    res.status(200).json({
      module: 'auth',
      status: 'ok',
    });
  }),
);

export default authRouter;

