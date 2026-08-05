// Crypto/stock watchlist cards (add/remove/update), plus the search bars used to find and track new assets.
// Also owns the generic autocomplete helpers and syncing the watchlist to Supabase.

/* ---- Watchlist cards ---- */
function buildCard(item, key, type){
  const card = document.createElement('div');
  card.className = 'card' + (type === 'stock' ? ' card-clickable' : '');
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
  card.querySelector('.remove-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    removeItem(type, key);
  });
  if(type === 'stock'){
    card.addEventListener('click', () => openStockDetailModal(item.sym, item.name));
  }
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
  deleteWatchlistItem(type, key);   // ADD THIS LINE
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
  // Inside the Stocks or Crypto section, the tape narrows to just that
  // asset class — anywhere else it shows both, same as before.
  const inStocksSection = currentView.startsWith('stocks-') || currentView === 'ipo-calendar';
  const inCryptoSection = currentView.startsWith('crypto-');
  const showCrypto = !inStocksSection;
  const showStocks = !inCryptoSection;

  let cryptoItems = !showCrypto ? '' : COINS.map(c => {
    const d = latestCryptoData[c.id];
    if(!d) return '';
    const chg = d.usd_24h_change || 0;
    const cls = chg >= 0 ? 'up' : 'down';
    const arrow = chg >= 0 ? '▲' : '▼';
    return `<span class="tape-item"><b>${c.sym}</b> $${fmtPrice(d.usd)} <span class="chg ${cls}">${arrow} ${Math.abs(chg).toFixed(2)}%</span></span>`;
  }).join('');
  let stockItems = !showStocks ? '' : STOCKS.map(s => {
    const d = latestStockData[s.sym];
    if(!d) return '';
    const cls = d.changePct >= 0 ? 'up' : 'down';
    const arrow = d.changePct >= 0 ? '▲' : '▼';
    const name = (s.name || '').replace(/"/g, '&quot;');
    return `<span class="tape-item tape-item-stock" data-symbol="${s.sym}" data-name="${name}"><b>${s.sym}</b> $${fmtPrice(d.price)} <span class="chg ${cls}">${arrow} ${Math.abs(d.changePct).toFixed(2)}%</span></span>`;
  }).join('');
  const items = cryptoItems + stockItems;
  tape.innerHTML = items + items;
}

// Same detail modal used on the Overview/AI Stocks tables and watchlist
// cards — delegated so it keeps working across buildTape()'s re-renders.
document.getElementById('tape')?.addEventListener('click', (e) => {
  const item = e.target.closest('.tape-item-stock');
  if(item) openStockDetailModal(item.dataset.symbol, item.dataset.name);
});

// Belt-and-suspenders pause alongside the CSS `.tape-wrap:hover` rule —
// driven from JS/pointer events instead of relying purely on :hover, since
// hover-state edge cases vary across browsers/WebViews (the app is also
// wrapped as an Android app).
const tapeWrapEl = document.querySelector('.tape-wrap');
tapeWrapEl?.addEventListener('pointerenter', () => tapeWrapEl.classList.add('tape-paused'));
tapeWrapEl?.addEventListener('pointerleave', () => tapeWrapEl.classList.remove('tape-paused'));


/* ---- Watchlist helpers (used by search bars and portfolio) ---- */
function ensureCryptoTracked(id, symbol, name){
  if(!COINS.some(c => c.id === id)){
    COINS.push({ id, sym: symbol.toUpperCase(), name, color: nextColor() });
    const cg = document.getElementById('cryptoGrid');
    const errEl = cg.querySelector('.err');
    if(errEl) errEl.remove();
    cg.appendChild(buildCard(COINS[COINS.length-1], id, 'crypto'));
    saveWatchlistItem('crypto', id, symbol.toUpperCase(), name);   // ADD THIS LINE
  }
}

async function ensureStockTracked(sym){
  if(!STOCKS.some(s => s.sym === sym)){
    const data = await fetchOneStock(sym);
    STOCKS.push({ sym, name: data.shortName, color: nextColor() });
    latestStockData[sym] = data;
    const sg = document.getElementById('stockGrid');
    const errEl = sg.querySelector('.err');
    if(errEl) errEl.remove();
    sg.appendChild(buildCard(STOCKS[STOCKS.length-1], sym, 'stock'));
    updateCard(sym, data.price, data.changePct, '');
    saveWatchlistItem('stock', sym, data.shortName, data.shortName);   // ADD THIS LINE
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

async function runStockSearch(q, resultsEl, onPick){
  if(!q){ closeResults(resultsEl); return; }
  try{
    const res = await fetch(`${API_BASE}/api/stock/search?q=${encodeURIComponent(q)}`);
    if(!res.ok) throw new Error('bad response');
    const data = await res.json();
    const quotes = (data.quotes || []).slice(0, 8);
    if(quotes.length === 0){
      resultsEl.innerHTML = `<div class="result-note">No matches for "${q}"</div>`;
      resultsEl.classList.add('open');
      return;
    }
    resultsEl.innerHTML = quotes.map(item => `
      <div class="result-item" data-symbol="${item.symbol}" data-name="${(item.name||'').replace(/"/g,'&quot;')}">
        <span class="result-name">${item.name}</span>
        <span class="result-sym">${item.symbol}</span>
      </div>
    `).join('');
    resultsEl.classList.add('open');
    resultsEl.querySelectorAll('.result-item').forEach(el => {
      el.addEventListener('click', () => onPick({ symbol: el.dataset.symbol, name: el.dataset.name }));
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
    stockSearchHint.textContent = `Added ${sym}. Search by company name or ticker to add another.`;
  }catch(e){
    stockSearchHint.textContent = `Couldn't find a ticker matching "${sym}". Check the name/symbol and try again.`;
  }
  closeResults(stockSearchResults);
  stockSearchInput.value = '';
}

if(stockSearchInput){
  stockSearchInput.addEventListener('input', () => {
    const q = stockSearchInput.value.trim();
    clearTimeout(stockSearchTimer);
    if(!q){ closeResults(stockSearchResults); return; }
    stockSearchTimer = setTimeout(() => {
      runStockSearch(q, stockSearchResults, (pick) => addStockFromSearch(pick.symbol));
    }, 350);
  });
  stockSearchInput.addEventListener('keydown', (e) => {
    if(e.key === 'Enter') addStockFromSearch(stockSearchInput.value);
  });
}


async function loadUserWatchlist(){
  if(!currentUser) return;
  const { data, error } = await supabaseClient
    .from('watchlists')
    .select('*')
    .eq('user_id', currentUser.id);

  if(error){ console.error('Failed to load watchlist:', error); return; }
  if(!data || data.length === 0) return;

  const savedCrypto = data.filter(row => row.asset_type === 'crypto');
  const savedStocks = data.filter(row => row.asset_type === 'stock');

  if(savedCrypto.length > 0){
    COINS.length = 0;
    savedCrypto.forEach(row => COINS.push({ id: row.asset_key, sym: row.sym, name: row.name, color: nextColor() }));
  }
  if(savedStocks.length > 0){
    STOCKS.length = 0;
    savedStocks.forEach(row => STOCKS.push({ sym: row.asset_key, name: row.name, color: nextColor() }));
  }

  initGrids();
  refreshAll();
}

async function saveWatchlistItem(type, key, sym, name){
  if(!currentUser) return;
  const { error } = await supabaseClient.from('watchlists').insert({
    user_id: currentUser.id,
    asset_type: type,
    asset_key: key,
    sym, name
  });
  if(error) console.error('Failed to save watchlist item:', error);
}

async function deleteWatchlistItem(type, key){
  if(!currentUser) return;
  const { error } = await supabaseClient.from('watchlists')
    .delete()
    .eq('user_id', currentUser.id)
    .eq('asset_type', type)
    .eq('asset_key', key);
  if(error) console.error('Failed to delete watchlist item:', error);
}
