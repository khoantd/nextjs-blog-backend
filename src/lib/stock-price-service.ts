import axios from 'axios';
import https from 'https';
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

export interface HistoricalDataPoint {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    adjClose?: number;
}

export interface HistoricalDataOptions {
    period1?: Date | string; // Start date
    period2?: Date | string; // End date (defaults to today)
    interval?: '1d' | '1wk' | '1mo'; // Daily, weekly, monthly
}

export class StockPriceService {
    private yahooFinance: any;
    // HTTPS agent that accepts self-signed certificates for cafef.vn
    private httpsAgent: https.Agent;

    constructor() {
        this.yahooFinance = new YahooFinance();
        // Create HTTPS agent that accepts self-signed certificates
        // This is needed for cafef.vn which uses self-signed certificates
        this.httpsAgent = new https.Agent({
            rejectUnauthorized: false
        });
    }

    async getPrice(symbol: string, market: Market = 'US'): Promise<StockPrice> {
        if (market === 'VN') {
            return this.fetchVietnamStockPrice(symbol);
        } else {
            return this.fetchUSStockPrice(symbol);
        }
    }

    /**
     * Fetch historical stock data
     * Returns data in CSV-compatible format
     * - US stocks: Uses Yahoo Finance
     * - Vietnamese stocks: Uses CafeF API
     */
    async getHistoricalData(
        symbol: string,
        market: Market = 'US',
        options: HistoricalDataOptions = {}
    ): Promise<HistoricalDataPoint[]> {
        if (market === 'VN') {
            return this.fetchVietnamHistoricalData(symbol, options);
        }

        // US stocks use Yahoo Finance
        try {
            const {
                period1,
                period2 = new Date(),
                interval = '1d'
            } = options;

            // Calculate default period1 (1 year ago if not specified)
            const defaultPeriod1 = period1 || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

            const historical = await this.yahooFinance.historical(symbol.toUpperCase(), {
                period1: typeof defaultPeriod1 === 'string' ? new Date(defaultPeriod1) : defaultPeriod1,
                period2: typeof period2 === 'string' ? new Date(period2) : period2,
                interval: interval
            });

            if (!historical || historical.length === 0) {
                throw new Error(`No historical data found for symbol ${symbol}`);
            }

            // Transform to our format
            return historical.map((item: any) => ({
                date: new Date(item.date).toISOString().split('T')[0],
                open: item.open || 0,
                high: item.high || 0,
                low: item.low || 0,
                close: item.close || 0,
                volume: item.volume || 0,
                adjClose: item.adjClose || item.close
            })).sort((a: HistoricalDataPoint, b: HistoricalDataPoint) => new Date(a.date).getTime() - new Date(b.date).getTime());

        } catch (error: any) {
            console.error(`Error fetching historical data for ${symbol}:`, error);
            throw new Error(`Failed to fetch historical data: ${error.message || 'Unknown error'}`);
        }
    }

    /**
     * Fetch historical data for Vietnamese stocks
     * Tries vnstock API first, falls back to CafeF if not configured
     */
    private async fetchVietnamHistoricalData(
        symbol: string,
        options: HistoricalDataOptions = {}
    ): Promise<HistoricalDataPoint[]> {
        try {
            // Trim and uppercase symbol to ensure it passes validation
            const cleanSymbol = symbol.trim().toUpperCase();
            const {
                period1,
                period2 = new Date(),
                interval = '1d'
            } = options;

            // Calculate default period1 (1 year ago if not specified)
            const defaultPeriod1 = period1 || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
            const startDate = typeof defaultPeriod1 === 'string' ? new Date(defaultPeriod1) : defaultPeriod1;
            const endDate = typeof period2 === 'string' ? new Date(period2) : period2;

            // Format dates for API (YYYY-MM-DD format)
            const formatDate = (date: Date): string => {
                return date.toISOString().split('T')[0];
            };

            // Try vnstock API first if configured
            const { getVnstockClient } = await import('./vnstock-client');
            const vnstockClient = getVnstockClient();

            if (vnstockClient) {
                try {
                    const priceHistory = await vnstockClient.getPriceHistory({
                        symbol: cleanSymbol,
                        source: 'vci',
                        start: formatDate(startDate),
                        end: formatDate(endDate),
                        interval: interval === '1d' ? 'D' : interval.toUpperCase(),
                    });

                    // Transform vnstock data to our format
                    // The data structure depends on vnstock API response
                    if (priceHistory.data) {
                        let dataArray: any[] = [];
                        
                        // Handle DataFrame-like structure (pandas DataFrame converted to dict)
                        if (priceHistory.data.records) {
                            dataArray = priceHistory.data.records;
                        } else if (Array.isArray(priceHistory.data)) {
                            dataArray = priceHistory.data;
                        } else if (priceHistory.data.data && Array.isArray(priceHistory.data.data)) {
                            dataArray = priceHistory.data.data;
                        }

                        if (dataArray.length > 0) {
                            return dataArray.map((item: any) => {
                                // Handle different possible field names from vnstock
                                const date = item.Date || item.date || item.time || item.Time;
                                const open = item.Open || item.open || item.GiaMo || item.giaMo || 0;
                                const high = item.High || item.high || item.Cao || item.cao || 0;
                                const low = item.Low || item.low || item.Thap || item.thap || 0;
                                const close = item.Close || item.close || item.GiaDong || item.giaDong || item.Price || item.price || 0;
                                const volume = item.Volume || item.volume || item.KhoiLuong || item.khoiLuong || 0;

                                // Parse date
                                let dateStr: string;
                                if (date instanceof Date) {
                                    dateStr = date.toISOString().split('T')[0];
                                } else if (typeof date === 'string') {
                                    const parsed = new Date(date);
                                    if (!isNaN(parsed.getTime())) {
                                        dateStr = parsed.toISOString().split('T')[0];
                                    } else {
                                        const parts = date.split('/');
                                        if (parts.length === 3) {
                                            dateStr = `${parts[2]}-${parts[1]}-${parts[0]}`;
                                        } else {
                                            dateStr = date;
                                        }
                                    }
                                } else {
                                    dateStr = new Date().toISOString().split('T')[0];
                                }

                                return {
                                    date: dateStr,
                                    open: parseFloat(String(open)) || 0,
                                    high: parseFloat(String(high)) || 0,
                                    low: parseFloat(String(low)) || 0,
                                    close: parseFloat(String(close)) || 0,
                                    volume: parseFloat(String(volume)) || 0
                                };
                            }).sort((a: HistoricalDataPoint, b: HistoricalDataPoint) => 
                                new Date(a.date).getTime() - new Date(b.date).getTime()
                            );
                        }
                    }
                } catch (vnstockError: any) {
                    console.warn(`Vnstock API failed for ${symbol} historical data, falling back to CafeF:`, vnstockError.message);
                    // Fall through to CafeF fallback
                }
            }

            // Fallback to CafeF API if vnstock is not configured or fails
            // Format dates for CafeF API (DD/MM/YYYY format)
            const formatDateCafeF = (date: Date): string => {
                const day = String(date.getDate()).padStart(2, '0');
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const year = date.getFullYear();
                return `${day}/${month}/${year}`;
            };

            // CafeF historical data endpoint
            // Try multiple possible endpoints
            const endpoints = [
                `https://cafef.vn/ajax/Stock/GetStockHistory.ashx`,
                `https://cafef.vn/du-lieu/Ajax/StockHistory.ashx`,
                `https://cafef.vn/du-lieu/Ajax/PageNew/StockHistory.ashx`
            ];

            let historicalData: any[] = [];
            let lastError: Error | null = null;

            for (const endpoint of endpoints) {
                try {
                    const response = await axios.get(endpoint, {
                        params: {
                            symbol: cleanSymbol,
                            startDate: formatDateCafeF(startDate),
                            endDate: formatDateCafeF(endDate)
                        },
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                            'Referer': 'https://cafef.vn/',
                            'Accept': 'application/json, text/plain, */*',
                        },
                        httpsAgent: this.httpsAgent,
                        timeout: 15000,
                        validateStatus: (status) => status < 500 // Don't throw on 4xx, we'll handle it
                    });

                    // Check for error status codes
                    if (response.status >= 400) {
                        console.log(`CafeF endpoint ${endpoint} returned status ${response.status}, trying next...`);
                        lastError = new Error(`CafeF API returned status ${response.status}`);
                        continue;
                    }

                    // Detect if response is HTML (error page) instead of JSON
                    const responseStr = typeof response.data === 'string' ? response.data : String(response.data);
                    if (typeof response.data === 'string' && (
                        responseStr.includes('<!DOCTYPE') || 
                        responseStr.includes('<html') ||
                        responseStr.includes('Admicro Tag Manager') ||
                        responseStr.includes('googletagmanager.com')
                    )) {
                        console.log(`CafeF endpoint ${endpoint} returned HTML instead of JSON, trying next...`);
                        lastError = new Error('CafeF API returned HTML error page instead of data');
                        continue;
                    }

                    if (response.data && Array.isArray(response.data) && response.data.length > 0) {
                        historicalData = response.data;
                        break;
                    } else if (response.data && typeof response.data === 'object') {
                        // Try different response formats
                        if (response.data.data && Array.isArray(response.data.data)) {
                            historicalData = response.data.data;
                            break;
                        } else if (response.data.history && Array.isArray(response.data.history)) {
                            historicalData = response.data.history;
                            break;
                        }
                    }
                } catch (error: any) {
                    lastError = error;
                    console.log(`CafeF endpoint ${endpoint} failed, trying next...`);
                    continue;
                }
            }

            if (historicalData.length === 0) {
                // Fallback: Try scraping from CafeF stock detail page
                // This is a more reliable method for Vietnamese stocks
                return await this.fetchVietnamHistoricalDataFromPage(cleanSymbol, startDate, endDate);
            }

            // Transform CafeF data to our format
            // CafeF format may vary, so we handle multiple formats
            return historicalData.map((item: any) => {
                // Handle different possible field names
                const date = item.Date || item.date || item.Ngay || item.ngay;
                const open = item.Open || item.open || item.GiaMo || item.giaMo || 0;
                const high = item.High || item.high || item.Cao || item.cao || 0;
                const low = item.Low || item.low || item.Thap || item.thap || 0;
                const close = item.Close || item.close || item.GiaDong || item.giaDong || item.Price || item.price || 0;
                const volume = item.Volume || item.volume || item.KhoiLuong || item.khoiLuong || 0;

                // Parse date (could be in various formats)
                let dateStr: string;
                if (date instanceof Date) {
                    dateStr = date.toISOString().split('T')[0];
                } else if (typeof date === 'string') {
                    // Try to parse different date formats
                    const parsed = new Date(date);
                    if (!isNaN(parsed.getTime())) {
                        dateStr = parsed.toISOString().split('T')[0];
                    } else {
                        // Try DD/MM/YYYY format
                        const parts = date.split('/');
                        if (parts.length === 3) {
                            dateStr = `${parts[2]}-${parts[1]}-${parts[0]}`;
                        } else {
                            dateStr = date;
                        }
                    }
                } else {
                    dateStr = new Date().toISOString().split('T')[0];
                }

                return {
                    date: dateStr,
                    open: parseFloat(String(open)) || 0,
                    high: parseFloat(String(high)) || 0,
                    low: parseFloat(String(low)) || 0,
                    close: parseFloat(String(close)) || 0,
                    volume: parseFloat(String(volume)) || 0
                };
            }).sort((a: HistoricalDataPoint, b: HistoricalDataPoint) => new Date(a.date).getTime() - new Date(b.date).getTime());

        } catch (error: any) {
            console.error(`Error fetching Vietnamese historical data for ${symbol}:`, error);
            
            // Check if vnstock is configured
            const { getVnstockClient } = await import('./vnstock-client');
            const vnstockClient = getVnstockClient();
            const vnstockConfigured = vnstockClient !== null;
            
            // Provide helpful error message based on what failed
            let errorMessage = `Failed to fetch historical data for ${symbol}`;
            
            if (error.message && error.message.includes('CafeF')) {
                // CafeF-specific error, preserve the message
                errorMessage = error.message;
            } else if (!vnstockConfigured && error.message && error.message.includes('vnstock')) {
                errorMessage = `Vnstock API is not configured. ${error.message}. Please configure vnstock API or use CSV upload for Vietnamese stocks.`;
            } else {
                errorMessage = `${errorMessage}: ${error.message || 'Unknown error'}`;
            }
            
            // Add suggestion for CSV upload
            if (!errorMessage.includes('CSV upload')) {
                errorMessage += ' Please use CSV upload for Vietnamese stocks - it is more reliable.';
            }
            
            throw new Error(errorMessage);
        }
    }

    /**
     * Fallback method: Fetch historical data by scraping CafeF stock detail page
     * This is more reliable when API endpoints don't work
     */
    private async fetchVietnamHistoricalDataFromPage(
        symbol: string,
        startDate: Date,
        endDate: Date
    ): Promise<HistoricalDataPoint[]> {
        try {
            // CafeF stock detail page URL
            const url = `https://cafef.vn/${symbol.toLowerCase()}.chn`;

            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': 'https://cafef.vn/',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                },
                httpsAgent: this.httpsAgent,
                timeout: 15000,
                validateStatus: (status) => status < 500 // Don't throw on 4xx, we'll handle it
            });

            // Check for error status codes
            if (response.status === 404) {
                throw new Error(`CafeF page not found for symbol ${symbol}. The stock symbol may be incorrect or the page structure has changed.`);
            }

            if (response.status >= 400) {
                throw new Error(`CafeF returned error status ${response.status} for symbol ${symbol}.`);
            }

            // Parse HTML to extract historical data
            const html = typeof response.data === 'string' ? response.data : String(response.data);
            
            // Detect if this is an error page (contains tag manager scripts but no stock data)
            const isErrorPage = html.includes('Admicro Tag Manager') || 
                               html.includes('googletagmanager.com/gtm.js') ||
                               html.includes('<title>404') ||
                               html.includes('Page Not Found') ||
                               html.includes('Không tìm thấy');

            if (isErrorPage) {
                throw new Error(`CafeF returned an error page for symbol ${symbol}. The page may not exist or the URL format has changed.`);
            }
            
            // Try to find JSON data embedded in the page
            const jsonMatch = html.match(/var\s+stockData\s*=\s*({.*?});/s) || 
                            html.match(/window\.stockData\s*=\s*({.*?});/s) ||
                            html.match(/var\s+historyData\s*=\s*(\[.*?\]);/s);

            if (jsonMatch) {
                try {
                    const data = JSON.parse(jsonMatch[1]);
                    if (Array.isArray(data)) {
                        return this.transformCafeFData(data, startDate, endDate);
                    } else if (data.history || data.data) {
                        return this.transformCafeFData(data.history || data.data, startDate, endDate);
                    }
                } catch (e) {
                    console.log('Failed to parse embedded JSON data from CafeF page');
                }
            }

            // If no embedded data found, throw error to suggest CSV upload
            throw new Error(`CafeF page does not contain embedded stock data for ${symbol}. The page structure may have changed. Please use CSV upload for Vietnamese stocks.`);

        } catch (error: any) {
            // If it's already our custom error, rethrow it
            if (error.message && error.message.includes('CafeF')) {
                throw error;
            }
            
            // Handle axios errors
            if (error.response) {
                const status = error.response.status;
                const statusText = error.response.statusText || 'Unknown';
                console.error(`Error fetching from CafeF page for ${symbol}: HTTP ${status} ${statusText}`);
                
                if (status === 404) {
                    throw new Error(`CafeF page not found for symbol ${symbol}. Please verify the symbol is correct or use CSV upload.`);
                } else if (status >= 500) {
                    throw new Error(`CafeF server error (${status}). Please try again later or use CSV upload.`);
                } else {
                    throw new Error(`CafeF returned error ${status} for symbol ${symbol}. Please use CSV upload for Vietnamese stocks.`);
                }
            }
            
            // Handle network/timeout errors
            if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
                throw new Error(`Request to CafeF timed out for symbol ${symbol}. Please use CSV upload for Vietnamese stocks.`);
            }
            
            if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
                throw new Error(`Cannot connect to CafeF for symbol ${symbol}. Please use CSV upload for Vietnamese stocks.`);
            }
            
            // Generic error
            console.error(`Error fetching from CafeF page for ${symbol}:`, error);
            throw new Error(`CafeF historical data not available for ${symbol}. ${error.message || 'Please upload CSV file for Vietnamese stocks.'}`);
        }
    }

    /**
     * Transform CafeF data format to our standard format
     */
    private transformCafeFData(
        data: any[],
        startDate: Date,
        endDate: Date
    ): HistoricalDataPoint[] {
        return data
            .map((item: any) => {
                const date = item.Date || item.date || item.Ngay || item.ngay;
                const open = item.Open || item.open || item.GiaMo || item.giaMo || 0;
                const high = item.High || item.high || item.Cao || item.cao || 0;
                const low = item.Low || item.low || item.Thap || item.thap || 0;
                const close = item.Close || item.close || item.GiaDong || item.giaDong || item.Price || item.price || 0;
                const volume = item.Volume || item.volume || item.KhoiLuong || item.khoiLuong || 0;

                let dateStr: string;
                if (date instanceof Date) {
                    dateStr = date.toISOString().split('T')[0];
                } else if (typeof date === 'string') {
                    const parsed = new Date(date);
                    if (!isNaN(parsed.getTime())) {
                        dateStr = parsed.toISOString().split('T')[0];
                    } else {
                        const parts = date.split('/');
                        if (parts.length === 3) {
                            dateStr = `${parts[2]}-${parts[1]}-${parts[0]}`;
                        } else {
                            dateStr = date;
                        }
                    }
                } else {
                    dateStr = new Date().toISOString().split('T')[0];
                }

                return {
                    date: dateStr,
                    open: parseFloat(String(open)) || 0,
                    high: parseFloat(String(high)) || 0,
                    low: parseFloat(String(low)) || 0,
                    close: parseFloat(String(close)) || 0,
                    volume: parseFloat(String(volume)) || 0
                };
            })
            .filter((item: HistoricalDataPoint) => {
                const itemDate = new Date(item.date);
                return itemDate >= startDate && itemDate <= endDate;
            })
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }

    /**
     * Convert historical data to CSV format
     */
    historicalDataToCSV(data: HistoricalDataPoint[]): string {
        const headers = 'Date,Open,High,Low,Close,Volume';
        const rows = data.map(item => 
            `${item.date},${item.open},${item.high},${item.low},${item.close},${item.volume}`
        );
        return [headers, ...rows].join('\n');
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
                // Create a more informative error that can be caught by route handler
                const error = new Error(`Symbol ${symbol} exists but is type ${quote.quoteType}, expected EQUITY or ETF. This symbol may be a mutual fund, bond, or other security type not supported. If this is a Vietnamese stock, try using market='VN' instead.`);
                (error as any).code = 'INVALID_SYMBOL_TYPE';
                (error as any).statusCode = 400;
                throw error;
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
            // Only log if it's not an expected validation error
            if (!(error as any)?.code || (error as any).code !== 'INVALID_SYMBOL_TYPE') {
                console.error(`Error fetching US stock ${symbol}:`, error);
            }
            throw error;
        }
    }

    private async fetchVietnamStockPrice(symbol: string): Promise<StockPrice> {
        try {
            // Try vnstock API first if configured
            const { getVnstockClient } = await import('./vnstock-client');
            const vnstockClient = getVnstockClient();

            if (vnstockClient) {
                try {
                    // Trim and uppercase symbol to ensure it passes validation
                    const cleanSymbol = symbol.trim().toUpperCase();
                    
                    // Validate symbol length before sending to API
                    if (cleanSymbol.length < 1 || cleanSymbol.length > 15) {
                        throw new Error(`Invalid symbol length: ${cleanSymbol.length} (must be between 1 and 15 characters)`);
                    }
                    
                    const priceBoard = await vnstockClient.getPriceBoard({
                        symbols_list: [cleanSymbol],
                        source: 'vci',
                    });

                    // Parse price board data
                    // The response structure follows vnstock API format:
                    // { data: { [symbol]: { price, change, change_percent, volume, ... } } }
                    if (priceBoard.data && priceBoard.data[cleanSymbol]) {
                        const stockData = priceBoard.data[cleanSymbol];
                        
                        // Debug: Log the actual response structure for troubleshooting
                        if (process.env.NODE_ENV === 'development') {
                            console.log(`[Vnstock Price] Response structure for ${cleanSymbol}:`, JSON.stringify(stockData, null, 2));
                        }
                        
                        // Use vnstock API format fields first (lowercase)
                        // Fallback to uppercase variants for compatibility
                        const price = stockData.price || stockData.Price || stockData.close || 0;
                        const change = stockData.change !== undefined ? stockData.change : 
                                      (stockData.Change !== undefined ? stockData.Change : 0);
                        const changePercent = stockData.change_percent !== undefined ? stockData.change_percent :
                                             (stockData.changePercent !== undefined ? stockData.changePercent :
                                             (stockData.ChangePercent !== undefined ? stockData.ChangePercent : 0));
                        const volume = stockData.volume !== undefined ? stockData.volume :
                                      (stockData.Volume !== undefined ? stockData.Volume : 0);
                        
                        // Try to extract trading day from API response if available
                        // Common field names: trading_date, date, lastUpdate, updated_at
                        let tradingDay = stockData.trading_date || stockData.date || 
                                        stockData.lastUpdate || stockData.updated_at;
                        
                        // If trading day is a Date object, convert to string
                        if (tradingDay instanceof Date) {
                            tradingDay = tradingDay.toISOString().split('T')[0];
                        } else if (typeof tradingDay === 'string') {
                            // Try to parse and normalize date string
                            const parsed = new Date(tradingDay);
                            if (!isNaN(parsed.getTime())) {
                                tradingDay = parsed.toISOString().split('T')[0];
                            } else {
                                // If parsing fails, use today's date as fallback
                                tradingDay = new Date().toISOString().split('T')[0];
                            }
                        } else {
                            // Default to today's date if not provided
                            tradingDay = new Date().toISOString().split('T')[0];
                        }

                        return {
                            symbol: cleanSymbol,
                            price: parseFloat(price.toFixed(2)),
                            change: parseFloat(change.toFixed(2)),
                            changePercent: typeof changePercent === 'number' 
                                ? `${changePercent.toFixed(2)}%` 
                                : changePercent.toString(),
                            volume: volume || 0,
                            latestTradingDay: tradingDay,
                            currency: 'VND'
                        };
                    }
                } catch (vnstockError: any) {
                    console.warn(`Vnstock API failed for ${symbol}, falling back to CafeF:`, vnstockError.message);
                    // Fall through to CafeF fallback
                }
            }

            // Fallback to CafeF API if vnstock is not configured or fails
            const cleanSymbol = symbol.trim().toUpperCase();

            const response = await axios.get(
                `https://cafef.vn/du-lieu/Ajax/PageNew/RealtimePricesHeader.ashx`,
                {
                    params: { symbols: cleanSymbol },
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Referer': 'https://cafef.vn/',
                        'Accept': 'application/json, text/plain, */*',
                    },
                    httpsAgent: this.httpsAgent,
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
