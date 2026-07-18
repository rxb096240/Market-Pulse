// hackernews.js
// Social · Hacker News view. Backend proxies the Algolia HN Search API
// (free, keyless) via /api/hackernews/search — no rate-limit/UA fighting
// needed here, unlike Reddit.

const HN_QUICK_QUERIES = [
  'stock market', 'fintech', 'crypto', 'IPO', 'interest rates', 'Fed'
];

let hnState = {
  query: 'stock market',
  sort: 'relevance'
};

function hnTimeAgo(isoString){
  if (!isoString) return '';
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function hnDomain(url){
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (e) {
    return null;
  }
}

function buildHnSearchUrl(query, sort){
  const params = new URLSearchParams({ q: query, sort });
  return `${API_BASE}/api/hackernews/search?${params.toString()}`;
}

function renderHnChips(){
  const row = document.getElementById('hnQuickRow');
  if (!row) return;
  row.innerHTML = HN_QUICK_QUERIES.map(q => `
    <div class="quick-chip${q.toLowerCase() === hnState.query.toLowerCase() ? ' active' : ''}" data-q="${escapeHtml(q)}">${escapeHtml(q)}</div>
  `).join('');

  row.querySelectorAll('.quick-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      hnState.query = chip.dataset.q;
      const input = document.getElementById('hnInput');
      if (input) input.value = chip.dataset.q;
      refreshHackerNews();
    });
  });
}

function renderHnSortRow(){
  const row = document.getElementById('hnSortRow');
  if (!row) return;
  const sorts = [['relevance', 'Relevance'], ['date', 'Most Recent']];
  row.innerHTML = sorts.map(([val, label]) => `
    <div class="sort-btn${val === hnState.sort ? ' active' : ''}" data-sort="${val}">${label}</div>
  `).join('');

  row.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      hnState.sort = btn.dataset.sort;
      refreshHackerNews();
    });
  });
}

function renderHnResults(hits){
  const container = document.getElementById('hnCardContainer');
  if (!container) return;

  if (!hits.length){
    container.innerHTML = `<div class="news-empty">No results found for "${escapeHtml(hnState.query)}".</div>`;
    return;
  }

  container.innerHTML = hits.map((h, i) => {
    const domain = hnDomain(h.url);
    const link = h.url || `https://news.ycombinator.com/item?id=${h.objectID}`;
    return `
      <a class="reddit-post" href="${link}" target="_blank" rel="noopener noreferrer">
        <span class="reddit-rank">${String(i + 1).padStart(2, '0')}</span>
        <div class="reddit-post-body">
          <div class="reddit-post-title">${escapeHtml(h.title)}${domain ? ` <span class="news-meta">(${escapeHtml(domain)})</span>` : ''}</div>
          <div class="reddit-post-meta">
            <span class="reddit-upvotes">▲ ${h.points}</span>
            <span>💬 ${h.numComments}</span>
            <span>by ${escapeHtml(h.author)}</span>
            <span>${hnTimeAgo(h.createdAt)}</span>
          </div>
        </div>
      </a>
    `;
  }).join('');
}

async function refreshHackerNews(){
  const container = document.getElementById('hnCardContainer');
  const headingEl = document.getElementById('hnResultsHeading');
  if (container) container.innerHTML = `<div class="news-loading">Searching "${escapeHtml(hnState.query)}"…</div>`;

  renderHnChips();
  renderHnSortRow();

  if (headingEl){
    const sortLabel = hnState.sort === 'relevance' ? 'Relevance' : 'Most Recent';
    headingEl.textContent = `"${hnState.query}" · ${sortLabel}`;
  }

  try {
    const url = buildHnSearchUrl(hnState.query, hnState.sort);
    const json = await fetchJsonWithTimeout(url, 8000);
    renderHnResults(json.hits || []);
  } catch (e){
    console.error('Hacker News search failed:', hnState.query, e);
    if (container) container.innerHTML = `<div class="err">Couldn't load results for "${escapeHtml(hnState.query)}" — try again shortly.</div>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('hnInput');
  const goBtn = document.getElementById('hnGoBtn');
  if (input){
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter'){
        const val = input.value.trim();
        if (val){ hnState.query = val; refreshHackerNews(); }
      }
    });
  }
  if (goBtn){
    goBtn.addEventListener('click', () => {
      const val = input?.value.trim();
      if (val){ hnState.query = val; refreshHackerNews(); }
    });
  }
});
