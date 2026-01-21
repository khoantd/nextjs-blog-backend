/**
 * Unit tests for filter utilities
 */

import { Request } from 'express';
import {
  parseStockAnalysisFilters,
  parseDailyFactorFilters,
  parseDailyScoreFilters,
  parsePredictionFilters,
  buildStockAnalysisWhere,
  buildDailyFactorWhere,
  applyDailyScoreFilters,
  applyPredictionFilters,
  FilterValidationError
} from '../filter-utils';

// Helper to create mock request
function createMockRequest(query: Record<string, any>): Request {
  return {
    query,
  } as Request;
}

describe('parseStockAnalysisFilters', () => {
  it('should parse symbol filter', () => {
    const req = createMockRequest({ symbol: 'AAPL' });
    const filters = parseStockAnalysisFilters(req);
    expect(filters.symbol).toBe('AAPL');
  });

  it('should parse market filter', () => {
    const req = createMockRequest({ market: 'US' });
    const filters = parseStockAnalysisFilters(req);
    expect(filters.market).toBe('US');
  });

  it('should parse status filter (comma-separated)', () => {
    const req = createMockRequest({ status: 'completed,draft,processing' });
    const filters = parseStockAnalysisFilters(req);
    expect(filters.status).toEqual(['completed', 'draft', 'processing']);
  });

  it('should parse favorite filter', () => {
    const req = createMockRequest({ favorite: 'true' });
    const filters = parseStockAnalysisFilters(req);
    expect(filters.favorite).toBe(true);
  });

  it('should parse date range filters', () => {
    const req = createMockRequest({
      createdFrom: '2024-01-01',
      createdTo: '2024-12-31'
    });
    const filters = parseStockAnalysisFilters(req);
    expect(filters.createdFrom).toBeInstanceOf(Date);
    expect(filters.createdTo).toBeInstanceOf(Date);
  });

  it('should parse price range filters', () => {
    const req = createMockRequest({ minPrice: '100', maxPrice: '200' });
    const filters = parseStockAnalysisFilters(req);
    expect(filters.minPrice).toBe(100);
    expect(filters.maxPrice).toBe(200);
  });

  it('should throw error for invalid market value', () => {
    const req = createMockRequest({ market: 'INVALID' });
    expect(() => parseStockAnalysisFilters(req)).toThrow(FilterValidationError);
  });

  it('should throw error for invalid date format', () => {
    const req = createMockRequest({ createdFrom: 'invalid-date' });
    expect(() => parseStockAnalysisFilters(req)).toThrow(FilterValidationError);
  });

  it('should throw error for invalid date range', () => {
    const req = createMockRequest({
      createdFrom: '2024-12-31',
      createdTo: '2024-01-01'
    });
    expect(() => parseStockAnalysisFilters(req)).toThrow(FilterValidationError);
  });

  it('should throw error for invalid price range', () => {
    const req = createMockRequest({ minPrice: '200', maxPrice: '100' });
    expect(() => parseStockAnalysisFilters(req)).toThrow(FilterValidationError);
  });

  it('should handle empty query', () => {
    const req = createMockRequest({});
    const filters = parseStockAnalysisFilters(req);
    expect(Object.keys(filters).length).toBe(0);
  });
});

describe('parseDailyFactorFilters', () => {
  it('should parse date range filters', () => {
    const req = createMockRequest({
      dateFrom: '2024-01-01',
      dateTo: '2024-12-31'
    });
    const filters = parseDailyFactorFilters(req);
    expect(filters.dateFrom).toBe('2024-01-01');
    expect(filters.dateTo).toBe('2024-12-31');
  });

  it('should parse price range filters', () => {
    const req = createMockRequest({ minClose: '100', maxClose: '200' });
    const filters = parseDailyFactorFilters(req);
    expect(filters.minClose).toBe(100);
    expect(filters.maxClose).toBe(200);
  });

  it('should parse volume range filters', () => {
    const req = createMockRequest({ minVolume: '1000000', maxVolume: '5000000' });
    const filters = parseDailyFactorFilters(req);
    expect(filters.minVolume).toBe(1000000);
    expect(filters.maxVolume).toBe(5000000);
  });

  it('should parse all factor flags', () => {
    const req = createMockRequest({
      volume_spike: 'true',
      break_ma50: 'true',
      break_ma200: 'false',
      rsi_over_60: 'true',
      market_up: 'true',
      sector_up: 'false',
      earnings_window: 'true',
      short_covering: 'false',
      macro_tailwind: 'true',
      news_positive: 'true'
    });
    const filters = parseDailyFactorFilters(req);
    expect(filters.volume_spike).toBe(true);
    expect(filters.break_ma50).toBe(true);
    expect(filters.break_ma200).toBe(false);
    expect(filters.rsi_over_60).toBe(true);
    expect(filters.market_up).toBe(true);
    expect(filters.sector_up).toBe(false);
    expect(filters.earnings_window).toBe(true);
    expect(filters.short_covering).toBe(false);
    expect(filters.macro_tailwind).toBe(true);
    expect(filters.news_positive).toBe(true);
  });

  it('should throw error for invalid date format', () => {
    const req = createMockRequest({ dateFrom: '01-01-2024' });
    expect(() => parseDailyFactorFilters(req)).toThrow(FilterValidationError);
  });

  it('should throw error for invalid boolean', () => {
    const req = createMockRequest({ volume_spike: 'yes' });
    expect(() => parseDailyFactorFilters(req)).toThrow(FilterValidationError);
  });
});

describe('parseDailyScoreFilters', () => {
  it('should parse date range filters', () => {
    const req = createMockRequest({
      dateFrom: '2024-01-01',
      dateTo: '2024-12-31'
    });
    const filters = parseDailyScoreFilters(req);
    expect(filters.dateFrom).toBe('2024-01-01');
    expect(filters.dateTo).toBe('2024-12-31');
  });

  it('should parse score range filters', () => {
    const req = createMockRequest({ minScore: '50', maxScore: '80' });
    const filters = parseDailyScoreFilters(req);
    expect(filters.minScore).toBe(50);
    expect(filters.maxScore).toBe(80);
  });

  it('should parse prediction filter', () => {
    const req = createMockRequest({ prediction: 'HIGH_PROBABILITY' });
    const filters = parseDailyScoreFilters(req);
    expect(filters.prediction).toBe('HIGH_PROBABILITY');
  });

  it('should parse aboveThreshold filter', () => {
    const req = createMockRequest({ aboveThreshold: 'true' });
    const filters = parseDailyScoreFilters(req);
    expect(filters.aboveThreshold).toBe(true);
  });

  it('should throw error for invalid prediction value', () => {
    const req = createMockRequest({ prediction: 'INVALID' });
    expect(() => parseDailyScoreFilters(req)).toThrow(FilterValidationError);
  });

  it('should throw error for invalid score range', () => {
    const req = createMockRequest({ minScore: '80', maxScore: '50' });
    expect(() => parseDailyScoreFilters(req)).toThrow(FilterValidationError);
  });
});

describe('parsePredictionFilters', () => {
  it('should parse all filters', () => {
    const req = createMockRequest({
      dateFrom: '2024-01-01',
      dateTo: '2024-12-31',
      minScore: '50',
      maxScore: '80',
      prediction: 'HIGH_PROBABILITY',
      minConfidence: '0.7',
      maxConfidence: '0.9'
    });
    const filters = parsePredictionFilters(req);
    expect(filters.dateFrom).toBe('2024-01-01');
    expect(filters.dateTo).toBe('2024-12-31');
    expect(filters.minScore).toBe(50);
    expect(filters.maxScore).toBe(80);
    expect(filters.prediction).toBe('HIGH_PROBABILITY');
    expect(filters.minConfidence).toBe(0.7);
    expect(filters.maxConfidence).toBe(0.9);
  });

  it('should throw error for invalid confidence range', () => {
    const req = createMockRequest({ minConfidence: '1.5' });
    expect(() => parsePredictionFilters(req)).toThrow(FilterValidationError);
  });

  it('should throw error for confidence > 1', () => {
    const req = createMockRequest({ maxConfidence: '1.1' });
    expect(() => parsePredictionFilters(req)).toThrow(FilterValidationError);
  });

  it('should throw error for confidence < 0', () => {
    const req = createMockRequest({ minConfidence: '-0.1' });
    expect(() => parsePredictionFilters(req)).toThrow(FilterValidationError);
  });
});

describe('buildStockAnalysisWhere', () => {
  it('should build empty where clause', () => {
    const where = buildStockAnalysisWhere({});
    expect(Object.keys(where).length).toBe(0);
  });

  it('should build symbol filter', () => {
    const where = buildStockAnalysisWhere({ symbol: 'AAPL' });
    expect(where.symbol).toEqual({
      contains: 'AAPL'
      // Note: mode: 'insensitive' removed for SQLite compatibility
    });
  });

  it('should build market filter', () => {
    const where = buildStockAnalysisWhere({ market: 'US' });
    expect(where.market).toBe('US');
  });

  it('should build status filter', () => {
    const where = buildStockAnalysisWhere({ status: ['completed', 'draft'] });
    expect(where.status).toEqual({ in: ['completed', 'draft'] });
  });

  it('should build date range filter', () => {
    const from = new Date('2024-01-01');
    const to = new Date('2024-12-31');
    const where = buildStockAnalysisWhere({
      createdFrom: from,
      createdTo: to
    });
    expect(where.createdAt).toEqual({
      gte: from,
      lte: to
    });
  });

  it('should build price range filter with not null', () => {
    const where = buildStockAnalysisWhere({ minPrice: 100, maxPrice: 200 });
    expect(where.latestPrice).toEqual({
      not: null,
      gte: 100,
      lte: 200
    });
  });
});

describe('buildDailyFactorWhere', () => {
  it('should build date range filter', () => {
    const where = buildDailyFactorWhere({
      dateFrom: '2024-01-01',
      dateTo: '2024-12-31'
    });
    expect(where.date).toEqual({
      gte: '2024-01-01',
      lte: '2024-12-31'
    });
  });

  it('should build all factor flags', () => {
    const where = buildDailyFactorWhere({
      volume_spike: true,
      break_ma50: true,
      rsi_over_60: false
    });
    expect(where.volumeSpike).toBe(true);
    expect(where.breakMa50).toBe(true);
    expect(where.rsiOver60).toBe(false);
  });

  it('should build volume range with not null', () => {
    const where = buildDailyFactorWhere({
      minVolume: 1000000,
      maxVolume: 5000000
    });
    expect(where.volume).toEqual({
      not: null,
      gte: 1000000,
      lte: 5000000
    });
  });
});

describe('applyDailyScoreFilters', () => {
  const mockScores = [
    { date: '2024-01-15', score: 75, prediction: 'HIGH_PROBABILITY', aboveThreshold: true },
    { date: '2024-02-10', score: 55, prediction: 'MODERATE', aboveThreshold: false },
    { date: '2024-03-20', score: 85, prediction: 'HIGH_PROBABILITY', aboveThreshold: true },
    { date: '2024-04-05', score: 45, prediction: 'LOW_PROBABILITY', aboveThreshold: false },
  ];

  it('should filter by date range', () => {
    const filtered = applyDailyScoreFilters(mockScores, {
      dateFrom: '2024-02-01',
      dateTo: '2024-03-31'
    });
    expect(filtered).toHaveLength(2);
    expect(filtered[0].date).toBe('2024-02-10');
    expect(filtered[1].date).toBe('2024-03-20');
  });

  it('should filter by score range', () => {
    const filtered = applyDailyScoreFilters(mockScores, {
      minScore: 60,
      maxScore: 80
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].score).toBe(75);
  });

  it('should filter by prediction', () => {
    const filtered = applyDailyScoreFilters(mockScores, {
      prediction: 'HIGH_PROBABILITY'
    });
    expect(filtered).toHaveLength(2);
  });

  it('should filter by aboveThreshold', () => {
    const filtered = applyDailyScoreFilters(mockScores, {
      aboveThreshold: true
    });
    expect(filtered).toHaveLength(2);
  });

  it('should apply multiple filters', () => {
    const filtered = applyDailyScoreFilters(mockScores, {
      minScore: 70,
      prediction: 'HIGH_PROBABILITY',
      aboveThreshold: true
    });
    expect(filtered).toHaveLength(2);
  });

  it('should return all when no filters', () => {
    const filtered = applyDailyScoreFilters(mockScores, {});
    expect(filtered).toHaveLength(4);
  });
});

describe('applyPredictionFilters', () => {
  const mockPredictions = [
    { date: '2024-01-15', score: 75, prediction: 'HIGH_PROBABILITY', confidence: 0.85 },
    { date: '2024-02-10', score: 55, prediction: 'MODERATE', confidence: 0.65 },
    { date: '2024-03-20', score: 85, prediction: 'HIGH_PROBABILITY', confidence: 0.92 },
    { date: '2024-04-05', score: 45, prediction: 'LOW_PROBABILITY', confidence: 0.45 },
  ];

  it('should filter by confidence range', () => {
    const filtered = applyPredictionFilters(mockPredictions, {
      minConfidence: 0.7,
      maxConfidence: 0.9
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].confidence).toBe(0.85);
  });

  it('should filter by score and confidence', () => {
    const filtered = applyPredictionFilters(mockPredictions, {
      minScore: 70,
      minConfidence: 0.8
    });
    expect(filtered).toHaveLength(2);
  });

  it('should apply all filters', () => {
    const filtered = applyPredictionFilters(mockPredictions, {
      dateFrom: '2024-01-01',
      dateTo: '2024-03-31',
      minScore: 70,
      prediction: 'HIGH_PROBABILITY',
      minConfidence: 0.8
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].date).toBe('2024-01-15');
  });
});
