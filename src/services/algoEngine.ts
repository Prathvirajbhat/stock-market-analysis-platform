import type { IndianStock, StockSignal, MarketStatus, ScreenerFilters } from '../types';

export function calculateTechnicalScore(stock: IndianStock): number {
  let score = 0;
  const { ema20, ema50, ema200, rsi14, supertrend, volumeRatio, macdLine, macdSignal, nearWeekHigh52, adx } = stock.technicals;
  
  if (ema20 > ema50 && ema50 > ema200) score += 20;
  if (rsi14 >= 45 && rsi14 <= 70) score += 15;
  if (supertrend === 'BUY') score += 15;
  if (volumeRatio > 2.0) score += 15;
  else if (volumeRatio > 1.2) score += 10;
  
  if (macdLine > macdSignal) score += 15;
  if (nearWeekHigh52) score += 10;
  if (adx > 25) score += 10;
  
  return Math.min(100, score);
}

export function calculateFundamentalScore(stock: IndianStock): number {
  let score = 0;
  const { roce, roe, debtToEquity, promoterHolding, fiiHoldingChange, yoyProfitGrowth, yoyRevenueGrowth, operatingMargin } = stock.fundamentals;
  
  if (roce > 15) score += 15;
  if (roe > 15) score += 15;
  if (debtToEquity < 1) score += 15;
  if (promoterHolding > 50) score += 10;
  if (fiiHoldingChange > 0) score += 10;
  if (yoyProfitGrowth > 15) score += 15;
  if (yoyRevenueGrowth > 10) score += 10;
  if (operatingMargin > 15) score += 10;

  return Math.min(100, score);
}

export function calculateCatalystScore(stock: IndianStock): number {
  if (!stock.catalysts || stock.catalysts.length === 0) return 0;
  
  let maxScore = 0;
  for (const catalyst of stock.catalysts) {
    let score = catalyst.impactScore * 0.5;
    
    if (catalyst.type === 'ORDER_WIN' || catalyst.type === 'QUARTERLY_RESULT') score += 20;
    if (catalyst.detectedBeforeMarket) score += 15;
    if (catalyst.orderToMarketCapRatio && catalyst.orderToMarketCapRatio > 1.0) score += 15;
    
    maxScore = Math.max(maxScore, score);
  }
  
  return Math.min(100, maxScore);
}

export function calculateSentimentScore(stock: IndianStock): number {
  let score = 50;
  
  if (stock.fundamentals.fiiHoldingChange > 0.5) score += 15;
  if (stock.technicals.nearWeekHigh52 && stock.technicals.volumeRatio > 1.5) score += 20;
  if (stock.catalysts && stock.catalysts.length > 0) score += 15;
  
  return Math.min(100, score);
}

export function generateSignal(stock: IndianStock): StockSignal | null {
  const techScore = calculateTechnicalScore(stock);
  const fundScore = calculateFundamentalScore(stock);
  const catScore = calculateCatalystScore(stock);
  const sentScore = calculateSentimentScore(stock);
  
  const confidenceScore = Math.round(techScore * 0.3 + fundScore * 0.25 + catScore * 0.3 + sentScore * 0.15);
  
  if (confidenceScore <= 70) return null;
  
  let action: StockSignal['action'] = 'ACCUMULATE';
  if (confidenceScore > 90) action = 'STRONG_BUY';
  else if (confidenceScore > 80) action = 'BUY';
  
  const entryLow = stock.currentPrice * 0.995;
  const entryHigh = stock.currentPrice * 1.005;
  const target1Price = stock.currentPrice + (stock.technicals.atr14 * 1.5);
  const target2Price = stock.currentPrice + (stock.technicals.atr14 * 3.0);
  const stopLossPrice = stock.currentPrice - stock.technicals.atr14;
  
  const risk = stock.currentPrice - stopLossPrice;
  const reward = target1Price - stock.currentPrice;
  const riskRewardRatio = Number((reward / risk).toFixed(2));
  
  return {
    stockId: stock.id,
    symbol: stock.symbol,
    companyName: stock.companyName,
    currentPrice: stock.currentPrice,
    priceChange: stock.currentPrice - stock.previousClose,
    priceChangePercent: ((stock.currentPrice - stock.previousClose) / stock.previousClose) * 100,
    action,
    entryZone: { low: Number(entryLow.toFixed(2)), high: Number(entryHigh.toFixed(2)) },
    target1: { price: Number(target1Price.toFixed(2)), percent: Number(((target1Price - stock.currentPrice) / stock.currentPrice * 100).toFixed(2)), timeframe: '1-2 Days' },
    target2: { price: Number(target2Price.toFixed(2)), percent: Number(((target2Price - stock.currentPrice) / stock.currentPrice * 100).toFixed(2)), timeframe: '3-5 Days' },
    stopLoss: { price: Number(stopLossPrice.toFixed(2)), percent: Number(((stock.currentPrice - stopLossPrice) / stock.currentPrice * 100).toFixed(2)) },
    riskRewardRatio,
    confidenceScore,
    catalystScore: Math.round(catScore),
    technicalScore: Math.round(techScore),
    fundamentalScore: Math.round(fundScore),
    sentimentScore: Math.round(sentScore),
    aiRationale: {
      catalystSummary: stock.catalysts?.length > 0 ? `Strong catalyst detected: ${stock.catalysts[0].headline}` : 'No major recent catalyst.',
      technicalSummary: `Technicals align for a ${action} with EMA support and volume surge.`,
      fundamentalSummary: `Solid fundamentals: ${stock.fundamentals.roce}% ROCE, good growth.`
    },
    signalTimestamp: new Date(),
    triggerType: stock.catalysts?.length > 0 ? 'CATALYST_DRIVEN' : 'TECHNICAL_BREAKOUT'
  };
}

export function generateAllSignals(stocks: IndianStock[]): StockSignal[] {
  const signals: StockSignal[] = [];
  for (const stock of stocks) {
    const sig = generateSignal(stock);
    if (sig) signals.push(sig);
  }
  return signals.sort((a, b) => b.confidenceScore - a.confidenceScore);
}

export function getMarketStatus(): MarketStatus {
  const now = new Date();
  const utcHours = now.getUTCHours();
  const utcMinutes = now.getUTCMinutes();
  
  let istMinutes = utcMinutes + 30;
  let istHours = utcHours + 5;
  if (istMinutes >= 60) {
    istHours += 1;
    istMinutes -= 60;
  }
  istHours = istHours % 24;
  
  const timeNum = istHours + istMinutes / 60;
  
  if (timeNum >= 8.5 && timeNum < 9.25) return 'PRE_MARKET';
  if (timeNum >= 9.25 && timeNum < 15.5) return 'MARKET_OPEN';
  if (timeNum >= 15.5 && timeNum < 16.0) return 'POST_MARKET';
  return 'MARKET_CLOSED';
}

export function filterSignals(signals: StockSignal[], filters: ScreenerFilters, stocks: IndianStock[]): StockSignal[] {
  return signals.filter(sig => {
    if (filters.minConfidence && sig.confidenceScore < filters.minConfidence) return false;
    
    const stock = stocks.find(s => s.id === sig.stockId);
    if (!stock) return false;
    
    if (filters.sector && filters.sector !== 'ALL' && stock.fundamentals.sector !== filters.sector) return false;
    
    if (filters.marketCapRange && filters.marketCapRange !== 'ALL') {
      const mc = stock.fundamentals.marketCap;
      if (filters.marketCapRange === 'LARGE' && mc < 20000) return false;
      if (filters.marketCapRange === 'MID' && (mc < 5000 || mc > 20000)) return false;
      if (filters.marketCapRange === 'SMALL' && mc > 5000) return false;
    }
    
    if (filters.catalystType && filters.catalystType !== 'ALL') {
      if (!stock.catalysts || !stock.catalysts.some(c => c.type === filters.catalystType)) return false;
    }
    
    return true;
  }).sort((a, b) => {
    if (filters.sortBy === 'confidence') return b.confidenceScore - a.confidenceScore;
    if (filters.sortBy === 'catalyst') return b.catalystScore - a.catalystScore;
    if (filters.sortBy === 'technical') return b.technicalScore - a.technicalScore;
    if (filters.sortBy === 'fundamental') return b.fundamentalScore - a.fundamentalScore;
    return b.confidenceScore - a.confidenceScore;
  });
}
