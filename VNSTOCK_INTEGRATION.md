# Vnstock Integration Guide

This document describes how to integrate the remote vnstock API service with the backend.

## Overview

The backend now supports integration with the vnstock FastAPI service for fetching Vietnamese stock data. The integration provides:

- **Current stock prices** for Vietnamese stocks
- **Historical price data** with flexible date ranges
- **CSV data downloads** for bulk analysis

The integration gracefully falls back to CafeF API if vnstock is not configured or unavailable.

## Environment Variables

Add the following environment variables to your `.env.local` or production environment:

```bash
# Vnstock API Configuration
VNSTOCK_API_URL=http://localhost:8002
VNSTOCK_API_TOKEN=your-jwt-token-here  # Optional: if you have a pre-generated token
VNSTOCK_API_USERNAME=your-username      # Optional: for auto-login
VNSTOCK_API_PASSWORD=your-password      # Optional: for auto-login
```

### Configuration Options

1. **VNSTOCK_API_URL** (Required if using vnstock)
   - Base URL of the vnstock FastAPI service
   - Default: `http://localhost:8002`
   - Example: `http://localhost:8002` or `https://vnstock-api.example.com`

2. **VNSTOCK_API_TOKEN** (Optional)
   - Pre-generated JWT token for authentication
   - If provided, the client will use this token directly
   - If not provided, the client will attempt to login using username/password

3. **VNSTOCK_API_USERNAME** (Optional, required if no token)
   - Username for vnstock API authentication
   - Used for automatic login if token is not provided

4. **VNSTOCK_API_PASSWORD** (Optional, required if no token)
   - Password for vnstock API authentication
   - Used for automatic login if token is not provided

## Usage

### Automatic Integration

The integration is automatic. When fetching Vietnamese stock data:

1. If `VNSTOCK_API_URL` is configured, the backend will attempt to use vnstock API
2. If vnstock fails or is not configured, it falls back to CafeF API
3. No code changes are required - the integration is transparent

### API Endpoints

#### Fetch Historical Data (Existing Endpoint)

```http
POST /api/stock-analyses/:id/fetch-historical
Content-Type: application/json

{
  "period1": "2024-01-01",
  "period2": "2024-12-31",
  "interval": "1d"
}
```

This endpoint now uses vnstock API if configured, otherwise falls back to CafeF.

#### Fetch CSV from Vnstock (New Endpoint)

```http
POST /api/stock-analyses/:id/fetch-vnstock-csv
Content-Type: application/json

{
  "start_date": "2024-01-01",
  "end_date": "2024-12-31",
  "source": "vci",
  "interval": "D"
}
```

This endpoint specifically uses vnstock API to fetch CSV data.

**Parameters:**
- `start_date` (optional): Start date in YYYY-MM-DD format. Defaults to 1 year ago.
- `end_date` (optional): End date in YYYY-MM-DD format. Defaults to today.
- `source` (optional): Data source (`vci`, `tcbs`, `msn`). Defaults to `vci`.
- `interval` (optional): Data interval (`D` for daily, `1W` for weekly, etc.). Defaults to `D`.

## Vnstock Client API

The `VnstockClient` class provides the following methods:

### `getPriceHistory(request: PriceHistoryRequest)`

Fetch historical price data for a symbol.

```typescript
const priceHistory = await vnstockClient.getPriceHistory({
  symbol: 'VCI',
  source: 'vci',
  start: '2024-01-01',
  end: '2024-12-31',
  interval: 'D'
});
```

### `getPriceBoard(request: PriceBoardRequest)`

Get current prices for multiple symbols.

```typescript
const priceBoard = await vnstockClient.getPriceBoard({
  symbols_list: ['VCI', 'FPT', 'HPG'],
  source: 'vci'
});
```

### `downloadCSV(request: CSVDownloadRequest)`

Download CSV data for a symbol.

```typescript
const csvData = await vnstockClient.downloadCSV({
  symbol: 'VCI',
  start_date: '2024-01-01',
  end_date: '2024-12-31',
  source: 'vci',
  interval: 'D'
});
```

### `healthCheck()`

Check if the vnstock API is available.

```typescript
const isHealthy = await vnstockClient.healthCheck();
```

## Fallback Behavior

The integration includes automatic fallback:

1. **Vnstock API** (if configured) → Primary source
2. **CafeF API** → Fallback if vnstock fails or is not configured

This ensures the backend continues to work even if vnstock is unavailable.

## Error Handling

The integration handles errors gracefully:

- If vnstock API is not configured, it silently falls back to CafeF
- If vnstock API fails, it logs a warning and falls back to CafeF
- If both fail, it returns an appropriate error message

## Testing

To test the integration:

1. Start the vnstock API service:
   ```bash
   cd /path/to/vnstock
   python run-api.py
   ```

2. Configure environment variables in backend `.env.local`

3. Test fetching Vietnamese stock data:
   ```bash
   curl -X GET "http://localhost:3001/api/stocks/price?symbol=VCI&country=VN" \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

4. Test CSV download:
   ```bash
   curl -X POST "http://localhost:3001/api/stock-analyses/1/fetch-vnstock-csv" \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -d '{"start_date": "2024-01-01", "end_date": "2024-12-31"}'
   ```

## Troubleshooting

### Vnstock API Not Responding

- Check that the vnstock service is running
- Verify `VNSTOCK_API_URL` is correct
- Check network connectivity between backend and vnstock service

### Authentication Failures

- Verify `VNSTOCK_API_TOKEN` is valid (if using token)
- Verify `VNSTOCK_API_USERNAME` and `VNSTOCK_API_PASSWORD` are correct (if using login)
- Check vnstock API logs for authentication errors

### Data Format Issues

- The integration handles multiple data formats from vnstock API
- If data format changes, update the parsing logic in `stock-price-service.ts`

## Future Enhancements

Potential improvements:

- Caching of authentication tokens
- Retry logic with exponential backoff
- Rate limiting support
- Batch operations for multiple symbols
- WebSocket support for real-time updates
