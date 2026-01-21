# Stock Analyses API - Filtering Usage Examples

This document provides practical examples of using the filtering capabilities implemented for the Stock Analyses API.

## Table of Contents
1. [Stock Analyses List Filters](#stock-analyses-list-filters)
2. [Daily Factor Data Filters](#daily-factor-data-filters)
3. [Daily Scores Filters](#daily-scores-filters)
4. [Predictions Filters](#predictions-filters)
5. [Common Patterns](#common-patterns)
6. [Error Handling](#error-handling)

---

## Stock Analyses List Filters

### Basic Filters

#### Filter by Symbol
Find all analyses containing "AAP" in the symbol:
```bash
GET /api/stock-analyses?symbol=AAP
```

#### Filter by Market
Get only US market stocks:
```bash
GET /api/stock-analyses?market=US
```

Get only Vietnamese market stocks:
```bash
GET /api/stock-analyses?market=VN
```

#### Filter by Status
Get completed analyses:
```bash
GET /api/stock-analyses?status=completed
```

Get multiple statuses:
```bash
GET /api/stock-analyses?status=completed,draft,processing
```

#### Filter Favorites Only
```bash
GET /api/stock-analyses?favorite=true
```

### Date Range Filters

#### Created Date Range
Get analyses created in 2024:
```bash
GET /api/stock-analyses?createdFrom=2024-01-01&createdTo=2024-12-31
```

Recent analyses (last 30 days):
```bash
# Calculate date 30 days ago
GET /api/stock-analyses?createdFrom=2024-12-21
```

#### Updated Date Range
Get recently updated analyses:
```bash
GET /api/stock-analyses?updatedFrom=2025-01-01
```

### Price Range Filters

#### Filter by Latest Price
Stocks priced between $100 and $200:
```bash
GET /api/stock-analyses?minPrice=100&maxPrice=200
```

High-priced stocks only (over $500):
```bash
GET /api/stock-analyses?minPrice=500
```

Penny stocks (under $10):
```bash
GET /api/stock-analyses?maxPrice=10
```

### Combined Filters

#### Complex Query Example 1
US market, completed analyses, favorites only, with prices between $50-$150:
```bash
GET /api/stock-analyses?market=US&status=completed&favorite=true&minPrice=50&maxPrice=150&page=1&limit=20
```

#### Complex Query Example 2
Vietnamese market stocks, multiple statuses, created in Q4 2024:
```bash
GET /api/stock-analyses?market=VN&status=completed,processing&createdFrom=2024-10-01&createdTo=2024-12-31
```

#### Complex Query Example 3
Search for specific symbol pattern in completed analyses:
```bash
GET /api/stock-analyses?symbol=SN&status=completed&favorite=true
```

---

## Daily Factor Data Filters

### Date Range

#### Specific Period
Get data for Q1 2024:
```bash
GET /api/stock-analyses/1/daily-factor-data?dateFrom=2024-01-01&dateTo=2024-03-31
```

#### Recent Data
Last 30 days of factor data:
```bash
GET /api/stock-analyses/1/daily-factor-data?dateFrom=2024-12-21
```

### Price and Volume Filters

#### Price Range
Days with closing price between $140-$160:
```bash
GET /api/stock-analyses/1/daily-factor-data?minClose=140&maxClose=160
```

#### High Volume Days
Days with volume over 10 million:
```bash
GET /api/stock-analyses/1/daily-factor-data?minVolume=10000000
```

#### Combined Price and Volume
High-volume days with specific price range:
```bash
GET /api/stock-analyses/1/daily-factor-data?minClose=150&minVolume=5000000
```

### Factor Flag Filters

#### Single Factor
Days with volume spikes:
```bash
GET /api/stock-analyses/1/daily-factor-data?volume_spike=true
```

Days with MA50 breakouts:
```bash
GET /api/stock-analyses/1/daily-factor-data?break_ma50=true
```

#### Multiple Factors (High Probability Days)
Days with 3+ positive factors:
```bash
GET /api/stock-analyses/1/daily-factor-data?volume_spike=true&break_ma50=true&rsi_over_60=true
```

#### Strong Technical Setup
Breakouts with momentum:
```bash
GET /api/stock-analyses/1/daily-factor-data?break_ma50=true&break_ma200=true&rsi_over_60=true&volume_spike=true
```

#### Market and Sector Alignment
Days when both market and sector were up:
```bash
GET /api/stock-analyses/1/daily-factor-data?market_up=true&sector_up=true
```

#### Fundamental Catalysts
Earnings window with positive macro:
```bash
GET /api/stock-analyses/1/daily-factor-data?earnings_window=true&macro_tailwind=true
```

### Complex Factor Queries

#### Perfect Storm Days
All major factors aligned:
```bash
GET /api/stock-analyses/1/daily-factor-data?volume_spike=true&break_ma50=true&rsi_over_60=true&market_up=true&sector_up=true&news_positive=true
```

#### Short Squeeze Candidates
High short interest with price momentum:
```bash
GET /api/stock-analyses/1/daily-factor-data?short_covering=true&volume_spike=true&break_ma50=true
```

#### Combine Factors with Date Range
Technical breakouts in Q4 2024:
```bash
GET /api/stock-analyses/1/daily-factor-data?dateFrom=2024-10-01&dateTo=2024-12-31&break_ma50=true&volume_spike=true
```

---

## Daily Scores Filters

### Score Range

#### High Scores Only
Scores above 70:
```bash
GET /api/stock-analyses/1/daily-scores?minScore=70
```

Scores between 60-80:
```bash
GET /api/stock-analyses/1/daily-scores?minScore=60&maxScore=80
```

### Prediction Level

#### High Probability Days
```bash
GET /api/stock-analyses/1/daily-scores?prediction=HIGH_PROBABILITY
```

#### Moderate or Higher
Get moderate and high probability predictions (requires two queries):
```bash
GET /api/stock-analyses/1/daily-scores?prediction=MODERATE
GET /api/stock-analyses/1/daily-scores?prediction=HIGH_PROBABILITY
```

### Threshold Filtering

#### Above Threshold Only
```bash
GET /api/stock-analyses/1/daily-scores?aboveThreshold=true
```

#### Below Threshold
```bash
GET /api/stock-analyses/1/daily-scores?aboveThreshold=false
```

### Combined Score Filters

#### High-Quality Signals
High scores with high probability:
```bash
GET /api/stock-analyses/1/daily-scores?minScore=75&prediction=HIGH_PROBABILITY&aboveThreshold=true
```

#### Date Range with Score Filter
High scores in specific period:
```bash
GET /api/stock-analyses/1/daily-scores?dateFrom=2024-01-01&dateTo=2024-03-31&minScore=70
```

### Sorted Results

#### Top Scores (Descending)
```bash
GET /api/stock-analyses/1/daily-scores?orderBy=score&order=desc&limit=10
```

#### Recent High-Probability Days
```bash
GET /api/stock-analyses/1/daily-scores?prediction=HIGH_PROBABILITY&orderBy=date&order=desc&limit=20
```

---

## Predictions Filters

### Score and Confidence

#### High Confidence Predictions
Confidence above 75%:
```bash
GET /api/stock-analyses/1/predictions?minConfidence=0.75
```

#### High Score with High Confidence
```bash
GET /api/stock-analyses/1/predictions?minScore=70&minConfidence=0.8
```

#### Confidence Range
Moderate confidence (60-80%):
```bash
GET /api/stock-analyses/1/predictions?minConfidence=0.6&maxConfidence=0.8
```

### Prediction Level

#### Only High Probability
```bash
GET /api/stock-analyses/1/predictions?prediction=HIGH_PROBABILITY
```

#### Moderate Predictions with Good Confidence
```bash
GET /api/stock-analyses/1/predictions?prediction=MODERATE&minConfidence=0.7
```

### Combined Prediction Filters

#### Best Quality Predictions
High probability, high confidence, high score:
```bash
GET /api/stock-analyses/1/predictions?prediction=HIGH_PROBABILITY&minConfidence=0.85&minScore=75
```

#### Date Range with Quality Filter
Recent high-quality predictions:
```bash
GET /api/stock-analyses/1/predictions?dateFrom=2025-01-01&minConfidence=0.75&minScore=70
```

### Sorted Predictions

#### By Confidence (Highest First)
```bash
GET /api/stock-analyses/1/predictions?orderBy=confidence&order=desc
```

#### By Prediction Level
```bash
GET /api/stock-analyses/1/predictions?orderBy=prediction&order=desc
```

#### By Score
```bash
GET /api/stock-analyses/1/predictions?orderBy=score&order=desc
```

#### By Date (Most Recent First)
```bash
GET /api/stock-analyses/1/predictions?orderBy=date&order=desc
```

---

## Common Patterns

### Pattern 1: Find Best Trading Opportunities

**Step 1:** Find completed US stocks with recent activity
```bash
GET /api/stock-analyses?market=US&status=completed&updatedFrom=2025-01-01&limit=50
```

**Step 2:** For each stock, get high-probability signals
```bash
GET /api/stock-analyses/{id}/daily-scores?prediction=HIGH_PROBABILITY&minScore=70&orderBy=date&order=desc&limit=10
```

**Step 3:** Check current predictions
```bash
GET /api/stock-analyses/{id}/predictions?minConfidence=0.8
```

### Pattern 2: Backtest Factor Combinations

**Step 1:** Get historical data with specific factors
```bash
GET /api/stock-analyses/1/daily-factor-data?dateFrom=2024-01-01&dateTo=2024-12-31&volume_spike=true&break_ma50=true
```

**Step 2:** Check scores for those days
```bash
GET /api/stock-analyses/1/daily-scores?dateFrom=2024-01-01&dateTo=2024-12-31&minScore=60
```

### Pattern 3: Monitor Favorite Stocks

**Step 1:** Get all favorite stocks
```bash
GET /api/stock-analyses?favorite=true&status=completed
```

**Step 2:** Check for recent high-quality signals
```bash
GET /api/stock-analyses/{id}/daily-scores?dateFrom=2025-01-15&minScore=70&aboveThreshold=true
```

### Pattern 4: Sector Analysis

**Step 1:** Get all US tech stocks (filter by symbol patterns)
```bash
GET /api/stock-analyses?market=US&status=completed
```

**Step 2:** For each, check sector-wide strength
```bash
GET /api/stock-analyses/{id}/daily-factor-data?sector_up=true&market_up=true&dateFrom=2025-01-01
```

### Pattern 5: Earnings Play Scanner

**Step 1:** Find stocks with completed analyses
```bash
GET /api/stock-analyses?status=completed&market=US
```

**Step 2:** Check for upcoming earnings with positive factors
```bash
GET /api/stock-analyses/{id}/daily-factor-data?earnings_window=true&volume_spike=true&rsi_over_60=true
```

---

## Error Handling

### Common Validation Errors

#### Invalid Date Format
```bash
GET /api/stock-analyses?createdFrom=01-01-2024
```
Response (400):
```json
{
  "error": "Invalid filter parameter",
  "message": "Invalid date format. Expected YYYY-MM-DD or ISO 8601 format",
  "parameter": "createdFrom",
  "value": "01-01-2024"
}
```

#### Invalid Date Range
```bash
GET /api/stock-analyses?createdFrom=2025-01-01&createdTo=2024-01-01
```
Response (400):
```json
{
  "error": "Invalid filter parameter",
  "message": "createdFrom must be before or equal to createdTo",
  "parameter": "createdFrom",
  "value": "2025-01-01"
}
```

#### Invalid Boolean Value
```bash
GET /api/stock-analyses?favorite=yes
```
Response (400):
```json
{
  "error": "Invalid filter parameter",
  "message": "Invalid boolean value. Expected 'true' or 'false'",
  "parameter": "boolean",
  "value": "yes"
}
```

#### Invalid Enum Value
```bash
GET /api/stock-analyses/1/daily-scores?prediction=VERY_HIGH
```
Response (400):
```json
{
  "error": "Invalid filter parameter",
  "message": "Invalid value. Expected one of: HIGH_PROBABILITY, MODERATE, LOW_PROBABILITY",
  "parameter": "prediction",
  "value": "VERY_HIGH"
}
```

#### Invalid Confidence Range
```bash
GET /api/stock-analyses/1/predictions?minConfidence=1.5
```
Response (400):
```json
{
  "error": "Invalid filter parameter",
  "message": "minConfidence must be between 0 and 1",
  "parameter": "minConfidence",
  "value": "1.5"
}
```

### Valid Date Formats

All of these are accepted:
- `2024-01-01` (YYYY-MM-DD)
- `2024-01-01T00:00:00Z` (ISO 8601 with time)
- `2024-01-01T10:30:00.000Z` (Full ISO 8601)

---

## JavaScript/TypeScript Examples

### Using Fetch API

```typescript
// Stock analyses with filters
const response = await fetch('/api/stock-analyses?' + new URLSearchParams({
  market: 'US',
  status: 'completed',
  favorite: 'true',
  minPrice: '100',
  page: '1',
  limit: '20'
}));
const data = await response.json();

// Daily factor data with multiple factors
const factorResponse = await fetch('/api/stock-analyses/1/daily-factor-data?' + new URLSearchParams({
  dateFrom: '2024-01-01',
  dateTo: '2024-12-31',
  volume_spike: 'true',
  break_ma50: 'true',
  rsi_over_60: 'true'
}));
const factorData = await factorResponse.json();

// Daily scores with filtering
const scoresResponse = await fetch('/api/stock-analyses/1/daily-scores?' + new URLSearchParams({
  minScore: '70',
  prediction: 'HIGH_PROBABILITY',
  orderBy: 'score',
  order: 'desc'
}));
const scores = await scoresResponse.json();

// Predictions with confidence filter
const predictionsResponse = await fetch('/api/stock-analyses/1/predictions?' + new URLSearchParams({
  minConfidence: '0.8',
  minScore: '75',
  orderBy: 'confidence',
  order: 'desc'
}));
const predictions = await predictionsResponse.json();
```

### Using Axios

```typescript
import axios from 'axios';

// Stock analyses
const { data } = await axios.get('/api/stock-analyses', {
  params: {
    market: 'US',
    status: 'completed,processing',
    createdFrom: '2024-01-01',
    minPrice: 50,
    maxPrice: 200
  }
});

// Daily factor data
const factorData = await axios.get('/api/stock-analyses/1/daily-factor-data', {
  params: {
    dateFrom: '2024-01-01',
    volume_spike: true,
    market_up: true,
    limit: 100
  }
});

// Daily scores
const scores = await axios.get('/api/stock-analyses/1/daily-scores', {
  params: {
    minScore: 60,
    maxScore: 90,
    prediction: 'HIGH_PROBABILITY',
    orderBy: 'date',
    order: 'desc'
  }
});
```

### Error Handling in Code

```typescript
try {
  const response = await fetch('/api/stock-analyses?' + new URLSearchParams({
    createdFrom: userInputDate // Could be invalid
  }));

  if (!response.ok) {
    const error = await response.json();

    if (response.status === 400) {
      // Handle validation error
      console.error(`Invalid filter: ${error.parameter} = ${error.value}`);
      console.error(error.message);
    } else if (response.status === 401) {
      // Handle authentication error
      console.error('Unauthorized');
    }
    return;
  }

  const data = await response.json();
  // Process data
} catch (error) {
  console.error('Network error:', error);
}
```

---

## Performance Tips

1. **Use Specific Filters**: More specific filters = faster queries
   - ✅ Good: `?market=US&status=completed&dateFrom=2024-01-01`
   - ❌ Avoid: No filters (returns all data)

2. **Combine Database Filters**: Use multiple filters together for efficiency
   - Factor flags filter at database level for `/daily-factor-data`
   - Status + market filters work together efficiently

3. **Limit Results**: Always use pagination for large datasets
   - Default: `limit=20`
   - Maximum for factor data: `limit=50000`

4. **Sort on Server**: Use `orderBy` parameter instead of client-side sorting
   - Reduces data transfer
   - More efficient for large datasets

5. **Cache Results**: Consider caching filtered results on client
   - Especially for static date ranges
   - Re-fetch only when filters change

---

## Notes

- All filters are optional and can be combined
- Filters use AND logic (all conditions must match)
- Case-insensitive matching for symbol filters
- Backward compatible with all existing API calls
- No authentication changes - existing auth requirements still apply
