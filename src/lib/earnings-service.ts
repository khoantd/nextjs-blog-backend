import axios from 'axios';
import { prisma } from './prisma';

export interface EarningsData {
  symbol: string;
  company?: string;
  earningsDate: Date;
  reportType: 'quarterly' | 'annual';
  expectedEPS?: number;
  actualEPS?: number;
  surprise?: number;
  revenue?: number;
  expectedRevenue?: number;
}

export interface AlphaVantageEarningsResponse {
  symbol: string;
  name?: string;
  earnings: Array<{
    fiscalDateEnding: string;
    reportedDate?: string;
    reportedEPS?: string;
    estimatedEPS?: string;
    surprise?: string;
    surprisePercentage?: string;
    reportedActual?: string;
    revenue?: string;
    estimatedRevenue?: string;
  }>;
}

export class EarningsService {
  private apiKey: string;
  private baseUrl = 'https://www.alphavantage.co/query';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || '';
  }

  async fetchEarnings(symbol: string): Promise<AlphaVantageEarningsResponse> {
    const apiKey = this.apiKey || process.env.ALPHA_VANTAGE_API_KEY;

    if (!apiKey) {
      throw new Error('Alpha Vantage API key is required');
    }

    try {
      const response = await axios.get(this.baseUrl, {
        params: {
          function: 'EARNINGS',
          symbol: symbol,
          apikey: apiKey,
        },
        timeout: 30000,
      });

      if (response.data['Error Message']) {
        throw new Error(`Alpha Vantage API error: ${response.data['Error Message']}`);
      }

      if (response.data['Note']) {
        throw new Error('Alpha Vantage API rate limit exceeded');
      }

      if (!response.data.symbol) {
        throw new Error(`No earnings data found for symbol ${symbol}`);
      }

      return {
        symbol: response.data.symbol,
        name: response.data.name,
        earnings: response.data.quarterlyEarnings || [],
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to fetch earnings data: ${error.message}`);
      }
      throw error;
    }
  }

  transformAlphaVantageData(data: AlphaVantageEarningsResponse): EarningsData[] {
    return data.earnings.map((earning: any) => {
      const expectedEPS = earning.estimatedEPS ? parseFloat(earning.estimatedEPS) : undefined;
      const actualEPS = earning.reportedEPS ? parseFloat(earning.reportedEPS) : undefined;
      const revenue = earning.revenue ? parseFloat(earning.revenue) : undefined;
      const expectedRevenue = earning.estimatedRevenue ? parseFloat(earning.estimatedRevenue) : undefined;

      let surprise: number | undefined;
      if (expectedEPS && actualEPS && expectedEPS !== 0) {
        surprise = (actualEPS - expectedEPS) / expectedEPS;
      }

      return {
        symbol: data.symbol,
        company: data.name,
        earningsDate: new Date(earning.fiscalDateEnding),
        reportType: 'quarterly',
        expectedEPS,
        actualEPS,
        surprise,
        revenue,
        expectedRevenue,
      };
    });
  }

  async getEarningsData(symbol: string): Promise<EarningsData[]> {
    const alphaVantageData = await this.fetchEarnings(symbol);
    return this.transformAlphaVantageData(alphaVantageData);
  }

  async fetchMultipleEarnings(symbols: string[]): Promise<EarningsData[]> {
    const results: EarningsData[] = [];

    for (const symbol of symbols) {
      try {
        const earningsData = await this.getEarningsData(symbol);
        results.push(...earningsData);

        // Add delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 12000)); // 12 seconds between calls
      } catch (error) {
        console.error(`Failed to fetch earnings for ${symbol}:`, error);
        // Continue with other symbols
      }
    }

    return results;
  }
  async syncEarningsForSymbols(symbols: string[]): Promise<void> {
    console.log(`Starting earnings sync for ${symbols.length} symbols`);

    for (const symbol of symbols) {
      try {
        // Fetch earnings data from Alpha Vantage
        const earningsData = await this.getEarningsData(symbol);

        // Store in database
        for (const earning of earningsData) {
          const existingRecord = await prisma.earningsData.findUnique({
            where: {
              symbol_earningsDate: {
                symbol: earning.symbol,
                earningsDate: earning.earningsDate,
              },
            },
          });

          if (!existingRecord) {
            await prisma.earningsData.create({
              data: {
                symbol: earning.symbol,
                company: earning.company,
                earningsDate: earning.earningsDate,
                reportType: earning.reportType,
                expectedEPS: earning.expectedEPS,
                actualEPS: earning.actualEPS,
                surprise: earning.surprise,
                revenue: earning.revenue,
                expectedRevenue: earning.expectedRevenue,
              },
            });
          }
        }

        console.log(`Successfully synced earnings for ${symbol}`);

        // Add delay to respect rate limits if there are multiple symbols
        if (symbols.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 12000)); // 12 seconds between calls
        }
      } catch (error) {
        console.error(`Failed to process ${symbol}:`, error);
      }
    }

    console.log('Earnings sync completed');
  }
}

export const earningsService = new EarningsService();
