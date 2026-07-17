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

/* ---- Home: Today's Top Movers (whole market, via Yahoo screener) ---- */
async function fetchTopMovers(){
  try{
    const data = await fetchJsonWithTimeout(`${API_BASE}/api/stocks/top-movers`, 10000);
    return data || null;
  }catch(e){
    console.error('Top movers fetch failed:', e);
    return null;
  }
}

function renderTopMovers(data){
  const el = document.getElementById('homeTopMovers');
  const noteEl = document.getElementById('homeTopMoversNote');
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
        <div class="mover-row">
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
  if(!homeLoaded){
    const el = document.getElementById('homeSnapshot');
    if(el) el.innerHTML = '<div class="news-loading">Loading market snapshot…</div>';
  }
  // Reuses the same fetchMarketsSummary() defined in markets.js (backed by
  // /api/markets/summary) — no new backend route, no extra API load.
  const items = await fetchMarketsSummary();
  if(items.length > 0) homeLoaded = true;

  const preferredLabels = ['Nasdaq', 'S&P 500', 'Gold', 'Crude Oil'];
  const picked = preferredLabels
    .map(label => items.find(i => i.label === label))
    .filter(Boolean);

  renderHomeSnapshot(picked.length > 0 ? picked : items.slice(0, 4));
  refreshTopMovers();
}

document.querySelectorAll('.home-card[data-target-view]').forEach(card => {
  card.addEventListener('click', () => showView(card.dataset.targetView));
});

initAgeAllocation();
