// News feeds: per-asset crypto/stock news (via Yahoo Finance search) and Google News RSS for US/World/India.
// Includes dedupe/interleave-by-source logic shared across all the news columns.

/* ---- News ---- */
async function fetchCryptoNewsFor(coin){
  // Check if the current coin is BTC, ETH, or XRP to use the exact Yahoo ticker
  const targetTicker = coin.sym.toUpperCase();
  const useYahooTicker = ['BTC', 'ETH', 'XRP'].includes(targetTicker);
  
  const query = useYahooTicker ? `${targetTicker}-USD` : `${coin.name} crypto`; 
  const target = `${API_BASE}/api/news/search?q=${encodeURIComponent(query)}`;
  
  try{
    const json = await fetchJsonWithTimeout(target, 8000);
    const items = json.news || [];
    return items.slice(0, 4).map(n => ({
      title: n.title,
      url: n.link,
      source: n.publisher || 'Yahoo Finance',
      time: (n.providerPublishTime || 0) * 1000,
      tag: coin.sym
    }));
  }catch(e){
    console.error('Crypto news fetch failed:', coin.sym, e);
    return [];
  }
}


async function fetchCryptoNews(){
  if(COINS.length === 0) return [];
  
  // Running Promise.allSettled guarantees that even if one coin's news 
  // fails, it won't break the news load sequence for the rest of your watchlist.
  const results = await Promise.allSettled(COINS.map(c => fetchCryptoNewsFor(c)));
  
  return results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value)
    .flat();
}

async function fetchStockNewsFor(sym){
  const target = `${API_BASE}/api/news/search?q=${encodeURIComponent(sym)}`;
  try{
    const json = await fetchJsonWithTimeout(target, 8000);
    const items = json.news || [];
    return items.slice(0, 4).map(n => ({
      title: n.title,
      url: n.link,
      source: n.publisher || 'Yahoo Finance',
      time: (n.providerPublishTime || 0) * 1000,
      tag: sym
    }));
  }catch(e){
    console.error('Stock news fetch failed:', sym, e);
    return [];
  }
}

function renderNewsColumn(elId, items){
  const el = document.getElementById(elId);
  if(!el) return;
  if(items.length === 0){
    el.innerHTML = '<div class="news-empty">No recent news found for your tracked assets.</div>';
    return;
  }
  el.innerHTML = items.map(item => `
    <a class="news-item" href="${item.url}" target="_blank" rel="noopener noreferrer">
      <span class="news-tag">${escapeHtml(item.tag)}</span>
      <div class="news-title">${escapeHtml(item.title)}</div>
      <div class="news-meta">${escapeHtml(item.source)} · ${item.time ? timeAgo(item.time) : ''}</div>
    </a>
  `).join('');
}

function dedupeSortAndTrim(items, limit){
  const seen = new Set();
  const cleaned = items.filter(item => {
    if(!item.url || seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });

  const order = [];
  const groups = {};
  cleaned.forEach(item => {
    if(!groups[item.tag]){ groups[item.tag] = []; order.push(item.tag); }
    groups[item.tag].push(item);
  });
  order.forEach(tag => groups[tag].sort((a, b) => b.time - a.time));

  const interleaved = [];
  let i = 0;
  let addedAny = true;
  while(addedAny){
    addedAny = false;
    for(const tag of order){
      if(groups[tag][i]){
        interleaved.push(groups[tag][i]);
        addedAny = true;
      }
    }
    i++;
  }

  return interleaved.slice(0, limit);
}

async function fetchAllStockNews(){
  const results = await Promise.all(STOCKS.map(s => fetchStockNewsFor(s.sym)));
  return results.flat();
}

async function refreshNews(){
  const token = ++newsRefreshToken;
  ['cryptoNewsList', 'stockNewsList'].forEach(id => {
    const el = document.getElementById(id);
    if(el && el.children.length === 0){
      el.innerHTML = '<div class="news-loading">Loading news…</div>';
    }
  });

  // Run crypto and stock news sequentially (not simultaneously) so we don't
  // double up the burst of requests hitting the shared CORS proxies at once.
  const cryptoNews = await fetchCryptoNews();
  if(token !== newsRefreshToken) return;
  renderNewsColumn('cryptoNewsList', dedupeSortAndTrim(cryptoNews, 12));

  const stockNews = await fetchAllStockNews();
  if(token !== newsRefreshToken) return;
  renderNewsColumn('stockNewsList', dedupeSortAndTrim(stockNews, 12));
}

/* ---- News: Google News RSS (US / World) ---- */
const GNEWS_US_URL = `${API_BASE}/api/news/google?edition=us`;
const GNEWS_WORLD_URL = `${API_BASE}/api/news/google?edition=world`;
const GNEWS_INDIA_URL = `${API_BASE}/api/news/google?edition=in`;

let usNewsLoaded = false;
let worldNewsLoaded = false;
let indiaNewsLoaded = false;

function parseGoogleNewsRss(xmlText, tag){
  try{
    const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
    if(doc.querySelector('parsererror')) throw new Error('bad xml');
    return Array.from(doc.querySelectorAll('item')).map(item => {
      const rawTitle = item.querySelector('title')?.textContent || '';
      const url = item.querySelector('link')?.textContent || '';
      const pubDate = item.querySelector('pubDate')?.textContent;
      const sourceEl = item.querySelector('source');
      const source = sourceEl ? sourceEl.textContent : 'Google News';
      // Google News titles are usually "Headline - Source"; strip the
      // trailing source name since we already show it separately.
      let title = rawTitle;
      const suffix = ' - ' + source;
      if(source && title.endsWith(suffix)) title = title.slice(0, -suffix.length);
      const time = pubDate ? Date.parse(pubDate) : 0;
      return { title, url, source, time: isNaN(time) ? 0 : time, tag };
    }).filter(n => n.url && n.title);
  }catch(e){
    console.error('Failed to parse Google News RSS:', tag, e);
    return [];
  }
}

async function fetchGoogleNews(url, tag){
  try{
    const xml = await fetchTextWithTimeout(url, 8000);
    return parseGoogleNewsRss(xml, tag);
  }catch(e){
    console.error('Google News fetch failed:', tag, e);
    return [];
  }
}

async function refreshUsNews(){
  const container = document.getElementById('usNewsList');
  if(!container) return;
  if(!usNewsLoaded) container.innerHTML = '<div class="news-loading">Loading news…</div>';

  const items = await fetchGoogleNews(GNEWS_US_URL, 'US');
  if(items.length === 0){
    if(!usNewsLoaded) container.innerHTML = '<div class="err">News unavailable — try again shortly.</div>';
    return;
  }
  renderNewsColumn('usNewsList', dedupeSortAndTrim(items, 20));
  usNewsLoaded = true;
}

async function refreshWorldNews(){
  const container = document.getElementById('worldNewsList');
  if(!container) return;
  if(!worldNewsLoaded) container.innerHTML = '<div class="news-loading">Loading news…</div>';

  const items = await fetchGoogleNews(GNEWS_WORLD_URL, 'World');
  if(items.length === 0){
    if(!worldNewsLoaded) container.innerHTML = '<div class="err">News unavailable — try again shortly.</div>';
    return;
  }
  renderNewsColumn('worldNewsList', dedupeSortAndTrim(items, 20));
  worldNewsLoaded = true;
}

async function refreshIndiaNews(){
  const container = document.getElementById('indiaNewsList');
  if(!container) return;
  if(!indiaNewsLoaded) container.innerHTML = '<div class="news-loading">Loading news…</div>';

  // We tag these as 'India' so they get labeled cleanly in the UI
  const items = await fetchGoogleNews(GNEWS_INDIA_URL, 'India');
  items.forEach(item => { if(item.source === 'Google News') item.source = 'NDTV'; });

  if(items.length === 0){
    if(!indiaNewsLoaded) container.innerHTML = '<div class="err">News unavailable — try again shortly.</div>';
    return;
  }
  renderNewsColumn('indiaNewsList', dedupeSortAndTrim(items, 20), false);
  indiaNewsLoaded = true;
}

/* ---- News: Reddit (r/wallstreetbets top posts, refreshed daily at 8AM EST) ---- */
const REDDIT_NEWS_URL = `${API_BASE}/api/news/reddit`;
let redditNewsLoaded = false;

function formatRedditCount(n){
  if(n === undefined || n === null) return '0';
  if(n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

function renderRedditColumn(elId, payload){
  const el = document.getElementById(elId);
  if(!el) return;
  const posts = payload.posts || [];
  if(posts.length === 0){
    el.innerHTML = '<div class="news-empty">No trending posts found.</div>';
    return;
  }
  const updatedLabel = payload.updatedAt ? `Updated ${timeAgo(payload.updatedAt)}` : '';
  el.innerHTML = `
    <div class="reddit-refresh-note">${escapeHtml(updatedLabel)}</div>
    ${posts.map((p, i) => `
      <a class="reddit-post" href="${p.url}" target="_blank" rel="noopener noreferrer">
        <span class="reddit-rank">${String(i + 1).padStart(2, '0')}</span>
        <div class="reddit-post-body">
          <div class="reddit-post-title">${escapeHtml(p.title)}</div>
          <div class="reddit-post-meta">
            <span class="reddit-upvotes">▲ ${formatRedditCount(p.score)}</span>
            <span>💬 ${formatRedditCount(p.numComments)}</span>
            ${p.flair ? `<span class="reddit-flair">${escapeHtml(p.flair)}</span>` : ''}
          </div>
        </div>
      </a>
    `).join('')}
  `;
}

async function refreshRedditNews(){
  const container = document.getElementById('redditNewsList');
  if(!container) return;
  if(!redditNewsLoaded) container.innerHTML = '<div class="news-loading">Loading news…</div>';

  try{
    const json = await fetchJsonWithTimeout(REDDIT_NEWS_URL, 8000);
    renderRedditColumn('redditNewsList', json);
    redditNewsLoaded = true;
  }catch(e){
    console.error('Reddit news fetch failed:', e);
    if(!redditNewsLoaded) container.innerHTML = '<div class="err">News unavailable — try again shortly.</div>';
  }
}


