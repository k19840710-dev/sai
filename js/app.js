'use strict';

/**
 * カード家計簿 - クレジットカード月次利用記録アプリ
 * データはすべてブラウザの localStorage に保存される（サーバー通信なし）。
 */

const STORAGE_KEYS = {
  entries: 'ccTracker.entries',
  cards: 'ccTracker.cards',
};

const DEFAULT_CARDS = ['メインカード'];

const state = {
  entries: [],
  cards: [],
  currentMonth: toMonthKey(new Date()), // "YYYY-MM"
  search: '',
};

// ---------- Storage helpers ----------

function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.entries);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('明細の読み込みに失敗しました', e);
    return [];
  }
}

function saveEntries() {
  localStorage.setItem(STORAGE_KEYS.entries, JSON.stringify(state.entries));
}

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

function saveCards() {
  localStorage.setItem(STORAGE_KEYS.cards, JSON.stringify(state.cards));
}

// ---------- Utils ----------

function toMonthKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function formatYen(amount) {
  return '¥' + Number(amount || 0).toLocaleString('ja-JP');
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function uid() {
  return 'e_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function entriesForMonth(monthKey) {
  return state.entries.filter((e) => e.date.startsWith(monthKey));
}

function shiftMonth(monthKey, delta) {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return toMonthKey(d);
}

// ---------- DOM refs ----------

const els = {
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

  monthTotal: document.getElementById('month-total'),
  monthCount: document.getElementById('month-count'),
  byCard: document.getElementById('by-card'),
  byCategory: document.getElementById('by-category'),

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
};

// ---------- Rendering ----------

function renderCardOptions() {
  const selected = els.card.value;
  els.card.innerHTML = state.cards
    .map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`)
    .join('');
  if (selected && state.cards.includes(selected)) {
    els.card.value = selected;
  }
}

function renderMonthPicker() {
  els.monthPicker.value = state.currentMonth;
}

function renderSummary() {
  const monthEntries = entriesForMonth(state.currentMonth);
  const total = monthEntries.reduce((sum, e) => sum + Number(e.amount), 0);

  els.monthTotal.textContent = formatYen(total);
  els.monthCount.textContent = `${monthEntries.length}件`;

  renderBreakdown(els.byCard, groupSum(monthEntries, 'card'));
  renderBreakdown(els.byCategory, groupSum(monthEntries, 'category'));
}

function groupSum(entries, key) {
  const map = new Map();
  for (const e of entries) {
    map.set(e[key], (map.get(e[key]) || 0) + Number(e.amount));
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function renderBreakdown(container, rows) {
  if (!rows.length) {
    container.innerHTML = '<span class="breakdown-empty">記録なし</span>';
    return;
  }
  container.innerHTML = rows
    .map(
      ([name, value]) => `
      <div class="breakdown-row">
        <span class="name">${escapeHtml(name)}</span>
        <span class="value">${formatYen(value)}</span>
      </div>`
    )
    .join('');
}

function renderEntryList() {
  let monthEntries = entriesForMonth(state.currentMonth);

  if (state.search.trim()) {
    const q = state.search.trim().toLowerCase();
    monthEntries = monthEntries.filter(
      (e) =>
        (e.memo || '').toLowerCase().includes(q) ||
        (e.category || '').toLowerCase().includes(q) ||
        (e.card || '').toLowerCase().includes(q)
    );
  }

  monthEntries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  els.emptyState.hidden = monthEntries.length > 0;
  els.entryList.innerHTML = monthEntries
    .map(
      (e) => `
    <tr data-id="${e.id}">
      <td>${formatDate(e.date)}</td>
      <td><span class="card-tag">${escapeHtml(e.card)}</span></td>
      <td><span class="category-tag">${escapeHtml(e.category)}</span></td>
      <td class="entry-memo">${escapeHtml(e.memo || '')}</td>
      <td class="num">${formatYen(e.amount)}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn edit-btn" title="編集" data-id="${e.id}">✎</button>
          <button class="icon-btn danger delete-btn" title="削除" data-id="${e.id}">🗑</button>
        </div>
      </td>
    </tr>`
    )
    .join('');
}

function renderCardManageList() {
  els.cardManageList.innerHTML = state.cards
    .map(
      (c) => `
    <li>
      <span>${escapeHtml(c)}</span>
      <button class="icon-btn danger remove-card-btn" data-name="${escapeHtml(c)}" title="削除">🗑</button>
    </li>`
    )
    .join('');
}

function renderAll() {
  renderCardOptions();
  renderMonthPicker();
  renderSummary();
  renderEntryList();
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

// ---------- Form handling ----------

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
  if (editBtn) {
    startEdit(editBtn.dataset.id);
  } else if (delBtn) {
    if (confirm('この記録を削除しますか？')) {
      state.entries = state.entries.filter((e) => e.id !== delBtn.dataset.id);
      saveEntries();
      renderAll();
    }
  }
});

// ---------- Month navigation ----------

els.monthPicker.addEventListener('change', () => {
  if (els.monthPicker.value) {
    state.currentMonth = els.monthPicker.value;
    renderAll();
  }
});

els.prevMonth.addEventListener('click', () => {
  state.currentMonth = shiftMonth(state.currentMonth, -1);
  renderAll();
});

els.nextMonth.addEventListener('click', () => {
  state.currentMonth = shiftMonth(state.currentMonth, 1);
  renderAll();
});

// ---------- Search ----------

els.search.addEventListener('input', () => {
  state.search = els.search.value;
  renderEntryList();
});

// ---------- Card management ----------

function openCardModal() {
  renderCardManageList();
  els.cardModal.hidden = false;
}
function closeCardModal() {
  els.cardModal.hidden = true;
}

els.manageCardsBtn.addEventListener('click', openCardModal);
els.closeModalBtn.addEventListener('click', closeCardModal);
els.cardModal.addEventListener('click', (ev) => {
  if (ev.target === els.cardModal) closeCardModal();
});

els.addCardBtn.addEventListener('click', () => {
  const name = els.newCardName.value.trim();
  if (!name) return;
  if (state.cards.includes(name)) {
    alert('同じ名前のカードが既にあります。');
    return;
  }
  state.cards.push(name);
  saveCards();
  els.newCardName.value = '';
  renderCardManageList();
  renderCardOptions();
});

els.newCardName.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') {
    ev.preventDefault();
    els.addCardBtn.click();
  }
});

els.cardManageList.addEventListener('click', (ev) => {
  const btn = ev.target.closest('.remove-card-btn');
  if (!btn) return;
  const name = btn.dataset.name;
  const inUse = state.entries.some((e) => e.card === name);
  if (inUse) {
    alert('このカードは利用中の記録があるため削除できません。先に該当の記録を削除・変更してください。');
    return;
  }
  if (state.cards.length <= 1) {
    alert('カードは最低1つ必要です。');
    return;
  }
  state.cards = state.cards.filter((c) => c !== name);
  saveCards();
  renderCardManageList();
  renderCardOptions();
});

// ---------- Export / Import ----------

els.exportBtn.addEventListener('click', () => {
  const data = {
    exportedAt: new Date().toISOString(),
    cards: state.cards,
    entries: state.entries,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `card-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
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

      const mode = confirm(
        '「OK」= 既存データに追加してマージ\n「キャンセル」= 既存データを置き換え'
      )
        ? 'merge'
        : 'replace';

      if (mode === 'replace') {
        state.entries = data.entries;
        state.cards = Array.isArray(data.cards) && data.cards.length ? data.cards : state.cards;
      } else {
        const existingIds = new Set(state.entries.map((e) => e.id));
        for (const e of data.entries) {
          if (!existingIds.has(e.id)) state.entries.push(e);
        }
        if (Array.isArray(data.cards)) {
          for (const c of data.cards) {
            if (!state.cards.includes(c)) state.cards.push(c);
          }
        }
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

// ---------- Init ----------

function init() {
  state.entries = loadEntries();
  state.cards = loadCards();
  resetForm();
  renderAll();
}

init();
