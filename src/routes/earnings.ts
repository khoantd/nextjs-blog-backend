import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { getCurrentUser } from '../lib/auth-utils';
import { canViewPosts } from '../lib/auth';
import { getPaginationOptions, formatPaginatedResponse } from '../lib/pagination';
import { earningsService } from '../lib/earnings-service';
import { earningsAnalysisService } from '../lib/earnings-analysis';

const router = Router();

/**
 * @openapi
 * /api/earnings:
 *   get:
 *     summary: Fetch all earnings data
 *     tags: [Earnings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: A paginated list of earnings data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 */
router.get('/', async (req, res) => {
  try {
    const user = await getCurrentUser(req);

    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!canViewPosts(user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    const paginationOptions = getPaginationOptions(req);

    const [earningsData, total] = await Promise.all([
      prisma.earningsData.findMany({
        orderBy: {
          earningsDate: "desc",
        },
        skip: paginationOptions.skip,
        take: paginationOptions.limit,
      }),
      prisma.earningsData.count(),
    ]);

    return res.json({
      data: formatPaginatedResponse(earningsData, total, paginationOptions)
    });
  } catch (error) {
    console.error("Error fetching earnings data:", error);
    return res.status(500).json({ error: "Failed to fetch earnings data" });
  }
});

/**
 * @openapi
 * /api/earnings:
 *   post:
 *     summary: Create new earnings data
 *     tags: [Earnings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - symbol
 *               - earningsDate
 *             properties:
 *               symbol:
 *                 type: string
 *               company:
 *                 type: string
 *               earningsDate:
 *                 type: string
 *                 format: date
 *               reportType:
 *                 type: string
 *                 enum: [quarterly, annual]
 *               expectedEPS:
 *                 type: number
 *               actualEPS:
 *                 type: number
 *               revenue:
 *                 type: number
 *               expectedRevenue:
 *                 type: number
 *     responses:
 *       201:
 *         description: Earnings data created successfully
 *       400:
 *         description: Missing required fields
 *       401:
 *         description: Unauthorized
 */
router.post('/', async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const {
      symbol,
      company,
      earningsDate,
      reportType,
      expectedEPS,
      actualEPS,
      revenue,
      expectedRevenue
    } = req.body;

    if (!symbol || !earningsDate) {
      return res.status(400).json({ error: "Symbol and earnings date are required" });
    }

    const earnings = await prisma.earningsData.create({
      data: {
        symbol,
        company: company || null,
        earningsDate: new Date(earningsDate),
        reportType: reportType || 'quarterly',
        expectedEPS: expectedEPS || null,
        actualEPS: actualEPS || null,
        revenue: revenue || null,
        expectedRevenue: expectedRevenue || null,
      },
    });

    return res.status(201).json({ data: { earnings } });
  } catch (error) {
    console.error("Error creating earnings data:", error);
    return res.status(500).json({ error: "Failed to create earnings data" });
  }
});

/**
 * @openapi
 * /api/earnings/sync:
 *   post:
 *     summary: Sync earnings data from Alpha Vantage
 *     tags: [Earnings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - symbols
 *             properties:
 *               symbols:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       202:
 *         description: Sync process started
 *       400:
 *         description: Invalid request body
 *       401:
 *         description: Unauthorized
 */
router.post('/sync', async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { symbols } = req.body;
    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return res.status(400).json({ error: "A list of symbols is required" });
    }

    // Fire and forget
    earningsService.syncEarningsForSymbols(symbols).catch(err => {
      console.error("Background sync error:", err);
    });

    return res.status(202).json({ message: "Sync process started" });
  } catch (error) {
    console.error("Error triggering earnings sync:", error);
    return res.status(500).json({ error: "Failed to trigger earnings sync" });
  }
});

/**
 * @openapi
 * /api/earnings/analyze:
 *   post:
 *     summary: Trigger AI analysis for earnings data
 *     tags: [Earnings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               symbols:
 *                 type: array
 *                 items:
 *                   type: string
 *               earningsIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *     responses:
 *       202:
 *         description: Analysis process started
 *       401:
 *         description: Unauthorized
 */
router.post('/analyze', async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { symbols, earningsIds } = req.body;

    // Fire and forget
    earningsAnalysisService.processAnalysis(symbols, earningsIds).catch(err => {
      console.error("Background analysis error:", err);
    });

    return res.status(202).json({ message: "Analysis process started" });
  } catch (error) {
    console.error("Error triggering earnings analysis:", error);
    return res.status(500).json({ error: "Failed to trigger earnings analysis" });
  }
});

export default router;
