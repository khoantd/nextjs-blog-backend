# Predictions API Guide

This guide explains how to generate stock predictions via the API endpoints.

## Overview

The prediction system generates market predictions based on factor analysis data. Predictions include:
- **Score**: Prediction score (0-100)
- **Prediction Level**: `HIGH_PROBABILITY`, `MODERATE`, or `LOW_PROBABILITY`
- **Confidence**: Confidence level (0-100, percentage)
- **Active Factors**: List of active market factors
- **Technical Signals**: Moving averages, RSI, volume analysis
- **Pattern Recognition**: Historical pattern matching
- **Price Data**: Current and predicted price information

## Prerequisites

1. **Stock Analysis Required**: You must have a completed stock analysis with factor data before generating predictions
2. **Authentication**: All endpoints require Bearer token authentication
3. **Factor Data**: The stock analysis must have factor analysis completed (status: `completed`)

## API Endpoints

### 1. Generate Predictions by Stock Analysis ID

**Endpoint**: `GET /api/stock-analyses/:id/predictions`

Generate predictions for a specific stock analysis using its ID.

#### Request

```http
GET /api/stock-analyses/123/predictions?days=5&futureDays=7&minScore=0.45&prediction=HIGH_PROBABILITY
Authorization: Bearer YOUR_TOKEN
```

#### Path Parameters

- `id` (required): Stock analysis ID (integer)

#### Query Parameters

**Basic Parameters:**
- `days` (optional, default: 5): Number of recent days to use for generating predictions (1-50)
- `futureDays` (optional, default: 0): Number of future days to generate predictions for (0-30)
  - Set to `0` for historical predictions only
  - Set to `1-30` to generate future predictions using the most recent factor data as baseline

**Filtering Parameters:**
- `dateFrom` (optional): Filter by date from (ISO 8601 format: YYYY-MM-DD)
- `dateTo` (optional): Filter by date to (ISO 8601 format: YYYY-MM-DD)
- `minScore` (optional): Minimum score filter (0-100)
- `maxScore` (optional): Maximum score filter (0-100)
- `prediction` (optional): Filter by prediction level (`HIGH_PROBABILITY`, `MODERATE`, `LOW_PROBABILITY`)
- `minConfidence` (optional): Minimum confidence filter (0-100, percentage)
- `maxConfidence` (optional): Maximum confidence filter (0-100, percentage)

**Sorting Parameters:**
- `orderBy` (optional, default: `date`): Sort field (`date`, `score`, `confidence`, `prediction`)
- `order` (optional, default: `desc`): Sort order (`asc`, `desc`)

#### Response

```json
{
  "data": {
    "predictions": [
      {
        "symbol": "AAPL",
        "date": "2025-01-22",
        "score": 0.65,
        "prediction": "HIGH_PROBABILITY",
        "confidence": 65.0,
        "threshold": 0.45,
        "aboveThreshold": true,
        "activeFactors": [
          {
            "factor": "volume_spike",
            "name": "Volume Spike",
            "description": "Trading volume significantly above average",
            "weight": 0.25
          }
        ],
        "recommendations": [
          "Monitor for continued volume support",
          "Watch market momentum for confirmation"
        ],
        "interpretation": "AAPL shows high probability of strong upward movement based on current factors",
        "signals": {
          "momentum": {
            "rsi": 65.5,
            "rsiSignal": "bullish",
            "description": "RSI indicates bullish momentum"
          },
          "movingAverages": {
            "ma20": 150.25,
            "ma50": 148.50,
            "ma200": 145.00,
            "priceVsMA20": "above",
            "priceVsMA50": "above",
            "priceVsMA200": "above",
            "alignment": "bullish"
          },
          "volume": {
            "volumeRatio": 1.8,
            "volumeSignal": "high"
          }
        },
        "patterns": {
          "patternType": "breakout",
          "patternStrength": "strong",
          "patternDescription": "Price breaking above key resistance with high volume"
        },
        "priceData": {
          "currentPrice": 152.30,
          "open": 151.50,
          "high": 153.00,
          "low": 151.20,
          "close": 152.30,
          "change": 0.80,
          "changePercent": 0.53
        },
        "isFuture": false,
        "feedback": null
      }
    ],
    "warnings": []
  }
}
```

#### Example: Generate Future Predictions

```bash
# Generate predictions for the next 7 business days
curl -X GET "http://72.60.233.159:3050/api/stock-analyses/123/predictions?futureDays=7&minScore=0.45" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### Example: Filter High-Probability Predictions

```bash
# Get only HIGH_PROBABILITY predictions with confidence >= 50%
curl -X GET "http://72.60.233.159:3050/api/stock-analyses/123/predictions?prediction=HIGH_PROBABILITY&minConfidence=50&minScore=0.45" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### 2. Generate Predictions by Symbol

**Endpoint**: `GET /api/stock-analyses/by-symbol/:symbol/predictions`

Generate predictions by stock symbol/ticker. Automatically finds the latest stock analysis for the symbol.

#### Request

```http
GET /api/stock-analyses/by-symbol/AAPL/predictions?market=US&days=10&futureDays=5
Authorization: Bearer YOUR_TOKEN
```

#### Path Parameters

- `symbol` (required): Stock symbol/ticker (e.g., `AAPL`, `SNAP`, `VIC`)

#### Query Parameters

All parameters from the ID-based endpoint, plus:
- `market` (optional): Market identifier (`US` or `VN`) to help disambiguate symbols

#### Response

Same structure as ID-based endpoint, with additional fields:

```json
{
  "data": {
    "predictions": [...],
    "symbol": "AAPL",
    "analysisId": 123,
    "warnings": []
  }
}
```

#### Example

```bash
# Generate predictions for Apple stock (US market)
curl -X GET "http://72.60.233.159:3050/api/stock-analyses/by-symbol/AAPL/predictions?market=US&futureDays=5" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Generate predictions for Vietnamese stock
curl -X GET "http://72.60.233.159:3050/api/stock-analyses/by-symbol/VIC/predictions?market=VN&futureDays=3" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Common Use Cases

### 1. Get Today's Prediction

```bash
GET /api/stock-analyses/123/predictions?days=1&orderBy=date&order=desc
```

### 2. Generate Weekly Forecast (7 Days Ahead)

```bash
GET /api/stock-analyses/123/predictions?futureDays=7&minScore=0.45&prediction=HIGH_PROBABILITY
```

### 3. Get Historical High-Probability Predictions

```bash
GET /api/stock-analyses/123/predictions?prediction=HIGH_PROBABILITY&minScore=0.45&orderBy=score&order=desc
```

### 4. Filter by Date Range

```bash
GET /api/stock-analyses/123/predictions?dateFrom=2025-01-01&dateTo=2025-01-31&minScore=0.50
```

### 5. Get Predictions with High Confidence

```bash
GET /api/stock-analyses/123/predictions?minConfidence=70&minScore=0.50&prediction=HIGH_PROBABILITY
```

---

## Understanding Prediction Fields

### Score (0-100)
- Calculated based on active factors and their weights
- Higher score = stronger signal
- Threshold typically set at 0.45 (45%)

### Prediction Level
- **HIGH_PROBABILITY**: Score >= threshold (typically 0.45)
- **MODERATE**: Score >= 70% of threshold (typically 0.315)
- **LOW_PROBABILITY**: Score < 70% of threshold

### Confidence (0-100%)
- Percentage confidence in the prediction
- Based on score and historical pattern matching
- Higher confidence = more reliable prediction

### Active Factors
Common factors that influence predictions:
- `volume_spike`: Trading volume significantly above average
- `break_ma50`: Price breaking above/below 50-day moving average
- `break_ma200`: Price breaking above/below 200-day moving average
- `rsi_over_60`: RSI indicator above 60 (bullish momentum)
- `market_up`: Overall market trending up
- `sector_up`: Stock's sector trending up
- `earnings_window`: Near earnings announcement date
- `macro_tailwind`: Positive macroeconomic factors
- `news_positive`: Positive news sentiment
- `short_covering`: Short sellers covering positions

---

## Error Handling

### No Factor Data Available

```json
{
  "data": {
    "predictions": [],
    "message": "No factor data available. Please run factor analysis first."
  }
}
```

**Solution**: Ensure the stock analysis has completed factor analysis before generating predictions.

### Stock Analysis Not Found

```json
{
  "error": "Stock analysis not found",
  "message": "No stock analysis found for symbol \"AAPL\" in market \"US\". Please create a stock analysis first."
}
```

**Solution**: Create a stock analysis first by uploading CSV data or using the stock analysis creation endpoint.

### Invalid Parameters

```json
{
  "error": "Invalid filter parameter",
  "message": "minConfidence must be between 0 and 100",
  "parameter": "minConfidence",
  "value": "150"
}
```

**Solution**: Check parameter values are within valid ranges.

---

## Best Practices

1. **Generate Factor Analysis First**: Always ensure factor analysis is completed before generating predictions
2. **Use Future Days Sparingly**: Generating many future days can be computationally expensive
3. **Filter Results**: Use filters (`minScore`, `prediction`, `minConfidence`) to get relevant predictions
4. **Cache Results**: Predictions are stored in the database, so repeated calls are faster
5. **Monitor Warnings**: Check the `warnings` array in responses for any issues

---

## Related Endpoints

- **Scan High Probability**: `GET /api/stock-analyses/scan-high-probability` - Scan all symbols for HIGH_PROBABILITY predictions
- **Get Stock Analysis**: `GET /api/stock-analyses/:id` - Get stock analysis details
- **Factor Analysis**: `POST /api/stock-analyses/:id/regenerate-factors` - Regenerate factor analysis

---

## Notes

- Predictions are generated based on the most recent factor data available
- Future predictions use the latest factor data as a baseline
- Historical predictions analyze past factor data
- Predictions are stored in the database and can be retrieved without regeneration
- The system uses a 3-year lookback window for historical pattern matching
