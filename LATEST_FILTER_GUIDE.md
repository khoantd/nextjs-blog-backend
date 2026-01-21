# Latest Filter - Quick Guide

## Overview

The `latest` filter provides a convenient way to retrieve the most recent stock analysis for a specific symbol.

## Usage

### Basic Syntax

```bash
GET /api/stock-analyses?symbol=AAPL&latest=true
```

### Requirements

- **Required**: Must be used with the `symbol` filter
- **Returns**: Only the single most recent analysis for the specified symbol
- **Error**: Returns 400 if `latest=true` is used without `symbol`

## Examples

### 1. Get Latest Analysis for AAPL

**Request:**
```bash
curl "http://localhost:3001/api/stock-analyses?symbol=AAPL&latest=true"
```

**Response:**
```json
{
  "data": {
    "items": [
      {
        "id": 123,
        "symbol": "AAPL",
        "name": "Apple Inc.",
        "market": "US",
        "status": "completed",
        "favorite": false,
        "createdAt": "2026-01-20T10:30:00Z",
        "updatedAt": "2026-01-20T12:45:00Z",
        "latestPrice": 150.25
      }
    ],
    "pagination": {
      "total": 1,
      "page": 1,
      "limit": 1,
      "totalPages": 1
    }
  }
}
```

### 2. Combine with Other Filters

You can combine `latest` with other filters:

**Request:**
```bash
curl "http://localhost:3001/api/stock-analyses?symbol=AAPL&latest=true&market=US&status=completed"
```

This returns the latest AAPL analysis that is:
- In the US market
- Has status "completed"

### 3. JavaScript/TypeScript Example

```typescript
async function getLatestAnalysis(symbol: string, token: string) {
  const response = await fetch(
    `http://localhost:3001/api/stock-analyses?symbol=${symbol}&latest=true`,
    {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }
  );

  const data = await response.json();

  if (data.data.items.length > 0) {
    return data.data.items[0]; // The latest analysis
  }

  return null; // No analysis found
}

// Usage
const latestAAPL = await getLatestAnalysis('AAPL', userToken);
console.log('Latest AAPL analysis:', latestAAPL);
```

### 4. React Hook Example

```typescript
import { useState, useEffect } from 'react';

function useLatestAnalysis(symbol: string) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!symbol) return;

    setLoading(true);
    fetch(`/api/stock-analyses?symbol=${symbol}&latest=true`)
      .then(res => res.json())
      .then(data => {
        if (data.data.items.length > 0) {
          setAnalysis(data.data.items[0]);
        }
        setLoading(false);
      })
      .catch(err => {
        setError(err);
        setLoading(false);
      });
  }, [symbol]);

  return { analysis, loading, error };
}

// Usage in component
function StockDashboard() {
  const { analysis, loading, error } = useLatestAnalysis('AAPL');

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  if (!analysis) return <div>No analysis found</div>;

  return (
    <div>
      <h2>{analysis.symbol} - {analysis.name}</h2>
      <p>Latest Price: ${analysis.latestPrice}</p>
      <p>Status: {analysis.status}</p>
      <p>Updated: {new Date(analysis.updatedAt).toLocaleString()}</p>
    </div>
  );
}
```

## Error Handling

### Error: latest requires symbol

**Request:**
```bash
curl "http://localhost:3001/api/stock-analyses?latest=true"
```

**Response (400 Bad Request):**
```json
{
  "error": "Invalid filter parameter",
  "message": "The 'latest' filter requires the 'symbol' filter to be specified",
  "parameter": "latest",
  "value": true
}
```

**Fix:** Always include the `symbol` parameter when using `latest`:
```bash
curl "http://localhost:3001/api/stock-analyses?symbol=AAPL&latest=true"
```

## Use Cases

### 1. Dashboard - Show Latest Stock Data

```typescript
// Fetch latest analyses for multiple symbols
const symbols = ['AAPL', 'GOOGL', 'MSFT', 'TSLA'];

const latestAnalyses = await Promise.all(
  symbols.map(symbol =>
    fetch(`/api/stock-analyses?symbol=${symbol}&latest=true`)
      .then(res => res.json())
      .then(data => data.data.items[0])
  )
);

console.log('Latest analyses:', latestAnalyses);
```

### 2. Stock Detail Page

```typescript
// When user clicks on a stock symbol, show its latest analysis
function StockDetailPage({ symbol }) {
  const [analysis, setAnalysis] = useState(null);

  useEffect(() => {
    fetch(`/api/stock-analyses?symbol=${symbol}&latest=true`)
      .then(res => res.json())
      .then(data => {
        if (data.data.items[0]) {
          setAnalysis(data.data.items[0]);

          // Then fetch detailed data using the analysis ID
          const analysisId = data.data.items[0].id;
          fetchFactorData(analysisId);
          fetchScores(analysisId);
          fetchPredictions(analysisId);
        }
      });
  }, [symbol]);

  return <div>...</div>;
}
```

### 3. Auto-refresh Latest Data

```typescript
// Poll for latest analysis every 30 seconds
function useLatestAnalysisPolling(symbol: string, intervalMs = 30000) {
  const [analysis, setAnalysis] = useState(null);

  useEffect(() => {
    const fetchLatest = () => {
      fetch(`/api/stock-analyses?symbol=${symbol}&latest=true`)
        .then(res => res.json())
        .then(data => {
          if (data.data.items[0]) {
            setAnalysis(data.data.items[0]);
          }
        });
    };

    // Fetch immediately
    fetchLatest();

    // Then poll at interval
    const interval = setInterval(fetchLatest, intervalMs);

    return () => clearInterval(interval);
  }, [symbol, intervalMs]);

  return analysis;
}
```

## Comparison: With vs Without Latest Filter

### Without `latest` (Old Way)

```bash
# Get all AAPL analyses, sorted by date
curl "http://localhost:3001/api/stock-analyses?symbol=AAPL&limit=1&page=1"
```

**Issues:**
- Returns paginated results
- Need to handle pagination logic
- Less explicit intent

### With `latest` (New Way)

```bash
# Get latest AAPL analysis
curl "http://localhost:3001/api/stock-analyses?symbol=AAPL&latest=true"
```

**Benefits:**
- Clear intent - "get the latest"
- Always returns 1 result (or 0 if none exist)
- No pagination needed
- Simpler API calls

## Testing

Run the test script:

```bash
./test-latest-filter.sh
```

Or test manually:

```bash
# Test 1: Valid request
curl "http://localhost:3001/api/stock-analyses?symbol=AAPL&latest=true"

# Test 2: Invalid - missing symbol (should fail)
curl "http://localhost:3001/api/stock-analyses?latest=true"

# Test 3: With multiple filters
curl "http://localhost:3001/api/stock-analyses?symbol=AAPL&latest=true&market=US&status=completed"
```

## API Reference

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `symbol` | string | Yes (when using latest) | Stock symbol to filter by |
| `latest` | boolean | No | If true, returns only the most recent analysis for the symbol |
| `market` | string | No | Additional filter for market (US/VN) |
| `status` | string | No | Additional filter for status |
| Other filters | various | No | Can combine with any other existing filters |

## Notes

- The `latest` filter overrides pagination settings
- Always returns maximum 1 result when `latest=true`
- Results are sorted by `createdAt` descending (newest first)
- Can be combined with any other filters (market, status, favorite, price range, etc.)
- Requires authentication (same as the standard GET endpoint)

## See Also

- [FILTERING_API_REFERENCE.md](./FILTERING_API_REFERENCE.md) - Complete API reference
- [FILTERING_EXAMPLES.md](./FILTERING_EXAMPLES.md) - More filtering examples
- [FILTERING_MIGRATION_GUIDE.md](./FILTERING_MIGRATION_GUIDE.md) - Frontend integration guide
