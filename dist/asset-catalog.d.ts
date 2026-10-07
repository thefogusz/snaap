export type Exchange = 'Binance' | 'Bybit' | 'OKX' | 'Bitget' | 'MEXC';
export type MarketTarget = { exchange: Exchange; pair: string };
export type Asset = { symbol: string; base: string; quote: string; market: string; sources: Exchange[] };
export const exchanges: Exchange[];
export const categories: string[][];
export function mergeCatalogs(catalogs: { exchange: string; items: { symbol: string; supported: boolean }[] }[], market: string): Asset[];
export function selectTargets(items: Asset[], pairs: string[], source?: string, frames?: string[]): MarketTarget[];
export function strategyTargets(spec: { exchange: Exchange[]; pairs: string[]; targets?: MarketTarget[] }): MarketTarget[];
