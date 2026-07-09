# Ticker Dashboard Backend

An Express backend that solves the CORS problem for the crypto/stock ticker
dashboard by proxying the three external APIs the frontend needs
(CoinGecko, Yahoo Finance, Google News RSS) instead of calling them straight
from the browser.

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

## Run it

```bash
cd backend
npm install
npm start
```

Then open **http://localhost:3000** — the server serves `public/index.html`,
`style.css`, and `script.js` directly, and the same origin also exposes the
API routes below, so there's nothing else to configure.

If you want to run the frontend from a different origin/port (e.g. a
separate static file server) instead of letting Express serve it, just
change `API_BASE` at the top of `public/script.js` to the backend's URL,
e.g. `const API_BASE = 'http://localhost:3000';`.

## API routes

| Route | Proxies |
|---|---|
| `GET /api/crypto/price?ids=bitcoin,ethereum` | CoinGecko `simple/price` |
| `GET /api/crypto/markets` | CoinGecko `coins/markets` (top 100 by market cap) |
| `GET /api/crypto/search?query=doge` | CoinGecko `search` |
| `GET /api/crypto/trending` | CoinGecko `search/trending` |
| `GET /api/stock/quote/:symbol` | Yahoo Finance chart/quote endpoint |
| `GET /api/news/search?q=AAPL` | Yahoo Finance news search |
| `GET /api/news/google?edition=us\|world` | Google News RSS (returned as XML, same shape the frontend already parses) |

All routes respond with the same JSON shape the frontend previously read
directly from CoinGecko/Yahoo, so no other frontend logic had to change.

## Notes

- Responses are cached briefly in memory (10–120s depending on endpoint) to
  avoid hammering upstream APIs when multiple browser tabs poll this server.
- No API keys are required — same free/public endpoints as before, just
  fetched server-side.
