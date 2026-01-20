require('dotenv').config({ path: '.env.local' });

// Import the route logic directly to test it
async function testRouteLogic() {
  try {
    console.log('=== Testing Route Logic Directly ===');
    
    // Simulate the route logic
    const numericId = 13;
    const startDate = '2025-11-30';
    const endDate = '2025-12-30';
    const periodId = '30d';
    
    // Import and test calculateFactorsOnDemand
    console.log('Testing calculateFactorsOnDemand import...');
    
    // Since we can't easily import TypeScript modules, let's simulate what the route does
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    
    try {
      // Get the stock analysis
      const stockAnalysis = await prisma.stockAnalysis.findUnique({
        where: { id: numericId }
      });
      
      if (!stockAnalysis) {
        console.log('❌ Stock analysis not found');
        return;
      }
      
      console.log('✅ Found stock analysis:', stockAnalysis.symbol);
      console.log('CSV path:', stockAnalysis.csvFilePath);
      
      // Now try to manually implement what calculateFactorsOnDemand does
      console.log('Implementing calculateFactorsOnDemand logic...');
      
      const rawData = await prisma.dailyFactorData.findMany({
        where: { stockAnalysisId: numericId },
        orderBy: { date: 'asc' }
      });
      
      console.log('Raw data count:', rawData.length);
      
      if (rawData.length === 0) {
        console.log('❌ No raw data found');
        return;
      }
      
      // Convert to ExtendedStockData format
      const stockData = rawData.map(d => ({
        Date: d.date,
        Close: d.close,
        Open: d.open || undefined,
        High: d.high || undefined,
        Low: d.low || undefined,
        Volume: d.volume || undefined
      }));
      
      // Calculate percentage changes
      const dataWithPct = stockData.map((row, index) => {
        if (index === 0) {
          return { ...row, pct_change: 0 };
        }
        const prevClose = stockData[index - 1].Close;
        const pctChange = ((row.Close - prevClose) / prevClose) * 100;
        return { ...row, pct_change: pctChange };
      });
      
      console.log('Data with pct_change calculated');
      
      // Apply date range filter
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
      
      console.log('✅ SUCCESS: Route logic works!');
      console.log('Transactions in period:', transactions.length);
      
      if (transactions.length > 0) {
        console.log('Sample transactions:');
        transactions.slice(0, 3).forEach(tx => {
          console.log(`  ${tx.Date}: Close=${tx.Close}, pct_change=${tx.pct_change.toFixed(2)}%`);
        });
      } else {
        console.log('❌ No transactions found in period');
      }
      
    } catch (error) {
      console.error('❌ Error in route logic:', error.message);
      console.error('Stack:', error.stack);
    } finally {
      await prisma.$disconnect();
    }
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
  }
}

testRouteLogic();
