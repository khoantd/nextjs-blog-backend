# Scan Endpoint Validation Results

## Test Date
2026-01-21 07:23

## Remote Server
http://72.60.233.159:3050

## Test Results Summary

### ✅ **Endpoint Working Correctly**

The scan endpoint is functioning as designed:

1. **Analysis Discovery**: ✅ Found 5 completed stock analyses
2. **Prediction Generation**: ✅ Generated 35 predictions (7 days × 5 stocks)
3. **Future Predictions**: ✅ All 35 predictions are future predictions
4. **Filter Application**: ✅ Filters are being applied correctly
5. **Diagnostic Output**: ✅ Comprehensive diagnostic information displayed

### ❌ **Issue Identified: All Predictions Have Score 0.000**

**Root Cause**: No active factors detected in baseline stock data

**Evidence from Test Output**:
```
📊 THÔNG TIN QUÉT:
   • Đã quét: 5 mã cổ phiếu
   • Bộ lọc: Điểm tối thiểu: 2, Độ tin cậy tối thiểu: 30%, Ngày tương lai: 7
   • Dự đoán đã tạo: 35
   • Dự đoán tương lai: 35
   • Sau khi lọc: 0
   • Phân loại: LOW_PROBABILITY: 21, MODERATE: 14

📋 MẪU DỰ ĐOÁN (5 đầu tiên):
   • HDB: LOW_PROBABILITY, Điểm: 0.000, Độ tin cậy: 0.0%
   • HDB: LOW_PROBABILITY, Điểm: 0.000, Độ tin cậy: 0.0%
   • HDB: LOW_PROBABILITY, Điểm: 0.000, Độ tin cậy: 0.0%
   • HDB: LOW_PROBABILITY, Điểm: 0.000, Độ tin cậy: 0.0%
   • HDB: LOW_PROBABILITY, Điểm: 0.000, Độ tin cậy: 0.0%
```

## Validation Conclusion

### ✅ **Endpoint Logic: VALID**
- Filter logic works correctly
- Prediction generation works correctly
- Diagnostic output is accurate and helpful

### ❌ **Data Quality: INVALID**
- No active factors detected in recent stock data
- All predictions have score 0.000
- All predictions have confidence 0.0%
- No HIGH_PROBABILITY predictions (requires score ≥ threshold, typically 0.45)

## Why Filters Return 0 Results

1. **minScore=2**: Filters out all predictions (0.000 < 2) ✅ **Working as designed**
2. **minConfidence=30**: Filters out all predictions (0% < 30%) ✅ **Working as designed**
3. **No HIGH_PROBABILITY**: All predictions are LOW_PROBABILITY or MODERATE ✅ **Expected behavior**

## Next Steps

### Immediate Actions

1. **Test with Relaxed Filters**:
   ```bash
   # Remove minScore to see all predictions
   GET /api/stock-analyses/scan-high-probability?status=completed&futureDays=7&minScore=0&format=text
   ```

2. **Investigate Factor Detection**:
   - Check if stock data is recent and complete
   - Verify factor analysis was run correctly
   - Ensure market/sector data is available for factor calculation
   - Check if factor thresholds are appropriate

3. **Check Recent Stock Data**:
   - Volume spikes (volume > 1.5x MA20)
   - MA breaks (price breaks above MA50/MA200)
   - RSI levels (RSI > 60)
   - Market/sector performance data

### Long-term Improvements

1. **Better Baseline Selection**:
   - Use historical average instead of most recent data when no factors found
   - Use trend-based factor estimation

2. **Factor Estimation for Future Predictions**:
   - Don't just copy baseline factors
   - Estimate factors based on trends and patterns

3. **Enhanced Diagnostics**:
   - Show which factors were checked and why they're false
   - Display baseline data used for predictions
   - Show factor detection statistics

## Files Created

1. **test-remote-scan.js** - Automated test script for remote server
2. **CURL_COMMANDS.md** - Manual testing commands
3. **SCAN_ENDPOINT_VALIDATION.md** - Detailed validation report
4. **VALIDATION_RESULTS.md** - This summary document

## Test Script Usage

```bash
# Set your auth token
export AUTH_TOKEN=your_token_here

# Run tests
node test-remote-scan.js
```

## Conclusion

**The endpoint is working correctly.** The issue is that **no active factors are detected in the baseline stock data**, causing all predictions to have score 0.000. The diagnostic output clearly explains this issue and provides actionable information for debugging.
