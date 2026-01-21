# Scan Endpoint Validation & Fix Report

## Endpoint Tested
```
GET /api/stock-analyses/scan-high-probability?status=completed&futureDays=1&days=10&threshold=0.3&minScore=0.3&minConfidence=70&format=text
```

## Issues Identified

### ✅ **Issue 1: Confidence Display Bug (FIXED)**

**Problem**: Confidence values were displayed incorrectly as percentages like "600.0%" and "3500.0%" instead of "6.0%" and "35.0%".

**Root Cause**: 
- Confidence is stored as a percentage value (0-95) in the database
- The display code was multiplying by 100 again, causing double conversion
- Example: Confidence value 35.0 → Display showed 3500.0%

**Location**: `src/routes/stock-analyses.ts` line 1362

**Fix Applied**:
```typescript
// Before (incorrect):
const confStr = sample.confidence !== undefined ? `, Độ tin cậy: ${(sample.confidence * 100).toFixed(1)}%` : '';

// After (correct):
// Confidence is already stored as a percentage (0-95), so don't multiply by 100
const confStr = sample.confidence !== undefined ? `, Độ tin cậy: ${sample.confidence.toFixed(1)}%` : '';
```

**Confidence Calculation Reference** (`src/lib/stock-factors.ts`):
- HIGH_PROBABILITY: `confidence = Math.min(scoreResult.score * 100, 95)` → Range: 0-95%
- MODERATE: `confidence = scoreResult.score * 80` → Range: 0-80%
- LOW_PROBABILITY: `confidence = scoreResult.score * 60` → Range: 0-60%

### ✅ **Issue 2: Filtering Behavior (WORKING AS EXPECTED)**

**Observation**: VPB shows as HIGH_PROBABILITY with score 0.350 but doesn't appear in filtered results.

**Analysis**:
- VPB score: 0.350 ✅ Passes `minScore=0.3`
- VPB confidence: 35.0% ❌ Fails `minConfidence=70`
- Filter logic correctly excludes VPB because confidence is below threshold

**Conclusion**: This is **correct behavior**. The filtering logic in `applyPredictionFilters()` correctly compares confidence values:
```typescript
if (filters.minConfidence !== undefined && pred.confidence < filters.minConfidence) {
  return false;
}
```

## Test Results After Fix

### Expected Output Format:
```
📋 MẪU DỰ ĐOÁN (5 đầu tiên):
   • TCB: LOW_PROBABILITY, Điểm: 0.100, Độ tin cậy: 6.0%
   • VCB: LOW_PROBABILITY, Điểm: 0.100, Độ tin cậy: 6.0%
   • CTG: LOW_PROBABILITY, Điểm: 0.100, Độ tin cậy: 6.0%
   • BID: LOW_PROBABILITY, Điểm: 0.100, Độ tin cậy: 6.0%
   • VPB: HIGH_PROBABILITY, Điểm: 0.350, Độ tin cậy: 35.0%
```

### Filtering Results:
- **Total Scanned**: 6 stocks
- **Predictions Generated**: 6
- **Future Predictions**: 6
- **After Filters Applied**: 0 (correct - no predictions meet both minScore=0.3 AND minConfidence=70)
- **HIGH_PROBABILITY Count**: 1 (VPB, but filtered out due to low confidence)

## Summary

1. ✅ **Confidence Display**: Fixed double percentage conversion
2. ✅ **Filtering Logic**: Working correctly - VPB excluded due to low confidence (35% < 70%)
3. ✅ **Diagnostic Output**: Provides clear information about why results are filtered

## Recommendations

1. **Consider Lowering minConfidence**: If you want to see VPB in results, lower `minConfidence` to 30-35
2. **Review Confidence Calculation**: Current formula may produce low confidence values even for HIGH_PROBABILITY predictions
3. **Add Warning Message**: Consider adding a note when all predictions are filtered out explaining why

## Files Modified

- `src/routes/stock-analyses.ts` (line 1362): Fixed confidence display to not multiply by 100
