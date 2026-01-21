/**
 * Prediction API Utilities
 * Shared logic for prediction generation endpoints
 */

import { Request } from 'express';
import { StockFactor, STOCK_FACTORS, DailyScoreConfig, DEFAULT_DAILY_SCORE_CONFIG } from './stock-factors';
import { generateDailyPrediction } from './services/stock-factor-service';
import { calculateFactorsOnDemand } from './services/stock-factor-service';
import { parsePredictionFilters, applyPredictionFilters, FilterValidationError, type PredictionFilters } from './filter-utils';
import { PrismaClient } from '@prisma/client';
import { getVnstockClient } from './vnstock-client';
import { stockPriceService } from './stock-price-service';

const prisma = new PrismaClient();

// Configuration constants
export const PREDICTION_CONFIG = {
  /** Extra buffer for MA200 calculation (needs ~200 days lookback) */
  LOOKBACK_NEEDED: 210,
  /** Maximum number of historical days to generate predictions for */
  MAX_DAYS_TO_PROCESS: 4,
  /** Maximum number of future days to generate predictions for */
  MAX_FUTURE_DAYS: 30,
  /** Default number of recent days to use */
  DEFAULT_DAYS_LIMIT: 5,
  /** Maximum days limit */
  MAX_DAYS_LIMIT: 50,
  /** Minimum days limit */
  MIN_DAYS_LIMIT: 1,
  /** Maximum years of historical data to use for predictions (3 years) */
  MAX_YEARS_HISTORY: 3,
} as const;

/**
 * Factor keys used for prediction generation (excludes 'strong_move' which is a result factor)
 */
export const PREDICTION_FACTOR_KEYS: readonly StockFactor[] = [
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
] as const;

/**
 * Type guard to check if a key is a valid prediction factor
 */
function isValidPredictionFactor(key: string): key is StockFactor {
  return PREDICTION_FACTOR_KEYS.includes(key as StockFactor);
}

/**
 * Extract factors from a data record
 * Supports both boolean factor properties and factorList array
 */
export function extractFactorsFromRecord(
  record: Record<string, unknown>
): Partial<Record<StockFactor, boolean>> {
  const factors: Partial<Record<StockFactor, boolean>> = {};
  
  // First, try to extract from boolean properties
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
  
  // If no factors found via boolean properties, try factorList array
  const activeFactorCount = Object.values(factors).filter(Boolean).length;
  if (activeFactorCount === 0 && 'factorList' in record) {
    const factorList = record.factorList;
    if (Array.isArray(factorList)) {
      // Set all factors in the list to true
      for (const factor of factorList) {
        if (typeof factor === 'string' && isValidPredictionFactor(factor)) {
          factors[factor] = true;
        }
      }
    }
  }
  
  return factors;
}

/**
 * Parse date string in various formats to [year, month, day] tuple
 */
export function parseDateToTuple(dateStr: string): [number, number, number] {
  if (dateStr.includes('-')) {
    const parts = dateStr.split('-');
    if (parts.length >= 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const day = parseInt(parts[2], 10);
      if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
        return [year, month, day];
      }
    }
  }
  
  if (dateStr.includes('/')) {
    const parts = dateStr.split('/');
    if (parts.length >= 3) {
      const month = parseInt(parts[0], 10);
      const day = parseInt(parts[1], 10);
      const year = parseInt(parts[2], 10);
      if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
        return [year, month, day];
      }
    }
  }
  
  // Fallback to standard Date parsing
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date format: ${dateStr}`);
  }
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()];
}

/**
 * Sort predictions by specified field and order
 */
export function sortPredictions<T extends { date: string; score: number; prediction?: string; confidence?: number }>(
  predictions: T[],
  orderBy: string,
  order: 'asc' | 'desc'
): T[] {
  const sorted = [...predictions];
  
  if (orderBy === 'date') {
    sorted.sort((a, b) => {
      const [yearA, monthA, dayA] = parseDateToTuple(a.date);
      const [yearB, monthB, dayB] = parseDateToTuple(b.date);
      
      if (yearA !== yearB) {
        return order === 'desc' ? yearB - yearA : yearA - yearB;
      }
      if (monthA !== monthB) {
        return order === 'desc' ? monthB - monthA : monthA - monthB;
      }
      return order === 'desc' ? dayB - dayA : dayA - dayB;
    });
  } else if (orderBy === 'score') {
    sorted.sort((a, b) => {
      return order === 'desc' ? b.score - a.score : a.score - b.score;
    });
  } else if (orderBy === 'confidence') {
    sorted.sort((a, b) => {
      const confA = a.confidence ?? 0;
      const confB = b.confidence ?? 0;
      return order === 'desc' ? confB - confA : confA - confB;
    });
  } else if (orderBy === 'prediction') {
    const predictionOrder: Record<string, number> = {
      'HIGH_PROBABILITY': 3,
      'MODERATE': 2,
      'LOW_PROBABILITY': 1
    };
    sorted.sort((a, b) => {
      const orderA = predictionOrder[a.prediction || ''] || 0;
      const orderB = predictionOrder[b.prediction || ''] || 0;
      return order === 'desc' ? orderB - orderA : orderA - orderB;
    });
  }
  
  return sorted;
}

/**
 * Technical signals for price prediction support
 */
export interface TechnicalSignals {
  trend: {
    direction: 'bullish' | 'bearish' | 'neutral';
    strength: 'strong' | 'moderate' | 'weak';
    description: string;
  };
  momentum: {
    rsi: number | null;
    rsiSignal: 'overbought' | 'oversold' | 'neutral';
    macdSignal?: 'bullish' | 'bearish' | 'neutral';
    description: string;
  };
  movingAverages: {
    ma20: number | null;
    ma50: number | null;
    ma200: number | null;
    priceVsMA20: 'above' | 'below' | 'at';
    priceVsMA50: 'above' | 'below' | 'at';
    priceVsMA200: 'above' | 'below' | 'at';
    alignment: 'bullish' | 'bearish' | 'mixed';
    description: string;
  };
  supportResistance: {
    supportLevel: number | null;
    resistanceLevel: number | null;
    distanceToSupport: number | null;
    distanceToResistance: number | null;
    description: string;
  };
  volume: {
    currentVolume: number | null;
    averageVolume: number | null;
    volumeRatio: number | null;
    volumeSignal: 'high' | 'normal' | 'low';
    description: string;
  };
}

/**
 * Pattern recognition results
 */
export interface PatternRecognition {
  similarScenarios: Array<{
    date: string;
    score: number;
    priceChange: number;
    factors: string[];
    similarity: number;
  }>;
  patternType: 'breakout' | 'consolidation' | 'reversal' | 'continuation' | 'unknown';
  patternStrength: 'strong' | 'moderate' | 'weak';
  patternDescription: string;
  historicalAccuracy?: number; // Success rate of similar patterns
}

/**
 * Enhanced prediction with signals and patterns
 */
export interface EnhancedPrediction {
  symbol: string;
  date: string;
  score: number;
  prediction: 'HIGH_PROBABILITY' | 'MODERATE' | 'LOW_PROBABILITY';
  confidence: number;
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
  isFuture?: boolean;
  // New fields for signals and patterns
  signals?: TechnicalSignals;
  patterns?: PatternRecognition;
  priceData?: {
    currentPrice: number | null;
    open: number | null;
    high: number | null;
    low: number | null;
    close: number | null;
    change: number | null;
    changePercent: number | null;
  };
  // Feedback data (optional, included when requested)
  feedback?: {
    id: number;
    isCorrect: boolean;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
}

/**
 * Prediction generation result
 */
export interface PredictionGenerationResult {
  predictions: Array<EnhancedPrediction>;
  errors?: Array<{ date: string; error: string }>;
}

/**
 * Generate a future date string (N business days from today, skipping weekends)
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
 * Estimate future price data based on prediction score, signals, and historical patterns
 * This provides reasonable estimates for open, high, low, close, change, and changePercent
 */
function estimateFuturePriceData(
  baselinePrice: number,
  predictionScore: number,
  threshold: number,
  signals: TechnicalSignals,
  historicalData: Array<Record<string, unknown>>,
  currentIndex: number
): {
  currentPrice: number;
  open: number;
  high: number;
  low: number;
  close: number;
  change: number;
  changePercent: number;
} {
  // Calculate historical average daily return based on score
  // Analyze recent historical data to understand score-to-return correlation
  let historicalAvgReturnPerScore = 2.0; // Default: 2% per score point
  let historicalVolatility = 0.02; // Default: 2% daily volatility
  
  if (historicalData.length > 0 && currentIndex > 0) {
    // Analyze last 60 days to understand score-to-return relationship
    const lookbackDays = Math.min(60, currentIndex);
    const recentData = historicalData.slice(currentIndex - lookbackDays, currentIndex);
    
    const scoreReturnPairs: Array<{ score: number; return: number }> = [];
    
    for (const dayData of recentData) {
      const score = typeof dayData.score === 'number' ? dayData.score : null;
      const pctChange = typeof dayData.pct_change === 'number' ? dayData.pct_change : null;
      
      if (score !== null && pctChange !== null && !isNaN(score) && !isNaN(pctChange)) {
        scoreReturnPairs.push({ score, return: Math.abs(pctChange) });
      }
    }
    
    if (scoreReturnPairs.length > 0) {
      // Calculate average return per score point
      const totalReturn = scoreReturnPairs.reduce((sum, pair) => sum + pair.return, 0);
      const avgScore = scoreReturnPairs.reduce((sum, pair) => sum + pair.score, 0) / scoreReturnPairs.length;
      historicalAvgReturnPerScore = avgScore > 0 ? (totalReturn / scoreReturnPairs.length) / avgScore : 2.0;
      
      // Calculate volatility (standard deviation of returns)
      const avgReturn = totalReturn / scoreReturnPairs.length;
      const variance = scoreReturnPairs.reduce((sum, pair) => {
        const diff = pair.return - avgReturn;
        return sum + (diff * diff);
      }, 0) / scoreReturnPairs.length;
      historicalVolatility = Math.sqrt(variance);
    }
  }
  
  // Estimate price change based on prediction score
  // Higher scores above threshold indicate stronger positive movement
  let expectedChangePercent = 0;
  
  if (predictionScore >= threshold) {
    // Above threshold: use full score impact
    expectedChangePercent = predictionScore * historicalAvgReturnPerScore;
  } else {
    // Below threshold: reduced impact
    expectedChangePercent = predictionScore * historicalAvgReturnPerScore * 0.5;
  }
  
  // Adjust based on trend direction from signals
  if (signals.trend.direction === 'bearish') {
    expectedChangePercent = -Math.abs(expectedChangePercent);
  } else if (signals.trend.direction === 'bullish') {
    expectedChangePercent = Math.abs(expectedChangePercent);
  }
  
  // Clamp expected change to reasonable bounds (±10% max for single day)
  expectedChangePercent = Math.max(-10, Math.min(10, expectedChangePercent));
  
  // Estimate open price (typically near previous close, with possible gap)
  // For predictions, assume it opens at baseline price (no gap) or slight gap based on score
  const gapPercent = predictionScore >= threshold ? expectedChangePercent * 0.1 : 0;
  const open = baselinePrice * (1 + gapPercent / 100);
  
  // Estimate close price based on expected change
  const close = open * (1 + expectedChangePercent / 100);
  
  // Estimate high and low based on intraday volatility
  // Typical intraday range is 1.5-3x the absolute change, centered around the trend
  const intradayRangeMultiplier = 1.5 + (historicalVolatility * 50); // Scale volatility to multiplier
  const intradayRange = Math.abs(expectedChangePercent) * intradayRangeMultiplier;
  
  // High is typically above close, low is typically below open
  const high = Math.max(open, close) * (1 + intradayRange / 200); // Half range above
  const low = Math.min(open, close) * (1 - intradayRange / 200); // Half range below
  
  // Respect support/resistance levels if available
  if (signals.supportResistance.supportLevel && low < signals.supportResistance.supportLevel) {
    // Don't go below support
    const adjustedLow = signals.supportResistance.supportLevel;
    const adjustedClose = Math.max(close, adjustedLow + (close - low));
    const adjustedHigh = Math.max(high, adjustedClose);
    return {
      currentPrice: baselinePrice,
      open,
      high: adjustedHigh,
      low: adjustedLow,
      close: adjustedClose,
      change: adjustedClose - open,
      changePercent: ((adjustedClose - open) / open) * 100
    };
  }
  
  if (signals.supportResistance.resistanceLevel && high > signals.supportResistance.resistanceLevel) {
    // Don't go above resistance
    const adjustedHigh = signals.supportResistance.resistanceLevel;
    const adjustedClose = Math.min(close, adjustedHigh - (high - close));
    const adjustedLow = Math.min(low, adjustedClose);
    return {
      currentPrice: baselinePrice,
      open,
      high: adjustedHigh,
      low: adjustedLow,
      close: adjustedClose,
      change: adjustedClose - open,
      changePercent: ((adjustedClose - open) / open) * 100
    };
  }
  
  // Calculate change and changePercent
  const change = close - open;
  const changePercent = (change / open) * 100;
  
  return {
    currentPrice: baselinePrice,
    open,
    high,
    low,
    close,
    change,
    changePercent
  };
}

/**
 * Extract technical signals from day data
 */
function extractTechnicalSignals(
  dayData: Record<string, unknown>,
  historicalData: Array<Record<string, unknown>>,
  currentIndex: number
): TechnicalSignals {
  const close = typeof dayData.Close === 'number' ? dayData.Close : null;
  const open = typeof dayData.Open === 'number' ? dayData.Open : null;
  const high = typeof dayData.High === 'number' ? dayData.High : null;
  const low = typeof dayData.Low === 'number' ? dayData.Low : null;
  const volume = typeof dayData.Volume === 'number' ? dayData.Volume : null;
  const ma20 = typeof dayData.ma20 === 'number' && !isNaN(dayData.ma20) ? dayData.ma20 : null;
  const ma50 = typeof dayData.ma50 === 'number' && !isNaN(dayData.ma50) ? dayData.ma50 : null;
  const ma200 = typeof dayData.ma200 === 'number' && !isNaN(dayData.ma200) ? dayData.ma200 : null;
  const rsi = typeof dayData.rsi === 'number' && !isNaN(dayData.rsi) ? dayData.rsi : null;
  const pctChange = typeof dayData.pct_change === 'number' ? dayData.pct_change : null;

  // Calculate volume average from historical data
  const recentVolumes = historicalData
    .slice(Math.max(0, currentIndex - 20), currentIndex)
    .map(d => typeof d.Volume === 'number' ? d.Volume : 0)
    .filter(v => v > 0);
  const averageVolume = recentVolumes.length > 0
    ? recentVolumes.reduce((sum, v) => sum + v, 0) / recentVolumes.length
    : null;

  // Trend analysis
  let trendDirection: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  let trendStrength: 'strong' | 'moderate' | 'weak' = 'weak';
  let trendDescription = 'Trend analysis unavailable';

  if (close && ma20 && ma50 && ma200) {
    const aboveMA20 = close > ma20;
    const aboveMA50 = close > ma50;
    const aboveMA200 = close > ma200;
    const ma20AboveMA50 = ma20 > ma50;
    const ma50AboveMA200 = ma50 > ma200;

    if (aboveMA200 && aboveMA50 && aboveMA20 && ma20AboveMA50 && ma50AboveMA200) {
      trendDirection = 'bullish';
      trendStrength = 'strong';
      trendDescription = 'Strong bullish trend: Price above all MAs with proper alignment';
    } else if (aboveMA200 && aboveMA50 && aboveMA20) {
      trendDirection = 'bullish';
      trendStrength = 'moderate';
      trendDescription = 'Moderate bullish trend: Price above all MAs';
    } else if (aboveMA50 && aboveMA20) {
      trendDirection = 'bullish';
      trendStrength = 'weak';
      trendDescription = 'Weak bullish trend: Price above MA50 and MA20';
    } else if (!aboveMA200 && !aboveMA50 && !aboveMA20 && !ma20AboveMA50 && !ma50AboveMA200) {
      trendDirection = 'bearish';
      trendStrength = 'strong';
      trendDescription = 'Strong bearish trend: Price below all MAs with proper alignment';
    } else if (!aboveMA200 && !aboveMA50 && !aboveMA20) {
      trendDirection = 'bearish';
      trendStrength = 'moderate';
      trendDescription = 'Moderate bearish trend: Price below all MAs';
    } else {
      trendDirection = 'neutral';
      trendStrength = 'moderate';
      trendDescription = 'Mixed signals: Price position relative to MAs is inconsistent';
    }
  }

  // Momentum analysis
  let rsiSignal: 'overbought' | 'oversold' | 'neutral' = 'neutral';
  let momentumDescription = 'Momentum analysis unavailable';

  if (rsi !== null) {
    if (rsi > 70) {
      rsiSignal = 'overbought';
      momentumDescription = `RSI ${rsi.toFixed(1)} indicates overbought conditions - potential pullback risk`;
    } else if (rsi < 30) {
      rsiSignal = 'oversold';
      momentumDescription = `RSI ${rsi.toFixed(1)} indicates oversold conditions - potential bounce opportunity`;
    } else if (rsi > 60) {
      rsiSignal = 'overbought';
      momentumDescription = `RSI ${rsi.toFixed(1)} shows strong momentum but approaching overbought`;
    } else {
      rsiSignal = 'neutral';
      momentumDescription = `RSI ${rsi.toFixed(1)} indicates neutral momentum`;
    }
  }

  // Moving average analysis
  const priceVsMA20: 'above' | 'below' | 'at' = close && ma20
    ? close > ma20 * 1.01 ? 'above'
    : close < ma20 * 0.99 ? 'below'
    : 'at'
    : 'at';
  const priceVsMA50: 'above' | 'below' | 'at' = close && ma50
    ? close > ma50 * 1.01 ? 'above'
    : close < ma50 * 0.99 ? 'below'
    : 'at'
    : 'at';
  const priceVsMA200: 'above' | 'below' | 'at' = close && ma200
    ? close > ma200 * 1.01 ? 'above'
    : close < ma200 * 0.99 ? 'below'
    : 'at'
    : 'at';

  let maAlignment: 'bullish' | 'bearish' | 'mixed' = 'mixed';
  let maDescription = 'Moving average analysis unavailable';

  if (ma20 && ma50 && ma200 && close) {
    if (ma20 > ma50 && ma50 > ma200 && close > ma20) {
      maAlignment = 'bullish';
      maDescription = `Bullish MA alignment: Price (${close.toFixed(2)}) > MA20 (${ma20.toFixed(2)}) > MA50 (${ma50.toFixed(2)}) > MA200 (${ma200.toFixed(2)})`;
    } else if (ma20 < ma50 && ma50 < ma200 && close < ma20) {
      maAlignment = 'bearish';
      maDescription = `Bearish MA alignment: Price (${close.toFixed(2)}) < MA20 (${ma20.toFixed(2)}) < MA50 (${ma50.toFixed(2)}) < MA200 (${ma200.toFixed(2)})`;
    } else {
      maAlignment = 'mixed';
      maDescription = `Mixed MA signals: Price ${close.toFixed(2)}, MA20 ${ma20.toFixed(2)}, MA50 ${ma50.toFixed(2)}, MA200 ${ma200.toFixed(2)}`;
    }
  }

  // Support/Resistance analysis
  let supportLevel: number | null = null;
  let resistanceLevel: number | null = null;
  let supportResistanceDescription = 'Support/resistance analysis unavailable';

  if (close && historicalData.length > 0) {
    // Find recent lows (support) and highs (resistance) from last 20 days
    const recentData = historicalData.slice(Math.max(0, currentIndex - 20), currentIndex + 1);
    const recentLows = recentData
      .map(d => typeof d.Low === 'number' ? d.Low : null)
      .filter((l): l is number => l !== null);
    const recentHighs = recentData
      .map(d => typeof d.High === 'number' ? d.High : null)
      .filter((h): h is number => h !== null);

    if (recentLows.length > 0) {
      supportLevel = Math.min(...recentLows);
    }
    if (recentHighs.length > 0) {
      resistanceLevel = Math.max(...recentHighs);
    }

    if (supportLevel && resistanceLevel && close) {
      const distToSupport = ((close - supportLevel) / supportLevel) * 100;
      const distToResistance = ((resistanceLevel - close) / close) * 100;
      supportResistanceDescription = `Support: ${supportLevel.toFixed(2)} (${distToSupport > 0 ? '+' : ''}${distToSupport.toFixed(1)}%), Resistance: ${resistanceLevel.toFixed(2)} (${distToResistance > 0 ? '+' : ''}${distToResistance.toFixed(1)}%)`;
    }
  }

  // Volume analysis
  let volumeSignal: 'high' | 'normal' | 'low' = 'normal';
  let volumeDescription = 'Volume analysis unavailable';
  const volumeRatio = volume && averageVolume ? volume / averageVolume : null;

  if (volumeRatio !== null) {
    if (volumeRatio > 1.5) {
      volumeSignal = 'high';
      volumeDescription = `High volume: ${volumeRatio.toFixed(2)}x average - indicates strong interest`;
    } else if (volumeRatio < 0.7) {
      volumeSignal = 'low';
      volumeDescription = `Low volume: ${volumeRatio.toFixed(2)}x average - weak participation`;
    } else {
      volumeSignal = 'normal';
      volumeDescription = `Normal volume: ${volumeRatio.toFixed(2)}x average`;
    }
  }

  return {
    trend: {
      direction: trendDirection,
      strength: trendStrength,
      description: trendDescription
    },
    momentum: {
      rsi: rsi,
      rsiSignal: rsiSignal,
      description: momentumDescription
    },
    movingAverages: {
      ma20: ma20,
      ma50: ma50,
      ma200: ma200,
      priceVsMA20: priceVsMA20,
      priceVsMA50: priceVsMA50,
      priceVsMA200: priceVsMA200,
      alignment: maAlignment,
      description: maDescription
    },
    supportResistance: {
      supportLevel: supportLevel,
      resistanceLevel: resistanceLevel,
      distanceToSupport: supportLevel && close ? ((close - supportLevel) / supportLevel) * 100 : null,
      distanceToResistance: resistanceLevel && close ? ((resistanceLevel - close) / close) * 100 : null,
      description: supportResistanceDescription
    },
    volume: {
      currentVolume: volume,
      averageVolume: averageVolume,
      volumeRatio: volumeRatio,
      volumeSignal: volumeSignal,
      description: volumeDescription
    }
  };
}

/**
 * Recognize patterns from historical data
 */
function recognizePatterns(
  dayData: Record<string, unknown>,
  historicalData: Array<Record<string, unknown>>,
  currentIndex: number,
  activeFactors: string[]
): PatternRecognition {
  const close = typeof dayData.Close === 'number' ? dayData.Close : null;
  const pctChange = typeof dayData.pct_change === 'number' ? dayData.pct_change : null;
  const ma20 = typeof dayData.ma20 === 'number' && !isNaN(dayData.ma20) ? dayData.ma20 : null;
  const ma50 = typeof dayData.ma50 === 'number' && !isNaN(dayData.ma50) ? dayData.ma50 : null;
  const volumeRatio = typeof dayData.Volume === 'number' && dayData.Volume
    ? (() => {
        const recentVolumes = historicalData
          .slice(Math.max(0, currentIndex - 20), currentIndex)
          .map(d => typeof d.Volume === 'number' ? d.Volume : 0)
          .filter(v => v > 0);
        const avgVol = recentVolumes.length > 0
          ? recentVolumes.reduce((sum, v) => sum + v, 0) / recentVolumes.length
          : null;
        return avgVol ? dayData.Volume / avgVol : null;
      })()
    : null;

  // Find similar historical scenarios
  const similarScenarios: PatternRecognition['similarScenarios'] = [];
  
  if (historicalData.length > 0 && activeFactors.length > 0) {
    // Look for similar factor combinations in the last 3 years of data
    const lookbackStart = Math.max(0, currentIndex - 756); // ~3 years of trading days
    const historicalWindow = historicalData.slice(lookbackStart, currentIndex);
    
    for (let i = 0; i < historicalWindow.length; i++) {
      const histData = historicalWindow[i];
      const histFactors = extractFactorsFromRecord(histData);
      const histActiveFactors = Object.entries(histFactors)
        .filter(([_, active]) => active)
        .map(([factor]) => factor);
      
      // Calculate similarity based on factor overlap
      const commonFactors = activeFactors.filter(f => histActiveFactors.includes(f));
      const similarity = commonFactors.length / Math.max(activeFactors.length, histActiveFactors.length, 1);
      
      if (similarity >= 0.5) { // At least 50% factor overlap
        const histScore = typeof histData.score === 'number' ? histData.score : 0;
        const histPctChange = typeof histData.pct_change === 'number' ? histData.pct_change : 0;
        const histDate = typeof histData.Date === 'string' ? histData.Date : '';
        
        similarScenarios.push({
          date: histDate,
          score: histScore,
          priceChange: histPctChange,
          factors: histActiveFactors,
          similarity: Math.round(similarity * 100)
        });
      }
    }
    
    // Sort by similarity and limit to top 5
    similarScenarios.sort((a, b) => b.similarity - a.similarity);
    similarScenarios.splice(5);
  }

  // Pattern type detection
  let patternType: PatternRecognition['patternType'] = 'unknown';
  let patternStrength: PatternRecognition['patternStrength'] = 'weak';
  let patternDescription = 'Pattern recognition unavailable';

  if (close && ma20 && ma50 && pctChange !== null) {
    const breakMA50 = activeFactors.includes('break_ma50');
    const breakMA200 = activeFactors.includes('break_ma200');
    const volumeSpike = activeFactors.includes('volume_spike');
    const priceAboveMA50 = close > ma50;

    if ((breakMA50 || breakMA200) && volumeSpike && pctChange > 0) {
      patternType = 'breakout';
      patternStrength = volumeSpike && (breakMA50 || breakMA200) ? 'strong' : 'moderate';
      patternDescription = `Breakout pattern detected: ${breakMA200 ? 'MA200' : 'MA50'} break with ${volumeSpike ? 'high' : 'normal'} volume`;
    } else if (priceAboveMA50 && pctChange > 0 && !breakMA50 && !breakMA200) {
      patternType = 'continuation';
      patternStrength = volumeSpike ? 'moderate' : 'weak';
      patternDescription = 'Continuation pattern: Price maintaining upward momentum';
    } else if (pctChange < -2 && volumeSpike) {
      patternType = 'reversal';
      patternStrength = 'moderate';
      patternDescription = 'Potential reversal pattern: Significant decline with high volume';
    } else if (Math.abs(pctChange) < 1 && !volumeSpike) {
      patternType = 'consolidation';
      patternStrength = 'weak';
      patternDescription = 'Consolidation pattern: Sideways movement with low volatility';
    }
  }

  // Calculate historical accuracy if we have similar scenarios
  let historicalAccuracy: number | undefined = undefined;
  if (similarScenarios.length > 0) {
    const successfulScenarios = similarScenarios.filter(s => s.priceChange > 0);
    historicalAccuracy = (successfulScenarios.length / similarScenarios.length) * 100;
  }

  return {
    similarScenarios,
    patternType,
    patternStrength,
    patternDescription,
    historicalAccuracy
  };
}

/**
 * Fetch missing price data from remote API (vnstock for VN, Yahoo Finance for US)
 */
async function fetchMissingPriceData(
  symbol: string,
  date: string,
  market: 'US' | 'VN' | null,
  existingPriceData: { open: number | null; high: number | null; low: number | null; close: number | null },
  enableLogging: boolean = false
): Promise<{ open: number | null; high: number | null; low: number | null; close: number | null }> {
  const log = enableLogging ? console.log : () => {};
  
  // If we already have all price data, return as-is
  if (existingPriceData.open !== null && existingPriceData.high !== null && 
      existingPriceData.low !== null && existingPriceData.close !== null) {
    return existingPriceData;
  }

  // Only fetch if we're missing some data
  const needsFetch = existingPriceData.open === null || existingPriceData.high === null || 
                     existingPriceData.low === null;

  if (!needsFetch) {
    return existingPriceData;
  }

  log(`[Predictions] Fetching missing price data for ${symbol} on ${date} (market: ${market || 'unknown'})`);

  try {
    const targetDate = new Date(date);
    const startDate = new Date(targetDate);
    startDate.setDate(startDate.getDate() - 1); // Get data for date and day before
    const endDate = new Date(targetDate);
    endDate.setDate(endDate.getDate() + 1); // Get data for date and day after

    if (market === 'VN') {
      // Fetch from vnstock API
      const vnstockClient = getVnstockClient();
      if (vnstockClient) {
        try {
          // Trim and uppercase symbol to ensure it passes validation
          const cleanSymbol = symbol.trim().toUpperCase();
          const priceHistory = await vnstockClient.getPriceHistory({
            symbol: cleanSymbol,
            source: 'vci',
            start: startDate.toISOString().split('T')[0],
            end: endDate.toISOString().split('T')[0],
            interval: 'D',
          });

          // Find the data point for the target date
          if (priceHistory.data) {
            let dataArray: any[] = [];
            
            if (priceHistory.data.records) {
              dataArray = priceHistory.data.records;
            } else if (Array.isArray(priceHistory.data)) {
              dataArray = priceHistory.data;
            } else if (priceHistory.data.data && Array.isArray(priceHistory.data.data)) {
              dataArray = priceHistory.data.data;
            }

            // Find matching date
            const targetDateStr = targetDate.toISOString().split('T')[0];
            for (const item of dataArray) {
              const itemDate = item.Date || item.date || item.time || item.Time;
              let itemDateStr: string;
              
              if (itemDate instanceof Date) {
                itemDateStr = itemDate.toISOString().split('T')[0];
              } else if (typeof itemDate === 'string') {
                const parsed = new Date(itemDate);
                if (!isNaN(parsed.getTime())) {
                  itemDateStr = parsed.toISOString().split('T')[0];
                } else {
                  // Try DD/MM/YYYY format
                  const parts = itemDate.split('/');
                  if (parts.length === 3) {
                    itemDateStr = `${parts[2]}-${parts[1]}-${parts[0]}`;
                  } else {
                    itemDateStr = itemDate;
                  }
                }
              } else {
                continue;
              }

              if (itemDateStr === targetDateStr) {
                const open = item.Open || item.open || item.GiaMo || item.giaMo;
                const high = item.High || item.high || item.Cao || item.cao;
                const low = item.Low || item.low || item.Thap || item.thap;
                const close = item.Close || item.close || item.GiaDong || item.giaDong || item.Price || item.price;

                log(`[Predictions] Found price data from vnstock: open=${open}, high=${high}, low=${low}, close=${close}`);

                return {
                  open: open !== undefined && open !== null ? parseFloat(String(open)) : existingPriceData.open,
                  high: high !== undefined && high !== null ? parseFloat(String(high)) : existingPriceData.high,
                  low: low !== undefined && low !== null ? parseFloat(String(low)) : existingPriceData.low,
                  close: close !== undefined && close !== null ? parseFloat(String(close)) : existingPriceData.close || null,
                };
              }
            }
          }
        } catch (vnstockError) {
          log(`[Predictions] Failed to fetch price data from vnstock for ${symbol} on ${date}:`, vnstockError);
        }
      } else {
        log(`[Predictions] Vnstock client not available for ${symbol}`);
      }
    } else if (market === 'US') {
      // Fetch from Yahoo Finance via stockPriceService
      try {
        const historicalData = await stockPriceService.getHistoricalData(
          symbol,
          'US',
          {
            period1: startDate,
            period2: endDate,
            interval: '1d'
          }
        );

        // Find matching date
        const targetDateStr = targetDate.toISOString().split('T')[0];
        const matchingData = historicalData.find(d => d.date === targetDateStr);

        if (matchingData) {
          log(`[Predictions] Found price data from Yahoo Finance: open=${matchingData.open}, high=${matchingData.high}, low=${matchingData.low}, close=${matchingData.close}`);

          return {
            open: matchingData.open || existingPriceData.open,
            high: matchingData.high || existingPriceData.high,
            low: matchingData.low || existingPriceData.low,
            close: matchingData.close || existingPriceData.close || null,
          };
        }
      } catch (yahooError) {
        log(`[Predictions] Failed to fetch price data from Yahoo Finance for ${symbol} on ${date}:`, yahooError);
      }
    } else {
      log(`[Predictions] Unknown market type for ${symbol}, cannot fetch price data`);
    }
  } catch (error) {
    log(`[Predictions] Error fetching missing price data for ${symbol} on ${date}:`, error);
  }

  // Return existing data if fetch failed
  return existingPriceData;
}

/**
 * Store a prediction in the database
 */
async function storePrediction(
  stockAnalysisId: number,
  symbol: string,
  enhancedPrediction: EnhancedPrediction
): Promise<void> {
  try {
    await prisma.prediction.upsert({
      where: {
        stockAnalysisId_date: {
          stockAnalysisId,
          date: enhancedPrediction.date
        }
      },
      update: {
        symbol,
        score: enhancedPrediction.score,
        prediction: enhancedPrediction.prediction,
        confidence: enhancedPrediction.confidence,
        threshold: enhancedPrediction.threshold,
        aboveThreshold: enhancedPrediction.aboveThreshold,
        isFuture: enhancedPrediction.isFuture || false,
        activeFactors: JSON.stringify(enhancedPrediction.activeFactors),
        recommendations: JSON.stringify(enhancedPrediction.recommendations),
        interpretation: enhancedPrediction.interpretation,
        signals: enhancedPrediction.signals ? JSON.stringify(enhancedPrediction.signals) : null,
        patterns: enhancedPrediction.patterns ? JSON.stringify(enhancedPrediction.patterns) : null,
        priceData: enhancedPrediction.priceData ? JSON.stringify(enhancedPrediction.priceData) : null,
        updatedAt: new Date()
      },
      create: {
        stockAnalysisId,
        symbol,
        date: enhancedPrediction.date,
        score: enhancedPrediction.score,
        prediction: enhancedPrediction.prediction,
        confidence: enhancedPrediction.confidence,
        threshold: enhancedPrediction.threshold,
        aboveThreshold: enhancedPrediction.aboveThreshold,
        isFuture: enhancedPrediction.isFuture || false,
        activeFactors: JSON.stringify(enhancedPrediction.activeFactors),
        recommendations: JSON.stringify(enhancedPrediction.recommendations),
        interpretation: enhancedPrediction.interpretation,
        signals: enhancedPrediction.signals ? JSON.stringify(enhancedPrediction.signals) : null,
        patterns: enhancedPrediction.patterns ? JSON.stringify(enhancedPrediction.patterns) : null,
        priceData: enhancedPrediction.priceData ? JSON.stringify(enhancedPrediction.priceData) : null
      }
    });
  } catch (error) {
    // Log error but don't fail the entire prediction generation
    console.error(`[Predictions] Failed to store prediction for ${symbol} on ${enhancedPrediction.date}:`, error);
  }
}

/**
 * Enrich predictions with feedback data for a specific user
 */
async function enrichPredictionsWithFeedback(
  predictions: EnhancedPrediction[],
  stockAnalysisId: number,
  userId: number
): Promise<EnhancedPrediction[]> {
  if (predictions.length === 0) return predictions;

  // Get all prediction dates
  const dates = predictions.map(p => p.date);

  // Fetch all predictions from database for these dates
  const storedPredictions = await prisma.prediction.findMany({
    where: {
      stockAnalysisId,
      date: {
        in: dates
      }
    },
    include: {
      feedbacks: {
        where: {
          userId
        },
        select: {
          id: true,
          isCorrect: true,
          notes: true,
          createdAt: true,
          updatedAt: true
        }
      }
    }
  });

  // Create a map of date -> feedback
  const dateToFeedback = new Map<string, {
    id: number;
    isCorrect: boolean;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  } | null>();
  
  storedPredictions.forEach((sp: { date: string; feedbacks: Array<{
    id: number;
    isCorrect: boolean;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  }> }) => {
    const feedback = sp.feedbacks[0] || null;
    dateToFeedback.set(sp.date, feedback);
  });

  // Enrich predictions with feedback
  return predictions.map(pred => {
    const feedback = dateToFeedback.get(pred.date);

    return {
      ...pred,
      feedback: feedback ? {
        id: feedback.id,
        isCorrect: feedback.isCorrect,
        notes: feedback.notes,
        createdAt: feedback.createdAt.toISOString(),
        updatedAt: feedback.updatedAt.toISOString()
      } : null
    };
  });
}

/**
 * Generate predictions for a stock analysis
 */
export async function generatePredictionsForAnalysis(
  stockAnalysisId: number,
  daysLimit: number,
  filters: PredictionFilters,
  orderBy: string,
  order: 'asc' | 'desc',
  options?: {
    enableLogging?: boolean;
    futureDays?: number; // Number of future days to predict (default: 0)
    includeFeedback?: boolean; // Include feedback data (default: false)
    userId?: number; // User ID for feedback filtering (required if includeFeedback is true)
    scoreConfig?: DailyScoreConfig; // Custom score configuration (default: DEFAULT_DAILY_SCORE_CONFIG)
  }
): Promise<PredictionGenerationResult> {
  const { enableLogging = false, futureDays = 0, scoreConfig } = options || {};
  const log = enableLogging ? console.log : () => {};
  const logError = enableLogging ? console.error : () => {};
  const predictionConfig = scoreConfig || DEFAULT_DAILY_SCORE_CONFIG;
  
  // Validate stock analysis exists
  const stockAnalysis = await prisma.stockAnalysis.findUnique({
    where: { id: stockAnalysisId }
  });

  if (!stockAnalysis) {
    throw new Error(`Stock analysis not found for ID: ${stockAnalysisId}`);
  }

  log(`[Predictions] Found stock analysis: ${stockAnalysis.symbol} (ID: ${stockAnalysisId}, market: ${stockAnalysis.market || 'unknown'})`);

  // Fetch all factor data, then filter to last 3 years
  // This ensures we have enough data for accurate predictions within the 3-year window
  log(`[Predictions] Fetching all factor data to filter to last ${PREDICTION_CONFIG.MAX_YEARS_HISTORY} years`);
  
  // Fetch all data (limit: 0), then filter by date to last 3 years
  const allData = await calculateFactorsOnDemand(stockAnalysisId, {
    skip: 0,
    limit: 0 // Fetch all data to ensure we have enough for 3-year filtering
  });

  log(`[Predictions] Retrieved ${allData.length} total factor data records`);

  // Validate minimum data requirements
  if (allData.length === 0) {
    return {
      predictions: [],
      errors: [{
        date: 'N/A',
        error: 'No factor data available. Please run factor analysis first.'
      }]
    };
  }

  // Filter data to only include records within the last 3 years
  const threeYearsAgo = new Date();
  threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - PREDICTION_CONFIG.MAX_YEARS_HISTORY);
  const cutoffDate = threeYearsAgo.toISOString().split('T')[0];
  
  log(`[Predictions] Filtering data to last ${PREDICTION_CONFIG.MAX_YEARS_HISTORY} years (cutoff date: ${cutoffDate})`);
  
  const filteredData = allData.filter(record => {
    if (!record.Date) return false;
    const recordDate = typeof record.Date === 'string' 
      ? record.Date 
      : new Date(record.Date).toISOString().split('T')[0];
    return recordDate >= cutoffDate;
  });
  
  log(`[Predictions] After 3-year filter: ${filteredData.length} records (removed ${allData.length - filteredData.length} older records)`);

  if (filteredData.length === 0) {
    return {
      predictions: [],
      errors: [{
        date: 'N/A',
        error: `No factor data available within the last ${PREDICTION_CONFIG.MAX_YEARS_HISTORY} years. Please ensure your data includes recent records.`
      }]
    };
  }

  if (filteredData.length < daysLimit) {
    log(`[Predictions] Warning: Only ${filteredData.length} days available within 3 years, requested ${daysLimit}`);
  }

  // Take the last N days (most recent) and reverse to get descending order (most recent first)
  const recentData = filteredData.slice(-daysLimit).reverse();
  
  log(`[Predictions] Using ${recentData.length} most recent days (from ${recentData[recentData.length - 1]?.Date} to ${recentData[0]?.Date})`);

  // Generate predictions
  const predictions: PredictionGenerationResult['predictions'] = [];
  const errors: PredictionGenerationResult['errors'] = [];
  
  // Generate predictions for historical dates (skip if only future predictions requested)
  // When futureDays > 0, we still need historical data to find baseline factors,
  // but we only generate historical predictions if futureDays is 0 or not specified
  if (futureDays === 0 || futureDays === undefined) {
    const maxDaysToProcess = Math.min(PREDICTION_CONFIG.MAX_DAYS_TO_PROCESS, recentData.length);
    
    log(`[Predictions] Generating predictions for ${maxDaysToProcess} historical days`);

    for (let i = 0; i < maxDaysToProcess; i++) {
      const dayData = recentData[i];
      const dateStr = (dayData.Date as string) || new Date().toISOString().split('T')[0];
      
      try {
        // Extract factors from day data
        const dayFactors = extractFactorsFromRecord(dayData);
        
        // Generate prediction
        const prediction = generateDailyPrediction(
          stockAnalysis.symbol,
          dayFactors,
          predictionConfig // Use custom config if provided, otherwise default
        );
        
        // Set the actual date from data and add aboveThreshold
        prediction.date = dateStr;
        
        // Find the index of this dayData in filteredData (which is in ascending order)
        // recentData is reversed (most recent first), so recentData[i] corresponds to
        // filteredData[filteredData.length - 1 - i]
        const currentIndexInFiltered = filteredData.length - 1 - i;
        
        // Extract technical signals
        const signals = extractTechnicalSignals(dayData, filteredData, currentIndexInFiltered);
        
        // Recognize patterns
        const activeFactorNames = Object.entries(dayFactors)
          .filter(([_, active]) => active)
          .map(([factor]) => factor);
        const patterns = recognizePatterns(dayData, filteredData, currentIndexInFiltered, activeFactorNames);
        
        // Extract price data
        // Handle both undefined and null values, and check for valid numbers
        const getPriceValue = (value: unknown): number | null => {
          if (typeof value === 'number' && !isNaN(value)) {
            return value;
          }
          return null;
        };
        
        // Initial price data extraction from dayData
        let priceData = {
          currentPrice: getPriceValue(dayData.Close),
          open: getPriceValue(dayData.Open),
          high: getPriceValue(dayData.High),
          low: getPriceValue(dayData.Low),
          close: getPriceValue(dayData.Close),
          change: getPriceValue(dayData.pct_change),
          changePercent: getPriceValue(dayData.pct_change)
        };
        
        // Debug: Log price data availability for first prediction
        if (enableLogging && predictions.length === 0) {
          log(`[Predictions] Price data check for ${dateStr}:`, {
            Close: dayData.Close,
            Open: dayData.Open,
            High: dayData.High,
            Low: dayData.Low,
            pct_change: dayData.pct_change,
            hasOpen: 'Open' in dayData,
            hasHigh: 'High' in dayData,
            hasLow: 'Low' in dayData,
            extractedPriceData: priceData
          });
        }
        
        // Fetch missing price data from remote API if needed
        const market = (stockAnalysis.market === 'VN' || stockAnalysis.market === 'US') 
          ? stockAnalysis.market 
          : null;
        
        if (priceData.open === null || priceData.high === null || priceData.low === null) {
          const fetchedPriceData = await fetchMissingPriceData(
            stockAnalysis.symbol,
            dateStr,
            market,
            {
              open: priceData.open,
              high: priceData.high,
              low: priceData.low,
              close: priceData.close
            },
            enableLogging
          );
          
          // Update priceData with fetched values
          priceData = {
            ...priceData,
            open: fetchedPriceData.open ?? priceData.open,
            high: fetchedPriceData.high ?? priceData.high,
            low: fetchedPriceData.low ?? priceData.low,
            close: fetchedPriceData.close ?? priceData.close,
            currentPrice: fetchedPriceData.close ?? priceData.currentPrice
          };
          
          if (enableLogging && (fetchedPriceData.open !== null || fetchedPriceData.high !== null || fetchedPriceData.low !== null)) {
            log(`[Predictions] Updated price data after fetch for ${dateStr}:`, priceData);
          }
        }
        
        // Add aboveThreshold property and enhance with signals/patterns
        const enhancedPrediction: EnhancedPrediction = {
          ...prediction,
          aboveThreshold: prediction.score >= prediction.threshold,
          signals,
          patterns,
          priceData
        };
        
        // Store prediction in database
        await storePrediction(stockAnalysisId, stockAnalysis.symbol, enhancedPrediction);
        
        predictions.push(enhancedPrediction);
        
        log(`[Predictions] Generated and stored prediction for ${prediction.date}: score=${prediction.score}, prediction=${prediction.prediction}, pattern=${patterns.patternType}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logError(`[Predictions] Error generating prediction for day ${dateStr}:`, error);
        errors.push({
          date: dateStr,
          error: errorMessage
        });
        // Continue with other days even if one fails
      }
    }
  } else {
    log(`[Predictions] Skipping historical predictions (futureDays=${futureDays} specified)`);
  }

  // Generate predictions for future dates if requested
  if (futureDays > 0) {
    const maxFutureDays = Math.min(futureDays, PREDICTION_CONFIG.MAX_FUTURE_DAYS);
    log(`[Predictions] Generating predictions for ${maxFutureDays} future days`);
    
    // Find the most recent data with active factors as baseline
    // This ensures future predictions use meaningful factor data
    let baselineData = recentData[0];
    let baselineDate = baselineData ? ((baselineData.Date as string) || new Date().toISOString().split('T')[0]) : null;
    
    if (!baselineData) {
      log(`[Predictions] Warning: No recent data available for future predictions`);
    } else {
      // Try to find a day with active factors (check up to last 10 days)
      const daysToCheck = Math.min(10, recentData.length);
      for (let i = 0; i < daysToCheck; i++) {
        const candidateData = recentData[i];
        if (!candidateData) continue;
        
        const candidateFactors = extractFactorsFromRecord(candidateData);
        const activeFactorCount = Object.values(candidateFactors).filter(Boolean).length;
        
        if (activeFactorCount > 0) {
          baselineData = candidateData;
          baselineDate = (candidateData.Date as string) || new Date().toISOString().split('T')[0];
          log(`[Predictions] Using baseline from ${baselineDate} with ${activeFactorCount} active factors`);
          break;
        }
      }
      
      // If no day with active factors found, use most recent but log warning
      const baselineFactors = extractFactorsFromRecord(baselineData);
      const activeFactorCount = Object.values(baselineFactors).filter(Boolean).length;
      
      if (activeFactorCount === 0) {
        log(`[Predictions] Warning: Baseline data from ${baselineDate} has no active factors. Future predictions will have score 0.`);
      }
      
      for (let i = 1; i <= maxFutureDays; i++) {
        const futureDate = getFutureDate(i);
        
        try {
          // Generate prediction using baseline factors
          // Note: In a real scenario, you might want to adjust factors based on trends
          // For now, we use the baseline factors as-is
          const prediction = generateDailyPrediction(
            stockAnalysis.symbol,
            baselineFactors,
            predictionConfig // Use custom config if provided, otherwise default
          );
          
          // Set the future date
          prediction.date = futureDate;
          
          // Extract technical signals from baseline data (for future predictions, use most recent data)
          // Find baselineData index in filteredData (recentData is reversed, so recentData[0] = filteredData[filteredData.length - 1])
          const baselineIndexInRecent = recentData.findIndex(d => d === baselineData);
          const actualIndex = baselineIndexInRecent >= 0 
            ? filteredData.length - 1 - baselineIndexInRecent 
            : filteredData.length - 1;
          const signals = extractTechnicalSignals(baselineData, filteredData, actualIndex);
          
          // Recognize patterns from baseline
          const baselineActiveFactors = Object.entries(baselineFactors)
            .filter(([_, active]) => active)
            .map(([factor]) => factor);
          const patterns = recognizePatterns(baselineData, filteredData, actualIndex, baselineActiveFactors);
          
          // Estimate future price data based on prediction score, signals, and historical patterns
          const getPriceValue = (value: unknown): number | null => {
            if (typeof value === 'number' && !isNaN(value)) {
              return value;
            }
            return null;
          };
          
          const baselineClose = getPriceValue(baselineData.Close);
          
          // If we have a valid baseline price, estimate future price data
          let priceData: {
            currentPrice: number | null;
            open: number | null;
            high: number | null;
            low: number | null;
            close: number | null;
            change: number | null;
            changePercent: number | null;
          };
          
          if (baselineClose !== null && baselineClose > 0) {
            // Use estimation function to calculate predicted price data
            const estimatedPriceData = estimateFuturePriceData(
              baselineClose,
              prediction.score,
              prediction.threshold,
              signals,
              filteredData,
              actualIndex
            );
            priceData = estimatedPriceData;
          } else {
            // Fallback: if no baseline price available, set all to null
            priceData = {
              currentPrice: baselineClose,
              open: null,
              high: null,
              low: null,
              close: null,
              change: null,
              changePercent: null
            };
          }
          
          const enhancedPrediction: EnhancedPrediction = {
            ...prediction,
            aboveThreshold: prediction.score >= prediction.threshold,
            isFuture: true,
            signals,
            patterns,
            priceData
          };
          
          // Store future prediction in database
          await storePrediction(stockAnalysisId, stockAnalysis.symbol, enhancedPrediction);
          
          predictions.push(enhancedPrediction);
          
          log(`[Predictions] Generated and stored future prediction for ${futureDate}: score=${prediction.score}, prediction=${prediction.prediction}, factors=${activeFactorCount}, pattern=${patterns.patternType}`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logError(`[Predictions] Error generating future prediction for ${futureDate}:`, error);
          errors.push({
            date: futureDate,
            error: errorMessage
          });
        }
      }
    }
  }

  log(`[Predictions] Generated ${predictions.length} total predictions before filtering`);

  // Apply filters (in-memory)
  const filteredPredictions = applyPredictionFilters(predictions, filters);
  log(`[Predictions] After filtering: ${filteredPredictions.length} predictions`);

  // Sort predictions
  const sortedPredictions = sortPredictions(filteredPredictions, orderBy, order);
  
  log(`[Predictions] Returning ${sortedPredictions.length} sorted predictions`);

  // Enrich with feedback if requested
  let finalPredictions = sortedPredictions;
  if (options?.includeFeedback && options?.userId) {
    finalPredictions = await enrichPredictionsWithFeedback(
      sortedPredictions,
      stockAnalysisId,
      options.userId
    );
  }

  return {
    predictions: finalPredictions,
    ...(errors.length > 0 && { errors })
  };
}

/**
 * Parse and validate request parameters for prediction endpoints
 */
export interface ParsedPredictionParams {
  daysLimit: number;
  orderBy: string;
  order: 'asc' | 'desc';
  filters: PredictionFilters;
  futureDays?: number; // Number of future days to predict
}

export function parsePredictionParams(req: Request): ParsedPredictionParams {
  const { orderBy: orderByParam = 'date', order: orderParam = 'desc', days, futureDays } = req.query;
  
  // Normalize orderBy and order parameters
  const orderBy = Array.isArray(orderByParam) ? orderByParam[0] : String(orderByParam);
  let order = Array.isArray(orderParam) ? orderParam[0] : String(orderParam);
  
  // Validate and normalize order parameter
  if (order !== 'asc' && order !== 'desc') {
    order = 'desc';
  }
  
  // Parse and validate days parameter
  let daysLimit: number = PREDICTION_CONFIG.DEFAULT_DAYS_LIMIT;
  if (days) {
    const parsedDays = parseInt(String(days), 10);
    if (isNaN(parsedDays) || parsedDays < PREDICTION_CONFIG.MIN_DAYS_LIMIT || parsedDays > PREDICTION_CONFIG.MAX_DAYS_LIMIT) {
      throw new Error(`Days must be a number between ${PREDICTION_CONFIG.MIN_DAYS_LIMIT} and ${PREDICTION_CONFIG.MAX_DAYS_LIMIT}`);
    }
    daysLimit = parsedDays;
  }

  // Parse and validate futureDays parameter
  let futureDaysLimit: number | undefined = undefined;
  if (futureDays) {
    const parsedFutureDays = parseInt(String(futureDays), 10);
    if (isNaN(parsedFutureDays) || parsedFutureDays < 0 || parsedFutureDays > PREDICTION_CONFIG.MAX_FUTURE_DAYS) {
      throw new Error(`Future days must be a number between 0 and ${PREDICTION_CONFIG.MAX_FUTURE_DAYS}`);
    }
    futureDaysLimit = parsedFutureDays;
  }

  // Parse filters with error handling
  let filters: PredictionFilters;
  try {
    filters = parsePredictionFilters(req);
  } catch (filterError) {
    if (filterError instanceof FilterValidationError) {
      throw filterError;
    }
    throw new Error(`Failed to parse filters: ${filterError instanceof Error ? filterError.message : String(filterError)}`);
  }

  return {
    daysLimit,
    orderBy: String(orderBy),
    order: order as 'asc' | 'desc',
    filters,
    ...(futureDaysLimit !== undefined && { futureDays: futureDaysLimit })
  };
}
