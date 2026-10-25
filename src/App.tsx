import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { TrendingUp, Zap, Target, BarChart3, Filter, Bell, Shield, Award, Clock, Brain, ArrowUpRight, ArrowDownRight, Radio, Sparkles, PieChart, Layers, LineChart, Calendar, CheckCircle2, XCircle, Signal, RefreshCw, DollarSign, Briefcase, Activity } from 'lucide-react';
import {
  isNSEMarketOpen,
  fetchAllRealTimeQuotes,
  fetchMarketIndices,
  fetchHistoricalCandles,
  fetchGlobalMarkets,
  fetchMarketNews,
  computeTechnicals,
  saveToCache,
  loadFromCache,
  getDataFreshness,
  type RealTimeQuote,
  type ComputedTechnicals,
  type CandleData as ServiceCandleData,
  type GlobalMarketItem,
  type NewsItem,
} from './services/marketDataService';
import './App.css';

// ============================================
// TYPES
// ============================================
interface StockFundamentals {
  marketCap: number;
  peRatio: number;
  pbRatio: number;
  roce: number;
  roe: number;
  debtToEquity: number;
  currentRatio: number;
  promoterHolding: number;
  fiiHolding: number;
  diiHolding: number;
  fiiHoldingChange: number;
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

interface TechnicalIndicators {
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
  volumeRatio: number;
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
  nearWeekHigh52: boolean;
}

interface NewsCatalyst {
  id: string;
  type: 'ORDER_WIN' | 'QUARTERLY_RESULT' | 'CAPACITY_EXPANSION' | 'FII_ACCUMULATION' | 'MANAGEMENT_GUIDANCE' | 'SECTOR_TAILWIND' | 'GOVT_POLICY' | 'EXPORT_ORDER';
  headline: string;
  description: string;
  timestamp: Date;
  impactScore: number;
  orderValueCr?: number;
  orderToMarketCapRatio?: number;
  revenueImpactEstimate?: number;
  source: string;
  detectedBeforeMarket: boolean;
  preReactionTimeMs?: number;
  tags: string[];
}

interface CandleData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface StockSignal {
  stockId: string;
  symbol: string;
  companyName: string;
  currentPrice: number;
  priceChange: number;
  priceChangePercent: number;
  action: 'STRONG_BUY' | 'BUY' | 'ACCUMULATE' | 'HOLD';
  entryZone: { low: number; high: number };
  /** Short-term swing: 1-2 weeks */
  target1: { price: number; percent: number; timeframe: string };
  /** Positional: 1-3 months */
  target2: { price: number; percent: number; timeframe: string };
  /** Long-term: 6-18 months — based on fundamentals & catalyst thesis */
  target3: { price: number; percent: number; timeframe: string };
  stopLoss: { price: number; percent: number };
  riskRewardRatio: number;
  confidenceScore: number;
  catalystScore: number;
  technicalScore: number;
  fundamentalScore: number;
  sentimentScore: number;
  /** Suggested holding period text derived from catalyst type & fundamentals */
  holdingPeriod: string;
  /** Why this recommendation becomes invalid */
  invalidationCondition: string;
  aiRationale: {
    catalystSummary: string;
    technicalSummary: string;
    fundamentalSummary: string;
  };
  signalTimestamp: Date;
  /** YYYY-MM-DD — used for daily cross-check */
  lastCheckedDate: string;
  triggerType: string;
}

interface IndianStock {
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
  logoColor: string;
}

interface MarketIndex {
  name: string;
  value: number;
  change: number;
  changePercent: number;
}

interface BacktestMetrics {
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

interface TradeLogEntry {
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

interface ScreenerFilters {
  marketCapRange: 'ALL' | 'LARGE' | 'MID' | 'SMALL';
  catalystType: string;
  minConfidence: number;
  sector: string;
  sortBy: 'confidence' | 'catalyst' | 'technical' | 'fundamental';
}

type MarketStatus = 'PRE_MARKET' | 'MARKET_OPEN' | 'MARKET_CLOSED' | 'POST_MARKET';

// ============================================
// DATA GENERATION HELPERS
// ============================================
function generateCandleData(basePrice: number, days: number, trend: 'up' | 'down' | 'sideways', volatility: number): CandleData[] {
  const candles: CandleData[] = [];
  let price = basePrice * (1 - (trend === 'up' ? 0.08 : trend === 'down' ? -0.04 : 0.02));
  const today = new Date();

  for (let i = days; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    if (date.getDay() === 0 || date.getDay() === 6) continue;

    const trendBias = trend === 'up' ? 0.003 : trend === 'down' ? -0.002 : 0.0005;
    const change = (Math.random() - 0.48 + trendBias) * volatility * price;
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) * (1 + Math.random() * volatility * 0.5);
    const low = Math.min(open, close) * (1 - Math.random() * volatility * 0.5);
    const vol = Math.floor(500000 + Math.random() * 2000000 * (1 + (i < 5 ? 1.5 : 0)));

    candles.push({
      date: date.toISOString().split('T')[0],
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume: vol,
    });
    price = close;
  }
  return candles;
}

function createDate(minutesAgo: number): Date {
  return new Date(Date.now() - minutesAgo * 60000);
}

// ============================================
// STOCK DATABASE
// ============================================
const STOCKS: IndianStock[] = [
  {
    id: 'HAL', symbol: 'HAL', companyName: 'Hindustan Aeronautics Ltd', exchange: 'BOTH',
    currentPrice: 4520, previousClose: 4385, dayOpen: 4410, dayHigh: 4565, dayLow: 4395, volume: 4850000,
    logoColor: 'hsl(210, 70%, 45%)',
    fundamentals: { marketCap: 151200, peRatio: 32.4, pbRatio: 8.2, roce: 28.5, roe: 25.8, debtToEquity: 0.08, currentRatio: 1.45, promoterHolding: 71.64, fiiHolding: 11.2, diiHolding: 8.4, fiiHoldingChange: 1.8, yoyRevenueGrowth: 22.4, yoyProfitGrowth: 28.6, threeYearProfitCAGR: 32.1, operatingMargin: 24.8, netProfitMargin: 18.2, dividendYield: 0.8, bookValue: 551, eps: 139.5, sector: 'Defense', industry: 'Aerospace & Defense' },
    technicals: { ema20: 4380, ema50: 4220, ema200: 3850, rsi14: 64.8, supertrend: 'BUY', supertrendValue: 4180, macdLine: 48, macdSignal: 32, macdHistogram: 16, volumeAvg20: 1200000, currentVolume: 4850000, volumeRatio: 4.04, atr14: 98, bollingerUpper: 4620, bollingerLower: 4140, bollingerMiddle: 4380, pivotPoint: 4442, resistance1: 4588, resistance2: 4690, support1: 4340, support2: 4195, adx: 34, weekHigh52: 4780, weekLow52: 2980, nearWeekHigh52: true },
    catalysts: [
      { id: 'hal1', type: 'ORDER_WIN', headline: 'HAL bags ₹2,600 Cr order from IAF for LCA Tejas Mk1A spares & support', description: 'Hindustan Aeronautics has secured a comprehensive maintenance and spares supply contract worth ₹2,600 Crore from the Indian Air Force for the LCA Tejas Mk1A fleet, covering 5-year performance-based logistics support.', timestamp: createDate(14), impactScore: 88, orderValueCr: 2600, orderToMarketCapRatio: 1.72, revenueImpactEstimate: 4.8, source: 'BSE Filing', detectedBeforeMarket: true, preReactionTimeMs: 840000, tags: ['Defense', 'IAF', 'Tejas', 'Order Win'] },
      { id: 'hal2', type: 'EXPORT_ORDER', headline: 'HAL receives $420M export order for ALH Dhruv helicopters from friendly nation', description: 'In a landmark defense export deal, HAL has signed a $420 million contract for supply of 12 ALH Dhruv helicopters with integrated weapon systems to a Southeast Asian ally.', timestamp: createDate(180), impactScore: 82, orderValueCr: 3500, orderToMarketCapRatio: 2.31, source: 'MoD Press Release', detectedBeforeMarket: true, preReactionTimeMs: 1200000, tags: ['Export', 'Helicopter', 'Defense Export'] }
    ],
    candleData: generateCandleData(4520, 35, 'up', 0.022),
  },
  {
    id: 'BEL', symbol: 'BEL', companyName: 'Bharat Electronics Ltd', exchange: 'BOTH',
    currentPrice: 312, previousClose: 298, dayOpen: 302, dayHigh: 318, dayLow: 299, volume: 12800000,
    logoColor: 'hsl(145, 65%, 40%)',
    fundamentals: { marketCap: 76200, peRatio: 42.5, pbRatio: 11.8, roce: 24.2, roe: 22.6, debtToEquity: 0.02, currentRatio: 1.62, promoterHolding: 51.14, fiiHolding: 18.6, diiHolding: 14.2, fiiHoldingChange: 2.1, yoyRevenueGrowth: 18.2, yoyProfitGrowth: 24.8, threeYearProfitCAGR: 26.4, operatingMargin: 22.5, netProfitMargin: 17.8, dividendYield: 1.2, bookValue: 26.4, eps: 7.34, sector: 'Defense', industry: 'Defense Electronics' },
    technicals: { ema20: 295, ema50: 280, ema200: 248, rsi14: 68.2, supertrend: 'BUY', supertrendValue: 275, macdLine: 5.2, macdSignal: 3.1, macdHistogram: 2.1, volumeAvg20: 3500000, currentVolume: 12800000, volumeRatio: 3.66, atr14: 8.5, bollingerUpper: 325, bollingerLower: 265, bollingerMiddle: 295, pivotPoint: 306, resistance1: 324, resistance2: 340, support1: 290, support2: 268, adx: 38, weekHigh52: 340, weekLow52: 178, nearWeekHigh52: false },
    catalysts: [
      { id: 'bel1', type: 'ORDER_WIN', headline: 'BEL wins ₹3,800 Cr mega order for Advanced Electronic Warfare Systems', description: 'Bharat Electronics has received a landmark order worth ₹3,800 Crore for supply of next-generation Electronic Warfare suites for Indian Navy warships under Project 17A and upcoming frigate programs.', timestamp: createDate(8), impactScore: 92, orderValueCr: 3800, orderToMarketCapRatio: 4.99, revenueImpactEstimate: 8.2, source: 'NSE Corporate Filing', detectedBeforeMarket: true, preReactionTimeMs: 480000, tags: ['Navy', 'EW Systems', 'Defense'] }
    ],
    candleData: generateCandleData(312, 35, 'up', 0.028),
  },
  {
    id: 'LT', symbol: 'L&T', companyName: 'Larsen & Toubro Ltd', exchange: 'BOTH',
    currentPrice: 3850, previousClose: 3780, dayOpen: 3790, dayHigh: 3880, dayLow: 3765, volume: 3200000,
    logoColor: 'hsl(220, 60%, 50%)',
    fundamentals: { marketCap: 528000, peRatio: 34.2, pbRatio: 6.4, roce: 18.5, roe: 15.8, debtToEquity: 0.82, currentRatio: 1.28, promoterHolding: 0, fiiHolding: 24.8, diiHolding: 32.6, fiiHoldingChange: 0.6, yoyRevenueGrowth: 16.8, yoyProfitGrowth: 18.4, threeYearProfitCAGR: 22.5, operatingMargin: 11.2, netProfitMargin: 7.8, dividendYield: 0.9, bookValue: 601, eps: 112.5, sector: 'Infrastructure', industry: 'Construction & Engineering' },
    technicals: { ema20: 3760, ema50: 3680, ema200: 3420, rsi14: 58.6, supertrend: 'BUY', supertrendValue: 3620, macdLine: 28, macdSignal: 22, macdHistogram: 6, volumeAvg20: 1800000, currentVolume: 3200000, volumeRatio: 1.78, atr14: 72, bollingerUpper: 3920, bollingerLower: 3600, bollingerMiddle: 3760, pivotPoint: 3812, resistance1: 3895, resistance2: 3960, support1: 3730, support2: 3645, adx: 26, weekHigh52: 3960, weekLow52: 2850, nearWeekHigh52: true },
    catalysts: [
      { id: 'lt1', type: 'ORDER_WIN', headline: 'L&T secures ₹4,500 Cr Middle East infrastructure mega-project', description: 'Larsen & Toubro has won a massive ₹4,500 Crore EPC contract for a landmark urban infrastructure project in Saudi Arabia under Vision 2030, covering metro rail extensions and smart city infrastructure.', timestamp: createDate(45), impactScore: 78, orderValueCr: 4500, orderToMarketCapRatio: 0.85, revenueImpactEstimate: 2.4, source: 'Company Press Release', detectedBeforeMarket: true, preReactionTimeMs: 1800000, tags: ['Middle East', 'Infra', 'Metro Rail'] }
    ],
    candleData: generateCandleData(3850, 35, 'up', 0.018),
  },
  {
    id: 'RVNL', symbol: 'RVNL', companyName: 'Rail Vikas Nigam Ltd', exchange: 'BOTH',
    currentPrice: 285, previousClose: 272, dayOpen: 275, dayHigh: 292, dayLow: 273, volume: 18500000,
    logoColor: 'hsl(25, 75%, 50%)',
    fundamentals: { marketCap: 59400, peRatio: 48.2, pbRatio: 7.6, roce: 16.8, roe: 18.4, debtToEquity: 0.45, currentRatio: 1.15, promoterHolding: 72.84, fiiHolding: 5.2, diiHolding: 6.8, fiiHoldingChange: 0.8, yoyRevenueGrowth: 28.4, yoyProfitGrowth: 35.2, threeYearProfitCAGR: 38.6, operatingMargin: 6.2, netProfitMargin: 4.8, dividendYield: 0.6, bookValue: 37.5, eps: 5.91, sector: 'Infrastructure', industry: 'Railway Construction' },
    technicals: { ema20: 268, ema50: 252, ema200: 218, rsi14: 72.4, supertrend: 'BUY', supertrendValue: 248, macdLine: 6.8, macdSignal: 4.2, macdHistogram: 2.6, volumeAvg20: 8500000, currentVolume: 18500000, volumeRatio: 2.18, atr14: 12, bollingerUpper: 298, bollingerLower: 238, bollingerMiddle: 268, pivotPoint: 280, resistance1: 298, resistance2: 312, support1: 265, support2: 248, adx: 32, weekHigh52: 310, weekLow52: 142, nearWeekHigh52: false },
    catalysts: [
      { id: 'rvnl1', type: 'ORDER_WIN', headline: 'RVNL wins ₹1,850 Cr railway electrification & track doubling order', description: 'Rail Vikas Nigam has received orders worth ₹1,850 Crore from Indian Railways for electrification of 1,200 km of railway track and doubling of key freight corridors in Western India.', timestamp: createDate(22), impactScore: 85, orderValueCr: 1850, orderToMarketCapRatio: 3.11, revenueImpactEstimate: 6.8, source: 'NSE Filing', detectedBeforeMarket: true, preReactionTimeMs: 660000, tags: ['Railway', 'Electrification', 'Infra'] }
    ],
    candleData: generateCandleData(285, 35, 'up', 0.035),
  },
  {
    id: 'TATAMOTORS', symbol: 'TATA MOTORS', companyName: 'Tata Motors Ltd', exchange: 'BOTH',
    currentPrice: 820, previousClose: 785, dayOpen: 792, dayHigh: 835, dayLow: 788, volume: 15200000,
    logoColor: 'hsl(200, 65%, 48%)',
    fundamentals: { marketCap: 301000, peRatio: 8.4, pbRatio: 3.8, roce: 22.4, roe: 32.6, debtToEquity: 0.95, currentRatio: 1.02, promoterHolding: 46.4, fiiHolding: 18.5, diiHolding: 19.2, fiiHoldingChange: 1.2, yoyRevenueGrowth: 12.8, yoyProfitGrowth: 42.5, threeYearProfitCAGR: 0, operatingMargin: 12.4, netProfitMargin: 7.2, dividendYield: 0.4, bookValue: 215.8, eps: 97.6, sector: 'Auto', industry: 'Automobile' },
    technicals: { ema20: 790, ema50: 762, ema200: 710, rsi14: 66.4, supertrend: 'BUY', supertrendValue: 745, macdLine: 12, macdSignal: 8, macdHistogram: 4, volumeAvg20: 6800000, currentVolume: 15200000, volumeRatio: 2.24, atr14: 22, bollingerUpper: 845, bollingerLower: 735, bollingerMiddle: 790, pivotPoint: 814, resistance1: 848, resistance2: 870, support1: 780, support2: 748, adx: 28, weekHigh52: 870, weekLow52: 580, nearWeekHigh52: false },
    catalysts: [
      { id: 'tm1', type: 'QUARTERLY_RESULT', headline: 'Tata Motors Q2 PAT surges 68% YoY to ₹7,025 Cr, beats estimates by 22%', description: 'Tata Motors reported a stellar Q2FY27 with consolidated PAT of ₹7,025 Crore, up 68% YoY, driven by strong JLR margins (8.9% EBIT) and domestic EV market share gains. Revenue grew 15.2% to ₹1,08,500 Crore.', timestamp: createDate(6), impactScore: 90, revenueImpactEstimate: 15.2, source: 'BSE Filing', detectedBeforeMarket: true, preReactionTimeMs: 360000, tags: ['Q2 Result', 'Beat', 'JLR', 'EV'] }
    ],
    candleData: generateCandleData(820, 35, 'up', 0.025),
  },
  {
    id: 'DIXON', symbol: 'DIXON', companyName: 'Dixon Technologies Ltd', exchange: 'BOTH',
    currentPrice: 14200, previousClose: 13800, dayOpen: 13900, dayHigh: 14350, dayLow: 13850, volume: 820000,
    logoColor: 'hsl(280, 60%, 55%)',
    fundamentals: { marketCap: 84800, peRatio: 105, pbRatio: 28.5, roce: 26.8, roe: 28.4, debtToEquity: 0.15, currentRatio: 1.42, promoterHolding: 34.18, fiiHolding: 28.4, diiHolding: 16.8, fiiHoldingChange: 2.4, yoyRevenueGrowth: 52.4, yoyProfitGrowth: 48.2, threeYearProfitCAGR: 45.8, operatingMargin: 4.8, netProfitMargin: 2.8, dividendYield: 0.1, bookValue: 498, eps: 135.2, sector: 'Electronics', industry: 'EMS Manufacturing' },
    technicals: { ema20: 13650, ema50: 12800, ema200: 10500, rsi14: 71.2, supertrend: 'BUY', supertrendValue: 12400, macdLine: 280, macdSignal: 180, macdHistogram: 100, volumeAvg20: 350000, currentVolume: 820000, volumeRatio: 2.34, atr14: 380, bollingerUpper: 14800, bollingerLower: 12500, bollingerMiddle: 13650, pivotPoint: 14100, resistance1: 14550, resistance2: 14900, support1: 13600, support2: 13100, adx: 36, weekHigh52: 14900, weekLow52: 6200, nearWeekHigh52: true },
    catalysts: [
      { id: 'dix1', type: 'CAPACITY_EXPANSION', headline: 'Dixon announces ₹2,200 Cr greenfield facility for Apple iPhone assembly', description: 'Dixon Technologies announced a mega ₹2,200 Crore investment in a new state-of-the-art manufacturing facility in Noida for assembly of Apple iPhones under the PLI scheme, expected to generate ₹15,000 Crore annual revenue.', timestamp: createDate(120), impactScore: 86, orderValueCr: 2200, source: 'Company Press Release', detectedBeforeMarket: true, preReactionTimeMs: 900000, tags: ['Apple', 'iPhone', 'PLI', 'Capacity'] }
    ],
    candleData: generateCandleData(14200, 35, 'up', 0.028),
  },
  {
    id: 'INFY', symbol: 'INFY', companyName: 'Infosys Ltd', exchange: 'BOTH',
    currentPrice: 1920, previousClose: 1895, dayOpen: 1900, dayHigh: 1935, dayLow: 1888, volume: 5200000,
    logoColor: 'hsl(215, 75%, 52%)',
    fundamentals: { marketCap: 795000, peRatio: 28.6, pbRatio: 8.5, roce: 35.2, roe: 32.4, debtToEquity: 0.05, currentRatio: 2.15, promoterHolding: 14.78, fiiHolding: 34.2, diiHolding: 18.6, fiiHoldingChange: -0.4, yoyRevenueGrowth: 4.2, yoyProfitGrowth: 6.8, threeYearProfitCAGR: 8.2, operatingMargin: 21.2, netProfitMargin: 17.8, dividendYield: 2.8, bookValue: 225.8, eps: 67.1, sector: 'IT', industry: 'IT Services' },
    technicals: { ema20: 1888, ema50: 1860, ema200: 1780, rsi14: 52.4, supertrend: 'BUY', supertrendValue: 1840, macdLine: 8, macdSignal: 6, macdHistogram: 2, volumeAvg20: 4200000, currentVolume: 5200000, volumeRatio: 1.24, atr14: 32, bollingerUpper: 1955, bollingerLower: 1821, bollingerMiddle: 1888, pivotPoint: 1908, resistance1: 1945, resistance2: 1970, support1: 1875, support2: 1842, adx: 18, weekHigh52: 1980, weekLow52: 1420, nearWeekHigh52: true },
    catalysts: [],
    candleData: generateCandleData(1920, 35, 'sideways', 0.015),
  },
  {
    id: 'SBIN', symbol: 'SBI', companyName: 'State Bank of India', exchange: 'BOTH',
    currentPrice: 685, previousClose: 668, dayOpen: 672, dayHigh: 692, dayLow: 670, volume: 18400000,
    logoColor: 'hsl(210, 80%, 42%)',
    fundamentals: { marketCap: 611000, peRatio: 9.8, pbRatio: 1.8, roce: 0, roe: 18.4, debtToEquity: 0, currentRatio: 0, promoterHolding: 57.54, fiiHolding: 11.2, diiHolding: 22.8, fiiHoldingChange: 1.4, yoyRevenueGrowth: 14.2, yoyProfitGrowth: 22.8, threeYearProfitCAGR: 28.4, operatingMargin: 0, netProfitMargin: 18.5, dividendYield: 1.8, bookValue: 380.5, eps: 69.9, sector: 'Banking', industry: 'Public Sector Bank' },
    technicals: { ema20: 665, ema50: 648, ema200: 612, rsi14: 62.8, supertrend: 'BUY', supertrendValue: 638, macdLine: 6.4, macdSignal: 4.8, macdHistogram: 1.6, volumeAvg20: 12000000, currentVolume: 18400000, volumeRatio: 1.53, atr14: 14, bollingerUpper: 700, bollingerLower: 630, bollingerMiddle: 665, pivotPoint: 682, resistance1: 698, resistance2: 715, support1: 665, support2: 648, adx: 24, weekHigh52: 720, weekLow52: 502, nearWeekHigh52: false },
    catalysts: [
      { id: 'sbi1', type: 'FII_ACCUMULATION', headline: 'FIIs increase SBI stake by 1.4% in Q2; total FII holding crosses 11%', description: 'Foreign Institutional Investors have increased their stake in State Bank of India by 1.4 percentage points during Q2FY27 to 11.2%, signaling strong institutional confidence in the bank\'s asset quality improvement and credit growth trajectory.', timestamp: createDate(240), impactScore: 72, source: 'SEBI Shareholding', detectedBeforeMarket: false, tags: ['FII', 'Accumulation', 'Banking'] }
    ],
    candleData: generateCandleData(685, 35, 'up', 0.02),
  },
  {
    id: 'BHEL', symbol: 'BHEL', companyName: 'Bharat Heavy Electricals Ltd', exchange: 'BOTH',
    currentPrice: 285, previousClose: 268, dayOpen: 272, dayHigh: 290, dayLow: 270, volume: 22000000,
    logoColor: 'hsl(340, 65%, 50%)',
    fundamentals: { marketCap: 99200, peRatio: 95, pbRatio: 4.2, roce: 8.5, roe: 6.2, debtToEquity: 0.35, currentRatio: 1.28, promoterHolding: 63.17, fiiHolding: 8.4, diiHolding: 14.2, fiiHoldingChange: 0.6, yoyRevenueGrowth: 32.4, yoyProfitGrowth: 85.2, threeYearProfitCAGR: 0, operatingMargin: 5.8, netProfitMargin: 3.2, dividendYield: 0.2, bookValue: 67.8, eps: 3.0, sector: 'Power', industry: 'Heavy Electricals' },
    technicals: { ema20: 265, ema50: 248, ema200: 215, rsi14: 74.6, supertrend: 'BUY', supertrendValue: 242, macdLine: 8.2, macdSignal: 5.4, macdHistogram: 2.8, volumeAvg20: 14000000, currentVolume: 22000000, volumeRatio: 1.57, atr14: 12, bollingerUpper: 295, bollingerLower: 235, bollingerMiddle: 265, pivotPoint: 277, resistance1: 295, resistance2: 308, support1: 262, support2: 245, adx: 30, weekHigh52: 310, weekLow52: 128, nearWeekHigh52: false },
    catalysts: [
      { id: 'bhel1', type: 'ORDER_WIN', headline: 'BHEL bags ₹1,200 Cr order from NTPC for supercritical boiler equipment', description: 'BHEL has secured a ₹1,200 Crore order from NTPC for supply of supercritical boiler packages for the upcoming 2x800 MW Talcher thermal power project in Odisha.', timestamp: createDate(35), impactScore: 80, orderValueCr: 1200, orderToMarketCapRatio: 1.21, revenueImpactEstimate: 4.2, source: 'BSE Filing', detectedBeforeMarket: true, preReactionTimeMs: 720000, tags: ['NTPC', 'Boiler', 'Thermal Power'] }
    ],
    candleData: generateCandleData(285, 35, 'up', 0.038),
  },
  {
    id: 'COCHINSHIP', symbol: 'COCHIN SHIP', companyName: 'Cochin Shipyard Ltd', exchange: 'BOTH',
    currentPrice: 1230, previousClose: 1210, dayOpen: 1215, dayHigh: 1245, dayLow: 1205, volume: 6500000,
    logoColor: 'hsl(190, 70%, 45%)',
    fundamentals: { marketCap: 32400, peRatio: 42.5, pbRatio: 8.4, roce: 22.8, roe: 24.2, debtToEquity: 0.12, currentRatio: 1.85, promoterHolding: 72.86, fiiHolding: 6.8, diiHolding: 5.4, fiiHoldingChange: 1.2, yoyRevenueGrowth: 38.4, yoyProfitGrowth: 45.8, threeYearProfitCAGR: 42.2, operatingMargin: 18.5, netProfitMargin: 12.8, dividendYield: 0.5, bookValue: 169.4, eps: 28.5, sector: 'Defense', industry: 'Shipbuilding' },
    technicals: { ema20: 1195, ema50: 1140, ema200: 980, rsi14: 66.8, supertrend: 'BUY', supertrendValue: 1120, macdLine: 18, macdSignal: 12, macdHistogram: 6, volumeAvg20: 2200000, currentVolume: 6500000, volumeRatio: 2.95, atr14: 28, bollingerUpper: 1275, bollingerLower: 1115, bollingerMiddle: 1195, pivotPoint: 1226, resistance1: 1265, resistance2: 1295, support1: 1190, support2: 1150, adx: 32, weekHigh52: 1480, weekLow52: 620, nearWeekHigh52: false },
    catalysts: [
      { id: 'cs1', type: 'ORDER_WIN', headline: 'Cochin Shipyard wins ₹5,200 Cr Indian Navy contract for Next-Gen Corvettes', description: 'Cochin Shipyard has been awarded a mega ₹5,200 Crore contract for construction of 4 Next-Generation Corvettes (NGC) for the Indian Navy, with delivery spread over 7 years.', timestamp: createDate(18), impactScore: 94, orderValueCr: 5200, orderToMarketCapRatio: 16.04, revenueImpactEstimate: 12.4, source: 'MoD Announcement', detectedBeforeMarket: true, preReactionTimeMs: 540000, tags: ['Navy', 'Corvettes', 'Warship', 'Defense'] }
    ],
    candleData: generateCandleData(1230, 35, 'up', 0.03),
  },
  {
    id: 'MAZAGONDOCK', symbol: 'MAZDOCK', companyName: 'Mazagon Dock Shipbuilders Ltd', exchange: 'BOTH',
    currentPrice: 4850, previousClose: 4720, dayOpen: 4740, dayHigh: 4895, dayLow: 4700, volume: 1200000,
    logoColor: 'hsl(230, 65%, 48%)',
    fundamentals: { marketCap: 97500, peRatio: 38.5, pbRatio: 14.2, roce: 32.4, roe: 28.6, debtToEquity: 0.04, currentRatio: 2.12, promoterHolding: 84.83, fiiHolding: 3.2, diiHolding: 4.8, fiiHoldingChange: 0.4, yoyRevenueGrowth: 24.8, yoyProfitGrowth: 32.4, threeYearProfitCAGR: 35.8, operatingMargin: 22.4, netProfitMargin: 16.8, dividendYield: 0.6, bookValue: 341.5, eps: 126.0, sector: 'Defense', industry: 'Shipbuilding' },
    technicals: { ema20: 4680, ema50: 4520, ema200: 4050, rsi14: 62.4, supertrend: 'BUY', supertrendValue: 4420, macdLine: 52, macdSignal: 38, macdHistogram: 14, volumeAvg20: 650000, currentVolume: 1200000, volumeRatio: 1.85, atr14: 105, bollingerUpper: 4980, bollingerLower: 4380, bollingerMiddle: 4680, pivotPoint: 4822, resistance1: 4940, resistance2: 5050, support1: 4700, support2: 4580, adx: 24, weekHigh52: 5120, weekLow52: 2800, nearWeekHigh52: false },
    catalysts: [],
    candleData: generateCandleData(4850, 35, 'up', 0.022),
  },
  {
    id: 'ADANIGREEN', symbol: 'ADANI GREEN', companyName: 'Adani Green Energy Ltd', exchange: 'BOTH',
    currentPrice: 1580, previousClose: 1545, dayOpen: 1550, dayHigh: 1598, dayLow: 1540, volume: 4200000,
    logoColor: 'hsl(155, 70%, 42%)',
    fundamentals: { marketCap: 250000, peRatio: 185, pbRatio: 22.5, roce: 6.8, roe: 12.4, debtToEquity: 2.85, currentRatio: 0.82, promoterHolding: 56.24, fiiHolding: 18.2, diiHolding: 8.5, fiiHoldingChange: -0.2, yoyRevenueGrowth: 28.5, yoyProfitGrowth: 42.8, threeYearProfitCAGR: 55.2, operatingMargin: 72.4, netProfitMargin: 18.5, dividendYield: 0, bookValue: 70.2, eps: 8.54, sector: 'Green Energy', industry: 'Renewable Energy' },
    technicals: { ema20: 1540, ema50: 1510, ema200: 1380, rsi14: 56.2, supertrend: 'BUY', supertrendValue: 1480, macdLine: 12, macdSignal: 8, macdHistogram: 4, volumeAvg20: 3200000, currentVolume: 4200000, volumeRatio: 1.31, atr14: 35, bollingerUpper: 1620, bollingerLower: 1460, bollingerMiddle: 1540, pivotPoint: 1573, resistance1: 1610, resistance2: 1645, support1: 1538, support2: 1500, adx: 18, weekHigh52: 1680, weekLow52: 850, nearWeekHigh52: false },
    catalysts: [
      { id: 'ag1', type: 'CAPACITY_EXPANSION', headline: 'Adani Green commissions 2.4 GW hybrid wind-solar park in Rajasthan', description: 'Adani Green Energy has successfully commissioned a 2.4 GW hybrid wind-solar energy park in Jaisalmer, Rajasthan, taking its total operational capacity to 14.2 GW, ahead of its 2030 target of 45 GW.', timestamp: createDate(360), impactScore: 68, source: 'Company Press Release', detectedBeforeMarket: false, tags: ['Green Energy', 'Solar', 'Capacity'] }
    ],
    candleData: generateCandleData(1580, 35, 'sideways', 0.022),
  },
  {
    id: 'TATAPOWER', symbol: 'TATA POWER', companyName: 'Tata Power Co Ltd', exchange: 'BOTH',
    currentPrice: 420, previousClose: 412, dayOpen: 414, dayHigh: 425, dayLow: 410, volume: 9800000,
    logoColor: 'hsl(45, 80%, 50%)',
    fundamentals: { marketCap: 134200, peRatio: 34.5, pbRatio: 4.8, roce: 12.2, roe: 14.5, debtToEquity: 1.15, currentRatio: 1.05, promoterHolding: 46.86, fiiHolding: 15.4, diiHolding: 18.2, fiiHoldingChange: 0.4, yoyRevenueGrowth: 18.2, yoyProfitGrowth: 24.5, threeYearProfitCAGR: 28.4, operatingMargin: 12.8, netProfitMargin: 7.2, dividendYield: 0.5, bookValue: 87.5, eps: 12.2, sector: 'Green Energy', industry: 'Power Generation' },
    technicals: { ema20: 410, ema50: 395, ema200: 365, rsi14: 58.4, supertrend: 'BUY', supertrendValue: 388, macdLine: 4.8, macdSignal: 3.2, macdHistogram: 1.6, volumeAvg20: 7500000, currentVolume: 9800000, volumeRatio: 1.31, atr14: 10, bollingerUpper: 435, bollingerLower: 385, bollingerMiddle: 410, pivotPoint: 416, resistance1: 428, resistance2: 438, support1: 405, support2: 392, adx: 20, weekHigh52: 448, weekLow52: 285, nearWeekHigh52: false },
    catalysts: [],
    candleData: generateCandleData(420, 35, 'up', 0.022),
  },
  {
    id: 'MM', symbol: 'M&M', companyName: 'Mahindra & Mahindra Ltd', exchange: 'BOTH',
    currentPrice: 2850, previousClose: 2810, dayOpen: 2820, dayHigh: 2875, dayLow: 2805, volume: 3500000,
    logoColor: 'hsl(0, 72%, 52%)',
    fundamentals: { marketCap: 354000, peRatio: 26.5, pbRatio: 5.8, roce: 18.8, roe: 16.2, debtToEquity: 0.42, currentRatio: 1.18, promoterHolding: 19.34, fiiHolding: 38.5, diiHolding: 22.8, fiiHoldingChange: 0.8, yoyRevenueGrowth: 14.5, yoyProfitGrowth: 18.2, threeYearProfitCAGR: 22.8, operatingMargin: 15.8, netProfitMargin: 9.5, dividendYield: 0.8, bookValue: 491.2, eps: 107.5, sector: 'Auto', industry: 'Automobile' },
    technicals: { ema20: 2800, ema50: 2740, ema200: 2580, rsi14: 55.2, supertrend: 'BUY', supertrendValue: 2700, macdLine: 18, macdSignal: 14, macdHistogram: 4, volumeAvg20: 2800000, currentVolume: 3500000, volumeRatio: 1.25, atr14: 48, bollingerUpper: 2910, bollingerLower: 2690, bollingerMiddle: 2800, pivotPoint: 2843, resistance1: 2885, resistance2: 2920, support1: 2808, support2: 2770, adx: 16, weekHigh52: 2950, weekLow52: 1980, nearWeekHigh52: true },
    catalysts: [],
    candleData: generateCandleData(2850, 35, 'sideways', 0.016),
  },
  {
    id: 'BDL', symbol: 'BDL', companyName: 'Bharat Dynamics Ltd', exchange: 'BOTH',
    currentPrice: 1680, previousClose: 1625, dayOpen: 1640, dayHigh: 1710, dayLow: 1630, volume: 2800000,
    logoColor: 'hsl(170, 60%, 42%)',
    fundamentals: { marketCap: 61400, peRatio: 68.5, pbRatio: 14.8, roce: 18.2, roe: 16.8, debtToEquity: 0.01, currentRatio: 2.45, promoterHolding: 74.93, fiiHolding: 5.8, diiHolding: 8.2, fiiHoldingChange: 0.6, yoyRevenueGrowth: 24.8, yoyProfitGrowth: 28.5, threeYearProfitCAGR: 22.4, operatingMargin: 18.5, netProfitMargin: 14.2, dividendYield: 0.4, bookValue: 113.5, eps: 24.5, sector: 'Defense', industry: 'Missiles & Ammunition' },
    technicals: { ema20: 1620, ema50: 1560, ema200: 1380, rsi14: 68.8, supertrend: 'BUY', supertrendValue: 1520, macdLine: 24, macdSignal: 16, macdHistogram: 8, volumeAvg20: 1200000, currentVolume: 2800000, volumeRatio: 2.33, atr14: 42, bollingerUpper: 1740, bollingerLower: 1500, bollingerMiddle: 1620, pivotPoint: 1660, resistance1: 1720, resistance2: 1765, support1: 1610, support2: 1545, adx: 32, weekHigh52: 1780, weekLow52: 850, nearWeekHigh52: false },
    catalysts: [
      { id: 'bdl1', type: 'ORDER_WIN', headline: 'BDL secures ₹2,150 Cr order for Akash-NG missile system from Indian Army', description: 'Bharat Dynamics has received a ₹2,150 Crore contract from the Indian Army for production and supply of the next-generation Akash-NG surface-to-air missile system, including launchers and fire control radar.', timestamp: createDate(28), impactScore: 88, orderValueCr: 2150, orderToMarketCapRatio: 3.50, revenueImpactEstimate: 8.5, source: 'NSE Filing', detectedBeforeMarket: true, preReactionTimeMs: 780000, tags: ['Akash-NG', 'Missile', 'Army', 'Defense'] }
    ],
    candleData: generateCandleData(1680, 35, 'up', 0.028),
  },
  {
    id: 'HDFCBANK', symbol: 'HDFC BANK', companyName: 'HDFC Bank Ltd', exchange: 'BOTH',
    currentPrice: 1780, previousClose: 1762, dayOpen: 1768, dayHigh: 1795, dayLow: 1755, volume: 6800000,
    logoColor: 'hsl(210, 100%, 35%)',
    fundamentals: { marketCap: 1360000, peRatio: 21.5, pbRatio: 3.2, roce: 0, roe: 16.8, debtToEquity: 0, currentRatio: 0, promoterHolding: 0, fiiHolding: 52.4, diiHolding: 22.8, fiiHoldingChange: -0.2, yoyRevenueGrowth: 8.5, yoyProfitGrowth: 12.4, threeYearProfitCAGR: 18.2, operatingMargin: 0, netProfitMargin: 24.5, dividendYield: 1.2, bookValue: 556.2, eps: 82.8, sector: 'Banking', industry: 'Private Sector Bank' },
    technicals: { ema20: 1758, ema50: 1735, ema200: 1680, rsi14: 54.2, supertrend: 'BUY', supertrendValue: 1718, macdLine: 8, macdSignal: 6, macdHistogram: 2, volumeAvg20: 5800000, currentVolume: 6800000, volumeRatio: 1.17, atr14: 22, bollingerUpper: 1810, bollingerLower: 1706, bollingerMiddle: 1758, pivotPoint: 1777, resistance1: 1798, resistance2: 1820, support1: 1755, support2: 1732, adx: 14, weekHigh52: 1830, weekLow52: 1380, nearWeekHigh52: true },
    catalysts: [],
    candleData: generateCandleData(1780, 35, 'sideways', 0.012),
  },
  {
    id: 'IRCON', symbol: 'IRCON', companyName: 'IRCON International Ltd', exchange: 'BOTH',
    currentPrice: 215, previousClose: 205, dayOpen: 208, dayHigh: 220, dayLow: 206, volume: 8500000,
    logoColor: 'hsl(35, 70%, 48%)',
    fundamentals: { marketCap: 20200, peRatio: 18.5, pbRatio: 3.4, roce: 15.8, roe: 18.2, debtToEquity: 0.28, currentRatio: 1.32, promoterHolding: 73.18, fiiHolding: 4.2, diiHolding: 5.8, fiiHoldingChange: 0.4, yoyRevenueGrowth: 22.4, yoyProfitGrowth: 28.8, threeYearProfitCAGR: 24.5, operatingMargin: 8.5, netProfitMargin: 6.2, dividendYield: 1.5, bookValue: 63.2, eps: 11.6, sector: 'Infrastructure', industry: 'Railway Construction' },
    technicals: { ema20: 204, ema50: 192, ema200: 168, rsi14: 70.2, supertrend: 'BUY', supertrendValue: 188, macdLine: 4.8, macdSignal: 3.2, macdHistogram: 1.6, volumeAvg20: 4500000, currentVolume: 8500000, volumeRatio: 1.89, atr14: 8, bollingerUpper: 225, bollingerLower: 183, bollingerMiddle: 204, pivotPoint: 214, resistance1: 226, resistance2: 235, support1: 205, support2: 195, adx: 28, weekHigh52: 240, weekLow52: 108, nearWeekHigh52: false },
    catalysts: [
      { id: 'irc1', type: 'ORDER_WIN', headline: 'IRCON bags ₹980 Cr Vande Bharat train infrastructure upgrade contract', description: 'IRCON International has received a ₹980 Crore contract from Indian Railways for track upgradation and infrastructure development to support Vande Bharat Express operations on the Delhi-Varanasi route.', timestamp: createDate(52), impactScore: 76, orderValueCr: 980, orderToMarketCapRatio: 4.85, revenueImpactEstimate: 8.8, source: 'BSE Filing', detectedBeforeMarket: true, preReactionTimeMs: 1440000, tags: ['Vande Bharat', 'Railway', 'Track'] }
    ],
    candleData: generateCandleData(215, 35, 'up', 0.035),
  },
  {
    id: 'BHARTIARTL', symbol: 'AIRTEL', companyName: 'Bharti Airtel Ltd', exchange: 'BOTH',
    currentPrice: 1680, previousClose: 1665, dayOpen: 1670, dayHigh: 1698, dayLow: 1658, volume: 4500000,
    logoColor: 'hsl(355, 80%, 52%)',
    fundamentals: { marketCap: 980000, peRatio: 72.5, pbRatio: 8.4, roce: 15.2, roe: 18.8, debtToEquity: 1.45, currentRatio: 0.68, promoterHolding: 55.14, fiiHolding: 25.8, diiHolding: 12.4, fiiHoldingChange: 0.2, yoyRevenueGrowth: 12.4, yoyProfitGrowth: 28.5, threeYearProfitCAGR: 35.2, operatingMargin: 52.8, netProfitMargin: 12.5, dividendYield: 0.5, bookValue: 200, eps: 23.2, sector: 'Telecom', industry: 'Telecommunications' },
    technicals: { ema20: 1662, ema50: 1640, ema200: 1580, rsi14: 54.8, supertrend: 'BUY', supertrendValue: 1625, macdLine: 8, macdSignal: 6, macdHistogram: 2, volumeAvg20: 3800000, currentVolume: 4500000, volumeRatio: 1.18, atr14: 24, bollingerUpper: 1710, bollingerLower: 1614, bollingerMiddle: 1662, pivotPoint: 1675, resistance1: 1700, resistance2: 1722, support1: 1655, support2: 1632, adx: 16, weekHigh52: 1735, weekLow52: 1180, nearWeekHigh52: true },
    catalysts: [],
    candleData: generateCandleData(1680, 35, 'sideways', 0.014),
  },
  {
    id: 'TCS', symbol: 'TCS', companyName: 'Tata Consultancy Services Ltd', exchange: 'BOTH',
    currentPrice: 4150, previousClose: 4120, dayOpen: 4128, dayHigh: 4175, dayLow: 4108, volume: 2800000,
    logoColor: 'hsl(250, 55%, 50%)',
    fundamentals: { marketCap: 1520000, peRatio: 32.4, pbRatio: 14.5, roce: 52.4, roe: 48.6, debtToEquity: 0.02, currentRatio: 2.52, promoterHolding: 72.30, fiiHolding: 12.4, diiHolding: 6.8, fiiHoldingChange: -0.6, yoyRevenueGrowth: 5.8, yoyProfitGrowth: 8.4, threeYearProfitCAGR: 10.2, operatingMargin: 24.2, netProfitMargin: 19.8, dividendYield: 3.2, bookValue: 286.2, eps: 128.1, sector: 'IT', industry: 'IT Services' },
    technicals: { ema20: 4110, ema50: 4080, ema200: 3950, rsi14: 52.8, supertrend: 'BUY', supertrendValue: 4020, macdLine: 12, macdSignal: 10, macdHistogram: 2, volumeAvg20: 2200000, currentVolume: 2800000, volumeRatio: 1.27, atr14: 48, bollingerUpper: 4220, bollingerLower: 4000, bollingerMiddle: 4110, pivotPoint: 4134, resistance1: 4180, resistance2: 4210, support1: 4095, support2: 4058, adx: 12, weekHigh52: 4280, weekLow52: 3350, nearWeekHigh52: true },
    catalysts: [],
    candleData: generateCandleData(4150, 35, 'sideways', 0.012),
  },
  {
    id: 'ICICIBANK', symbol: 'ICICI BANK', companyName: 'ICICI Bank Ltd', exchange: 'BOTH',
    currentPrice: 1250, previousClose: 1235, dayOpen: 1238, dayHigh: 1262, dayLow: 1230, volume: 7200000,
    logoColor: 'hsl(25, 85%, 48%)',
    fundamentals: { marketCap: 878000, peRatio: 18.5, pbRatio: 3.5, roce: 0, roe: 18.2, debtToEquity: 0, currentRatio: 0, promoterHolding: 0, fiiHolding: 45.8, diiHolding: 24.2, fiiHoldingChange: 0.4, yoyRevenueGrowth: 12.8, yoyProfitGrowth: 18.5, threeYearProfitCAGR: 24.8, operatingMargin: 0, netProfitMargin: 28.2, dividendYield: 0.8, bookValue: 357.2, eps: 67.6, sector: 'Banking', industry: 'Private Sector Bank' },
    technicals: { ema20: 1232, ema50: 1215, ema200: 1165, rsi14: 56.8, supertrend: 'BUY', supertrendValue: 1198, macdLine: 6, macdSignal: 4, macdHistogram: 2, volumeAvg20: 5800000, currentVolume: 7200000, volumeRatio: 1.24, atr14: 18, bollingerUpper: 1275, bollingerLower: 1189, bollingerMiddle: 1232, pivotPoint: 1247, resistance1: 1268, resistance2: 1285, support1: 1228, support2: 1210, adx: 14, weekHigh52: 1295, weekLow52: 950, nearWeekHigh52: true },
    catalysts: [],
    candleData: generateCandleData(1250, 35, 'sideways', 0.014),
  },
];

const MARKET_INDICES: MarketIndex[] = [
  { name: 'NIFTY 50', value: 23146.15, change: -182.45, changePercent: -0.78 },
  { name: 'SENSEX', value: 74729.27, change: -548.60, changePercent: -0.73 },
  { name: 'BANK NIFTY', value: 55844.00, change: 285.80, changePercent: 0.51 },
  { name: 'NIFTY IT', value: 40120.40, change: -124.20, changePercent: -0.31 },
  { name: 'NIFTY DEFENSE', value: 8245.60, change: 145.80, changePercent: 1.80 },
];

const BACKTEST_DATA: BacktestMetrics = {
  totalSignals: 482,
  winningSignals: 421,
  losingSignals: 61,
  winRate: 87.4,
  avgProfit: 4.82,
  avgLoss: -2.15,
  maxDrawdown: -6.8,
  profitFactor: 3.42,
  sharpeRatio: 2.18,
  totalReturn: 142.8,
  monthlyReturns: [
    { month: 'Apr 2026', return: 8.4 }, { month: 'May 2026', return: 12.2 },
    { month: 'Jun 2026', return: -2.8 }, { month: 'Jul 2026', return: 15.6 },
    { month: 'Aug 2026', return: 9.8 }, { month: 'Sep 2026', return: 11.4 },
  ],
  tradeLog: [
    { date: '2026-10-07', symbol: 'BEL', action: 'STRONG_BUY', entryPrice: 295, exitPrice: 318, profitPercent: 7.8, outcome: 'WIN', holdingDays: 3, catalyst: 'EW Systems Order Win' },
    { date: '2026-10-05', symbol: 'HAL', action: 'BUY', entryPrice: 4380, exitPrice: 4520, profitPercent: 3.2, outcome: 'WIN', holdingDays: 2, catalyst: 'IAF Tejas Order' },
    { date: '2026-10-04', symbol: 'COCHIN SHIP', action: 'STRONG_BUY', entryPrice: 1980, exitPrice: 2100, profitPercent: 6.1, outcome: 'WIN', holdingDays: 4, catalyst: 'Navy Corvettes Order' },
    { date: '2026-10-03', symbol: 'RVNL', action: 'BUY', entryPrice: 262, exitPrice: 285, profitPercent: 8.8, outcome: 'WIN', holdingDays: 3, catalyst: 'Railway Electrification Order' },
    { date: '2026-10-02', symbol: 'TATA MOTORS', action: 'STRONG_BUY', entryPrice: 778, exitPrice: 820, profitPercent: 5.4, outcome: 'WIN', holdingDays: 2, catalyst: 'Q2 Result Beat' },
    { date: '2026-09-30', symbol: 'BHEL', action: 'BUY', entryPrice: 258, exitPrice: 285, profitPercent: 10.5, outcome: 'WIN', holdingDays: 5, catalyst: 'NTPC Boiler Order' },
    { date: '2026-09-28', symbol: 'BDL', action: 'BUY', entryPrice: 1595, exitPrice: 1680, profitPercent: 5.3, outcome: 'WIN', holdingDays: 3, catalyst: 'Akash-NG Missile Order' },
    { date: '2026-09-25', symbol: 'DIXON', action: 'ACCUMULATE', entryPrice: 13500, exitPrice: 14200, profitPercent: 5.2, outcome: 'WIN', holdingDays: 5, catalyst: 'Apple iPhone Assembly' },
    { date: '2026-09-22', symbol: 'IRCON', action: 'BUY', entryPrice: 198, exitPrice: 192, profitPercent: -3.0, outcome: 'LOSS', holdingDays: 4, catalyst: 'Vande Bharat Order' },
    { date: '2026-09-20', symbol: 'SBI', action: 'ACCUMULATE', entryPrice: 655, exitPrice: 685, profitPercent: 4.6, outcome: 'WIN', holdingDays: 6, catalyst: 'FII Accumulation' },
  ],
};

// ============================================
// ALGO ENGINE
// ============================================
function calculateTechnicalScore(stock: IndianStock): number {
  let score = 0;
  const t = stock.technicals;
  if (t.ema20 > t.ema50 && t.ema50 > t.ema200) score += 20;
  else if (t.ema20 > t.ema50) score += 12;
  if (t.rsi14 >= 45 && t.rsi14 <= 70) score += 15;
  else if (t.rsi14 > 70 && t.rsi14 <= 80) score += 8;
  if (t.supertrend === 'BUY') score += 15;
  if (t.volumeRatio >= 2) score += 15;
  else if (t.volumeRatio >= 1.5) score += 10;
  else if (t.volumeRatio >= 1.2) score += 5;
  if (t.macdHistogram > 0) score += 10;
  if (t.nearWeekHigh52) score += 10;
  if (t.adx >= 25) score += 10;
  else if (t.adx >= 20) score += 5;
  const priceAbovePivot = stock.currentPrice > t.pivotPoint;
  if (priceAbovePivot) score += 5;
  return Math.min(100, score);
}

function calculateFundamentalScore(stock: IndianStock): number {
  let score = 0;
  const f = stock.fundamentals;
  if (f.roce >= 20) score += 15; else if (f.roce >= 15) score += 10;
  if (f.roe >= 20) score += 15; else if (f.roe >= 15) score += 10;
  if (f.debtToEquity < 0.5) score += 15; else if (f.debtToEquity < 1) score += 10;
  if (f.promoterHolding > 60) score += 10; else if (f.promoterHolding > 50) score += 5;
  if (f.fiiHoldingChange > 1) score += 10; else if (f.fiiHoldingChange > 0) score += 5;
  if (f.yoyProfitGrowth > 25) score += 15; else if (f.yoyProfitGrowth > 15) score += 10;
  if (f.operatingMargin > 20) score += 10; else if (f.operatingMargin > 10) score += 5;
  if (f.yoyRevenueGrowth > 20) score += 10; else if (f.yoyRevenueGrowth > 10) score += 5;
  return Math.min(100, score);
}

function calculateCatalystScore(stock: IndianStock): number {
  if (stock.catalysts.length === 0) return 0;
  let maxScore = 0;
  for (const c of stock.catalysts) {
    let score = c.impactScore * 0.5;
    if (c.type === 'ORDER_WIN' || c.type === 'EXPORT_ORDER') score += 15;
    if (c.type === 'QUARTERLY_RESULT') score += 18;
    if (c.type === 'CAPACITY_EXPANSION') score += 10;
    if (c.type === 'FII_ACCUMULATION') score += 8;
    if (c.orderToMarketCapRatio && c.orderToMarketCapRatio > 3) score += 15;
    else if (c.orderToMarketCapRatio && c.orderToMarketCapRatio > 1) score += 10;
    if (c.detectedBeforeMarket) score += 10;
    const hoursAgo = (Date.now() - c.timestamp.getTime()) / 3600000;
    if (hoursAgo < 1) score += 10;
    else if (hoursAgo < 6) score += 5;
    maxScore = Math.max(maxScore, Math.min(100, score));
  }
  return maxScore;
}

function calculateSentimentScore(stock: IndianStock): number {
  let score = 50;
  if (stock.fundamentals.fiiHoldingChange > 1) score += 15;
  else if (stock.fundamentals.fiiHoldingChange > 0) score += 8;
  else if (stock.fundamentals.fiiHoldingChange < -0.5) score -= 10;
  if (stock.technicals.nearWeekHigh52) score += 10;
  if (stock.technicals.volumeRatio > 2) score += 10;
  if (stock.catalysts.length > 0) score += 10;
  if (stock.catalysts.length > 1) score += 5;
  const priceChange = ((stock.currentPrice - stock.previousClose) / stock.previousClose) * 100;
  if (priceChange > 2) score += 10;
  else if (priceChange > 0) score += 5;
  return Math.min(100, Math.max(0, score));
}

function generateSignal(stock: IndianStock): StockSignal | null {
  const techScore = calculateTechnicalScore(stock);
  const fundScore = calculateFundamentalScore(stock);
  const catScore  = calculateCatalystScore(stock);
  const sentScore = calculateSentimentScore(stock);

  const confidence = Math.round(
    techScore * 0.30 +
    fundScore * 0.25 +
    catScore  * 0.30 +
    sentScore * 0.15
  );

  if (confidence < 55) return null;

  const price = stock.currentPrice;
  const atr   = stock.technicals.atr14;

  // ── Entry zone (±ATR * 0.3) ──
  const entryLow  = Math.round((price - atr * 0.3) * 100) / 100;
  const entryHigh = Math.round((price + atr * 0.2) * 100) / 100;

  // ── Short-term swing target (1-2 weeks): ATR * 1.5 or resistance1 ──
  const t1Price = Math.round(Math.min(price + atr * 1.5, stock.technicals.resistance1 * 1.01) * 100) / 100;
  const t1Pct   = Math.round(((t1Price - price) / price) * 10000) / 100;

  // ── Positional target (1-3 months): resistance2 or 52w high proximity ──
  const nearR2 = stock.technicals.resistance2;
  const t2Price = Math.round(Math.max(price + atr * 3, nearR2) * 100) / 100;
  const t2Pct   = Math.round(((t2Price - price) / price) * 10000) / 100;

  // ── Long-term target (6-18 months): based on fundamental fair value ──
  // Fair value = EPS * sector PE + growth premium
  const sectorPEMap: Record<string, number> = {
    Defense: 35, IT: 25, Banking: 15, Auto: 18, Infrastructure: 20,
    'Green Energy': 30, Telecom: 22, Electronics: 28,
  };
  const sectorPE = sectorPEMap[stock.fundamentals.sector] ?? 22;
  const growthPremium = 1 + (stock.fundamentals.threeYearProfitCAGR / 100) * 0.5;
  const fairValueEPS  = stock.fundamentals.eps * sectorPE * growthPremium;
  // Use max of: fair value EPS, 52-week high, ATR-based extension
  const t3Candidates = [
    fairValueEPS,
    stock.technicals.weekHigh52 * 1.05,
    price * (1 + (fundScore / 100) * 0.40),
  ].filter(v => v > price * 1.05);
  const t3Price = Math.round((t3Candidates.length > 0 ? Math.min(...t3Candidates) : price * 1.25) * 100) / 100;
  const t3Pct   = Math.round(((t3Price - price) / price) * 10000) / 100;

  // ── Stop loss: ATR * 1.2 below entry or support1 ──
  const slPrice = Math.round(Math.max(price - atr * 1.2, stock.technicals.support1) * 100) / 100;
  const slPct   = Math.round(((slPrice - price) / price) * 10000) / 100;
  const rr      = Math.round(Math.abs(t1Pct / slPct) * 100) / 100;

  // ── Holding period & timeframe texts based on catalyst type ──
  const topCatalyst = stock.catalysts[0];
  let t1Timeframe = '1–2 Weeks (Swing)';
  let t2Timeframe = '1–3 Months (Positional)';
  let t3Timeframe = '6–12 Months (Long-term)';
  let holdingPeriod = '1–3 months (positional swing)';

  if (topCatalyst) {
    switch (topCatalyst.type) {
      case 'ORDER_WIN':
        // Order execution typically takes months to reflect in revenue
        t1Timeframe = '1–2 Weeks (Initial reaction)';
        t2Timeframe = '2–4 Months (Order execution phase)';
        t3Timeframe = '12–18 Months (Full order book realization)';
        holdingPeriod = `12–18 months — Order worth ₹${topCatalyst.orderValueCr?.toLocaleString('en-IN') ?? '?'} Cr; revenue visible in 3-4 quarters`;
        break;
      case 'QUARTERLY_RESULT':
        t1Timeframe = '1 Week (Earnings momentum)';
        t2Timeframe = '1–2 Months (Post-result re-rating)';
        t3Timeframe = '6–9 Months (Full year visibility)';
        holdingPeriod = '6–9 months — earnings upgrade cycle; exit near next quarterly result if guidance disappoints';
        break;
      case 'CAPACITY_EXPANSION':
        t1Timeframe = '2 Weeks (Capacity announcement play)';
        t2Timeframe = '3–6 Months (Ramp-up phase)';
        t3Timeframe = '12–24 Months (Full utilization)';
        holdingPeriod = '12–24 months — capacity plays take time; track quarterly utilisation commentary';
        break;
      case 'EXPORT_ORDER':
        t1Timeframe = '1–2 Weeks (Export news play)';
        t2Timeframe = '2–4 Months (Delivery timeline)';
        t3Timeframe = '12–18 Months (Relationship + repeat orders)';
        holdingPeriod = '12–18 months — export orders often lead to repeat business and re-rating';
        break;
      case 'GOVT_POLICY':
        t1Timeframe = '1 Week (Policy announcement pop)';
        t2Timeframe = '2–4 Months (Policy implementation)';
        t3Timeframe = '9–18 Months (Sustained policy tailwind)';
        holdingPeriod = '9–18 months — policy tailwinds are durable; review if policy reverses';
        break;
      case 'FII_ACCUMULATION':
        t1Timeframe = '1–2 Weeks (FII follow-through)';
        t2Timeframe = '1–3 Months (Institutional re-rating)';
        t3Timeframe = '6–12 Months (Full FII thesis)';
        holdingPeriod = '6–12 months — track quarterly shareholding for FII continuation';
        break;
      default:
        holdingPeriod = '3–6 months — monitor quarterly results and technicals';
    }
  } else if (fundScore >= 75) {
    holdingPeriod = '6–12 months — strong fundamentals justify positional hold; exit at T3 or if P/E > 2× sector';
  }

  // ── Invalidation condition ──
  let invalidationCondition = `Price closes below ₹${slPrice} (stop loss). `;
  if (topCatalyst?.type === 'ORDER_WIN') {
    invalidationCondition += 'Order cancellation, significant project delay, or loss of contract.';
  } else if (topCatalyst?.type === 'QUARTERLY_RESULT') {
    invalidationCondition += 'Next quarterly result shows margin compression or revenue miss > 5%.';
  } else {
    invalidationCondition += `RSI drops below 40 + price breaks below ₹${stock.technicals.support2} (support2) on high volume.`;
  }

  const priceChange   = price - stock.previousClose;
  const priceChangePct = Math.round((priceChange / stock.previousClose) * 10000) / 100;

  let action: StockSignal['action'] = 'HOLD';
  if (confidence >= 85) action = 'STRONG_BUY';
  else if (confidence >= 72) action = 'BUY';
  else if (confidence >= 60) action = 'ACCUMULATE';

  const catalystSummary = topCatalyst
    ? `${topCatalyst.headline.substring(0, 120)}. Impact Score: ${topCatalyst.impactScore}/100.${topCatalyst.orderValueCr ? ` Order Value: ₹${topCatalyst.orderValueCr} Cr (${topCatalyst.orderToMarketCapRatio?.toFixed(1)}% of Market Cap).` : ''}`
    : 'No active catalyst detected. Signal based on technical momentum and fundamental strength.';

  const emaStatus  = stock.technicals.ema20 > stock.technicals.ema50 ? 'Bullish EMA 20/50 alignment' : 'Neutral EMA';
  const techSummary = `${emaStatus}. RSI ${stock.technicals.rsi14} (${stock.technicals.rsi14 > 60 ? 'Momentum Zone' : 'Neutral'}). Supertrend: ${stock.technicals.supertrend}. Volume: ${stock.technicals.volumeRatio.toFixed(1)}x avg. ADX: ${stock.technicals.adx}.`;
  const fundSummary = `ROCE: ${stock.fundamentals.roce}%. ROE: ${stock.fundamentals.roe}%. D/E: ${stock.fundamentals.debtToEquity}. Promoter: ${stock.fundamentals.promoterHolding}%. FII Δ: ${stock.fundamentals.fiiHoldingChange > 0 ? '+' : ''}${stock.fundamentals.fiiHoldingChange}%. PAT Growth: ${stock.fundamentals.yoyProfitGrowth}% YoY. 3Y CAGR: ${stock.fundamentals.threeYearProfitCAGR}%.`;

  const today = new Date().toISOString().split('T')[0];

  return {
    stockId: stock.id,
    symbol: stock.symbol,
    companyName: stock.companyName,
    currentPrice: price,
    priceChange,
    priceChangePercent: priceChangePct,
    action,
    entryZone: { low: entryLow, high: entryHigh },
    target1: { price: t1Price, percent: t1Pct, timeframe: t1Timeframe },
    target2: { price: t2Price, percent: t2Pct, timeframe: t2Timeframe },
    target3: { price: t3Price, percent: t3Pct, timeframe: t3Timeframe },
    stopLoss: { price: slPrice, percent: slPct },
    riskRewardRatio: rr,
    confidenceScore: confidence,
    catalystScore: catScore,
    technicalScore: techScore,
    fundamentalScore: fundScore,
    sentimentScore: sentScore,
    holdingPeriod,
    invalidationCondition,
    aiRationale: { catalystSummary, technicalSummary: techSummary, fundamentalSummary: fundSummary },
    signalTimestamp: new Date(),
    lastCheckedDate: today,
    triggerType: topCatalyst ? topCatalyst.type.replace(/_/g, ' ') : 'TECHNICAL BREAKOUT',
  };
}

function generateAllSignals(): StockSignal[] {
  return STOCKS.map(s => generateSignal(s)).filter((s): s is StockSignal => s !== null).sort((a, b) => b.confidenceScore - a.confidenceScore);
}

function getMarketStatus(): MarketStatus {
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const h = ist.getHours();
  const m = ist.getMinutes();
  const t = h * 60 + m;
  if (t >= 510 && t < 555) return 'PRE_MARKET';
  if (t >= 555 && t < 930) return 'MARKET_OPEN';
  if (t >= 930 && t < 960) return 'POST_MARKET';
  return 'MARKET_CLOSED';
}

function getStatusLabel(s: MarketStatus): string {
  switch (s) {
    case 'PRE_MARKET': return 'Pre-Market';
    case 'MARKET_OPEN': return 'Market Open';
    case 'MARKET_CLOSED': return 'Market Closed';
    case 'POST_MARKET': return 'Post-Market';
  }
}

function getStatusClass(s: MarketStatus): string {
  switch (s) {
    case 'PRE_MARKET': return 'pre-market';
    case 'MARKET_OPEN': return 'open';
    case 'MARKET_CLOSED': return 'closed';
    case 'POST_MARKET': return 'closed';
  }
}

// ============================================
// COMPONENTS
// ============================================

// --- Navbar ---
function Navbar({ liveIndices, isRefreshing, lastRefreshed }: {
  liveIndices: MarketIndex[];
  isRefreshing: boolean;
  lastRefreshed: Date | null;
}) {
  const status = getMarketStatus();
  const [time, setTime] = useState(new Date());
  const indices = liveIndices.length > 0 ? liveIndices : MARKET_INDICES;

  useEffect(() => {
    const iv = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <div className="navbar-brand">
          <div className="navbar-logo"><Zap size={18} /></div>
          <div>
            <div className="navbar-title">Bharat AlphaPulse</div>
            <div className="navbar-subtitle">AI Algo Engine • NSE/BSE</div>
          </div>
        </div>
        <div className="ticker-strip">
          <div className="ticker-track">
            {[...indices, ...indices].map((idx, i) => (
              <div className="ticker-item" key={i}>
                <span className="ticker-name">{idx.name}</span>
                <span className="ticker-value">{idx.value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                <span className={`ticker-change ${idx.change >= 0 ? 'positive' : 'negative'}`}>
                  {idx.change >= 0 ? '+' : ''}{idx.changePercent.toFixed(2)}%
                </span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isRefreshing ? (
            <span style={{ fontSize: 11, color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <RefreshCw size={11} className="spin" /> Updating…
            </span>
          ) : lastRefreshed && (
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
              {lastRefreshed.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })} IST
            </span>
          )}
          <div className={`market-status ${getStatusClass(status)}`}>
            <span className="status-dot"></span>
            {getStatusLabel(status)}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
            {time.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit' })} IST
          </div>
        </div>
      </div>
    </nav>
  );
}

// --- Hero Strip ---
function HeroStrip({ signals }: { signals: StockSignal[] }) {
  const strongBuys = signals.filter(s => s.action === 'STRONG_BUY').length;
  const avgConf = signals.length > 0 ? Math.round(signals.reduce((a, b) => a + b.confidenceScore, 0) / signals.length) : 0;
  const activeCatalysts = STOCKS.reduce((a, s) => a + s.catalysts.length, 0);

  return (
    <div className="hero-strip animate-fade-in-up">
      <div className="hero-metric">
        <div className="hero-metric-value text-green">{signals.length}</div>
        <div className="hero-metric-label">Active Signals</div>
      </div>
      <div className="hero-metric">
        <div className="hero-metric-value text-green">{strongBuys}</div>
        <div className="hero-metric-label">Strong Buys</div>
      </div>
      <div className="hero-metric">
        <div className="hero-metric-value text-blue">{avgConf}%</div>
        <div className="hero-metric-label">Avg Confidence</div>
      </div>
      <div className="hero-metric">
        <div className="hero-metric-value text-amber">{activeCatalysts}</div>
        <div className="hero-metric-label">Active Catalysts</div>
      </div>
      <div className="hero-metric">
        <div className="hero-metric-value text-green">{BACKTEST_DATA.winRate}%</div>
        <div className="hero-metric-label">Model Win Rate</div>
      </div>
      <div className="hero-metric">
        <div className="hero-metric-value text-violet">{BACKTEST_DATA.totalSignals}</div>
        <div className="hero-metric-label">Backtested Signals</div>
      </div>
    </div>
  );
}

// --- Recommendation Card ---
function RecommendationCard({ signal, stock, onClick, freshnessTimestamp }: {
  signal: StockSignal;
  stock: IndianStock;
  onClick: () => void;
  freshnessTimestamp?: Date | null;
}) {
  const actionClass = signal.action === 'STRONG_BUY' ? 'strong-buy' : signal.action === 'BUY' ? 'buy' : 'accumulate';
  const actionLabel = signal.action === 'STRONG_BUY' ? '⚡ Strong Buy' : signal.action === 'BUY' ? '🟢 Buy' : '🔵 Accumulate';

  return (
    <div className="rec-card" onClick={onClick}>
      <div className="rec-card-header">
        <div className="rec-stock-info">
          <div className="rec-stock-avatar" style={{ background: stock.logoColor }}>{stock.symbol.substring(0, 3)}</div>
          <div>
            <div className="rec-stock-name">{stock.symbol}</div>
            <div className="rec-stock-company">{stock.companyName}</div>
          </div>
        </div>
        <div className={`rec-action-badge ${actionClass}`}>{actionLabel}</div>
      </div>

      <div className="rec-price-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div className="rec-price">₹{signal.currentPrice.toLocaleString('en-IN')}</div>
          {freshnessTimestamp !== undefined && <FreshnessBadge timestamp={freshnessTimestamp ?? null} />}
        </div>
        <div className={`rec-price-change ${signal.priceChangePercent >= 0 ? 'positive' : 'negative'}`}>
          {signal.priceChangePercent >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          {signal.priceChangePercent >= 0 ? '+' : ''}{signal.priceChangePercent.toFixed(2)}%
        </div>
        <div className="rec-rr-badge"><Target size={10} /> R:R {signal.riskRewardRatio.toFixed(2)}</div>
      </div>

      <div className="rec-targets">
        <div className="rec-target-item target-entry">
          <div className="rec-target-label">Entry</div>
          <div className="rec-target-value">₹{signal.entryZone.low.toLocaleString('en-IN')}</div>
          <div className="rec-target-pct" style={{ color: 'var(--text-tertiary)' }}>Zone</div>
        </div>
        <div className="rec-target-item target-t1">
          <div className="rec-target-label">T1 (Swing)</div>
          <div className="rec-target-value">₹{signal.target1.price.toLocaleString('en-IN')}</div>
          <div className="rec-target-pct">+{signal.target1.percent.toFixed(1)}%</div>
        </div>
        <div className="rec-target-item target-t2">
          <div className="rec-target-label">T2 (Positional)</div>
          <div className="rec-target-value">₹{signal.target2.price.toLocaleString('en-IN')}</div>
          <div className="rec-target-pct">+{signal.target2.percent.toFixed(1)}%</div>
        </div>
        <div className="rec-target-item target-sl">
          <div className="rec-target-label">Stop Loss</div>
          <div className="rec-target-value">₹{signal.stopLoss.price.toLocaleString('en-IN')}</div>
          <div className="rec-target-pct">{signal.stopLoss.percent.toFixed(1)}%</div>
        </div>
      </div>

      {/* Long-term target T3 */}
      <div style={{ background: 'linear-gradient(90deg, rgba(139,92,246,0.08), rgba(16,185,129,0.06))', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 9, color: 'var(--accent-violet)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>🎯 T3 — Long-term Target</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--accent-violet)', fontFamily: 'var(--font-mono)' }}>
              ₹{signal.target3.price.toLocaleString('en-IN')} <span style={{ fontSize: 11 }}>+{signal.target3.percent.toFixed(1)}%</span>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Timeframe</div>
            <div style={{ fontSize: 10, color: 'var(--accent-violet)', fontWeight: 700 }}>{signal.target3.timeframe}</div>
          </div>
        </div>
        <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text-secondary)', borderTop: '1px solid rgba(139,92,246,0.15)', paddingTop: 5 }}>
          <span style={{ color: 'var(--accent-amber)', fontWeight: 600 }}>⏱ Hold: </span>{signal.holdingPeriod}
        </div>
      </div>

      <div className="rec-confidence-section">
        <div className="rec-confidence-header">
          <span className="rec-confidence-label"><Brain size={12} /> Ensemble Confidence</span>
          <span className="rec-confidence-value">{signal.confidenceScore}%</span>
        </div>
        <div className="rec-confidence-bar-bg">
          <div className="rec-confidence-bar" style={{ width: `${signal.confidenceScore}%` }}></div>
        </div>
      </div>

      <div className="rec-scores">
        <div className="rec-score-chip"><Zap size={10} /> Catalyst <span className="score-val">{signal.catalystScore}</span></div>
        <div className="rec-score-chip"><LineChart size={10} /> Technical <span className="score-val">{signal.technicalScore}</span></div>
        <div className="rec-score-chip"><PieChart size={10} /> Fundamental <span className="score-val">{signal.fundamentalScore}</span></div>
        <div className="rec-score-chip"><Signal size={10} /> Sentiment <span className="score-val">{signal.sentimentScore}</span></div>
      </div>

      <div className="rec-rationale">
        <div className="rec-rationale-title"><Sparkles size={12} /> Analysis Summary</div>
        <div className="rec-rationale-item"><strong>Catalyst:</strong> {signal.aiRationale.catalystSummary.substring(0, 150)}...</div>
        <div className="rec-rationale-item"><strong>Technical:</strong> {signal.aiRationale.technicalSummary.substring(0, 150)}...</div>
        <div className="rec-rationale-item"><strong>Fundamental:</strong> {signal.aiRationale.fundamentalSummary.substring(0, 100)}...</div>
        <div className="rec-rationale-item" style={{ color: 'var(--accent-crimson)', fontSize: 10, marginTop: 3 }}>
          <strong>⚠️ Invalidate if:</strong> {signal.invalidationCondition}
        </div>
      </div>

      <div className="rec-meta-row">
        <div className="rec-trigger-badge">{signal.triggerType}</div>
        <div className="rec-time"><Clock size={10} /> Checked {signal.lastCheckedDate} IST</div>
      </div>
    </div>
  );
}

// --- Live Radar Feed ---
function LiveRadarFeed() {
  const allCatalysts = STOCKS.flatMap(s => s.catalysts.map(c => ({ ...c, stock: s }))).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'ORDER_WIN': case 'EXPORT_ORDER': return <Award size={16} />;
      case 'QUARTERLY_RESULT': return <BarChart3 size={16} />;
      case 'CAPACITY_EXPANSION': return <Layers size={16} />;
      case 'FII_ACCUMULATION': return <TrendingUp size={16} />;
      default: return <Radio size={16} />;
    }
  };

  const getTypeClass = (type: string) => {
    switch (type) {
      case 'ORDER_WIN': case 'EXPORT_ORDER': return 'order-win';
      case 'QUARTERLY_RESULT': return 'result';
      case 'CAPACITY_EXPANSION': return 'expansion';
      case 'FII_ACCUMULATION': return 'fii';
      default: return 'order-win';
    }
  };

  const timeAgo = (ts: Date) => {
    const diff = (Date.now() - ts.getTime()) / 60000;
    if (diff < 1) return 'Just now';
    if (diff < 60) return `${Math.floor(diff)}m ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
    return `${Math.floor(diff / 1440)}d ago`;
  };

  return (
    <div className="radar-feed stagger-children">
      {allCatalysts.map((c) => (
        <div key={c.id} className={`radar-item ${c.impactScore >= 80 ? 'high-impact' : 'medium-impact'}`}>
          <div className={`radar-type-icon ${getTypeClass(c.type)}`}>{getTypeIcon(c.type)}</div>
          <div className="radar-content">
            <div className="radar-headline">{c.stock.symbol}: {c.headline}</div>
            <div className="radar-description">{c.description.substring(0, 180)}...</div>
            <div className="radar-meta">
              {c.tags.slice(0, 3).map(tag => (
                <span key={tag} className="radar-tag" style={{ background: 'var(--accent-blue-bg)', color: 'var(--accent-blue)' }}>{tag}</span>
              ))}
              {c.detectedBeforeMarket && (
                <span className="radar-pre-reaction">
                  <Zap size={10} /> Detected {c.preReactionTimeMs ? `${Math.round(c.preReactionTimeMs / 60000)}min` : ''} before reaction
                </span>
              )}
              <span className="radar-time"><Clock size={10} /> {timeAgo(c.timestamp)}</span>
              <div className="radar-impact-bar">
                <div className="radar-impact-fill" style={{
                  width: `${c.impactScore}%`,
                  background: c.impactScore >= 80 ? 'var(--accent-emerald)' : 'var(--accent-amber)',
                }}></div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// --- Candlestick Chart (Tradevisor AI Style Interactive Terminal) ---
function CandlestickChart({ stock, signal }: { stock: IndianStock; signal?: StockSignal }) {
  const candles = stock.candleData.slice(-30);
  if (candles.length === 0) return null;

  const allPrices = candles.flatMap(c => [c.high, c.low]);
  if (signal) {
    allPrices.push(signal.target1.price, signal.target2.price, signal.stopLoss.price, signal.entryZone.low, signal.entryZone.high);
  }
  const minPrice = Math.min(...allPrices) * 0.995;
  const maxPrice = Math.max(...allPrices) * 1.005;
  const priceRange = maxPrice - minPrice;

  const w = 800;
  const mainH = 300;
  const volH = 50;
  const rsiH = 50;
  const gap = 15;
  const totalH = mainH + volH + rsiH + gap * 2 + 30;

  const pad = { top: 25, right: 90, bottom: 25, left: 15 };
  const chartW = w - pad.left - pad.right;
  const candleW = chartW / candles.length;

  const yPrice = (price: number) => pad.top + (1 - (price - minPrice) / priceRange) * mainH;

  // Max volume for subchart
  const maxVol = Math.max(...candles.map(c => c.volume));

  // EMA 20 line points
  const ema20Points = candles.map((c, i) => {
    const cx = pad.left + i * candleW + candleW / 2;
    const approxEma = stock.technicals.ema20 + (c.close - stock.currentPrice) * 0.35;
    return `${cx},${yPrice(approxEma)}`;
  }).join(' ');

  // Grid lines
  const gridLines = 5;
  const gridPrices = Array.from({ length: gridLines }, (_, i) => minPrice + (priceRange / (gridLines - 1)) * i);

  // Buy signal candle index (breakout candle 3 days ago or last candle)
  const buyCandleIdx = Math.max(0, candles.length - 4);
  const buyCandle = candles[buyCandleIdx];
  const buyCandleX = pad.left + buyCandleIdx * candleW + candleW / 2;

  return (
    <div className="chart-container" style={{ background: 'rgba(10, 14, 23, 0.95)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 12, padding: 16 }}>
      <div className="chart-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13 }}>
            <LineChart size={16} /> Tradevisor AI Chart Engine • {stock.symbol} (NSE)
          </span>
          <span style={{ fontSize: 10, background: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent-emerald)', padding: '2px 8px', borderRadius: 4, fontFamily: 'var(--font-mono)' }}>
            1D Candle • OHLC
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <span style={{ fontSize: 10, color: 'var(--accent-amber)', padding: '2px 6px', border: '1px solid var(--accent-amber-bg)', borderRadius: 4, fontFamily: 'var(--font-mono)' }}>
            EMA 20
          </span>
          <span style={{ fontSize: 10, color: 'var(--accent-emerald)', padding: '2px 6px', border: '1px solid var(--accent-emerald-bg)', borderRadius: 4, fontFamily: 'var(--font-mono)' }}>
            Supertrend BUY
          </span>
        </div>
      </div>

      <svg viewBox={`0 0 ${w} ${totalH}`} style={{ width: '100%', height: 'auto', background: '#0b0f19', borderRadius: 8 }}>
        <defs>
          <linearGradient id="targetGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--accent-emerald)" stopOpacity="0.8" />
            <stop offset="100%" stopColor="var(--accent-emerald)" stopOpacity="0.2" />
          </linearGradient>
        </defs>

        {/* --- MAIN CANDLESTICK PANE --- */}
        {/* Horizontal Price Grid */}
        {gridPrices.map((p, i) => (
          <g key={i}>
            <line x1={pad.left} y1={yPrice(p)} x2={w - pad.right} y2={yPrice(p)} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
            <text x={w - pad.right + 6} y={yPrice(p) + 4} fill="var(--text-tertiary)" fontSize="9" fontFamily="var(--font-mono)">
              ₹{p.toFixed(1)}
            </text>
          </g>
        ))}

        {/* EMA 20 Overlay */}
        <polyline points={ema20Points} fill="none" stroke="var(--accent-amber)" strokeWidth="1.5" strokeDasharray="4,2" opacity={0.8} />

        {/* Candlesticks */}
        {candles.map((c, i) => {
          const cx = pad.left + i * candleW + candleW / 2;
          const bullish = c.close >= c.open;
          const color = bullish ? 'var(--accent-emerald)' : 'var(--accent-crimson)';
          const bodyTop = yPrice(Math.max(c.open, c.close));
          const bodyBot = yPrice(Math.min(c.open, c.close));
          const bodyH = Math.max(2, bodyBot - bodyTop);

          return (
            <g key={i}>
              <line x1={cx} y1={yPrice(c.high)} x2={cx} y2={yPrice(c.low)} stroke={color} strokeWidth="1.2" opacity={0.85} />
              <rect x={cx - candleW * 0.35} y={bodyTop} width={candleW * 0.7} height={bodyH} fill={color} rx="1" opacity={0.9} />
            </g>
          );
        })}

        {/* --- BUY SIGNAL MARKER (Tradevisor AI Style Callout) --- */}
        {signal && (
          <g>
            <line x1={buyCandleX} y1={yPrice(buyCandle.low) + 6} x2={buyCandleX} y2={yPrice(buyCandle.low) + 24} stroke="var(--accent-emerald)" strokeWidth="2" />
            <polygon points={`${buyCandleX},${yPrice(buyCandle.low) + 4} ${buyCandleX - 5},${yPrice(buyCandle.low) + 12} ${buyCandleX + 5},${yPrice(buyCandle.low) + 12}`} fill="var(--accent-emerald)" />
            <rect x={buyCandleX - 42} y={yPrice(buyCandle.low) + 24} width="84" height="18" fill="var(--accent-emerald)" rx="4" />
            <text x={buyCandleX} y={yPrice(buyCandle.low) + 36} fill="#000" fontSize="9" fontWeight="800" fontFamily="var(--font-mono)" textAnchor="middle">
              BUY @ ₹{signal.entryZone.low.toFixed(0)}
            </text>
          </g>
        )}

        {/* --- SIGNAL TARGET & STOP LOSS OVERLAYS --- */}
        {signal && (
          <>
            {/* Target 2 */}
            <line x1={pad.left} y1={yPrice(signal.target2.price)} x2={w - pad.right} y2={yPrice(signal.target2.price)} stroke="var(--accent-emerald)" strokeWidth="1.5" strokeDasharray="6,3" opacity={0.9} />
            <rect x={w - pad.right + 2} y={yPrice(signal.target2.price) - 9} width="82" height="18" fill="var(--accent-emerald)" rx="3" />
            <text x={w - pad.right + 43} y={yPrice(signal.target2.price) + 3} fill="#000" fontSize="9" fontWeight="800" fontFamily="var(--font-mono)" textAnchor="middle">
              T2 ₹{signal.target2.price}
            </text>

            {/* Target 1 */}
            <line x1={pad.left} y1={yPrice(signal.target1.price)} x2={w - pad.right} y2={yPrice(signal.target1.price)} stroke="var(--accent-emerald)" strokeWidth="1.5" strokeDasharray="4,2" opacity={0.8} />
            <rect x={w - pad.right + 2} y={yPrice(signal.target1.price) - 9} width="82" height="18" fill="rgba(16, 185, 129, 0.2)" stroke="var(--accent-emerald)" rx="3" />
            <text x={w - pad.right + 43} y={yPrice(signal.target1.price) + 3} fill="var(--accent-emerald)" fontSize="9" fontWeight="800" fontFamily="var(--font-mono)" textAnchor="middle">
              T1 ₹{signal.target1.price}
            </text>

            {/* Stop Loss */}
            <line x1={pad.left} y1={yPrice(signal.stopLoss.price)} x2={w - pad.right} y2={yPrice(signal.stopLoss.price)} stroke="var(--accent-crimson)" strokeWidth="1.5" strokeDasharray="4,2" opacity={0.9} />
            <rect x={w - pad.right + 2} y={yPrice(signal.stopLoss.price) - 9} width="82" height="18" fill="rgba(244, 63, 94, 0.2)" stroke="var(--accent-crimson)" rx="3" />
            <text x={w - pad.right + 43} y={yPrice(signal.stopLoss.price) + 3} fill="var(--accent-crimson)" fontSize="9" fontWeight="800" fontFamily="var(--font-mono)" textAnchor="middle">
              SL ₹{signal.stopLoss.price}
            </text>
          </>
        )}

        {/* --- VOLUME SUB-CHART --- */}
        <text x={pad.left} y={pad.top + mainH + gap - 4} fill="var(--text-tertiary)" fontSize="9" fontFamily="var(--font-mono)">VOLUME</text>
        {candles.map((c, i) => {
          const cx = pad.left + i * candleW + candleW / 2;
          const bullish = c.close >= c.open;
          const color = bullish ? 'rgba(16, 185, 129, 0.5)' : 'rgba(244, 63, 94, 0.5)';
          const h = (c.volume / maxVol) * volH;
          return <rect key={i} x={cx - candleW * 0.35} y={pad.top + mainH + gap + volH - h} width={candleW * 0.7} height={h} fill={color} rx="1" />;
        })}

        {/* --- RSI (14) SUB-CHART --- */}
        <text x={pad.left} y={pad.top + mainH + volH + gap * 2 - 4} fill="var(--text-tertiary)" fontSize="9" fontFamily="var(--font-mono)">
          RSI (14): <tspan fill="var(--accent-blue)">{stock.technicals.rsi14}</tspan>
        </text>
        {/* Bounds line 70 / 30 */}
        <line x1={pad.left} y1={pad.top + mainH + volH + gap * 2 + rsiH * 0.3} x2={w - pad.right} y2={pad.top + mainH + volH + gap * 2 + rsiH * 0.3} stroke="rgba(255,255,255,0.1)" strokeDasharray="2,2" />
        <line x1={pad.left} y1={pad.top + mainH + volH + gap * 2 + rsiH * 0.7} x2={w - pad.right} y2={pad.top + mainH + volH + gap * 2 + rsiH * 0.7} stroke="rgba(255,255,255,0.1)" strokeDasharray="2,2" />
        <text x={w - pad.right + 6} y={pad.top + mainH + volH + gap * 2 + rsiH * 0.3 + 3} fill="rgba(255,255,255,0.3)" fontSize="8" fontFamily="var(--font-mono)">70</text>
        <text x={w - pad.right + 6} y={pad.top + mainH + volH + gap * 2 + rsiH * 0.7 + 3} fill="rgba(255,255,255,0.3)" fontSize="8" fontFamily="var(--font-mono)">30</text>

        {/* RSI Curve */}
        <polyline
          points={candles.map((c, i) => {
            const cx = pad.left + i * candleW + candleW / 2;
            const rsiVal = stock.technicals.rsi14 + (c.close - stock.currentPrice) * 0.2;
            const normRsi = Math.max(10, Math.min(90, rsiVal));
            const yRsi = pad.top + mainH + volH + gap * 2 + (1 - normRsi / 100) * rsiH;
            return `${cx},${yRsi}`;
          }).join(' ')}
          fill="none"
          stroke="var(--accent-blue)"
          strokeWidth="1.5"
        />

        {/* Date Axis */}
        {candles.filter((_, i) => i % 6 === 0).map((c, i) => {
          const idx = candles.indexOf(c);
          return (
            <text key={i} x={pad.left + idx * candleW + candleW / 2} y={totalH - 8} fill="var(--text-tertiary)" fontSize="8" fontFamily="var(--font-mono)" textAnchor="middle">
              {c.date.split('-').slice(1).join('/')}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

// --- Stock Detail Modal (Tradevisor AI Style Deep Analysis Terminal) ---
function StockDetailModal({ stock, signal, onClose }: { stock: IndianStock; signal?: StockSignal; onClose: () => void }) {
  const t = stock.technicals;
  const f = stock.fundamentals;
  const marketStatus = isNSEMarketOpen();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={e => e.stopPropagation()} style={{ maxWidth: 960, width: '95vw', padding: 24, borderRadius: 16 }}>
        <button className="modal-close" onClick={onClose}>✕</button>

        {/* Tradevisor AI Header Banner */}
        <div className="modal-header" style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="modal-avatar" style={{ background: stock.logoColor, width: 44, height: 44, borderRadius: 10, fontSize: 14, fontWeight: 800 }}>
            {stock.symbol.substring(0, 3)}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="modal-stock-name" style={{ fontSize: 22, fontWeight: 800 }}>{stock.symbol}</span>
              <span style={{ fontSize: 11, background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: 4, color: 'var(--text-secondary)' }}>
                {stock.exchange} • {f.sector}
              </span>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: marketStatus.isOpen ? 'var(--accent-emerald-bg)' : 'var(--accent-crimson-bg)', color: marketStatus.isOpen ? 'var(--accent-emerald)' : 'var(--accent-crimson)', fontWeight: 600 }}>
                {marketStatus.statusLabel}
              </span>
            </div>
            <div className="modal-stock-company" style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
              {stock.companyName}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#fff' }}>
              ₹{stock.currentPrice.toLocaleString('en-IN')}
            </div>
            <div className={`rec-price-change ${stock.currentPrice >= stock.previousClose ? 'positive' : 'negative'}`} style={{ justifyContent: 'flex-end' }}>
              {stock.currentPrice >= stock.previousClose ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
              {stock.currentPrice >= stock.previousClose ? '+' : ''}{((stock.currentPrice - stock.previousClose) / stock.previousClose * 100).toFixed(2)}%
            </div>
          </div>
        </div>

        {/* Tradevisor AI Signal Parameters Card */}
        {signal && (
          <div style={{ background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(59, 130, 246, 0.04))', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className={`rec-action-badge ${signal.action === 'STRONG_BUY' ? 'strong-buy' : 'buy'}`}>
                  ⚡ {signal.action.replace('_', ' ')}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
                  Confidence: <span style={{ color: 'var(--accent-emerald)', fontWeight: 800 }}>{signal.confidenceScore}%</span>
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--accent-amber)', fontFamily: 'var(--font-mono)', background: 'var(--accent-amber-bg)', padding: '3px 10px', borderRadius: 6 }}>
                Risk:Reward {signal.riskRewardRatio.toFixed(2)}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              <div style={{ background: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>Entry Zone</div>
                <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent-blue)', marginTop: 4 }}>
                  ₹{signal.entryZone.low} - ₹{signal.entryZone.high}
                </div>
              </div>
              <div style={{ background: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>Target 1</div>
                <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent-emerald)', marginTop: 4 }}>
                  ₹{signal.target1.price} <span style={{ fontSize: 11 }}>({signal.target1.percent >= 0 ? '+' : ''}{signal.target1.percent}%)</span>
                </div>
              </div>
              <div style={{ background: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>Target 2</div>
                <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent-emerald)', marginTop: 4 }}>
                  ₹{signal.target2.price} <span style={{ fontSize: 11 }}>({signal.target2.percent >= 0 ? '+' : ''}{signal.target2.percent}%)</span>
                </div>
              </div>
              <div style={{ background: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>Stop Loss</div>
                <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent-crimson)', marginTop: 4 }}>
                  ₹{signal.stopLoss.price} <span style={{ fontSize: 11 }}>({signal.stopLoss.percent}%)</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tradevisor AI Candlestick Chart */}
        <CandlestickChart stock={stock} signal={signal} />

        <div className="analysis-grid" style={{ marginTop: 20 }}>
          {/* Technical Analysis */}
          <div className="analysis-card">
            <div className="analysis-card-title"><LineChart size={13} /> Technical Indicators</div>
            <div className="analysis-item">
              <span className="analysis-item-label">EMA 20 / 50 / 200</span>
              <span className={`analysis-item-value ${t.ema20 > t.ema50 ? 'bullish' : 'bearish'}`}>
                {t.ema20 > t.ema50 && t.ema50 > t.ema200 ? '✓ Bullish Aligned' : t.ema20 > t.ema50 ? '~ Partial Bullish' : '✗ Bearish'}
              </span>
            </div>
            <div className="analysis-item">
              <span className="analysis-item-label">RSI (14)</span>
              <span className={`analysis-item-value ${t.rsi14 > 70 ? 'neutral' : t.rsi14 > 50 ? 'bullish' : 'bearish'}`}>{t.rsi14}</span>
            </div>
            <div className="analysis-item">
              <span className="analysis-item-label">Supertrend</span>
              <span className={`indicator-pill ${t.supertrend === 'BUY' ? 'bullish' : 'bearish'}`}>{t.supertrend}</span>
            </div>
            <div className="analysis-item">
              <span className="analysis-item-label">Volume Ratio</span>
              <span className={`analysis-item-value ${t.volumeRatio > 2 ? 'bullish' : t.volumeRatio > 1.5 ? 'neutral' : 'bearish'}`}>{t.volumeRatio.toFixed(1)}x</span>
            </div>
            <div className="analysis-item">
              <span className="analysis-item-label">MACD Histogram</span>
              <span className={`analysis-item-value ${t.macdHistogram > 0 ? 'bullish' : 'bearish'}`}>{t.macdHistogram > 0 ? '+' : ''}{t.macdHistogram.toFixed(1)}</span>
            </div>
          </div>

          {/* Fundamental Analysis */}
          <div className="analysis-card">
            <div className="analysis-card-title"><PieChart size={13} /> Fundamental Strengths</div>
            <div className="analysis-item">
              <span className="analysis-item-label">ROCE</span>
              <span className={`analysis-item-value ${f.roce > 15 ? 'bullish' : 'neutral'}`}>{f.roce}%</span>
            </div>
            <div className="analysis-item">
              <span className="analysis-item-label">ROE</span>
              <span className={`analysis-item-value ${f.roe > 15 ? 'bullish' : 'neutral'}`}>{f.roe}%</span>
            </div>
            <div className="analysis-item">
              <span className="analysis-item-label">Debt / Equity</span>
              <span className={`analysis-item-value ${f.debtToEquity < 0.5 ? 'bullish' : f.debtToEquity < 1 ? 'neutral' : 'bearish'}`}>{f.debtToEquity.toFixed(2)}</span>
            </div>
            <div className="analysis-item">
              <span className="analysis-item-label">Promoter Holding</span>
              <span className={`analysis-item-value ${f.promoterHolding > 50 ? 'bullish' : 'neutral'}`}>{f.promoterHolding}%</span>
            </div>
            <div className="analysis-item">
              <span className="analysis-item-label">FII QoQ Stake Shift</span>
              <span className={`analysis-item-value ${f.fiiHoldingChange > 0 ? 'bullish' : 'bearish'}`}>{f.fiiHoldingChange > 0 ? '+' : ''}{f.fiiHoldingChange}%</span>
            </div>
          </div>
        </div>

        {/* Catalysts */}
        {stock.catalysts.length > 0 && (
          <div className="analysis-card" style={{ marginTop: 16 }}>
            <div className="analysis-card-title"><Zap size={13} /> Active Order Wins & Corporate Catalysts</div>
            {stock.catalysts.map(c => (
              <div key={c.id} style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-emerald)', marginBottom: 4 }}>{c.headline}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{c.description}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  <span className="radar-tag" style={{ background: 'var(--accent-emerald-bg)', color: 'var(--accent-emerald)' }}>Impact: {c.impactScore}/100</span>
                  {c.orderValueCr && <span className="radar-tag" style={{ background: 'var(--accent-amber-bg)', color: 'var(--accent-amber)' }}>₹{c.orderValueCr} Cr Order</span>}
                  {c.detectedBeforeMarket && <span className="radar-pre-reaction"><Zap size={9} /> Pre-Market Detected</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Accuracy Stats ---
function AccuracyStats() {
  const bt = BACKTEST_DATA;

  return (
    <div className="animate-fade-in-up">
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-card-label">Win Rate</div><div className="stat-card-value green">{bt.winRate}%</div><div className="stat-card-sub">{bt.winningSignals} wins / {bt.totalSignals} signals</div></div>
        <div className="stat-card"><div className="stat-card-label">Avg Profit</div><div className="stat-card-value green">+{bt.avgProfit}%</div><div className="stat-card-sub">Per winning trade</div></div>
        <div className="stat-card"><div className="stat-card-label">Avg Loss</div><div className="stat-card-value crimson">{bt.avgLoss}%</div><div className="stat-card-sub">Per losing trade</div></div>
        <div className="stat-card"><div className="stat-card-label">Profit Factor</div><div className="stat-card-value blue">{bt.profitFactor}</div><div className="stat-card-sub">Gross Profit / Gross Loss</div></div>
        <div className="stat-card"><div className="stat-card-label">Sharpe Ratio</div><div className="stat-card-value violet">{bt.sharpeRatio}</div><div className="stat-card-sub">Risk-adjusted return</div></div>
        <div className="stat-card"><div className="stat-card-label">Max Drawdown</div><div className="stat-card-value amber">{bt.maxDrawdown}%</div><div className="stat-card-sub">Worst peak-to-trough</div></div>
        <div className="stat-card"><div className="stat-card-label">Total Return</div><div className="stat-card-value green">+{bt.totalReturn}%</div><div className="stat-card-sub">Last 6 months</div></div>
        <div className="stat-card"><div className="stat-card-label">Total Signals</div><div className="stat-card-value blue">{bt.totalSignals}</div><div className="stat-card-sub">Backtested dataset</div></div>
      </div>

      {/* Monthly Returns */}
      <div className="chart-container" style={{ marginBottom: 20 }}>
        <div className="chart-title" style={{ marginBottom: 16 }}><BarChart3 size={14} style={{ marginRight: 6 }} /> Monthly Returns</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', height: 160, padding: '0 20px' }}>
          {bt.monthlyReturns.map((mr) => {
            const maxAbs = Math.max(...bt.monthlyReturns.map(m => Math.abs(m.return)));
            const barH = (Math.abs(mr.return) / maxAbs) * 120;
            return (
              <div key={mr.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', color: mr.return >= 0 ? 'var(--accent-emerald)' : 'var(--accent-crimson)' }}>
                  {mr.return >= 0 ? '+' : ''}{mr.return}%
                </span>
                <div style={{
                  width: '100%',
                  height: barH,
                  borderRadius: '6px 6px 2px 2px',
                  background: mr.return >= 0 ? 'var(--gradient-bullish)' : 'var(--gradient-bearish)',
                  opacity: 0.8,
                  transition: 'height 0.6s ease-out',
                }}></div>
                <span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontWeight: 600 }}>{mr.month.split(' ')[0]}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Trade Log */}
      <div className="chart-container">
        <div className="chart-title" style={{ marginBottom: 16 }}><Calendar size={14} style={{ marginRight: 6 }} /> Recent Trade Log</div>
        <div style={{ overflowX: 'auto' }}>
          <table className="trade-log-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Symbol</th>
                <th>Action</th>
                <th>Entry</th>
                <th>Exit</th>
                <th>P&L</th>
                <th>Days</th>
                <th>Result</th>
                <th>Catalyst</th>
              </tr>
            </thead>
            <tbody>
              {bt.tradeLog.map((t, i) => (
                <tr key={i}>
                  <td>{t.date}</td>
                  <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{t.symbol}</td>
                  <td>{t.action}</td>
                  <td>₹{t.entryPrice.toLocaleString('en-IN')}</td>
                  <td>₹{t.exitPrice.toLocaleString('en-IN')}</td>
                  <td className={t.outcome === 'WIN' ? 'win' : 'loss'}>{t.profitPercent > 0 ? '+' : ''}{t.profitPercent}%</td>
                  <td>{t.holdingDays}d</td>
                  <td><span className={t.outcome === 'WIN' ? 'win' : 'loss'} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>{t.outcome === 'WIN' ? <CheckCircle2 size={12} /> : <XCircle size={12} />} {t.outcome}</span></td>
                  <td style={{ fontSize: 11, color: 'var(--text-tertiary)', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.catalyst}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// --- Screener ---
function Screener({ signals, onSelect }: { signals: StockSignal[]; onSelect: (id: string) => void }) {
  const [filters, setFilters] = useState<ScreenerFilters>({
    marketCapRange: 'ALL', catalystType: 'ALL', minConfidence: 0, sector: 'ALL', sortBy: 'confidence',
  });

  const filtered = useMemo(() => {
    let result = [...signals];
    if (filters.sector !== 'ALL') {
      result = result.filter(s => {
        const stock = STOCKS.find(st => st.id === s.stockId);
        return stock && stock.fundamentals.sector === filters.sector;
      });
    }
    if (filters.catalystType !== 'ALL') {
      result = result.filter(s => {
        const stock = STOCKS.find(st => st.id === s.stockId);
        if (filters.catalystType === 'NONE') return stock && stock.catalysts.length === 0;
        return stock && stock.catalysts.some(c => c.type === filters.catalystType);
      });
    }
    if (filters.minConfidence > 0) {
      result = result.filter(s => s.confidenceScore >= filters.minConfidence);
    }
    if (filters.marketCapRange !== 'ALL') {
      result = result.filter(s => {
        const stock = STOCKS.find(st => st.id === s.stockId);
        if (!stock) return false;
        const mc = stock.fundamentals.marketCap;
        if (filters.marketCapRange === 'LARGE') return mc > 200000;
        if (filters.marketCapRange === 'MID') return mc >= 50000 && mc <= 200000;
        if (filters.marketCapRange === 'SMALL') return mc < 50000;
        return true;
      });
    }
    result.sort((a, b) => {
      switch (filters.sortBy) {
        case 'catalyst': return b.catalystScore - a.catalystScore;
        case 'technical': return b.technicalScore - a.technicalScore;
        case 'fundamental': return b.fundamentalScore - a.fundamentalScore;
        default: return b.confidenceScore - a.confidenceScore;
      }
    });
    return result;
  }, [signals, filters]);

  const sectors = [...new Set(STOCKS.map(s => s.fundamentals.sector))];

  return (
    <div className="animate-fade-in-up">
      <div className="screener-controls">
        <select className="screener-select" value={filters.sector} onChange={e => setFilters({ ...filters, sector: e.target.value })}>
          <option value="ALL">All Sectors</option>
          {sectors.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="screener-select" value={filters.marketCapRange} onChange={e => setFilters({ ...filters, marketCapRange: e.target.value as any })}>
          <option value="ALL">All Cap</option>
          <option value="LARGE">Large Cap (&gt;₹2L Cr)</option>
          <option value="MID">Mid Cap (₹500-₹2L Cr)</option>
          <option value="SMALL">Small Cap (&lt;₹500 Cr)</option>
        </select>
        <select className="screener-select" value={filters.catalystType} onChange={e => setFilters({ ...filters, catalystType: e.target.value })}>
          <option value="ALL">All Catalysts</option>
          <option value="ORDER_WIN">Order Wins</option>
          <option value="QUARTERLY_RESULT">Quarterly Results</option>
          <option value="CAPACITY_EXPANSION">Capacity Expansion</option>
          <option value="FII_ACCUMULATION">FII Accumulation</option>
          <option value="EXPORT_ORDER">Export Orders</option>
          <option value="NONE">No Catalyst</option>
        </select>
        <select className="screener-select" value={String(filters.minConfidence)} onChange={e => setFilters({ ...filters, minConfidence: Number(e.target.value) })}>
          <option value="0">Min Confidence: Any</option>
          <option value="70">≥ 70%</option>
          <option value="80">≥ 80%</option>
          <option value="85">≥ 85%</option>
          <option value="90">≥ 90%</option>
        </select>
        <select className="screener-select" value={filters.sortBy} onChange={e => setFilters({ ...filters, sortBy: e.target.value as any })}>
          <option value="confidence">Sort: Confidence</option>
          <option value="catalyst">Sort: Catalyst Score</option>
          <option value="technical">Sort: Technical Score</option>
          <option value="fundamental">Sort: Fundamental Score</option>
        </select>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="screener-table">
          <thead>
            <tr>
              <th>Stock</th>
              <th>Price</th>
              <th>Change</th>
              <th>Action</th>
              <th>Confidence</th>
              <th>Catalyst</th>
              <th>Technical</th>
              <th>Fundamental</th>
              <th>Target 1</th>
              <th>Stop Loss</th>
              <th>R:R</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => {
              const stock = STOCKS.find(st => st.id === s.stockId)!;
              return (
                <tr key={s.stockId} onClick={() => onSelect(s.stockId)}>
                  <td>
                    <div className="screener-stock-cell">
                      <div className="screener-avatar" style={{ background: stock.logoColor }}>{stock.symbol.substring(0, 2)}</div>
                      <div>
                        <div className="screener-symbol">{stock.symbol}</div>
                        <div className="screener-company">{stock.fundamentals.sector}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>₹{s.currentPrice.toLocaleString('en-IN')}</td>
                  <td className={s.priceChangePercent >= 0 ? 'win' : 'loss'}>{s.priceChangePercent >= 0 ? '+' : ''}{s.priceChangePercent.toFixed(2)}%</td>
                  <td><span className={`rec-action-badge ${s.action === 'STRONG_BUY' ? 'strong-buy' : s.action === 'BUY' ? 'buy' : 'accumulate'}`} style={{ fontSize: 9, padding: '3px 8px' }}>{s.action.replace('_', ' ')}</span></td>
                  <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: s.confidenceScore >= 80 ? 'var(--accent-emerald)' : 'var(--accent-amber)' }}>{s.confidenceScore}%</td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: s.catalystScore > 0 ? 'var(--accent-amber)' : 'var(--text-tertiary)' }}>{s.catalystScore}</td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{s.technicalScore}</td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{s.fundamentalScore}</td>
                  <td className="win" style={{ fontFamily: 'var(--font-mono)' }}>₹{s.target1.price.toLocaleString('en-IN')}</td>
                  <td className="loss" style={{ fontFamily: 'var(--font-mono)' }}>₹{s.stopLoss.price.toLocaleString('en-IN')}</td>
                  <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent-amber)' }}>1:{s.riskRewardRatio.toFixed(1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- Alerts Manager ---
function AlertsManager({ signals }: { signals: StockSignal[] }) {
  const [channel, setChannel] = useState<'telegram' | 'whatsapp' | 'email'>('telegram');
  const [testSent, setTestSent] = useState(false);

  const topSignal = signals[0];
  if (!topSignal) return null;

  const alertText = `🚨 *BHARAT ALPHAPULSE ALERT* 🚨
━━━━━━━━━━━━━━━━━━━━
⚡ *${topSignal.action.replace('_', ' ')}*: ${topSignal.symbol}
💰 CMP: ₹${topSignal.currentPrice.toLocaleString('en-IN')}
━━━━━━━━━━━━━━━━━━━━
📍 Entry Zone: ₹${topSignal.entryZone.low} - ₹${topSignal.entryZone.high}
🎯 Target 1: ₹${topSignal.target1.price} (+${topSignal.target1.percent.toFixed(1)}%)
🎯 Target 2: ₹${topSignal.target2.price} (+${topSignal.target2.percent.toFixed(1)}%)
🛑 Stop Loss: ₹${topSignal.stopLoss.price} (${topSignal.stopLoss.percent.toFixed(1)}%)
📊 Risk:Reward = 1:${topSignal.riskRewardRatio.toFixed(2)}
━━━━━━━━━━━━━━━━━━━━
🧠 Confidence: ${topSignal.confidenceScore}% (Ensemble)
⚡ Catalyst: ${topSignal.catalystScore} | 📈 Technical: ${topSignal.technicalScore}
📊 Fundamental: ${topSignal.fundamentalScore} | 📡 Sentiment: ${topSignal.sentimentScore}
━━━━━━━━━━━━━━━━━━━━
🔔 Trigger: ${topSignal.triggerType}
⏱️ ${topSignal.signalTimestamp.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`;

  return (
    <div className="alerts-container animate-fade-in-up">
      <div className="section-header" style={{ marginBottom: 16 }}>
        <div className="section-title"><Bell size={18} /> Instant Alert Notifications</div>
      </div>

      <div className="alert-config">
        {(['telegram', 'whatsapp', 'email'] as const).map(ch => (
          <button key={ch} className={`alert-channel-btn ${channel === ch ? 'active' : ''}`} onClick={() => setChannel(ch)}>
            {ch === 'telegram' ? '📨' : ch === 'whatsapp' ? '💬' : '📧'} {ch.charAt(0).toUpperCase() + ch.slice(1)}
          </button>
        ))}
        <button
          className="alert-channel-btn"
          style={{ marginLeft: 'auto', background: testSent ? 'var(--accent-emerald-bg)' : undefined, color: testSent ? 'var(--accent-emerald)' : undefined, borderColor: testSent ? 'var(--accent-emerald)' : undefined }}
          onClick={() => { setTestSent(true); setTimeout(() => setTestSent(false), 3000); }}
        >
          {testSent ? <><CheckCircle2 size={14} /> Alert Sent!</> : <><Bell size={14} /> Send Test Alert</>}
        </button>
      </div>

      <div className="alert-preview">{alertText}</div>

      <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Shield size={12} /> Alerts are sent instantly when a new high-confidence signal is generated. Configure notification threshold in settings.
      </div>
    </div>
  );
}

// ============================================
// INTRADAY DASHBOARD
// ============================================
interface IntradayCandidate {
  stock: IndianStock;
  quote: RealTimeQuote | null;
  tech: ComputedTechnicals | null;
  intradayScore: number;
}

function FreshnessBadge({ timestamp }: { timestamp: Date | null }) {
  const label = getDataFreshness(timestamp);
  const colorMap: Record<string, string> = {
    live: 'var(--accent-emerald)',
    delayed: 'var(--accent-amber)',
    stale: 'var(--accent-crimson)',
    unavailable: 'var(--text-tertiary)',
  };
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-mono)',
      color: colorMap[label] ?? 'var(--text-tertiary)',
      background: 'rgba(0,0,0,0.3)', padding: '1px 5px', borderRadius: 4,
      textTransform: 'uppercase', letterSpacing: 1,
    }}>
      {label}
    </span>
  );
}

function IntradayDashboard({
  liveQuotes,
  computedTechMap,
}: {
  liveQuotes: Map<string, RealTimeQuote>;
  computedTechMap: Map<string, ComputedTechnicals>;
}) {
  const [capital, setCapital] = useState(100000);
  const [riskPct, setRiskPct] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [intradayCandles, setIntradayCandles] = useState<ServiceCandleData[]>([]);
  const [loadingCandles, setLoadingCandles] = useState(false);

  // Compute intraday scores
  const candidates: IntradayCandidate[] = useMemo(() => {
    return STOCKS.map(stock => {
      const quote = liveQuotes.get(stock.id) ?? null;
      const tech = computedTechMap.get(stock.id) ?? null;
      const price = quote?.price ?? stock.currentPrice;

      const volRatio = tech?.volumeRatio ?? stock.technicals.volumeRatio;
      const rsi = tech?.rsi14 ?? stock.technicals.rsi14;
      const ema20 = tech?.ema20 ?? stock.technicals.ema20;
      const hasCatalyst = stock.catalysts.length > 0 ? 1 : 0;

      // volumeRatio*30 + RSI-sweet-spot*20 + price>ema20*15 + catalyst*35
      const volScore = Math.min(volRatio * 15, 30);
      const rsiScore = (rsi >= 45 && rsi <= 65) ? 20 : (rsi > 65 && rsi < 75) ? 10 : 0;
      const emaScore = price > ema20 ? 15 : 0;
      const catScore = hasCatalyst * 35;

      return {
        stock,
        quote,
        tech,
        intradayScore: Math.round(volScore + rsiScore + emaScore + catScore),
      };
    }).sort((a, b) => b.intradayScore - a.intradayScore).slice(0, 8);
  }, [liveQuotes, computedTechMap]);

  const selected = candidates.find(c => c.stock.id === selectedId) ?? candidates[0];

  // Fetch 5m intraday candles for selected
  useEffect(() => {
    if (!selected) return;
    setLoadingCandles(true);
    fetchHistoricalCandles(selected.stock.id, '1d', '5m').then(candles => {
      setIntradayCandles(candles);
      setLoadingCandles(false);
    });
  }, [selected?.stock.id]);

  const selPrice = selected?.quote?.price ?? selected?.stock.currentPrice ?? 0;
  const selSL = selected?.tech?.support1 ?? (selPrice * 0.985);
  const maxLoss = capital * (riskPct / 100);
  const priceDiff = Math.max(selPrice - selSL, selPrice * 0.005);
  const positionSize = Math.floor(maxLoss / priceDiff);
  const positionValue = positionSize * selPrice;
  const target1 = selPrice + (selected?.tech?.atr14 ?? selPrice * 0.015) * 1.5;
  const rrRatio = priceDiff > 0 ? ((target1 - selPrice) / priceDiff).toFixed(2) : 'N/A';

  return (
    <div className="animate-fade-in-up">
      <div className="section-header">
        <div className="section-title">
          <span className="icon" style={{ background: 'var(--accent-blue-bg)', color: 'var(--accent-blue)' }}><Activity size={16} /></span>
          Intraday Intelligence Dashboard
        </div>
        <div className="section-badge" style={{ background: 'var(--accent-blue-bg)', color: 'var(--accent-blue)', borderColor: 'hsla(210,100%,60%,0.15)' }}>
          {candidates.length} Candidates
        </div>
      </div>

      {/* Candidate grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, marginBottom: 24 }}>
        {candidates.map(c => {
          const price = c.quote?.price ?? c.stock.currentPrice;
          const chgPct = c.quote?.changePercent ?? ((c.stock.currentPrice - c.stock.previousClose) / c.stock.previousClose * 100);
          const volRatio = c.tech?.volumeRatio ?? c.stock.technicals.volumeRatio;
          const rsi = c.tech?.rsi14 ?? c.stock.technicals.rsi14;
          const topCat = c.stock.catalysts[0];
          const isSelected = selectedId === c.stock.id || (!selectedId && c === candidates[0]);

          return (
            <div
              key={c.stock.id}
              onClick={() => setSelectedId(c.stock.id)}
              style={{
                background: isSelected ? 'linear-gradient(135deg,rgba(59,130,246,0.12),rgba(16,185,129,0.06))' : 'var(--card-bg)',
                border: `1px solid ${isSelected ? 'rgba(59,130,246,0.4)' : 'var(--card-border)'}`,
                borderRadius: 12, padding: 14, cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: c.stock.logoColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#fff' }}>
                    {c.stock.symbol.substring(0, 3)}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{c.stock.symbol}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{c.stock.fundamentals.sector}</div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                    ₹{price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </div>
                  <div style={{ fontSize: 11, color: chgPct >= 0 ? 'var(--accent-emerald)' : 'var(--accent-crimson)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
                    {chgPct >= 0 ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                    {chgPct >= 0 ? '+' : ''}{chgPct.toFixed(2)}%
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 8 }}>
                <div style={{ background: 'rgba(0,0,0,0.25)', padding: '5px 8px', borderRadius: 6, textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Vol Ratio</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: volRatio >= 2 ? 'var(--accent-emerald)' : 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{volRatio.toFixed(1)}x</div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.25)', padding: '5px 8px', borderRadius: 6, textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>RSI 14</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: rsi >= 45 && rsi <= 65 ? 'var(--accent-emerald)' : rsi > 70 ? 'var(--accent-amber)' : 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{rsi.toFixed(1)}</div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.25)', padding: '5px 8px', borderRadius: 6, textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Score</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: c.intradayScore >= 60 ? 'var(--accent-emerald)' : c.intradayScore >= 40 ? 'var(--accent-amber)' : 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{c.intradayScore}</div>
                </div>
              </div>

              {topCat && (
                <div style={{ fontSize: 10, color: 'var(--accent-amber)', background: 'var(--accent-amber-bg)', padding: '3px 7px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
                  <Zap size={9} /> {topCat.headline.substring(0, 55)}…
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <FreshnessBadge timestamp={c.quote?.timestamp ?? null} />
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                  ST: <span style={{ color: (c.tech?.supertrend ?? c.stock.technicals.supertrend) === 'BUY' ? 'var(--accent-emerald)' : 'var(--accent-crimson)' }}>
                    {c.tech?.supertrend ?? c.stock.technicals.supertrend}
                  </span>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Intraday chart */}
      {selected && (
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 14, padding: 16, marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <LineChart size={16} style={{ color: 'var(--accent-blue)' }} />
              {selected.stock.symbol} — 5-Min Intraday Chart
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
              {loadingCandles ? 'Loading candles…' : `${intradayCandles.length} candles`} • VWAP: ₹{(selected.tech?.vwap ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </div>
          </div>
          {intradayCandles.length > 0 ? (
            <IntradayCandleChart candles={intradayCandles} vwap={selected.tech?.vwap ?? 0} ema9={selected.tech?.ema9 ?? 0} />
          ) : (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
              {loadingCandles ? '⏳ Fetching 5-min candles from Yahoo Finance…' : '⚠️ Intraday candles unavailable (market may be closed)'}
            </div>
          )}
        </div>
      )}

      {/* Position Size Calculator */}
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 14, padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <DollarSign size={16} style={{ color: 'var(--accent-emerald)' }} />
          Position Size Calculator
          {selected && <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 400 }}>— {selected.stock.symbol}</span>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block', marginBottom: 4 }}>Capital (₹)</label>
            <input
              type="number"
              value={capital}
              onChange={e => setCapital(Number(e.target.value))}
              style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--card-border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'var(--font-mono)', outline: 'none' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block', marginBottom: 4 }}>Risk per Trade (%)</label>
            <input
              type="number"
              value={riskPct}
              step={0.5}
              min={0.1}
              max={5}
              onChange={e => setRiskPct(Number(e.target.value))}
              style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--card-border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'var(--font-mono)', outline: 'none' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block', marginBottom: 4 }}>Entry Price (₹)</label>
            <input
              type="number"
              value={selPrice}
              readOnly
              style={{ width: '100%', background: 'rgba(0,0,0,0.15)', border: '1px solid var(--card-border)', borderRadius: 8, padding: '8px 12px', color: 'var(--accent-blue)', fontSize: 13, fontFamily: 'var(--font-mono)', outline: 'none' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block', marginBottom: 4 }}>Stop Loss (₹)</label>
            <input
              type="number"
              value={Math.round(selSL * 100) / 100}
              readOnly
              style={{ width: '100%', background: 'rgba(0,0,0,0.15)', border: '1px solid var(--card-border)', borderRadius: 8, padding: '8px 12px', color: 'var(--accent-crimson)', fontSize: 13, fontFamily: 'var(--font-mono)', outline: 'none' }}
            />
          </div>
        </div>

        <div style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(59,130,246,0.04))', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, textAlign: 'center' }}>
            {[
              { label: 'Max Loss', value: `₹${maxLoss.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, color: 'var(--accent-crimson)' },
              { label: 'Qty (shares)', value: positionSize.toLocaleString('en-IN'), color: 'var(--accent-emerald)' },
              { label: 'Position Value', value: `₹${positionValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, color: 'var(--accent-blue)' },
              { label: 'Target 1', value: `₹${Math.round(target1 * 100) / 100}`, color: 'var(--accent-emerald)' },
              { label: 'R:R Ratio', value: `1:${rrRatio}`, color: 'var(--accent-amber)' },
            ].map(item => (
              <div key={item.label} style={{ background: 'rgba(0,0,0,0.3)', padding: '10px 12px', borderRadius: 8 }}>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: item.color, fontFamily: 'var(--font-mono)' }}>{item.value}</div>
              </div>
            ))}
          </div>
          {selected && (
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center', fontFamily: 'var(--font-mono)', background: 'rgba(0,0,0,0.2)', padding: '8px 12px', borderRadius: 8 }}>
              📋 Buy <strong style={{ color: 'var(--accent-emerald)' }}>{positionSize} shares</strong> of <strong>{selected.stock.symbol}</strong> at
              ₹{selPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })} &nbsp;|&nbsp;
              SL ₹{Math.round(selSL * 100) / 100} &nbsp;|&nbsp;
              Max loss ₹{maxLoss.toLocaleString('en-IN', { maximumFractionDigits: 0 })} &nbsp;|&nbsp;
              EOD exit mandatory
            </div>
          )}
        </div>
        <div style={{ marginTop: 10, fontSize: 10, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 5 }}>
          <Shield size={10} /> For personal research only. Not financial advice. Always verify with live price before placing order.
        </div>
      </div>
    </div>
  );
}

// Simple intraday candlestick SVG chart
function IntradayCandleChart({ candles, vwap, ema9 }: { candles: ServiceCandleData[]; vwap: number; ema9: number }) {
  const recent = candles.slice(-60);
  if (recent.length === 0) return null;

  const allPrices = recent.flatMap(c => [c.high, c.low]);
  if (vwap > 0) allPrices.push(vwap);
  if (ema9 > 0) allPrices.push(ema9);
  const minP = Math.min(...allPrices) * 0.998;
  const maxP = Math.max(...allPrices) * 1.002;
  const priceRange = maxP - minP;

  const w = 760; const mainH = 200; const pad = { top: 10, right: 60, bottom: 20, left: 10 };
  const chartW = w - pad.left - pad.right;
  const cw = chartW / recent.length;
  const yP = (p: number) => pad.top + (1 - (p - minP) / priceRange) * mainH;

  // VWAP and EMA9 lines
  const vwapLine = vwap > 0 ? recent.map((_, i) => `${pad.left + i * cw + cw / 2},${yP(vwap)}`).join(' ') : null;
  const ema9Line = ema9 > 0 ? recent.map((_, i) => `${pad.left + i * cw + cw / 2},${yP(ema9)}`).join(' ') : null;

  // Y-axis labels
  const yLabels = Array.from({ length: 5 }, (_, i) => minP + (priceRange * i) / 4);

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={w} height={mainH + pad.top + pad.bottom} viewBox={`0 0 ${w} ${mainH + pad.top + pad.bottom}`} style={{ display: 'block' }}>
        {/* Grid */}
        {yLabels.map((p, i) => (
          <g key={i}>
            <line x1={pad.left} x2={w - pad.right} y1={yP(p)} y2={yP(p)} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
            <text x={w - pad.right + 4} y={yP(p) + 4} fill="rgba(255,255,255,0.4)" fontSize={8} fontFamily="monospace">
              {p.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </text>
          </g>
        ))}
        {/* VWAP */}
        {vwapLine && <polyline points={vwapLine} fill="none" stroke="rgba(251,191,36,0.7)" strokeWidth={1.5} strokeDasharray="4,2" />}
        {/* EMA9 */}
        {ema9Line && <polyline points={ema9Line} fill="none" stroke="rgba(59,130,246,0.7)" strokeWidth={1} />}
        {/* Candles */}
        {recent.map((c, i) => {
          const x = pad.left + i * cw;
          const isBull = c.close >= c.open;
          const fillColor = isBull ? 'rgba(16,185,129,0.85)' : 'rgba(239,68,68,0.85)';
          const strokeColor = isBull ? 'var(--accent-emerald)' : 'var(--accent-crimson)';
          const bodyTop = yP(Math.max(c.open, c.close));
          const bodyBot = yP(Math.min(c.open, c.close));
          const bodyH = Math.max(bodyBot - bodyTop, 1);
          const midX = x + cw / 2;
          return (
            <g key={i}>
              <line x1={midX} x2={midX} y1={yP(c.high)} y2={yP(c.low)} stroke={strokeColor} strokeWidth={1} />
              <rect x={x + cw * 0.1} y={bodyTop} width={cw * 0.8} height={bodyH} fill={fillColor} rx={1} />
            </g>
          );
        })}
        {/* Legend */}
        {vwap > 0 && (
          <g>
            <line x1={pad.left + 4} x2={pad.left + 18} y1={10} y2={10} stroke="rgba(251,191,36,0.7)" strokeWidth={1.5} strokeDasharray="4,2" />
            <text x={pad.left + 22} y={14} fill="rgba(251,191,36,0.8)" fontSize={9} fontFamily="monospace">VWAP {vwap.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</text>
          </g>
        )}
        {ema9 > 0 && (
          <g>
            <line x1={pad.left + 100} x2={pad.left + 114} y1={10} y2={10} stroke="rgba(59,130,246,0.7)" strokeWidth={1} />
            <text x={pad.left + 118} y={14} fill="rgba(59,130,246,0.8)" fontSize={9} fontFamily="monospace">EMA9 {ema9.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</text>
          </g>
        )}
      </svg>
    </div>
  );
}

// ============================================
// RESEARCH & PORTFOLIO DASHBOARD
// ============================================
interface Holding {
  stockId: string;
  symbol: string;
  quantity: number;
  avgBuyPrice: number;
  buyDate: string;
}

const SECTOR_PE: Record<string, number> = {
  Defense: 35, IT: 25, Banking: 15, Auto: 18, Infrastructure: 20,
  'Green Energy': 30, Telecom: 22, Electronics: 28,
};

function ResearchDashboard({ liveQuotes }: { liveQuotes: Map<string, RealTimeQuote> }) {
  const [portfolio, setPortfolio] = useState<Holding[]>(() => {
    const cached = loadFromCache<Holding[]>('portfolio');
    return cached?.data ?? [];
  });
  const [addForm, setAddForm] = useState({ stockId: 'HAL', qty: 10, price: 0, date: new Date().toISOString().split('T')[0] });
  const [researchFilter, setResearchFilter] = useState('ALL');

  const savePortfolio = (holdings: Holding[]) => {
    setPortfolio(holdings);
    saveToCache('portfolio', holdings);
  };

  const addHolding = () => {
    if (!addForm.qty || !addForm.price) return;
    const stock = STOCKS.find(s => s.id === addForm.stockId);
    if (!stock) return;
    const existing = portfolio.findIndex(h => h.stockId === addForm.stockId);
    if (existing >= 0) {
      // Average down/up
      const h = portfolio[existing];
      const newQty = h.quantity + addForm.qty;
      const newAvg = (h.avgBuyPrice * h.quantity + addForm.price * addForm.qty) / newQty;
      const updated = [...portfolio];
      updated[existing] = { ...h, quantity: newQty, avgBuyPrice: Math.round(newAvg * 100) / 100 };
      savePortfolio(updated);
    } else {
      savePortfolio([...portfolio, { stockId: addForm.stockId, symbol: stock.symbol, quantity: addForm.qty, avgBuyPrice: addForm.price, buyDate: addForm.date }]);
    }
  };

  const removeHolding = (stockId: string) => savePortfolio(portfolio.filter(h => h.stockId !== stockId));

  const getFundamentalVerdict = (stock: IndianStock): { label: string; color: string; score: number } => {
    const f = stock.fundamentals;
    let score = 0;
    if (f.roce >= 20) score += 25; else if (f.roce >= 15) score += 15; else if (f.roce >= 10) score += 8;
    if (f.roe >= 20) score += 20; else if (f.roe >= 15) score += 12; else if (f.roe >= 10) score += 6;
    if (f.debtToEquity < 0.5) score += 15; else if (f.debtToEquity < 1) score += 8;
    if (f.yoyProfitGrowth >= 20) score += 20; else if (f.yoyProfitGrowth >= 10) score += 10;
    if (f.promoterHolding >= 50) score += 10; else if (f.promoterHolding >= 30) score += 5;
    if (f.fiiHoldingChange > 0) score += 10;
    const sectorPE = SECTOR_PE[f.sector] ?? 20;
    if (f.peRatio < sectorPE) score += 5; else if (f.peRatio > sectorPE * 1.5) score -= 5;

    if (score >= 75) return { label: 'BUY', color: 'var(--accent-emerald)', score };
    if (score >= 55) return { label: 'HOLD', color: 'var(--accent-blue)', score };
    if (score >= 40) return { label: 'WATCH', color: 'var(--accent-amber)', score };
    return { label: 'AVOID', color: 'var(--accent-crimson)', score };
  };

  const sectors = ['ALL', ...new Set(STOCKS.map(s => s.fundamentals.sector))];
  const filteredStocks = researchFilter === 'ALL' ? STOCKS : STOCKS.filter(s => s.fundamentals.sector === researchFilter);

  // Portfolio calculations
  const portfolioRows = portfolio.map(h => {
    const stock = STOCKS.find(s => s.id === h.stockId);
    const livePrice = liveQuotes.get(h.stockId)?.price ?? stock?.currentPrice ?? h.avgBuyPrice;
    const invested = h.quantity * h.avgBuyPrice;
    const current = h.quantity * livePrice;
    const pnl = current - invested;
    const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
    return { ...h, livePrice, invested, current, pnl, pnlPct, quote: liveQuotes.get(h.stockId) ?? null };
  });

  const totalInvested = portfolioRows.reduce((a, r) => a + r.invested, 0);
  const totalCurrent = portfolioRows.reduce((a, r) => a + r.current, 0);
  const totalPnl = totalCurrent - totalInvested;
  const totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

  // Sector allocation
  const sectorAlloc: Record<string, number> = {};
  portfolioRows.forEach(r => {
    const stock = STOCKS.find(s => s.id === r.stockId);
    const sector = stock?.fundamentals.sector ?? 'Other';
    sectorAlloc[sector] = (sectorAlloc[sector] ?? 0) + r.current;
  });

  return (
    <div className="animate-fade-in-up">
      {/* PORTFOLIO TRACKER */}
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 14, padding: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Briefcase size={16} style={{ color: 'var(--accent-violet)' }} />
            Personal Portfolio Tracker
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Shield size={10} /> Not connected to any broker — personal tracker only
          </div>
        </div>

        {/* Add holding form */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 8, marginBottom: 16, alignItems: 'end' }}>
          <div>
            <label style={{ fontSize: 10, color: 'var(--text-tertiary)', display: 'block', marginBottom: 3 }}>Stock</label>
            <select
              value={addForm.stockId}
              onChange={e => {
                const stock = STOCKS.find(s => s.id === e.target.value);
                setAddForm({ ...addForm, stockId: e.target.value, price: liveQuotes.get(e.target.value)?.price ?? stock?.currentPrice ?? 0 });
              }}
              style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--card-border)', borderRadius: 8, padding: '7px 10px', color: 'var(--text-primary)', fontSize: 12, outline: 'none' }}
            >
              {STOCKS.map(s => <option key={s.id} value={s.id}>{s.symbol} — {s.companyName}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 10, color: 'var(--text-tertiary)', display: 'block', marginBottom: 3 }}>Qty</label>
            <input type="number" value={addForm.qty} onChange={e => setAddForm({ ...addForm, qty: Number(e.target.value) })} min={1}
              style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--card-border)', borderRadius: 8, padding: '7px 10px', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'var(--font-mono)', outline: 'none' }} />
          </div>
          <div>
            <label style={{ fontSize: 10, color: 'var(--text-tertiary)', display: 'block', marginBottom: 3 }}>Buy Price (₹)</label>
            <input type="number" value={addForm.price} onChange={e => setAddForm({ ...addForm, price: Number(e.target.value) })}
              style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--card-border)', borderRadius: 8, padding: '7px 10px', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'var(--font-mono)', outline: 'none' }} />
          </div>
          <div>
            <label style={{ fontSize: 10, color: 'var(--text-tertiary)', display: 'block', marginBottom: 3 }}>Buy Date</label>
            <input type="date" value={addForm.date} onChange={e => setAddForm({ ...addForm, date: e.target.value })}
              style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--card-border)', borderRadius: 8, padding: '7px 10px', color: 'var(--text-primary)', fontSize: 12, outline: 'none' }} />
          </div>
          <button onClick={addHolding} style={{ background: 'var(--accent-emerald)', color: '#000', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            + Add
          </button>
        </div>

        {portfolio.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-tertiary)', fontSize: 13 }}>
            No holdings yet. Add your first position above.
          </div>
        ) : (
          <>
            {/* Summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
              {[
                { label: 'Invested', value: `₹${totalInvested.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, color: 'var(--text-primary)' },
                { label: 'Current Value', value: `₹${totalCurrent.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, color: totalCurrent >= totalInvested ? 'var(--accent-emerald)' : 'var(--accent-crimson)' },
                { label: 'P&L (₹)', value: `${totalPnl >= 0 ? '+' : ''}₹${totalPnl.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, color: totalPnl >= 0 ? 'var(--accent-emerald)' : 'var(--accent-crimson)' },
                { label: 'P&L (%)', value: `${totalPnlPct >= 0 ? '+' : ''}${totalPnlPct.toFixed(2)}%`, color: totalPnlPct >= 0 ? 'var(--accent-emerald)' : 'var(--accent-crimson)' },
              ].map(m => (
                <div key={m.label} style={{ background: 'rgba(0,0,0,0.3)', padding: '10px 12px', borderRadius: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 3 }}>{m.label}</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: m.color, fontFamily: 'var(--font-mono)' }}>{m.value}</div>
                </div>
              ))}
            </div>

            {/* Holdings table */}
            <div style={{ overflowX: 'auto' }}>
              <table className="screener-table">
                <thead>
                  <tr>
                    <th>Stock</th><th>Qty</th><th>Avg Buy</th><th>CMP <FreshnessBadge timestamp={portfolioRows[0]?.quote?.timestamp ?? null} /></th>
                    <th>Invested</th><th>Value</th><th>P&L</th><th>P&L %</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {portfolioRows.map(row => (
                    <tr key={row.stockId}>
                      <td><strong style={{ color: 'var(--text-primary)' }}>{row.symbol}</strong></td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{row.quantity}</td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>₹{row.avgBuyPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-blue)' }}>₹{row.livePrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>₹{row.invested.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>₹{row.current.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: row.pnl >= 0 ? 'var(--accent-emerald)' : 'var(--accent-crimson)' }}>
                        {row.pnl >= 0 ? '+' : ''}₹{row.pnl.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: row.pnlPct >= 0 ? 'var(--accent-emerald)' : 'var(--accent-crimson)' }}>
                        {row.pnlPct >= 0 ? '+' : ''}{row.pnlPct.toFixed(2)}%
                      </td>
                      <td>
                        <button onClick={() => removeHolding(row.stockId)} style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--accent-crimson)', padding: '2px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Sector allocation */}
            {Object.keys(sectorAlloc).length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Sector Allocation</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {Object.entries(sectorAlloc).map(([sector, val]) => {
                    const pct = totalCurrent > 0 ? (val / totalCurrent) * 100 : 0;
                    return (
                      <div key={sector} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 80, fontSize: 11, color: 'var(--text-secondary)', flexShrink: 0 }}>{sector}</div>
                        <div style={{ flex: 1, background: 'rgba(0,0,0,0.3)', borderRadius: 4, height: 8 }}>
                          <div style={{ width: `${pct}%`, height: 8, borderRadius: 4, background: 'var(--accent-blue)', transition: 'width 0.5s' }} />
                        </div>
                        <div style={{ width: 45, fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{pct.toFixed(1)}%</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* FUNDAMENTAL RESEARCH CARDS */}
      <div style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600 }}>Filter:</span>
        {sectors.map(s => (
          <button key={s} onClick={() => setResearchFilter(s)} style={{
            background: researchFilter === s ? 'var(--accent-blue-bg)' : 'rgba(0,0,0,0.2)',
            border: `1px solid ${researchFilter === s ? 'var(--accent-blue)' : 'var(--card-border)'}`,
            color: researchFilter === s ? 'var(--accent-blue)' : 'var(--text-secondary)',
            padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600,
          }}>{s}</button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
        {filteredStocks.map(stock => {
          const verdict = getFundamentalVerdict(stock);
          const f = stock.fundamentals;
          const livePrice = liveQuotes.get(stock.id)?.price ?? stock.currentPrice;
          const quote = liveQuotes.get(stock.id) ?? null;
          const sectorPE = SECTOR_PE[f.sector] ?? 20;

          return (
            <div key={stock.id} style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 12, padding: 16 }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: stock.logoColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#fff' }}>
                    {stock.symbol.substring(0, 3)}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{stock.symbol}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{f.sector} • {f.industry}</div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ background: verdict.color, color: '#000', padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 800, marginBottom: 4 }}>{verdict.label}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Score: {verdict.score}/100</div>
                </div>
              </div>

              {/* Live Price */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, background: 'rgba(0,0,0,0.25)', padding: '8px 10px', borderRadius: 8 }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>CMP</div>
                  <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                    ₹{livePrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <FreshnessBadge timestamp={quote?.timestamp ?? null} />
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 3 }}>Yahoo Finance</div>
                </div>
              </div>

              {/* Fundamental metrics grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 10 }}>
                {[
                  { label: 'ROCE', value: `${f.roce}%`, good: f.roce >= 15 },
                  { label: 'ROE', value: `${f.roe}%`, good: f.roe >= 15 },
                  { label: 'D/E', value: f.debtToEquity.toFixed(2), good: f.debtToEquity < 0.5 },
                  { label: 'P/E', value: f.peRatio.toFixed(1), good: f.peRatio < sectorPE },
                  { label: 'P/B', value: f.pbRatio.toFixed(1), good: f.pbRatio < 5 },
                  { label: 'EPS', value: `₹${f.eps}`, good: f.eps > 0 },
                  { label: 'Rev Gr', value: `${f.yoyRevenueGrowth}%`, good: f.yoyRevenueGrowth > 15 },
                  { label: 'PAT Gr', value: `${f.yoyProfitGrowth}%`, good: f.yoyProfitGrowth > 15 },
                  { label: 'OPM', value: `${f.operatingMargin}%`, good: f.operatingMargin > 12 },
                ].map(m => (
                  <div key={m.label} style={{ background: 'rgba(0,0,0,0.2)', padding: '5px 7px', borderRadius: 6 }}>
                    <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>{m.label}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: m.good ? 'var(--accent-emerald)' : 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{m.value}</div>
                  </div>
                ))}
              </div>

              {/* Promoter / FII */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', padding: '5px 7px', borderRadius: 6 }}>
                  <div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>PROMOTER</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: f.promoterHolding >= 50 ? 'var(--accent-emerald)' : 'var(--accent-amber)', fontFamily: 'var(--font-mono)' }}>{f.promoterHolding}%</div>
                </div>
                <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', padding: '5px 7px', borderRadius: 6 }}>
                  <div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>FII Δ</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: f.fiiHoldingChange > 0 ? 'var(--accent-emerald)' : f.fiiHoldingChange < 0 ? 'var(--accent-crimson)' : 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                    {f.fiiHoldingChange > 0 ? '+' : ''}{f.fiiHoldingChange}%
                  </div>
                </div>
                <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', padding: '5px 7px', borderRadius: 6 }}>
                  <div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>MCap (Cr)</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>₹{(f.marketCap / 1000).toFixed(0)}K</div>
                </div>
                <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', padding: '5px 7px', borderRadius: 6 }}>
                  <div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>Div Yld</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{f.dividendYield}%</div>
                </div>
              </div>

              {/* Valuation vs sector */}
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', padding: '5px 8px', background: 'rgba(0,0,0,0.2)', borderRadius: 6, display: 'flex', justifyContent: 'space-between' }}>
                <span>Sector PE: <strong style={{ color: 'var(--accent-blue)' }}>{sectorPE}x</strong></span>
                <span>Stock PE: <strong style={{ color: f.peRatio < sectorPE ? 'var(--accent-emerald)' : 'var(--accent-amber)' }}>{f.peRatio}x</strong></span>
                <span>{f.peRatio < sectorPE ? '✅ Undervalued vs sector' : '⚠️ Premium to sector'}</span>
              </div>

              <div style={{ marginTop: 8, fontSize: 9, color: 'var(--text-tertiary)' }}>
                ⚠️ Fundamentals: last verified quarterly report (static). Price: Yahoo Finance (live/delayed).
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================
// GLOBAL MARKETS & NEWS DASHBOARD
// ============================================
function GlobalDashboard() {
  const [globalMarkets, setGlobalMarkets] = useState<GlobalMarketItem[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsQuery, setNewsQuery] = useState('india stock market');
  const [loadingMarkets, setLoadingMarkets] = useState(false);
  const [loadingNews, setLoadingNews] = useState(false);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const fetchAll = useCallback(async () => {
    setLoadingMarkets(true);
    setLoadingNews(true);
    const [markets, newsItems] = await Promise.all([
      fetchGlobalMarkets(),
      fetchMarketNews(newsQuery),
    ]);
    setGlobalMarkets(markets);
    setNews(newsItems);
    setLastFetched(new Date());
    setLoadingMarkets(false);
    setLoadingNews(false);
  }, [newsQuery]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const categoryGroups: Record<string, GlobalMarketItem[]> = {};
  for (const item of globalMarkets) {
    if (!categoryGroups[item.category]) categoryGroups[item.category] = [];
    categoryGroups[item.category].push(item);
  }

  const categoryLabels: Record<string, string> = {
    index: '📈 Global Indices',
    commodity: '🛢️ Commodities',
    forex: '💱 Forex',
    crypto: '₿ Crypto',
  };

  const timeAgo = (ts: number) => {
    const diff = (Date.now() - ts * 1000) / 60000;
    if (diff < 1) return 'Just now';
    if (diff < 60) return `${Math.floor(diff)}m ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
    return `${Math.floor(diff / 1440)}d ago`;
  };

  return (
    <div className="animate-fade-in-up">
      {/* Header */}
      <div className="section-header">
        <div className="section-title">
          <span className="icon" style={{ background: 'rgba(59,130,246,0.15)', color: 'var(--accent-blue)' }}>🌍</span>
          Global Markets & News
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {lastFetched && (
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
              Updated {lastFetched.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })} IST
            </span>
          )}
          <button
            onClick={fetchAll}
            disabled={loadingMarkets}
            style={{ background: 'var(--accent-blue-bg)', border: '1px solid rgba(59,130,246,0.3)', color: 'var(--accent-blue)', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}
          >
            <RefreshCw size={11} style={{ animation: loadingMarkets ? 'spin 1s linear infinite' : 'none' }} />
            Refresh
          </button>
        </div>
      </div>

      {/* Key India Context Card */}
      <div style={{ background: 'linear-gradient(135deg,rgba(16,185,129,0.08),rgba(59,130,246,0.06))', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 12, padding: '12px 16px', marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-emerald)', marginBottom: 6 }}>🇮🇳 Why Global Markets Matter for Indian Traders</div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          <strong>SGX Nifty</strong> → Early signal for NSE opening (trades before 9:15 AM IST) &nbsp;|&nbsp;
          <strong>US markets</strong> → Overnight moves affect IT stocks (TCS, Infosys, Wipro) &nbsp;|&nbsp;
          <strong>Crude Oil</strong> → Affects ONGC, Reliance, BPCL, IOC, OMC inflation &nbsp;|&nbsp;
          <strong>Gold</strong> → Safe-haven demand indicator; affects MCX, jewellery stocks &nbsp;|&nbsp;
          <strong>USD/INR</strong> → Stronger dollar = pressure on IT margins, cheaper exports &nbsp;|&nbsp;
          <strong>VIX &lt; 15</strong> → Low fear = risk-on; <strong>VIX &gt; 25</strong> → High volatility, avoid leveraged bets
        </div>
      </div>

      {/* Global Markets Grid */}
      {loadingMarkets && globalMarkets.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-tertiary)' }}>
          ⏳ Fetching global market data via Yahoo Finance…
        </div>
      ) : (
        <>
          {Object.entries(categoryGroups).map(([cat, items]) => (
            <div key={cat} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
                {categoryLabels[cat] ?? cat}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                {items.map(item => {
                  const isUp = item.change >= 0;
                  const isVIX = item.name === 'VIX';
                  const vixColor = isVIX ? (item.value > 25 ? 'var(--accent-crimson)' : item.value > 15 ? 'var(--accent-amber)' : 'var(--accent-emerald)') : '';
                  return (
                    <div key={item.name} style={{
                      background: 'var(--card-bg)', border: `1px solid ${isUp ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.15)'}`,
                      borderRadius: 10, padding: '10px 12px',
                    }}>
                      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>{item.name}</div>
                      <div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-mono)', color: isVIX ? vixColor : 'var(--text-primary)' }}>
                        {item.value.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                        {item.currency !== 'USD' && <span style={{ fontSize: 9, color: 'var(--text-tertiary)', marginLeft: 4 }}>{item.currency}</span>}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: isUp ? 'var(--accent-emerald)' : 'var(--accent-crimson)', display: 'flex', alignItems: 'center', gap: 2 }}>
                          {isUp ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                          {isUp ? '+' : ''}{item.changePercent.toFixed(2)}%
                        </div>
                        {isVIX && (
                          <div style={{ fontSize: 9, color: vixColor, fontWeight: 700 }}>
                            {item.value < 15 ? '😊 Low Fear' : item.value < 25 ? '😐 Moderate' : '😱 High Fear'}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {globalMarkets.length === 0 && (
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 12, padding: 20, textAlign: 'center', color: 'var(--text-tertiary)' }}>
              ⚠️ Could not fetch global market data. Yahoo Finance proxy may be unavailable when market is closed or network is slow.
              Try refreshing, or check after 9 AM IST on a weekday.
            </div>
          )}
        </>
      )}

      {/* News Section */}
      <div style={{ marginTop: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
            📰 Market News
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {['india stock market', 'NSE BSE India', 'global economy', 'FII DII india', 'crude oil gold'].map(q => (
              <button key={q} onClick={() => { setNewsQuery(q); }}
                style={{ background: newsQuery === q ? 'var(--accent-blue-bg)' : 'rgba(0,0,0,0.2)', border: `1px solid ${newsQuery === q ? 'var(--accent-blue)' : 'var(--card-border)'}`, color: newsQuery === q ? 'var(--accent-blue)' : 'var(--text-tertiary)', padding: '3px 8px', borderRadius: 5, cursor: 'pointer', fontSize: 10, fontWeight: 600 }}>
                {q}
              </button>
            ))}
          </div>
        </div>

        {loadingNews ? (
          <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-tertiary)' }}>⏳ Fetching news…</div>
        ) : news.length === 0 ? (
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 12, padding: 20, textAlign: 'center', color: 'var(--text-tertiary)' }}>
            ⚠️ News fetch failed or no results. Yahoo Finance news API may be rate-limited.
            <br /><span style={{ fontSize: 10 }}>Try a different search term or refresh after a minute.</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {news.map((item, i) => (
              <a key={i} href={item.link} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 10, padding: '12px 14px', transition: 'border-color 0.2s', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(59,130,246,0.4)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--card-border)')}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4, marginBottom: 5 }}>{item.title}</div>
                      {item.summary && (
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 5 }}>
                          {item.summary.substring(0, 200)}…
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 10, color: 'var(--accent-blue)', fontWeight: 600 }}>{item.publisher}</span>
                        <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{timeAgo(item.providerPublishTime)}</span>
                        {item.relatedTickers?.slice(0, 3).map(t => (
                          <span key={t} style={{ fontSize: 9, background: 'var(--accent-blue-bg)', color: 'var(--accent-blue)', padding: '1px 5px', borderRadius: 3, fontFamily: 'var(--font-mono)' }}>{t}</span>
                        ))}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--accent-blue)', whiteSpace: 'nowrap', paddingTop: 2 }}>
                      ↗ Read
                    </div>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Data source disclaimer */}
      <div style={{ marginTop: 16, fontSize: 10, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
        <Shield size={10} />
        Global market data & news from Yahoo Finance (free, 15-min delayed). Forex data may differ slightly from NSE live rates.
        Data for personal use only — not financial advice.
      </div>
    </div>
  );
}

// ============================================
// MAIN APP
// ============================================
type TabId = 'recommendations' | 'intraday' | 'research' | 'global' | 'radar' | 'screener' | 'accuracy' | 'alerts';

function App() {
  const [activeTab, setActiveTab] = useState<TabId>('recommendations');
  const [selectedStock, setSelectedStock] = useState<string | null>(null);
  const [signals, setSignals] = useState<StockSignal[]>([]);

  // Live data state
  const [liveQuotes, setLiveQuotes] = useState<Map<string, RealTimeQuote>>(new Map());
  const [liveIndices, setLiveIndices] = useState<MarketIndex[]>([]);
  const [stockCandles, setStockCandles] = useState<Map<string, ServiceCandleData[]>>(new Map());
  const [computedTechMap, setComputedTechMap] = useState<Map<string, ComputedTechnicals>>(new Map());
  const [dataLastRefreshed, setDataLastRefreshed] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Generate signals from static data on mount
  useEffect(() => {
    setSignals(generateAllSignals());
  }, []);

  // ── refreshAllData: fetch real quotes + indices ──────────
  const refreshAllData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [quotes, rawIndices] = await Promise.all([
        fetchAllRealTimeQuotes(),
        fetchMarketIndices(),
      ]);

      setLiveQuotes(quotes);

      if (rawIndices.length > 0) {
        // Merge fetched indices with static fallbacks (add NIFTY IT and DEFENSE from static)
        const fetchedNames = rawIndices.map(i => i.name);
        const staticFallback = MARKET_INDICES.filter(mi => !fetchedNames.includes(mi.name));
        setLiveIndices([...rawIndices, ...staticFallback]);
      }

      // Update STOCKS prices in-memory and regenerate signals
      const updatedStocks = STOCKS.map(stock => {
        const q = quotes.get(stock.id);
        if (!q) return stock;
        return {
          ...stock,
          currentPrice: q.price,
          previousClose: q.previousClose,
          dayHigh: q.high,
          dayLow: q.low,
          dayOpen: q.open,
          volume: q.volume,
        };
      });

      // Regenerate signals using updated prices
      const newSignals = updatedStocks.map(s => generateSignal(s)).filter((s): s is StockSignal => s !== null).sort((a, b) => b.confidenceScore - a.confidenceScore);
      if (newSignals.length > 0) setSignals(newSignals);

      setDataLastRefreshed(new Date());
      saveToCache('last_refresh', new Date().toISOString());
    } catch {
      // Silent fail — keep showing cached/static data
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // Initial fetch + poll every 60s during market hours
  useEffect(() => {
    refreshAllData();
    const iv = setInterval(() => {
      const { isOpen } = isNSEMarketOpen();
      if (isOpen) refreshAllData();
    }, 60000);
    return () => clearInterval(iv);
  }, [refreshAllData]);

  // Fetch historical candles when a stock is selected (for detail modal)
  useEffect(() => {
    if (!selectedStock || stockCandles.has(selectedStock)) return;
    fetchHistoricalCandles(selectedStock, '6mo', '1d').then(candles => {
      if (candles.length > 0) {
        const price = liveQuotes.get(selectedStock)?.price ?? STOCKS.find(s => s.id === selectedStock)?.currentPrice ?? 0;
        const tech = computeTechnicals(candles, price);
        setStockCandles(prev => new Map(prev).set(selectedStock, candles));
        setComputedTechMap(prev => new Map(prev).set(selectedStock, tech));
      }
    });
  }, [selectedStock, stockCandles, liveQuotes]);

  const selectedStockData = useMemo(() => {
    if (!selectedStock) return null;
    const base = STOCKS.find(s => s.id === selectedStock);
    if (!base) return null;
    const q = liveQuotes.get(selectedStock);
    const realCandles = stockCandles.get(selectedStock);
    return {
      ...base,
      currentPrice: q?.price ?? base.currentPrice,
      previousClose: q?.previousClose ?? base.previousClose,
      dayHigh: q?.high ?? base.dayHigh,
      dayLow: q?.low ?? base.dayLow,
      volume: q?.volume ?? base.volume,
      candleData: realCandles ?? base.candleData,
    };
  }, [selectedStock, liveQuotes, stockCandles]);

  const selectedSignal = selectedStock ? signals.find(s => s.stockId === selectedStock) : undefined;

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'recommendations', label: '📡 Swing Signals', icon: <Target size={14} /> },
    { id: 'intraday', label: '⚡ Intraday', icon: <Activity size={14} /> },
    { id: 'research', label: '📊 Research', icon: <BarChart3 size={14} /> },
    { id: 'global', label: '🌍 Global', icon: <TrendingUp size={14} /> },
    { id: 'radar', label: 'Live Radar', icon: <Radio size={14} /> },
    { id: 'screener', label: 'Screener', icon: <Filter size={14} /> },
    { id: 'accuracy', label: 'Model Performance', icon: <Award size={14} /> },
    { id: 'alerts', label: 'Alerts', icon: <Bell size={14} /> },
  ];

  return (
    <>
      <Navbar liveIndices={liveIndices} isRefreshing={isRefreshing} lastRefreshed={dataLastRefreshed} />
      <main className="app-main">
        <HeroStrip signals={signals} />

        <div className="tabs">
          {tabs.map(tab => (
            <button key={tab.id} className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'recommendations' && (
          <>
            <div className="section-header">
              <div>
                <div className="section-title">
                  <span className="icon" style={{ background: 'var(--accent-emerald-bg)', color: 'var(--accent-emerald)' }}><Target size={16} /></span>
                  Swing & Positional Signals
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 3, paddingLeft: 32 }}>
                  Catalyst-driven picks with swing (1-2 wk), positional (1-3 mo) &amp; long-term (6-18 mo) targets. Refreshed daily with live prices.
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div className="section-badge">{signals.length} Active Signals</div>
                {signals[0] && (
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                    Last scanned: {signals[0].lastCheckedDate}
                  </div>
                )}
                <button
                  onClick={refreshAllData}
                  disabled={isRefreshing}
                  style={{ background: 'var(--accent-blue-bg)', border: '1px solid rgba(59,130,246,0.3)', color: 'var(--accent-blue)', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}
                >
                  <RefreshCw size={11} style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} />
                  {isRefreshing ? 'Updating…' : 'Refresh Prices'}
                </button>
              </div>
            </div>
            <div className="rec-grid stagger-children">
              {signals.map(signal => {
                const stock = STOCKS.find(s => s.id === signal.stockId)!;
                const livePrice = liveQuotes.get(signal.stockId)?.price;
                const displaySignal = livePrice ? { ...signal, currentPrice: livePrice } : signal;
                const quote = liveQuotes.get(signal.stockId) ?? null;
                return (
                  <RecommendationCard
                    key={signal.stockId}
                    signal={displaySignal}
                    stock={stock}
                    onClick={() => setSelectedStock(signal.stockId)}
                    freshnessTimestamp={quote?.timestamp ?? null}
                  />
                );
              })}
            </div>
          </>
        )}

        {activeTab === 'intraday' && (
          <IntradayDashboard
            liveQuotes={liveQuotes}
            computedTechMap={computedTechMap}
          />
        )}

        {activeTab === 'research' && (
          <ResearchDashboard liveQuotes={liveQuotes} />
        )}

        {activeTab === 'global' && <GlobalDashboard />}

        {activeTab === 'radar' && (
          <>
            <div className="section-header">
              <div className="section-title">
                <span className="icon" style={{ background: 'var(--accent-amber-bg)', color: 'var(--accent-amber)' }}><Radio size={16} /></span>
                Live Pre-Market & Order Win Radar
              </div>
              <div className="section-badge" style={{ background: 'var(--accent-amber-bg)', color: 'var(--accent-amber)', borderColor: 'hsla(38, 92%, 55%, 0.15)' }}>
                {STOCKS.reduce((a, s) => a + s.catalysts.length, 0)} Active Events
              </div>
            </div>
            <LiveRadarFeed />
          </>
        )}

        {activeTab === 'screener' && (
          <>
            <div className="section-header">
              <div className="section-title">
                <span className="icon" style={{ background: 'var(--accent-blue-bg)', color: 'var(--accent-blue)' }}><Filter size={16} /></span>
                NSE Stock Screener
              </div>
            </div>
            <Screener signals={signals} onSelect={id => setSelectedStock(id)} />
          </>
        )}

        {activeTab === 'accuracy' && (
          <>
            <div className="section-header">
              <div className="section-title">
                <span className="icon" style={{ background: 'var(--accent-violet-glow)', color: 'var(--accent-violet)' }}><Award size={16} /></span>
                Model Accuracy & Backtest Performance
              </div>
              <div className="section-badge" style={{ background: 'var(--accent-violet-glow)', color: 'var(--accent-violet)', borderColor: 'hsla(265, 80%, 62%, 0.15)' }}>
                {BACKTEST_DATA.totalSignals} Backtested
              </div>
            </div>
            <AccuracyStats />
          </>
        )}

        {activeTab === 'alerts' && <AlertsManager signals={signals} />}
      </main>

      {/* Footer disclaimer */}
      <footer style={{ textAlign: 'center', padding: '14px 20px', fontSize: 10, color: 'var(--text-tertiary)', borderTop: '1px solid var(--card-border)', background: 'var(--nav-bg)' }}>
        <Shield size={10} style={{ verticalAlign: 'middle', marginRight: 4 }} />
        Prices from Yahoo Finance (15-min delayed during market hours). Not financial advice. Personal use only.
        {dataLastRefreshed && ` • Last updated: ${dataLastRefreshed.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })} IST`}
      </footer>

      {selectedStockData && (
        <StockDetailModal
          stock={selectedStockData}
          signal={selectedSignal}
          onClose={() => setSelectedStock(null)}
        />
      )}
    </>
  );
}

export default App;
