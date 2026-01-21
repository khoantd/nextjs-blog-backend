import { stockPriceService } from '../stock-price-service';
import { calculateMA, calculateRSI, calculateBollingerBandsWidth, type ExtendedStockData } from '../stock-factors';
import { calculateFactorsOnDemand, enrichWithTechnicalIndicators } from './stock-factor-service';

export interface FeatureImportanceParams {
  symbol?: string;
  market?: string;
  startDate?: string;
  targetPct?: number;
  topN?: number;
  stockAnalysisId?: number;
}

export interface FeatureImportanceItem {
  factor: string;
  weight: number;
  importance: number;
  correlation: number;
  informationGain: number;
}

export interface FeatureImportanceResult {
  symbol: string;
  market: string | null;
  startDate: string;
  endDate: string;
  targetPct: number;
  statistics: {
    totalDays: number;
    strongDays: number;
    strongDaysPercentage: number;
  };
  topFactors: FeatureImportanceItem[];
  allFeatures: FeatureImportanceItem[];
  modelAccuracy: {
    baselineAccuracy: number;
    featureImportanceMethod: string;
  };
}

type NumericRecord = Record<string, number>;

const DEFAULT_TARGET_PCT = 0.03;
const DEFAULT_TOP_N = 10;

function toISO(date: Date): string {
  return date.toISOString().split('T')[0];
}

async function fetchStockData(params: FeatureImportanceParams): Promise<{ data: ExtendedStockData[]; symbol: string; market: string | null }> {
  const { symbol, market = 'US', startDate, stockAnalysisId } = params;

  if (!symbol && (stockAnalysisId === undefined || stockAnalysisId === null)) {
    throw new Error('Either symbol or stockAnalysisId is required');
  }

  // Use existing analysis data if provided (check for both undefined and null, but allow 0 as valid ID)
  if (stockAnalysisId !== undefined && stockAnalysisId !== null) {
    try {
      const { prisma } = await import('../prisma');
      const stockAnalysis = await prisma.stockAnalysis.findUnique({
        where: { id: stockAnalysisId },
        select: { symbol: true, market: true }
      });

      if (!stockAnalysis) {
        throw new Error(`Stock analysis with id ${stockAnalysisId} not found`);
      }

      const factorData = await calculateFactorsOnDemand(stockAnalysisId, { skip: 0, limit: 0 });
      if (!factorData || factorData.length === 0) {
        throw new Error(`No factor data available for stock analysis ID ${stockAnalysisId} (symbol: ${stockAnalysis.symbol}). Please run factor analysis first by uploading CSV or importing data.`);
      }
      return {
        data: factorData,
        symbol: stockAnalysis.symbol || symbol || 'UNKNOWN',
        market: stockAnalysis.market || null
      };
    } catch (error) {
      // If there's an error using stockAnalysisId, don't fall back to symbol - throw the error
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to use stock analysis data (ID: ${stockAnalysisId}): ${errorMessage}`);
    }
  }

  if (!symbol) {
    throw new Error('Symbol is required when stockAnalysisId is not provided');
  }

  // Try to find existing stock analysis by symbol+market before fetching from external APIs
  // This avoids unnecessary API calls and provides better error messages
  try {
    const { prisma } = await import('../prisma');
    const existingAnalyses = await prisma.stockAnalysis.findMany({
      where: {
        symbol: symbol.toUpperCase(),
        ...(market ? { market } : {})
      },
      orderBy: { updatedAt: 'desc' },
      take: 1,
      select: { id: true, symbol: true, market: true }
    });

    if (existingAnalyses.length > 0) {
      const existingAnalysis = existingAnalyses[0];
      console.log(`[ML Feature Importance] Found existing stock analysis for ${symbol} (ID: ${existingAnalysis.id}), using database data instead of external API`);
      
      const factorData = await calculateFactorsOnDemand(existingAnalysis.id, { skip: 0, limit: 0 });
      if (factorData && factorData.length > 0) {
        return {
          data: factorData,
          symbol: existingAnalysis.symbol || symbol,
          market: existingAnalysis.market || market || null
        };
      }
      // If no factor data exists, fall through to external API fetch
      console.log(`[ML Feature Importance] Existing analysis found but no factor data available, falling back to external API`);
    }
  } catch (dbError) {
    // If database lookup fails, fall through to external API fetch
    console.warn(`[ML Feature Importance] Failed to lookup existing stock analysis for ${symbol}:`, dbError);
  }

  // Fallback to external API if no existing analysis found or if existing analysis has no factor data
  const period1 = startDate ? new Date(startDate) : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  
  try {
    const historical = await stockPriceService.getHistoricalData(symbol, market as any, { period1, interval: '1d' });

    const data: ExtendedStockData[] = historical.map(item => ({
      Date: item.date,
      Close: item.close,
      Open: item.open,
      High: item.high,
      Low: item.low,
      Volume: item.volume
    }));

    return { data, symbol, market };
  } catch (apiError: any) {
    // Provide helpful error message suggesting to upload CSV or use stockAnalysisId
    const errorMessage = apiError instanceof Error ? apiError.message : 'Unknown error';
    throw new Error(
      `Failed to fetch historical data: ${errorMessage}. ` +
      `For Vietnamese stocks, please either: (1) upload a CSV file first to create a stock analysis, ` +
      `or (2) provide the stockAnalysisId parameter if you already have an analysis. ` +
      `External API calls (CafeF/vnstock) are unreliable for Vietnamese stocks.`
    );
  }
}

function addPctChanges(data: ExtendedStockData[]): ExtendedStockData[] {
  return data.map((row, index) => {
    if (index === 0) {
      return { ...row, pct_change: 0 };
    }
    const prevClose = data[index - 1].Close;
    const pctChange = prevClose ? ((row.Close - prevClose) / prevClose) * 100 : 0;
    return { ...row, pct_change: pctChange };
  });
}

function ensureIndicators(data: ExtendedStockData[]): ExtendedStockData[] {
  const withPct = addPctChanges(data);
  const enriched = enrichWithTechnicalIndicators(withPct);

  const volumes = enriched.map(d => d.Volume || 0);
  const volMA20 = calculateMA(volumes, 20);

  const closePrices = enriched.map(d => d.Close);
  const bbWidth = calculateBollingerBandsWidth(closePrices, 20, 2);

  return enriched.map((row, index) => ({
    ...row,
    volumeMA20: volMA20[index],
    bbWidth: bbWidth[index]
  }));
}

function buildDataset(
  data: ExtendedStockData[],
  targetPct: number
): Array<{ features: NumericRecord; target: number }> {
  const rows: Array<{ features: NumericRecord; target: number }> = [];

  for (let i = 1; i < data.length; i++) {
    const today = data[i];
    const yesterday = data[i - 1];

    const lagRsi = typeof yesterday.rsi === 'number' && !isNaN(yesterday.rsi) ? yesterday.rsi : NaN;
    const lagAboveSma20 = yesterday.ma20 !== undefined && yesterday.ma20 !== null ? (yesterday.Close > yesterday.ma20 ? 1 : 0) : NaN;
    const lagBbWidth = typeof (yesterday as any).bbWidth === 'number' ? (yesterday as any).bbWidth : NaN;
    const lagVolSpike =
      yesterday.Volume && (yesterday as any).volumeMA20
        ? yesterday.Volume > (yesterday as any).volumeMA20 * 1.5
          ? 1
          : 0
        : NaN;
    const lagReturn = typeof yesterday.pct_change === 'number' ? yesterday.pct_change : NaN;
    const lagLowVol =
      yesterday.Volume && (yesterday as any).volumeMA20
        ? yesterday.Volume < (yesterday as any).volumeMA20 * 0.7
          ? 1
          : 0
        : NaN;

    const openPrice = today.Open ?? yesterday.Close;
    const isStrong = openPrice ? today.Close > openPrice * (1 + targetPct) : false;

    rows.push({
      features: {
        Lag_RSI: lagRsi,
        Lag_Above_SMA20: lagAboveSma20,
        Lag_BB_Width: lagBbWidth,
        Lag_Vol_Spike: lagVolSpike,
        Lag_Return: lagReturn,
        Lag_Low_Vol: lagLowVol
      },
      target: isStrong ? 1 : 0
    });
  }

  return rows.filter(r => Object.values(r.features).every(v => v !== undefined && !isNaN(v)));
}

function pearsonCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length === 0) return 0;
  const n = x.length;
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let denomX = 0;
  let denomY = 0;

  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }

  const denom = Math.sqrt(denomX * denomY);
  return denom === 0 ? 0 : num / denom;
}

function entropy(p: number): number {
  if (p === 0 || p === 1) return 0;
  return -p * Math.log2(p) - (1 - p) * Math.log2(1 - p);
}

function informationGain(feature: number[], target: number[]): number {
  if (feature.length !== target.length || feature.length === 0) return 0;

  const n = feature.length;
  const targetMean = target.reduce((a, b) => a + b, 0) / n;
  const baseEntropy = entropy(targetMean);

  // Simple binning by median
  const sorted = [...feature].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  const leftTargets: number[] = [];
  const rightTargets: number[] = [];

  feature.forEach((v, idx) => {
    if (v <= median) {
      leftTargets.push(target[idx]);
    } else {
      rightTargets.push(target[idx]);
    }
  });

  const leftProb = leftTargets.length / n;
  const rightProb = rightTargets.length / n;

  const leftEntropy = leftTargets.length ? entropy(leftTargets.reduce((a, b) => a + b, 0) / leftTargets.length) : 0;
  const rightEntropy = rightTargets.length ? entropy(rightTargets.reduce((a, b) => a + b, 0) / rightTargets.length) : 0;

  const conditionalEntropy = leftProb * leftEntropy + rightProb * rightEntropy;
  return Math.max(baseEntropy - conditionalEntropy, 0);
}

function normalize(values: number[]): number[] {
  const max = Math.max(...values, 0);
  if (max === 0) return values.map(() => 0);
  return values.map(v => v / max);
}

export async function calculateFeatureImportance(params: FeatureImportanceParams): Promise<FeatureImportanceResult> {
  const targetPct = params.targetPct ?? DEFAULT_TARGET_PCT;
  const topN = params.topN ?? DEFAULT_TOP_N;

  const { data: rawData, symbol, market } = await fetchStockData(params);
  if (!rawData || rawData.length < 30) {
    throw new Error('Not enough historical data to calculate feature importance (minimum 30 days required)');
  }

  const data = ensureIndicators(rawData);
  const dataset = buildDataset(data, targetPct);

  if (dataset.length < 10) {
    throw new Error('Not enough valid samples after feature engineering (minimum 10 required)');
  }

  const targets = dataset.map(d => d.target);
  const featureNames = Object.keys(dataset[0].features);

  const correlations: number[] = [];
  const infoGains: number[] = [];

  featureNames.forEach(name => {
    const featureVals = dataset.map(d => d.features[name]);
    const corr = Math.abs(pearsonCorrelation(featureVals, targets));
    const ig = informationGain(featureVals, targets);
    correlations.push(corr);
    infoGains.push(ig);
  });

  const normCorr = normalize(correlations);
  const normIg = normalize(infoGains);

  const items: FeatureImportanceItem[] = featureNames.map((name, idx) => {
    const importance = 0.6 * normCorr[idx] + 0.4 * normIg[idx];
    return {
      factor: name,
      weight: importance,
      importance,
      correlation: correlations[idx],
      informationGain: infoGains[idx]
    };
  });

  const sorted = [...items].sort((a, b) => b.weight - a.weight);
  const strongDays = targets.filter(t => t === 1).length;
  const totalDays = targets.length;

  return {
    symbol,
    market: market ?? null,
    startDate: params.startDate || toISO(new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)),
    endDate: data[data.length - 1]?.Date || toISO(new Date()),
    targetPct,
    statistics: {
      totalDays,
      strongDays,
      strongDaysPercentage: totalDays > 0 ? (strongDays / totalDays) * 100 : 0
    },
    topFactors: sorted.slice(0, topN),
    allFeatures: sorted,
    modelAccuracy: {
      baselineAccuracy: totalDays > 0 ? strongDays / totalDays : 0,
      featureImportanceMethod: 'correlation_and_entropy'
    }
  };
}
