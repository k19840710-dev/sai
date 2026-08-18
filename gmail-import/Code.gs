/**
 * カード家計簿 — 即時利用通知メールからの自動取り込み (Google Apps Script)
 * ============================================================
 *
 * Gmail に届く「ご利用のお知らせ」「利用速報」等のメールを定期的にチェックし、
 * AI（Gemini）にメール本文を解析させて、カード家計簿アプリの Firestore に
 * 直接、明細として書き込みます。アプリを開かなくても自動で明細が増えます。
 *
 * カード会社ごとの解析ロジックをコードで用意する必要はありません。件名によるキーワード
 * 絞り込みもしていないので、新しいカード会社が増えてもコードを直す必要は一切ありません
 * （直近7日・未処理のメールは全部AIに「購入確定通知かどうか」を判定させています）。
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

// AIモデル名。将来このモデルが使えなくなった場合は、Google AI Studio
// (https://aistudio.google.com/) で使えるモデル名に差し替えてください。
const GEMINI_MODEL = 'gemini-2.5-flash';

// 件名によるキーワード絞り込みはしない。カード会社ごとに表現がバラバラ
// （「ご利用」「お支払い」「Mastercardで」「iD決済で」等）なので、キーワードで
// 絞ろうとすると必ずどこかで漏れる。「これが購入確定通知かどうか」の判定は
// 直近7日・未処理の全メールをAIにそのまま判定させることで解決する。
// 個人的なメールも含めて内容がAI（Gemini API）に送られる点は理解した上で
// 使うこと（同じGoogleアカウント内での処理だが、外部APIへの送信ではある）。

// ============================================================
// メイン処理（このプロジェクトの「トリガー」から checkCardEmails を呼ぶよう設定してください）
// ============================================================
function checkCardEmails() {
  const startedAt = new Date();
  let importedCount = 0;
  let lastError = null;

  try {
    const accessToken = getFirestoreAccessToken_();
    const geminiKey = getGeminiApiKey_();
    const label = getOrCreateLabel_(PROCESSED_LABEL_NAME);

    const query = `-label:"${PROCESSED_LABEL_NAME}" newer_than:7d`;
    const threads = GmailApp.search(query, 0, 50);
    console.log(`検索クエリ: ${query}`);
    console.log(`検索結果: ${threads.length}件のスレッド`);

    threads.forEach((thread) => {
      const messages = thread.getMessages();
      let threadHadFailure = false;

      messages.forEach((message) => {
        const subject = message.getSubject() || '';
        try {
          const body = message.getPlainBody();
          const result = analyzeEmailWithAi_(geminiKey, subject, body);

          if (result.status === 'not_purchase') {
            console.log(`AI判定: 購入確定通知ではない → スキップ: "${subject}"`);
            return; // このメール自体は「処理済み」として扱ってよい（threadHadFailureにはしない）
          }
          if (result.status === 'error') {
            console.warn(`AI解析エラー: "${subject}" → ${result.error}`);
            threadHadFailure = true; // 次回また拾い直す
            return;
          }

          const { issuerName, merchant, amount, date } = result.data;
          const cardId = slugifyCardId_(issuerName);
          ensureCardFromIssuer_(accessToken, cardId, issuerName);

          // 「コミックシーモア　サクヒン　ポイント」のような余計な文字を削り、
          // 知っている店名なら正式名称＋カテゴリに寄せる。
          const cleaned = cleanMerchantName_(merchant);
          // メールのメッセージIDから決まる固定IDにしておくことで、同じメールを
          // 何度処理しても重複した明細ができない（既存ドキュメントを上書きするだけ）。
          createTransaction_(accessToken, `t-gmail-${message.getId()}`, {
            cardId,
            amount,
            date,
            category: cleaned.category,
            memo: cleaned.name || issuerName,
          });
          importedCount += 1;
        } catch (err) {
          lastError = String(err);
          threadHadFailure = true;
          console.error(`処理エラー: "${subject}" → ${err}`);
        }
      });

      // スレッド内の全メールがAI判定含めて処理できた場合だけ「処理済み」にする。
      // エラーが混ざっていたら次回また対象にして再挑戦させる。
      if (!threadHadFailure) {
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
// AI（Gemini）によるメール解析
// ============================================================

function getGeminiApiKey_() {
  const key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) throw new Error('Script Properties に GEMINI_API_KEY が設定されていません。README.md を参照してください。');
  return key;
}

/**
 * メール本文をAIに渡し、「購入確定の利用通知かどうか」と、そうであれば
 * カード会社名・店名・金額・利用日を抽出してもらう。
 * 戻り値: { status: 'ok', data: {...} } / { status: 'not_purchase' } / { status: 'error', error }
 */
function analyzeEmailWithAi_(apiKey, subject, body) {
  const truncatedBody = String(body || '').slice(0, 4000);

  const prompt = [
    'あなたはクレジットカードの利用通知メールを解析するアシスタントです。',
    '以下のメールが「カードで買い物・決済をした際に届く、利用確定の通知メール」かどうか判定してください。',
    '本人確認（ワンタイムパスワード等）、ポイント失効案内、キャンペーン、広告、請求書（月次まとめ）、',
    'ログイン通知などは「利用確定の通知」ではないので is_purchase_notification は false にしてください。',
    '',
    '利用確定の通知メールであれば、以下も抽出してください:',
    '- issuer_name: カード会社・決済サービス名（例: 「メルカード」「三井住友カード」「楽天カード」など。件名や本文、署名から判断）',
    '- merchant: 利用した店舗・サービス名',
    '- amount: 利用金額（円。数字のみ、カンマなし）',
    '- date: 利用日（YYYY-MM-DD形式）',
    '',
    `件名: ${subject}`,
    '本文:',
    truncatedBody,
  ].join('\n');

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          is_purchase_notification: { type: 'BOOLEAN' },
          issuer_name: { type: 'STRING' },
          merchant: { type: 'STRING' },
          amount: { type: 'INTEGER' },
          date: { type: 'STRING' },
        },
        required: ['is_purchase_notification'],
      },
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  const code = response.getResponseCode();
  if (code >= 300) {
    return { status: 'error', error: `Gemini API エラー (${code}): ${response.getContentText().slice(0, 500)}` };
  }

  let parsed;
  try {
    const data = JSON.parse(response.getContentText());
    const text = data.candidates[0].content.parts[0].text;
    parsed = JSON.parse(text);
  } catch (e) {
    return { status: 'error', error: `AI応答の解析に失敗: ${e}` };
  }

  if (!parsed.is_purchase_notification) {
    return { status: 'not_purchase' };
  }

  const amount = Number(parsed.amount);
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(String(parsed.date || ''));
  if (!parsed.issuer_name || !parsed.merchant || !Number.isFinite(amount) || amount <= 0 || !dateOk) {
    return { status: 'error', error: `AIが購入通知と判定したが値が不完全: ${JSON.stringify(parsed)}` };
  }

  return {
    status: 'ok',
    data: {
      issuerName: String(parsed.issuer_name).trim(),
      merchant: String(parsed.merchant).trim(),
      amount,
      date: parsed.date,
    },
  };
}

// ============================================================
// 解析共通ヘルパー
// ============================================================

// 全角英数字・半角カナなどの表記ゆれを吸収してから比較するためのヘルパー
// （アプリ側 src/App.jsx の toComparableText と同じ考え方）。
function toComparableText_(str) {
  return String(str || '').normalize('NFKC').toLowerCase();
}

/** カード会社名からFirestoreの安全なドキュメントIDを作る（同じ会社名なら常に同じID） */
function slugifyCardId_(issuerName) {
  const base = String(issuerName || 'card').trim();
  const cleaned = base.replace(/[\/\s]+/g, '-').replace(/[^\p{L}\p{N}\-]/gu, '');
  return 'card-gmail-' + (cleaned || 'unknown');
}

/**
 * 店名からざっくりカテゴリを推測（アプリ側のカテゴリIDに合わせる）。
 * キーワード表は src/App.jsx の CATEGORY_KEYWORDS と揃えてある。
 * 精度を上げたいキーワードが見つかったら、両方のファイルに追記すること。
 */
function guessCategory_(merchant) {
  if (!merchant) return 'other';
  const text = toComparableText_(merchant);
  const table = [
    ['food', ['スーパー', 'マルエツ', 'イオン', '成城石井', 'コンビニ', 'セブン', 'ローソン', 'ファミリーマート', 'ファミマ', 'マクドナルド', 'モスバーガー', 'スターバックス', 'ドトール', 'カフェ', 'コーヒー', 'レストラン', '食堂', '弁当', '居酒屋', 'サイゼリヤ', '吉野家', 'すき家', '松屋', 'ラーメン', '寿司', '焼肉']],
    ['daily', ['無印良品', 'ドンキ', 'ドン・キホーテ', 'ロフト', 'ダイソー', 'セリア', 'キャンドゥ', '100円ショップ', 'ドラッグストア', 'マツモトキヨシ', 'マツキヨ', 'ウエルシア', 'ツルハ', 'サンドラッグ', 'ニトリ', '東急ハンズ', 'ホームセンター', 'カインズ', 'コーナン']],
    ['procurement', ['アリエクスプレス', 'aliexpress', 'ali express', 'タオバオ', 'taobao', '1688', 'pinduoduo', '拼多多', 'temu', 'shein', '速卖通']],
    ['beauty', ['美容院', 'ヘアサロン', '理容', 'ネイル', 'エステ', 'まつげ', 'コスメ', '化粧品', '資生堂', 'shiseido', 'アットコスメ', '脱毛']],
    ['social', ['ギフト', '贈り物', '贈答', 'ご祝儀', 'お祝い', 'プレゼント', '冠婚葬祭', '香典']],
    ['entertainment', ['映画', '遊園地', 'ゲーム', 'カラオケ', 'ライブ', 'ジム', 'シネマ', 'ディズニー', 'usj', 'switch', 'playstation', 'steam', 'コミック', '漫画', 'シーモア', '電子書籍', 'kindle', 'ebookjapan', 'dmm', 'fanza', 'ニコニコ', 'hulu', 'u-next', 'ユーネクスト', 'abema']],
    ['travel', ['jtb', 'his', 'エイチ・アイ・エス', '楽天トラベル', 'じゃらん', 'booking', 'expedia', 'airbnb', 'エアビーアンドビー', 'ホテル', '旅館', '民宿']],
    ['communication', ['povo', 'ドコモ', 'au', 'ソフトバンク', 'モバイル', 'ワイモバイル', 'uq', 'nhk', 'wi-fi', 'ネット', 'サブスク', 'netflix', 'spotify', 'プライム', '楽天モバイル']],
    ['transport', ['suica', 'pasmo', 'etc', '新幹線', 'jr', '電車', 'バス', 'タクシー', 'ガソリン', 'eneos', '駐車場', 'メトロ', 'タイムズ', 'ana', 'jal', '航空', 'チャージ', '駅']],
  ];
  for (const [category, keywords] of table) {
    if (keywords.some((kw) => text.includes(toComparableText_(kw)))) return category;
  }
  return 'other';
}

// よく見かける店名・サービス名。メール本文には「コミックシーモア　サクヒン　ポイント」の
// ように余計な文字が付くことがあるので、知っている店名なら正式名称＋カテゴリに寄せる。
// src/App.jsx の KNOWN_MERCHANTS と揃えてあるので、追加・変更したら両方に反映すること。
const KNOWN_MERCHANTS_ = [
  { match: 'パルコ', name: 'パルコ', category: 'other' },
  { match: 'ユニクロ', name: 'ユニクロ', category: 'other' },
  { match: 'gu', name: 'GU', category: 'other' },
  { match: '無印良品', name: '無印良品', category: 'daily' },
  { match: 'ヨドバシ', name: 'ヨドバシカメラ', category: 'other' },
  { match: 'ビックカメラ', name: 'ビックカメラ', category: 'other' },
  { match: 'aliexpress', name: 'AliExpress', category: 'procurement' },
  { match: 'ali express', name: 'AliExpress', category: 'procurement' },
  { match: 'taobao', name: 'Taobao', category: 'procurement' },
  { match: 'temu', name: 'Temu', category: 'procurement' },
  { match: 'シーモア', name: 'コミックシーモア', category: 'entertainment' },
  { match: 'kindle', name: 'Kindle', category: 'entertainment' },
  { match: 'ebookjapan', name: 'ebookJapan', category: 'entertainment' },
  { match: 'cycling', name: 'Hello Cycling', category: 'transport' },
  { match: 'chargespot', name: 'ChargeSPOT', category: 'other' },
  { match: 'suica', name: 'Suica', category: 'transport' },
  { match: 'pasmo', name: 'PASMO', category: 'transport' },
  { match: 'povo', name: 'povo', category: 'communication' },
  { match: 'docomo', name: 'ドコモ', category: 'communication' },
  { match: 'ソフトバンク', name: 'ソフトバンク', category: 'communication' },
  { match: 'ラクテンモバイル', name: '楽天モバイル', category: 'communication' },
  { match: '楽天モバイル', name: '楽天モバイル', category: 'communication' },
  { match: 'netflix', name: 'Netflix', category: 'communication' },
  { match: 'spotify', name: 'Spotify', category: 'communication' },
  { match: 'sbi証券', name: 'SBI証券', category: 'other' },
  { match: 'スターバックス', name: 'スターバックス', category: 'food' },
  { match: 'ドトール', name: 'ドトール', category: 'food' },
  { match: 'マクドナルド', name: 'マクドナルド', category: 'food' },
  { match: 'セブン', name: 'セブン-イレブン', category: 'food' },
  { match: 'ローソン', name: 'ローソン', category: 'food' },
  { match: 'ファミマ', name: 'ファミリーマート', category: 'food' },
  { match: 'ファミリーマート', name: 'ファミリーマート', category: 'food' },
];

/**
 * メールから読み取った店名を、既知の店名リストに近ければ正式名称＋カテゴリに
 * 置き換える（src/App.jsx の cleanMerchantName と同じ考え方）。
 * 一致しなければ元の店名のままキーワード表からカテゴリだけ推測する。
 */
function cleanMerchantName_(rawMerchant) {
  const base = String(rawMerchant || '').replace(/[_＿]/g, ' ').replace(/\s+/g, ' ').trim();
  const compact = toComparableText_(base).replace(/\s+/g, '');

  for (const merchant of KNOWN_MERCHANTS_) {
    if (compact.includes(toComparableText_(merchant.match).replace(/\s+/g, ''))) {
      return { name: merchant.name, category: merchant.category };
    }
  }
  return { name: base, category: guessCategory_(base) };
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

/**
 * 明細を書き込む。id を固定にして PATCH（作成 or 上書き）することで、
 * 同じメールを誤って2回処理しても重複した明細ができないようにしている。
 */
function createTransaction_(accessToken, id, tx) {
  const url = firestoreDocPath_('artifacts', FIRESTORE_APP_ID, 'users', FIRESTORE_USER_ID, 'transactions', id);
  firestoreRequest_(accessToken, 'patch', url, { fields: toFirestoreFields_(tx) });
}

// 自動作成するカードのテーマ色（アプリ側のCARD_THEMESと同じキー）。
// カード会社名ごとに固定の色になるよう、名前から決定的に選ぶ。
const CARD_THEME_PALETTE = ['purple', 'dark', 'emerald', 'blue', 'sunset'];
function themeForIssuer_(issuerName) {
  let hash = 0;
  const s = String(issuerName || '');
  for (let i = 0; i < s.length; i += 1) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }
  return CARD_THEME_PALETTE[hash % CARD_THEME_PALETTE.length];
}

/** 対応するカードがまだ無ければ、控えめな初期値で自動作成する（既にあれば何もしない） */
function ensureCardFromIssuer_(accessToken, cardId, issuerName) {
  const url = firestoreDocPath_('artifacts', FIRESTORE_APP_ID, 'users', FIRESTORE_USER_ID, 'cards', cardId);
  const getOptions = {
    method: 'get',
    headers: { Authorization: 'Bearer ' + accessToken },
    muteHttpExceptions: true,
  };
  const existing = UrlFetchApp.fetch(url, getOptions);
  if (existing.getResponseCode() === 200) return; // 既に存在する

  const card = {
    name: issuerName,
    brand: 'VISA',
    last4: '----',
    number: '',
    holderName: '',
    expiry: '',
    cvv: '',
    theme: themeForIssuer_(issuerName),
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

// ============================================================
// 調査用: checkCardEmails が対象にするメール（未処理ラベル・直近7日）の
// 件名一覧をログに出す。件名だけで絞り込みはしていないので、ここに出てくる
// メールが次回 checkCardEmails 実行時にすべてAI判定の対象になる。
// 実行する時は、上のプルダウンで checkCardEmails ではなく debugSearch を選ぶこと。
// ============================================================
function debugSearch() {
  const query = `-label:"${PROCESSED_LABEL_NAME}" newer_than:7d`;
  const threads = GmailApp.search(query, 0, 50);
  console.log(`検索クエリ: ${query}`);
  console.log(`対象スレッド数: ${threads.length}件`);
  threads.forEach((thread) => {
    thread.getMessages().forEach((message) => {
      const subject = message.getSubject() || '';
      console.log(`対象: "${subject}"`);
    });
  });
}
