import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { getCurrentUser } from '../lib/auth-utils';
import { canViewPosts } from '../lib/auth';
import * as fs from 'fs';
import * as path from 'path';
import multer from 'multer';
import {
  saveFactorAnalysisToDatabase,
  getAnalysisResultsFromDB,
  calculateFactorsOnDemand,
  calculateScoresOnDemand
} from '../lib/services/stock-factor-service';
import { getPaginationOptions, formatPaginatedResponse } from '../lib/pagination';

// Configure multer for CSV uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
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
    const user = await getCurrentUser(req);

    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!canViewPosts(user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    const paginationOptions = getPaginationOptions(req);

    const [stockAnalyses, total] = await Promise.all([
      prisma.stockAnalysis.findMany({
        orderBy: {
          createdAt: "desc",
        },
        skip: paginationOptions.skip,
        take: paginationOptions.limit,
      }),
      prisma.stockAnalysis.count(),
    ]);

    return res.json({
      data: formatPaginatedResponse(stockAnalyses, total, paginationOptions)
    });
  } catch (error) {
    console.error("Error fetching stock analyses:", error);
    return res.status(500).json({ error: "Failed to fetch stock analyses" });
  }
});

// POST /api/stock-analyses - Create a new stock analysis
router.post('/', async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { symbol, name, csvFilePath, market } = req.body;

    if (!symbol) {
      return res.status(400).json({ error: "Symbol is required" });
    }

    const stockAnalysis = await prisma.stockAnalysis.create({
      data: {
        symbol,
        market: market || null,
        name: name || null,
        csvFilePath: csvFilePath || null,
        status: "draft",
      },
    });

    return res.status(201).json({ data: { stockAnalysis } });
  } catch (error) {
    console.error("Error creating stock analysis:", error);
    return res.status(500).json({ error: "Failed to create stock analysis" });
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

    const shouldIncludeData = excludeData !== 'true';

    const stockAnalysis = await prisma.stockAnalysis.findUnique({
      where: { id: Number(id) },
      include: {
        dailyFactorData: shouldIncludeData,
        dailyScores: shouldIncludeData,
        factorTables: true,
      },
    });

    if (!stockAnalysis) {
      return res.status(404).json({ error: "Stock analysis not found" });
    }

    // Attempt to get structured results from DB
    const results = await getAnalysisResultsFromDB(stockAnalysis.id);

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

    // Check if file exists
    if (!fs.existsSync(stockAnalysis.csvFilePath)) {
      // Try absolute path if it's relative
      const absolutePath = path.resolve(process.cwd(), stockAnalysis.csvFilePath);
      if (!fs.existsSync(absolutePath)) {
        return res.status(404).json({ error: `CSV file not found at ${stockAnalysis.csvFilePath}` });
      }
    }

    const csvContent = fs.readFileSync(stockAnalysis.csvFilePath, 'utf-8');

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

// POST /api/stock-analyses/:id/upload - Upload CSV file and trigger analysis
router.post('/:id/upload', upload.single('csvFile'), async (req, res) => {
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

    const csvFilePath = req.file.path;
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
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(500).json({ error: "Failed to upload and import CSV data" });
  }
});

// GET /api/stock-analyses/:id/daily-factor-data
router.get('/:id/daily-factor-data', async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;

    const paginationOptions = getPaginationOptions(req);
    const enrichedData = await calculateFactorsOnDemand(Number(id), {
      skip: paginationOptions.skip,
      limit: paginationOptions.limit
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

    const paginationOptions = getPaginationOptions(req);
    const scores = await calculateScoresOnDemand(Number(id), {
      skip: paginationOptions.skip,
      limit: paginationOptions.limit
    });

    const total = await prisma.dailyFactorData.count({
      where: { stockAnalysisId: Number(id) }
    });

    return res.json({
      data: formatPaginatedResponse(scores, total, paginationOptions)
    });
  } catch (error) {
    console.error("Error fetching daily scores:", error);
    return res.status(500).json({ error: "Failed to fetch daily scores" });
  }
});


// POST /api/stock-analyses/:id/analyze - Trigger full analysis (pricing + AI)
router.post('/:id/analyze', async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;

    // Dynamically import to avoid circular dependencies if any
    const { StockAnalysisService } = await import('../lib/services/stock-analysis-service');

    // Run analysis
    const result = await StockAnalysisService.performFullAnalysis(Number(id));

    return res.json({
      success: true,
      message: "Analysis completed successfully",
      data: result
    });
  } catch (error) {
    console.error("Error performing full analysis:", error);
    // Handle specific app errors if they exist
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to perform analysis" });
  }
});

export default router;

