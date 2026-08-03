
async function refreshAdminReports(){
  const panel = document.querySelector('[data-view-panel="admin-reports"]');
  if(!panel) return;

  const token = await getAccessToken();
  const res = await fetch(`${API_BASE}/api/admin/stats`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if(res.status === 403){
    panel.innerHTML = '<div class="empty">Not authorized.</div>';
    return;
  }
  if(!res.ok){
    document.getElementById('adminCitiesTableBody').innerHTML =
      '<tr><td colspan="3" class="err">Failed to load stats.</td></tr>';
    return;
  }

  const stats = await res.json();
  renderAdminStats(stats);
}

async function refreshAdminUsers(){
  const body = document.getElementById('adminUsersTableBody');
  if(!body) return;

  const token = await getAccessToken();
  const res = await fetch(`${API_BASE}/api/admin/users`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if(res.status === 403){
    body.innerHTML = '<tr><td colspan="3" class="empty">Not authorized.</td></tr>';
    return;
  }
  if(!res.ok){
    body.innerHTML = '<tr><td colspan="3" class="err">Failed to load users.</td></tr>';
    return;
  }

  const users = await res.json();
  body.innerHTML = users.length
    ? users.map(u => `<tr><td>${escapeHtml(u.email || '—')}</td><td>${u.createdAt ? timeAgo(new Date(u.createdAt).getTime()) : '—'}</td><td>${u.lastSignInAt ? timeAgo(new Date(u.lastSignInAt).getTime()) : 'Never'}</td></tr>`).join('')
    : '<tr><td colspan="3" class="empty">No users yet.</td></tr>';
}

function renderAdminStats(s){
  document.getElementById('adminSummaryBar').style.display = '';
  document.getElementById('adminTotalHits').textContent = s.totalHits;
  document.getElementById('adminUniqueUsers').textContent = s.uniqueUsers;
  document.getElementById('adminCities').textContent = s.citiesReached;
  document.getElementById('adminStates').textContent = s.statesReached;
  document.getElementById('adminCountries').textContent = s.countriesReached;
  document.getElementById('adminTopView').textContent = s.topView ? s.topView.section : '—';

  const citiesBody = document.getElementById('adminCitiesTableBody');
  citiesBody.innerHTML = s.topCities.length
    ? s.topCities.map(c => `<tr><td>${escapeHtml(c.city)}</td><td>${escapeHtml(c.country || '')}</td><td>${c.hits}</td></tr>`).join('')
    : '<tr><td colspan="3" class="empty">No city data yet.</td></tr>';

  const recentBody = document.getElementById('adminRecentTableBody');
  recentBody.innerHTML = s.recent.length
    ? s.recent.map(r => `<tr><td>${timeAgo(new Date(r.time).getTime())}</td><td>${escapeHtml(r.city || '—')}</td><td>${escapeHtml(r.section)}</td><td>${r.signedIn ? 'Yes' : 'Guest'}</td><td>${escapeHtml(r.email || '—')}</td></tr>`).join('')
    : '<tr><td colspan="5" class="empty">No activity yet.</td></tr>';
}
