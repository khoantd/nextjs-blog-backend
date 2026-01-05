/**
 * Stock Market Factors Analysis
 * Analyzes various technical and fundamental factors that influence stock price movements
 */

export type StockFactor =
  | "market_up"          // Nasdaq surged that day
  | "sector_up"          // Social media / ads sector increased
  | "earnings_window"    // Near earnings announcement date (±3 days)
  | "volume_spike"       // Volume > 1.5x MA20
  | "break_ma50"         // Price breaks above MA50
  | "break_ma200"        // Price breaks above MA200
  | "rsi_over_60"        // RSI > 60
  | "news_positive"      // Positive news sentiment
  | "short_covering"     // High short interest + price increase
  | "macro_tailwind";    // CPI/Fed/Rate favorable conditions

export const STOCK_FACTORS: readonly StockFactor[] = [
  "market_up",
  "sector_up",
  "earnings_window",
  "volume_spike",
  "break_ma50",
  "break_ma200",
  "rsi_over_60",
  "news_positive",
  "short_covering",
  "macro_tailwind"
] as const;

export interface FactorDescription {
  factor: StockFactor;
  name: string;
  description: string;
  category: "technical" | "fundamental" | "market" | "sentiment";
}

export const FACTOR_DESCRIPTIONS: Record<StockFactor, FactorDescription> = {
  market_up: {
    factor: "market_up",
    name: "Market Rally",
    description: "Nasdaq index surged significantly on that trading day",
    category: "market"
  },
  sector_up: {
    factor: "sector_up",
    name: "Sector Strength",
    description: "Social media / advertising sector showed strong performance",
    category: "market"
  },
  earnings_window: {
    factor: "earnings_window",
    name: "Earnings Window",
    description: "Within ±3 days of earnings announcement date",
    category: "fundamental"
  },
  volume_spike: {
    factor: "volume_spike",
    name: "Volume Spike",
    description: "Trading volume exceeds 1.5x the 20-day moving average",
    category: "technical"
  },
  break_ma50: {
    factor: "break_ma50",
    name: "MA50 Breakout",
    description: "Price breaks above the 50-day moving average",
    category: "technical"
  },
  break_ma200: {
    factor: "break_ma200",
    name: "MA200 Breakout",
    description: "Price breaks above the 200-day moving average",
    category: "technical"
  },
  rsi_over_60: {
    factor: "rsi_over_60",
    name: "Strong RSI",
    description: "Relative Strength Index (RSI) exceeds 60",
    category: "technical"
  },
  news_positive: {
    factor: "news_positive",
    name: "Positive News",
    description: "Positive news sentiment and announcements",
    category: "sentiment"
  },
  short_covering: {
    factor: "short_covering",
    name: "Short Covering",
    description: "High short interest combined with price increase (potential squeeze)",
    category: "market"
  },
  macro_tailwind: {
    factor: "macro_tailwind",
    name: "Macro Tailwind",
    description: "Favorable CPI/Fed/interest rate environment",
    category: "fundamental"
  }
};

export interface FactorAnalysis {
  date: string;
  factors: Partial<Record<StockFactor, boolean>>;
  factorCount: number;
  factorList: StockFactor[];
}

export interface ExtendedStockData {
  Date: string;
  Close: number;
  Open?: number;
  High?: number;
  Low?: number;
  Volume?: number;
  ma20?: number;
  ma50?: number;
  ma200?: number;
  rsi?: number;
  pct_change?: number;
}

/**
 * Calculate moving average
 */
export function calculateMA(prices: number[], period: number): number[] {
  const result: number[] = [];

  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      result.push(sum / period);
    }
  }

  return result;
}

/**
 * Calculate RSI (Relative Strength Index)
 */
export function calculateRSI(prices: number[], period: number = 14): number[] {
  const result: number[] = [];
  const changes: number[] = [];

  // Calculate price changes
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }

  for (let i = 0; i < prices.length; i++) {
    if (i < period) {
      result.push(NaN);
      continue;
    }

    const recentChanges = changes.slice(i - period, i);
    const gains = recentChanges.filter(c => c > 0);
    const losses = recentChanges.filter(c => c < 0).map(c => Math.abs(c));

    const avgGain = gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / period : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / period : 0;

    if (avgLoss === 0) {
      result.push(100);
    } else {
      const rs = avgGain / avgLoss;
      const rsi = 100 - (100 / (1 + rs));
      result.push(rsi);
    }
  }

  return result;
}

/**
 * Analyze factors for each trading day
 */
export function analyzeFactors(
  stockData: ExtendedStockData[],
  options: {
    nasdaqData?: Array<{ date: string; pct_change: number }>;
    sectorData?: Array<{ date: string; pct_change: number }>;
    earningsDates?: string[];
    newsData?: Array<{ date: string; sentiment: 'positive' | 'negative' | 'neutral' }>;
    shortInterest?: number;
    macroEvents?: Array<{ date: string; favorable: boolean }>;
  } = {}
): FactorAnalysis[] {
  const analyses: FactorAnalysis[] = [];

  // Calculate technical indicators
  const closePrices = stockData.map(d => d.Close);
  const volumes = stockData.map(d => d.Volume || 0);

  const ma20 = calculateMA(closePrices, 20);
  const ma50 = calculateMA(closePrices, 50);
  const ma200 = calculateMA(closePrices, 200);
  const rsi = calculateRSI(closePrices);
  const volumeMA20 = calculateMA(volumes, 20);

  stockData.forEach((data, index) => {
    const factors: Partial<Record<StockFactor, boolean>> = {};
    const date = new Date(data.Date).toISOString().split('T')[0];

    // Market up: Check if Nasdaq surged
    if (options.nasdaqData) {
      const nasdaqDay = options.nasdaqData.find(n =>
        new Date(n.date).toISOString().split('T')[0] === date
      );
      factors.market_up = nasdaqDay ? nasdaqDay.pct_change > 1.5 : false;
    }

    // Sector up: Check if sector performed well
    if (options.sectorData) {
      const sectorDay = options.sectorData.find(s =>
        new Date(s.date).toISOString().split('T')[0] === date
      );
      factors.sector_up = sectorDay ? sectorDay.pct_change > 1.0 : false;
    }

    // Earnings window: Within ±3 days
    if (options.earningsDates) {
      const currentDate = new Date(date);
      factors.earnings_window = options.earningsDates.some(earnDate => {
        const earnDateTime = new Date(earnDate);
        const diffDays = Math.abs((currentDate.getTime() - earnDateTime.getTime()) / (1000 * 60 * 60 * 24));
        return diffDays <= 3;
      });
    }

    // Volume spike: Volume > 1.5x MA20
    if (data.Volume && volumeMA20[index] && !isNaN(volumeMA20[index]) && volumeMA20[index] > 0) {
      factors.volume_spike = data.Volume > volumeMA20[index] * 1.5;
    }

    // Break MA50
    if (ma50[index] && !isNaN(ma50[index]) && index > 0 && ma50[index - 1] && !isNaN(ma50[index - 1])) {
      const previousBelowMA50 = stockData[index - 1].Close <= ma50[index - 1];
      const currentAboveMA50 = data.Close > ma50[index];
      factors.break_ma50 = previousBelowMA50 && currentAboveMA50;
    }

    // Break MA200
    if (ma200[index] && !isNaN(ma200[index]) && index > 0 && ma200[index - 1] && !isNaN(ma200[index - 1])) {
      const previousBelowMA200 = stockData[index - 1].Close <= ma200[index - 1];
      const currentAboveMA200 = data.Close > ma200[index];
      factors.break_ma200 = previousBelowMA200 && currentAboveMA200;
    }

    // RSI over 60
    if (rsi[index] && !isNaN(rsi[index])) {
      factors.rsi_over_60 = rsi[index] > 60;
    }

    // Positive news
    if (options.newsData) {
      const newsDay = options.newsData.find(n =>
        new Date(n.date).toISOString().split('T')[0] === date
      );
      factors.news_positive = newsDay ? newsDay.sentiment === 'positive' : false;
    }

    // Short covering: High short interest + price increase
    if (options.shortInterest && data.pct_change) {
      factors.short_covering = options.shortInterest > 15 && data.pct_change > 2;
    }

    // Macro tailwind
    if (options.macroEvents) {
      const macroEvent = options.macroEvents.find(m =>
        new Date(m.date).toISOString().split('T')[0] === date
      );
      factors.macro_tailwind = macroEvent ? macroEvent.favorable : false;
    }

    const factorList = (Object.keys(factors) as StockFactor[]).filter(
      key => factors[key] === true
    );

    analyses.push({
      date,
      factors,
      factorCount: factorList.length,
      factorList
    });
  });

  return analyses;
}

/**
 * Get factor summary statistics
 */
export function getFactorSummary(analyses: FactorAnalysis[]) {
  const factorCounts: Partial<Record<StockFactor, number>> = {};

  STOCK_FACTORS.forEach(factor => {
    factorCounts[factor] = analyses.filter(a => a.factors[factor] === true).length;
  });

  const totalDays = analyses.length;
  const factorFrequency: Partial<Record<StockFactor, number>> = {};

  STOCK_FACTORS.forEach(factor => {
    factorFrequency[factor] = totalDays > 0
      ? ((factorCounts[factor] || 0) / totalDays) * 100
      : 0;
  });

  return {
    totalDays,
    factorCounts,
    factorFrequency,
    averageFactorsPerDay: totalDays > 0
      ? analyses.reduce((sum, a) => sum + a.factorCount, 0) / totalDays
      : 0
  };
}

/**
 * Daily stock scoring system for predicting strong price movements
 * Based on weighted factor analysis with configurable thresholds
 */

export interface DailyScoreConfig {
  weights: Partial<Record<StockFactor, number>>;
  threshold: number;
  minFactorsRequired?: number;
}

export interface DailyScoreResult {
  date: string;
  score: number;
  factors: StockFactor[];
  factorCount: number;
  aboveThreshold: boolean;
  breakdown: Partial<Record<StockFactor, { weight: number; active: boolean; contribution: number }>>;
}

export const DEFAULT_DAILY_SCORE_CONFIG: DailyScoreConfig = {
  weights: {
    volume_spike: 0.25,
    market_up: 0.20,
    earnings_window: 0.15,
    break_ma50: 0.15,
    rsi_over_60: 0.10,
    sector_up: 0.08,
    break_ma200: 0.05,
    news_positive: 0.02,
    short_covering: 0.03,
    macro_tailwind: 0.02
  },
  threshold: 0.45, // 45% threshold for high probability of strong movement
  minFactorsRequired: 2
};

/**
 * Calculate daily score based on factor analysis
 */
export function calculateDailyScore(
  factorAnalysis: FactorAnalysis,
  config: DailyScoreConfig = DEFAULT_DAILY_SCORE_CONFIG
): DailyScoreResult {
  const breakdown: DailyScoreResult['breakdown'] = {};
  let totalScore = 0;
  const activeFactors: StockFactor[] = [];

  // Calculate contribution from each factor
  Object.entries(config.weights).forEach(([factor, weight]) => {
    const isActive = factorAnalysis.factors[factor as StockFactor] === true;
    const contribution = isActive ? weight : 0;
    
    breakdown[factor as StockFactor] = {
      weight,
      active: isActive,
      contribution
    };
    
    if (isActive) {
      totalScore += contribution;
      activeFactors.push(factor as StockFactor);
    }
  });

  const aboveThreshold = totalScore >= config.threshold && 
    (!config.minFactorsRequired || activeFactors.length >= config.minFactorsRequired);

  return {
    date: factorAnalysis.date,
    score: totalScore,
    factors: activeFactors,
    factorCount: activeFactors.length,
    aboveThreshold,
    breakdown
  };
}

/**
 * Calculate daily scores for multiple days
 */
export function calculateDailyScores(
  factorAnalyses: FactorAnalysis[],
  config: DailyScoreConfig = DEFAULT_DAILY_SCORE_CONFIG
): DailyScoreResult[] {
  return factorAnalyses.map(analysis => calculateDailyScore(analysis, config));
}

/**
 * Get daily scoring summary statistics
 */
export function getDailyScoreSummary(scores: DailyScoreResult[]) {
  const totalDays = scores.length;
  const highScoreDays = scores.filter(s => s.aboveThreshold).length;
  const averageScore = totalDays > 0 ? scores.reduce((sum, s) => sum + s.score, 0) / totalDays : 0;
  
  // Factor frequency in high-score days
  const factorFrequency: Partial<Record<StockFactor, number>> = {};
  const highScoreFactors = scores.filter(s => s.aboveThreshold).flatMap(s => s.factors);
  
  STOCK_FACTORS.forEach(factor => {
    const occurrences = highScoreFactors.filter(f => f === factor).length;
    factorFrequency[factor] = highScoreDays > 0 ? (occurrences / highScoreDays) * 100 : 0;
  });

  return {
    totalDays,
    highScoreDays,
    highScorePercentage: totalDays > 0 ? (highScoreDays / totalDays) * 100 : 0,
    averageScore,
    maxScore: Math.max(...scores.map(s => s.score)),
    minScore: Math.min(...scores.map(s => s.score)),
    factorFrequency
  };
}

/**
 * Predict potential strong movement days based on current factors
 */
export function predictStrongMovement(
  currentFactors: Partial<Record<StockFactor, boolean>>,
  config: DailyScoreConfig = DEFAULT_DAILY_SCORE_CONFIG
): {
  score: number;
  prediction: 'HIGH_PROBABILITY' | 'MODERATE' | 'LOW_PROBABILITY';
  confidence: number;
  activeFactors: StockFactor[];
  recommendations: string[];
} {
  // Create mock factor analysis for current state
  const mockAnalysis: FactorAnalysis = {
    date: new Date().toISOString().split('T')[0],
    factors: currentFactors,
    factorCount: Object.values(currentFactors).filter(Boolean).length,
    factorList: Object.entries(currentFactors)
      .filter(([_, active]) => active)
      .map(([factor]) => factor as StockFactor)
  };

  const scoreResult = calculateDailyScore(mockAnalysis, config);
  
  // Determine prediction level
  let prediction: 'HIGH_PROBABILITY' | 'MODERATE' | 'LOW_PROBABILITY';
  let confidence: number;
  
  if (scoreResult.score >= config.threshold) {
    prediction = 'HIGH_PROBABILITY';
    confidence = Math.min(scoreResult.score * 100, 95);
  } else if (scoreResult.score >= config.threshold * 0.7) {
    prediction = 'MODERATE';
    confidence = scoreResult.score * 80;
  } else {
    prediction = 'LOW_PROBABILITY';
    confidence = scoreResult.score * 60;
  }

  // Generate recommendations based on active factors
  const recommendations: string[] = [];
  
  if (currentFactors.volume_spike) {
    recommendations.push("Monitor for continued volume support");
  }
  if (currentFactors.market_up) {
    recommendations.push("Watch market momentum for confirmation");
  }
  if (currentFactors.earnings_window) {
    recommendations.push("Be cautious of earnings-related volatility");
  }
  if (currentFactors.break_ma50) {
    recommendations.push("Monitor for sustained MA50 breakout");
  }
  if (currentFactors.rsi_over_60) {
    recommendations.push("Watch for potential overbought conditions");
  }

  return {
    score: scoreResult.score,
    prediction,
    confidence,
    activeFactors: scoreResult.factors,
    recommendations
  };
}

/**
 * Correlate factors with price movements
 */
export function correlateFactorsWithPriceMovement(
  analyses: FactorAnalysis[],
  stockData: ExtendedStockData[]
): Record<StockFactor, { correlation: number; avgReturn: number; occurrences: number }> {
  const results: any = {};

  STOCK_FACTORS.forEach(factor => {
    const daysWithFactor = analyses
      .map((analysis, index) => ({
        hasFactor: analysis.factors[factor] === true,
        pctChange: stockData[index]?.pct_change || 0
      }))
      .filter(d => !isNaN(d.pctChange));

    const withFactor = daysWithFactor.filter(d => d.hasFactor);
    const occurrences = withFactor.length;

    const avgReturn = occurrences > 0
      ? withFactor.reduce((sum, d) => sum + d.pctChange, 0) / occurrences
      : 0;

    // Simple correlation approximation
    const allReturns = daysWithFactor.map(d => d.pctChange);
    const avgAllReturns = allReturns.reduce((a, b) => a + b, 0) / allReturns.length;

    results[factor] = {
      correlation: occurrences > 0 ? (avgReturn > avgAllReturns ? 1 : -1) : 0,
      avgReturn,
      occurrences
    };
  });

  return results;
}
