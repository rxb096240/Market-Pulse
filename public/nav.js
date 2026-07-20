// Sidenav view switching: tracks nav visits, updates VIEW_TITLES, shows/hides view panels,
// and triggers the right refresh function per view. Also owns the mobile drawer open/close.

function trackNavVisit(view){
  fetch(`${API_BASE}/api/track/nav`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: currentUser?.id || null, section: view })
  }).catch(() => {}); // fire-and-forget — never block or break navigation on failure
}

/* ---- Sidenav view switching ---- */
const VIEW_TITLES = {
  'home': 'Home',
  'crypto-watchlist': 'Crypto Watchlist',
  'crypto-trending': 'Crypto · Trending',
  'crypto-overview': 'Crypto · Overview',
  'crypto-portfolio': 'Crypto · Portfolio',
  'crypto-news': 'Crypto · News',
  'stocks-overview': 'Stocks · Overview',
  'stocks-ai': 'Stocks · AI Stocks',
  'stocks-watchlist': 'Stocks Watchlist',
  'stocks-portfolio': 'Stocks · Portfolio',
  'stocks-news': 'Stocks · News',
  'news-us': 'News · US',
  'news-world': 'News · World',
  'news-india': 'News . India',
  'learn-stocks': 'Learn · Stocks Basics',
  'learn-index-funds': 'Learn · Index Funds',
  'learn-crypto': 'Learn · Crypto Basics',
  'forex-rates': 'Forex',
  'earnings-calendar': 'Earnings',
  'practice-mode': 'Practice',
  'social-reddit': 'Social · Reddit',
  'social-hackernews': 'Social · Hacker News',
  'admin-reports': 'Admin · Reports'
};

function showView(view){
  currentView = view;
  location.hash=view;
  trackNavVisit(view);
  updateTopBannerVisibility(view);
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
  document.querySelectorAll('.view-panel').forEach(panel => {
    panel.classList.toggle('active', panel.dataset.viewPanel === view);
  });
  expandGroupForView(view);
  const titleEl = document.getElementById('viewTitle');
  if(titleEl) titleEl.textContent = VIEW_TITLES[view] || '';

  if(view === 'home'){
    refreshHomeView();
    refreshVixIndex();
  }else if(view === 'crypto-trending'){
    refreshTrending();
  }else if(view === 'crypto-overview'){
    refreshMarketsOverview();
  }else if(view === 'crypto-news' || view === 'stocks-news'){
    refreshNews();
  }else if(view === 'news-us'){
    refreshUsNews();
  }else if(view === 'news-world'){
    refreshWorldNews();
  }else if(view === 'news-india'){
    refreshIndiaNews();
  }else if(view === 'stocks-overview'){
  refreshStocksMarketsOverview();
  }else if(view === 'stocks-ai'){
  refreshAiStocksOverview();
  }else if(view === 'forex-rates'){
  refreshForexRates();
}else if(view === 'earnings-calendar'){
  refreshEarningsCalendar();
}else if(view === 'practice-mode'){
  if(!currentUser){
    openAuthModal();
  }else{
    loadPracticeAccount();
  }
}else if(view === 'social-reddit'){
    refreshRedditFeed();
}else if(view === 'social-hackernews'){
    refreshHackerNews();
}else if(view === 'admin-reports'){
  refreshAdminReports();
}
}
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => showView(btn.dataset.view));
});


const hamburgerBtn = document.getElementById('hamburgerBtn');
const drawerOverlay = document.getElementById('drawerOverlay');
const sidenav = document.querySelector('.sidenav');

function openDrawer(){
  sidenav.classList.add('open');
  drawerOverlay.classList.add('open');
}
function closeDrawer(){
  sidenav.classList.remove('open');
  drawerOverlay.classList.remove('open');
}

hamburgerBtn?.addEventListener('click', openDrawer);
drawerOverlay?.addEventListener('click', closeDrawer);

// Close the drawer after picking a nav item, but only on mobile widths
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    if(window.innerWidth <= 820) closeDrawer();
  });
});

/* ---- Collapsible nav groups ---- */
function initNavCollapse(){
  document.querySelectorAll('[data-group-toggle]').forEach(btn => {
    const groupName = btn.dataset.groupToggle;
    const groupEl = btn.closest('.nav-group');
    const stored = localStorage.getItem(`navGroup:${groupName}`);
    if(stored === 'collapsed') groupEl.classList.add('collapsed');

    btn.addEventListener('click', () => {
      groupEl.classList.toggle('collapsed');
      localStorage.setItem(
        `navGroup:${groupName}`,
        groupEl.classList.contains('collapsed') ? 'collapsed' : 'expanded'
      );
    });
  });
}

function expandGroupForView(view){
  const activeBtn = document.querySelector(`.nav-item[data-view="${view}"]`);
  const groupEl = activeBtn?.closest('.nav-group');
  if(groupEl){
    groupEl.classList.remove('collapsed');
    const gName = groupEl.dataset.group;
    if(gName) localStorage.setItem(`navGroup:${gName}`, 'expanded');
  }
}

initNavCollapse();
