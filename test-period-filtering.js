#!/usr/bin/env node

/**
 * Direct backend test for period-based AI analysis functionality
 */

const { PrismaClient } = require('@prisma/client');

async function testPeriodFiltering() {
  console.log('🧪 Testing Period Filtering Logic...\n');
  
  const prisma = new PrismaClient();
  
  try {
    // Step 1: Get a sample stock analysis
    console.log('📋 Step 1: Finding sample stock analysis...');
    const stockAnalysis = await prisma.stockAnalysis.findFirst({
      include: {
        dailyFactorData: {
          orderBy: { date: 'asc' },
          take: 10
        }
      }
    });

    if (!stockAnalysis) {
      console.log('❌ No stock analysis found. Please create one first.');
      return;
    }

    console.log(`✅ Found analysis: ${stockAnalysis.symbol} (ID: ${stockAnalysis.id})`);
    console.log(`📊 Daily data points: ${stockAnalysis.dailyFactorData.length}\n`);

    // Step 2: Test period filtering logic
    console.log('📅 Step 2: Testing period filtering logic...');
    
    const allDates = stockAnalysis.dailyFactorData.map(d => d.date);
    console.log('📈 All dates:', allDates.slice(0, 5).join(', '), '...');

    // Simulate period filtering
    const startDate = new Date('2024-01-01');
    const endDate = new Date('2024-12-31');
    
    const filteredData = stockAnalysis.dailyFactorData.filter(df => {
      const dfDate = new Date(df.date);
      return dfDate >= startDate && dfDate <= endDate;
    });

    console.log(`🔍 Filtered data points: ${filteredData.length}`);
    console.log('📊 Filtered dates:', filteredData.slice(0, 3).map(d => d.date).join(', '), '...\n');

    // Step 3: Test the getAnalysisResultsFromDB function
    console.log('🔧 Step 3: Testing getAnalysisResultsFromDB function...');
    
    // Import and test the function
    const { getAnalysisResultsFromDB } = require('./src/lib/services/stock-factor-service');
    
    // Test without period
    console.log('📊 Testing without period filter...');
    const fullResults = await getAnalysisResultsFromDB(stockAnalysis.id);
    console.log(`✅ Full dataset: ${fullResults?.totalDays || 0} days`);

    // Test with period
    console.log('📅 Testing with period filter...');
    const periodResults = await getAnalysisResultsFromDB(stockAnalysis.id, {
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      periodId: 'custom'
    });
    console.log(`✅ Period dataset: ${periodResults?.totalDays || 0} days`);

    // Step 4: Compare results
    console.log('\n📊 Results Comparison:');
    console.log(`- Full dataset: ${fullResults?.totalDays || 0} days`);
    console.log(`- Period dataset: ${periodResults?.totalDays || 0} days`);
    console.log(`- Difference: ${(fullResults?.totalDays || 0) - (periodResults?.totalDays || 0)} days`);

    if (periodResults?.totalDays < fullResults?.totalDays) {
      console.log('✅ Period filtering is working correctly!');
    } else {
      console.log('⚠️  Period filtering may not be working as expected');
    }

    console.log('\n🎉 Backend period filtering test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
testPeriodFiltering();
