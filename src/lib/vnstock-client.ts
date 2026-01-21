/**
 * Vnstock API Client
 * Client for interacting with the remote vnstock FastAPI service
 */

import axios, { AxiosInstance } from 'axios';

export interface VnstockConfig {
  baseUrl: string;
  token?: string;
  username?: string;
  password?: string;
}

export interface PriceHistoryRequest {
  symbol: string;
  source?: string;
  start?: string;
  end?: string;
  interval?: string;
  random_agent?: boolean;
  show_log?: boolean;
}

export interface PriceHistoryResponse {
  symbol: string;
  start?: string;
  end?: string;
  interval?: string;
  data: any;
  source: string;
}

export interface PriceBoardRequest {
  symbols_list: string[];
  source?: string;
  random_agent?: boolean;
  show_log?: boolean;
}

export interface PriceBoardResponse {
  symbols: string[];
  data: any;
  source: string;
}

export interface CSVDownloadRequest {
  symbol: string;
  start_date: string;
  end_date: string;
  source?: string;
  interval?: string;
}

export interface CSVDownloadResponse {
  csv_data: string;
}

export interface SymbolsByGroupItem {
  symbol: string;
  [key: string]: unknown;
}

export class VnstockClient {
  private axiosInstance: AxiosInstance;
  private token: string | null = null;
  private config: VnstockConfig;
  private defaultTimeout: number;
  private csvDownloadTimeout: number;

  constructor(config: VnstockConfig) {
    this.config = config;
    
    // Get timeout from environment variable or use defaults
    // Default: 30s for regular requests, 180s (3 minutes) for CSV downloads
    this.defaultTimeout = parseInt(
      process.env.VNSTOCK_API_TIMEOUT || '30000',
      10
    );
    this.csvDownloadTimeout = parseInt(
      process.env.VNSTOCK_API_CSV_TIMEOUT || '180000',
      10
    );
    
    this.axiosInstance = axios.create({
      baseURL: config.baseUrl,
      timeout: this.defaultTimeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Set token if provided
    if (config.token) {
      this.token = config.token;
      this.axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${config.token}`;
    }

    // Add response interceptor to handle 401 errors (token expired)
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        // If we get a 401 and haven't already retried, clear token and re-authenticate
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          // Clear the expired token
          this.token = null;
          delete this.axiosInstance.defaults.headers.common['Authorization'];

          // Try to re-authenticate if credentials are available
          if (this.config.username && this.config.password) {
            try {
              await this.authenticate();
              // Retry the original request with new token
              originalRequest.headers['Authorization'] = `Bearer ${this.token}`;
              return this.axiosInstance(originalRequest);
            } catch (authError) {
              // Authentication failed, return original error
              return Promise.reject(error);
            }
          } else if (this.config.token) {
            // If using token auth, we can't refresh - return error
            return Promise.reject(error);
          }
        }

        return Promise.reject(error);
      }
    );
  }

  /**
   * Authenticate with vnstock API
   * If username/password are provided, login and store token
   * @param force If true, force re-authentication even if token exists
   */
  async authenticate(force: boolean = false): Promise<void> {
    if (this.token && !force) {
      return; // Already authenticated
    }

    if (!this.config.username || !this.config.password) {
      const errorMsg = 
        'Vnstock authentication requires username and password. ' +
        'Please set VNSTOCK_API_USERNAME and VNSTOCK_API_PASSWORD environment variables, ' +
        'or provide VNSTOCK_API_TOKEN for direct token authentication.';
      throw new Error(errorMsg);
    }

    try {
      // Clear any existing token before authenticating
      this.token = null;
      delete this.axiosInstance.defaults.headers.common['Authorization'];

      const response = await this.axiosInstance.post('/auth/login', {
        username: this.config.username,
        password: this.config.password,
      });

      this.token = response.data.access_token;
      this.axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${this.token}`;
    } catch (error: any) {
      throw new Error(`Vnstock authentication failed: ${error.message || 'Unknown error'}`);
    }
  }

  /**
   * Get price history for a symbol
   */
  async getPriceHistory(request: PriceHistoryRequest): Promise<PriceHistoryResponse> {
    await this.ensureAuthenticated();

    try {
      const response = await this.axiosInstance.post('/api/v1/trading/price-history', {
        symbol: request.symbol,
        source: request.source || 'vci',
        start: request.start,
        end: request.end,
        interval: request.interval || 'D',
        random_agent: request.random_agent || false,
        show_log: request.show_log || false,
      });

      return response.data;
    } catch (error: any) {
      throw new Error(`Failed to fetch price history: ${error.response?.data?.detail || error.message}`);
    }
  }

  /**
   * Get price board (current prices) for multiple symbols
   */
  async getPriceBoard(request: PriceBoardRequest): Promise<PriceBoardResponse> {
    await this.ensureAuthenticated();

    try {
      const response = await this.axiosInstance.post('/api/v1/trading/price-board', {
        symbols_list: request.symbols_list,
        source: request.source || 'vci',
        random_agent: request.random_agent || false,
        show_log: request.show_log || false,
      });

      return response.data;
    } catch (error: any) {
      throw new Error(`Failed to fetch price board: ${error.response?.data?.detail || error.message}`);
    }
  }

  /**
   * Download CSV data for a symbol
   * Uses a longer timeout than regular API calls since CSV generation can take time
   */
  async downloadCSV(request: CSVDownloadRequest): Promise<string> {
    await this.ensureAuthenticated();

    try {
      // Create a separate axios instance with longer timeout for CSV downloads
      const csvAxiosInstance = axios.create({
        baseURL: this.config.baseUrl,
        timeout: this.csvDownloadTimeout,
        headers: {
          'Content-Type': 'application/json',
          ...(this.token && { Authorization: `Bearer ${this.token}` }),
        },
      });

      const response = await csvAxiosInstance.post('/api/v1/download/csv-text', {
        symbol: request.symbol,
        start_date: request.start_date,
        end_date: request.end_date,
        source: request.source || 'vci',
        interval: request.interval || 'D',
      });

      return response.data.csv_data;
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || error.message;
      
      // Provide more helpful error message for timeout errors
      if (error.code === 'ECONNABORTED' || errorMessage.includes('timeout')) {
        throw new Error(
          `CSV download timeout after ${this.csvDownloadTimeout / 1000}s. ` +
          `The request may be processing a large date range. ` +
          `You can increase the timeout by setting VNSTOCK_API_CSV_TIMEOUT environment variable (current: ${this.csvDownloadTimeout}ms). ` +
          `Original error: ${errorMessage}`
        );
      }
      
      throw new Error(`Failed to download CSV: ${errorMessage}`);
    }
  }

  /**
   * Get list of symbols by predefined group (e.g. VN30, VN100)
   *
   * NOTE:
   * This uses the underlying VCI trading API directly instead of the vnstock
   * FastAPI wrapper because the current FastAPI implementation does not
   * expose a symbols-by-group endpoint. This mirrors the behaviour of the
   * Python vnstock `Listing.symbols_by_group` helper.
   */
  async getSymbolsByGroup(group: string): Promise<string[]> {
    const trimmedGroup = group.trim();
    if (!trimmedGroup) {
      throw new Error('Group name is required to fetch symbols by group');
    }

    const tradingBaseUrl =
      process.env.VCI_TRADING_BASE_URL || 'https://trading.vietcap.com.vn/api';

    try {
      const response = await axios.get<SymbolsByGroupItem[]>(
        `${tradingBaseUrl}/price/symbols/getByGroup`,
        {
          params: { group: trimmedGroup },
          timeout: 30000,
        }
      );

      const data = response.data;

      if (!Array.isArray(data)) {
        throw new Error(
          `Unexpected response format when fetching symbols for group "${trimmedGroup}"`
        );
      }

      const symbols = data
        .map((item) => {
          const value = (item as SymbolsByGroupItem).symbol;
          return typeof value === 'string' && value.trim().length > 0
            ? value.trim().toUpperCase()
            : null;
        })
        .filter((value): value is string => value !== null);

      // Ensure uniqueness
      return Array.from(new Set(symbols));
    } catch (error: any) {
      const message =
        error?.response?.data?.detail ||
        error?.message ||
        'Unknown error while fetching symbols by group';
      throw new Error(
        `Failed to fetch symbols for group "${trimmedGroup}" from VCI trading API: ${message}`
      );
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.axiosInstance.get('/api/v1/health');
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  /**
   * Ensure we're authenticated before making API calls
   */
  private async ensureAuthenticated(): Promise<void> {
    if (!this.token) {
      await this.authenticate();
    }
  }
}

// Singleton instance
let vnstockClientInstance: VnstockClient | null = null;

/**
 * Get or create vnstock client instance
 */
export function getVnstockClient(): VnstockClient | null {
  const baseUrl = process.env.VNSTOCK_API_URL;
  
  if (!baseUrl) {
    console.warn('VNSTOCK_API_URL not configured, vnstock integration disabled');
    return null;
  }

  if (!vnstockClientInstance) {
    const token = process.env.VNSTOCK_API_TOKEN;
    const username = process.env.VNSTOCK_API_USERNAME;
    const password = process.env.VNSTOCK_API_PASSWORD;

    // Warn if no authentication method is configured
    if (!token && (!username || !password)) {
      console.warn(
        '[VnstockClient] Warning: No authentication credentials configured. ' +
        'Set VNSTOCK_API_TOKEN, or VNSTOCK_API_USERNAME and VNSTOCK_API_PASSWORD. ' +
        'API calls will fail until authentication is configured.'
      );
    }

    vnstockClientInstance = new VnstockClient({
      baseUrl,
      token,
      username,
      password,
    });
  }

  return vnstockClientInstance;
}
