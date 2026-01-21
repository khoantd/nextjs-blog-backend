/**
 * Filter Utilities for Stock Analyses API
 * Implements filtering specification from FILTERING_SPECIFICATION.md
 */

import { Request } from 'express';

// ============================================================================
// Filter Interfaces
// ============================================================================

export interface StockAnalysisFilters {
  symbol?: string;
  market?: 'US' | 'VN';
  status?: string[];
  favorite?: boolean;
  createdFrom?: Date;
  createdTo?: Date;
  updatedFrom?: Date;
  updatedTo?: Date;
  minPrice?: number;
  maxPrice?: number;
  latest?: boolean; // Get only the latest analysis for the symbol
}

export interface DailyFactorFilters {
  dateFrom?: string;
  dateTo?: string;
  minClose?: number;
  maxClose?: number;
  minVolume?: number;
  maxVolume?: number;
  volume_spike?: boolean;
  break_ma50?: boolean;
  break_ma200?: boolean;
  rsi_over_60?: boolean;
  market_up?: boolean;
  sector_up?: boolean;
  earnings_window?: boolean;
  short_covering?: boolean;
  macro_tailwind?: boolean;
  news_positive?: boolean;
}

export interface DailyScoreFilters {
  dateFrom?: string;
  dateTo?: string;
  minScore?: number;
  maxScore?: number;
  prediction?: 'HIGH_PROBABILITY' | 'MODERATE' | 'LOW_PROBABILITY';
  aboveThreshold?: boolean;
}

export interface PredictionFilters {
  dateFrom?: string;
  dateTo?: string;
  minScore?: number;
  maxScore?: number;
  prediction?: 'HIGH_PROBABILITY' | 'MODERATE' | 'LOW_PROBABILITY';
  minConfidence?: number;
  maxConfidence?: number;
}

// ============================================================================
// Error Classes
// ============================================================================

export class FilterValidationError extends Error {
  constructor(
    message: string,
    public parameter: string,
    public value: any
  ) {
    super(message);
    this.name = 'FilterValidationError';
  }
}

// ============================================================================
// Parsing Utilities
// ============================================================================

/**
 * Parse a boolean query parameter
 */
function parseBoolean(value: any): boolean | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const str = String(value).toLowerCase();
  if (str === 'true') return true;
  if (str === 'false') return false;
  throw new FilterValidationError(
    `Invalid boolean value. Expected 'true' or 'false'`,
    'boolean',
    value
  );
}

/**
 * Parse a number query parameter
 */
function parseNumber(value: any, paramName: string): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const num = Number(value);
  if (isNaN(num)) {
    throw new FilterValidationError(
      `Invalid number format`,
      paramName,
      value
    );
  }
  return num;
}

/**
 * Parse a date query parameter
 */
function parseDate(value: any, paramName: string): Date | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    throw new FilterValidationError(
      `Invalid date format. Expected YYYY-MM-DD or ISO 8601 format`,
      paramName,
      value
    );
  }
  return date;
}

/**
 * Parse a comma-separated list
 */
function parseList(value: any): string[] | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  return String(value).split(',').map(s => s.trim()).filter(s => s.length > 0);
}

/**
 * Parse an enum value
 */
function parseEnum<T extends string>(
  value: any,
  validValues: readonly T[],
  paramName: string
): T | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const str = String(value);
  if (!validValues.includes(str as T)) {
    throw new FilterValidationError(
      `Invalid value. Expected one of: ${validValues.join(', ')}`,
      paramName,
      value
    );
  }
  return str as T;
}

// ============================================================================
// Filter Parsers
// ============================================================================

/**
 * Parse stock analysis filters from request query
 */
export function parseStockAnalysisFilters(req: Request): StockAnalysisFilters {
  const { query } = req;

  try {
    const filters: StockAnalysisFilters = {};

    // String filters
    if (query.symbol) {
      filters.symbol = String(query.symbol);
    }

    // Market filter
    if (query.market) {
      filters.market = parseEnum(query.market, ['US', 'VN'] as const, 'market');
    }

    // Status filter (comma-separated)
    if (query.status) {
      filters.status = parseList(query.status);
    }

    // Boolean filters
    if (query.favorite !== undefined) {
      filters.favorite = parseBoolean(query.favorite);
    }

    if (query.latest !== undefined) {
      filters.latest = parseBoolean(query.latest);
    }

    // Date range filters
    filters.createdFrom = parseDate(query.createdFrom, 'createdFrom');
    filters.createdTo = parseDate(query.createdTo, 'createdTo');
    filters.updatedFrom = parseDate(query.updatedFrom, 'updatedFrom');
    filters.updatedTo = parseDate(query.updatedTo, 'updatedTo');

    // Price range filters
    filters.minPrice = parseNumber(query.minPrice, 'minPrice');
    filters.maxPrice = parseNumber(query.maxPrice, 'maxPrice');

    // Validate date ranges
    if (filters.createdFrom && filters.createdTo && filters.createdFrom > filters.createdTo) {
      throw new FilterValidationError(
        'createdFrom must be before or equal to createdTo',
        'createdFrom',
        query.createdFrom
      );
    }

    if (filters.updatedFrom && filters.updatedTo && filters.updatedFrom > filters.updatedTo) {
      throw new FilterValidationError(
        'updatedFrom must be before or equal to updatedTo',
        'updatedFrom',
        query.updatedFrom
      );
    }

    // Validate price range
    if (filters.minPrice !== undefined && filters.maxPrice !== undefined && filters.minPrice > filters.maxPrice) {
      throw new FilterValidationError(
        'minPrice must be less than or equal to maxPrice',
        'minPrice',
        query.minPrice
      );
    }

    return filters;
  } catch (error) {
    if (error instanceof FilterValidationError) {
      throw error;
    }
    throw new Error(`Failed to parse filters: ${error}`);
  }
}

/**
 * Parse daily factor filters from request query
 */
export function parseDailyFactorFilters(req: Request): DailyFactorFilters {
  const { query } = req;

  try {
    const filters: DailyFactorFilters = {};

    // Date range filters (string format for daily data)
    if (query.dateFrom) {
      filters.dateFrom = String(query.dateFrom);
      // Validate date format
      if (!/^\d{4}-\d{2}-\d{2}/.test(filters.dateFrom)) {
        throw new FilterValidationError(
          'Invalid date format. Expected YYYY-MM-DD',
          'dateFrom',
          query.dateFrom
        );
      }
    }

    if (query.dateTo) {
      filters.dateTo = String(query.dateTo);
      if (!/^\d{4}-\d{2}-\d{2}/.test(filters.dateTo)) {
        throw new FilterValidationError(
          'Invalid date format. Expected YYYY-MM-DD',
          'dateTo',
          query.dateTo
        );
      }
    }

    // Price range filters
    filters.minClose = parseNumber(query.minClose, 'minClose');
    filters.maxClose = parseNumber(query.maxClose, 'maxClose');

    // Volume range filters
    filters.minVolume = parseNumber(query.minVolume, 'minVolume');
    filters.maxVolume = parseNumber(query.maxVolume, 'maxVolume');

    // Factor flag filters
    filters.volume_spike = parseBoolean(query.volume_spike);
    filters.break_ma50 = parseBoolean(query.break_ma50);
    filters.break_ma200 = parseBoolean(query.break_ma200);
    filters.rsi_over_60 = parseBoolean(query.rsi_over_60);
    filters.market_up = parseBoolean(query.market_up);
    filters.sector_up = parseBoolean(query.sector_up);
    filters.earnings_window = parseBoolean(query.earnings_window);
    filters.short_covering = parseBoolean(query.short_covering);
    filters.macro_tailwind = parseBoolean(query.macro_tailwind);
    filters.news_positive = parseBoolean(query.news_positive);

    // Validate ranges
    if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) {
      throw new FilterValidationError(
        'dateFrom must be before or equal to dateTo',
        'dateFrom',
        query.dateFrom
      );
    }

    if (filters.minClose !== undefined && filters.maxClose !== undefined && filters.minClose > filters.maxClose) {
      throw new FilterValidationError(
        'minClose must be less than or equal to maxClose',
        'minClose',
        query.minClose
      );
    }

    if (filters.minVolume !== undefined && filters.maxVolume !== undefined && filters.minVolume > filters.maxVolume) {
      throw new FilterValidationError(
        'minVolume must be less than or equal to maxVolume',
        'minVolume',
        query.minVolume
      );
    }

    return filters;
  } catch (error) {
    if (error instanceof FilterValidationError) {
      throw error;
    }
    throw new Error(`Failed to parse filters: ${error}`);
  }
}

/**
 * Parse daily score filters from request query
 */
export function parseDailyScoreFilters(req: Request): DailyScoreFilters {
  const { query } = req;

  try {
    const filters: DailyScoreFilters = {};

    // Date range filters
    if (query.dateFrom) {
      filters.dateFrom = String(query.dateFrom);
      if (!/^\d{4}-\d{2}-\d{2}/.test(filters.dateFrom)) {
        throw new FilterValidationError(
          'Invalid date format. Expected YYYY-MM-DD',
          'dateFrom',
          query.dateFrom
        );
      }
    }

    if (query.dateTo) {
      filters.dateTo = String(query.dateTo);
      if (!/^\d{4}-\d{2}-\d{2}/.test(filters.dateTo)) {
        throw new FilterValidationError(
          'Invalid date format. Expected YYYY-MM-DD',
          'dateTo',
          query.dateTo
        );
      }
    }

    // Score range filters
    filters.minScore = parseNumber(query.minScore, 'minScore');
    filters.maxScore = parseNumber(query.maxScore, 'maxScore');

    // Prediction filter
    filters.prediction = parseEnum(
      query.prediction,
      ['HIGH_PROBABILITY', 'MODERATE', 'LOW_PROBABILITY'] as const,
      'prediction'
    );

    // Above threshold filter
    filters.aboveThreshold = parseBoolean(query.aboveThreshold);

    // Validate ranges
    if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) {
      throw new FilterValidationError(
        'dateFrom must be before or equal to dateTo',
        'dateFrom',
        query.dateFrom
      );
    }

    if (filters.minScore !== undefined && filters.maxScore !== undefined && filters.minScore > filters.maxScore) {
      throw new FilterValidationError(
        'minScore must be less than or equal to maxScore',
        'minScore',
        query.minScore
      );
    }

    return filters;
  } catch (error) {
    if (error instanceof FilterValidationError) {
      throw error;
    }
    throw new Error(`Failed to parse filters: ${error}`);
  }
}

/**
 * Parse prediction filters from request query
 */
export function parsePredictionFilters(req: Request): PredictionFilters {
  const { query } = req;

  try {
    const filters: PredictionFilters = {};

    // Date range filters
    if (query.dateFrom) {
      filters.dateFrom = String(query.dateFrom);
      if (!/^\d{4}-\d{2}-\d{2}/.test(filters.dateFrom)) {
        throw new FilterValidationError(
          'Invalid date format. Expected YYYY-MM-DD',
          'dateFrom',
          query.dateFrom
        );
      }
    }

    if (query.dateTo) {
      filters.dateTo = String(query.dateTo);
      if (!/^\d{4}-\d{2}-\d{2}/.test(filters.dateTo)) {
        throw new FilterValidationError(
          'Invalid date format. Expected YYYY-MM-DD',
          'dateTo',
          query.dateTo
        );
      }
    }

    // Score range filters
    filters.minScore = parseNumber(query.minScore, 'minScore');
    filters.maxScore = parseNumber(query.maxScore, 'maxScore');

    // Prediction filter
    filters.prediction = parseEnum(
      query.prediction,
      ['HIGH_PROBABILITY', 'MODERATE', 'LOW_PROBABILITY'] as const,
      'prediction'
    );

    // Confidence range filters
    filters.minConfidence = parseNumber(query.minConfidence, 'minConfidence');
    filters.maxConfidence = parseNumber(query.maxConfidence, 'maxConfidence');

    // Validate ranges
    if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) {
      throw new FilterValidationError(
        'dateFrom must be before or equal to dateTo',
        'dateFrom',
        query.dateFrom
      );
    }

    if (filters.minScore !== undefined && filters.maxScore !== undefined && filters.minScore > filters.maxScore) {
      throw new FilterValidationError(
        'minScore must be less than or equal to maxScore',
        'minScore',
        query.minScore
      );
    }

    if (filters.minConfidence !== undefined && filters.maxConfidence !== undefined && filters.minConfidence > filters.maxConfidence) {
      throw new FilterValidationError(
        'minConfidence must be less than or equal to maxConfidence',
        'minConfidence',
        query.minConfidence
      );
    }

    // Validate confidence range (0-100, as confidence is stored as percentage)
    if (filters.minConfidence !== undefined && (filters.minConfidence < 0 || filters.minConfidence > 100)) {
      throw new FilterValidationError(
        'minConfidence must be between 0 and 100',
        'minConfidence',
        query.minConfidence
      );
    }

    if (filters.maxConfidence !== undefined && (filters.maxConfidence < 0 || filters.maxConfidence > 100)) {
      throw new FilterValidationError(
        'maxConfidence must be between 0 and 100',
        'maxConfidence',
        query.maxConfidence
      );
    }

    return filters;
  } catch (error) {
    if (error instanceof FilterValidationError) {
      throw error;
    }
    throw new Error(`Failed to parse filters: ${error}`);
  }
}

// ============================================================================
// Prisma Query Builders
// ============================================================================

/**
 * Build Prisma where clause for stock analysis filters
 */
export function buildStockAnalysisWhere(filters: StockAnalysisFilters): any {
  const where: any = {};

  // Symbol filter (contains - case-sensitive for SQLite compatibility)
  // Note: SQLite doesn't support mode: 'insensitive'
  // For case-insensitive search on SQLite, symbols should be stored in uppercase
  if (filters.symbol) {
    where.symbol = {
      contains: filters.symbol
    };
  }

  // Market filter (exact match)
  if (filters.market) {
    where.market = filters.market;
  }

  // Status filter (multiple values)
  if (filters.status && filters.status.length > 0) {
    where.status = {
      in: filters.status
    };
  }

  // Favorite filter
  if (filters.favorite !== undefined) {
    where.favorite = filters.favorite;
  }

  // Created date range
  if (filters.createdFrom || filters.createdTo) {
    where.createdAt = {};
    if (filters.createdFrom) {
      where.createdAt.gte = filters.createdFrom;
    }
    if (filters.createdTo) {
      where.createdAt.lte = filters.createdTo;
    }
  }

  // Updated date range
  if (filters.updatedFrom || filters.updatedTo) {
    where.updatedAt = {};
    if (filters.updatedFrom) {
      where.updatedAt.gte = filters.updatedFrom;
    }
    if (filters.updatedTo) {
      where.updatedAt.lte = filters.updatedTo;
    }
  }

  // Price range (only include records with price set)
  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    where.latestPrice = {
      not: null
    };
    if (filters.minPrice !== undefined) {
      where.latestPrice.gte = filters.minPrice;
    }
    if (filters.maxPrice !== undefined) {
      where.latestPrice.lte = filters.maxPrice;
    }
  }

  return where;
}

/**
 * Build Prisma where clause for daily factor filters
 */
export function buildDailyFactorWhere(filters: DailyFactorFilters): any {
  const where: any = {};

  // Date range
  if (filters.dateFrom || filters.dateTo) {
    where.date = {};
    if (filters.dateFrom) {
      where.date.gte = filters.dateFrom;
    }
    if (filters.dateTo) {
      where.date.lte = filters.dateTo;
    }
  }

  // Close price range
  if (filters.minClose !== undefined || filters.maxClose !== undefined) {
    where.close = {};
    if (filters.minClose !== undefined) {
      where.close.gte = filters.minClose;
    }
    if (filters.maxClose !== undefined) {
      where.close.lte = filters.maxClose;
    }
  }

  // Volume range (only non-null volumes)
  if (filters.minVolume !== undefined || filters.maxVolume !== undefined) {
    where.volume = {
      not: null
    };
    if (filters.minVolume !== undefined) {
      where.volume.gte = filters.minVolume;
    }
    if (filters.maxVolume !== undefined) {
      where.volume.lte = filters.maxVolume;
    }
  }

  // Factor flags
  if (filters.volume_spike !== undefined) {
    where.volumeSpike = filters.volume_spike;
  }
  if (filters.break_ma50 !== undefined) {
    where.breakMa50 = filters.break_ma50;
  }
  if (filters.break_ma200 !== undefined) {
    where.breakMa200 = filters.break_ma200;
  }
  if (filters.rsi_over_60 !== undefined) {
    where.rsiOver60 = filters.rsi_over_60;
  }
  if (filters.market_up !== undefined) {
    where.marketUp = filters.market_up;
  }
  if (filters.sector_up !== undefined) {
    where.sectorUp = filters.sector_up;
  }
  if (filters.earnings_window !== undefined) {
    where.earningsWindow = filters.earnings_window;
  }
  if (filters.short_covering !== undefined) {
    where.shortCovering = filters.short_covering;
  }
  if (filters.macro_tailwind !== undefined) {
    where.macroTailwind = filters.macro_tailwind;
  }
  if (filters.news_positive !== undefined) {
    where.newsPositive = filters.news_positive;
  }

  return where;
}

// ============================================================================
// In-Memory Filtering Functions
// ============================================================================

/**
 * Apply daily score filters to a list of scores (in-memory)
 */
export function applyDailyScoreFilters<T extends { date: string; score: number; prediction?: string; aboveThreshold?: boolean }>(
  scores: T[],
  filters: DailyScoreFilters
): T[] {
  return scores.filter(score => {
    // Date range filter
    if (filters.dateFrom && score.date < filters.dateFrom) {
      return false;
    }
    if (filters.dateTo && score.date > filters.dateTo) {
      return false;
    }

    // Score range filter
    if (filters.minScore !== undefined && score.score < filters.minScore) {
      return false;
    }
    if (filters.maxScore !== undefined && score.score > filters.maxScore) {
      return false;
    }

    // Prediction filter
    if (filters.prediction && score.prediction !== filters.prediction) {
      return false;
    }

    // Above threshold filter
    if (filters.aboveThreshold !== undefined && score.aboveThreshold !== filters.aboveThreshold) {
      return false;
    }

    return true;
  });
}

/**
 * Apply prediction filters to a list of predictions (in-memory)
 */
export function applyPredictionFilters<T extends { date: string; score: number; prediction?: string; confidence?: number }>(
  predictions: T[],
  filters: PredictionFilters
): T[] {
  return predictions.filter(pred => {
    // Date range filter
    if (filters.dateFrom && pred.date < filters.dateFrom) {
      return false;
    }
    if (filters.dateTo && pred.date > filters.dateTo) {
      return false;
    }

    // Score range filter
    if (filters.minScore !== undefined && pred.score < filters.minScore) {
      return false;
    }
    if (filters.maxScore !== undefined && pred.score > filters.maxScore) {
      return false;
    }

    // Prediction filter
    if (filters.prediction && pred.prediction !== filters.prediction) {
      return false;
    }

    // Confidence range filter
    if (pred.confidence !== undefined) {
      if (filters.minConfidence !== undefined && pred.confidence < filters.minConfidence) {
        return false;
      }
      if (filters.maxConfidence !== undefined && pred.confidence > filters.maxConfidence) {
        return false;
      }
    }

    return true;
  });
}
