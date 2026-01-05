/**
 * Daily Stock Scoring System - Example Usage
 * 
 * This example demonstrates how to use the converted Python scoring system
 * to predict strong stock price movements based on weighted factor analysis.
 */

import {
  calculateDailyScore,
  calculateDailyScores,
  getDailyScoreSummary,
  predictStrongMovement,
  DEFAULT_DAILY_SCORE_CONFIG,
  type FactorAnalysis,
  type DailyScoreConfig,
  type DailyScoreResult,
  type StockFactor
} from '../stock-factors';

// Example factor analysis data (similar to what would be generated from real stock data)
const exampleFactorAnalysis: FactorAnalysis[] = [
  {
    date: '2024-01-15',
    factors: {
      volume_spike: true,
      market_up: true,
      earnings_window: false,
      break_ma50: true,
      rsi_over_60: false,
      sector_up: false,
      break_ma200: false,
      news_positive: false,
      short_covering: false,
      macro_tailwind: false
    },
    factorCount: 3,
    factorList: ['volume_spike', 'market_up', 'break_ma50'] as StockFactor[]
  },
  {
    date: '2024-01-16',
    factors: {
      volume_spike: true,
      market_up: true,
      earnings_window: true,
      break_ma50: true,
      rsi_over_60: true,
      sector_up: false,
      break_ma200: false,
      news_positive: false,
      short_covering: false,
      macro_tailwind: false
    },
    factorCount: 5,
    factorList: ['volume_spike', 'market_up', 'earnings_window', 'break_ma50', 'rsi_over_60'] as StockFactor[]
  },
  {
    date: '2024-01-17',
    factors: {
      volume_spike: false,
      market_up: false,
      earnings_window: false,
      break_ma50: false,
      rsi_over_60: false,
      sector_up: false,
      break_ma200: false,
      news_positive: false,
      short_covering: false,
      macro_tailwind: false
    },
    factorCount: 0,
    factorList: [] as StockFactor[]
  }
];

// Example 1: Calculate daily scores for multiple days
function exampleDailyScoring() {
  console.log('=== Daily Scoring Example ===');
  
  const scores = calculateDailyScores(exampleFactorAnalysis);
  
  scores.forEach((score: DailyScoreResult) => {
    console.log(`\nDate: ${score.date}`);
    console.log(`Score: ${(score.score * 100).toFixed(1)}%`);
    console.log(`Factors: ${score.factors.join(', ')}`);
    console.log(`Above Threshold: ${score.aboveThreshold ? 'YES ⭐' : 'NO'}`);
    
    console.log('Factor Breakdown:');
    Object.entries(score.breakdown).forEach(([factor, data]: [string, any]) => {
      if (data.active) {
        console.log(`  - ${factor}: ${(data.contribution * 100).toFixed(1)}% (weight: ${(data.weight * 100).toFixed(1)}%)`);
      }
    });
  });
  
  return scores;
}

// Example 2: Get scoring summary statistics
function exampleScoringSummary() {
  console.log('\n=== Scoring Summary Example ===');
  
  const scores = calculateDailyScores(exampleFactorAnalysis);
  const summary = getDailyScoreSummary(scores);
  
  console.log(`Total Days: ${summary.totalDays}`);
  console.log(`High Score Days: ${summary.highScoreDays}`);
  console.log(`Success Rate: ${summary.highScorePercentage.toFixed(1)}%`);
  console.log(`Average Score: ${summary.averageScore.toFixed(3)}`);
  console.log(`Max Score: ${summary.maxScore.toFixed(3)}`);
  console.log(`Min Score: ${summary.minScore.toFixed(3)}`);
  
  console.log('\nFactor Frequency in High-Score Days:');
  Object.entries(summary.factorFrequency).forEach(([factor, frequency]: [string, any]) => {
    if (frequency > 0) {
      console.log(`  - ${factor}: ${frequency.toFixed(1)}%`);
    }
  });
  
  return summary;
}

// Example 3: Predict strong movement for current conditions
function examplePrediction() {
  console.log('\n=== Prediction Example ===');
  
  // Current market conditions (today's factors)
  const currentFactors = {
    volume_spike: true,
    market_up: true,
    earnings_window: true,
    break_ma50: true,
    rsi_over_60: false,
    sector_up: false,
    break_ma200: false,
    news_positive: false,
    short_covering: false,
    macro_tailwind: false
  };
  
  const prediction = predictStrongMovement(currentFactors);
  
  console.log(`Score: ${(prediction.score * 100).toFixed(1)}%`);
  console.log(`Prediction: ${prediction.prediction}`);
  console.log(`Confidence: ${prediction.confidence.toFixed(0)}%`);
  console.log(`Active Factors: ${prediction.activeFactors.join(', ')}`);
  
  console.log('\nRecommendations:');
  prediction.recommendations.forEach((rec: string, index: number) => {
    console.log(`  ${index + 1}. ${rec}`);
  });
  
  return prediction;
}

// Example 4: Custom scoring configuration
function exampleCustomScoring() {
  console.log('\n=== Custom Scoring Configuration Example ===');
  
  // Custom configuration with different weights and threshold
  const customConfig: DailyScoreConfig = {
    weights: {
      volume_spike: 0.30,  // Increased weight for volume
      market_up: 0.25,    // Increased weight for market
      earnings_window: 0.20, // Increased weight for earnings
      break_ma50: 0.10,    // Reduced weight
      rsi_over_60: 0.05,   // Reduced weight
      sector_up: 0.05,
      break_ma200: 0.03,
      news_positive: 0.01,
      short_covering: 0.01,
      macro_tailwind: 0.00
    },
    threshold: 0.50,  // Higher threshold for more selective predictions
    minFactorsRequired: 3
  };
  
  const scores = calculateDailyScores(exampleFactorAnalysis, customConfig);
  const summary = getDailyScoreSummary(scores);
  
  console.log('Custom Configuration Results:');
  console.log(`Threshold: ${(customConfig.threshold * 100).toFixed(0)}%`);
  console.log(`Min Factors Required: ${customConfig.minFactorsRequired}`);
  console.log(`High Score Days: ${summary.highScoreDays}/${summary.totalDays}`);
  console.log(`Success Rate: ${summary.highScorePercentage.toFixed(1)}%`);
  
  return { customConfig, scores, summary };
}

// Example 5: Real-world simulation
function exampleRealWorldSimulation() {
  console.log('\n=== Real-World Simulation Example ===');
  
  // Simulate a month of trading days with various factor combinations
  const simulatedData: FactorAnalysis[] = [];
  const startDate = new Date('2024-01-01');
  
  for (let i = 0; i < 30; i++) {
    const currentDate = new Date(startDate);
    currentDate.setDate(startDate.getDate() + i);
    
    // Simulate random factor activation (in reality, this would be based on actual data)
    const factors: Record<string, boolean> = {};
    const factorKeys = ['volume_spike', 'market_up', 'earnings_window', 'break_ma50', 'rsi_over_60'];
    
    factorKeys.forEach(key => {
      factors[key] = Math.random() > 0.6; // 40% chance of each factor being active
    });
    
    const factorList = Object.entries(factors)
      .filter(([_, active]) => active)
      .map(([factor]) => factor as StockFactor);
    
    simulatedData.push({
      date: currentDate.toISOString().split('T')[0],
      factors,
      factorCount: factorList.length,
      factorList
    });
  }
  
  const scores = calculateDailyScores(simulatedData);
  const summary = getDailyScoreSummary(scores);
  
  console.log(`Simulated 30 trading days:`);
  console.log(`High probability days: ${summary.highScoreDays}`);
  console.log(`Average score: ${summary.averageScore.toFixed(3)}`);
  console.log(`Score range: ${summary.minScore.toFixed(3)} - ${summary.maxScore.toFixed(3)}`);
  
  // Show top 5 scoring days
  const topScores = scores
    .sort((a: DailyScoreResult, b: DailyScoreResult) => b.score - a.score)
    .slice(0, 5);
  
  console.log('\nTop 5 scoring days:');
  topScores.forEach((score: DailyScoreResult, index: number) => {
    console.log(`${index + 1}. ${score.date}: ${(score.score * 100).toFixed(1)}% (${score.factorCount} factors)`);
  });
  
  return { simulatedData, scores, summary };
}

// Run all examples
export function runDailyScoringExamples() {
  console.log('🚀 Daily Stock Scoring System Examples\n');
  
  try {
    exampleDailyScoring();
    exampleScoringSummary();
    examplePrediction();
    exampleCustomScoring();
    exampleRealWorldSimulation();
    
    console.log('\n✅ All examples completed successfully!');
    
  } catch (error) {
    console.error('❌ Error running examples:', error);
  }
}

// Export individual examples for selective testing
export {
  exampleDailyScoring,
  exampleScoringSummary,
  examplePrediction,
  exampleCustomScoring,
  exampleRealWorldSimulation
};

// If this file is run directly, execute all examples
if (require.main === module) {
  runDailyScoringExamples();
}
