const ADMIN_EMAIL = 'a005.ram@gmail.com'; // same email as server.js

async function refreshAdminReports(){
  const panel = document.querySelector('[data-view-panel="admin-reports"]');
  if(!panel) return;
  if(!currentUser || currentUser.email !== ADMIN_EMAIL){
    panel.innerHTML = '<div class="empty">Not authorized.</div>';
    return;
  }
  const token = await getAccessToken();
  const res = await fetch(`${API_BASE}/api/admin/stats`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if(!res.ok){
    document.getElementById('adminCitiesTableBody').innerHTML =
      '<tr><td colspan="3" class="err">Failed to load stats.</td></tr>';
    return;
  }
  const stats = await res.json();
  renderAdminStats(stats);
}

function renderAdminStats(s){
  document.getElementById('adminSummaryBar').style.display = '';
  document.getElementById('adminTotalHits').textContent = s.totalHits;
  document.getElementById('adminUniqueUsers').textContent = s.uniqueUsers;
  document.getElementById('adminCities').textContent = s.citiesReached;
  document.getElementById('adminTopView').textContent = s.topView ? s.topView.section : '—';

  const citiesBody = document.getElementById('adminCitiesTableBody');
  citiesBody.innerHTML = s.topCities.length
    ? s.topCities.map(c => `<tr><td>${escapeHtml(c.city)}</td><td>${escapeHtml(c.country || '')}</td><td>${c.hits}</td></tr>`).join('')
    : '<tr><td colspan="3" class="empty">No city data yet.</td></tr>';

  const recentBody = document.getElementById('adminRecentTableBody');
  recentBody.innerHTML = s.recent.length
    ? s.recent.map(r => `<tr><td>${timeAgo(new Date(r.time).getTime())}</td><td>${escapeHtml(r.city || '—')}</td><td>${escapeHtml(r.section)}</td><td>${r.signedIn ? 'Yes' : 'Guest'}</td></tr>`).join('')
    : '<tr><td colspan="4" class="empty">No activity yet.</td></tr>';
}
