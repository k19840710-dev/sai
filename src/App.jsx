import React, { useState, useMemo, useEffect } from 'react';
import {
  CreditCard,
  Plus,
  Calendar,
  ChevronLeft,
  ChevronRight,
  PieChart,
  List,
  Trash2,
  Wallet,
  Tag,
  TrendingUp,
  X,
  Filter,
  ShoppingBag,
  Utensils,
  Car,
  Home,
  Tv,
  HelpCircle,
  Sparkles,
} from 'lucide-react';
import TrendChart from './components/TrendChart.jsx';

// ---------- localStorage ----------

const STORAGE_KEYS = {
  cards: 'cardTracker.cards',
  transactions: 'cardTracker.transactions',
};

function loadList(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : fallback;
  } catch (e) {
    console.error('保存データの読み込みに失敗しました', e);
    return fallback;
  }
}

// カードのデザインスタイル定義
const CARD_THEMES = {
  purple: {
    bg: 'bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500',
    border: 'border-purple-400/30',
    text: 'text-white',
    badge: 'bg-purple-900/40 text-purple-200',
  },
  dark: {
    bg: 'bg-gradient-to-br from-gray-900 via-slate-800 to-black',
    border: 'border-gray-700',
    text: 'text-white',
    badge: 'bg-gray-800 text-gray-300',
  },
  emerald: {
    bg: 'bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700',
    border: 'border-teal-400/30',
    text: 'text-white',
    badge: 'bg-teal-900/40 text-teal-200',
  },
  blue: {
    bg: 'bg-gradient-to-br from-blue-600 via-cyan-600 to-indigo-700',
    border: 'border-blue-400/30',
    text: 'text-white',
    badge: 'bg-blue-900/40 text-blue-200',
  },
  sunset: {
    bg: 'bg-gradient-to-br from-amber-500 via-orange-600 to-red-600',
    border: 'border-orange-400/30',
    text: 'text-white',
    badge: 'bg-orange-900/40 text-orange-200',
  },
};

// カテゴリ定義
const CATEGORIES = [
  { id: 'food', name: '食費', icon: Utensils, color: 'bg-amber-500 text-amber-500' },
  { id: 'shopping', name: '買い物', icon: ShoppingBag, color: 'bg-blue-500 text-blue-500' },
  { id: 'transport', name: '交通費', icon: Car, color: 'bg-emerald-500 text-emerald-500' },
  { id: 'housing', name: '固定費・住居', icon: Home, color: 'bg-purple-500 text-purple-500' },
  { id: 'entertainment', name: '娯楽・趣味', icon: Tv, color: 'bg-pink-500 text-pink-500' },
  { id: 'other', name: 'その他', icon: HelpCircle, color: 'bg-gray-500 text-gray-500' },
];

// 初回起動時のサンプルデータ（保存データが無いときのみ使われる）
const DEFAULT_CARDS = [
  {
    id: 'card-1',
    name: 'メインゴールドカード',
    brand: 'VISA',
    last4: '4821',
    theme: 'purple',
    limit: 300000,
    billingDay: '15',
    paymentDay: '10',
  },
  {
    id: 'card-2',
    name: '楽天カード',
    brand: 'Mastercard',
    last4: '9102',
    theme: 'sunset',
    limit: 200000,
    billingDay: '末日',
    paymentDay: '27',
  },
  {
    id: 'card-3',
    name: '交通系JCBカード',
    brand: 'JCB',
    last4: '3310',
    theme: 'blue',
    limit: 100000,
    billingDay: '末日',
    paymentDay: '10',
  },
];

const DEFAULT_TRANSACTIONS = [
  // 4月〜6月（月別推移のサンプル用）
  { id: 't-101', cardId: 'card-1', amount: 68000, date: '2026-04-10', category: 'shopping', memo: '新生活用品' },
  { id: 't-102', cardId: 'card-2', amount: 21000, date: '2026-04-20', category: 'food', memo: '' },
  { id: 't-103', cardId: 'card-1', amount: 74000, date: '2026-05-08', category: 'housing', memo: '' },
  { id: 't-104', cardId: 'card-2', amount: 26000, date: '2026-05-24', category: 'entertainment', memo: '' },
  { id: 't-105', cardId: 'card-1', amount: 61000, date: '2026-06-12', category: 'food', memo: '' },
  { id: 't-106', cardId: 'card-3', amount: 15000, date: '2026-06-18', category: 'transport', memo: '' },
  // 7月
  { id: 't-7', cardId: 'card-1', amount: 28000, date: '2026-07-18', category: 'shopping', memo: '夏服購入' },
  { id: 't-8', cardId: 'card-2', amount: 15000, date: '2026-07-22', category: 'food', memo: '外食・飲み会' },
  // 8月
  { id: 't-1', cardId: 'card-1', amount: 14800, date: '2026-08-02', category: 'food', memo: '週末スーパー買い物' },
  { id: 't-2', cardId: 'card-2', amount: 32000, date: '2026-08-05', category: 'shopping', memo: 'スニーカー新調' },
  { id: 't-3', cardId: 'card-3', amount: 8500, date: '2026-08-08', category: 'transport', memo: 'チャージ＆新幹線チケット' },
  { id: 't-4', cardId: 'card-1', amount: 9800, date: '2026-08-10', category: 'housing', memo: '通信費・サブスク' },
  { id: 't-5', cardId: 'card-2', amount: 12400, date: '2026-08-12', category: 'entertainment', memo: '友人とのディナー' },
  { id: 't-6', cardId: 'card-1', amount: 4500, date: '2026-08-15', category: 'food', memo: 'カフェ・ランチ' },
];

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthRange(startKey, endKey) {
  const [sy, sm] = startKey.split('-').map(Number);
  const [ey, em] = endKey.split('-').map(Number);
  const out = [];
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

/** Continuous, zero-filled monthly totals for a set of transactions. */
function buildMonthlySeries(txs) {
  if (!txs.length) return [];
  const sums = new Map();
  let min = null;
  let max = null;
  txs.forEach((t) => {
    const mk = t.date.slice(0, 7);
    sums.set(mk, (sums.get(mk) || 0) + Number(t.amount));
    if (!min || mk < min) min = mk;
    if (!max || mk > max) max = mk;
  });
  return monthRange(min, max).map((k) => ({
    key: k,
    xLabel: `${Number(k.slice(5, 7))}月`,
    fullLabel: `${k.slice(0, 4)}年${Number(k.slice(5, 7))}月`,
    value: sums.get(k) || 0,
  }));
}

export default function App() {
  // 現在選択されている年月 (YYYY-MM) — 実際の今日の日付から算出
  const [currentMonth, setCurrentMonth] = useState(currentMonthKey);
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'transactions' | 'cards'

  // モーダルの状態
  const [isAddTransactionOpen, setIsAddTransactionOpen] = useState(false);
  const [isAddCardOpen, setIsAddCardOpen] = useState(false);

  // クレジットカードデータ（保存データがあればそれを、無ければサンプルを初期値に）
  const [cards, setCards] = useState(() => loadList(STORAGE_KEYS.cards, DEFAULT_CARDS));

  // 利用明細データ
  const [transactions, setTransactions] = useState(() => loadList(STORAGE_KEYS.transactions, DEFAULT_TRANSACTIONS));

  // データが変わるたびにブラウザに自動保存
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.cards, JSON.stringify(cards));
  }, [cards]);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.transactions, JSON.stringify(transactions));
  }, [transactions]);

  // フィルター用ステート（明細タブ）
  const [filterCardId, setFilterCardId] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');

  // 月別推移グラフのステート
  const [trendMode, setTrendMode] = useState('total'); // 'total' | 'card'
  const [trendCardId, setTrendCardId] = useState('');

  // 新規明細フォームのステート
  const [newTx, setNewTx] = useState({
    cardId: cards[0]?.id || '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    category: 'food',
    memo: '',
  });

  // 新規カードフォームのステート
  const [newCard, setNewCard] = useState({
    name: '',
    brand: 'VISA',
    last4: '',
    theme: 'purple',
    limit: 200000,
    billingDay: '末日',
    paymentDay: '27',
  });

  // --- 月の切り替え処理 ---
  const handleMonthChange = (offset) => {
    const [year, month] = currentMonth.split('-').map(Number);
    const date = new Date(year, month - 1 + offset, 1);
    const newYear = date.getFullYear();
    const newMonth = String(date.getMonth() + 1).padStart(2, '0');
    setCurrentMonth(`${newYear}-${newMonth}`);
  };

  // 表示用の年月フォーマット（例: 2026年 8月）
  const formattedMonth = useMemo(() => {
    const [year, month] = currentMonth.split('-');
    return `${year}年 ${parseInt(month, 10)}月`;
  }, [currentMonth]);

  // --- 計算系ロジック ---
  // 当月の全明細
  const monthlyTransactions = useMemo(() => {
    return transactions.filter((t) => t.date.startsWith(currentMonth));
  }, [transactions, currentMonth]);

  // 当月の合計利用額
  const totalMonthlyAmount = useMemo(() => {
    return monthlyTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
  }, [monthlyTransactions]);

  // カード別の当月利用額集計
  const cardMonthlyStats = useMemo(() => {
    return cards.map((card) => {
      const cardTxs = monthlyTransactions.filter((t) => t.cardId === card.id);
      const spent = cardTxs.reduce((sum, t) => sum + Number(t.amount), 0);
      const percentage = card.limit ? Math.min(Math.round((spent / card.limit) * 100), 100) : 0;
      return { ...card, spent, percentage };
    });
  }, [cards, monthlyTransactions]);

  // カテゴリ別支出集計
  const categoryStats = useMemo(() => {
    const map = {};
    CATEGORIES.forEach((c) => { map[c.id] = 0; });

    monthlyTransactions.forEach((t) => {
      if (map[t.category] !== undefined) {
        map[t.category] += Number(t.amount);
      } else {
        map.other = (map.other || 0) + Number(t.amount);
      }
    });

    return CATEGORIES.map((cat) => ({
      ...cat,
      amount: map[cat.id] || 0,
      percentage: totalMonthlyAmount > 0 ? Math.round(((map[cat.id] || 0) / totalMonthlyAmount) * 100) : 0,
    })).sort((a, b) => b.amount - a.amount);
  }, [monthlyTransactions, totalMonthlyAmount]);

  // 月別支出推移（全期間・全カード or 特定カード）
  const trendSeries = useMemo(() => {
    const activeCardId = trendCardId || cards[0]?.id || '';
    const relevant = trendMode === 'card'
      ? transactions.filter((t) => t.cardId === activeCardId)
      : transactions;
    return buildMonthlySeries(relevant);
  }, [transactions, trendMode, trendCardId, cards]);

  // 前月比（月別推移カードのすぐ下で使う簡易サマリー）
  const monthOverMonth = useMemo(() => {
    const lastKey = (() => {
      const [y, m] = currentMonth.split('-').map(Number);
      const d = new Date(y, m - 2, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    })();
    const lastTotal = transactions
      .filter((t) => t.date.startsWith(lastKey))
      .reduce((sum, t) => sum + Number(t.amount), 0);
    if (lastTotal === 0) return null;
    const diff = totalMonthlyAmount - lastTotal;
    return { lastTotal, diff, pct: (diff / lastTotal) * 100 };
  }, [transactions, currentMonth, totalMonthlyAmount]);

  // 明細一覧フィルター適用
  const filteredTransactions = useMemo(() => {
    return monthlyTransactions.filter((t) => {
      const matchCard = filterCardId === 'all' || t.cardId === filterCardId;
      const matchCat = filterCategory === 'all' || t.category === filterCategory;
      return matchCard && matchCat;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [monthlyTransactions, filterCardId, filterCategory]);

  // --- アクションハンドラー ---
  const handleAddTransaction = (e) => {
    e.preventDefault();
    if (!newTx.amount || !newTx.cardId) return;

    const newEntry = {
      id: `t-${Date.now()}`,
      cardId: newTx.cardId,
      amount: Number(newTx.amount),
      date: newTx.date,
      category: newTx.category,
      memo: newTx.memo || '利用明細',
    };

    setTransactions([newEntry, ...transactions]);
    setIsAddTransactionOpen(false);

    // フォームリセット
    setNewTx({
      cardId: cards[0]?.id || '',
      amount: '',
      date: new Date().toISOString().split('T')[0],
      category: 'food',
      memo: '',
    });
  };

  const handleDeleteTransaction = (id) => {
    if (confirm('この利用明細を削除しますか？')) {
      setTransactions(transactions.filter((t) => t.id !== id));
    }
  };

  const handleAddCard = (e) => {
    e.preventDefault();
    if (!newCard.name) return;

    const createdCard = {
      id: `card-${Date.now()}`,
      ...newCard,
      limit: Number(newCard.limit) || 0,
      last4: newCard.last4 || '0000',
    };

    setCards([...cards, createdCard]);
    setIsAddCardOpen(false);

    // フォームリセット
    setNewCard({
      name: '',
      brand: 'VISA',
      last4: '',
      theme: 'purple',
      limit: 200000,
      billingDay: '末日',
      paymentDay: '27',
    });
  };

  const handleDeleteCard = (cardId) => {
    if (cards.length <= 1) {
      alert('最低1枚のカードが必要です。');
      return;
    }
    if (confirm('このカードを削除すると、関連する明細も確認できなくなる可能性があります。削除しますか？')) {
      setCards(cards.filter((c) => c.id !== cardId));
      setTransactions(transactions.filter((t) => t.cardId !== cardId));
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col antialiased selection:bg-indigo-500 selection:text-white">

      {/* 1. トップヘッダー */}
      <header className="sticky top-0 z-30 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 px-4 py-3 sm:px-8">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-gradient-to-tr from-indigo-500 to-purple-500 rounded-xl shadow-lg shadow-indigo-500/20">
              <CreditCard className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg sm:text-xl tracking-tight text-white flex items-center gap-2">
                CardManager <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 font-medium">Pro</span>
              </h1>
              <p className="text-xs text-slate-400 hidden sm:block">クレジットカード利用額・月別管理</p>
            </div>
          </div>

          {/* 明細追加ボタン */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (cards.length > 0) {
                  setNewTx((prev) => ({ ...prev, cardId: cards[0].id }));
                }
                setIsAddTransactionOpen(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-all duration-200 shadow-lg shadow-indigo-600/30 active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>利用を記録</span>
            </button>
          </div>
        </div>
      </header>

      {/* 2. 月切替ナビゲーションバー */}
      <div className="bg-slate-800/50 border-b border-slate-800/80 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <button
            onClick={() => handleMonthChange(-1)}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
            title="前月"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="flex items-center space-x-2">
            <Calendar className="w-5 h-5 text-indigo-400" />
            <span className="text-lg font-bold tracking-wide text-white">{formattedMonth}</span>
          </div>

          <button
            onClick={() => handleMonthChange(1)}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
            title="次月"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* 3. メインコンテンツ領域 */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6 space-y-6">

        {/* ナビゲーションタブ */}
        <div className="flex bg-slate-800/80 p-1.5 rounded-2xl border border-slate-700/50 max-w-md mx-auto sm:mx-0">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex-1 py-2 px-1.5 sm:px-3 rounded-xl text-xs sm:text-sm font-medium transition-all flex items-center justify-center gap-1 sm:gap-2 ${
              activeTab === 'dashboard' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <PieChart className="w-4 h-4 shrink-0" />
            <span className="whitespace-nowrap">ダッシュボード</span>
          </button>
          <button
            onClick={() => setActiveTab('transactions')}
            className={`flex-1 py-2 px-1.5 sm:px-3 rounded-xl text-xs sm:text-sm font-medium transition-all flex items-center justify-center gap-1 sm:gap-2 ${
              activeTab === 'transactions' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <List className="w-4 h-4 shrink-0" />
            <span className="whitespace-nowrap">明細一覧 ({monthlyTransactions.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('cards')}
            className={`flex-1 py-2 px-1.5 sm:px-3 rounded-xl text-xs sm:text-sm font-medium transition-all flex items-center justify-center gap-1 sm:gap-2 ${
              activeTab === 'cards' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Wallet className="w-4 h-4 shrink-0" />
            <span className="whitespace-nowrap">カード管理 ({cards.length})</span>
          </button>
        </div>

        {/* --- タブ 1: ダッシュボード --- */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6 animate-fadeIn">

            {/* ハイライトサマリーカード */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-800/90 border border-slate-700/60 rounded-2xl p-5 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <TrendingUp className="w-24 h-24 text-indigo-400" />
                </div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">今月の合計利用額</p>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl sm:text-4xl font-extrabold text-white">
                    ¥{totalMonthlyAmount.toLocaleString()}
                  </span>
                </div>
                {monthOverMonth ? (
                  <p className={`mt-2 text-xs font-semibold ${monthOverMonth.diff > 0 ? 'text-rose-400' : monthOverMonth.diff < 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
                    {monthOverMonth.diff > 0 ? '▲' : monthOverMonth.diff < 0 ? '▼' : '―'}
                    {' '}
                    {monthOverMonth.diff >= 0 ? '+' : '−'}¥{Math.abs(monthOverMonth.diff).toLocaleString()}
                    {' '}
                    （{monthOverMonth.diff >= 0 ? '+' : '−'}{Math.abs(monthOverMonth.pct).toFixed(1)}%） 先月比
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-slate-400">
                    登録カード {cards.length} 枚の総支払予定額
                  </p>
                )}
              </div>

              <div className="bg-slate-800/90 border border-slate-700/60 rounded-2xl p-5 shadow-xl">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">今月の決済件数</p>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl sm:text-4xl font-extrabold text-indigo-400">
                    {monthlyTransactions.length}
                  </span>
                  <span className="text-slate-400 text-sm">件</span>
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  平均決済額: ¥{monthlyTransactions.length ? Math.round(totalMonthlyAmount / monthlyTransactions.length).toLocaleString() : 0}
                </p>
              </div>

              <div className="bg-slate-800/90 border border-slate-700/60 rounded-2xl p-5 shadow-xl">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">最も利用したカード</p>
                {cardMonthlyStats.length > 0 ? (() => {
                  const topCard = [...cardMonthlyStats].sort((a, b) => b.spent - a.spent)[0];
                  return (
                    <div className="mt-2">
                      <div className="text-lg font-bold text-white truncate">{topCard.name}</div>
                      <div className="text-indigo-400 font-semibold mt-0.5">
                        ¥{topCard.spent.toLocaleString()}
                      </div>
                    </div>
                  );
                })() : (
                  <p className="mt-2 text-slate-500 text-sm">データがありません</p>
                )}
              </div>
            </div>

            {/* 月別支出推移 */}
            <div className="bg-slate-800/90 border border-slate-700/60 rounded-2xl p-5 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-indigo-400" />
                  月別支出推移
                </h2>
                <div className="flex items-center gap-2">
                  <div className="flex bg-slate-900/70 p-1 rounded-lg border border-slate-700/60">
                    <button
                      onClick={() => setTrendMode('total')}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        trendMode === 'total' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      全カード合計
                    </button>
                    <button
                      onClick={() => setTrendMode('card')}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        trendMode === 'card' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      カード別
                    </button>
                  </div>
                  {trendMode === 'card' && (
                    <select
                      value={trendCardId || cards[0]?.id || ''}
                      onChange={(e) => setTrendCardId(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded-lg text-xs px-2.5 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      {cards.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
              <TrendChart series={trendSeries} />
            </div>

            {/* クレジットカード別利用額（カードデザイン表示） */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-indigo-400" />
                  カード別利用状況
                </h2>
                <button
                  onClick={() => setIsAddCardOpen(true)}
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> カードを追加
                </button>
              </div>

              {cards.length === 0 ? (
                <div className="bg-slate-800/50 rounded-2xl p-8 text-center border border-dashed border-slate-700">
                  <p className="text-slate-400 text-sm">クレジットカードが登録されていません</p>
                  <button
                    onClick={() => setIsAddCardOpen(true)}
                    className="mt-3 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium"
                  >
                    カードを追加する
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {cardMonthlyStats.map((card) => {
                    const theme = CARD_THEMES[card.theme] || CARD_THEMES.purple;
                    return (
                      <div
                        key={card.id}
                        className={`rounded-2xl p-4 shadow-xl border ${theme.bg} ${theme.border} relative flex flex-col justify-center gap-3.5 h-44 transition-transform duration-200 hover:-translate-y-1`}
                      >
                        {/* カード上部 */}
                        <div className="flex justify-between items-start">
                          <div>
                            <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${theme.badge}`}>
                              {card.brand}
                            </span>
                            <h3 className="font-bold text-white text-sm mt-1.5 truncate max-w-[160px]">
                              {card.name}
                            </h3>
                          </div>
                          <span className="font-mono text-xs text-white/70">•••• {card.last4}</span>
                        </div>

                        {/* カード中央: 利用金額 */}
                        <div>
                          <span className="text-xs text-white/70">今月の利用額</span>
                          <div className="text-xl font-black text-white tracking-tight">
                            ¥{card.spent.toLocaleString()}
                          </div>
                        </div>

                        {/* カード下部: ゲージ＆締め日情報 */}
                        <div className="space-y-1.5">
                          {card.limit > 0 && (
                            <div>
                              <div className="flex justify-between text-[10px] text-white/80 mb-1">
                                <span>利用枠</span>
                                <span>{card.percentage}% (上限: ¥{card.limit.toLocaleString()})</span>
                              </div>
                              <div className="w-full h-1.5 bg-black/30 rounded-full overflow-hidden backdrop-blur-sm">
                                <div
                                  className={`h-full rounded-full transition-all duration-500 ${
                                    card.percentage > 80 ? 'bg-red-400' : 'bg-white'
                                  }`}
                                  style={{ width: `${Math.min(card.percentage, 100)}%` }}
                                />
                              </div>
                            </div>
                          )}
                          <div className="flex justify-between items-center text-[10px] text-white/60 pt-0.5">
                            <span>締日: {card.billingDay}</span>
                            <span>支払日: 毎月{card.paymentDay}日</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* カテゴリ別内訳 */}
            <div className="bg-slate-800/90 border border-slate-700/60 rounded-2xl p-5 shadow-xl">
              <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <Tag className="w-5 h-5 text-indigo-400" />
                カテゴリ別支出内訳
              </h2>

              {totalMonthlyAmount === 0 ? (
                <p className="text-slate-400 text-sm text-center py-6">この月の利用明細はありません。</p>
              ) : (
                <div className="space-y-3">
                  {categoryStats.filter((c) => c.amount > 0).map((cat) => {
                    const IconComponent = cat.icon;
                    return (
                      <div key={cat.id} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center space-x-2">
                            <div className={`p-1.5 rounded-lg bg-slate-700 ${cat.color.split(' ')[1]}`}>
                              <IconComponent className="w-4 h-4" />
                            </div>
                            <span className="font-medium text-slate-200">{cat.name}</span>
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-white">¥{cat.amount.toLocaleString()}</span>
                            <span className="text-xs text-slate-400 ml-2">({cat.percentage}%)</span>
                          </div>
                        </div>
                        {/* プログレスバー */}
                        <div className="w-full bg-slate-700/50 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${cat.color.split(' ')[0]}`}
                            style={{ width: `${cat.percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}

        {/* --- タブ 2: 利用明細一覧 --- */}
        {activeTab === 'transactions' && (
          <div className="space-y-4 animate-fadeIn">

            {/* フィルター・検索バー */}
            <div className="bg-slate-800/90 border border-slate-700/60 rounded-2xl p-4 flex flex-wrap gap-3 items-center justify-between">
              <div className="flex items-center space-x-2 text-sm text-slate-300">
                <Filter className="w-4 h-4 text-indigo-400" />
                <span className="font-medium">絞り込み:</span>
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                {/* カード絞り込み */}
                <select
                  value={filterCardId}
                  onChange={(e) => setFilterCardId(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-xl text-xs sm:text-sm px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="all">すべてのカード</option>
                  {cards.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>

                {/* カテゴリ絞り込み */}
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-xl text-xs sm:text-sm px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="all">すべてのカテゴリ</option>
                  {CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* 明細リスト */}
            <div className="bg-slate-800/90 border border-slate-700/60 rounded-2xl overflow-hidden shadow-xl">
              {filteredTransactions.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  該当する明細がありません。
                </div>
              ) : (
                <div className="divide-y divide-slate-700/50">
                  {filteredTransactions.map((tx) => {
                    const card = cards.find((c) => c.id === tx.cardId);
                    const categoryObj = CATEGORIES.find((c) => c.id === tx.category) || CATEGORIES[CATEGORIES.length - 1];
                    const IconComponent = categoryObj.icon;

                    return (
                      <div
                        key={tx.id}
                        className="p-4 hover:bg-slate-700/30 transition-colors flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center space-x-3.5 min-w-0">
                          <div className={`p-2.5 rounded-xl bg-slate-700 ${categoryObj.color.split(' ')[1]} shrink-0`}>
                            <IconComponent className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-white text-sm sm:text-base truncate">
                              {tx.memo}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                              <span>{tx.date}</span>
                              <span>•</span>
                              <span className="text-slate-300 font-medium">{card?.name || '削除されたカード'}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-3 shrink-0">
                          <span className="font-bold text-white text-base sm:text-lg">
                            ¥{Number(tx.amount).toLocaleString()}
                          </span>
                          <button
                            onClick={() => handleDeleteTransaction(tx.id)}
                            className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-lg transition-colors"
                            title="削除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}

        {/* --- タブ 3: クレジットカード管理 --- */}
        {activeTab === 'cards' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-white">登録クレジットカード一覧</h2>
                <p className="text-xs text-slate-400">カードの管理・追加・削除を行えます</p>
              </div>
              <button
                onClick={() => setIsAddCardOpen(true)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium flex items-center gap-1.5 shadow-lg shadow-indigo-600/30 transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>新規カード追加</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {cards.map((card) => {
                const theme = CARD_THEMES[card.theme] || CARD_THEMES.purple;
                return (
                  <div
                    key={card.id}
                    className="bg-slate-800/90 border border-slate-700/60 rounded-2xl p-5 shadow-xl flex flex-col justify-between space-y-4"
                  >
                    {/* カード上部表示 */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3">
                        <div className={`p-3 rounded-xl ${theme.bg} shadow-md`}>
                          <CreditCard className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <h3 className="font-bold text-white text-base">{card.name}</h3>
                          <p className="text-xs text-slate-400">{card.brand} •••• {card.last4}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteCard(card.id)}
                        className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-xl transition-colors"
                        title="カード削除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* 詳細設定情報 */}
                    <div className="grid grid-cols-3 gap-2 bg-slate-900/50 p-3 rounded-xl text-xs border border-slate-700/40">
                      <div>
                        <span className="text-slate-400 block">利用限度額</span>
                        <span className="font-semibold text-slate-200">
                          {card.limit ? `¥${card.limit.toLocaleString()}` : '未設定'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">締め日</span>
                        <span className="font-semibold text-slate-200">{card.billingDay}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">支払日</span>
                        <span className="font-semibold text-slate-200">毎月{card.paymentDay}日</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </main>

      {/* 4. モーダル: 利用明細の記録 */}
      {isAddTransactionOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-800 border border-slate-700 rounded-3xl max-w-md w-full p-6 shadow-2xl relative space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-slate-700">
              <h3 className="font-bold text-lg text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-400" />
                利用明細の登録
              </h3>
              <button
                onClick={() => setIsAddTransactionOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddTransaction} className="space-y-4">
              {/* 利用金額 */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">利用金額 (円)</label>
                <input
                  type="number"
                  required
                  placeholder="例: 3500"
                  value={newTx.amount}
                  onChange={(e) => setNewTx({ ...newTx, amount: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white font-bold text-lg focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* クレジットカード選択 */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">利用したカード</label>
                <select
                  value={newTx.cardId}
                  onChange={(e) => setNewTx({ ...newTx, cardId: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-indigo-500"
                >
                  {cards.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.brand})</option>
                  ))}
                </select>
              </div>

              {/* 利用日 & カテゴリ */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">利用日</label>
                  <input
                    type="date"
                    required
                    value={newTx.date}
                    onChange={(e) => setNewTx({ ...newTx, date: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">カテゴリ</label>
                  <select
                    value={newTx.category}
                    onChange={(e) => setNewTx({ ...newTx, category: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-indigo-500"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* メモ */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">メモ / 店舗名</label>
                <input
                  type="text"
                  placeholder="例: セブンイレブン、Amazonなど"
                  value={newTx.memo}
                  onChange={(e) => setNewTx({ ...newTx, memo: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddTransactionOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-700 text-slate-300 font-medium text-sm hover:bg-slate-700/50"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm shadow-lg shadow-indigo-600/30"
                >
                  保存する
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. モーダル: 新規カードの登録 */}
      {isAddCardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-800 border border-slate-700 rounded-3xl max-w-md w-full p-6 shadow-2xl relative space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-slate-700">
              <h3 className="font-bold text-lg text-white flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-indigo-400" />
                新しいカードを追加
              </h3>
              <button
                onClick={() => setIsAddCardOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddCard} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">カード名</label>
                <input
                  type="text"
                  required
                  placeholder="例: 三井住友カード, 楽天ゴールドカード"
                  value={newCard.name}
                  onChange={(e) => setNewCard({ ...newCard, name: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">国際ブランド</label>
                  <select
                    value={newCard.brand}
                    onChange={(e) => setNewCard({ ...newCard, brand: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-indigo-500"
                  >
                    <option value="VISA">VISA</option>
                    <option value="Mastercard">Mastercard</option>
                    <option value="JCB">JCB</option>
                    <option value="Amex">American Express</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">カード番号 (下4桁)</label>
                  <input
                    type="text"
                    maxLength={4}
                    placeholder="1234"
                    value={newCard.last4}
                    onChange={(e) => setNewCard({ ...newCard, last4: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* カードテーマ色設定 */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">カードデザインカラー</label>
                <div className="grid grid-cols-5 gap-2">
                  {Object.keys(CARD_THEMES).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setNewCard({ ...newCard, theme: key })}
                      className={`h-10 rounded-xl ${CARD_THEMES[key].bg} border-2 transition-all ${
                        newCard.theme === key ? 'border-white scale-105' : 'border-transparent opacity-60'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* 利用限度額 */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">月間利用限度額 (円)</label>
                <input
                  type="number"
                  placeholder="300000"
                  value={newCard.limit}
                  onChange={(e) => setNewCard({ ...newCard, limit: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">締め日</label>
                  <input
                    type="text"
                    placeholder="例: 末日, 15日"
                    value={newCard.billingDay}
                    onChange={(e) => setNewCard({ ...newCard, billingDay: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">引き落とし日</label>
                  <input
                    type="text"
                    placeholder="例: 27日, 10日"
                    value={newCard.paymentDay}
                    onChange={(e) => setNewCard({ ...newCard, paymentDay: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddCardOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-700 text-slate-300 font-medium text-sm hover:bg-slate-700/50"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm shadow-lg shadow-indigo-600/30"
                >
                  登録する
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <p className="text-center text-[11px] text-slate-600 py-6 px-4">
        データはこの端末のブラウザ内（localStorage）にのみ保存されます。
      </p>

    </div>
  );
}
