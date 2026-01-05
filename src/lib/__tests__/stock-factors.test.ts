/**
 * Tests for stock factor analysis
 */

import {
  calculateMA,
  calculateRSI,
  analyzeFactors,
  getFactorSummary,
  correlateFactorsWithPriceMovement,
  STOCK_FACTORS,
  FACTOR_DESCRIPTIONS,
  type ExtendedStockData
} from '../stock-factors';

describe('Stock Factor Analysis', () => {
  describe('calculateMA', () => {
    it('should calculate moving average correctly', () => {
      const prices = [10, 12, 14, 16, 18, 20];
      const ma3 = calculateMA(prices, 3);

      expect(ma3[0]).toBeNaN();
      expect(ma3[1]).toBeNaN();
      expect(ma3[2]).toBe(12); // (10 + 12 + 14) / 3
      expect(ma3[3]).toBe(14); // (12 + 14 + 16) / 3
      expect(ma3[4]).toBe(16); // (14 + 16 + 18) / 3
      expect(ma3[5]).toBe(18); // (16 + 18 + 20) / 3
    });

    it('should handle empty array', () => {
      const result = calculateMA([], 5);
      expect(result).toEqual([]);
    });

    it('should handle period larger than data', () => {
      const prices = [10, 12, 14];
      const ma5 = calculateMA(prices, 5);

      expect(ma5.every(v => isNaN(v))).toBe(true);
    });
  });

  describe('calculateRSI', () => {
    it('should calculate RSI for trending up market', () => {
      // Consistently increasing prices should give high RSI
      const prices = [100, 102, 104, 106, 108, 110, 112, 114, 116, 118, 120, 122, 124, 126, 128];
      const rsi = calculateRSI(prices, 14);

      // Later values should show high RSI (trending up)
      const lastRSI = rsi[rsi.length - 1];
      expect(lastRSI).toBeGreaterThan(50);
    });

    it('should return NaN for insufficient data', () => {
      const prices = [100, 102, 104];
      const rsi = calculateRSI(prices, 14);

      expect(rsi.slice(0, 14).every(v => isNaN(v))).toBe(true);
    });
  });

  describe('analyzeFactors', () => {
    const sampleData: ExtendedStockData[] = [
      { Date: '2024-01-01', Close: 100, Volume: 1000000 },
      { Date: '2024-01-02', Close: 105, Volume: 1500000, pct_change: 5.0 },
      { Date: '2024-01-03', Close: 108, Volume: 2000000, pct_change: 2.86 },
    ];

    it('should detect market_up factor', () => {
      const analyses = analyzeFactors(sampleData, {
        nasdaqData: [
          { date: '2024-01-02', pct_change: 2.0 }
        ]
      });

      expect(analyses[1].factors.market_up).toBe(true);
      expect(analyses[1].factorList).toContain('market_up');
    });

    it('should detect volume_spike factor', () => {
      const analyses = analyzeFactors(sampleData);

      // Day 3 has volume 2x the average of days 1-2
      expect(analyses[2].factors.volume_spike).toBe(true);
    });

    it('should detect earnings_window factor', () => {
      const analyses = analyzeFactors(sampleData, {
        earningsDates: ['2024-01-03']
      });

      // Days within ±3 days of earnings
      expect(analyses[2].factors.earnings_window).toBe(true);
    });

    it('should detect news_positive factor', () => {
      const analyses = analyzeFactors(sampleData, {
        newsData: [
          { date: '2024-01-02', sentiment: 'positive' }
        ]
      });

      expect(analyses[1].factors.news_positive).toBe(true);
    });

    it('should count factors correctly', () => {
      const analyses = analyzeFactors(sampleData, {
        nasdaqData: [{ date: '2024-01-02', pct_change: 2.0 }],
        newsData: [{ date: '2024-01-02', sentiment: 'positive' }]
      });

      expect(analyses[1].factorCount).toBeGreaterThanOrEqual(2);
    });

    it('should handle empty options', () => {
      const analyses = analyzeFactors(sampleData);

      expect(analyses).toHaveLength(3);
      expect(analyses[0].factorCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getFactorSummary', () => {
    it('should calculate summary statistics correctly', () => {
      const sampleData: ExtendedStockData[] = [
        { Date: '2024-01-01', Close: 100, Volume: 1000000 },
        { Date: '2024-01-02', Close: 105, Volume: 1500000 },
        { Date: '2024-01-03', Close: 108, Volume: 2000000 },
      ];

      const analyses = analyzeFactors(sampleData, {
        nasdaqData: [
          { date: '2024-01-02', pct_change: 2.0 },
          { date: '2024-01-03', pct_change: 1.8 }
        ]
      });

      const summary = getFactorSummary(analyses);

      expect(summary.totalDays).toBe(3);
      expect(summary.averageFactorsPerDay).toBeGreaterThanOrEqual(0);
      expect(summary.factorCounts).toBeDefined();
      expect(summary.factorFrequency).toBeDefined();
    });

    it('should handle empty analyses', () => {
      const summary = getFactorSummary([]);

      expect(summary.totalDays).toBe(0);
      expect(summary.averageFactorsPerDay).toBe(0);
    });
  });

  describe('correlateFactorsWithPriceMovement', () => {
    it('should correlate factors with returns', () => {
      const sampleData: ExtendedStockData[] = [
        { Date: '2024-01-01', Close: 100, Volume: 1000000, pct_change: 0 },
        { Date: '2024-01-02', Close: 105, Volume: 1500000, pct_change: 5.0 },
        { Date: '2024-01-03', Close: 108, Volume: 2000000, pct_change: 2.86 },
      ];

      const analyses = analyzeFactors(sampleData, {
        nasdaqData: [
          { date: '2024-01-02', pct_change: 2.0 }
        ]
      });

      const correlation = correlateFactorsWithPriceMovement(analyses, sampleData);

      expect(correlation).toBeDefined();
      expect(correlation.market_up).toBeDefined();
      expect(correlation.market_up.occurrences).toBeGreaterThanOrEqual(0);
    });

    it('should calculate average returns correctly', () => {
      const sampleData: ExtendedStockData[] = [
        { Date: '2024-01-01', Close: 100, pct_change: 0 },
        { Date: '2024-01-02', Close: 110, pct_change: 10.0 },
        { Date: '2024-01-03', Close: 115, pct_change: 4.55 },
      ];

      const analyses = analyzeFactors(sampleData, {
        newsData: [
          { date: '2024-01-02', sentiment: 'positive' },
          { date: '2024-01-03', sentiment: 'positive' }
        ]
      });

      const correlation = correlateFactorsWithPriceMovement(analyses, sampleData);

      if (correlation.news_positive.occurrences > 0) {
        expect(correlation.news_positive.avgReturn).toBeGreaterThan(0);
      }
    });
  });

  describe('FACTOR_DESCRIPTIONS', () => {
    it('should have descriptions for all factors', () => {
      STOCK_FACTORS.forEach(factor => {
        expect(FACTOR_DESCRIPTIONS[factor]).toBeDefined();
        expect(FACTOR_DESCRIPTIONS[factor].name).toBeTruthy();
        expect(FACTOR_DESCRIPTIONS[factor].description).toBeTruthy();
        expect(FACTOR_DESCRIPTIONS[factor].category).toBeTruthy();
      });
    });

    it('should have valid categories', () => {
      const validCategories = ['technical', 'fundamental', 'market', 'sentiment'];

      STOCK_FACTORS.forEach(factor => {
        expect(validCategories).toContain(FACTOR_DESCRIPTIONS[factor].category);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing volume data', () => {
      const data: ExtendedStockData[] = [
        { Date: '2024-01-01', Close: 100 },
        { Date: '2024-01-02', Close: 105 },
      ];

      const analyses = analyzeFactors(data);

      expect(analyses).toHaveLength(2);
      expect(analyses[0].factors.volume_spike).toBeFalsy();
    });

    it('should handle single data point', () => {
      const data: ExtendedStockData[] = [
        { Date: '2024-01-01', Close: 100 }
      ];

      const analyses = analyzeFactors(data);

      expect(analyses).toHaveLength(1);
      expect(analyses[0].factorCount).toBe(0);
    });

    it('should handle dates in different formats', () => {
      const data: ExtendedStockData[] = [
        { Date: '2024-01-01', Close: 100 },
        { Date: '2024/01/02', Close: 105 },
        { Date: 'Jan 3, 2024', Close: 108 },
      ];

      expect(() => analyzeFactors(data)).not.toThrow();
    });
  });
});
