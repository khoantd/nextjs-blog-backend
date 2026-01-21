# Prediction API Review

## Overview

The prediction API system provides two endpoints for generating market predictions based on stock factor analysis. Predictions are generated dynamically from recent factor data and include scoring, confidence levels, and prediction categories.

## API Endpoints

### 1. `GET /api/stock-analyses/:id/predictions`
**Purpose**: Get predictions for a specific stock analysis by ID

**Location**: `src/routes/stock-analyses.ts:2735-2992`

**Key Features**:
- Generates predictions for the most recent N days (default: 5, max: 50)
- Requires 210 days of lookback data for accurate technical indicators (MA200)
- Returns predictions in descending date order (most recent first)
- Supports comprehensive filtering and sorting
- Includes detailed logging for debugging

**Parameters**:
- `id` (path) - Stock analysis ID
- `days` (query, default: 5) - Number of recent days (1-50)
- `orderBy` (query, default: 'date') - Sort field: 'date', 'score', 'confidence', 'prediction'
- `order` (query, default: 'desc') - Sort order: 'asc' or 'desc'
- Filter parameters: `dateFrom`, `dateTo`, `minScore`, `maxScore`, `prediction`, `minConfidence`, `maxConfidence`

**Response Structure**:
```typescript
{
  data: {
    predictions: Array<{
      symbol: string;
      date: string; // ISO date format
      score: number; // 0-100
      prediction: 'HIGH_PROBABILITY' | 'MODERATE' | 'LOW_PROBABILITY';
      confidence: number; // 0-1
      activeFactors: Array<{
        factor: string;
        name: string;
        description: string;
        weight: number;
      }>;
      recommendations: string[];
      threshold: number;
      interpretation: string;
      aboveThreshold: boolean;
    }>
  }
}
```

### 2. `GET /api/stock-analyses/by-symbol/:symbol/predictions`
**Purpose**: Get predictions by stock symbol/ticker

**Location**: `src/routes/stock-analyses.ts:2397-2629`

**Key Features**:
- Finds the latest stock analysis for a given symbol
- Optional market filter (US/VN) to disambiguate symbols
- Same prediction generation logic as ID-based endpoint
- Returns symbol and analysisId in response

**Parameters**:
- `symbol` (path) - Stock symbol/ticker (e.g., AAPL, SNAP, VIC)
- `market` (query, optional) - Market identifier: 'US' or 'VN'
- Same query parameters as ID-based endpoint

**Response Structure**:
```typescript
{
  data: {
    predictions: Array<Prediction>,
    symbol: string,
    analysisId: number
  }
}
```

## Implementation Details

### Core Functions

#### 1. `generateDailyPrediction()` 
**Location**: `src/lib/services/stock-factor-service.ts:937-964`

**Purpose**: Generates a single prediction for given factors

**Input**:
- `symbol`: Stock symbol
- `currentFactors`: Partial factor record (10 factors)
- `config`: DailyScoreConfig (optional, defaults to DEFAULT_DAILY_SCORE_CONFIG)

**Output**: Prediction object with score, prediction level, confidence, active factors, recommendations

**Key Logic**:
- Calls `predictStrongMovement()` to calculate score and prediction level
- Maps active factors to include descriptions and weights
- Generates interpretation text based on prediction level
- Sets date to current date (overridden by API endpoints to use actual data date)

#### 2. `parsePredictionFilters()`
**Location**: `src/lib/filter-utils.ts:412-505`

**Purpose**: Parses and validates filter parameters from request query

**Validation**:
- Date format validation (YYYY-MM-DD)
- Score range validation (0-100)
- Confidence range validation (0-1)
- Prediction enum validation (HIGH_PROBABILITY, MODERATE, LOW_PROBABILITY)
- Range consistency checks (dateFrom <= dateTo, minScore <= maxScore, etc.)

**Error Handling**: Throws `FilterValidationError` with detailed error messages

#### 3. `applyPredictionFilters()`
**Location**: `src/lib/filter-utils.ts:702-740`

**Purpose**: Applies filters to predictions array in-memory

**Filter Types**:
- Date range (dateFrom, dateTo)
- Score range (minScore, maxScore)
- Prediction level (exact match)
- Confidence range (minConfidence, maxConfidence)

**Note**: Filters are applied after prediction generation (in-memory filtering)

### Data Flow

1. **Authentication**: Both endpoints require authentication via `getCurrentUser()`
2. **Parameter Validation**: 
   - Days parameter validated (1-50)
   - OrderBy/Order parameters normalized
   - Filters parsed and validated
3. **Data Fetching**:
   - Fetches stock analysis from database
   - Calculates factors on-demand using `calculateFactorsOnDemand()`
   - Fetches `LOOKBACK_NEEDED (210) + daysLimit` total days for technical indicators
4. **Data Processing**:
   - Takes last N days: `allData.slice(-daysLimit)`
   - Reverses to descending order: `.reverse()`
   - Extracts factors from each day
5. **Prediction Generation**:
   - Generates prediction for most recent day (index 0)
   - Generates predictions for up to 3 previous days (max 4 total)
   - Sets actual date from data (not current date)
6. **Filtering & Sorting**:
   - Applies filters in-memory
   - Sorts by specified field and order
7. **Response**: Returns filtered and sorted predictions

## Code Quality Assessment

### ✅ Strengths

1. **Comprehensive Error Handling**:
   - Proper authentication checks
   - Parameter validation with clear error messages
   - Try-catch blocks with detailed error logging
   - FilterValidationError for invalid parameters

2. **Detailed Logging**:
   - Extensive console logging for debugging (especially in `/:id/predictions`)
   - Logs include: request parameters, data counts, date ranges, sample predictions
   - Helps with troubleshooting production issues

3. **Flexible Filtering**:
   - Multiple filter types (date, score, prediction, confidence)
   - In-memory filtering allows complex queries
   - Validation prevents invalid filter combinations

4. **Consistent Sorting**:
   - Supports multiple sort fields (date, score, confidence, prediction)
   - Handles date parsing for different formats (YYYY-MM-DD, MM/DD/YYYY)
   - Prediction level sorting with proper ordering (HIGH > MODERATE > LOW)

5. **Technical Indicator Accuracy**:
   - Fetches 210 days lookback for MA200 calculation
   - Ensures accurate technical indicators even for recent days

6. **Date Handling**:
   - Uses actual data dates instead of current date
   - Proper date parsing for sorting
   - Handles multiple date formats

### ⚠️ Areas for Improvement

1. **Code Duplication**:
   - Both endpoints have nearly identical logic (prediction generation, filtering, sorting)
   - Date parsing logic duplicated in both endpoints
   - Consider extracting common logic to a shared function

2. **Hard-coded Limits**:
   - `maxDaysToProcess = 4` is hard-coded (line 2534, 2876)
   - `LOOKBACK_NEEDED = 210` is hard-coded (line 2473, 2799)
   - Consider making these configurable or at least constants

3. **Error Handling Inconsistency**:
   - `/:id/predictions` has try-catch around individual prediction generation (line 2856-2868, 2889-2901)
   - `/by-symbol/:symbol/predictions` doesn't have this granular error handling
   - Should be consistent across both endpoints

4. **Type Safety**:
   - Uses `as any` type assertions (line 2522, 2547, 2859, 2892)
   - Factor extraction uses `Partial<Record<string, boolean>>` which is loose
   - Could benefit from stricter typing

5. **Performance Considerations**:
   - Fetches 210+ days even when only need 5 days
   - In-memory filtering could be inefficient for large datasets
   - Consider database-level filtering for better performance

6. **Missing Validation**:
   - No validation that stock analysis has factor data before processing
   - No check for minimum data requirements (e.g., need at least 1 day)
   - Could add early validation to return clearer errors

7. **Documentation**:
   - OpenAPI documentation exists but could be more detailed
   - Missing examples in documentation
   - No response schema examples

8. **Testing**:
   - No unit tests found for prediction endpoints
   - Only manual test scripts exist (`test-predictions-descending.js`)
   - Should add automated tests for edge cases

## Potential Issues

### 1. Date Format Inconsistency
**Issue**: Date parsing handles multiple formats but may fail silently
**Location**: Lines 2562-2583, 2914-2935
**Risk**: Medium - Could cause incorrect sorting if dates are in unexpected format
**Recommendation**: Standardize date format or add validation

### 2. Factor Extraction Logic
**Issue**: Factor extraction uses hard-coded key list (lines 2500-2511, 2833-2844)
**Risk**: Low - If factor names change, this needs manual update
**Recommendation**: Use a constant or derive from factor definitions

### 3. Empty Predictions Handling
**Issue**: Returns empty array when no data (line 2483-2489, 2814-2819)
**Risk**: Low - This is acceptable behavior but could be clearer
**Recommendation**: Consider returning 404 or more descriptive message

### 4. Prediction Limit
**Issue**: Hard-coded limit of 4 days for historical predictions (line 2534, 2876)
**Risk**: Low - May not be enough for trend analysis
**Recommendation**: Make configurable or increase limit

### 5. Error Recovery
**Issue**: If one day's prediction fails, continues with others (line 2898-2901)
**Risk**: Low - Good resilience but may hide issues
**Recommendation**: Log warnings but consider failing fast for critical errors

## Recommendations

### High Priority

1. **Extract Common Logic**:
   ```typescript
   async function generatePredictionsForAnalysis(
     stockAnalysisId: number,
     daysLimit: number,
     filters: PredictionFilters,
     orderBy: string,
     order: string
   ): Promise<Prediction[]>
   ```
   Use this function in both endpoints to reduce duplication.

2. **Add Unit Tests**:
   - Test filter parsing and validation
   - Test prediction generation with various factor combinations
   - Test sorting logic with different date formats
   - Test edge cases (empty data, invalid parameters)

3. **Improve Type Safety**:
   - Define proper types for factor records
   - Remove `as any` assertions
   - Use type guards for factor extraction

### Medium Priority

4. **Make Limits Configurable**:
   - Extract `LOOKBACK_NEEDED` and `maxDaysToProcess` as constants
   - Consider making them configurable via environment variables

5. **Add Response Examples**:
   - Include example responses in OpenAPI documentation
   - Add example requests to documentation

6. **Performance Optimization**:
   - Consider database-level filtering for large datasets
   - Cache factor calculations if possible
   - Add pagination support for predictions

### Low Priority

7. **Enhanced Error Messages**:
   - Provide more specific error messages for missing data
   - Include suggestions for fixing common issues

8. **Logging Improvements**:
   - Add structured logging (JSON format)
   - Include request IDs for tracing
   - Consider log levels (debug, info, warn, error)

## Testing Coverage

### Current Testing
- Manual test script: `test-predictions-descending.js`
- Test documentation: `PREDICTIONS_DESCENDING_TEST.md`
- Filter utilities have unit tests: `src/lib/__tests__/filter-utils.test.ts`

### Missing Tests
- Endpoint integration tests
- Prediction generation logic tests
- Sorting logic tests with various date formats
- Error handling tests
- Edge case tests (empty data, invalid parameters, etc.)

## Documentation Status

### Existing Documentation
- ✅ OpenAPI/Swagger documentation in code
- ✅ Test documentation (`PREDICTIONS_DESCENDING_TEST.md`)
- ✅ Postman collection includes prediction endpoints

### Missing Documentation
- ❌ API usage examples
- ❌ Response schema examples
- ❌ Error response examples
- ❌ Rate limiting information
- ❌ Performance considerations

## Conclusion

The prediction API implementation is **solid and functional** with good error handling and logging. The main areas for improvement are:

1. **Code deduplication** - Extract common logic
2. **Testing** - Add comprehensive unit and integration tests
3. **Type safety** - Remove type assertions and improve typing
4. **Documentation** - Add examples and usage guides

The APIs are production-ready but would benefit from refactoring to reduce duplication and improve maintainability.
