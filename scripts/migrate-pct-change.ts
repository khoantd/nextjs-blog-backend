/**
 * Migration Script: Calculate and Update pctChange for Existing DailyFactorData Records
 * 
 * This script calculates percentage changes for all existing DailyFactorData records
 * that have null or missing pctChange values.
 * 
 * Usage:
 *   npm run migrate:pct-change
 *   or
 *   npx tsx scripts/migrate-pct-change.ts
 */

import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { PrismaClient } from '@prisma/client';

// Initialize Prisma client
const prisma = new PrismaClient();

interface DailyFactorDataRecord {
  id: number;
  stockAnalysisId: number;
  date: string;
  close: number;
  pctChange: number | null;
}

/**
 * Calculate percentage change between two prices
 */
function calculatePctChange(currentPrice: number, previousPrice: number): number {
  if (previousPrice === 0 || !isFinite(previousPrice)) {
    return 0;
  }
  return ((currentPrice - previousPrice) / previousPrice) * 100;
}

/**
 * Migrate pctChange for a single stock analysis
 */
async function migrateStockAnalysis(stockAnalysisId: number): Promise<{
  total: number;
  updated: number;
  skipped: number;
  errors: number;
}> {
  // Fetch all daily factor data for this stock analysis, ordered by date
  const records = await prisma.dailyFactorData.findMany({
    where: { stockAnalysisId },
    orderBy: { date: 'asc' },
    select: {
      id: true,
      date: true,
      close: true,
      pctChange: true,
    },
  });

  if (records.length === 0) {
    return { total: 0, updated: 0, skipped: 0, errors: 0 };
  }

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  // Process each record (skip first one as it has no previous day)
  for (let i = 1; i < records.length; i++) {
    const currentRecord = records[i];
    const previousRecord = records[i - 1];

    // Skip if pctChange already exists and is not null
    if (currentRecord.pctChange !== null && currentRecord.pctChange !== undefined) {
      skipped++;
      continue;
    }

    try {
      // Calculate pctChange
      const pctChange = calculatePctChange(currentRecord.close, previousRecord.close);

      // Update the record
      await prisma.dailyFactorData.update({
        where: { id: currentRecord.id },
        data: { pctChange: parseFloat(pctChange.toFixed(4)) },
      });

      updated++;
    } catch (error) {
      console.error(
        `Error updating record ${currentRecord.id} (date: ${currentRecord.date}):`,
        error
      );
      errors++;
    }
  }

  return { total: records.length, updated, skipped, errors };
}

/**
 * Main migration function
 */
async function migrateAllPctChanges() {
  console.log('🚀 Starting pctChange migration...\n');

  try {
    // Get all unique stock analysis IDs that have daily factor data
    const stockAnalysisIds = await prisma.dailyFactorData.findMany({
      select: { stockAnalysisId: true },
      distinct: ['stockAnalysisId'],
    });

    const uniqueIds = [...new Set(stockAnalysisIds.map((r) => r.stockAnalysisId))];
    console.log(`📊 Found ${uniqueIds.length} stock analyses with daily factor data\n`);

    let totalRecords = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    // Process each stock analysis
    for (let i = 0; i < uniqueIds.length; i++) {
      const stockAnalysisId = uniqueIds[i];
      console.log(
        `[${i + 1}/${uniqueIds.length}] Processing stock analysis ID: ${stockAnalysisId}...`
      );

      const result = await migrateStockAnalysis(stockAnalysisId);
      totalRecords += result.total;
      totalUpdated += result.updated;
      totalSkipped += result.skipped;
      totalErrors += result.errors;

      console.log(
        `  ✓ Total records: ${result.total}, Updated: ${result.updated}, Skipped: ${result.skipped}, Errors: ${result.errors}\n`
      );
    }

    // Summary
    console.log('='.repeat(60));
    console.log('📈 Migration Summary:');
    console.log(`  Total stock analyses processed: ${uniqueIds.length}`);
    console.log(`  Total daily records: ${totalRecords}`);
    console.log(`  Records updated: ${totalUpdated}`);
    console.log(`  Records skipped (already had pctChange): ${totalSkipped}`);
    console.log(`  Errors: ${totalErrors}`);
    console.log('='.repeat(60));

    if (totalErrors === 0) {
      console.log('\n✅ Migration completed successfully!');
    } else {
      console.log(`\n⚠️  Migration completed with ${totalErrors} error(s).`);
    }
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run migration if script is executed directly
if (require.main === module) {
  migrateAllPctChanges()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration error:', error);
      process.exit(1);
    });
}

export { migrateAllPctChanges, migrateStockAnalysis };

