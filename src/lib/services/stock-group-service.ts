import { getVnstockClient } from '../vnstock-client';
import { prisma } from '../prisma';

export interface StockGroupPriceIncreaseParams {
  group: string;
  dateFrom: string;
  dateTo: string;
  minIncrease: number;
}

export interface StockGroupPriceIncreaseResultItem {
  symbol: string;
  name: string | null;
  market: string | null;
  date: string;
  open: number;
  close: number;
  increase: number;
  stockAnalysisId?: number;
}

const FALLBACK_GROUPS: Record<string, string[]> = {
  VN30: [
    'ACB',
    'BCM',
    'BID',
    'BVH',
    'CTG',
    'FPT',
    'GAS',
    'GVR',
    'HDB',
    'HPG',
    'LPB',
    'MBB',
    'MSN',
    'MWG',
    'PLX',
    'SAB',
    'SHB',
    'SSB',
    'SSI',
    'STB',
    'TCB',
    'TPB',
    'VCB',
    'VHM',
    'VIB',
    'VIC',
    'VJC',
    'VNM',
    'VPB',
    'VRE',
  ],
};

export async function getStocksByGroup(group: string): Promise<string[]> {
  const normalized = group.trim();
  if (!normalized) {
    throw new Error('Group name is required');
  }

  // Try vnstock client first
  const vnstockClient = getVnstockClient();

  if (vnstockClient) {
    try {
      const symbols = await vnstockClient.getSymbolsByGroup(normalized);
      if (symbols.length > 0) {
        return symbols;
      }
    } catch (error) {
      // Fallback to hardcoded groups if vnstock API fails
      // Log to console for debugging but don't break the flow
      // eslint-disable-next-line no-console
      console.error(
        `[StockGroupService] Failed to fetch symbols from vnstock for group "${normalized}":`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  const fallback = FALLBACK_GROUPS[normalized.toUpperCase()];
  if (!fallback || fallback.length === 0) {
    throw new Error(
      `Unsupported or unknown stock group "${normalized}". Please configure vnstock API or add a fallback group mapping.`
    );
  }

  return fallback;
}

export async function getStocksByGroupWithPriceIncrease(
  params: StockGroupPriceIncreaseParams
): Promise<StockGroupPriceIncreaseResultItem[]> {
  const { group, dateFrom, dateTo, minIncrease } = params;

  const symbols = await getStocksByGroup(group);
  console.log(
    `[StockGroupService] Found ${symbols.length} symbols for group "${group}":`,
    symbols.slice(0, 10)
  );

  if (symbols.length === 0) {
    console.log(`[StockGroupService] No symbols found for group "${group}"`);
    return [];
  }

  // Query database for StockAnalysis records matching the symbols
  const stockAnalyses = await prisma.stockAnalysis.findMany({
    where: {
      symbol: {
        in: symbols,
      },
    },
    select: {
      id: true,
      symbol: true,
      name: true,
      market: true,
    },
  });

  console.log(
    `[StockGroupService] Found ${stockAnalyses.length} stock analyses in database for group "${group}"`
  );

  if (stockAnalyses.length === 0) {
    console.log(
      `[StockGroupService] No stock analyses found in database for group "${group}". ` +
      'Data needs to be uploaded first via CSV upload.'
    );
    return [];
  }

  // Get stock analysis IDs
  const stockAnalysisIds = stockAnalyses.map((sa) => sa.id);

  // Query DailyFactorData for matching analyses within date range
  const dailyFactorData = await prisma.dailyFactorData.findMany({
    where: {
      stockAnalysisId: {
        in: stockAnalysisIds,
      },
      date: {
        gte: dateFrom,
        lte: dateTo,
      },
      open: {
        gt: 0,
      },
    },
    select: {
      stockAnalysisId: true,
      date: true,
      open: true,
      close: true,
    },
    orderBy: [
      { date: 'asc' },
      { stockAnalysisId: 'asc' },
    ],
  });

  console.log(
    `[StockGroupService] Found ${dailyFactorData.length} daily factor data records in date range ${dateFrom} to ${dateTo}`
  );

  // Calculate price increases and filter by minIncrease
  const results: StockGroupPriceIncreaseResultItem[] = [];

  for (const factorData of dailyFactorData) {
    const open = factorData.open;
    const close = factorData.close;

    if (open == null || close == null || open <= 0) {
      continue;
    }

    const increase = ((close - open) / open) * 100;
    if (increase < minIncrease) {
      continue;
    }

    // Find the corresponding stock analysis
    const stockAnalysis = stockAnalyses.find(
      (sa) => sa.id === factorData.stockAnalysisId
    );

    if (!stockAnalysis) {
      continue;
    }

    results.push({
      symbol: stockAnalysis.symbol,
      name: stockAnalysis.name,
      market: stockAnalysis.market,
      date: factorData.date,
      open,
      close,
      increase: Number(increase.toFixed(4)),
      stockAnalysisId: factorData.stockAnalysisId,
    });
  }

  console.log(
    `[StockGroupService] Database-based calculation returned ${results.length} rows at minIncrease=${minIncrease}`
  );

  return results;
}

