/**
 * Stock Factor Analysis Service
 * Integrates factor analysis with the existing stock analysis workflow
 */

import {
  analyzeFactors,
  getFactorSummary,
  correlateFactorsWithPriceMovement,
  calculateMA,
  calculateRSI,
  calculateDailyScore,
  calculateDailyScores,
  getDailyScoreSummary,
  predictStrongMovement,
  type ExtendedStockData,
  type FactorAnalysis,
  type StockFactor,
  FACTOR_DESCRIPTIONS,
  type DailyScoreConfig,
  type DailyScoreResult,
  DEFAULT_DAILY_SCORE_CONFIG
} from '../stock-factors';

export interface FactorAnalysisOptions {
  nasdaqData?: Array<{ date: string; pct_change: number }>;
  sectorData?: Array<{ date: string; pct_change: number }>;
  earningsDates?: string[];
  newsData?: Array<{ date: string; sentiment: 'positive' | 'negative' | 'neutral' }>;
  shortInterest?: number;
  macroEvents?: Array<{ date: string; favorable: boolean }>;
  scoreConfig?: DailyScoreConfig;
}

export interface EnrichedTransaction {
  tx: number;
  date: string;
  close: number;
  pctChange: number;
  factors: StockFactor[];
  factorCount: number;
  score?: number;
  aboveThreshold?: boolean;
  technicalIndicators?: {
    ma20?: number;
    ma50?: number;
    ma200?: number;
    rsi?: number;
    volume?: number;
    volumeMA20?: number;
  };
}

/**
 * Parse date string in various formats (MM/DD/YYYY, YYYY-MM-DD, etc.) to Date object
 */
function parseDateString(dateStr: string): Date {
  // Try MM/DD/YYYY format first (common in Vietnamese stock data)
  const mmddyyyy = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mmddyyyy) {
    const [, month, day, year] = mmddyyyy;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }
  
  // Try YYYY-MM-DD format
  const yyyymmdd = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (yyyymmdd) {
    const [, year, month, day] = yyyymmdd;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }
  
  // Fallback to standard Date parsing
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date format: ${dateStr}`);
  }
  return date;
}

/**
 * Parse CSV content into stock data array
 */
export function parseStockCSV(csvContent: string): ExtendedStockData[] {
  const lines = csvContent.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim());

  // Create a mapping from common header variations to expected keys
  const headerMap: Record<string, string> = {};
  headers.forEach((header, index) => {
    const lowerHeader = header.toLowerCase();
    // Map date variations to Date
    if (lowerHeader === 'date' || lowerHeader === 'time') headerMap[index] = 'Date';
    else if (lowerHeader === 'open') headerMap[index] = 'Open';
    else if (lowerHeader === 'high') headerMap[index] = 'High';
    else if (lowerHeader === 'low') headerMap[index] = 'Low';
    else if (lowerHeader === 'close') headerMap[index] = 'Close';
    else if (lowerHeader === 'volume') headerMap[index] = 'Volume';
    else if (lowerHeader === '' || lowerHeader === 'ticket') {
      // Skip empty columns or ticket column (they're not needed for analysis)
      headerMap[index] = '__SKIP__';
    } else {
      headerMap[index] = header; // Keep original if no map
    }
  });

  const data: ExtendedStockData[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    if (values.length < headers.length) continue;

    const row: any = {};

    headers.forEach((_, index) => {
      const value = values[index]?.trim();
      const mappedHeader = headerMap[index];

      // Skip columns marked for skipping (empty columns, ticket, etc.)
      if (mappedHeader === '__SKIP__') {
        return;
      }

      if (['Close', 'Open', 'High', 'Low'].includes(mappedHeader)) {
        const parsedValue = parseFloat(value);
        row[mappedHeader] = isNaN(parsedValue) ? 0 : parsedValue;
      } else if (mappedHeader === 'Volume') {
        const parsedValue = parseInt(value, 10);
        row[mappedHeader] = isNaN(parsedValue) ? 0 : parsedValue;
      } else if (mappedHeader === 'Date') {
        // Store date value as-is (will be parsed later)
        row[mappedHeader] = value;
      } else {
        row[mappedHeader] = value;
      }
    });

    if (row.Date && row.Close !== undefined) {
      data.push(row as ExtendedStockData);
    }
  }

  // Sort by date using proper date parsing
  return data.sort((a, b) => {
    try {
      const dateA = parseDateString(a.Date);
      const dateB = parseDateString(b.Date);
      return dateA.getTime() - dateB.getTime();
    } catch (error) {
      console.error(`Error sorting dates: ${error}`);
      return 0;
    }
  });
}

/**
 * Calculate percentage changes
 */
export function calculatePctChanges(data: ExtendedStockData[]): ExtendedStockData[] {
  return data.map((row, index) => {
    if (index === 0) {
      return { ...row, pct_change: 0 };
    }

    const prevClose = data[index - 1].Close;
    const pctChange = ((row.Close - prevClose) / prevClose) * 100;

    return { ...row, pct_change: pctChange };
  });
}

/**
 * Enrich stock data with technical indicators
 */
export function enrichWithTechnicalIndicators(
  data: ExtendedStockData[]
): ExtendedStockData[] {
  const closePrices = data.map(d => d.Close);
  const volumes = data.map(d => d.Volume || 0);

  const ma20 = calculateMA(closePrices, 20);
  const ma50 = calculateMA(closePrices, 50);
  const ma200 = calculateMA(closePrices, 200);
  const rsi = calculateRSI(closePrices, 14);

  return data.map((row, index) => ({
    ...row,
    ma20: ma20[index],
    ma50: ma50[index],
    ma200: ma200[index],
    rsi: rsi[index]
  }));
}

/**
 * Perform complete factor analysis on stock data
 */
export function performFactorAnalysis(
  stockData: ExtendedStockData[],
  options: FactorAnalysisOptions = {}
) {
  // Enrich data with technical indicators
  const enrichedData = enrichWithTechnicalIndicators(stockData);

  // Perform factor analysis
  const factorAnalyses = analyzeFactors(enrichedData, options);

  // Calculate daily scores
  const scoreConfig = options.scoreConfig || DEFAULT_DAILY_SCORE_CONFIG;
  const dailyScores = calculateDailyScores(factorAnalyses, scoreConfig);
  const scoreSummary = getDailyScoreSummary(dailyScores);

  // Get summary statistics
  const summary = getFactorSummary(factorAnalyses);

  // Calculate correlation with price movements
  const correlation = correlateFactorsWithPriceMovement(factorAnalyses, enrichedData);

  return {
    enrichedData,
    factorAnalyses,
    dailyScores,
    scoreSummary,
    summary,
    correlation
  };
}

/**
 * Enrich transactions with factor data
 */
export function enrichTransactionsWithFactors(
  transactions: Array<{ tx: number; date: string; close: number; pctChange: number }>,
  factorAnalyses: FactorAnalysis[],
  enrichedData: ExtendedStockData[],
  dailyScores?: DailyScoreResult[]
): EnrichedTransaction[] {
  return transactions.map(tx => {
    const txDate = new Date(tx.date).toISOString().split('T')[0];

    // Find corresponding factor analysis
    const factorAnalysis = factorAnalyses.find(
      fa => new Date(fa.date).toISOString().split('T')[0] === txDate
    );

    // Find corresponding stock data for technical indicators
    const stockDay = enrichedData.find(
      sd => new Date(sd.Date).toISOString().split('T')[0] === txDate
    );

    // Find corresponding daily score
    const dailyScore = dailyScores?.find(
      ds => new Date(ds.date).toISOString().split('T')[0] === txDate
    );

    return {
      ...tx,
      factors: factorAnalysis?.factorList || [],
      factorCount: factorAnalysis?.factorCount || 0,
      score: dailyScore?.score,
      aboveThreshold: dailyScore?.aboveThreshold,
      technicalIndicators: stockDay ? {
        ma20: stockDay.ma20,
        ma50: stockDay.ma50,
        ma200: stockDay.ma200,
        rsi: stockDay.rsi,
        volume: stockDay.Volume,
      } : undefined
    };
  });
}

/**
 * Generate AI insights prompt based on factor analysis
 */
export function generateFactorInsightsPrompt(
  symbol: string,
  summary: ReturnType<typeof getFactorSummary>,
  correlation: ReturnType<typeof correlateFactorsWithPriceMovement>,
  enrichedTransactions: EnrichedTransaction[]
): string {
  // Find top factors
  const topFactors = Object.entries(correlation)
    .filter(([_, data]) => data.occurrences > 0)
    .sort((a, b) => b[1].avgReturn - a[1].avgReturn)
    .slice(0, 5);

  // Find most common factors in high-return days
  const factorOccurrences: Record<string, number> = {};
  enrichedTransactions.forEach(tx => {
    tx.factors.forEach(factor => {
      factorOccurrences[factor] = (factorOccurrences[factor] || 0) + 1;
    });
  });

  const mostCommonFactors = Object.entries(factorOccurrences)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const prompt = `Analyze the stock performance of ${symbol} based on the following factor analysis:

SUMMARY:
- Total trading days analyzed: ${summary.totalDays}
- Average factors per day: ${summary.averageFactorsPerDay.toFixed(2)}
- Days with significant price movements: ${enrichedTransactions.length}

TOP PERFORMING FACTORS (by average return):
${topFactors.map(([factor, data], index) => {
    const desc = FACTOR_DESCRIPTIONS[factor as StockFactor];
    return `${index + 1}. ${desc.name} (${factor})
   - Occurrences: ${data.occurrences}
   - Average Return: ${data.avgReturn.toFixed(2)}%
   - Description: ${desc.description}`;
  }).join('\n')}

MOST COMMON FACTORS ON HIGH-RETURN DAYS:
${mostCommonFactors.map(([factor, count], index) => {
    const desc = FACTOR_DESCRIPTIONS[factor as StockFactor];
    return `${index + 1}. ${desc.name}: ${count} occurrences`;
  }).join('\n')}

FACTOR FREQUENCY ACROSS ALL DAYS:
${Object.entries(summary.factorFrequency)
      .filter(([_, freq]) => (freq || 0) > 5)
      .sort((a, b) => (b[1] || 0) - (a[1] || 0))
      .map(([factor, freq]) => {
        const desc = FACTOR_DESCRIPTIONS[factor as StockFactor];
        return `- ${desc.name}: ${freq?.toFixed(1)}% of days`;
      }).join('\n')}

Please provide:
1. Key insights about which factors most strongly correlate with price increases
2. Patterns or combinations of factors that appear most frequently on high-return days
3. Recommendations for monitoring these factors in future trading decisions
4. Any notable observations about the technical, fundamental, or market factors`;

  return prompt;
}

/**
 * Format factor analysis results for API response
 */
export function formatFactorAnalysisResults(
  factorAnalyses: FactorAnalysis[],
  summary: ReturnType<typeof getFactorSummary>,
  correlation: ReturnType<typeof correlateFactorsWithPriceMovement>,
  dailyScores?: DailyScoreResult[],
  scoreSummary?: ReturnType<typeof getDailyScoreSummary>
) {
  return {
    analyses: factorAnalyses.map(analysis => ({
      date: analysis.date,
      factorCount: analysis.factorCount,
      factors: analysis.factorList.map(factor => ({
        factor,
        name: FACTOR_DESCRIPTIONS[factor].name,
        category: FACTOR_DESCRIPTIONS[factor].category,
        description: FACTOR_DESCRIPTIONS[factor].description
      }))
    })),
    dailyScores: dailyScores?.map(score => ({
      date: score.date,
      score: score.score,
      factorCount: score.factorCount,
      aboveThreshold: score.aboveThreshold,
      factors: score.factors.map(factor => ({
        factor,
        name: FACTOR_DESCRIPTIONS[factor].name,
        contribution: score.breakdown[factor]?.contribution || 0
      }))
    })),
    summary: {
      totalDays: summary.totalDays,
      averageFactorsPerDay: summary.averageFactorsPerDay,
      factorCounts: summary.factorCounts,
      factorFrequency: Object.entries(summary.factorFrequency).map(([factor, freq]) => ({
        factor,
        name: FACTOR_DESCRIPTIONS[factor as StockFactor].name,
        frequency: freq,
        count: summary.factorCounts[factor as StockFactor] || 0
      }))
    },
    scoreSummary: scoreSummary ? {
      totalDays: scoreSummary.totalDays,
      highScoreDays: scoreSummary.highScoreDays,
      highScorePercentage: scoreSummary.highScorePercentage,
      averageScore: scoreSummary.averageScore,
      maxScore: scoreSummary.maxScore,
      minScore: scoreSummary.minScore,
      factorFrequency: Object.entries(scoreSummary.factorFrequency).map(([factor, freq]) => ({
        factor,
        name: FACTOR_DESCRIPTIONS[factor as StockFactor].name,
        frequency: freq
      }))
    } : null,
    correlation: Object.entries(correlation).map(([factor, data]) => ({
      factor,
      name: FACTOR_DESCRIPTIONS[factor as StockFactor].name,
      category: FACTOR_DESCRIPTIONS[factor as StockFactor].category,
      occurrences: data.occurrences,
      avgReturn: data.avgReturn,
      correlation: data.correlation
    })).sort((a, b) => b.avgReturn - a.avgReturn)
  };
}

/**
 * Save complete factor analysis to database
 * Integrates daily factor data, daily scores, and factor tables
 */
export async function saveFactorAnalysisToDatabase(
  stockAnalysisId: number,
  csvContent: string
) {
  console.log(`[Factor Service] Saving raw stock data for stock analysis ID: ${stockAnalysisId}`);
  console.log(`[Factor Service] CSV content length: ${csvContent.length} characters`);
  console.log(`[Factor Service] CSV first 500 chars: ${csvContent.substring(0, 500)}`);

  try {
    // Parse CSV to get raw data
    const stockData = parseStockCSV(csvContent);
    
    if (stockData.length === 0) {
      throw new Error('No valid stock data found in CSV. Please check the CSV format and ensure it has Date and Close columns. The CSV should have headers like: date,close,open,high,low,volume');
    }
    
    console.log(`[Factor Service] Parsed ${stockData.length} rows from CSV`);
    if (stockData.length > 0) {
      console.log(`[Factor Service] First row sample:`, {
        Date: stockData[0].Date,
        Close: stockData[0].Close,
        Open: stockData[0].Open,
        High: stockData[0].High,
        Low: stockData[0].Low,
        Volume: stockData[0].Volume
      });
    }

    // Calculate percentage changes before saving
    const dataWithPctChanges = calculatePctChanges(stockData);
    
    if (dataWithPctChanges.length === 0) {
      throw new Error('Failed to calculate percentage changes. Please check the data format.');
    }

    // Save daily data with pctChange calculated
    console.log(`[Factor Service] Saving ${dataWithPctChanges.length} days of raw price data with pctChange`);
    const factorDataToSave = dataWithPctChanges.map((day: any, index: number) => {
      // Calculate pctChange: ((current - previous) / previous) * 100
      let pctChange: number | null = null;
      if (index > 0 && dataWithPctChanges[index - 1].Close > 0) {
        const prevClose = dataWithPctChanges[index - 1].Close;
        pctChange = ((day.Close - prevClose) / prevClose) * 100;
      } else if (day.pct_change !== undefined) {
        // Use already calculated pct_change if available
        pctChange = day.pct_change;
      }

      // Normalize date to YYYY-MM-DD format for consistent storage
      let normalizedDate: string;
      try {
        if (!day.Date || day.Date.trim() === '') {
          throw new Error(`Empty date value at index ${index}`);
        }
        const dateObj = parseDateString(day.Date);
        if (isNaN(dateObj.getTime())) {
          throw new Error(`Invalid date object created from "${day.Date}"`);
        }
        normalizedDate = dateObj.toISOString().split('T')[0];
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[Factor Service] Error parsing date "${day.Date}" at index ${index}:`, errorMsg);
        // Fallback: try to extract YYYY-MM-DD from the string if it's already in that format
        const dateMatch = String(day.Date).match(/(\d{4}-\d{2}-\d{2})/);
        if (dateMatch) {
          normalizedDate = dateMatch[1];
          console.log(`[Factor Service] Using fallback date extraction: ${normalizedDate}`);
        } else {
          throw new Error(`Cannot normalize date: "${day.Date}". ${errorMsg}`);
        }
      }

      return {
        stockAnalysisId,
        date: normalizedDate,
        close: day.Close,
        open: day.Open,
        high: day.High,
        low: day.Low,
        volume: day.Volume,
        pctChange: pctChange !== null ? parseFloat(pctChange.toFixed(4)) : null
      };
    });

    // Import prisma dynamically to avoid circular dependencies
    const { prisma } = await import('../prisma');

    // Bulk insert daily data
    for (const data of factorDataToSave) {
      try {
        await prisma.dailyFactorData.upsert({
          where: {
            stockAnalysisId_date: {
              stockAnalysisId: data.stockAnalysisId,
              date: data.date
            }
          },
          update: data,
          create: data
        });
      } catch (upsertError) {
        console.error(`[Factor Service] Error upserting data for date ${data.date}:`, upsertError);
        throw upsertError;
      }
    }

    console.log(`[Factor Service] Successfully saved raw price data`);

    return {
      success: true,
      dailyFactorDataCount: factorDataToSave.length
    };

  } catch (error) {
    console.error('[Factor Service] Error saving raw stock data:', error);
    throw error;
  }
}

/**
 * Calculate factors on-demand from database raw data
 */
export async function calculateFactorsOnDemand(
  stockAnalysisId: number,
  options: FactorAnalysisOptions & { skip?: number; limit?: number } = {}
) {
  const { skip, limit, ...factorOptions } = options;
  const { prisma } = await import('../prisma');

  // Technical indicators need historical data to be accurate.
  // MA200 requires at least 200 previous data points.
  // percentage change requires at least 1 previous point.
  const LOOKBACK = 210; // Extra buffer

  // If limit is 0 or undefined, fetch all records (no pagination)
  const fetchAll = limit === 0 || limit === undefined;

  if (fetchAll) {
    // Fetch all records from the beginning for accurate technical indicators
    const rawData = await prisma.dailyFactorData.findMany({
      where: { stockAnalysisId },
      orderBy: { date: 'asc' }
    });

    if (rawData.length === 0) return [];

    // Debug: Check first few database records
    console.log(`[calculateFactorsOnDemand] Sample database records (first 3):`);
    rawData.slice(0, 3).forEach((d, idx) => {
      console.log(`  Record ${idx}: date="${d.date}" (type: ${typeof d.date}), close=${d.close}`);
    });

    // Convert to ExtendedStockData format
    const stockData: ExtendedStockData[] = rawData.map(d => ({
      Date: d.date,
      Close: d.close,
      Open: d.open || undefined,
      High: d.high || undefined,
      Low: d.low || undefined,
      Volume: d.volume || undefined
    }));

    // Debug: Check first few converted records
    console.log(`[calculateFactorsOnDemand] Sample converted records (first 3):`);
    stockData.slice(0, 3).forEach((d, idx) => {
      console.log(`  Converted ${idx}: Date="${d.Date}" (type: ${typeof d.Date}), Close=${d.Close}`);
    });

    // Enrich with percentage changes and indicators
    const dataWithPct = calculatePctChanges(stockData);
    const enrichedData = enrichWithTechnicalIndicators(dataWithPct);

    // Perform factor analysis
    const factorAnalyses = analyzeFactors(enrichedData, factorOptions);

    // Merge enriched technical data with boolean factors
    return enrichedData.map((data, index) => {
      const analysis = factorAnalyses[index];
      return {
        ...data,
        ...analysis.factors,
        factorCount: analysis.factorCount,
        factorList: analysis.factorList
      };
    });
  }

  // Paginated fetch with lookback
  const requestedSkip = skip ?? 0;
  const effectiveSkip = Math.max(0, requestedSkip - LOOKBACK);
  const actualLookback = requestedSkip - effectiveSkip;

  // Take enough to cover both lookback and the requested page
  const take = limit + actualLookback;

  // 1. Fetch raw data from DB with lookback
  const rawData = await prisma.dailyFactorData.findMany({
    where: { stockAnalysisId },
    orderBy: { date: 'asc' },
    skip: effectiveSkip,
    take: take
  });

  if (rawData.length === 0) return [];

  // 2. Convert to ExtendedStockData format
  const stockData: ExtendedStockData[] = rawData.map(d => ({
    Date: d.date,
    Close: d.close,
    Open: d.open || undefined,
    High: d.high || undefined,
    Low: d.low || undefined,
    Volume: d.volume || undefined
  }));

  // 3. Enrich with percentage changes and indicators
  const dataWithPct = calculatePctChanges(stockData);
  const enrichedData = enrichWithTechnicalIndicators(dataWithPct);

  // 4. Perform factor analysis
  const factorAnalyses = analyzeFactors(enrichedData, factorOptions);

  // 5. Merge enriched technical data with boolean factors
  const allResults = enrichedData.map((data, index) => {
    const analysis = factorAnalyses[index];
    return {
      ...data,
      ...analysis.factors,
      factorCount: analysis.factorCount,
      factorList: analysis.factorList
    };
  });

  // 6. Return only the requested range (discarding lookback)
  return allResults.slice(actualLookback, actualLookback + limit);
}

/**
 * Calculate scores on-demand from database raw data
 */
export async function calculateScoresOnDemand(
  stockAnalysisId: number,
  options: FactorAnalysisOptions & { skip?: number; limit?: number } = {}
) {
  const enrichedDataWithFactors = await calculateFactorsOnDemand(stockAnalysisId, options);

  if (enrichedDataWithFactors.length === 0) return [];

  // Convert back to format expected by analyzeFactors if needed, 
  // but we already have factors. We need FactorAnalysis[] format.
  const factorAnalyses: FactorAnalysis[] = enrichedDataWithFactors.map(d => ({
    date: d.Date,
    factors: d, // Since we merged them
    factorCount: d.factorCount,
    factorList: d.factorList
  }));

  const scoreConfig = options.scoreConfig || DEFAULT_DAILY_SCORE_CONFIG;
  return calculateDailyScores(factorAnalyses, scoreConfig);
}

/**
 * Retrieve current analysis results from database tables
 */
export async function getAnalysisResultsFromDB(stockAnalysisId: number, options?: {
  startDate?: string;
  endDate?: string;
  periodId?: string;
}) {
  const { prisma } = await import('../prisma');

  const stockAnalysis = await prisma.stockAnalysis.findUnique({
    where: { id: stockAnalysisId },
    include: {
      dailyFactorData: {
        orderBy: { date: 'asc' }
      },
      dailyScores: {
        orderBy: { date: 'asc' }
      },
      factorTables: {
        orderBy: { transactionId: 'asc' }
      }
    }
  });

  if (!stockAnalysis) return null;

  // Apply period filtering if specified
  let filteredDailyFactorData = stockAnalysis.dailyFactorData;
  let filteredDailyScores = stockAnalysis.dailyScores;
  let filteredFactorTables = stockAnalysis.factorTables;

  if (options?.startDate && options?.endDate) {
    console.log(`[getAnalysisResultsFromDB] Applying period filter: ${options.startDate} to ${options.endDate}`);
    
    const startDate = new Date(options.startDate);
    const endDate = new Date(options.endDate);
    
    // Filter daily factor data
    filteredDailyFactorData = stockAnalysis.dailyFactorData.filter(df => {
      const dfDate = new Date(df.date);
      return dfDate >= startDate && dfDate <= endDate;
    });
    
    // Filter daily scores
    filteredDailyScores = stockAnalysis.dailyScores.filter(ds => {
      const dsDate = new Date(ds.date);
      return dsDate >= startDate && dsDate <= endDate;
    });
    
    // Filter factor tables
    filteredFactorTables = stockAnalysis.factorTables.filter(ft => {
      const ftDate = new Date(ft.date);
      return ftDate >= startDate && ftDate <= endDate;
    });
    
    console.log(`[getAnalysisResultsFromDB] Filtered data: ${filteredDailyFactorData.length} daily records, ${filteredFactorTables.length} factor tables`);
  }

  // Reconstruct the StockAnalysisResult-like structure
  // First, build transactions from factorTables (significant price movements)
  console.log(`[getAnalysisResultsFromDB] Processing ${filteredFactorTables.length} factor tables`);
  
  const transactionsFromFactors = filteredFactorTables.map((ft, index) => {
    const factorData = JSON.parse(ft.factorData);
    const factors = Object.entries(factorData)
      .filter(([_, value]) => value === 1)
      .map(([key]) => key as StockFactor);

    // Find corresponding daily data for price and pctChange
    const dailyData = filteredDailyFactorData.find(df => df.date === ft.date);
    
    // Debug: Check factor table date
    console.log(`[getAnalysisResultsFromDB] Factor table ${index}: date="${ft.date}" (type: ${typeof ft.date}), transactionId=${ft.transactionId}`);

    return {
      tx: ft.transactionId,
      date: ft.date,
      close: dailyData?.close || 0,
      pctChange: dailyData?.pctChange || 0,
      factors,
      factorCount: factors.length
    };
  });

  // Always create transactions from all dailyFactorData for charting
  // This ensures charts can display normal price movements regardless of significance
  let transactions = transactionsFromFactors;
  let filteredEnrichedData: any[] = [];
  
  // If we have daily factor data, create chart transactions from all daily data
  if (filteredDailyFactorData.length > 0) {
    console.log(`[getAnalysisResultsFromDB] Creating chart transactions from filtered dailyFactorData (${filteredDailyFactorData.length} days)`);
    
    // Calculate factors on-demand to get proper factor data
    const enrichedDataWithFactors = await calculateFactorsOnDemand(stockAnalysisId, {});
    
    // Filter the enriched data by period as well
    filteredEnrichedData = enrichedDataWithFactors.filter(row => {
      if (!row.Date) return false;
      const rowDate = new Date(row.Date);
      return !options?.startDate || !options?.endDate || (rowDate >= new Date(options.startDate) && rowDate <= new Date(options.endDate));
    });
    
    console.log(`[getAnalysisResultsFromDB] Enriched data filtered to ${filteredEnrichedData.length} records`);
    
    // Create transactions from filtered daily data for charting
    transactions = filteredEnrichedData.map((row, index) => {
      // Ensure date is valid, skip if not
      if (!row.Date || row.Date === undefined || row.Date === null || row.Date === '') {
        console.warn(`[getAnalysisResultsFromDB] Skipping transaction ${index} with invalid date:`, row.Date);
        return null;
      }
      
      return {
        tx: index + 1,
        date: row.Date,
        close: row.Close,
        pctChange: row.pct_change || 0,
        factors: row.factorList || [],
        factorCount: row.factorCount || 0
      };
    }).filter((tx): tx is NonNullable<typeof tx> => tx !== null);
    
    // Also keep significant transactions separate for factor tables if they exist
    if (transactionsFromFactors.length > 0) {
      console.log(`[getAnalysisResultsFromDB] Using ${transactionsFromFactors.length} significant transactions from factor tables for analysis`);
    }
    
    console.log(`[getAnalysisResultsFromDB] Created ${transactions.length} chart transactions from all daily data`);
  }

  // Calculate summaries
  const dailyScores = filteredDailyScores.map(ds => ({
    date: ds.date,
    score: ds.score,
    factorCount: ds.factorCount,
    aboveThreshold: ds.aboveThreshold,
    breakdown: JSON.parse(ds.breakdown || '{}')
  }));

  // Calculate factors on-demand instead of reading from database flags
  // (since flags are not saved, they default to false)
  const totalDays = filteredDailyFactorData.length; 
  
  // Get enriched data for factor counts and correlation
  // Use filtered enriched data if available (from chart transactions), otherwise fetch all
  let enrichedDataForAnalysis = filteredEnrichedData.length > 0 ? filteredEnrichedData : [];
  if (enrichedDataForAnalysis.length === 0) {
    // Fallback: fetch all enriched data if filtered data wasn't created
    enrichedDataForAnalysis = await calculateFactorsOnDemand(stockAnalysisId, {});
  }
  
  const factorCounts: Partial<Record<StockFactor, number>> = {};
  let totalFactorCountAcrossDays = 0;

  // Calculate factor counts from on-demand calculated factors
  if (enrichedDataForAnalysis && enrichedDataForAnalysis.length > 0) {
    enrichedDataForAnalysis.forEach(day => {
      const factorsInDay: StockFactor[] = day.factorList || [];
      
      factorsInDay.forEach(f => {
        factorCounts[f] = (factorCounts[f] || 0) + 1;
      });
      totalFactorCountAcrossDays += factorsInDay.length;
    });
  } else {
    console.warn(`[getAnalysisResultsFromDB] No enriched factor data found for stockAnalysisId: ${stockAnalysisId}`);
  }

  const factorFrequency: Partial<Record<StockFactor, number>> = {};
  Object.entries(factorCounts).forEach(([factor, count]) => {
    factorFrequency[factor as StockFactor] = (count / totalDays) * 100;
  });

  // Calculate correlation with price movements (needed for Top Performing Factors display)
  let correlation: Record<StockFactor, { correlation: number; avgReturn: number; occurrences: number }> | null = null;
  if (enrichedDataForAnalysis && enrichedDataForAnalysis.length > 0) {
    try {
      // Reconstruct FactorAnalysis[] format needed for correlation function
      const factorAnalyses: FactorAnalysis[] = enrichedDataForAnalysis.map(d => ({
        date: d.Date,
        factors: d as any, // The merged object contains the boolean flags
        factorCount: d.factorCount || 0,
        factorList: d.factorList || []
      }));

      // Reconstruct ExtendedStockData[] format needed for correlation function
      const extendedStockData: ExtendedStockData[] = enrichedDataForAnalysis.map(d => ({
        Date: d.Date,
        Close: d.Close,
        pct_change: d.pct_change || 0,
        // map other fields if needed for correlation (it only uses pct_change)
      }));

      // Calculate correlation
      correlation = correlateFactorsWithPriceMovement(factorAnalyses, extendedStockData);
      console.log(`[getAnalysisResultsFromDB] Calculated correlation for ${Object.keys(correlation).length} factors`);
    } catch (error) {
      console.error(`[getAnalysisResultsFromDB] Error calculating correlation:`, error);
      // Continue without correlation if calculation fails
    }
  }

  // transactionsFound should reflect significant transactions (from factorTables)
  // but transactions array now includes all daily data for comprehensive charting
  const transactionsFound = transactionsFromFactors.length;

  return {
    symbol: stockAnalysis.symbol,
    totalDays,
    transactionsFound, // Count of significant transactions (above threshold)
    transactions, // All daily transactions for charting (includes normal price movements)
    minPctChange: stockAnalysis.minPctChange,
    factorAnalysis: {
      summary: {
        totalDays,
        factorCounts,
        factorFrequency,
        averageFactorsPerDay: totalDays > 0 ? totalFactorCountAcrossDays / totalDays : 0
      },
      ...(correlation && { correlation }) // Include correlation if calculated
    },
    dailyScores // Added for completeness
  };
}

/**
 * Generate daily prediction for current market conditions
 */
export function generateDailyPrediction(
  symbol: string,
  currentFactors: Partial<Record<StockFactor, boolean>>,
  config: DailyScoreConfig = DEFAULT_DAILY_SCORE_CONFIG
) {
  const prediction = predictStrongMovement(currentFactors, config);

  return {
    symbol,
    date: new Date().toISOString().split('T')[0],
    score: prediction.score,
    prediction: prediction.prediction,
    confidence: prediction.confidence,
    activeFactors: prediction.activeFactors.map(factor => ({
      factor,
      name: FACTOR_DESCRIPTIONS[factor].name,
      description: FACTOR_DESCRIPTIONS[factor].description,
      weight: config.weights[factor] || 0
    })),
    recommendations: prediction.recommendations,
    threshold: config.threshold,
    interpretation: prediction.prediction === 'HIGH_PROBABILITY'
      ? `${symbol} shows high probability of strong upward movement based on current factors`
      : prediction.prediction === 'MODERATE'
        ? `${symbol} shows moderate potential for price movement`
        : `${symbol} shows low probability of significant movement today`
  };
}
