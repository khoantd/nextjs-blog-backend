# Stock Analyses API - Filtering Architecture

Visual architecture diagrams and flow charts for the filtering implementation.

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT APPLICATION                        │
│  (Browser, Mobile App, CLI Tool, External Service)             │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 │ HTTP Request with Query Parameters
                 │ GET /api/stock-analyses?market=US&status=completed
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                     EXPRESS.JS MIDDLEWARE                        │
│  • CORS         • Helmet        • Rate Limiting                 │
│  • Authentication (NextAuth JWT)                                │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                      ROUTE HANDLER                              │
│  src/routes/stock-analyses.ts                                   │
│  • Parse request                                                │
│  • Call filter parsing                                          │
│  • Handle errors                                                │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FILTER UTILITIES                             │
│  src/lib/filter-utils.ts                                        │
│                                                                 │
│  ┌─────────────────────────────────────────────────┐           │
│  │  Parse Functions                                │           │
│  │  • parseStockAnalysisFilters()                  │           │
│  │  • parseDailyFactorFilters()                    │           │
│  │  • parseDailyScoreFilters()                     │           │
│  │  • parsePredictionFilters()                     │           │
│  └─────────────────────────────────────────────────┘           │
│                          │                                      │
│                          │ Validation                           │
│                          ▼                                      │
│  ┌─────────────────────────────────────────────────┐           │
│  │  Validation Layer                               │           │
│  │  • Type checking (string, number, boolean)      │           │
│  │  • Format validation (dates, enums)             │           │
│  │  • Range validation (min <= max)                │           │
│  │  • Throw FilterValidationError if invalid       │           │
│  └─────────────────────────────────────────────────┘           │
│                          │                                      │
│                          │ Valid Filters                        │
│                          ▼                                      │
│  ┌─────────────────────────────────────────────────┐           │
│  │  Query Builder / Filter Application             │           │
│  │  • buildStockAnalysisWhere()    [Database]      │           │
│  │  • buildDailyFactorWhere()      [Database]      │           │
│  │  • applyDailyScoreFilters()     [In-Memory]     │           │
│  │  • applyPredictionFilters()     [In-Memory]     │           │
│  └─────────────────────────────────────────────────┘           │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                    DATA RETRIEVAL LAYER                         │
│                                                                 │
│  ┌──────────────────────┐      ┌──────────────────────┐        │
│  │  Database Query      │      │  In-Memory Filter    │        │
│  │  (Prisma)            │      │  (JavaScript)        │        │
│  │                      │      │                      │        │
│  │  WHERE clauses       │      │  Array.filter()      │        │
│  │  • Indexed fields    │      │  • Calculated data   │        │
│  │  • Efficient query   │      │  • Post-processing   │        │
│  └──────────────────────┘      └──────────────────────┘        │
│           │                              │                      │
│           ▼                              ▼                      │
│  ┌──────────────────────┐      ┌──────────────────────┐        │
│  │  SQLite Database     │      │  Computed Results    │        │
│  │  • stock_analyses    │      │  • Daily scores      │        │
│  │  • daily_factor_data │      │  • Predictions       │        │
│  └──────────────────────┘      └──────────────────────┘        │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                    RESPONSE FORMATTING                          │
│  • Apply pagination                                             │
│  • Format JSON response                                         │
│  • Add metadata (total, pages)                                  │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 │ JSON Response
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT APPLICATION                        │
│  • Receive filtered data                                        │
│  • Render results                                               │
│  • Update UI                                                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Request Flow - Database Filtering

Example: `GET /api/stock-analyses?market=US&status=completed&favorite=true`

```
1. REQUEST PARSING
   ┌─────────────────────────────────────┐
   │ Express receives request            │
   │ req.query = {                       │
   │   market: 'US',                     │
   │   status: 'completed',              │
   │   favorite: 'true'                  │
   │ }                                   │
   └─────────┬───────────────────────────┘
             │
             ▼
2. FILTER PARSING
   ┌─────────────────────────────────────┐
   │ parseStockAnalysisFilters(req)      │
   │ • Validate 'US' is valid market     │
   │ • Parse 'true' to boolean           │
   │ • Return typed filters object       │
   └─────────┬───────────────────────────┘
             │
             ▼
   ┌─────────────────────────────────────┐
   │ Filters Object (Validated)          │
   │ {                                   │
   │   market: 'US',                     │
   │   status: ['completed'],            │
   │   favorite: true                    │
   │ }                                   │
   └─────────┬───────────────────────────┘
             │
             ▼
3. QUERY BUILDING
   ┌─────────────────────────────────────┐
   │ buildStockAnalysisWhere(filters)    │
   │ Returns Prisma WHERE clause:        │
   │ {                                   │
   │   market: 'US',                     │
   │   status: { in: ['completed'] },    │
   │   favorite: true                    │
   │ }                                   │
   └─────────┬───────────────────────────┘
             │
             ▼
4. DATABASE QUERY
   ┌─────────────────────────────────────┐
   │ prisma.stockAnalysis.findMany({     │
   │   where: {                          │
   │     market: 'US',                   │
   │     status: { in: ['completed'] },  │
   │     favorite: true                  │
   │   },                                │
   │   skip: 0,                          │
   │   take: 20                          │
   │ })                                  │
   └─────────┬───────────────────────────┘
             │
             ▼
   ┌─────────────────────────────────────┐
   │ SQLite executes:                    │
   │ SELECT * FROM stock_analyses        │
   │ WHERE market = 'US'                 │
   │   AND status IN ('completed')       │
   │   AND favorite = 1                  │
   │ LIMIT 20 OFFSET 0                   │
   └─────────┬───────────────────────────┘
             │
             ▼
5. RESULTS
   ┌─────────────────────────────────────┐
   │ [                                   │
   │   { id: 1, symbol: 'AAPL', ... },   │
   │   { id: 2, symbol: 'TSLA', ... },   │
   │   { id: 3, symbol: 'MSFT', ... }    │
   │ ]                                   │
   └─────────┬───────────────────────────┘
             │
             ▼
6. RESPONSE FORMATTING
   ┌─────────────────────────────────────┐
   │ {                                   │
   │   data: {                           │
   │     items: [...],                   │
   │     pagination: {                   │
   │       page: 1, limit: 20,           │
   │       total: 3, totalPages: 1       │
   │     }                               │
   │   }                                 │
   │ }                                   │
   └─────────────────────────────────────┘
```

---

## Request Flow - In-Memory Filtering

Example: `GET /api/stock-analyses/1/daily-scores?minScore=70&prediction=HIGH_PROBABILITY`

```
1. REQUEST PARSING
   ┌─────────────────────────────────────┐
   │ req.query = {                       │
   │   minScore: '70',                   │
   │   prediction: 'HIGH_PROBABILITY'    │
   │ }                                   │
   └─────────┬───────────────────────────┘
             │
             ▼
2. FILTER PARSING
   ┌─────────────────────────────────────┐
   │ parseDailyScoreFilters(req)         │
   │ • Parse '70' to number              │
   │ • Validate enum value               │
   └─────────┬───────────────────────────┘
             │
             ▼
   ┌─────────────────────────────────────┐
   │ Filters Object                      │
   │ {                                   │
   │   minScore: 70,                     │
   │   prediction: 'HIGH_PROBABILITY'    │
   │ }                                   │
   └─────────┬───────────────────────────┘
             │
             ▼
3. CALCULATE ALL SCORES
   ┌─────────────────────────────────────┐
   │ calculateScoresOnDemand(1, {...})   │
   │ • Fetch all factor data from DB     │
   │ • Calculate scores for each day     │
   │ • Generate predictions              │
   └─────────┬───────────────────────────┘
             │
             ▼
   ┌─────────────────────────────────────┐
   │ All Scores (Unfiltered)             │
   │ [                                   │
   │   { date: '2024-01-01',             │
   │     score: 45, pred: 'LOW' },       │
   │   { date: '2024-01-02',             │
   │     score: 75, pred: 'HIGH' },      │
   │   { date: '2024-01-03',             │
   │     score: 85, pred: 'HIGH' },      │
   │   ...                               │
   │ ]                                   │
   └─────────┬───────────────────────────┘
             │
             ▼
4. APPLY FILTERS (In-Memory)
   ┌─────────────────────────────────────┐
   │ applyDailyScoreFilters(             │
   │   allScores,                        │
   │   { minScore: 70,                   │
   │     prediction: 'HIGH_PROBABILITY' }│
   │ )                                   │
   │                                     │
   │ scores.filter(s =>                  │
   │   s.score >= 70 &&                  │
   │   s.prediction === 'HIGH_PROBABILITY│
   │ )                                   │
   └─────────┬───────────────────────────┘
             │
             ▼
   ┌─────────────────────────────────────┐
   │ Filtered Scores                     │
   │ [                                   │
   │   { date: '2024-01-02',             │
   │     score: 75, pred: 'HIGH' },      │
   │   { date: '2024-01-03',             │
   │     score: 85, pred: 'HIGH' }       │
   │ ]                                   │
   └─────────┬───────────────────────────┘
             │
             ▼
5. SORT & PAGINATE
   ┌─────────────────────────────────────┐
   │ • Sort by orderBy (date/score)      │
   │ • Apply pagination                  │
   │ • Take requested page               │
   └─────────┬───────────────────────────┘
             │
             ▼
6. RESPONSE
   ┌─────────────────────────────────────┐
   │ {                                   │
   │   data: {                           │
   │     items: [2 filtered scores],     │
   │     pagination: { ... }             │
   │   }                                 │
   │ }                                   │
   └─────────────────────────────────────┘
```

---

## Error Handling Flow

```
┌─────────────────────────────────────┐
│ Invalid Request                     │
│ ?createdFrom=invalid-date           │
└─────────┬───────────────────────────┘
          │
          ▼
┌─────────────────────────────────────┐
│ parseStockAnalysisFilters()         │
│ • Try to parse date                 │
│ • Date parsing fails                │
│ • Throw FilterValidationError       │
└─────────┬───────────────────────────┘
          │
          ▼
┌─────────────────────────────────────┐
│ Error Caught in Route Handler       │
│ if (error instanceof                │
│     FilterValidationError) {        │
│   return res.status(400).json({     │
│     error: "Invalid filter",        │
│     message: error.message,         │
│     parameter: "createdFrom",       │
│     value: "invalid-date"           │
│   })                                │
│ }                                   │
└─────────┬───────────────────────────┘
          │
          ▼
┌─────────────────────────────────────┐
│ Client Receives 400 Response        │
│ {                                   │
│   "error": "Invalid filter",        │
│   "message": "Invalid date format.  │
│              Expected YYYY-MM-DD",  │
│   "parameter": "createdFrom",       │
│   "value": "invalid-date"           │
│ }                                   │
└─────────┬───────────────────────────┘
          │
          ▼
┌─────────────────────────────────────┐
│ Client Displays Error to User       │
│ "Invalid createdFrom: Invalid date  │
│  format. Expected YYYY-MM-DD"       │
└─────────────────────────────────────┘
```

---

## Filter Type Decision Tree

```
                    [Filter Request]
                           │
                           ▼
                ┌──────────────────────┐
                │  Which Endpoint?     │
                └──────────┬───────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         ▼                 ▼                 ▼
    [List View]    [Factor Data]    [Scores/Predictions]
         │                 │                 │
         │                 │                 │
         ▼                 ▼                 ▼
  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
  │  Database   │  │  Database   │  │  In-Memory  │
  │  Filtering  │  │  Filtering  │  │  Filtering  │
  └─────────────┘  └─────────────┘  └─────────────┘
         │                 │                 │
         │                 │                 │
         ▼                 ▼                 ▼
  [Prisma WHERE]   [Prisma WHERE]   [Array.filter()]
         │                 │                 │
         ▼                 ▼                 ▼
  [SQL Query]      [SQL Query]      [Calculate First]
                                            │
                                            ▼
                                     [Then Filter]


Decision Criteria:
─────────────────
Database Filtering:
  ✓ Data is stored in database
  ✓ Can leverage indexes
  ✓ Large datasets
  ✓ Efficient for complex queries

In-Memory Filtering:
  ✓ Data is calculated on-demand
  ✓ Must compute all first anyway
  ✓ Moderate result sizes
  ✓ Need to sort after filtering
```

---

## Component Interaction Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                     Frontend Application                      │
│                                                              │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────┐  │
│  │ Filter UI      │  │ Results Table  │  │ Pagination   │  │
│  │ Component      │  │ Component      │  │ Controls     │  │
│  └────────┬───────┘  └────────┬───────┘  └──────┬───────┘  │
│           │                   │                  │          │
│           │    State Change   │                  │          │
│           └───────────────────┼──────────────────┘          │
│                               │                             │
└───────────────────────────────┼─────────────────────────────┘
                                │
                                │ HTTP Request
                                │ with filters
                                │
┌───────────────────────────────▼─────────────────────────────┐
│                        Backend API                          │
│                                                             │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────┐ │
│  │ Route Handler  │→ │ Filter Parser  │→ │ Query Builder│ │
│  └────────────────┘  └────────────────┘  └──────┬───────┘ │
│                                                   │         │
│                                                   ▼         │
│                          ┌────────────────────────────┐    │
│                          │   Prisma Client            │    │
│                          └────────────┬───────────────┘    │
└───────────────────────────────────────┼────────────────────┘
                                        │
                                        │ SQL Query
                                        │
┌───────────────────────────────────────▼────────────────────┐
│                      SQLite Database                        │
│                                                             │
│  ┌────────────────┐  ┌────────────────┐                   │
│  │ stock_analyses │  │daily_factor_   │                   │
│  │ table          │  │data table      │                   │
│  │                │  │                │                   │
│  │ • Indexes      │  │ • Indexes      │                   │
│  │ • Foreign Keys │  │ • Foreign Keys │                   │
│  └────────────────┘  └────────────────┘                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Flow - Complex Filter Query

Example: Multiple filters with factor flags

```
USER INPUT:
  market = US
  status = completed
  favorite = true
  minPrice = 100
  maxPrice = 200
  dateFrom = 2024-01-01

         │
         ▼
FRONTEND:
  Builds query string
  /api/stock-analyses?market=US&status=completed&...

         │
         ▼
ROUTE HANDLER:
  Extracts query params
  req.query = { market: 'US', status: 'completed', ... }

         │
         ▼
FILTER PARSER:
  parseStockAnalysisFilters(req)
  Validates each parameter
  Returns: {
    market: 'US',
    status: ['completed'],
    favorite: true,
    minPrice: 100,
    maxPrice: 200,
    createdFrom: Date('2024-01-01')
  }

         │
         ▼
QUERY BUILDER:
  buildStockAnalysisWhere(filters)
  Returns: {
    market: 'US',
    status: { in: ['completed'] },
    favorite: true,
    latestPrice: {
      not: null,
      gte: 100,
      lte: 200
    },
    createdAt: {
      gte: Date('2024-01-01')
    }
  }

         │
         ▼
PRISMA:
  prisma.stockAnalysis.findMany({
    where: { ... },
    skip: 0,
    take: 20
  })

         │
         ▼
SQL:
  SELECT * FROM stock_analyses
  WHERE market = 'US'
    AND status IN ('completed')
    AND favorite = 1
    AND latest_price IS NOT NULL
    AND latest_price >= 100
    AND latest_price <= 200
    AND created_at >= '2024-01-01'
  LIMIT 20 OFFSET 0

         │
         ▼
RESULTS:
  [3 matching records]

         │
         ▼
RESPONSE:
  {
    data: {
      items: [3 records],
      pagination: {
        page: 1,
        limit: 20,
        total: 3,
        totalPages: 1
      }
    }
  }

         │
         ▼
FRONTEND:
  Renders results in table
  Updates pagination controls
```

---

## Filter Validation State Machine

```
                    [Start]
                       │
                       ▼
            ┌──────────────────┐
            │ Parse Parameter  │
            └────────┬─────────┘
                     │
          ┌──────────┼──────────┐
          │          │          │
          ▼          ▼          ▼
    [String]    [Number]   [Boolean]
          │          │          │
          │          │          │
          ▼          ▼          ▼
    [Check Valid] [Check Valid] [Parse Value]
          │          │          │
          │          │          │
    ┌─────┼─────┐    │    ┌─────┼─────┐
    │     │     │    │    │     │     │
    ▼     ▼     ▼    ▼    ▼     ▼     ▼
  [Enum] [Format] [Valid] [Range] ['true'] ['false']
    │     │     │    │    │     │     │
    │     │     │    │    │     │     │
    ▼     ▼     ▼    ▼    ▼     ▼     ▼
  [✓/✗] [✓/✗] [✓/✗] [✓/✗] [true] [false]
    │     │     │    │      │      │
    └─────┴─────┴────┴──────┴──────┘
              │
              ▼
       [All Valid?]
              │
       ┌──────┴──────┐
       │             │
       ▼             ▼
    [YES]          [NO]
       │             │
       ▼             ▼
  [Return]  [Throw FilterValidation
   Filters]        Error]
       │             │
       ▼             ▼
   [Success]     [400 Error]
```

---

## Performance Comparison

```
┌─────────────────────────────────────────────────────────┐
│             Database vs In-Memory Filtering              │
└─────────────────────────────────────────────────────────┘

DATABASE FILTERING (Efficient):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Request → Parse → Build WHERE → Execute Query → Return
  ───────────────────────────────────────────────────────▶
  [=========>]  10-200ms for filtered results

  Pros:
  ✓ Filters BEFORE fetching (efficient)
  ✓ Uses database indexes
  ✓ Handles large datasets well
  ✓ Minimal memory usage

  Cons:
  ✗ Limited to stored data
  ✗ Complex queries may be slower


IN-MEMORY FILTERING (On-Demand):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Request → Calculate All → Filter → Sort → Paginate → Return
  ─────────────────────────────────────────────────────────▶
  [=================>]  20-100ms for filtered results

  Pros:
  ✓ Works with calculated data
  ✓ Flexible filtering logic
  ✓ Can combine multiple sources

  Cons:
  ✗ Must calculate all first
  ✗ More memory usage
  ✗ Slower for large datasets
```

---

## Scalability Considerations

```
┌──────────────────────────────────────────────────────────┐
│              Current Scale → Future Scale                 │
└──────────────────────────────────────────────────────────┘

CURRENT (SQLite):
  • 1-10K stock analyses
  • 100K-1M daily factor records
  • Single server
  • < 100ms query time

  Filters work efficiently with:
  ✓ Database indexes
  ✓ Pagination
  ✓ Simple queries

FUTURE SCALE (If Needed):
  • 100K+ stock analyses
  • 10M+ daily factor records
  • Multiple servers
  • Need < 50ms query time

  Options:
  1. PostgreSQL Migration
     ✓ Better indexing
     ✓ Full-text search
     ✓ Materialized views

  2. Read Replicas
     ✓ Distribute query load
     ✓ Dedicated filtering servers

  3. Caching Layer
     ✓ Redis for popular filters
     ✓ 5-10 minute TTL

  4. Search Engine
     ✓ Elasticsearch for complex filters
     ✓ Full-text + faceted search
```

---

## Summary

This filtering architecture provides:

✅ **Type-Safe**: All filters validated at TypeScript level
✅ **Efficient**: Database-level filtering where possible
✅ **Flexible**: In-memory filtering for calculated data
✅ **Scalable**: Ready for growth with clear optimization paths
✅ **Maintainable**: Clear separation of concerns
✅ **Testable**: Each layer independently testable
✅ **User-Friendly**: Detailed error messages
✅ **Production-Ready**: Comprehensive validation and error handling
