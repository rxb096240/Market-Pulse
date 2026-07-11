# Market Pulse Backend

An Express backend that solves the CORS problem for the Market Pulse
crypto/stock/sports ticker dashboard by proxying the external APIs the
frontend needs (CoinGecko, Yahoo Finance, Google News RSS) instead of
calling them straight from the browser.

## Why this was needed

- CoinGecko already sends CORS headers, so those calls worked fine directly.
- **Yahoo Finance** and **Google News RSS** do **not** send CORS headers, so
  the old frontend routed those requests through public third-party CORS
  proxies (`allorigins.win`, `codetabs.com`), racing several of them at once
  and rate-limiting itself to avoid getting blocked. That's slow, unreliable,
  and depends on services you don't control.
- Server-to-server HTTP requests aren't subject to CORS at all, so this
  backend just fetches the data itself and re-serves it same-origin. The
  frontend no longer needs any proxy-racing logic.
- All upstream calls go through a `cachedFetch` helper with per-route TTLs,
  and heavier symbol batches (stock watchlist, top-100 table, markets
  summary banner) are fetched sequentially with small delays instead of in
  parallel, to avoid tripping Yahoo Finance's rate limits (`429`s).

## Run it

```bash
npm install
npm start
```

Locally the server defaults to **http://localhost:3000** (or whatever
`PORT` is set to). The server serves `public/index.html`, `style.css`, and
`script.js` directly, and the same origin also exposes the API routes
below, so there's nothing else to configure.

If you want to run the frontend from a different origin/port (e.g. a
separate static file server) instead of letting Express serve it, just
change `API_BASE` at the top of `public/script.js` to the backend's URL,
e.g. `const API_BASE = 'http://localhost:3000';`.

## Deployment

The app is deployed on **Render**. Render assigns its own `PORT`
(typically `10000`), which the server binds to via `process.env.PORT`.
The startup log line (`Ticker dashboard running at localhost:<PORT>`)
reflects the port the Node process is bound to *inside* its own
container — Render's routing layer sits in front of it and maps the
public `*.onrender.com` URL to that internal port. This is expected
and not an error.

The app is also wrapped in an Android WebView for a mobile build.

## API routes

| Route | Proxies |
|---|---|
| `GET /api/crypto/price?ids=bitcoin,ethereum` | CoinGecko `simple/price` |
| `GET /api/crypto/markets` | CoinGecko `coins/markets` (top 100 by market cap) |
| `GET /api/crypto/search?query=doge` | CoinGecko `search` |
| `GET /api/crypto/trending` | CoinGecko `search/trending` |
| `GET /api/stock/quote/:symbol` | Yahoo Finance `v8/finance/chart` (per-symbol quote) |
| `GET /api/stock/search?q=apple` | Yahoo Finance company-name/ticker search |
| `GET /api/stocks/markets` | Top-100 large-cap stocks overview table |
| `GET /api/markets/summary` | Markets summary banner: S&P 500, Dow, Nasdaq, Russell 2000, VIX, Gold, Bitcoin, Crude Oil |
| `GET /api/news/search?q=AAPL` | Yahoo Finance news search |
| `GET /api/news/google?edition=us\|world\|in` | Google News RSS (US, World, and India editions), returned as XML in the shape the frontend parses |

All routes respond with the same JSON (or XML, for the news feed) shape
the frontend reads directly, so no other frontend logic needs to change
when the backend changes providers.

### Note on Yahoo Finance

`v8/finance/chart` (per-symbol) is used instead of the `v7/finance/quote`
batch endpoint, since the batch endpoint hit crumb/cookie auth issues.
This means multiple symbols require multiple sequential requests rather
than a single batch call — hence the sequential-with-delay fetching
pattern used for larger symbol sets.

### Note on India news

Times of India's RSS feed is blocked by bot detection, so the India
edition is sourced from NDTV's Feedburner feed instead.

## Persistence

- **Auth & portfolio holdings** are backed by **Supabase**. Signed-in users'
  holdings are stored in a `portfolio_holdings` table (with row-level
  security policies scoping rows to the owning user).
- **localStorage** is retained as an offline fallback / cache for portfolio
  data, so the dashboard still works (read-only, locally) if Supabase is
  unreachable or the user isn't signed in.
- Watchlists (crypto/stock symbols a user is tracking) are similarly synced
  to Supabase per-user.

## Notes

- Responses are cached briefly in memory (10–120s depending on endpoint) to
  avoid hammering upstream APIs when multiple browser tabs/devices poll this
  server.
- No API keys are required for CoinGecko/Yahoo/Google News — same free/public
  endpoints as before, just fetched server-side.
