import type { IndianStock, MarketIndex, BacktestMetrics, CandleData } from '../types';

function generateCandleData(basePrice: number, days: number, trend: 'up' | 'down' | 'sideways', volatility: number): CandleData[] {
  const data: CandleData[] = [];
  let currentPrice = basePrice;
  const now = new Date('2026-10-08T00:00:00Z');
  
  for (let i = days; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const trendFactor = trend === 'up' ? 1.002 : trend === 'down' ? 0.998 : 1.0;
    const randomVol = 1 + (Math.random() - 0.5) * volatility;
    
    currentPrice = currentPrice * trendFactor * randomVol;
    
    const open = currentPrice * (1 + (Math.random() - 0.5) * 0.01);
    const close = currentPrice * (1 + (Math.random() - 0.5) * 0.01);
    const high = Math.max(open, close) * (1 + Math.random() * 0.01);
    const low = Math.min(open, close) * (1 - Math.random() * 0.01);
    const volume = Math.floor(Math.random() * 5000000) + 1000000;
    
    data.push({ date, open, high, low, close, volume });
  }
  return data;
}

export const marketIndices: MarketIndex[] = [
  { name: 'NIFTY 50', value: 26500.50, change: 145.20, changePercent: 0.55 },
  { name: 'SENSEX', value: 86800.25, change: 480.10, changePercent: 0.56 },
  { name: 'BANK NIFTY', value: 51200.80, change: 350.15, changePercent: 0.69 },
  { name: 'NIFTY IT', value: 43250.45, change: -105.30, changePercent: -0.24 },
  { name: 'NIFTY DEFENSE', value: 12450.60, change: 185.20, changePercent: 1.51 }
];

export const backtestData: BacktestMetrics = {
  totalSignals: 480,
  winningSignals: 419,
  losingSignals: 61,
  winRate: 87.4,
  avgProfit: 8.5,
  avgLoss: 2.1,
  maxDrawdown: 4.2,
  profitFactor: 3.8,
  sharpeRatio: 2.1,
  totalReturn: 145.6,
  monthlyReturns: [
    { month: 'Jan', return: 4.5 },
    { month: 'Feb', return: 5.2 },
    { month: 'Mar', return: 3.8 },
    { month: 'Apr', return: 6.1 },
    { month: 'May', return: 8.4 },
    { month: 'Jun', return: 7.2 },
    { month: 'Jul', return: 9.1 },
    { month: 'Aug', return: 5.5 },
    { month: 'Sep', return: 6.8 },
    { month: 'Oct', return: 2.4 }
  ],
  tradeLog: [
    { date: '2026-10-01', symbol: 'HAL', action: 'BUY', entryPrice: 4200, exitPrice: 4520, profitPercent: 7.6, outcome: 'WIN', holdingDays: 7, catalyst: 'Order Win' },
    { date: '2026-09-25', symbol: 'RVNL', action: 'BUY', entryPrice: 260, exitPrice: 285, profitPercent: 9.6, outcome: 'WIN', holdingDays: 12, catalyst: 'Railway Order' },
    { date: '2026-09-20', symbol: 'TCS', action: 'BUY', entryPrice: 4000, exitPrice: 4150, profitPercent: 3.75, outcome: 'WIN', holdingDays: 15, catalyst: 'Quarterly Result' },
    { date: '2026-09-18', symbol: 'HDFCBANK', action: 'BUY', entryPrice: 1750, exitPrice: 1730, profitPercent: -1.14, outcome: 'LOSS', holdingDays: 4, catalyst: 'FII Accumulation' },
    { date: '2026-09-10', symbol: 'L&T', action: 'BUY', entryPrice: 3600, exitPrice: 3850, profitPercent: 6.94, outcome: 'WIN', holdingDays: 25, catalyst: 'Middle East Order' },
    { date: '2026-09-05', symbol: 'DIXON', action: 'BUY', entryPrice: 13500, exitPrice: 14200, profitPercent: 5.18, outcome: 'WIN', holdingDays: 30, catalyst: 'Capacity Expansion' },
    { date: '2026-08-28', symbol: 'TATAMOTORS', action: 'BUY', entryPrice: 780, exitPrice: 820, profitPercent: 5.12, outcome: 'WIN', holdingDays: 40, catalyst: 'Q2 Result Surprise' },
    { date: '2026-08-20', symbol: 'ADANIGREEN', action: 'BUY', entryPrice: 1500, exitPrice: 1580, profitPercent: 5.33, outcome: 'WIN', holdingDays: 45, catalyst: 'Capacity Expansion' },
    { date: '2026-08-15', symbol: 'SBI', action: 'BUY', entryPrice: 650, exitPrice: 635, profitPercent: -2.3, outcome: 'LOSS', holdingDays: 10, catalyst: 'FII Accumulation' },
    { date: '2026-08-01', symbol: 'BHEL', action: 'BUY', entryPrice: 250, exitPrice: 285, profitPercent: 14.0, outcome: 'WIN', holdingDays: 60, catalyst: 'NTPC Order' }
  ]
};

const commonFundamentals = {
  marketCap: 50000, peRatio: 25, pbRatio: 4.5, roce: 18, roe: 16,
  debtToEquity: 0.5, currentRatio: 1.5, promoterHolding: 55, fiiHolding: 20, diiHolding: 15, fiiHoldingChange: 0.5,
  yoyRevenueGrowth: 15, yoyProfitGrowth: 18, threeYearProfitCAGR: 15, operatingMargin: 18, netProfitMargin: 12,
  dividendYield: 1.0, bookValue: 200, eps: 50, sector: 'Diversified', industry: 'General'
};

const commonTechnicals = {
  ema20: 100, ema50: 95, ema200: 85, rsi14: 60, supertrend: 'BUY' as const, supertrendValue: 90,
  macdLine: 2, macdSignal: 1, macdHistogram: 1, volumeAvg20: 2000000, currentVolume: 4000000, volumeRatio: 2.0,
  atr14: 5, bollingerUpper: 105, bollingerLower: 85, bollingerMiddle: 95, pivotPoint: 100,
  resistance1: 102, resistance2: 105, support1: 98, support2: 95, adx: 30,
  weekHigh52: 110, weekLow52: 60, nearWeekHigh52: true
};

export const indianStocks: IndianStock[] = [
  {
    id: '1', symbol: 'HAL', companyName: 'Hindustan Aeronautics', exchange: 'BOTH',
    currentPrice: 4520, previousClose: 4400, dayOpen: 4450, dayHigh: 4550, dayLow: 4420, volume: 3500000,
    fundamentals: { ...commonFundamentals, marketCap: 302000, peRatio: 35.4, pbRatio: 9.2, roce: 32.5, roe: 28.4, sector: 'Defense' },
    technicals: { ...commonTechnicals, ema20: 4350, ema50: 4100, ema200: 3450, rsi14: 68, atr14: 120 },
    catalysts: [{
      id: 'c1', type: 'ORDER_WIN', headline: 'HAL secures Rs 5,400 Crore order from MoD',
      description: 'Major aero-engine supply contract signed.', timestamp: new Date('2026-10-07T08:30:00Z'),
      impactScore: 92, orderValueCr: 5400, source: 'NSE Announcements', detectedBeforeMarket: true, tags: ['Defense']
    }],
    candleData: generateCandleData(4300, 30, 'up', 0.02), logoColor: 'hsl(210, 80%, 50%)'
  },
  {
    id: '2', symbol: 'BEL', companyName: 'Bharat Electronics', exchange: 'BOTH',
    currentPrice: 310, previousClose: 295, dayOpen: 300, dayHigh: 315, dayLow: 298, volume: 25000000,
    fundamentals: { ...commonFundamentals, marketCap: 226000, peRatio: 42.5, roce: 28.5, roe: 24.2, sector: 'Defense' },
    technicals: { ...commonTechnicals, ema20: 290, ema50: 275, ema200: 220, rsi14: 72, atr14: 8.5 },
    catalysts: [{
      id: 'c2', type: 'ORDER_WIN', headline: 'BEL bags orders worth Rs 2,100 Crore',
      description: 'Advanced EW systems for Indian Army.', timestamp: new Date('2026-10-05T14:15:00Z'),
      impactScore: 85, orderValueCr: 2100, source: 'BSE Filing', detectedBeforeMarket: false, tags: ['Defense']
    }],
    candleData: generateCandleData(290, 30, 'up', 0.015), logoColor: 'hsl(180, 70%, 40%)'
  },
  {
    id: '3', symbol: 'LT', companyName: 'Larsen & Toubro', exchange: 'BOTH',
    currentPrice: 3850, previousClose: 3800, dayOpen: 3810, dayHigh: 3880, dayLow: 3790, volume: 4500000,
    fundamentals: { ...commonFundamentals, marketCap: 520000, peRatio: 38, sector: 'Infra' },
    technicals: { ...commonTechnicals, ema20: 3750, ema50: 3600, atr14: 90 },
    catalysts: [{
      id: 'c3', type: 'ORDER_WIN', headline: 'L&T wins mega order in Middle East',
      description: 'Hydrocarbon division secures massive offshore contract.', timestamp: new Date(),
      impactScore: 88, source: 'Press Release', detectedBeforeMarket: true, tags: ['Infra']
    }],
    candleData: generateCandleData(3700, 30, 'up', 0.01), logoColor: 'hsl(45, 90%, 50%)'
  },
  {
    id: '4', symbol: 'RVNL', companyName: 'Rail Vikas Nigam', exchange: 'BOTH',
    currentPrice: 285, previousClose: 275, dayOpen: 278, dayHigh: 290, dayLow: 275, volume: 18000000,
    fundamentals: { ...commonFundamentals, marketCap: 60000, peRatio: 40, sector: 'Infra' },
    technicals: { ...commonTechnicals, ema20: 260, ema50: 240, rsi14: 65, atr14: 10 },
    catalysts: [{
      id: 'c4', type: 'ORDER_WIN', headline: 'RVNL emerges lowest bidder for Vande Bharat project',
      description: 'Major railway infra order.', timestamp: new Date(),
      impactScore: 78, source: 'NSE', detectedBeforeMarket: true, tags: ['Infra']
    }],
    candleData: generateCandleData(250, 30, 'up', 0.02), logoColor: 'hsl(200, 60%, 45%)'
  },
  {
    id: '5', symbol: 'BDL', companyName: 'Bharat Dynamics', exchange: 'BOTH',
    currentPrice: 1680, previousClose: 1650, dayOpen: 1660, dayHigh: 1700, dayLow: 1640, volume: 2200000,
    fundamentals: { ...commonFundamentals, marketCap: 30000, peRatio: 45, sector: 'Defense' },
    technicals: { ...commonTechnicals, ema20: 1600, atr14: 45 },
    catalysts: [], candleData: generateCandleData(1600, 30, 'sideways', 0.02), logoColor: 'hsl(12, 80%, 50%)'
  },
  {
    id: '6', symbol: 'TATAMOTORS', companyName: 'Tata Motors', exchange: 'BOTH',
    currentPrice: 820, previousClose: 800, dayOpen: 805, dayHigh: 825, dayLow: 795, volume: 15000000,
    fundamentals: { ...commonFundamentals, marketCap: 280000, peRatio: 12, sector: 'Auto' },
    technicals: { ...commonTechnicals, ema20: 780, rsi14: 75, atr14: 25 },
    catalysts: [{
      id: 'c6', type: 'QUARTERLY_RESULT', headline: 'Tata Motors Q2 profit beats estimates',
      description: 'Strong JLR sales push margins higher.', timestamp: new Date(),
      impactScore: 82, source: 'Earnings', detectedBeforeMarket: true, tags: ['Auto']
    }],
    candleData: generateCandleData(750, 30, 'up', 0.015), logoColor: 'hsl(230, 70%, 40%)'
  },
  {
    id: '7', symbol: 'DIXON', companyName: 'Dixon Technologies', exchange: 'BOTH',
    currentPrice: 14200, previousClose: 13800, dayOpen: 13900, dayHigh: 14300, dayLow: 13800, volume: 450000,
    fundamentals: { ...commonFundamentals, marketCap: 85000, peRatio: 120, sector: 'Electronics' },
    technicals: { ...commonTechnicals, ema20: 13500, atr14: 350 },
    catalysts: [{
      id: 'c7', type: 'CAPACITY_EXPANSION', headline: 'Dixon to invest Rs 500 cr in new facility',
      description: 'Expanding smartphone manufacturing capacity.', timestamp: new Date(),
      impactScore: 75, source: 'News', detectedBeforeMarket: false, tags: ['Electronics']
    }],
    candleData: generateCandleData(13000, 30, 'up', 0.025), logoColor: 'hsl(340, 80%, 45%)'
  },
  {
    id: '8', symbol: 'INFY', companyName: 'Infosys', exchange: 'BOTH',
    currentPrice: 1920, previousClose: 1930, dayOpen: 1925, dayHigh: 1940, dayLow: 1910, volume: 6000000,
    fundamentals: { ...commonFundamentals, marketCap: 780000, peRatio: 28, sector: 'IT' },
    technicals: { ...commonTechnicals, ema20: 1950, rsi14: 45, atr14: 40, supertrend: 'SELL' },
    catalysts: [], candleData: generateCandleData(1950, 30, 'sideways', 0.01), logoColor: 'hsl(215, 80%, 35%)'
  },
  {
    id: '9', symbol: 'TCS', companyName: 'Tata Consultancy Services', exchange: 'BOTH',
    currentPrice: 4150, previousClose: 4120, dayOpen: 4130, dayHigh: 4180, dayLow: 4110, volume: 3000000,
    fundamentals: { ...commonFundamentals, marketCap: 1450000, peRatio: 32, sector: 'IT' },
    technicals: { ...commonTechnicals, ema20: 4100, atr14: 80 },
    catalysts: [], candleData: generateCandleData(4050, 30, 'up', 0.01), logoColor: 'hsl(220, 60%, 50%)'
  },
  {
    id: '10', symbol: 'SBIN', companyName: 'State Bank of India', exchange: 'BOTH',
    currentPrice: 685, previousClose: 670, dayOpen: 675, dayHigh: 690, dayLow: 670, volume: 22000000,
    fundamentals: { ...commonFundamentals, marketCap: 610000, peRatio: 9.5, sector: 'Banking' },
    technicals: { ...commonTechnicals, ema20: 650, atr14: 15 },
    catalysts: [{
      id: 'c10', type: 'FII_ACCUMULATION', headline: 'FIIs increase stake in SBI by 2%',
      description: 'Block deals suggest strong FII buying.', timestamp: new Date(),
      impactScore: 70, source: 'Exchange', detectedBeforeMarket: false, tags: ['Banking']
    }],
    candleData: generateCandleData(640, 30, 'up', 0.015), logoColor: 'hsl(200, 90%, 35%)'
  },
  {
    id: '11', symbol: 'HDFCBANK', companyName: 'HDFC Bank', exchange: 'BOTH',
    currentPrice: 1780, previousClose: 1765, dayOpen: 1770, dayHigh: 1795, dayLow: 1760, volume: 18000000,
    fundamentals: { ...commonFundamentals, marketCap: 1350000, peRatio: 18, sector: 'Banking' },
    technicals: { ...commonTechnicals, ema20: 1750, atr14: 30 },
    catalysts: [], candleData: generateCandleData(1700, 30, 'up', 0.01), logoColor: 'hsl(350, 75%, 45%)'
  },
  {
    id: '12', symbol: 'ICICIBANK', companyName: 'ICICI Bank', exchange: 'BOTH',
    currentPrice: 1250, previousClose: 1240, dayOpen: 1245, dayHigh: 1265, dayLow: 1235, volume: 15000000,
    fundamentals: { ...commonFundamentals, marketCap: 880000, peRatio: 19, sector: 'Banking' },
    technicals: { ...commonTechnicals, ema20: 1220, atr14: 22 },
    catalysts: [], candleData: generateCandleData(1200, 30, 'up', 0.01), logoColor: 'hsl(25, 90%, 55%)'
  },
  {
    id: '13', symbol: 'ADANIGREEN', companyName: 'Adani Green Energy', exchange: 'BOTH',
    currentPrice: 1580, previousClose: 1540, dayOpen: 1550, dayHigh: 1600, dayLow: 1530, volume: 8000000,
    fundamentals: { ...commonFundamentals, marketCap: 250000, peRatio: 150, sector: 'Green Energy' },
    technicals: { ...commonTechnicals, ema20: 1500, atr14: 45 },
    catalysts: [{
      id: 'c13', type: 'CAPACITY_EXPANSION', headline: 'Adani Green commissions 1000MW solar plant',
      description: 'Major capacity addition in Rajasthan.', timestamp: new Date(),
      impactScore: 80, source: 'Press Release', detectedBeforeMarket: true, tags: ['Green Energy']
    }],
    candleData: generateCandleData(1450, 30, 'up', 0.03), logoColor: 'hsl(140, 80%, 40%)'
  },
  {
    id: '14', symbol: 'TATAPOWER', companyName: 'Tata Power', exchange: 'BOTH',
    currentPrice: 420, previousClose: 412, dayOpen: 415, dayHigh: 425, dayLow: 410, volume: 20000000,
    fundamentals: { ...commonFundamentals, marketCap: 135000, peRatio: 35, sector: 'Green Energy' },
    technicals: { ...commonTechnicals, ema20: 400, atr14: 12 },
    catalysts: [], candleData: generateCandleData(390, 30, 'up', 0.015), logoColor: 'hsl(215, 60%, 45%)'
  },
  {
    id: '15', symbol: 'M&M', companyName: 'Mahindra & Mahindra', exchange: 'BOTH',
    currentPrice: 2850, previousClose: 2780, dayOpen: 2800, dayHigh: 2880, dayLow: 2790, volume: 4000000,
    fundamentals: { ...commonFundamentals, marketCap: 350000, peRatio: 28, sector: 'Auto' },
    technicals: { ...commonTechnicals, ema20: 2750, atr14: 65 },
    catalysts: [{
      id: 'c15', type: 'ORDER_WIN', headline: 'M&M secures massive EV fleet order',
      description: 'Logistics company orders 10,000 electric LCVs.', timestamp: new Date(),
      impactScore: 77, source: 'News', detectedBeforeMarket: true, tags: ['Auto', 'EV']
    }],
    candleData: generateCandleData(2700, 30, 'up', 0.02), logoColor: 'hsl(0, 80%, 45%)'
  },
  {
    id: '16', symbol: 'BHEL', companyName: 'Bharat Heavy Electricals', exchange: 'BOTH',
    currentPrice: 285, previousClose: 275, dayOpen: 278, dayHigh: 290, dayLow: 275, volume: 30000000,
    fundamentals: { ...commonFundamentals, marketCap: 99000, peRatio: 85, sector: 'Power' },
    technicals: { ...commonTechnicals, ema20: 265, atr14: 9 },
    catalysts: [{
      id: 'c16', type: 'ORDER_WIN', headline: 'BHEL bags major NTPC thermal order',
      description: 'Rs 3,500 crore boiler and turbine contract.', timestamp: new Date(),
      impactScore: 84, source: 'Exchange', detectedBeforeMarket: true, tags: ['Power']
    }],
    candleData: generateCandleData(250, 30, 'up', 0.025), logoColor: 'hsl(205, 75%, 45%)'
  },
  {
    id: '17', symbol: 'BHARTIARTL', companyName: 'Bharti Airtel', exchange: 'BOTH',
    currentPrice: 1680, previousClose: 1670, dayOpen: 1675, dayHigh: 1695, dayLow: 1665, volume: 6000000,
    fundamentals: { ...commonFundamentals, marketCap: 950000, peRatio: 55, sector: 'Telecom' },
    technicals: { ...commonTechnicals, ema20: 1640, atr14: 35 },
    catalysts: [], candleData: generateCandleData(1600, 30, 'up', 0.01), logoColor: 'hsl(350, 85%, 55%)'
  },
  {
    id: '18', symbol: 'COCHINSHIP', companyName: 'Cochin Shipyard', exchange: 'BOTH',
    currentPrice: 1230, previousClose: 1210, dayOpen: 1215, dayHigh: 1245, dayLow: 1205, volume: 6500000,
    fundamentals: { ...commonFundamentals, marketCap: 32400, peRatio: 42.5, sector: 'Defense' },
    technicals: { ...commonTechnicals, ema20: 1195, ema50: 1140, ema200: 980, atr14: 28, volumeRatio: 3.5, resistance1: 1265, resistance2: 1295, support1: 1190, support2: 1150 },
    catalysts: [{
      id: 'c18', type: 'ORDER_WIN', headline: 'Indian Navy awards frigate upgrade contract to Cochin Shipyard',
      description: 'Strategic defense order worth ₹1,150 Crores.', timestamp: new Date(),
      impactScore: 89, source: 'MoD', detectedBeforeMarket: true, tags: ['Defense', 'Shipbuilding']
    }],
    candleData: generateCandleData(1230, 30, 'up', 0.03), logoColor: 'hsl(210, 60%, 45%)'
  },
  {
    id: '19', symbol: 'IRCON', companyName: 'IRCON International', exchange: 'BOTH',
    currentPrice: 215, previousClose: 208, dayOpen: 210, dayHigh: 220, dayLow: 208, volume: 12000000,
    fundamentals: { ...commonFundamentals, marketCap: 20000, peRatio: 22, sector: 'Infra' },
    technicals: { ...commonTechnicals, ema20: 200, atr14: 7 },
    catalysts: [], candleData: generateCandleData(195, 30, 'up', 0.015), logoColor: 'hsl(35, 90%, 50%)'
  },
  {
    id: '20', symbol: 'MAZDOCK', companyName: 'Mazagon Dock', exchange: 'BOTH',
    currentPrice: 4850, previousClose: 4700, dayOpen: 4750, dayHigh: 4900, dayLow: 4720, volume: 2500000,
    fundamentals: { ...commonFundamentals, marketCap: 98000, peRatio: 42, sector: 'Defense' },
    technicals: { ...commonTechnicals, ema20: 4500, atr14: 140 },
    catalysts: [], candleData: generateCandleData(4400, 30, 'up', 0.025), logoColor: 'hsl(225, 75%, 45%)'
  }
];
