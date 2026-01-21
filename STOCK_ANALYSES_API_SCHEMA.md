# Stock Analyses API - Complete Schema Documentation

## Base URL
`/api/stock-analyses`

## Authentication
All endpoints require authentication (Viewer role minimum). Admin role required for DELETE operations.

---

## Endpoints Overview

### Collection Endpoints
- `GET /api/stock-analyses` - List all stock analyses (paginated)
- `POST /api/stock-analyses` - Create a new stock analysis

### Resource Endpoints
- `GET /api/stock-analyses/:id` - Get a specific stock analysis
- `PATCH /api/stock-analyses/:id` - Update stock analysis (favorite, market)
- `DELETE /api/stock-analyses/:id` - Delete stock analysis (Admin only)

### Status Endpoints
- `GET /api/stock-analyses/:id/status` - Get analysis status

### Data Upload Endpoints
- `POST /api/stock-analyses/:id/upload` - Upload CSV file and trigger analysis
- `POST /api/stock-analyses/:id/supplement` - Upload CSV to supplement existing analysis
- `POST /api/stock-analyses/:id/import` - Import CSV data from existing file path

### Data Fetching Endpoints
- `POST /api/stock-analyses/:id/fetch-historical` - Fetch historical data from API (Yahoo Finance/CafeF)
- `POST /api/stock-analyses/:id/fetch-vnstock-csv` - Fetch CSV data from vnstock API (VN stocks only)
- `POST /api/stock-analyses/import-from-vnstock` - Create stock analysis and import data from vnstock API in one operation

### Analysis Endpoints
- `POST /api/stock-analyses/:id/analyze` - Trigger full analysis (factors + AI + pricing)
- `POST /api/stock-analyses/:id/regenerate-with-period` - Regenerate analysis for specific period

### Data Retrieval Endpoints
- `GET /api/stock-analyses/:id/daily-factor-data` - Get daily factor data (paginated)
- `GET /api/stock-analyses/:id/daily-scores` - Get daily scoring data (paginated, sorted)
- `GET /api/stock-analyses/:id/predictions` - Get current market predictions

---

## Type Definitions

### StockAnalysisStatus
```typescript
type StockAnalysisStatus = 
  | 'draft'           // Initial state
  | 'analyzing'       // Analysis in progress
  | 'processing'      // Processing data
  | 'completed'       // Analysis complete
  | 'failed'          // Analysis failed
  | 'factor_failed'   // Factor calculation failed
  | 'ai_processing'   // AI analysis in progress
  | 'ai_completed';   // AI analysis complete
```

### StockAnalysis (Database Model)
```typescript
interface StockAnalysis {
  id: number;                        // Primary key
  symbol: string;                    // Stock symbol (e.g., "AAPL", "SNAP")
  market: string | null;             // Market identifier: "US" | "VN" | null
  name: string | null;                // Company name
  csvFilePath: string | null;        // Path to uploaded CSV file
  status: StockAnalysisStatus | null; // Current status
  analysisResults: string | null;     // JSON stringified StockAnalysisResult
  aiInsights: string | null;          // AI-generated insights (JSON)
  latestPrice: number | null;         // Latest stock price
  priceChange: number | null;         // Price change from previous close
  priceChangePercent: number | null;  // Percentage change
  priceUpdatedAt: Date | string | null; // When price was last updated
  favorite: boolean;                  // Favorite flag (default: false)
  createdAt: Date | string;           // Creation timestamp
  updatedAt: Date | string;           // Last update timestamp
  minPctChange: number;               // Threshold percentage (default: 4.0)
  
  // AI-powered price recommendations
  buyPrice: number | null;            // AI-recommended buy price
  sellPrice: number | null;           // AI-recommended sell price
  priceRecommendations: string | null; // JSON with detailed price analysis
  
  // Relations (included in GET /:id)
  dailyFactorData?: DailyFactorData[];
  dailyScores?: DailyScore[];
  factorTables?: FactorTable[];
  results?: StockAnalysisResult;       // Parsed analysis results
}
```

### StockAnalysisResult
```typescript
interface StockAnalysisResult {
  symbol: string;
  totalDays: number;
  transactionsFound: number;
  transactions: Transaction[];
  minPctChange: number;
  factorAnalysis?: {
    analyses: FactorAnalysis[];
    summary: {
      totalDays: number;
      factorCounts: Partial<Record<StockFactor, number>>;
      factorFrequency: Partial<Record<StockFactor, number>>;
      averageFactorsPerDay: number;
    };
    correlation?: Record<StockFactor, {
      correlation: number;
      avgReturn: number;
      occurrences: number;
    }>;
  };
  periodInfo?: {                      // Present for period-filtered analyses
    startDate: string;
    endDate: string;
    periodId: string;
    actualDaysAnalyzed: number;
  };
}
```

### Transaction
```typescript
interface Transaction {
  tx: number;                         // Transaction number
  date: string;                       // Date (YYYY-MM-DD)
  close: number;                      // Closing price
  pctChange: number;                  // Percentage change
  factors?: StockFactor[];           // Active factors
  factorCount?: number;              // Number of active factors
}
```

### DailyFactorData
```typescript
interface DailyFactorData {
  Date: string;                       // Date (YYYY-MM-DD)
  Close: number;                      // Closing price
  Open?: number;                      // Opening price
  High?: number;                      // High price
  Low?: number;                       // Low price
  Volume?: number;                    // Trading volume
  pct_change: number;                 // Percentage change
  
  // Technical indicators
  MA20?: number;                      // 20-day moving average
  MA50?: number;                      // 50-day moving average
  MA200?: number;                     // 200-day moving average
  RSI?: number;                       // Relative Strength Index
  
  // Factor flags
  volume_spike: boolean;
  break_ma50: boolean;
  break_ma200: boolean;
  rsi_over_60: boolean;
  market_up?: boolean;
  sector_up?: boolean;
  short_covering?: boolean;
  earnings_window?: boolean;
  macro_tailwind?: boolean;
  news_positive?: boolean;
}
```

### DailyScore
```typescript
interface DailyScore {
  date: string;                       // Date (YYYY-MM-DD)
  score: number;                      // Daily score (0.0 - 100.0)
  prediction: 'HIGH_PROBABILITY' | 'MODERATE' | 'LOW_PROBABILITY';
  confidence: number;                 // Confidence level (0.0 - 1.0)
  factors: Record<string, boolean>;   // Active factors
  factorBreakdown: Record<string, number>; // Factor contributions to score
}
```

### Prediction
```typescript
interface Prediction {
  symbol: string;
  date: string;                       // Date (YYYY-MM-DD)
  score: number;                      // Score (0.0 - 100.0)
  prediction: 'HIGH_PROBABILITY' | 'MODERATE' | 'LOW_PROBABILITY';
  confidence: number;                 // Confidence level (0.0 - 1.0)
  factors: Record<string, boolean>;   // Active factors
}
```

### PaginatedResponse<T>
```typescript
interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
```

### ApiResponse<T>
```typescript
interface ApiResponse<T> {
  data: T;
  error?: string;
  message?: string;
}
```

---

## Endpoint Details

### GET /api/stock-analyses

List all stock analyses with pagination.

**Query Parameters:**
- `page` (optional, number, default: 1) - Page number
- `limit` (optional, number, default: 20) - Items per page (use `0` to fetch all)

**Response (200):**
```json
{
  "data": {
    "items": [
      {
        "id": 1,
        "symbol": "AAPL",
        "name": "Apple Inc.",
        "market": "US",
        "status": "completed",
        "favorite": false,
        "csvFilePath": "/path/to/file.csv",
        "latestPrice": 150.25,
        "priceChange": 2.50,
        "priceChangePercent": 1.69,
        "createdAt": "2025-01-15T10:30:00.000Z",
        "updatedAt": "2025-01-15T10:30:00.000Z",
        "minPctChange": 4.0
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 50,
      "totalPages": 3
    }
  }
}
```

**Error Responses:**
- `401` - Unauthorized
- `403` - Insufficient permissions
- `500` - Server error (may include database table not found error)

---

### POST /api/stock-analyses

Create a new stock analysis.

**Request Body:**
```json
{
  "symbol": "AAPL",              // Required
  "name": "Apple Inc.",           // Optional
  "market": "US",                 // Optional: "US" | "VN" | null
  "csvFilePath": "/path/to/file.csv"  // Optional
}
```

**Response (201):**
```json
{
  "data": {
    "stockAnalysis": {
      "id": 1,
      "symbol": "AAPL",
      "name": "Apple Inc.",
      "market": "US",
      "status": "draft",
      "csvFilePath": "/path/to/file.csv",
      "favorite": false,
      "minPctChange": 4.0,
      "createdAt": "2025-01-15T10:30:00.000Z",
      "updatedAt": "2025-01-15T10:30:00.000Z"
    }
  }
}
```

**Error Responses:**
- `400` - Symbol is required
- `401` - Unauthorized
- `500` - Server error

---

### GET /api/stock-analyses/:id

Fetch a specific stock analysis with full data.

**Path Parameters:**
- `id` (required, number) - Stock analysis ID

**Query Parameters:**
- `excludeData` (optional, string) - Set to `"true"` to exclude daily factor data and scores

**Response (200):**
```json
{
  "data": {
    "stockAnalysis": {
      "id": 1,
      "symbol": "AAPL",
      "name": "Apple Inc.",
      "market": "US",
      "status": "completed",
      "csvFilePath": "/path/to/file.csv",
      "analysisResults": "{...}",  // JSON string
      "aiInsights": "{...}",        // JSON string
      "latestPrice": 150.25,
      "priceChange": 2.50,
      "priceChangePercent": 1.69,
      "priceUpdatedAt": "2025-01-15T10:00:00.000Z",
      "favorite": false,
      "minPctChange": 4.0,
      "buyPrice": 145.00,
      "sellPrice": 160.00,
      "priceRecommendations": "{...}",
      "createdAt": "2025-01-15T10:30:00.000Z",
      "updatedAt": "2025-01-15T10:30:00.000Z",
      "results": {
        "symbol": "AAPL",
        "totalDays": 252,
        "transactionsFound": 15,
        "transactions": [
          {
            "tx": 1,
            "date": "2025-01-15",
            "close": 150.25,
            "pctChange": 1.69,
            "factors": ["volume_spike", "break_ma50"],
            "factorCount": 2
          }
        ],
        "minPctChange": 4.0,
        "factorAnalysis": {
          "summary": {
            "totalDays": 252,
            "factorCounts": {
              "volume_spike": 45,
              "break_ma50": 30
            },
            "averageFactorsPerDay": 0.3
          }
        },
        "periodInfo": {              // Present if period-filtered
          "startDate": "2024-01-01",
          "endDate": "2025-01-15",
          "periodId": "period-123",
          "actualDaysAnalyzed": 252
        }
      },
      "dailyFactorData": [         // Excluded if excludeData=true
        {
          "Date": "2025-01-15",
          "Close": 150.25,
          "Open": 149.50,
          "High": 151.00,
          "Low": 149.00,
          "Volume": 1000000,
          "pct_change": 0.5,
          "MA20": 148.50,
          "MA50": 147.00,
          "MA200": 145.00,
          "RSI": 65.5,
          "volume_spike": true,
          "break_ma50": true,
          "break_ma200": false,
          "rsi_over_60": true
        }
      ],
      "dailyScores": [              // Excluded if excludeData=true
        {
          "date": "2025-01-15",
          "score": 75.5,
          "prediction": "HIGH_PROBABILITY",
          "confidence": 0.85,
          "factors": {
            "volume_spike": true,
            "break_ma50": true,
            "market_up": true
          },
          "factorBreakdown": {
            "volume_spike": 25,
            "break_ma50": 15,
            "market_up": 20
          }
        }
      ],
      "factorTables": [...]
    }
  }
}
```

**Error Responses:**
- `400` - Invalid stock analysis ID
- `401` - Unauthorized
- `404` - Stock analysis not found
- `500` - Server error

---

### GET /api/stock-analyses/:id/status

Get status of stock analysis.

**Path Parameters:**
- `id` (required, number) - Stock analysis ID

**Response (200):**
```json
{
  "status": "completed",
  "lastUpdated": "2025-01-15T10:30:00.000Z",
  "progress": 100,
  "message": "Status: completed"
}
```

**Status Values:**
- `draft` - Initial state (progress: 0)
- `analyzing` - Analysis in progress (progress: 50)
- `processing` - Processing data (progress: 50)
- `completed` - Analysis complete (progress: 100)
- `failed` - Analysis failed (progress: 0)
- `factor_failed` - Factor calculation failed (progress: 0)

**Error Responses:**
- `401` - Unauthorized
- `404` - Stock analysis not found
- `500` - Server error

---

### POST /api/stock-analyses/:id/upload

Upload CSV file and trigger analysis.

**Path Parameters:**
- `id` (required, number) - Stock analysis ID

**Request:** Multipart form data
- `csvFile` (required, File) - CSV file to upload

**Response (200):**
```json
{
  "success": true,
  "message": "File uploaded and data imported successfully",
  "data": {
    "stockAnalysis": {
      "id": 1,
      "status": "completed",
      "csvFilePath": "/absolute/path/to/file.csv",
      "results": {
        "totalDays": 252,
        "transactionsFound": 15,
        "transactions": [...]
      }
    }
  }
}
```

**Error Responses:**
- `400` - No CSV file uploaded
- `401` - Unauthorized
- `404` - Stock analysis not found
- `500` - Server error (file not saved correctly, import failed)

---

### POST /api/stock-analyses/:id/supplement

Upload CSV file to supplement existing analysis (merges with existing data).

**Path Parameters:**
- `id` (required, number) - Stock analysis ID

**Request:** Multipart form data
- `csvFile` (required, File) - CSV file to upload

**Response (200):**
```json
{
  "success": true,
  "message": "Supplementary data uploaded and merged successfully",
  "data": {
    "stockAnalysis": {
      "id": 1,
      "status": "processing",
      "results": {
        "totalDays": 300,
        "transactionsFound": 18
      }
    }
  }
}
```

**Error Responses:**
- `400` - No CSV file uploaded
- `401` - Unauthorized
- `404` - Stock analysis not found
- `500` - Server error (status updated to `factor_failed` on error)

---

### POST /api/stock-analyses/:id/import

Import CSV data from existing file path to database.

**Path Parameters:**
- `id` (required, number) - Stock analysis ID

**Response (200):**
```json
{
  "success": true,
  "message": "Data imported successfully",
  "data": {
    "stockAnalysis": {
      "id": 1,
      "status": "completed",
      "results": {
        "totalDays": 252,
        "transactionsFound": 15
      }
    }
  }
}
```

**Error Responses:**
- `400` - No CSV file path associated
- `401` - Unauthorized
- `404` - Stock analysis or CSV file not found
- `500` - Server error

---

### POST /api/stock-analyses/:id/fetch-historical

Fetch historical stock data from API (Yahoo Finance for US, CafeF for VN).

**Path Parameters:**
- `id` (required, number) - Stock analysis ID

**Request Body:**
```json
{
  "period1": "2024-01-01",      // Start date (YYYY-MM-DD)
  "period2": "2025-01-15",      // End date (YYYY-MM-DD)
  "interval": "1d"              // Optional: "1d" | "1w" | "1m"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Fetched 252 days of historical data from API",
  "data": {
    "stockAnalysis": {
      "id": 1,
      "status": "completed",
      "csvFilePath": null,
      "results": {...}
    },
    "dataPoints": 252,
    "dateRange": {
      "start": "2024-01-01",
      "end": "2025-01-15"
    }
  }
}
```

**Error Responses:**
- `400` - Invalid symbol or date range, or VN market fetch failed
- `401` - Unauthorized
- `404` - Stock analysis not found or no data found
- `500` - Server error

---

### POST /api/stock-analyses/:id/fetch-vnstock-csv

Fetch CSV data from vnstock API (Vietnamese stocks only).

**Path Parameters:**
- `id` (required, number) - Stock analysis ID

**Request Body:**
```json
{
  "start_date": "2024-01-01",   // Optional, defaults to 1 year ago
  "end_date": "2025-01-15",     // Optional, defaults to today
  "source": "vci",               // Optional: "vci" | "tcbs" (default: "vci")
  "interval": "D"                // Optional: "D" | "W" | "M" (default: "D")
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Fetched CSV data from vnstock API for VIC",
  "data": {
    "stockAnalysis": {
      "id": 1,
      "status": "completed",
      "csvFilePath": null,
      "results": {...}
    },
    "dataPoints": 252,
    "dateRange": {
      "start": "2024-01-01",
      "end": "2025-01-15"
    },
    "source": "vnstock"
  }
}
```

**Error Responses:**
- `400` - Invalid symbol or not VN market
- `401` - Unauthorized
- `404` - Stock analysis not found or no data returned
- `503` - Vnstock API not configured
- `500` - Server error

---

### POST /api/stock-analyses/import-from-vnstock

Create a new stock analysis and import data from vnstock API in one operation. This is a convenience endpoint that combines creating a stock analysis and fetching CSV data from vnstock.

**Request Body:**
```json
{
  "symbol": "VCI",                    // Required: Stock symbol/ticket
  "start_date": "2024-01-01",         // Required: Start date (YYYY-MM-DD or DD-MM-YYYY)
  "end_date": "2024-12-31",           // Required: End date (YYYY-MM-DD or DD-MM-YYYY)
  "name": "Vietnam Capital Investment", // Optional: Company name
  "market": "VN",                      // Optional: Market identifier (default: "VN")
  "source": "vci",                     // Optional: Data source - "vci" | "tcbs" | "msn" (default: "vci")
  "interval": "D"                      // Optional: Data interval - "D" | "1W" | "1M" | "1m" | "5m" | "15m" | "30m" | "1H" (default: "D")
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Successfully imported data from vnstock API for VCI",
  "data": {
    "stockAnalysis": {
      "id": 1,
      "symbol": "VCI",
      "name": "Vietnam Capital Investment",
      "market": "VN",
      "status": "completed",
      "csvFilePath": null,
      "results": {...},
      "createdAt": "2025-01-15T10:30:00.000Z",
      "updatedAt": "2025-01-15T10:30:00.000Z"
    },
    "dataPoints": 252,
    "dateRange": {
      "start": "2024-01-01",
      "end": "2024-12-31"
    },
    "source": "vnstock"
  }
}
```

**Error Responses:**
- `400` - Missing required fields (symbol, start_date, end_date), invalid date format, invalid date range (end_date before start_date or range > 5 years)
- `401` - Unauthorized
- `404` - No CSV data returned from vnstock API (symbol not found or no data in date range)
- `503` - Vnstock API not configured (VNSTOCK_API_URL not set)
- `500` - Server error (failed to create analysis or import data)

**Example Usage:**

```bash
# Using curl
curl -X POST http://localhost:3001/api/stock-analyses/import-from-vnstock \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=..." \
  -d '{
    "symbol": "VCI",
    "start_date": "2024-01-01",
    "end_date": "2024-12-31",
    "name": "Vietnam Capital Investment",
    "market": "VN",
    "source": "vci",
    "interval": "D"
  }'

# Using JavaScript/TypeScript
const response = await fetch('/api/stock-analyses/import-from-vnstock', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  credentials: 'include',
  body: JSON.stringify({
    symbol: 'VCI',
    start_date: '2024-01-01',
    end_date: '2024-12-31',
    name: 'Vietnam Capital Investment',
    market: 'VN',
    source: 'vci',
    interval: 'D'
  })
});

const data = await response.json();
console.log('Created analysis:', data.data.stockAnalysis);
```

**Notes:**
- This endpoint creates a new stock analysis automatically - you don't need to create one first
- The date format accepts both `YYYY-MM-DD` and `DD-MM-YYYY` formats
- Date range is validated: end_date must be after start_date, and range cannot exceed 5 years
- The symbol is automatically converted to uppercase
- Default market is "VN" (Vietnamese stocks)
- Default source is "vci" (Vietnam Capital Investment)
- Default interval is "D" (daily)
- The CSV data is automatically processed and imported to the database
- Factor analysis is automatically calculated after import

---

### POST /api/stock-analyses/:id/analyze

Trigger full analysis (factor analysis + AI insights + price recommendations).

**Path Parameters:**
- `id` (required, number) - Stock analysis ID

**Request Body:**
```json
{
  "startDate": "2024-01-01",     // Optional: Start date for period analysis
  "endDate": "2025-01-15",       // Optional: End date for period analysis
  "periodId": "period-123"       // Optional: Period identifier
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Analysis completed successfully",
  "data": {
    "stockAnalysis": {...},
    "factorAnalysis": {...},
    "aiInsights": {...},
    "priceRecommendations": {...}
  }
}
```

**Error Responses:**
- `401` - Unauthorized
- `404` - Stock analysis not found
- `500` - Server error

---

### POST /api/stock-analyses/:id/regenerate-with-period

Regenerate analysis for a specific date period.

**Path Parameters:**
- `id` (required, number) - Stock analysis ID

**Request Body:**
```json
{
  "startDate": "2024-01-01",     // Required: Start date (YYYY-MM-DD)
  "endDate": "2025-01-15",       // Required: End date (YYYY-MM-DD)
  "periodId": "period-123"       // Required: Period identifier
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Analysis regenerated for period: 2024-01-01 to 2025-01-15",
  "data": {
    "stockAnalysis": {
      "id": 1,
      "status": "completed",
      "results": {
        "totalDays": 252,
        "transactionsFound": 15,
        "periodInfo": {
          "startDate": "2024-01-01",
          "endDate": "2025-01-15",
          "periodId": "period-123",
          "actualDaysAnalyzed": 252
        }
      }
    },
    "periodInfo": {
      "startDate": "2024-01-01",
      "endDate": "2025-01-15",
      "periodId": "period-123",
      "actualDaysAnalyzed": 252
    }
  }
}
```

**Error Responses:**
- `400` - Missing dates, invalid date format, start date >= end date, or no data in period
- `401` - Unauthorized
- `404` - Stock analysis not found
- `500` - Server error (status updated to `failed` on error)

---

### PATCH /api/stock-analyses/:id

Update stock analysis (favorite status, market, Min Change threshold).

**Path Parameters:**
- `id` (required, number) - Stock analysis ID

**Request Body:**
```json
{
  "favorite": true,               // Optional: Boolean to toggle favorite status
  "market": "US",                 // Optional: "US" | "VN" | null
  "minPctChange": 3.0             // Optional: Positive number for minimum pct change threshold
}
```

**Response (200):**
```json
{
  "data": {
    "stockAnalysis": {
      "id": 1,
      "symbol": "AAPL",
      "favorite": true,
      "market": "US",
      "minPctChange": 3.0,
      "updatedAt": "2025-01-15T10:30:00.000Z"
    }
  }
}
```

**Error Responses:**
- `400` - Invalid market value or no valid fields to update
- `401` - Unauthorized
- `404` - Stock analysis not found
- `500` - Server error

---

### POST /api/stock-analyses/bulk-update-min-pct-change

Bulk update the `minPctChange` (Min Change threshold) for multiple stock analyses by symbol.

**Path:**  
`POST /api/stock-analyses/bulk-update-min-pct-change`

**Request Body:**
```json
{
  "symbols": ["SNAP", "AAPL"],   // Required: 1–500 stock symbols
  "minPctChange": 3.0            // Optional: positive number (defaults to 3.0)
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Updated minPctChange to 3.0 for 2 analysis(es).",
  "data": {
    "targetMinPctChange": 3.0,
    "totalMatched": 3,
    "totalUpdated": 2,
    "totalSkipped": 1,
    "symbols": ["SNAP", "AAPL"]
  }
}
```

**Error Responses:**
- `400` - Invalid input (validation failed)
- `401` - Unauthorized
- `404` - No stock analyses found for provided symbols
- `500` - Server error

---

### DELETE /api/stock-analyses/:id

Delete stock analysis (Admin role required).

**Path Parameters:**
- `id` (required, number) - Stock analysis ID

**Response (200):**
```json
{
  "success": true,
  "message": "Stock analysis deleted successfully"
}
```

**Note:** This endpoint:
- Deletes associated daily factor data
- Deletes associated daily scores
- Deletes associated factor tables
- Deletes earnings data (by symbol)
- Deletes the CSV file if it exists
- Deletes the stock analysis record

**Error Responses:**
- `400` - Invalid stock analysis ID
- `401` - Unauthorized
- `403` - Insufficient permissions (Admin role required)
- `404` - Stock analysis not found
- `500` - Server error

---

### GET /api/stock-analyses/:id/daily-factor-data

Get daily factor data for stock analysis (paginated).

**Path Parameters:**
- `id` (required, number) - Stock analysis ID

**Query Parameters:**
- `page` (optional, number, default: 1) - Page number
- `limit` (optional, number, default: 20, max: 50000) - Items per page (use `0` to fetch all)

**Response (200):**
```json
{
  "data": {
    "items": [
      {
        "Date": "2025-01-15",
        "Close": 150.25,
        "Open": 149.50,
        "High": 151.00,
        "Low": 149.00,
        "Volume": 1000000,
        "pct_change": 0.5,
        "MA20": 148.50,
        "MA50": 147.00,
        "MA200": 145.00,
        "RSI": 65.5,
        "volume_spike": true,
        "break_ma50": true,
        "break_ma200": false,
        "rsi_over_60": true,
        "market_up": true,
        "sector_up": false
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 252,
      "totalPages": 13
    }
  }
}
```

**Error Responses:**
- `401` - Unauthorized
- `500` - Server error

---

### GET /api/stock-analyses/:id/daily-scores

Get daily scoring data for stock analysis (paginated, sorted).

**Path Parameters:**
- `id` (required, number) - Stock analysis ID

**Query Parameters:**
- `page` (optional, number, default: 1) - Page number
- `limit` (optional, number, default: 20) - Items per page
- `orderBy` (optional, string, default: "date") - Sort field: "date" | "score"
- `order` (optional, string, default: "desc") - Sort order: "asc" | "desc"

**Response (200):**
```json
{
  "data": {
    "items": [
      {
        "date": "2025-01-15",
        "score": 75.5,
        "prediction": "HIGH_PROBABILITY",
        "confidence": 0.85,
        "factors": {
          "volume_spike": true,
          "break_ma50": true,
          "market_up": true
        },
        "factorBreakdown": {
          "volume_spike": 25,
          "break_ma50": 15,
          "market_up": 20
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 252,
      "totalPages": 13
    }
  }
}
```

**Error Responses:**
- `401` - Unauthorized
- `500` - Server error

---

### GET /api/stock-analyses/:id/predictions

Get current market predictions based on recent factor data.

**Path Parameters:**
- `id` (required, number) - Stock analysis ID

**Query Parameters:**
- `orderBy` (optional, string, default: "date") - Sort field: "date" | "score" | "confidence" | "prediction"
- `order` (optional, string, default: "desc") - Sort order: "asc" | "desc"

**Response (200):**
```json
{
  "data": {
    "predictions": [
      {
        "symbol": "AAPL",
        "date": "2025-01-15",
        "score": 75.5,
        "prediction": "HIGH_PROBABILITY",
        "confidence": 0.85,
        "factors": {
          "volume_spike": true,
          "break_ma50": true,
          "market_up": true
        }
      }
    ]
  }
}
```

**Prediction Levels:**
- `HIGH_PROBABILITY` - Score above threshold (default: 45%)
- `MODERATE` - Score near threshold
- `LOW_PROBABILITY` - Score below threshold

**Error Responses:**
- `401` - Unauthorized
- `404` - Stock analysis not found
- `500` - Server error

---

## Common Error Response Format

All error responses follow this format:

```json
{
  "error": "Error message",
  "message": "Detailed error message (optional)",
  "details": {
    "name": "ErrorName",
    "message": "Detailed message"
  }
}
```

**HTTP Status Codes:**
- `200` - Success
- `201` - Created
- `400` - Bad Request (validation errors, missing required fields)
- `401` - Unauthorized (authentication required)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found (resource doesn't exist)
- `500` - Internal Server Error
- `503` - Service Unavailable (external service not configured)

---

## CSV File Format

CSV files should have the following columns:
- `Date` (required) - Date in YYYY-MM-DD format
- `Close` (required) - Closing price
- `Open` (optional) - Opening price
- `High` (optional) - High price
- `Low` (optional) - Low price
- `Volume` (optional) - Trading volume

Example:
```csv
Date,Open,High,Low,Close,Volume
2025-01-15,149.50,151.00,149.00,150.25,1000000
2025-01-14,148.00,149.50,147.50,149.00,950000
```

---

## Notes

1. **Authentication**: All endpoints require authentication via session cookies. Use `getCurrentUser()` helper on backend.

2. **Pagination**: Use `limit=0` to fetch all records (useful for daily-factor-data endpoint).

3. **Period Analysis**: When `periodInfo` is present in results, the analysis is filtered to a specific date range.

4. **Status Flow**: 
   - `draft` → `analyzing` → `processing` → `completed`
   - On error: `failed` or `factor_failed`

5. **File Paths**: CSV file paths are stored as absolute paths. The system handles both relative and absolute paths.

6. **Data Sources**:
   - US stocks: Yahoo Finance API
   - Vietnamese stocks: CafeF API or vnstock API

7. **Factor Analysis**: Factors are calculated automatically when CSV data is uploaded or imported.

8. **AI Analysis**: Triggered via `/analyze` endpoint, includes insights and price recommendations.
