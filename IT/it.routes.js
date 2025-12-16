import { Router } from 'express';
import { getItDevices, getItTickets, createItTicket, getItOverview } from './it.repository.js';

/**
 * IT module router
 *
 * Provides a minimal IT API surface for a very small company
 * (fewer than 10 employees). All handlers are backed by the
 * shared PostgreSQL database (no hard-coded data).
 */
const itRouter = Router();

/**
 * Utility to safely handle async route handlers with consistent error reporting.
 */
const asyncHandler = (handler) => {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      // Centralised error logging for this module
      // Do not log sensitive values
      console.error('[IT][ERROR]', {
        path: req.path,
        method: req.method,
        message: error.message,
      });
      next(error);
    }
  };
};

/**
 * Basic health/status endpoint for the IT module.
 */
itRouter.get(
  '/status',
  asyncHandler(async (_req, res) => {
    res.status(200).json({
      module: 'it',
      status: 'ok',
    });
  }),
);

/**
 * Overview endpoint - returns a tiny IT summary derived from database values.
 */
itRouter.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    const overview = await getItOverview();
    res.status(200).json({
      data: overview,
    });
  }),
);

/**
 * Devices endpoint - device inventory from the database.
 */
itRouter.get(
  '/devices',
  asyncHandler(async (_req, res) => {
    const devices = await getItDevices();
    res.status(200).json({
      data: devices,
    });
  }),
);

/**
 * Tickets endpoint - IT tickets from the database.
 */
itRouter.get(
  '/tickets',
  asyncHandler(async (_req, res) => {
    const tickets = await getItTickets();
    res.status(200).json({
      data: tickets,
    });
  }),
);

/**
 * Create a new IT ticket.
 */
itRouter.post(
  '/tickets',
  asyncHandler(async (req, res) => {
    const payload = req.body ?? {};
    const ticket = await createItTicket(payload);
    res.status(201).json({
      data: ticket,
    });
  }),
);

export default itRouter;



