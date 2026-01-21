/**
 * Price Simulation Types
 * Type definitions for price simulation service
 */

import { StockFactor } from '../stock-factors';

/**
 * Parameters for price simulation
 */
export interface SimulationParameters {
  symbol: string;
  initialPrice: number;
  timeHorizon: number; // days
  factorWeights?: Partial<Record<StockFactor, number>>;
  threshold?: number;
  factorStates?: Partial<Record<StockFactor, boolean>>;
  stockAnalysisId?: number; // Optional: use existing analysis data
}

/**
 * Single point in a price path
 */
export interface PricePathPoint {
  day: number;
  date: string;
  predictedPrice: number;
  priceChange: number;
  priceChangePercent: number;
  score: number;
  activeFactors: StockFactor[];
  confidence: number;
}

/**
 * Simulation scenario (optimistic, pessimistic, or base case)
 */
export interface SimulationScenario {
  type: 'optimistic' | 'pessimistic' | 'base';
  pricePath: PricePathPoint[];
  finalPrice: number;
  totalReturn: number;
  totalReturnPercent: number;
  probability: number;
}

/**
 * Confidence interval for price prediction
 */
export interface ConfidenceInterval {
  confidenceLevel: number; // e.g., 0.68, 0.95
  lowerBound: number;
  upperBound: number;
}

/**
 * Factor breakdown showing contribution to price movement
 */
export interface FactorBreakdown {
  factor: StockFactor;
  contribution: number;
  weight: number;
  active: boolean;
  historicalAvgReturn: number;
}

/**
 * Historical pattern match
 */
export interface HistoricalPatternMatch {
  date: string;
  similarity: number;
  actualReturn: number;
  factors: StockFactor[];
}

/**
 * Complete simulation result
 */
export interface SimulationResult {
  symbol: string;
  initialPrice: number;
  timeHorizon: number;
  baseCase: PricePathPoint[];
  scenarios: SimulationScenario[];
  confidenceIntervals: ConfidenceInterval[];
  factorBreakdown: FactorBreakdown[];
  historicalPatternMatches: HistoricalPatternMatch[];
  metadata: {
    parameters: SimulationParameters;
    generatedAt: string;
    calculationMethod: 'hybrid';
  };
}
