# Stock Analyses API - Filtering Specification

## Overview
This specification defines the filtering capabilities for all Stock Analyses API endpoints. All filters are optional and can be combined to create complex queries.

## General Filter Rules

1. **All filters are optional** - Endpoints work without any filters
2. **Filters are combined with AND logic** - All specified filters must match
3. **Case-insensitive string matching** - Symbol and name filters are case-insensitive
4. **Date formats** - Accept ISO 8601 date strings (YYYY-MM-DD or full ISO format)
5. **Multiple values** - Some filters accept comma-separated values (e.g., `status=completed,draft`)
6. **Backward compatible** - Existing API calls without filters continue to work

---

## 1. GET /api/stock-analyses - List Stock Analyses

### Filter Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `symbol` | string | Filter by symbol (contains, case-insensitive) | `symbol=AAPL` or `symbol=APP` |
| `market` | string | Filter by market (exact match) | `market=US` or `market=VN` |
| `status` | string | Filter by status (comma-separated for multiple) | `status=completed` or `status=completed,draft` |
| `favorite` | boolean | Filter by favorite flag | `favorite=true` or `favorite=false` |
| `createdFrom` | date | Filter by creation date from (inclusive) | `createdFrom=2024-01-01` |
| `createdTo` | date | Filter by creation date to (inclusive) | `createdTo=2025-01-15` |
| `updatedFrom` | date | Filter by update date from (inclusive) | `updatedFrom=2024-01-01` |
| `updatedTo` | date | Filter by update date to (inclusive) | `updatedTo=2025-01-15` |
| `minPrice` | number | Filter by minimum latest price | `minPrice=100` |
| `maxPrice` | number | Filter by maximum latest price | `maxPrice=200` |
| `page` | number | Page number (existing) | `page=1` |
| `limit` | number | Items per page (existing) | `limit=20` |

### Filter Details

#### Symbol Filter
- **Type**: String
- **Matching**: Case-insensitive contains search
- **Example**: `symbol=AAPL` matches "AAPL", "AAPL-USD", etc.
- **Implementation**: Prisma `contains` with `mode: 'insensitive'`

#### Market Filter
- **Type**: String enum ("US" | "VN")
- **Matching**: Exact match
- **Example**: `market=US` matches only US market analyses
- **Implementation**: Prisma exact match

#### Status Filter
- **Type**: String (comma-separated for multiple values)
- **Valid Values**: `draft`, `analyzing`, `processing`, `completed`, `failed`, `factor_failed`, `ai_processing`, `ai_completed`
- **Example**: `status=completed,draft` matches analyses with either status
- **Implementation**: Prisma `in` operator

#### Favorite Filter
- **Type**: Boolean string ("true" | "false")
- **Matching**: Exact boolean match
- **Example**: `favorite=true` matches only favorited analyses
- **Implementation**: Prisma boolean field

#### Date Range Filters
- **Type**: ISO 8601 date string (YYYY-MM-DD or full ISO format)
- **Inclusive**: Both `from` and `to` dates are inclusive
- **Example**: `createdFrom=2024-01-01&createdTo=2024-12-31`
- **Implementation**: Prisma `gte` (greater than or equal) and `lte` (less than or equal)
- **Validation**: Must be valid date strings

#### Price Range Filters
- **Type**: Number (float)
- **Matching**: Range filtering on `latestPrice` field
- **Example**: `minPrice=100&maxPrice=200` matches prices between 100 and 200
- **Implementation**: Prisma `gte` and `lte` on `latestPrice` field
- **Note**: Only applies to analyses with `latestPrice` set (non-null)

### Request Examples

```http
# Filter by symbol
GET /api/stock-analyses?symbol=AAPL

# Filter by market and status
GET /api/stock-analyses?market=US&status=completed

# Filter by date range
GET /api/stock-analyses?createdFrom=2024-01-01&createdTo=2024-12-31

# Filter favorites only
GET /api/stock-analyses?favorite=true

# Combined filters with pagination
GET /api/stock-analyses?market=US&status=completed&favorite=true&minPrice=100&page=1&limit=20

# Multiple statuses
GET /api/stock-analyses?status=completed,draft,processing
```

### Response Format
Response format remains unchanged - filters only affect which items are returned:

```json
{
  "data": {
    "items": [
      {
        "id": 1,
        "symbol": "AAPL",
        "market": "US",
        "status": "completed",
        "favorite": true,
        "latestPrice": 150.25,
        "createdAt": "2024-06-15T10:30:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 5,
      "totalPages": 1
    }
  }
}
```

---

## 2. GET /api/stock-analyses/:id/daily-factor-data

### Filter Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `dateFrom` | date | Filter by date from (inclusive) | `dateFrom=2024-01-01` |
| `dateTo` | date | Filter by date to (inclusive) | `dateTo=2024-12-31` |
| `minClose` | number | Filter by minimum closing price | `minClose=100` |
| `maxClose` | number | Filter by maximum closing price | `maxClose=200` |
| `minVolume` | number | Filter by minimum volume | `minVolume=1000000` |
| `maxVolume` | number | Filter by maximum volume | `maxVolume=5000000` |
| `volume_spike` | boolean | Filter by volume spike flag | `volume_spike=true` |
| `break_ma50` | boolean | Filter by MA50 break flag | `break_ma50=true` |
| `break_ma200` | boolean | Filter by MA200 break flag | `break_ma200=true` |
| `rsi_over_60` | boolean | Filter by RSI over 60 flag | `rsi_over_60=true` |
| `market_up` | boolean | Filter by market up flag | `market_up=true` |
| `sector_up` | boolean | Filter by sector up flag | `sector_up=true` |
| `earnings_window` | boolean | Filter by earnings window flag | `earnings_window=true` |
| `short_covering` | boolean | Filter by short covering flag | `short_covering=true` |
| `macro_tailwind` | boolean | Filter by macro tailwind flag | `macro_tailwind=true` |
| `news_positive` | boolean | Filter by positive news flag | `news_positive=true` |
| `page` | number | Page number (existing) | `page=1` |
| `limit` | number | Items per page (existing, max: 50000) | `limit=20` |

### Filter Details

#### Date Range Filter
- **Type**: ISO 8601 date string (YYYY-MM-DD)
- **Field**: `date` field in DailyFactorData
- **Inclusive**: Both dates are inclusive
- **Example**: `dateFrom=2024-01-01&dateTo=2024-12-31`
- **Implementation**: Prisma `gte` and `lte` on `date` field

#### Price Range Filter
- **Type**: Number (float)
- **Field**: `close` field
- **Example**: `minClose=100&maxClose=200`
- **Implementation**: Prisma `gte` and `lte` on `close` field

#### Volume Range Filter
- **Type**: Number (integer)
- **Field**: `volume` field
- **Example**: `minVolume=1000000&maxVolume=5000000`
- **Implementation**: Prisma `gte` and `lte` on `volume` field
- **Note**: Only applies to records with non-null volume

#### Factor Flag Filters
- **Type**: Boolean string ("true" | "false")
- **Fields**: Corresponding boolean fields in DailyFactorData
- **Example**: `volume_spike=true&break_ma50=true`
- **Implementation**: Prisma boolean field matching
- **Note**: Multiple factor flags can be combined (AND logic)

### Request Examples

```http
# Filter by date range
GET /api/stock-analyses/1/daily-factor-data?dateFrom=2024-01-01&dateTo=2024-12-31

# Filter by price range
GET /api/stock-analyses/1/daily-factor-data?minClose=100&maxClose=200

# Filter by factor flags
GET /api/stock-analyses/1/daily-factor-data?volume_spike=true&break_ma50=true

# Combined filters
GET /api/stock-analyses/1/daily-factor-data?dateFrom=2024-01-01&dateTo=2024-12-31&volume_spike=true&minClose=100&page=1&limit=50

# Filter by multiple factors
GET /api/stock-analyses/1/daily-factor-data?volume_spike=true&break_ma50=true&rsi_over_60=true&market_up=true
```

### Response Format
Response format remains unchanged:

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
        "market_up": true
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

---

## 3. GET /api/stock-analyses/:id/daily-scores

### Filter Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `dateFrom` | date | Filter by date from (inclusive) | `dateFrom=2024-01-01` |
| `dateTo` | date | Filter by date to (inclusive) | `dateTo=2024-12-31` |
| `minScore` | number | Filter by minimum score (0-100) | `minScore=50` |
| `maxScore` | number | Filter by maximum score (0-100) | `maxScore=80` |
| `prediction` | string | Filter by prediction level | `prediction=HIGH_PROBABILITY` |
| `aboveThreshold` | boolean | Filter by threshold status | `aboveThreshold=true` |
| `page` | number | Page number (existing) | `page=1` |
| `limit` | number | Items per page (existing) | `limit=20` |
| `orderBy` | string | Sort field (existing) | `orderBy=date` or `orderBy=score` |
| `order` | string | Sort order (existing) | `order=asc` or `order=desc` |

### Filter Details

#### Date Range Filter
- **Type**: ISO 8601 date string (YYYY-MM-DD)
- **Field**: `date` field in DailyScore
- **Inclusive**: Both dates are inclusive
- **Implementation**: In-memory filtering after fetching all scores

#### Score Range Filter
- **Type**: Number (0-100)
- **Field**: `score` field
- **Example**: `minScore=50&maxScore=80`
- **Implementation**: In-memory filtering
- **Validation**: Scores are typically 0-100, but no hard limit enforced

#### Prediction Filter
- **Type**: String enum
- **Valid Values**: `HIGH_PROBABILITY`, `MODERATE`, `LOW_PROBABILITY`
- **Matching**: Exact match
- **Example**: `prediction=HIGH_PROBABILITY`
- **Implementation**: In-memory filtering on `prediction` field

#### Above Threshold Filter
- **Type**: Boolean string ("true" | "false")
- **Field**: `aboveThreshold` field
- **Example**: `aboveThreshold=true`
- **Implementation**: In-memory filtering

**Note**: Since daily scores are calculated on-demand, filtering happens in-memory after fetching all scores but before sorting and pagination.

### Request Examples

```http
# Filter by date range
GET /api/stock-analyses/1/daily-scores?dateFrom=2024-01-01&dateTo=2024-12-31

# Filter by score range
GET /api/stock-analyses/1/daily-scores?minScore=50&maxScore=80

# Filter by prediction level
GET /api/stock-analyses/1/daily-scores?prediction=HIGH_PROBABILITY

# Filter above threshold only
GET /api/stock-analyses/1/daily-scores?aboveThreshold=true

# Combined filters with sorting
GET /api/stock-analyses/1/daily-scores?dateFrom=2024-01-01&minScore=50&prediction=HIGH_PROBABILITY&orderBy=score&order=desc&page=1&limit=20
```

### Response Format
Response format remains unchanged:

```json
{
  "data": {
    "items": [
      {
        "date": "2024-06-15",
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
      "total": 30,
      "totalPages": 2
    }
  }
}
```

---

## 4. GET /api/stock-analyses/:id/predictions

### Filter Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `dateFrom` | date | Filter by date from (inclusive) | `dateFrom=2024-01-01` |
| `dateTo` | date | Filter by date to (inclusive) | `dateTo=2024-12-31` |
| `minScore` | number | Filter by minimum score (0-100) | `minScore=50` |
| `maxScore` | number | Filter by maximum score (0-100) | `maxScore=80` |
| `prediction` | string | Filter by prediction level | `prediction=HIGH_PROBABILITY` |
| `minConfidence` | number | Filter by minimum confidence (0-1) | `minConfidence=0.7` |
| `maxConfidence` | number | Filter by maximum confidence (0-1) | `maxConfidence=0.9` |
| `orderBy` | string | Sort field (existing) | `orderBy=date`, `orderBy=score`, `orderBy=confidence`, `orderBy=prediction` |
| `order` | string | Sort order (existing) | `order=asc` or `order=desc` |

### Filter Details

#### Date Range Filter
- **Type**: ISO 8601 date string (YYYY-MM-DD)
- **Field**: `date` field in Prediction
- **Inclusive**: Both dates are inclusive
- **Implementation**: In-memory filtering after generating predictions

#### Score Range Filter
- **Type**: Number (0-100)
- **Field**: `score` field
- **Example**: `minScore=50&maxScore=80`
- **Implementation**: In-memory filtering

#### Prediction Filter
- **Type**: String enum
- **Valid Values**: `HIGH_PROBABILITY`, `MODERATE`, `LOW_PROBABILITY`
- **Matching**: Exact match
- **Example**: `prediction=HIGH_PROBABILITY`
- **Implementation**: In-memory filtering

#### Confidence Range Filter
- **Type**: Number (0-1)
- **Field**: `confidence` field
- **Example**: `minConfidence=0.7&maxConfidence=0.9`
- **Implementation**: In-memory filtering
- **Validation**: Confidence values are typically 0.0-1.0

**Note**: Since predictions are generated on-demand, filtering happens in-memory after generation but before sorting.

### Request Examples

```http
# Filter by date range
GET /api/stock-analyses/1/predictions?dateFrom=2024-01-01&dateTo=2024-12-31

# Filter by score and confidence
GET /api/stock-analyses/1/predictions?minScore=50&minConfidence=0.7

# Filter by prediction level
GET /api/stock-analyses/1/predictions?prediction=HIGH_PROBABILITY

# Combined filters with sorting
GET /api/stock-analyses/1/predictions?minScore=50&prediction=HIGH_PROBABILITY&minConfidence=0.7&orderBy=score&order=desc
```

### Response Format
Response format remains unchanged:

```json
{
  "data": {
    "predictions": [
      {
        "symbol": "AAPL",
        "date": "2024-06-15",
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

---

## Implementation Details

### Filter Parsing Utilities

All filters will be parsed using utility functions in `src/lib/filter-utils.ts`:

```typescript
// Example structure
interface StockAnalysisFilters {
  symbol?: string;
  market?: 'US' | 'VN';
  status?: string[];
  favorite?: boolean;
  createdFrom?: Date;
  createdTo?: Date;
  updatedFrom?: Date;
  updatedTo?: Date;
  minPrice?: number;
  maxPrice?: number;
}

interface DailyFactorFilters {
  dateFrom?: string;
  dateTo?: string;
  minClose?: number;
  maxClose?: number;
  minVolume?: number;
  maxVolume?: number;
  volume_spike?: boolean;
  break_ma50?: boolean;
  break_ma200?: boolean;
  rsi_over_60?: boolean;
  market_up?: boolean;
  sector_up?: boolean;
  earnings_window?: boolean;
  short_covering?: boolean;
  macro_tailwind?: boolean;
  news_positive?: boolean;
}
```

### Prisma Query Building

Filters are converted to Prisma `where` clauses:

```typescript
// Example for stock analyses
const where: any = {
  ...(symbol && { symbol: { contains: symbol, mode: 'insensitive' } }),
  ...(market && { market }),
  ...(status && status.length > 0 && { status: { in: status } }),
  ...(favorite !== undefined && { favorite }),
  ...(createdFrom || createdTo ? {
    createdAt: {
      ...(createdFrom && { gte: createdFrom }),
      ...(createdTo && { lte: createdTo })
    }
  } : {}),
  ...(minPrice || maxPrice ? {
    latestPrice: {
      ...(minPrice && { gte: minPrice }),
      ...(maxPrice && { lte: maxPrice }),
      not: null // Only include records with price set
    }
  } : {})
};
```

### In-Memory Filtering

For endpoints that calculate data on-demand (daily-scores, predictions), filters are applied in-memory:

```typescript
// Example for daily scores
let filteredScores = allScores.filter(score => {
  if (dateFrom && score.date < dateFrom) return false;
  if (dateTo && score.date > dateTo) return false;
  if (minScore !== undefined && score.score < minScore) return false;
  if (maxScore !== undefined && score.score > maxScore) return false;
  if (prediction && score.prediction !== prediction) return false;
  if (aboveThreshold !== undefined && score.aboveThreshold !== aboveThreshold) return false;
  return true;
});
```

---

## Error Handling

### Validation Errors

Invalid filter values return `400 Bad Request`:

```json
{
  "error": "Invalid filter parameter",
  "message": "Invalid date format for 'dateFrom'. Expected YYYY-MM-DD format.",
  "parameter": "dateFrom",
  "value": "invalid-date"
}
```

### Common Validation Rules

1. **Date Formats**: Must be valid ISO 8601 dates (YYYY-MM-DD or full ISO format)
2. **Boolean Values**: Must be "true" or "false" (case-insensitive)
3. **Numeric Values**: Must be valid numbers
4. **Enum Values**: Must match valid enum values
5. **Date Ranges**: `from` date must be before or equal to `to` date

---

## Performance Considerations

1. **Database Indexes**: Ensure indexes exist on frequently filtered fields:
   - `symbol` (for symbol filtering)
   - `market` (for market filtering)
   - `status` (for status filtering)
   - `createdAt`, `updatedAt` (for date range filtering)
   - `date` in DailyFactorData (for date filtering)
   - `latestPrice` (for price range filtering)

2. **In-Memory Filtering**: For daily-scores and predictions, filtering happens after data calculation. Consider caching if performance becomes an issue.

3. **Pagination**: Always combine filters with pagination to limit result sets.

---

## Testing Scenarios

### Test Cases

1. **Single Filter**: Test each filter individually
2. **Combined Filters**: Test multiple filters together
3. **Edge Cases**: Empty results, invalid dates, invalid values
4. **Pagination**: Test filters with pagination
5. **Backward Compatibility**: Test endpoints without filters
6. **Date Ranges**: Test various date range scenarios
7. **Boolean Filters**: Test true/false values
8. **Multiple Values**: Test comma-separated status values

### Example Test Requests

```http
# Test 1: Single filter
GET /api/stock-analyses?symbol=AAPL

# Test 2: Multiple filters
GET /api/stock-analyses?market=US&status=completed&favorite=true

# Test 3: Date range
GET /api/stock-analyses?createdFrom=2024-01-01&createdTo=2024-12-31

# Test 4: Invalid date (should return 400)
GET /api/stock-analyses?createdFrom=invalid-date

# Test 5: Empty result set
GET /api/stock-analyses?symbol=NONEXISTENT

# Test 6: Factor flags combination
GET /api/stock-analyses/1/daily-factor-data?volume_spike=true&break_ma50=true&rsi_over_60=true

# Test 7: Score range with prediction
GET /api/stock-analyses/1/daily-scores?minScore=50&maxScore=80&prediction=HIGH_PROBABILITY
```

---

## Migration Notes

- All filters are **additive** - existing functionality remains unchanged
- No database migrations required
- No breaking changes to existing API contracts
- Frontend can gradually adopt filters without breaking existing code

---

## Future Enhancements

Potential future filtering capabilities:

1. **OR Logic**: Support for OR conditions (e.g., `status=completed OR status=draft`)
2. **Full-Text Search**: Search across multiple fields (symbol, name)
3. **Advanced Date Filters**: Relative dates (e.g., `createdInLast=30days`)
4. **Nested Filters**: Filter by related data (e.g., analyses with specific factor patterns)
5. **Sorting Enhancements**: Sort by filtered fields
6. **Filter Presets**: Save and reuse common filter combinations
