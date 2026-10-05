// Admin Sports page (NFL only for now): scores proxied from ESPN's
// unofficial site API via /api/admin/sports/:league/scores, headlines via
// the existing Google News proxy (same keyword-search pattern as AI/Crypto
// in news.js, just not exposed in the public News · Topics dropdown).

// ESPN's shortDetail is just "Final" once a game's done -- no date attached
// -- so a completed game needs its date appended separately to tell a
// Sunday's final from last week's.
function sportsStatusText(g){
  if(g.state !== 'post' || !g.date) return g.statusDetail || '';
  const d = new Date(g.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${g.statusDetail || 'Final'} · ${d}`;
}

// Live first, then upcoming (soonest first), then completed (most recent
// first) -- so the games actually worth checking right now aren't buried
// under a week's worth of already-decided ones.
const SPORTS_STATE_PRIORITY = { in: 0, pre: 1, post: 2 };
function sortSportsGames(games){
  return [...games].sort((a, b) => {
    const pDiff = (SPORTS_STATE_PRIORITY[a.state] ?? 3) - (SPORTS_STATE_PRIORITY[b.state] ?? 3);
    if(pDiff !== 0) return pDiff;
    const aTime = a.date ? new Date(a.date).getTime() : 0;
    const bTime = b.date ? new Date(b.date).getTime() : 0;
    return a.state === 'post' ? bTime - aTime : aTime - bTime;
  });
}

// Keeps every live/upcoming game, but only the N most recent completed ones
// -- otherwise a full week of finals buries the games actually worth
// checking under ones that are already decided and old news.
function limitCompletedGames(sortedGames, maxCompleted){
  let seen = 0;
  return sortedGames.filter(g => {
    if(g.state !== 'post') return true;
    seen++;
    return seen <= maxCompleted;
  });
}

function renderSportsScores(games){
  const el = document.getElementById('adminSportsScores');
  if(!el) return;
  if(!games || games.length === 0){
    el.innerHTML = '<div class="news-empty">No NFL games right now.</div>';
    return;
  }

  const limited = limitCompletedGames(sortSportsGames(games), 5);
  el.innerHTML = limited.map(g => {
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
        <div class="score-status ${statusCls}">${escapeHtml(sportsStatusText(g))}</div>
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

// Group names come back as e.g. "AFC East"/"NFC West" -- splitting on that
// prefix sidesteps needing to know exactly how ESPN nests conference vs.
// division in the raw response, which still isn't fully confirmed.
function standingsConferenceOf(name){
  const n = (name || '').trim().toUpperCase();
  if(n.startsWith('AFC')) return 'AFC';
  if(n.startsWith('NFC')) return 'NFC';
  return 'Other';
}

function standingsGroupHtml(g){
  return `
    <div class="standings-group">
      <div class="standings-group-name">${escapeHtml(g.name)}</div>
      <table class="markets-table standings-table">
        <thead><tr><th>Team</th><th>W</th><th>L</th><th>T</th></tr></thead>
        <tbody>
          ${g.entries.map(e => `
            <tr>
              <td>${escapeHtml(e.team)}</td>
              <td class="num">${e.wins}</td>
              <td class="num">${e.losses}</td>
              <td class="num">${e.ties}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderSportsStandings(groups){
  const el = document.getElementById('adminSportsStandings');
  if(!el) return;
  if(!groups || groups.length === 0){
    el.innerHTML = '<div class="news-empty">Standings unavailable.</div>';
    return;
  }

  const present = Array.from(new Set(groups.map(g => standingsConferenceOf(g.name))));
  const order = ['AFC', 'NFC'].filter(c => present.includes(c)).concat(present.filter(c => c !== 'AFC' && c !== 'NFC'));

  // Side by side when there's more than one conference to show; a single
  // column (no point splitting) if the data only ever resolves to one.
  if(order.length <= 1){
    el.innerHTML = groups.map(standingsGroupHtml).join('');
    return;
  }

  el.innerHTML = `
    <div class="standings-columns">
      ${order.map(c => `
        <div class="standings-column">
          <div class="standings-conf-label">${escapeHtml(c)}</div>
          ${groups.filter(g => standingsConferenceOf(g.name) === c).map(standingsGroupHtml).join('')}
        </div>
      `).join('')}
    </div>
  `;
}

async function refreshSportsStandings(){
  const el = document.getElementById('adminSportsStandings');
  if(!el) return;
  try{
    const token = await getAccessToken();
    const res = await fetch(`${API_BASE}/api/admin/sports/nfl/standings`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if(res.status === 403){ el.innerHTML = '<div class="empty">Not authorized.</div>'; return; }
    if(!res.ok) throw new Error('bad response');
    renderSportsStandings(await res.json());
  }catch(e){
    console.error('NFL standings fetch failed:', e);
    el.innerHTML = '<div class="err">Standings unavailable — try again shortly.</div>';
  }
}

function refreshAdminSports(){
  refreshSportsScores();
  refreshSportsStandings();
  refreshSportsNews();
}
