// Fetches and renders the Crypto "Trending" list (top searched coins) with live prices.
// Lets the user add a trending coin straight to their watchlist.

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

