import { StockFactor, FactorAnalysis } from '../stock-factors';

export type StockAnalysisStatus = 'draft' | 'analyzing' | 'completed' | 'failed' | 'processing' | 'factor_failed' | 'ai_processing' | 'ai_completed';

export interface Transaction {
  tx: number;
  date: string;
  close: number;
  pctChange: number;
  factors?: StockFactor[];
  factorCount?: number;
}

export interface StockAnalysisResult {
  symbol: string;
  totalDays: number;
  transactionsFound: number;
  transactions: Transaction[];
  minPctChange: number;
  factorAnalysis?: {
    analyses: FactorAnalysis[];
    summary: {
      totalDays: number;
      factorCounts: Partial<Record<StockFactor, number>>;
      factorFrequency: Partial<Record<StockFactor, number>>;
      averageFactorsPerDay: number;
    };
    correlation?: Record<StockFactor, {
      correlation: number;
      avgReturn: number;
      occurrences: number;
    }>;
  };
}

export interface StockAnalysis {
  id: number;
  symbol: string;
  name: string | null;
  csvFilePath: string | null;
  status: StockAnalysisStatus | null;
  analysisResults: string | null; // JSON stringified StockAnalysisResult
  aiInsights: string | null;
  latestPrice: number | null;
  priceChange: number | null;
  priceChangePercent: number | null;
  priceUpdatedAt: Date | string | null;
  favorite: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  minPctChange: number;
  // AI-powered price recommendations
  buyPrice: number | null;
  sellPrice: number | null;
  priceRecommendations: string | null; // JSON stringified price recommendations
}

export interface CreateStockAnalysisInput {
  symbol: string;
  name?: string;
  csvContent: string;
  minPctChange?: number;
  market?: string;
  overwrite?: boolean;
}
