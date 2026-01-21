# Stock Analyses API - Filtering API Reference

Quick reference guide for all filtering parameters available in the Stock Analyses API.

## Quick Navigation
- [GET /api/stock-analyses](#get-apistock-analyses)
- [GET /api/stock-analyses/:id/daily-factor-data](#get-apistock-analysesiddaily-factor-data)
- [GET /api/stock-analyses/:id/daily-scores](#get-apistock-analysesiddaily-scores)
- [GET /api/stock-analyses/:id/predictions](#get-apistock-analysesidpredictions)

---

## GET /api/stock-analyses

List all stock analyses with optional filtering.

### Filter Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `symbol` | string | Filter by symbol (contains, case-insensitive) | `?symbol=AAPL` |
| `market` | enum | Filter by market: `US` or `VN` | `?market=US` |
| `status` | string | Filter by status (comma-separated) | `?status=completed,draft` |
| `favorite` | boolean | Filter by favorite flag | `?favorite=true` |
| `createdFrom` | date | Created date from (inclusive) | `?createdFrom=2024-01-01` |
| `createdTo` | date | Created date to (inclusive) | `?createdTo=2024-12-31` |
| `updatedFrom` | date | Updated date from (inclusive) | `?updatedFrom=2024-01-01` |
| `updatedTo` | date | Updated date to (inclusive) | `?updatedTo=2024-12-31` |
| `minPrice` | number | Minimum latest price | `?minPrice=100` |
| `maxPrice` | number | Maximum latest price | `?maxPrice=200` |
| `page` | number | Page number (default: 1) | `?page=1` |
| `limit` | number | Items per page (default: 20) | `?limit=20` |

### Valid Status Values
- `draft` - Initial draft state
- `analyzing` - Analysis in progress
- `processing` - Data processing
- `completed` - Analysis complete
- `failed` - Analysis failed
- `factor_failed` - Factor analysis failed
- `ai_processing` - AI processing
- `ai_completed` - AI analysis complete

### Example Requests

```bash
# Basic symbol search
GET /api/stock-analyses?symbol=AAPL

# US market completed analyses
GET /api/stock-analyses?market=US&status=completed

# Favorites with price range
GET /api/stock-analyses?favorite=true&minPrice=50&maxPrice=150

# Date range with pagination
GET /api/stock-analyses?createdFrom=2024-01-01&createdTo=2024-12-31&page=1&limit=20

# Complex multi-filter query
GET /api/stock-analyses?market=US&status=completed,processing&favorite=true&minPrice=100&page=1
```

### Response Format

```json
{
  "data": {
    "items": [
      {
        "id": 1,
        "symbol": "AAPL",
        "market": "US",
        "name": "Apple Inc.",
        "status": "completed",
        "favorite": true,
        "latestPrice": 150.25,
        "priceChange": 2.5,
        "priceChangePercent": 1.69,
        "createdAt": "2024-06-15T10:30:00.000Z",
        "updatedAt": "2024-06-15T16:45:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 45,
      "totalPages": 3
    }
  }
}
```

---

## GET /api/stock-analyses/:id/daily-factor-data

Get daily technical factor data with optional filtering.

### Filter Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `dateFrom` | date | Date from (YYYY-MM-DD) | `?dateFrom=2024-01-01` |
| `dateTo` | date | Date to (YYYY-MM-DD) | `?dateTo=2024-12-31` |
| `minClose` | number | Minimum closing price | `?minClose=100` |
| `maxClose` | number | Maximum closing price | `?maxClose=200` |
| `minVolume` | number | Minimum volume | `?minVolume=1000000` |
| `maxVolume` | number | Maximum volume | `?maxVolume=5000000` |
| `volume_spike` | boolean | Filter by volume spike | `?volume_spike=true` |
| `break_ma50` | boolean | Filter by MA50 breakout | `?break_ma50=true` |
| `break_ma200` | boolean | Filter by MA200 breakout | `?break_ma200=true` |
| `rsi_over_60` | boolean | Filter by RSI > 60 | `?rsi_over_60=true` |
| `market_up` | boolean | Filter by market rally | `?market_up=true` |
| `sector_up` | boolean | Filter by sector strength | `?sector_up=true` |
| `earnings_window` | boolean | Filter by earnings window | `?earnings_window=true` |
| `short_covering` | boolean | Filter by short covering | `?short_covering=true` |
| `macro_tailwind` | boolean | Filter by macro tailwind | `?macro_tailwind=true` |
| `news_positive` | boolean | Filter by positive news | `?news_positive=true` |
| `page` | number | Page number (default: 1) | `?page=1` |
| `limit` | number | Items per page (default: 20, max: 50000) | `?limit=100` |

### Factor Flag Descriptions

| Flag | Description |
|------|-------------|
| `volume_spike` | Trading volume > 1.5x MA20 |
| `break_ma50` | Price breaks above 50-day moving average |
| `break_ma200` | Price breaks above 200-day moving average |
| `rsi_over_60` | Relative Strength Index > 60 |
| `market_up` | Nasdaq surged significantly |
| `sector_up` | Sector showed strong performance |
| `earnings_window` | Within ±3 days of earnings announcement |
| `short_covering` | High short interest + price increase |
| `macro_tailwind` | Favorable CPI/Fed/rate environment |
| `news_positive` | Positive news sentiment |

### Example Requests

```bash
# Date range only
GET /api/stock-analyses/1/daily-factor-data?dateFrom=2024-01-01&dateTo=2024-12-31

# Single factor flag
GET /api/stock-analyses/1/daily-factor-data?volume_spike=true

# Multiple factors (high probability days)
GET /api/stock-analyses/1/daily-factor-data?volume_spike=true&break_ma50=true&rsi_over_60=true

# Price and volume range
GET /api/stock-analyses/1/daily-factor-data?minClose=140&maxClose=160&minVolume=5000000

# Complex factor combination
GET /api/stock-analyses/1/daily-factor-data?dateFrom=2024-01-01&volume_spike=true&market_up=true&sector_up=true&limit=50
```

### Response Format

```json
{
  "data": {
    "items": [
      {
        "Date": "2024-06-15",
        "Close": 150.25,
        "Open": 149.50,
        "High": 151.00,
        "Low": 149.00,
        "Volume": 10500000,
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
        "sector_up": false,
        "earnings_window": false,
        "short_covering": false,
        "macro_tailwind": true,
        "news_positive": true
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 250,
      "totalPages": 13
    }
  }
}
```

---

## GET /api/stock-analyses/:id/daily-scores

Get daily scoring data with optional filtering.

### Filter Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `dateFrom` | date | Date from (YYYY-MM-DD) | `?dateFrom=2024-01-01` |
| `dateTo` | date | Date to (YYYY-MM-DD) | `?dateTo=2024-12-31` |
| `minScore` | number | Minimum score (0-100) | `?minScore=50` |
| `maxScore` | number | Maximum score (0-100) | `?maxScore=80` |
| `prediction` | enum | Prediction level filter | `?prediction=HIGH_PROBABILITY` |
| `aboveThreshold` | boolean | Filter by threshold status | `?aboveThreshold=true` |
| `page` | number | Page number (default: 1) | `?page=1` |
| `limit` | number | Items per page (default: 20) | `?limit=20` |
| `orderBy` | enum | Sort field: `date` or `score` | `?orderBy=score` |
| `order` | enum | Sort order: `asc` or `desc` | `?order=desc` |

### Valid Prediction Values
- `HIGH_PROBABILITY` - High probability of price movement
- `MODERATE` - Moderate probability
- `LOW_PROBABILITY` - Low probability

### Example Requests

```bash
# High scores only
GET /api/stock-analyses/1/daily-scores?minScore=70

# Specific prediction level
GET /api/stock-analyses/1/daily-scores?prediction=HIGH_PROBABILITY

# Above threshold in date range
GET /api/stock-analyses/1/daily-scores?aboveThreshold=true&dateFrom=2024-01-01&dateTo=2024-03-31

# Score range with sorting
GET /api/stock-analyses/1/daily-scores?minScore=60&maxScore=90&orderBy=score&order=desc

# Top 10 highest scores
GET /api/stock-analyses/1/daily-scores?orderBy=score&order=desc&limit=10
```

### Response Format

```json
{
  "data": {
    "items": [
      {
        "date": "2024-06-15",
        "score": 75.5,
        "prediction": "HIGH_PROBABILITY",
        "confidence": 0.85,
        "aboveThreshold": true,
        "factors": {
          "volume_spike": true,
          "break_ma50": true,
          "rsi_over_60": true,
          "market_up": true,
          "sector_up": false,
          "earnings_window": false,
          "short_covering": false,
          "macro_tailwind": true,
          "news_positive": true
        },
        "factorBreakdown": {
          "volume_spike": 15,
          "break_ma50": 12,
          "rsi_over_60": 10,
          "market_up": 18,
          "macro_tailwind": 12,
          "news_positive": 8
        },
        "factorCount": 6
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 45,
      "totalPages": 3
    }
  }
}
```

---

## GET /api/stock-analyses/:id/predictions

Get market predictions with optional filtering.

### Filter Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `dateFrom` | date | Date from (YYYY-MM-DD) | `?dateFrom=2024-01-01` |
| `dateTo` | date | Date to (YYYY-MM-DD) | `?dateTo=2024-12-31` |
| `minScore` | number | Minimum score (0-100) | `?minScore=50` |
| `maxScore` | number | Maximum score (0-100) | `?maxScore=80` |
| `prediction` | enum | Prediction level filter | `?prediction=HIGH_PROBABILITY` |
| `minConfidence` | number | Minimum confidence (0-1) | `?minConfidence=0.7` |
| `maxConfidence` | number | Maximum confidence (0-1) | `?maxConfidence=0.9` |
| `orderBy` | enum | Sort field | `?orderBy=confidence` |
| `order` | enum | Sort order: `asc` or `desc` | `?order=desc` |

### Valid OrderBy Values
- `date` - Sort by date
- `score` - Sort by score
- `confidence` - Sort by confidence level
- `prediction` - Sort by prediction level (HIGH > MODERATE > LOW)

### Valid Prediction Values
- `HIGH_PROBABILITY` - High probability of price movement
- `MODERATE` - Moderate probability
- `LOW_PROBABILITY` - Low probability

### Example Requests

```bash
# High confidence predictions
GET /api/stock-analyses/1/predictions?minConfidence=0.75

# High probability with good confidence
GET /api/stock-analyses/1/predictions?prediction=HIGH_PROBABILITY&minConfidence=0.8

# Confidence range
GET /api/stock-analyses/1/predictions?minConfidence=0.6&maxConfidence=0.85

# Best quality predictions
GET /api/stock-analyses/1/predictions?minScore=70&minConfidence=0.8&prediction=HIGH_PROBABILITY

# Sorted by confidence
GET /api/stock-analyses/1/predictions?orderBy=confidence&order=desc
```

### Response Format

```json
{
  "data": {
    "predictions": [
      {
        "symbol": "AAPL",
        "date": "2024-06-15",
        "score": 78.5,
        "prediction": "HIGH_PROBABILITY",
        "confidence": 0.87,
        "factors": {
          "volume_spike": true,
          "break_ma50": true,
          "rsi_over_60": true,
          "market_up": true,
          "sector_up": true,
          "earnings_window": false,
          "short_covering": false,
          "macro_tailwind": true,
          "news_positive": true
        },
        "rationale": "Strong technical setup with 7 positive factors including volume spike, MA50 breakout, and positive market conditions."
      }
    ]
  }
}
```

---

## Common Filter Patterns

### Pattern: Recent High-Quality Signals
```bash
GET /api/stock-analyses/1/daily-scores?dateFrom=2025-01-01&minScore=70&prediction=HIGH_PROBABILITY&orderBy=date&order=desc
```

### Pattern: Historical Backtest
```bash
GET /api/stock-analyses/1/daily-factor-data?dateFrom=2024-01-01&dateTo=2024-12-31&volume_spike=true&break_ma50=true&rsi_over_60=true
```

### Pattern: Best Current Opportunities
```bash
GET /api/stock-analyses?market=US&status=completed&favorite=true&minPrice=50&maxPrice=200
```

### Pattern: Earnings Play Scanner
```bash
GET /api/stock-analyses/1/daily-factor-data?earnings_window=true&volume_spike=true&sector_up=true
```

---

## Error Responses

### 400 Bad Request - Invalid Filter
```json
{
  "error": "Invalid filter parameter",
  "message": "Invalid date format. Expected YYYY-MM-DD or ISO 8601 format",
  "parameter": "dateFrom",
  "value": "01-01-2024"
}
```

### 401 Unauthorized
```json
{
  "error": "Unauthorized"
}
```

### 403 Forbidden
```json
{
  "error": "Insufficient permissions"
}
```

### 404 Not Found
```json
{
  "error": "Stock analysis not found"
}
```

### 500 Internal Server Error
```json
{
  "error": "Failed to fetch stock analyses",
  "message": "Detailed error message"
}
```

---

## Data Types Reference

### Date Format
- **Valid**: `2024-01-01`, `2024-01-01T00:00:00Z`, `2024-01-01T10:30:00.000Z`
- **Invalid**: `01-01-2024`, `01/01/2024`, `2024/01/01`

### Boolean Format
- **Valid**: `true`, `false`, `TRUE`, `FALSE`
- **Invalid**: `yes`, `no`, `1`, `0`

### Number Format
- **Valid**: `100`, `150.5`, `0.75`
- **Invalid**: `$100`, `100.5.5`, `abc`

---

## Performance Recommendations

1. **Use Specific Filters**: More specific = faster queries
2. **Combine Filters**: Multiple filters work efficiently together
3. **Use Pagination**: Always paginate large result sets
4. **Leverage Sorting**: Use `orderBy` instead of client-side sorting
5. **Cache Results**: Cache filtered results when appropriate

---

## Notes

- All filters are optional
- Filters use AND logic (all must match)
- Symbol search is case-insensitive
- Backward compatible with existing API
- Authentication required for all endpoints
- Rate limiting applies: 100 requests per 15 minutes
