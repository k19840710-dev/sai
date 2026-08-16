'use strict';

/**
 * カード家計簿 - クレジットカード月次利用管理アプリ
 * データはすべてブラウザの localStorage に保存される（サーバー通信なし）。
 * ストレージキー・データ構造は既存バージョンと互換性を保っている。
 */

const STORAGE_KEYS = {
  entries: 'ccTracker.entries',
  cards: 'ccTracker.cards',
};

const DEFAULT_CARDS = ['メインカード'];

const state = {
  entries: [],
  cards: [],
  activeTab: 'dashboard',

  // Dashboard
  rankPeriod: 'thisMonth',   // thisMonth | lastMonth | thisYear | all
  trendMode: 'total',        // total | card
  trendCard: null,
  detailCard: null,

  // Ledger
  currentMonth: toMonthKey(new Date()),
  search: '',
};

// ---------- Storage ----------

function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.entries);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('明細の読み込みに失敗しました', e);
    return [];
  }
}
function saveEntries() { localStorage.setItem(STORAGE_KEYS.entries, JSON.stringify(state.entries)); }

function loadCards() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.cards);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && parsed.length ? parsed : [...DEFAULT_CARDS];
  } catch (e) {
    console.error('カード一覧の読み込みに失敗しました', e);
    return [...DEFAULT_CARDS];
  }
}
function saveCards() { localStorage.setItem(STORAGE_KEYS.cards, JSON.stringify(state.cards)); }

// ---------- Date / format utils ----------

function toMonthKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
function addMonths(monthKey, delta) {
  const [y, m] = monthKey.split('-').map(Number);
  return toMonthKey(new Date(y, m - 1 + delta, 1));
}
function monthShortLabel(monthKey) { return `${Number(monthKey.slice(5, 7))}月`; }
function monthFullLabel(monthKey) { return `${monthKey.slice(0, 4)}年${Number(monthKey.slice(5, 7))}月`; }
function monthRange(startKey, endKey) {
  const [sy, sm] = startKey.split('-').map(Number);
  const [ey, em] = endKey.split('-').map(Number);
  const out = [];
  let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

function formatYen(n) { return '¥' + Math.round(n || 0).toLocaleString('ja-JP'); }
function formatNumber(n) { return Math.round(n || 0).toLocaleString('ja-JP'); }
function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
function uid() { return 'e_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8); }

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

// ---------- Aggregation ----------

function sumBy(entries) { return entries.reduce((sum, e) => sum + Number(e.amount), 0); }

function cardTotalsSorted(entries) {
  const map = new Map();
  for (const e of entries) map.set(e.card, (map.get(e.card) || 0) + Number(e.amount));
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function periodPredicate(period) {
  const now = new Date();
  const thisKey = toMonthKey(now);
  const lastKey = addMonths(thisKey, -1);
  const thisYear = String(now.getFullYear());
  switch (period) {
    case 'thisMonth': return (e) => e.date.slice(0, 7) === thisKey;
    case 'lastMonth': return (e) => e.date.slice(0, 7) === lastKey;
    case 'thisYear': return (e) => e.date.slice(0, 4) === thisYear;
    case 'all':
    default: return () => true;
  }
}

/** Builds a continuous monthly series (zero-filled) spanning the min..max month present in `entries`. */
function monthlySeries(entries) {
  if (!entries.length) return [];
  const sums = new Map();
  let min = null, max = null;
  for (const e of entries) {
    const mk = e.date.slice(0, 7);
    sums.set(mk, (sums.get(mk) || 0) + Number(e.amount));
    if (!min || mk < min) min = mk;
    if (!max || mk > max) max = mk;
  }
  return monthRange(min, max).map((k) => ({
    key: k,
    xLabel: monthShortLabel(k),
    fullLabel: monthFullLabel(k),
    value: sums.get(k) || 0,
  }));
}

// ---------- DOM refs ----------

const els = {
  tabDashboard: document.getElementById('tab-dashboard'),
  tabLedger: document.getElementById('tab-ledger'),
  viewDashboard: document.getElementById('view-dashboard'),
  viewLedger: document.getElementById('view-ledger'),

  heroTotal: document.getElementById('hero-total'),
  heroCompare: document.getElementById('hero-compare'),

  periodToggle: document.getElementById('period-toggle'),
  rankList: document.getElementById('rank-list'),
  rankEmpty: document.getElementById('rank-empty'),
  rankTotal: document.getElementById('rank-total'),
  rankTotalValue: document.getElementById('rank-total-value'),

  trendToggle: document.getElementById('trend-toggle'),
  trendCardSelect: document.getElementById('trend-card-select'),
  trendChartWrap: document.getElementById('trend-chart-wrap'),
  trendEmpty: document.getElementById('trend-empty'),

  form: document.getElementById('entry-form'),
  entryId: document.getElementById('entry-id'),
  date: document.getElementById('date'),
  card: document.getElementById('card'),
  amount: document.getElementById('amount'),
  category: document.getElementById('category'),
  memo: document.getElementById('memo'),
  submitBtn: document.getElementById('submit-btn'),
  cancelEditBtn: document.getElementById('cancel-edit-btn'),

  monthPicker: document.getElementById('month-picker'),
  prevMonth: document.getElementById('prev-month'),
  nextMonth: document.getElementById('next-month'),

  entryList: document.getElementById('entry-list'),
  emptyState: document.getElementById('empty-state'),
  search: document.getElementById('search'),

  exportBtn: document.getElementById('export-btn'),
  importBtn: document.getElementById('import-btn'),
  importFile: document.getElementById('import-file'),

  manageCardsBtn: document.getElementById('manage-cards-btn'),
  cardModal: document.getElementById('card-modal'),
  cardManageList: document.getElementById('card-manage-list'),
  newCardName: document.getElementById('new-card-name'),
  addCardBtn: document.getElementById('add-card-btn'),
  closeModalBtn: document.getElementById('close-modal-btn'),

  cardDetail: document.getElementById('card-detail'),
  cardDetailPanel: document.getElementById('card-detail-panel'),
  detailBack: document.getElementById('detail-back'),
  detailTitle: document.getElementById('detail-title'),
  detailThisMonth: document.getElementById('detail-this-month'),
  detailLastMonth: document.getElementById('detail-last-month'),
  detailYearTotal: document.getElementById('detail-year-total'),
  detailAvg: document.getElementById('detail-avg'),
  detailMax: document.getElementById('detail-max'),
  detailMaxMonth: document.getElementById('detail-max-month'),
  detailChartWrap: document.getElementById('detail-chart-wrap'),
  detailEmpty: document.getElementById('detail-empty'),
};

// ============================================================
// Chart (hand-rolled SVG line chart — no external dependency)
// ============================================================

const CHART_HEIGHT = 180;
const PAD_TOP = 20;
const PAD_BOTTOM = 26;
const PAD_LEFT = 54;
const PAD_RIGHT = 44;
const MIN_POINT_GAP = 46;

function niceCeil(value) {
  if (value <= 0) return 1;
  const exp = Math.floor(Math.log10(value));
  const base = Math.pow(10, exp);
  const fraction = value / base;
  let niceFraction;
  if (fraction <= 1) niceFraction = 1;
  else if (fraction <= 2) niceFraction = 2;
  else if (fraction <= 5) niceFraction = 5;
  else niceFraction = 10;
  return niceFraction * base;
}

function renderTrendChart(container, series) {
  container.innerHTML = '';
  if (!series.length) return;

  const NS = 'http://www.w3.org/2000/svg';
  const containerWidth = container.clientWidth || 320;
  const neededWidth = PAD_LEFT + PAD_RIGHT + Math.max(series.length - 1, 0) * MIN_POINT_GAP
    + (series.length === 1 ? 60 : 0);
  const width = Math.max(containerWidth, neededWidth);
  const innerW = width - PAD_LEFT - PAD_RIGHT;
  const innerH = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;

  const maxVal = Math.max(...series.map((p) => p.value));
  const niceMax = niceCeil(maxVal || 1);

  const xAt = (i) => PAD_LEFT + (series.length === 1 ? innerW / 2 : (innerW * i) / (series.length - 1));
  const yAt = (v) => PAD_TOP + innerH - (v / niceMax) * innerH;

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${CHART_HEIGHT}`);
  svg.setAttribute('width', width);
  svg.setAttribute('height', CHART_HEIGHT);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label',
    `${series[0].fullLabel}から${series[series.length - 1].fullLabel}までの支払額推移。直近は${formatYen(series[series.length - 1].value)}。`);

  // Gridlines (0 / mid / max) with clean, comma-formatted labels
  [0, 0.5, 1].forEach((frac) => {
    const y = yAt(niceMax * frac);
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', PAD_LEFT); line.setAttribute('x2', width - PAD_RIGHT);
    line.setAttribute('y1', y); line.setAttribute('y2', y);
    line.setAttribute('class', 'chart-grid');
    svg.appendChild(line);

    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', PAD_LEFT - 8);
    label.setAttribute('y', y + 3);
    label.setAttribute('text-anchor', 'end');
    label.setAttribute('class', 'chart-axis-label');
    label.textContent = formatYen(niceMax * frac);
    svg.appendChild(label);
  });

  // Area + line
  let lineD = '';
  series.forEach((p, i) => { lineD += `${i === 0 ? 'M' : 'L'}${xAt(i)},${yAt(p.value)} `; });
  const baseline = PAD_TOP + innerH;
  const areaD = `${lineD}L${xAt(series.length - 1)},${baseline} L${xAt(0)},${baseline} Z`;

  const area = document.createElementNS(NS, 'path');
  area.setAttribute('d', areaD);
  area.setAttribute('class', 'chart-area');
  svg.appendChild(area);

  const line = document.createElementNS(NS, 'path');
  line.setAttribute('d', lineD.trim());
  line.setAttribute('class', 'chart-line');
  svg.appendChild(line);

  // Crosshair (hidden until interaction)
  const crosshair = document.createElementNS(NS, 'line');
  crosshair.setAttribute('y1', PAD_TOP);
  crosshair.setAttribute('y2', baseline);
  crosshair.setAttribute('x1', xAt(series.length - 1));
  crosshair.setAttribute('x2', xAt(series.length - 1));
  crosshair.setAttribute('class', 'chart-crosshair');
  svg.appendChild(crosshair);

  // X labels (thin out when there are many months) + dots
  const labelStep = Math.max(1, Math.ceil(series.length / 12));
  const dots = [];
  series.forEach((p, i) => {
    const isLast = i === series.length - 1;
    const x = xAt(i), y = yAt(p.value);

    if (i === 0 || isLast || i % labelStep === 0) {
      const xl = document.createElementNS(NS, 'text');
      xl.setAttribute('x', x); xl.setAttribute('y', CHART_HEIGHT - 6);
      xl.setAttribute('text-anchor', 'middle');
      xl.setAttribute('class', 'chart-x-label');
      xl.textContent = p.xLabel;
      svg.appendChild(xl);
    }

    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('cx', x); dot.setAttribute('cy', y);
    dot.setAttribute('r', isLast ? 5 : 3.5);
    dot.setAttribute('class', 'chart-dot' + (isLast ? ' chart-dot-last' : ''));
    svg.appendChild(dot);
    dots.push(dot);
  });

  // Direct end label — the value at the most recent point, always visible
  const lastPoint = series[series.length - 1];
  const lastX = xAt(series.length - 1);
  const lastY = yAt(lastPoint.value);
  const endLabel = document.createElementNS(NS, 'text');
  const labelAbove = lastY - 10 >= PAD_TOP;
  endLabel.setAttribute('x', Math.min(lastX, width - PAD_RIGHT));
  endLabel.setAttribute('y', labelAbove ? lastY - 10 : lastY + 16);
  endLabel.setAttribute('text-anchor', series.length === 1 ? 'middle' : 'end');
  endLabel.setAttribute('class', 'chart-end-label');
  endLabel.textContent = formatYen(lastPoint.value);
  svg.appendChild(endLabel);

  // Full-height hit area for pointer tracking (drawn last = on top)
  const hit = document.createElementNS(NS, 'rect');
  hit.setAttribute('x', 0); hit.setAttribute('y', 0);
  hit.setAttribute('width', width); hit.setAttribute('height', CHART_HEIGHT);
  hit.setAttribute('class', 'chart-hit');
  svg.appendChild(hit);

  container.appendChild(svg);

  // Tooltip (HTML overlay, scrolls together with the chart)
  container.style.position = 'relative';
  const tooltip = document.createElement('div');
  tooltip.className = 'chart-tooltip';
  tooltip.innerHTML = '<span class="tt-value"></span><span class="tt-label"></span>';
  container.appendChild(tooltip);
  const ttValue = tooltip.querySelector('.tt-value');
  const ttLabel = tooltip.querySelector('.tt-label');

  function showAt(i) {
    dots.forEach((d) => d.classList.remove('is-active'));
    dots[i].classList.add('is-active');
    const x = xAt(i), y = yAt(series[i].value);
    crosshair.setAttribute('x1', x); crosshair.setAttribute('x2', x);
    crosshair.classList.add('is-visible');
    ttValue.textContent = formatYen(series[i].value);
    ttLabel.textContent = series[i].fullLabel;
    tooltip.style.left = x + 'px';
    tooltip.style.top = Math.max(y - 12, 4) + 'px';
    tooltip.classList.add('is-visible');
  }
  function hideTooltip() {
    crosshair.classList.remove('is-visible');
    tooltip.classList.remove('is-visible');
    dots.forEach((d) => d.classList.remove('is-active'));
  }
  function indexFromClientX(clientX) {
    const rect = svg.getBoundingClientRect();
    const scale = rect.width ? width / rect.width : 1;
    const localX = (clientX - rect.left) * scale;
    let closest = 0, closestDist = Infinity;
    series.forEach((p, i) => {
      const dist = Math.abs(xAt(i) - localX);
      if (dist < closestDist) { closestDist = dist; closest = i; }
    });
    return closest;
  }

  hit.addEventListener('pointermove', (ev) => showAt(indexFromClientX(ev.clientX)));
  hit.addEventListener('pointerdown', (ev) => showAt(indexFromClientX(ev.clientX)));
  hit.addEventListener('pointerleave', hideTooltip);

  // Scroll to the latest data by default
  requestAnimationFrame(() => { container.scrollLeft = container.scrollWidth; });
}

// ============================================================
// Dashboard rendering
// ============================================================

function renderDashboard() {
  renderHero();
  renderRankSection();
  renderTrendSection();
}

function renderHero() {
  const now = new Date();
  const thisKey = toMonthKey(now);
  const lastKey = addMonths(thisKey, -1);
  const thisTotal = sumBy(state.entries.filter((e) => e.date.slice(0, 7) === thisKey));
  const lastTotal = sumBy(state.entries.filter((e) => e.date.slice(0, 7) === lastKey));

  els.heroTotal.textContent = formatYen(thisTotal);

  if (lastTotal === 0 && thisTotal === 0) {
    els.heroCompare.innerHTML = '<span class="prev-label">先月・今月ともに記録はまだありません</span>';
    return;
  }
  if (lastTotal === 0) {
    els.heroCompare.innerHTML = `<span class="prev-label">先月の記録なし</span>`;
    return;
  }

  const diff = thisTotal - lastTotal;
  const pct = (diff / lastTotal) * 100;

  let dir = 'is-flat', arrow = '―';
  if (diff > 0) { dir = 'is-up'; arrow = '▲'; }
  else if (diff < 0) { dir = 'is-down'; arrow = '▼'; }
  const sign = diff > 0 ? '+' : diff < 0 ? '−' : '±';

  els.heroCompare.innerHTML = `
    <span class="prev-label">先月 <span class="prev-value">${formatYen(lastTotal)}</span></span>
    <span class="delta-chip ${dir}">${arrow} ${sign}${formatNumber(Math.abs(diff))}円（${sign}${Math.abs(pct).toFixed(1)}%）</span>
  `;
}

function renderRankSection() {
  const filtered = state.entries.filter(periodPredicate(state.rankPeriod));
  const sorted = cardTotalsSorted(filtered);
  const total = sumBy(filtered);

  if (!sorted.length) {
    els.rankList.innerHTML = '';
    els.rankEmpty.hidden = false;
    els.rankTotal.hidden = true;
    return;
  }
  els.rankEmpty.hidden = true;
  els.rankTotal.hidden = false;

  const max = sorted[0][1];
  els.rankList.innerHTML = sorted.map(([card, amount], i) => `
    <li class="rank-item" data-card="${escapeHtml(card)}" tabindex="0" role="button" aria-label="${escapeHtml(card)}の詳細を見る">
      <span class="rank-num">${i + 1}</span>
      <div class="rank-main">
        <div class="rank-row">
          <span class="rank-name">${escapeHtml(card)}</span>
          <span class="rank-amount">${formatYen(amount)}</span>
        </div>
        <div class="rank-bar"><div class="rank-bar-fill" style="width:${max ? (amount / max) * 100 : 0}%"></div></div>
      </div>
      <span class="rank-chevron" aria-hidden="true">›</span>
    </li>
  `).join('');
  els.rankTotalValue.textContent = formatYen(total);
}

function renderTrendSection() {
  if (state.trendMode === 'card') {
    els.trendCardSelect.hidden = false;
    const current = els.trendCardSelect.value;
    els.trendCardSelect.innerHTML = state.cards.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    const preferred = (current && state.cards.includes(current)) ? current
      : (state.trendCard && state.cards.includes(state.trendCard)) ? state.trendCard
      : state.cards[0];
    if (preferred) els.trendCardSelect.value = preferred;
    state.trendCard = els.trendCardSelect.value;
  } else {
    els.trendCardSelect.hidden = true;
  }

  const series = state.trendMode === 'total'
    ? monthlySeries(state.entries)
    : monthlySeries(state.entries.filter((e) => e.card === state.trendCard));

  if (!series.length) {
    els.trendChartWrap.innerHTML = '';
    els.trendEmpty.hidden = false;
    return;
  }
  els.trendEmpty.hidden = true;
  renderTrendChart(els.trendChartWrap, series);
}

// ---------- Card detail overlay ----------

function openCardDetail(card) {
  state.detailCard = card;
  els.detailTitle.textContent = card;
  els.cardDetail.hidden = false;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) els.cardDetailPanel.classList.add('is-open');
  else requestAnimationFrame(() => els.cardDetailPanel.classList.add('is-open'));
  document.body.style.overflow = 'hidden';

  renderCardDetailStats();
  renderDetailChart();
}

function renderCardDetailStats() {
  const card = state.detailCard;
  if (!card) return;
  const now = new Date();
  const thisKey = toMonthKey(now);
  const lastKey = addMonths(thisKey, -1);
  const thisYear = String(now.getFullYear());

  const cardEntries = state.entries.filter((e) => e.card === card);
  const thisMonthTotal = sumBy(cardEntries.filter((e) => e.date.slice(0, 7) === thisKey));
  const lastMonthTotal = sumBy(cardEntries.filter((e) => e.date.slice(0, 7) === lastKey));
  const yearTotal = sumBy(cardEntries.filter((e) => e.date.slice(0, 4) === thisYear));

  const byMonth = new Map();
  for (const e of cardEntries) {
    const mk = e.date.slice(0, 7);
    byMonth.set(mk, (byMonth.get(mk) || 0) + Number(e.amount));
  }
  const allTimeTotal = sumBy(cardEntries);
  const avg = byMonth.size ? allTimeTotal / byMonth.size : 0;

  let maxMonth = null, maxValue = 0;
  for (const [mk, v] of byMonth) { if (v > maxValue) { maxValue = v; maxMonth = mk; } }

  els.detailThisMonth.textContent = formatYen(thisMonthTotal);
  els.detailLastMonth.textContent = formatYen(lastMonthTotal);
  els.detailYearTotal.textContent = formatYen(yearTotal);
  els.detailAvg.textContent = formatYen(avg);
  els.detailMax.textContent = formatYen(maxValue);
  els.detailMaxMonth.textContent = maxMonth ? monthFullLabel(maxMonth) : '記録なし';
}

function renderDetailChart() {
  const card = state.detailCard;
  if (!card) return;
  const series = monthlySeries(state.entries.filter((e) => e.card === card));
  if (!series.length) {
    els.detailChartWrap.innerHTML = '';
    els.detailEmpty.hidden = false;
    return;
  }
  els.detailEmpty.hidden = true;
  renderTrendChart(els.detailChartWrap, series);
}

function closeCardDetail() {
  els.cardDetailPanel.classList.remove('is-open');
  document.body.style.overflow = '';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) { els.cardDetail.hidden = true; return; }
  setTimeout(() => { els.cardDetail.hidden = true; }, 300);
}

// ============================================================
// Ledger (entry form + monthly list) — existing functionality
// ============================================================

function renderCardOptions() {
  const selected = els.card.value;
  els.card.innerHTML = state.cards.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  if (selected && state.cards.includes(selected)) els.card.value = selected;
}
function renderMonthPicker() { els.monthPicker.value = state.currentMonth; }

function entriesForMonth(monthKey) { return state.entries.filter((e) => e.date.startsWith(monthKey)); }
function shiftMonth(monthKey, delta) { return addMonths(monthKey, delta); }

function renderEntryList() {
  let monthEntries = entriesForMonth(state.currentMonth);

  if (state.search.trim()) {
    const q = state.search.trim().toLowerCase();
    monthEntries = monthEntries.filter((e) =>
      (e.memo || '').toLowerCase().includes(q) ||
      (e.category || '').toLowerCase().includes(q) ||
      (e.card || '').toLowerCase().includes(q));
  }

  monthEntries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  els.emptyState.hidden = monthEntries.length > 0;
  els.entryList.innerHTML = monthEntries.map((e) => `
    <li class="ledger-item" data-id="${e.id}">
      <div class="ledger-item-top">
        <div class="ledger-item-left">
          <span class="date-cell">${formatDate(e.date)}</span>
          <button type="button" class="card-chip" data-card="${escapeHtml(e.card)}">${escapeHtml(e.card)}</button>
        </div>
        <span class="amount-cell">${formatYen(e.amount)}</span>
      </div>
      <div class="ledger-item-bottom">
        <div class="ledger-item-left">
          <span class="category-tag">${escapeHtml(e.category)}</span>
          <span class="memo-cell">${escapeHtml(e.memo || '')}</span>
        </div>
        <div class="row-actions">
          <button class="icon-btn edit-btn" title="編集" data-id="${e.id}">✎</button>
          <button class="icon-btn danger delete-btn" title="削除" data-id="${e.id}">🗑</button>
        </div>
      </div>
    </li>`).join('');
}

function renderCardManageList() {
  els.cardManageList.innerHTML = state.cards.map((c) => `
    <li><span>${escapeHtml(c)}</span><button class="icon-btn danger remove-card-btn" data-name="${escapeHtml(c)}" title="削除">🗑</button></li>
  `).join('');
}

function renderLedgerView() {
  renderCardOptions();
  renderMonthPicker();
  renderEntryList();
}

function renderAll() {
  renderDashboard();
  renderLedgerView();
}

// ---------- Tabs ----------

function switchTab(tab) {
  state.activeTab = tab;
  els.tabDashboard.classList.toggle('is-active', tab === 'dashboard');
  els.tabDashboard.setAttribute('aria-selected', String(tab === 'dashboard'));
  els.tabLedger.classList.toggle('is-active', tab === 'ledger');
  els.tabLedger.setAttribute('aria-selected', String(tab === 'ledger'));
  els.viewDashboard.hidden = tab !== 'dashboard';
  els.viewLedger.hidden = tab !== 'ledger';
  if (tab === 'dashboard') renderTrendSection(); // fix chart width now that it's visible
}
els.tabDashboard.addEventListener('click', () => switchTab('dashboard'));
els.tabLedger.addEventListener('click', () => switchTab('ledger'));

// ---------- Form ----------

function resetForm() {
  els.form.reset();
  els.entryId.value = '';
  els.date.value = new Date().toISOString().slice(0, 10);
  els.submitBtn.textContent = '記録する';
  els.cancelEditBtn.hidden = true;
  renderCardOptions();
}

function startEdit(id) {
  const entry = state.entries.find((e) => e.id === id);
  if (!entry) return;
  switchTab('ledger');
  els.entryId.value = entry.id;
  els.date.value = entry.date;
  renderCardOptions();
  els.card.value = entry.card;
  els.amount.value = entry.amount;
  els.category.value = entry.category;
  els.memo.value = entry.memo || '';
  els.submitBtn.textContent = '更新する';
  els.cancelEditBtn.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

els.form.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const id = els.entryId.value;
  const payload = {
    date: els.date.value,
    card: els.card.value,
    amount: Number(els.amount.value),
    category: els.category.value,
    memo: els.memo.value.trim(),
  };
  if (!payload.date || !payload.card || !(payload.amount > 0)) {
    alert('日付・カード・金額（0より大きい値）を入力してください。');
    return;
  }
  if (id) {
    const idx = state.entries.findIndex((e) => e.id === id);
    if (idx !== -1) state.entries[idx] = { ...state.entries[idx], ...payload };
  } else {
    state.entries.push({ id: uid(), ...payload });
  }
  saveEntries();
  state.currentMonth = payload.date.slice(0, 7);
  resetForm();
  renderAll();
});

els.cancelEditBtn.addEventListener('click', resetForm);

els.entryList.addEventListener('click', (ev) => {
  const editBtn = ev.target.closest('.edit-btn');
  const delBtn = ev.target.closest('.delete-btn');
  const chip = ev.target.closest('.card-chip');
  if (editBtn) {
    startEdit(editBtn.dataset.id);
  } else if (delBtn) {
    if (confirm('この記録を削除しますか？')) {
      state.entries = state.entries.filter((e) => e.id !== delBtn.dataset.id);
      saveEntries();
      renderAll();
    }
  } else if (chip) {
    openCardDetail(chip.dataset.card);
  }
});

// ---------- Ledger month navigation ----------

els.monthPicker.addEventListener('change', () => {
  if (els.monthPicker.value) { state.currentMonth = els.monthPicker.value; renderEntryList(); }
});
els.prevMonth.addEventListener('click', () => { state.currentMonth = shiftMonth(state.currentMonth, -1); renderMonthPicker(); renderEntryList(); });
els.nextMonth.addEventListener('click', () => { state.currentMonth = shiftMonth(state.currentMonth, 1); renderMonthPicker(); renderEntryList(); });

els.search.addEventListener('input', () => { state.search = els.search.value; renderEntryList(); });

// ---------- Dashboard controls ----------

els.periodToggle.addEventListener('click', (ev) => {
  const btn = ev.target.closest('button[data-period]');
  if (!btn) return;
  state.rankPeriod = btn.dataset.period;
  [...els.periodToggle.children].forEach((b) => {
    const active = b === btn;
    b.classList.toggle('is-active', active);
    b.setAttribute('aria-selected', String(active));
  });
  renderRankSection();
});

els.trendToggle.addEventListener('click', (ev) => {
  const btn = ev.target.closest('button[data-mode]');
  if (!btn) return;
  state.trendMode = btn.dataset.mode;
  [...els.trendToggle.children].forEach((b) => {
    const active = b === btn;
    b.classList.toggle('is-active', active);
    b.setAttribute('aria-selected', String(active));
  });
  renderTrendSection();
});

els.trendCardSelect.addEventListener('change', () => {
  state.trendCard = els.trendCardSelect.value;
  renderTrendSection();
});

els.rankList.addEventListener('click', (ev) => {
  const item = ev.target.closest('.rank-item');
  if (item) openCardDetail(item.dataset.card);
});
els.rankList.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Enter' && ev.key !== ' ') return;
  const item = ev.target.closest('.rank-item');
  if (item) { ev.preventDefault(); openCardDetail(item.dataset.card); }
});

els.detailBack.addEventListener('click', closeCardDetail);

// ---------- Card management ----------

function openCardModal() { renderCardManageList(); els.cardModal.hidden = false; }
function closeCardModal() { els.cardModal.hidden = true; }

els.manageCardsBtn.addEventListener('click', openCardModal);
els.closeModalBtn.addEventListener('click', closeCardModal);
els.cardModal.addEventListener('click', (ev) => { if (ev.target === els.cardModal) closeCardModal(); });

els.addCardBtn.addEventListener('click', () => {
  const name = els.newCardName.value.trim();
  if (!name) return;
  if (state.cards.includes(name)) { alert('同じ名前のカードが既にあります。'); return; }
  state.cards.push(name);
  saveCards();
  els.newCardName.value = '';
  renderCardManageList();
  renderCardOptions();
  if (state.activeTab === 'dashboard') renderTrendSection();
});
els.newCardName.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); els.addCardBtn.click(); } });

els.cardManageList.addEventListener('click', (ev) => {
  const btn = ev.target.closest('.remove-card-btn');
  if (!btn) return;
  const name = btn.dataset.name;
  const inUse = state.entries.some((e) => e.card === name);
  if (inUse) { alert('このカードは利用中の記録があるため削除できません。先に該当の記録を削除・変更してください。'); return; }
  if (state.cards.length <= 1) { alert('カードは最低1つ必要です。'); return; }
  state.cards = state.cards.filter((c) => c !== name);
  saveCards();
  renderCardManageList();
  renderCardOptions();
  if (state.activeTab === 'dashboard') renderTrendSection();
});

// ---------- Export / Import ----------
// In the Claude Artifact viewer, script-driven downloads are sandboxed; when
// available we hand the file to the viewer via the `downloads` capability.
// In a normal browser (e.g. this app hosted on its own) we fall back to a
// standard Blob + <a download> flow.

let downloadsCap = null;
const inCapabilityHost = !!(window.claude && typeof window.claude.use === 'function');
if (inCapabilityHost) {
  (async () => {
    try { downloadsCap = await window.claude.use('downloads'); } catch (e) { downloadsCap = null; }
    if (!downloadsCap) {
      els.exportBtn.disabled = true;
      els.exportBtn.title = 'この環境では書き出し機能を利用できません';
    }
  })();
}

els.exportBtn.addEventListener('click', async () => {
  const data = { exportedAt: new Date().toISOString(), cards: state.cards, entries: state.entries };
  const json = JSON.stringify(data, null, 2);
  const filename = `card-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;

  if (inCapabilityHost) {
    if (!downloadsCap) return;
    try {
      await downloadsCap.save({ filename, data: json });
    } catch (e) {
      if (e && e.code === 'declined') return;
      console.error(e);
      alert('書き出しに失敗しました。');
    }
    return;
  }

  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
});

els.importBtn.addEventListener('click', () => els.importFile.click());
els.importFile.addEventListener('change', () => {
  const file = els.importFile.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data.entries)) throw new Error('invalid format');

      const mode = confirm('「OK」= 既存データに追加してマージ\n「キャンセル」= 既存データを置き換え') ? 'merge' : 'replace';

      if (mode === 'replace') {
        state.entries = data.entries;
        state.cards = Array.isArray(data.cards) && data.cards.length ? data.cards : state.cards;
      } else {
        const existingIds = new Set(state.entries.map((e) => e.id));
        for (const e of data.entries) { if (!existingIds.has(e.id)) state.entries.push(e); }
        if (Array.isArray(data.cards)) { for (const c of data.cards) { if (!state.cards.includes(c)) state.cards.push(c); } }
      }

      saveEntries();
      saveCards();
      renderAll();
      alert('読み込みが完了しました。');
    } catch (e) {
      alert('ファイルの読み込みに失敗しました。正しいバックアップファイルか確認してください。');
      console.error(e);
    } finally {
      els.importFile.value = '';
    }
  };
  reader.readAsText(file);
});

// ---------- Resize handling ----------

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (state.activeTab === 'dashboard') renderTrendSection();
    if (!els.cardDetail.hidden) renderDetailChart();
  }, 150);
});

// ---------- Init ----------

function init() {
  state.entries = loadEntries();
  state.cards = loadCards();
  resetForm();
  renderAll();
}
init();
