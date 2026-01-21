# Testing Predictions Endpoint

This guide helps you test the `/api/stock-analyses/:id/predictions` endpoint with proper authentication.

**Note**: These scripts test against the **remote server** at `http://72.60.233.159:3050` by default.

## Quick Test (Without Auth - Will Show 401)

```bash
node test-predictions-endpoint.js [stockAnalysisId] [days]
```

Example:
```bash
node test-predictions-endpoint.js 24 10
```

## Check Remote Server for Available Stock Analyses

Before testing predictions, check what stock analyses exist on the remote server:

```bash
# List all stock analyses (requires authentication)
node check-remote-stock-analyses.js

# Check a specific stock analysis (requires authentication)
node check-remote-stock-analysis.js 24
```

## Getting Authentication Token

### Option 1: Get Session Cookie from Browser

1. Open your frontend application in the browser (e.g., `http://localhost:3000`)
2. Sign in to your account
3. Open Developer Tools (F12)
4. Go to **Application** tab (Chrome) or **Storage** tab (Firefox)
5. Navigate to **Cookies** → `http://localhost:3000` (or your frontend URL)
6. Find the cookie named `next-auth.session-token` or `__Secure-next-auth.session-token`
7. Copy the entire cookie value

Then run:
```bash
export SESSION_COOKIE="next-auth.session-token=YOUR_COOKIE_VALUE_HERE"
node test-predictions-endpoint.js 24 10
```

### Option 2: Get Bearer Token from Browser Network Tab

1. Open your frontend application and sign in
2. Open Developer Tools (F12)
3. Go to **Network** tab
4. Make a request to any backend API endpoint (e.g., `/api/stock-analyses`)
5. Click on the request
6. Go to **Headers** section
7. Look for `Authorization: Bearer <token>` header
8. Copy the token value (without "Bearer ")

Then run:
```bash
export AUTH_TOKEN="YOUR_TOKEN_HERE"
node test-predictions-endpoint.js 24 10
```

### Option 3: Extract from Browser Console

Open browser console on your frontend app and run:

```javascript
// Get session cookie
document.cookie.split('; ').find(row => row.startsWith('next-auth.session-token'))?.split('=')[1]

// Or get from localStorage (if stored there)
localStorage.getItem('next-auth.session-token')
```

## Testing with Authentication

Once you have the token or cookie:

```bash
# Using Bearer token
export AUTH_TOKEN="your-token-here"
node test-predictions-endpoint.js 24 10

# Using session cookie
export SESSION_COOKIE="next-auth.session-token=your-cookie-value"
node test-predictions-endpoint.js 24 10

# Or combine both in one command
AUTH_TOKEN="your-token" node test-predictions-endpoint.js 24 10
```

## Understanding the Output

The script will show:

1. **Request Details**: URL, parameters, authentication method
2. **Response Status**: HTTP status code and headers
3. **Response Body**: Full JSON response
4. **Analysis**: 
   - ✅ Success with predictions count
   - ❌ Authentication errors (401)
   - ❌ Not found errors (404)
   - ⚠️ Warnings about empty results or unexpected formats

## Common Issues

### 401 Unauthorized
- **Cause**: No valid authentication token/cookie
- **Solution**: Get a valid token from your browser session (see options above)

### 404 Not Found
- **Cause**: Stock analysis ID doesn't exist
- **Solution**: Verify the stock analysis ID exists in the database

### Empty Predictions Array
- **Cause**: No factor data available for the stock analysis
- **Solution**: 
  1. Check backend logs for `[Predictions]` entries
  2. Ensure factor analysis has been run for this stock analysis
  3. Verify `DailyFactorData` records exist in database

### Connection Errors
- **Cause**: Backend server not running or unreachable
- **Solution**: 
  1. Verify backend is running: `curl http://72.60.233.159:3050/health`
  2. Check network connectivity
  3. Verify BACKEND_URL environment variable

## Checking Backend Logs

When testing from the frontend, check backend console logs for entries starting with `[Predictions]`:

```
[Predictions] Request for stock analysis ID: 24, days: 10, orderBy: date, order: desc
[Predictions] Found stock analysis: AAPL (ID: 24)
[Predictions] Fetching factor data with limit: 10
[Predictions] Retrieved 10 factor data records
[Predictions] Most recent day: 2025-01-20, Close: 150.25
[Predictions] Current factors: { volume_spike: true, market_up: false, ... }
[Predictions] Generated prediction for 2025-01-20: score=65, prediction=HIGH_PROBABILITY
[Predictions] Generated 4 total predictions before filtering
[Predictions] After filtering: 4 predictions
[Predictions] Returning 4 sorted predictions
```

## Environment Variables

You can set these environment variables:

- `BACKEND_URL`: Backend API URL (default: `http://72.60.233.159:3050`)
- `AUTH_TOKEN`: Bearer token for authentication
- `SESSION_COOKIE`: NextAuth session cookie for authentication

Example:
```bash
export BACKEND_URL="http://localhost:3050"
export AUTH_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
node test-predictions-endpoint.js 24 10
```
