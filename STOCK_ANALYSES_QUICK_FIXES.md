# Quick Fixes for stock-analyses.ts TypeScript Errors

## Fix 1: userId Type Conversion (Lines 2844, 3029, 3895, 3905)

**Problem**: `user.id` is `string` but Prisma expects `number`

**Fix**:
```typescript
// Line 2844 - Change:
userId: user.id

// To:
userId: Number(user.id)

// Line 3029 - Change:
userId: user.id

// To:
userId: Number(user.id)

// Lines 3895, 3905 - Change:
userId: user.id

// To:
userId: Number(user.id)
```

## Fix 2: Prisma Model Access (Lines 3871, 3891, 4020, 4037, 4131, 4143)

**Problem**: TypeScript can't find Prisma models (likely needs client regeneration)

**Fix**:
1. Run: `npx prisma generate`
2. If still errors, verify model names are lowercase:
   - `prisma.prediction` (not `prisma.Prediction`)
   - `prisma.predictionFeedback` (not `prisma.PredictionFeedback`)

## Fix 3: Implicit Any Type (Line 4140)

**Problem**: Parameter `p` has implicit `any` type

**Fix**:
```typescript
// Line 4140 - Change:
const predictionIds = predictions.map(p => p.id);

// To:
const predictionIds = predictions.map((p: { id: number }) => p.id);
```

## Complete Code Changes

### Change 1: Line 2844
```typescript
// Before:
userId: user.id

// After:
userId: Number(user.id)
```

### Change 2: Line 3029
```typescript
// Before:
userId: user.id

// After:
userId: Number(user.id)
```

### Change 3: Lines 3895, 3905
```typescript
// Before:
userId: user.id

// After:
userId: Number(user.id)
```

### Change 4: Line 4140
```typescript
// Before:
const predictionIds = predictions.map(p => p.id);

// After:
const predictionIds = predictions.map((p: { id: number }) => p.id);
```

## Verification Steps

1. Run `npx prisma generate` to regenerate Prisma client
2. Run `npm run build` or `tsc --noEmit` to check for TypeScript errors
3. Verify all 9 errors are resolved
