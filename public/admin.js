const ADMIN_EMAIL = 'a005.ram@gmail.com'; // same email as server.js

async function refreshAdminReports(){
  const panel = document.querySelector('[data-view-panel="admin-reports"]');
  if(!panel) return;
  if(!currentUser || currentUser.email !== ADMIN_EMAIL){
    panel.innerHTML = '<p>Not authorized.</p>';
    return;
  }
  const token = await getAccessToken();
  const res = await fetch(`${API_BASE}/api/admin/stats`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if(!res.ok){ panel.innerHTML = '<p>Failed to load stats.</p>'; return; }
  const stats = await res.json();
  renderAdminStats(panel, stats);
}

function renderAdminStats(panel, s){
  // Map stats -> your existing wireframe markup structure here
  // (stat cards, topCities table, recent feed) using s.totalHits,
  // s.uniqueUsers, s.citiesReached, s.topView, s.topCities, s.recent
}
