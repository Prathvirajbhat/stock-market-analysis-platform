export interface StockFundamentals {
  marketCap: number; // in Crores INR
  peRatio: number;
  pbRatio: number;
  roce: number; // percentage
  roe: number; // percentage
  debtToEquity: number;
  currentRatio: number;
  promoterHolding: number; // percentage
  fiiHolding: number;
  diiHolding: number;
  fiiHoldingChange: number; // quarterly change in percentage points
  yoyRevenueGrowth: number;
  yoyProfitGrowth: number;
  threeYearProfitCAGR: number;
  operatingMargin: number;
  netProfitMargin: number;
  dividendYield: number;
  bookValue: number;
  eps: number;
  sector: string;
  industry: string;
}

export interface TechnicalIndicators {
  ema20: number;
  ema50: number;
  ema200: number;
  rsi14: number;
  supertrend: 'BUY' | 'SELL';
  supertrendValue: number;
  macdLine: number;
  macdSignal: number;
  macdHistogram: number;
  volumeAvg20: number;
  currentVolume: number;
  volumeRatio: number; // current / avg
  atr14: number;
  bollingerUpper: number;
  bollingerLower: number;
  bollingerMiddle: number;
  pivotPoint: number;
  resistance1: number;
  resistance2: number;
  support1: number;
  support2: number;
  adx: number;
  weekHigh52: number;
  weekLow52: number;
  nearWeekHigh52: boolean; // within 5%
}

export interface NewsCatalyst {
  id: string;
  type: 'ORDER_WIN' | 'QUARTERLY_RESULT' | 'CAPACITY_EXPANSION' | 'FII_ACCUMULATION' | 'MANAGEMENT_GUIDANCE' | 'SECTOR_TAILWIND' | 'GOVT_POLICY' | 'EXPORT_ORDER';
  headline: string;
  description: string;
  timestamp: Date;
  impactScore: number; // 0-100
  orderValueCr?: number; // in Crores for order wins
  orderToMarketCapRatio?: number; // percentage
  revenueImpactEstimate?: number; // percentage revenue impact
  marginImpactEstimate?: number;
  source: string;
  detectedBeforeMarket: boolean;
  preReactionTimeMs?: number; // milliseconds before market reaction
  tags: string[];
}

export interface CandleData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StockSignal {
  stockId: string;
  symbol: string;
  companyName: string;
  currentPrice: number;
  priceChange: number;
  priceChangePercent: number;
  action: 'STRONG_BUY' | 'BUY' | 'ACCUMULATE' | 'HOLD';
  entryZone: { low: number; high: number };
  target1: { price: number; percent: number; timeframe: string };
  target2: { price: number; percent: number; timeframe: string };
  stopLoss: { price: number; percent: number };
  riskRewardRatio: number;
  confidenceScore: number; // 0-100, ensemble model
  catalystScore: number;
  technicalScore: number;
  fundamentalScore: number;
  sentimentScore: number;
  aiRationale: {
    catalystSummary: string;
    technicalSummary: string;
    fundamentalSummary: string;
  };
  signalTimestamp: Date;
  triggerType: string;
}

export interface IndianStock {
  id: string;
  symbol: string;
  companyName: string;
  exchange: 'NSE' | 'BSE' | 'BOTH';
  currentPrice: number;
  previousClose: number;
  dayOpen: number;
  dayHigh: number;
  dayLow: number;
  volume: number;
  fundamentals: StockFundamentals;
  technicals: TechnicalIndicators;
  catalysts: NewsCatalyst[];
  candleData: CandleData[];
  logoColor: string; // HSL color for UI avatar
}

export interface MarketIndex {
  name: string;
  value: number;
  change: number;
  changePercent: number;
}

export interface BacktestMetrics {
  totalSignals: number;
  winningSignals: number;
  losingSignals: number;
  winRate: number;
  avgProfit: number;
  avgLoss: number;
  maxDrawdown: number;
  profitFactor: number;
  sharpeRatio: number;
  totalReturn: number;
  monthlyReturns: { month: string; return: number }[];
  tradeLog: TradeLogEntry[];
}

export interface TradeLogEntry {
  date: string;
  symbol: string;
  action: string;
  entryPrice: number;
  exitPrice: number;
  profitPercent: number;
  outcome: 'WIN' | 'LOSS';
  holdingDays: number;
  catalyst: string;
}

export interface ScreenerFilters {
  marketCapRange: 'ALL' | 'LARGE' | 'MID' | 'SMALL';
  catalystType: string;
  minConfidence: number;
  sector: string;
  sortBy: 'confidence' | 'catalyst' | 'technical' | 'fundamental';
}

export type MarketStatus = 'PRE_MARKET' | 'MARKET_OPEN' | 'MARKET_CLOSED' | 'POST_MARKET';
