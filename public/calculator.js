// calculator.js
// Compound Interest + Mortgage calculators for the Calculators view.
// Self-initializes on DOMContentLoaded. Every lookup is null-guarded,
// so this file is safe to load even before the calc-panel markup exists.

(function () {

  // ---------------------------------------------------------------
  // Formatting helpers
  // ---------------------------------------------------------------
  function fmtUSD(n, decimals) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: decimals != null ? decimals : 0,
      maximumFractionDigits: decimals != null ? decimals : 0
    }).format(n);
  }

  function fmtNum(n) {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
  }

  // Guards against inputs going blank mid-edit (e.g. clearing a field to type
  // a new number). Falls back to the last valid value instead of treating an
  // empty string as 0, so hero stats like the FIRE number don't flash to $0.
  const lastValidFire = { age: 30, savings: 25000, expenses: 40000, contribution: 18000 };

  function safeFloat(el, fallbackKey) {
    if (!el) return lastValidFire[fallbackKey];
    const raw = el.value;
    const parsed = parseFloat(raw);
    if (raw === '' || isNaN(parsed)) return lastValidFire[fallbackKey];
    lastValidFire[fallbackKey] = parsed;
    return parsed;
  }

  // ---------------------------------------------------------------
  // COMPOUND INTEREST
  // ---------------------------------------------------------------
  // Simulates month-by-month growth. The selected compounding
  // frequency (annually/monthly/daily) is converted to an effective
  // monthly rate so contributions can still be applied every month.
  function calculateCompoundInterest({ initial, monthlyContribution, annualRatePct, years, compoundsPerYear }) {
    const r = annualRatePct / 100;
    const periodicRate = r / compoundsPerYear;
    const monthlyRate = Math.pow(1 + periodicRate, compoundsPerYear / 12) - 1;

    const totalMonths = Math.round(years * 12);
    let balance = initial;
    let totalContributions = 0;

    const yearly = []; // { year, contributions, interest, balance }
    let yearStartBalance = initial;
    let yearContributions = 0;

    for (let m = 1; m <= totalMonths; m++) {
      balance = balance * (1 + monthlyRate) + monthlyContribution;
      totalContributions += monthlyContribution;
      yearContributions += monthlyContribution;

      if (m % 12 === 0) {
        const year = m / 12;
        const interestThisYear = balance - yearStartBalance - yearContributions;
        yearly.push({
          year,
          contributions: yearContributions,
          interest: interestThisYear,
          balance
        });
        yearStartBalance = balance;
        yearContributions = 0;
      }
    }

    // Handle a partial final year (e.g. years = 2.5) not caught by the loop above.
    if (totalMonths % 12 !== 0) {
      const year = yearly.length + 1;
      const interestThisYear = balance - yearStartBalance - yearContributions;
      yearly.push({ year, contributions: yearContributions, interest: interestThisYear, balance });
    }

    return {
      futureValue: balance,
      totalContributions: totalContributions + initial,
      totalGrowth: balance - (totalContributions + initial),
      yearly
    };
  }

  function renderCompoundInterest() {
    const initialEl = document.getElementById('ci-initial');
    const contribEl = document.getElementById('ci-contribution');
    const rateEl = document.getElementById('ci-rate');
    const yearsEl = document.getElementById('ci-years');
    const freqEl = document.getElementById('ci-freq');
    if (!initialEl || !contribEl || !rateEl || !yearsEl || !freqEl) return;

    const initial = parseFloat(initialEl.value) || 0;
    const monthlyContribution = parseFloat(contribEl.value) || 0;
    const annualRatePct = parseFloat(rateEl.value) || 0;
    const years = parseFloat(yearsEl.value) || 1;
    const activeFreqBtn = freqEl.querySelector('.active');
    const compoundsPerYear = activeFreqBtn ? parseInt(activeFreqBtn.dataset.freq, 10) : 12;

    document.getElementById('ci-rate-out').textContent = annualRatePct.toFixed(1) + '%';
    document.getElementById('ci-years-out').textContent = years + ' yrs';

    const result = calculateCompoundInterest({ initial, monthlyContribution, annualRatePct, years, compoundsPerYear });

    document.getElementById('ci-fv').textContent = fmtUSD(result.futureValue);
    document.getElementById('ci-delta').textContent =
      '▲ ' + fmtUSD(result.totalGrowth + (monthlyContribution * years * 12)) + ' in growth & contributions';

    renderCompoundBars(result.yearly);
    renderCompoundTable(result.yearly);
  }

  function renderCompoundBars(yearly) {
    const barsEl = document.getElementById('ci-bars');
    const axisEl = document.getElementById('ci-axis');
    if (!barsEl || !axisEl || yearly.length === 0) return;

    const maxBars = 8;
    const step = Math.max(1, Math.ceil(yearly.length / maxBars));
    const sampled = [];
    for (let i = step - 1; i < yearly.length; i += step) sampled.push(yearly[i]);
    if (sampled[sampled.length - 1] !== yearly[yearly.length - 1]) sampled.push(yearly[yearly.length - 1]);

    const maxBalance = Math.max(...sampled.map(y => y.balance));
    barsEl.innerHTML = sampled.map(y => {
      const pct = maxBalance > 0 ? Math.max(4, (y.balance / maxBalance) * 100) : 4;
      return `<div style="height:${pct}%" title="Year ${y.year}: ${fmtUSD(y.balance)}"></div>`;
    }).join('');

    const totalYears = yearly.length;
    const axisPoints = [1, Math.round(totalYears * 0.25), Math.round(totalYears * 0.5), Math.round(totalYears * 0.75), totalYears]
      .filter((v, i, arr) => v > 0 && arr.indexOf(v) === i);
    axisEl.innerHTML = axisPoints.map(y => `<span>Yr ${y}</span>`).join('');
  }

  function renderCompoundTable(yearly) {
    const bodyEl = document.getElementById('ci-table-body');
    if (!bodyEl) return;
    bodyEl.innerHTML = yearly.map(y => `
      <div class="calc-trow">
        <div>${y.year}</div>
        <div>${fmtNum(y.contributions)}</div>
        <div class="calc-pos">${fmtNum(y.interest)}</div>
        <div>${fmtNum(y.balance)}</div>
      </div>
    `).join('');
  }

  // ---------------------------------------------------------------
  // MORTGAGE
  // ---------------------------------------------------------------
  function calculateMortgage({ homePrice, downPayment, termYears, annualRatePct, propertyTaxPctPerYear, insuranceMonthly, hoaMonthly }) {
    const principal = Math.max(0, homePrice - downPayment);
    const monthlyRate = (annualRatePct / 100) / 12;
    const numPayments = Math.round(termYears * 12);

    let monthlyPI;
    if (monthlyRate === 0) {
      monthlyPI = principal / numPayments;
    } else {
      const factor = Math.pow(1 + monthlyRate, numPayments);
      monthlyPI = principal * (monthlyRate * factor) / (factor - 1);
    }

    const propertyTaxMonthly = (homePrice * (propertyTaxPctPerYear / 100)) / 12;
    const totalMonthly = monthlyPI + propertyTaxMonthly + insuranceMonthly + hoaMonthly;

    // Amortization schedule (principal & interest only)
    const schedule = [];
    let balance = principal;
    for (let m = 1; m <= numPayments && balance > 0.01; m++) {
      const interestPortion = balance * monthlyRate;
      let principalPortion = monthlyPI - interestPortion;
      if (principalPortion > balance) principalPortion = balance;
      balance -= principalPortion;
      schedule.push({ month: m, principal: principalPortion, interest: interestPortion, balance: Math.max(0, balance) });
    }

    return {
      principal,
      monthlyPI,
      propertyTaxMonthly,
      totalMonthly,
      numPayments,
      schedule
    };
  }

  // ---------------------------------------------------------------
  // FIRE (Financial Independence, Retire Early)
  // ---------------------------------------------------------------
  function calculateFire({ age, savings, expenses, contribution, annualRatePct, swrPct }) {
    const rate = annualRatePct / 100;
    const swr = swrPct / 100;
    const fireNumber = swr > 0 ? expenses / swr : 0;

    let balance = savings;
    let fiYear = null;
    const yearly = [];
    const maxYears = 60;

    for (let y = 1; y <= maxYears; y++) {
      const growth = balance * rate;
      balance = balance + growth + contribution;
      yearly.push({ year: y, age: age + y, contribution, growth, balance });
      if (balance >= fireNumber && fiYear === null) {
        fiYear = y;
        break; // stop once FI is reached — no need to project further
      }
    }

    return { fireNumber, fiYear, yearly };
  }

  function renderMortgage() {
    const priceEl = document.getElementById('mo-price');
    const downPctEl = document.getElementById('mo-down-pct');
    const termEl = document.getElementById('mo-term');
    const rateEl = document.getElementById('mo-rate');
    const taxPctEl = document.getElementById('mo-tax-pct');
    const insuranceEl = document.getElementById('mo-insurance');
    const hoaEl = document.getElementById('mo-hoa');
    if (!priceEl || !downPctEl || !termEl || !rateEl || !taxPctEl || !insuranceEl || !hoaEl) return;

    const homePrice = parseFloat(priceEl.value) || 0;
    const downPct = parseFloat(downPctEl.value) || 0;
    const downPayment = homePrice * (downPct / 100);
    const termYears = parseFloat(termEl.value) || 30;
    const annualRatePct = parseFloat(rateEl.value) || 0;
    const propertyTaxPctPerYear = parseFloat(taxPctEl.value) || 0;
    const insuranceMonthly = parseFloat(insuranceEl.value) || 0;
    const hoaMonthly = parseFloat(hoaEl.value) || 0;

    document.getElementById('mo-down-pct-out').textContent = downPct.toFixed(0) + '%';
    document.getElementById('mo-down-amount').textContent = fmtNum(downPayment);
    document.getElementById('mo-rate-out').textContent = annualRatePct.toFixed(2) + '%';
    document.getElementById('mo-tax-pct-out').textContent = propertyTaxPctPerYear.toFixed(2) + '%/yr';

    const result = calculateMortgage({ homePrice, downPayment, termYears, annualRatePct, propertyTaxPctPerYear, insuranceMonthly, hoaMonthly });

    document.getElementById('mo-total').textContent = fmtUSD(result.totalMonthly);
    document.getElementById('mo-delta').textContent =
      `Principal & interest ${fmtUSD(result.monthlyPI)} + taxes, insurance & HOA ${fmtUSD(result.propertyTaxMonthly + insuranceMonthly + hoaMonthly)}`;

    renderMortgageDonut(result, insuranceMonthly, hoaMonthly);
    renderMortgageAmortization(result.schedule);
    renderMortgagePayoffDate(result.numPayments);
  }

  function renderMortgageDonut(result, insuranceMonthly, hoaMonthly) {
    const donutEl = document.getElementById('mo-donut');
    if (!donutEl) return;

    const total = result.totalMonthly || 1;
    const piDeg = (result.monthlyPI / total) * 360;
    const taxDeg = (result.propertyTaxMonthly / total) * 360;
    const insDeg = (insuranceMonthly / total) * 360;
    // HOA fills the remainder to avoid rounding gaps

    const c1 = piDeg;
    const c2 = c1 + taxDeg;
    const c3 = c2 + insDeg;

    donutEl.style.background =
      `conic-gradient(var(--calc-blue) 0deg ${c1}deg, #3E8FE0 ${c1}deg ${c2}deg, var(--calc-amber) ${c2}deg ${c3}deg, #4A5A80 ${c3}deg 360deg)`;

    document.getElementById('mo-leg-pi').textContent = fmtNum(result.monthlyPI);
    document.getElementById('mo-leg-tax').textContent = fmtNum(result.propertyTaxMonthly);
    document.getElementById('mo-leg-ins').textContent = fmtNum(insuranceMonthly);
    document.getElementById('mo-leg-hoa').textContent = fmtNum(hoaMonthly);
  }

  function renderMortgageAmortization(schedule) {
    const bodyEl = document.getElementById('mo-amort-body');
    if (!bodyEl) return;
    bodyEl.innerHTML = schedule.map(row => `
      <div class="calc-trow calc-blue">
        <div>${row.month}</div>
        <div class="calc-pos">${fmtNum(row.principal)}</div>
        <div>${fmtNum(row.interest)}</div>
        <div>${fmtNum(row.balance)}</div>
      </div>
    `).join('');
  }

  function renderMortgagePayoffDate(numPayments) {
    const dateEl = document.getElementById('mo-payoff-date');
    const subEl = document.getElementById('mo-payoff-sub');
    if (!dateEl) return;

    const payoff = new Date();
    payoff.setMonth(payoff.getMonth() + numPayments);

    dateEl.textContent = payoff.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (subEl) {
      const years = Math.floor(numPayments / 12);
      const months = numPayments % 12;
      subEl.textContent = `${years} yr${years !== 1 ? 's' : ''}${months ? ' ' + months + ' mo' : ''} from today`;
    }
  }

  function renderFire() {
    const ageEl = document.getElementById('fire-age');
    const savingsEl = document.getElementById('fire-savings');
    const expensesEl = document.getElementById('fire-expenses');
    const contribEl = document.getElementById('fire-contribution');
    const rateEl = document.getElementById('fire-return');
    const swrEl = document.getElementById('fire-swr');
    if (!ageEl || !savingsEl || !expensesEl || !contribEl || !rateEl || !swrEl) return;

    const age = safeFloat(ageEl, 'age');
    const savings = safeFloat(savingsEl, 'savings');
    const expenses = safeFloat(expensesEl, 'expenses');
    const contribution = safeFloat(contribEl, 'contribution');
    const annualRatePct = parseFloat(rateEl.value) || 0;
    const swrPct = parseFloat(swrEl.value) || 0.1; // guard div-by-zero; slider min is 2 anyway

    document.getElementById('fire-return-out').textContent = annualRatePct.toFixed(1) + '%';
    document.getElementById('fire-swr-out').textContent = swrPct.toFixed(1) + '%';

    const result = calculateFire({ age, savings, expenses, contribution, annualRatePct, swrPct });

    document.getElementById('fire-number').textContent = fmtUSD(result.fireNumber);
    document.getElementById('fire-delta').textContent = result.fiYear
      ? `Years to FI: ${result.fiYear} (age ${age + result.fiYear})`
      : 'Years to FI: 60+ — try increasing contributions';

    renderFireBars(result.yearly, result.fireNumber);
    renderFireTable(result.yearly, result.fiYear);
  }

  function renderFireBars(yearly, fireNumber) {
    const barsEl = document.getElementById('fire-bars');
    const axisEl = document.getElementById('fire-axis');
    if (!barsEl || !axisEl || yearly.length === 0) return;

    const maxBalance = Math.max(...yearly.map(y => y.balance), fireNumber);
    barsEl.innerHTML = yearly.map(y => {
      const pct = maxBalance > 0 ? Math.max(4, (y.balance / maxBalance) * 100) : 4;
      return `<div style="height:${pct}%" title="Age ${y.age}: ${fmtUSD(y.balance)}"></div>`;
    }).join('');

    const totalYears = yearly.length;
    const axisPoints = [1, Math.round(totalYears * 0.25), Math.round(totalYears * 0.5), Math.round(totalYears * 0.75), totalYears]
      .filter((v, i, arr) => v > 0 && arr.indexOf(v) === i);
    axisEl.innerHTML = axisPoints.map(y => `<span>Yr ${y}</span>`).join('');
  }

  function renderFireTable(yearly, fiYear) {
    const bodyEl = document.getElementById('fire-table-body');
    if (!bodyEl) return;
    bodyEl.innerHTML = yearly.map(y => `
      <div class="calc-trow${y.year === fiYear ? ' fi-year' : ''}">
        <div>${y.age}${y.year === fiYear ? ' 🔥' : ''}</div>
        <div>${fmtNum(y.contribution)}</div>
        <div class="calc-pos">${fmtNum(y.growth)}</div>
        <div>${fmtNum(y.balance)}</div>
      </div>
    `).join('');
  }

  // ---------------------------------------------------------------
  // Wiring: sub-tabs (Compound / Mortgage), segmented controls,
  // and input listeners.
  // ---------------------------------------------------------------
  function initSubTabs() {
    const subtabs = document.querySelectorAll('.calc-subtab');
    const views = document.querySelectorAll('.calc-view');
    if (!subtabs.length) return;

    subtabs.forEach(btn => {
      btn.addEventListener('click', () => {
        subtabs.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const target = btn.dataset.calc;
        views.forEach(v => v.classList.toggle('active', v.dataset.calcView === target));
      });
    });
  }

  function initFrequencySegmented() {
    const freqEl = document.getElementById('ci-freq');
    if (!freqEl) return;
    freqEl.querySelectorAll('div[data-freq]').forEach(opt => {
      opt.addEventListener('click', () => {
        freqEl.querySelectorAll('div').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        renderCompoundInterest();
      });
    });
  }

  function initMortgageModeSegmented() {
    const modeEl = document.getElementById('mo-mode');
    if (!modeEl) return;
    const modeViews = document.querySelectorAll('.calc-mode-view');
    modeEl.querySelectorAll('div[data-mode]').forEach(opt => {
      opt.addEventListener('click', () => {
        modeEl.querySelectorAll('div').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        const target = opt.dataset.mode;
        modeViews.forEach(v => {
          v.hidden = v.dataset.modeView !== target;
        });
      });
    });
  }

  function initInputListeners() {
    const ciInputs = ['ci-initial', 'ci-contribution', 'ci-rate', 'ci-years'];
    ciInputs.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', renderCompoundInterest);
    });

 const moInputs = ['mo-price', 'mo-down-pct', 'mo-term', 'mo-rate', 'mo-tax-pct', 'mo-insurance', 'mo-hoa'];
    moInputs.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', renderMortgage);
    });

    const fireInputs = ['fire-age', 'fire-savings', 'fire-expenses', 'fire-contribution', 'fire-return', 'fire-swr'];
    fireInputs.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', renderFire);
    });
  }

  function initCalculators() {
    // If the calculator markup isn't on the page yet, do nothing.
    if (!document.querySelector('.calc-panel')) return;

    initSubTabs();
    initFrequencySegmented();
    initMortgageModeSegmented();
    initInputListeners();

    renderCompoundInterest();
    renderMortgage();
    renderFire();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCalculators);
  } else {
    initCalculators();
  }

  // Expose for debugging / re-render from other modules (e.g. if
  // your nav.js needs to force a re-render when the view becomes visible).
 window.PulseCalculators = {
    renderCompoundInterest,
    renderMortgage,
    renderFire,
    calculateCompoundInterest,
    calculateMortgage,
    calculateFire
  };

})();
