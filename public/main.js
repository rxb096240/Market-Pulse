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

initGrids();
trackSavedPortfolioAssets().then(() => { refreshAll(); });
renderPortfolio();
tickClock();
// showView() sets the active nav item + panel correctly regardless of which
// section happens to carry the "active" class in the raw HTML, and triggers
// the matching refresh (refreshHomeView() by default, since currentView
// starts as 'home' in state.js).
showView(currentView);
setInterval(refreshAll, 90000);
setInterval(refreshCurrentViewNews, 5 * 60 * 1000);
setInterval(tickClock, 1000);
setInterval(() => {
  if(currentView === 'stocks-overview') refreshMarketsSummary();
}, 90000);
