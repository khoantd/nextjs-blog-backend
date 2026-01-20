async function testImportFix() {
  try {
    console.log('=== Testing Import Fix ===');
    
    console.log('Attempting to import calculateFactorsOnDemand...');
    const { calculateFactorsOnDemand } = await import('./src/lib/services/stock-factor-service.ts');
    console.log('✅ Successfully imported calculateFactorsOnDemand');
    
    console.log('Calling calculateFactorsOnDemand for analysis 13...');
    const factorData = await calculateFactorsOnDemand(13, { skip: 0, limit: 0 });
    console.log('✅ calculateFactorsOnDemand returned', factorData.length, 'records');
    
    if (factorData.length > 0) {
      console.log('Sample data:');
      factorData.slice(0, 3).forEach(row => {
        console.log(`  ${row.Date}: Close=${row.Close}, pct_change=${row.pct_change}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Import test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

testImportFix();
