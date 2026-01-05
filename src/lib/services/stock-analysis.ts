import type { StockAnalysisResult, Transaction } from '../types/stock-analysis';
import { performFactorAnalysis } from './stock-factor-service';

interface StockData {
  Date: string;
  Close: number;
  [key: string]: any;
}

interface ProcessedData extends StockData {
  pct_change: number;
}

/**
 * Parse CSV content and return array of objects
 */
function parseCSV(csvContent: string): StockData[] {
  const lines = csvContent.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());

  // Normalize headers to proper case for consistent processing
  const headerMap: Record<string, string> = {};
  headers.forEach(h => {
    const lower = h.toLowerCase();
    if (lower === 'date') headerMap[h] = 'Date';
    else if (lower === 'open') headerMap[h] = 'Open';
    else if (lower === 'high') headerMap[h] = 'High';
    else if (lower === 'low') headerMap[h] = 'Low';
    else if (lower === 'close') headerMap[h] = 'Close';
    else if (lower === 'volume') headerMap[h] = 'Volume';
    else if (lower === 'ticket') headerMap[h] = 'Ticket'; // Handle Vietnamese format
    else headerMap[h] = h;
  });

  const data: StockData[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip empty lines
    if (!line) {
      continue;
    }

    const values = line.split(',');

    // Skip rows that don't have enough columns
    if (values.length < headers.length) {
      console.warn(`Skipping malformed row ${i}: insufficient columns`);
      continue;
    }

    const row: any = {};
    headers.forEach((header, index) => {
      const value = values[index]?.trim();
      const normalizedHeader = headerMap[header];

      // Convert numeric fields
      if (normalizedHeader === 'Close' || normalizedHeader === 'Open' ||
          normalizedHeader === 'High' || normalizedHeader === 'Low' ||
          normalizedHeader === 'Volume') {
        row[normalizedHeader] = parseFloat(value);
      } else {
        row[normalizedHeader] = value;
      }
    });

    // Validate that Date field exists and is not empty
    if (!row.Date || row.Date === '') {
      console.warn(`Skipping row ${i}: missing or empty Date field`);
      continue;
    }

    // Validate that Close price is a valid number
    if (isNaN(row.Close)) {
      console.warn(`Skipping row ${i}: invalid Close price`);
      continue;
    }

    data.push(row);
  }

  return data;
}

/**
 * Calculate percentage change between consecutive values
 */
function calculatePctChange(arr: number[]): number[] {
  const result: number[] = [NaN]; // First value has no previous value
  for (let i = 1; i < arr.length; i++) {
    const pctChange = ((arr[i] - arr[i - 1]) / arr[i - 1]) * 100;
    result.push(pctChange);
  }
  return result;
}

/**
 * Analyze stock data from CSV content
 */
export function analyzeStockDataFromCSV(
  csvContent: string,
  symbol: string,
  minPctChange: number = 4.0,
  market: string = "us"
): StockAnalysisResult {
  // Load data
  const df = parseCSV(csvContent);

  // Ensure Date is parsed and sort by date, filtering out invalid dates
  const sortedData = df
    .map(row => {
      const dateObj = new Date(row.Date);

      // Validate date is valid
      if (isNaN(dateObj.getTime())) {
        console.warn(`Invalid date encountered: "${row.Date}"`);
        return null;
      }

      return {
        ...row,
        Date: dateObj.toISOString()
      };
    })
    .filter((row): row is StockData => row !== null)
    .sort((a, b) => new Date(a.Date).getTime() - new Date(b.Date).getTime());

  // Calculate % change day by day (close to close)
  const closePrices = sortedData.map(row => row.Close);
  const pctChanges = calculatePctChange(closePrices);

  const dataWithPctChange: ProcessedData[] = sortedData.map((row, index) => ({
    ...row,
    pct_change: pctChanges[index]
  }));

  // Store ALL days for complete analysis, not just significant ones
  const transactions = dataWithPctChange
    .filter(row => !isNaN(row.pct_change)) // Remove minPctChange filter - keep all days
    .map((row, index): Transaction | null => {
      const dateObj = new Date(row.Date);

      // Additional safety check for date validity
      if (isNaN(dateObj.getTime())) {
        console.warn(`Skipping transaction with invalid date: "${row.Date}"`);
        return null;
      }

      return {
        tx: index + 1,
        date: dateObj.toISOString().split('T')[0],
        close: row.Close,
        pctChange: parseFloat(row.pct_change.toFixed(2))
      };
    })
    .filter((tx): tx is Transaction => tx !== null);

  // Perform factor analysis on the complete dataset
  console.log(`[Factor Analysis] Analyzing ${dataWithPctChange.length} trading days...`);
  const factorAnalysisResult = performFactorAnalysis(dataWithPctChange, {
    nasdaqData: [], // Optional: can be enhanced with external data
    earningsDates: [], // Optional: can be enhanced with earnings data
    newsData: [], // Optional: can be enhanced with news data
    sectorData: [], // Optional: can be enhanced with sector data
    macroEvents: [] // Optional: can be enhanced with macro data
  });
  
  console.log(`[Factor Analysis] Found ${factorAnalysisResult.summary.averageFactorsPerDay.toFixed(2)} average factors per day`);

  // Enrich transactions with factor data
  const enrichedTransactions = transactions.map(tx => {
    const txDate = new Date(tx.date).toISOString().split('T')[0];
    
    // Find corresponding factor analysis
    const factorAnalysis = factorAnalysisResult.factorAnalyses.find(
      fa => new Date(fa.date).toISOString().split('T')[0] === txDate
    );
    
    return {
      ...tx,
      factors: factorAnalysis?.factorList || [],
      factorCount: factorAnalysis?.factorCount || 0
    };
  });

  return {
    symbol,
    totalDays: sortedData.length,
    transactionsFound: transactions.length,
    transactions: enrichedTransactions,
    minPctChange,
    factorAnalysis: {
      analyses: factorAnalysisResult.factorAnalyses,
      summary: factorAnalysisResult.summary,
      correlation: factorAnalysisResult.correlation
    }
  };
}

/**
 * Extract symbol from CSV filename
 */
export function extractSymbolFromFilename(filename: string): string {
  // Extract symbol from filename like "SNAP_daily.csv" -> "SNAP" or "TCB-20260103_2025.csv" -> "TCB"
  const match = filename.match(/^([A-Z]+)[_-]/);
  return match ? match[1] : filename.replace(/\.csv$/i, '').toUpperCase();
}
