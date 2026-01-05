import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface EarningsSurpriseAnalysis {
  symbol: string;
  totalEarnings: number;
  positiveSurprises: number;
  negativeSurprises: number;
  neutralSurprises: number;
  avgSurprisePercentage: number;
  surpriseConsistency: number; // How consistent surprises are (0-1)
  lastQuarterSurprise: number | null;
  trend: 'improving' | 'declining' | 'stable' | 'volatile';
  impactScore: number; // 0-100 based on surprise magnitude and consistency
}

export interface EarningsImpactMetrics {
  shortTermImpact: number; // 0-100
  mediumTermImpact: number; // 0-100
  longTermImpact: number; // 0-100
  volatilityImpact: number; // 0-100
  recommendation: 'buy' | 'sell' | 'hold' | 'watch';
  confidence: number; // 0-100
}

export class EarningsSurpriseAnalyzer {
  async analyzeSurprises(symbol: string): Promise<EarningsSurpriseAnalysis> {
    const earnings = await prisma.earningsData.findMany({
      where: {
        symbol: symbol.toUpperCase(),
        surprise: {
          not: null,
        },
      },
      orderBy: {
        earningsDate: 'desc',
      },
      take: 20,
    });

    if (earnings.length === 0) {
      return this.createEmptyAnalysis(symbol);
    }

    const surprises = earnings.map(e => e.surprise!);
    const positiveSurprises = surprises.filter(s => s > 0).length;
    const negativeSurprises = surprises.filter(s => s < 0).length;
    const neutralSurprises = surprises.filter(s => Math.abs(s) < 0.01).length;

    const avgSurprisePercentage = surprises.reduce((sum, s) => sum + s, 0) / surprises.length;
    const surpriseConsistency = this.calculateConsistency(surprises);
    const lastQuarterSurprise = surprises[0] || null;
    const trend = this.calculateTrend(surprises);
    const impactScore = this.calculateImpactScore(surprises, surpriseConsistency);

    return {
      symbol,
      totalEarnings: earnings.length,
      positiveSurprises,
      negativeSurprises,
      neutralSurprises,
      avgSurprisePercentage,
      surpriseConsistency,
      lastQuarterSurprise,
      trend,
      impactScore,
    };
  }

  async calculateImpactMetrics(symbol: string): Promise<EarningsImpactMetrics> {
    const surpriseAnalysis = await this.analyzeSurprises(symbol);
    
    const shortTermImpact = this.calculateShortTermImpact(surpriseAnalysis);
    const mediumTermImpact = this.calculateMediumTermImpact(surpriseAnalysis);
    const longTermImpact = this.calculateLongTermImpact(surpriseAnalysis);
    const volatilityImpact = this.calculateVolatilityImpact(surpriseAnalysis);
    
    const { recommendation, confidence } = this.generateRecommendation(
      surpriseAnalysis,
      shortTermImpact,
      mediumTermImpact,
      longTermImpact
    );

    return {
      shortTermImpact,
      mediumTermImpact,
      longTermImpact,
      volatilityImpact,
      recommendation,
      confidence,
    };
  }

  private createEmptyAnalysis(symbol: string): EarningsSurpriseAnalysis {
    return {
      symbol,
      totalEarnings: 0,
      positiveSurprises: 0,
      negativeSurprises: 0,
      neutralSurprises: 0,
      avgSurprisePercentage: 0,
      surpriseConsistency: 0,
      lastQuarterSurprise: null,
      trend: 'stable',
      impactScore: 0,
    };
  }

  private calculateConsistency(surprises: number[]): number {
    if (surprises.length < 2) return 0;

    // Calculate standard deviation
    const mean = surprises.reduce((sum, s) => sum + s, 0) / surprises.length;
    const variance = surprises.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / surprises.length;
    const stdDev = Math.sqrt(variance);

    // Consistency is inverse of coefficient of variation
    const cv = mean !== 0 ? Math.abs(stdDev / mean) : stdDev;
    return Math.max(0, 1 - cv);
  }

  private calculateTrend(surprises: number[]): 'improving' | 'declining' | 'stable' | 'volatile' {
    if (surprises.length < 3) return 'stable';

    const recent = surprises.slice(0, Math.min(4, surprises.length));
    const older = surprises.slice(Math.min(4, surprises.length), Math.min(8, surprises.length));

    if (older.length === 0) return 'stable';

    const recentAvg = recent.reduce((sum, s) => sum + s, 0) / recent.length;
    const olderAvg = older.reduce((sum, s) => sum + s, 0) / older.length;

    const improvement = recentAvg - olderAvg;
    const volatility = this.calculateConsistency(recent);

    if (volatility < 0.3) {
      return 'volatile';
    } else if (improvement > 0.02) {
      return 'improving';
    } else if (improvement < -0.02) {
      return 'declining';
    } else {
      return 'stable';
    }
  }

  private calculateImpactScore(surprises: number[], consistency: number): number {
    const avgMagnitude = surprises.reduce((sum, s) => sum + Math.abs(s), 0) / surprises.length;
    const maxSurprise = Math.max(...surprises.map(Math.abs));
    
    // Impact score considers both magnitude and consistency
    const magnitudeScore = Math.min(100, avgMagnitude * 1000); // Scale up for visibility
    const consistencyBonus = consistency * 20; // Up to 20 points for consistency
    const maxSurpriseBonus = Math.min(20, maxSurprise * 500); // Up to 20 points for big surprises

    return Math.min(100, magnitudeScore + consistencyBonus + maxSurpriseBonus);
  }

  private calculateShortTermImpact(analysis: EarningsSurpriseAnalysis): number {
    // Short-term impact is heavily influenced by the most recent surprise
    if (analysis.lastQuarterSurprise === null) return 0;

    const recentSurpriseImpact = Math.abs(analysis.lastQuarterSurprise) * 500;
    const consistencyFactor = analysis.surpriseConsistency * 20;
    
    return Math.min(100, recentSurpriseImpact + consistencyFactor);
  }

  private calculateMediumTermImpact(analysis: EarningsSurpriseAnalysis): number {
    // Medium-term considers trend and consistency
    const trendScore = analysis.trend === 'improving' ? 60 : 
                     analysis.trend === 'declining' ? 30 : 
                     analysis.trend === 'volatile' ? 20 : 40;
    
    const consistencyBonus = analysis.surpriseConsistency * 30;
    const avgSurpriseBonus = Math.min(10, Math.abs(analysis.avgSurprisePercentage) * 200);

    return Math.min(100, trendScore + consistencyBonus + avgSurpriseBonus);
  }

  private calculateLongTermImpact(analysis: EarningsSurpriseAnalysis): number {
    // Long-term focuses on overall pattern and consistency
    const patternScore = analysis.positiveSurprises > analysis.negativeSurprises ? 50 : 30;
    const consistencyBonus = analysis.surpriseConsistency * 40;
    const totalDataBonus = Math.min(10, analysis.totalEarnings * 2); // More data = more confidence

    return Math.min(100, patternScore + consistencyBonus + totalDataBonus);
  }

  private calculateVolatilityImpact(analysis: EarningsSurpriseAnalysis): number {
    // Higher volatility = higher impact (but potentially negative)
    const volatilityScore = (1 - analysis.surpriseConsistency) * 100;
    const extremeSurprises = Math.abs(analysis.avgSurprisePercentage) * 1000;
    
    return Math.min(100, volatilityScore + extremeSurprises);
  }

  private generateRecommendation(
    analysis: EarningsSurpriseAnalysis,
    shortTerm: number,
    mediumTerm: number,
    longTerm: number
  ): { recommendation: 'buy' | 'sell' | 'hold' | 'watch', confidence: number } {
    const overallScore = (shortTerm * 0.3 + mediumTerm * 0.4 + longTerm * 0.3);
    const trend = analysis.trend;
    const lastSurprise = analysis.lastQuarterSurprise;

    let recommendation: 'buy' | 'sell' | 'hold' | 'watch';
    let confidence = overallScore;

    if (analysis.totalEarnings < 3) {
      recommendation = 'watch';
      confidence = Math.min(confidence, 30); // Low confidence with little data
    } else if (trend === 'improving' && lastSurprise && lastSurprise > 0.01) {
      recommendation = 'buy';
    } else if (trend === 'declining' && lastSurprise && lastSurprise < -0.01) {
      recommendation = 'sell';
    } else if (trend === 'volatile') {
      recommendation = 'watch';
      confidence = Math.min(confidence, 50); // Lower confidence for volatile stocks
    } else {
      recommendation = 'hold';
    }

    return { recommendation, confidence };
  }

  async batchAnalyze(symbols: string[]): Promise<Map<string, EarningsSurpriseAnalysis>> {
    const results = new Map<string, EarningsSurpriseAnalysis>();
    
    for (const symbol of symbols) {
      try {
        const analysis = await this.analyzeSurprises(symbol);
        results.set(symbol, analysis);
      } catch (error) {
        console.error(`Failed to analyze ${symbol}:`, error);
        results.set(symbol, this.createEmptyAnalysis(symbol));
      }
    }
    
    return results;
  }
}

export const earningsSurpriseAnalyzer = new EarningsSurpriseAnalyzer();
