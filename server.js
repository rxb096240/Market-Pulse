// server.js
// Backend proxy for the crypto/stock ticker dashboard.


const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
// Simple in-memory cache to avoid hammering upstream APIs when many
// browser tabs/clients poll this server at once.
const cache = new Map(); // key -> { expires, data, contentType }
const redditStaleCache = new Map(); // key -> last-known-good RSS text, never expires, used as 429 fallback


// failureTtlMs is opt-in (existing callers are unaffected): without it, a
// failed fetcher() call is never cached, so a currently-rate-limited
// upstream gets hammered again on every single request with no backoff.
// Passing it caches the failure itself for a short window, so repeated
// requests during an outage fail fast instead of piling onto CoinGecko.
async function cachedFetch(cacheKey, ttlMs, fetcher, failureTtlMs) {
  const hit = cache.get(cacheKey);
  if (hit && hit.expires > Date.now()) {
    if (hit.failed) throw hit.error;
    return hit;
  }
  try {
    const result = await fetcher();
    cache.set(cacheKey, { ...result, expires: Date.now() + ttlMs });
    return result;
  } catch (e) {
    if (failureTtlMs) cache.set(cacheKey, { failed: true, error: e, expires: Date.now() + failureTtlMs });
    throw e;
  }
}

// Requires a valid Supabase session. Used to gate the Reddit/Hacker News
// passthroughs to signed-in users only — those upstream APIs rate-limit
// aggressively, and reserving that budget for registered users (rather than
// any anonymous visitor) means logged-in users see fresher results instead
// of the limit getting burned through by casual browsing.
async function requireAuth(req, res) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) { res.status(401).json({ error: 'Sign in required' }); return false; }
  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) { res.status(401).json({ error: 'Sign in required' }); return false; }
    return true;
  } catch (e) {
    res.status(401).json({ error: 'Sign in required' });
    return false;
  }
}

async function fetchJson(url, timeoutMs = 8000, extraHeaders = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TickerDashboard/1.0)', ...extraHeaders }
    });
    if (!res.ok) throw new Error(`Upstream error ${res.status}`);
    const data = await res.json();
    return { data, contentType: 'application/json' };
  } finally {
    clearTimeout(timer);
  }
}

// CoinGecko's free "Demo" plan (register at coingecko.com/api/pricing, no
// card needed) bumps the rate limit from ~5-15 calls/min (anonymous) to 100
// calls/min. Sent as a header rather than a query param per CoinGecko's own
// guidance — query params risk leaking into logs. Falls back to anonymous
// access if the env var isn't set, so this stays optional rather than a
// hard requirement.
const COINGECKO_HEADERS = process.env.COINGECKO_API_KEY
  ? { 'x-cg-demo-api-key': process.env.COINGECKO_API_KEY }
  : {};

async function fetchText(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TickerDashboard/1.0)' }
    });
    if (!res.ok) throw new Error(`Upstream error ${res.status}`);
    const data = await res.text();
    return { data, contentType: res.headers.get('content-type') || 'text/plain' };
  } finally {
    clearTimeout(timer);
  }
}

async function resolveCity(ip){
  if (!ip || ip === '::1' || ip.startsWith('127.') || ip.startsWith('192.168.')) {
    return { city: 'Local', country: 'Local', state: null };
  }
  try {
    const { data } = await fetchJson(`http://ip-api.com/json/${ip}?fields=city,country,countryCode,regionName,status`, 4000);
    if (data.status !== 'success') return { city: null, country: null, state: null };
    return {
      city: data.city || null,
      country: data.country || null,
      state: data.countryCode === 'US' ? (data.regionName || null) : null
    };
  } catch (e) {
    console.error('geolocation lookup failed:', e.message);
    return { city: null, country: null, state: null };
  }
}


app.post('/api/track/nav', async (req, res) => {
  try {
    const { userId, section } = req.body || {};
    if (!section) return res.status(400).json({ error: 'section required' });

    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
      .split(',')[0].trim();
    
   const { city, country, state } = await resolveCity(ip);

    const { error } = await supabaseAdmin.from('user_activity_log').insert({
      user_id: userId || null,
      nav_section: section,
      ip_address: ip,
      city,
      country,
      state
    });

    if (error) throw error;
    res.status(204).end();
  } catch (e) {
    console.error('nav tracking failed:', e.message);
    res.status(500).json({ error: 'Failed to log activity' });
  }
});


// Curated pool of 25 large-cap tickers, listed in rough real-world market-cap
// order. Overview trusts this order rather than fetching live market cap
// (that was cut to save API calls) — see note below on keeping it current.
const LARGE_CAP_POOL = {
  AAPL: 'Apple', MSFT: 'Microsoft', NVDA: 'Nvidia', GOOGL: 'Alphabet', AMZN: 'Amazon',
  META: 'Meta Platforms', AVGO: 'Broadcom', TSLA: 'Tesla', 'BRK.B': 'Berkshire Hathaway', LLY: 'Eli Lilly',
  JPM: 'JPMorgan Chase', WMT: 'Walmart', V: 'Visa', MA: 'Mastercard', ORCL: 'Oracle',
  NFLX: 'Netflix', XOM: 'Exxon Mobil', COST: 'Costco', PG: 'Procter & Gamble', JNJ: 'Johnson & Johnson',
  HD: 'Home Depot', ABBV: 'AbbVie', BAC: 'Bank of America', KO: 'Coca-Cola', PLTR: 'Palantir'
};

// Separate curated list for the AI Stocks tab — allowed to overlap with the
// large-cap pool above (e.g. NVDA is legitimately both), but tracked and
// returned independently.
const AI_STOCKS = {
  NVDA: 'Nvidia', MSFT: 'Microsoft', GOOGL: 'Alphabet', AMD: 'AMD', PLTR: 'Palantir',
  META: 'Meta Platforms', AVGO: 'Broadcom', ORCL: 'Oracle', CRM: 'Salesforce', SNOW: 'Snowflake',
  SMCI: 'Super Micro Computer', ARM: 'Arm Holdings', MRVL: 'Marvell Technology', NOW: 'ServiceNow',
  PANW: 'Palo Alto Networks', AI: 'C3.ai', TSM: 'Taiwan Semiconductor', ASML: 'ASML Holding',
  DELL: 'Dell Technologies', IBM: 'IBM'
};

// Union of both ticker lists, deduped — symbols appearing in both
// LARGE_CAP_POOL and AI_STOCKS (NVDA, MSFT, GOOGL, META, AVGO, ORCL) only
// get fetched once per cache cycle instead of twice.
const ALL_SYMBOLS = Array.from(new Set([...Object.keys(LARGE_CAP_POOL), ...Object.keys(AI_STOCKS)]));

// Curated pool of NSE large-caps for the Stocks Overview "India" market
// option, in rough market-cap order. Fetched via Yahoo Finance (same
// endpoint as the ticker tape/VIX below) rather than Finnhub — Finnhub's
// free tier doesn't cover NSE, but Yahoo's chart endpoint works for
// `.NS`-suffixed symbols with no key required.
const INDIA_LARGE_CAP_POOL = {
  'RELIANCE.NS': 'Reliance Industries', 'BHARTIARTL.NS': 'Bharti Airtel', 'HDFCBANK.NS': 'HDFC Bank',
  'ICICIBANK.NS': 'ICICI Bank', 'SBIN.NS': 'State Bank of India', 'TCS.NS': 'Tata Consultancy Services',
  'BAJFINANCE.NS': 'Bajaj Finance', 'LICI.NS': 'Life Insurance Corporation of India', 'LT.NS': 'Larsen & Toubro',
  'HINDUNILVR.NS': 'Hindustan Unilever', 'SUNPHARMA.NS': 'Sun Pharmaceutical', 'ADANIENT.NS': 'Adani Enterprises',
  'MARUTI.NS': 'Maruti Suzuki', 'INFY.NS': 'Infosys', 'TITAN.NS': 'Titan Company',
  'ADANIPOWER.NS': 'Adani Power', 'ADANIPORTS.NS': 'Adani Ports', 'KOTAKBANK.NS': 'Kotak Mahindra Bank',
  'AXISBANK.NS': 'Axis Bank', 'M&M.NS': 'Mahindra & Mahindra', 'ITC.NS': 'ITC',
  'ULTRACEMCO.NS': 'UltraTech Cement', 'HCLTECH.NS': 'HCL Technologies', 'NTPC.NS': 'NTPC',
  'ONGC.NS': 'Oil & Natural Gas Corporation'
};

async function fetchYahooChartQuote(sym){
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`;
  const { data } = await fetchJson(url, 8000);
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta || meta.regularMarketPrice === undefined) throw new Error('no data for ' + sym);
  const prevClose = meta.previousClose ?? meta.chartPreviousClose;
  const price = meta.regularMarketPrice;
  return {
    symbol: sym,
    price,
    changePct: prevClose ? ((price - prevClose) / prevClose) * 100 : null,
    dayHigh: meta.regularMarketDayHigh ?? null,
    dayLow: meta.regularMarketDayLow ?? null
  };
}

async function fetchIndiaQuotes(){
  const { data } = await cachedFetch('stocks:in:allquotes', 5 * 60_000, async () => {
    const symbols = Object.keys(INDIA_LARGE_CAP_POOL);
    const results = await Promise.allSettled(symbols.map(fetchYahooChartQuote));
    const map = {};
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') map[symbols[i]] = r.value;
    });
    return { data: map, contentType: 'application/json' };
  });
  return data;
}

async function fetchQuote(sym){
  const { data: quote } = await fetchJson(
    `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${process.env.FINNHUB_API_KEY}`, 8000
  );
  if (quote.c === undefined || quote.c === null || quote.c === 0) {
    throw new Error('no quote data for ' + sym);
  }
  return {
    symbol: sym,
    price: quote.c,
    changePct: quote.dp,
    dayHigh: quote.h ?? null,
    dayLow: quote.l ?? null,
    open: quote.o ?? null,
    previousClose: quote.pc ?? null
  };
}

// Basic-financials snapshot (52-week range, beta, PE, EPS, avg volume, market
// cap, dividend yield) — one Finnhub call, cached an hour since these barely
// move intraday. Bid/ask, today's volume, earnings date, ex-dividend date,
// and analyst target price aren't in this endpoint (would need separate paid
// or extra calls), so the detail response leaves those null.
async function fetchStockMetrics(sym){
  const { data } = await cachedFetch(`stock:metric:${sym}`, 60 * 60_000, async () => {
    const { data: metricRes } = await fetchJson(
      `https://finnhub.io/api/v1/stock/metric?symbol=${encodeURIComponent(sym)}&metric=all&token=${process.env.FINNHUB_API_KEY}`, 8000
    );
    return { data: metricRes.metric || {}, contentType: 'application/json' };
  });
  return data;
}

async function fetchAllQuotes(){
  const { data } = await cachedFetch('stocks:allquotes', 5 * 60_000, async () => {
    const results = await Promise.allSettled(ALL_SYMBOLS.map(fetchQuote));
    const map = {};
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') map[ALL_SYMBOLS[i]] = r.value;
    });
    return { data: map, contentType: 'application/json' };
  });
  return data;
}

app.get('/api/stocks/markets', async (req, res) => {
  try {
    const quotes = await fetchAllQuotes();
    const mapped = Object.keys(LARGE_CAP_POOL)
      .filter(sym => quotes[sym])
      .map(sym => ({ ...quotes[sym], name: LARGE_CAP_POOL[sym] }));

    res.json(mapped);
  } catch (e) {
    console.error('stocks overview fetch failed:', e.message);
    res.status(502).json({ error: 'Failed to fetch stocks overview' });
  }
});

app.get('/api/stocks/markets/in', async (req, res) => {
  try {
    const quotes = await fetchIndiaQuotes();
    const mapped = Object.keys(INDIA_LARGE_CAP_POOL)
      .filter(sym => quotes[sym])
      .map(sym => ({ ...quotes[sym], name: INDIA_LARGE_CAP_POOL[sym] }));

    res.json(mapped);
  } catch (e) {
    console.error('India stocks overview fetch failed:', e.message);
    res.status(502).json({ error: 'Failed to fetch India stocks overview' });
  }
});

app.get('/api/stocks/markets/ai', async (req, res) => {
  try {
    const quotes = await fetchAllQuotes();
    const mapped = Object.keys(AI_STOCKS)
      .filter(sym => quotes[sym])
      .map(sym => ({ ...quotes[sym], name: AI_STOCKS[sym] }));

    res.json(mapped);
  } catch (e) {
    console.error('AI stocks overview fetch failed:', e.message);
    res.status(502).json({ error: 'Failed to fetch AI stocks overview' });
  }
});

app.get('/api/stocks/markets/ai', async (req, res) => {
  try {
    const { data } = await cachedFetch('stocks:ai', 5 * 60_000, async () => {
      const symbols = Object.keys(AI_STOCKS);
      const results = await Promise.allSettled(
        symbols.map(async (sym) => {
          const q = await fetchQuoteAndCap(sym);
          return { ...q, name: AI_STOCKS[sym] };
        })
      );

      const mapped = results
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value);

      return { data: mapped, contentType: 'application/json' };
    });

    res.json(data);
  } catch (e) {
    console.error('AI stocks overview fetch failed:', e.message);
    res.status(502).json({ error: 'Failed to fetch AI stocks overview' });
  }
});

// Looks up a quote for the detail popup: reuses the already-cached
// ALL_SYMBOLS quote when possible (no extra call), and falls back to a
// fresh, individually-cached Finnhub call for tickers outside that curated
// pool (e.g. anything a user has added to their own watchlist).
async function fetchQuoteFor(sym){
  const quotes = await fetchAllQuotes();
  if (quotes[sym]) return quotes[sym];
  const { data } = await cachedFetch(`stock:quote:${sym}`, 5 * 60_000, async () => {
    const q = await fetchQuote(sym);
    return { data: q, contentType: 'application/json' };
  });
  return data;
}

// Ticker detail popup (stocks overview + AI stocks tables, and the stock
// watchlist). Reuses the already-cached quote when available (no extra
// call) and adds one Finnhub basic-financials call for the fundamentals.
app.get('/api/stocks/detail/:symbol', async (req, res) => {
  const sym = req.params.symbol.toUpperCase();
  try {
    const [q, metric] = await Promise.all([fetchQuoteFor(sym), fetchStockMetrics(sym)]);
    if (!q) return res.status(404).json({ error: 'Unknown symbol' });

    const avgVolumeM = metric['3MonthAverageTradingVolume'];
    const marketCapM = metric['marketCapitalization'];
    const pe = metric['peTTM'] ?? metric['peBasicExclExtraTTM'] ?? null;

    res.json({
      symbol: sym,
      previousClose: q.previousClose ?? null,
      open: q.open ?? null,
      bid: null,
      ask: null,
      dayLow: q.dayLow ?? null,
      dayHigh: q.dayHigh ?? null,
      week52Low: metric['52WeekLow'] ?? null,
      week52High: metric['52WeekHigh'] ?? null,
      volume: null,
      avgVolume: avgVolumeM != null ? avgVolumeM * 1e6 : null,
      marketCap: marketCapM != null ? marketCapM * 1e6 : null,
      beta: metric['beta'] ?? null,
      peRatio: pe,
      eps: metric['epsTTM'] ?? null,
      earningsDate: null,
      dividendYield: metric['dividendYieldIndicatedAnnual'] ?? null,
      exDividendDate: null,
      targetEst: null
    });
  } catch (e) {
    console.error('stock detail fetch failed:', e.message);
    res.status(502).json({ error: 'Failed to fetch stock detail' });
  }
});

// CORS: allow the frontend (any origin) to call this API. Since this server
// itself will typically also serve the frontend as static files, this is
// mostly a safety net for local dev where the frontend runs on a different
// port.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

// ---- CoinGecko passthrough endpoints ----

// Builds { [coinId]: { usd, usd_24h_change, usd_market_cap } } for whichever
// of the requested ids are present in the still-fresh /api/crypto/markets
// cache (top 100 by market cap). Lets the watchlist/portfolio/practice mode
// reuse data the overview already fetched instead of always hitting
// simple/price, and gives us something to fall back on if simple/price
// itself gets rate-limited.
function priceDataFromMarketsCache(idList) {
  const hit = cache.get('markets');
  if (!hit || hit.expires <= Date.now() || !Array.isArray(hit.data)) return {};
  const found = {};
  for (const coin of hit.data) {
    if (idList.includes(coin.id)) {
      found[coin.id] = {
        usd: coin.current_price,
        usd_24h_change: coin.price_change_percentage_24h,
        usd_market_cap: coin.market_cap
      };
    }
  }
  return found;
}

app.get('/api/crypto/price', async (req, res) => {
  const ids = (req.query.ids || '').toString();
  if (!ids) return res.status(400).json({ error: 'ids query param required' });
  const idList = ids.split(',').map(s => s.trim()).filter(Boolean);

  const fromMarkets = priceDataFromMarketsCache(idList);
  const missingIds = idList.filter(id => !(id in fromMarkets));
  if (missingIds.length === 0) return res.json(fromMarkets);

  try {
    const missing = missingIds.join(',');
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(missing)}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`;
    // Widened from 20s, then 60s, then 120s: the watchlist poller, Portfolio,
    // and Practice Mode each hit this endpoint independently with their own
    // `ids` list, and CoinGecko's free-tier simple/price endpoint rate-limits
    // aggressively. 5 minutes trades some price freshness for reliability.
    const { data } = await cachedFetch(`price:${missing}`, 5 * 60_000, () => fetchJson(url, 8000, COINGECKO_HEADERS), 45_000);
    res.json({ ...fromMarkets, ...data });
  } catch (e) {
    console.error('price fetch failed:', e.message);
    // simple/price failed (often a rate limit) — serve whatever we already
    // had from the markets cache rather than leaving the caller with nothing.
    if (Object.keys(fromMarkets).length > 0) return res.json(fromMarkets);
    res.status(502).json({ error: 'Failed to fetch crypto prices' });
  }
});

app.get('/api/crypto/markets', async (req, res) => {
  try {
    const url = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false';
    const { data } = await cachedFetch('markets', 5 * 60_000, async () => {
      const result = await fetchJson(url, 10_000, COINGECKO_HEADERS);
      // CoinGecko sometimes answers 200 with an empty/degenerate body instead
      // of a real error — fetchJson's res.ok check alone lets that through as
      // a "success," which would otherwise get cached as good data for the
      // full 5 minutes. Treat it as a failure instead, so it only sticks
      // around for the short negative-cache window.
      if (!Array.isArray(result.data) || result.data.length === 0) {
        throw new Error('Empty markets response from CoinGecko');
      }
      return result;
    }, 45_000);
    res.json(data);
  } catch (e) {
    console.error('markets fetch failed:', e.message);
    res.status(502).json({ error: 'Failed to fetch markets overview' });
  }
});

// GET /api/markets/vix — real CBOE VIX quote + intraday sparkline via Yahoo Finance
app.get('/api/markets/vix', async (req, res) => {
  try {
    const chartRes = await fetch(
      'https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=5m&range=1d'
    );
    const chartData = await chartRes.json();
    const result = chartData.chart.result[0];
    const meta = result.meta;
    const timestamps = result.timestamp;
    const closes = result.indicators.quote[0].close;

    const points = timestamps
      .map((ts, i) => ({
        time: new Date(ts * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
        close: closes[i]
      }))
      .filter(p => p.close !== null);

    const price = meta.regularMarketPrice;
    const prevClose = meta.previousClose || meta.chartPreviousClose;
    const change = price - prevClose;
    const changePercent = (change / prevClose) * 100;

    res.json({ price, change, changePercent, points });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch VIX data' });
  }
});

app.get('/api/crypto/search', async (req, res) => {
  const query = (req.query.query || '').toString();
  if (!query) return res.status(400).json({ error: 'query param required' });
  try {
    const url = `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`;
    const { data } = await fetchJson(url, 8000, COINGECKO_HEADERS);
    res.json(data);
  } catch (e) {
    console.error('crypto search failed:', e.message);
    res.status(502).json({ error: 'Search unavailable' });
  }
});

app.get('/api/crypto/trending', async (req, res) => {
  try {
    const url = 'https://api.coingecko.com/api/v3/search/trending';
    const { data } = await cachedFetch('trending', 5 * 60_000, () => fetchJson(url, 8000, COINGECKO_HEADERS), 45_000);
    res.json(data);
  } catch (e) {
    console.error('trending fetch failed:', e.message);
    res.status(502).json({ error: 'Failed to fetch trending coins' });
  }
});

const EARNINGS_WINDOW_DAYS = 14;
let sp500SymbolMap = null; // cached { SYMBOL: 'Company Name' }

// Nasdaq's own public calendar (same one nasdaq.com/calendar/earnings uses).
// Unlike Finnhub's free tier, it doesn't embargo near-term dates — but it's
// a per-day bulk endpoint (all companies reporting that day in one call),
// not per-symbol, and it only carries the forecast/last-year comparison,
// never this quarter's actual EPS (confirmed by hitting it directly — its
// own header list has no "actual" column, even for already-reported days).
// Needs browser-like headers or Nasdaq's anti-bot layer 403s the request.
const NASDAQ_HEADERS = {
  'accept': 'application/json, text/plain, */*',
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.116 Safari/537.36',
  'origin': 'https://www.nasdaq.com',
  'referer': 'https://www.nasdaq.com/',
  'accept-language': 'en-US,en;q=0.9'
};

function parseNasdaqNumber(str){
  if (!str) return null;
  const negative = str.startsWith('(');
  const num = parseFloat(str.replace(/[()$,]/g, ''));
  if (isNaN(num)) return null;
  return negative ? -num : num;
}

async function fetchNasdaqEarningsForDate(dateStr){
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`https://api.nasdaq.com/api/calendar/earnings?date=${dateStr}`, {
      signal: controller.signal,
      headers: NASDAQ_HEADERS
    });
    if (!res.ok) throw new Error(`Nasdaq earnings calendar error ${res.status}`);
    const json = await res.json();
    const rows = json?.data?.rows || [];
    return rows.map(r => ({
      symbol: r.symbol,
      date: dateStr,
      hour: r.time === 'time-pre-market' ? 'bmo' : r.time === 'time-after-hours' ? 'amc' : '',
      epsEstimate: parseNasdaqNumber(r.epsForecast),
      epsActual: null,
      marketCap: parseNasdaqNumber(r.marketCap),
      lastYearEps: parseNasdaqNumber(r.lastYearEPS),
      fiscalQuarterEnding: r.fiscalQuarterEnding || null
    }));
  } finally {
    clearTimeout(timer);
  }
}

function parseCsv(text){
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  return lines.slice(1).map(line => {
    // simple split; sp500.csv fields aren't expected to contain commas inside quotes,
    // but this can be swapped for a proper CSV parser if that turns out wrong
    const cols = line.split(',');
    const row = {};
    headers.forEach((h, i) => { row[h] = (cols[i] || '').trim(); });
    return row;
  });
}

// The source CSV's name column carries share-class/security-type suffixes
// (e.g. "Apple Inc. Common Stock", "Alphabet Inc. Class C Capital Stock",
// "American International Group Inc. New Common Stock") that are just
// ticker-listing boilerplate, not part of how anyone refers to the company.
function cleanCompanyName(name){
  return name.replace(/\s+(Class\s+[A-Za-z]\s+)?(New\s+)?(Common|Capital)\s+Stock$/i, '');
}

async function fetchSp500List(){
  const url = 'https://raw.githubusercontent.com/Ate329/top-us-stock-tickers/main/tickers/sp500.csv';
  const { data: text } = await fetchText(url, 10000); // assumes you have a fetchText helper like fetchJson
  const rows = parseCsv(text);

  // TEMP DEBUG — remove once column names are confirmed
  console.log('sp500 csv header sample row:', JSON.stringify(rows[0]));

  const symbolKey = Object.keys(rows[0]).find(k => k.includes('symbol') || k.includes('ticker'));
  const nameKey = Object.keys(rows[0]).find(k => k.includes('name') || k.includes('company'));

  const map = {};
  rows.forEach(row => {
    const sym = row[symbolKey];
    if (sym) map[sym.toUpperCase()] = cleanCompanyName(row[nameKey] || sym);
  });
  return map;
}

app.get('/api/earnings/calendar', async (req, res) => {
  try {
    const { data } = await cachedFetch('earnings:calendar', 60 * 60_000, async () => {
      // Refresh the S&P 500 list once every 24h (separate long-lived cache)
      if (!sp500SymbolMap) {
        sp500SymbolMap = await fetchSp500List();
      }

      const today = new Date();
      const dates = Array.from({ length: EARNINGS_WINDOW_DAYS }, (_, i) => {
        const d = new Date(today);
        d.setDate(d.getDate() + i);
        return d.toISOString().slice(0, 10);
      });

      // One call per day (Nasdaq's calendar is bulk-per-day, not per-symbol),
      // in parallel — 14 requests, well within reason for an hourly refresh.
      const results = await Promise.allSettled(dates.map(fetchNasdaqEarningsForDate));
      const all = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);

      // Filter to S&P 500 only, dedupe by symbol+date
      const seen = new Set();
      const filtered = all.filter(e => {
        const inList = sp500SymbolMap[e.symbol];
        const key = e.symbol + e.date;
        if (!inList || seen.has(key)) return false;
        seen.add(key);
        return true;
      }).map(e => ({
        ...e,
        name: sp500SymbolMap[e.symbol]
      }));

      // Group by date
      const byDate = {};
      filtered.forEach(e => {
        if (!byDate[e.date]) byDate[e.date] = [];
        byDate[e.date].push(e);
      });
      const days = Object.keys(byDate).sort().map(date => ({
        date,
        entries: byDate[date].sort((a, b) => a.symbol.localeCompare(b.symbol))
      }));

      return { data: days, contentType: 'application/json' };
    });

    res.json(data);
  } catch (e) {
    console.error('earnings calendar fetch failed:', e.message);
    res.status(502).json({ error: 'Failed to fetch earnings calendar' });
  }
});

const IPO_WINDOW_DAYS = 60;

// Finnhub's price field is a plain string: a single value ("18.00"), a
// range before final pricing ("18.00-20.00"), or "" when not yet set.
// Use the midpoint for a range so a valuation can still be estimated,
// and flag it so the frontend can mark it as "est.".
function parseIpoPrice(priceStr) {
  if (!priceStr) return { price: null, isRange: false };
  const parts = priceStr.split('-').map(p => parseFloat(p.trim())).filter(n => !isNaN(n));
  if (parts.length === 0) return { price: null, isRange: false };
  if (parts.length === 1) return { price: parts[0], isRange: false };
  return { price: (parts[0] + parts[1]) / 2, isRange: true };
}

app.get('/api/ipo/calendar', async (req, res) => {
  try {
    const { data } = await cachedFetch('ipo:calendar', 60 * 60_000, async () => {
      const today = new Date();
      const from = today.toISOString().slice(0, 10);
      const to = new Date(today.getTime() + IPO_WINDOW_DAYS * 24 * 60 * 60_000).toISOString().slice(0, 10);

      const { data: json } = await fetchJson(
        `https://finnhub.io/api/v1/calendar/ipo?from=${from}&to=${to}&token=${process.env.FINNHUB_API_KEY}`, 10000
      );
      const rows = json?.ipoCalendar || [];

      const ipos = rows
        .filter(r => r.status !== 'withdrawn')
        .map(r => {
          const { price, isRange } = parseIpoPrice(r.price);
          const sharesOutstanding = r.numberOfShares || null;
          const valuation = (price !== null && sharesOutstanding) ? price * sharesOutstanding : null;
          return {
            symbol: r.symbol || null,
            name: r.name || r.symbol || 'Unknown',
            date: r.date,
            exchange: r.exchange || null,
            price,
            priceIsRange: isRange,
            sharesOutstanding,
            valuation,
            status: r.status || null
          };
        })
        .sort((a, b) => a.date.localeCompare(b.date));

      return { data: ipos, contentType: 'application/json' };
    });

    res.json(data);
  } catch (e) {
    console.error('IPO calendar fetch failed:', e.message);
    res.status(502).json({ error: 'Failed to fetch IPO calendar' });
  }
});

// ---- Yahoo Finance passthrough endpoints ----

app.get('/api/stock/quote/:symbol', async (req, res) => {
  const symbol = req.params.symbol;
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    // Widened from 10s: the frontend only polls every 90s (public/main.js),
    // so a 10s cache meant almost every poll cycle still hit Yahoo fresh for
    // each watchlist symbol. 60s keeps most polls served from cache instead.
    const { data } = await cachedFetch(`quote:${symbol}`, 60_000, () => fetchJson(url));
    res.json(data);
  } catch (e) {
    console.error('stock quote failed:', symbol, e.message);
    res.status(502).json({ error: `Failed to fetch quote for ${symbol}` });
  }
});

const MARKET_SUMMARY_SYMBOLS = [
  { symbol: '^GSPC', label: 'S&P 500' },
  { symbol: '^DJI',  label: 'Dow 30' },
  { symbol: '^IXIC', label: 'Nasdaq' },
  { symbol: '^RUT',  label: 'Russell 2000' },
  { symbol: '^VIX',  label: 'VIX' },
  { symbol: 'GC=F',  label: 'Gold' },
  { symbol: 'BTC-USD', label: 'Bitcoin USD' },
  { symbol: 'CL=F',  label: 'Crude Oil' }
];

const MARKET_SUMMARY_SYMBOLS_IN = [
  { symbol: '^NSEI',   label: 'Nifty 50' },
  { symbol: '^BSESN',  label: 'Sensex' },
  { symbol: '^NSEBANK', label: 'Nifty Bank' },
  { symbol: '^INDIAVIX', label: 'India VIX' },
  { symbol: 'GC=F',    label: 'Gold' },
  { symbol: 'BTC-USD', label: 'Bitcoin USD' },
  { symbol: 'BZ=F',    label: 'Brent Crude' },
  { symbol: 'INR=X',   label: 'USD/INR' }
];

app.get('/api/markets/summary', async (req, res) => {
  const market = req.query.market === 'in' ? 'in' : 'us';
  const symbolSet = market === 'in' ? MARKET_SUMMARY_SYMBOLS_IN : MARKET_SUMMARY_SYMBOLS;
  try {
    const { data } = await cachedFetch(`markets:summary:${market}`, 30_000, async () => {
      const results = await Promise.allSettled(
        symbolSet.map(async ({ symbol, label }) => {
          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
          const { data } = await fetchJson(url, 8000);
          const meta = data?.chart?.result?.[0]?.meta;
          if (!meta || meta.regularMarketPrice === undefined) throw new Error('no data for ' + symbol);
          const prevClose = meta.previousClose ?? meta.chartPreviousClose;
          const price = meta.regularMarketPrice;
          const change = prevClose ? price - prevClose : 0;
          const changePct = prevClose ? (change / prevClose) * 100 : 0;
          return { symbol, label, price, change, changePct };
        })
      );
      const mapped = results.filter(r => r.status === 'fulfilled').map(r => r.value);
      return { data: mapped, contentType: 'application/json' };
    });
    res.json(data);
  } catch (e) {
    console.error('markets summary fetch failed:', e.message);
    res.status(502).json({ error: 'Failed to fetch markets summary' });
  }
});

// ---- Personal finance rates (FRED — Federal Reserve Economic Data) ----
// National-average reference rates, not offers from any specific bank.
// FRED updates these weekly (mortgage) or monthly (savings/CD/prime) at
// most, so a long cache is safe and keeps us well under its free-tier
// rate limits.
const FRED_SERIES = [
  { id: 'MORTGAGE30US', label: '30-year fixed', group: 'mortgage' },
  { id: 'MORTGAGE15US', label: '15-year fixed', group: 'mortgage' },
  { id: 'SNDR', label: 'Savings (national avg)', group: 'savings' },
  { id: 'NDR1MCD', label: '1-mo CD', group: 'savings' },
  { id: 'NDR3MCD', label: '3-mo CD', group: 'savings' },
  { id: 'NDR6MCD', label: '6-mo CD', group: 'savings' },
  { id: 'NDR12MCD', label: '12-mo CD', group: 'savings' },
  {
    id: 'MPRIME', label: 'Bank prime rate', group: 'loans',
    note: 'Reference rate for variable-rate loans — not a personal-loan average.'
  },
  { id: 'TERMCBAUTO48NS', label: 'Auto loan (48-mo)', group: 'loans' },
  { id: 'RIFLPBCIANM60NM', label: 'Auto loan (60-mo)', group: 'loans' },
  { id: 'RIFLPBCIANM72NM', label: 'Auto loan (72-mo)', group: 'loans' }
];

async function fetchFredSeries(seriesId){
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${encodeURIComponent(seriesId)}&api_key=${process.env.FRED_API_KEY}&file_type=json&sort_order=desc&limit=1`;
  const { data } = await fetchJson(url, 8000);
  const obs = data?.observations?.[0];
  if (!obs || obs.value === '.') throw new Error('no observation for ' + seriesId);
  return { date: obs.date, value: parseFloat(obs.value) };
}

app.get('/api/rates/summary', async (req, res) => {
  try {
    const { data } = await cachedFetch('rates:summary', 6 * 60 * 60_000, async () => {
      const results = await Promise.allSettled(FRED_SERIES.map(s => fetchFredSeries(s.id)));
      const mapped = FRED_SERIES.map((s, i) => {
        const r = results[i];
        return {
          id: s.id,
          label: s.label,
          group: s.group,
          note: s.note || null,
          value: r.status === 'fulfilled' ? r.value.value : null,
          date: r.status === 'fulfilled' ? r.value.date : null
        };
      });
      return { data: mapped, contentType: 'application/json' };
    });
    res.json(data);
  } catch (e) {
    console.error('rates summary fetch failed:', e.message);
    res.status(502).json({ error: 'Failed to fetch rates summary' });
  }
});

// ---- Whole-market Top Movers (Yahoo Finance screener, all US-listed stocks) ----
// Unlike /api/stocks/markets (your curated Top 10 AI Stocks), this pulls from
// Yahoo's day_gainers / day_losers predefined screener, covering the entire
// market Yahoo tracks — same undocumented-but-stable endpoint family as your
// existing /v8/finance/chart calls.

async function fetchYahooScreener(scrId, count){
  const url = `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?formatted=true&lang=en-US&region=US&scrIds=${scrId}&count=${count}`;
  const { data } = await fetchJson(url, 8000);
  const quotes = data?.finance?.result?.[0]?.quotes || [];
  return quotes.map(q => ({
    symbol: q.symbol,
    name: q.shortName || q.longName || q.symbol,
    price: q.regularMarketPrice?.raw ?? null,
    changePct: q.regularMarketChangePercent?.raw ?? null
  }));
}

// count is clamped to 25 — the Home widget passes none (defaults to 5), the
// dedicated Top Movers panel asks for 20. Each distinct count is its own
// cache key, so bumping this doesn't add upstream call volume per viewer,
// just one more periodic Yahoo screener call per count value in use.
app.get('/api/stocks/top-movers', async (req, res) => {
  const count = Math.min(Math.max(parseInt(req.query.count, 10) || 5, 1), 25);
  try {
   const { data } = await cachedFetch(`stocks:top-movers:${count}`, 60_000, async () => {
      const [gainers, losers] = await Promise.all([
        fetchYahooScreener('day_gainers', count),
        fetchYahooScreener('day_losers', count)
      ]);
      return { data: { gainers, losers, lastFetched: Date.now() }, contentType: 'application/json' };
    });
    res.json(data);
  } catch (e) {
    console.error('top movers fetch failed:', e.message);
    res.status(502).json({ error: 'Failed to fetch top movers' });
  }
});

app.get('/api/stock/search', async (req, res) => {
  const q = (req.query.q || '').toString();
  if (!q) return res.status(400).json({ error: 'q param required' });
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`;
    const { data } = await cachedFetch(`stocksearch:${q.toLowerCase()}`, 60_000, () => fetchJson(url));
    const quotes = (data.quotes || [])
      .filter(x => x.symbol && (x.quoteType === 'EQUITY' || x.quoteType === 'ETF'))
      .map(x => ({ symbol: x.symbol, name: x.shortname || x.longname || x.symbol, exchange: x.exchange }));
    res.json({ quotes });
  } catch (e) {
    console.error('stock search failed:', q, e.message);
    res.status(502).json({ error: 'Search unavailable' });
  }
});

app.get('/api/news/search', async (req, res) => {
  const q = (req.query.q || '').toString();
  if (!q) return res.status(400).json({ error: 'q param required' });
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&newsCount=4&quotesCount=0`;
    const { data } = await cachedFetch(`news:${q}`, 60_000, () => fetchJson(url));
    res.json(data);
  } catch (e) {
    console.error('news search failed:', q, e.message);
    res.status(502).json({ error: 'Failed to fetch news' });
  }
});

// ---- Google News RSS passthrough ----
// Returns the raw XML with the right content-type so the existing
// DOMParser-based parsing code in the frontend keeps working unchanged.

const GNEWS_URLS = {
  us: 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en',
  world: 'https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-US&gl=US&ceid=US:en',
  in: 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms',
  technology: 'https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=en-US&gl=US&ceid=US:en',
  entertainment: 'https://news.google.com/rss/headlines/section/topic/ENTERTAINMENT?hl=en-US&gl=US&ceid=US:en',
  sports: 'https://news.google.com/rss/headlines/section/topic/SPORTS?hl=en-US&gl=US&ceid=US:en',
  health: 'https://news.google.com/rss/headlines/section/topic/HEALTH?hl=en-US&gl=US&ceid=US:en',
  business: 'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-US&gl=US&ceid=US:en',
  science: 'https://news.google.com/rss/headlines/section/topic/SCIENCE?hl=en-US&gl=US&ceid=US:en',
  // India edition, mirroring the topic sections offered on the News · Topics panel
  'in-technology': 'https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=en-IN&gl=IN&ceid=IN:en',
  'in-entertainment': 'https://news.google.com/rss/headlines/section/topic/ENTERTAINMENT?hl=en-IN&gl=IN&ceid=IN:en',
  'in-sports': 'https://news.google.com/rss/headlines/section/topic/SPORTS?hl=en-IN&gl=IN&ceid=IN:en',
  'in-health': 'https://news.google.com/rss/headlines/section/topic/HEALTH?hl=en-IN&gl=IN&ceid=IN:en',
  'in-business': 'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-IN&gl=IN&ceid=IN:en',
  'in-science': 'https://news.google.com/rss/headlines/section/topic/SCIENCE?hl=en-IN&gl=IN&ceid=IN:en',
};

app.get('/api/news/google', async (req, res) => {
  const edition = (req.query.edition || 'us').toString();
  const url = GNEWS_URLS[edition];
  if (!url) return res.status(400).json({ error: `Unsupported edition: ${edition}` });
  try {
    const { data } = await cachedFetch(`gnews:${edition}`, 120_000, () => fetchText(url));
    res.set('Content-Type', 'application/xml');
    res.send(data);
  } catch (e) {
    console.error('google news fetch failed:', edition, e.message);
    res.status(502).json({ error: 'Failed to fetch news feed' });
  }
});

// ---- Reddit RSS passthrough (any subreddit, any sort) ----
// Follows the same pattern as /api/news/google: proxy the raw feed with the
// right content-type and let the frontend parse it with DOMParser. No OAuth
// needed — Reddit's official API now requires app approval, and unauthenticated
// .json scraping (the old approach here) started 403ing, so RSS is the
// stable path for public read-only access.

const REDDIT_VALID_SORTS = new Set(['hot', 'new', 'top', 'rising', 'controversial']);
const REDDIT_VALID_TIMES = new Set(['hour', 'day', 'week', 'month', 'year', 'all']);
const REDDIT_LIMITS = { hot: 15, new: 15, rising: 15, top: 25, controversial: 20 };
const REDDIT_SUBREDDIT_RE = /^[A-Za-z0-9_]{2,21}$/;

app.get('/api/reddit/feed', async (req, res) => {
  if (!(await requireAuth(req, res))) return;
  const subreddit = (req.query.subreddit || '').toString();
  const sort = (req.query.sort || 'hot').toString();
  const t = (req.query.t || 'week').toString();

  if (!REDDIT_SUBREDDIT_RE.test(subreddit)) {
    return res.status(400).json({ error: 'Invalid subreddit name' });
  }
  if (!REDDIT_VALID_SORTS.has(sort)) {
    return res.status(400).json({ error: 'Invalid sort' });
  }
  if ((sort === 'top' || sort === 'controversial') && !REDDIT_VALID_TIMES.has(t)) {
    return res.status(400).json({ error: 'Invalid time filter' });
  }

  const limit = REDDIT_LIMITS[sort] || 15;
  const needsTime = sort === 'top' || sort === 'controversial';
  const sortPath = sort === 'hot' ? '' : `/${sort}`;
  const url = `https://www.reddit.com/r/${subreddit}${sortPath}/.rss?limit=${limit}` +
    (needsTime ? `&t=${t}` : '');

const cacheKey = `reddit:${subreddit}:${sort}:${needsTime ? t : ''}`;

  function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

 async function fetchRedditRssOnce(){
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      // Relayed through a Cloudflare Worker rather than calling Reddit
      // directly — Render's IP + a plain descriptive UA was getting 429/403'd
      // by Reddit's bot detection. The Worker sends browser-like headers
      // from Cloudflare's edge instead.
      const workerParams = new URLSearchParams({ subreddit, sort });
      if (needsTime) workerParams.set('t', t);
      const relayUrl = `https://reddit-rss-relay.a005-ram.workers.dev/?${workerParams.toString()}`;

      const rssRes = await fetch(relayUrl, { signal: controller.signal });
      if (!rssRes.ok) {
        const body = await rssRes.text().catch(() => '');
        console.error('Reddit relay error body:', rssRes.status, body.slice(0, 300));
        const err = new Error(`Reddit relay error ${rssRes.status}`);
        err.status = rssRes.status;
        throw err;
      }
      const text = await rssRes.text();
      return { data: text, contentType: 'application/xml' };
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchRedditRss(){
    try {
      return await fetchRedditRssOnce();
    } catch (e) {
      // One retry with a short backoff specifically for rate limiting —
      // Reddit's 429s are often transient bursts, not a hard block.
      if (e.status === 429) {
        await sleep(1500);
        return await fetchRedditRssOnce();
      }
      throw e;
    }
  }

  try {
    const { data } = await cachedFetch(cacheKey, 60 * 60_000, fetchRedditRss);
    redditStaleCache.set(cacheKey, data); // keep last-known-good indefinitely
    res.set('Content-Type', 'application/xml');
    res.send(data);
  } catch (e) {
    console.error('reddit feed fetch failed:', subreddit, sort, e.message);
    const stale = redditStaleCache.get(cacheKey);
    if (stale) {
      console.warn('serving stale reddit data for', cacheKey);
      res.set('Content-Type', 'application/xml');
      res.set('X-Data-Stale', 'true');
      return res.send(stale);
    }
    res.status(502).json({ error: `Failed to fetch r/${subreddit}` });
  }
});

// ---- Hacker News passthrough (Algolia Search API — free, keyless, no CORS/rate-limit drama) ----

app.get('/api/hackernews/search', async (req, res) => {
  if (!(await requireAuth(req, res))) return;
  const query = (req.query.q || '').toString();
  const sort = (req.query.sort || 'relevance').toString();
  if (!query) return res.status(400).json({ error: 'q param required' });
  if (sort !== 'relevance' && sort !== 'date') {
    return res.status(400).json({ error: 'Invalid sort' });
  }

  const endpoint = sort === 'date' ? 'search_by_date' : 'search';
  const url = `https://hn.algolia.com/api/v1/${endpoint}?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=15`;
  const cacheKey = `hn:${sort}:${query.toLowerCase()}`;

  try {
    const { data } = await cachedFetch(cacheKey, 15 * 60_000, () => fetchJson(url, 8000));
    const hits = (data.hits || []).map(h => ({
      objectID: h.objectID,
      title: h.title || '(untitled)',
      url: h.url || null,
      points: h.points ?? 0,
      numComments: h.num_comments ?? 0,
      author: h.author || 'unknown',
      createdAt: h.created_at || null
    }));
    res.json({ query, sort, hits });
  } catch (e) {
    console.error('hackernews search failed:', query, e.message);
    res.status(502).json({ error: 'Failed to fetch Hacker News results' });
  }
});

 



const FOREX_CURRENCIES = {
  EUR: 'Euro',
  GBP: 'British Pound',
  JPY: 'Japanese Yen',
  INR: 'Indian Rupee',
  CAD: 'Canadian Dollar',
  AUD: 'Australian Dollar',
  CHF: 'Swiss Franc',
  CNY: 'Chinese Yuan'
};

app.get('/api/forex/rates', async (req, res) => {
  try {
    const { data } = await cachedFetch('forex:rates', 60 * 60_000, async () => {
      const codes = Object.keys(FOREX_CURRENCIES).join(',');
      const url = `https://api.frankfurter.dev/v1/latest?base=USD&symbols=${codes}`;
      const { data: raw } = await fetchJson(url, 8000);

      // TEMP DEBUG — remove once forex rendering is confirmed working
      console.log('forex raw response:', JSON.stringify(raw));

      const rates = Object.entries(raw.rates || {}).map(([code, rate]) => ({
        currency: FOREX_CURRENCIES[code] || code,
        code,
        rate
      }));

      // TEMP DEBUG — remove once forex rendering is confirmed working
      console.log('forex mapped rates:', JSON.stringify(rates));

      return {
        data: { base: 'USD', asOf: raw.date || null, rates },
        contentType: 'application/json'
      };
    });

    res.json(data);
  } catch (e) {
    console.error('forex rates fetch failed:', e.message);
    res.status(502).json({ error: 'Failed to fetch forex rates' });
  }
});

// New env var — get this from Supabase dashboard: Settings → API → service_role key
// NEVER expose this in frontend code or commit it to the repo
const { createClient } = require('@supabase/supabase-js');
const supabaseAdmin = createClient(
  'https://lrxkqzubhcnzqtrmdimq.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

app.get('/api/admin/check', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.json({ isAdmin: false });
    const { data: userData } = await supabaseAdmin.auth.getUser(token);
    res.json({ isAdmin: userData?.user?.email === ADMIN_EMAIL });
  } catch (e) {
    res.json({ isAdmin: false });
  }
});

app.get('/api/admin/stats', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Missing auth token' });

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user || userData.user.email !== ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const since = (req.query.since || '').toString(); // ISO date string, optional

    // Supabase's project-wide "Max Rows" setting (default 1000) silently
    // caps how many rows any single request can return, regardless of
    // .limit() here — so totalHits can't come from rows.length once past
    // that. A head:true count query asks Postgres for the real total
    // without transferring (or being capped on) actual row data.
    let countQuery = supabaseAdmin.from('user_activity_log').select('*', { count: 'exact', head: true });
    if (since) countQuery = countQuery.gte('created_at', since);

    let query = supabaseAdmin.from('user_activity_log').select('*').order('created_at', { ascending: false });
    if (since) query = query.gte('created_at', since);

    const [{ count: totalHits, error: countError }, { data: rows, error }] = await Promise.all([
      countQuery,
      query.limit(5000)
    ]);
    if (countError) throw countError;
    if (error) throw error;

    const uniqueUsers = new Set(rows.map(r => r.user_id || r.ip_address)).size;

    const cityCounts = {};
    rows.forEach(r => {
      const key = r.city ? `${r.city}|${r.country || ''}` : null;
      if (key) cityCounts[key] = (cityCounts[key] || 0) + 1;
    });
    const topCities = Object.entries(cityCounts)
      .map(([key, hits]) => {
        const [city, country] = key.split('|');
        return { city, country, hits };
      })
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 10);

    const viewCounts = {};
    rows.forEach(r => { viewCounts[r.nav_section] = (viewCounts[r.nav_section] || 0) + 1; });
    const topView = Object.entries(viewCounts).sort((a, b) => b[1] - a[1])[0];

    const recent = rows.slice(0, 25).map(r => ({
      time: r.created_at, city: r.city, country: r.country,
      section: r.nav_section, signedIn: !!r.user_id
    }));

    res.json({
      totalHits,
      uniqueUsers,
      citiesReached: new Set(rows.map(r => r.city).filter(Boolean)).size,
      statesReached: new Set(rows.map(r => r.state).filter(Boolean)).size,
      countriesReached: new Set(rows.map(r => r.country).filter(Boolean)).size,
      topView: topView ? { section: topView[0], count: topView[1] } : null,
      topCities,
      recent
    });
  } catch (e) {
    console.error('admin stats fetch failed:', e.message);
    res.status(500).json({ error: 'Failed to fetch admin stats' });
  }
});

app.get('/api/admin/users', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Missing auth token' });

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user || userData.user.email !== ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // listUsers is paginated (max 1000/page) — loop until a short page tells
    // us we've reached the end, capped so a runaway user table can't hang this.
    const users = [];
    for (let page = 1; page <= 10; page++) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      users.push(...data.users);
      if (data.users.length < 1000) break;
    }

    res.json(users.map(u => ({
      email: u.email,
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at
    })));
  } catch (e) {
    console.error('admin users fetch failed:', e.message);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// ---- Practice Mode leaderboard (public) ----
// Reads every user's practice_accounts + practice_holdings via the
// service-role client (RLS on those tables normally scopes reads to
// auth.uid()), but only ever returns a nickname (or an anonymous
// "Trader ####" fallback) plus their portfolio stats — never email or
// user_id. Prices are fetched fresh for the union of everyone's holdings
// (arbitrary tickers/coins, not just the curated pools), then cached for
// 5 minutes since this can touch a lot of distinct symbols.
async function fetchLeaderboardRows(){
  const [{ data: accounts, error: accErr }, { data: holdings, error: holdErr }] = await Promise.all([
    supabaseAdmin.from('practice_accounts').select('user_id, cash_balance, nickname'),
    supabaseAdmin.from('practice_holdings').select('user_id, asset_type, asset_key, qty, avg_price')
  ]);
  if (accErr) throw accErr;
  if (holdErr) throw holdErr;

  const stockSyms = Array.from(new Set(holdings.filter(h => h.asset_type === 'stock').map(h => h.asset_key)));
  const cryptoIds = Array.from(new Set(holdings.filter(h => h.asset_type === 'crypto').map(h => h.asset_key)));

  const [stockResults, cryptoRes] = await Promise.all([
    Promise.allSettled(stockSyms.map(sym => fetchYahooChartQuote(sym))),
    cryptoIds.length > 0
      ? fetchJson(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(cryptoIds.join(','))}&vs_currencies=usd`, 8000, COINGECKO_HEADERS)
          .then(r => r.data).catch(() => ({}))
      : Promise.resolve({})
  ]);

  const stockPrices = {};
  stockResults.forEach((r, i) => {
    if (r.status === 'fulfilled') stockPrices[stockSyms[i]] = r.value.price;
  });

  const holdingsValueByUser = {};
  holdings.forEach(h => {
    const price = h.asset_type === 'crypto' ? cryptoRes[h.asset_key]?.usd : stockPrices[h.asset_key];
    const value = (price !== undefined && price !== null) ? h.qty * price : h.qty * h.avg_price;
    holdingsValueByUser[h.user_id] = (holdingsValueByUser[h.user_id] || 0) + value;
  });

  const rows = accounts.map(a => {
    const totalValue = a.cash_balance + (holdingsValueByUser[a.user_id] || 0);
    const gainPct = ((totalValue - 10000) / 10000) * 100;
    const name = (a.nickname || '').trim() || `Trader ${a.user_id.slice(0, 4)}`;
    return { name, totalValue, gainPct };
  });

  rows.sort((a, b) => b.totalValue - a.totalValue);
  return rows.slice(0, 50);
}

app.get('/api/practice/leaderboard', async (req, res) => {
  try {
    const { data } = await cachedFetch('practice:leaderboard', 5 * 60_000, async () => {
      const rows = await fetchLeaderboardRows();
      return { data: rows, contentType: 'application/json' };
    });
    res.json(data);
  } catch (e) {
    console.error('leaderboard fetch failed:', e.message);
    res.status(502).json({ error: 'Failed to fetch leaderboard' });
  }
});


// ---- Serve the static frontend (index.html, script.js, style.css) ----
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Ticker dashboard backend running at http://localhost:${PORT}`);
});

app.get('/api/ping', (req, res) => {
  res.status(200).json({ status: 'ok', time: new Date().toISOString() });
});


