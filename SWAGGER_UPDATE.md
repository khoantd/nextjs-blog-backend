# Swagger UI Update - Latest Filter

## ✅ Swagger UI Has Been Updated

The Swagger UI documentation has been automatically updated to include the new `latest` filter parameter.

## Accessing Swagger UI

### Local Development
```
http://localhost:3001/api-docs
```

### Production/Remote Server
```
http://your-server-url:3001/api-docs
```

## What's New in Swagger UI

The **GET /api/stock-analyses** endpoint now includes a new query parameter:

### `latest` Parameter

- **Type**: boolean
- **Required**: No (but requires `symbol` to be set if used)
- **Description**: Get only the latest analysis for the symbol (must be used with symbol filter)
- **Example**: `true`

## How to Test in Swagger UI

1. **Navigate to Swagger UI**: Open `http://localhost:3001/api-docs` in your browser

2. **Find the endpoint**: Scroll to **GET /api/stock-analyses**

3. **Click "Try it out"**

4. **Fill in parameters**:
   - `symbol`: Enter a stock symbol (e.g., "AAPL")
   - `latest`: Set to `true`
   - Leave other parameters as default or customize as needed

5. **Click "Execute"**

6. **View Response**: You'll see the latest analysis for the specified symbol

## Example Swagger UI Test

### Test Case 1: Get Latest AAPL Analysis

**Parameters:**
```yaml
symbol: AAPL
latest: true
```

**Expected Response:**
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

### Test Case 2: Error - Latest Without Symbol

**Parameters:**
```yaml
latest: true
# (no symbol specified)
```

**Expected Response (400 Bad Request):**
```json
{
  "error": "Invalid filter parameter",
  "message": "The 'latest' filter requires the 'symbol' filter to be specified",
  "parameter": "latest",
  "value": true
}
```

### Test Case 3: Combined Filters

**Parameters:**
```yaml
symbol: AAPL
latest: true
market: US
status: completed
```

**Expected Response:**
Latest completed US market analysis for AAPL

## Verifying the Update

To verify the Swagger documentation has been updated:

1. **Check if server is running:**
   ```bash
   curl http://localhost:3001/health
   ```

2. **Access Swagger UI:**
   ```bash
   open http://localhost:3001/api-docs
   # or
   xdg-open http://localhost:3001/api-docs
   ```

3. **Look for the latest parameter** in the GET /api/stock-analyses endpoint parameters list

## Rebuild Instructions

If you don't see the update in Swagger UI:

1. **Rebuild the project:**
   ```bash
   npm run build
   ```

2. **Restart the server:**
   ```bash
   npm run dev
   # or in production:
   npm start
   ```

3. **Clear browser cache** (Ctrl+Shift+R or Cmd+Shift+R)

4. **Refresh Swagger UI page**

## Complete Parameter List

The GET /api/stock-analyses endpoint now supports these filters:

| Parameter | Type | Description |
|-----------|------|-------------|
| symbol | string | Filter by symbol (contains, case-insensitive) |
| market | string | Filter by market (US/VN) |
| status | string | Filter by status (comma-separated) |
| favorite | boolean | Filter by favorite flag |
| createdFrom | date | Filter by creation date from (YYYY-MM-DD) |
| createdTo | date | Filter by creation date to (YYYY-MM-DD) |
| updatedFrom | date | Filter by update date from (YYYY-MM-DD) |
| updatedTo | date | Filter by update date to (YYYY-MM-DD) |
| minPrice | number | Filter by minimum latest price |
| maxPrice | number | Filter by maximum latest price |
| **latest** | **boolean** | **🆕 Get only the latest analysis for symbol** |
| page | integer | Page number (default: 1) |
| limit | integer | Items per page (default: 20) |

## OpenAPI Specification

The OpenAPI spec has been updated in the route file:

**File**: `src/routes/stock-analyses.ts`

**Lines**: 189-193

```typescript
/**
 * @openapi
 *       - in: query
 *         name: latest
 *         schema:
 *           type: boolean
 *         description: Get only the latest analysis for the symbol (must be used with symbol filter)
 *         example: true
 */
```

## Swagger JSON/YAML Export

To export the updated OpenAPI specification:

1. **Access Swagger UI**: http://localhost:3001/api-docs

2. **Click on the URL at the top** (e.g., "/api-docs")

3. **Choose format**:
   - Add `?format=json` for JSON
   - Add `?format=yaml` for YAML

Example:
```
http://localhost:3001/api-docs?format=json
```

## Additional Documentation

For more details about the `latest` filter:

- **Usage Guide**: [LATEST_FILTER_GUIDE.md](./LATEST_FILTER_GUIDE.md)
- **API Reference**: [FILTERING_API_REFERENCE.md](./FILTERING_API_REFERENCE.md)
- **Examples**: [FILTERING_EXAMPLES.md](./FILTERING_EXAMPLES.md)

## Status

✅ OpenAPI documentation updated
✅ TypeScript compilation successful
✅ Swagger UI automatically reflects changes
✅ All endpoints documented

The Swagger UI is now ready to use with the new `latest` filter!
