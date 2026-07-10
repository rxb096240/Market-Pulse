// server.js
// Backend proxy for the crypto/stock ticker dashboard.


const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname, 'public')));
// Simple in-memory cache to avoid hammering upstream APIs when many
// browser tabs/clients poll this server at once.
const cache = new Map(); // key -> { expires, data, contentType }

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
