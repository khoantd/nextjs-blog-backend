require('dotenv').config({ path: '.env.local' });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testDirectDatabaseAccess() {
  try {
    console.log('=== Testing Direct Database Access ===');
    
    // Check DailyFactorData directly for analysis 13
    const dailyData = await prisma.dailyFactorData.findMany({
      where: { stockAnalysisId: 13 },
      orderBy: { date: 'asc' },
      take: 10
    });
    
    console.log('DailyFactorData sample:');
    dailyData.forEach(row => {
      console.log(`  ${row.date}: Close=${row.close}, pct_change=${row.pct_change || 'undefined'}`);
    });
    
    // Check date range
    const dateRange = await prisma.dailyFactorData.aggregate({
      where: { stockAnalysisId: 13 },
      _min: { date: true },
      _max: { date: true },
      _count: true
    });
    
    console.log('\nDate range:', dateRange._min.date, 'to', dateRange._max.date);
    console.log('Total records:', dateRange._count);
    
    // Test period filtering directly
    const periodStart = '2025-11-30';
    const periodEnd = '2025-12-30';
    
    const periodData = await prisma.dailyFactorData.findMany({
      where: {
        stockAnalysisId: 13,
        date: {
          gte: periodStart,
          lte: periodEnd
        },
        close: {
          gt: 0  // Check for positive close prices instead of not null
        }
      },
      orderBy: { date: 'asc' }
    });
    
    console.log('\nPeriod data (2025-11-30 to 2025-12-30):', periodData.length);
    
    if (periodData.length > 0) {
      console.log('✅ SUCCESS: Found period data!');
      periodData.slice(0, 5).forEach(row => {
        console.log(`  ${row.date}: Close=${row.close}, pct_change=${row.pct_change || 0}`);
      });
      
      // Test the format that calculateFactorsOnDemand should return
      const formattedData = periodData.map(row => ({
        Date: row.date,
        Close: row.close,
        pct_change: row.pct_change || 0
      }));
      
      console.log('\nFormatted data (like calculateFactorsOnDemand):');
      formattedData.slice(0, 3).forEach(row => {
        console.log(`  ${row.Date}: Close=${row.Close}, pct_change=${row.pct_change}`);
      });
      
    } else {
      console.log('❌ FAILED: No period data found');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

testDirectDatabaseAccess();
