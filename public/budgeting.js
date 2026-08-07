// budgeting.js
// 50/30/20 Calculator + Zero-Based Budget Builder for the Budgeting view.
// Entirely client-side: all state lives in memory here and resets on reload —
// no persistence, no network calls. Self-initializes on DOMContentLoaded.
// Every lookup is null-guarded, so this file is safe to load even before the
// budgeting markup exists on the page.

(function () {

  // ---------------------------------------------------------------
  // Formatting helpers
  // ---------------------------------------------------------------
  function fmtUSD(n) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(n);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  // ---------------------------------------------------------------
  // 50/30/20 CALCULATOR
  // ---------------------------------------------------------------
  function renderB503020() {
    const incomeEl = document.getElementById('b503020-income');
    if (!incomeEl) return;

    const income = Math.max(0, parseFloat(incomeEl.value) || 0);
    const needs = income * 0.5;
    const wants = income * 0.3;
    const savings = income * 0.2;

    setText('b503020-needs-amt', fmtUSD(needs));
    setText('b503020-wants-amt', fmtUSD(wants));
    setText('b503020-savings-amt', fmtUSD(savings));
    setText('b503020-leg-needs', fmtUSD(needs));
    setText('b503020-leg-wants', fmtUSD(wants));
    setText('b503020-leg-savings', fmtUSD(savings));
  }

  // ---------------------------------------------------------------
  // ZERO-BASED BUDGET BUILDER
  // ---------------------------------------------------------------
  // Category state only seeds the row markup — once rows exist, the DOM
  // inputs are the source of truth for computing the remaining balance
  // (same approach as the FIRE/utilization calculators), so typing in one
  // field never gets clobbered by a re-render of the others. State is
  // re-synced from the DOM only right before a structural change
  // (add/remove a row), so in-progress edits to other rows survive it.
  let zbState = [];
  let zbIdCounter = 0;

  const ZB_STARTER_CATEGORIES = [
    { name: 'Rent/Mortgage', amount: 1500 },
    { name: 'Groceries', amount: 400 },
    { name: 'Transportation', amount: 250 },
    { name: 'Subscriptions', amount: 60 },
    { name: 'Dining Out', amount: 150 },
    { name: 'Savings/Investing', amount: 500 }
  ];

  function seedZb() {
    zbState = ZB_STARTER_CATEGORIES.map(c => ({ id: ++zbIdCounter, ...c }));
  }

  function zbRowHtml(cat) {
    return `
      <div class="zb-row" data-id="${cat.id}">
        <div class="calc-input-box zb-name-box">
          <input type="text" class="zb-name-input" data-id="${cat.id}" value="${escapeHtml(cat.name)}">
        </div>
        <div class="calc-input-box zb-amount-box">
          <input type="number" class="zb-amount-input" data-id="${cat.id}" value="${cat.amount}" min="0" step="10">
          <span class="calc-unit">USD</span>
        </div>
        <button class="remove-btn zb-remove-btn" data-id="${cat.id}" type="button" aria-label="Remove category">×</button>
      </div>`;
  }

  function renderZbRows() {
    const container = document.getElementById('zb-rows');
    if (!container) return;
    container.innerHTML = zbState.map(zbRowHtml).join('');
  }

  // Pulls the currently-typed name/amount out of the live DOM back into
  // zbState, so a structural re-render (add/remove) doesn't revert edits
  // the user made to any other row.
  function syncZbStateFromDom() {
    document.querySelectorAll('#zb-rows .zb-row').forEach(rowEl => {
      const id = Number(rowEl.dataset.id);
      const cat = zbState.find(c => c.id === id);
      if (!cat) return;
      const nameInput = rowEl.querySelector('.zb-name-input');
      const amountInput = rowEl.querySelector('.zb-amount-input');
      if (nameInput) cat.name = nameInput.value;
      if (amountInput) cat.amount = parseFloat(amountInput.value) || 0;
    });
  }

  function zbSumPlanned() {
    let sum = 0;
    document.querySelectorAll('#zb-rows .zb-amount-input').forEach(el => {
      sum += parseFloat(el.value) || 0;
    });
    return sum;
  }

  function renderZb() {
    const incomeEl = document.getElementById('zb-income');
    const heroEl = document.getElementById('zb-hero');
    if (!incomeEl || !heroEl) return;

    const income = Math.max(0, parseFloat(incomeEl.value) || 0);
    const planned = zbSumPlanned();
    const remaining = income - planned;

    setText('zb-remaining', fmtUSD(remaining));

    heroEl.classList.remove('calc-amber', 'calc-red');
    const statusEl = document.getElementById('zb-status');
    if (Math.abs(remaining) < 0.005) {
      if (statusEl) statusEl.textContent = 'Balanced — every dollar has a job.';
    } else if (remaining > 0) {
      heroEl.classList.add('calc-amber');
      if (statusEl) statusEl.textContent = `Under-allocated — ${fmtUSD(remaining)} left to assign.`;
    } else {
      heroEl.classList.add('calc-red');
      if (statusEl) statusEl.textContent = `Over-allocated — cut ${fmtUSD(Math.abs(remaining))} to balance.`;
    }
  }

  function initZbEvents() {
    const rowsEl = document.getElementById('zb-rows');
    const incomeEl = document.getElementById('zb-income');
    const addBtn = document.getElementById('zb-add-btn');
    if (!rowsEl) return;

    rowsEl.addEventListener('input', (e) => {
      if (e.target.matches('.zb-amount-input')) renderZb();
    });

    rowsEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.zb-remove-btn');
      if (!btn) return;
      syncZbStateFromDom();
      const id = Number(btn.dataset.id);
      zbState = zbState.filter(c => c.id !== id);
      renderZbRows();
      renderZb();
    });

    if (addBtn) {
      addBtn.addEventListener('click', () => {
        syncZbStateFromDom();
        zbState.push({ id: ++zbIdCounter, name: 'New Category', amount: 0 });
        renderZbRows();
        renderZb();
      });
    }

    if (incomeEl) incomeEl.addEventListener('input', renderZb);
  }

  // ---------------------------------------------------------------
  // Wiring
  // ---------------------------------------------------------------
  function initBudgeting() {
    // If neither tool's markup is on the page yet, do nothing.
    if (!document.getElementById('b503020-income') && !document.getElementById('zb-income')) return;

    const b503020IncomeEl = document.getElementById('b503020-income');
    if (b503020IncomeEl) b503020IncomeEl.addEventListener('input', renderB503020);
    renderB503020();

    if (document.getElementById('zb-income')) {
      seedZb();
      renderZbRows();
      initZbEvents();
      renderZb();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBudgeting);
  } else {
    initBudgeting();
  }

  // Expose for debugging / re-render from other modules.
  window.PulseBudgeting = {
    renderB503020,
    renderZb
  };

})();
