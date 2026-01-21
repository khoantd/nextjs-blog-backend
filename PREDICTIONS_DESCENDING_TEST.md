# Predictions Endpoint - Descending Date Order Test

## Summary of Changes

The predictions endpoint has been updated to return the **most recent N days by date in descending order** (most recent first).

### Changes Made

1. **`/:id/predictions` endpoint** (`src/routes/stock-analyses.ts`):
   - Fetches `LOOKBACK_NEEDED (210) + daysLimit` total days to ensure accurate technical indicators
   - Takes the last N days using `allData.slice(-daysLimit)`
   - Reverses the array to get descending order: `recentData = allData.slice(-daysLimit).reverse()`
   - Uses `recentData[0]` as the most recent day (instead of `recentData[recentData.length - 1]`)

2. **`/by-symbol/:symbol/predictions` endpoint**:
   - Same changes applied for consistency

3. **Prediction generation loop**:
   - Updated to start from index 1 (since index 0 is the most recent day)
   - Processes up to 4 days total (most recent + 3 previous days)

## How to Test

### Prerequisites

1. Backend server must be running at `http://72.60.233.159:3050` (or your configured URL)
2. You need authentication credentials (Bearer token or session cookie)
3. A stock analysis with factor data must exist

### Step 1: Get Authentication Token

**Option A: Get Session Cookie from Browser**
1. Open your frontend app (e.g., `http://localhost:3000`)
2. Sign in
3. Open Developer Tools (F12) → Application tab → Cookies
4. Copy the `next-auth.session-token` cookie value
5. Export it:
   ```bash
   export SESSION_COOKIE="next-auth.session-token=YOUR_COOKIE_VALUE"
   ```

**Option B: Get Bearer Token**
1. Open Developer Tools → Network tab
2. Make any API request
3. Check Request Headers for `Authorization: Bearer <token>`
4. Export it:
   ```bash
   export AUTH_TOKEN="your-bearer-token"
   ```

### Step 2: Find a Stock Analysis ID

```bash
cd "/Volumes/Data/Software Development/TypeScript/nextjs-blog-backend"
node check-remote-stock-analyses.js
```

This will list available stock analyses. Note an ID that has factor data.

### Step 3: Run the Enhanced Test

```bash
# Test with default values (ID: 24, Days: 10)
node test-predictions-descending.js 24 10

# Or specify custom values
node test-predictions-descending.js [STOCK_ANALYSIS_ID] [DAYS]
```

### Step 4: Verify Results

The test script will verify:

1. ✅ **Date Order**: Dates should be in descending order (most recent first)
   - First prediction date should be the most recent
   - Last prediction date should be the oldest

2. ✅ **Count**: Should return ≤ requested number of days
   - If less, it means there's not enough data

3. ✅ **Date Range**: Should show the date range being used
   - Logs will show: `Using X most recent days (from OLDEST_DATE to NEWEST_DATE)`

### Expected Output

```
✅ PASS: Dates are in descending order (most recent first)
   First date (most recent): 2025-01-20
   Last date (oldest): 2025-01-11

📊 Predictions Details:
  1. Date: 2025-01-20, Score: 65, Prediction: HIGH_PROBABILITY
  2. Date: 2025-01-19, Score: 62, Prediction: MODERATE
  3. Date: 2025-01-18, Score: 58, Prediction: MODERATE
  ...

✅ PASS: Returned 10 predictions (requested 10 days)
```

### Backend Logs to Check

When testing, check backend console logs for entries like:

```
[Predictions] Fetching factor data: need 10 recent days, fetching 220 total (including 210 lookback)
[Predictions] Retrieved 220 total factor data records
[Predictions] Using 10 most recent days (from 2025-01-11 to 2025-01-20)
[Predictions] Most recent day: 2025-01-20, Close: 150.25
```

## Manual Testing via API

You can also test directly via curl or Postman:

```bash
curl -X GET \
  "http://72.60.233.159:3050/api/stock-analyses/24/predictions?orderBy=date&order=desc&days=10" \
  -H "Cookie: next-auth.session-token=YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json"
```

Or with Bearer token:

```bash
curl -X GET \
  "http://72.60.233.159:3050/api/stock-analyses/24/predictions?orderBy=date&order=desc&days=10" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

## What Changed in the Code

### Before:
```typescript
const recentData = await calculateFactorsOnDemand(stockAnalysisId, {
  skip: 0,
  limit: daysLimit
});
const mostRecentDay = recentData[recentData.length - 1]; // Last item (oldest)
```

### After:
```typescript
const LOOKBACK_NEEDED = 210;
const totalDaysToFetch = LOOKBACK_NEEDED + daysLimit;
const allData = await calculateFactorsOnDemand(stockAnalysisId, {
  skip: 0,
  limit: totalDaysToFetch
});
const recentData = allData.slice(-daysLimit).reverse(); // Most recent first
const mostRecentDay = recentData[0]; // First item (most recent)
```

## Verification Checklist

- [ ] Test script runs without errors
- [ ] Dates are in descending order (most recent first)
- [ ] Number of predictions matches or is less than requested days
- [ ] Backend logs show correct date range
- [ ] Most recent day is correctly identified
- [ ] Predictions are generated for the correct dates
