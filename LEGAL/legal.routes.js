import { Router } from 'express';
import {
    getContracts,
    createContract,
    getComplianceItems,
    createComplianceItem,
    getIntellectualProperty,
    createIntellectualProperty,
    getLegalMatters,
    createLegalMatter,
    getLegalOverview,
} from './legal.repository.js';

/**
 * LEGAL module router
 *
 * Provides legal management endpoints for contracts, compliance, IP, and legal matters.
 */
const legalRouter = Router();

const asyncHandler = (handler) => {
    return async (req, res, next) => {
        try {
            await handler(req, res, next);
        } catch (error) {
            console.error('[LEGAL][ERROR]', {
                path: req.path,
                method: req.method,
                message: error.message,
                code: error.code,
            });
            next(error);
        }
    };
};

legalRouter.get('/status', asyncHandler(async (_req, res) => {
    res.status(200).json({ module: 'legal', status: 'ok' });
}));

legalRouter.get('/overview', asyncHandler(async (_req, res) => {
    const overview = await getLegalOverview();
    res.status(200).json({ data: overview });
}));

// Contracts
legalRouter.get('/contracts', asyncHandler(async (_req, res) => {
    const contracts = await getContracts();
    res.status(200).json({ data: contracts });
}));

legalRouter.post('/contracts', asyncHandler(async (req, res) => {
    const contract = await createContract(req.body ?? {});
    res.status(201).json({ data: contract });
}));

// Compliance
legalRouter.get('/compliance', asyncHandler(async (_req, res) => {
    const items = await getComplianceItems();
    res.status(200).json({ data: items });
}));

legalRouter.post('/compliance', asyncHandler(async (req, res) => {
    const item = await createComplianceItem(req.body ?? {});
    res.status(201).json({ data: item });
}));

// Intellectual Property
legalRouter.get('/ip', asyncHandler(async (_req, res) => {
    const items = await getIntellectualProperty();
    res.status(200).json({ data: items });
}));

legalRouter.post('/ip', asyncHandler(async (req, res) => {
    const item = await createIntellectualProperty(req.body ?? {});
    res.status(201).json({ data: item });
}));

// Legal Matters
legalRouter.get('/matters', asyncHandler(async (_req, res) => {
    const matters = await getLegalMatters();
    res.status(200).json({ data: matters });
}));

legalRouter.post('/matters', asyncHandler(async (req, res) => {
    const matter = await createLegalMatter(req.body ?? {});
    res.status(201).json({ data: matter });
}));

export default legalRouter;

