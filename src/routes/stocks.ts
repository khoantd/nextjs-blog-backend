import { Router } from 'express';
import { getCurrentUser } from '../lib/auth-utils';
import { stockPriceService, Market } from '../lib/stock-price-service';

const router = Router();

/**
 * @openapi
 * /api/stocks/price:
 *   get:
 *     summary: Get latest stock price
 *     tags: [Stocks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: symbol
 *         schema:
 *           type: string
 *         required: true
 *         description: Stock symbol (e.g., AAPL, VIC)
 *       - in: query
 *         name: country
 *         schema:
 *           type: string
 *           enum: [US, VN]
 *           default: US
 *         description: Market country code
 *     responses:
 *       200:
 *         description: Stock price data
 *       400:
 *         description: Missing symbol
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error or external API error
 */
router.get('/price', async (req, res) => {
    try {
        const user = await getCurrentUser(req);
        if (!user) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const { symbol, country } = req.query;

        if (!symbol || typeof symbol !== 'string') {
            return res.status(400).json({ error: "Symbol is required" });
        }

        const market: Market = (country as Market) || 'US';
        if (!['US', 'VN'].includes(market)) {
            return res.status(400).json({ error: "Invalid country. Must be 'US' or 'VN'" });
        }

        const priceData = await stockPriceService.getPrice(symbol, market);

        return res.json(priceData);

    } catch (error: any) {
        console.error("Error fetching stock price:", error);
        // Return appropriate error message based on service error
        if (error.message.includes('No data found')) {
            return res.status(404).json({ error: error.message });
        }
        return res.status(500).json({ error: "Failed to fetch stock price" });
    }
});

export default router;
