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
        <td>${escapeHtml(s.symbol)}</td>
        <td>${escapeHtml(s.name)}</td>
        <td>$${fmtPrice(s.price)}</td>
        <td class="mt-chg ${chgCls}">${chg !== null && chg !== undefined ? chgArrow + Math.abs(chg).toFixed(2) + '%' : '--'}</td>
        <td>${s.volume ? fmtCap(s.volume) : '--'}</td>
        <td><button class="mt-add-btn" data-symbol="${s.symbol}" data-name="${(s.name||'').replace(/"/g,'&quot;')}" ${alreadyTracked ? 'disabled' : ''}>${alreadyTracked ? 'Added' : '+ Add'}</button></td>
      </tr>
    `;
  }).join('');

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
