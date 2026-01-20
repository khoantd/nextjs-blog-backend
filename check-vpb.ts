#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkVPBStockAnalysis() {
  try {
    console.log('🔍 Checking VPB stock analysis records...\n');

    // Find all stock analyses with VPB symbol
    const vpbAnalyses = await prisma.stockAnalysis.findMany({
      where: {
        symbol: 'VPB'
      },
      include: {
        dailyFactorData: true,
        dailyScores: true,
        factorTables: true,
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    console.log(`Found ${vpbAnalyses.length} VPB stock analysis records:\n`);

    vpbAnalyses.forEach((analysis, index) => {
      console.log(`${index + 1}. Analysis ID: ${analysis.id}`);
      console.log(`   Symbol: ${analysis.symbol}`);
      console.log(`   Name: ${analysis.name || 'N/A'}`);
      console.log(`   Market: ${analysis.market || 'N/A'}`);
      console.log(`   Status: ${analysis.status}`);
      console.log(`   Created: ${analysis.createdAt}`);
      console.log(`   CSV File: ${analysis.csvFilePath || 'No CSV file'}`);
      console.log(`   Daily Factor Data: ${analysis.dailyFactorData.length} records`);
      console.log(`   Daily Scores: ${analysis.dailyScores.length} records`);
      console.log(`   Factor Tables: ${analysis.factorTables.length} records`);
      console.log(`   Favorite: ${analysis.favorite ? 'Yes' : 'No'}`);
      console.log('---');
    });

    // Check for any recent errors or failed analyses
    const failedAnalyses = vpbAnalyses.filter(a => a.status === 'failed' || a.status === 'factor_failed');
    if (failedAnalyses.length > 0) {
      console.log(`\n⚠️  Found ${failedAnalyses.length} failed VPB analyses:`);
      failedAnalyses.forEach(analysis => {
        console.log(`   - ID ${analysis.id}: ${analysis.status} (created ${analysis.createdAt})`);
      });
    }

    // Check if there are any analyses with data
    const analysesWithData = vpbAnalyses.filter(a => 
      a.dailyFactorData.length > 0 || a.dailyScores.length > 0
    );
    
    if (analysesWithData.length > 0) {
      console.log(`\n✅ ${analysesWithData.length} VPB analyses have data available`);
      
      // Show date ranges for analyses with data
      analysesWithData.forEach(analysis => {
        if (analysis.dailyFactorData.length > 0) {
          const dates = analysis.dailyFactorData.map(d => d.date).filter(Boolean);
          if (dates.length > 0) {
            const minDate = new Date(Math.min(...dates.map(d => new Date(d).getTime())));
            const maxDate = new Date(Math.max(...dates.map(d => new Date(d).getTime())));
            console.log(`   - Analysis ${analysis.id}: ${minDate.toISOString().split('T')[0]} to ${maxDate.toISOString().split('T')[0]} (${analysis.dailyFactorData.length} days)`);
          }
        }
      });
    } else {
      console.log('\n❌ No VPB analyses have data available');
    }

    console.log('\n📝 VPB Status Summary:');
    console.log(`- Total analyses: ${vpbAnalyses.length}`);
    console.log(`- Successful: ${vpbAnalyses.filter(a => a.status === 'completed').length}`);
    console.log(`- Failed: ${failedAnalyses.length}`);
    console.log(`- With data: ${analysesWithData.length}`);
    console.log(`- CSV files: ${vpbAnalyses.filter(a => a.csvFilePath).length}`);

  } catch (error) {
    console.error('Error checking VPB analyses:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkVPBStockAnalysis();
