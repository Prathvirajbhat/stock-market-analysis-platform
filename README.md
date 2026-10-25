# Bharat AlphaPulse — Indian Stock Market Intelligence Platform

An algorithmic trading, catalyst detection, intraday intelligence, and quantitative research platform designed for Indian NSE/BSE equities.

## Key Features

- **📡 Swing & Positional Signals**: Multi-factor ensemble model (Technicals + Fundamentals + Catalysts + Sentiment) with 3 tiered targets (Swing, Positional, Long-term) and invalidation rules.
- **⚡ Intraday Intelligence**: Pre-market and opening momentum discovery, volume expansion scoring, 5-minute candlestick chart with VWAP and EMA9 overlays, and an interactive position sizing calculator.
- **📊 Fundamental Research & Portfolio Tracker**: Deep fundamentals analysis (ROCE, ROE, D/E, margins, promoter/FII trends, sector P/E benchmark) and persistent local portfolio management.
- **🌍 Global Markets & News**: Live tracking of international indices (S&P 500, NASDAQ, SGX Nifty, Nikkei), commodities (Crude, Gold, Silver), forex (USD/INR), and real-time financial news feeds.
- **🎯 Live Radar Feed**: Real-time corporate filings, contract wins, order-book expansions, and quarterly earnings catalyst detection.

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **Styling**: Modern dark glassmorphic CSS design system with HSL tokens
- **Data Engine**: Free public market data & OHLCV candles via internal Vite reverse proxy (CORS safe)
- **Technical Indicators**: Computed locally using Wilder's smoothing (EMA, RSI-14, ATR-14, MACD, ADX, Supertrend, Bollinger Bands, VWAP)

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Run the Development Server
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### 3. Production Build
```bash
npm run build
```

## Environment Variables (.env)

The application works **completely out of the box without requiring any `.env` file or API keys**, because all market quotes and technical computations are handled through free public feeds via Vite's proxy.

If you add optional custom broker keys in the future, copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
*(Your `.env` files are automatically ignored by Git).*

## Disclaimer

This platform is for personal quantitative research and educational analysis only. It is not connected to any brokerage for automated order execution. Not SEBI registered financial advice.
