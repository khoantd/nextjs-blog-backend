import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { getCurrentUser } from '../lib/auth-utils';
import { canViewPosts, canDeleteStockAnalysis } from '../lib/auth';
import * as fs from 'fs';
import * as path from 'path';
import multer from 'multer';
import {
  saveFactorAnalysisToDatabase,
  getAnalysisResultsFromDB,
  calculateFactorsOnDemand,
  calculateScoresOnDemand,
  generateDailyPrediction
} from '../lib/services/stock-factor-service';
import { getPaginationOptions, formatPaginatedResponse } from '../lib/pagination';
import {
  getStocksByGroupWithPriceIncrease,
  StockGroupPriceIncreaseResultItem
} from '../lib/services/stock-group-service';
import {
  parseStockAnalysisFilters,
  parseDailyFactorFilters,
  parseDailyScoreFilters,
  parsePredictionFilters,
  buildStockAnalysisWhere,
  buildDailyFactorWhere,
  applyDailyScoreFilters,
  applyPredictionFilters,
  FilterValidationError
} from '../lib/filter-utils';
import { predictionFeedbackSchema, validateInput, stockAnalysisBulkMinPctChangeSchema, stockAnalysisUpdateSchema, mlFeatureImportanceSchema } from '../lib/validation';
import {
  generatePredictionsForAnalysis,
  EnhancedPrediction,
  parsePredictionParams,
  PREDICTION_CONFIG
} from '../lib/prediction-utils';
import { calculateFeatureImportance } from '../lib/services/ml-feature-importance-service';
import { DailyScoreConfig, DEFAULT_DAILY_SCORE_CONFIG } from '../lib/stock-factors';
import { simulatePricePath } from '../lib/services/price-simulation-service';
import type { SimulationParameters } from '../lib/types/simulation';

// Ensure uploads directory exists and is writable
const uploadsDir = path.resolve(process.cwd(), 'uploads');

function ensureUploadsDirectory(): void {
  try {
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
      console.log(`[Upload] Created uploads directory: ${uploadsDir}`);
    } else {
      console.log(`[Upload] Using existing uploads directory: ${uploadsDir}`);
    }

    // Verify directory is writable
    fs.accessSync(uploadsDir, fs.constants.W_OK);
    console.log(`[Upload] Uploads directory is writable`);
  } catch (error) {
    console.error(`[Upload] ERROR: Failed to setup uploads directory: ${uploadsDir}`, error);
    // Don't throw - let the application start and handle errors at runtime
    // This allows the app to start even if directory creation fails initially
  }
}

// Initialize uploads directory
ensureUploadsDirectory();

/**
 * Resolve CSV file path - handles both relative and absolute paths
 */
function resolveCsvFilePath(filePath: string): string {
  if (!filePath) {
    throw new Error('CSV file path is required');
  }

  // If already absolute, return as-is
  if (path.isAbsolute(filePath)) {
    if (fs.existsSync(filePath)) {
      return filePath;
    }
    throw new Error(`CSV file not found at absolute path: ${filePath}`);
  }

  // Try relative to current working directory
  const relativePath = path.resolve(process.cwd(), filePath);
  if (fs.existsSync(relativePath)) {
    return relativePath;
  }

  // Try relative to uploads directory
  const uploadsPath = path.resolve(absoluteUploadsDir, path.basename(filePath));
  if (fs.existsSync(uploadsPath)) {
    return uploadsPath;
  }

  throw new Error(`CSV file not found at any of these locations:
    - ${filePath}
    - ${relativePath}
    - ${uploadsPath}`);
}

// Configure multer for CSV uploads
// Ensure uploadsDir is always absolute
const absoluteUploadsDir = path.resolve(uploadsDir);
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Ensure we're using absolute path
    cb(null, absoluteUploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() === '.csv') {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  }
});

const router = Router();

// Prisma delegate helper (typed minimally to avoid editor cache issues around generated Prisma types)
interface PredictionFeedbackDelegate {
  upsert(args: unknown): Promise<unknown>;
  findUnique(args: unknown): Promise<unknown>;
  findMany(args: unknown): Promise<unknown>;
}

const predictionFeedbackDelegate = (prisma as unknown as Record<string, unknown>)['predictionFeedback'] as
  | PredictionFeedbackDelegate
  | undefined;

/**
 * @openapi
 * /api/stock-analyses/by-group:
 *   get:
 *     summary: List stocks in a stock group with price increase filter
 *     tags: [Stock Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: group
 *         required: true
 *         schema:
 *           type: string
 *         description: Stock group name (e.g., VN30, VN100)
 *         example: VN30
 *       - in: query
 *         name: dateFrom
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date (inclusive, YYYY-MM-DD)
 *         example: "2025-01-01"
 *       - in: query
 *         name: dateTo
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: End date (inclusive, YYYY-MM-DD)
 *         example: "2025-01-31"
 *       - in: query
 *         name: minIncrease
 *         required: true
 *         schema:
 *           type: number
 *         description: Minimum percentage increase based on (Close - Open) / Open * 100
 *         example: 5
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
 *         description: Items per page (use 0 or all to fetch all)
 *     responses:
 *       200:
 *         description: A paginated list of stocks in the group with price increase filter applied
 *       400:
 *         description: Invalid parameters
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 *       500:
 *         description: Server error
 */
// GET /api/stock-analyses/by-group - List stocks by group with price increase filter
router.get('/by-group', async (req, res) => {
  try {
    let user;
    try {
      user = await getCurrentUser(req);
    } catch (authError) {
      console.error('[GET /api/stock-analyses/by-group] Error in getCurrentUser:', authError);
      return res.status(500).json({
        error: 'Authentication check failed',
        message: authError instanceof Error ? authError.message : String(authError),
      });
    }

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!canViewPosts(user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const group = typeof req.query.group === 'string' ? req.query.group.trim() : '';
    const dateFrom = typeof req.query.dateFrom === 'string' ? req.query.dateFrom.trim() : '';
    const dateTo = typeof req.query.dateTo === 'string' ? req.query.dateTo.trim() : '';
    const minIncreaseRaw =
      typeof req.query.minIncrease === 'string' ? req.query.minIncrease.trim() : '';

    if (!group) {
      return res.status(400).json({
        error: 'Invalid parameter',
        message: 'Parameter "group" is required',
        parameter: 'group',
      });
    }

    if (!dateFrom || !dateTo) {
      return res.status(400).json({
        error: 'Invalid parameter',
        message: 'Parameters "dateFrom" and "dateTo" are required',
        parameter: !dateFrom ? 'dateFrom' : 'dateTo',
      });
    }

    // Basic date validation (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateFrom) || !dateRegex.test(dateTo)) {
      return res.status(400).json({
        error: 'Invalid parameter',
        message: 'dateFrom and dateTo must be in format YYYY-MM-DD',
      });
    }

    const fromDate = new Date(dateFrom);
    const toDate = new Date(dateTo);
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return res.status(400).json({
        error: 'Invalid parameter',
        message: 'dateFrom and dateTo must be valid dates',
      });
    }

    if (fromDate > toDate) {
      return res.status(400).json({
        error: 'Invalid parameter',
        message: 'dateFrom must be earlier than or equal to dateTo',
      });
    }

    const minIncrease = Number(minIncreaseRaw);
    if (!Number.isFinite(minIncrease)) {
      return res.status(400).json({
        error: 'Invalid parameter',
        message: 'minIncrease must be a valid number',
        parameter: 'minIncrease',
        value: minIncreaseRaw,
      });
    }

    const paginationOptions = getPaginationOptions(req);

    let rawResults: StockGroupPriceIncreaseResultItem[];
    try {
      rawResults = await getStocksByGroupWithPriceIncrease({
        group,
        dateFrom,
        dateTo,
        minIncrease,
      });
    } catch (serviceError) {
      console.error(
        '[GET /api/stock-analyses/by-group] Error in getStocksByGroupWithPriceIncrease:',
        serviceError
      );
      return res.status(400).json({
        error: 'Failed to fetch stocks by group',
        message: serviceError instanceof Error ? serviceError.message : String(serviceError),
      });
    }

    const total = rawResults.length;

    const items =
      paginationOptions.limit > 0
        ? rawResults.slice(
            paginationOptions.skip,
            paginationOptions.skip + paginationOptions.limit
          )
        : rawResults;

    return res.json({
      data: formatPaginatedResponse(items, total, paginationOptions),
    });
  } catch (error) {
    console.error('[GET /api/stock-analyses/by-group] Unexpected error:', error);
    return res.status(500).json({
      error: 'Failed to fetch stocks by group',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @openapi
 * /api/stock-analyses:
 *   get:
 *     summary: Fetch all stock analyses (paginated with filtering)
 *     tags: [Stock Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: symbol
 *         schema:
 *           type: string
 *         description: Filter by symbol (contains, case-sensitive for SQLite)
 *         example: AAPL
 *       - in: query
 *         name: market
 *         schema:
 *           type: string
 *           enum: [US, VN]
 *         description: Filter by market (exact match)
 *         example: US
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by status (comma-separated for multiple values)
 *         example: completed,draft
 *       - in: query
 *         name: favorite
 *         schema:
 *           type: boolean
 *         description: Filter by favorite flag
 *         example: true
 *       - in: query
 *         name: createdFrom
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by creation date from (inclusive, ISO 8601 format YYYY-MM-DD)
 *         example: "2024-01-01"
 *       - in: query
 *         name: createdTo
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by creation date to (inclusive, ISO 8601 format YYYY-MM-DD)
 *         example: "2025-01-15"
 *       - in: query
 *         name: updatedFrom
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by update date from (inclusive, ISO 8601 format YYYY-MM-DD)
 *         example: "2024-01-01"
 *       - in: query
 *         name: updatedTo
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by update date to (inclusive, ISO 8601 format YYYY-MM-DD)
 *         example: "2025-01-15"
 *       - in: query
 *         name: minPrice
 *         schema:
 *           type: number
 *         description: Filter by minimum latest price
 *         example: 100
 *       - in: query
 *         name: maxPrice
 *         schema:
 *           type: number
 *         description: Filter by maximum latest price
 *         example: 200
 *       - in: query
 *         name: latest
 *         schema:
 *           type: boolean
 *         description: Get only the latest analysis for the symbol (must be used with symbol filter)
 *         example: true
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
 *         description: Items per page (use 0 to fetch all)
 *     responses:
 *       200:
 *         description: A paginated list of stock analyses
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     items:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/StockAnalysis'
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *       400:
 *         description: Invalid filter parameter
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 *       500:
 *         description: Server error
 */
// GET /api/stock-analyses - Fetch all stock analyses
router.get('/', async (req, res) => {
  try {
    // Get user with error handling
    let user;
    try {
      user = await getCurrentUser(req);
    } catch (authError) {
      console.error("Error in getCurrentUser:", authError);
      // Always return detailed error for debugging
      return res.status(500).json({
        error: "Authentication check failed",
        message: authError instanceof Error ? authError.message : String(authError),
        stack: authError instanceof Error ? authError.stack : undefined,
        details: {
          name: authError instanceof Error ? authError.name : 'Unknown',
          message: authError instanceof Error ? authError.message : String(authError),
        }
      });
    }

    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!canViewPosts(user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    // Parse filters with error handling
    let filters;
    try {
      filters = parseStockAnalysisFilters(req);
    } catch (filterError) {
      if (filterError instanceof FilterValidationError) {
        return res.status(400).json({
          error: "Invalid filter parameter",
          message: filterError.message,
          parameter: filterError.parameter,
          value: filterError.value
        });
      }
      throw filterError;
    }

    // Validate latest filter - must be used with symbol
    if (filters.latest && !filters.symbol) {
      return res.status(400).json({
        error: "Invalid filter parameter",
        message: "The 'latest' filter requires the 'symbol' filter to be specified",
        parameter: "latest",
        value: filters.latest
      });
    }

    // Get pagination options with error handling
    let paginationOptions;
    try {
      paginationOptions = getPaginationOptions(req);
    } catch (paginationError) {
      console.error("Error in getPaginationOptions:", paginationError);
      // Always return detailed error for debugging
      return res.status(500).json({
        error: "Pagination options failed",
        message: paginationError instanceof Error ? paginationError.message : String(paginationError),
        stack: paginationError instanceof Error ? paginationError.stack : undefined,
        details: {
          name: paginationError instanceof Error ? paginationError.name : 'Unknown',
          message: paginationError instanceof Error ? paginationError.message : String(paginationError),
        }
      });
    }

    // Fetch data with error handling
    let stockAnalyses, total;
    try {
      // Build where clause from filters
      const where = buildStockAnalysisWhere(filters);

      // Build query conditionally - when limit is 0, fetch all records
      const queryOptions: any = {
        where,
        orderBy: {
          createdAt: "desc",
        },
      };

      // Handle 'latest' filter - override pagination to get only the most recent
      if (filters.latest) {
        queryOptions.take = 1;
      } else if (paginationOptions.limit > 0) {
        // Only apply pagination if limit is not 0 and latest is not set
        queryOptions.skip = paginationOptions.skip;
        queryOptions.take = paginationOptions.limit;
      }

      [stockAnalyses, total] = await Promise.all([
        prisma.stockAnalysis.findMany(queryOptions),
        prisma.stockAnalysis.count({ where }),
      ]);
    } catch (dbError) {
      console.error("Database error fetching stock analyses:", dbError);

      // Check for missing table error (P2021)
      const prismaError = dbError as any;
      if (prismaError.code === 'P2021') {
        const tableName = prismaError.meta?.table || 'unknown';
        return res.status(500).json({
          error: "Database table not found",
          message: `The database table '${tableName}' does not exist. Please run database migrations.`,
          code: prismaError.code,
          meta: prismaError.meta,
          details: {
            name: prismaError.name || 'PrismaClientKnownRequestError',
            message: `Table '${tableName}' does not exist in the database. Run 'npm run db:migrate:deploy' to apply migrations.`,
            table: tableName,
            solution: "Run 'npm run db:migrate:deploy' or 'npx prisma migrate deploy' on the backend server"
          }
        });
      }

      // Always return detailed error for debugging
      return res.status(500).json({
        error: "Database query failed",
        message: dbError instanceof Error ? dbError.message : String(dbError),
        stack: dbError instanceof Error ? dbError.stack : undefined,
        code: (dbError as any).code,
        meta: (dbError as any).meta,
        details: {
          name: dbError instanceof Error ? dbError.name : 'Unknown',
          message: dbError instanceof Error ? dbError.message : String(dbError),
        }
      });
    }

    // Format response with error handling
    try {
      return res.json({
        data: formatPaginatedResponse(stockAnalyses, total, paginationOptions)
      });
    } catch (formatError) {
      console.error("Error formatting response:", formatError);
      // Always return detailed error for debugging
      return res.status(500).json({
        error: "Response formatting failed",
        message: formatError instanceof Error ? formatError.message : String(formatError),
        stack: formatError instanceof Error ? formatError.stack : undefined,
        details: {
          name: formatError instanceof Error ? formatError.name : 'Unknown',
          message: formatError instanceof Error ? formatError.message : String(formatError),
        }
      });
    }
  } catch (error) {
    console.error("Unexpected error fetching stock analyses:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    // Always return detailed error message for debugging
    return res.status(500).json({
      error: "Failed to fetch stock analyses",
      message: errorMessage,
      // Include stack and details even in production for remote debugging
      stack: errorStack,
      details: error instanceof Error ? {
        name: error.name,
        message: error.message,
      } : { raw: String(error) }
    });
  }
});

/**
 * @openapi
 * /api/stock-analyses:
 *   post:
 *     summary: Create a new stock analysis
 *     tags: [Stock Analysis]
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
 *             properties:
 *               symbol:
 *                 type: string
 *                 description: Stock symbol (e.g., AAPL, VIC)
 *               name:
 *                 type: string
 *                 description: Company name
 *               market:
 *                 type: string
 *                 enum: [US, VN]
 *                 description: Market code
 *               csvFilePath:
 *                 type: string
 *                 description: Path to CSV file (optional)
 *     responses:
 *       201:
 *         description: Stock analysis created successfully
 *       400:
 *         description: Symbol is required
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
// POST /api/stock-analyses - Create a new stock analysis
router.post('/', async (req, res) => {
  try {
    console.log('[POST /api/stock-analyses] Request received:', {
      body: req.body,
      hasAuth: !!req.headers.cookie,
    });

    const user = await getCurrentUser(req);
    if (!user) {
      console.error('[POST /api/stock-analyses] Unauthorized - no user found');
      return res.status(401).json({ error: "Unauthorized" });
    }

    console.log('[POST /api/stock-analyses] User authenticated:', user.id);

    const { symbol, name, csvFilePath, market } = req.body;

    if (!symbol) {
      console.error('[POST /api/stock-analyses] Missing symbol');
      return res.status(400).json({ error: "Symbol is required" });
    }

    console.log('[POST /api/stock-analyses] Creating stock analysis:', {
      symbol,
      name,
      market,
      csvFilePath,
    });

    const stockAnalysis = await prisma.stockAnalysis.create({
      data: {
        symbol,
        market: market || null,
        name: name || null,
        csvFilePath: csvFilePath || null,
        status: "draft",
      },
    });

    console.log('[POST /api/stock-analyses] Stock analysis created:', stockAnalysis.id);

    return res.status(201).json({ data: { stockAnalysis } });
  } catch (error) {
    console.error("[POST /api/stock-analyses] Error creating stock analysis:", error);
    console.error("[POST /api/stock-analyses] Error details:", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined,
    });
    return res.status(500).json({ 
      error: "Failed to create stock analysis",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @openapi
 * /api/stock-analyses/import-from-vnstock:
 *   post:
 *     summary: Import stock data from vnstock API using symbol/ticket
 *     description: Creates a new stock analysis, downloads CSV data from vnstock API, and imports it to the database in one operation
 *     tags: [Stock Analysis]
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
 *               - start_date
 *               - end_date
 *             properties:
 *               symbol:
 *                 type: string
 *                 description: Stock symbol/ticket (e.g., VCI, FPT, VIC)
 *                 example: VCI
 *               start_date:
 *                 type: string
 *                 format: date
 *                 description: Start date in YYYY-MM-DD or DD-MM-YYYY format
 *                 example: "2024-01-01"
 *               end_date:
 *                 type: string
 *                 format: date
 *                 description: End date in YYYY-MM-DD or DD-MM-YYYY format
 *                 example: "2024-12-31"
 *               name:
 *                 type: string
 *                 description: Company name (optional)
 *                 example: "Vietnam Capital Investment"
 *               market:
 *                 type: string
 *                 enum: [US, VN]
 *                 description: Market identifier (defaults to VN for vnstock)
 *                 example: VN
 *               source:
 *                 type: string
 *                 description: Data source (vci, tcbs, msn) - defaults to vci
 *                 example: vci
 *               interval:
 *                 type: string
 *                 description: Data interval (D, 1W, 1M, 1m, 5m, 15m, 30m, 1H) - defaults to D
 *                 example: D
 *     responses:
 *       201:
 *         description: Stock analysis created and data imported successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     stockAnalysis:
 *                       $ref: '#/components/schemas/StockAnalysis'
 *                     dataPoints:
 *                       type: number
 *                     dateRange:
 *                       type: object
 *                     source:
 *                       type: string
 *       400:
 *         description: Invalid parameters (missing symbol, dates, or invalid date range)
 *       401:
 *         description: Unauthorized
 *       503:
 *         description: Vnstock API not configured or unavailable
 *       500:
 *         description: Server error
 */
// POST /api/stock-analyses/import-from-vnstock - Import data from vnstock API with symbol
router.post('/import-from-vnstock', async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { symbol, start_date, end_date, name, market = 'VN', source = 'vci', interval = 'D' } = req.body;

    // Validate required fields
    if (!symbol) {
      return res.status(400).json({ error: "Symbol is required" });
    }

    if (!start_date) {
      return res.status(400).json({ error: "start_date is required" });
    }

    if (!end_date) {
      return res.status(400).json({ error: "end_date is required" });
    }

    // Validate date format and range
    let startDate: string;
    let endDate: string;
    
    try {
      // Try DD-MM-YYYY format first (vnstock preferred format)
      const startMatch = start_date.match(/^(\d{2})-(\d{2})-(\d{4})$/);
      const endMatch = end_date.match(/^(\d{2})-(\d{2})-(\d{4})$/);
      
      if (startMatch && endMatch) {
        startDate = `${startMatch[3]}-${startMatch[2]}-${startMatch[1]}`;
        endDate = `${endMatch[3]}-${endMatch[2]}-${endMatch[1]}`;
      } else {
        // Try YYYY-MM-DD format
        const startDateObj = new Date(start_date);
        const endDateObj = new Date(end_date);
        
        if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
          throw new Error('Invalid date format. Use YYYY-MM-DD or DD-MM-YYYY');
        }
        
        startDate = start_date;
        endDate = end_date;
      }

      // Validate date range
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      if (end < start) {
        return res.status(400).json({ error: "end_date must be after start_date" });
      }

      const daysDiff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
      if (daysDiff > 365 * 5) {
        return res.status(400).json({ error: "Date range cannot exceed 5 years" });
      }
    } catch (error: any) {
      return res.status(400).json({ 
        error: "Invalid date format", 
        message: error.message || "Use YYYY-MM-DD or DD-MM-YYYY format"
      });
    }

    // Check if vnstock client is available
    const { getVnstockClient } = await import('../lib/vnstock-client');
    const vnstockClient = getVnstockClient();

    if (!vnstockClient) {
      return res.status(503).json({ 
        error: "Vnstock API is not configured. Please set VNSTOCK_API_URL environment variable." 
      });
    }

    // Check if an analysis already exists for this symbol
    // Trim and uppercase symbol to ensure it passes validation
    const normalizedSymbol = symbol.trim().toUpperCase();
    const normalizedMarket = market || 'VN';
    
    let stockAnalysis = await prisma.stockAnalysis.findFirst({
      where: {
        symbol: normalizedSymbol,
        market: normalizedMarket,
      },
      orderBy: {
        createdAt: 'desc', // Get the most recent one
      },
    });

    // Track whether this is a new analysis or supplement to existing one
    const isNewAnalysis = !stockAnalysis;

    // If analysis exists, use it; otherwise create a new one
    if (stockAnalysis) {
      console.log(
        `[Vnstock Import] Found existing analysis for ${normalizedSymbol} (ID: ${stockAnalysis.id}). ` +
        `Supplementing existing data instead of creating new analysis.`
      );
      
      // Update status to analyzing while we process new data
      stockAnalysis = await prisma.stockAnalysis.update({
        where: { id: stockAnalysis.id },
        data: {
          status: "analyzing",
          // Update name if provided and current name is null
          ...(name && !stockAnalysis.name && { name }),
        },
      });
    } else {
      console.log(
        `[Vnstock Import] No existing analysis found for ${normalizedSymbol}. Creating new analysis.`
      );
      
      // Create new stock analysis record
      stockAnalysis = await prisma.stockAnalysis.create({
        data: {
          symbol: normalizedSymbol,
          market: normalizedMarket,
          name: name || null,
          csvFilePath: null, // No file path since it's from API
          status: "analyzing",
        },
      });
    }

    try {
      // Fetch CSV data from vnstock
      // Convert dates to DD-MM-YYYY format for vnstock API (preferred format)
      const formatDateForVnstock = (dateStr: string): string => {
        const date = new Date(dateStr);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}-${month}-${year}`;
      };

      const csvContent = await vnstockClient.downloadCSV({
        symbol: normalizedSymbol, // Use already normalized symbol
        start_date: formatDateForVnstock(startDate),
        end_date: formatDateForVnstock(endDate),
        source,
        interval,
      });

      if (!csvContent || csvContent.trim().length === 0) {
        // Update status to failed
        await prisma.stockAnalysis.update({
          where: { id: stockAnalysis.id },
          data: { status: "failed" }
        });
        return res.status(404).json({ 
          error: "No CSV data returned from vnstock API",
          message: `No data found for symbol ${symbol.toUpperCase()} in the specified date range`
        });
      }

      // Save to database (same as CSV upload flow)
      // This will supplement existing data if dates overlap, or add new dates
      await saveFactorAnalysisToDatabase(stockAnalysis.id, csvContent);

      // Update status to completed
      const updatedAnalysis = await prisma.stockAnalysis.update({
        where: { id: stockAnalysis.id },
        data: {
          status: "completed",
        }
      });

      const results = await getAnalysisResultsFromDB(stockAnalysis.id);

      // Count data points from CSV
      const dataPointCount = csvContent.split('\n').filter(line => line.trim().length > 0).length - 1; // Subtract header

      return res.status(201).json({
        success: true,
        message: isNewAnalysis
          ? `Successfully imported data from vnstock API for ${symbol.toUpperCase()}`
          : `Successfully supplemented existing analysis for ${symbol.toUpperCase()} with new data from vnstock API`,
        data: {
          stockAnalysis: {
            ...updatedAnalysis,
            results
          },
          dataPoints: dataPointCount,
          dateRange: {
            start: startDate,
            end: endDate
          },
          source: 'vnstock',
          isNewAnalysis,
        }
      });
    } catch (downloadError: any) {
      // Update status to failed if download/import fails
      await prisma.stockAnalysis.update({
        where: { id: stockAnalysis.id },
        data: { status: "failed" }
      });

      console.error("Error downloading/importing CSV from vnstock:", downloadError);
      return res.status(500).json({ 
        error: "Failed to download or import CSV data from vnstock API",
        message: downloadError.message || "Unknown error occurred"
      });
    }
  } catch (error: any) {
    console.error("Error importing data from vnstock:", error);
    return res.status(500).json({ 
      error: "Failed to import data from vnstock",
      message: error.message || "Unknown error occurred"
    });
  }
});

// GET /api/stock-analyses/:id/status - Get status of stock analysis
// NOTE: This must come before /:id route to avoid route conflicts
router.get('/:id/status', async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;
    const stockAnalysis = await prisma.stockAnalysis.findUnique({
      where: { id: Number(id) },
      select: {
        id: true,
        status: true,
        updatedAt: true,
      },
    });

    if (!stockAnalysis) {
      return res.status(404).json({ error: "Stock analysis not found" });
    }

    return res.json({
      status: stockAnalysis.status,
      lastUpdated: stockAnalysis.updatedAt,
      progress: stockAnalysis.status === 'completed' ? 100 : 
                stockAnalysis.status === 'analyzing' || stockAnalysis.status === 'processing' ? 50 : 
                stockAnalysis.status === 'factor_failed' ? 0 : 0,
      message: `Status: ${stockAnalysis.status}`,
    });
  } catch (error) {
    console.error("Error fetching stock analysis status:", error);
    return res.status(500).json({ error: "Failed to fetch status" });
  }
});

/**
 * @openapi
 * /api/stock-analyses/scan-high-probability:
 *   get:
 *     summary: Scan all stock analyses and return symbols with HIGH_PROBABILITY predictions for N business days ahead
 *     tags: [Stock Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: market
 *         schema:
 *           type: string
 *           enum: [US, VN]
 *         description: Optional market filter (US or VN)
 *         example: US
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Optional status filter (comma-separated). Defaults to completed.
 *         example: completed
 *       - in: query
 *         name: minScore
 *         schema:
 *           type: number
 *         description: "Optional minimum prediction score (note: current score scale is 0-1)"
 *         example: 0.45
 *       - in: query
 *         name: minConfidence
 *         schema:
 *           type: number
 *         description: "Optional minimum confidence (note: current confidence scale is 0-95)"
 *         example: 70
 *       - in: query
 *         name: futureDays
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 30
 *           default: 1
 *         description: "Number of business days ahead to scan (default: 1)"
 *         example: 1
 *     responses:
 *       200:
 *         description: Scan results
 *       400:
 *         description: Invalid filter parameter
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 *       500:
 *         description: Server error
 */
// GET /api/stock-analyses/scan-high-probability - Scan all symbols for HIGH_PROBABILITY day-ahead predictions
router.get('/scan-high-probability', async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    if (!canViewPosts(user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    // Parse prediction filters (minScore, minConfidence, dateFrom/dateTo if provided)
    let predictionFilters;
    try {
      predictionFilters = parsePredictionFilters(req);
    } catch (filterError) {
      if (filterError instanceof FilterValidationError) {
        return res.status(400).json({
          error: "Invalid filter parameter",
          message: filterError.message,
          parameter: filterError.parameter,
          value: filterError.value
        });
      }
      throw filterError;
    }

    // Parse scan parameters
    const marketParam = typeof req.query.market === 'string' ? req.query.market : undefined;
    const statusParam = typeof req.query.status === 'string' ? req.query.status : undefined;
    const futureDaysParam = typeof req.query.futureDays === 'string' ? req.query.futureDays : undefined;
    const daysParam = typeof req.query.days === 'string' ? req.query.days : undefined;
    const thresholdParam = typeof req.query.threshold === 'string' ? req.query.threshold : undefined;

    const marketFilter: 'US' | 'VN' | undefined =
      marketParam === 'US' || marketParam === 'VN' ? marketParam : undefined;

    if (marketParam !== undefined && !marketFilter) {
      return res.status(400).json({
        error: "Invalid filter parameter",
        message: "Invalid market. Expected US or VN.",
        parameter: "market",
        value: marketParam
      });
    }

    const statusList = (statusParam && statusParam.trim().length > 0)
      ? statusParam.split(',').map(s => s.trim()).filter(Boolean)
      : ['completed'];

    // futureDays = N business days ahead to scan (default 1)
    let dayAhead = 1;
    if (futureDaysParam !== undefined) {
      const parsed = Number.parseInt(futureDaysParam, 10);
      if (Number.isNaN(parsed) || parsed < 1 || parsed > PREDICTION_CONFIG.MAX_FUTURE_DAYS) {
        return res.status(400).json({
          error: "Invalid futureDays parameter",
          message: `futureDays must be a number between 1 and ${PREDICTION_CONFIG.MAX_FUTURE_DAYS}`,
          parameter: "futureDays",
          value: futureDaysParam
        });
      }
      dayAhead = parsed;
    }

    // daysLimit = number of historical days to use for baseline factor extraction (default 10)
    let daysLimit = 10;
    if (daysParam !== undefined) {
      const parsed = Number.parseInt(daysParam, 10);
      if (Number.isNaN(parsed) || parsed < PREDICTION_CONFIG.MIN_DAYS_LIMIT || parsed > PREDICTION_CONFIG.MAX_DAYS_LIMIT) {
        return res.status(400).json({
          error: "Invalid days parameter",
          message: `days must be a number between ${PREDICTION_CONFIG.MIN_DAYS_LIMIT} and ${PREDICTION_CONFIG.MAX_DAYS_LIMIT}`,
          parameter: "days",
          value: daysParam
        });
      }
      daysLimit = parsed;
    }

    // threshold = score threshold for HIGH_PROBABILITY classification (default 0.45)
    let customThreshold: number | undefined = undefined;
    if (thresholdParam !== undefined) {
      const parsed = Number.parseFloat(thresholdParam);
      if (Number.isNaN(parsed) || parsed < 0 || parsed > 1) {
        return res.status(400).json({
          error: "Invalid threshold parameter",
          message: "threshold must be a number between 0 and 1",
          parameter: "threshold",
          value: thresholdParam
        });
      }
      customThreshold = parsed;
    }

    // Create custom score config if threshold is provided
    let scoreConfig: DailyScoreConfig | undefined = undefined;
    if (customThreshold !== undefined) {
      scoreConfig = {
        ...DEFAULT_DAILY_SCORE_CONFIG,
        threshold: customThreshold
      };
    }

    // Query all analyses (optionally filtered), then deduplicate by symbol (latest updatedAt wins)
    const analyses = await prisma.stockAnalysis.findMany({
      where: {
        ...(marketFilter ? { market: marketFilter } : {}),
        ...(statusList.length > 0 ? { status: { in: statusList } } : {})
      },
      select: {
        id: true,
        symbol: true,
        market: true,
        status: true,
        updatedAt: true
      },
      orderBy: { updatedAt: 'desc' }
    });

    const latestBySymbol = new Map<string, typeof analyses[number]>();
    for (const a of analyses) {
      if (!a.symbol) continue;
      const key = a.symbol.trim().toUpperCase();
      // analyses are ordered by updatedAt desc already; first occurrence is latest
      if (!latestBySymbol.has(key)) {
        latestBySymbol.set(key, a);
      }
    }

    const uniqueAnalyses = Array.from(latestBySymbol.values());

    const warnings: Array<{ stockAnalysisId: number; symbol: string; error: string }> = [];
    const results: Array<{
      symbol: string;
      market: string | null;
      stockAnalysisId: number;
      prediction: EnhancedPrediction;
    }> = [];

    const toPct = (v: number | null | undefined): string => {
      if (typeof v !== 'number' || Number.isNaN(v)) return 'N/A';
      const sign = v > 0 ? '+' : '';
      return `${sign}${v.toFixed(1)}%`;
    };

    const fmtNumber = (v: number | null | undefined, decimals: number = 0): string => {
      if (typeof v !== 'number' || Number.isNaN(v)) return 'N/A';
      return v.toFixed(decimals);
    };

    const formatVnd = (v: number | null | undefined): string => {
      if (typeof v !== 'number' || Number.isNaN(v)) return 'N/A';
      // Heuristic: VN stocks often have prices like 30 (thousand VND). We keep as-is and prefix ₫.
      // If you store raw VND, this still prints correctly.
      return `₫${fmtNumber(v, 0)}`;
    };

    const buildSignalTags = (p: EnhancedPrediction): string[] => {
      const tags: string[] = [];

      // Pattern tag
      if (p.patterns?.patternType === 'consolidation') {
        tags.push('tích_lũy');
      } else if (p.patterns?.patternType === 'breakout') {
        tags.push('breakout');
      } else if (p.patterns?.patternType === 'reversal') {
        tags.push('reversal');
      }

      // MA position tags
      if (p.signals?.movingAverages?.priceVsMA20 === 'above') tags.push('above_ma20');
      if (p.signals?.movingAverages?.priceVsMA50 === 'above') tags.push('above_ma50');
      if (p.signals?.movingAverages?.priceVsMA200 === 'above') tags.push('above_ma200');

      // RSI tag
      const rsi = p.signals?.momentum?.rsi;
      if (typeof rsi === 'number' && !Number.isNaN(rsi)) {
        tags.push(`rsi_bullish (${rsi.toFixed(0)})`);
      }

      // Volume ratio tag
      const vr = p.signals?.volume?.volumeRatio;
      if (typeof vr === 'number' && !Number.isNaN(vr)) {
        if (vr >= 1.5) tags.push(`KL_cao (${vr.toFixed(1)}x)`);
        else tags.push(`KL (${vr.toFixed(1)}x)`);
      }

      return tags;
    };

    const buildVietnameseReport = (
      scanAtIso: string,
      high: Array<{ symbol: string; market: string | null; prediction: EnhancedPrediction }>,
      watch: Array<{ symbol: string; market: string | null; prediction: EnhancedPrediction }>,
      diagnostics?: {
        totalScanned: number;
        warningsCount: number;
        warnings?: Array<{ symbol: string; error: string }>;
        filters?: { minScore?: number; minConfidence?: number; futureDays?: number; daysLimit?: number; threshold?: number };
        stats?: {
          predictionsGenerated: number;
          futurePredictionsFound: number;
          predictionsAfterFilter: number;
          predictionTypeCounts?: Record<string, number>;
          samplePredictions?: Array<{ symbol: string; prediction: string; score: number; confidence?: number }>;
        };
      }
    ): string => {
      const scanDate = scanAtIso.split('T')[0];
      const scanTime = scanAtIso.split('T')[1]?.slice(0, 5) || '';

      const lines: string[] = [];
      lines.push(`📈 QUÉT CỔ PHIẾU - ${scanDate} ${scanTime}`);
      lines.push('');
      
      // Add diagnostic info if no results
      if (high.length === 0 && watch.length === 0 && diagnostics) {
        lines.push('📊 THÔNG TIN QUÉT:');
        lines.push(`   • Đã quét: ${diagnostics.totalScanned} mã cổ phiếu`);
        if (diagnostics.filters) {
          const filterParts: string[] = [];
          if (diagnostics.filters.minScore !== undefined) {
            filterParts.push(`Điểm tối thiểu: ${diagnostics.filters.minScore}`);
          }
          if (diagnostics.filters.minConfidence !== undefined) {
            filterParts.push(`Độ tin cậy tối thiểu: ${diagnostics.filters.minConfidence}%`);
          }
          if (diagnostics.filters.futureDays !== undefined) {
            filterParts.push(`Ngày tương lai: ${diagnostics.filters.futureDays}`);
          }
          if (diagnostics.filters.daysLimit !== undefined) {
            filterParts.push(`Ngày lịch sử: ${diagnostics.filters.daysLimit}`);
          }
          if (diagnostics.filters.threshold !== undefined) {
            filterParts.push(`Ngưỡng: ${(diagnostics.filters.threshold * 100).toFixed(0)}%`);
          }
          if (filterParts.length > 0) {
            lines.push(`   • Bộ lọc: ${filterParts.join(', ')}`);
          }
        }
        if (diagnostics.stats) {
          lines.push(`   • Dự đoán đã tạo: ${diagnostics.stats.predictionsGenerated}`);
          lines.push(`   • Dự đoán tương lai: ${diagnostics.stats.futurePredictionsFound}`);
          lines.push(`   • Sau khi lọc: ${diagnostics.stats.predictionsAfterFilter}`);
          
          if (diagnostics.stats.predictionTypeCounts) {
            const typeParts: string[] = [];
            Object.entries(diagnostics.stats.predictionTypeCounts).forEach(([type, count]) => {
              typeParts.push(`${type}: ${count}`);
            });
            if (typeParts.length > 0) {
              lines.push(`   • Phân loại: ${typeParts.join(', ')}`);
            }
          }
          
          if (diagnostics.stats.samplePredictions && diagnostics.stats.samplePredictions.length > 0) {
            lines.push('');
            lines.push('📋 MẪU DỰ ĐOÁN (5 đầu tiên):');
            diagnostics.stats.samplePredictions.slice(0, 5).forEach(sample => {
              // Confidence is already stored as a percentage (0-95), so don't multiply by 100
              const confStr = sample.confidence !== undefined ? `, Độ tin cậy: ${sample.confidence.toFixed(1)}%` : '';
              lines.push(`   • ${sample.symbol}: ${sample.prediction}, Điểm: ${sample.score.toFixed(3)}${confStr}`);
            });
            
            // Check if all scores are 0 - this indicates no active factors
            const allZeroScores = diagnostics.stats.samplePredictions.every(s => s.score === 0);
            if (allZeroScores && diagnostics.stats.futurePredictionsFound > 0) {
              lines.push('');
              lines.push('⚠️ CẢNH BÁO: Tất cả dự đoán có điểm 0.000');
              lines.push('   • Nguyên nhân: Không có yếu tố tích cực được phát hiện trong dữ liệu');
              lines.push('   • Giải pháp: Kiểm tra lại phân tích yếu tố hoặc cập nhật dữ liệu cổ phiếu');
            }
          }
        }
        if (diagnostics.warningsCount > 0) {
          lines.push(`   • Cảnh báo: ${diagnostics.warningsCount} mã có lỗi`);
          if (diagnostics.warnings && diagnostics.warnings.length > 0) {
            lines.push('');
            lines.push('⚠️ CHI TIẾT LỖI:');
            diagnostics.warnings.slice(0, 5).forEach(w => {
              lines.push(`   • ${w.symbol}: ${w.error.substring(0, 100)}${w.error.length > 100 ? '...' : ''}`);
            });
            if (diagnostics.warnings.length > 5) {
              lines.push(`   ... và ${diagnostics.warnings.length - 5} lỗi khác`);
            }
          }
        }
        lines.push('');
      }
      
      lines.push('🔥 XÁC SUẤT CAO:');

      if (high.length === 0) {
        lines.push('(Không có kết quả)');
      } else {
        high.forEach((item, idx) => {
          const p = item.prediction;
          const market = item.market ?? 'N/A';
          const score = typeof p.score === 'number' ? p.score : 0;
          const price = p.priceData?.currentPrice ?? p.priceData?.close ?? null;
          const chgPct = p.priceData?.changePercent ?? p.priceData?.change ?? null;
          const volRatio = p.signals?.volume?.volumeRatio ?? null;
          const tags = buildSignalTags(p);

          const headerPrefix = idx === 0 ? '' : `${idx + 1}. `;
          lines.push(`${headerPrefix}${item.symbol} (${market}) | Điểm: ${score.toFixed(3)}`);
          lines.push(`   💵 ${formatVnd(price)} (${toPct(chgPct)})`);
          lines.push(`   📊 KL: ${fmtNumber(volRatio, 1)}x TB`);
          if (tags.length > 0) {
            lines.push(`   ✅ ${tags.join(', ')}`);
          }
          lines.push('');
        });
      }

      lines.push('👀 THEO DÕI:');
      if (watch.length === 0) {
        lines.push('(Không có kết quả)');
      } else {
        watch.forEach((item) => {
          const p = item.prediction;
          const market = item.market ?? 'N/A';
          const score = typeof p.score === 'number' ? p.score : 0;
          const chgPct = p.priceData?.changePercent ?? p.priceData?.change ?? null;
          lines.push(`• ${item.symbol} (${market}) | Điểm: ${score.toFixed(3)} | ${toPct(chgPct)}`);
        });
      }

      lines.push('');
      lines.push('⚠️ Tín hiệu xác suất - Không phải lời khuyên đầu tư');
      return lines.join('\n');
    };

    // Don't force HIGH_PROBABILITY filter - show best predictions regardless of type
    // Users can still filter by prediction type via query params if needed
    const effectiveFilters = { ...predictionFilters };
    // Remove prediction type filter if it's set to HIGH_PROBABILITY and we want to show all types
    // This allows showing MODERATE/LOW_PROBABILITY predictions that meet score thresholds

    // Track statistics for diagnostics
    let totalPredictionsGenerated = 0;
    let totalFuturePredictionsFound = 0;
    let totalPredictionsAfterFilter = 0;
    const predictionTypeCounts: Record<string, number> = {};
    const samplePredictions: Array<{ symbol: string; prediction: string; score: number; confidence?: number }> = [];

    for (const analysis of uniqueAnalyses) {
      try {
        // Generate predictions WITHOUT filters first to see what we get
        // Then apply filters manually
        // Use configurable daysLimit to find baseline data with active factors
        // The baseline selection logic will look through up to daysLimit days to find one with active factors
        const genResult = await generatePredictionsForAnalysis(
          analysis.id,
          daysLimit, // Configurable via 'days' query parameter (default: 10)
          {}, // No filters during generation - we'll filter manually
          'date',
          'desc',
          { 
            enableLogging: false, 
            futureDays: dayAhead,
            scoreConfig: scoreConfig // Custom threshold if provided
          }
        );

        totalPredictionsGenerated += genResult.predictions.length;

        const futurePredictions = genResult.predictions.filter(p => p.isFuture === true);
        totalFuturePredictionsFound += futurePredictions.length;
        
        // Track prediction types for diagnostics
        futurePredictions.forEach(p => {
          const predType = p.prediction || 'UNKNOWN';
          predictionTypeCounts[predType] = (predictionTypeCounts[predType] || 0) + 1;
          
          // Collect sample predictions (up to 3 per symbol)
          if (samplePredictions.length < 15) {
            samplePredictions.push({
              symbol: analysis.symbol?.trim().toUpperCase() || 'UNKNOWN',
              prediction: predType,
              score: p.score || 0,
              confidence: p.confidence
            });
          }
        });
        
        if (futurePredictions.length === 0) continue;

        // Deterministically pick the Nth business-day-ahead prediction (the last one generated)
        const sortedFuture = [...futurePredictions].sort((a, b) => a.date.localeCompare(b.date));
        const targetPrediction = sortedFuture[sortedFuture.length - 1];

        // Apply filters to the selected day-ahead prediction
        // Note: We don't force HIGH_PROBABILITY anymore - show best predictions regardless of type
        const filtered = applyPredictionFilters([targetPrediction], effectiveFilters);
        totalPredictionsAfterFilter += filtered.length;
        
        if (filtered.length === 0) continue;

        results.push({
          symbol: analysis.symbol.trim().toUpperCase(),
          market: analysis.market ?? null,
          stockAnalysisId: analysis.id,
          prediction: targetPrediction
        });
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        warnings.push({
          stockAnalysisId: analysis.id,
          symbol: analysis.symbol?.trim().toUpperCase() || 'UNKNOWN',
          error: errorMessage
        });
      }
    }

    // Build a human-readable report (VN format) while preserving JSON output
    const scanAtIso = new Date().toISOString();
    const threshold = customThreshold ?? results[0]?.prediction?.threshold ?? DEFAULT_DAILY_SCORE_CONFIG.threshold;

    const sortedByScoreDesc = [...results].sort((a, b) => (b.prediction.score || 0) - (a.prediction.score || 0));
    const highList = sortedByScoreDesc.filter(r => r.prediction.prediction === 'HIGH_PROBABILITY');

    // Watchlist: next best candidates (not HIGH_PROBABILITY) above 70% of threshold
    const watchList = sortedByScoreDesc
      .filter(r => r.prediction.prediction !== 'HIGH_PROBABILITY')
      .filter(r => typeof r.prediction.score === 'number' && r.prediction.score >= threshold * 0.7);

    const report = buildVietnameseReport(
      scanAtIso,
      highList.map(x => ({ symbol: x.symbol, market: x.market, prediction: x.prediction })),
      watchList.map(x => ({ symbol: x.symbol, market: x.market, prediction: x.prediction })),
      {
        totalScanned: uniqueAnalyses.length,
        warningsCount: warnings.length,
        warnings: warnings.map(w => ({ symbol: w.symbol, error: w.error })),
        filters: {
          minScore: predictionFilters.minScore,
          minConfidence: predictionFilters.minConfidence,
          futureDays: dayAhead,
          daysLimit: daysLimit,
          threshold: customThreshold
        },
        stats: {
          predictionsGenerated: totalPredictionsGenerated,
          futurePredictionsFound: totalFuturePredictionsFound,
          predictionsAfterFilter: totalPredictionsAfterFilter,
          predictionTypeCounts,
          samplePredictions
        }
      }
    );

    // Optional: plain text output
    const formatParam = typeof req.query.format === 'string' ? req.query.format : undefined;
    if (formatParam === 'text') {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.status(200).send(report);
    }

    return res.json({
      data: {
        symbols: results,
        report,
        summary: {
          totalScanned: uniqueAnalyses.length,
          highProbabilityCount: results.length,
          scanDate: new Date().toISOString().split('T')[0]
        },
        ...(warnings.length > 0 ? { warnings } : {})
      }
    });
  } catch (error) {
    console.error("[Scan High Probability] Error:", error);
    return res.status(500).json({
      error: "Failed to scan high probability predictions",
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * @openapi
 * /api/stock-analyses/{id}:
 *   get:
 *     summary: Fetch a specific stock analysis with full data
 *     tags: [Stock Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Stock analysis ID
 *       - in: query
 *         name: excludeData
 *         schema:
 *           type: boolean
 *         description: Set to true to exclude daily factor data and scores
 *     responses:
 *       200:
 *         description: Stock analysis details
 *       400:
 *         description: Invalid stock analysis ID
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Stock analysis not found
 *       500:
 *         description: Server error
 */
// GET /api/stock-analyses/:id - Fetch a specific stock analysis
router.get('/:id', async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;
    const { excludeData } = req.query;

    // Validate id parameter
    if (!id || id === 'undefined' || id === 'null' || id === 'NaN') {
      return res.status(400).json({ error: "Invalid stock analysis ID" });
    }

    const numericId = Number(id);
    if (isNaN(numericId) || numericId <= 0 || !Number.isInteger(numericId)) {
      return res.status(400).json({ error: "Invalid stock analysis ID" });
    }

    const shouldIncludeData = excludeData !== 'true';

    const stockAnalysis = await prisma.stockAnalysis.findUnique({
      where: { id: numericId },
      include: {
        dailyFactorData: shouldIncludeData,
        dailyScores: shouldIncludeData,
        factorTables: true,
      },
    });

    if (!stockAnalysis) {
      return res.status(404).json({ error: "Stock analysis not found" });
    }

    // Attempt to get structured results from saved analysisResults first (for period-filtered data)
    let results;
    
    if (stockAnalysis.analysisResults) {
      try {
        // Parse saved analysisResults (contains period-filtered data if available)
        const savedResults = JSON.parse(stockAnalysis.analysisResults);
        
        // Check if this is period-filtered data by looking for periodInfo
        if (savedResults.periodInfo) {
          console.log(`[GET] Using saved period-filtered results for analysis ${stockAnalysis.id}:`, {
            periodId: savedResults.periodInfo.periodId,
            totalDays: savedResults.totalDays,
            actualDaysAnalyzed: savedResults.periodInfo.actualDaysAnalyzed
          });
          
          // Normalize transaction field names to match expected interface
          // Preserve all enriched fields (technical indicators, OHLC, volume, scores)
          if (savedResults.transactions && Array.isArray(savedResults.transactions)) {
            savedResults.transactions = savedResults.transactions.map((tx: any) => ({
              tx: tx.Tx || tx.tx,
              date: tx.Date || tx.date,
              close: tx.Close || tx.close,
              open: tx.Open || tx.open,
              high: tx.High || tx.high,
              low: tx.Low || tx.low,
              volume: tx.Volume || tx.volume,
              pctChange: tx.pct_change !== undefined ? tx.pct_change : tx.pctChange,
              factors: tx.factors || [],
              factorCount: tx.factorCount || 0,
              // Technical indicators
              ma20: tx.ma20 ?? tx.MA20,
              ma50: tx.ma50 ?? tx.MA50,
              ma200: tx.ma200 ?? tx.MA200,
              rsi: tx.rsi ?? tx.RSI,
              // Daily scores
              score: tx.score,
              aboveThreshold: tx.aboveThreshold
            }));
            
            // Ensure transactionsFound matches the actual transactions array length
            // This fixes cases where transactionsFound was 0 or incorrect in saved data
            savedResults.transactionsFound = savedResults.transactions.length;
            
            console.log(`[GET] Normalized ${savedResults.transactions.length} transactions from saved data`);
            console.log(`[GET] Updated transactionsFound to ${savedResults.transactionsFound}`);
            
            // Debug: Log first few normalized transactions
            console.log(`[GET] Sample normalized transactions (first 3):`);
            savedResults.transactions.slice(0, 3).forEach((tx: any, idx: number) => {
              console.log(`  Normalized ${idx}: tx=${tx.tx}, date="${tx.date}" (type: ${typeof tx.date}), close=${tx.close}`);
            });
          } else if (savedResults.transactionsFound === undefined || savedResults.transactionsFound === 0) {
            // If transactions array is missing but transactionsFound exists, set it to 0
            savedResults.transactionsFound = 0;
          }
          
          results = savedResults;
        } else {
          // Not period-filtered, but may still have saved results that need normalization
          // Normalize transactions if they exist
          if (savedResults.transactions && Array.isArray(savedResults.transactions)) {
            savedResults.transactions = savedResults.transactions.map((tx: any) => ({
              tx: tx.Tx || tx.tx,
              date: tx.Date || tx.date,
              close: tx.Close || tx.close,
              open: tx.Open || tx.open,
              high: tx.High || tx.high,
              low: tx.Low || tx.low,
              volume: tx.Volume || tx.volume,
              pctChange: tx.pct_change !== undefined ? tx.pct_change : tx.pctChange,
              factors: tx.factors || [],
              factorCount: tx.factorCount || 0,
              // Technical indicators
              ma20: tx.ma20 ?? tx.MA20,
              ma50: tx.ma50 ?? tx.MA50,
              ma200: tx.ma200 ?? tx.MA200,
              rsi: tx.rsi ?? tx.RSI,
              // Daily scores
              score: tx.score,
              aboveThreshold: tx.aboveThreshold
            }));
            
            // Ensure transactionsFound matches the actual transactions array length
            savedResults.transactionsFound = savedResults.transactions.length;
            
            console.log(`[GET] Normalized ${savedResults.transactions.length} transactions from saved data (no periodInfo)`);
            console.log(`[GET] Updated transactionsFound to ${savedResults.transactionsFound}`);
            
            results = savedResults;
          } else {
            // No transactions in saved results, use DB reconstruction for full data
            console.log(`[GET] Saved results not period-filtered and no transactions, using DB reconstruction`);
            results = await getAnalysisResultsFromDB(stockAnalysis.id);
          }
        }
      } catch (parseError) {
        console.error('[GET] Error parsing saved analysisResults:', parseError);
        // Fallback to DB reconstruction
        results = await getAnalysisResultsFromDB(stockAnalysis.id);
      }
    } else {
      // No saved results, use DB reconstruction
      results = await getAnalysisResultsFromDB(stockAnalysis.id);
    }

    return res.json({
      data: {
        stockAnalysis: {
          ...stockAnalysis,
          results
        }
      }
    });
  } catch (error) {
    console.error("Error fetching stock analysis:", error);
    return res.status(500).json({ error: "Failed to fetch stock analysis" });
  }
});

/**
 * Reconstruct CSV content from database dailyFactorData
 */
async function reconstructCsvFromDatabase(stockAnalysisId: number): Promise<string> {
  const dailyData = await prisma.dailyFactorData.findMany({
    where: { stockAnalysisId },
    orderBy: { date: 'asc' }
  });

  if (dailyData.length === 0) {
    throw new Error('No daily factor data found in database. Cannot reconstruct CSV.');
  }

  // Build CSV header
  const csvLines = ['Date,Open,High,Low,Close,Volume'];

  // Add data rows
  dailyData.forEach(record => {
    const date = record.date;
    const open = record.open ?? '';
    const high = record.high ?? '';
    const low = record.low ?? '';
    const close = record.close;
    const volume = record.volume ?? '';
    
    csvLines.push(`${date},${open},${high},${low},${close},${volume}`);
  });

  return csvLines.join('\n');
}

// POST /api/stock-analyses/:id/import - Import CSV data to DB
router.post('/:id/import', async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;
    const stockAnalysis = await prisma.stockAnalysis.findUnique({
      where: { id: Number(id) }
    });

    if (!stockAnalysis) {
      return res.status(404).json({ error: "Stock analysis not found" });
    }

    if (!stockAnalysis.csvFilePath) {
      return res.status(400).json({ error: "No CSV file path associated with this analysis" });
    }

    // Resolve the file path (handles relative/absolute paths)
    let resolvedPath: string;
    try {
      resolvedPath = resolveCsvFilePath(stockAnalysis.csvFilePath);
    } catch (error: any) {
      return res.status(404).json({ error: error.message || `CSV file not found at ${stockAnalysis.csvFilePath}` });
    }

    const csvContent = fs.readFileSync(resolvedPath, 'utf-8');

    // 1. Save raw data to database
    await saveFactorAnalysisToDatabase(
      stockAnalysis.id,
      csvContent
    );

    // 3. Update status
    const updatedAnalysis = await prisma.stockAnalysis.update({
      where: { id: stockAnalysis.id },
      data: { status: "completed" }
    });

    const results = await getAnalysisResultsFromDB(stockAnalysis.id);

    return res.json({
      success: true,
      message: "Data imported successfully",
      data: {
        stockAnalysis: {
          ...updatedAnalysis,
          results
        }
      }
    });
  } catch (error) {
    console.error("Error importing CSV data:", error);
    return res.status(500).json({ error: "Failed to import CSV data" });
  }
});

/**
 * @openapi
 * /api/stock-analyses/{id}/regenerate-factors:
 *   post:
 *     summary: Regenerate factors and technical indicators for existing stock analysis
 *     description: Recalculates all factors (volume_spike, break_ma50, etc.) and technical indicators (MA20, MA50, MA200, RSI) from existing data. Works with CSV file if available, otherwise reconstructs CSV from database.
 *     tags: [Stock Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Stock analysis ID
 *     responses:
 *       200:
 *         description: Factors regenerated successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Stock analysis not found or no data available
 *       500:
 *         description: Server error
 */
// POST /api/stock-analyses/:id/regenerate-factors - Regenerate factors from existing data
router.post('/:id/regenerate-factors', async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;
    const stockAnalysisId = Number(id);

    if (isNaN(stockAnalysisId) || stockAnalysisId <= 0) {
      return res.status(400).json({ error: "Invalid stock analysis ID" });
    }

    const stockAnalysis = await prisma.stockAnalysis.findUnique({
      where: { id: stockAnalysisId }
    });

    if (!stockAnalysis) {
      return res.status(404).json({ error: "Stock analysis not found" });
    }

    let csvContent: string;
    let csvSource: 'file' | 'database';

    // Try to get CSV from file first
    if (stockAnalysis.csvFilePath) {
      try {
        const resolvedPath = resolveCsvFilePath(stockAnalysis.csvFilePath);
        csvContent = fs.readFileSync(resolvedPath, 'utf-8');
        csvSource = 'file';
        console.log(`[Regenerate Factors] Using CSV file: ${resolvedPath}`);
      } catch (fileError: any) {
        console.warn(`[Regenerate Factors] CSV file not found, reconstructing from database: ${fileError.message}`);
        // Fall through to database reconstruction
        csvContent = await reconstructCsvFromDatabase(stockAnalysisId);
        csvSource = 'database';
      }
    } else {
      // No CSV file, reconstruct from database
      console.log(`[Regenerate Factors] No CSV file path, reconstructing from database`);
      csvContent = await reconstructCsvFromDatabase(stockAnalysisId);
      csvSource = 'database';
    }

    if (!csvContent || csvContent.trim().length === 0) {
      return res.status(404).json({ 
        error: "No data available",
        message: "Cannot regenerate factors: no CSV file or database data found"
      });
    }

    // Update status to processing
    await prisma.stockAnalysis.update({
      where: { id: stockAnalysisId },
      data: { status: "processing" }
    });

    // Regenerate factors using the updated saveFactorAnalysisToDatabase function
    await saveFactorAnalysisToDatabase(stockAnalysisId, csvContent);

    // Update status to completed
    const updatedAnalysis = await prisma.stockAnalysis.update({
      where: { id: stockAnalysisId },
      data: { status: "completed" }
    });

    const results = await getAnalysisResultsFromDB(stockAnalysisId);

    // Count how many records were updated
    const dailyFactorCount = await prisma.dailyFactorData.count({
      where: { stockAnalysisId }
    });

    return res.json({
      success: true,
      message: `Factors regenerated successfully from ${csvSource}`,
      data: {
        stockAnalysis: {
          ...updatedAnalysis,
          results
        },
        recordsProcessed: dailyFactorCount,
        csvSource
      }
    });
  } catch (error: any) {
    console.error("Error regenerating factors:", error);
    
    // Update status to factor_failed if analysis exists
    try {
      const { id } = req.params;
      const stockAnalysisId = Number(id);
      if (!isNaN(stockAnalysisId) && stockAnalysisId > 0) {
        await prisma.stockAnalysis.update({
          where: { id: stockAnalysisId },
          data: { status: "factor_failed" }
        });
      }
    } catch (updateError) {
      console.error("Error updating status to factor_failed:", updateError);
    }

    return res.status(500).json({ 
      error: "Failed to regenerate factors",
      message: error.message || "Unknown error occurred"
    });
  }
});

// POST /api/stock-analyses/:id/supplement - Upload CSV file to supplement existing analysis
router.post('/:id/supplement', upload.single('csvFile'), async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      if (req.file) fs.unlinkSync(req.file.path); // Clean up uploaded file
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;
    const stockAnalysis = await prisma.stockAnalysis.findUnique({
      where: { id: Number(id) }
    });

    if (!stockAnalysis) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: "Stock analysis not found" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No CSV file uploaded" });
    }

    // Ensure the file path is always absolute
    let csvFilePath: string;
    if (path.isAbsolute(req.file.path)) {
      csvFilePath = req.file.path;
    } else {
      csvFilePath = path.resolve(absoluteUploadsDir, req.file.path);
    }
    
    // Double-check: if still not absolute or doesn't exist, try using filename
    if (!path.isAbsolute(csvFilePath) || !fs.existsSync(csvFilePath)) {
      csvFilePath = path.resolve(absoluteUploadsDir, req.file.filename);
    }
    
    // Final check: ensure path is absolute
    csvFilePath = path.resolve(csvFilePath);
    
    if (!fs.existsSync(csvFilePath)) {
      console.error(`[Supplement] File not found at path: ${csvFilePath}`);
      console.error(`[Supplement] req.file.path: ${req.file.path}`);
      console.error(`[Supplement] req.file.filename: ${req.file.filename}`);
      return res.status(500).json({ 
        error: "File was not saved correctly",
        message: `File not found at: ${csvFilePath}`
      });
    }
    
    const csvContent = fs.readFileSync(csvFilePath, 'utf-8');

    // Save supplementary data to database (this will append/merge with existing data)
    await saveFactorAnalysisToDatabase(
      stockAnalysis.id,
      csvContent
    );

    // Update status to processing to indicate new data is being processed
    const updatedAnalysis = await prisma.stockAnalysis.update({
      where: { id: stockAnalysis.id },
      data: { 
        status: "processing",
        // Keep existing CSV file path, don't overwrite it
      }
    });

    const results = await getAnalysisResultsFromDB(stockAnalysis.id);

    return res.json({
      success: true,
      message: "Supplementary data uploaded and merged successfully",
      data: {
        stockAnalysis: {
          ...updatedAnalysis,
          results
        }
      }
    });
  } catch (error) {
    console.error("Error uploading supplementary CSV data:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    // Update status to failed if analysis exists
    try {
      const stockAnalysis = await prisma.stockAnalysis.findUnique({
        where: { id: Number(req.params.id) }
      });
      if (stockAnalysis) {
        await prisma.stockAnalysis.update({
          where: { id: stockAnalysis.id },
          data: { status: "factor_failed" }
        });
      }
    } catch (updateError) {
      console.error("Error updating status to failed:", updateError);
    }
    
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error("Error deleting uploaded file:", unlinkError);
      }
    }
    
    return res.status(500).json({ 
      error: "Failed to upload supplementary CSV data",
      message: errorMessage
    });
  }
});

// POST /api/stock-analyses/:id/upload - Upload CSV file and trigger analysis
router.post('/:id/upload', upload.single('csvFile'), async (req, res) => {
  try {
    console.log(`[Upload] Starting upload for analysis ID: ${req.params.id}`);
    console.log(`[Upload] File received:`, req.file ? {
      fieldname: req.file.fieldname,
      originalname: req.file.originalname,
      filename: req.file.filename,
      path: req.file.path,
      size: req.file.size
    } : 'No file');
    
    const user = await getCurrentUser(req);
    if (!user) {
      if (req.file) {
        const filePath = path.isAbsolute(req.file.path) ? req.file.path : path.resolve(absoluteUploadsDir, req.file.filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath); // Clean up uploaded file
        }
      }
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;
    const stockAnalysis = await prisma.stockAnalysis.findUnique({
      where: { id: Number(id) }
    });

    if (!stockAnalysis) {
      if (req.file) {
        const filePath = path.isAbsolute(req.file.path) ? req.file.path : path.resolve(uploadsDir, req.file.filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
      return res.status(404).json({ error: "Stock analysis not found" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No CSV file uploaded" });
    }

    // Ensure the file path is always absolute
    // Multer should provide absolute path, but handle both cases for safety
    let csvFilePath: string;
    if (path.isAbsolute(req.file.path)) {
      csvFilePath = req.file.path;
    } else {
      // If multer provided a relative path, resolve it against absoluteUploadsDir
      csvFilePath = path.resolve(absoluteUploadsDir, req.file.path);
    }
    
    // Double-check: if still not absolute or doesn't exist, try using filename
    if (!path.isAbsolute(csvFilePath) || !fs.existsSync(csvFilePath)) {
      csvFilePath = path.resolve(absoluteUploadsDir, req.file.filename);
    }
    
    // Final check: ensure path is absolute
    csvFilePath = path.resolve(csvFilePath);
    
    console.log(`[Upload] Original req.file.path: ${req.file.path}`);
    console.log(`[Upload] req.file.filename: ${req.file.filename}`);
    console.log(`[Upload] Resolved absolute file path: ${csvFilePath}`);
    console.log(`[Upload] uploadsDir: ${uploadsDir}`);
    console.log(`[Upload] process.cwd(): ${process.cwd()}`);
    console.log(`[Upload] File exists: ${fs.existsSync(csvFilePath)}`);
    
    // Verify file exists before reading
    if (!fs.existsSync(csvFilePath)) {
      console.error(`[Upload] File not found at path: ${csvFilePath}`);
      console.error(`[Upload] Attempted paths:`);
      console.error(`  - req.file.path: ${req.file.path}`);
      console.error(`  - absoluteUploadsDir + req.file.path: ${path.resolve(absoluteUploadsDir, req.file.path)}`);
      console.error(`  - absoluteUploadsDir + req.file.filename: ${path.resolve(absoluteUploadsDir, req.file.filename)}`);
      console.error(`[Upload] absoluteUploadsDir: ${absoluteUploadsDir}`);
      console.error(`[Upload] uploadsDir: ${uploadsDir}`);
      console.error(`[Upload] process.cwd(): ${process.cwd()}`);
      
      // List files in uploads directory for debugging
      try {
        const filesInUploads = fs.readdirSync(absoluteUploadsDir);
        console.error(`[Upload] Files in uploads directory:`, filesInUploads);
      } catch (dirError) {
        console.error(`[Upload] Error reading uploads directory:`, dirError);
      }
      
      return res.status(500).json({ 
        error: "File was not saved correctly",
        message: `File not found at: ${csvFilePath}. Please check server logs for details.`
      });
    }
    
    const csvContent = fs.readFileSync(csvFilePath, 'utf-8');

    // 1. Save raw data to database
    await saveFactorAnalysisToDatabase(
      stockAnalysis.id,
      csvContent
    );

    // 3. Update status and file path
    const updatedAnalysis = await prisma.stockAnalysis.update({
      where: { id: stockAnalysis.id },
      data: {
        status: "completed",
        csvFilePath: csvFilePath
      }
    });

    const results = await getAnalysisResultsFromDB(stockAnalysis.id);

    return res.json({
      success: true,
      message: "File uploaded and data imported successfully",
      data: {
        stockAnalysis: {
          ...updatedAnalysis,
          results
        }
      }
    });
  } catch (error) {
    console.error("Error uploading CSV and importing data:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    console.error("Error details:", {
      message: errorMessage,
      stack: errorStack,
      stockAnalysisId: req.params.id,
      fileName: req.file?.originalname,
      filePath: req.file?.path
    });
    
    // Update status to failed if analysis exists
    try {
      const stockAnalysis = await prisma.stockAnalysis.findUnique({
        where: { id: Number(req.params.id) }
      });
      if (stockAnalysis) {
        await prisma.stockAnalysis.update({
          where: { id: stockAnalysis.id },
          data: { status: "failed" }
        });
      }
    } catch (updateError) {
      console.error("Error updating status to failed:", updateError);
    }
    
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error("Error deleting uploaded file:", unlinkError);
      }
    }
    
    return res.status(500).json({ 
      error: "Failed to upload and import CSV data",
      message: errorMessage,
      details: process.env.NODE_ENV === 'development' ? errorStack : undefined
    });
  }
});

/**
 * @openapi
 * /api/stock-analyses/{id}/daily-factor-data:
 *   get:
 *     summary: Get daily factor data for stock analysis (paginated with filtering)
 *     tags: [Stock Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Stock analysis ID
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by date from (inclusive, ISO 8601 format YYYY-MM-DD)
 *         example: "2024-01-01"
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by date to (inclusive, ISO 8601 format YYYY-MM-DD)
 *         example: "2024-12-31"
 *       - in: query
 *         name: minClose
 *         schema:
 *           type: number
 *         description: Filter by minimum closing price
 *         example: 100
 *       - in: query
 *         name: maxClose
 *         schema:
 *           type: number
 *         description: Filter by maximum closing price
 *         example: 200
 *       - in: query
 *         name: minVolume
 *         schema:
 *           type: integer
 *         description: Filter by minimum volume
 *         example: 1000000
 *       - in: query
 *         name: maxVolume
 *         schema:
 *           type: integer
 *         description: Filter by maximum volume
 *         example: 5000000
 *       - in: query
 *         name: volume_spike
 *         schema:
 *           type: boolean
 *         description: Filter by volume spike flag
 *         example: true
 *       - in: query
 *         name: break_ma50
 *         schema:
 *           type: boolean
 *         description: Filter by MA50 break flag
 *         example: true
 *       - in: query
 *         name: break_ma200
 *         schema:
 *           type: boolean
 *         description: Filter by MA200 break flag
 *         example: true
 *       - in: query
 *         name: rsi_over_60
 *         schema:
 *           type: boolean
 *         description: Filter by RSI over 60 flag
 *         example: true
 *       - in: query
 *         name: market_up
 *         schema:
 *           type: boolean
 *         description: Filter by market up flag
 *         example: true
 *       - in: query
 *         name: sector_up
 *         schema:
 *           type: boolean
 *         description: Filter by sector up flag
 *         example: true
 *       - in: query
 *         name: earnings_window
 *         schema:
 *           type: boolean
 *         description: Filter by earnings window flag
 *         example: true
 *       - in: query
 *         name: short_covering
 *         schema:
 *           type: boolean
 *         description: Filter by short covering flag
 *         example: true
 *       - in: query
 *         name: macro_tailwind
 *         schema:
 *           type: boolean
 *         description: Filter by macro tailwind flag
 *         example: true
 *       - in: query
 *         name: news_positive
 *         schema:
 *           type: boolean
 *         description: Filter by positive news flag
 *         example: true
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
 *           maximum: 50000
 *         description: Items per page (max 50000, use 0 to fetch all)
 *     responses:
 *       200:
 *         description: A paginated list of daily factor data
 *       400:
 *         description: Invalid filter parameter
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Stock analysis not found
 *       500:
 *         description: Server error
 */
// GET /api/stock-analyses/:id/daily-factor-data
router.get('/:id/daily-factor-data', async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    const stockAnalysisId = Number(id);

    // Parse filters with error handling
    let filters;
    try {
      filters = parseDailyFactorFilters(req);
    } catch (filterError) {
      if (filterError instanceof FilterValidationError) {
        return res.status(400).json({
          error: "Invalid filter parameter",
          message: filterError.message,
          parameter: filterError.parameter,
          value: filterError.value
        });
      }
      throw filterError;
    }

    // Build where clause from filters
    const where = buildDailyFactorWhere(filters);
    where.stockAnalysisId = stockAnalysisId; // Always filter by stock analysis ID

    // Allow higher limits for daily-factor-data (up to 50000 records)
    // Use limit=0 or limit=all to fetch all records
    const paginationOptions = getPaginationOptions(req, 50000);

    // Fetch data from database with filters applied
    const [data, total] = await Promise.all([
      prisma.dailyFactorData.findMany({
        where,
        orderBy: { date: 'asc' },
        skip: paginationOptions.limit > 0 ? paginationOptions.skip : undefined,
        take: paginationOptions.limit > 0 ? paginationOptions.limit : undefined,
      }),
      prisma.dailyFactorData.count({ where }),
    ]);

    // Transform to match expected format
    const enrichedData = data.map(d => ({
      Date: d.date,
      Close: d.close,
      Open: d.open,
      High: d.high,
      Low: d.low,
      Volume: d.volume,
      pct_change: d.pctChange,
      MA20: d.ma20,
      MA50: d.ma50,
      MA200: d.ma200,
      RSI: d.rsi,
      volume_spike: d.volumeSpike,
      break_ma50: d.breakMa50,
      break_ma200: d.breakMa200,
      rsi_over_60: d.rsiOver60,
      market_up: d.marketUp,
      sector_up: d.sectorUp,
      earnings_window: d.earningsWindow,
      short_covering: d.shortCovering,
      macro_tailwind: d.macroTailwind,
      news_positive: d.newsPositive,
    }));

    return res.json({
      data: formatPaginatedResponse(enrichedData, total, paginationOptions)
    });
  } catch (error) {
    console.error("Error fetching daily factor data:", error);
    return res.status(500).json({ error: "Failed to fetch daily factor data" });
  }
});

/**
 * @openapi
 * /api/stock-analyses/{id}/daily-scores:
 *   get:
 *     summary: Get daily scoring data for stock analysis (paginated, sorted, with filtering)
 *     tags: [Stock Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Stock analysis ID
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by date from (inclusive, ISO 8601 format YYYY-MM-DD)
 *         example: "2024-01-01"
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by date to (inclusive, ISO 8601 format YYYY-MM-DD)
 *         example: "2024-12-31"
 *       - in: query
 *         name: minScore
 *         schema:
 *           type: number
 *           minimum: 0
 *           maximum: 100
 *         description: Filter by minimum score (0-100)
 *         example: 50
 *       - in: query
 *         name: maxScore
 *         schema:
 *           type: number
 *           minimum: 0
 *           maximum: 100
 *         description: Filter by maximum score (0-100)
 *         example: 80
 *       - in: query
 *         name: prediction
 *         schema:
 *           type: string
 *           enum: [HIGH_PROBABILITY, MODERATE, LOW_PROBABILITY]
 *         description: Filter by prediction level
 *         example: HIGH_PROBABILITY
 *       - in: query
 *         name: aboveThreshold
 *         schema:
 *           type: boolean
 *         description: Filter by threshold status
 *         example: true
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
 *         description: Items per page
 *       - in: query
 *         name: orderBy
 *         schema:
 *           type: string
 *           enum: [date, score]
 *           default: date
 *         description: Sort field
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order
 *     responses:
 *       200:
 *         description: A paginated list of daily scores
 *       400:
 *         description: Invalid filter parameter
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Stock analysis not found
 *       500:
 *         description: Server error
 */
// GET /api/stock-analyses/:id/daily-scores
router.get('/:id/daily-scores', async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    const { orderBy = 'date', order = 'desc', threshold } = req.query;

    // Parse threshold if provided
    let scoreConfig = undefined;
    if (threshold !== undefined) {
      const thresholdValue = parseFloat(String(threshold));
      if (isNaN(thresholdValue) || thresholdValue < 0 || thresholdValue > 1) {
        return res.status(400).json({
          error: "Invalid threshold parameter",
          message: "Threshold must be a number between 0 and 1"
        });
      }
      // Import DEFAULT_DAILY_SCORE_CONFIG to merge with custom threshold
      const { DEFAULT_DAILY_SCORE_CONFIG } = await import('../lib/stock-factors');
      scoreConfig = {
        ...DEFAULT_DAILY_SCORE_CONFIG,
        threshold: thresholdValue
      };
    }

    // Parse filters with error handling
    let filters;
    try {
      filters = parseDailyScoreFilters(req);
    } catch (filterError) {
      if (filterError instanceof FilterValidationError) {
        return res.status(400).json({
          error: "Invalid filter parameter",
          message: filterError.message,
          parameter: filterError.parameter,
          value: filterError.value
        });
      }
      throw filterError;
    }

    // Fetch ALL scores first (without pagination) to filter and sort properly
    const allScores = await calculateScoresOnDemand(Number(id), {
      skip: 0,
      limit: 0, // 0 means fetch all
      scoreConfig: scoreConfig
    });

    // Apply filters (in-memory)
    const filteredScores = applyDailyScoreFilters(allScores, filters);

    // Sort ALL filtered scores based on orderBy and order parameters
    let sortedScores = [...filteredScores];
    if (orderBy === 'date') {
      sortedScores.sort((a, b) => {
        // Parse date string (YYYY-MM-DD format) into Year/Month/Day components
        const parseDate = (dateStr: string): [number, number, number] => {
          // Handle ISO date string (YYYY-MM-DD format)
          // Dates are stored as YYYY-MM-DD in the database
          if (dateStr.includes('-')) {
            const parts = dateStr.split('-');
            if (parts.length >= 3) {
              const year = parseInt(parts[0], 10);
              const month = parseInt(parts[1], 10);
              const day = parseInt(parts[2], 10);
              return [year, month, day];
            }
          }
          // Handle MM/DD/YYYY format if needed
          if (dateStr.includes('/')) {
            const parts = dateStr.split('/');
            if (parts.length >= 3) {
              // Assume MM/DD/YYYY format
              const month = parseInt(parts[0], 10);
              const day = parseInt(parts[1], 10);
              const year = parseInt(parts[2], 10);
              return [year, month, day];
            }
          }
          // Fallback to Date parsing if format is unexpected
          const date = new Date(dateStr);
          return [date.getFullYear(), date.getMonth() + 1, date.getDate()];
        };

        const [yearA, monthA, dayA] = parseDate(a.date);
        const [yearB, monthB, dayB] = parseDate(b.date);

        // Compare Year first, then Month, then Day
        if (yearA !== yearB) {
          return order === 'desc' ? yearB - yearA : yearA - yearB;
        }
        if (monthA !== monthB) {
          return order === 'desc' ? monthB - monthA : monthA - monthB;
        }
        return order === 'desc' ? dayB - dayA : dayA - dayB;
      });
    } else if (orderBy === 'score') {
      sortedScores.sort((a, b) => {
        return order === 'desc' ? b.score - a.score : a.score - b.score;
      });
    }

    // Now apply pagination to the sorted, filtered results
    const paginationOptions = getPaginationOptions(req);
    const total = sortedScores.length;
    const paginatedScores = paginationOptions.limit > 0
      ? sortedScores.slice(paginationOptions.skip, paginationOptions.skip + paginationOptions.limit)
      : sortedScores;

    return res.json({
      data: formatPaginatedResponse(paginatedScores, total, paginationOptions)
    });
  } catch (error) {
    console.error("Error fetching daily scores:", error);
    return res.status(500).json({ error: "Failed to fetch daily scores" });
  }
});


// POST /api/stock-analyses/:id/fetch-historical - Fetch historical data from API
router.post('/:id/fetch-historical', async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    const stockAnalysisId = Number(id);
    const { period1, period2, interval = '1d' } = req.body;

    // Get stock analysis to get symbol and market
    const stockAnalysis = await prisma.stockAnalysis.findUnique({
      where: { id: stockAnalysisId }
    });

    if (!stockAnalysis) {
      return res.status(404).json({ error: "Stock analysis not found" });
    }

    if (!stockAnalysis.symbol) {
      return res.status(400).json({ error: "Stock symbol is required" });
    }

    // Import stock price service
    const { stockPriceService } = await import('../lib/stock-price-service');
    const market = (stockAnalysis.market as 'US' | 'VN') || 'US';

    // Fetch historical data
    // US stocks: Yahoo Finance
    // Vietnamese stocks: CafeF API
    let historicalData;
    try {
      historicalData = await stockPriceService.getHistoricalData(
        stockAnalysis.symbol,
        market,
        { period1, period2, interval }
      );
    } catch (error: any) {
      // If VN market fails, provide helpful error message
      if (market === 'VN') {
        return res.status(400).json({ 
          error: `Failed to fetch historical data for Vietnamese stock ${stockAnalysis.symbol}. ${error.message}. Please use CSV upload for Vietnamese stocks - it's more reliable.` 
        });
      }
      throw error;
    }

    if (historicalData.length === 0) {
      return res.status(404).json({ error: "No historical data found" });
    }

    // Convert to CSV format
    const csvContent = stockPriceService.historicalDataToCSV(historicalData);

    // Save to database (same as CSV upload flow)
    await saveFactorAnalysisToDatabase(stockAnalysisId, csvContent);

    // Update status
    const updatedAnalysis = await prisma.stockAnalysis.update({
      where: { id: stockAnalysisId },
      data: {
        status: "completed",
        csvFilePath: null // No file path since it's from API
      }
    });

    const results = await getAnalysisResultsFromDB(stockAnalysisId);

    return res.json({
      success: true,
      message: `Fetched ${historicalData.length} days of historical data from API`,
      data: {
        stockAnalysis: {
          ...updatedAnalysis,
          results
        },
        dataPoints: historicalData.length,
        dateRange: {
          start: historicalData[0].date,
          end: historicalData[historicalData.length - 1].date
        }
      }
    });
  } catch (error: any) {
    console.error("Error fetching historical data:", error);
    return res.status(500).json({ 
      error: error.message || "Failed to fetch historical data from API" 
    });
  }
});

// POST /api/stock-analyses/:id/fetch-vnstock-csv - Fetch CSV data from vnstock API
router.post('/:id/fetch-vnstock-csv', async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    const stockAnalysisId = Number(id);
    const { start_date, end_date, source = 'vci', interval = 'D' } = req.body;

    // Get stock analysis to get symbol and market
    const stockAnalysis = await prisma.stockAnalysis.findUnique({
      where: { id: stockAnalysisId }
    });

    if (!stockAnalysis) {
      return res.status(404).json({ error: "Stock analysis not found" });
    }

    if (!stockAnalysis.symbol) {
      return res.status(400).json({ error: "Stock symbol is required" });
    }

    if (stockAnalysis.market !== 'VN') {
      return res.status(400).json({ error: "This endpoint is only for Vietnamese stocks (VN market)" });
    }

    // Import vnstock client
    const { getVnstockClient } = await import('../lib/vnstock-client');
    const vnstockClient = getVnstockClient();

    if (!vnstockClient) {
      return res.status(503).json({ 
        error: "Vnstock API is not configured. Please set VNSTOCK_API_URL environment variable." 
      });
    }

    // Calculate default dates if not provided
    const endDate = end_date || new Date().toISOString().split('T')[0];
    const startDate = start_date || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Fetch CSV data from vnstock
    // Trim and uppercase symbol to ensure it passes validation
    const cleanSymbol = stockAnalysis.symbol.trim().toUpperCase();
    const csvContent = await vnstockClient.downloadCSV({
      symbol: cleanSymbol,
      start_date: startDate,
      end_date: endDate,
      source,
      interval,
    });

    if (!csvContent || csvContent.trim().length === 0) {
      return res.status(404).json({ error: "No CSV data returned from vnstock API" });
    }

    // Save to database (same as CSV upload flow)
    await saveFactorAnalysisToDatabase(stockAnalysisId, csvContent);

    // Update status
    const updatedAnalysis = await prisma.stockAnalysis.update({
      where: { id: stockAnalysisId },
      data: {
        status: "completed",
        csvFilePath: null // No file path since it's from API
      }
    });

    const results = await getAnalysisResultsFromDB(stockAnalysisId);

    // Count data points from CSV
    const dataPointCount = csvContent.split('\n').length - 1; // Subtract header

    return res.json({
      success: true,
      message: `Fetched CSV data from vnstock API for ${stockAnalysis.symbol}`,
      data: {
        stockAnalysis: {
          ...updatedAnalysis,
          results
        },
        dataPoints: dataPointCount,
        dateRange: {
          start: startDate,
          end: endDate
        },
        source: 'vnstock'
      }
    });
  } catch (error: any) {
    console.error("Error fetching CSV from vnstock:", error);
    return res.status(500).json({ 
      error: error.message || "Failed to fetch CSV data from vnstock API" 
    });
  }
});

/**
 * @openapi
 * /api/stock-analyses/by-symbol/{symbol}/predictions:
 *   get:
 *     summary: Get current market predictions by stock symbol/ticker (with filtering)
 *     tags: [Stock Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: symbol
 *         required: true
 *         schema:
 *           type: string
 *         description: Stock symbol/ticker (e.g., AAPL, SNAP, VIC)
 *         example: AAPL
 *       - in: query
 *         name: market
 *         schema:
 *           type: string
 *           enum: [US, VN]
 *         description: Market identifier to filter by (optional, helps disambiguate symbols)
 *         example: US
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by date from (inclusive, ISO 8601 format YYYY-MM-DD)
 *         example: "2024-01-01"
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by date to (inclusive, ISO 8601 format YYYY-MM-DD)
 *         example: "2024-12-31"
 *       - in: query
 *         name: minScore
 *         schema:
 *           type: number
 *           minimum: 0
 *           maximum: 100
 *         description: Filter by minimum score (0-100)
 *         example: 50
 *       - in: query
 *         name: maxScore
 *         schema:
 *           type: number
 *           minimum: 0
 *           maximum: 100
 *         description: Filter by maximum score (0-100)
 *         example: 80
 *       - in: query
 *         name: prediction
 *         schema:
 *           type: string
 *           enum: [HIGH_PROBABILITY, MODERATE, LOW_PROBABILITY]
 *         description: Filter by prediction level
 *         example: HIGH_PROBABILITY
 *       - in: query
 *         name: minConfidence
 *         schema:
 *           type: number
 *           minimum: 0
 *           maximum: 1
 *         description: Filter by minimum confidence (0-100, percentage)
 *         example: 70
 *       - in: query
 *         name: maxConfidence
 *         schema:
 *           type: number
 *           minimum: 0
 *           maximum: 100
 *         description: Filter by maximum confidence (0-100, percentage)
 *         example: 0.9
 *       - in: query
 *         name: orderBy
 *         schema:
 *           type: string
 *           enum: [date, score, confidence, prediction]
 *           default: date
 *         description: Sort field
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 5
 *         description: "Number of recent days to use for generating predictions (default: 5)"
 *         example: 10
 *       - in: query
 *         name: futureDays
 *         schema:
 *           type: integer
 *           minimum: 0
 *           maximum: 30
 *           default: 0
 *         description: "Number of future days to generate predictions for (default: 0, max: 30). Uses most recent factor data as baseline."
 *         example: 7
 *     responses:
 *       200:
 *         description: A list of predictions
 *       400:
 *         description: Invalid filter parameter or symbol not found
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Stock analysis not found for the given symbol
 *       500:
 *         description: Server error
 */
// GET /api/stock-analyses/by-symbol/:symbol/predictions - Get predictions by symbol
router.get('/by-symbol/:symbol/predictions', async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { symbol } = req.params;
    const { market } = req.query;

    if (!symbol || symbol.trim() === '') {
      return res.status(400).json({ error: "Symbol is required" });
    }

    // Parse and validate parameters
    let params;
    try {
      params = parsePredictionParams(req);
    } catch (paramError) {
      if (paramError instanceof FilterValidationError) {
        return res.status(400).json({
          error: "Invalid parameter",
          message: paramError.message,
          parameter: paramError.parameter,
          value: paramError.value
        });
      }
      if (paramError instanceof Error && paramError.message.includes('Days must be')) {
        return res.status(400).json({
          error: "Invalid days parameter",
          message: paramError.message
        });
      }
      if (paramError instanceof Error && paramError.message.includes('Future days must be')) {
        return res.status(400).json({
          error: "Invalid futureDays parameter",
          message: paramError.message
        });
      }
      throw paramError;
    }

    // Find stock analysis by symbol (optionally filtered by market)
    const whereClause: any = {
      symbol: symbol.trim().toUpperCase()
    };

    if (market && (market === 'US' || market === 'VN')) {
      whereClause.market = market;
    }

    // Get the latest stock analysis for this symbol
    const stockAnalysis = await prisma.stockAnalysis.findFirst({
      where: whereClause,
      orderBy: { updatedAt: 'desc' }
    });

    if (!stockAnalysis) {
      return res.status(404).json({ 
        error: "Stock analysis not found",
        message: `No stock analysis found for symbol "${symbol}"${market ? ` in market "${market}"` : ''}. Please create a stock analysis first.`
      });
    }

    // Generate predictions using shared function
    const result = await generatePredictionsForAnalysis(
      stockAnalysis.id,
      params.daysLimit,
      params.filters,
      params.orderBy,
      params.order,
      { 
        enableLogging: false,
        futureDays: params.futureDays || 0,
        includeFeedback: true,
        userId: Number(user.id)
      }
    );

    // Return response with symbol and analysisId
    return res.json({
      data: {
        predictions: result.predictions,
        symbol: stockAnalysis.symbol,
        analysisId: stockAnalysis.id,
        ...(result.errors && result.errors.length > 0 && { warnings: result.errors })
      }
    });
  } catch (error) {
    console.error("Error generating predictions by symbol:", error);
    return res.status(500).json({ 
      error: "Failed to generate predictions",
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * @openapi
 * /api/stock-analyses/{id}/predictions:
 *   get:
 *     summary: Get current market predictions based on recent factor data (with filtering)
 *     tags: [Stock Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Stock analysis ID
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by date from (inclusive, ISO 8601 format YYYY-MM-DD)
 *         example: "2024-01-01"
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by date to (inclusive, ISO 8601 format YYYY-MM-DD)
 *         example: "2024-12-31"
 *       - in: query
 *         name: minScore
 *         schema:
 *           type: number
 *           minimum: 0
 *           maximum: 100
 *         description: Filter by minimum score (0-100)
 *         example: 50
 *       - in: query
 *         name: maxScore
 *         schema:
 *           type: number
 *           minimum: 0
 *           maximum: 100
 *         description: Filter by maximum score (0-100)
 *         example: 80
 *       - in: query
 *         name: prediction
 *         schema:
 *           type: string
 *           enum: [HIGH_PROBABILITY, MODERATE, LOW_PROBABILITY]
 *         description: Filter by prediction level
 *         example: HIGH_PROBABILITY
 *       - in: query
 *         name: minConfidence
 *         schema:
 *           type: number
 *           minimum: 0
 *           maximum: 1
 *         description: Filter by minimum confidence (0-100, percentage)
 *         example: 70
 *       - in: query
 *         name: maxConfidence
 *         schema:
 *           type: number
 *           minimum: 0
 *           maximum: 100
 *         description: Filter by maximum confidence (0-100, percentage)
 *         example: 0.9
 *       - in: query
 *         name: orderBy
 *         schema:
 *           type: string
 *           enum: [date, score, confidence, prediction]
 *           default: date
 *         description: Sort field
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 5
 *         description: "Number of recent days to use for generating predictions (default: 5)"
 *         example: 10
 *       - in: query
 *         name: futureDays
 *         schema:
 *           type: integer
 *           minimum: 0
 *           maximum: 30
 *           default: 0
 *         description: "Number of future days to generate predictions for (default: 0, max: 30). Uses most recent factor data as baseline."
 *         example: 7
 *     responses:
 *       200:
 *         description: A list of predictions
 *       400:
 *         description: Invalid filter parameter
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Stock analysis not found
 *       500:
 *         description: Server error
 */
// GET /api/stock-analyses/:id/predictions - Get current market predictions
router.get('/:id/predictions', async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    const stockAnalysisId = Number(id);
    
    console.log(`[Predictions] Request for stock analysis ID: ${stockAnalysisId}`);

    // Parse and validate parameters
    let params;
    try {
      params = parsePredictionParams(req);
      console.log(`[Predictions] Parsed params: days=${params.daysLimit}, orderBy=${params.orderBy}, order=${params.order}`);
    } catch (paramError) {
      if (paramError instanceof FilterValidationError) {
        return res.status(400).json({
          error: "Invalid filter parameter",
          message: paramError.message,
          parameter: paramError.parameter,
          value: paramError.value
        });
      }
      if (paramError instanceof Error && paramError.message.includes('Days must be')) {
        return res.status(400).json({
          error: "Invalid days parameter",
          message: paramError.message
        });
      }
      if (paramError instanceof Error && paramError.message.includes('Future days must be')) {
        return res.status(400).json({
          error: "Invalid futureDays parameter",
          message: paramError.message
        });
      }
      throw paramError;
    }

    // Generate predictions using shared function
    const result = await generatePredictionsForAnalysis(
      stockAnalysisId,
      params.daysLimit,
      params.filters,
      params.orderBy,
      params.order,
      { 
        enableLogging: true,
        futureDays: params.futureDays || 0,
        includeFeedback: true,
        userId: Number(user.id)
      }
    );

    // Handle case where no predictions were generated
    if (result.predictions.length === 0 && result.errors && result.errors.length > 0) {
      const errorMessage = result.errors[0].error;
      if (errorMessage.includes('No factor data available')) {
        return res.json({
          data: {
            predictions: [],
            message: errorMessage
          }
        });
      }
    }

    console.log(`[Predictions] Returning ${result.predictions.length} predictions`);
    if (result.predictions.length > 0) {
      console.log(`[Predictions] Sample prediction:`, {
        date: result.predictions[0].date,
        score: result.predictions[0].score,
        prediction: result.predictions[0].prediction
      });
    }

    return res.json({
      data: {
        predictions: result.predictions,
        ...(result.errors && result.errors.length > 0 && { warnings: result.errors })
      }
    });
  } catch (error) {
    console.error("[Predictions] Error generating predictions:", error);
    console.error("[Predictions] Error stack:", error instanceof Error ? error.stack : 'No stack');
    
    // Handle specific error cases
    if (error instanceof Error && error.message.includes('Stock analysis not found')) {
      return res.status(404).json({ 
        error: "Stock analysis not found",
        message: error.message
      });
    }
    
    return res.status(500).json({ 
      error: "Failed to generate predictions",
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

// POST /api/stock-analyses/:id/analyze - Trigger full analysis (pricing + AI)
router.post('/:id/analyze', async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    const { startDate, endDate, periodId } = req.body; // Accept optional period parameters

    // Dynamically import to avoid circular dependencies if any
    const { StockAnalysisService } = await import('../lib/services/stock-analysis-service');

    // Run analysis with optional period parameters
    const result = await StockAnalysisService.performFullAnalysis(Number(id), {
      startDate,
      endDate,
      periodId
    });

    return res.json({
      success: true,
      message: startDate && endDate 
        ? `Analysis completed for period: ${startDate} to ${endDate}`
        : "Analysis completed successfully",
      data: result
    });
  } catch (error) {
    console.error("Error performing full analysis:", error);
    // Handle specific app errors if they exist
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to perform analysis" });
  }
});

// POST /api/stock-analyses/:id/regenerate-with-period - Regenerate analysis with specific period
router.post('/:id/regenerate-with-period', async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;
    const { startDate, endDate, periodId } = req.body;

    // Validate inputs
    if (!startDate || !endDate) {
      return res.status(400).json({ error: "Start date and end date are required" });
    }

    if (!periodId) {
      return res.status(400).json({ error: "Period ID is required" });
    }

    // Validate date format and range
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: "Invalid date format" });
    }

    if (start >= end) {
      return res.status(400).json({ error: "Start date must be before end date" });
    }

    const numericId = Number(id);
    if (isNaN(numericId) || numericId <= 0) {
      return res.status(400).json({ error: "Invalid stock analysis ID" });
    }

    // Find the stock analysis
    const stockAnalysis = await prisma.stockAnalysis.findUnique({
      where: { id: numericId }
    });

    if (!stockAnalysis) {
      return res.status(404).json({ error: "Stock analysis not found" });
    }

    // Update status to processing
    await prisma.stockAnalysis.update({
      where: { id: numericId },
      data: { status: "processing" }
    });

    // Get data from database (API-fetched data) - prioritize this over CSV files
    let transactions: any[] = [];
    
    try {
      console.log('[PERIOD DEBUG] Attempting to import calculateFactorsOnDemand...');
      const { calculateFactorsOnDemand } = await import('../lib/services/stock-factor-service');
      console.log('[PERIOD DEBUG] Successfully imported calculateFactorsOnDemand');
      
      console.log('[PERIOD DEBUG] Calling calculateFactorsOnDemand for analysis ID:', numericId);
      const factorData = await calculateFactorsOnDemand(numericId, { skip: 0, limit: 0 });
      console.log('[PERIOD DEBUG] calculateFactorsOnDemand returned', factorData.length, 'records');
      
      if (factorData.length === 0) {
        console.log('[PERIOD DEBUG] No factor data returned from calculateFactorsOnDemand');
      } else {
        console.log('[PERIOD DEBUG] Sample factor data:');
        factorData.slice(0, 3).forEach(row => {
          console.log(`  ${row.Date}: Close=${row.Close}, pct_change=${row.pct_change}`);
        });
      }
      
      // Convert factor data to transaction format and apply date range filter
      transactions = factorData
        .filter(row => row.Date && row.Close && !isNaN(row.Close))
        .filter(row => {
          // Apply date range filter first
          const txDate = new Date(row.Date);
          return txDate >= start && txDate <= end;
        })
        .map((row, index) => ({
          Tx: index + 1,
          Date: row.Date,
          Close: row.Close,
          pct_change: row.pct_change || 0
        })); // For period analysis, include ALL days, not just significant movements
        
      console.log('[PERIOD DEBUG] After filtering, transactions count:', transactions.length);
      
    } catch (dbError) {
      console.error('[PERIOD DEBUG] Error in database path:', dbError instanceof Error ? dbError.message : String(dbError));
      console.error('[PERIOD DEBUG] Stack:', dbError instanceof Error ? dbError.stack : 'No stack available');
      
      // Fallback: implement the logic directly if import fails
      console.log('[PERIOD DEBUG] Using fallback direct database implementation...');
      
      try {
        // Get raw data from database
        const rawData = await prisma.dailyFactorData.findMany({
          where: { stockAnalysisId: numericId },
          orderBy: { date: 'asc' }
        });
        
        console.log('[PERIOD DEBUG] Raw data count:', rawData.length);
        
        if (rawData.length === 0) {
          throw new Error('No raw data found in database');
        }
        
        // Convert to ExtendedStockData format
        const stockData = rawData.map(d => ({
          Date: d.date,
          Close: d.close,
          Open: d.open || undefined,
          High: d.high || undefined,
          Low: d.low || undefined,
          Volume: d.volume || undefined
        }));
        
        // Calculate percentage changes
        const dataWithPct = stockData.map((row, index) => {
          if (index === 0) {
            return { ...row, pct_change: 0 };
          }
          const prevClose = stockData[index - 1].Close;
          const pctChange = ((row.Close - prevClose) / prevClose) * 100;
          return { ...row, pct_change: pctChange };
        });
        
        console.log('[PERIOD DEBUG] Calculated pct_change for', dataWithPct.length, 'records');
        
        // Apply date range filter
        transactions = dataWithPct
          .filter(row => row.Date && row.Close && !isNaN(row.Close))
          .filter(row => {
            const txDate = new Date(row.Date);
            return txDate >= start && txDate <= end;
          })
          .map((row, index) => ({
            Tx: index + 1,
            Date: row.Date,
            Close: row.Close,
            pct_change: row.pct_change || 0
          }));
          
        console.log('[PERIOD DEBUG] Fallback implementation found', transactions.length, 'transactions');
        
      } catch (fallbackError) {
        console.error('[PERIOD DEBUG] Fallback implementation failed:', fallbackError instanceof Error ? fallbackError.message : String(fallbackError));
        throw fallbackError;
      }
      
      // Only fall back to CSV if database fails
      if (stockAnalysis.csvFilePath) {
        try {
          const { getAllStockData } = await import('../lib/data-analysis');
          const allTransactions = getAllStockData(stockAnalysis.csvFilePath);
          
          // For period analysis, filter by date range but include ALL days (not just significant movements)
          transactions = allTransactions.filter((tx: any) => {
            const txDate = new Date(tx.Date);
            return txDate >= start && txDate <= end;
          });
        } catch (fileError) {
          console.error("Error reading CSV file:", fileError);
          return res.status(400).json({ 
            error: "No data available",
            message: "Unable to retrieve stock data from database or CSV file. Please re-upload the CSV file or fetch fresh data."
          });
        }
      } else {
        return res.status(400).json({ 
          error: "No data available",
          message: "Unable to retrieve stock data for analysis. Please re-upload the CSV file or fetch fresh data."
        });
      }
    }
    
    // At this point, transactions are already filtered by date range
    if (transactions.length === 0) {
      await prisma.stockAnalysis.update({
        where: { id: numericId },
        data: { status: "completed" }
      });
      
      return res.status(400).json({ 
        error: "No data found in selected period",
        message: "The selected date range contains no trading days. Please check the date range and ensure it overlaps with your stock data."
      });
    }

    // Create analysis results
    const analysisResults = {
      totalDays: transactions.length,
      transactionsFound: transactions.length,
      minPctChange: stockAnalysis.minPctChange || 4,
      transactions: transactions,
      factorAnalysis: {
        summary: {
          factorCounts: {} as Record<string, number>,
          averageFactorsPerDay: 0,
          totalDays: transactions.length
        },
        correlation: {} // Could be calculated if needed
      },
      periodInfo: {
        startDate,
        endDate,
        periodId,
        actualDaysAnalyzed: transactions.length
      }
    };

    // Save results to database
    await prisma.stockAnalysis.update({
      where: { id: numericId },
      data: {
        status: "completed",
        analysisResults: JSON.stringify(analysisResults)
      }
    });

    return res.json({
      success: true,
      message: `Analysis regenerated for period: ${startDate} to ${endDate}`,
      data: {
        stockAnalysis: {
          ...stockAnalysis,
          status: "completed",
          results: analysisResults
        },
        periodInfo: {
          startDate,
          endDate,
          periodId,
          actualDaysAnalyzed: transactions.length
        }
      }
    });

  } catch (error) {
    console.error("Error regenerating analysis with period:", error);
    
    // Update status to failed
    try {
      await prisma.stockAnalysis.update({
        where: { id: Number(req.params.id) },
        data: { status: "failed" }
      });
    } catch (updateError) {
      console.error("Error updating status to failed:", updateError);
    }
    
    return res.status(500).json({ 
      error: "Failed to regenerate analysis with period",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

// POST /api/stock-analyses/bulk-update-min-pct-change - Bulk update minPctChange for multiple analyses
router.post('/bulk-update-min-pct-change', async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Validate and parse input
    let input;
    try {
      input = validateInput(stockAnalysisBulkMinPctChangeSchema, req.body);
    } catch (error: any) {
      return res.status(400).json({
        error: "Invalid input",
        message: error?.message || 'Validation failed'
      });
    }

    const symbols = input.symbols.map((s) => s.toUpperCase());
    const targetMinPctChange = typeof input.minPctChange === 'number' ? input.minPctChange : 3.0;
    const shouldRegenerate = input.regenerate === true;

    const analyses = await prisma.stockAnalysis.findMany({
      where: { symbol: { in: symbols } },
      select: {
        id: true,
        symbol: true,
        name: true,
        minPctChange: true,
        csvFilePath: true,
      },
    });

    if (analyses.length === 0) {
      return res.status(404).json({
        error: "No stock analyses found for provided symbols",
        symbols,
      });
    }

    let updatedCount = 0;
    let skippedCount = 0;
    let regeneratedCount = 0;

    for (const analysis of analyses) {
      const needsUpdate = analysis.minPctChange !== targetMinPctChange;
      
      if (!needsUpdate && !shouldRegenerate) {
        skippedCount++;
        continue;
      }

      // Update minPctChange if needed
      if (needsUpdate) {
        await prisma.stockAnalysis.update({
          where: { id: analysis.id },
          data: { minPctChange: targetMinPctChange },
        });
        updatedCount++;
      }

      // Regenerate factors if requested
      if (shouldRegenerate) {
        try {
          let csvContent: string;
          
          // Try to get CSV from file first
          if (analysis.csvFilePath) {
            try {
              const resolvedPath = resolveCsvFilePath(analysis.csvFilePath);
              csvContent = fs.readFileSync(resolvedPath, 'utf-8');
            } catch (fileError: any) {
              console.warn(`[Bulk Update] CSV file not found for ${analysis.symbol}, reconstructing from database`);
              csvContent = await reconstructCsvFromDatabase(analysis.id);
            }
          } else {
            csvContent = await reconstructCsvFromDatabase(analysis.id);
          }

          if (csvContent && csvContent.trim().length > 0) {
            await saveFactorAnalysisToDatabase(analysis.id, csvContent);
            regeneratedCount++;
          } else {
            console.warn(`[Bulk Update] No CSV data available for ${analysis.symbol} (ID: ${analysis.id}), skipping regeneration`);
          }
        } catch (regenError: any) {
          console.error(`[Bulk Update] Error regenerating factors for ${analysis.symbol} (ID: ${analysis.id}):`, regenError);
          // Continue with other analyses even if one fails
        }
      }
    }

    return res.json({
      success: true,
      message: `Updated minPctChange to ${targetMinPctChange} for ${updatedCount} analysis(es).${shouldRegenerate ? ` Regenerated factors for ${regeneratedCount} analysis(es).` : ''}`,
      data: {
        targetMinPctChange,
        totalMatched: analyses.length,
        totalUpdated: updatedCount,
        totalSkipped: skippedCount,
        totalRegenerated: regeneratedCount,
        symbols,
      },
    });
  } catch (error) {
    console.error("Error bulk updating minPctChange:", error);
    return res.status(500).json({ error: "Failed to bulk update minPctChange" });
  }
});

// PATCH /api/stock-analyses/:id - Update stock analysis (e.g., favorite status, market, minPctChange)
router.patch('/:id', async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;

    // Validate and parse input
    let validatedBody;
    try {
      validatedBody = validateInput(stockAnalysisUpdateSchema, req.body);
    } catch (error: any) {
      return res.status(400).json({
        error: "Invalid input",
        message: error?.message || 'Validation failed'
      });
    }

    const { favorite, market, minPctChange, regenerate } = validatedBody;

    const stockAnalysis = await prisma.stockAnalysis.findUnique({
      where: { id: Number(id) },
      select: {
        id: true,
        symbol: true,
        csvFilePath: true,
        minPctChange: true,
        favorite: true,
        market: true,
      }
    });

    if (!stockAnalysis) {
      return res.status(404).json({ error: "Stock analysis not found" });
    }

    // Build update payload from validated fields
    const updateData: any = {};
    if (typeof favorite === 'boolean') {
      updateData.favorite = favorite;
    }
    if (market !== undefined) {
      updateData.market = market;
    }
    if (typeof minPctChange === 'number') {
      updateData.minPctChange = minPctChange;
    }

    // Update the analysis
    const updatedAnalysis = await prisma.stockAnalysis.update({
      where: { id: Number(id) },
      data: updateData,
    });

    // Regenerate factors if requested
    if (regenerate === true) {
      try {
        let csvContent: string;
        
        // Try to get CSV from file first
        if (stockAnalysis.csvFilePath) {
          try {
            const resolvedPath = resolveCsvFilePath(stockAnalysis.csvFilePath);
            csvContent = fs.readFileSync(resolvedPath, 'utf-8');
          } catch (fileError: any) {
            console.warn(`[PATCH] CSV file not found, reconstructing from database`);
            csvContent = await reconstructCsvFromDatabase(Number(id));
          }
        } else {
          csvContent = await reconstructCsvFromDatabase(Number(id));
        }

        if (csvContent && csvContent.trim().length > 0) {
          await saveFactorAnalysisToDatabase(Number(id), csvContent);
          
          // Fetch updated results
          const results = await getAnalysisResultsFromDB(Number(id));
          
          return res.json({
            data: { 
              stockAnalysis: {
                ...updatedAnalysis,
                results
              }
            },
            message: "Stock analysis updated and factors regenerated successfully"
          });
        } else {
          console.warn(`[PATCH] No CSV data available, skipping regeneration`);
        }
      } catch (regenError: any) {
        console.error(`[PATCH] Error regenerating factors:`, regenError);
        // Return the update success even if regeneration fails
        return res.json({
          data: { stockAnalysis: updatedAnalysis },
          warning: "Update successful but factor regeneration failed",
          error: regenError.message || "Unknown regeneration error"
        });
      }
    }

    return res.json({
      data: { stockAnalysis: updatedAnalysis }
    });
  } catch (error) {
    console.error("Error updating stock analysis:", error);
    return res.status(500).json({ error: "Failed to update stock analysis" });
  }
});

// DELETE /api/stock-analyses/:id - Delete stock analysis
router.delete('/:id', async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!canDeleteStockAnalysis(user.role)) {
      return res.status(403).json({ error: "Insufficient permissions. Only admins can delete stock analyses." });
    }

    const { id } = req.params;
    const numericId = Number(id);

    if (isNaN(numericId) || numericId <= 0) {
      return res.status(400).json({ error: "Invalid stock analysis ID" });
    }

    // Find the stock analysis first to get the CSV file path
    const stockAnalysis = await prisma.stockAnalysis.findUnique({
      where: { id: numericId },
      include: {
        dailyFactorData: true,
        dailyScores: true,
        factorTables: true,
      }
    });

    if (!stockAnalysis) {
      return res.status(404).json({ error: "Stock analysis not found" });
    }

    // Delete associated data (cascade should handle this, but being explicit)
    // Delete daily factor data
    await prisma.dailyFactorData.deleteMany({
      where: { stockAnalysisId: numericId }
    });

    // Delete daily scores
    await prisma.dailyScore.deleteMany({
      where: { stockAnalysisId: numericId }
    });

    // Delete factor tables
    await prisma.factorTable.deleteMany({
      where: { stockAnalysisId: numericId }
    });

    // Delete earnings data if exists (by symbol)
    if (stockAnalysis.symbol) {
      await prisma.earningsData.deleteMany({
        where: { symbol: stockAnalysis.symbol }
      });
    }

    // Delete the CSV file if it exists
    if (stockAnalysis.csvFilePath) {
      try {
        const filePath = path.isAbsolute(stockAnalysis.csvFilePath) 
          ? stockAnalysis.csvFilePath 
          : path.join(process.cwd(), stockAnalysis.csvFilePath);
        
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`Deleted CSV file: ${filePath}`);
        }
      } catch (fileError) {
        console.error(`Error deleting CSV file: ${stockAnalysis.csvFilePath}`, fileError);
        // Continue with deletion even if file deletion fails
      }
    }

    // Delete the stock analysis
    await prisma.stockAnalysis.delete({
      where: { id: numericId }
    });

    return res.json({
      success: true,
      message: "Stock analysis deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting stock analysis:", error);
    return res.status(500).json({ error: "Failed to delete stock analysis" });
  }
});

/**
 * @openapi
 * /api/stock-analyses/ml-feature-importance:
 *   post:
 *     summary: Calculate feature importance for predicting strong price moves
 *     tags: [Stock Analysis]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               symbol:
 *                 type: string
 *                 description: Single stock symbol (required if symbols and stockAnalysisId not provided)
 *                 example: TCB
 *               symbols:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: List of stock symbols (required if symbol and stockAnalysisId not provided, max 100)
 *                 example: ["TCB", "VCB", "BID"]
 *               market:
 *                 type: string
 *                 enum: [US, VN]
 *                 description: Market code (US or VN)
 *                 example: VN
 *               startDate:
 *                 type: string
 *                 format: date
 *                 description: Start date for historical data (default 1 year ago)
 *                 example: "2023-01-01"
 *               targetPct:
 *                 type: number
 *                 description: Target percentage increase to label strong days (default 0.03 = 3%)
 *                 example: 0.03
 *               topN:
 *                 type: integer
 *                 description: Number of top factors to return (default 10)
 *                 example: 10
 *               stockAnalysisId:
 *                 type: integer
 *                 description: Use existing stock analysis data instead of fetching historical data
 *                 example: 123
 *     responses:
 *       200:
 *         description: Feature importance calculated successfully (single result or array of results)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   oneOf:
 *                     - $ref: '#/components/schemas/FeatureImportanceResult'
 *                     - type: array
 *                       items:
 *                         $ref: '#/components/schemas/FeatureImportanceResult'
 *       400:
 *         description: Invalid input parameters
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
// POST /api/stock-analyses/ml-feature-importance - Calculate feature importance
router.post('/ml-feature-importance', async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Validate input using schema
    const validationResult = mlFeatureImportanceSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: "Invalid input",
        message: validationResult.error.issues[0]?.message || "Validation failed",
        details: validationResult.error.issues
      });
    }

    const { symbol, symbols, market, startDate, targetPct, topN, stockAnalysisId } = validationResult.data;

    // Determine if we're processing multiple symbols
    const symbolList = symbols && symbols.length > 0 
      ? symbols.map(s => s.toUpperCase())
      : symbol 
        ? [symbol.toUpperCase()]
        : [];

    // If stockAnalysisId is provided, process single analysis
    if (stockAnalysisId !== undefined) {
      const result = await calculateFeatureImportance({
        symbol: symbolList[0] || undefined, // Optional when stockAnalysisId is provided
        market,
        startDate,
        targetPct,
        topN,
        stockAnalysisId
      });
      return res.json({ data: result });
    }

    // Ensure we have at least one symbol when stockAnalysisId is not provided
    if (symbolList.length === 0) {
      return res.status(400).json({
        error: "Invalid input",
        message: "At least one symbol is required when stockAnalysisId is not provided"
      });
    }

    // Process multiple symbols in parallel
    if (symbolList.length > 1) {
      const results = await Promise.allSettled(
        symbolList.map(sym => 
          calculateFeatureImportance({
            symbol: sym,
            market,
            startDate,
            targetPct,
            topN,
            stockAnalysisId: undefined
          })
        )
      );

      const successfulResults = results
        .map((result, index) => {
          if (result.status === 'fulfilled') {
            return result.value;
          } else {
            console.error(`Error calculating feature importance for ${symbolList[index]}:`, result.reason);
            return {
              symbol: symbolList[index],
              error: result.reason instanceof Error ? result.reason.message : 'Unknown error',
              market: market || null
            };
          }
        })
        .filter(r => r !== null);

      return res.json({ 
        data: successfulResults,
        total: symbolList.length,
        successful: successfulResults.filter(r => !('error' in r)).length,
        failed: successfulResults.filter(r => 'error' in r).length
      });
    }

    // Single symbol processing (backward compatibility)
    const result = await calculateFeatureImportance({
      symbol: symbolList[0],
      market,
      startDate,
      targetPct,
      topN,
      stockAnalysisId: undefined
    });

    return res.json({ data: result });
  } catch (error) {
    console.error("Error calculating feature importance:", error);
    return res.status(500).json({
      error: "Failed to calculate feature importance",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

/**
 * @openapi
 * /api/stock-analyses/{id}/simulate:
 *   post:
 *     summary: Simulate predicted prices for an existing stock analysis
 *     tags: [Stock Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Stock analysis ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - initialPrice
 *               - timeHorizon
 *             properties:
 *               initialPrice:
 *                 type: number
 *                 description: Starting/current price for simulation
 *                 example: 100.50
 *               timeHorizon:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 365
 *                 description: Number of days to simulate
 *                 example: 30
 *               factorWeights:
 *                 type: object
 *                 description: Override default factor weights
 *                 example:
 *                   volume_spike: 0.30
 *                   market_up: 0.25
 *               threshold:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 1
 *                 description: "Prediction threshold (default: 0.45)"
 *                 example: 0.50
 *               factorStates:
 *                 type: object
 *                 description: Which factors are active/inactive
 *                 example:
 *                   volume_spike: true
 *                   market_up: true
 *                   break_ma50: false
 *     responses:
 *       200:
 *         description: Simulation result with price paths, scenarios, and confidence intervals
 *       400:
 *         description: Invalid parameters
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Stock analysis not found
 *       500:
 *         description: Server error
 */
// POST /api/stock-analyses/:id/simulate - Simulate prices for existing stock analysis
router.post('/:id/simulate', async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;
    const stockAnalysisId = Number(id);

    if (isNaN(stockAnalysisId) || stockAnalysisId <= 0) {
      return res.status(400).json({ error: "Invalid stock analysis ID" });
    }

    // Verify stock analysis exists
    const stockAnalysis = await prisma.stockAnalysis.findUnique({
      where: { id: stockAnalysisId }
    });

    if (!stockAnalysis) {
      return res.status(404).json({ error: "Stock analysis not found" });
    }

    // Validate request body
    const { initialPrice, timeHorizon, factorWeights, threshold, factorStates } = req.body;

    if (typeof initialPrice !== 'number' || initialPrice <= 0) {
      return res.status(400).json({ error: "initialPrice must be a positive number" });
    }

    if (typeof timeHorizon !== 'number' || timeHorizon < 1 || timeHorizon > 365) {
      return res.status(400).json({ error: "timeHorizon must be between 1 and 365 days" });
    }

    // Build simulation parameters
    const parameters: SimulationParameters = {
      symbol: stockAnalysis.symbol || 'UNKNOWN',
      initialPrice,
      timeHorizon: Math.floor(timeHorizon),
      stockAnalysisId,
      ...(factorWeights && { factorWeights }),
      ...(threshold !== undefined && { threshold }),
      ...(factorStates && { factorStates })
    };

    // Run simulation
    const result = await simulatePricePath(parameters);

    return res.json({
      data: result
    });
  } catch (error) {
    console.error("Error running simulation:", error);
    return res.status(500).json({
      error: "Failed to run simulation",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

/**
 * @openapi
 * /api/stock-analyses/simulate:
 *   post:
 *     summary: Simulate predicted prices for any symbol (standalone simulation)
 *     tags: [Stock Analysis]
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
 *               - initialPrice
 *               - timeHorizon
 *             properties:
 *               symbol:
 *                 type: string
 *                 description: Stock symbol/ticker
 *                 example: AAPL
 *               initialPrice:
 *                 type: number
 *                 description: Starting/current price for simulation
 *                 example: 150.25
 *               timeHorizon:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 365
 *                 description: Number of days to simulate
 *                 example: 30
 *               factorWeights:
 *                 type: object
 *                 description: Override default factor weights
 *                 example:
 *                   volume_spike: 0.30
 *                   market_up: 0.25
 *               threshold:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 1
 *                 description: "Prediction threshold (default: 0.45)"
 *                 example: 0.50
 *               factorStates:
 *                 type: object
 *                 description: Which factors are active/inactive
 *                 example:
 *                   volume_spike: true
 *                   market_up: true
 *                   break_ma50: false
 *               stockAnalysisId:
 *                 type: integer
 *                 description: Optional stock analysis ID to use historical data
 *                 example: 123
 *     responses:
 *       200:
 *         description: Simulation result with price paths, scenarios, and confidence intervals
 *       400:
 *         description: Invalid parameters
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Stock analysis not found (if stockAnalysisId provided)
 *       500:
 *         description: Server error
 */
// POST /api/stock-analyses/simulate - Simulate prices for any symbol (standalone)
router.post('/simulate', async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Validate request body
    const { symbol, initialPrice, timeHorizon, factorWeights, threshold, factorStates, stockAnalysisId } = req.body;

    if (!symbol || typeof symbol !== 'string') {
      return res.status(400).json({ error: "symbol is required and must be a string" });
    }

    if (typeof initialPrice !== 'number' || initialPrice <= 0) {
      return res.status(400).json({ error: "initialPrice must be a positive number" });
    }

    if (typeof timeHorizon !== 'number' || timeHorizon < 1 || timeHorizon > 365) {
      return res.status(400).json({ error: "timeHorizon must be between 1 and 365 days" });
    }

    // If stockAnalysisId is provided, verify it exists
    if (stockAnalysisId !== undefined) {
      const stockAnalysis = await prisma.stockAnalysis.findUnique({
        where: { id: Number(stockAnalysisId) }
      });

      if (!stockAnalysis) {
        return res.status(404).json({ error: "Stock analysis not found" });
      }
    }

    // Build simulation parameters
    const parameters: SimulationParameters = {
      symbol,
      initialPrice,
      timeHorizon: Math.floor(timeHorizon),
      ...(factorWeights && { factorWeights }),
      ...(threshold !== undefined && { threshold }),
      ...(factorStates && { factorStates }),
      ...(stockAnalysisId !== undefined && { stockAnalysisId: Number(stockAnalysisId) })
    };

    // Run simulation
    const result = await simulatePricePath(parameters);

    return res.json({
      data: result
    });
  } catch (error) {
    console.error("Error running simulation:", error);
    return res.status(500).json({
      error: "Failed to run simulation",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

/**
 * @openapi
 * /api/stock-analyses/{id}/predictions/{date}/feedback:
 *   post:
 *     summary: Mark a prediction as correct or incorrect
 *     tags: [Stock Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Stock analysis ID
 *       - in: path
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Prediction date (YYYY-MM-DD format)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - isCorrect
 *             properties:
 *               isCorrect:
 *                 type: boolean
 *                 description: true if prediction was correct, false if incorrect
 *               notes:
 *                 type: string
 *                 maxLength: 1000
 *                 description: Optional notes about the feedback
 *     responses:
 *       200:
 *         description: Feedback saved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     stockAnalysisId:
 *                       type: integer
 *                     date:
 *                       type: string
 *                     isCorrect:
 *                       type: boolean
 *                     notes:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Stock analysis not found
 *       500:
 *         description: Server error
 */
// POST /api/stock-analyses/:id/predictions/:date/feedback - Mark prediction as correct/incorrect
router.post('/:id/predictions/:date/feedback', async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { id, date } = req.params;
    const stockAnalysisId = Number(id);

    // Validate date format
    if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return res.status(400).json({
        error: "Invalid date format",
        message: "Date must be in YYYY-MM-DD format"
      });
    }

    // Validate stock analysis exists
    const stockAnalysis = await prisma.stockAnalysis.findUnique({
      where: { id: stockAnalysisId }
    });

    if (!stockAnalysis) {
      return res.status(404).json({
        error: "Stock analysis not found",
        message: `Stock analysis with ID ${stockAnalysisId} does not exist`
      });
    }

    // Find the prediction for this stock analysis and date
    const prediction = await prisma.prediction.findUnique({
      where: {
        stockAnalysisId_date: {
          stockAnalysisId,
          date
        }
      }
    });

    if (!prediction) {
      return res.status(404).json({
        error: "Prediction not found",
        message: `No prediction found for stock analysis ${stockAnalysisId} on date ${date}. Please generate predictions first.`
      });
    }

    // Validate request body
    const input = validateInput(predictionFeedbackSchema, req.body);

    // Upsert feedback (create or update if exists)
    const feedback = await prisma.predictionFeedback.upsert({
      where: {
        predictionId_userId: {
          predictionId: prediction.id,
          userId: Number(user.id)
        }
      },
      update: {
        isCorrect: input.isCorrect,
        notes: input.notes || null,
        updatedAt: new Date()
      },
      create: {
        predictionId: prediction.id,
        userId: Number(user.id),
        isCorrect: input.isCorrect,
        notes: input.notes || null
      }
    });

    return res.json({
      data: feedback
    });
  } catch (error) {
    console.error("Error saving prediction feedback:", error);
    
    if (error instanceof Error && error.message.includes('Validation failed')) {
      return res.status(400).json({
        error: "Validation failed",
        message: error.message
      });
    }

    return res.status(500).json({
      error: "Failed to save prediction feedback",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

/**
 * @openapi
 * /api/stock-analyses/{id}/predictions/{date}/feedback:
 *   get:
 *     summary: Get feedback for a specific prediction
 *     tags: [Stock Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Stock analysis ID
 *       - in: path
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Prediction date (YYYY-MM-DD format)
 *     responses:
 *       200:
 *         description: Feedback retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     id:
 *                       type: integer
 *                     stockAnalysisId:
 *                       type: integer
 *                     date:
 *                       type: string
 *                     isCorrect:
 *                       type: boolean
 *                     notes:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Invalid date format
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Stock analysis not found
 *       500:
 *         description: Server error
 */
// GET /api/stock-analyses/:id/predictions/:date/feedback - Get feedback for a prediction
router.get('/:id/predictions/:date/feedback', async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { id, date } = req.params;
    const stockAnalysisId = Number(id);

    // Validate date format
    if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return res.status(400).json({
        error: "Invalid date format",
        message: "Date must be in YYYY-MM-DD format"
      });
    }

    // Validate stock analysis exists
    const stockAnalysis = await prisma.stockAnalysis.findUnique({
      where: { id: stockAnalysisId }
    });

    if (!stockAnalysis) {
      return res.status(404).json({
        error: "Stock analysis not found",
        message: `Stock analysis with ID ${stockAnalysisId} does not exist`
      });
    }

    // Find the prediction for this stock analysis and date
    const prediction = await prisma.prediction.findUnique({
      where: {
        stockAnalysisId_date: {
          stockAnalysisId,
          date
        }
      }
    });

    if (!prediction) {
      return res.json({
        data: null,
        message: `No prediction found for stock analysis ${stockAnalysisId} on date ${date}`
      });
    }

    // Get feedback for this user and prediction
    const feedback = await prisma.predictionFeedback.findUnique({
      where: {
        predictionId_userId: {
          predictionId: prediction.id,
          userId: Number(user.id)
        }
      }
    });

    return res.json({
      data: feedback
    });
  } catch (error) {
    console.error("Error fetching prediction feedback:", error);
    return res.status(500).json({
      error: "Failed to fetch prediction feedback",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

/**
 * @openapi
 * /api/stock-analyses/{id}/predictions/feedback:
 *   get:
 *     summary: Get all feedback for predictions in a stock analysis
 *     tags: [Stock Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Stock analysis ID
 *     responses:
 *       200:
 *         description: Feedback list retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       stockAnalysisId:
 *                         type: integer
 *                       date:
 *                         type: string
 *                       isCorrect:
 *                         type: boolean
 *                       notes:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Stock analysis not found
 *       500:
 *         description: Server error
 */
// GET /api/stock-analyses/:id/predictions/feedback - Get all feedback for a stock analysis
router.get('/:id/predictions/feedback', async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    const stockAnalysisId = Number(id);

    // Validate stock analysis exists
    const stockAnalysis = await prisma.stockAnalysis.findUnique({
      where: { id: stockAnalysisId }
    });

    if (!stockAnalysis) {
      return res.status(404).json({
        error: "Stock analysis not found",
        message: `Stock analysis with ID ${stockAnalysisId} does not exist`
      });
    }

    // Get all predictions for this stock analysis
    const predictions = await prisma.prediction.findMany({
      where: {
        stockAnalysisId
      },
      select: {
        id: true
      }
    });

    const predictionIds = predictions.map((p: { id: number }) => p.id);

    // Get all feedback for this user and these predictions
    const feedbacks = await prisma.predictionFeedback.findMany({
      where: {
        predictionId: {
          in: predictionIds
        },
        userId: Number(user.id)
      },
      include: {
        prediction: {
          select: {
            id: true,
            date: true,
            symbol: true,
            score: true,
            prediction: true
          }
        }
      },
      orderBy: {
        prediction: {
          date: 'desc'
        }
      }
    });

    return res.json({
      data: feedbacks
    });
  } catch (error) {
    console.error("Error fetching prediction feedbacks:", error);
    return res.status(500).json({
      error: "Failed to fetch prediction feedbacks",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

export default router;

