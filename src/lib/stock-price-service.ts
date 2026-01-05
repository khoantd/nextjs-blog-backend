import axios from 'axios';
import YahooFinance from 'yahoo-finance2';

export interface StockPrice {
    symbol: string;
    price: number;
    change?: number;
    changePercent?: number | string;
    volume?: number;
    latestTradingDay?: string;
    currency?: string;
}

export type Market = 'US' | 'VN';

export class StockPriceService {
    private yahooFinance: any;

    constructor() {
        this.yahooFinance = new YahooFinance();
    }

    async getPrice(symbol: string, market: Market = 'US'): Promise<StockPrice> {
        if (market === 'VN') {
            return this.fetchVietnamStockPrice(symbol);
        } else {
            return this.fetchUSStockPrice(symbol);
        }
    }

    private async fetchUSStockPrice(symbol: string): Promise<StockPrice> {
        try {
            const quote = await this.yahooFinance.quote(symbol);

            if (!quote) {
                throw new Error(`No data found for symbol ${symbol}`);
            }

            // Strictly filter for stocks and ETFs to avoid false positives (e.g., TCB is a mutual fund in US)
            const validTypes = ['EQUITY', 'ETF'];
            if (!validTypes.includes(quote.quoteType)) {
                throw new Error(`Symbol ${symbol} exists but is type ${quote.quoteType}, expected EQUITY or ETF`);
            }

            return {
                symbol: quote.symbol,
                price: quote.regularMarketPrice || 0,
                change: quote.regularMarketChange,
                changePercent: quote.regularMarketChangePercent ? `${quote.regularMarketChangePercent.toFixed(2)}%` : undefined,
                volume: quote.regularMarketVolume,
                latestTradingDay: quote.regularMarketTime ? new Date(quote.regularMarketTime).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                currency: quote.currency || 'USD'
            };
        } catch (error) {
            console.error(`Error fetching US stock ${symbol}:`, error);
            throw error;
        }
    }

    private async fetchVietnamStockPrice(symbol: string): Promise<StockPrice> {
        try {
            // Clean symbol
            const cleanSymbol = symbol.toUpperCase();

            const response = await axios.get(
                `https://cafef.vn/du-lieu/Ajax/PageNew/RealtimePricesHeader.ashx`,
                {
                    params: { symbols: cleanSymbol },
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Referer': 'https://cafef.vn/',
                        'Accept': 'application/json, text/plain, */*',
                    },
                    timeout: 10000
                }
            );

            const data = response.data;
            if (!data || !data[cleanSymbol]) {
                throw new Error(`No data found for Vietnam symbol ${cleanSymbol}`);
            }

            const stockData = data[cleanSymbol];

            const price = stockData.Price;
            const refPrice = stockData.RefPrice;
            const change = price - refPrice;
            const changePercent = refPrice > 0 ? (change / refPrice) * 100 : 0;

            return {
                symbol: stockData.Symbol,
                price: price,
                change: parseFloat(change.toFixed(2)),
                changePercent: `${changePercent.toFixed(2)}%`,
                volume: stockData.Volume,
                latestTradingDay: new Date().toISOString().split('T')[0],
                currency: 'VND'
            };

        } catch (error) {
            console.error(`Error fetching VN stock ${symbol}:`, error);
            throw error;
        }
    }
}

export const stockPriceService = new StockPriceService();
