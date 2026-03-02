import { Hono } from 'hono'

const app = new Hono()

// Cloudflare Pagesでは public/ 内の静的ファイルは
// 自動的に静的アセットとして配信される。
// Workerは動的なリクエストのみ処理する。
// ルートへのアクセスは index.html を返す
app.get('/', (c) => {
  return c.html(/* html */`<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <meta name="theme-color" content="#2196F3" />
  <title>まちづくりAI</title>
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%232196F3'/%3E%3Ctext x='16' y='23' font-size='20' text-anchor='middle' fill='white'%3E%F0%9F%8F%99%3C/text%3E%3C/svg%3E" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/static/styles.css" />
</head>
<body>

  <!-- ========================================
       1. ヘッダー
  ======================================== -->
  <header class="app-header">
    <h1 class="app-header__title">まちづくりAI</h1>
  </header>

  <!-- ========================================
       2. 元画像表示エリア
  ======================================== -->
  <section class="original-image-section">
    <div class="original-image-section__wrapper">
      <img
        src="https://raw.githubusercontent.com/ishi-hara/LBH-image001/main/001-motogazou-station01.jpg"
        alt="駅周辺の元画像（花壇のエリアに建造物を生成します）"
        class="original-image-section__img"
        loading="eager"
      />
    </div>
    <p class="original-image-section__note">※花壇のエリアに建造物が生成されます</p>
  </section>

  <!-- ========================================
       3. チャットエリア
  ======================================== -->
  <section class="chat-section">
    <div class="chat-section__messages" id="chatMessages" role="log" aria-live="polite" aria-label="チャット履歴">

      <!-- AI初期メッセージ -->
      <div class="chat-message chat-message--ai">
        <div class="chat-message__avatar" aria-hidden="true">🤖</div>
        <div class="chat-message__bubble">
          こんにちは！花壇の代わりにどんな建造物を入れたいですか？（例：お城、神社、遊園地、水族館など）
        </div>
      </div>

    </div>

    <!-- 入力エリア -->
    <div class="chat-section__input-area">
      <input
        type="text"
        id="chatInput"
        class="chat-section__input"
        placeholder="メッセージを入力..."
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
        aria-label="メッセージ入力"
      />
      <button
        type="button"
        id="sendButton"
        class="chat-section__send-btn"
        onclick="sendMessage()"
        aria-label="送信"
      >
        <span class="chat-section__send-icon" aria-hidden="true">&#x27A4;</span>
      </button>
    </div>
  </section>

  <!-- ========================================
       4. 画像生成結果エリア（初期は非表示）
  ======================================== -->
  <section class="result-section" id="resultSection" style="display: none;" aria-label="画像生成結果">

    <!-- ローディングアニメーション -->
    <div class="result-section__loading" id="resultLoading">
      <div class="spinner" aria-hidden="true"></div>
      <p class="result-section__loading-text">画像を生成中です...</p>
    </div>

    <!-- 生成画像 -->
    <div class="result-section__image-wrapper" id="resultImageWrapper" style="display: none;">
      <img
        src=""
        alt="AI生成画像"
        class="result-section__image"
        id="resultImage"
      />
    </div>

    <!-- アクションボタン -->
    <div class="result-section__actions" id="resultActions" style="display: none;">
      <button
        type="button"
        class="btn btn--download"
        id="downloadButton"
        onclick="downloadImage('')"
        aria-label="画像をダウンロード"
      >
        ⬇ 画像をダウンロード
      </button>
      <button
        type="button"
        class="btn btn--reset"
        id="resetButton"
        onclick="resetChat()"
        aria-label="もう一度やり直す"
      >
        ↩ もう一度やり直す
      </button>
    </div>

  </section>

  <script src="/static/app.js"></script>
</body>
</html>`)
})

export default app
