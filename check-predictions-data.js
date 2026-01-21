/**
 * Check if stock analysis has the necessary data for predictions
 * Usage: node check-predictions-data.js [stockAnalysisId]
 */

require('dotenv').config({ path: '.env.local' });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const STOCK_ANALYSIS_ID = parseInt(process.argv[2] || '24', 10);

async function checkPredictionsData() {
  console.log('='.repeat(80));
  console.log('Checking Predictions Data for Stock Analysis ID:', STOCK_ANALYSIS_ID);
  console.log('='.repeat(80));
  console.log('');

  try {
    // 1. Check if stock analysis exists
    console.log('1. Checking if stock analysis exists...');
    const stockAnalysis = await prisma.stockAnalysis.findUnique({
      where: { id: STOCK_ANALYSIS_ID },
      select: {
        id: true,
        symbol: true,
        name: true,
        market: true,
        status: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!stockAnalysis) {
      console.log('❌ Stock analysis not found!');
      console.log(`   ID ${STOCK_ANALYSIS_ID} does not exist in database.`);
      return;
    }

    console.log('✅ Stock analysis found:');
    console.log(`   Symbol: ${stockAnalysis.symbol}`);
    console.log(`   Name: ${stockAnalysis.name || 'N/A'}`);
    console.log(`   Market: ${stockAnalysis.market || 'N/A'}`);
    console.log(`   Status: ${stockAnalysis.status}`);
    console.log(`   Created: ${stockAnalysis.createdAt}`);
    console.log(`   Updated: ${stockAnalysis.updatedAt}`);
    console.log('');

    // 2. Check DailyFactorData count
    console.log('2. Checking DailyFactorData...');
    const factorDataCount = await prisma.dailyFactorData.count({
      where: { stockAnalysisId: STOCK_ANALYSIS_ID }
    });

    console.log(`   Total records: ${factorDataCount}`);

    if (factorDataCount === 0) {
      console.log('❌ No factor data found!');
      console.log('   This is why predictions endpoint returns empty results.');
      console.log('   Solution: Run factor analysis first (regenerate factors).');
      console.log('');
      return;
    }

    // Get sample data
    const sampleData = await prisma.dailyFactorData.findMany({
      where: { stockAnalysisId: STOCK_ANALYSIS_ID },
      orderBy: { date: 'desc' },
      take: 5
    });

    console.log('✅ Factor data found. Sample (most recent 5):');
    sampleData.forEach((row, idx) => {
      console.log(`   ${idx + 1}. Date: ${row.date}, Close: ${row.close}, Volume: ${row.volume || 'N/A'}`);
    });
    console.log('');

    // 3. Check date range
    const dateRange = await prisma.dailyFactorData.aggregate({
      where: { stockAnalysisId: STOCK_ANALYSIS_ID },
      _min: { date: true },
      _max: { date: true }
    });

    console.log('3. Date range:');
    console.log(`   From: ${dateRange._min.date}`);
    console.log(`   To: ${dateRange._max.date}`);
    console.log('');

    // 4. Check if calculateFactorsOnDemand would return data
    console.log('4. Testing calculateFactorsOnDemand logic...');
    console.log('   (This simulates what the predictions endpoint does)');
    
    // Get recent 10 days (same as default days=10)
    const recentData = await prisma.dailyFactorData.findMany({
      where: { stockAnalysisId: STOCK_ANALYSIS_ID },
      orderBy: { date: 'asc' },
      take: 10
    });

    if (recentData.length === 0) {
      console.log('❌ No recent data found (last 10 days)');
      console.log('   This would cause predictions endpoint to return empty array.');
    } else {
      console.log(`✅ Found ${recentData.length} recent records`);
      console.log('   Most recent day:', recentData[recentData.length - 1].date);
      
      // Check if factors are populated
      const mostRecent = recentData[recentData.length - 1];
      const hasFactors = mostRecent.volumeSpike !== null || 
                        mostRecent.breakMa50 !== null ||
                        mostRecent.rsiOver60 !== null;
      
      if (hasFactors) {
        console.log('✅ Factor flags are populated');
        console.log(`   volumeSpike: ${mostRecent.volumeSpike}`);
        console.log(`   breakMa50: ${mostRecent.breakMa50}`);
        console.log(`   breakMa200: ${mostRecent.breakMa200}`);
        console.log(`   rsiOver60: ${mostRecent.rsiOver60}`);
      } else {
        console.log('⚠️  Factor flags may not be populated');
        console.log('   Note: calculateFactorsOnDemand calculates factors on-the-fly,');
        console.log('   so this is OK - factors are calculated from raw data.');
      }
    }
    console.log('');

    // 5. Check DailyScores (if any)
    console.log('5. Checking DailyScores...');
    const scoresCount = await prisma.dailyScore.count({
      where: { stockAnalysisId: STOCK_ANALYSIS_ID }
    });

    console.log(`   Total scores: ${scoresCount}`);
    if (scoresCount > 0) {
      const recentScore = await prisma.dailyScore.findFirst({
        where: { stockAnalysisId: STOCK_ANALYSIS_ID },
        orderBy: { date: 'desc' }
      });
      console.log(`   Most recent score: ${recentScore.date} - Score: ${recentScore.score}`);
    }
    console.log('');

    // Summary
    console.log('='.repeat(80));
    console.log('Summary:');
    console.log('='.repeat(80));
    
    if (factorDataCount === 0) {
      console.log('❌ PREDICTIONS WILL FAIL: No factor data available');
      console.log('');
      console.log('To fix:');
      console.log('1. Ensure CSV data has been uploaded for this stock analysis');
      console.log('2. Run factor analysis (regenerate factors)');
      console.log('3. Verify DailyFactorData records are created');
    } else if (recentData.length < 10) {
      console.log('⚠️  LIMITED DATA: Less than 10 days of factor data');
      console.log(`   Found ${recentData.length} days, but predictions endpoint requests 10`);
      console.log('   Predictions will still work, but may have fewer results');
    } else {
      console.log('✅ DATA READY: Predictions endpoint should work');
      console.log(`   ${factorDataCount} total factor data records`);
      console.log(`   ${recentData.length} recent records available`);
      console.log('');
      console.log('If predictions endpoint still returns empty:');
      console.log('1. Check backend logs for [Predictions] entries');
      console.log('2. Verify authentication is working');
      console.log('3. Check if filters are removing all predictions');
    }

  } catch (error) {
    console.error('Error:', error);
    console.error('Stack:', error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

checkPredictionsData()
  .then(() => {
    console.log('');
    console.log('Check completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Check failed:', error);
    process.exit(1);
  });
