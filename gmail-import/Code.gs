/**
 * カード家計簿 — 即時利用通知メールからの自動取り込み (Google Apps Script)
 * ============================================================
 *
 * Gmail に届く「ご利用のお知らせ」「利用速報」等のメールを定期的にチェックし、
 * 内容を解析して、カード家計簿アプリの Firestore に直接、明細として書き込みます。
 * アプリを開かなくても自動で明細が増えます。
 *
 * セットアップ手順は README.md を参照してください。
 * このファイルの中で編集が必要な箇所は「▼設定」の見出しがついた部分だけです。
 */

// ============================================================
// ▼設定1: このスクリプトから見た「あなたのアプリのアカウント」
// アプリのヘッダー → 雲アイコン → アカウント・同期 モーダルに表示されている
// 「アカウントID」をそのまま貼り付けてください。
// ============================================================
const FIRESTORE_USER_ID = 'ここにアプリのアカウントIDを貼り付け';

// このアプリ専用の Firestore 名前空間（アプリ側と同じ値。通常は変更不要）
const FIRESTORE_APP_ID = 'card-tracker';
const FIRESTORE_PROJECT_ID = 'sai-4d708';

// 二重取り込み防止・処理済みの目印として付けるGmailラベル名（変更不要）
const PROCESSED_LABEL_NAME = 'カード家計簿-取込済み';

// ============================================================
// ▼設定2: メール形式ごとの検出・解析ルール
// 新しいカード会社のメールに対応したい場合は、この配列に追記してください。
// 「match」でメールを判定し、「parse」で本文から金額・店名・日時を取り出します。
// 「cardId」「cardName」「cardTheme」は、対応するカードが未登録の場合に
// 自動作成される際の値です（後からアプリ側で編集できます）。
// ============================================================
const EMAIL_RULES = [
  {
    key: 'mercari',
    cardId: 'card-mercard',
    cardName: 'メルカード',
    cardTheme: 'sunset',
    match: (subject, from) => /メルカードのご利用がありました/.test(subject) || /メルペイ/.test(from),
    parse: parseMercariEmail,
  },
  {
    key: 'smbc',
    cardId: 'card-smbc-nl',
    cardName: '三井住友カード',
    cardTheme: 'dark',
    match: (subject, from) => /ご利用のお知らせ.*三井住友カード/.test(subject) || /smbc-card\.com/.test(from),
    parse: parseSmbcEmail,
  },
  {
    key: 'paypay',
    cardId: 'card-paypay',
    cardName: 'PayPayカード',
    cardTheme: 'blue',
    match: (subject, from) => /PayPay\s*カード.*利用速報/.test(subject) || /PayPayカード/.test(from),
    parse: parsePayPayEmail,
  },
];

// ============================================================
// メイン処理（このプロジェクトの「トリガー」から checkCardEmails を呼ぶよう設定してください）
// ============================================================
function checkCardEmails() {
  const startedAt = new Date();
  let importedCount = 0;
  let lastError = null;

  try {
    const accessToken = getFirestoreAccessToken_();
    const label = getOrCreateLabel_(PROCESSED_LABEL_NAME);

    // 各ルールごとに OR 検索。ラベルが付いていないメールだけを対象にする。
    const matchers = EMAIL_RULES.map((r) => r.key).join(' OR ');
    const query = `-label:"${PROCESSED_LABEL_NAME}" newer_than:7d`;
    const threads = GmailApp.search(query, 0, 50);

    threads.forEach((thread) => {
      const messages = thread.getMessages();
      let threadHadMatch = false;

      messages.forEach((message) => {
        const subject = message.getSubject() || '';
        const from = message.getFrom() || '';
        const rule = EMAIL_RULES.find((r) => r.match(subject, from));
        if (!rule) return;

        threadHadMatch = true;
        try {
          const body = message.getPlainBody();
          const parsed = rule.parse(body, subject);
          if (!parsed || !parsed.amount || !parsed.date) {
            console.warn(`[${rule.key}] 解析失敗: ${subject}`);
            return;
          }

          ensureCardExists_(accessToken, rule);
          createTransaction_(accessToken, {
            cardId: rule.cardId,
            amount: parsed.amount,
            date: parsed.date,
            category: guessCategory_(parsed.merchant),
            memo: parsed.merchant || rule.cardName,
          });
          importedCount += 1;
        } catch (err) {
          lastError = String(err);
          console.error(`[${rule.key}] 処理エラー: ${err}`);
        }
      });

      if (threadHadMatch) {
        thread.addLabel(label);
      }
    });

    updateStatus_(accessToken, {
      lastCheckedAt: startedAt.toISOString(),
      importedLastRun: importedCount,
      ok: !lastError,
      error: lastError,
    });
  } catch (err) {
    console.error('致命的エラー: ' + err);
    try {
      const accessToken = getFirestoreAccessToken_();
      updateStatus_(accessToken, {
        lastCheckedAt: startedAt.toISOString(),
        importedLastRun: importedCount,
        ok: false,
        error: String(err),
      });
    } catch (e2) {
      // ステータス書き込みすら失敗した場合はログのみ
      console.error('ステータス書き込みにも失敗: ' + e2);
    }
    throw err;
  }
}

// ============================================================
// メール解析: メルペイ（メルカード）
// ============================================================
function parseMercariEmail(body) {
  const merchant = extractAfterLabel_(body, '店舗名');
  const amountText = extractAfterLabel_(body, '決済金額');
  const dateText = extractAfterLabel_(body, '決済日時');

  const amount = amountText ? parseAmount_(amountText) : null;
  const date = dateText ? parseDateTime_(dateText) : null;
  return { merchant, amount, date };
}

// ============================================================
// メール解析: 三井住友カード
// ============================================================
function parseSmbcEmail(body) {
  const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
  const dateLineIdx = lines.findIndex((l) => /ご利用日時[：:]/.test(l));
  if (dateLineIdx === -1) return null;

  const dateMatch = lines[dateLineIdx].match(/(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/);
  const date = dateMatch ? isoDate_(dateMatch[1], dateMatch[2], dateMatch[3]) : null;

  // 日時の次の数行から、店名（○○行）と金額（○○円）を探す
  let merchant = null;
  let amount = null;
  for (let i = dateLineIdx + 1; i < Math.min(dateLineIdx + 5, lines.length); i += 1) {
    const line = lines[i];
    const amountMatch = line.match(/([\d,]+)\s*円/);
    if (amountMatch && amount === null) {
      amount = parseAmount_(amountMatch[1]);
      continue;
    }
    if (!merchant && !amountMatch && line.length > 1) {
      merchant = line.replace(/[（(].*[）)]\s*$/, '').trim() || line;
    }
    if (merchant && amount !== null) break;
  }

  return { merchant, amount, date };
}

// ============================================================
// メール解析: PayPayカード
// ============================================================
function parsePayPayEmail(body) {
  const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
  const dateLineIdx = lines.findIndex((l) => /(\d{4})年(\d{1,2})月(\d{1,2})日\s+(\d{1,2}):(\d{2})/.test(l));
  if (dateLineIdx === -1) return null;

  const dateMatch = lines[dateLineIdx].match(/(\d{4})年(\d{1,2})月(\d{1,2})日\s+(\d{1,2}):(\d{2})/);
  const date = dateMatch ? isoDate_(dateMatch[1], dateMatch[2], dateMatch[3]) : null;

  // 日時の直前の行が店名、直後の行が金額、というパターン
  const merchant = dateLineIdx > 0 ? lines[dateLineIdx - 1] : null;
  let amount = null;
  for (let i = dateLineIdx + 1; i < Math.min(dateLineIdx + 3, lines.length); i += 1) {
    const amountMatch = lines[i].match(/([\d,]+)\s*円/);
    if (amountMatch) { amount = parseAmount_(amountMatch[1]); break; }
  }

  return { merchant, amount, date };
}

// ============================================================
// 解析共通ヘルパー
// ============================================================

/** 「ラベル」という行の次に出てくる、空でない行の中身を返す */
function extractAfterLabel_(body, label) {
  const lines = body.split('\n').map((l) => l.trim());
  const idx = lines.findIndex((l) => l === label || l.startsWith(label));
  if (idx === -1) return null;
  for (let i = idx + 1; i < Math.min(idx + 4, lines.length); i += 1) {
    if (lines[i]) return lines[i];
  }
  return null;
}

function parseAmount_(text) {
  const m = String(text).match(/[\d,]+/);
  if (!m) return null;
  return parseInt(m[0].replace(/,/g, ''), 10);
}

/** "2026/08/13 14:00" のような文字列を YYYY-MM-DD に変換 */
function parseDateTime_(text) {
  const m = String(text).match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (!m) return null;
  return isoDate_(m[1], m[2], m[3]);
}

function isoDate_(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** 店名からざっくりカテゴリを推測（アプリ側のカテゴリIDに合わせる） */
function guessCategory_(merchant) {
  if (!merchant) return 'other';
  const text = merchant.toLowerCase();
  const table = [
    ['food', ['スーパー', 'コンビニ', 'セブン', 'ローソン', 'ファミマ', 'マクドナルド', 'スターバックス', 'カフェ', 'レストラン', '弁当', '居酒屋']],
    ['transport', ['jr', 'suica', 'pasmo', 'etc', '新幹線', 'タクシー', '駅', '航空']],
    ['housing', ['電気', 'ガス', '水道', 'モバイル', 'ドコモ', 'ソフトバンク', 'wi-fi', 'ネット', 'サブスク', 'netflix', 'spotify', '保険']],
    ['entertainment', ['映画', 'ゲーム', 'カラオケ', 'ジム', 'ディズニー', 'シネマ']],
    ['shopping', ['ドン・キホーテ', 'ドンキ', 'ユニクロ', 'amazon', '楽天市場', '百貨店', '無印良品', 'ヨドバシ', 'ビックカメラ']],
  ];
  for (const [category, keywords] of table) {
    if (keywords.some((kw) => text.includes(kw.toLowerCase()))) return category;
  }
  return 'other';
}

// ============================================================
// Gmail ラベル
// ============================================================
function getOrCreateLabel_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

// ============================================================
// Firestore REST API 連携
// サービスアカウント（Script Properties に設定）で認証し、
// Firestore のセキュリティルールを介さず直接読み書きします。
// ============================================================

function getFirestoreAccessToken_() {
  const props = PropertiesService.getScriptProperties();
  const keyJson = props.getProperty('SERVICE_ACCOUNT_KEY');
  if (!keyJson) throw new Error('Script Properties に SERVICE_ACCOUNT_KEY が設定されていません。README.md を参照してください。');

  const key = JSON.parse(keyJson);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claimSet = {
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const encode = (obj) => Utilities.base64EncodeWebSafe(JSON.stringify(obj)).replace(/=+$/, '');
  const unsigned = `${encode(header)}.${encode(claimSet)}`;
  const signatureBytes = Utilities.computeRsaSha256Signature(unsigned, key.private_key);
  const signature = Utilities.base64EncodeWebSafe(signatureBytes).replace(/=+$/, '');
  const jwt = `${unsigned}.${signature}`;

  const response = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    payload: {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    },
    muteHttpExceptions: true,
  });

  const data = JSON.parse(response.getContentText());
  if (!data.access_token) throw new Error('アクセストークン取得に失敗: ' + response.getContentText());
  return data.access_token;
}

function firestoreDocPath_(...segments) {
  return `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/${segments.join('/')}`;
}

function firestoreRequest_(accessToken, method, url, body) {
  const options = {
    method,
    headers: { Authorization: 'Bearer ' + accessToken },
    contentType: 'application/json',
    muteHttpExceptions: true,
  };
  if (body) options.payload = JSON.stringify(body);
  const response = UrlFetchApp.fetch(url, options);
  const code = response.getResponseCode();
  if (code >= 300) {
    throw new Error(`Firestore API エラー (${code}): ${response.getContentText()}`);
  }
  return JSON.parse(response.getContentText() || '{}');
}

/** JSのプレーンオブジェクトを Firestore REST の型付き fields 形式に変換 */
function toFirestoreFields_(obj) {
  const fields = {};
  Object.keys(obj).forEach((key) => {
    const value = obj[key];
    if (typeof value === 'number') {
      fields[key] = Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
    } else if (typeof value === 'boolean') {
      fields[key] = { booleanValue: value };
    } else if (value === null || value === undefined) {
      fields[key] = { nullValue: null };
    } else {
      fields[key] = { stringValue: String(value) };
    }
  });
  return fields;
}

function createTransaction_(accessToken, tx) {
  const id = `t-gmail-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const url = firestoreDocPath_('artifacts', FIRESTORE_APP_ID, 'users', FIRESTORE_USER_ID, 'transactions') + `?documentId=${id}`;
  firestoreRequest_(accessToken, 'post', url, { fields: toFirestoreFields_(tx) });
}

/** 対応するカードがまだ無ければ、控えめな初期値で自動作成する（既にあれば何もしない） */
function ensureCardExists_(accessToken, rule) {
  const url = firestoreDocPath_('artifacts', FIRESTORE_APP_ID, 'users', FIRESTORE_USER_ID, 'cards', rule.cardId);
  const getOptions = {
    method: 'get',
    headers: { Authorization: 'Bearer ' + accessToken },
    muteHttpExceptions: true,
  };
  const existing = UrlFetchApp.fetch(url, getOptions);
  if (existing.getResponseCode() === 200) return; // 既に存在する

  const card = {
    name: rule.cardName,
    brand: 'VISA',
    last4: '----',
    number: '',
    holderName: '',
    expiry: '',
    cvv: '',
    theme: rule.cardTheme,
    limit: 0,
    billingDay: '末日',
    paymentDay: '27',
    weekendAdjustment: 'none',
    bankAccount: '',
  };
  firestoreRequest_(accessToken, 'patch', url, { fields: toFirestoreFields_(card) });
}

function updateStatus_(accessToken, status) {
  const url = firestoreDocPath_('artifacts', FIRESTORE_APP_ID, 'users', FIRESTORE_USER_ID, 'settings', 'gmailImportStatus');
  firestoreRequest_(accessToken, 'patch', url, { fields: toFirestoreFields_(status) });
}
