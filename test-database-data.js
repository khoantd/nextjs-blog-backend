require('dotenv').config({ path: '.env.local' });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testDatabaseData() {
  try {
    console.log('=== Testing Database Data for Period Analysis ===');
    
    // Test the calculateFactorsOnDemand function directly
    const { calculateFactorsOnDemand } = await import('./src/lib/services/stock-factor-service.ts');
    
    console.log('Fetching factor data for analysis 13...');
    const factorData = await calculateFactorsOnDemand(13, { skip: 0, limit: 0 });
    
    console.log('Total factor data records:', factorData.length);
    
    if (factorData.length > 0) {
      console.log('Date range:', factorData[0].Date, 'to', factorData[factorData.length - 1].Date);
      console.log('Sample records:');
      factorData.slice(0, 5).forEach(row => {
        console.log(`  ${row.Date}: Close=${row.Close}, pct_change=${row.pct_change || 'N/A'}`);
      });
      
      // Test period filtering
      const periodStart = new Date('2025-11-30');
      const periodEnd = new Date('2025-12-30');
      
      const periodData = factorData
        .filter(row => row.Date && row.Close && !isNaN(row.Close))
        .filter(row => {
          const txDate = new Date(row.Date);
          return txDate >= periodStart && txDate <= periodEnd;
        });
      
      console.log('\nPeriod data (2025-11-30 to 2025-12-30):', periodData.length);
      
      if (periodData.length > 0) {
        console.log('✅ SUCCESS: Found period data in database!');
        periodData.slice(0, 3).forEach(row => {
          console.log(`  ${row.Date}: Close=${row.Close}, pct_change=${row.pct_change || 0}`);
        });
      } else {
        console.log('❌ FAILED: No period data found');
      }
    } else {
      console.log('❌ FAILED: No factor data found');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

testDatabaseData();
