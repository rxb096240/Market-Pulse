// Fetches and renders the Forex rates table (via Frankfurter API through our backend).
// Simple fetch -> render -> cache-loaded-flag pattern, no sorting or search.

let forexLoaded = false;

async function fetchForexRates(){
  try{
    const data = await fetchJsonWithTimeout(`${API_BASE}/api/forex/rates`, 8000);
    return data || null;
  }catch(e){
    console.error('Forex rates fetch failed:', e);
    return null;
  }
}

function renderForexTable(data){
  const tbody = document.getElementById('forexTableBody');
  const asOfEl = document.getElementById('forexAsOf');
  if(!tbody) return;

  if(!data || !data.rates || data.rates.length === 0){
    tbody.innerHTML = '<tr><td colspan="3" class="news-loading">Forex data unavailable — try again shortly.</td></tr>';
    return;
  }

if(asOfEl && data.asOf){
  asOfEl.innerHTML = `<span class="as-of">As of ${data.asOf}</span>`;
}
  
  tbody.innerHTML = data.rates.map(r => `
    <tr>
      <td>${escapeHtml(r.currency)}</td>
      <td class="mt-coin-sym">${escapeHtml(r.code)}</td>
      <td>${r.rate.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:4})}</td>
    </tr>
  `).join('');
}

async function refreshForexRates(){
  if(!forexLoaded){
    const tbody = document.getElementById('forexTableBody');
    if(tbody) tbody.innerHTML = '<tr><td colspan="3" class="news-loading">Loading forex rates…</td></tr>';
  }
  const data = await fetchForexRates();
  if(data) forexLoaded = true;
  renderForexTable(data);
}
