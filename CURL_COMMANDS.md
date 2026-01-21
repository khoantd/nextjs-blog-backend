# CURL Commands for Testing Scan Endpoint

## Remote Server
```
http://72.60.233.159:3050
```

## Get Your Auth Token

1. **From Browser**: After logging in, check your browser cookies for `next-auth.session-token` or `__Secure-next-auth.session-token`
2. **From Network Tab**: Check the Authorization header in any API request after login
3. **From Frontend**: Use browser console: `document.cookie.split(';').find(c => c.includes('next-auth.session-token'))`

## Test Commands

### Test 1: Original Parameters (Text Format)
```bash
curl -X GET "http://72.60.233.159:3050/api/stock-analyses/scan-high-probability?status=completed&futureDays=7&minScore=2&minConfidence=30&format=text" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

### Test 2: Relaxed Filters (minScore=0)
```bash
curl -X GET "http://72.60.233.159:3050/api/stock-analyses/scan-high-probability?status=completed&futureDays=7&minScore=0&format=text" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

### Test 3: JSON Response (Detailed Analysis)
```bash
curl -X GET "http://72.60.233.159:3050/api/stock-analyses/scan-high-probability?status=completed&futureDays=7&minScore=0" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" | jq
```

### Test 4: Check Completed Analyses
```bash
curl -X GET "http://72.60.233.159:3050/api/stock-analyses?status=completed" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" | jq
```

### Test 5: Get Single Analysis Details
```bash
# Replace ANALYSIS_ID with actual ID from Test 4
curl -X GET "http://72.60.233.159:3050/api/stock-analyses/ANALYSIS_ID" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" | jq
```

## Expected Results

### With minScore=2 (Original)
- Should show diagnostic info explaining why no results
- Should show prediction type distribution
- Should show sample predictions with scores

### With minScore=0 (Relaxed)
- Should show all predictions regardless of score
- Should help identify if predictions exist but are filtered out
- Should show actual scores and prediction types

## Validation Checklist

- [ ] Endpoint responds (not 404)
- [ ] Authentication works (not 401)
- [ ] Completed analyses are found
- [ ] Predictions are generated
- [ ] Diagnostic information is accurate
- [ ] Filter logic works correctly
