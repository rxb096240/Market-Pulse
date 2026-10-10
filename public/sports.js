// Admin Sports page: scores/standings proxied from ESPN's unofficial site
// API via /api/admin/sports/:league/{scores,standings}, headlines via the
// existing Google News proxy (same keyword-search pattern as AI/Crypto in
// news.js, just not exposed in the public News · Topics dropdown). The tab
// bar at the top of the panel switches which league is shown.

const SPORTS_LEAGUES = {
  nfl: { label: 'NFL', hasTies: true, hasStandings: true },
  nba: { label: 'NBA', hasTies: false, hasStandings: true },
  // Cricket doesn't have a win-loss standings table in this view (no single
  // ongoing league the way nfl/nba are), so it skips that section entirely.
  cricket: { label: 'Cricket', hasStandings: false }
};
let currentSportsLeague = 'nfl';

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

// ESPN sends a literal "0" (not null) for a team's score before a game
// starts, so a not-yet-started game needs its score blanked out explicitly
// rather than just falling back on null/undefined -- otherwise it reads as
// a real 0-0 score instead of "hasn't kicked off yet".
function scoreValueFor(g, team){
  if(g.state === 'pre') return '--';
  return team?.score !== null && team?.score !== undefined ? team.score : '--';
}

// Populated on every render so the click handler below can look a game back
// up by id without embedding its full JSON into the row's markup.
let sportsGamesById = new Map();

function scoreRowHtml(g){
  const statusCls = g.state === 'in' ? 'live' : '';
  const awayScore = scoreValueFor(g, g.away);
  const homeScore = scoreValueFor(g, g.home);
  return `
    <div class="score-row" data-game-id="${escapeHtml(String(g.id))}">
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
}

function scoresListHtml(games){
  return `<div class="scores-list">${games.map(scoreRowHtml).join('')}</div>`;
}

function renderSportsScores(games){
  const el = document.getElementById('adminSportsScores');
  if(!el) return;
  sportsGamesById = new Map((games || []).map(g => [String(g.id), g]));
  if(!games || games.length === 0){
    el.innerHTML = `<div class="news-empty">No ${escapeHtml(SPORTS_LEAGUES[currentSportsLeague].label)} games right now.</div>`;
    return;
  }

  const sorted = sortSportsGames(games);
  const liveUpcoming = sorted.filter(g => g.state !== 'post');
  // Otherwise a full week of finals buries the games actually worth checking
  // under ones that are already decided and old news.
  const completed = sorted.filter(g => g.state === 'post').slice(0, 5);

  // Side by side when both sides actually have something to show; a split
  // would just leave one column empty otherwise.
  if(liveUpcoming.length > 0 && completed.length > 0){
    el.innerHTML = `
      <div class="scores-columns">
        <div class="scores-column">
          <div class="scores-col-label">Live &amp; Upcoming</div>
          ${scoresListHtml(liveUpcoming)}
        </div>
        <div class="scores-column">
          <div class="scores-col-label">Completed</div>
          ${scoresListHtml(completed)}
        </div>
      </div>
    `;
    return;
  }

  el.innerHTML = scoresListHtml(liveUpcoming.length > 0 ? liveUpcoming : completed);
}

// Cricket's score is a string like "245/6 (42.3 ov)" per team rather than a
// single number, and a match can have multiple innings per side -- too
// different from NFL/NBA's shape to reuse scoreRowHtml/renderSportsScores,
// so it gets its own renderer. Only two buckets (no "upcoming" column) per
// what was asked for: recent live scores and recent completed games.
function cricketMatchRowHtml(m){
  const statusCls = m.state === 'in' ? 'live' : '';
  return `
    <div class="score-row">
      <div class="score-teams">
        ${(m.teams || []).map(t => `
          <div class="score-team-row">
            <span class="score-team-name${t?.winner ? ' winner' : ''}">${escapeHtml(t?.name || 'TBD')}</span>
            <span class="score-team-val">${escapeHtml(t?.scoreDisplay || '--')}</span>
          </div>
        `).join('')}
      </div>
      <div class="score-status ${statusCls}">${escapeHtml(m.statusDetail || '')}</div>
    </div>
  `;
}

function cricketMatchesListHtml(matches){
  return `<div class="scores-list">${matches.map(cricketMatchRowHtml).join('')}</div>`;
}

function renderCricketScores(matches){
  const el = document.getElementById('adminSportsScores');
  if(!el) return;
  if(!matches || matches.length === 0){
    el.innerHTML = '<div class="news-empty">No cricket matches right now.</div>';
    return;
  }

  const live = matches.filter(m => m.state !== 'post');
  const completed = matches.filter(m => m.state === 'post').slice(0, 5);

  if(live.length > 0 && completed.length > 0){
    el.innerHTML = `
      <div class="scores-columns">
        <div class="scores-column">
          <div class="scores-col-label">Live</div>
          ${cricketMatchesListHtml(live)}
        </div>
        <div class="scores-column">
          <div class="scores-col-label">Completed</div>
          ${cricketMatchesListHtml(completed)}
        </div>
      </div>
    `;
    return;
  }

  el.innerHTML = cricketMatchesListHtml(live.length > 0 ? live : completed);
}

async function refreshSportsScores(){
  const el = document.getElementById('adminSportsScores');
  if(!el) return;
  const league = currentSportsLeague;
  try{
    const token = await getAccessToken();
    const res = await fetch(`${API_BASE}/api/admin/sports/${league}/scores`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if(league !== currentSportsLeague) return; // user switched tabs while this was in flight
    if(res.status === 403){ el.innerHTML = '<div class="empty">Not authorized.</div>'; return; }
    if(!res.ok) throw new Error('bad response');
    const games = await res.json();
    if(league === 'cricket') renderCricketScores(games);
    else renderSportsScores(games);
  }catch(e){
    console.error(`${SPORTS_LEAGUES[league].label} scores fetch failed:`, e);
    if(league === currentSportsLeague) el.innerHTML = '<div class="err">Scores unavailable — try again shortly.</div>';
  }
}

async function refreshSportsNews(){
  const el = document.getElementById('adminSportsNews');
  if(!el) return;
  const league = currentSportsLeague;
  const label = SPORTS_LEAGUES[league].label;
  try{
    const items = await fetchGoogleNews(`${API_BASE}/api/news/google?edition=${league}`, label);
    if(league !== currentSportsLeague) return; // user switched tabs while this was in flight
    if(items.length === 0){ el.innerHTML = '<div class="err">News unavailable — try again shortly.</div>'; return; }
    renderNewsColumn('adminSportsNews', dedupeSortAndTrim(items, 12), { showTag: false });
  }catch(e){
    console.error(`${label} news fetch failed:`, e);
    if(league === currentSportsLeague) el.innerHTML = '<div class="err">News unavailable — try again shortly.</div>';
  }
}

// Group names come back as either abbreviated division names ("AFC East")
// or full conference names ("American Football Conference"/"Eastern
// Conference") depending on how ESPN nests conference vs. division for a
// given pull and sport -- match both forms rather than assuming one.
const CONFERENCE_PATTERNS = [
  { key: 'AFC', label: 'American Football Conference', test: n => n.startsWith('AFC') || n.includes('AMERICAN FOOTBALL CONFERENCE') },
  { key: 'NFC', label: 'National Football Conference', test: n => n.startsWith('NFC') || n.includes('NATIONAL FOOTBALL CONFERENCE') },
  { key: 'EAST', label: 'Eastern Conference', test: n => n.startsWith('EAST') || n.includes('EASTERN CONFERENCE') },
  { key: 'WEST', label: 'Western Conference', test: n => n.startsWith('WEST') || n.includes('WESTERN CONFERENCE') }
];
const CONFERENCE_ORDER = CONFERENCE_PATTERNS.map(p => p.key);

function standingsConferenceOf(name){
  const n = (name || '').trim().toUpperCase();
  return CONFERENCE_PATTERNS.find(p => p.test(n))?.key || 'Other';
}

function standingsConferenceLabel(key){
  return CONFERENCE_PATTERNS.find(p => p.key === key)?.label || key;
}

// One table per conference. When ESPN splits a conference into divisions,
// each division's teams get a sub-header row inside that same table rather
// than a separate small <table> per division. When a conference comes back
// as a single flat group (no division breakdown), the group's own name
// already duplicates the column's conference label above it, so that header
// row is skipped. The Ties column only applies to leagues that have ties
// (NFL does, NBA doesn't).
function conferenceTableHtml(groups, hasTies){
  const showGroupHeaders = groups.length > 1;
  const headerCols = hasTies ? 4 : 3;
  return `
    <table class="markets-table standings-table">
      <thead><tr><th>Team</th><th>W</th><th>L</th>${hasTies ? '<th>T</th>' : ''}</tr></thead>
      <tbody>
        ${groups.map(g => `
          ${showGroupHeaders ? `<tr class="standings-div-row"><td colspan="${headerCols}">${escapeHtml(g.name)}</td></tr>` : ''}
          ${g.entries.map(e => `
            <tr>
              <td>${escapeHtml(e.team)}</td>
              <td class="num">${e.wins}</td>
              <td class="num">${e.losses}</td>
              ${hasTies ? `<td class="num">${e.ties}</td>` : ''}
            </tr>
          `).join('')}
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderSportsStandings(groups){
  const el = document.getElementById('adminSportsStandings');
  if(!el) return;
  if(!groups || groups.length === 0){
    el.innerHTML = '<div class="news-empty">Standings unavailable.</div>';
    return;
  }

  const hasTies = SPORTS_LEAGUES[currentSportsLeague].hasTies;
  const present = Array.from(new Set(groups.map(g => standingsConferenceOf(g.name))));
  const order = CONFERENCE_ORDER.filter(c => present.includes(c)).concat(present.filter(c => !CONFERENCE_ORDER.includes(c)));

  // Side by side when there's more than one conference to show; a single
  // column (no point splitting) if the data only ever resolves to one.
  if(order.length <= 1){
    el.innerHTML = conferenceTableHtml(groups, hasTies);
    return;
  }

  el.innerHTML = `
    <div class="standings-columns">
      ${order.map(c => `
        <div class="standings-column">
          <div class="standings-conf-label">${escapeHtml(standingsConferenceLabel(c))}</div>
          ${conferenceTableHtml(groups.filter(g => standingsConferenceOf(g.name) === c), hasTies)}
        </div>
      `).join('')}
    </div>
  `;
}

async function refreshSportsStandings(){
  const el = document.getElementById('adminSportsStandings');
  if(!el) return;
  const league = currentSportsLeague;
  try{
    const token = await getAccessToken();
    const res = await fetch(`${API_BASE}/api/admin/sports/${league}/standings`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if(league !== currentSportsLeague) return; // user switched tabs while this was in flight
    if(res.status === 403){ el.innerHTML = '<div class="empty">Not authorized.</div>'; return; }
    if(!res.ok) throw new Error('bad response');
    renderSportsStandings(await res.json());
  }catch(e){
    console.error(`${SPORTS_LEAGUES[league].label} standings fetch failed:`, e);
    if(league === currentSportsLeague) el.innerHTML = '<div class="err">Standings unavailable — try again shortly.</div>';
  }
}

function setSportsLeague(league){
  if(!SPORTS_LEAGUES[league] || league === currentSportsLeague) return;
  currentSportsLeague = league;
  document.querySelectorAll('#sportsLeagueTabs .admin-pf-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.league === league);
  });
  document.getElementById('adminSportsScores').innerHTML = '<div class="news-loading">Loading scores…</div>';
  document.getElementById('adminSportsStandings').innerHTML = '<div class="news-loading">Loading standings…</div>';
  document.getElementById('adminSportsNews').innerHTML = '<div class="news-loading">Loading news…</div>';
  refreshAdminSports();
}

document.getElementById('sportsLeagueTabs')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.admin-pf-tab');
  if(!btn) return;
  setSportsLeague(btn.dataset.league);
});

function refreshAdminSports(){
  const hasStandings = SPORTS_LEAGUES[currentSportsLeague].hasStandings;
  const standingsSection = document.getElementById('adminSportsStandingsSection');
  if(standingsSection) standingsSection.style.display = hasStandings ? '' : 'none';

  refreshSportsScores();
  if(hasStandings) refreshSportsStandings();
  refreshSportsNews();
}

// Only scores need to move live -- standings and news change far more
// slowly (and are already cached server-side for minutes), so polling just
// re-hits the scores endpoint while the Admin Sports page is actually open.
let sportsScoresPollTimer = null;

function startSportsScoresPolling(){
  stopSportsScoresPolling();
  sportsScoresPollTimer = setInterval(refreshSportsScores, 30_000);
}

function stopSportsScoresPolling(){
  if(sportsScoresPollTimer){
    clearInterval(sportsScoresPollTimer);
    sportsScoresPollTimer = null;
  }
}

/* ---- Game detail modal ---- */
const gameDetailModalBackdrop = document.getElementById('gameDetailModalBackdrop');
const gameDetailModalClose = document.getElementById('gameDetailModalClose');
const gameDetailTitle = document.getElementById('gameDetailTitle');
const gameDetailMeta = document.getElementById('gameDetailMeta');
const gameDetailBody = document.getElementById('gameDetailBody');

function gameDetailStatRow(label, value){
  return `
    <div class="stock-detail-item">
      <span class="stock-detail-label">${escapeHtml(label)}</span>
      <span class="stock-detail-value">${escapeHtml(value || '--')}</span>
    </div>
  `;
}

// Quarter/period-by-period score table -- only shown when ESPN actually
// sent linescores for both sides (not every event has them, e.g. a game
// that hasn't started yet).
function gameDetailPeriodsHtml(g){
  const awayLines = g.away?.linescores || [];
  const homeLines = g.home?.linescores || [];
  if(awayLines.length === 0 || homeLines.length === 0) return '';
  const periodHeaders = awayLines.map((_, i) => `<th>${i + 1}</th>`).join('');
  const periodRow = (name, lines, total) => `
    <tr>
      <td>${escapeHtml(name)}</td>
      ${lines.map(v => `<td class="num">${escapeHtml(v === null ? '-' : String(v))}</td>`).join('')}
      <td class="num">${escapeHtml(total === null || total === undefined ? '-' : String(total))}</td>
    </tr>
  `;
  return `
    <table class="markets-table periods-table" style="margin-top:14px;">
      <thead><tr><th>Team</th>${periodHeaders}<th>T</th></tr></thead>
      <tbody>
        ${periodRow(g.away?.name || 'Away', awayLines, g.away?.score)}
        ${periodRow(g.home?.name || 'Home', homeLines, g.home?.score)}
      </tbody>
    </table>
  `;
}

function closeGameDetailModal(){ gameDetailModalBackdrop?.classList.remove('open'); }

function openGameDetailModal(g){
  if(!gameDetailModalBackdrop) return;
  gameDetailTitle.textContent = `${g.away?.name || 'TBD'} @ ${g.home?.name || 'TBD'}`;
  gameDetailMeta.textContent = sportsStatusText(g);

  const stats = [
    g.away?.record ? [`${g.away.name} record`, g.away.record] : null,
    g.home?.record ? [`${g.home.name} record`, g.home.record] : null,
    g.venue ? ['Venue', g.venue] : null,
    g.broadcast ? ['Broadcast', g.broadcast] : null
  ].filter(Boolean);

  gameDetailBody.innerHTML = `
    ${stats.length > 0 ? `<div class="stock-detail-grid">${stats.map(([l, v]) => gameDetailStatRow(l, v)).join('')}</div>` : '<div class="news-empty">No additional details available.</div>'}
    ${gameDetailPeriodsHtml(g)}
  `;
  gameDetailModalBackdrop.classList.add('open');
}

document.getElementById('adminSportsScores')?.addEventListener('click', (e) => {
  const row = e.target.closest('.score-row');
  if(!row) return;
  const game = sportsGamesById.get(row.dataset.gameId);
  if(game) openGameDetailModal(game);
});

gameDetailModalClose?.addEventListener('click', closeGameDetailModal);
gameDetailModalBackdrop?.addEventListener('click', (e) => {
  if(e.target === gameDetailModalBackdrop) closeGameDetailModal();
});
