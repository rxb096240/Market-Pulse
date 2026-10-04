// Watchlist price-move push notifications: registers the service worker,
// and wires the "Price alerts" toggle in the auth menu to subscribe/
// unsubscribe via the browser Push API. Signed-in users only -- the server
// checks everyone's saved watchlist against stored subscriptions, so an
// anonymous visitor (no persisted watchlist) has nothing to subscribe for.

const pushToggleBtn = document.getElementById('pushToggleBtn');
const pushHint = document.getElementById('pushHint');

function urlBase64ToUint8Array(base64String){
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function getExistingPushSubscription(){
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

async function refreshPushToggleUI(){
  if (!pushToggleBtn) return;
  if (!currentUser) {
    pushToggleBtn.style.display = 'none';
    if (pushHint) pushHint.style.display = 'none';
    return;
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    pushToggleBtn.style.display = 'none';
    if (pushHint) { pushHint.style.display = ''; pushHint.textContent = 'Price alerts aren’t supported in this browser.'; }
    return;
  }
  pushToggleBtn.style.display = '';
  if (pushHint) { pushHint.style.display = ''; pushHint.textContent = `Get notified when a watchlist symbol moves ±5%.`; }

  const sub = await getExistingPushSubscription();
  pushToggleBtn.textContent = sub ? 'Disable' : 'Enable';
}

async function enablePushAlerts(){
  if (!currentUser) return;
  pushToggleBtn.disabled = true;
  try {
    const keyRes = await fetch(`${API_BASE}/api/push/public-key`);
    if (!keyRes.ok) { pushHint.textContent = 'Price alerts are not available right now.'; return; }
    const { publicKey } = await keyRes.json();

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') { pushHint.textContent = 'Notifications were blocked.'; return; }

    const reg = await navigator.serviceWorker.register('/sw.js');
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });

    const token = await getAccessToken();
    const subJson = sub.toJSON();
    const res = await fetch(`${API_BASE}/api/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ endpoint: subJson.endpoint, keys: subJson.keys })
    });
    if (!res.ok) throw new Error('subscribe request failed');

    pushHint.textContent = `You'll be notified when a watchlist symbol moves ±5%.`;
  } catch (e) {
    console.error('Failed to enable push alerts:', e);
    pushHint.textContent = 'Could not enable price alerts.';
  } finally {
    pushToggleBtn.disabled = false;
    refreshPushToggleUI();
  }
}

async function disablePushAlerts(){
  pushToggleBtn.disabled = true;
  try {
    const sub = await getExistingPushSubscription();
    if (sub) {
      const token = await getAccessToken();
      await fetch(`${API_BASE}/api/push/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ endpoint: sub.endpoint })
      }).catch(() => {});
      await sub.unsubscribe();
    }
    pushHint.textContent = 'Price alerts turned off.';
  } catch (e) {
    console.error('Failed to disable push alerts:', e);
  } finally {
    pushToggleBtn.disabled = false;
    refreshPushToggleUI();
  }
}

pushToggleBtn?.addEventListener('click', async () => {
  const sub = await getExistingPushSubscription();
  if (sub) disablePushAlerts();
  else enablePushAlerts();
});
