// Real portfolio holdings: Supabase persistence plus the crypto/stock portfolio forms and P/L cards.
// Renders cost basis, current value, and gain/loss for everything the user has manually added.

// Live prices for portfolio holdings specifically, fetched independently of
// the user's separate Stocks/Crypto watchlist. A portfolio holding isn't
// necessarily also being watchlisted, so relying solely on the watchlist's
// cache (latestStockData/latestCryptoData) left any non-watchlisted holding
// permanently showing "--" for current value and P/L. Same fix as
// fetchPracticePrices in practice.js.
let portfolioPrices = { stock: {}, crypto: {} };

async function fetchPortfolioPrices(entries){
  const stockSyms = [...new Set(entries.filter(e => e.type === 'stock').map(e => e.key))];
  const cryptoIds = [...new Set(entries.filter(e => e.type === 'crypto').map(e => e.key))];

  const [stockResults, cryptoData] = await Promise.all([
    Promise.allSettled(stockSyms.map(sym => fetchOneStock(sym).then(d => [sym, d.price]))),
    cryptoIds.length > 0
      ? fetchJsonWithTimeout(`${API_BASE}/api/crypto/price?ids=${encodeURIComponent(cryptoIds.join(','))}`, 8000).catch(() => ({}))
      : Promise.resolve({})
  ]);

  const stockPrices = {};
  stockResults.forEach(r => {
    if(r.status === 'fulfilled'){
      const [sym, price] = r.value;
      stockPrices[sym] = price;
    }
  });

  const cryptoPrices = {};
  cryptoIds.forEach(id => {
    if(cryptoData[id]?.usd !== undefined) cryptoPrices[id] = cryptoData[id].usd;
  });

  portfolioPrices = { stock: stockPrices, crypto: cryptoPrices };
}

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
  await fetchPortfolioPrices(PORTFOLIO);
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

async function updateSupabasePortfolioItem(id, qty, avgPrice){
  if(!currentUser) return;
  const { error } = await supabaseClient
    .from('portfolio_holdings')
    .update({ qty, avg_price: avgPrice })
    .eq('id', id)
    .eq('user_id', currentUser.id);
  if(error) console.error('Failed to update portfolio item:', error);
}

/* ---- Portfolio: shared helpers ---- */
function removePortfolioEntry(id){
  PORTFOLIO = PORTFOLIO.filter(p => p.id !== id);
  savePortfolio();
  renderCryptoPortfolio();
  renderStockPortfolio();
  deleteSupabasePortfolioItem(id);
}

async function updatePortfolioEntry(id, qty, avgPrice){
  const entry = PORTFOLIO.find(p => p.id === id);
  if(!entry) return;
  entry.qty = qty;
  entry.avgPrice = avgPrice;
  savePortfolio();
  renderCryptoPortfolio();
  renderStockPortfolio();
  await updateSupabasePortfolioItem(id, qty, avgPrice);
}

// Manual fallback prices, keyed the same way as portfolioPrices — used only
// when every live source (dedicated fetch, watchlist cache) comes back
// empty, e.g. during a CoinGecko/Yahoo rate-limit. Session-only (not
// persisted): the moment a live price is available again it takes over.
let manualPrices = { stock: {}, crypto: {} };

function currentPriceFor(entry){
  if(entry.type === 'crypto'){
    return portfolioPrices.crypto[entry.key] ?? latestCryptoData[entry.key]?.usd ?? manualPrices.crypto[entry.key];
  }
  return portfolioPrices.stock[entry.key] ?? latestStockData[entry.key]?.price ?? manualPrices.stock[entry.key];
}

function buildPortfolioCard(entry){
  const priceKey = entry.type === 'crypto' ? 'crypto' : 'stock';
  const livePrice = entry.type === 'crypto'
    ? (portfolioPrices.crypto[entry.key] ?? latestCryptoData[entry.key]?.usd)
    : (portfolioPrices.stock[entry.key] ?? latestStockData[entry.key]?.price);
  const manualPrice = manualPrices[priceKey][entry.key];
  const price = livePrice ?? manualPrice;
  const usingManualPrice = livePrice === undefined && manualPrice !== undefined;

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

  const priceHtml = price !== undefined
    ? `<div class="price">$${fmtPrice(price)}${usingManualPrice ? ' <span class="price-manual-tag">manual</span>' : ''}</div>`
    : `
      <div class="price price-unavailable">--</div>
      <div class="manual-price-row">
        <input type="number" class="manual-price-input" placeholder="Enter price" min="0" step="any">
        <button class="manual-price-btn">Use</button>
      </div>
      <div class="manual-price-hint">Live price unavailable right now — enter one to estimate value.</div>
    `;

  card.innerHTML = `
    <div class="card-top">
      <div class="coin-id">
        <div class="coin-sym">${entry.sym}</div>
        <div class="coin-name">${entry.name}</div>
      </div>
      <div class="card-top-right">
        <button class="edit-btn" title="Edit holding">✎</button>
        <button class="remove-btn" title="Remove holding">×</button>
      </div>
    </div>
    <div class="pf-view">
      ${priceHtml}
      <div class="pf-row"><span>Quantity</span><span>${entry.type === 'crypto' ? parseFloat(Number(entry.qty).toFixed(2)) : Number(entry.qty).toFixed(4)}</span></div>
      <div class="pf-row"><span>Avg buy price</span><span>$${fmtPrice(entry.avgPrice)}</span></div>
      <div class="pf-row"><span>Cost basis</span><span>${fmtUsd(cost)}</span></div>
      <div class="pf-row"><span>Current value</span><span>${value !== null ? fmtUsd(value) : '--'}</span></div>
      <div class="pf-pl">
        <span class="pf-pl-label">P/L</span>
        <span class="pf-pl-value ${plCls}">${pl !== null ? plSign + fmtUsd(pl) + ' (' + plSign + plPct.toFixed(2) + '%)' : '--'}</span>
      </div>
    </div>
    <div class="pf-edit-form" style="display:none;">
      <div class="pf-edit-row">
        <label>Quantity</label>
        <input type="number" class="pf-edit-qty qty-input" value="${entry.qty}" min="0" step="any">
      </div>
      <div class="pf-edit-row">
        <label>Avg buy price</label>
        <input type="number" class="pf-edit-price price-input" value="${entry.avgPrice}" min="0" step="any">
      </div>
      <div class="pf-edit-actions">
        <button class="pf-edit-save add-btn">Save</button>
        <button class="pf-edit-cancel">Cancel</button>
      </div>
    </div>
  `;

  const viewEl = card.querySelector('.pf-view');
  const editForm = card.querySelector('.pf-edit-form');
  const qtyInput = card.querySelector('.pf-edit-qty');
  const priceInput = card.querySelector('.pf-edit-price');

  card.querySelector('.edit-btn').addEventListener('click', () => {
    qtyInput.value = entry.qty;
    priceInput.value = entry.avgPrice;
    viewEl.style.display = 'none';
    editForm.style.display = 'block';
  });
  card.querySelector('.pf-edit-cancel').addEventListener('click', () => {
    editForm.style.display = 'none';
    viewEl.style.display = '';
  });
  card.querySelector('.pf-edit-save').addEventListener('click', async () => {
    const newQty = parseFloat(qtyInput.value);
    const newPrice = parseFloat(priceInput.value);
    if(!newQty || newQty <= 0 || !newPrice || newPrice <= 0){
      alert('Enter a quantity and average buy price greater than zero.');
      return;
    }
    await updatePortfolioEntry(entry.id, newQty, newPrice);
  });
  card.querySelector('.remove-btn').addEventListener('click', () => removePortfolioEntry(entry.id));

  const manualBtn = card.querySelector('.manual-price-btn');
  if(manualBtn){
    manualBtn.addEventListener('click', () => {
      const input = card.querySelector('.manual-price-input');
      const val = parseFloat(input.value);
      if(!val || val <= 0){
        input.focus();
        return;
      }
      manualPrices[priceKey][entry.key] = val;
      renderCryptoPortfolio();
      renderStockPortfolio();
    });
  }

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

      // Adding a coin already held consolidates into that position (combined
      // qty, weighted-average price) instead of creating a second card for
      // the same coin.
      const existing = PORTFOLIO.find(p => p.type === 'crypto' && p.key === pfPendingCoin.id);
      if(existing){
        const combinedQty = existing.qty + qty;
        const combinedAvgPrice = (existing.qty * existing.avgPrice + qty * avgPrice) / combinedQty;
        await updatePortfolioEntry(existing.id, combinedQty, combinedAvgPrice);
      }else{
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

      // Same consolidation as the crypto form: adding a symbol already held
      // combines into that position instead of creating a duplicate card.
      const existing = PORTFOLIO.find(p => p.type === 'stock' && p.key === sym);
      if(existing){
        const combinedQty = existing.qty + qty;
        const combinedAvgPrice = (existing.qty * existing.avgPrice + qty * avgPrice) / combinedQty;
        await updatePortfolioEntry(existing.id, combinedQty, combinedAvgPrice);
      }else{
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


