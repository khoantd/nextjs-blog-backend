/**
 * Price Simulation Service
 * Simulates predicted stock prices based on adjustable parameters
 */

import { PrismaClient } from '@prisma/client';
import {
  StockFactor,
  DEFAULT_DAILY_SCORE_CONFIG,
  DailyScoreConfig,
  calculateDailyScore,
  correlateFactorsWithPriceMovement,
  type FactorAnalysis,
  type ExtendedStockData,
  FACTOR_DESCRIPTIONS
} from '../stock-factors';
import { generateDailyPrediction } from './stock-factor-service';
import { calculateFactorsOnDemand } from './stock-factor-service';
import {
  SimulationParameters,
  SimulationResult,
  PricePathPoint,
  SimulationScenario,
  ConfidenceInterval,
  FactorBreakdown,
  HistoricalPatternMatch
} from '../types/simulation';

const prisma = new PrismaClient();

/**
 * Method weights for hybrid approach
 */
const METHOD_WEIGHTS = {
  predictionScore: 0.40,
  factorBased: 0.40,
  historicalPatterns: 0.20
};

/**
 * Scenario multipliers
 */
const SCENARIO_MULTIPLIERS = {
  optimistic: 1.20,
  pessimistic: 0.80,
  base: 1.0
};

/**
 * Calculate price change using prediction score method
 */
function calculatePriceChangeFromScore(
  score: number,
  threshold: number,
  historicalAvgReturnPerScore: number
): number {
  // Normalize score to expected return
  // Higher scores above threshold indicate stronger positive movement
  if (score >= threshold) {
    return score * historicalAvgReturnPerScore;
  } else {
    // Below threshold, use reduced return
    return score * historicalAvgReturnPerScore * 0.5;
  }
}

/**
 * Calculate price change using factor-based method
 */
function calculatePriceChangeFromFactors(
  factorStates: Partial<Record<StockFactor, boolean>>,
  factorCorrelations: Record<StockFactor, { correlation: number; avgReturn: number; occurrences: number }>,
  factorWeights: Partial<Record<StockFactor, number>>
): number {
  let totalChange = 0;
  
  Object.entries(factorStates).forEach(([factor, isActive]) => {
    if (isActive && factorCorrelations[factor as StockFactor]) {
      const correlation = factorCorrelations[factor as StockFactor];
      const weight = factorWeights[factor as StockFactor] || 0;
      totalChange += weight * correlation.avgReturn;
    }
  });
  
  return totalChange;
}

/**
 * Find historical patterns matching current factor states
 */
async function findHistoricalPatterns(
  factorStates: Partial<Record<StockFactor, boolean>>,
  stockAnalysisId?: number,
  symbol?: string
): Promise<HistoricalPatternMatch[]> {
  const matches: HistoricalPatternMatch[] = [];
  
  if (!stockAnalysisId) {
    return matches;
  }
  
  try {
    // Fetch historical factor data
    const historicalData = await calculateFactorsOnDemand(stockAnalysisId, {
      skip: 0,
      limit: 0 // Fetch all
    });
    
    if (historicalData.length === 0) {
      return matches;
    }
    
    // Get active factors from current state
    const currentActiveFactors = Object.entries(factorStates)
      .filter(([_, active]) => active)
      .map(([factor]) => factor as StockFactor);
    
    if (currentActiveFactors.length === 0) {
      return matches;
    }
    
    // Find similar historical scenarios
    for (const record of historicalData) {
      const histFactors = extractFactorsFromRecord(record);
      const histActiveFactors = Object.entries(histFactors)
        .filter(([_, active]) => active)
        .map(([factor]) => factor as StockFactor);
      
      // Calculate similarity based on factor overlap
      const commonFactors = currentActiveFactors.filter(f => histActiveFactors.includes(f));
      const similarity = commonFactors.length / Math.max(currentActiveFactors.length, histActiveFactors.length, 1);
      
      if (similarity >= 0.5) { // At least 50% similarity
        const pctChange = typeof record.pct_change === 'number' ? record.pct_change : 0;
        const date = typeof record.Date === 'string' ? record.Date : '';
        
        matches.push({
          date,
          similarity: Math.round(similarity * 100) / 100,
          actualReturn: pctChange,
          factors: histActiveFactors
        });
      }
    }
    
    // Sort by similarity and limit to top 10
    matches.sort((a, b) => b.similarity - a.similarity);
    return matches.slice(0, 10);
  } catch (error) {
    console.error('Error finding historical patterns:', error);
    return matches;
  }
}

/**
 * Extract factors from a data record
 */
function extractFactorsFromRecord(
  record: Record<string, unknown>
): Partial<Record<StockFactor, boolean>> {
  const factors: Partial<Record<StockFactor, boolean>> = {};
  
  const PREDICTION_FACTOR_KEYS: readonly StockFactor[] = [
    'volume_spike',
    'break_ma50',
    'break_ma200',
    'rsi_over_60',
    'market_up',
    'sector_up',
    'short_covering',
    'earnings_window',
    'macro_tailwind',
    'news_positive'
  ];
  
  // Extract from boolean properties
  for (const key of PREDICTION_FACTOR_KEYS) {
    if (key in record) {
      const value = record[key];
      if (typeof value === 'boolean') {
        factors[key] = value;
      } else if (value !== null && value !== undefined) {
        factors[key] = Boolean(value);
      }
    }
  }
  
  return factors;
}

/**
 * Calculate price change using historical pattern matching
 */
function calculatePriceChangeFromPatterns(
  patterns: HistoricalPatternMatch[]
): number {
  if (patterns.length === 0) {
    return 0;
  }
  
  // Weighted average of historical returns by similarity
  let totalWeightedReturn = 0;
  let totalWeight = 0;
  
  patterns.forEach(pattern => {
    totalWeightedReturn += pattern.similarity * pattern.actualReturn;
    totalWeight += pattern.similarity;
  });
  
  return totalWeight > 0 ? totalWeightedReturn / totalWeight : 0;
}

/**
 * Calculate factor breakdown
 */
function calculateFactorBreakdown(
  factorStates: Partial<Record<StockFactor, boolean>>,
  factorCorrelations: Record<StockFactor, { correlation: number; avgReturn: number; occurrences: number }>,
  factorWeights: Partial<Record<StockFactor, number>>
): FactorBreakdown[] {
  const breakdown: FactorBreakdown[] = [];
  
  Object.entries(factorStates).forEach(([factor, isActive]) => {
    const stockFactor = factor as StockFactor;
    const correlation = factorCorrelations[stockFactor];
    const weight = factorWeights[stockFactor] || 0;
    
    breakdown.push({
      factor: stockFactor,
      contribution: isActive && correlation ? weight * correlation.avgReturn : 0,
      weight,
      active: isActive || false,
      historicalAvgReturn: correlation?.avgReturn || 0
    });
  });
  
  return breakdown.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
}

/**
 * Calculate confidence intervals
 */
function calculateConfidenceIntervals(
  baseCase: PricePathPoint[],
  scenarios: SimulationScenario[],
  initialPrice: number
): ConfidenceInterval[] {
  if (baseCase.length === 0) {
    return [];
  }
  
  const finalPrices = [
    ...scenarios.map(s => s.finalPrice),
    baseCase[baseCase.length - 1]?.predictedPrice || initialPrice
  ];
  
  // Calculate mean and standard deviation
  const mean = finalPrices.reduce((sum, price) => sum + price, 0) / finalPrices.length;
  const variance = finalPrices.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / finalPrices.length;
  const stdDev = Math.sqrt(variance);
  
  // Calculate confidence intervals (68% and 95%)
  const intervals: ConfidenceInterval[] = [
    {
      confidenceLevel: 0.68,
      lowerBound: Math.max(0, mean - stdDev),
      upperBound: mean + stdDev
    },
    {
      confidenceLevel: 0.95,
      lowerBound: Math.max(0, mean - 2 * stdDev),
      upperBound: mean + 2 * stdDev
    }
  ];
  
  return intervals;
}

/**
 * Generate future date string (N business days from today, skipping weekends)
 * Weekends (Saturday=6, Sunday=0) are skipped automatically
 * Returns the Nth weekday (Monday-Friday) from today
 */
function getFutureDate(daysFromToday: number): string {
  const date = new Date();
  let daysAdded = 0;
  
  // Start from tomorrow to get future dates
  date.setDate(date.getDate() + 1);
  
  // Add days, skipping weekends
  while (daysAdded < daysFromToday) {
    const currentDay = date.getDay();
    
    // Skip Saturday (6) and Sunday (0)
    if (currentDay !== 0 && currentDay !== 6) {
      daysAdded++;
      // If we've reached the target number of days, break
      if (daysAdded >= daysFromToday) {
        break;
      }
    }
    
    // Move to next day (only if we haven't reached the target)
    if (daysAdded < daysFromToday) {
      date.setDate(date.getDate() + 1);
    }
  }
  
  return date.toISOString().split('T')[0];
}

/**
 * Main simulation function
 */
export async function simulatePricePath(
  parameters: SimulationParameters
): Promise<SimulationResult> {
  const {
    symbol,
    initialPrice,
    timeHorizon,
    factorWeights = {},
    threshold = DEFAULT_DAILY_SCORE_CONFIG.threshold,
    factorStates = {},
    stockAnalysisId
  } = parameters;
  
  // Merge factor weights with defaults
  const mergedWeights: Partial<Record<StockFactor, number>> = {
    ...DEFAULT_DAILY_SCORE_CONFIG.weights,
    ...factorWeights
  };
  
  const config: DailyScoreConfig = {
    weights: mergedWeights,
    threshold,
    minFactorsRequired: DEFAULT_DAILY_SCORE_CONFIG.minFactorsRequired
  };
  
  // Get historical data and correlations if stockAnalysisId is provided
  let factorCorrelations: Record<StockFactor, { correlation: number; avgReturn: number; occurrences: number }> = {} as any;
  let historicalPatterns: HistoricalPatternMatch[] = [];
  let historicalAvgReturnPerScore = 2.0; // Default fallback
  
  if (stockAnalysisId) {
    try {
      // Fetch historical data
      const historicalData = await calculateFactorsOnDemand(stockAnalysisId, {
        skip: 0,
        limit: 0
      });
      
      if (historicalData.length > 0) {
        // Convert to ExtendedStockData format
        const stockData: ExtendedStockData[] = historicalData.map(record => ({
          Date: typeof record.Date === 'string' ? record.Date : '',
          Close: typeof record.Close === 'number' ? record.Close : 0,
          Open: typeof record.Open === 'number' ? record.Open : undefined,
          High: typeof record.High === 'number' ? record.High : undefined,
          Low: typeof record.Low === 'number' ? record.Low : undefined,
          Volume: typeof record.Volume === 'number' ? record.Volume : undefined,
          pct_change: typeof record.pct_change === 'number' ? record.pct_change : undefined
        }));
        
        // Calculate factor analyses
        const factorAnalyses: FactorAnalysis[] = historicalData.map(record => {
          const factors = extractFactorsFromRecord(record);
          const activeFactors = Object.entries(factors)
            .filter(([_, active]) => active)
            .map(([factor]) => factor as StockFactor);
          
          return {
            date: typeof record.Date === 'string' ? record.Date : '',
            factors,
            factorCount: activeFactors.length,
            factorList: activeFactors
          };
        });
        
        // Get correlations
        factorCorrelations = correlateFactorsWithPriceMovement(factorAnalyses, stockData);
        
        // Calculate average return per score
        const scores = factorAnalyses.map(analysis => {
          const scoreResult = calculateDailyScore(analysis, config);
          return scoreResult.score;
        });
        
        const returns = stockData.map(d => d.pct_change || 0);
        const validPairs = scores
          .map((score, i) => ({ score, return: returns[i] }))
          .filter(p => !isNaN(p.score) && !isNaN(p.return) && p.score > 0);
        
        if (validPairs.length > 0) {
          const avgScore = validPairs.reduce((sum, p) => sum + p.score, 0) / validPairs.length;
          const avgReturn = validPairs.reduce((sum, p) => sum + p.return, 0) / validPairs.length;
          historicalAvgReturnPerScore = avgScore > 0 ? avgReturn / avgScore : 2.0;
        }
        
        // Find historical patterns
        historicalPatterns = await findHistoricalPatterns(factorStates, stockAnalysisId, symbol);
      }
    } catch (error) {
      console.error('Error fetching historical data:', error);
    }
  }
  
  // Generate base case price path
  const baseCase: PricePathPoint[] = [];
  let currentPrice = initialPrice;
  
  for (let day = 1; day <= timeHorizon; day++) {
    const date = getFutureDate(day);
    
    // Generate prediction score
    const prediction = generateDailyPrediction(symbol, factorStates, config);
    const score = prediction.score;
    
    // Calculate price change using hybrid approach
    const scoreMethodChange = calculatePriceChangeFromScore(
      score,
      threshold,
      historicalAvgReturnPerScore
    );
    
    const factorMethodChange = calculatePriceChangeFromFactors(
      factorStates,
      factorCorrelations,
      mergedWeights
    );
    
    const patternMethodChange = calculatePriceChangeFromPatterns(historicalPatterns);
    
    // Combine methods
    const combinedChangePercent = 
      scoreMethodChange * METHOD_WEIGHTS.predictionScore +
      factorMethodChange * METHOD_WEIGHTS.factorBased +
      patternMethodChange * METHOD_WEIGHTS.historicalPatterns;
    
    // Calculate new price
    const priceChange = currentPrice * (combinedChangePercent / 100);
    const newPrice = Math.max(0.01, currentPrice + priceChange); // Prevent negative prices
    
    baseCase.push({
      day,
      date,
      predictedPrice: newPrice,
      priceChange,
      priceChangePercent: combinedChangePercent,
      score,
      activeFactors: prediction.activeFactors.map(af => af.factor),
      confidence: prediction.confidence
    });
    
    currentPrice = newPrice;
  }
  
  // Generate scenarios
  const scenarios: SimulationScenario[] = [];
  
  for (const [scenarioType, multiplier] of Object.entries(SCENARIO_MULTIPLIERS)) {
    const scenarioPath: PricePathPoint[] = [];
    let scenarioPrice = initialPrice;
    
    for (const basePoint of baseCase) {
      const adjustedChangePercent = basePoint.priceChangePercent * multiplier;
      const adjustedChange = scenarioPrice * (adjustedChangePercent / 100);
      const adjustedPrice = Math.max(0.01, scenarioPrice + adjustedChange);
      
      scenarioPath.push({
        ...basePoint,
        predictedPrice: adjustedPrice,
        priceChange: adjustedChange,
        priceChangePercent: adjustedChangePercent
      });
      
      scenarioPrice = adjustedPrice;
    }
    
    const finalPrice = scenarioPath[scenarioPath.length - 1]?.predictedPrice || initialPrice;
    const totalReturn = finalPrice - initialPrice;
    const totalReturnPercent = (totalReturn / initialPrice) * 100;
    
    // Calculate probability based on scenario type
    let probability = 0.5; // Base case
    if (scenarioType === 'optimistic') {
      probability = 0.25;
    } else if (scenarioType === 'pessimistic') {
      probability = 0.25;
    }
    
    scenarios.push({
      type: scenarioType as 'optimistic' | 'pessimistic' | 'base',
      pricePath: scenarioPath,
      finalPrice,
      totalReturn,
      totalReturnPercent,
      probability
    });
  }
  
  // Calculate confidence intervals
  const confidenceIntervals = calculateConfidenceIntervals(baseCase, scenarios, initialPrice);
  
  // Calculate factor breakdown
  const factorBreakdown = calculateFactorBreakdown(
    factorStates,
    factorCorrelations,
    mergedWeights
  );
  
  return {
    symbol,
    initialPrice,
    timeHorizon,
    baseCase,
    scenarios,
    confidenceIntervals,
    factorBreakdown,
    historicalPatternMatches: historicalPatterns,
    metadata: {
      parameters,
      generatedAt: new Date().toISOString(),
      calculationMethod: 'hybrid'
    }
  };
}
