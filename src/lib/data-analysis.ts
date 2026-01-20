import * as fs from 'fs';
import * as path from 'path';

interface StockData {
  Date: string;
  Close: number;
  [key: string]: any;
}

interface ProcessedData extends StockData {
  pct_change: number;
}

interface Transaction extends ProcessedData {
  Tx: number;
}

/**
 * Parse CSV file and return array of objects
 */
function parseCSV(filePath: string): StockData[] {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const lines = fileContent.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());

  const data: StockData[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    const row: any = {};
    headers.forEach((header, index) => {
      const value = values[index]?.trim();
      // Convert numeric fields
      if (header === 'Close' || header === 'Open' || header === 'High' || header === 'Low' || header === 'Volume') {
        row[header] = parseFloat(value);
      } else {
        row[header] = value;
      }
    });
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
 * Main analysis function
 */
export function analyzeStockData(csvFilePath: string) {
  // Load data
  const df = parseCSV(csvFilePath);

  // Ensure Date is parsed and sort by date, filtering out invalid dates
  const sortedData = df
    .map(row => {
      // Check if Date field exists and is not undefined/null
      if (!row.Date || row.Date === undefined || row.Date === null || row.Date === '') {
        console.warn(`Invalid date encountered: "${row.Date}" - row missing Date field`);
        return null;
      }
      
      const dateObj = new Date(row.Date);
      
      // Validate date is valid
      if (isNaN(dateObj.getTime())) {
        console.warn(`Invalid date encountered: "${row.Date}" - cannot parse as valid date`);
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

  // Filter days with increase >= 4%
  const tx = dataWithPctChange
    .filter(row => !isNaN(row.pct_change) && row.pct_change >= 4)
    .map((row, index): Transaction => ({
      ...row,
      Tx: index + 1
    }));

  // Print results
  console.log('Tx\tDate\t\t\tClose\tpct_change');
  console.log('-'.repeat(60));
  tx.forEach(row => {
    const dateStr = new Date(row.Date).toISOString().split('T')[0];
    console.log(`${row.Tx}\t${dateStr}\t${row.Close.toFixed(2)}\t${row.pct_change.toFixed(2)}%`);
  });

  return tx;
}

/**
 * Get all stock data without filtering by percentage change (for period analysis)
 */
export function getAllStockData(csvFilePath: string) {
  // Load data
  const df = parseCSV(csvFilePath);

  // Ensure Date is parsed and sort by date, filtering out invalid dates
  const sortedData = df
    .map(row => {
      // Check if Date field exists and is not undefined/null
      if (!row.Date || row.Date === undefined || row.Date === null || row.Date === '') {
        console.warn(`Invalid date encountered: "${row.Date}" - row missing Date field`);
        return null;
      }
      
      const dateObj = new Date(row.Date);
      
      // Validate date is valid
      if (isNaN(dateObj.getTime())) {
        console.warn(`Invalid date encountered: "${row.Date}" - cannot parse as valid date`);
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

  // Include ALL days (not just significant movements) for period analysis
  const allTransactions = dataWithPctChange
    .filter(row => !isNaN(row.pct_change)) // Only filter out invalid pct_change
    .map((row, index): Transaction => ({
      ...row,
      Tx: index + 1
    }));

  return allTransactions;
}

// Example usage:
// analyzeStockData('SNAP_daily.csv');
