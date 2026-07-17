# Market Pulse

A free, real-time stock, crypto, and forex tracking dashboard with practice trading, earnings calendars, and financial education — built as a web app and wrapped as an Android app.

**Live site:** [market-pulse.fyi](https://market-pulse.fyi)

---

## Features

### Markets & Tracking
- **Crypto Overview** — Top 100 coins by market cap (CoinGecko), sortable table
- **Stocks Overview** — Curated "Top 10 AI Stocks" with live quotes (Finnhub)
- **Watchlists** — Add/track individual stocks and coins
- **Markets Summary Banner** — S&P 500, Dow, Nasdaq, Russell 2000, VIX, Gold, Bitcoin, Crude Oil at a glance
- **Today's Top Movers** — Whole-market gainers/losers (Yahoo Finance screener), with a live "last updated" timestamp reflecting actual cache refresh time
- **Forex Rates** — Daily reference exchange rates vs. USD (Frankfurter API, 1-hour server-side cache)
- **Earnings Calendar** — Upcoming S&P 500 earnings, next 14 days (Finnhub, filtered against S&P 500 constituent list)
- **Trending** — Trending coins via CoinGecko

### Portfolio & Practice Trading
- **Practice Mode** — $10,000 simulated trading account with real live prices, zero real-money risk
- **Portfolio Tracking** — Persisted stock and crypto holdings (Supabase), with cost basis, P/L, and P/L% calculations
- **Home Dashboard**
  - Market Pulse Index and live market snapshot strip
  - **Suggested Allocation by Age** — age-bracket dropdown (20–30 through 60–70) showing a Stocks/Bonds/Cash/Crypto reference allocation
  - Today's Top Movers, side by side with Suggested Allocation

### News & Learning
- Regional news tabs (US, World, India) and dedicated Stocks/Crypto news feeds
- **Learn** section — embedded video primers on stock basics, index funds, and crypto fundamentals

### Account & Admin
- Email/password authentication (Supabase Auth), gating Practice Mode and Portfolio features
- **Admin Reports** — traffic and usage analytics (city/country breakdown, recent activity log, most active view) via a dedicated `user_activity_log` table, visible only to admin accounts

### Reliability
- Server-side caching per endpoint to stay within third-party API rate limits
- GitHub Actions keep-alive workflow pinging `/api/ping` every 10 minutes to prevent Render free-tier spin-down
- Sequential-with-delay fetching for rate-limited sources (Yahoo Finance); parallel fetching where allowed (Finnhub)

---

## Tech Stack

**Front end:**
- Vanilla JavaScript (no framework) — modular files (`home.js`, `auth.js`, `portfolio.js`, `markets.js`, `forex.js`, `earnings.js`, `news.js`, `calculator.js`, `practice.js`, `trending.js`, `watchlist.js`, `admin.js`, `nav.js`, `main.js`)
- HTML5 / CSS3 — custom CSS with CSS variables for theming, CSS Grid/Flexbox layouts, responsive design
- Fonts: Inter, IBM Plex Mono (Google Fonts)

**Back end:**
- Node.js with Express
- In-memory per-endpoint caching layer (`cachedFetch`)
- RESTful API routes for markets, stocks, crypto, forex, earnings, news, portfolio, practice trading, and admin analytics

**Data & Auth:**
- **Supabase** — authentication (email/password), Postgres database for `portfolio_holdings`, `user_activity_log`, and practice trading data, with Row-Level Security (RLS) policies
- Supabase Admin client (`supabaseAdmin`) using a service role key for server-side writes (e.g. activity tracking)

**Hosting & Infra:**
- **Render.com** — backend/API hosting (free tier)
- **GitHub Actions** — scheduled keep-alive workflow to prevent free-tier spin-down
- Custom domain: `market-pulse.fyi`

**Third-party data APIs:**
- Yahoo Finance — stock quotes, top movers screener
- Finnhub — curated stock quotes, earnings calendar
- CoinGecko — crypto market data, trending coins
- Frankfurter (ECB) — forex reference rates
- Google News RSS / NDTV Feedburner — news aggregation

**Mobile:**
- Android WebView wrapper around the web app
- App icon generation via Node's `sharp` library

---

## Disclaimers

- Practice Mode uses simulated funds only — no real money is at risk and no real trades are placed.
- Suggested age-based allocation is a general reference guideline, not personalized financial advice.
- Market data is provided by third-party APIs and may be delayed; not intended for actual trading decisions.
