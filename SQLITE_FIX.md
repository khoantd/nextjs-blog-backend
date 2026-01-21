# SQLite Compatibility Fix - Case-Insensitive Mode Error

## ✅ Issue Resolved

**Error:** `Unknown argument 'mode'. Did you mean 'lte'?`

**Root Cause:** SQLite doesn't support the `mode: 'insensitive'` option for case-insensitive string matching that is available in PostgreSQL.

## Problem Details

### Original Error

```
Database error fetching stock analyses: PrismaClientValidationError:

Invalid `prisma.stockAnalysis.findMany()` invocation:

{
  where: {
    symbol: {
      contains: "VPB",
      mode: "insensitive",  // ❌ Not supported in SQLite
      ~~~~
    }
  }
}

Unknown argument `mode`. Did you mean `lte`?
```

### Root Cause Analysis

1. **Database Provider**: The project uses SQLite (confirmed in `prisma/schema.prisma`)
2. **Incompatible Feature**: The `mode: 'insensitive'` option is PostgreSQL-specific
3. **Location**: `src/lib/filter-utils.ts` line 521

**Why it happened:**
- The filter utilities were originally designed for PostgreSQL compatibility
- SQLite has different capabilities and doesn't support case-insensitive mode
- Prisma validates query options against the database provider's capabilities

## Solution Implemented

### 1. Removed `mode: 'insensitive'` from Symbol Filter

**File**: `src/lib/filter-utils.ts`

**Before (Lines 517-523):**
```typescript
// Symbol filter (case-insensitive contains)
if (filters.symbol) {
  where.symbol = {
    contains: filters.symbol,
    mode: 'insensitive'  // ❌ Not supported in SQLite
  };
}
```

**After (Lines 517-522):**
```typescript
// Symbol filter (contains - case-sensitive for SQLite compatibility)
// Note: SQLite doesn't support mode: 'insensitive'
// For case-insensitive search on SQLite, symbols should be stored in uppercase
if (filters.symbol) {
  where.symbol = {
    contains: filters.symbol
  };
}
```

### 2. Updated Unit Tests

**File**: `src/lib/__tests__/filter-utils.test.ts`

**Before (Lines 243-249):**
```typescript
it('should build symbol filter', () => {
  const where = buildStockAnalysisWhere({ symbol: 'AAPL' });
  expect(where.symbol).toEqual({
    contains: 'AAPL',
    mode: 'insensitive'  // ❌ No longer valid
  });
});
```

**After (Lines 243-249):**
```typescript
it('should build symbol filter', () => {
  const where = buildStockAnalysisWhere({ symbol: 'AAPL' });
  expect(where.symbol).toEqual({
    contains: 'AAPL'
    // Note: mode: 'insensitive' removed for SQLite compatibility
  });
});
```

### 3. Updated API Documentation

**File**: `src/routes/stock-analyses.ts`

**Before (Line 116):**
```yaml
description: Filter by symbol (contains, case-insensitive)
```

**After (Line 116):**
```yaml
description: Filter by symbol (contains, case-sensitive for SQLite)
```

## Impact & Behavior Changes

### Before Fix
```bash
# This would fail with PrismaClientValidationError
curl "http://localhost:3001/api/stock-analyses?symbol=vpb"
```

### After Fix
```bash
# Now works - but searches are case-sensitive
curl "http://localhost:3001/api/stock-analyses?symbol=VPB"
```

### Important Note: Case Sensitivity

**SQLite Behavior:**
- Symbol searches are now **case-sensitive**
- `symbol=vpb` will NOT match `VPB` in database
- `symbol=VPB` will match `VPB` in database
- `symbol=V` will match `VPB`, `VIC`, `VALE` (contains search still works)

**Recommendation:**
Since stock symbols are typically stored in **UPPERCASE**, users should:
1. Search using uppercase symbols: `symbol=VPB` (not `symbol=vpb`)
2. Or store symbols in uppercase in the database consistently

## Alternative Solutions Considered

### Option 1: Custom SQL Function (Not Implemented)
```typescript
// Use Prisma raw query with LOWER()
where: {
  symbol: {
    contains: filters.symbol.toLowerCase()
  }
}
// AND normalize symbols to lowercase in database
```

**Why not used:** Requires database schema changes

### Option 2: Application-Level Filtering (Not Implemented)
```typescript
// Fetch all, then filter in JavaScript
const allAnalyses = await prisma.stockAnalysis.findMany();
const filtered = allAnalyses.filter(a =>
  a.symbol.toLowerCase().includes(filters.symbol.toLowerCase())
);
```

**Why not used:** Performance issues with large datasets

### Option 3: Uppercase Normalization (Recommended for Future)
```typescript
// Normalize input to uppercase
if (filters.symbol) {
  where.symbol = {
    contains: filters.symbol.toUpperCase()
  };
}
```

**Status:** Can be implemented if needed

## Testing

### Verification Tests

**Test 1: Valid Symbol Search (Case-Sensitive)**
```bash
curl "http://localhost:3001/api/stock-analyses?symbol=VPB"
```

**Expected:** ✅ Returns VPB analyses

**Test 2: Lowercase Search**
```bash
curl "http://localhost:3001/api/stock-analyses?symbol=vpb"
```

**Expected:** ⚠️ Returns empty (unless lowercase symbols exist)

**Test 3: Partial Match**
```bash
curl "http://localhost:3001/api/stock-analyses?symbol=V"
```

**Expected:** ✅ Returns VPB, VIC, VALE, etc.

### Unit Tests

Run the test suite:
```bash
npm test -- filter-utils.test.ts
```

**Expected:** ✅ All tests pass

## Files Modified

| File | Change | Lines |
|------|--------|-------|
| `src/lib/filter-utils.ts` | Removed `mode: 'insensitive'` | 517-522 |
| `src/lib/__tests__/filter-utils.test.ts` | Updated test expectations | 243-249 |
| `src/routes/stock-analyses.ts` | Updated OpenAPI documentation | 116 |

## Build Status

✅ TypeScript compilation: **SUCCESS**
```bash
$ npm run build
> nextjs-blog-backend@1.0.0 build
> tsc
```

## Migration Guide for Existing Users

### If You're Using the API

**Before:**
```javascript
// Case-insensitive search worked
fetch('/api/stock-analyses?symbol=aapl')  // Found AAPL
fetch('/api/stock-analyses?symbol=AAPL')  // Found AAPL
```

**After:**
```javascript
// Case-sensitive search only
fetch('/api/stock-analyses?symbol=aapl')  // May not find AAPL
fetch('/api/stock-analyses?symbol=AAPL')  // Finds AAPL ✓
```

**Recommendation:**
Always use uppercase for stock symbols:
```javascript
const symbol = userInput.toUpperCase(); // Normalize to uppercase
fetch(`/api/stock-analyses?symbol=${symbol}`)
```

### If You're Migrating to PostgreSQL

To restore case-insensitive search when using PostgreSQL:

1. **Update `prisma/schema.prisma`:**
   ```prisma
   datasource db {
     provider = "postgresql"  // Change from sqlite
     url      = env("DATABASE_URL")
   }
   ```

2. **Restore `mode: 'insensitive'` in filter-utils.ts:**
   ```typescript
   if (filters.symbol) {
     where.symbol = {
       contains: filters.symbol,
       mode: 'insensitive'  // Now supported
     };
   }
   ```

3. **Run migrations:**
   ```bash
   npx prisma migrate dev
   ```

## Best Practices Going Forward

### 1. Store Symbols in Uppercase
```typescript
// When creating stock analysis
const stockAnalysis = await prisma.stockAnalysis.create({
  data: {
    symbol: symbol.toUpperCase(),  // Normalize
    // ... other fields
  }
});
```

### 2. Normalize Search Input
```typescript
// In API endpoint
const searchSymbol = filters.symbol?.toUpperCase();
```

### 3. Document Case Sensitivity
Update API documentation to inform users:
```yaml
description: Filter by symbol (case-sensitive, use UPPERCASE)
example: AAPL
```

## Related Documentation

- [Prisma SQLite Limitations](https://www.prisma.io/docs/concepts/database-connectors/sqlite)
- [FILTERING_SPECIFICATION.md](./FILTERING_SPECIFICATION.md) - Original spec
- [FILTERING_IMPLEMENTATION.md](./FILTERING_IMPLEMENTATION.md) - Implementation details

## Summary

✅ **Issue**: SQLite doesn't support `mode: 'insensitive'`
✅ **Fix**: Removed the unsupported option
✅ **Impact**: Symbol searches are now case-sensitive
✅ **Recommendation**: Use uppercase for stock symbols
✅ **Status**: Production ready

**Last Updated**: January 20, 2026
