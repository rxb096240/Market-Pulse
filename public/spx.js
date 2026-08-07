// spx.js
// Fetches real S&P 500 index data via the backend proxy (/api/markets/spx)
// and renders it into the home dashboard's pulse card: current price, $/%
// change, and a line/area chart for the selected timeframe (1D/5D/1M/6M/1Y).
// Each timeframe's response is cached client-side for the session, so
// switching tabs after the first load re-renders from cache instead of
// refetching an already-seen range.

const spxRangeCache = new Map(); // range -> { price, change, changePercent, range, points }
let spxActiveRange = '1D';

const SPX_RANGE_COPY = {
  '1D': 'vs. yesterday',
  '5D': 'past 5 days',
  '1M': 'past month',
  '6M': 'past 6 months',
  '1Y': 'past year'
};

async function fetchSpxRange(range){
  if(spxRangeCache.has(range)) return spxRangeCache.get(range);
  const res = await fetch(`${API_BASE}/api/markets/spx?range=${range}`);
  if(!res.ok) throw new Error('S&P 500 fetch failed');
  const data = await res.json();
  spxRangeCache.set(range, data);
  return data;
}

async function refreshSpxIndex(range = spxActiveRange){
  const numberEl = document.getElementById('spxNumber');
  const deltaEl = document.getElementById('spxDelta');
  const fillPath = document.getElementById('spxFillPath');
  const linePath = document.getElementById('spxLinePath');
  const axisEl = document.getElementById('spxAxis');
  const liveBadge = document.getElementById('spxLiveBadge');
  if(!numberEl) return;

  spxActiveRange = range;
  if(!spxRangeCache.has(range)) deltaEl.textContent = 'Loading S&P 500…';

  try{
    const data = await fetchSpxRange(range);
    // Expected shape: { price, change, changePercent, range, points: [{time, close}, ...] }

    const isRising = data.change >= 0;
    const arrow = isRising ? '▲' : '▼';
    const color = isRising ? '#00E39A' : '#FF4D5E';

    numberEl.textContent = data.price.toFixed(2);
    numberEl.style.color = color;
    deltaEl.textContent = `${arrow} ${Math.abs(data.change).toFixed(2)} (${Math.abs(data.changePercent).toFixed(1)}%) ${SPX_RANGE_COPY[range] || ''}`;
    deltaEl.style.color = color;

    if(Array.isArray(data.points) && data.points.length > 1){
      renderSpxSparkline(data.points, fillPath, linePath, axisEl, color);
    }

    if(liveBadge){
      liveBadge.querySelector('.led').style.background = color;
      liveBadge.querySelector('.led').style.boxShadow = `0 0 8px ${color}`;
    }
  }catch(e){
    deltaEl.textContent = 'S&P 500 data unavailable right now.';
  }
}

function renderSpxSparkline(points, fillPath, linePath, axisEl, color){
  const closes = points.map(p => p.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = (max - min) || 1;

  const width = 400;
  const height = 110;
  const padTop = 10;
  const padBottom = 10;
  const usableHeight = height - padTop - padBottom;

  const coords = closes.map((c, i) => {
    const x = (i / (closes.length - 1)) * width;
    const y = padTop + (1 - (c - min) / range) * usableHeight;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const lineD = 'M' + coords.join(' L');
  const fillD = `${lineD} L${width},${height} L0,${height} Z`;

  linePath.setAttribute('d', lineD);
  linePath.style.stroke = color;
  fillPath.setAttribute('d', fillD);
  fillPath.style.fill = color;
  fillPath.style.opacity = '0.18';

  if(axisEl && points.length > 1){
    const labelCount = Math.min(5, points.length);
    const step = Math.floor(points.length / (labelCount - 1 || 1));
    const labels = [];
    for(let i = 0; i < labelCount; i++){
      const idx = Math.min(i * step, points.length - 1);
      labels.push(points[idx].time);
    }
    axisEl.innerHTML = labels.map(t => `<span>${t}</span>`).join('');
  }
}

function initSpxTimeframeToggle(){
  const tfEl = document.getElementById('spxTimeframe');
  if(!tfEl) return;
  tfEl.querySelectorAll('div[data-range]').forEach(opt => {
    opt.addEventListener('click', () => {
      if(opt.classList.contains('active')) return;
      tfEl.querySelectorAll('div').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      refreshSpxIndex(opt.dataset.range);
    });
  });
}
initSpxTimeframeToggle();
