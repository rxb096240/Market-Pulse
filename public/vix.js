// vix.js
// Fetches real CBOE VIX data via the backend proxy and renders it into the
// home dashboard's pulse card (number, delta, and intraday sparkline).
// Colors flip green/red based on direction — VIX rising is "risk-off" (red),
// VIX falling is "risk-on" (green), which is the opposite framing of a stock ticker.

async function refreshVixIndex(){
  const numberEl = document.getElementById('vixNumber');
  const deltaEl = document.getElementById('vixDelta');
  const fillPath = document.getElementById('vixFillPath');
  const linePath = document.getElementById('vixLinePath');
  const axisEl = document.getElementById('vixAxis');
  const liveBadge = document.getElementById('vixLiveBadge');
  if(!numberEl) return;

  try{
    const res = await fetch(`${API_BASE}/api/markets/vix`);
    if(!res.ok) throw new Error('VIX fetch failed');
    const data = await res.json();
    // Expected shape: { price, change, changePercent, points: [{time, close}, ...] }

    const isRising = data.change >= 0;
    const arrow = isRising ? '▲' : '▼';
    const riskLabel = isRising ? 'risk-off' : 'risk-on';
    const color = isRising ? '#FF4D5E' : '#00E39A';

    numberEl.textContent = data.price.toFixed(2);
    numberEl.style.color = color;
    deltaEl.textContent = `${arrow} ${Math.abs(data.change).toFixed(2)} (${Math.abs(data.changePercent).toFixed(1)}%) vs. yesterday — broadly ${riskLabel}`;
    deltaEl.style.color = color;

    if(Array.isArray(data.points) && data.points.length > 1){
      renderVixSparkline(data.points, fillPath, linePath, axisEl, color);
    }

    if(liveBadge){
      liveBadge.querySelector('.led').style.background = color;
      liveBadge.querySelector('.led').style.boxShadow = `0 0 8px ${color}`;
    }
  }catch(e){
    deltaEl.textContent = 'VIX data unavailable right now.';
  }
}

function renderVixSparkline(points, fillPath, linePath, axisEl, color){
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

  if(axisEl && points.length >= 5){
    const labelCount = 5;
    const step = Math.floor(points.length / (labelCount - 1));
    const labels = [];
    for(let i = 0; i < labelCount; i++){
      const idx = Math.min(i * step, points.length - 1);
      labels.push(points[idx].time);
    }
    axisEl.innerHTML = labels.map(t => `<span>${t}</span>`).join('');
  }
}
