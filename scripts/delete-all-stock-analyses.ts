/**
 * Script: Delete All Stock Analyses
 * 
 * This script deletes all stock analyses and their related data from the database.
 * 
 * WARNING: This is a destructive operation that cannot be undone!
 * 
 * Usage:
 *   npx tsx scripts/delete-all-stock-analyses.ts
 *   or with confirmation:
 *   npx tsx scripts/delete-all-stock-analyses.ts --confirm
 */

import * as dotenv from 'dotenv';
import path from 'path';
import * as fs from 'fs';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { PrismaClient } from '@prisma/client';

// Initialize Prisma client
const prisma = new PrismaClient();

/**
 * Delete all stock analyses and related data
 */
async function deleteAllStockAnalyses(confirm: boolean = false) {
  if (!confirm) {
    console.log('⚠️  WARNING: This will delete ALL stock analyses and related data!');
    console.log('   This includes:');
    console.log('   - All StockAnalysis records');
    console.log('   - All DailyFactorData records');
    console.log('   - All DailyScore records');
    console.log('   - All FactorTable records');
    console.log('   - All EarningsData records');
    console.log('   - All CSV files');
    console.log('\n   This operation CANNOT be undone!\n');
    console.log('   To proceed, run with --confirm flag:');
    console.log('   npx tsx scripts/delete-all-stock-analyses.ts --confirm\n');
    return;
  }

  console.log('🗑️  Starting deletion of all stock analyses...\n');

  try {
    // Get all stock analyses first
    const allAnalyses = await prisma.stockAnalysis.findMany({
      select: {
        id: true,
        symbol: true,
        name: true,
        csvFilePath: true,
      },
    });

    const totalCount = allAnalyses.length;

    if (totalCount === 0) {
      console.log('✅ No stock analyses found. Nothing to delete.');
      return;
    }

    console.log(`📊 Found ${totalCount} stock analysis(es) to delete:\n`);
    allAnalyses.forEach((analysis, index) => {
      console.log(`   ${index + 1}. ${analysis.symbol} - ${analysis.name || 'N/A'} (ID: ${analysis.id})`);
    });
    console.log('');

    // Collect all unique symbols for earnings data deletion
    const uniqueSymbols = [...new Set(allAnalyses.map(a => a.symbol).filter(Boolean))];
    
    // Collect all CSV file paths
    const csvFilePaths = allAnalyses
      .map(a => a.csvFilePath)
      .filter(Boolean) as string[];

    let deletedCounts = {
      dailyFactorData: 0,
      dailyScores: 0,
      factorTables: 0,
      earningsData: 0,
      csvFiles: 0,
      stockAnalyses: 0,
    };

    // Delete DailyFactorData
    console.log('🗑️  Deleting DailyFactorData...');
    const dailyFactorDataResult = await prisma.dailyFactorData.deleteMany({});
    deletedCounts.dailyFactorData = dailyFactorDataResult.count;
    console.log(`   ✅ Deleted ${deletedCounts.dailyFactorData} DailyFactorData records`);

    // Delete DailyScores
    console.log('🗑️  Deleting DailyScores...');
    const dailyScoresResult = await prisma.dailyScore.deleteMany({});
    deletedCounts.dailyScores = dailyScoresResult.count;
    console.log(`   ✅ Deleted ${deletedCounts.dailyScores} DailyScore records`);

    // Delete FactorTables
    console.log('🗑️  Deleting FactorTables...');
    const factorTablesResult = await prisma.factorTable.deleteMany({});
    deletedCounts.factorTables = factorTablesResult.count;
    console.log(`   ✅ Deleted ${deletedCounts.factorTables} FactorTable records`);

    // Delete EarningsData (by symbols)
    console.log('🗑️  Deleting EarningsData...');
    if (uniqueSymbols.length > 0) {
      const earningsDataResult = await prisma.earningsData.deleteMany({
        where: {
          symbol: {
            in: uniqueSymbols,
          },
        },
      });
      deletedCounts.earningsData = earningsDataResult.count;
      console.log(`   ✅ Deleted ${deletedCounts.earningsData} EarningsData records for ${uniqueSymbols.length} symbol(s)`);
    } else {
      console.log('   ℹ️  No symbols found, skipping EarningsData deletion');
    }

    // Delete CSV files
    console.log('🗑️  Deleting CSV files...');
    for (const csvFilePath of csvFilePaths) {
      try {
        const filePath = path.isAbsolute(csvFilePath)
          ? csvFilePath
          : path.join(process.cwd(), csvFilePath);

        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          deletedCounts.csvFiles++;
          console.log(`   ✅ Deleted CSV file: ${filePath}`);
        } else {
          console.log(`   ⚠️  CSV file not found (skipping): ${filePath}`);
        }
      } catch (fileError) {
        console.error(`   ❌ Error deleting CSV file ${csvFilePath}:`, fileError);
      }
    }
    console.log(`   ✅ Deleted ${deletedCounts.csvFiles} CSV file(s)`);

    // Delete StockAnalyses
    console.log('🗑️  Deleting StockAnalyses...');
    const stockAnalysesResult = await prisma.stockAnalysis.deleteMany({});
    deletedCounts.stockAnalyses = stockAnalysesResult.count;
    console.log(`   ✅ Deleted ${deletedCounts.stockAnalyses} StockAnalysis records`);

    // Summary
    console.log('\n✅ Deletion completed successfully!\n');
    console.log('📊 Summary:');
    console.log(`   Stock Analyses: ${deletedCounts.stockAnalyses}`);
    console.log(`   Daily Factor Data: ${deletedCounts.dailyFactorData}`);
    console.log(`   Daily Scores: ${deletedCounts.dailyScores}`);
    console.log(`   Factor Tables: ${deletedCounts.factorTables}`);
    console.log(`   Earnings Data: ${deletedCounts.earningsData}`);
    console.log(`   CSV Files: ${deletedCounts.csvFiles}`);
    console.log('\n💡 All stock analysis data has been permanently deleted.');
  } catch (error) {
    console.error('\n❌ Error deleting stock analyses:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run script if executed directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const confirm = args.includes('--confirm');

  deleteAllStockAnalyses(confirm)
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Script error:', error);
      process.exit(1);
    });
}

export { deleteAllStockAnalyses };
