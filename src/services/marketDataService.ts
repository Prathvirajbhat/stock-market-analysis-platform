// ============================================================
//  Bharat AlphaPulse — Market Data Service
//  Fetches real NSE/BSE quotes via Yahoo Finance (Vite proxy)
//  ALL fetch calls use AbortSignal.timeout(6000)
//  Max 5 concurrent Yahoo Finance requests
// ============================================================

export interface RealTimeQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  volume: number;
  timestamp: Date;
  isRealTime: boolean;
}

export interface CandleData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ComputedTechnicals {
  ema9: number;
  ema20: number;
  ema50: number;
  ema200: number;
  rsi14: number;
  macdLine: number;
  macdSignal: number;
  macdHistogram: number;
  atr14: number;
  adx: number;
  pivotPoint: number;
  resistance1: number;
  resistance2: number;
  support1: number;
  support2: number;
  volumeAvg20: number;
  volumeRatio: number;
  weekHigh52: number;
  weekLow52: number;
  nearWeekHigh52: boolean;
  supertrend: 'BUY' | 'SELL';
  supertrendValue: number;
  bollingerUpper: number;
  bollingerLower: number;
  bollingerMiddle: number;
  currentVolume: number;
  vwap: number;
}

// Map of internal stock IDs → Yahoo Finance ticker symbols
export const NSE_SYMBOL_MAP: Record<string, string> = {
  HAL: 'HAL.NS',
  BEL: 'BEL.NS',
  LT: 'LT.NS',
  RVNL: 'RVNL.NS',
  BDL: 'BDL.NS',
  TATAMOTORS: 'TATAMOTORS.NS',
  DIXON: 'DIXON.NS',
  INFY: 'INFY.NS',
  TCS: 'TCS.NS',
  SBIN: 'SBIN.NS',
  HDFCBANK: 'HDFCBANK.NS',
  ICICIBANK: 'ICICIBANK.NS',
  ADANIGREEN: 'ADANIGREEN.NS',
  TATAPOWER: 'TATAPOWER.NS',
  MM: 'M%26M.NS',        // M&M — ampersand must be URL-encoded
  BHEL: 'BHEL.NS',
  BHARTIARTL: 'BHARTIARTL.NS',
  COCHINSHIP: 'COCHINSHIP.NS',
  IRCON: 'IRCON.NS',
  MAZDOCK: 'MAZDOCK.NS',
};

export const INDEX_SYMBOLS: Record<string, string> = {
  'NIFTY 50': '%5ENSEI',
  'SENSEX': '%5EBSESN',
  'BANK NIFTY': '%5ENSEBANK',
};

// ─── Market Status ──────────────────────────────────────────
export function isNSEMarketOpen(): { isOpen: boolean; statusLabel: string; reason: string } {
  const now = new Date();
  const istString = now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  const istDate = new Date(istString);

  const day = istDate.getDay(); // 0 = Sun, 6 = Sat
  const hours = istDate.getHours();
  const minutes = istDate.getMinutes();
  const timeInMinutes = hours * 60 + minutes;

  if (day === 0 || day === 6) {
    return {
      isOpen: false,
      statusLabel: 'MARKET CLOSED (Weekend)',
      reason: 'NSE/BSE is closed on weekends. Prices are locked at Friday 3:30 PM IST close.',
    };
  }

  if (timeInMinutes >= 540 && timeInMinutes < 555) {
    return {
      isOpen: false,
      statusLabel: 'PRE-MARKET (09:00 - 09:15 IST)',
      reason: 'Pre-market discovery phase active. Order matching starts at 09:15 AM IST.',
    };
  }

  if (timeInMinutes >= 555 && timeInMinutes <= 930) {
    return {
      isOpen: true,
      statusLabel: 'MARKET LIVE (09:15 - 15:30 IST)',
      reason: 'Live market trading active on NSE/BSE.',
    };
  }

  return {
    isOpen: false,
    statusLabel: 'MARKET CLOSED (3:30 PM IST)',
    reason: 'Indian stock market closed at 3:30 PM IST. Live price fluctuations are paused until tomorrow morning.',
  };
}

// ─── Freshness label ─────────────────────────────────────────
export function getDataFreshness(timestamp: Date | null): 'live' | 'delayed' | 'stale' | 'unavailable' {
  if (!timestamp) return 'unavailable';
  const ageMs = Date.now() - timestamp.getTime();
  const ageMin = ageMs / 60000;
  const { isOpen } = isNSEMarketOpen();
  if (ageMin < 5 && isOpen) return 'live';
  if (ageMin < 60) return 'delayed';
  return 'stale';
}

// ─── localStorage helpers ─────────────────────────────────────
export function saveToCache<T>(key: string, data: T): void {
  try {
    localStorage.setItem(`bap_${key}`, JSON.stringify({ data, cachedAt: new Date().toISOString() }));
  } catch { /* ignore quota errors */ }
}

export function loadFromCache<T>(key: string, maxAgeMs?: number): { data: T; cachedAt: Date } | null {
  try {
    const raw = localStorage.getItem(`bap_${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data: T; cachedAt: string };
    const cachedAt = new Date(parsed.cachedAt);
    if (maxAgeMs && Date.now() - cachedAt.getTime() > maxAgeMs) return null;
    return { data: parsed.data, cachedAt };
  } catch {
    return null;
  }
}

// ─── Internal batch fetch helper ──────────────────────────────
async function batchFetch<T>(
  items: string[],
  fetchFn: (item: string) => Promise<T | null>,
  concurrency = 5,
): Promise<Map<string, T>> {
  const results = new Map<string, T>();
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const settled = await Promise.allSettled(chunk.map(item => fetchFn(item)));
    settled.forEach((res, idx) => {
      if (res.status === 'fulfilled' && res.value !== null) {
        results.set(chunk[idx], res.value as T);
      }
    });
    if (i + concurrency < items.length) {
      await new Promise(r => setTimeout(r, 200)); // gentle rate-limit
    }
  }
  return results;
}

// ─── Single quote fetch ────────────────────────────────────────
export async function fetchRealTimeQuote(stockId: string): Promise<RealTimeQuote | null> {
  const ticker = NSE_SYMBOL_MAP[stockId] || `${stockId}.NS`;
  const url = `/api/yahoo/v8/finance/chart/${ticker}?interval=1d&range=1d`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = await res.json() as {
      chart?: { result?: Array<{ meta: Record<string, number> }> | null };
    };
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return null;

    const price: number = meta['regularMarketPrice'] ?? meta['chartPreviousClose'] ?? 0;
    const previousClose: number = meta['chartPreviousClose'] ?? price;
    const change = price - previousClose;
    const changePercent = previousClose > 0 ? (change / previousClose) * 100 : 0;

    return {
      symbol: stockId,
      price,
      change,
      changePercent,
      high: meta['regularMarketDayHigh'] ?? price,
      low: meta['regularMarketDayLow'] ?? price,
      open: meta['regularMarketDayOpen'] ?? price,
      previousClose,
      volume: meta['regularMarketVolume'] ?? 0,
      timestamp: new Date(),
      isRealTime: true,
    };
  } catch {
    return null;
  }
}

// ─── Bulk fetch all 20 stocks ──────────────────────────────────
export async function fetchAllRealTimeQuotes(): Promise<Map<string, RealTimeQuote>> {
  const stockIds = Object.keys(NSE_SYMBOL_MAP);
  return batchFetch(stockIds, fetchRealTimeQuote, 5);
}

// ─── Market index fetch ────────────────────────────────────────
export async function fetchMarketIndices(): Promise<Array<{
  name: string;
  value: number;
  change: number;
  changePercent: number;
  timestamp: Date;
}>> {
  const indexEntries = Object.entries(INDEX_SYMBOLS);
  const results: Array<{ name: string; value: number; change: number; changePercent: number; timestamp: Date }> = [];

  await Promise.allSettled(
    indexEntries.map(async ([name, ticker]) => {
      const url = `/api/yahoo/v8/finance/chart/${ticker}?interval=1d&range=1d`;
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
        if (!res.ok) return;
        const data = await res.json() as {
          chart?: { result?: Array<{ meta: Record<string, number> }> | null };
        };
        const meta = data?.chart?.result?.[0]?.meta;
        if (!meta) return;
        const value: number = meta['regularMarketPrice'] ?? 0;
        const prev: number = meta['chartPreviousClose'] ?? value;
        const change = value - prev;
        const changePercent = prev > 0 ? (change / prev) * 100 : 0;
        results.push({ name, value, change, changePercent, timestamp: new Date() });
      } catch { /* skip */ }
    })
  );
  return results;
}

// ─── Historical OHLCV candles ──────────────────────────────────
export async function fetchHistoricalCandles(
  stockId: string,
  range: '1d' | '5d' | '1mo' | '3mo' | '6mo' | '1y' = '6mo',
  interval: '1m' | '5m' | '15m' | '1d' = '1d',
): Promise<CandleData[]> {
  const ticker = NSE_SYMBOL_MAP[stockId] || `${stockId}.NS`;
  const url = `/api/yahoo/v8/finance/chart/${ticker}?interval=${interval}&range=${range}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const data = await res.json() as {
      chart?: {
        result?: Array<{
          timestamp: number[];
          indicators: {
            quote: Array<{
              open: (number | null)[];
              high: (number | null)[];
              low: (number | null)[];
              close: (number | null)[];
              volume: (number | null)[];
            }>;
          };
        }> | null;
      };
    };

    const result = data?.chart?.result?.[0];
    if (!result) return [];

    const { timestamp, indicators } = result;
    const quote = indicators?.quote?.[0];
    if (!timestamp || !quote) return [];

    const candles: CandleData[] = [];
    for (let i = 0; i < timestamp.length; i++) {
      const o = quote.open?.[i];
      const h = quote.high?.[i];
      const l = quote.low?.[i];
      const c = quote.close?.[i];
      const v = quote.volume?.[i];
      if (o == null || h == null || l == null || c == null) continue;

      // For intraday, keep as ISO datetime; for daily keep YYYY-MM-DD
      const dt = new Date(timestamp[i] * 1000);
      const dateStr = interval === '1d'
        ? dt.toISOString().split('T')[0]
        : dt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false });

      candles.push({
        date: dateStr,
        open: Math.round(o * 100) / 100,
        high: Math.round(h * 100) / 100,
        low: Math.round(l * 100) / 100,
        close: Math.round(c * 100) / 100,
        volume: v ?? 0,
      });
    }
    return candles;
  } catch {
    return [];
  }
}

// ─── EMA helper ───────────────────────────────────────────────
function calcEMA(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result: number[] = [];
  let ema = values[0];
  result.push(ema);
  for (let i = 1; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    result.push(ema);
  }
  return result;
}

// ─── Technical indicator computation from OHLCV ────────────────
export function computeTechnicals(candles: CandleData[], currentPrice: number): ComputedTechnicals {
  if (candles.length < 2) {
    const p = currentPrice;
    return {
      ema9: p, ema20: p, ema50: p, ema200: p,
      rsi14: 50, macdLine: 0, macdSignal: 0, macdHistogram: 0,
      atr14: p * 0.02, adx: 20,
      pivotPoint: p, resistance1: p * 1.01, resistance2: p * 1.02,
      support1: p * 0.99, support2: p * 0.98,
      volumeAvg20: 0, volumeRatio: 1, weekHigh52: p, weekLow52: p,
      nearWeekHigh52: false, supertrend: 'BUY', supertrendValue: p * 0.97,
      bollingerUpper: p * 1.02, bollingerLower: p * 0.98, bollingerMiddle: p,
      currentVolume: 0, vwap: p,
    };
  }

  const closes = candles.map(c => c.close);
  const highs  = candles.map(c => c.high);
  const lows   = candles.map(c => c.low);
  const vols   = candles.map(c => c.volume);

  // EMAs
  const ema9arr  = calcEMA(closes, 9);
  const ema20arr = calcEMA(closes, 20);
  const ema50arr = calcEMA(closes, 50);
  const ema200arr = calcEMA(closes, 200);

  // RSI-14 (Wilder smoothing)
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= 14 && i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff; else avgLoss -= diff;
  }
  avgGain /= 14; avgLoss /= 14;
  for (let i = 15; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    avgGain = (avgGain * 13 + g) / 14;
    avgLoss = (avgLoss * 13 + l) / 14;
  }
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  const rsi14 = Math.round((100 - 100 / (1 + rs)) * 10) / 10;

  // ATR-14 (Wilder)
  const trValues: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    trValues.push(Math.max(hl, hc, lc));
  }
  let atr14 = trValues.slice(0, 14).reduce((a, b) => a + b, 0) / 14;
  for (let i = 14; i < trValues.length; i++) {
    atr14 = (atr14 * 13 + trValues[i]) / 14;
  }

  // MACD (12, 26, 9)
  const ema12arr = calcEMA(closes, 12);
  const ema26arr = calcEMA(closes, 26);
  const macdSeries = ema12arr.map((v, i) => v - ema26arr[i]);
  const signalArr = calcEMA(macdSeries, 9);
  const macdLine = macdSeries[macdSeries.length - 1];
  const macdSignalVal = signalArr[signalArr.length - 1];

  // ADX (simplified DX over 14 periods)
  let adx = 20;
  if (candles.length >= 15) {
    const dxArr: number[] = [];
    for (let i = 1; i < candles.length && i <= 28; i++) {
      const upMove = highs[i] - highs[i - 1];
      const downMove = lows[i - 1] - lows[i];
      const plusDM = upMove > downMove && upMove > 0 ? upMove : 0;
      const minusDM = downMove > upMove && downMove > 0 ? downMove : 0;
      const tr = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
      if (tr === 0) continue;
      const plusDI = (plusDM / tr) * 100;
      const minusDI = (minusDM / tr) * 100;
      const diDiff = Math.abs(plusDI - minusDI);
      const diSum = plusDI + minusDI;
      if (diSum > 0) dxArr.push((diDiff / diSum) * 100);
    }
    if (dxArr.length > 0) adx = Math.round(dxArr.reduce((a, b) => a + b, 0) / dxArr.length);
  }

  // Pivot points (from last completed day)
  const prev = candles[candles.length - 2] ?? candles[candles.length - 1];
  const pivotPoint = (prev.high + prev.low + prev.close) / 3;
  const resistance1 = 2 * pivotPoint - prev.low;
  const resistance2 = pivotPoint + (prev.high - prev.low);
  const support1 = 2 * pivotPoint - prev.high;
  const support2 = pivotPoint - (prev.high - prev.low);

  // Volume stats
  const lastN = Math.min(20, vols.length);
  const volumeAvg20 = vols.slice(-lastN).reduce((a, b) => a + b, 0) / lastN;
  const currentVolume = vols[vols.length - 1] ?? 0;
  const volumeRatio = volumeAvg20 > 0 ? currentVolume / volumeAvg20 : 1;

  // 52-week high/low
  const weekHigh52 = Math.max(...highs.slice(-252));
  const weekLow52  = Math.min(...lows.slice(-252));
  const nearWeekHigh52 = currentPrice >= weekHigh52 * 0.95;

  // Supertrend (ATR×3, period 7)
  const atr7 = atr14 * 0.7; // approximate ATR-7
  const lastIdx = candles.length - 1;
  const midHL = (highs[lastIdx] + lows[lastIdx]) / 2;
  const upperBand = midHL + 3 * atr7;
  const supertrend: 'BUY' | 'SELL' = closes[lastIdx] > upperBand ? 'BUY' : 'SELL';
  const supertrendValue = closes[lastIdx] > upperBand ? midHL - 3 * atr7 : upperBand;

  // Bollinger Bands (20, 2)
  const bb20 = closes.slice(-20);
  const bbMid = bb20.reduce((a, b) => a + b, 0) / bb20.length;
  const bbStd = Math.sqrt(bb20.reduce((a, b) => a + Math.pow(b - bbMid, 2), 0) / bb20.length);
  const bollingerUpper = bbMid + 2 * bbStd;
  const bollingerLower = bbMid - 2 * bbStd;

  // VWAP (cumulative for available candles)
  let cumPV = 0, cumV = 0;
  for (const c of candles.slice(-Math.min(78, candles.length))) {
    const typicalPrice = (c.high + c.low + c.close) / 3;
    cumPV += typicalPrice * c.volume;
    cumV += c.volume;
  }
  const vwap = cumV > 0 ? cumPV / cumV : currentPrice;

  return {
    ema9:  Math.round(ema9arr[ema9arr.length - 1] * 100) / 100,
    ema20: Math.round(ema20arr[ema20arr.length - 1] * 100) / 100,
    ema50: Math.round(ema50arr[ema50arr.length - 1] * 100) / 100,
    ema200: Math.round(ema200arr[ema200arr.length - 1] * 100) / 100,
    rsi14,
    macdLine: Math.round(macdLine * 100) / 100,
    macdSignal: Math.round(macdSignalVal * 100) / 100,
    macdHistogram: Math.round((macdLine - macdSignalVal) * 100) / 100,
    atr14: Math.round(atr14 * 100) / 100,
    adx,
    pivotPoint: Math.round(pivotPoint * 100) / 100,
    resistance1: Math.round(resistance1 * 100) / 100,
    resistance2: Math.round(resistance2 * 100) / 100,
    support1: Math.round(support1 * 100) / 100,
    support2: Math.round(support2 * 100) / 100,
    volumeAvg20: Math.round(volumeAvg20),
    volumeRatio: Math.round(volumeRatio * 100) / 100,
    weekHigh52: Math.round(weekHigh52 * 100) / 100,
    weekLow52: Math.round(weekLow52 * 100) / 100,
    nearWeekHigh52,
    supertrend,
    supertrendValue: Math.round(supertrendValue * 100) / 100,
    bollingerUpper: Math.round(bollingerUpper * 100) / 100,
    bollingerLower: Math.round(bollingerLower * 100) / 100,
    bollingerMiddle: Math.round(bbMid * 100) / 100,
    currentVolume,
    vwap: Math.round(vwap * 100) / 100,
  };
}


// ─── Global market instruments ───────────────────────────────
export interface GlobalMarketItem {
  name: string;
  ticker: string;       // Yahoo Finance symbol
  category: 'index' | 'commodity' | 'forex' | 'crypto';
  value: number;
  change: number;
  changePercent: number;
  timestamp: Date;
  currency: string;
}

export const GLOBAL_TICKERS: Array<{ name: string; ticker: string; category: GlobalMarketItem['category']; currency: string }> = [
  { name: 'S&P 500',    ticker: '%5EGSPC',   category: 'index',     currency: 'USD' },
  { name: 'NASDAQ',     ticker: '%5EIXIC',   category: 'index',     currency: 'USD' },
  { name: 'DOW JONES',  ticker: '%5EDJI',    category: 'index',     currency: 'USD' },
  { name: 'FTSE 100',   ticker: '%5EFTSE',   category: 'index',     currency: 'GBP' },
  { name: 'Nikkei 225', ticker: '%5EN225',   category: 'index',     currency: 'JPY' },
  { name: 'Hang Seng',  ticker: '%5EHSI',    category: 'index',     currency: 'HKD' },
  { name: 'SGX Nifty',  ticker: 'NIFTY.SG',  category: 'index',     currency: 'USD' },
  { name: 'Gold',       ticker: 'GC%3DF',    category: 'commodity', currency: 'USD' },
  { name: 'Crude Oil',  ticker: 'CL%3DF',    category: 'commodity', currency: 'USD' },
  { name: 'Silver',     ticker: 'SI%3DF',    category: 'commodity', currency: 'USD' },
  { name: 'USD/INR',    ticker: 'INR%3DX',   category: 'forex',     currency: 'INR' },
  { name: 'US 10Y',     ticker: '%5ETNX',    category: 'index',     currency: 'USD' },
  { name: 'VIX',        ticker: '%5EVIX',    category: 'index',     currency: 'USD' },
];

export async function fetchGlobalMarkets(): Promise<GlobalMarketItem[]> {
  const results: GlobalMarketItem[] = [];

  // Batch in groups of 5
  for (let i = 0; i < GLOBAL_TICKERS.length; i += 5) {
    const chunk = GLOBAL_TICKERS.slice(i, i + 5);
    await Promise.allSettled(
      chunk.map(async ({ name, ticker, category, currency }) => {
        try {
          const url = `/api/yahoo/v8/finance/chart/${ticker}?interval=1d&range=1d`;
          const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
          if (!res.ok) return;
          const data = await res.json() as {
            chart?: { result?: Array<{ meta: Record<string, number> }> | null };
          };
          const meta = data?.chart?.result?.[0]?.meta;
          if (!meta) return;
          const value: number = meta['regularMarketPrice'] ?? 0;
          const prev: number  = meta['chartPreviousClose'] ?? value;
          const change = value - prev;
          const changePercent = prev > 0 ? (change / prev) * 100 : 0;
          results.push({ name, ticker, category, currency, value, change, changePercent, timestamp: new Date() });
        } catch { /* skip */ }
      })
    );
    if (i + 5 < GLOBAL_TICKERS.length) await new Promise(r => setTimeout(r, 150));
  }
  return results;
}

// ─── Yahoo Finance news search ──────────────────────────────
export interface NewsItem {
  title: string;
  publisher: string;
  link: string;
  providerPublishTime: number; // Unix timestamp
  type: string;
  relatedTickers?: string[];
  summary?: string;
}

export async function fetchMarketNews(query: string): Promise<NewsItem[]> {
  try {
    const url = `/api/yahoo/v1/finance/search?q=${encodeURIComponent(query)}&newsCount=15&quotesCount=0&enableNavLinks=false`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = await res.json() as { news?: NewsItem[] };
    return data?.news ?? [];
  } catch {
    return [];
  }
}
