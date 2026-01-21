export interface Watchlist {
  id: number;
  userId: number;
  name: string;
  symbols: string[];
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface CreateWatchlistInput {
  name: string;
  symbols?: string[];
}

export interface UpdateWatchlistInput {
  name?: string;
  symbols?: string[];
}

export interface SymbolsInput {
  symbols: string[];
}

