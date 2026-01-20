import { prisma } from "../prisma";
import { stockPriceService } from "../stock-price-service";
import {
    getAnalysisResultsFromDB,
    generateFactorInsightsPrompt,
    calculateFactorsOnDemand
} from "./stock-factor-service";
import {
    correlateFactorsWithPriceMovement,
    type FactorAnalysis,
    type ExtendedStockData
} from "../stock-factors";
import { generatePriceRecommendations, StockAnalysisData } from "../ai-price-recommendations";
import { completion } from "../litellm-proxy";
import { AppError } from "../errors";

export class StockAnalysisService {

    /**
     * Perform full analysis for a stock:
     * 1. Get current price
     * 2. Get factor analysis results
     * 3. Generate AI insights
     * 4. Generate price recommendations
     * 5. Update database
     */
    static async performFullAnalysis(id: number, options?: {
        startDate?: string;
        endDate?: string;
        periodId?: string;
    }) {
        console.log(`[StockAnalysisService] Starting full analysis for ID: ${id}`);
        
        // Log period information if provided
        if (options?.startDate && options?.endDate) {
            console.log(`[StockAnalysisService] Period-based analysis: ${options.startDate} to ${options.endDate} (${options.periodId})`);
        }

        // 1. Fetch the stock analysis record
        const stockAnalysis = await prisma.stockAnalysis.findUnique({
            where: { id },
        });

        if (!stockAnalysis) {
            throw new AppError("Stock analysis not found", 404);
        }

        const symbol = stockAnalysis.symbol;
        const market = stockAnalysis.market as 'US' | 'VN' | null;

        try {
            // 2. Fetch current price data
            console.log(`[StockAnalysisService] Fetching price for ${symbol} (Market: ${market || 'Auto'})`);
            let stockPrice;

            if (market) {
                // If market is explicitly set, use it
                try {
                    stockPrice = await stockPriceService.getPrice(symbol, market);
                } catch (error) {
                    console.error(`[StockAnalysisService] Failed to fetch price for ${symbol} in ${market} market`, error);
                    stockPrice = null;
                }
            } else {
                // Legacy behavior: Try US first, then VN
                try {
                    // Assume US market for now, or infer from symbol/config if needed
                    stockPrice = await stockPriceService.getPrice(symbol, 'US');
                } catch (e) {
                    console.warn(`[StockAnalysisService] Failed to fetch US price for ${symbol}, trying VN...`);
                    try {
                        stockPrice = await stockPriceService.getPrice(symbol, 'VN');
                    } catch (vnError) {
                        console.error(`[StockAnalysisService] Failed to fetch price for ${symbol}`, vnError);
                        stockPrice = null;
                    }
                }
            }

            // 3. Get existing factor analysis results from DB
            console.log(`[StockAnalysisService] Retrieving factor analysis results`);
            const analysisResults = await getAnalysisResultsFromDB(id, options);

            if (!analysisResults) {
                throw new AppError("Factor analysis results not available. Please import data first.", 400);
            }

            // 3b. Calculate correlation data (needed for AI insights but missing from basic DB fetch)
            // We fetch the full enriched data to calculate accurate correlations
            const fullEnrichedData = await calculateFactorsOnDemand(id);

            // Reconstruct format needed for correlation function
            const factorAnalyses: FactorAnalysis[] = fullEnrichedData.map(d => ({
                date: d.Date,
                factors: d as any, // The merged object contains the boolean flags
                factorCount: d.factorCount || 0,
                factorList: d.factorList || []
            }));

            const extendedStockData: ExtendedStockData[] = fullEnrichedData.map(d => ({
                Date: d.Date,
                Close: d.Close,
                pct_change: d.pct_change,
                // map other fields if needed for correlation (it only uses pct_change)
            }));

            const correlation = correlateFactorsWithPriceMovement(factorAnalyses, extendedStockData);

            // 4. Generate AI Insights
            console.log(`[StockAnalysisService] Generating AI insights`);
            const summary = analysisResults.factorAnalysis?.summary;

            let aiInsights = null;
            if (summary) {
                const prompt = generateFactorInsightsPrompt(
                    symbol,
                    summary as any,
                    correlation,
                    analysisResults.transactions as any
                );

                aiInsights = await this.generateAiInsights(prompt);
            }

            // 5. Generate Price Recommendations
            console.log(`[StockAnalysisService] Generating price recommendations`);
            const stockAnalysisData: StockAnalysisData = {
                symbol,
                transactions: analysisResults.transactions.map(t => ({
                    date: t.date,
                    close: t.close,
                    pctChange: t.pctChange,
                    factors: t.factors
                })),
                factorAnalysis: {
                    summary: {
                        factorCounts: summary?.factorCounts as Record<string, number> || {},
                        averageFactorsPerDay: summary?.averageFactorsPerDay || 0
                    },
                    correlation: Object.entries(correlation).reduce((acc, [k, v]) => {
                        acc[k] = { avgReturn: v.avgReturn, hitRate: 0 };
                        return acc;
                    }, {} as Record<string, { avgReturn: number; hitRate: number }>)
                },
                totalDays: summary?.totalDays || 0,
                minPctChange: stockAnalysis.minPctChange,
                currentPrice: stockPrice?.price
            };

            const priceRecommendations = await generatePriceRecommendations(stockAnalysisData);

            // Merge correlation into analysisResults before saving
            if (analysisResults.factorAnalysis) {
                (analysisResults.factorAnalysis as any).correlation = correlation;
            }

            // 6. Update Database
            console.log(`[StockAnalysisService] Updating database records`);
            const updatedAnalysis = await prisma.stockAnalysis.update({
                where: { id },
                data: {
                    // Price Info
                    latestPrice: stockPrice?.price ?? null,
                    priceChange: stockPrice?.change ?? null,
                    priceChangePercent: stockPrice?.changePercent ? parseFloat(stockPrice.changePercent.toString().replace('%', '')) : null,
                    priceUpdatedAt: new Date(),

                    // Analysis Results
                    // We save the enriched analysis results which now includes correlation
                    analysisResults: JSON.stringify(analysisResults),

                    // AI Stuff
                    aiInsights: aiInsights,
                    priceRecommendations: JSON.stringify(priceRecommendations),
                    buyPrice: priceRecommendations.buyPrice,
                    sellPrice: priceRecommendations.sellPrice,

                    // Status
                    status: 'completed'
                }
            });

            return updatedAnalysis;

        } catch (error) {
            console.error(`[StockAnalysisService] Error performing full analysis:`, error);
            throw error;
        }
    }

    private static async generateAiInsights(prompt: string): Promise<string> {
        try {
            const response = await completion({
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: prompt }]
            });

            return response.choices[0]?.message?.content || "No insights generated";
        } catch (error: any) {
            console.error("Error generating AI insights:", error);
            // Return more descriptive error including the message if available
            return `Failed to generate AI insights: ${error.message || "Unknown error"}`;
        }
    }
}
