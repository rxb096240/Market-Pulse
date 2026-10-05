// Admin Sports page (NFL only for now): scores proxied from ESPN's
// unofficial site API via /api/admin/sports/:league/scores, headlines via
// the existing Google News proxy (same keyword-search pattern as AI/Crypto
// in news.js, just not exposed in the public News · Topics dropdown).

function renderSportsScores(games){
  const el = document.getElementById('adminSportsScores');
  if(!el) return;
  if(!games || games.length === 0){
    el.innerHTML = '<div class="news-empty">No NFL games right now.</div>';
    return;
  }

  el.innerHTML = games.map(g => {
    const statusCls = g.state === 'in' ? 'live' : '';
    const awayScore = g.away?.score !== null && g.away?.score !== undefined ? g.away.score : '--';
    const homeScore = g.home?.score !== null && g.home?.score !== undefined ? g.home.score : '--';
    return `
      <div class="score-row">
        <div class="score-teams">
          <div class="score-team-row">
            <span class="score-team-name${g.away?.winner ? ' winner' : ''}">${escapeHtml(g.away?.name || 'TBD')}</span>
            <span class="score-team-val">${escapeHtml(String(awayScore))}</span>
          </div>
          <div class="score-team-row">
            <span class="score-team-name${g.home?.winner ? ' winner' : ''}">${escapeHtml(g.home?.name || 'TBD')}</span>
            <span class="score-team-val">${escapeHtml(String(homeScore))}</span>
          </div>
        </div>
        <div class="score-status ${statusCls}">${escapeHtml(g.statusDetail || '')}</div>
      </div>
    `;
  }).join('');
}

async function refreshSportsScores(){
  const el = document.getElementById('adminSportsScores');
  if(!el) return;
  try{
    const token = await getAccessToken();
    const res = await fetch(`${API_BASE}/api/admin/sports/nfl/scores`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if(res.status === 403){ el.innerHTML = '<div class="empty">Not authorized.</div>'; return; }
    if(!res.ok) throw new Error('bad response');
    renderSportsScores(await res.json());
  }catch(e){
    console.error('NFL scores fetch failed:', e);
    el.innerHTML = '<div class="err">Scores unavailable — try again shortly.</div>';
  }
}

async function refreshSportsNews(){
  const el = document.getElementById('adminSportsNews');
  if(!el) return;
  try{
    const items = await fetchGoogleNews(`${API_BASE}/api/news/google?edition=nfl`, 'NFL');
    if(items.length === 0){ el.innerHTML = '<div class="err">News unavailable — try again shortly.</div>'; return; }
    renderNewsColumn('adminSportsNews', dedupeSortAndTrim(items, 12), { showTag: false });
  }catch(e){
    console.error('NFL news fetch failed:', e);
    el.innerHTML = '<div class="err">News unavailable — try again shortly.</div>';
  }
}

function refreshAdminSports(){
  refreshSportsScores();
  refreshSportsNews();
}
