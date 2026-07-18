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


async function cachedFetch(cacheKey, ttlMs, fetcher) {
  const hit = cache.get(cacheKey);
  if (hit && hit.expires > Date.now()) return hit;
  const result = await fetcher();
  cache.set(cacheKey, { ...result, expires: Date.now() + ttlMs });
  return result;
}

async function fetchJson(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TickerDashboard/1.0)' }
    });
    if (!res.ok) throw new Error(`Upstream error ${res.status}`);
    const data = await res.json();
    return { data, contentType: 'application/json' };
  } finally {
    clearTimeout(timer);
  }
}

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


const TOP_10_AI_STOCKS = {
  NVDA: 'Nvidia',
  MSFT: 'Microsoft',
  GOOGL: 'Alphabet',
  META: 'Meta Platforms',
  AMZN: 'Amazon',
  AVGO: 'Broadcom',
  AMD: 'AMD',
  PLTR: 'Palantir',
  ORCL: 'Oracle',
  CRM: 'Salesforce'
};

app.get('/api/stocks/markets', async (req, res) => {
  try {
    const { data } = await cachedFetch('stocks:top10ai', 5 * 60_000, async () => {
      const symbols = Object.keys(TOP_10_AI_STOCKS);
      const results = await Promise.allSettled(
        symbols.map(async (sym) => {
          const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${process.env.FINNHUB_API_KEY}`;
          const { data } = await fetchJson(url, 8000);
          if (data.c === undefined || data.c === null || data.c === 0) {
            throw new Error('no data for ' + sym);
          }
          const price = data.c;          // current price
          const changePct = data.dp;     // % change already provided by Finnhub
          return {
            symbol: sym,
            name: TOP_10_AI_STOCKS[sym],
            price,
            changePct,
            volume: null // not available on Finnhub's free /quote endpoint
          };
        })
      );

      const mapped = results
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value);

      return { data: mapped, contentType: 'application/json' };
    });

    res.json(data);
  } catch (e) {
    console.error('stocks overview fetch failed:', e.message);
    res.status(502).json({ error: 'Failed to fetch stocks overview' });
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

app.get('/api/crypto/price', async (req, res) => {
  const ids = (req.query.ids || '').toString();
  if (!ids) return res.status(400).json({ error: 'ids query param required' });
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`;
    const { data } = await cachedFetch(`price:${ids}`, 20_000, () => fetchJson(url));
    res.json(data);
  } catch (e) {
    console.error('price fetch failed:', e.message);
    res.status(502).json({ error: 'Failed to fetch crypto prices' });
  }
});

app.get('/api/crypto/markets', async (req, res) => {
  try {
    const url = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false';
    const { data } = await cachedFetch('markets', 30_000, () => fetchJson(url, 10_000));
    res.json(data);
  } catch (e) {
    console.error('markets fetch failed:', e.message);
    res.status(502).json({ error: 'Failed to fetch markets overview' });
  }
});

app.get('/api/crypto/search', async (req, res) => {
  const query = (req.query.query || '').toString();
  if (!query) return res.status(400).json({ error: 'query param required' });
  try {
    const url = `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`;
    const { data } = await fetchJson(url);
    res.json(data);
  } catch (e) {
    console.error('crypto search failed:', e.message);
    res.status(502).json({ error: 'Search unavailable' });
  }
});

app.get('/api/crypto/trending', async (req, res) => {
  try {
    const url = 'https://api.coingecko.com/api/v3/search/trending';
    const { data } = await cachedFetch('trending', 30_000, () => fetchJson(url, 8000));
    res.json(data);
  } catch (e) {
    console.error('trending fetch failed:', e.message);
    res.status(502).json({ error: 'Failed to fetch trending coins' });
  }
});

const EARNINGS_WINDOW_DAYS = 14;
let sp500SymbolMap = null; // cached { SYMBOL: 'Company Name' }

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
    if (sym) map[sym.toUpperCase()] = row[nameKey] || sym;
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
      const end = new Date(today);
      end.setDate(end.getDate() + EARNINGS_WINDOW_DAYS);
      const fmt = d => d.toISOString().slice(0, 10);

      const url = `https://finnhub.io/api/v1/calendar/earnings?from=${fmt(today)}&to=${fmt(end)}&token=${process.env.FINNHUB_API_KEY}`;
      const { data: raw } = await fetchJson(url, 10000);
      const all = raw.earningsCalendar || [];

      // Filter to S&P 500 only, dedupe by symbol+date
      const seen = new Set();
      const filtered = all.filter(e => {
        const inList = sp500SymbolMap[e.symbol];
        const key = e.symbol + e.date;
        if (!inList || seen.has(key)) return false;
        seen.add(key);
        return true;
      }).map(e => ({
        symbol: e.symbol,
        name: sp500SymbolMap[e.symbol],
        date: e.date,
        hour: e.hour, // 'bmo' | 'amc' | ''
        epsEstimate: e.epsEstimate,
        revenueEstimate: e.revenueEstimate
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

// ---- Yahoo Finance passthrough endpoints ----

app.get('/api/stock/quote/:symbol', async (req, res) => {
  const symbol = req.params.symbol;
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const { data } = await cachedFetch(`quote:${symbol}`, 10_000, () => fetchJson(url));
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

app.get('/api/markets/summary', async (req, res) => {
  try {
    const { data } = await cachedFetch('markets:summary', 30_000, async () => {
      const results = await Promise.allSettled(
        MARKET_SUMMARY_SYMBOLS.map(async ({ symbol, label }) => {
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

app.get('/api/stocks/top-movers', async (req, res) => {
  try {
   const { data } = await cachedFetch('stocks:top-movers', 60_000, async () => {
      const [gainers, losers] = await Promise.all([
        fetchYahooScreener('day_gainers', 5),
        fetchYahooScreener('day_losers', 5)
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
      const rssRes = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'web:market-pulse:v1.0 (by /u/market_pulse_bot)' }
      });
      if (!rssRes.ok) {
        const body = await rssRes.text().catch(() => '');
        console.error('Reddit RSS error body:', rssRes.status, body.slice(0, 300));
        const err = new Error(`Reddit upstream error ${rssRes.status}`);
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
    const { data } = await cachedFetch(cacheKey, 10 * 60_000, fetchRedditRss);
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
    let query = supabaseAdmin.from('user_activity_log').select('*').order('created_at', { ascending: false });
    if (since) query = query.gte('created_at', since);

    const { data: rows, error } = await query.limit(5000);
    if (error) throw error;

    const totalHits = rows.length;
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
