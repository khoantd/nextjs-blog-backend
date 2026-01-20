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

export class VnstockClient {
  private axiosInstance: AxiosInstance;
  private token: string | null = null;
  private config: VnstockConfig;

  constructor(config: VnstockConfig) {
    this.config = config;
    this.axiosInstance = axios.create({
      baseURL: config.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Set token if provided
    if (config.token) {
      this.token = config.token;
      this.axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${config.token}`;
    }
  }

  /**
   * Authenticate with vnstock API
   * If username/password are provided, login and store token
   */
  async authenticate(): Promise<void> {
    if (this.token) {
      return; // Already authenticated
    }

    if (!this.config.username || !this.config.password) {
      throw new Error('Vnstock authentication requires username and password');
    }

    try {
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
   */
  async downloadCSV(request: CSVDownloadRequest): Promise<string> {
    await this.ensureAuthenticated();

    try {
      const response = await this.axiosInstance.post('/api/v1/download/csv-text', {
        symbol: request.symbol,
        start_date: request.start_date,
        end_date: request.end_date,
        source: request.source || 'vci',
        interval: request.interval || 'D',
      });

      return response.data.csv_data;
    } catch (error: any) {
      throw new Error(`Failed to download CSV: ${error.response?.data?.detail || error.message}`);
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
    vnstockClientInstance = new VnstockClient({
      baseUrl,
      token: process.env.VNSTOCK_API_TOKEN,
      username: process.env.VNSTOCK_API_USERNAME,
      password: process.env.VNSTOCK_API_PASSWORD,
    });
  }

  return vnstockClientInstance;
}
