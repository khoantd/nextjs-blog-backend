

import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { PrismaClient } from '@prisma/client';

import { StockAnalysisService } from '../src/lib/services/stock-analysis-service';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Verifying StockAnalysisService ---');

    // 1. Find a candidate StockAnalysis
    const analysis = await prisma.stockAnalysis.findFirst({
        orderBy: { createdAt: 'desc' }
    });

    if (!analysis) {
        console.log('No StockAnalysis records found. Please create one via UI or seeding first.');
        return;
    }

    console.log(`Found StockAnalysis: ID ${analysis.id}, Symbol: ${analysis.symbol}`);

    try {
        // 2. Run analysis
        console.log('Running performFullAnalysis...');
        const result = await StockAnalysisService.performFullAnalysis(analysis.id);

        console.log('--- Analysis Result ---');
        console.log('Latest Price:', result.latestPrice);
        console.log('AI Insights:', result.aiInsights ? result.aiInsights.substring(0, 100) + '...' : 'None');
        console.log('Price Recommendations:', result.priceRecommendations ? 'Generated' : 'None');
        console.log('Analysis Results (Correlation):', result.analysisResults ? (JSON.parse(result.analysisResults).factorAnalysis?.correlation ? 'Present' : 'Missing') : 'None');

    } catch (error) {
        console.error('Error running analysis:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
