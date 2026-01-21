import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { getCurrentUser } from '../lib/auth-utils';
import { validateInput, watchlistCreateSchema, watchlistSymbolsSchema, watchlistUpdateSchema } from '../lib/validation';

const router = Router();

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

function dedupeSymbols(symbols: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of symbols) {
    const normalized = normalizeSymbol(s);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      out.push(normalized);
    }
  }
  return out;
}

function parseSymbolsJson(symbolsJson: string): string[] {
  try {
    const parsed: unknown = JSON.parse(symbolsJson);
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === 'string')) {
      return parsed;
    }
    return [];
  } catch {
    return [];
  }
}

function toApiWatchlist(watchlist: { id: number; userId: number; name: string; symbols: string; createdAt: Date; updatedAt: Date }) {
  return {
    id: watchlist.id,
    userId: watchlist.userId,
    name: watchlist.name,
    symbols: parseSymbolsJson(watchlist.symbols),
    createdAt: watchlist.createdAt,
    updatedAt: watchlist.updatedAt,
  };
}

router.get('/', async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = Number.parseInt(user.id, 10);
    if (!Number.isFinite(userId)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const watchlists = await prisma.watchlist.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        userId: true,
        name: true,
        symbols: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.json({ data: watchlists.map(toApiWatchlist) });
  } catch (error) {
    console.error('Error fetching watchlists:', error);
    return res.status(500).json({ error: 'Failed to fetch watchlists' });
  }
});

router.post('/', async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = Number.parseInt(user.id, 10);
    if (!Number.isFinite(userId)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const validated = validateInput(watchlistCreateSchema, req.body);
    const name = validated.name.trim();
    const symbols = dedupeSymbols(validated.symbols ?? []);

    const created = await prisma.watchlist.create({
      data: {
        userId,
        name,
        symbols: JSON.stringify(symbols),
      },
      select: {
        id: true,
        userId: true,
        name: true,
        symbols: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.status(201).json({ data: toApiWatchlist(created) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ error: 'Watchlist name already exists' });
    }

    console.error('Error creating watchlist:', error);
    return res.status(500).json({ error: 'Failed to create watchlist' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = Number.parseInt(user.id, 10);
    const watchlistId = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(userId) || !Number.isFinite(watchlistId)) {
      return res.status(400).json({ error: 'Invalid watchlist id' });
    }

    const watchlist = await prisma.watchlist.findUnique({
      where: { id: watchlistId },
      select: {
        id: true,
        userId: true,
        name: true,
        symbols: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!watchlist) {
      return res.status(404).json({ error: 'Watchlist not found' });
    }

    if (watchlist.userId !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    return res.json({ data: toApiWatchlist(watchlist) });
  } catch (error) {
    console.error('Error fetching watchlist:', error);
    return res.status(500).json({ error: 'Failed to fetch watchlist' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = Number.parseInt(user.id, 10);
    const watchlistId = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(userId) || !Number.isFinite(watchlistId)) {
      return res.status(400).json({ error: 'Invalid watchlist id' });
    }

    const existing = await prisma.watchlist.findUnique({
      where: { id: watchlistId },
      select: { id: true, userId: true },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Watchlist not found' });
    }

    if (existing.userId !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const validated = validateInput(watchlistUpdateSchema, req.body);

    if (validated.name === undefined && validated.symbols === undefined) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const data: { name?: string; symbols?: string } = {};
    if (validated.name !== undefined) {
      data.name = validated.name.trim();
    }
    if (validated.symbols !== undefined) {
      data.symbols = JSON.stringify(dedupeSymbols(validated.symbols));
    }

    const updated = await prisma.watchlist.update({
      where: { id: watchlistId },
      data,
      select: {
        id: true,
        userId: true,
        name: true,
        symbols: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.json({ data: toApiWatchlist(updated) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ error: 'Watchlist name already exists' });
    }

    console.error('Error updating watchlist:', error);
    return res.status(500).json({ error: 'Failed to update watchlist' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = Number.parseInt(user.id, 10);
    const watchlistId = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(userId) || !Number.isFinite(watchlistId)) {
      return res.status(400).json({ error: 'Invalid watchlist id' });
    }

    const existing = await prisma.watchlist.findUnique({
      where: { id: watchlistId },
      select: { id: true, userId: true },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Watchlist not found' });
    }

    if (existing.userId !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await prisma.watchlist.delete({ where: { id: watchlistId } });

    return res.json({ data: { id: watchlistId } });
  } catch (error) {
    console.error('Error deleting watchlist:', error);
    return res.status(500).json({ error: 'Failed to delete watchlist' });
  }
});

router.post('/:id/symbols', async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = Number.parseInt(user.id, 10);
    const watchlistId = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(userId) || !Number.isFinite(watchlistId)) {
      return res.status(400).json({ error: 'Invalid watchlist id' });
    }

    const watchlist = await prisma.watchlist.findUnique({
      where: { id: watchlistId },
      select: { id: true, userId: true, symbols: true, updatedAt: true },
    });

    if (!watchlist) {
      return res.status(404).json({ error: 'Watchlist not found' });
    }

    if (watchlist.userId !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const validated = validateInput(watchlistSymbolsSchema, req.body);
    const existingSymbols = dedupeSymbols(parseSymbolsJson(watchlist.symbols));
    const addedSymbols = dedupeSymbols(validated.symbols);

    const merged = dedupeSymbols([...existingSymbols, ...addedSymbols]);

    const updated = await prisma.watchlist.update({
      where: { id: watchlistId },
      data: { symbols: JSON.stringify(merged) },
      select: { id: true, userId: true, name: true, symbols: true, createdAt: true, updatedAt: true },
    });

    return res.json({ data: toApiWatchlist(updated) });
  } catch (error) {
    console.error('Error adding symbols to watchlist:', error);
    return res.status(500).json({ error: 'Failed to add symbols' });
  }
});

router.delete('/:id/symbols', async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = Number.parseInt(user.id, 10);
    const watchlistId = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(userId) || !Number.isFinite(watchlistId)) {
      return res.status(400).json({ error: 'Invalid watchlist id' });
    }

    const watchlist = await prisma.watchlist.findUnique({
      where: { id: watchlistId },
      select: { id: true, userId: true, symbols: true },
    });

    if (!watchlist) {
      return res.status(404).json({ error: 'Watchlist not found' });
    }

    if (watchlist.userId !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const validated = validateInput(watchlistSymbolsSchema, req.body);
    const toRemove = new Set(dedupeSymbols(validated.symbols));
    const existingSymbols = dedupeSymbols(parseSymbolsJson(watchlist.symbols));
    const remaining = existingSymbols.filter((s) => !toRemove.has(normalizeSymbol(s)));

    const updated = await prisma.watchlist.update({
      where: { id: watchlistId },
      data: { symbols: JSON.stringify(remaining) },
      select: { id: true, userId: true, name: true, symbols: true, createdAt: true, updatedAt: true },
    });

    return res.json({ data: toApiWatchlist(updated) });
  } catch (error) {
    console.error('Error removing symbols from watchlist:', error);
    return res.status(500).json({ error: 'Failed to remove symbols' });
  }
});

export default router;

