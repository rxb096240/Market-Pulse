// Sortable market tables: Stocks Overview (top stocks) and Crypto Overview (top coins), plus the markets summary banner.
// Handles fetching, sorting by column, rendering rows, and the top-banner show/hide logic.

//Top 100 Stocks with high market cap
let stocksMarketsData = [];
let stocksMarketsLoaded = false;
let stocksMarketsSortField = 'symbol';
let stocksMarketsSortDir = 'asc';
let stocksMarket = 'us';

const STOCKS_MARKET_ENDPOINT = { us: '/api/stocks/markets', in: '/api/stocks/markets/in' };
const STOCKS_MARKET_CURRENCY = { us: '$', in: '₹' };

// Yahoo's NSE/BSE symbols carry an exchange suffix (.NS/.BO) that's only
// meaningful to the API, not to a reader — strip it for display.
function displaySymbol(sym){
  return sym.replace(/\.(NS|BO)$/, '');
}

async function fetchStocksOverview(){
  try{
    const data = await fetchJsonWithTimeout(`${API_BASE}${STOCKS_MARKET_ENDPOINT[stocksMarket]}`, 12000);
    return Array.isArray(data) ? data : [];
  }catch(e){
    console.error('Stocks overview fetch failed:', e);
    return [];
  }
}

function sortStocksMarkets(){
  const dir = stocksMarketsSortDir === 'asc' ? 1 : -1;
  stocksMarketsData.sort((a, b) => {
    let av = a[stocksMarketsSortField];
    let bv = b[stocksMarketsSortField];
    if(stocksMarketsSortField === 'symbol' || stocksMarketsSortField === 'name'){
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

function renderStocksMarketsTable(){
  const tbody = document.getElementById('stocksMarketsTableBody');
  if(!tbody) return;
  if(stocksMarketsData.length === 0){
    tbody.innerHTML = '<tr><td colspan="7" class="news-loading">Market data unavailable — try again shortly.</td></tr>';
    return;
  }

  const cur = STOCKS_MARKET_CURRENCY[stocksMarket];
  tbody.innerHTML = stocksMarketsData.map(s => {
    const chg = s.changePct;
    const chgCls = chg === null || chg === undefined ? '' : (chg >= 0 ? 'up' : 'down');
    const chgArrow = chg === null || chg === undefined ? '' : (chg >= 0 ? '▲ ' : '▼ ');
    const alreadyTracked = STOCKS.some(x => x.sym === s.symbol);
    const symCell = stocksMarket === 'us'
      ? `<button class="mt-ticker-link" data-symbol="${s.symbol}" data-name="${(s.name||'').replace(/"/g,'&quot;')}">${escapeHtml(s.symbol)}</button>`
      : escapeHtml(displaySymbol(s.symbol));
    return `
      <tr>
        <td>${symCell}</td>
        <td>${escapeHtml(s.name)}</td>
        <td>${cur}${fmtPrice(s.price)}</td>
        <td class="mt-chg ${chgCls}">${chg !== null && chg !== undefined ? chgArrow + Math.abs(chg).toFixed(2) + '%' : '--'}</td>
        <td>${s.dayHigh && s.dayLow ? `${cur}${fmtPrice(s.dayLow)} – ${cur}${fmtPrice(s.dayHigh)}` : '--'}</td>
        <td><button class="mt-add-btn" data-symbol="${s.symbol}" data-name="${(s.name||'').replace(/"/g,'&quot;')}" ${alreadyTracked ? 'disabled' : ''}>${alreadyTracked ? 'Added' : '+ Add'}</button></td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('.mt-ticker-link').forEach(btn => {
    btn.addEventListener('click', () => openStockDetailModal(btn.dataset.symbol, btn.dataset.name));
  });

  tbody.querySelectorAll('.mt-add-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      try{
        await ensureStockTracked(btn.dataset.symbol);
        buildTape();
        refreshNews();
        btn.textContent = 'Added';
        btn.disabled = true;
      }catch(e){ /* leave button as-is on failure */ }
    });
  });
}

async function refreshStocksMarketsOverview(){
  if(!stocksMarketsLoaded){
    const tbody = document.getElementById('stocksMarketsTableBody');
    if(tbody) tbody.innerHTML = '<tr><td colspan="7" class="news-loading">Loading market data…</td></tr>';
  }
  const data = await fetchStocksOverview();
  if(data.length > 0){
    stocksMarketsData = data;
    stocksMarketsLoaded = true;
  }
  sortStocksMarkets();
  renderStocksMarketsTable();
}

const stocksMarketSelect = document.getElementById('stocksMarketSelect');
stocksMarketSelect?.addEventListener('change', () => {
  stocksMarket = stocksMarketSelect.value;
  stocksMarketsData = [];
  stocksMarketsLoaded = false;
  refreshStocksMarketsOverview();
  refreshMarketsSummary();
});


document.querySelectorAll('#stocksMarketsTable thead th[data-sort]').forEach(th => {
  th.addEventListener('click', () => {
    const field = th.dataset.sort;
    if(stocksMarketsSortField === field){
      stocksMarketsSortDir = stocksMarketsSortDir === 'asc' ? 'desc' : 'asc';
    }else{
      stocksMarketsSortField = field;
      stocksMarketsSortDir = field === 'symbol' || field === 'name' ? 'asc' : 'desc';
    }
    document.querySelectorAll('#stocksMarketsTable thead th').forEach(h => {
      h.classList.remove('sort-active', 'sort-asc', 'sort-desc');
    });
    th.classList.add('sort-active', stocksMarketsSortDir === 'asc' ? 'sort-asc' : 'sort-desc');
    sortStocksMarkets();
    renderStocksMarketsTable();
  });
});

async function fetchMarketsSummary(){
  try{
    const data = await fetchJsonWithTimeout(`${API_BASE}/api/markets/summary?market=${stocksMarket}`, 10000);
    return Array.isArray(data) ? data : [];
  }catch(e){
    console.error('Markets summary fetch failed:', e);
    return [];
  }
}

async function refreshMarketsSummary(){
  const el = document.getElementById('marketsSummary');
  if(!el) return;
  const items = await fetchMarketsSummary();
  if(items.length === 0) return;

  el.innerHTML = items.map(item => {
    const cls = item.changePct >= 0 ? 'up' : 'down';
    const arrow = item.changePct >= 0 ? '+' : '';
    return `
      <div class="ms-item">
        <div class="ms-label">${escapeHtml(item.label)}</div>
        <div class="ms-price">${fmtPrice(item.price)}</div>
        <div class="ms-chg ${cls}">${arrow}${item.change.toFixed(2)} ${arrow}${item.changePct.toFixed(2)}%</div>
      </div>
    `;
  }).join('');
}

function updateTopBannerVisibility(view){
  const summaryWrap = document.getElementById('marketsSummaryWrap');
  const tapeWrap = document.querySelector('.tape-wrap');
  if(!summaryWrap || !tapeWrap) return;

  if(view === 'stocks-overview'){
    summaryWrap.style.display = 'block';
    tapeWrap.style.display = 'none';
    refreshMarketsSummary();
  }else{
    summaryWrap.style.display = 'none';
    tapeWrap.style.display = 'block';
  }
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

/* ---- Stocks: AI Stocks (sortable markets table, separate curated list) ---- */
let aiStocksMarketsData = [];
let aiStocksMarketsLoaded = false;
let aiStocksMarketsSortField = 'symbol';
let aiStocksMarketsSortDir = 'asc';

async function fetchAiStocksOverview(){
  try{
    const data = await fetchJsonWithTimeout(`${API_BASE}/api/stocks/markets/ai`, 12000);
    return Array.isArray(data) ? data : [];
  }catch(e){
    console.error('AI stocks overview fetch failed:', e);
    return [];
  }
}

function sortAiStocksMarkets(){
  const dir = aiStocksMarketsSortDir === 'asc' ? 1 : -1;
  aiStocksMarketsData.sort((a, b) => {
    let av = a[aiStocksMarketsSortField];
    let bv = b[aiStocksMarketsSortField];
    if(aiStocksMarketsSortField === 'symbol' || aiStocksMarketsSortField === 'name'){
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

function renderAiStocksMarketsTable(){
  const tbody = document.getElementById('aiStocksMarketsTableBody');
  if(!tbody) return;
  if(aiStocksMarketsData.length === 0){
    tbody.innerHTML = '<tr><td colspan="7" class="news-loading">Market data unavailable — try again shortly.</td></tr>';
    return;
  }

  tbody.innerHTML = aiStocksMarketsData.map(s => {
    const chg = s.changePct;
    const chgCls = chg === null || chg === undefined ? '' : (chg >= 0 ? 'up' : 'down');
    const chgArrow = chg === null || chg === undefined ? '' : (chg >= 0 ? '▲ ' : '▼ ');
    const alreadyTracked = STOCKS.some(x => x.sym === s.symbol);
    return `
      <tr>
        <td><button class="mt-ticker-link" data-symbol="${s.symbol}" data-name="${(s.name||'').replace(/"/g,'&quot;')}">${escapeHtml(s.symbol)}</button></td>
        <td>${escapeHtml(s.name)}</td>
        <td>$${fmtPrice(s.price)}</td>
        <td class="mt-chg ${chgCls}">${chg !== null && chg !== undefined ? chgArrow + Math.abs(chg).toFixed(2) + '%' : '--'}</td>
       <td>${s.dayHigh && s.dayLow ? `$${fmtPrice(s.dayLow)} – $${fmtPrice(s.dayHigh)}` : '--'}</td>
        <td><button class="mt-add-btn" data-symbol="${s.symbol}" data-name="${(s.name||'').replace(/"/g,'&quot;')}" ${alreadyTracked ? 'disabled' : ''}>${alreadyTracked ? 'Added' : '+ Add'}</button></td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('.mt-ticker-link').forEach(btn => {
    btn.addEventListener('click', () => openStockDetailModal(btn.dataset.symbol, btn.dataset.name));
  });

  tbody.querySelectorAll('.mt-add-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      try{
        await ensureStockTracked(btn.dataset.symbol);
        buildTape();
        refreshNews();
        btn.textContent = 'Added';
        btn.disabled = true;
      }catch(e){ /* leave button as-is on failure */ }
    });
  });
}

async function refreshAiStocksOverview(){
  if(!aiStocksMarketsLoaded){
    const tbody = document.getElementById('aiStocksMarketsTableBody');
    if(tbody) tbody.innerHTML = '<tr><td colspan="7" class="news-loading">Loading market data…</td></tr>';
  }
  const data = await fetchAiStocksOverview();
  if(data.length > 0){
    aiStocksMarketsData = data;
    aiStocksMarketsLoaded = true;
  }
  sortAiStocksMarkets();
  renderAiStocksMarketsTable();
}

document.querySelectorAll('#aiStocksMarketsTable thead th[data-sort]').forEach(th => {
  th.addEventListener('click', () => {
    const field = th.dataset.sort;
    if(aiStocksMarketsSortField === field){
      aiStocksMarketsSortDir = aiStocksMarketsSortDir === 'asc' ? 'desc' : 'asc';
    }else{
      aiStocksMarketsSortField = field;
      aiStocksMarketsSortDir = field === 'symbol' || field === 'name' ? 'asc' : 'desc';
    }
    document.querySelectorAll('#aiStocksMarketsTable thead th').forEach(h => {
      h.classList.remove('sort-active', 'sort-asc', 'sort-desc');
    });
    th.classList.add('sort-active', aiStocksMarketsSortDir === 'asc' ? 'sort-asc' : 'sort-desc');
    sortAiStocksMarkets();
    renderAiStocksMarketsTable();
  });
});

/* ---- Stock ticker detail modal ---- */
const stockDetailModalBackdrop = document.getElementById('stockDetailModalBackdrop');
const stockDetailModalClose = document.getElementById('stockDetailModalClose');
const stockDetailTitle = document.getElementById('stockDetailTitle');
const stockDetailMeta = document.getElementById('stockDetailMeta');
const stockDetailBody = document.getElementById('stockDetailBody');
let stockDetailToken = 0;

function fmtStat(v, format){
  if(v === null || v === undefined || (typeof v === 'number' && isNaN(v))) return '--';
  return format ? format(v) : v;
}

function closeStockDetailModal(){ stockDetailModalBackdrop.classList.remove('open'); }

async function openStockDetailModal(symbol, name){
  if(!stockDetailModalBackdrop) return;
  const myToken = ++stockDetailToken;
  stockDetailTitle.textContent = symbol;
  stockDetailMeta.textContent = name || '';
  stockDetailBody.innerHTML = '<div class="news-loading">Loading…</div>';
  stockDetailModalBackdrop.classList.add('open');

  let d;
  try{
    d = await fetchJsonWithTimeout(`${API_BASE}/api/stocks/detail/${encodeURIComponent(symbol)}`, 10000);
  }catch(e){
    if(myToken !== stockDetailToken) return;
    stockDetailBody.innerHTML = '<div class="news-loading">Couldn\'t load stock details — try again shortly.</div>';
    return;
  }
  if(myToken !== stockDetailToken) return;

  const stats = [
    ['Previous Close', fmtStat(d.previousClose, v => '$'+fmtPrice(v))],
    ['Open', fmtStat(d.open, v => '$'+fmtPrice(v))],
    ['Bid', fmtStat(d.bid)],
    ['Ask', fmtStat(d.ask)],
    ['Day\'s Range', d.dayLow && d.dayHigh ? `$${fmtPrice(d.dayLow)} – $${fmtPrice(d.dayHigh)}` : '--'],
    ['52 Week Range', d.week52Low && d.week52High ? `$${fmtPrice(d.week52Low)} – $${fmtPrice(d.week52High)}` : '--'],
    ['Volume', fmtStat(d.volume, v => v.toLocaleString('en-US'))],
    ['Avg. Volume', fmtStat(d.avgVolume, v => Math.round(v).toLocaleString('en-US'))],
    ['Market Cap (intraday)', fmtStat(d.marketCap, fmtCap)],
    ['Beta (5Y Monthly)', fmtStat(d.beta, v => v.toFixed(2))],
    ['PE Ratio (TTM)', fmtStat(d.peRatio, v => v.toFixed(2))],
    ['EPS (TTM)', fmtStat(d.eps, v => v.toFixed(2))],
    ['Earnings Date (est.)', fmtStat(d.earningsDate)],
    ['Forward Dividend & Yield', fmtStat(d.dividendYield, v => v.toFixed(2)+'%')],
    ['Ex-Dividend Date', fmtStat(d.exDividendDate)],
    ['1y Target Est', fmtStat(d.targetEst, v => '$'+fmtPrice(v))]
  ];

  stockDetailBody.innerHTML = `
    <div class="stock-detail-grid">
      ${stats.map(([label, value]) => `
        <div class="stock-detail-item">
          <span class="stock-detail-label">${escapeHtml(label)}</span>
          <span class="stock-detail-value">${escapeHtml(String(value))}</span>
        </div>
      `).join('')}
    </div>
  `;
}

stockDetailModalClose?.addEventListener('click', closeStockDetailModal);
stockDetailModalBackdrop?.addEventListener('click', (e) => {
  if(e.target === stockDetailModalBackdrop) closeStockDetailModal();
});
