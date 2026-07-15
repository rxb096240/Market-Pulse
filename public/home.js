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

async function refreshHomeView(){
  if(!homeLoaded){
    const el = document.getElementById('homeSnapshot');
    if(el) el.innerHTML = '<div class="news-loading">Loading market snapshot…</div>';
  }
  // Reuses the same fetchMarketsSummary() defined in markets.js (backed by
  // /api/markets/summary) — no new backend route, no extra API load.
  const items = await fetchMarketsSummary();
  console.log(items);
  if(items.length > 0) homeLoaded = true;

  const preferredLabels = ['S&P 500', 'Dow', 'Nasdaq', 'Russell 2000', 'VIX', 'Gold', 'Crude Oil'];
  const picked = preferredLabels
    .map(label => items.find(i => i.label === label))
    .filter(Boolean);

  renderHomeSnapshot(picked.length > 0 ? picked : items.slice(0, 4));
}

document.querySelectorAll('.home-card[data-target-view]').forEach(card => {
  card.addEventListener('click', () => showView(card.dataset.targetView));
});
