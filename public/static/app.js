/**
 * まちづくりAI - app.js
 * ================================================
 * チャットボットロジック（質問フロー実装済み）
 * ================================================
 */

/* ================================================
   状態管理
================================================ */
let currentStep = 1;       // 現在の質問番号（1〜6）
let answers = {};           // 全回答を保存するオブジェクト
let isComposing = false;    // IME変換中フラグ
let intervalId = null;      // タイマーの setInterval ID
let elapsedSeconds = 0;     // 経過秒数
let generatedImageUrl = ''; // 生成画像URL（downloadImage に渡す）
let isGenerating = false;   // 画像生成中フラグ（beforeunload 用）
let skipComposite = false;  // 合成スキップフラグ（夜景・夕景指定時は true）
let compositeObjectUrl = null; // 合成済み画像の objectURL（ダウンロード用）

/* ================================================
   Canvas 合成 定数
   元画像の上部を生成画像に重ねる際の区切り位置とグラデーション幅
================================================ */
const COMPOSITE_CUT_RATIO  = 0.30; // 区切り位置（元画像高さ比）→ 元画像高さ 1495px の 30% = 448px
const COMPOSITE_FEATHER_PX = 60;   // グラデーション幅（px）：境界を目立たなくするブレンド幅

/* ================================================
   shouldSkipComposite(text)
   ユーザー入力（6問の回答を結合した draftPrompt 全体）に
   夜景・夕景・花火などの時間帯・照明ワードが含まれるか判定。
   true の場合は Canvas 合成をスキップして生成画像をそのまま表示する。
================================================ */
const NIGHTTIME_KEYWORDS = [
  '夜', '夜景', '夜間', '深夜',
  '夕方', '夕暮れ', '夕焼け', '夕景', 'サンセット', '夕刻',
  '薄暮', '黄昏', 'たそがれ',
  '花火', 'hanabi',
  'ライトアップ', 'イルミネーション', 'イルミ',
  '照明演出', 'キャンドル', '提灯', 'ちょうちん',
  '星空', '夜空', '星',
  '雨', '曇り', '霧', '嵐',
];

function shouldSkipComposite(text) {
  return NIGHTTIME_KEYWORDS.some((kw) => text.includes(kw));
}

/* ================================================
   質問定義
   ※ Q1 は初期表示済みのため sendMessage では使わない
     （Q2〜Q6 を currentStep === 2〜6 のときに表示）
================================================ */
const QUESTIONS = {
  2: () => `どんな人たちが、どんな気持ちで、何をして過ごす施設ですか？\n（例：小学生のいる親子連れ家族が、楽しくおしゃべりしながら、お弁当を広げて寛げる広場　など）`,
  3: () => `どんなスタイルがお好みですか？　もし、施設の規模・階数や造りなども希望があれば（無くても大丈夫です）教えてください。\n（例：和風、洋風、近未来的、レトロ、ファンタジー風、木造２階建ての瓦葺き、２階建ての全面ガラス張り　など）`,
  4: () => `周囲の環境はどんな感じがいいですか？　追加したい設備・備品・装飾なども希望があれば（無くても大丈夫です）教えてください。\n（例：緑豊か、花々に囲まれている、桜の並木、一面の芝生、おしゃれな石畳、周囲には木製のベンチ、片隅に時計台、パーティー会場のような飾りつけ　など）`,
  5: () => `季節や時間帯の希望はありますか？\n（例：春の昼間、夏の夕暮れ、秋の黄昏れ、冬の朝、なし　など）`,
  6: () => `最後に、他に追加したい要素や、こだわりたい点はありますか？\n（例：ペットも一緒に遊んでいる、空には花火があがっている、なし　など）`,
};

/* ================================================
   回答の保存先キー（step → answersのキー名）
================================================ */
const ANSWER_KEYS = {
  1: 'facilityType',      // 創りたい施設
  2: 'usageScene',        // 誰が・どんな気持ちで・何をする場所か
  3: 'style',             // スタイル・規模・造り
  4: 'surroundings',      // 周囲環境・設備・装飾
  5: 'timeOfDay',         // 季節・時間帯
  6: 'additionalNotes',   // 追加要素・こだわり
};

/* ================================================
   DOM 参照（DOMContentLoaded 後に取得）
================================================ */
let chatMessages;
let chatInput;
let sendButton;
let resultSection;
let resultLoading;
let resultImageWrapper;
let resultImage;
let resultActions;
let downloadButton;

document.addEventListener('DOMContentLoaded', () => {
  chatMessages       = document.getElementById('chatMessages');
  chatInput          = document.getElementById('chatInput');
  sendButton         = document.getElementById('sendButton');
  resultSection      = document.getElementById('resultSection');
  resultLoading      = document.getElementById('resultLoading');
  resultImageWrapper = document.getElementById('resultImageWrapper');
  resultImage        = document.getElementById('resultImage');
  resultActions      = document.getElementById('resultActions');
  downloadButton     = document.getElementById('downloadButton');

  // --- IME 変換中フラグ管理 ---
  chatInput.addEventListener('compositionstart', () => {
    isComposing = true;
  });
  chatInput.addEventListener('compositionend', () => {
    isComposing = false;
  });

  // --- Enterキー送信（IME変換中は無視） ---
  chatInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && !isComposing) {
      event.preventDefault();
      sendMessage();
    }
  });

  // --- 送信ボタンクリック ---
  sendButton.addEventListener('click', () => {
    sendMessage();
  });

  // --- 入力欄フォーカス時のスクロール補正（モバイルキーボード対策） ---
  chatInput.addEventListener('focus', () => {
    setTimeout(() => {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }, 300);
  });

  // --- ダウンロードボタン ---
  downloadButton.addEventListener('click', () => {
    // 合成済み画像がある場合はそちらを優先、なければ生成画像そのまま
    downloadImage(compositeObjectUrl || generatedImageUrl);
  });

  // --- やり直しボタン ---
  const resetButton = document.getElementById('resetButton');
  if (resetButton) {
    resetButton.addEventListener('click', () => resetChat());
  }

  // --- 生成中のページ離脱を警告（beforeunload） ---
  window.addEventListener('beforeunload', (event) => {
    if (isGenerating) {
      event.preventDefault();
      // Chrome では returnValue を設定する必要がある
      event.returnValue = '画像を生成中です。ページを離れると生成がキャンセルされます。';
      return event.returnValue;
    }
  });
});

/* ================================================
   sendMessage()
   ユーザーのメッセージを処理し、次のAI質問を表示する
================================================ */
function sendMessage() {
  const text = chatInput.value.trim();

  // 1. 空文字・空白のみの場合は何もしない
  if (text === '') return;

  // 2. ユーザーメッセージをチャットに追加
  addMessage(text, true);

  // 3. 入力欄をクリア
  chatInput.value = '';

  // 4. 現在のステップに対応するキーに回答を保存
  const key = ANSWER_KEYS[currentStep];
  if (key) {
    answers[key] = text;
  }

  // 5. ステップをインクリメント
  currentStep++;

  // 6. 次のAI応答を表示（タイピング演出つき）
  if (currentStep <= 6) {
    // Q2〜Q6 を表示
    showTypingThenMessage(QUESTIONS[currentStep]());
  } else {
    // 全6問完了 → 確認メッセージを表示して画像生成へ
    const summary =
      `ありがとうございます！以下の内容で画像を生成しますね。\n` +
      `🏗 施設: ${answers.facilityType}\n` +
      `👥 過ごし方: ${answers.usageScene}\n` +
      `🎨 スタイル: ${answers.style}\n` +
      `🌳 周囲・設備: ${answers.surroundings}\n` +
      `🕐 季節/時間帯: ${answers.timeOfDay}\n` +
      `✨ こだわり: ${answers.additionalNotes}\n\n` +
      `画像の生成を開始します...しばらくお待ちください！`;

    // 入力欄・送信ボタンを無効化
    setInputDisabled(true);

    showTypingThenMessage(summary, () => {
      // AIメッセージ表示から1秒後に generateImage() 呼び出し
      setTimeout(() => {
        generateImage();
      }, 1000);
    });
  }
}

/* ================================================
   addMessage(text, isUser)
   チャットエリアにメッセージバブルを追加する
================================================ */
function addMessage(text, isUser) {
  // ---- ラッパー ----
  const messageDiv = document.createElement('div');
  messageDiv.classList.add('chat-message');
  messageDiv.classList.add(isUser ? 'chat-message--user' : 'chat-message--ai');

  // ---- AI側のアバターアイコン ----
  if (!isUser) {
    const avatar = document.createElement('div');
    avatar.classList.add('chat-message__avatar');
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = '🤖';
    messageDiv.appendChild(avatar);
  }

  // ---- バブル本体（改行を <br> に変換） ----
  const bubble = document.createElement('div');
  bubble.classList.add('chat-message__bubble');
  bubble.innerHTML = escapeHtml(text).replace(/\n/g, '<br>');
  messageDiv.appendChild(bubble);

  chatMessages.appendChild(messageDiv);

  // ---- 自動スクロール ----
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

/* ================================================
   showTypingThenMessage(text, onShown)
   タイピングインジケーター（「...」）を表示後、
   実際のAIメッセージに差し替えるタイミング制御
   - ユーザー送信から 0.5秒後 → インジケーター表示
   - インジケーター表示から 0.8秒後 → AIメッセージ表示
================================================ */
function showTypingThenMessage(text, onShown) {
  // 0.5秒後にタイピングインジケーターを挿入
  setTimeout(() => {
    const indicator = createTypingIndicator();
    chatMessages.appendChild(indicator);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // さらに0.8秒後にインジケーターを削除してAIメッセージ表示
    setTimeout(() => {
      indicator.remove();
      addMessage(text, false);
      if (typeof onShown === 'function') {
        onShown();
      }
    }, 800);
  }, 500);
}

/* ================================================
   createTypingIndicator()
   「...」タイピングインジケーターのDOM要素を生成して返す
================================================ */
function createTypingIndicator() {
  const wrapper = document.createElement('div');
  wrapper.classList.add('chat-message', 'chat-message--ai', 'chat-message--typing');

  const avatar = document.createElement('div');
  avatar.classList.add('chat-message__avatar');
  avatar.setAttribute('aria-hidden', 'true');
  avatar.textContent = '🤖';

  const bubble = document.createElement('div');
  bubble.classList.add('chat-message__bubble', 'chat-message__bubble--typing');
  bubble.setAttribute('aria-label', '入力中');
  // 3つのドットをspan要素で作成（CSSアニメーション用）
  bubble.innerHTML =
    '<span class="typing-dot"></span>' +
    '<span class="typing-dot"></span>' +
    '<span class="typing-dot"></span>';

  wrapper.appendChild(avatar);
  wrapper.appendChild(bubble);
  return wrapper;
}

/* ================================================
   setInputDisabled(disabled)
   入力欄・送信ボタンの有効/無効を切り替える
================================================ */
function setInputDisabled(disabled) {
  chatInput.disabled = disabled;
  sendButton.disabled = disabled;
  if (disabled) {
    chatInput.placeholder = '入力が完了しました';
  } else {
    chatInput.placeholder = 'メッセージを入力...';
  }
}

/* ================================================
   escapeHtml(str)
   XSS対策: ユーザー入力をHTMLエスケープする
================================================ */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ================================================
   buildPrompt(answers)
   ユーザーの回答から画像生成用の日本語プロンプト草案を組み立てる

   スキップ判定: 以下のキーワードをいずれか「含む」場合はその行を省略（部分一致）
     「なし」「ない」「なんでも」「特に」「とくに」「任せ」
================================================ */
function buildPrompt(answers) {
  // ---- スキップ判定ヘルパー ----
  const SKIP_KEYWORDS = ['なし', 'ない', 'なんでも', '特に', 'とくに', '任せ'];
  const shouldSkip = (value) => {
    if (!value) return true;
    return SKIP_KEYWORDS.some((kw) => value.includes(kw));
  };

  // ---- ベーステンプレート ----
  const base =
    `マスクした白のエリアを${answers.facilityType}をメインとした場所にする。\n` +
    `${answers.facilityType}の周りは、${answers.facilityType}にあった雰囲気のものにすること。\n` +
    // 柵の要否は画像セットごとに異なるため、src/index.tsx の
    // systemPrompt ルール6（edgeTreatmentRule）で一元管理する
    `また、アニメ風やイラストではなく、実写写真風・フォトリアル寄りにすること。\n` +
    `一方で、建物、道路、通路、高架構造物、その他すべての建築要素は元の画像のまま保持する。\n` +
    `ただし、${answers.facilityType}や樹木などの追加要素が、マスクの境界で途中で切れないようにする。`;

  // ---- 追加情報（スキップ対象外のみ付加） ----
  const extras = [];
  if (!shouldSkip(answers.usageScene)) {
    extras.push(`利用シーン・賑わい: ${answers.usageScene}`);
  }
  if (!shouldSkip(answers.style)) {
    extras.push(`スタイル・造り: ${answers.style}`);
  }
  if (!shouldSkip(answers.surroundings)) {
    extras.push(`周囲の環境: ${answers.surroundings}`);
  }
  if (!shouldSkip(answers.timeOfDay)) {
    extras.push(`季節・時間帯: ${answers.timeOfDay}`);
  }
  if (!shouldSkip(answers.additionalNotes)) {
    extras.push(`追加要素: ${answers.additionalNotes}`);
  }

  const draftPrompt = extras.length > 0
    ? `${base}\n${extras.join('\n')}`
    : base;

  return draftPrompt;
}

/* ================================================
   refinePrompt(draftPrompt)
   POST /api/refine-prompt を呼び出し、
   GPT-4.1-mini で英語プロンプトに最適化する。
   失敗時は draftPrompt をそのまま返す（フォールバック）
================================================ */
async function refinePrompt(draftPrompt) {
  try {
    const response = await fetch('/api/refine-prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draftPrompt: draftPrompt }),
    });
    const data = await response.json();
    if (data.success) {
      return data.refinedPrompt;
    } else {
      console.warn('[refinePrompt] LLM refinement failed, using draft prompt:', data.error);
      return draftPrompt;
    }
  } catch (error) {
    console.warn('[refinePrompt] fetch error, using draft prompt:', error);
    return draftPrompt;
  }
}

/* ================================================
   generateImage()
   プロンプト最適化 → fal.ai への投入・ポーリング・結果取得
================================================ */
async function generateImage() {
  // ---- オフライン確認 ----
  if (!navigator.onLine) {
    addMessage('📡 インターネット接続を確認してください。接続が回復してから「もう一度やり直す」を押してください。', false);
    return;
  }

  isGenerating = true;

  try {
    // ---- Phase 1: プロンプト最適化（既存のまま） ----
    const draftPrompt = buildPrompt(answers);

    // 合成スキップ判定：6問の回答を結合した draftPrompt 全体を対象に判定
    skipComposite = shouldSkipComposite(draftPrompt);
    console.log(`[composite] skipComposite=${skipComposite} / draftPrompt snippet: "${draftPrompt.slice(0, 60)}..."`);

    addMessage('プロンプトを最適化中...🔄', false);
    const finalPrompt = await refinePrompt(draftPrompt);

    // ---- Phase 2: 画像生成 ----
    addMessage('画像を生成中です...🎨\n1〜3分ほどかかる場合があります。', false);
    showLoading();
    startTimer();

    // Step A: fal.ai にジョブを投入して requestId を取得
    const submitRes = await fetch('/api/generate-submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: finalPrompt }),
    });
    const submitData = await submitRes.json();
    if (!submitData.success) throw new Error(submitData.error);

    const requestId = submitData.requestId;

    // Step B: ステータスポーリング（3秒間隔、最大120回 = 360秒）
    let status = 'IN_QUEUE';
    let pollCount = 0;
    const maxPolls = 120;

    while (status !== 'COMPLETED' && status !== 'FAILED' && pollCount < maxPolls) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      const statusRes = await fetch(`/api/generate-status?id=${requestId}`);
      const statusData = await statusRes.json();
      status = statusData.status;
      pollCount++;

    }

    if (status === 'FAILED') {
      throw new Error('画像生成に失敗しました。プロンプトを変えてお試しください。');
    }
    if (pollCount >= maxPolls) {
      throw new Error('画像生成がタイムアウトしました。もう一度お試しください。');
    }

    // Step C: 生成結果（画像URL）を取得
    const resultRes = await fetch(`/api/generate-result?id=${requestId}`);
    const resultData = await resultRes.json();
    if (!resultData.success) throw new Error(resultData.error);

    // ---- Phase 3: 結果表示（合成 or スキップ） ----
    stopTimer();
    // hideLoading は compositeWithOriginal の完了後に呼ぶ（合成中はローディング継続）
    isGenerating = false;
    await displayResult(resultData.imageUrl);
    addMessage('✅ 画像の生成が完了しました！\n上の画像エリアで確認できます。\nタブで元画像と切り替えられます。', false);

  } catch (error) {
    stopTimer();
    hideLoading();
    isGenerating = false;
    console.error('Generation error:', error);
    addMessageWithRetry('❌ ' + error.message);
  }
}

/* ================================================
   showLoading()
   resultSection を表示し、スピナー・経過時間要素を可視化する
================================================ */
function showLoading() {
  resultSection.style.display = 'block';
  resultLoading.style.display = 'flex';
  resultImageWrapper.style.display = 'none';
  resultActions.style.display = 'none';

  // 経過時間要素を resultLoading 内に動的追加（なければ）
  if (!document.getElementById('elapsed-time')) {
    const elapsedEl = document.createElement('p');
    elapsedEl.id = 'elapsed-time';
    elapsedEl.className = 'result-section__loading-text';
    elapsedEl.textContent = '経過時間: 0秒';
    resultLoading.appendChild(elapsedEl);
  } else {
    document.getElementById('elapsed-time').textContent = '経過時間: 0秒';
  }

  // resultSection が画面内に入るようスクロール
  resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ================================================
   hideLoading()
   スピナー・生成中テキスト・経過時間を非表示にする
================================================ */
function hideLoading() {
  resultLoading.style.display = 'none';
  const elapsedEl = document.getElementById('elapsed-time');
  if (elapsedEl) elapsedEl.textContent = '';
}

/* ================================================
   startTimer()
   1秒ごとに経過時間を更新する
================================================ */
function startTimer() {
  elapsedSeconds = 0;
  clearInterval(intervalId); // 念のため既存タイマーをクリア
  intervalId = setInterval(() => {
    elapsedSeconds++;
    const elapsedEl = document.getElementById('elapsed-time');
    if (elapsedEl) {
      elapsedEl.textContent = `経過時間: ${elapsedSeconds}秒`;
    }
  }, 1000);
}

/* ================================================
   stopTimer()
   タイマーを停止する
================================================ */
function stopTimer() {
  clearInterval(intervalId);
  intervalId = null;
}

/* ================================================
   displayResult(imageUrl)
   タブUIを生成し、生成画像を表示する。
   ダウンロード・やり直しボタンも有効化する。
================================================ */
async function displayResult(imageUrl) {
  // グローバルに保存（downloadImage で使用）
  generatedImageUrl = imageUrl;

  // ---- 合成 or スキップ判定 ----
  let displayUrl;
  if (skipComposite) {
    // 夜景・夕景指定: 生成画像をそのまま表示
    console.log('[composite] SKIP: 生成画像をそのまま表示');
    compositeObjectUrl = null; // blob URL なし
    displayUrl = imageUrl;
    hideLoading();
  } else {
    // 通常ケース: 元画像の上部を重ねる Canvas 合成
    console.log('[composite] EXECUTE: Canvas 合成を実行');
    try {
      displayUrl = await compositeWithOriginal(imageUrl);
      hideLoading();
    } catch (err) {
      // 合成失敗時はフォールバックとして生成画像をそのまま表示
      console.warn('[composite] 合成失敗、フォールバック:', err);
      compositeObjectUrl = null;
      displayUrl = imageUrl;
      hideLoading();
    }
  }

  // ---- 既存の original-image-section を取得 ----
  const originalSection = document.querySelector('.original-image-section');

  // ---- タブコンテナを original-image-section の直前に挿入 ----
  // すでに存在する場合は再生成しない
  let tabContainer = document.getElementById('tab-container');
  if (!tabContainer) {
    tabContainer = document.createElement('div');
    tabContainer.id = 'tab-container';
    tabContainer.className = 'tab-container';
    tabContainer.innerHTML =
      '<button class="tab-btn" id="tab-original" onclick="switchTab(\'original\')">元画像</button>' +
      '<button class="tab-btn tab-btn--active" id="tab-result" onclick="switchTab(\'result\')">生成結果</button>';
    originalSection.parentNode.insertBefore(tabContainer, originalSection);
  }

  // ---- original-image-section を tab-image-section スタイルに切り替え ----
  originalSection.classList.add('tab-image-section');

  // ---- 生成結果の img を resultImageWrapper に設定（1回だけ表示） ----
  resultImage.src = displayUrl;
  resultImage.style.touchAction = 'pan-y pinch-zoom';
  resultImage.alt = 'AI生成画像';

  // ---- 生成結果タブをアクティブ → 元画像を非表示、生成画像を表示 ----
  originalSection.style.display = 'none';

  resultSection.style.display = 'block';
  resultLoading.style.display = 'none';
  resultImageWrapper.style.display = 'block';
  resultActions.style.display = 'flex';

  // ---- 結果エリアにノートテキストを追加（なければ） ----
  if (!document.getElementById('result-note')) {
    const note = document.createElement('p');
    note.id = 'result-note';
    note.className = 'tab-image-section__note';
    note.textContent = '※ 画像はピンチズームで拡大できます';
    resultImageWrapper.insertAdjacentElement('afterend', note);
  }

  // 結果エリアを画面内にスクロール
  resultActions.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

/* ================================================
   compositeWithOriginal(generatedUrl)
   生成画像の上部に元画像の上部を Canvas で重ね合わせる。

   手順:
   1. 生成画像・元画像を両方ロード（CORS: anonymous）
   2. Canvas を生成画像サイズで作成
   3. 生成画像を全面に描画
   4. 元画像を生成画像と同じ幅・高さにリサイズして描画（比率が 4:3 で固定されているため縦位置一致）
   5. グラデーションマスクで境界を馴染ませ、上部のみ元画像を表示
   6. canvas.toBlob() で objectURL を返す
================================================ */
async function compositeWithOriginal(generatedUrl) {
  const ORIG_URL = '/static/images/003-motogazou-amagasaki.jpg';

  // 画像を crossOrigin: anonymous でロード
  const loadImage = (src) => new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error(`画像ロード失敗: ${src}`));
    img.src = src;
  });

  const [genImg, origImg] = await Promise.all([
    loadImage(generatedUrl),
    loadImage(ORIG_URL),
  ]);

  const gW = genImg.naturalWidth;
  const gH = genImg.naturalHeight;

  // 区切り位置（生成画像の高さ基準）
  const cutY   = Math.round(gH * COMPOSITE_CUT_RATIO);
  const feather = COMPOSITE_FEATHER_PX;
  console.log(`[composite] genSize=${gW}x${gH} / cutY=${cutY} / feather=${feather}px`);

  // Canvas を生成画像サイズで作成
  const canvas = document.createElement('canvas');
  canvas.width  = gW;
  canvas.height = gH;
  const ctx = canvas.getContext('2d');

  // Step1: 生成画像を全面に描画
  ctx.drawImage(genImg, 0, 0, gW, gH);

  // Step2: 元画像を生成画像と同じサイズにスケーリングして一時 canvas に描画
  // （aspect_ratio='4:3' 固定により縦横比が一致しているため、単純リサイズで縦位置が合う）
  const origCanvas = document.createElement('canvas');
  origCanvas.width  = gW;
  origCanvas.height = gH;
  const origCtx = origCanvas.getContext('2d');
  origCtx.drawImage(origImg, 0, 0, gW, gH);

  // Step3: 上部（y=0 〜 cutY+feather）に元画像を重ねる
  // グラデーションマスク：cutY-feather/2 〜 cutY+feather/2 の範囲で透明に抜ける
  const gradient = ctx.createLinearGradient(0, cutY - feather / 2, 0, cutY + feather / 2);
  gradient.addColorStop(0, 'rgba(0,0,0,1)');   // 上端：元画像100%
  gradient.addColorStop(1, 'rgba(0,0,0,0)');   // 下端：元画像0%（生成画像が透過）

  // 元画像の上部をグラデーションマスクで合成
  ctx.save();
  // クリップ: y=0 〜 cutY+feather/2 の範囲のみ描画
  ctx.beginPath();
  ctx.rect(0, 0, gW, cutY + feather / 2);
  ctx.clip();

  // 元画像を描画してからグラデーションで消す（destination-out で切り抜き）
  ctx.drawImage(origCanvas, 0, 0, gW, gH);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = gradient;
  // 反転グラデ（下端が不透明 = 元画像を消す）
  const gradientMask = ctx.createLinearGradient(0, cutY - feather / 2, 0, cutY + feather / 2);
  gradientMask.addColorStop(0, 'rgba(0,0,0,0)');  // 上端：元画像を残す
  gradientMask.addColorStop(1, 'rgba(0,0,0,1)');  // 下端：元画像を消す（生成画像を見せる）
  ctx.fillStyle = gradientMask;
  ctx.fillRect(0, 0, gW, cutY + feather / 2);
  ctx.restore();

  // Step4: canvas.toBlob() で objectURL を返す
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error('canvas.toBlob failed')); return; }
      const url = URL.createObjectURL(blob);
      compositeObjectUrl = url; // ダウンロード用に保存
      console.log(`[composite] 完了: objectURL=${url.slice(0, 30)}...`);
      resolve(url);
    }, 'image/png');
  });
}

/* ================================================
   switchTab(tab)
   'original' または 'result' を受け取り表示を切り替える
================================================ */
function switchTab(tab) {
  const originalSection = document.querySelector('.original-image-section');
  const tabOriginal = document.getElementById('tab-original');
  const tabResult   = document.getElementById('tab-result');

  if (tab === 'original') {
    // 元画像を表示、結果エリアを非表示
    originalSection.style.display = 'block';
    resultSection.style.display = 'none';
    tabOriginal.classList.add('tab-btn--active');
    tabResult.classList.remove('tab-btn--active');
  } else {
    // 生成結果を表示、元画像を非表示
    originalSection.style.display = 'none';
    resultSection.style.display = 'block';
    tabOriginal.classList.remove('tab-btn--active');
    tabResult.classList.add('tab-btn--active');
  }
}

/* ================================================
   addMessageWithRetry(errorText)
   エラーメッセージ＋「もう一度やり直す」ボタンを
   チャットバブルとして追加する専用関数
================================================ */
function addMessageWithRetry(errorText) {
  const messageDiv = document.createElement('div');
  messageDiv.classList.add('chat-message', 'chat-message--ai');

  const avatar = document.createElement('div');
  avatar.classList.add('chat-message__avatar');
  avatar.setAttribute('aria-hidden', 'true');
  avatar.textContent = '🤖';

  const bubble = document.createElement('div');
  bubble.classList.add('chat-message__bubble');
  // エラー文言（XSSエスケープ） + 改行 + やり直しボタン
  bubble.innerHTML =
    escapeHtml(errorText).replace(/\n/g, '<br>') +
    '<br><button class="chat-retry-btn" onclick="resetChat()">↩ もう一度やり直す</button>';

  messageDiv.appendChild(avatar);
  messageDiv.appendChild(bubble);
  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

/* ================================================
   downloadImage(url)
   生成画像を端末にダウンロードする。
   fetch→blob DL を試み、iOS等で失敗した場合は
   window.open にフォールバックして長押し保存を案内する。
================================================ */
async function downloadImage(url) {
  if (!url) return;
  try {
    addMessage('📥 ダウンロードを準備中...', false);
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = 'machizukuri_ai_result.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
    addMessage('✅ ダウンロードが開始されました！', false);
  } catch (error) {
    console.warn('Direct download failed:', error);
    addMessage('📱 画像を長押しして「画像を保存」を選んでください。', false);
    window.open(url, '_blank');
  }
}

/* ================================================
   resetChat()
   チャットと生成結果を初期状態にリセットする
================================================ */
function resetChat() {
  // チャット履歴を初期AIメッセージのみ残してクリア
  // （最初の .chat-message--ai 要素だけ残す）
  const allMessages = chatMessages.querySelectorAll('.chat-message');
  allMessages.forEach((el, index) => {
    if (index > 0) el.remove(); // 最初のAIメッセージ（index=0）は残す
  });

  // ---- タブUIを削除 ----
  const tabContainer = document.getElementById('tab-container');
  if (tabContainer) tabContainer.remove();

  // ---- 元画像セクションを元のスタイルに戻す ----
  const originalSection = document.querySelector('.original-image-section');
  if (originalSection) {
    originalSection.classList.remove('tab-image-section');
    originalSection.style.display = ''; // インラインスタイルをクリア
  }

  // ---- result-note を削除 ----
  const resultNote = document.getElementById('result-note');
  if (resultNote) resultNote.remove();

  // ---- 生成結果セクションを非表示 ----
  resultSection.style.display = 'none';
  resultImageWrapper.style.display = 'none';
  resultActions.style.display = 'none';
  if (resultImage) resultImage.src = '';

  // ---- 経過時間をクリア ----
  stopTimer();
  const elapsedEl = document.getElementById('elapsed-time');
  if (elapsedEl) elapsedEl.textContent = '';
  elapsedSeconds = 0;

  // ---- 状態をリセット ----
  currentStep = 1;
  answers = {};
  generatedImageUrl = '';
  isGenerating = false;

  // ---- 入力欄を有効化してクリア・フォーカス ----
  setInputDisabled(false);
  chatInput.value = '';
  chatInput.focus();

  // ---- スクロールをトップへ ----
  chatMessages.scrollTop = 0;


}
