// Practice Mode (paper trading): loads/creates a user's 0,000 fake account and holdings from Supabase.
// Handles buying/selling with fake cash, diversification/loss nudges, and rendering the practice UI.

let practiceAccount = null; // { cash_balance }
let practiceHoldings = [];  // [{ id, asset_type, asset_key, sym, name, qty, avg_price }]

async function loadPracticeAccount(){
  if(!currentUser) return;

  let { data: account } = await supabaseClient
    .from('practice_accounts')
    .select('*')
    .eq('user_id', currentUser.id)
    .maybeSingle();

  if(!account){
    const { data: created, error } = await supabaseClient
      .from('practice_accounts')
      .insert({ user_id: currentUser.id, cash_balance: 10000 })
      .select()
      .single();
    if(error){ console.error('Failed to create practice account:', error); return; }
    account = created;
  }
  practiceAccount = account;

  const { data: holdings, error: hErr } = await supabaseClient
    .from('practice_holdings')
    .select('*')
    .eq('user_id', currentUser.id);
  if(hErr){ console.error('Failed to load practice holdings:', hErr); return; }
  practiceHoldings = holdings || [];

  renderPracticeMode();
}

function currentPracticePriceFor(holding){
  if(holding.asset_type === 'crypto') return latestCryptoData[holding.asset_key]?.usd;
  return latestStockData[holding.asset_key]?.price;
}

async function buyPractice(assetType, key, sym, name, amountUsd, currentPrice){
  if(!currentUser || !practiceAccount) return;
  if(!currentPrice || currentPrice <= 0) return;
  if(amountUsd <= 0 || amountUsd > practiceAccount.cash_balance) return;

  const qtyBought = amountUsd / currentPrice;
  const existing = practiceHoldings.find(h => h.asset_type === assetType && h.asset_key === key);

  if(existing){
    const newQty = existing.qty + qtyBought;
    const newAvgPrice = ((existing.qty * existing.avg_price) + amountUsd) / newQty;
    const { error } = await supabaseClient
      .from('practice_holdings')
      .update({ qty: newQty, avg_price: newAvgPrice })
      .eq('id', existing.id);
    if(error){ console.error('Buy update failed:', error); return; }
  }else{
    const { error } = await supabaseClient
      .from('practice_holdings')
      .insert({
        user_id: currentUser.id,
        asset_type: assetType, asset_key: key,
        sym, name, qty: qtyBought, avg_price: currentPrice
      });
    if(error){ console.error('Buy insert failed:', error); return; }
  }

  const newBalance = practiceAccount.cash_balance - amountUsd;
  await supabaseClient.from('practice_accounts')
    .update({ cash_balance: newBalance })
    .eq('user_id', currentUser.id);

  await supabaseClient.from('practice_transactions').insert({
    user_id: currentUser.id, type: 'buy',
    asset_type: assetType, asset_key: key, sym, name,
    qty: qtyBought, price: currentPrice, amount: amountUsd
  });

  await loadPracticeAccount();
}

async function sellAllPractice(holdingId){
  if(!currentUser || !practiceAccount) return;
  const holding = practiceHoldings.find(h => h.id === holdingId);
  if(!holding) return;

  const currentPrice = currentPracticePriceFor(holding);
  if(!currentPrice) return;

  const saleAmount = holding.qty * currentPrice;

  await supabaseClient.from('practice_holdings').delete().eq('id', holdingId);

  const newBalance = practiceAccount.cash_balance + saleAmount;
  await supabaseClient.from('practice_accounts')
    .update({ cash_balance: newBalance })
    .eq('user_id', currentUser.id);

  await supabaseClient.from('practice_transactions').insert({
    user_id: currentUser.id, type: 'sell',
    asset_type: holding.asset_type, asset_key: holding.asset_key,
    sym: holding.sym, name: holding.name,
    qty: holding.qty, price: currentPrice, amount: saleAmount
  });

  await loadPracticeAccount();
}

async function resetPracticeAccount(){
  if(!currentUser) return;
  await supabaseClient.from('practice_holdings').delete().eq('user_id', currentUser.id);
  await supabaseClient.from('practice_transactions').delete().eq('user_id', currentUser.id);
  await supabaseClient.from('practice_accounts')
    .update({ cash_balance: 10000 })
    .eq('user_id', currentUser.id);
  await loadPracticeAccount();
}

function practiceHoldingHtml(h){
  const price = currentPracticePriceFor(h);
  const value = price !== undefined ? h.qty * price : null;
  const cost = h.qty * h.avg_price;
  const pl = value !== null ? value - cost : null;
  const plPct = value !== null && cost > 0 ? (pl / cost) * 100 : null;
  const plCls = pl === null ? '' : (pl >= 0 ? 'up' : 'down');
  const sign = pl !== null && pl >= 0 ? '+' : '';

  return `
    <div class="holding-card">
      <div class="holding-left">
        <div class="holding-sym">${escapeHtml(h.sym)} — ${escapeHtml(h.name)}</div>
        <div class="holding-blurb">Bought for ${fmtUsd(cost)} · now worth ${value !== null ? fmtUsd(value) : '--'}</div>
      </div>
      <div class="holding-right">
        <div class="holding-stats">
          <div class="holding-value">${value !== null ? fmtUsd(value) : '--'}</div>
          <div class="holding-pl ${plCls}">${pl !== null ? sign + fmtUsd(pl) + ' (' + sign + plPct.toFixed(1) + '%)' : '--'}</div>
        </div>
        <button class="sell-btn" data-holding-id="${h.id}">Sell</button>
      </div>
    </div>
  `;
}

function renderPracticeMode(){
  const container = document.getElementById('practiceContainer');
  if(!container) return;

  if(!currentUser){
    container.innerHTML = `
      <div class="err">Sign in to start practicing with $10,000 in fake money — real prices, zero risk.</div>
    `;
    return;
  }
  if(!practiceAccount) return;

  const cash = practiceAccount.cash_balance;
  const holdingsValue = practiceHoldings.reduce((sum, h) => {
    const price = currentPracticePriceFor(h);
    return sum + (price !== undefined ? h.qty * price : h.qty * h.avg_price);
  }, 0);
  const totalValue = cash + holdingsValue;
  const totalGain = totalValue - 10000;
  const totalGainPct = (totalGain / 10000) * 100;
  const gainCls = totalGain >= 0 ? 'up' : 'down';
  const gainSign = totalGain >= 0 ? '+' : '';

  container.innerHTML = `
    <div class="practice-banner">🧪 Practice Mode uses fake money and real prices — nothing here is real investing or financial advice.</div>

    <div class="balance-card">
      <div class="balance-label">Your Practice Balance</div>
      <div class="balance-value">${fmtUsd(totalValue)}</div>
      <div class="balance-sub">
        <div class="balance-sub-item"><div class="balance-sub-label">Started With</div><div class="balance-sub-value">$10,000.00</div></div>
        <div class="balance-sub-item"><div class="balance-sub-label">Cash Left</div><div class="balance-sub-value">${fmtUsd(cash)}</div></div>
        <div class="balance-sub-item"><div class="balance-sub-label">Total Gain</div><div class="balance-sub-value ${gainCls}">${gainSign}${fmtUsd(totalGain)} (${gainSign}${totalGainPct.toFixed(1)}%)</div></div>
      </div>
    </div>

    <div class="buy-card">
      <div class="buy-title">Buy Something</div>
      <div class="search-input-wrap">
        <input id="practiceBuySearch" type="text" placeholder="Search a stock or coin…" autocomplete="off">
        <div class="search-results" id="practiceBuySearchResults"></div>
      </div>
      <div class="buy-amount-row" style="margin-top:10px;">
        <input id="practiceBuyAmount" class="buy-amount-input" placeholder="$100" type="number" min="0" step="any">
      </div>
      <div class="quick-amounts">
        <button class="quick-amount-btn" data-amt="25">$25</button>
        <button class="quick-amount-btn" data-amt="50">$50</button>
        <button class="quick-amount-btn" data-amt="100">$100</button>
        <button class="quick-amount-btn" data-amt="500">$500</button>
      </div>
      <div class="buy-preview" id="practiceBuyPreview"></div>
      <button class="add-btn" id="practiceBuyBtn" style="width:100%;">Buy with Practice Money</button>
    </div>

    <div class="holdings-label">What You Own</div>
    ${practiceHoldings.length === 0
      ? '<div class="empty">No practice holdings yet — buy something above to get started.</div>'
      : practiceHoldings.map(practiceHoldingHtml).join('')}

    <div class="reset-link" id="practiceResetLink">Start Over (reset practice balance to $10,000)</div>
  `;

  wirePracticeBuyForm();
  wirePracticeSellButtons();

  document.getElementById('practiceResetLink')?.addEventListener('click', async () => {
    if(confirm('This will erase all your practice holdings and history, and reset your balance to $10,000. Are you sure?')){
      await resetPracticeAccount();
    }
  });
}

let practicePendingAsset = null; // { type, key, sym, name, price }

function wirePracticeBuyForm(){
  const searchInput = document.getElementById('practiceBuySearch');
  const searchResults = document.getElementById('practiceBuySearchResults');
  const amountInput = document.getElementById('practiceBuyAmount');
  const preview = document.getElementById('practiceBuyPreview');
  const buyBtn = document.getElementById('practiceBuyBtn');
  let debounce = null;

  function updatePreview(){
    if(!practicePendingAsset || !amountInput.value){ preview.textContent = ''; return; }
    const amt = parseFloat(amountInput.value);
    if(!amt || amt <= 0){ preview.textContent = ''; return; }
    const qty = amt / practicePendingAsset.price;
    preview.textContent = `That'll get you about ${qty.toFixed(4)} shares/coins of ${practicePendingAsset.sym} at today's price ($${fmtPrice(practicePendingAsset.price)}).`;
  }

  searchInput?.addEventListener('input', () => {
    practicePendingAsset = null;
    const q = searchInput.value.trim();
    clearTimeout(debounce);
    if(!q){ closeResults(searchResults); return; }
    debounce = setTimeout(async () => {
      // Try stocks first, then crypto — simple combined search for practice mode
      const [stockRes, cryptoRes] = await Promise.all([
        fetch(`${API_BASE}/api/stock/search?q=${encodeURIComponent(q)}`).then(r => r.json()).catch(() => ({quotes:[]})),
        fetch(`${API_BASE}/api/crypto/search?query=${encodeURIComponent(q)}`).then(r => r.json()).catch(() => ({coins:[]}))
      ]);
      const stockItems = (stockRes.quotes || []).slice(0, 4).map(s => ({ type:'stock', key:s.symbol, sym:s.symbol, name:s.name || s.symbol }));
      const cryptoItems = (cryptoRes.coins || []).slice(0, 4).map(c => ({ type:'crypto', key:c.id, sym:c.symbol.toUpperCase(), name:c.name }));
      const combined = [...stockItems, ...cryptoItems];

      if(combined.length === 0){
        searchResults.innerHTML = `<div class="result-note">No matches for "${q}"</div>`;
        searchResults.classList.add('open');
        return;
      }
      searchResults.innerHTML = combined.map((item, i) => `
        <div class="result-item" data-idx="${i}">
          <span class="result-name">${escapeHtml(item.name)}</span>
          <span class="result-sym">${escapeHtml(item.sym)}</span>
        </div>
      `).join('');
      searchResults.classList.add('open');
      searchResults.querySelectorAll('.result-item').forEach((el, i) => {
        el.addEventListener('click', async () => {
          const picked = combined[i];
          // Fetch current price for the picked asset
          let price;
          if(picked.type === 'stock'){
            try{ const d = await fetchOneStock(picked.key); price = d.price; }catch(e){ price = null; }
          }else{
            try{
              const d = await fetchJsonWithTimeout(`${API_BASE}/api/crypto/price?ids=${encodeURIComponent(picked.key)}`, 8000);
              price = d[picked.key]?.usd;
            }catch(e){ price = null; }
          }
          if(!price){ alert('Could not fetch a current price for that — try another search.'); return; }
          practicePendingAsset = { ...picked, price };
          searchInput.value = `${picked.name} (${picked.sym})`;
          closeResults(searchResults);
          updatePreview();
        });
      });
    }, 350);
  });

  amountInput?.addEventListener('input', updatePreview);
  document.querySelectorAll('.quick-amount-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      amountInput.value = btn.dataset.amt;
      updatePreview();
    });
  });

  buyBtn?.addEventListener('click', async () => {
    if(!practicePendingAsset){ alert('Search and pick something to buy first.'); return; }
    const amt = parseFloat(amountInput.value);
    if(!amt || amt <= 0){ alert('Enter an amount to invest.'); return; }
    if(amt > practiceAccount.cash_balance){ alert("That's more than your practice cash balance."); return; }

    // Diversification nudge: check resulting concentration
    const holdingsValue = practiceHoldings.reduce((sum, h) => {
      const price = currentPracticePriceFor(h);
      return sum + (price !== undefined ? h.qty * price : h.qty * h.avg_price);
    }, 0);
    const totalAfter = practiceAccount.cash_balance + holdingsValue; // total value unchanged by a buy, just cash->asset
    const existing = practiceHoldings.find(h => h.asset_type === practicePendingAsset.type && h.asset_key === practicePendingAsset.key);
    const existingValue = existing ? (currentPracticePriceFor(existing) ?? existing.avg_price) * existing.qty : 0;
    const concentrationAfter = totalAfter > 0 ? ((existingValue + amt) / totalAfter) * 100 : 0;

    if(concentrationAfter > 60){
      const proceed = confirm(`Heads up — after this buy, over ${concentrationAfter.toFixed(0)}% of your practice money will be in ${practicePendingAsset.sym}. Some investors spread money across a few things to reduce risk. Buy anyway?`);
      if(!proceed) return;
    }

    buyBtn.disabled = true;
    await buyPractice(practicePendingAsset.type, practicePendingAsset.key, practicePendingAsset.sym, practicePendingAsset.name, amt, practicePendingAsset.price);
    buyBtn.disabled = false;
  });
}

function wirePracticeSellButtons(){
  document.querySelectorAll('.sell-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const holdingId = btn.dataset.holdingId;
      const holding = practiceHoldings.find(h => h.id === holdingId);
      if(!holding) return;

      const price = currentPracticePriceFor(holding);
      const value = price !== undefined ? holding.qty * price : null;
      const cost = holding.qty * holding.avg_price;
      const pl = value !== null ? value - cost : null;

      // Sell nudge: warn if selling at a loss
      if(pl !== null && pl < 0){
        const proceed = confirm(`Selling now locks in a ${fmtUsd(Math.abs(pl))} loss on ${holding.sym}. Investing usually works best over time — sell anyway?`);
        if(!proceed) return;
      }else{
        const proceed = confirm(`Sell all of your ${holding.sym} for ${value !== null ? fmtUsd(value) : 'the current price'}?`);
        if(!proceed) return;
      }

      btn.disabled = true;
      await sellAllPractice(holdingId);
    });
  });
}

