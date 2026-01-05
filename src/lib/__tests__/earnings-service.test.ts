import { EarningsService } from '../earnings-service';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('EarningsService', () => {
    let earningsService: EarningsService;
    const apiKey = 'test_api_key';

    beforeEach(() => {
        earningsService = new EarningsService(apiKey);
        jest.clearAllMocks();
    });

    describe('fetchEarnings', () => {
        it('should fetch earnings data for a symbol', async () => {
            const mockData = {
                symbol: 'AAPL',
                name: 'Apple Inc',
                quarterlyEarnings: [
                    {
                        fiscalDateEnding: '2023-12-31',
                        reportedDate: '2024-02-01',
                        reportedEPS: '2.1',
                        estimatedEPS: '2.0',
                        revenue: '119575000000',
                        estimatedRevenue: '117910000000'
                    }
                ]
            };

            mockedAxios.get.mockResolvedValueOnce({ data: mockData });

            const result = await earningsService.fetchEarnings('AAPL');

            expect(mockedAxios.get).toHaveBeenCalledWith('https://www.alphavantage.co/query', {
                params: {
                    function: 'EARNINGS',
                    symbol: 'AAPL',
                    apikey: apiKey,
                },
                timeout: 30000,
            });
            expect(result.symbol).toBe('AAPL');
            expect(result.earnings).toHaveLength(1);
        });

        it('should throw error if API key is missing', async () => {
            const originalKey = process.env.ALPHA_VANTAGE_API_KEY;
            delete process.env.ALPHA_VANTAGE_API_KEY;

            const serviceNoKey = new EarningsService('');

            await expect(serviceNoKey.fetchEarnings('AAPL')).rejects.toThrow('Alpha Vantage API key is required');

            process.env.ALPHA_VANTAGE_API_KEY = originalKey;
        });

        it('should handle Alpha Vantage API error message', async () => {
            mockedAxios.get.mockResolvedValueOnce({
                data: { 'Error Message': 'Invalid API call' }
            });

            await expect(earningsService.fetchEarnings('INVALID')).rejects.toThrow('Alpha Vantage API error: Invalid API call');
        });

        it('should handle Alpha Vantage rate limit note', async () => {
            mockedAxios.get.mockResolvedValueOnce({
                data: { 'Note': 'Thank you for using Alpha Vantage! Our standard API rate limit is 5 calls per minute and 500 calls per day.' }
            });

            await expect(earningsService.fetchEarnings('AAPL')).rejects.toThrow('Alpha Vantage API rate limit exceeded');
        });
    });

    describe('transformAlphaVantageData', () => {
        it('should transform Alpha Vantage response to EarningsData array', () => {
            const mockResponse = {
                symbol: 'AAPL',
                name: 'Apple Inc',
                earnings: [
                    {
                        fiscalDateEnding: '2023-12-31',
                        reportedEPS: '2.1',
                        estimatedEPS: '2.0',
                        revenue: '119575000000',
                        estimatedRevenue: '117910000000'
                    }
                ]
            };

            const transformed = earningsService.transformAlphaVantageData(mockResponse);

            expect(transformed).toHaveLength(1);
            expect(transformed[0]).toEqual({
                symbol: 'AAPL',
                company: 'Apple Inc',
                earningsDate: new Date('2023-12-31'),
                reportType: 'quarterly',
                expectedEPS: 2.0,
                actualEPS: 2.1,
                surprise: 0.05, // (2.1 - 2.0) / 2.0
                revenue: 119575000000,
                expectedRevenue: 117910000000
            });
        });
    });

    describe('getEarningsData', () => {
        it('should fetch and transform data', async () => {
            const mockData = {
                symbol: 'AAPL',
                name: 'Apple Inc',
                quarterlyEarnings: [
                    {
                        fiscalDateEnding: '2023-12-31',
                        reportedEPS: '2.1',
                        estimatedEPS: '2.0'
                    }
                ]
            };

            mockedAxios.get.mockResolvedValueOnce({ data: mockData });

            const result = await earningsService.getEarningsData('AAPL');

            expect(result).toHaveLength(1);
            expect(result[0].symbol).toBe('AAPL');
            expect(result[0].actualEPS).toBe(2.1);
        });
    });
});
