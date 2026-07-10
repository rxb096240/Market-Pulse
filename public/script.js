const COINS = [
  { id:'bitcoin',   sym:'BTC',  name:'Bitcoin',      color:'#F7931A' },
  { id:'ethereum',  sym:'ETH',  name:'Ethereum',     color:'#8C8CFF' },
  { id:'ripple',    sym:'XRP',  name:'XRP',          color:'#3FA7FF' },
  { id:'dogecoin',  sym:'DOGE', name:'Dogecoin',     color:'#F2C13B' },
  { id:'shiba-inu', sym:'SHIB', name:'Shiba Inu',    color:'#FF7A5C' },
];

const STOCKS = [
  { sym:'AAPL',  name:'Apple',      color:'#A2AAAD' },
  { sym:'MSFT',  name:'Microsoft',  color:'#7FBA00' },
  { sym:'GOOGL', name:'Alphabet',   color:'#4285F4' },
  { sym:'AMZN',  name:'Amazon',     color:'#FF9900' },
  { sym:'TSLA',  name:'Tesla',      color:'#E31937' },
  { sym:'FIG',   name:'Figma',      color:'#A259FF' },
];

// Portfolio holdings: { id, type: 'crypto'|'stock', key, sym, name, qty, avgPrice }
let PORTFOLIO = [];
try{
  const saved = localStorage.getItem('tickerPortfolio');
  if(saved) PORTFOLIO = JSON.parse(saved);
}catch(e){ PORTFOLIO = []; }

const PALETTE = ['#5EE6C9','#FF9DBB','#7BD3FF','#FFD166','#C792EA','#8FE388','#FF9F68','#6FD6FF'];
let paletteIdx = 0;
function nextColor(){ const c = PALETTE[paletteIdx % PALETTE.length]; paletteIdx++; return c; }

let lastPrices = {};
let latestCryptoData = {};
let latestStockData = {};
let currentView = 'crypto-overview';
let searchDebounce = null;
let stockSearchTimer = null;
let pfSearchDebounce = null;
let pfPendingCoin = null; // { id, symbol, name } selected from crypto search in portfolio form
let newsRefreshToken = 0;
let trendingLoaded = false;

function fmtPrice(v){
  if(v === undefined || v === null || isNaN(v)) return '--';
  if(v >= 1000) return v.toLocaleString('en-US',{maximumFractionDigits:0});
  if(v >= 1) return v.toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2});
  if(v >= 0.01) return v.toLocaleString('en-US',{minimumFractionDigits:4, maximumFractionDigits:4});
  return v.toLocaleString('en-US',{minimumFractionDigits:8, maximumFractionDigits:8});
}

function fmtCap(v){
  if(v >= 1e12) return '$'+(v/1e12).toFixed(2)+'T';
  if(v >= 1e9) return '$'+(v/1e9).toFixed(2)+'B';
  if(v >= 1e6) return '$'+(v/1e6).toFixed(2)+'M';
  return '$'+v.toFixed(0)+' mcap';
}

function fmtUsd(v){
  return '$' + v.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
}

function sleep(ms){ return new Promise(resolve => setTimeout(resolve, ms)); }

// All external data now goes through our own backend (server.js), which
// proxies CoinGecko / Yahoo Finance / Google News server-side. That avoids
// CORS entirely, so there's no more need to race requests through public
// CORS-proxy services or rate-limit ourselves against them.
const API_BASE = '';

function savePortfolio(){
  try{ localStorage.setItem('tickerPortfolio', JSON.stringify(PORTFOLIO)); }catch(e){}
}

function escapeHtml(s){
  const div = document.createElement('div');
  div.textContent = s == null ? '' : String(s);
  return div.innerHTML;
}

function timeAgo(ms){
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if(mins < 1) return 'just now';
  if(mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if(hrs < 24) return hrs + 'h ago';
  const days = Math.floor(hrs / 24);
  return days + 'd ago';
}

/* ---- Watchlist cards ---- */
function buildCard(item, key, type){
  const card = document.createElement('div');
  card.className = 'card';
  card.style.setProperty('--coin-color', item.color);
  card.id = 'card-' + key;
  card.innerHTML = `
    <div class="card-top">
      <div class="coin-id">
        <div class="coin-sym">${item.sym}</div>
        <div class="coin-name">${item.name}</div>
      </div>
      <div class="card-top-right">
        <div class="rank">USD</div>
        <button class="remove-btn" title="Remove" data-type="${type}" data-key="${key}">×</button>
      </div>
    </div>
    <div class="price" id="price-${key}">--</div>
    <div class="meta-row">
      <span class="chg" id="chg-${key}">--</span>
      <span class="cap" id="cap-${key}"></span>
    </div>
  `;
  card.querySelector('.remove-btn').addEventListener('click', () => removeItem(type, key));
  return card;
}

function initGrids(){
  const cg = document.getElementById('cryptoGrid');
  cg.innerHTML = '';
  COINS.forEach(c => cg.appendChild(buildCard(c, c.id, 'crypto')));

  const sg = document.getElementById('stockGrid');
  sg.innerHTML = '';
  STOCKS.forEach(s => sg.appendChild(buildCard(s, s.sym, 'stock')));
}

function removeItem(type, key){
  if(type === 'crypto'){
    const idx = COINS.findIndex(c => c.id === key);
    if(idx > -1) COINS.splice(idx, 1);
    delete latestCryptoData[key];
  }else{
    const idx = STOCKS.findIndex(s => s.sym === key);
    if(idx > -1) STOCKS.splice(idx, 1);
    delete latestStockData[key];
  }
  delete lastPrices[key];
  const card = document.getElementById('card-'+key);
  if(card) card.remove();
  buildTape();
  refreshNews();
}

function updateCard(key, price, changePct, capText){
  const priceEl = document.getElementById('price-'+key);
  const chgEl = document.getElementById('chg-'+key);
  const capEl = document.getElementById('cap-'+key);
  const cardEl = document.getElementById('card-'+key);
  if(!priceEl || price === undefined || price === null) return;

  const prev = lastPrices[key];
  priceEl.textContent = '$' + fmtPrice(price);

  if(changePct !== undefined && changePct !== null){
    chgEl.textContent = (changePct >= 0 ? '▲ ' : '▼ ') + Math.abs(changePct).toFixed(2) + '%';
    chgEl.className = 'chg ' + (changePct >= 0 ? 'up' : 'down');
  }
  if(capText !== undefined) capEl.textContent = capText;

  if(prev !== undefined && cardEl){
    cardEl.classList.remove('flash-up','flash-down');
    void cardEl.offsetWidth;
    if(price > prev) cardEl.classList.add('flash-up');
    else if(price < prev) cardEl.classList.add('flash-down');
  }
  lastPrices[key] = price;
}

function buildTape(){
  const tape = document.getElementById('tape');
  let cryptoItems = COINS.map(c => {
    const d = latestCryptoData[c.id];
    if(!d) return '';
    const chg = d.usd_24h_change || 0;
    const cls = chg >= 0 ? 'up' : 'down';
    const arrow = chg >= 0 ? '▲' : '▼';
    return `<span class="tape-item"><b>${c.sym}</b> $${fmtPrice(d.usd)} <span class="chg ${cls}">${arrow} ${Math.abs(chg).toFixed(2)}%</span></span>`;
  }).join('');
  let stockItems = STOCKS.map(s => {
    const d = latestStockData[s.sym];
    if(!d) return '';
    const cls = d.changePct >= 0 ? 'up' : 'down';
    const arrow = d.changePct >= 0 ? '▲' : '▼';
    return `<span class="tape-item"><b>${s.sym}</b> $${fmtPrice(d.price)} <span class="chg ${cls}">${arrow} ${Math.abs(d.changePct).toFixed(2)}%</span></span>`;
  }).join('');
  const items = cryptoItems + stockItems;
  tape.innerHTML = items + items;
}

/* ---- Price fetching ---- */
async function fetchCrypto(){
  if(COINS.length === 0) return true;
  const ids = COINS.map(c => c.id).join(',');
  const url = `${API_BASE}/api/crypto/price?ids=${encodeURIComponent(ids)}`;
  try{
    const res = await fetch(url);
    if(!res.ok) throw new Error('bad response');
    const data = await res.json();
    latestCryptoData = data;
    COINS.forEach(c => {
      const d = data[c.id];
      if(!d) return;
      updateCard(c.id, d.usd, d.usd_24h_change, d.usd_market_cap ? fmtCap(d.usd_market_cap) : '');
    });
    return true;
  }catch(e){
    return false;
  }
}

async function fetchJsonWithTimeout(url, ms){
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try{
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if(!res.ok) throw new Error('http ' + res.status);
    return await res.json();
  }finally{
    clearTimeout(timer);
  }
}

async function fetchTextWithTimeout(url, ms){
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try{
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if(!res.ok) throw new Error('http ' + res.status);
    return await res.text();
  }finally{
    clearTimeout(timer);
  }
}

async function fetchOneStock(sym){
  const target = `${API_BASE}/api/stock/quote/${encodeURIComponent(sym)}`;
  const json = await fetchJsonWithTimeout(target, 8000);
  const meta = json?.chart?.result?.[0]?.meta;
  if(!meta || meta.regularMarketPrice === undefined) throw new Error('no data for ' + sym);

  const prevClose = meta.previousClose ?? meta.chartPreviousClose;
  let price = meta.regularMarketPrice;
  let session = 'regular';

  if(meta.marketState === 'PRE' && meta.preMarketPrice){
    price = meta.preMarketPrice;
    session = 'pre';
  }else if((meta.marketState === 'POST' || meta.marketState === 'POSTPOST' || meta.marketState === 'CLOSED') && meta.postMarketPrice){
    price = meta.postMarketPrice;
    session = 'post';
  }

  const changePct = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;
  return { price, changePct, shortName: meta.shortName || sym, session };
}

async function fetchStocks(){
  if(STOCKS.length === 0) return true;
  let anyOk = false;
  // Fetch all symbols concurrently — each one already races its own set of
  // CORS proxies, so there's no need to serialize across symbols too.
  const results = await Promise.allSettled(STOCKS.map(s => fetchOneStock(s.sym)));
  results.forEach((result, i) => {
    const sym = STOCKS[i].sym;
    if(result.status === 'fulfilled'){
      anyOk = true;
      const data = result.value;
      latestStockData[sym] = data;
      const label = data.session === 'pre' ? 'Pre-market'
        : data.session === 'post' ? 'After hours'
        : '';
      updateCard(sym, data.price, data.changePct, label);
    }else{
      console.error('Stock fetch failed:', sym, result.reason);
      const capEl = document.getElementById('cap-'+sym);
      if(capEl && !latestStockData[sym]) capEl.textContent = 'unavailable';
    }
  });
  return anyOk;
}

function setStatus(ok){
  const led = document.getElementById('statusLed');
  const text = document.getElementById('statusText');
  if(!led || !text) return;
  if(ok){
    led.style.background = 'var(--up)';
    text.textContent = 'Live · updates every 30s';
  }else{
    led.style.background = 'var(--down)';
    text.textContent = 'Feed error · retrying…';
  }
}

let isRefreshing = false;

async function refreshAll(){
  if(isRefreshing) return; // Skip if a refresh is already running
  isRefreshing = true;
  
  try {
    const [cryptoOk, stockOk] = await Promise.all([fetchCrypto(), fetchStocks()]);
    buildTape();
    setStatus(cryptoOk || stockOk);
    renderPortfolio();
    if(currentView === 'crypto-trending'){
      refreshTrending();
    }else if(currentView === 'crypto-overview'){
      refreshMarketsOverview();
    }
  } catch(e) {
    console.error("Refresh cycle failed:", e);
  } finally {
    setTimeout(() => { isRefreshing = false; }, 2000);
  }
}


function tickClock(){
  const el = document.getElementById('clock-time');
  if(el) el.textContent = new Date().toLocaleTimeString('en-US', { hour12:false });
}

/* ---- Watchlist helpers (used by search bars and portfolio) ---- */
function ensureCryptoTracked(id, symbol, name){
  if(!COINS.some(c => c.id === id)){
    COINS.push({ id, sym: symbol.toUpperCase(), name, color: nextColor() });
    const cg = document.getElementById('cryptoGrid');
    const errEl = cg.querySelector('.err');
    if(errEl) errEl.remove();
    cg.appendChild(buildCard(COINS[COINS.length-1], id, 'crypto'));
  }
}

async function ensureStockTracked(sym){
  if(!STOCKS.some(s => s.sym === sym)){
    const data = await fetchOneStock(sym); // throws if invalid — caller should catch
    STOCKS.push({ sym, name: data.shortName, color: nextColor() });
    latestStockData[sym] = data;
    const sg = document.getElementById('stockGrid');
    const errEl = sg.querySelector('.err');
    if(errEl) errEl.remove();
    sg.appendChild(buildCard(STOCKS[STOCKS.length-1], sym, 'stock'));
    updateCard(sym, data.price, data.changePct, '');
  }
}

/* ---- Generic crypto autocomplete (used by both crypto search and portfolio form) ---- */
function closeResults(el){
  if(!el) return;
  el.classList.remove('open');
  el.innerHTML = '';
}

async function runCryptoSearch(q, resultsEl, onPick){
  if(!q){ closeResults(resultsEl); return; }
  try{
    const res = await fetch(`${API_BASE}/api/crypto/search?query=${encodeURIComponent(q)}`);
    if(!res.ok) throw new Error('bad response');
    const data = await res.json();
    const coins = (data.coins || []).slice(0, 8);
    if(coins.length === 0){
      resultsEl.innerHTML = `<div class="result-note">No coins found for "${q}"</div>`;
      resultsEl.classList.add('open');
      return;
    }
    resultsEl.innerHTML = coins.map(c => `
      <div class="result-item" data-id="${c.id}" data-symbol="${c.symbol}" data-name="${c.name.replace(/"/g,'&quot;')}">
        <img src="${c.thumb}" alt="" onerror="this.style.display='none'">
        <span class="result-name">${c.name}</span>
        <span class="result-sym">${c.symbol.toUpperCase()}</span>
      </div>
    `).join('');
    resultsEl.classList.add('open');
    resultsEl.querySelectorAll('.result-item').forEach(el => {
      el.addEventListener('click', () => onPick({
        id: el.dataset.id, symbol: el.dataset.symbol, name: el.dataset.name
      }));
    });
  }catch(e){
    resultsEl.innerHTML = `<div class="result-note">Search unavailable — try again.</div>`;
    resultsEl.classList.add('open');
  }
}

/* ---- Crypto watchlist search bar ---- */
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
const searchHint = document.getElementById('searchHint');

function addCoinFromSearch(coin){
  ensureCryptoTracked(coin.id, coin.symbol, coin.name);
  closeResults(searchResults);
  searchInput.value = '';
  fetchCrypto().then(buildTape);
  refreshNews();
}

if(searchInput){
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim();
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => runCryptoSearch(q, searchResults, addCoinFromSearch), 350);
  });
}

/* ---- Stock watchlist search bar ---- */
const stockSearchInput = document.getElementById('stockSearchInput');
const stockSearchResults = document.getElementById('stockSearchResults');
const stockSearchHint = document.getElementById('stockSearchHint');

async function addStockFromSearch(rawSym){
  const sym = rawSym.trim().toUpperCase();
  if(!sym) return;
  if(STOCKS.some(s => s.sym === sym)){ closeResults(stockSearchResults); stockSearchInput.value=''; return; }
  stockSearchHint.textContent = `Looking up ${sym}…`;
  try{
    await ensureStockTracked(sym);
    buildTape();
    refreshNews();
    stockSearchHint.textContent = `Added ${sym}. Type an exact ticker symbol and press Enter to add another.`;
  }catch(e){
    stockSearchHint.textContent = `Couldn't find a ticker matching "${sym}". Check the symbol and try again.`;
  }
  closeResults(stockSearchResults);
  stockSearchInput.value = '';
}

if(stockSearchInput){
  stockSearchInput.addEventListener('input', () => {
    const q = stockSearchInput.value.trim();
    if(!q){ closeResults(stockSearchResults); return; }
    stockSearchResults.innerHTML = `<div class="result-item" data-sym="${q.toUpperCase()}">
      <span class="result-name">Add "${q.toUpperCase()}" as a stock</span>
    </div>`;
    stockSearchResults.classList.add('open');
    stockSearchResults.querySelector('.result-item').addEventListener('click', () => addStockFromSearch(q));
  });
  stockSearchInput.addEventListener('keydown', (e) => {
    if(e.key === 'Enter') addStockFromSearch(stockSearchInput.value);
  });
}

/* ---- Trending ---- */
async function fetchTrending(){
  try{
    const json = await fetchJsonWithTimeout(`${API_BASE}/api/crypto/trending`, 8000);
    return json.coins || [];
  }catch(e){
    console.error('Trending fetch failed:', e);
    return [];
  }
}

async function refreshTrending(){
  const container = document.getElementById('trendingList');
  if(!container) return;
  if(!trendingLoaded){
    container.innerHTML = '<div class="news-loading">Loading trending coins…</div>';
  }

  const coins = await fetchTrending();
  if(coins.length === 0){
    if(!trendingLoaded){
      container.innerHTML = '<div class="err">Trending data unavailable — try again shortly.</div>';
    }
    return;
  }

  const ids = coins.map(c => c.item.id).join(',');
  let prices = {};
  try{
    prices = await fetchJsonWithTimeout(
      `${API_BASE}/api/crypto/price?ids=${encodeURIComponent(ids)}`,
      8000
    );
  }catch(e){ /* render without live price if this fails */ }

  container.innerHTML = '';
  coins.forEach((c, idx) => {
    const item = c.item;
    const priceData = prices[item.id];
    const alreadyTracked = COINS.some(co => co.id === item.id);
    const chg = priceData ? priceData.usd_24h_change : null;
    const chgCls = chg === null ? '' : (chg >= 0 ? 'up' : 'down');
    const chgArrow = chg === null ? '' : (chg >= 0 ? '▲ ' : '▼ ');

    const row = document.createElement('div');
    row.className = 'trending-item';
    row.innerHTML = `
      <div class="trending-rank">#${idx + 1}</div>
      <img src="${item.thumb}" alt="" onerror="this.style.display='none'">
      <div class="trending-info">
        <div class="trending-name">${escapeHtml(item.name)}</div>
        <div class="trending-sym">${escapeHtml(item.symbol)}</div>
      </div>
      <div class="trending-price">
        ${priceData ? '$' + fmtPrice(priceData.usd) : '--'}<br>
        <span class="trending-chg ${chgCls}">${chg !== null ? chgArrow + Math.abs(chg).toFixed(2) + '%' : ''}</span>
      </div>
      <button class="trending-add-btn" ${alreadyTracked ? 'disabled' : ''}>${alreadyTracked ? 'Added' : '+ Add'}</button>
    `;
    const btn = row.querySelector('.trending-add-btn');
    btn.addEventListener('click', () => {
      ensureCryptoTracked(item.id, item.symbol, item.name);
      fetchCrypto().then(buildTape);
      refreshNews();
      btn.textContent = 'Added';
      btn.disabled = true;
    });
    container.appendChild(row);
  });

  trendingLoaded = true;
}

/* ---- Portfolio: shared helpers ---- */
function removePortfolioEntry(id){
  PORTFOLIO = PORTFOLIO.filter(p => p.id !== id);
  savePortfolio();
  renderCryptoPortfolio();
  renderStockPortfolio();
}

function currentPriceFor(entry){
  if(entry.type === 'crypto') return latestCryptoData[entry.key]?.usd;
  return latestStockData[entry.key]?.price;
}

function buildPortfolioCard(entry){
  const price = currentPriceFor(entry);
  const cost = entry.qty * entry.avgPrice;
  const value = price !== undefined ? entry.qty * price : null;
  const pl = value !== null ? value - cost : null;
  const plPct = value !== null && cost > 0 ? (pl / cost) * 100 : null;

  const card = document.createElement('div');
  card.className = 'card pf-card';
  card.style.setProperty('--coin-color', entry.type === 'crypto'
    ? (COINS.find(c => c.id === entry.key)?.color || '#FFB020')
    : (STOCKS.find(s => s.sym === entry.key)?.color || '#FFB020'));
  const plCls = pl === null ? '' : (pl >= 0 ? 'up' : 'down');
  const plSign = pl !== null && pl >= 0 ? '+' : '';

  card.innerHTML = `
    <div class="card-top">
      <div class="coin-id">
        <div class="coin-sym">${entry.sym}</div>
        <div class="coin-name">${entry.name}</div>
      </div>
      <div class="card-top-right">
        <button class="remove-btn" title="Remove holding">×</button>
      </div>
    </div>
    <div class="price">${price !== undefined ? '$' + fmtPrice(price) : '--'}</div>
    <div class="pf-row"><span>Quantity</span><span>${entry.qty}</span></div>
    <div class="pf-row"><span>Avg buy price</span><span>${fmtUsd(entry.avgPrice)}</span></div>
    <div class="pf-row"><span>Cost basis</span><span>${fmtUsd(cost)}</span></div>
    <div class="pf-row"><span>Current value</span><span>${value !== null ? fmtUsd(value) : '--'}</span></div>
    <div class="pf-pl">
      <span class="pf-pl-label">P/L</span>
      <span class="pf-pl-value ${plCls}">${pl !== null ? plSign + fmtUsd(pl) + ' (' + plSign + plPct.toFixed(2) + '%)' : '--'}</span>
    </div>
  `;
  card.querySelector('.remove-btn').addEventListener('click', () => removePortfolioEntry(entry.id));
  return { card, cost, value };
}

function renderCryptoPortfolio(){
  const entries = PORTFOLIO.filter(p => p.type === 'crypto');
  const grid = document.getElementById('cryptoPortfolioGrid');
  const summary = document.getElementById('pfCryptoSummary');
  if(!grid || !summary) return;

  if(entries.length === 0){
    grid.innerHTML = '<div class="empty">No crypto holdings yet — add your first one above.</div>';
    summary.style.display = 'none';
    return;
  }

  summary.style.display = 'grid';
  grid.innerHTML = '';
  let totalValue = 0, totalCost = 0;
  entries.forEach(entry => {
    const { card, cost, value } = buildPortfolioCard(entry);
    totalCost += cost;
    if(value !== null) totalValue += value;
    grid.appendChild(card);
  });

  const totalPl = totalValue - totalCost;
  const totalPlPct = totalCost > 0 ? (totalPl / totalCost) * 100 : 0;
  const plCls = totalPl >= 0 ? 'up' : 'down';
  const sign = totalPl >= 0 ? '+' : '';

  document.getElementById('pfCryptoTotalValue').textContent = fmtUsd(totalValue);
  document.getElementById('pfCryptoTotalCost').textContent = fmtUsd(totalCost);
  const totalPlEl = document.getElementById('pfCryptoTotalPl');
  totalPlEl.textContent = sign + fmtUsd(totalPl);
  totalPlEl.className = 'summary-value ' + plCls;
  const totalPlPctEl = document.getElementById('pfCryptoTotalPlPct');
  totalPlPctEl.textContent = sign + totalPlPct.toFixed(2) + '%';
  totalPlPctEl.className = 'summary-value ' + plCls;
}

function renderStockPortfolio(){
  const entries = PORTFOLIO.filter(p => p.type === 'stock');
  const grid = document.getElementById('stockPortfolioGrid');
  const summary = document.getElementById('pfStockSummary');
  if(!grid || !summary) return;

  if(entries.length === 0){
    grid.innerHTML = '<div class="empty">No stock holdings yet — add your first one above.</div>';
    summary.style.display = 'none';
    return;
  }

  summary.style.display = 'grid';
  grid.innerHTML = '';
  let totalValue = 0, totalCost = 0;
  entries.forEach(entry => {
    const { card, cost, value } = buildPortfolioCard(entry);
    totalCost += cost;
    if(value !== null) totalValue += value;
    grid.appendChild(card);
  });

  const totalPl = totalValue - totalCost;
  const totalPlPct = totalCost > 0 ? (totalPl / totalCost) * 100 : 0;
  const plCls = totalPl >= 0 ? 'up' : 'down';
  const sign = totalPl >= 0 ? '+' : '';

  document.getElementById('pfStockTotalValue').textContent = fmtUsd(totalValue);
  document.getElementById('pfStockTotalCost').textContent = fmtUsd(totalCost);
  const totalPlEl = document.getElementById('pfStockTotalPl');
  totalPlEl.textContent = sign + fmtUsd(totalPl);
  totalPlEl.className = 'summary-value ' + plCls;
  const totalPlPctEl = document.getElementById('pfStockTotalPlPct');
  totalPlPctEl.textContent = sign + totalPlPct.toFixed(2) + '%';
  totalPlPctEl.className = 'summary-value ' + plCls;
}

function renderPortfolio(){
  renderCryptoPortfolio();
  renderStockPortfolio();
}

/* ---- Crypto Portfolio form ---- */
const pfCryptoSymbolInput = document.getElementById('pfCryptoSymbolInput');
const pfCryptoSearchResults = document.getElementById('pfCryptoSearchResults');
const pfCryptoQtyInput = document.getElementById('pfCryptoQtyInput');
const pfCryptoPriceInput = document.getElementById('pfCryptoPriceInput');
const pfCryptoAddBtn = document.getElementById('pfCryptoAddBtn');
const pfCryptoHint = document.getElementById('pfCryptoHint');

if(pfCryptoSymbolInput){
  pfCryptoSymbolInput.addEventListener('input', () => {
    pfPendingCoin = null;
    const q = pfCryptoSymbolInput.value.trim();
    clearTimeout(pfSearchDebounce);
    pfSearchDebounce = setTimeout(() => {
      runCryptoSearch(q, pfCryptoSearchResults, (coin) => {
        pfPendingCoin = coin;
        pfCryptoSymbolInput.value = `${coin.name} (${coin.symbol.toUpperCase()})`;
        closeResults(pfCryptoSearchResults);
      });
    }, 350);
  });
}

if(pfCryptoAddBtn){
  pfCryptoAddBtn.addEventListener('click', async () => {
    const qty = parseFloat(pfCryptoQtyInput.value);
    const avgPrice = parseFloat(pfCryptoPriceInput.value);
    if(!qty || qty <= 0 || !avgPrice || avgPrice <= 0){
      pfCryptoHint.textContent = 'Enter a quantity and average buy price greater than zero.';
      return;
    }
    if(!pfPendingCoin){
      pfCryptoHint.textContent = 'Pick a coin from the dropdown list first.';
      return;
    }

    pfCryptoAddBtn.disabled = true;
    const originalLabel = pfCryptoAddBtn.textContent;
    pfCryptoAddBtn.textContent = 'Adding…';

    try{
      ensureCryptoTracked(pfPendingCoin.id, pfPendingCoin.symbol, pfPendingCoin.name);
      await fetchCrypto();
      PORTFOLIO.push({
        id: 'pf-' + Date.now(),
        type: 'crypto',
        key: pfPendingCoin.id,
        sym: pfPendingCoin.symbol.toUpperCase(),
        name: pfPendingCoin.name,
        qty, avgPrice
      });

      savePortfolio();
      renderCryptoPortfolio();
      buildTape();
      refreshNews();
      pfCryptoSymbolInput.value = '';
      pfCryptoQtyInput.value = '';
      pfCryptoPriceInput.value = '';
      pfPendingCoin = null;
      pfCryptoHint.textContent = 'Holding added.';
    }finally{
      pfCryptoAddBtn.disabled = false;
      pfCryptoAddBtn.textContent = originalLabel;
    }
  });
}

/* ---- Stock Portfolio form ---- */
const pfStockSymbolInput = document.getElementById('pfStockSymbolInput');
const pfStockSearchResults = document.getElementById('pfStockSearchResults');
const pfStockQtyInput = document.getElementById('pfStockQtyInput');
const pfStockPriceInput = document.getElementById('pfStockPriceInput');
const pfStockAddBtn = document.getElementById('pfStockAddBtn');
const pfStockHint = document.getElementById('pfStockHint');

if(pfStockAddBtn){
  pfStockAddBtn.addEventListener('click', async () => {
    const qty = parseFloat(pfStockQtyInput.value);
    const avgPrice = parseFloat(pfStockPriceInput.value);
    if(!qty || qty <= 0 || !avgPrice || avgPrice <= 0){
      pfStockHint.textContent = 'Enter a quantity and average buy price greater than zero.';
      return;
    }
    const sym = pfStockSymbolInput.value.trim().toUpperCase();
    if(!sym){ pfStockHint.textContent = 'Enter a ticker symbol.'; return; }

    pfStockAddBtn.disabled = true;
    const originalLabel = pfStockAddBtn.textContent;
    pfStockAddBtn.textContent = 'Adding…';

    try{
      try{
        await ensureStockTracked(sym);
      }catch(e){
        pfStockHint.textContent = `Couldn't find a ticker matching "${sym}".`;
        return;
      }
      const name = (STOCKS.find(s => s.sym === sym) || {}).name || sym;
      PORTFOLIO.push({
        id: 'pf-' + Date.now(),
        type: 'stock',
        key: sym,
        sym, name, qty, avgPrice
      });

      savePortfolio();
      renderStockPortfolio();
      buildTape();
      refreshNews();
      pfStockSymbolInput.value = '';
      pfStockQtyInput.value = '';
      pfStockPriceInput.value = '';
      pfStockHint.textContent = 'Holding added.';
    }finally{
      pfStockAddBtn.disabled = false;
      pfStockAddBtn.textContent = originalLabel;
    }
  });
}

document.addEventListener('click', (e) => {
  if(!e.target.closest('.search-input-wrap')){
    closeResults(searchResults);
    closeResults(stockSearchResults);
    closeResults(pfCryptoSearchResults);
    closeResults(pfStockSearchResults);
  }
});

/* ---- News ---- */
async function fetchCryptoNewsFor(coin){
  // Check if the current coin is BTC, ETH, or XRP to use the exact Yahoo ticker
  const targetTicker = coin.sym.toUpperCase();
  const useYahooTicker = ['BTC', 'ETH', 'XRP'].includes(targetTicker);
  
  const query = useYahooTicker ? `${targetTicker}-USD` : `${coin.name} crypto`; 
  const target = `${API_BASE}/api/news/search?q=${encodeURIComponent(query)}`;
  
  try{
    const json = await fetchJsonWithTimeout(target, 8000);
    const items = json.news || [];
    return items.slice(0, 4).map(n => ({
      title: n.title,
      url: n.link,
      source: n.publisher || 'Yahoo Finance',
      time: (n.providerPublishTime || 0) * 1000,
      tag: coin.sym
    }));
  }catch(e){
    console.error('Crypto news fetch failed:', coin.sym, e);
    return [];
  }
}


async function fetchCryptoNews(){
  if(COINS.length === 0) return [];
  
  // Running Promise.allSettled guarantees that even if one coin's news 
  // fails, it won't break the news load sequence for the rest of your watchlist.
  const results = await Promise.allSettled(COINS.map(c => fetchCryptoNewsFor(c)));
  
  return results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value)
    .flat();
}

async function fetchStockNewsFor(sym){
  const target = `${API_BASE}/api/news/search?q=${encodeURIComponent(sym)}`;
  try{
    const json = await fetchJsonWithTimeout(target, 8000);
    const items = json.news || [];
    return items.slice(0, 4).map(n => ({
      title: n.title,
      url: n.link,
      source: n.publisher || 'Yahoo Finance',
      time: (n.providerPublishTime || 0) * 1000,
      tag: sym
    }));
  }catch(e){
    console.error('Stock news fetch failed:', sym, e);
    return [];
  }
}

function renderNewsColumn(elId, items){
  const el = document.getElementById(elId);
  if(!el) return;
  if(items.length === 0){
    el.innerHTML = '<div class="news-empty">No recent news found for your tracked assets.</div>';
    return;
  }
  el.innerHTML = items.map(item => `
    <a class="news-item" href="${item.url}" target="_blank" rel="noopener noreferrer">
      <span class="news-tag">${escapeHtml(item.tag)}</span>
      <div class="news-title">${escapeHtml(item.title)}</div>
      <div class="news-meta">${escapeHtml(item.source)} · ${item.time ? timeAgo(item.time) : ''}</div>
    </a>
  `).join('');
}

function dedupeSortAndTrim(items, limit){
  const seen = new Set();
  const cleaned = items.filter(item => {
    if(!item.url || seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });

  const order = [];
  const groups = {};
  cleaned.forEach(item => {
    if(!groups[item.tag]){ groups[item.tag] = []; order.push(item.tag); }
    groups[item.tag].push(item);
  });
  order.forEach(tag => groups[tag].sort((a, b) => b.time - a.time));

  const interleaved = [];
  let i = 0;
  let addedAny = true;
  while(addedAny){
    addedAny = false;
    for(const tag of order){
      if(groups[tag][i]){
        interleaved.push(groups[tag][i]);
        addedAny = true;
      }
    }
    i++;
  }

  return interleaved.slice(0, limit);
}

async function fetchAllStockNews(){
  const results = await Promise.all(STOCKS.map(s => fetchStockNewsFor(s.sym)));
  return results.flat();
}

async function refreshNews(){
  const token = ++newsRefreshToken;
  ['cryptoNewsList', 'stockNewsList'].forEach(id => {
    const el = document.getElementById(id);
    if(el && el.children.length === 0){
      el.innerHTML = '<div class="news-loading">Loading news…</div>';
    }
  });

  // Run crypto and stock news sequentially (not simultaneously) so we don't
  // double up the burst of requests hitting the shared CORS proxies at once.
  const cryptoNews = await fetchCryptoNews();
  if(token !== newsRefreshToken) return;
  renderNewsColumn('cryptoNewsList', dedupeSortAndTrim(cryptoNews, 12));

  const stockNews = await fetchAllStockNews();
  if(token !== newsRefreshToken) return;
  renderNewsColumn('stockNewsList', dedupeSortAndTrim(stockNews, 12));
}

/* ---- News: Google News RSS (US / World) ---- */
const GNEWS_US_URL = `${API_BASE}/api/news/google?edition=us`;
const GNEWS_WORLD_URL = `${API_BASE}/api/news/google?edition=world`;
const GNEWS_INDIA_URL = `${API_BASE}/api/news/google?edition=in`;

let usNewsLoaded = false;
let worldNewsLoaded = false;
let indiaNewsLoaded = false;

function parseGoogleNewsRss(xmlText, tag){
  try{
    const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
    if(doc.querySelector('parsererror')) throw new Error('bad xml');
    return Array.from(doc.querySelectorAll('item')).map(item => {
      const rawTitle = item.querySelector('title')?.textContent || '';
      const url = item.querySelector('link')?.textContent || '';
      const pubDate = item.querySelector('pubDate')?.textContent;
      const sourceEl = item.querySelector('source');
      const source = sourceEl ? sourceEl.textContent : 'Google News';
      // Google News titles are usually "Headline - Source"; strip the
      // trailing source name since we already show it separately.
      let title = rawTitle;
      const suffix = ' - ' + source;
      if(source && title.endsWith(suffix)) title = title.slice(0, -suffix.length);
      const time = pubDate ? Date.parse(pubDate) : 0;
      return { title, url, source, time: isNaN(time) ? 0 : time, tag };
    }).filter(n => n.url && n.title);
  }catch(e){
    console.error('Failed to parse Google News RSS:', tag, e);
    return [];
  }
}

async function fetchGoogleNews(url, tag){
  try{
    const xml = await fetchTextWithTimeout(url, 8000);
    return parseGoogleNewsRss(xml, tag);
  }catch(e){
    console.error('Google News fetch failed:', tag, e);
    return [];
  }
}

async function refreshUsNews(){
  const container = document.getElementById('usNewsList');
  if(!container) return;
  if(!usNewsLoaded) container.innerHTML = '<div class="news-loading">Loading news…</div>';

  const items = await fetchGoogleNews(GNEWS_US_URL, 'US');
  if(items.length === 0){
    if(!usNewsLoaded) container.innerHTML = '<div class="err">News unavailable — try again shortly.</div>';
    return;
  }
  renderNewsColumn('usNewsList', dedupeSortAndTrim(items, 20));
  usNewsLoaded = true;
}

async function refreshWorldNews(){
  const container = document.getElementById('worldNewsList');
  if(!container) return;
  if(!worldNewsLoaded) container.innerHTML = '<div class="news-loading">Loading news…</div>';

  const items = await fetchGoogleNews(GNEWS_WORLD_URL, 'World');
  if(items.length === 0){
    if(!worldNewsLoaded) container.innerHTML = '<div class="err">News unavailable — try again shortly.</div>';
    return;
  }
  renderNewsColumn('worldNewsList', dedupeSortAndTrim(items, 20));
  worldNewsLoaded = true;
}

async function refreshIndiaNews(){
  const container = document.getElementById('indiaNewsList');
  if(!container) return;
  if(!indiaNewsLoaded) container.innerHTML = '<div class="news-loading">Loading news…</div>';

  // We tag these as 'India' so they get labeled cleanly in the UI
  const items = await fetchGoogleNews(GNEWS_INDIA_URL, 'India');
  items.forEach(item => { if(item.source === 'Google News') item.source = 'NDTV'; });

  if(items.length === 0){
    if(!indiaNewsLoaded) container.innerHTML = '<div class="err">News unavailable — try again shortly.</div>';
    return;
  }
  renderNewsColumn('indiaNewsList', dedupeSortAndTrim(items, 20), false);
  indiaNewsLoaded = true;
}


/* ---- Crypto Overview (sortable markets table) ---- */
let marketsData = [];
let marketsLoaded = false;
let marketsSortField = 'market_cap_rank';
let marketsSortDir = 'asc';

async function fetchMarketsOverview(){
  const url = `${API_BASE}/api/crypto/markets`;
  try{
    const data = await fetchJsonWithTimeout(url, 10000);
    return Array.isArray(data) ? data : [];
  }catch(e){
    console.error('Markets overview fetch failed:', e);
    return [];
  }
}

function sortMarkets(){
  const dir = marketsSortDir === 'asc' ? 1 : -1;
  marketsData.sort((a, b) => {
    let av = a[marketsSortField];
    let bv = b[marketsSortField];
    if(marketsSortField === 'name'){
      av = (av || '').toLowerCase();
      bv = (bv || '').toLowerCase();
      if(av < bv) return -1 * dir;
      if(av > bv) return 1 * dir;
      return 0;
    }
    av = av === null || av === undefined ? -Infinity : av;
    bv = bv === null || bv === undefined ? -Infinity : bv;
    return (av - bv) * dir;
  });
}

function renderMarketsTable(){
  const tbody = document.getElementById('marketsTableBody');
  if(!tbody) return;
  if(marketsData.length === 0){
    tbody.innerHTML = '<tr><td colspan="7" class="news-loading">Market data unavailable — try again shortly.</td></tr>';
    return;
  }

  tbody.innerHTML = marketsData.map(coin => {
    const chg = coin.price_change_percentage_24h;
    const chgCls = chg === null || chg === undefined ? '' : (chg >= 0 ? 'up' : 'down');
    const chgArrow = chg === null || chg === undefined ? '' : (chg >= 0 ? '▲ ' : '▼ ');
    const alreadyTracked = COINS.some(c => c.id === coin.id);
    return `
      <tr>
        <td class="mt-rank">${coin.market_cap_rank ?? '--'}</td>
        <td>
          <div class="mt-coin">
            <img src="${coin.image}" alt="" onerror="this.style.display='none'">
            <span class="mt-coin-name">${escapeHtml(coin.name)}</span>
            <span class="mt-coin-sym">${escapeHtml(coin.symbol)}</span>
          </div>
        </td>
        <td>$${fmtPrice(coin.current_price)}</td>
        <td class="mt-chg ${chgCls}">${chg !== null && chg !== undefined ? chgArrow + Math.abs(chg).toFixed(2) + '%' : '--'}</td>
        <td>${coin.market_cap ? fmtCap(coin.market_cap) : '--'}</td>
        <td>${coin.total_volume ? fmtCap(coin.total_volume) : '--'}</td>
        <td><button class="mt-add-btn" data-id="${coin.id}" data-symbol="${coin.symbol}" data-name="${coin.name.replace(/"/g,'&quot;')}" ${alreadyTracked ? 'disabled' : ''}>${alreadyTracked ? 'Added' : '+ Add'}</button></td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('.mt-add-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      ensureCryptoTracked(btn.dataset.id, btn.dataset.symbol, btn.dataset.name);
      fetchCrypto().then(buildTape);
      refreshNews();
      btn.textContent = 'Added';
      btn.disabled = true;
    });
  });
}

async function refreshMarketsOverview(){
  if(!marketsLoaded){
    const tbody = document.getElementById('marketsTableBody');
    if(tbody) tbody.innerHTML = '<tr><td colspan="7" class="news-loading">Loading market data…</td></tr>';
  }
  const data = await fetchMarketsOverview();
  if(data.length > 0){
    marketsData = data;
    marketsLoaded = true;
  }
  sortMarkets();
  renderMarketsTable();
}

document.querySelectorAll('#marketsTable thead th[data-sort]').forEach(th => {
  th.addEventListener('click', () => {
    const field = th.dataset.sort;
    if(marketsSortField === field){
      marketsSortDir = marketsSortDir === 'asc' ? 'desc' : 'asc';
    }else{
      marketsSortField = field;
      marketsSortDir = field === 'market_cap_rank' || field === 'name' ? 'asc' : 'desc';
    }
    document.querySelectorAll('#marketsTable thead th').forEach(h => {
      h.classList.remove('sort-active', 'sort-asc', 'sort-desc');
    });
    th.classList.add('sort-active', marketsSortDir === 'asc' ? 'sort-asc' : 'sort-desc');
    sortMarkets();
    renderMarketsTable();
  });
});

/* ---- Sidenav view switching ---- */
const VIEW_TITLES = {
  'crypto-watchlist': 'Crypto Watchlist',
  'crypto-trending': 'Crypto · Trending',
  'crypto-overview': 'Crypto · Overview',
  'crypto-portfolio': 'Crypto · Portfolio',
  'crypto-news': 'Crypto · News',
  'stocks-watchlist': 'Stocks Watchlist',
  'stocks-portfolio': 'Stocks · Portfolio',
  'stocks-news': 'Stocks · News',
  'news-us': 'News · US',
  'news-world': 'News · World',
  'news-india': 'News . India'
};

function showView(view){
  currentView = view;
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
  document.querySelectorAll('.view-panel').forEach(panel => {
    panel.classList.toggle('active', panel.dataset.viewPanel === view);
  });
  const titleEl = document.getElementById('viewTitle');
  if(titleEl) titleEl.textContent = VIEW_TITLES[view] || '';

  if(view === 'crypto-trending'){
    refreshTrending();
  }else if(view === 'crypto-overview'){
    refreshMarketsOverview();
  }else if(view === 'crypto-news' || view === 'stocks-news'){
    refreshNews();
  }else if(view === 'news-us'){
    refreshUsNews();
  }else if(view === 'news-world'){
    refreshWorldNews();
  }else if(view === 'news-india'){
    refreshIndiaNews();
  }
}

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => showView(btn.dataset.view));
});

/* ---- Init ---- */
async function trackSavedPortfolioAssets(){
  for(const entry of PORTFOLIO){
    if(entry.type === 'crypto'){
      ensureCryptoTracked(entry.key, entry.sym, entry.name);
    }else{
      try{ await ensureStockTracked(entry.key); }catch(e){ /* will show unavailable */ }
    }
  }
}

function refreshCurrentViewNews(){
  // Only fetch the news feed(s) actually visible right now. Pre-loading every
  // feed at once (crypto news, stock news, US, World) all in one burst is what
  // was slamming the shared free CORS proxies and causing failures/stale-cache
  // mixups — this fetches on demand instead, same as Overview/Trending already do.
  if(currentView === 'crypto-news' || currentView === 'stocks-news') refreshNews();
  else if(currentView === 'news-us') refreshUsNews();
  else if(currentView === 'news-world') refreshWorldNews();
  else if(currentView === 'news-india') refreshIndiaNews();
}

const hamburgerBtn = document.getElementById('hamburgerBtn');
const drawerOverlay = document.getElementById('drawerOverlay');
const sidenav = document.querySelector('.sidenav');

function openDrawer(){
  sidenav.classList.add('open');
  drawerOverlay.classList.add('open');
}
function closeDrawer(){
  sidenav.classList.remove('open');
  drawerOverlay.classList.remove('open');
}

hamburgerBtn?.addEventListener('click', openDrawer);
drawerOverlay?.addEventListener('click', closeDrawer);

// Close the drawer after picking a nav item, but only on mobile widths
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    if(window.innerWidth <= 820) closeDrawer();
  });
});

initGrids();
trackSavedPortfolioAssets().then(() => { refreshAll(); });
renderPortfolio();
tickClock();
setInterval(refreshAll, 90000);
setInterval(refreshCurrentViewNews, 5 * 60 * 1000);
setInterval(tickClock, 1000);
