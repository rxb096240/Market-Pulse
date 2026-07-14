// Polls CoinGecko/Yahoo (via our backend) for live crypto and stock prices on a timer.
// Updates the watchlist cards, ticker tape status LED, and drives the periodic refreshAll() loop.

/* ---- Price fetching ---- */
async function fetchCrypto(){
  if(COINS.length === 0) return true;
  const ids = COINS.map(c => c.id).join(',');
  const url = `${API_BASE}/api/crypto/price?ids=${encodeURIComponent(ids)}`;
  try{
    const res = await fetch(url);
    if(!res.ok) throw new Error('bad response');
    const data = await res.json();
    latestCryptoData = data;
    COINS.forEach(c => {
      const d = data[c.id];
      if(!d) return;
      updateCard(c.id, d.usd, d.usd_24h_change, d.usd_market_cap ? fmtCap(d.usd_market_cap) : '');
    });
    return true;
  }catch(e){
    return false;
  }
}

async function fetchJsonWithTimeout(url, ms){
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try{
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if(!res.ok) throw new Error('http ' + res.status);
    return await res.json();
  }finally{
    clearTimeout(timer);
  }
}

async function fetchTextWithTimeout(url, ms){
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try{
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if(!res.ok) throw new Error('http ' + res.status);
    return await res.text();
  }finally{
    clearTimeout(timer);
  }
}

async function fetchOneStock(sym){
  const target = `${API_BASE}/api/stock/quote/${encodeURIComponent(sym)}`;
  const json = await fetchJsonWithTimeout(target, 8000);
  const meta = json?.chart?.result?.[0]?.meta;
  if(!meta || meta.regularMarketPrice === undefined) throw new Error('no data for ' + sym);

  const prevClose = meta.previousClose ?? meta.chartPreviousClose;
  let price = meta.regularMarketPrice;
  let session = 'regular';

  if(meta.marketState === 'PRE' && meta.preMarketPrice){
    price = meta.preMarketPrice;
    session = 'pre';
  }else if((meta.marketState === 'POST' || meta.marketState === 'POSTPOST' || meta.marketState === 'CLOSED') && meta.postMarketPrice){
    price = meta.postMarketPrice;
    session = 'post';
  }

  const changePct = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;
  return { price, changePct, shortName: meta.shortName || sym, session };
}

async function fetchStocks(){
  if(STOCKS.length === 0) return true;
  let anyOk = false;
  for(const s of STOCKS){
    try{
      const data = await fetchOneStock(s.sym);
      anyOk = true;
      latestStockData[s.sym] = data;
      const label = data.session === 'pre' ? 'Pre-market'
        : data.session === 'post' ? 'After hours'
        : '';
      updateCard(s.sym, data.price, data.changePct, label);
    }catch(err){
      console.error('Stock fetch failed:', s.sym, err);
      const capEl = document.getElementById('cap-'+s.sym);
      if(capEl && !latestStockData[s.sym]) capEl.textContent = 'unavailable';
    }
    await sleep(250); // stagger requests to Yahoo to avoid 429s
  }
  return anyOk;
}

function setStatus(ok){
  const led = document.getElementById('statusLed');
  const text = document.getElementById('statusText');
  if(!led || !text) return;
  if(ok){
    led.style.background = 'var(--up)';
    text.textContent = 'Live · updates every 30s';
  }else{
    led.style.background = 'var(--down)';
    text.textContent = 'Feed error · retrying…';
  }
}

let isRefreshing = false;

async function refreshAll(){
  if(isRefreshing) return; // Skip if a refresh is already running
  isRefreshing = true;
  
  try {
    const [cryptoOk, stockOk] = await Promise.all([fetchCrypto(), fetchStocks()]);
    buildTape();
    setStatus(cryptoOk || stockOk);
    renderPortfolio();
    if(currentView === 'crypto-trending'){
      refreshTrending();
    }else if(currentView === 'crypto-overview'){
      refreshMarketsOverview();
    }
  } catch(e) {
    console.error("Refresh cycle failed:", e);
  } finally {
    setTimeout(() => { isRefreshing = false; }, 2000);
  }
}


function tickClock(){
  const el = document.getElementById('clock-time');
  if(el) el.textContent = new Date().toLocaleTimeString('en-US', { hour12:false });
}

