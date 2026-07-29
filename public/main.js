// App bootstrap: initial grid render, restoring saved portfolio assets, and the recurring
// setInterval calls that keep prices, the clock, and the current news view refreshed.

async function trackSavedPortfolioAssets(){
  for(const entry of PORTFOLIO){
    if(entry.type === 'crypto'){
      ensureCryptoTracked(entry.key, entry.sym, entry.name);
    }else{
      try{ await ensureStockTracked(entry.key); }catch(e){ /* will show unavailable */ }
    }
  }
}

function refreshCurrentViewNews(){
  // Only fetch the news feed(s) actually visible right now. Pre-loading every
  // feed at once (crypto news, stock news, US, World) all in one burst is what
  // was slamming the shared free CORS proxies and causing failures/stale-cache
  // mixups — this fetches on demand instead, same as Overview/Trending already do.
  if(currentView === 'crypto-news' || currentView === 'stocks-news') refreshNews();
  else if(currentView === 'news-us') refreshUsNews();
  else if(currentView === 'news-world') refreshWorldNews();
  else if(currentView === 'news-india') refreshIndiaNews();
}

// Resolves once the first onAuthStateChange callback has run, so the
// initial showView() below never runs while currentUser is still in its
// pre-session-restore "unknown" null state — otherwise a refresh landing
// directly on a sign-in-required view (e.g. #practice-mode) would see a
// false "logged out" currentUser and wrongly pop the auth modal, only for
// the real (logged-in) session to arrive a moment later.
let resolveAuthReady;
const authReady = new Promise(resolve => { resolveAuthReady = resolve; });

supabaseClient.auth.onAuthStateChange((event, session) => {
  const wasLoggedIn = !!currentUser;
  currentUser = session?.user || null;
  updateAuthUI();

  if(currentUser){
    COINS.length = 0;
    STOCKS.length = 0;
    initGrids();
    loadUserWatchlist();
    loadUserPortfolio();
    loadPracticeAccount();
    // Social views gate on currentUser and otherwise sit on their
    // "sign in to continue" placeholder — nothing else here re-triggers
    // them, so a sign-in while already on one of these views would
    // otherwise leave that placeholder up until the next navigation/reload.
    if(currentView === 'social-reddit') refreshRedditFeed();
    else if(currentView === 'social-hackernews') refreshHackerNews();
  }else if(wasLoggedIn){
    COINS.length = 0; DEFAULT_COINS.forEach(c => COINS.push({...c}));
    STOCKS.length = 0; DEFAULT_STOCKS.forEach(s => STOCKS.push({...s}));
    initGrids();
    refreshAll();
    // PORTFOLIO holds the signed-out user's personal holdings — clear it
    // (and its localStorage mirror) before re-rendering, otherwise it
    // stays populated with their data for whoever uses this browser next
    // (a guest, or the next person to sign in on a shared machine).
    PORTFOLIO = [];
    savePortfolio();
    renderPortfolio();
    practiceAccount = null;
    practiceHoldings = [];
    renderPracticeMode();
  }
  resolveAuthReady();
});

initGrids();
trackSavedPortfolioAssets().then(() => { refreshAll(); });
renderPortfolio();
tickClock();
// showView() sets the active nav item + panel correctly regardless of which
// section happens to carry the "active" class in the raw HTML, and triggers
// the matching refresh (refreshHomeView() by default, since currentView
// starts as 'home' in state.js).
if(!VIEW_TITLES[currentView]) currentView = 'home';
authReady.then(() => showView(currentView));
setInterval(refreshAll, 90000);
setInterval(refreshCurrentViewNews, 5 * 60 * 1000);
setInterval(tickClock, 1000);
setInterval(() => {
  if(currentView === 'stocks-overview') refreshMarketsSummary();
}, 90000);
