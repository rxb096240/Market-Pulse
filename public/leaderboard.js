// Practice Mode leaderboard: fetches and renders the public top-portfolios list.
// Simple fetch -> render pattern, no sorting or search — the backend already ranks it.

let leaderboardLoaded = false;

async function fetchLeaderboard(){
  try{
    const data = await fetchJsonWithTimeout(`${API_BASE}/api/practice/leaderboard`, 12000);
    return Array.isArray(data) ? data : [];
  }catch(e){
    console.error('Leaderboard fetch failed:', e);
    return [];
  }
}

function renderLeaderboard(rows){
  const el = document.getElementById('leaderboardContainer');
  if(!el) return;

  if(rows.length === 0){
    el.innerHTML = '<div class="empty">No practice portfolios yet — be the first to trade in Practice Mode.</div>';
    return;
  }

  el.innerHTML = `
    <div class="markets-table-wrap">
      <table class="markets-table" id="leaderboardTable">
        <thead>
          <tr>
            <th class="no-sort">Rank</th>
            <th class="no-sort">Trader</th>
            <th class="no-sort">Portfolio Value</th>
            <th class="no-sort">Gain</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r, i) => {
            const cls = r.gainPct >= 0 ? 'up' : 'down';
            const sign = r.gainPct >= 0 ? '+' : '';
            const avatar = avatarIconHtml(r.avatarKey, 'lb-avatar') || '';
            return `
              <tr>
                <td class="mt-rank">${i + 1}</td>
                <td><span class="lb-trader">${avatar}${escapeHtml(r.name)}</span></td>
                <td>${fmtUsd(r.totalValue)}</td>
                <td class="mt-chg ${cls}">${sign}${r.gainPct.toFixed(1)}%</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function refreshLeaderboard(){
  if(!leaderboardLoaded){
    const el = document.getElementById('leaderboardContainer');
    if(el) el.innerHTML = '<div class="news-loading">Loading leaderboard…</div>';
  }
  const rows = await fetchLeaderboard();
  if(rows.length > 0) leaderboardLoaded = true;
  renderLeaderboard(rows);
}
