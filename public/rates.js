// Personal finance rates (mortgage, savings/CD, loan reference rate) via FRED.
// Simple fetch -> group -> render pattern, no sorting or search.

let ratesLoaded = false;

const RATES_GROUP_LABELS = {
  mortgage: 'Mortgage',
  savings: 'Savings & CDs',
  loans: 'Loans'
};
const RATES_GROUP_ORDER = ['mortgage', 'savings', 'loans'];

async function fetchRatesSummary(){
  try{
    const data = await fetchJsonWithTimeout(`${API_BASE}/api/rates/summary`, 10000);
    return Array.isArray(data) ? data : [];
  }catch(e){
    console.error('Rates summary fetch failed:', e);
    return [];
  }
}

function renderRates(items){
  const el = document.getElementById('ratesContainer');
  const asOfEl = document.getElementById('ratesAsOf');
  if(!el) return;

  if(items.length === 0){
    el.innerHTML = '<div class="news-loading">Rates unavailable — try again shortly.</div>';
    return;
  }

  const latestDate = items.map(i => i.date).filter(Boolean).sort().reverse()[0];
  if(asOfEl && latestDate){
    asOfEl.innerHTML = `<span class="as-of">As of ${latestDate}</span>`;
  }

  const groups = {};
  items.forEach(item => {
    if(!groups[item.group]) groups[item.group] = [];
    groups[item.group].push(item);
  });

  el.innerHTML = RATES_GROUP_ORDER.filter(g => groups[g]).map(g => `
    <div class="rates-section">
      <div class="rates-section-title">${escapeHtml(RATES_GROUP_LABELS[g] || g)}</div>
      <div class="rates-cards">
        ${groups[g].map(item => `
          <div class="rate-card">
            <div class="rate-card-label">${escapeHtml(item.label)}</div>
            <div class="rate-card-value">${item.value !== null ? item.value.toFixed(2) + '%' : '--'}</div>
            ${item.note ? `<div class="rate-card-note">${escapeHtml(item.note)}</div>` : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

async function refreshRatesSummary(){
  if(!ratesLoaded){
    const el = document.getElementById('ratesContainer');
    if(el) el.innerHTML = '<div class="news-loading">Loading rates…</div>';
  }
  const items = await fetchRatesSummary();
  if(items.length > 0) ratesLoaded = true;
  renderRates(items);
}
