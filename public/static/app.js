/**
 * まちづくりAI - app.js
 * ================================================
 * チャットボットロジック（質問フロー実装済み）
 * ================================================
 */

/* ================================================
   状態管理
================================================ */
let currentStep = 1;  // 現在の質問番号（1〜5）
let answers = {};     // 全回答を保存するオブジェクト
let isComposing = false; // IME変換中フラグ

/* ================================================
   質問定義
   ※ Q1 は初期表示済みのため sendMessage では使わない
     （Q2〜Q5 を currentStep === 2〜5 のときに表示）
================================================ */
const QUESTIONS = {
  2: (a) => `${a.buildingType}ですね！どんな雰囲気がお好みですか？（例：和風、洋風、近未来的、レトロ、ファンタジー風など）`,
  3: (a) => `${a.atmosphere}な${a.buildingType}、素敵ですね！周囲の環境はどんな感じがいいですか？（例：緑豊かな公園風、石畳の広場、桜並木、花壇のある庭園など）`,
  4: ()  => `季節や時間帯の希望はありますか？（例：春の昼間、夏の夕暮れ、冬の朝、秋の夕方、特になしなど）`,
  5: ()  => `最後に、他に追加したい要素や注意点はありますか？（例：人が歩いている様子、噴水がほしい、ベンチを置きたい、特になしなど）`,
};

/* ================================================
   回答の保存先キー（step → answersのキー名）
================================================ */
const ANSWER_KEYS = {
  1: 'buildingType',
  2: 'atmosphere',
  3: 'surroundings',
  4: 'timeOfDay',
  5: 'additionalNotes',
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
  if (currentStep <= 5) {
    // Q2〜Q5 を表示
    showTypingThenMessage(QUESTIONS[currentStep](answers));
  } else {
    // 全5問完了 → 確認メッセージを表示して画像生成へ
    const summary =
      `ありがとうございます！以下の内容で画像を生成しますね。\n` +
      `🏗 建造物: ${answers.buildingType}\n` +
      `🎨 雰囲気: ${answers.atmosphere}\n` +
      `🌳 周囲: ${answers.surroundings}\n` +
      `🕐 季節/時間帯: ${answers.timeOfDay}\n` +
      `✨ 追加要素: ${answers.additionalNotes}\n\n` +
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
   ユーザーの回答から画像生成プロンプト草案を組み立てる
   （次ステップで実装予定）
================================================ */
function buildPrompt(answers) {
  console.log('[buildPrompt] called', { answers });
  return '';
}

/* ================================================
   refinePrompt(draftPrompt)
   LLMでプロンプトを最適化する
   （次ステップで実装予定）
================================================ */
async function refinePrompt(draftPrompt) {
  console.log('[refinePrompt] called', { draftPrompt });
  return draftPrompt;
}

/* ================================================
   generateImage()
   画像生成APIを呼び出す
   （次ステップで実装予定）
================================================ */
async function generateImage() {
  console.log('generateImage called');
}

/* ================================================
   downloadImage(url)
   生成画像をダウンロードする
   （次ステップで実装予定）
================================================ */
function downloadImage(url) {
  console.log('[downloadImage] called', { url });
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

  // 生成結果セクションを非表示
  resultSection.style.display = 'none';
  resultImageWrapper.style.display = 'none';
  resultActions.style.display = 'none';
  if (resultImage) resultImage.src = '';

  // 状態をリセット
  currentStep = 1;
  answers = {};

  // 入力欄を有効化してクリア・フォーカス
  setInputDisabled(false);
  chatInput.value = '';
  chatInput.focus();

  // スクロールをトップへ
  chatMessages.scrollTop = 0;

  console.log('[resetChat] done');
}
