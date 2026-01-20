const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debugPeriodData() {
  try {
    console.log('=== Debugging Period Data Issue ===');
    
    // Check analysis 13
    const analysis = await prisma.stockAnalysis.findUnique({
      where: { id: 13 },
      include: {
        dailyFactorData: {
          orderBy: { date: 'asc' },
          take: 5
        }
      }
    });
    
    if (!analysis) {
      console.log('Analysis 13 not found');
      return;
    }
    
    console.log('\nAnalysis Info:');
    console.log('ID:', analysis.id);
    console.log('Symbol:', analysis.symbol);
    console.log('CSV Path:', analysis.csvFilePath);
    console.log('Status:', analysis.status);
    
    // Get date range and count
    const dateRange = await prisma.dailyFactorData.aggregate({
      where: { stockAnalysisId: 13 },
      _min: { date: true },
      _max: { date: true },
      _count: true
    });
    
    console.log('\nDailyFactorData Summary:');
    console.log('Total records:', dateRange._count);
    console.log('Date range:', dateRange._min.date, 'to', dateRange._max.date);
    
    // Check specific period: 2025-11-30 to 2025-12-30
    const periodStart = '2025-11-30';
    const periodEnd = '2025-12-30';
    
    console.log('\nChecking period:', periodStart, 'to', periodEnd);
    
    const periodData = await prisma.dailyFactorData.findMany({
      where: {
        stockAnalysisId: 13,
        date: {
          gte: periodStart,
          lte: periodEnd
        }
      },
      orderBy: { date: 'asc' },
      take: 10
    });
    
    console.log('Period data count:', periodData.length);
    if (periodData.length > 0) {
      console.log('First few records:');
      periodData.forEach(row => {
        console.log('  Date:', row.date, 'Close:', row.close, 'pct_change:', row.pct_change);
      });
    }
    
    // Check if there are any records with valid close prices
    const validDataCount = await prisma.dailyFactorData.count({
      where: {
        stockAnalysisId: 13,
        date: {
          gte: periodStart,
          lte: periodEnd
        },
        close: {
          not: null
        }
      }
    });
    
    console.log('Valid data (with Close prices):', validDataCount);
    
    // If CSV exists, check that too
    if (analysis.csvFilePath && fs.existsSync(analysis.csvFilePath)) {
      console.log('\nCSV file exists:', analysis.csvFilePath);
      // Could add CSV parsing here if needed
    } else {
      console.log('\nCSV file not found:', analysis.csvFilePath);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

debugPeriodData();
