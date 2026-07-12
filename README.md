# Market Pulse

A full-stack financial dashboard for tracking crypto, stocks, and sports —
live prices, portfolio tracking, market news, and scores in one place.
Built with a Node.js/Express backend and a vanilla JS frontend, deployed
on Render, and also wrapped as an Android WebView app.

## Features

- **Stocks Overview** (homepage) — markets summary banner (S&P 500, Dow,
  Nasdaq, Russell 2000, VIX, Gold, Bitcoin, Crude Oil) and a sortable
  Top 100 stocks table by market cap
- **Crypto & Stock Watchlists** — track custom lists of coins/tickers with
  live price, % change, and market cap; add assets via company-name or
  ticker search
- **Crypto Trending & Markets Overview** — trending coins and a sortable
  top-100 crypto markets table
- **Portfolio Tracking** — log holdings (quantity + avg buy price) for both
  crypto and stocks, with live cost basis, current value, and P/L
- **News** — asset-specific news for tracked tickers/coins, plus US, World,
  and India news feeds
- **Sports** — live scoreboards for Soccer and Tennis
- **Weather widget** — local weather via browser geolocation
- **Auth** — sign in to sync watchlists and portfolio across devices
- **Mobile-friendly** — slide-in nav drawer, responsive layout, wrapped as
  an Android WebView app

## Tech Stack

**Backend**
- Node.js + Express
- In-memory caching layer (`cachedFetch`) with per-route TTLs (10–120s)
- Deployed on Render

**Frontend**
- Vanilla JavaScript (no framework)
- IBM Plex Mono + Inter fonts
- Dark theme with amber accents, CSS custom properties for theming

**Data & Auth**
- Supabase — authentication and portfolio persistence (`portfolio_holdings`
  table with row-level security), with localStorage as an offline fallback

## APIs Used

All external calls are proxied server-side (rather than called directly
from the browser) to avoid CORS issues and rate-limit problems, and to
keep API usage consistent across clients.

| Provider | Used for |
|---|---|
| **CoinGecko** | Crypto prices, market cap, search, trending coins |
| **Yahoo Finance** (`v8/finance/chart`, search) | Stock quotes, company/ticker search, top-100 markets table, stock news |
| **Google News RSS** | US and World news |
| **NDTV Feedburner RSS** | India news (Times of India is blocked by bot detection) |
| **ESPN** | Soccer and Tennis scoreboards |
| **Open-Meteo** | Weather data |
| **Supabase** | Auth and portfolio/watchlist storage |

## API Routes

| Route | Returns |
|---|---|
| `GET /api/crypto/price?ids=bitcoin,ethereum` | Live prices for given coin IDs |
| `GET /api/crypto/markets` | Top 100 coins by market cap |
| `GET /api/crypto/search?query=doge` | Coin search results |
| `GET /api/crypto/trending` | Trending coins |
| `GET /api/stock/quote/:symbol` | Single stock quote |
| `GET /api/stock/search?q=apple` | Stock/company search |
| `GET /api/stocks/markets` | Top 100 large-cap stocks |
| `GET /api/markets/summary` | Markets summary banner data |
| `GET /api/news/search?q=AAPL` | News for a given symbol/query |
| `GET /api/news/google?edition=us\|world\|in` | Google/NDTV news feed by edition |

## Getting Started

```bash
npm install
npm start
```

Then open **http://localhost:3000** (or whatever port is set via the
`PORT` environment variable — Render assigns its own, typically `10000`).
The server serves the frontend (`public/index.html`, `style.css`,
`script.js`) and exposes the API routes above from the same origin, so
there's nothing else to configure locally.

To point the frontend at a different backend origin, change `API_BASE`
at the top of `public/script.js`:

```js
const API_BASE = 'http://localhost:3000';
```

## Notes

- Responses are cached briefly in memory to avoid hammering upstream APIs
  when multiple tabs/devices poll the server.
- No API keys are required for CoinGecko, Yahoo Finance, or Google News —
  all are free/public endpoints, fetched server-side.
- Larger batch requests (top-100 tables, markets summary) are fetched
  sequentially with small delays rather than in parallel, to stay under
  Yahoo Finance's rate limits.
