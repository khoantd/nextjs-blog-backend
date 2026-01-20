import { completion } from "litellm";

export interface PriceRecommendation {
  buyPrice: number;
  sellPrice: number;
  confidence: 'low' | 'medium' | 'high';
  reasoning: string[];
  riskFactors: string[];
  targetUpside: number;
  stopLoss: number;
  timeHorizon: 'short' | 'medium' | 'long';
  // Short-term movement outlook for the next few trading days
  shortTermPredictions?: Array<{
    daysAhead: number; // e.g. 1, 3, 5, 10
    direction: 'up' | 'down' | 'flat';
    probability: number; // 0-100 (%)
    expectedChangePercent: number; // signed %, relative to current price
    confidence: 'low' | 'medium' | 'high';
    reasoning: string;
  }>;
  technicalIndicators: {
    support: number[];
    resistance: number[];
    trend: 'bullish' | 'bearish' | 'neutral';
  };
  fundamentalFactors: {
    sentiment: 'positive' | 'negative' | 'neutral';
    keyDrivers: string[];
  };
}

export interface StockAnalysisData {
  symbol: string;
  transactions: Array<{
    date: string;
    close: number;
    pctChange: number;
    factors?: string[];
  }>;
  factorAnalysis?: {
    summary: {
      factorCounts: Record<string, number>;
      averageFactorsPerDay: number;
    };
    correlation?: Record<string, {
      avgReturn: number;
      hitRate: number;
    }>;
  };
  totalDays: number;
  minPctChange: number;
  currentPrice?: number;
}

export async function generatePriceRecommendations(
  stockData: StockAnalysisData
): Promise<PriceRecommendation> {
  const prompt = `
You are an expert financial analyst specializing in technical and fundamental analysis. 
Based on the provided stock data, generate specific buy and sell price recommendations.

STOCK SYMBOL: ${stockData.symbol}
CURRENT PRICE: ${stockData.currentPrice || 'N/A'}
ANALYSIS PERIOD: ${stockData.totalDays} days
SIGNIFICANT MOVES THRESHOLD: ${stockData.minPctChange}%

TRANSACTION DATA (Significant Price Increases):
${stockData.transactions.map(tx => 
  `Date: ${tx.date}, Close: $${tx.close}, Change: +${tx.pctChange}%, Factors: ${tx.factors?.join(', ') || 'None'}`
).join('\n')}

FACTOR ANALYSIS:
${stockData.factorAnalysis ? `
- Total Factors Identified: ${Object.keys(stockData.factorAnalysis.summary.factorCounts).length}
- Average Factors Per Day: ${stockData.factorAnalysis.summary.averageFactorsPerDay.toFixed(2)}
- Factor Frequency: ${JSON.stringify(stockData.factorAnalysis.summary.factorCounts, null, 2)}
- Top Performing Factors: ${stockData.factorAnalysis.correlation ? 
  Object.entries(stockData.factorAnalysis.correlation)
    .sort((a, b) => b[1].avgReturn - a[1].avgReturn)
    .slice(0, 5)
    .map(([factor, data]) => `${factor}: +${data.avgReturn.toFixed(2)}% avg return`)
    .join(', ') : 'N/A'}
` : 'No factor analysis available'}

ANALYSIS REQUIREMENTS:
1. Provide specific BUY and SELL price targets based on technical analysis
2. Consider support/resistance levels from the price data
3. Factor in the identified market factors and their historical performance
4. Include risk management recommendations (stop loss, position sizing considerations)
5. Provide confidence level based on data quality and pattern strength
6. Suggest appropriate time horizon for the recommendations
7. Additionally, provide short-term price movement predictions for the next trading days (1, 3, 5, and 10 days ahead), indicating whether price is more likely to move up, down, or stay relatively flat, with probabilities and expected % moves.

RESPONSE FORMAT (JSON only):
{
  "buyPrice": <number>,
  "sellPrice": <number>,
  "confidence": "low|medium|high",
  "reasoning": ["<reason 1>", "<reason 2>", "<reason 3>"],
  "riskFactors": ["<risk 1>", "<risk 2>", "<risk 3>"],
  "targetUpside": <percentage>,
  "stopLoss": <number>,
  "timeHorizon": "short|medium|long",
  "shortTermPredictions": [
    {
      "daysAhead": 1,
      "direction": "up|down|flat",
      "probability": <percentage>, 
      "expectedChangePercent": <signed_percentage>,
      "confidence": "low|medium|high",
      "reasoning": "<short explanation>"
    },
    {
      "daysAhead": 3,
      "direction": "up|down|flat",
      "probability": <percentage>, 
      "expectedChangePercent": <signed_percentage>,
      "confidence": "low|medium|high",
      "reasoning": "<short explanation>"
    },
    {
      "daysAhead": 5,
      "direction": "up|down|flat",
      "probability": <percentage>, 
      "expectedChangePercent": <signed_percentage>,
      "confidence": "low|medium|high",
      "reasoning": "<short explanation>"
    },
    {
      "daysAhead": 10,
      "direction": "up|down|flat",
      "probability": <percentage>, 
      "expectedChangePercent": <signed_percentage>,
      "confidence": "low|medium|high",
      "reasoning": "<short explanation>"
    }
  ],
  "technicalIndicators": {
    "support": [<level1>, <level2>],
    "resistance": [<level1>, <level2>],
    "trend": "bullish|bearish|neutral"
  },
  "fundamentalFactors": {
    "sentiment": "positive|negative|neutral",
    "keyDrivers": ["<driver 1>", "<driver 2>"]
  }
}

ANALYSIS GUIDELINES:
- Buy price should be below current price (if available) or near recent support levels
- Sell price should provide reasonable upside potential (15-30% typically)
- Consider the stock's volatility and historical price movements
- Factor in the frequency and impact of identified market factors
- Provide conservative estimates for higher confidence recommendations
- Include realistic stop-loss levels based on recent price action
`;

  try {
    const response = await completion({
      model: process.env["OPENAI_MODEL"] || "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an expert financial analyst providing data-driven stock price recommendations. Always respond with valid JSON only."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      apiKey: process.env["LITELLM_API_KEY"] || process.env["OPENAI_API_KEY"],
      baseUrl: process.env["LITELLM_BASE_URL"],
      temperature: 0.3, // Lower temperature for more consistent financial analysis
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response content from AI model');
    }

    // Extract JSON from AI response (handle markdown code blocks)
    let jsonContent = content.trim();
    
    // Remove markdown code block wrappers if present
    if (jsonContent.startsWith('```json')) {
      jsonContent = jsonContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    // Parse the JSON response
    const recommendations = JSON.parse(jsonContent) as PriceRecommendation;
    
    // Validate the response structure
    if (!recommendations.buyPrice || !recommendations.sellPrice) {
      throw new Error('Invalid price recommendations: missing buy or sell prices');
    }

    // Ensure reasonable price relationships
    const currentPrice = stockData.currentPrice || stockData.transactions[stockData.transactions.length - 1]?.close;
    if (currentPrice) {
      // If buy price is higher than current, adjust it
      if (recommendations.buyPrice > currentPrice) {
        recommendations.buyPrice = currentPrice * 0.95; // 5% below current
      }
      // If sell price is lower than current, adjust it
      if (recommendations.sellPrice < currentPrice) {
        recommendations.sellPrice = currentPrice * 1.15; // 15% above current
      }
    }

    return recommendations;

  } catch (error) {
    console.error('Error generating price recommendations:', error);
    
    // Fallback to basic recommendations if AI fails
    const lastTransaction = stockData.transactions[stockData.transactions.length - 1];
    const currentPrice = stockData.currentPrice || lastTransaction?.close || 100;
    
    return {
      buyPrice: currentPrice * 0.95, // 5% below current
      sellPrice: currentPrice * 1.20, // 20% above current
      confidence: 'low',
      reasoning: ['AI analysis unavailable', 'Using conservative default estimates', 'Based on current price levels'],
      riskFactors: ['High market volatility', 'Limited data available', 'AI analysis failed'],
      targetUpside: 20,
      stopLoss: currentPrice * 0.90,
      timeHorizon: 'medium',
      technicalIndicators: {
        support: [currentPrice * 0.90, currentPrice * 0.85],
        resistance: [currentPrice * 1.10, currentPrice * 1.15],
        trend: 'neutral'
      },
      fundamentalFactors: {
        sentiment: 'neutral',
        keyDrivers: ['Market conditions', 'Technical levels']
      }
    };
  }
}

export function validatePriceRecommendations(recommendations: PriceRecommendation): boolean {
  try {
    // Check required fields
    if (!recommendations.buyPrice || !recommendations.sellPrice) return false;
    if (!recommendations.confidence || !['low', 'medium', 'high'].includes(recommendations.confidence)) return false;
    if (!recommendations.timeHorizon || !['short', 'medium', 'long'].includes(recommendations.timeHorizon)) return false;
    if (!recommendations.reasoning || !Array.isArray(recommendations.reasoning)) return false;
    if (!recommendations.riskFactors || !Array.isArray(recommendations.riskFactors)) return false;
    if (!recommendations.technicalIndicators || !recommendations.fundamentalFactors) return false;
    if (!recommendations.targetUpside || typeof recommendations.targetUpside !== 'number') return false;
    if (!recommendations.stopLoss || typeof recommendations.stopLoss !== 'number') return false;
    
    // Check price relationships
    if (recommendations.buyPrice >= recommendations.sellPrice) return false;
    if (recommendations.buyPrice <= 0 || recommendations.sellPrice <= 0) return false;
    
    // Check technical indicators structure
    const tech = recommendations.technicalIndicators;
    if (!tech.support || !tech.resistance || !tech.trend) return false;
    if (!Array.isArray(tech.support) || !Array.isArray(tech.resistance)) return false;
    if (!['bullish', 'bearish', 'neutral'].includes(tech.trend)) return false;
    
    // Check fundamental factors structure
    const fund = recommendations.fundamentalFactors;
    if (!fund.sentiment || !fund.keyDrivers) return false;
    if (!['positive', 'negative', 'neutral'].includes(fund.sentiment)) return false;
    if (!Array.isArray(fund.keyDrivers)) return false;

    // If short-term predictions are present, validate basic structure but do not require them
    if (recommendations.shortTermPredictions) {
      if (!Array.isArray(recommendations.shortTermPredictions)) return false;
      for (const p of recommendations.shortTermPredictions) {
        if (typeof p.daysAhead !== "number" || p.daysAhead <= 0) return false;
        if (!['up', 'down', 'flat'].includes(p.direction)) return false;
        if (typeof p.probability !== "number" || p.probability < 0 || p.probability > 100) return false;
        if (typeof p.expectedChangePercent !== "number") return false;
        if (!['low', 'medium', 'high'].includes(p.confidence)) return false;
        if (typeof p.reasoning !== "string") return false;
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error validating price recommendations:', error);
    return false;
  }
}
