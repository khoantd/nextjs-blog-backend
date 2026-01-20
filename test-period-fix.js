const { getAllStockData } = require('./src/lib/data-analysis.ts');

async function testPeriodFix() {
  try {
    console.log('Testing period analysis fix...');
    
    // Test with the CSV file from analysis 13
    const csvPath = 'uploads/csvFile-1767676932312-355463856.csv';
    
    console.log('Loading all stock data from:', csvPath);
    const allTransactions = getAllStockData(csvPath);
    
    console.log('Total transactions:', allTransactions.length);
    
    // Filter for the period that was failing
    const periodStart = new Date('2025-11-30');
    const periodEnd = new Date('2025-12-30');
    
    const periodTransactions = allTransactions.filter((tx) => {
      const txDate = new Date(tx.Date);
      return txDate >= periodStart && txDate <= periodEnd;
    });
    
    console.log('Period transactions (2025-11-30 to 2025-12-30):', periodTransactions.length);
    
    if (periodTransactions.length > 0) {
      console.log('First few period transactions:');
      periodTransactions.slice(0, 5).forEach(tx => {
        const dateStr = new Date(tx.Date).toISOString().split('T')[0];
        console.log(`  ${dateStr}: Close=${tx.Close}, pct_change=${tx.pct_change?.toFixed(2)}%`);
      });
      console.log('✅ SUCCESS: Period data found!');
    } else {
      console.log('❌ FAILED: No period data found');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testPeriodFix();
