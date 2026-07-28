// Fetches and renders the upcoming Earnings Calendar, grouped by day.
// Formats each day's heading and lists symbol/company/time/EPS/revenue estimates per entry.

let earningsLoaded = false;

async function fetchEarningsCalendar(){
  try{
    const data = await fetchJsonWithTimeout(`${API_BASE}/api/earnings/calendar`, 10000);
    return Array.isArray(data) ? data : null;
  }catch(e){
    console.error('Earnings calendar fetch failed:', e);
    return null;
  }
}

function formatDayHeading(dateStr){
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
}

function epsCellHtml(e){
  const hasActual = e.epsActual !== null && e.epsActual !== undefined;
  const hasEstimate = e.epsEstimate !== null && e.epsEstimate !== undefined;
  if(!hasActual) return hasEstimate ? e.epsEstimate.toFixed(2) : '--';
  const cls = hasEstimate ? (e.epsActual >= e.epsEstimate ? 'up' : 'down') : '';
  const est = hasEstimate ? ` <span class="eq-est-inline">(est. ${e.epsEstimate.toFixed(2)})</span>` : '';
  return `<span class="eq-actual ${cls}">${e.epsActual.toFixed(2)}</span>${est}`;
}

function revenueCellHtml(e){
  const hasActual = e.revenueActual !== null && e.revenueActual !== undefined;
  const hasEstimate = e.revenueEstimate !== null && e.revenueEstimate !== undefined;
  if(!hasActual) return hasEstimate ? fmtCap(e.revenueEstimate) : '--';
  const cls = hasEstimate ? (e.revenueActual >= e.revenueEstimate ? 'up' : 'down') : '';
  const est = hasEstimate ? ` <span class="eq-est-inline">(est. ${fmtCap(e.revenueEstimate)})</span>` : '';
  return `<span class="eq-actual ${cls}">${fmtCap(e.revenueActual)}</span>${est}`;
}

function renderEarningsCalendar(days){
  const container = document.getElementById('earningsContainer');
  if(!container) return;

  if(!days || days.length === 0){
    container.innerHTML = '<div class="err">No earnings found in this window.</div>';
    return;
  }

  container.innerHTML = days.map(day => `
    <div class="day-group">
      <div class="day-heading">${formatDayHeading(day.date)}</div>
      <div class="markets-table-wrap">
        <table class="markets-table">
          <thead>
            <tr><th>Symbol</th><th>Company</th><th>Time</th><th>EPS</th><th>Revenue</th></tr>
          </thead>
          <tbody>
            ${day.entries.map(e => `
              <tr>
                <td class="eq-symbol">${escapeHtml(e.symbol)}</td>
                <td class="eq-company">${escapeHtml(e.name)}</td>
                <td><span class="eq-time">${e.hour === 'bmo' ? 'Before Open' : e.hour === 'amc' ? 'After Close' : '—'}</span></td>
                <td>${epsCellHtml(e)}</td>
                <td>${revenueCellHtml(e)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `).join('');
}

async function refreshEarningsCalendar(){
  if(!earningsLoaded){
    const container = document.getElementById('earningsContainer');
    if(container) container.innerHTML = '<div class="news-loading">Loading earnings calendar…</div>';
  }
  const data = await fetchEarningsCalendar();
  if(data) earningsLoaded = true;
  renderEarningsCalendar(data);
}
