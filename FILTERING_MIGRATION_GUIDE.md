# Frontend Migration Guide - Adding Filtering Support

This guide helps frontend developers integrate the new filtering capabilities into their applications.

## Overview

The backend now supports comprehensive filtering on all Stock Analyses API endpoints. This guide shows how to:
1. Update existing API calls to support filters
2. Build filter UI components
3. Handle filter validation errors
4. Optimize performance with filters

---

## Quick Start

### Before (No Filtering)
```typescript
const response = await fetch('/api/stock-analyses?page=1&limit=20');
const data = await response.json();
```

### After (With Filtering)
```typescript
const params = new URLSearchParams({
  market: 'US',
  status: 'completed',
  favorite: 'true',
  minPrice: '100',
  page: '1',
  limit: '20'
});

const response = await fetch(`/api/stock-analyses?${params}`);
const data = await response.json();
```

**Key Point**: All existing API calls continue to work unchanged. Filters are optional additions.

---

## TypeScript Types

### 1. Create Filter Types

```typescript
// types/filters.ts

export interface StockAnalysisFilters {
  symbol?: string;
  market?: 'US' | 'VN';
  status?: string; // Comma-separated: "completed,draft"
  favorite?: boolean;
  createdFrom?: string; // YYYY-MM-DD
  createdTo?: string;
  updatedFrom?: string;
  updatedTo?: string;
  minPrice?: number;
  maxPrice?: number;
}

export interface DailyFactorFilters {
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string;
  minClose?: number;
  maxClose?: number;
  minVolume?: number;
  maxVolume?: number;
  volume_spike?: boolean;
  break_ma50?: boolean;
  break_ma200?: boolean;
  rsi_over_60?: boolean;
  market_up?: boolean;
  sector_up?: boolean;
  earnings_window?: boolean;
  short_covering?: boolean;
  macro_tailwind?: boolean;
  news_positive?: boolean;
}

export interface DailyScoreFilters {
  dateFrom?: string;
  dateTo?: string;
  minScore?: number;
  maxScore?: number;
  prediction?: 'HIGH_PROBABILITY' | 'MODERATE' | 'LOW_PROBABILITY';
  aboveThreshold?: boolean;
}

export interface PredictionFilters {
  dateFrom?: string;
  dateTo?: string;
  minScore?: number;
  maxScore?: number;
  prediction?: 'HIGH_PROBABILITY' | 'MODERATE' | 'LOW_PROBABILITY';
  minConfidence?: number;
  maxConfidence?: number;
}
```

### 2. Create API Helper Functions

```typescript
// lib/api/stock-analyses.ts

import { StockAnalysisFilters } from '@/types/filters';

export async function getStockAnalyses(
  filters: StockAnalysisFilters = {},
  page = 1,
  limit = 20
) {
  const params = new URLSearchParams();

  // Add filters
  if (filters.symbol) params.set('symbol', filters.symbol);
  if (filters.market) params.set('market', filters.market);
  if (filters.status) params.set('status', filters.status);
  if (filters.favorite !== undefined) params.set('favorite', String(filters.favorite));
  if (filters.createdFrom) params.set('createdFrom', filters.createdFrom);
  if (filters.createdTo) params.set('createdTo', filters.createdTo);
  if (filters.updatedFrom) params.set('updatedFrom', filters.updatedFrom);
  if (filters.updatedTo) params.set('updatedTo', filters.updatedTo);
  if (filters.minPrice !== undefined) params.set('minPrice', String(filters.minPrice));
  if (filters.maxPrice !== undefined) params.set('maxPrice', String(filters.maxPrice));

  // Add pagination
  params.set('page', String(page));
  params.set('limit', String(limit));

  const response = await fetch(`/api/stock-analyses?${params}`, {
    credentials: 'include' // For auth cookies
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch stock analyses');
  }

  return response.json();
}

export async function getDailyFactorData(
  analysisId: number,
  filters: DailyFactorFilters = {},
  page = 1,
  limit = 100
) {
  const params = new URLSearchParams();

  // Add filters
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  if (filters.minClose !== undefined) params.set('minClose', String(filters.minClose));
  if (filters.maxClose !== undefined) params.set('maxClose', String(filters.maxClose));
  if (filters.minVolume !== undefined) params.set('minVolume', String(filters.minVolume));
  if (filters.maxVolume !== undefined) params.set('maxVolume', String(filters.maxVolume));

  // Add factor flags
  if (filters.volume_spike !== undefined) params.set('volume_spike', String(filters.volume_spike));
  if (filters.break_ma50 !== undefined) params.set('break_ma50', String(filters.break_ma50));
  if (filters.break_ma200 !== undefined) params.set('break_ma200', String(filters.break_ma200));
  if (filters.rsi_over_60 !== undefined) params.set('rsi_over_60', String(filters.rsi_over_60));
  if (filters.market_up !== undefined) params.set('market_up', String(filters.market_up));
  if (filters.sector_up !== undefined) params.set('sector_up', String(filters.sector_up));
  if (filters.earnings_window !== undefined) params.set('earnings_window', String(filters.earnings_window));
  if (filters.short_covering !== undefined) params.set('short_covering', String(filters.short_covering));
  if (filters.macro_tailwind !== undefined) params.set('macro_tailwind', String(filters.macro_tailwind));
  if (filters.news_positive !== undefined) params.set('news_positive', String(filters.news_positive));

  params.set('page', String(page));
  params.set('limit', String(limit));

  const response = await fetch(
    `/api/stock-analyses/${analysisId}/daily-factor-data?${params}`,
    { credentials: 'include' }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch daily factor data');
  }

  return response.json();
}
```

---

## React Components

### 1. Stock Analysis Filter Component

```tsx
// components/StockAnalysisFilters.tsx

import { useState } from 'react';
import { StockAnalysisFilters } from '@/types/filters';

interface Props {
  onFilterChange: (filters: StockAnalysisFilters) => void;
  initialFilters?: StockAnalysisFilters;
}

export function StockAnalysisFilters({ onFilterChange, initialFilters = {} }: Props) {
  const [filters, setFilters] = useState<StockAnalysisFilters>(initialFilters);

  const handleChange = (key: keyof StockAnalysisFilters, value: any) => {
    const updated = { ...filters, [key]: value };
    setFilters(updated);
    onFilterChange(updated);
  };

  const handleReset = () => {
    setFilters({});
    onFilterChange({});
  };

  return (
    <div className="space-y-4 p-4 border rounded">
      <h3 className="font-semibold">Filters</h3>

      {/* Symbol Search */}
      <div>
        <label className="block text-sm font-medium mb-1">Symbol</label>
        <input
          type="text"
          placeholder="e.g., AAPL"
          value={filters.symbol || ''}
          onChange={(e) => handleChange('symbol', e.target.value || undefined)}
          className="w-full p-2 border rounded"
        />
      </div>

      {/* Market Select */}
      <div>
        <label className="block text-sm font-medium mb-1">Market</label>
        <select
          value={filters.market || ''}
          onChange={(e) => handleChange('market', e.target.value || undefined)}
          className="w-full p-2 border rounded"
        >
          <option value="">All Markets</option>
          <option value="US">US</option>
          <option value="VN">VN</option>
        </select>
      </div>

      {/* Status Multi-Select */}
      <div>
        <label className="block text-sm font-medium mb-1">Status</label>
        <select
          multiple
          value={filters.status?.split(',') || []}
          onChange={(e) => {
            const selected = Array.from(e.target.selectedOptions, opt => opt.value);
            handleChange('status', selected.length > 0 ? selected.join(',') : undefined);
          }}
          className="w-full p-2 border rounded"
        >
          <option value="draft">Draft</option>
          <option value="analyzing">Analyzing</option>
          <option value="processing">Processing</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {/* Favorite Checkbox */}
      <div>
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={filters.favorite || false}
            onChange={(e) => handleChange('favorite', e.target.checked || undefined)}
          />
          <span className="text-sm font-medium">Favorites Only</span>
        </label>
      </div>

      {/* Date Range */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-sm font-medium mb-1">Created From</label>
          <input
            type="date"
            value={filters.createdFrom || ''}
            onChange={(e) => handleChange('createdFrom', e.target.value || undefined)}
            className="w-full p-2 border rounded"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Created To</label>
          <input
            type="date"
            value={filters.createdTo || ''}
            onChange={(e) => handleChange('createdTo', e.target.value || undefined)}
            className="w-full p-2 border rounded"
          />
        </div>
      </div>

      {/* Price Range */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-sm font-medium mb-1">Min Price</label>
          <input
            type="number"
            placeholder="0"
            value={filters.minPrice || ''}
            onChange={(e) => handleChange('minPrice', e.target.value ? Number(e.target.value) : undefined)}
            className="w-full p-2 border rounded"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Max Price</label>
          <input
            type="number"
            placeholder="1000"
            value={filters.maxPrice || ''}
            onChange={(e) => handleChange('maxPrice', e.target.value ? Number(e.target.value) : undefined)}
            className="w-full p-2 border rounded"
          />
        </div>
      </div>

      {/* Reset Button */}
      <button
        onClick={handleReset}
        className="w-full py-2 px-4 bg-gray-200 hover:bg-gray-300 rounded"
      >
        Reset Filters
      </button>
    </div>
  );
}
```

### 2. Factor Flags Filter Component

```tsx
// components/FactorFlagsFilters.tsx

import { DailyFactorFilters } from '@/types/filters';

interface Props {
  filters: DailyFactorFilters;
  onChange: (filters: DailyFactorFilters) => void;
}

const FACTORS = [
  { key: 'volume_spike', label: 'Volume Spike' },
  { key: 'break_ma50', label: 'MA50 Breakout' },
  { key: 'break_ma200', label: 'MA200 Breakout' },
  { key: 'rsi_over_60', label: 'RSI > 60' },
  { key: 'market_up', label: 'Market Up' },
  { key: 'sector_up', label: 'Sector Up' },
  { key: 'earnings_window', label: 'Earnings Window' },
  { key: 'short_covering', label: 'Short Covering' },
  { key: 'macro_tailwind', label: 'Macro Tailwind' },
  { key: 'news_positive', label: 'Positive News' },
] as const;

export function FactorFlagsFilters({ filters, onChange }: Props) {
  const handleToggle = (key: keyof DailyFactorFilters) => {
    const current = filters[key];
    const updated = { ...filters };

    if (current === undefined) {
      updated[key] = true;
    } else if (current === true) {
      updated[key] = false;
    } else {
      delete updated[key];
    }

    onChange(updated);
  };

  return (
    <div className="space-y-2">
      <h4 className="font-medium">Factor Flags</h4>
      <div className="grid grid-cols-2 gap-2">
        {FACTORS.map(({ key, label }) => {
          const value = filters[key];
          return (
            <button
              key={key}
              onClick={() => handleToggle(key)}
              className={`p-2 text-sm rounded border ${
                value === true
                  ? 'bg-green-100 border-green-500'
                  : value === false
                  ? 'bg-red-100 border-red-500'
                  : 'bg-gray-50 border-gray-300'
              }`}
            >
              {label}
              {value === true && ' ✓'}
              {value === false && ' ✗'}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-gray-600">
        Click once for TRUE (✓), twice for FALSE (✗), three times to clear
      </p>
    </div>
  );
}
```

### 3. Using Filters in a Page

```tsx
// pages/stock-analyses.tsx

import { useState, useEffect } from 'react';
import { StockAnalysisFilters } from '@/components/StockAnalysisFilters';
import { getStockAnalyses } from '@/lib/api/stock-analyses';
import type { StockAnalysisFilters as Filters } from '@/types/filters';

export default function StockAnalysesPage() {
  const [filters, setFilters] = useState<Filters>({});
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    loadData();
  }, [filters, page]);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await getStockAnalyses(filters, page, 20);
      setData(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (newFilters: Filters) => {
    setFilters(newFilters);
    setPage(1); // Reset to first page on filter change
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Stock Analyses</h1>

      <div className="grid grid-cols-4 gap-4">
        {/* Filters Sidebar */}
        <div className="col-span-1">
          <StockAnalysisFilters
            onFilterChange={handleFilterChange}
            initialFilters={filters}
          />
        </div>

        {/* Results */}
        <div className="col-span-3">
          {loading && <div>Loading...</div>}
          {error && <div className="text-red-600">Error: {error}</div>}
          {data && (
            <>
              <div className="mb-4">
                Found {data.pagination.total} results
              </div>
              {/* Render your data here */}
              {data.items.map((item: any) => (
                <div key={item.id} className="border p-4 mb-2">
                  {item.symbol} - {item.name}
                </div>
              ))}

              {/* Pagination */}
              <div className="flex space-x-2 mt-4">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-4 py-2 border rounded disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="px-4 py-2">
                  Page {page} of {data.pagination.totalPages}
                </span>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={page >= data.pagination.totalPages}
                  className="px-4 py-2 border rounded disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

---

## Error Handling

### Handle Filter Validation Errors

```typescript
async function fetchWithFilters(filters: StockAnalysisFilters) {
  try {
    const data = await getStockAnalyses(filters);
    return { success: true, data };
  } catch (error: any) {
    // Check if it's a validation error (400)
    if (error.response?.status === 400) {
      const errorData = error.response.data;
      return {
        success: false,
        error: {
          type: 'validation',
          message: errorData.message,
          parameter: errorData.parameter,
          value: errorData.value
        }
      };
    }

    // Other errors
    return {
      success: false,
      error: {
        type: 'unknown',
        message: error.message || 'An error occurred'
      }
    };
  }
}

// Usage
const result = await fetchWithFilters({ createdFrom: 'invalid-date' });
if (!result.success) {
  if (result.error.type === 'validation') {
    alert(`Invalid ${result.error.parameter}: ${result.error.message}`);
  } else {
    alert(result.error.message);
  }
}
```

---

## Performance Optimization

### 1. Debounce Filter Changes

```typescript
import { useDebounce } from '@/hooks/useDebounce';

function MyComponent() {
  const [filters, setFilters] = useState<Filters>({});
  const debouncedFilters = useDebounce(filters, 300); // 300ms delay

  useEffect(() => {
    // This only fires 300ms after user stops typing
    loadData(debouncedFilters);
  }, [debouncedFilters]);

  return <StockAnalysisFilters onFilterChange={setFilters} />;
}
```

### 2. Cache Filter Results

```typescript
import { useQuery } from '@tanstack/react-query';

function useStockAnalyses(filters: Filters, page: number) {
  return useQuery({
    queryKey: ['stock-analyses', filters, page],
    queryFn: () => getStockAnalyses(filters, page),
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes
  });
}
```

### 3. URL State Synchronization

```typescript
import { useRouter } from 'next/router';
import { useEffect } from 'react';

function useFilterState() {
  const router = useRouter();

  // Parse filters from URL
  const filters: Filters = {
    symbol: router.query.symbol as string,
    market: router.query.market as 'US' | 'VN',
    favorite: router.query.favorite === 'true',
    // ... etc
  };

  // Update URL when filters change
  const setFilters = (newFilters: Filters) => {
    const query = { ...router.query };
    Object.entries(newFilters).forEach(([key, value]) => {
      if (value !== undefined) {
        query[key] = String(value);
      } else {
        delete query[key];
      }
    });
    router.push({ pathname: router.pathname, query }, undefined, { shallow: true });
  };

  return [filters, setFilters] as const;
}
```

---

## Migration Checklist

- [ ] Add filter types to your TypeScript definitions
- [ ] Create API helper functions with filter support
- [ ] Build filter UI components
- [ ] Update existing pages to use filters
- [ ] Add error handling for validation errors
- [ ] Implement debouncing for text inputs
- [ ] Add caching for filter results
- [ ] Consider URL state synchronization
- [ ] Test all filter combinations
- [ ] Update documentation

---

## Testing

### Example Jest Tests

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StockAnalysisFilters } from '@/components/StockAnalysisFilters';

describe('StockAnalysisFilters', () => {
  it('should call onFilterChange when symbol changes', async () => {
    const onFilterChange = jest.fn();
    render(<StockAnalysisFilters onFilterChange={onFilterChange} />);

    const input = screen.getByPlaceholderText('e.g., AAPL');
    fireEvent.change(input, { target: { value: 'TSLA' } });

    await waitFor(() => {
      expect(onFilterChange).toHaveBeenCalledWith({ symbol: 'TSLA' });
    });
  });

  it('should reset all filters', () => {
    const onFilterChange = jest.fn();
    render(
      <StockAnalysisFilters
        onFilterChange={onFilterChange}
        initialFilters={{ symbol: 'AAPL', market: 'US' }}
      />
    );

    const resetButton = screen.getByText('Reset Filters');
    fireEvent.click(resetButton);

    expect(onFilterChange).toHaveBeenCalledWith({});
  });
});
```

---

## Common Pitfalls

1. **Boolean Conversion**: Always convert to string for URL params
   ```typescript
   // ❌ Wrong
   params.set('favorite', filters.favorite);

   // ✅ Correct
   params.set('favorite', String(filters.favorite));
   ```

2. **Date Format**: Use YYYY-MM-DD format
   ```typescript
   // ❌ Wrong
   const date = new Date().toLocaleDateString(); // "1/20/2026"

   // ✅ Correct
   const date = new Date().toISOString().split('T')[0]; // "2026-01-20"
   ```

3. **Undefined vs Null**: Use undefined to omit parameters
   ```typescript
   // ❌ Wrong
   if (value) params.set('symbol', value);

   // ✅ Correct
   if (value !== undefined) params.set('symbol', value);
   ```

4. **Status Multi-Select**: Use comma-separated string
   ```typescript
   // ✅ Correct
   params.set('status', 'completed,draft,processing');
   ```

---

## Support

For questions or issues:
1. Check `FILTERING_SPECIFICATION.md` for full API details
2. See `FILTERING_EXAMPLES.md` for usage examples
3. Review `FILTERING_API_REFERENCE.md` for quick reference
4. Open an issue on GitHub with your question
