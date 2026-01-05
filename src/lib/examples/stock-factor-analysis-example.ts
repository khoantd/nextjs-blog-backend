/**
 * Example usage of stock factor analysis
 * This demonstrates how to integrate factor analysis with stock data
 */

import {
  STOCK_FACTORS,
  FACTOR_DESCRIPTIONS,
  analyzeFactors,
  getFactorSummary,
  correlateFactorsWithPriceMovement,
  calculateMA,
  calculateRSI,
  type ExtendedStockData,
  type StockFactor
} from '../stock-factors';

/**
 * Example 1: Basic factor analysis
 */
export function exampleBasicFactorAnalysis() {
  // Sample stock data
  const stockData: ExtendedStockData[] = [
    { Date: '2024-01-01', Close: 100, Volume: 1000000 },
    { Date: '2024-01-02', Close: 105, Volume: 1500000, pct_change: 5.0 },
    { Date: '2024-01-03', Close: 108, Volume: 2000000, pct_change: 2.86 },
    // ... more data
  ];

  // Analyze factors with additional market data
  const factorAnalyses = analyzeFactors(stockData, {
    nasdaqData: [
      { date: '2024-01-02', pct_change: 2.0 },
      { date: '2024-01-03', pct_change: 1.5 }
    ],
    earningsDates: ['2024-01-05'],
    newsData: [
      { date: '2024-01-02', sentiment: 'positive' }
    ]
  });

  console.log('Factor Analyses:', factorAnalyses);

  // Get summary statistics
  const summary = getFactorSummary(factorAnalyses);
  console.log('Factor Summary:', summary);

  return { factorAnalyses, summary };
}

/**
 * Example 2: Correlate factors with price movements
 */
export function exampleFactorCorrelation() {
  const stockData: ExtendedStockData[] = [
    { Date: '2024-01-01', Close: 100, Volume: 1000000, pct_change: 0 },
    { Date: '2024-01-02', Close: 105, Volume: 1500000, pct_change: 5.0 },
    { Date: '2024-01-03', Close: 108, Volume: 2000000, pct_change: 2.86 },
  ];

  const factorAnalyses = analyzeFactors(stockData, {
    nasdaqData: [{ date: '2024-01-02', pct_change: 2.5 }],
    newsData: [{ date: '2024-01-02', sentiment: 'positive' }]
  });

  const correlation = correlateFactorsWithPriceMovement(factorAnalyses, stockData);

  console.log('Factor Correlation:', correlation);

  // Find most impactful factors
  const sortedFactors = Object.entries(correlation)
    .sort((a, b) => b[1].avgReturn - a[1].avgReturn)
    .slice(0, 5);

  console.log('Top 5 Factors by Average Return:', sortedFactors);

  return correlation;
}

/**
 * Example 3: Calculate technical indicators
 */
export function exampleTechnicalIndicators() {
  const prices = [100, 102, 101, 105, 108, 107, 110, 112, 111, 115];

  // Calculate moving averages
  const ma5 = calculateMA(prices, 5);
  const ma10 = calculateMA(prices, 10);

  console.log('MA5:', ma5);
  console.log('MA10:', ma10);

  // Calculate RSI
  const rsi = calculateRSI(prices, 14);
  console.log('RSI:', rsi);

  return { ma5, ma10, rsi };
}

/**
 * Example 4: Full integration with stock analysis
 */
export async function exampleFullStockAnalysis(csvFilePath: string) {
  // This would typically parse your CSV file
  // For demonstration, using sample data
  const stockData: ExtendedStockData[] = [
    // ... parse from CSV
  ];

  // Calculate all technical indicators
  const closePrices = stockData.map(d => d.Close);
  const volumes = stockData.map(d => d.Volume || 0);

  const ma20 = calculateMA(closePrices, 20);
  const ma50 = calculateMA(closePrices, 50);
  const ma200 = calculateMA(closePrices, 200);
  const rsi = calculateRSI(closePrices);
  const volumeMA20 = calculateMA(volumes, 20);

  // Enrich stock data with technical indicators
  const enrichedData: ExtendedStockData[] = stockData.map((data, index) => ({
    ...data,
    ma20: ma20[index],
    ma50: ma50[index],
    ma200: ma200[index],
    rsi: rsi[index]
  }));

  // Perform factor analysis
  const factorAnalyses = analyzeFactors(enrichedData, {
    nasdaqData: [], // Add Nasdaq data
    sectorData: [], // Add sector data
    earningsDates: [], // Add earnings dates
    newsData: [], // Add news data
    shortInterest: 20, // Add short interest percentage
    macroEvents: [] // Add macro economic events
  });

  // Get summary and correlation
  const summary = getFactorSummary(factorAnalyses);
  const correlation = correlateFactorsWithPriceMovement(factorAnalyses, enrichedData);

  return {
    enrichedData,
    factorAnalyses,
    summary,
    correlation
  };
}

/**
 * Example 5: Display factor descriptions
 */
export function displayFactorDescriptions() {
  console.log('\n=== Stock Market Factors ===\n');

  const categories = ['technical', 'fundamental', 'market', 'sentiment'] as const;

  categories.forEach(category => {
    console.log(`\n${category.toUpperCase()} FACTORS:`);
    console.log('─'.repeat(50));

    STOCK_FACTORS
      .filter(factor => FACTOR_DESCRIPTIONS[factor].category === category)
      .forEach(factor => {
        const desc = FACTOR_DESCRIPTIONS[factor];
        console.log(`\n${desc.name}`);
        console.log(`  Factor: ${desc.factor}`);
        console.log(`  Description: ${desc.description}`);
      });
  });
}

/**
 * Example 6: Identify days with multiple factors
 */
export function findHighFactorDays(
  factorAnalyses: ReturnType<typeof analyzeFactors>,
  minFactors: number = 3
) {
  const highFactorDays = factorAnalyses
    .filter(analysis => analysis.factorCount >= minFactors)
    .sort((a, b) => b.factorCount - a.factorCount);

  console.log(`\nDays with ${minFactors}+ factors:`);
  console.log('─'.repeat(70));

  highFactorDays.forEach(day => {
    console.log(`\n${day.date} - ${day.factorCount} factors:`);
    day.factorList.forEach(factor => {
      const desc = FACTOR_DESCRIPTIONS[factor];
      console.log(`  • ${desc.name}: ${desc.description}`);
    });
  });

  return highFactorDays;
}

/**
 * Example 7: Export factor analysis to JSON
 */
export function exportFactorAnalysis(
  factorAnalyses: ReturnType<typeof analyzeFactors>,
  summary: ReturnType<typeof getFactorSummary>,
  correlation: ReturnType<typeof correlateFactorsWithPriceMovement>
) {
  const report = {
    metadata: {
      generatedAt: new Date().toISOString(),
      totalDays: summary.totalDays,
      averageFactorsPerDay: summary.averageFactorsPerDay
    },
    factorFrequency: summary.factorFrequency,
    factorCorrelation: correlation,
    dailyAnalyses: factorAnalyses.map(analysis => ({
      date: analysis.date,
      factorCount: analysis.factorCount,
      activeFactors: analysis.factorList.map(factor => ({
        factor,
        name: FACTOR_DESCRIPTIONS[factor].name,
        category: FACTOR_DESCRIPTIONS[factor].category
      }))
    })),
    topFactors: Object.entries(correlation)
      .map(([factor, data]) => ({
        factor,
        name: FACTOR_DESCRIPTIONS[factor as StockFactor].name,
        occurrences: data.occurrences,
        avgReturn: data.avgReturn,
        correlation: data.correlation
      }))
      .sort((a, b) => b.avgReturn - a.avgReturn)
      .slice(0, 10)
  };

  return JSON.stringify(report, null, 2);
}

// Run examples if executed directly
if (require.main === module) {
  console.log('=== Example 1: Basic Factor Analysis ===');
  exampleBasicFactorAnalysis();

  console.log('\n=== Example 2: Factor Correlation ===');
  exampleFactorCorrelation();

  console.log('\n=== Example 3: Technical Indicators ===');
  exampleTechnicalIndicators();

  console.log('\n=== Example 5: Factor Descriptions ===');
  displayFactorDescriptions();
}
