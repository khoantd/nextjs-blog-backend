# Backend API Documentation

Complete API reference for the Next.js Blog Backend CMS.

**Base URL**: `http://localhost:3001` (development) or your production URL

**API Documentation UI**: Available at `/api-docs` (Swagger UI)

## Table of Contents

1. [Authentication](#authentication)
2. [Blog Posts](#blog-posts)
3. [Stock Analysis](#stock-analysis)
4. [Earnings](#earnings)
5. [Stocks](#stocks)
6. [Users](#users)
7. [Workflows](#workflows)
8. [Health Check](#health-check)

---

## Authentication

All endpoints except `/api/auth/*` require authentication via NextAuth session cookies.

### GET /api/auth/test

Test route to verify auth router is working.

**Response:**
```json
{
  "message": "Auth router is working",
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

### GET /api/auth/dev-token

Generate a development JWT token (Dev only).

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### GET /api/auth/providers

Get available authentication providers.

**Response:**
```json
{
  "providers": {
    "google": {
      "id": "google",
      "name": "Google",
      "type": "oauth",
      "signinUrl": "/api/auth/signin/google",
      "callbackUrl": "/api/auth/callback/google"
    }
  }
}
```

### POST /api/auth/register

Register a new user with email/password.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "John Doe"
}
```

**Response (201):**
```json
{
  "data": {
    "user": {
      "id": "1",
      "email": "user@example.com",
      "name": "John Doe",
      "role": "viewer",
      "createdAt": "2025-01-15T10:30:00.000Z"
    },
    "message": "User registered successfully"
  }
}
```

**Error Responses:**
- `400` - User already exists or validation failed
- `500` - Server error

### POST /api/auth/login

Login with email/password.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response (200):**
```json
{
  "data": {
    "user": {
      "id": "1",
      "email": "user@example.com",
      "name": "John Doe",
      "role": "viewer",
      "image": null
    },
    "message": "Login successful"
  }
}
```

**Error Responses:**
- `400` - Invalid input
- `401` - Invalid credentials
- `500` - Server error

### POST /api/auth/set-password

Set password for OAuth user (users who signed in with Google).

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "newpassword123",
  "confirmPassword": "newpassword123"
}
```

**Response (200):**
```json
{
  "data": {
    "message": "Password set successfully"
  }
}
```

**Error Responses:**
- `400` - Password already set or validation failed
- `404` - User not found
- `500` - Server error

### GET /api/auth/password-status

Check if user has password set.

**Query Parameters:**
- `email` (required) - User email address

**Response (200):**
```json
{
  "data": {
    "hasPassword": true,
    "requiresPassword": false,
    "email": "user@example.com"
  }
}
```

**Error Responses:**
- `400` - Invalid email
- `404` - User not found
- `500` - Server error

---

## Blog Posts

### GET /api/blog-posts

Fetch all blog posts (paginated).

**Authentication:** Required (Viewer role minimum)

**Query Parameters:**
- `page` (optional, default: 1) - Page number
- `limit` (optional, default: 20) - Items per page

**Response (200):**
```json
{
  "data": {
    "items": [
      {
        "id": "1",
        "title": "Blog Post Title",
        "subtitle": "Subtitle",
        "markdown": "# Content",
        "status": "draft",
        "createdAt": "2025-01-15T10:30:00.000Z",
        "updatedAt": "2025-01-15T10:30:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 100,
      "totalPages": 5
    }
  }
}
```

**Error Responses:**
- `401` - Unauthorized
- `403` - Insufficient permissions
- `500` - Server error

### POST /api/blog-posts

Create a new blog post.

**Authentication:** Required (Editor role minimum)

**Request Body:**
```json
{
  "title": "Blog Post Title",
  "subtitle": "Optional Subtitle",
  "markdown": "# Blog Content\n\nMarkdown content here..."
}
```

**Response (201):**
```json
{
  "data": {
    "blogPost": {
      "id": "1",
      "title": "Blog Post Title",
      "subtitle": "Optional Subtitle",
      "markdown": "# Blog Content\n\nMarkdown content here...",
      "status": "draft",
      "createdAt": "2025-01-15T10:30:00.000Z"
    }
  }
}
```

**Error Responses:**
- `400` - Title and content are required
- `401` - Unauthorized
- `403` - Insufficient permissions to create posts
- `500` - Server error

---

## Stock Analysis

### GET /api/stock-analyses

Fetch all stock analyses (paginated).

**Authentication:** Required (Viewer role minimum)

**Query Parameters:**
- `page` (optional, default: 1) - Page number
- `limit` (optional, default: 20) - Items per page (use `0` to fetch all)

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
        "createdAt": "2025-01-15T10:30:00.000Z",
        "updatedAt": "2025-01-15T10:30:00.000Z"
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
- `500` - Server error

### POST /api/stock-analyses

Create a new stock analysis.

**Authentication:** Required (Viewer role minimum)

**Request Body:**
```json
{
  "symbol": "AAPL",
  "name": "Apple Inc.",
  "market": "US",
  "csvFilePath": "/path/to/file.csv"
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
      "createdAt": "2025-01-15T10:30:00.000Z"
    }
  }
}
```

**Error Responses:**
- `400` - Symbol is required
- `401` - Unauthorized
- `500` - Server error

### GET /api/stock-analyses/:id

Fetch a specific stock analysis with full data.

**Authentication:** Required (Viewer role minimum)

**Path Parameters:**
- `id` (required) - Stock analysis ID

**Query Parameters:**
- `excludeData` (optional) - Set to `"true"` to exclude daily factor data and scores

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
      "analysisResults": {...},
      "results": {
        "totalDays": 252,
        "transactions": [...],
        "factorAnalysis": {...}
      },
      "dailyFactorData": [...],
      "dailyScores": [...],
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

### GET /api/stock-analyses/:id/status

Get status of stock analysis.

**Authentication:** Required (Viewer role minimum)

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
- `draft` - Initial state
- `analyzing` - Analysis in progress
- `processing` - Processing data
- `completed` - Analysis complete
- `failed` - Analysis failed
- `factor_failed` - Factor calculation failed

### POST /api/stock-analyses/:id/upload

Upload CSV file and trigger analysis.

**Authentication:** Required (Viewer role minimum)

**Request:** Multipart form data
- `csvFile` (required) - CSV file to upload

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
      "results": {...}
    }
  }
}
```

**Error Responses:**
- `400` - No CSV file uploaded
- `401` - Unauthorized
- `404` - Stock analysis not found
- `500` - Server error

### POST /api/stock-analyses/:id/supplement

Upload CSV file to supplement existing analysis (merges with existing data).

**Authentication:** Required (Viewer role minimum)

**Request:** Multipart form data
- `csvFile` (required) - CSV file to upload

**Response (200):**
```json
{
  "success": true,
  "message": "Supplementary data uploaded and merged successfully",
  "data": {
    "stockAnalysis": {
      "id": 1,
      "status": "processing",
      "results": {...}
    }
  }
}
```

**Error Responses:**
- `400` - No CSV file uploaded
- `401` - Unauthorized
- `404` - Stock analysis not found
- `500` - Server error

### POST /api/stock-analyses/:id/import

Import CSV data from existing file path to database.

**Authentication:** Required (Viewer role minimum)

**Response (200):**
```json
{
  "success": true,
  "message": "Data imported successfully",
  "data": {
    "stockAnalysis": {
      "id": 1,
      "status": "completed",
      "results": {...}
    }
  }
}
```

**Error Responses:**
- `400` - No CSV file path associated
- `401` - Unauthorized
- `404` - Stock analysis or CSV file not found
- `500` - Server error

### GET /api/stock-analyses/:id/daily-factor-data

Get daily factor data for stock analysis (paginated).

**Authentication:** Required (Viewer role minimum)

**Query Parameters:**
- `page` (optional, default: 1) - Page number
- `limit` (optional, default: 20, max: 50000) - Items per page (use `0` to fetch all)

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
        "rsi_over_60": true
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

### GET /api/stock-analyses/:id/daily-scores

Get daily scoring data for stock analysis (paginated, sorted).

**Authentication:** Required (Viewer role minimum)

**Query Parameters:**
- `page` (optional, default: 1) - Page number
- `limit` (optional, default: 20) - Items per page
- `orderBy` (optional, default: "date") - Sort field: "date" or "score"
- `order` (optional, default: "desc") - Sort order: "asc" or "desc"

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

### GET /api/stock-analyses/:id/predictions

Get current market predictions based on recent factor data.

**Authentication:** Required (Viewer role minimum)

**Query Parameters:**
- `orderBy` (optional, default: "date") - Sort field: "date", "score", "confidence", or "prediction"
- `order` (optional, default: "desc") - Sort order: "asc" or "desc"

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

### POST /api/stock-analyses/:id/fetch-historical

Fetch historical stock data from API (Yahoo Finance for US, CafeF for VN).

**Authentication:** Required (Viewer role minimum)

**Request Body:**
```json
{
  "period1": "2024-01-01",
  "period2": "2025-01-15",
  "interval": "1d"
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

### POST /api/stock-analyses/:id/fetch-vnstock-csv

Fetch CSV data from vnstock API (Vietnamese stocks only).

**Authentication:** Required (Viewer role minimum)

**Request Body:**
```json
{
  "start_date": "2024-01-01",
  "end_date": "2025-01-15",
  "source": "vci",
  "interval": "D"
}
```

**Query Parameters:**
- `start_date` (optional) - Start date (YYYY-MM-DD), defaults to 1 year ago
- `end_date` (optional) - End date (YYYY-MM-DD), defaults to today
- `source` (optional, default: "vci") - Data source: "vci" or "tcbs"
- `interval` (optional, default: "D") - Interval: "D" (daily), "W" (weekly), "M" (monthly)

**Response (200):**
```json
{
  "success": true,
  "message": "Fetched CSV data from vnstock API for VIC",
  "data": {
    "stockAnalysis": {
      "id": 1,
      "status": "completed",
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

### POST /api/stock-analyses/import-from-vnstock

Create a new stock analysis and import data from vnstock API in one operation.

**Authentication:** Required (Viewer role minimum)

**Request Body:**
```json
{
  "symbol": "VCI",
  "start_date": "2024-01-01",
  "end_date": "2024-12-31",
  "name": "Vietnam Capital Investment",
  "market": "VN",
  "source": "vci",
  "interval": "D"
}
```

**Required Fields:**
- `symbol` (string) - Stock symbol/ticket (e.g., VCI, FPT, VIC)
- `start_date` (string) - Start date in YYYY-MM-DD or DD-MM-YYYY format
- `end_date` (string) - End date in YYYY-MM-DD or DD-MM-YYYY format

**Optional Fields:**
- `name` (string) - Company name
- `market` (string) - Market identifier, defaults to "VN"
- `source` (string) - Data source: "vci" | "tcbs" | "msn", defaults to "vci"
- `interval` (string) - Data interval: "D" | "1W" | "1M" | "1m" | "5m" | "15m" | "30m" | "1H", defaults to "D"

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
      "results": {...}
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
- `400` - Missing required fields, invalid date format, or invalid date range
- `401` - Unauthorized
- `404` - No data returned from vnstock API
- `503` - Vnstock API not configured
- `500` - Server error

### POST /api/stock-analyses/:id/analyze

Trigger full analysis (factor analysis + AI insights + price recommendations).

**Authentication:** Required (Viewer role minimum)

**Request Body:**
```json
{
  "startDate": "2024-01-01",
  "endDate": "2025-01-15",
  "periodId": "period-123"
}
```

**Query Parameters (all optional):**
- `startDate` - Start date for period analysis
- `endDate` - End date for period analysis
- `periodId` - Period identifier

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

### POST /api/stock-analyses/:id/regenerate-with-period

Regenerate analysis for a specific date period.

**Authentication:** Required (Viewer role minimum)

**Request Body:**
```json
{
  "startDate": "2024-01-01",
  "endDate": "2025-01-15",
  "periodId": "period-123"
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
      "results": {...}
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
- `400` - Missing dates, invalid date format, or no data in period
- `401` - Unauthorized
- `404` - Stock analysis not found
- `500` - Server error

### PATCH /api/stock-analyses/:id

Update stock analysis (favorite status, market, Min Change threshold).

**Authentication:** Required (Viewer role minimum)

**Request Body:**
```json
{
  "favorite": true,
  "market": "US",
  "minPctChange": 3.0
}
```

**Fields:**
- `favorite` (optional) - Boolean to toggle favorite status
- `market` (optional) - Market code: "US", "VN", or null
- `minPctChange` (optional) - Positive number representing the minimum percentage change threshold used in factor analysis (default: 4.0)

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

### POST /api/stock-analyses/bulk-update-min-pct-change

Bulk update the `minPctChange` (Min Change threshold) for multiple stock analyses by symbol.

**Authentication:** Required (Viewer role minimum)

**Request Body:**
```json
{
  "symbols": ["SNAP", "AAPL"],
  "minPctChange": 3.0
}
```

**Fields:**
- `symbols` (required) - Array of stock symbols to update (1–500 items)
- `minPctChange` (optional) - Positive number for the new Min Change threshold (defaults to 3.0 if omitted)

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

### DELETE /api/stock-analyses/:id

Delete stock analysis and all associated data.

**Authentication:** Required (Admin role only)

**Response (200):**
```json
{
  "success": true,
  "message": "Stock analysis deleted successfully"
}
```

**Error Responses:**
- `400` - Invalid stock analysis ID
- `401` - Unauthorized
- `403` - Insufficient permissions (Admin only)
- `404` - Stock analysis not found
- `500` - Server error

---

## Earnings

### GET /api/earnings

Fetch all earnings data (paginated).

**Authentication:** Required (Viewer role minimum)

**Query Parameters:**
- `page` (optional, default: 1) - Page number
- `limit` (optional, default: 20) - Items per page
- `symbol` (optional) - Filter by stock symbol

**Response (200):**
```json
{
  "data": {
    "items": [
      {
        "id": 1,
        "symbol": "AAPL",
        "company": "Apple Inc.",
        "earningsDate": "2025-01-15T00:00:00.000Z",
        "reportType": "quarterly",
        "expectedEPS": 2.50,
        "actualEPS": 2.65,
        "revenue": 123000000000,
        "expectedRevenue": 120000000000,
        "createdAt": "2025-01-15T10:30:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 100,
      "totalPages": 5
    }
  }
}
```

**Error Responses:**
- `401` - Unauthorized
- `403` - Insufficient permissions
- `500` - Server error

### POST /api/earnings

Create new earnings data.

**Authentication:** Required (Viewer role minimum)

**Request Body:**
```json
{
  "symbol": "AAPL",
  "company": "Apple Inc.",
  "earningsDate": "2025-01-15",
  "reportType": "quarterly",
  "expectedEPS": 2.50,
  "actualEPS": 2.65,
  "revenue": 123000000000,
  "expectedRevenue": 120000000000
}
```

**Response (201):**
```json
{
  "data": {
    "earnings": {
      "id": 1,
      "symbol": "AAPL",
      "company": "Apple Inc.",
      "earningsDate": "2025-01-15T00:00:00.000Z",
      "reportType": "quarterly",
      "expectedEPS": 2.50,
      "actualEPS": 2.65,
      "revenue": 123000000000,
      "expectedRevenue": 120000000000
    }
  }
}
```

**Error Responses:**
- `400` - Symbol and earnings date are required
- `401` - Unauthorized
- `500` - Server error

### POST /api/earnings/sync

Sync earnings data from Alpha Vantage API.

**Authentication:** Required (Viewer role minimum)

**Request Body:**
```json
{
  "symbols": ["AAPL", "MSFT", "GOOGL"]
}
```

**Response (202):**
```json
{
  "message": "Sync process started"
}
```

**Note:** This endpoint returns immediately and processes data in the background.

**Error Responses:**
- `400` - Invalid request body (symbols array required)
- `401` - Unauthorized
- `500` - Server error

### POST /api/earnings/analyze

Trigger AI analysis for earnings data.

**Authentication:** Required (Viewer role minimum)

**Request Body:**
```json
{
  "symbols": ["AAPL"],
  "earningsIds": [1, 2, 3]
}
```

**Query Parameters (at least one required):**
- `symbols` (optional) - Array of stock symbols to analyze
- `earningsIds` (optional) - Array of earnings record IDs to analyze

**Response (202):**
```json
{
  "message": "Analysis process started"
}
```

**Note:** This endpoint returns immediately and processes analysis in the background.

**Error Responses:**
- `401` - Unauthorized
- `500` - Server error

### GET /api/earnings/:symbol

Get earnings data for a specific symbol.

**Authentication:** Required (Viewer role minimum)

**Path Parameters:**
- `symbol` (required) - Stock symbol (e.g., AAPL)

**Response (200):**
```json
{
  "data": [
    {
      "id": 1,
      "symbol": "AAPL",
      "company": "Apple Inc.",
      "earningsDate": "2025-01-15T00:00:00.000Z",
      "reportType": "quarterly",
      "expectedEPS": 2.50,
      "actualEPS": 2.65,
      "revenue": 123000000000,
      "expectedRevenue": 120000000000
    }
  ]
}
```

**Note:** Returns empty array if no earnings data found (200 status, not 404).

**Error Responses:**
- `400` - Symbol is required
- `401` - Unauthorized
- `403` - Insufficient permissions
- `500` - Server error

---

## Stocks

### GET /api/stocks/price

Get latest stock price.

**Authentication:** Required (Viewer role minimum)

**Query Parameters:**
- `symbol` (required) - Stock symbol (e.g., AAPL, VIC)
- `country` (optional, default: "US") - Market country code: "US" or "VN"

**Response (200):**
```json
{
  "symbol": "AAPL",
  "price": 150.25,
  "currency": "USD",
  "market": "US",
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

**Error Responses:**
- `400` - Missing symbol or invalid symbol type
- `401` - Unauthorized
- `404` - No data found
- `500` - Server error or external API error

---

## Users

### GET /api/users

Fetch all users (Admin only).

**Authentication:** Required (Admin role only)

**Query Parameters:**
- `page` (optional, default: 1) - Page number
- `limit` (optional, default: 20) - Items per page

**Response (200):**
```json
{
  "data": {
    "items": [
      {
        "id": "1",
        "email": "user@example.com",
        "name": "John Doe",
        "role": "viewer",
        "createdAt": "2025-01-15T10:30:00.000Z",
        "updatedAt": "2025-01-15T10:30:00.000Z"
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
- `403` - Forbidden (Requires Admin role)
- `500` - Server error

### PUT /api/users/role

Update user role (Admin only).

**Authentication:** Required (Admin role only)

**Request Body:**
```json
{
  "email": "user@example.com",
  "role": "editor"
}
```

**Valid Roles:**
- `viewer` - Can view content only
- `editor` - Can create and edit content
- `admin` - Full access including user management

**Response (200):**
```json
{
  "data": {
    "user": {
      "id": "1",
      "email": "user@example.com",
      "name": "John Doe",
      "role": "editor"
    }
  }
}
```

**Error Responses:**
- `400` - Invalid input
- `401` - Unauthorized
- `403` - Forbidden (Requires Admin role)
- `500` - Server error

### GET /api/users/by-email

Get user by email (Public endpoint, auto-creates user if not found).

**Authentication:** Not required (Public endpoint)

**Query Parameters:**
- `email` (required) - User email address
- `name` (optional) - User name
- `image` (optional) - User profile image URL

**Response (200):**
```json
{
  "data": {
    "id": "1",
    "email": "user@example.com",
    "name": "John Doe",
    "image": "https://example.com/avatar.jpg",
    "role": "viewer"
  }
}
```

**Note:** This endpoint automatically creates a user if they don't exist (used for NextAuth user syncing).

**Error Responses:**
- `400` - Email parameter is required
- `500` - Server error

### POST /api/users/by-email

Create or update user by email (Public endpoint, for OAuth profile sync).

**Authentication:** Not required (Public endpoint)

**Request Body:**
```json
{
  "email": "user@example.com",
  "name": "John Doe",
  "image": "https://example.com/avatar.jpg"
}
```

**Response (200):**
```json
{
  "data": {
    "id": "1",
    "email": "user@example.com",
    "name": "John Doe",
    "image": "https://example.com/avatar.jpg",
    "role": "viewer"
  }
}
```

**Error Responses:**
- `400` - Email is required
- `500` - Server error

---

## Workflows

### GET /api/workflows

Fetch all workflows.

**Authentication:** Required (Editor role minimum)

**Response (200):**
```json
{
  "data": {
    "workflows": [
      {
        "id": 1,
        "name": "Blog Post Review Workflow",
        "description": "Automated review workflow",
        "workflow": {...},
        "trigger": "blog-post.updated",
        "enabled": true,
        "createdAt": "2025-01-15T10:30:00.000Z",
        "updatedAt": "2025-01-15T10:30:00.000Z"
      }
    ]
  }
}
```

**Error Responses:**
- `401` - Unauthorized
- `403` - Insufficient permissions to manage workflows
- `500` - Server error

### POST /api/workflows

Create a new workflow.

**Authentication:** Required (Editor role minimum)

**Request Body:**
```json
{
  "name": "Blog Post Review Workflow",
  "description": "Automated review workflow",
  "workflow": {
    "actions": [...],
    "edges": [...]
  },
  "trigger": "blog-post.updated",
  "enabled": true
}
```

**Response (201):**
```json
{
  "data": {
    "workflow": {
      "id": 1,
      "name": "Blog Post Review Workflow",
      "description": "Automated review workflow",
      "workflow": {...},
      "trigger": "blog-post.updated",
      "enabled": true,
      "createdAt": "2025-01-15T10:30:00.000Z"
    }
  }
}
```

**Error Responses:**
- `400` - Name and workflow configuration are required
- `401` - Unauthorized
- `403` - Insufficient permissions to create workflows
- `500` - Server error

### PUT /api/workflows/:id

Update a workflow.

**Authentication:** Required (Editor role minimum)

**Path Parameters:**
- `id` (required) - Workflow ID

**Request Body:**
```json
{
  "name": "Updated Workflow Name",
  "description": "Updated description",
  "workflow": {...},
  "trigger": "blog-post.published",
  "enabled": false
}
```

**All fields are optional** - only provided fields will be updated.

**Response (200):**
```json
{
  "data": {
    "workflow": {
      "id": 1,
      "name": "Updated Workflow Name",
      "description": "Updated description",
      "workflow": {...},
      "trigger": "blog-post.published",
      "enabled": false,
      "updatedAt": "2025-01-15T10:30:00.000Z"
    }
  }
}
```

**Error Responses:**
- `401` - Unauthorized
- `403` - Insufficient permissions to update workflows
- `404` - Workflow not found
- `500` - Server error

---

## Health Check

### GET /health

Get server health status.

**Authentication:** Not required (Public endpoint)

**Response (200):**
```json
{
  "status": "ok",
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

---

## Error Responses

All endpoints follow a consistent error response format:

```json
{
  "error": "Error message",
  "message": "Detailed error message (development only)",
  "details": {
    "name": "ErrorName",
    "message": "Error details"
  }
}
```

### Common HTTP Status Codes

- `200` - Success
- `201` - Created
- `202` - Accepted (async operation started)
- `400` - Bad Request (validation error, missing parameters)
- `401` - Unauthorized (authentication required)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `500` - Internal Server Error
- `503` - Service Unavailable (external service error)

---

## Authentication

Most endpoints require authentication via NextAuth session cookies. The authentication middleware extracts the session token from cookies and validates it.

### Session Cookie Names

- `next-auth.session-token` (development)
- `__Secure-next-auth.session-token` (production)

### Role-Based Access Control (RBAC)

**Roles:**
- `viewer` (default) - Can view content
- `editor` - Can create and edit content, manage workflows
- `admin` - Full access including user management and deletion

**Permission Checks:**
- `canViewPosts(role)` - Viewer, Editor, Admin
- `canCreatePost(role)` - Editor, Admin
- `canEditPost(role)` - Editor, Admin
- `canDeletePost(role)` - Admin only
- `canManageWorkflows(role)` - Editor, Admin
- `canManageUsers(role)` - Admin only
- `canDeleteStockAnalysis(role)` - Admin only

---

## Pagination

Most list endpoints support pagination with consistent parameters:

**Query Parameters:**
- `page` (optional, default: 1) - Page number (1-indexed)
- `limit` (optional, default: 20) - Items per page (use `0` to fetch all)

**Response Format:**
```json
{
  "data": {
    "items": [...],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 100,
      "totalPages": 5
    }
  }
}
```

---

## Rate Limiting

The API implements rate limiting:
- **Window:** 15 minutes
- **Limit:** 100 requests per IP per window
- **Response:** `429 Too Many Requests` when limit exceeded

---

## CORS Configuration

CORS is configured to allow requests from:
- Frontend origin (configured via `CORS_ORIGIN` environment variable)
- Server-side requests (no origin)
- Localhost origins in development mode

**Required Headers:**
- `Content-Type: application/json` (for JSON requests)
- `Cookie` header (for authenticated requests)

---

## Swagger Documentation

Interactive API documentation is available at:
- **URL:** `/api-docs`
- **Format:** Swagger UI
- **Features:** Try out endpoints, view request/response schemas, authentication support

---

## Notes

1. **Date Formats:** All dates are in ISO 8601 format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss.sssZ)

2. **File Uploads:** CSV file uploads use multipart/form-data with field name `csvFile`

3. **Background Processing:** Some endpoints (like `/api/earnings/sync` and `/api/earnings/analyze`) return immediately and process data asynchronously

4. **Database Migrations:** The backend can automatically run migrations on startup if `RUN_MIGRATIONS=true` or `AUTO_MIGRATE=true` is set

5. **Error Details:** In development mode, error responses include detailed error messages and stack traces. In production, only generic error messages are returned.

6. **Stock Analysis Status:** Stock analyses go through these statuses: `draft` → `analyzing` → `processing` → `completed` (or `failed`/`factor_failed` on error)

7. **CSV File Paths:** CSV file paths are stored as absolute paths. The backend handles both relative and absolute paths when reading files.
