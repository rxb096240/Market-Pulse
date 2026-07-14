// Real portfolio holdings: Supabase persistence plus the crypto/stock portfolio forms and P/L cards.
// Renders cost basis, current value, and gain/loss for everything the user has manually added.

async function loadUserPortfolio(){
  if(!currentUser) return;
  const { data, error } = await supabaseClient
    .from('portfolio_holdings')
    .select('*')
    .eq('user_id', currentUser.id);

  if(error){ console.error('Failed to load portfolio:', error); return; }
  if(!data) return;

  PORTFOLIO = data.map(row => ({
    id: row.id,
    type: row.asset_type,
    key: row.asset_key,
    sym: row.sym,
    name: row.name,
    qty: row.qty,
    avgPrice: row.avg_price
  }));

  savePortfolio(); // keep localStorage in sync as an offline fallback
  renderPortfolio();
}

async function saveSupabasePortfolioItem(entry){
  if(!currentUser) return;
  const { data, error } = await supabaseClient
    .from('portfolio_holdings')
    .insert({
      user_id: currentUser.id,
      asset_type: entry.type,
      asset_key: entry.key,
      sym: entry.sym,
      name: entry.name,
      qty: entry.qty,
      avg_price: entry.avgPrice
    })
    .select()
    .single();

  if(error){ console.error('Failed to save portfolio item:', error); return null; }
  return data.id; // real Supabase row id, replaces the local 'pf-<timestamp>' id
}

async function deleteSupabasePortfolioItem(id){
  if(!currentUser) return;
  const { error } = await supabaseClient
    .from('portfolio_holdings')
    .delete()
    .eq('id', id)
    .eq('user_id', currentUser.id);
  if(error) console.error('Failed to delete portfolio item:', error);
}

/* ---- Portfolio: shared helpers ---- */
function removePortfolioEntry(id){
  PORTFOLIO = PORTFOLIO.filter(p => p.id !== id);
  savePortfolio();
  renderCryptoPortfolio();
  renderStockPortfolio();
  deleteSupabasePortfolioItem(id);
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

      const localId = 'pf-' + Date.now();
      const newEntry = {
        id: localId,
        type: 'crypto',
        key: pfPendingCoin.id,
        sym: pfPendingCoin.symbol.toUpperCase(),
        name: pfPendingCoin.name,
        qty, avgPrice
      };
      PORTFOLIO.push(newEntry);
      savePortfolio();
      renderCryptoPortfolio();

      const supabaseId = await saveSupabasePortfolioItem(newEntry);
      if(supabaseId){
        newEntry.id = supabaseId;
        savePortfolio();
      }

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

let pfPendingStock = null;
let pfStockSearchDebounce = null;

if(pfStockSymbolInput){
  pfStockSymbolInput.addEventListener('input', () => {
    pfPendingStock = null;
    const q = pfStockSymbolInput.value.trim();
    clearTimeout(pfStockSearchDebounce);
    if(!q){ closeResults(pfStockSearchResults); return; }
    pfStockSearchDebounce = setTimeout(() => {
      runStockSearch(q, pfStockSearchResults, (pick) => {
        pfPendingStock = pick;
        pfStockSymbolInput.value = `${pick.name} (${pick.symbol})`;
        closeResults(pfStockSearchResults);
      });
    }, 350);
  });
}

if(pfStockAddBtn){
  pfStockAddBtn.addEventListener('click', async () => {
    const qty = parseFloat(pfStockQtyInput.value);
    const avgPrice = parseFloat(pfStockPriceInput.value);
    if(!qty || qty <= 0 || !avgPrice || avgPrice <= 0){
      pfStockHint.textContent = 'Enter a quantity and average buy price greater than zero.';
      return;
    }
    const sym = pfPendingStock ? pfPendingStock.symbol : pfStockSymbolInput.value.trim().toUpperCase();
    if(!sym){ pfStockHint.textContent = 'Search a company name or ticker first.'; return; }

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
      const localId = 'pf-' + Date.now();
      const newEntry = {
        id: localId,
        type: 'stock',
        key: sym,
        sym, name, qty, avgPrice
      };
      PORTFOLIO.push(newEntry);
      savePortfolio();
      renderStockPortfolio();

      const supabaseId = await saveSupabasePortfolioItem(newEntry);
      if(supabaseId){
        newEntry.id = supabaseId;
        savePortfolio();
      }
      buildTape();
      refreshNews();
      pfStockSymbolInput.value = '';
      pfPendingStock = null;
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


