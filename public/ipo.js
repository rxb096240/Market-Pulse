// Fetches and renders the upcoming IPO Calendar (Finnhub /calendar/ipo).
// Filtering (date window, exchange) happens client-side against the single
// cached fetch — IPO volume is low (~1/day avg), so there's no need to
// refetch per filter change.

let ipoCalendarData = [];
let ipoCalendarLoaded = false;
let ipoWindowFilter = '7';
let ipoExchangeFilter = 'all';

async function fetchIpoCalendar(){
  try{
    const data = await fetchJsonWithTimeout(`${API_BASE}/api/ipo/calendar`, 10000);
    return Array.isArray(data) ? data : null;
  }catch(e){
    console.error('IPO calendar fetch failed:', e);
    return null;
  }
}

function ipoDateInWindow(dateStr, windowVal){
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if(d < today) return false;

  if(windowVal === '7'){
    const end = new Date(today);
    end.setDate(end.getDate() + 7);
    return d <= end;
  }
  if(windowVal === '30'){
    const end = new Date(today);
    end.setDate(end.getDate() + 30);
    return d <= end;
  }
  if(windowVal === 'month'){
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return d <= end;
  }
  return true;
}

function ipoExchangeMatches(exchange, filterVal){
  if(filterVal === 'all') return true;
  const ex = (exchange || '').toUpperCase();
  if(filterVal === 'NASDAQ') return ex.includes('NASDAQ');
  if(filterVal === 'NYSE') return ex.includes('NYSE') || ex.includes('NEW YORK');
  return true;
}

function formatIpoDate(dateStr){
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function ipoPriceCellHtml(ipo){
  if(ipo.price === null || ipo.price === undefined) return '--';
  const est = ipo.priceIsRange ? ' <span class="eq-est-inline">(est.)</span>' : '';
  return `$${fmtPrice(ipo.price)}${est}`;
}

function ipoValuationCellHtml(ipo){
  if(ipo.valuation === null || ipo.valuation === undefined) return '--';
  const est = ipo.priceIsRange ? ' <span class="eq-est-inline">est.</span>' : '';
  return `${fmtCap(ipo.valuation)}${est}`;
}

function renderIpoCalendar(){
  const tbody = document.getElementById('ipoCalendarTableBody');
  if(!tbody) return;

  const filtered = ipoCalendarData.filter(ipo =>
    ipoDateInWindow(ipo.date, ipoWindowFilter) && ipoExchangeMatches(ipo.exchange, ipoExchangeFilter)
  );

  if(filtered.length === 0){
    tbody.innerHTML = '<tr><td colspan="6" class="news-loading">No IPOs found in this window.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(ipo => {
    const companyLabel = `${ipo.name}${ipo.symbol ? ` (${ipo.symbol})` : ''}`;
    return `
    <tr>
      <td class="eq-symbol" title="${escapeHtml(companyLabel)}">${escapeHtml(companyLabel)}</td>
      <td>${formatIpoDate(ipo.date)}</td>
      <td title="${escapeHtml(ipo.exchange || '')}">${escapeHtml(ipo.exchange || '--')}</td>
      <td>${ipoPriceCellHtml(ipo)}</td>
      <td>${ipo.sharesOutstanding ? Number(ipo.sharesOutstanding).toLocaleString('en-US') : '--'}</td>
      <td class="eq-actual up">${ipoValuationCellHtml(ipo)}</td>
    </tr>
  `;
  }).join('');
}

async function refreshIpoCalendar(){
  if(!ipoCalendarLoaded){
    const tbody = document.getElementById('ipoCalendarTableBody');
    if(tbody) tbody.innerHTML = '<tr><td colspan="6" class="news-loading">Loading IPO calendar…</td></tr>';
  }
  const data = await fetchIpoCalendar();
  if(data){
    ipoCalendarData = data;
    ipoCalendarLoaded = true;
  }
  renderIpoCalendar();
}

const ipoWindowSelect = document.getElementById('ipoWindowSelect');
ipoWindowSelect?.addEventListener('change', () => {
  ipoWindowFilter = ipoWindowSelect.value;
  renderIpoCalendar();
});

const ipoExchangeSelect = document.getElementById('ipoExchangeSelect');
ipoExchangeSelect?.addEventListener('change', () => {
  ipoExchangeFilter = ipoExchangeSelect.value;
  renderIpoCalendar();
});
