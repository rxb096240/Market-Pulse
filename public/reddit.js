// reddit.js
// Social · Reddit view. Follows the same RSS-proxy + DOMParser pattern as
// news.js's Google News handling: the backend proxies the raw feed with
// application/xml, and this file parses it client-side.
//
// Feed shape: Atom (not RSS 2.0) — <feed><entry><title>/<author>/<content>/<link>/<published>.
// No score/comment counts available (Reddit's RSS doesn't expose them).

const REDDIT_QUICK_SUBS = [
  'stocks', 'investing', 'wallstreetbets', 'StockMarket', 'options', 'CryptoCurrency', 'personalfinance'
];

const REDDIT_LIMITS = { hot: 15, new: 15, rising: 15, top: 25, controversial: 20 };

let redditState = {
  subreddit: 'stocks',
  sort: 'hot',
  time: 'week'
};

function stripHtml(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html || '';
  return (tmp.textContent || tmp.innerText || '').trim();
}

function timeAgo(isoString) {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function parseRedditAtom(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (doc.querySelector('parsererror')) return [];

  const entries = Array.from(doc.getElementsByTagName('entry'));
  return entries.map(entry => {
    const title = entry.getElementsByTagName('title')[0]?.textContent || '(untitled)';
    const authorName = entry.querySelector('author > name')?.textContent || 'unknown';
    const author = authorName.replace(/^\/u\//, '');
    const link = entry.getElementsByTagName('link')[0]?.getAttribute('href') || '#';
    const published = entry.getElementsByTagName('published')[0]?.textContent || null;
    const contentHtml = entry.getElementsByTagName('content')[0]?.textContent || '';
    const excerpt = stripHtml(contentHtml).slice(0, 180);
    return { title, author, link, published, excerpt };
  });
}

function buildRedditFeedUrl(subreddit, sort, time) {
  const params = new URLSearchParams({ subreddit, sort });
  if (sort === 'top' || sort === 'controversial') params.set('t', time);
  return `${API_BASE}/api/reddit/feed?${params.toString()}`;
}

function renderRedditChips() {
  const row = document.getElementById('redditQuickRow');
  if (!row) return;
  row.innerHTML = REDDIT_QUICK_SUBS.map(sub => `
    <div class="quick-chip${sub.toLowerCase() === redditState.subreddit.toLowerCase() ? ' active' : ''}" data-sub="${sub}">${sub}</div>
  `).join('');

  row.querySelectorAll('.quick-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      redditState.subreddit = chip.dataset.sub;
      const input = document.getElementById('redditSubInput');
      if (input) input.value = chip.dataset.sub;
      refreshRedditFeed();
    });
  });
}

function renderRedditSortRow() {
  const row = document.getElementById('redditSortRow');
  if (!row) return;
  const sorts = ['hot', 'new', 'top', 'rising', 'controversial'];
  row.innerHTML = sorts.map(s => `
    <div class="sort-btn${s === redditState.sort ? ' active' : ''}" data-sort="${s}">
      ${s.charAt(0).toUpperCase() + s.slice(1)}
    </div>
  `).join('');

  row.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      redditState.sort = btn.dataset.sort;
      const timeRow = document.getElementById('redditTimeRow');
      if (timeRow) {
        timeRow.classList.toggle('show', redditState.sort === 'top' || redditState.sort === 'controversial');
      }
      refreshRedditFeed();
    });
  });
}

function renderRedditTimeRow() {
  const row = document.getElementById('redditTimeRow');
  if (!row) return;
  const times = ['hour', 'day', 'week', 'month', 'year', 'all'];
  row.innerHTML = times.map(t => `
    <div class="time-chip${t === redditState.time ? ' active' : ''}" data-t="${t}">
      ${t.charAt(0).toUpperCase() + t.slice(1)}
    </div>
  `).join('');
  row.classList.toggle('show', redditState.sort === 'top' || redditState.sort === 'controversial');

  row.querySelectorAll('.time-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      redditState.time = chip.dataset.t;
      refreshRedditFeed();
    });
  });
}

function renderRedditPosts(posts) {
  const container = document.getElementById('redditPostList');
  if (!container) return;

  if (!posts.length) {
    container.innerHTML = `<div class="news-empty">No posts found for r/${redditState.subreddit}.</div>`;
    return;
  }

  container.innerHTML = posts.map((p, i) => `
    <a class="reddit-post" href="${p.link}" target="_blank" rel="noopener">
      <div class="reddit-rank">${i + 1}</div>
      <div class="reddit-post-body">
        <div class="reddit-post-title">${p.title}</div>
        <div class="news-meta" style="margin-bottom:6px;">${p.excerpt}</div>
        <div class="reddit-post-meta">
          <span>u/${p.author}</span>
          <span>${p.published ? timeAgo(p.published) : ''}</span>
        </div>
      </div>
    </a>
  `).join('');
}

async function refreshRedditFeed() {
  const container = document.getElementById('redditPostList');
  const headingEl = document.getElementById('redditResultsHeading');
  if (container) container.innerHTML = '<div class="news-loading">Loading r/' + redditState.subreddit + '…</div>';

  renderRedditChips();
  renderRedditSortRow();
  renderRedditTimeRow();

  if (headingEl) {
    const sortLabel = redditState.sort.charAt(0).toUpperCase() + redditState.sort.slice(1);
    const timeLabel = (redditState.sort === 'top' || redditState.sort === 'controversial')
      ? ' · ' + redditState.time.charAt(0).toUpperCase() + redditState.time.slice(1)
      : '';
    headingEl.textContent = `r/${redditState.subreddit} · ${sortLabel}${timeLabel}`;
  }

  try {
    const url = buildRedditFeedUrl(redditState.subreddit, redditState.sort, redditState.time);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Feed request failed: ${res.status}`);
    const xmlText = await res.text();
    const posts = parseRedditAtom(xmlText);
    renderRedditPosts(posts);
  } catch (e) {
    console.error('reddit feed load failed:', e.message);
    if (container) container.innerHTML = `<div class="err">Couldn't load r/${redditState.subreddit} — check the name and try again.</div>`;
  }
}

// Wire the subreddit text input (Enter key or blur triggers load)
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('redditSubInput');
  const goBtn = document.getElementById('redditGoBtn');
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = input.value.trim();
        if (val) { redditState.subreddit = val; refreshRedditFeed(); }
      }
    });
  }
  if (goBtn) {
    goBtn.addEventListener('click', () => {
      const val = input?.value.trim();
      if (val) { redditState.subreddit = val; refreshRedditFeed(); }
    });
  }
});
