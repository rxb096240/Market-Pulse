
async function refreshAdminReports(){
  const panel = document.querySelector('[data-view-panel="admin-reports"]');
  if(!panel) return;

  const token = await getAccessToken();
  const res = await fetch(`${API_BASE}/api/admin/stats`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if(res.status === 403){
    panel.innerHTML = '<div class="empty">Not authorized.</div>';
    return;
  }
  if(!res.ok){
    document.getElementById('adminCitiesTableBody').innerHTML =
      '<tr><td colspan="3" class="err">Failed to load stats.</td></tr>';
    return;
  }

  const stats = await res.json();
  renderAdminStats(stats);
}

async function refreshAdminUsers(){
  const body = document.getElementById('adminUsersTableBody');
  if(!body) return;

  const token = await getAccessToken();
  const res = await fetch(`${API_BASE}/api/admin/users`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if(res.status === 403){
    body.innerHTML = '<tr><td colspan="3" class="empty">Not authorized.</td></tr>';
    return;
  }
  if(!res.ok){
    body.innerHTML = '<tr><td colspan="3" class="err">Failed to load users.</td></tr>';
    return;
  }

  const users = await res.json();
  body.innerHTML = users.length
    ? users.map(u => `<tr><td>${escapeHtml(u.email || '—')}</td><td>${u.createdAt ? timeAgo(new Date(u.createdAt).getTime()) : '—'}</td><td>${u.lastSignInAt ? timeAgo(new Date(u.lastSignInAt).getTime()) : 'Never'}</td></tr>`).join('')
    : '<tr><td colspan="3" class="empty">No users yet.</td></tr>';
}

async function refreshAdminPortfolio(){
  const select = document.getElementById('adminPfUserSelect');
  if(!select) return;

  const token = await getAccessToken();
  const res = await fetch(`${API_BASE}/api/admin/users`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if(!res.ok) return;

  const users = await res.json();
  const selected = select.value;
  select.innerHTML = '<option value="">Choose a user…</option>' +
    users.map(u => `<option value="${u.id}">${escapeHtml(u.email || u.id)}</option>`).join('');
  select.value = selected;
  if(!select.value) document.getElementById('adminPfBody').style.display = 'none';
}

// Same live-price lookup as a user's own portfolio (portfolio.js), but kept
// local rather than reusing the shared `portfolioPrices` global — this can
// be viewing a different user's holdings than whatever's cached there.
async function fetchAdminPfPrices(entries){
  const stockSyms = [...new Set(entries.filter(e => e.type === 'stock').map(e => e.key))];
  const cryptoIds = [...new Set(entries.filter(e => e.type === 'crypto').map(e => e.key))];

  const [stockResults, cryptoData] = await Promise.all([
    Promise.allSettled(stockSyms.map(sym => fetchOneStock(sym).then(d => [sym, d.price]))),
    cryptoIds.length > 0
      ? fetchJsonWithTimeout(`${API_BASE}/api/crypto/price?ids=${encodeURIComponent(cryptoIds.join(','))}`, 8000).catch(() => ({}))
      : Promise.resolve({})
  ]);

  const stockPrices = {};
  stockResults.forEach(r => { if(r.status === 'fulfilled'){ const [sym, price] = r.value; stockPrices[sym] = price; } });

  const cryptoPrices = {};
  cryptoIds.forEach(id => { if(cryptoData[id]?.usd !== undefined) cryptoPrices[id] = cryptoData[id].usd; });

  return { stock: stockPrices, crypto: cryptoPrices };
}

// Read-only holding card — same look as a user's own portfolio card
// (portfolio.js's buildPortfolioCard) but with no edit/remove controls,
// since this is the admin viewing someone else's holdings.
function buildAdminPfCard(entry, prices){
  const price = entry.type === 'crypto' ? prices.crypto[entry.key] : prices.stock[entry.key];
  const cost = entry.qty * entry.avgPrice;
  const value = price !== undefined ? entry.qty * price : null;
  const pl = value !== null ? value - cost : null;
  const plPct = value !== null && cost > 0 ? (pl / cost) * 100 : null;
  const plCls = pl === null ? '' : (pl >= 0 ? 'up' : 'down');
  const plSign = pl !== null && pl >= 0 ? '+' : '';

  const card = document.createElement('div');
  card.className = 'card pf-card';
  card.innerHTML = `
    <div class="card-top">
      <div class="coin-id">
        <div class="coin-sym">${escapeHtml(entry.sym)}</div>
        <div class="coin-name">${escapeHtml(entry.name)}</div>
      </div>
    </div>
    <div class="pf-view">
      <div class="price">${price !== undefined ? '$' + fmtPrice(price) : '--'}</div>
      <div class="pf-row"><span>Quantity</span><span>${entry.type === 'crypto' ? parseFloat(Number(entry.qty).toFixed(2)) : Number(entry.qty).toFixed(4)}</span></div>
      <div class="pf-row"><span>Avg buy price</span><span>$${fmtPrice(entry.avgPrice)}</span></div>
      <div class="pf-row"><span>Cost basis</span><span>${fmtUsd(cost)}</span></div>
      <div class="pf-row"><span>Current value</span><span>${value !== null ? fmtUsd(value) : '--'}</span></div>
      <div class="pf-pl">
        <span class="pf-pl-label">P/L</span>
        <span class="pf-pl-value ${plCls}">${pl !== null ? plSign + fmtUsd(pl) + ' (' + plSign + plPct.toFixed(2) + '%)' : '--'}</span>
      </div>
    </div>
  `;
  return { card, cost, value };
}

function renderAdminPfGroup(entries, prices, ids, emptyLabel){
  const grid = document.getElementById(ids.grid);
  const summary = document.getElementById(ids.summary);

  if(entries.length === 0){
    grid.innerHTML = `<div class="empty">${emptyLabel}</div>`;
    summary.style.display = 'none';
    return;
  }

  summary.style.display = 'grid';
  grid.innerHTML = '';
  let totalValue = 0, totalCost = 0;
  entries.forEach(entry => {
    const { card, cost, value } = buildAdminPfCard(entry, prices);
    totalCost += cost;
    if(value !== null) totalValue += value;
    grid.appendChild(card);
  });

  const totalPl = totalValue - totalCost;
  const totalPlPct = totalCost > 0 ? (totalPl / totalCost) * 100 : 0;
  const plCls = totalPl >= 0 ? 'up' : 'down';
  const sign = totalPl >= 0 ? '+' : '';

  document.getElementById(ids.totalValue).textContent = fmtUsd(totalValue);
  document.getElementById(ids.totalCost).textContent = fmtUsd(totalCost);
  const plEl = document.getElementById(ids.totalPl);
  plEl.textContent = sign + fmtUsd(totalPl);
  plEl.className = 'summary-value ' + plCls;
  const plPctEl = document.getElementById(ids.totalPlPct);
  plPctEl.textContent = sign + totalPlPct.toFixed(2) + '%';
  plPctEl.className = 'summary-value ' + plCls;
}

async function loadAdminUserPortfolio(userId){
  const body = document.getElementById('adminPfBody');
  if(!userId){ body.style.display = 'none'; return; }

  body.style.display = '';
  const stockGrid = document.getElementById('adminPfStockGrid');
  const cryptoGrid = document.getElementById('adminPfCryptoGrid');
  stockGrid.innerHTML = '<div class="news-loading">Loading…</div>';
  cryptoGrid.innerHTML = '<div class="news-loading">Loading…</div>';

  const token = await getAccessToken();
  const res = await fetch(`${API_BASE}/api/admin/user-portfolio?userId=${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if(!res.ok){
    stockGrid.innerHTML = '<div class="err">Failed to load portfolio.</div>';
    cryptoGrid.innerHTML = '';
    return;
  }

  const entries = await res.json();
  const prices = await fetchAdminPfPrices(entries);

  renderAdminPfGroup(entries.filter(e => e.type === 'stock'), prices, {
    grid: 'adminPfStockGrid', summary: 'adminPfStockSummary',
    totalValue: 'adminPfStockTotalValue', totalCost: 'adminPfStockTotalCost',
    totalPl: 'adminPfStockTotalPl', totalPlPct: 'adminPfStockTotalPlPct'
  }, 'No stock holdings for this user.');

  renderAdminPfGroup(entries.filter(e => e.type === 'crypto'), prices, {
    grid: 'adminPfCryptoGrid', summary: 'adminPfCryptoSummary',
    totalValue: 'adminPfCryptoTotalValue', totalCost: 'adminPfCryptoTotalCost',
    totalPl: 'adminPfCryptoTotalPl', totalPlPct: 'adminPfCryptoTotalPlPct'
  }, 'No crypto holdings for this user.');
}

document.getElementById('adminPfUserSelect')?.addEventListener('change', (e) => {
  loadAdminUserPortfolio(e.target.value);
});

document.querySelectorAll('.admin-pf-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.admin-pf-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const target = btn.dataset.adminPfTab;
    document.querySelectorAll('.admin-pf-panel').forEach(p => p.classList.toggle('active', p.dataset.adminPfPanel === target));
  });
});

function renderAdminStats(s){
  document.getElementById('adminSummaryBar').style.display = '';
  document.getElementById('adminTotalHits').textContent = s.totalHits;
  document.getElementById('adminUniqueUsers').textContent = s.uniqueUsers;
  document.getElementById('adminCities').textContent = s.citiesReached;
  document.getElementById('adminStates').textContent = s.statesReached;
  document.getElementById('adminCountries').textContent = s.countriesReached;
  document.getElementById('adminTopView').textContent = s.topView ? s.topView.section : '—';

  const citiesBody = document.getElementById('adminCitiesTableBody');
  citiesBody.innerHTML = s.topCities.length
    ? s.topCities.map(c => `<tr><td>${escapeHtml(c.city)}</td><td>${escapeHtml(c.country || '')}</td><td>${c.hits}</td></tr>`).join('')
    : '<tr><td colspan="3" class="empty">No city data yet.</td></tr>';

  const recentBody = document.getElementById('adminRecentTableBody');
  recentBody.innerHTML = s.recent.length
    ? s.recent.map(r => `<tr><td>${timeAgo(new Date(r.time).getTime())}</td><td>${escapeHtml(r.city || '—')}</td><td>${escapeHtml(r.section)}</td><td>${r.signedIn ? 'Yes' : 'Guest'}</td><td>${escapeHtml(r.email || '—')}</td></tr>`).join('')
    : '<tr><td colspan="5" class="empty">No activity yet.</td></tr>';
}
