# Scan Endpoint Validation Report

## Endpoint Tested
```
GET /api/stock-analyses/scan-high-probability?status=completed&futureDays=7&minScore=2&minConfidence=30&format=text
```

## Test Results

### Input Parameters
- `status=completed` ✅
- `futureDays=7` ✅
- `minScore=2` ✅
- `minConfidence=30` ✅
- `format=text` ✅

### Output Analysis

#### ✅ **Working Correctly:**
1. **Analysis Discovery**: Found 5 completed stock analyses
2. **Prediction Generation**: Generated 35 predictions (7 days × 5 stocks = 35)
3. **Future Predictions**: All 35 predictions are future predictions (isFuture=true)
4. **Filter Application**: Filters are being applied correctly
5. **Diagnostic Information**: Diagnostic output is working and showing useful information

#### ❌ **Issues Identified:**

1. **All Predictions Have Score 0.000**
   - **Root Cause**: No active factors detected in baseline stock data
   - **Impact**: All predictions fail the `minScore=2` filter
   - **Evidence**: Sample predictions show `Điểm: 0.000, Độ tin cậy: 0.0%`

2. **No HIGH_PROBABILITY Predictions**
   - **Distribution**: 21 LOW_PROBABILITY, 14 MODERATE, 0 HIGH_PROBABILITY
   - **Reason**: Score 0 cannot qualify as HIGH_PROBABILITY (requires score ≥ threshold, typically 0.45)

3. **Zero Confidence**
   - **Issue**: All predictions have confidence 0.0%
   - **Reason**: Confidence is calculated from active factors, which are all false

## Root Cause Analysis

### Why Scores Are 0.000

The prediction generation logic works as follows:

1. **Fetch Recent Data**: Gets last N days of stock data (default: 5 days)
2. **Find Baseline**: Looks for a day with active factors in the last 10 days
3. **Generate Predictions**: Uses baseline factors to generate future predictions

**Problem**: If no days in the last 10 days have active factors, the system:
- Uses the most recent data anyway (which has no active factors)
- Generates predictions with all factors = false
- Results in score = 0.000

### Why No Active Factors?

Factors are detected based on:
- **Technical Indicators**: Volume spikes, MA breaks, RSI levels
- **Market Data**: Nasdaq performance, sector performance
- **Fundamental Data**: Earnings windows, news sentiment
- **Market Conditions**: Short interest, macro events

**Possible Reasons for No Active Factors:**
1. **Stock data is too old** - Recent data doesn't meet factor thresholds
2. **Missing market data** - Nasdaq/sector data not available
3. **Factor thresholds too strict** - Conditions not met (e.g., volume < 1.5x MA20)
4. **Data quality issues** - Missing or incorrect data fields

## Validation of Filter Logic

### Filter Application Flow ✅

1. **Generate predictions** (no filters during generation)
2. **Filter for future predictions** (`isFuture === true`) ✅
3. **Select target prediction** (Nth business day ahead) ✅
4. **Apply filters**:
   - `minScore=2` → Filters out all (score 0.000 < 2) ✅
   - `minConfidence=30` → Filters out all (confidence 0% < 30%) ✅
   - `prediction=HIGH_PROBABILITY` → Not applied (removed forced filter) ✅

### Filter Logic is Correct ✅

The filters are working as expected:
- `minScore=2` correctly filters out predictions with score < 2
- `minConfidence=30` correctly filters out predictions with confidence < 30%
- The issue is that **all predictions have score 0**, not that filters are wrong

## Recommendations

### Immediate Fixes

1. **Remove or Lower minScore Filter**
   ```bash
   # Test with minScore=0 to see all predictions
   /api/stock-analyses/scan-high-probability?status=completed&futureDays=7&minScore=0&format=text
   ```

2. **Check Factor Detection**
   - Verify stock data is recent and complete
   - Check if factor analysis was run correctly
   - Ensure market/sector data is available

3. **Investigate Why Factors Are Not Detected**
   - Check recent stock data for volume spikes, MA breaks, etc.
   - Verify factor thresholds are appropriate
   - Ensure `calculateFactorsOnDemand` is called with proper options

### Long-term Improvements

1. **Better Baseline Selection**
   - Instead of using most recent data when no factors found, use historical average
   - Or use trend-based factor estimation

2. **Factor Estimation for Future Predictions**
   - Don't just copy baseline factors
   - Estimate factors based on trends and patterns

3. **Enhanced Diagnostics**
   - Show which factors were checked and why they're false
   - Display baseline data used for predictions
   - Show factor detection statistics

## Conclusion

✅ **Endpoint Logic**: **VALID** - The endpoint is working correctly

❌ **Data Quality**: **INVALID** - No active factors detected, resulting in score 0 predictions

**The endpoint correctly filters predictions, but all predictions have score 0 because no factors are active in the baseline data.**

## Next Steps

1. ✅ **Verified**: Filter logic is correct
2. ✅ **Verified**: Prediction generation is working
3. ⚠️ **Action Required**: Investigate why factors aren't being detected
4. ⚠️ **Action Required**: Update stock data or adjust factor thresholds
5. ⚠️ **Action Required**: Consider using historical patterns instead of just baseline factors
