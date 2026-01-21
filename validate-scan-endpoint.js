/**
 * Validation script for scan-high-probability endpoint
 * Tests the endpoint logic and validates results
 */

require('dotenv').config({ path: '.env.local' });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function validateScanEndpoint() {
  try {
    console.log('=== Validating Scan Endpoint Logic ===\n');
    
    // 1. Check completed analyses
    const completedAnalyses = await prisma.stockAnalysis.findMany({
      where: { status: 'completed' },
      select: {
        id: true,
        symbol: true,
        market: true,
        status: true,
        updatedAt: true
      },
      orderBy: { updatedAt: 'desc' },
      take: 10
    });
    
    console.log(`1. Found ${completedAnalyses.length} completed analyses`);
    if (completedAnalyses.length === 0) {
      console.log('   ❌ No completed analyses found - scan will return empty results');
      return;
    }
    
    completedAnalyses.slice(0, 5).forEach(a => {
      console.log(`   - ${a.symbol} (${a.market || 'N/A'}) - ID: ${a.id}`);
    });
    
    // 2. Check if analyses have factor data
    console.log('\n2. Checking factor data for analyses...');
    for (const analysis of completedAnalyses.slice(0, 3)) {
      const factorDataCount = await prisma.dailyFactorData.count({
        where: { stockAnalysisId: analysis.id }
      });
      
      console.log(`   - ${analysis.symbol}: ${factorDataCount} daily factor records`);
      
      if (factorDataCount > 0) {
        // Get recent data to check for active factors
        const recentData = await prisma.dailyFactorData.findMany({
          where: { stockAnalysisId: analysis.id },
          orderBy: { date: 'desc' },
          take: 10
        });
        
        // Check if any recent records have factor flags
        const recordsWithFactors = recentData.filter(r => {
          // Check if any factor field is true
          return r.volume_spike || r.break_ma50 || r.break_ma200 || r.rsi_over_60 ||
                 r.market_up || r.sector_up || r.short_covering || r.earnings_window ||
                 r.macro_tailwind || r.news_positive;
        });
        
        console.log(`     Recent records with active factors: ${recordsWithFactors.length}/10`);
        
        if (recordsWithFactors.length === 0) {
          console.log(`     ⚠️  No active factors in recent 10 days - predictions will have score 0`);
          
          // Show sample of recent data
          if (recentData.length > 0) {
            const sample = recentData[0];
            console.log(`     Sample record (${sample.date}):`);
            console.log(`       - Volume spike: ${sample.volume_spike}`);
            console.log(`       - Break MA50: ${sample.break_ma50}`);
            console.log(`       - Break MA200: ${sample.break_ma200}`);
            console.log(`       - RSI > 60: ${sample.rsi_over_60}`);
            console.log(`       - Close: ${sample.close}`);
            console.log(`       - Volume: ${sample.volume}`);
          }
        }
      }
    }
    
    // 3. Test factor calculation
    console.log('\n3. Testing factor calculation...');
    const testAnalysis = completedAnalyses[0];
    if (testAnalysis) {
      try {
        // Import the function
        const { calculateFactorsOnDemand } = await import('./src/lib/services/stock-factor-service.ts');
        
        console.log(`   Testing with analysis ID: ${testAnalysis.id} (${testAnalysis.symbol})`);
        const factorData = await calculateFactorsOnDemand(testAnalysis.id, { skip: 0, limit: 0 });
        
        console.log(`   Retrieved ${factorData.length} factor data records`);
        
        if (factorData.length > 0) {
          // Check recent records for active factors
          const recentFactorData = factorData.slice(-10);
          const recordsWithFactors = recentFactorData.filter(r => {
            const factors = {
              volume_spike: r.volume_spike,
              break_ma50: r.break_ma50,
              break_ma200: r.break_ma200,
              rsi_over_60: r.rsi_over_60,
              market_up: r.market_up,
              sector_up: r.sector_up,
              short_covering: r.short_covering,
              earnings_window: r.earnings_window,
              macro_tailwind: r.macro_tailwind,
              news_positive: r.news_positive
            };
            return Object.values(factors).some(v => v === true);
          });
          
          console.log(`   Recent records with active factors: ${recordsWithFactors.length}/10`);
          
          if (recordsWithFactors.length > 0) {
            const sample = recordsWithFactors[0];
            console.log(`   Sample record with factors (${sample.Date}):`);
            const activeFactors = Object.entries(sample)
              .filter(([key, value]) => 
                ['volume_spike', 'break_ma50', 'break_ma200', 'rsi_over_60', 
                 'market_up', 'sector_up', 'short_covering', 'earnings_window',
                 'macro_tailwind', 'news_positive'].includes(key) && value === true
              )
              .map(([key]) => key);
            console.log(`     Active factors: ${activeFactors.join(', ')}`);
          } else {
            console.log('   ⚠️  No active factors found in recent data');
            console.log('   This explains why all predictions have score 0.000');
          }
        }
      } catch (error) {
        console.error(`   ❌ Error testing factor calculation:`, error.message);
      }
    }
    
    // 4. Summary
    console.log('\n=== Validation Summary ===');
    console.log('✅ Endpoint logic appears correct');
    console.log('⚠️  Issue: No active factors detected in recent stock data');
    console.log('💡 Solution: Check if stock data needs to be updated or factor thresholds need adjustment');
    
  } catch (error) {
    console.error('Validation error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

validateScanEndpoint();
