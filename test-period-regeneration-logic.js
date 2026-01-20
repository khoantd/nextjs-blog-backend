require('dotenv').config({ path: '.env.local' });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testPeriodRegenerationLogic() {
  try {
    console.log('=== Testing Period Regeneration Logic ===');
    
    const stockAnalysisId = 13;
    const startDate = '2025-11-30';
    const endDate = '2025-12-30';
    
    // Simulate what calculateFactorsOnDemand should do
    console.log('1. Fetching raw data from database...');
    const rawData = await prisma.dailyFactorData.findMany({
      where: { stockAnalysisId },
      orderBy: { date: 'asc' }
    });
    
    console.log('Raw data records:', rawData.length);
    
    if (rawData.length === 0) {
      console.log('❌ No raw data found');
      return;
    }
    
    // Convert to ExtendedStockData format (like calculateFactorsOnDemand does)
    console.log('2. Converting to ExtendedStockData format...');
    const stockData = rawData.map(d => ({
      Date: d.date,
      Close: d.close,
      Open: d.open || undefined,
      High: d.high || undefined,
      Low: d.low || undefined,
      Volume: d.volume || undefined
    }));
    
    // Calculate percentage changes (like calculatePctChanges does)
    console.log('3. Calculating percentage changes...');
    const dataWithPct = stockData.map((row, index) => {
      if (index === 0) {
        return { ...row, pct_change: 0 };
      }
      const prevClose = stockData[index - 1].Close;
      const pctChange = ((row.Close - prevClose) / prevClose) * 100;
      return { ...row, pct_change: pctChange };
    });
    
    console.log('Data with pct_change calculated');
    
    // Filter by date range (like the backend route does)
    console.log('4. Filtering by date range...');
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    const transactions = dataWithPct
      .filter(row => row.Date && row.Close && !isNaN(row.Close))
      .filter(row => {
        const txDate = new Date(row.Date);
        return txDate >= start && txDate <= end;
      })
      .map((row, index) => ({
        Tx: index + 1,
        Date: row.Date,
        Close: row.Close,
        pct_change: row.pct_change || 0
      }));
    
    console.log('5. Results:');
    console.log('Total transactions in period:', transactions.length);
    
    if (transactions.length > 0) {
      console.log('✅ SUCCESS: Period regeneration logic works!');
      console.log('Sample transactions:');
      transactions.slice(0, 5).forEach(tx => {
        console.log(`  ${tx.Date}: Close=${tx.Close}, pct_change=${tx.pct_change.toFixed(2)}%`);
      });
    } else {
      console.log('❌ FAILED: No transactions found after filtering');
      
      // Debug: show what dates we have vs what we're looking for
      console.log('\nDebug info:');
      console.log('Looking for dates:', startDate, 'to', endDate);
      console.log('Available date range:', stockData[0].Date, 'to', stockData[stockData.length - 1].Date);
      
      // Show some dates around the target period
      const aroundPeriod = stockData.filter(row => {
        const date = new Date(row.Date);
        return date >= new Date('2025-11-20') && date <= new Date('2025-12-10');
      });
      
      console.log('Dates around target period:');
      aroundPeriod.slice(0, 10).forEach(row => {
        console.log(`  ${row.Date}: Close=${row.Close}`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

testPeriodRegenerationLogic();
