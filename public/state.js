// Shared app state and constants: watchlist/portfolio data, Supabase client, price caches, view/debounce flags.
// Also holds cross-feature helpers: fmtPrice/fmtCap/fmtUsd, escapeHtml, timeAgo, sleep, savePortfolio, API_BASE.

const COINS = [
  { id:'bitcoin',   sym:'BTC',  name:'Bitcoin',      color:'#F7931A' },
  { id:'ethereum',  sym:'ETH',  name:'Ethereum',     color:'#8C8CFF' },
  { id:'ripple',    sym:'XRP',  name:'XRP',          color:'#3FA7FF' },
  { id:'dogecoin',  sym:'DOGE', name:'Dogecoin',     color:'#F2C13B' },
  { id:'shiba-inu', sym:'SHIB', name:'Shiba Inu',    color:'#FF7A5C' },
];

const STOCKS = [
  { sym:'AAPL',  name:'Apple',      color:'#A2AAAD' },
  { sym:'MSFT',  name:'Microsoft',  color:'#7FBA00' },
  { sym:'GOOGL', name:'Alphabet',   color:'#4285F4' },
  { sym:'AMZN',  name:'Amazon',     color:'#FF9900' },
  { sym:'TSLA',  name:'Tesla',      color:'#E31937' },
];

const DEFAULT_COINS = COINS.map(c => ({...c}));
const DEFAULT_STOCKS = STOCKS.map(s => ({...s}));

// Portfolio holdings: { id, type: 'crypto'|'stock', key, sym, name, qty, avgPrice }
let PORTFOLIO = [];
try{
  const saved = localStorage.getItem('tickerPortfolio');
  if(saved) PORTFOLIO = JSON.parse(saved);
}catch(e){ PORTFOLIO = []; }

const supabaseClient = window.supabase.createClient(
  'https://lrxkqzubhcnzqtrmdimq.supabase.co',
  'sb_publishable_k65mjJvZn92WQJM7BC6rWQ_X1rMsOVz'
);

const PALETTE = ['#5EE6C9','#FF9DBB','#7BD3FF','#FFD166','#C792EA','#8FE388','#FF9F68','#6FD6FF'];
let paletteIdx = 0;
function nextColor(){ const c = PALETTE[paletteIdx % PALETTE.length]; paletteIdx++; return c; }

let lastPrices = {};
let latestCryptoData = {};
let latestStockData = {};
let currentView = location.hash.slice(1) || 'home';
let searchDebounce = null;
let stockSearchTimer = null;
let pfSearchDebounce = null;
let pfPendingCoin = null; // { id, symbol, name } selected from crypto search in portfolio form
let newsRefreshToken = 0;
let trendingLoaded = false;

function fmtPrice(v){
  if(v === undefined || v === null || isNaN(v)) return '--';
  if(v >= 1000) return v.toLocaleString('en-US',{maximumFractionDigits:0});
  if(v >= 1) return v.toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2});
  if(v >= 0.01) return v.toLocaleString('en-US',{minimumFractionDigits:4, maximumFractionDigits:4});
  return v.toLocaleString('en-US',{minimumFractionDigits:8, maximumFractionDigits:8});
}

function fmtCap(v){
  if(v >= 1e12) return '$'+(v/1e12).toFixed(2)+'T';
  if(v >= 1e9) return '$'+(v/1e9).toFixed(2)+'B';
  if(v >= 1e6) return '$'+(v/1e6).toFixed(2)+'M';
  return '$'+v.toFixed(0)+' mcap';
}

function fmtUsd(v){
  return '$' + v.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
}

function sleep(ms){ return new Promise(resolve => setTimeout(resolve, ms)); }

// All external data now goes through our own backend (server.js), which
// proxies CoinGecko / Yahoo Finance / Google News server-side. That avoids
// CORS entirely, so there's no more need to race requests through public
// CORS-proxy services or rate-limit ourselves against them.
const API_BASE = '';

function savePortfolio(){
  try{ localStorage.setItem('tickerPortfolio', JSON.stringify(PORTFOLIO)); }catch(e){}
}

function escapeHtml(s){
  const div = document.createElement('div');
  div.textContent = s == null ? '' : String(s);
  return div.innerHTML;
}

function timeAgo(ms){
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if(mins < 1) return 'just now';
  if(mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if(hrs < 24) return hrs + 'h ago';
  const days = Math.floor(hrs / 24);
  return days + 'd ago';
}
