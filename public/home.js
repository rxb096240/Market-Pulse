// Home dashboard: snapshot strip (real data, reused from the existing markets-summary
// endpoint), section-jump cards, and the static placeholder widgets (Pulse Index,
// Practice Portfolio Mix, Headlines chart) that aren't wired to real data yet.

let homeLoaded = false;

// Decorative only — we don't have historical intraday series for these tiles,
// so this draws a simple curve in the correct direction rather than fabricate
// a precise history. Swap for real sparkline data once you have it per-asset.
function homeSparkPoints(changePct){
  const up = (changePct ?? 0) >= 0;
  return up
    ? '0,22 10,20 20,23 30,15 40,17 50,9 64,6'
    : '0,10 10,13 20,11 30,18 40,16 50,21 64,23';
}

function renderHomeSnapshot(items){
  const el = document.getElementById('homeSnapshot');
  if(!el) return;
  if(!items || items.length === 0){
    el.innerHTML = '<div class="err">Snapshot unavailable — try again shortly.</div>';
    return;
  }
  el.innerHTML = items.map(item => {
    const cls = item.changePct >= 0 ? 'up' : 'down';
    const arrow = item.changePct >= 0 ? '▲' : '▼';
    const strokeColor = item.changePct >= 0 ? '#00E39A' : '#FF4D5E';
    return `
      <div class="home-snap-card">
        <div class="home-snap-info">
          <div class="home-snap-name">${escapeHtml(item.label)}</div>
          <div class="home-snap-price">${fmtPrice(item.price)}</div>
          <div class="home-snap-chg ${cls}">${arrow} ${Math.abs(item.changePct).toFixed(2)}%</div>
        </div>
        <svg class="home-spark" viewBox="0 0 64 30" preserveAspectRatio="none">
          <polyline points="${homeSparkPoints(item.changePct)}" fill="none" stroke="${strokeColor}" stroke-width="2"/>
        </svg>
      </div>
    `;
  }).join('');
}

/* ---- Top Movers (whole market, via Yahoo screener) ----
   Shared between the compact Home widget and the dedicated Stocks · Top
   Movers panel (topmovers.js) — they just pass different element ids and
   counts. */
async function fetchTopMovers(count){
  try{
    const url = count ? `${API_BASE}/api/stocks/top-movers?count=${count}` : `${API_BASE}/api/stocks/top-movers`;
    const data = await fetchJsonWithTimeout(url, 10000);
    return data || null;
  }catch(e){
    console.error('Top movers fetch failed:', e);
    return null;
  }
}

function renderTopMovers(data, elId = 'homeTopMovers', noteElId = 'homeTopMoversNote'){
  const el = document.getElementById(elId);
  const noteEl = document.getElementById(noteElId);
  if(!el) return;

  const gainers = data?.gainers || [];
  const losers = data?.losers || [];
  if(gainers.length === 0 && losers.length === 0){
    el.innerHTML = '<div class="err">Top movers unavailable — try again shortly.</div>';
    return;
  }

  const col = (label, cls, list) => `
    <div class="mover-col">
      <div class="mover-col-label ${cls}">${cls === 'gainers' ? '▲' : '▼'} ${label}</div>
      ${list.map(m => `
        <div class="mover-row mover-row-clickable" data-symbol="${m.symbol}" data-name="${(m.name || '').replace(/"/g, '&quot;')}">
          <div class="mover-id">
            <span class="mover-sym">${escapeHtml(m.symbol)}</span>
            <span class="mover-name">${escapeHtml(m.name)}</span>
          </div>
          <div class="mover-chg ${cls === 'gainers' ? 'up' : 'down'}">${m.changePct !== null ? (m.changePct >= 0 ? '+' : '') + m.changePct.toFixed(1) + '%' : '--'}</div>
        </div>
      `).join('')}
    </div>
  `;

  el.innerHTML = col('Top Gainers', 'gainers', gainers) + col('Top Losers', 'losers', losers);
  if(noteEl && data?.lastFetched){
  noteEl.textContent = `Last updated ${new Date(data.lastFetched).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`;
}

  // Same detail modal used on the Overview/AI Stocks tables.
  el.querySelectorAll('.mover-row-clickable').forEach(row => {
    row.addEventListener('click', () => openStockDetailModal(row.dataset.symbol, row.dataset.name));
  });
}

/* ---- Home: Age-Based Suggested Allocation (static guideline, not tied to user's actual holdings) ---- */
const AGE_ALLOCATIONS = [
  { label: '20–30', stocks: 70, bonds: 10, cash: 10, crypto: 10 },
  { label: '30–40', stocks: 65, bonds: 20, cash: 10, crypto: 5 },
  { label: '40–50', stocks: 55, bonds: 30, cash: 12, crypto: 3 },
  { label: '50–60', stocks: 47, bonds: 40, cash: 12, crypto: 1 },
  { label: '60–70', stocks: 39, bonds: 50, cash: 11, crypto: 0 },
];
const AGE_ALLOC_COLORS = { stocks: '#00E39A', bonds: '#5B9DF9', cash: '#FFB020', crypto: '#FF6B6B' };

function renderAgeAllocation(index){
  const donutEl = document.getElementById('homeAgeDonut');
  const legendEl = document.getElementById('homeAgeLegend');
  if(!donutEl || !legendEl) return;

  const row = AGE_ALLOCATIONS[index];
  const parts = ['stocks','bonds','cash','crypto'].filter(k => row[k] > 0);

  let cursor = 0;
  const stops = parts.map(k => {
    const start = cursor;
    cursor += row[k];
    return `${AGE_ALLOC_COLORS[k]} ${start}% ${cursor}%`;
  }).join(', ');
  donutEl.style.background = `conic-gradient(${stops})`;

  legendEl.innerHTML = parts.map(k => `
    <div class="home-legend-row">
      <span class="home-swatch" style="background:${AGE_ALLOC_COLORS[k]}"></span>
      <span class="home-lbl2">${k.charAt(0).toUpperCase() + k.slice(1)}</span>
      <span class="home-amt">${row[k]}%</span>
    </div>
  `).join('');
}

function initAgeAllocation(){
  const select = document.getElementById('homeAgeRangeSelect');
  if(!select) return;
  select.addEventListener('change', () => renderAgeAllocation(+select.value));
  renderAgeAllocation(+select.value);
}

async function refreshTopMovers(){
  const data = await fetchTopMovers();
  renderTopMovers(data);
}

async function refreshHomeView(){
  updateHomeModeForAuth();
  if(currentUser){ refreshHomeDashboard(); return; }

  if(!homeLoaded){
    const el = document.getElementById('homeSnapshot');
    if(el) el.innerHTML = '<div class="news-loading">Loading market snapshot…</div>';
  }
  // Reuses the same fetchMarketsSummary() defined in markets.js (backed by
  // /api/markets/summary) — no new backend route, no extra API load.
  const items = await fetchMarketsSummary();
  if(items.length > 0) homeLoaded = true;

  const preferredLabels = ['Nasdaq', 'Dow 30', 'Gold', 'Crude Oil'];
  const picked = preferredLabels
    .map(label => items.find(i => i.label === label))
    .filter(Boolean);

  renderHomeSnapshot(picked.length > 0 ? picked : items.slice(0, 4));
  refreshTopMovers();
}

/* ---- Home: signed-in dashboard (watchlist + practice portfolio + relevant news) ----
   Takes over Home in place of the generic overview above once signed in.
   Built entirely from data the app already loads for the signed-in user
   (COINS/STOCKS *are* their watchlist, practiceHoldings their paper trading
   account) rather than fetching anything new -- refreshed whenever Home is
   shown and every 90s alongside the rest of the app while parked on it. */

function updateHomeModeForAuth(){
  const anon = document.getElementById('homeAnonymous');
  const signedIn = document.getElementById('homeSignedIn');
  if(!anon || !signedIn) return;
  anon.style.display = currentUser ? 'none' : '';
  signedIn.style.display = currentUser ? '' : 'none';
}

function renderHomeDashboardGreeting(){
  const el = document.getElementById('homeGreeting');
  if(!el) return;
  const nickname = (practiceAccount?.nickname || '').trim();
  el.textContent = nickname ? `Welcome back, ${nickname}` : 'Welcome back';
}

// Shows the paper trading (practice_holdings) portfolio, not the real one
// tracked under Stocks/Crypto -> Portfolio -- same reasoning as the Admin
// Portfolio fix: that's a different account entirely, and Home should
// reflect the practice account people actually use day to day.
function renderHomeDashboardPortfolio(){
  const summaryEl = document.getElementById('homeDashSummary');
  const cashRow = document.getElementById('homeDashCashRow');
  const wrapEl = document.getElementById('homeDashHoldingsWrap');
  const bodyEl = document.getElementById('homeDashHoldingsBody');
  const emptyEl = document.getElementById('homeDashHoldingsEmpty');
  if(!summaryEl || !bodyEl) return;

  if(!practiceAccount){
    summaryEl.style.display = 'none';
    if(cashRow) cashRow.style.display = 'none';
    if(wrapEl) wrapEl.style.display = 'none';
    if(emptyEl) emptyEl.style.display = '';
    return;
  }
  if(wrapEl) wrapEl.style.display = practiceHoldings.length > 0 ? '' : 'none';
  if(emptyEl) emptyEl.style.display = practiceHoldings.length > 0 ? 'none' : '';
  summaryEl.style.display = 'grid';
  if(cashRow){ cashRow.style.display = ''; document.getElementById('homeDashCashBalance').textContent = fmtUsd(practiceAccount.cash_balance); }

  let holdingsValue = 0, totalCost = 0;
  const rows = practiceHoldings.map(entry => {
    const price = currentPracticePriceFor(entry);
    const cost = entry.qty * entry.avg_price;
    const value = price !== undefined ? entry.qty * price : null;
    const plPct = value !== null && cost > 0 ? ((value - cost) / cost) * 100 : null;
    totalCost += cost;
    if(value !== null) holdingsValue += value;
    return { sym: entry.sym, qty: entry.qty, value, plPct };
  }).sort((a, b) => (b.value || 0) - (a.value || 0)).slice(0, 6);

  bodyEl.innerHTML = rows.map(r => `
    <tr>
      <td>${escapeHtml(r.sym)}</td>
      <td class="num">${r.qty < 1 ? r.qty.toFixed(4) : parseFloat(r.qty.toFixed(2))}</td>
      <td class="num">${r.value !== null ? fmtUsd(r.value) : '--'}</td>
      <td class="num${r.plPct !== null ? (r.plPct >= 0 ? ' up' : ' down') : ''}">${r.plPct !== null ? (r.plPct >= 0 ? '+' : '') + r.plPct.toFixed(1) + '%' : '--'}</td>
    </tr>
  `).join('');

  // Total value/P&L are against the full $10,000 starting balance (cash +
  // holdings), same definition the leaderboard uses -- not just the
  // holdings' own cost basis, so it reflects the whole practice account.
  const totalValue = practiceAccount.cash_balance + holdingsValue;
  const totalPl = totalValue - 10000;
  const totalPlPct = (totalPl / 10000) * 100;
  const plCls = totalPl >= 0 ? 'up' : 'down';
  const sign = totalPl >= 0 ? '+' : '';
  document.getElementById('homeDashTotalValue').textContent = fmtUsd(totalValue);
  document.getElementById('homeDashTotalCost').textContent = fmtUsd(totalCost);
  const plEl = document.getElementById('homeDashTotalPl');
  plEl.textContent = sign + fmtUsd(totalPl);
  plEl.className = 'summary-value ' + plCls;
  const plPctEl = document.getElementById('homeDashTotalPlPct');
  plPctEl.textContent = sign + totalPlPct.toFixed(2) + '%';
  plPctEl.className = 'summary-value ' + plCls;
}

function renderHomeDashboardWatchlist(){
  const grid = document.getElementById('homeDashWatchlistGrid');
  const emptyEl = document.getElementById('homeDashWatchlistEmpty');
  if(!grid) return;

  const cryptoItems = COINS.map(c => ({ key: c.id, sym: c.sym, name: c.name, color: c.color, type: 'crypto' }));
  const stockItems = STOCKS.map(s => ({ key: s.sym, sym: s.sym, name: s.name, color: s.color, type: 'stock' }));

  // Interleaved instead of concat+slice -- a flat slice(0, 6) let a long
  // crypto watchlist (listed first) crowd stocks out of the preview
  // entirely once crypto alone filled the 6-item cap.
  const items = [];
  for (let i = 0; items.length < 6 && (i < cryptoItems.length || i < stockItems.length); i++) {
    if (cryptoItems[i]) items.push(cryptoItems[i]);
    if (items.length < 6 && stockItems[i]) items.push(stockItems[i]);
  }

  if(items.length === 0){
    grid.innerHTML = '';
    if(emptyEl) emptyEl.style.display = '';
    return;
  }
  if(emptyEl) emptyEl.style.display = 'none';

  grid.innerHTML = items.map(item => {
    const d = item.type === 'crypto' ? latestCryptoData[item.key] : latestStockData[item.key];
    const price = item.type === 'crypto' ? d?.usd : d?.price;
    const changePct = item.type === 'crypto' ? d?.usd_24h_change : d?.changePct;
    const hasChange = changePct !== undefined && changePct !== null;
    const cls = hasChange && changePct >= 0 ? 'up' : 'down';
    const arrow = hasChange && changePct >= 0 ? '▲' : '▼';
    return `
      <div class="card" style="--coin-color:${item.color};">
        <div class="card-top">
          <div class="coin-id"><div class="coin-sym">${escapeHtml(item.sym)}</div><div class="coin-name">${escapeHtml(item.name)}</div></div>
        </div>
        <div class="price">${price !== undefined ? '$' + fmtPrice(price) : '--'}</div>
        <div class="meta-row"><span class="chg ${cls}">${hasChange ? arrow + ' ' + Math.abs(changePct).toFixed(2) + '%' : '--'}</span></div>
      </div>
    `;
  }).join('');
}

async function refreshHomeDashboardNews(){
  const el = document.getElementById('homeDashNewsList');
  if(!el) return;
  if(COINS.length === 0 && STOCKS.length === 0){
    el.innerHTML = '<div class="news-empty">Add something to your watchlist to see relevant news here.</div>';
    return;
  }
  const [cryptoNews, stockNews] = await Promise.all([fetchCryptoNews(), fetchAllStockNews()]);
  renderNewsColumn('homeDashNewsList', dedupeSortAndTrim([...cryptoNews, ...stockNews], 6));
}

function refreshHomeDashboard(){
  if(!currentUser) return;
  // Each section wrapped separately so one throwing (a bad price, a null
  // somewhere) can't silently take down the other two -- they're otherwise
  // independent and have no reason to depend on each other succeeding.
  try{ renderHomeDashboardGreeting(); }catch(e){ console.error('Home dashboard greeting failed:', e); }
  try{ renderHomeDashboardPortfolio(); }catch(e){ console.error('Home dashboard portfolio failed:', e); }
  try{ renderHomeDashboardWatchlist(); }catch(e){ console.error('Home dashboard watchlist failed:', e); }
  refreshHomeDashboardNews().catch(e => console.error('Home dashboard news failed:', e));
}

document.querySelectorAll('.home-panel-link[data-target-view]').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    showView(link.dataset.targetView);
  });
});

document.querySelectorAll('.home-card[data-target-view]').forEach(card => {
  card.addEventListener('click', () => showView(card.dataset.targetView));
});

initAgeAllocation();
