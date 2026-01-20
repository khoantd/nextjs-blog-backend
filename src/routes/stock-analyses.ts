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
      // Build query conditionally - when limit is 0, fetch all records
      const queryOptions: any = {
        orderBy: {
          createdAt: "desc",
        },
      };
      
      // Only apply pagination if limit is not 0
      if (paginationOptions.limit > 0) {
        queryOptions.skip = paginationOptions.skip;
        queryOptions.take = paginationOptions.limit;
      }
      
      [stockAnalyses, total] = await Promise.all([
        prisma.stockAnalysis.findMany(queryOptions),
        prisma.stockAnalysis.count(),
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
          if (savedResults.transactions && Array.isArray(savedResults.transactions)) {
            savedResults.transactions = savedResults.transactions.map((tx: any) => ({
              tx: tx.Tx || tx.tx,
              date: tx.Date || tx.date,
              close: tx.Close || tx.close,
              pctChange: tx.pct_change !== undefined ? tx.pct_change : tx.pctChange,
              factors: tx.factors || [],
              factorCount: tx.factorCount || 0
            }));
            
            console.log(`[GET] Normalized ${savedResults.transactions.length} transactions from saved data`);
            
            // Debug: Log first few normalized transactions
            console.log(`[GET] Sample normalized transactions (first 3):`);
            savedResults.transactions.slice(0, 3).forEach((tx: any, idx: number) => {
              console.log(`  Normalized ${idx}: tx=${tx.tx}, date="${tx.date}" (type: ${typeof tx.date}), close=${tx.close}`);
            });
          }
          
          results = savedResults;
        } else {
          // Not period-filtered, use DB reconstruction for full data
          console.log(`[GET] Saved results not period-filtered, using DB reconstruction`);
          results = await getAnalysisResultsFromDB(stockAnalysis.id);
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

// GET /api/stock-analyses/:id/daily-factor-data
router.get('/:id/daily-factor-data', async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;

    // Allow higher limits for daily-factor-data (up to 50000 records)
    // Use limit=0 or limit=all to fetch all records
    const paginationOptions = getPaginationOptions(req, 50000);
    const enrichedData = await calculateFactorsOnDemand(Number(id), {
      skip: paginationOptions.skip,
      limit: paginationOptions.limit === 0 ? undefined : paginationOptions.limit
    });

    // Total count still needs to be fetched for metadata
    const total = await prisma.dailyFactorData.count({
      where: { stockAnalysisId: Number(id) }
    });

    return res.json({
      data: formatPaginatedResponse(enrichedData, total, paginationOptions)
    });
  } catch (error) {
    console.error("Error fetching daily factor data:", error);
    return res.status(500).json({ error: "Failed to fetch daily factor data" });
  }
});

// GET /api/stock-analyses/:id/daily-scores
router.get('/:id/daily-scores', async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    const { orderBy = 'date', order = 'desc' } = req.query;

    // Fetch ALL scores first (without pagination) to sort properly
    const allScores = await calculateScoresOnDemand(Number(id), {
      skip: 0,
      limit: 0 // 0 means fetch all
    });

    // Sort ALL scores based on orderBy and order parameters
    let sortedScores = [...allScores];
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

    // Now apply pagination to the sorted results
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
    const csvContent = await vnstockClient.downloadCSV({
      symbol: stockAnalysis.symbol,
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

// GET /api/stock-analyses/:id/predictions - Get current market predictions
router.get('/:id/predictions', async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    const stockAnalysisId = Number(id);
    const { orderBy = 'date', order = 'desc' } = req.query;

    // Get stock analysis to get symbol
    const stockAnalysis = await prisma.stockAnalysis.findUnique({
      where: { id: stockAnalysisId }
    });

    if (!stockAnalysis) {
      return res.status(404).json({ error: "Stock analysis not found" });
    }

    // Get the most recent factor data (last 5 days to have options)
    const recentData = await calculateFactorsOnDemand(stockAnalysisId, {
      skip: 0,
      limit: 5 // Get last 5 days
    });

    if (recentData.length === 0) {
      return res.json({
        data: {
          predictions: [],
          message: "No factor data available. Please run factor analysis first."
        }
      });
    }

    // Get the most recent day's factors
    const mostRecentDay = recentData[recentData.length - 1];
    
    // Extract current factors from the most recent day
    const currentFactors: Partial<Record<string, boolean>> = {};
    const factorKeys = [
      'volume_spike',
      'break_ma50',
      'break_ma200',
      'rsi_over_60',
      'market_up',
      'sector_up',
      'short_covering',
      'earnings_window',
      'macro_tailwind',
      'news_positive'
    ];

    factorKeys.forEach(key => {
      if (key in mostRecentDay) {
        currentFactors[key] = Boolean(mostRecentDay[key as keyof typeof mostRecentDay]);
      }
    });

    // Generate prediction for current conditions
    const prediction = generateDailyPrediction(
      stockAnalysis.symbol,
      currentFactors as any,
      undefined // Use default config
    );

    // Also generate predictions for the last few days to show trend
    const predictions = [prediction];

    // Optionally add predictions for previous days (last 3-4 days) to show trend
    for (let i = Math.max(0, recentData.length - 4); i < recentData.length - 1; i++) {
      const dayData = recentData[i];
      const dayFactors: Partial<Record<string, boolean>> = {};
      
      factorKeys.forEach(key => {
        if (key in dayData) {
          dayFactors[key] = Boolean(dayData[key as keyof typeof dayData]);
        }
      });

      const dayPrediction = generateDailyPrediction(
        stockAnalysis.symbol,
        dayFactors as any,
        undefined
      );
      dayPrediction.date = dayData.Date; // Use the actual date from data
      predictions.push(dayPrediction);
    }

    // Sort predictions based on orderBy and order parameters (similar to daily-scores)
    let sortedPredictions = [...predictions];
    if (orderBy === 'date') {
      sortedPredictions.sort((a, b) => {
        const parseDate = (dateStr: string): [number, number, number] => {
          if (dateStr.includes('-')) {
            const parts = dateStr.split('-');
            if (parts.length >= 3) {
              const year = parseInt(parts[0], 10);
              const month = parseInt(parts[1], 10);
              const day = parseInt(parts[2], 10);
              return [year, month, day];
            }
          }
          if (dateStr.includes('/')) {
            const parts = dateStr.split('/');
            if (parts.length >= 3) {
              const month = parseInt(parts[0], 10);
              const day = parseInt(parts[1], 10);
              const year = parseInt(parts[2], 10);
              return [year, month, day];
            }
          }
          const date = new Date(dateStr);
          return [date.getFullYear(), date.getMonth() + 1, date.getDate()];
        };
        
        const [yearA, monthA, dayA] = parseDate(a.date);
        const [yearB, monthB, dayB] = parseDate(b.date);
        
        if (yearA !== yearB) {
          return order === 'desc' ? yearB - yearA : yearA - yearB;
        }
        if (monthA !== monthB) {
          return order === 'desc' ? monthB - monthA : monthA - monthB;
        }
        return order === 'desc' ? dayB - dayA : dayA - dayB;
      });
    } else if (orderBy === 'score') {
      sortedPredictions.sort((a, b) => {
        return order === 'desc' ? b.score - a.score : a.score - b.score;
      });
    } else if (orderBy === 'confidence') {
      sortedPredictions.sort((a, b) => {
        return order === 'desc' ? b.confidence - a.confidence : a.confidence - b.confidence;
      });
    } else if (orderBy === 'prediction') {
      // Sort by prediction level: HIGH_PROBABILITY > MODERATE > LOW_PROBABILITY
      const predictionOrder: Record<string, number> = {
        'HIGH_PROBABILITY': 3,
        'MODERATE': 2,
        'LOW_PROBABILITY': 1
      };
      sortedPredictions.sort((a, b) => {
        const orderA = predictionOrder[a.prediction] || 0;
        const orderB = predictionOrder[b.prediction] || 0;
        return order === 'desc' ? orderB - orderA : orderA - orderB;
      });
    }

    return res.json({
      data: {
        predictions: sortedPredictions
      }
    });
  } catch (error) {
    console.error("Error generating predictions:", error);
    return res.status(500).json({ error: "Failed to generate predictions" });
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

// PATCH /api/stock-analyses/:id - Update stock analysis (e.g., favorite status)
router.patch('/:id', async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;
    const { favorite, market } = req.body;

    const stockAnalysis = await prisma.stockAnalysis.findUnique({
      where: { id: Number(id) }
    });

    if (!stockAnalysis) {
      return res.status(404).json({ error: "Stock analysis not found" });
    }

    // Update only the fields provided
    const updateData: any = {};
    if (typeof favorite === 'boolean') {
      updateData.favorite = favorite;
    }
    if (market !== undefined) {
      // Validate market value
      if (market !== null && market !== 'US' && market !== 'VN') {
        return res.status(400).json({ error: "Invalid market value. Must be 'US', 'VN', or null" });
      }
      updateData.market = market;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    const updatedAnalysis = await prisma.stockAnalysis.update({
      where: { id: Number(id) },
      data: updateData,
    });

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

export default router;

