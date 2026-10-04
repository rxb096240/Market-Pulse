// In-app watchlist alert history (bell icon in the header). Reads/marks-read
// go straight through supabaseClient (RLS scopes rows to auth.uid()) -- rows
// themselves are written server-side in checkWatchlistAlerts (server.js),
// one per push notification that fires, so this is a history view on top of
// the same alerts, not a separate opt-in.

const notifBellWrap = document.getElementById('notifBellWrap');
const notifBellBtn = document.getElementById('notifBellBtn');
const notifBadge = document.getElementById('notifBadge');
const notifPanel = document.getElementById('notifPanel');
const notifList = document.getElementById('notifList');

let latestNotifRows = [];
let notifPollTimer = null;

function renderNotifList(rows){
  if(!notifList) return;
  if(!rows || rows.length === 0){
    notifList.innerHTML = '<div class="notif-empty">No alerts yet.</div>';
    return;
  }
  notifList.innerHTML = rows.map(n => `
    <div class="notif-item${n.read ? '' : ' unread'}">
      <div class="notif-item-top ${n.direction}">
        <span>${escapeHtml(n.sym)} ${n.direction === 'up' ? '▲' : '▼'} ${Math.abs(n.change_pct).toFixed(1)}%</span>
        <span class="notif-item-time">${timeAgo(new Date(n.created_at).getTime())}</span>
      </div>
      <div class="notif-item-body">${escapeHtml(n.name)}</div>
    </div>
  `).join('');
}

function updateNotifBadge(){
  if(!notifBadge) return;
  const unreadCount = latestNotifRows.filter(n => !n.read).length;
  if(unreadCount > 0){
    notifBadge.textContent = unreadCount > 9 ? '9+' : String(unreadCount);
    notifBadge.style.display = '';
  }else{
    notifBadge.style.display = 'none';
  }
}

async function refreshNotifBell(){
  if(!notifBellWrap) return;
  if(!currentUser){
    notifBellWrap.style.display = 'none';
    notifPanel?.classList.remove('open');
    latestNotifRows = [];
    return;
  }
  notifBellWrap.style.display = '';

  const { data, error } = await supabaseClient
    .from('notifications')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false })
    .limit(20);

  if(error){ console.error('Failed to load notifications:', error); return; }

  latestNotifRows = data || [];
  updateNotifBadge();
  if(notifPanel?.classList.contains('open')) renderNotifList(latestNotifRows);
}

async function markAllNotificationsRead(){
  if(!currentUser) return;
  const unreadIds = latestNotifRows.filter(n => !n.read).map(n => n.id);
  if(unreadIds.length === 0) return;

  latestNotifRows.forEach(n => { n.read = true; }); // optimistic, keeps the just-opened list's highlighting intact
  updateNotifBadge();

  const { error } = await supabaseClient
    .from('notifications')
    .update({ read: true })
    .eq('user_id', currentUser.id)
    .in('id', unreadIds);
  if(error) console.error('Failed to mark notifications read:', error);
}

notifBellBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  const opening = !notifPanel.classList.contains('open');
  notifPanel.classList.toggle('open');
  if(opening){
    renderNotifList(latestNotifRows);
    markAllNotificationsRead();
  }
});

document.addEventListener('click', (e) => {
  if(notifPanel?.classList.contains('open') && !notifBellWrap.contains(e.target)) notifPanel.classList.remove('open');
});

function startNotifPolling(){
  clearInterval(notifPollTimer);
  notifPollTimer = setInterval(refreshNotifBell, 2 * 60_000);
}
startNotifPolling();
