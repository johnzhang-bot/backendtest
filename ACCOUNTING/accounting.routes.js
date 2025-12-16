import { Router } from 'express';
import {
    getChartOfAccounts,
    getAccountBalances,
    getJournalEntries,
    getJournalEntryLines,
    createJournalEntry,
    getAccountingOverview,
} from './accounting.repository.js';

/**
 * ACCOUNTING module router
 *
 * Provides accounting API endpoints for chart of accounts,
 * journal entries, and financial reporting.
 */
const accountingRouter = Router();

/**
 * Utility to safely handle async route handlers with consistent error reporting.
 */
const asyncHandler = (handler) => {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      console.error('[ACCOUNTING][ERROR]', {
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
 * Health/status endpoint.
 */
accountingRouter.get(
  '/status',
  asyncHandler(async (_req, res) => {
    res.status(200).json({
      module: 'accounting',
      status: 'ok',
    });
  }),
);

/**
 * Get chart of accounts (optionally filtered by category).
 * GET /api/accounting/chart-of-accounts?category=assets
 */
accountingRouter.get(
  '/chart-of-accounts',
  asyncHandler(async (req, res) => {
    const category = req.query.category || null;
    const accounts = await getChartOfAccounts(category);
    res.status(200).json({
      data: accounts,
    });
  }),
);

/**
 * Get account balances grouped by category.
 * GET /api/accounting/balances
 */
accountingRouter.get(
  '/balances',
  asyncHandler(async (_req, res) => {
    const balances = await getAccountBalances();
    res.status(200).json({
      data: balances,
    });
  }),
);

/**
 * Get accounting overview/summary.
 * GET /api/accounting/overview
 */
accountingRouter.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    const overview = await getAccountingOverview();
    res.status(200).json({
      data: overview,
    });
  }),
);

/**
 * Get recent journal entries.
 * GET /api/accounting/journal-entries?limit=50
 */
accountingRouter.get(
  '/journal-entries',
  asyncHandler(async (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    const entries = await getJournalEntries(limit);
    res.status(200).json({
      data: entries,
    });
  }),
);

/**
 * Get lines for a specific journal entry.
 * GET /api/accounting/journal-entries/:id/lines
 */
accountingRouter.get(
  '/journal-entries/:id/lines',
  asyncHandler(async (req, res) => {
    const journalEntryId = parseInt(req.params.id);
    const lines = await getJournalEntryLines(journalEntryId);
    res.status(200).json({
      data: lines,
    });
  }),
);

/**
 * Create a new journal entry.
 * POST /api/accounting/journal-entries
 */
accountingRouter.post(
  '/journal-entries',
  asyncHandler(async (req, res) => {
    const payload = req.body ?? {};
    const entry = await createJournalEntry(payload);
    res.status(201).json({
      data: entry,
    });
  }),
);

export default accountingRouter;

