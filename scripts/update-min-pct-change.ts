/**
 * Bulk Update Script: Update minPctChange for Existing StockAnalyses
 *
 * Usage:
 *   # Single symbol
 *   npx tsx scripts/update-min-pct-change.ts AAPL
 *
 *   # Multiple symbols
 *   npx tsx scripts/update-min-pct-change.ts AAPL MSFT GOOGL
 *
 *   # Using npm script (after adding to package.json)
 *   npm run update:min-pct-change -- AAPL MSFT
 *
 *   # Or via environment variable
 *   SYMBOLS="AAPL,MSFT,GOOGL" npx tsx scripts/update-min-pct-change.ts
 */

import * as dotenv from 'dotenv';
import path from 'path';
import { PrismaClient } from '@prisma/client';

// Load environment variables from .env.local (same pattern as other scripts)
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const prisma = new PrismaClient();

const DEFAULT_MIN_PCT_CHANGE = 3.0;

function parseSymbolsFromArgsOrEnv(): string[] {
  const argvSymbols = process.argv.slice(2).filter(Boolean);

  if (argvSymbols.length > 0) {
    return argvSymbols.map((s) => s.toUpperCase());
  }

  const envSymbols = process.env.SYMBOLS;
  if (envSymbols) {
    return envSymbols
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.toUpperCase());
  }

  return [];
}

async function updateMinPctChangeForSymbols(
  symbols: string[],
  minPctChange: number = DEFAULT_MIN_PCT_CHANGE
) {
  if (symbols.length === 0) {
    console.log('⚠️  No symbols provided. Please specify at least one symbol via arguments or SYMBOLS env variable.');
    console.log('   Example: npm run update:min-pct-change -- AAPL MSFT');
    console.log('   Or: SYMBOLS="AAPL,MSFT" npm run update:min-pct-change');
    return;
  }

  console.log('🚀 Starting minPctChange update...\n');
  console.log(`   Target minPctChange value: ${minPctChange}`);
  console.log(`   Symbols: ${symbols.join(', ')}\n`);

  try {
    let totalUpdated = 0;
    let totalMatched = 0;

    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i];
      console.log(`[${i + 1}/${symbols.length}] Processing symbol: ${symbol}`);

      const analyses = await prisma.stockAnalysis.findMany({
        where: { symbol },
        select: {
          id: true,
          symbol: true,
          name: true,
          minPctChange: true,
        },
      });

      const count = analyses.length;
      totalMatched += count;

      if (count === 0) {
        console.log(`   ⚠️  No stock analyses found for symbol: ${symbol}\n`);
        continue;
      }

      console.log(`   📊 Found ${count} stock analysis(es) for ${symbol}`);

      let updatedForSymbol = 0;
      for (const analysis of analyses) {
        // Skip if already at desired value
        if (analysis.minPctChange === minPctChange) {
          console.log(
            `   ⏭️  Skipping ID=${analysis.id} (${analysis.symbol}) - minPctChange already ${analysis.minPctChange}`
          );
          continue;
        }

        await prisma.stockAnalysis.update({
          where: { id: analysis.id },
          data: { minPctChange },
        });

        updatedForSymbol++;
        totalUpdated++;

        console.log(
          `   ✅ Updated ID=${analysis.id} (${analysis.symbol}) ` +
            `from minPctChange=${analysis.minPctChange} to ${minPctChange}`
        );
      }

      console.log(
        `   ➕ Summary for ${symbol}: matched=${count}, updated=${updatedForSymbol}, skipped=${count - updatedForSymbol}\n`
      );
    }

    console.log('='.repeat(60));
    console.log('📈 Min Change Update Summary:');
    console.log(`   Symbols processed: ${symbols.length}`);
    console.log(`   Analyses matched: ${totalMatched}`);
    console.log(`   Analyses updated: ${totalUpdated}`);
    console.log(`   Analyses skipped (already had target value): ${totalMatched - totalUpdated}`);
    console.log('='.repeat(60));

    if (totalUpdated === 0) {
      console.log('\nℹ️  No records required updating. All matching analyses already had the desired minPctChange value.');
    } else {
      console.log('\n✅ Min Change update completed successfully!');
    }
  } catch (error) {
    console.error('\n❌ Min Change update failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run script if executed directly
if (require.main === module) {
  const symbols = parseSymbolsFromArgsOrEnv();
  const rawValue = process.env.MIN_PCT_CHANGE;

  let minPctChange = DEFAULT_MIN_PCT_CHANGE;
  if (rawValue !== undefined) {
    const parsed = parseFloat(rawValue);
    if (!isNaN(parsed) && parsed > 0) {
      minPctChange = parsed;
    } else {
      console.warn(
        `⚠️  Invalid MIN_PCT_CHANGE value "${rawValue}" - falling back to default ${DEFAULT_MIN_PCT_CHANGE}`
      );
    }
  }

  updateMinPctChangeForSymbols(symbols, minPctChange)
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Script error:', error);
      process.exit(1);
    });
}

export { updateMinPctChangeForSymbols };

