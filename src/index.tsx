import { Hono } from 'hono'

// Cloudflare Workers の環境変数型定義
type Bindings = {
  OPENAI_API_KEY: string
  FAL_KEY: string
}

// fal.ai のエンドポイント定数
const FAL_SUBMIT_URL  = 'https://queue.fal.run/fal-ai/nano-banana-pro/edit'
const FAL_QUEUE_BASE  = 'https://queue.fal.run/fal-ai/nano-banana-pro/requests'

// ===== 画像セット切替用グローバル変数 =====
// 1 / 2 / 3 のいずれかを設定する（今回は 3 にする）
const IMAGE_SET_ID = 3

const IMAGE_BASE_URL = 'https://raw.githubusercontent.com/ishi-hara/LBH-image001/main'

const IMAGE_SETS: Record<number, { original: string; mask: string }> = {
  1: { original: '001-motogazou-station01.jpg', mask: '001-white01.png' },
  2: { original: '002-motogazou-station01.jpg', mask: '002-white01.png' },
  3: { original: '003-motogazou-amagasaki.jpg', mask: '003-white01.png' },
}

const CURRENT_IMAGE_SET  = IMAGE_SETS[IMAGE_SET_ID] ?? IMAGE_SETS[1]
const ORIGINAL_IMAGE_URL = `${IMAGE_BASE_URL}/${CURRENT_IMAGE_SET.original}`
const MASK_IMAGE_URL     = `${IMAGE_BASE_URL}/${CURRENT_IMAGE_SET.mask}`

const app = new Hono<{ Bindings: Bindings }>()

/* ================================================
   POST /api/refine-prompt
   日本語プロンプト草案を GPT-4.1-mini で英語プロンプトに最適化する
================================================ */
app.post('/api/refine-prompt', async (c) => {
  const apiKey = c.env.OPENAI_API_KEY
  if (!apiKey) {
    return c.json({ success: false, error: 'OPENAI_API_KEY is not configured' }, 500)
  }

  let draftPrompt: string
  try {
    const body = await c.req.json()
    draftPrompt = body.draftPrompt
    if (!draftPrompt || typeof draftPrompt !== 'string') {
      return c.json({ success: false, error: 'draftPrompt is required' }, 400)
    }
  } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400)
  }

  const systemPrompt =
    'あなたは画像生成AI向けのプロンプトエンジニアです。以下のルールに厳密に従って、入力された日本語の画像編集指示を、画像生成AIに最適化された英語プロンプトに変換してください。\n\n' +
    '背景情報:\n' +
    '- 元画像は駅前のロータリーの写真です\n' +
    '- マスク画像で花壇のエリアが白く塗りつぶされています\n' +
    '- 元画像とマスク画像の2枚をAPIに渡して、白い部分だけを変更します\n\n' +
    'ルール:\n' +
    '1. フォトリアリスティック（実写写真風）であることを必ず明記する\n' +
    '2. アニメ風・イラスト風を明確に禁止する表現を入れる\n' +
    '3. 元画像の既存の建築要素（建物、道路、通路、高架構造物）を保持する指示を含める\n' +
    '4. マスクされた白いエリアのみを変更する指示にする\n' +
    '5. 指定された建造物が画像の端で途中で切れないよう指示する\n' +
    '6. エリアの周囲を柵で囲む指示を含める\n' +
    '7. 具体的で視覚的に明確な英語表現を使う\n' +
    '8. 日本特有の建造物は英語名に加えて括弧内に日本語名を補足する\n' +
    '9. 1つのパラグラフにまとめ、200語以内にする\n' +
    '10. プロンプトのテキストのみを出力し、説明や前置きは一切不要'

  try {
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        temperature: 0.3,
        max_tokens: 800,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: draftPrompt  },
        ],
      }),
    })

    if (!openaiRes.ok) {
      const errText = await openaiRes.text()
      console.error('OpenAI API error:', openaiRes.status, errText)
      return c.json({ success: false, error: `OpenAI API error: ${openaiRes.status}` }, 502)
    }

    const openaiData = await openaiRes.json() as {
      choices: { message: { content: string } }[]
    }
    const refinedPrompt = openaiData.choices?.[0]?.message?.content?.trim()

    if (!refinedPrompt) {
      return c.json({ success: false, error: 'Empty response from OpenAI' }, 502)
    }

    return c.json({ success: true, refinedPrompt })

  } catch (err) {
    console.error('refine-prompt handler error:', err)
    return c.json({ success: false, error: 'Internal server error' }, 500)
  }
})

/* ================================================
   POST /api/generate-submit
   fal.ai にジョブを投入し requestId を返す
================================================ */
app.post('/api/generate-submit', async (c) => {
  const falKey = c.env.FAL_KEY
  if (!falKey) {
    return c.json({ success: false, error: 'FAL_KEY is not configured' }, 500)
  }

  let prompt: string
  try {
    const body = await c.req.json()
    prompt = body.prompt
    if (!prompt || typeof prompt !== 'string') {
      return c.json({ success: false, error: '必要なパラメータが不足しています' }, 400)
    }
  } catch {
    return c.json({ success: false, error: '必要なパラメータが不足しています' }, 400)
  }

  try {
    const falRes = await fetch(FAL_SUBMIT_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${falKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        image_urls: [MASK_IMAGE_URL],
        num_images: 1,
        aspect_ratio: 'auto',
        output_format: 'png',
        resolution: '1K',
        limit_generations: true,
      }),
    })

    if (!falRes.ok) {
      const errText = await falRes.text()
      console.error('fal.ai submit error:', falRes.status, errText)
      return c.json({ success: false, error: 'fal.aiとの通信に失敗しました' }, 502)
    }

    const falData = await falRes.json() as { request_id?: string }
    const requestId = falData.request_id

    if (!requestId) {
      console.error('fal.ai submit: no request_id in response', falData)
      return c.json({ success: false, error: 'fal.aiとの通信に失敗しました' }, 502)
    }

    return c.json({ success: true, requestId })

  } catch (err) {
    console.error('generate-submit handler error:', err)
    return c.json({ success: false, error: 'fal.aiとの通信に失敗しました' }, 502)
  }
})

/* ================================================
   GET /api/generate-status?id={request_id}
   fal.ai のジョブステータスを1回確認して返す
================================================ */
app.get('/api/generate-status', async (c) => {
  const falKey = c.env.FAL_KEY
  if (!falKey) {
    return c.json({ success: false, error: 'FAL_KEY is not configured' }, 500)
  }

  const id = c.req.query('id')
  if (!id) {
    return c.json({ success: false, error: '必要なパラメータが不足しています' }, 400)
  }

  try {
    const statusRes = await fetch(
      `${FAL_QUEUE_BASE}/${id}/status`,
      {
        headers: { 'Authorization': `Key ${falKey}` },
      }
    )

    if (!statusRes.ok) {
      const errText = await statusRes.text()
      console.error('fal.ai status error:', statusRes.status, errText)
      return c.json({ success: false, error: 'fal.aiとの通信に失敗しました' }, 502)
    }

    const statusData = await statusRes.json() as { status?: string }
    const status = statusData.status ?? 'UNKNOWN'

    return c.json({ status })

  } catch (err) {
    console.error('generate-status handler error:', err)
    return c.json({ success: false, error: 'fal.aiとの通信に失敗しました' }, 502)
  }
})

/* ================================================
   GET /api/generate-result?id={request_id}
   fal.ai の生成結果（画像URL）を取得して返す
================================================ */
app.get('/api/generate-result', async (c) => {
  const falKey = c.env.FAL_KEY
  if (!falKey) {
    return c.json({ success: false, error: 'FAL_KEY is not configured' }, 500)
  }

  const id = c.req.query('id')
  if (!id) {
    return c.json({ success: false, error: '必要なパラメータが不足しています' }, 400)
  }

  try {
    const resultRes = await fetch(
      `${FAL_QUEUE_BASE}/${id}`,
      {
        headers: { 'Authorization': `Key ${falKey}` },
      }
    )

    if (!resultRes.ok) {
      const errText = await resultRes.text()
      console.error('fal.ai result error:', resultRes.status, errText)
      return c.json({ success: false, error: 'fal.aiとの通信に失敗しました' }, 502)
    }

    const resultData = await resultRes.json() as {
      images?: { url: string }[]
    }
    const imageUrl = resultData.images?.[0]?.url

    if (!imageUrl) {
      console.error('fal.ai result: no image url in response', resultData)
      return c.json({ success: false, error: '生成画像の取得に失敗しました' }, 502)
    }

    return c.json({ success: true, imageUrl })

  } catch (err) {
    console.error('generate-result handler error:', err)
    return c.json({ success: false, error: 'fal.aiとの通信に失敗しました' }, 502)
  }
})

// Cloudflare Pagesでは public/ 内の静的ファイルは
// 自動的に静的アセットとして配信される。
// Workerは動的なリクエストのみ処理する。
// manifest.json を明示的に返す（ローカル開発用フォールバック）
app.get('/manifest.json', (c) => {
  return c.json({
    name: 'まちづくりAI',
    short_name: 'まちづくりAI',
    description: 'AIで街の風景に建造物を生成するアプリ',
    start_url: '/',
    display: 'standalone',
    background_color: '#F5F5F5',
    theme_color: '#2196F3',
    icons: [
      { src: '/static/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/static/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  })
})

// ルートへのアクセスは index.html を返す
app.get('/', (c) => {
  return c.html(/* html */`<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes" />
  <meta name="theme-color" content="#2196F3" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="default" />
  <title>まちづくりAI</title>
  <link rel="manifest" href="/manifest.json" />
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
        src="${ORIGINAL_IMAGE_URL}"
        alt="駅周辺の元画像（花壇のエリアに建造物を生成します）"
        class="original-image-section__img"
        loading="lazy"
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
