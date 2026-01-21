/**
 * List all stock analyses in the database
 */

require('dotenv').config({ path: '.env.local' });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function listStockAnalyses() {
  console.log('='.repeat(80));
  console.log('Listing All Stock Analyses');
  console.log('='.repeat(80));
  console.log('');

  try {
    const analyses = await prisma.stockAnalysis.findMany({
      select: {
        id: true,
        symbol: true,
        name: true,
        market: true,
        status: true,
        createdAt: true,
        _count: {
          select: {
            dailyFactorData: true,
            dailyScores: true
          }
        }
      },
      orderBy: { id: 'asc' }
    });

    if (analyses.length === 0) {
      console.log('No stock analyses found in database.');
      return;
    }

    console.log(`Found ${analyses.length} stock analyses:\n`);
    
    analyses.forEach(analysis => {
      console.log(`ID: ${analysis.id}`);
      console.log(`  Symbol: ${analysis.symbol}`);
      console.log(`  Name: ${analysis.name || 'N/A'}`);
      console.log(`  Market: ${analysis.market || 'N/A'}`);
      console.log(`  Status: ${analysis.status}`);
      console.log(`  Factor Data Records: ${analysis._count.dailyFactorData}`);
      console.log(`  Daily Scores: ${analysis._count.dailyScores}`);
      console.log(`  Created: ${analysis.createdAt}`);
      console.log('');
    });

    console.log('='.repeat(80));
    console.log('To test predictions endpoint, use one of the IDs above:');
    console.log(`Example: node test-predictions-endpoint.js ${analyses[0]?.id || 'ID'} 10`);
    console.log('='.repeat(80));

  } catch (error) {
    console.error('Error:', error);
    console.error('Stack:', error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

listStockAnalyses()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });
