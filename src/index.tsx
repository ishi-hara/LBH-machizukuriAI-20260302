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

const IMAGE_BASE_URL = 'https://machizukuri-ai.pages.dev/static/images'

const IMAGE_SETS: Record<number, {
  original: string
  mask: string
  sceneDescription: string  // 元画像の場所説明
  maskAreaLabel: string     // 白く塗った範囲の呼び名
  maskAreaDetail: string    // マスク範囲の位置・形状の補足
  edgeTreatmentRule: string // エッジ処理ルール（柵の有無など）
}> = {
  1: {
    original: '001-motogazou-station01.jpg',
    mask: '001-white01.png',
    sceneDescription: '駅前のロータリー',
    maskAreaLabel: '花壇のエリア',
    maskAreaDetail: '花壇のエリアが白く塗りつぶされています',
    edgeTreatmentRule: 'エリアの周囲を柵で囲む指示を含める',
  },
  2: {
    original: '002-motogazou-station01.jpg',
    mask: '002-white01.png',
    sceneDescription: '駅前のロータリー',
    maskAreaLabel: '花壇のエリア',
    maskAreaDetail: '花壇のエリアが白く塗りつぶされています',
    edgeTreatmentRule: 'エリアの周囲を柵で囲む指示を含める',
  },
  3: {
    original: '003-white02.jpg',
    mask: '003-white02.jpg',
    sceneDescription: '阪神タイガースのファーム施設「ゼロカーボンベースボールパーク」に隣接する公園の芝生広場',
    maskAreaLabel: '芝生広場のエリア',
    maskAreaDetail: '変更対象は画像手前に広がる芝生の広場です。背景の球場施設・照明塔・防球ネット・階段・空はそのまま保持してください。英語プロンプトでこのエリアを指す場合は必ず "the open grass lawn in the foreground" と呼ぶこと。mask / masked / white area / white region / white masked という語は一切使わないこと',
    edgeTreatmentRule: '新たに追加する要素の外周が、周囲の芝生・園路・地面と自然に馴染むようにし、不要な柵・フェンス・縁取りは追加しない指示を含める',
  },
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
    `あなたは画像生成AI向けのプロンプトエンジニアです。以下のルールに厳密に従って、入力された日本語の画像編集指示を、画像生成AIに最適化された英語プロンプトに変換してください。\n\n` +
    `背景情報:\n` +
    `- 元画像は${CURRENT_IMAGE_SET.sceneDescription}の写真です\n` +
    `- ${CURRENT_IMAGE_SET.maskAreaDetail}\n` +
    `- 変更対象エリアの外側にある背景の建物・構造物は元画像のまま保持してください（領域の呼び方は上記の指示に従う）\n` +
    `- ただし、追加する施設・建造物や樹木の上部は、変更対象エリアの上端を自然に越えて背景の前に描いてよい。エリア境界で水平に切り落とさないこと\n` +
    `- 変更対象エリアは「絵を描き込むための枠やキャンバス」ではありません。写真の一部を自然な風景に差し替えるための領域です。完成画像に縁・角丸の輪郭・境界線・枠が残ってはいけません\n\n` +
    `ルール:\n` +
    `1. 生成する英語プロンプトの冒頭に必ず "photorealistic, real photograph, DSLR photo," と明記し、末尾にも "photorealistic real photograph, not anime, not illustration, not a painting, not CG, not a poster" と明記する\n` +
    `2. アニメ風・イラスト風・CG・ポスター風を明確に禁止する表現を入れる\n` +
    `3. 元画像と同じカメラ位置・視点の高さ・遠近法・光源の方向・時間帯・色調に厳密に一致させる指示を含める。地面は元画像の地面と連続させ、継ぎ目が見えないようにする\n` +
    `4. 別の絵・イラスト・写真・ポスター・看板・パネルを貼り付けたような表現を禁止する。no picture-in-picture, no collage, no framed image, no visible border, no rounded-corner edge, seamless blend with the surrounding photograph\n` +
    `5. ユーザーが「ファンタジー風」「レトロ」「和風」などのスタイルを指定した場合、それは建築様式・意匠の解釈にのみ適用する。画風は必ず実写写真を維持する\n` +
    `6. ユーザーが商店街・遊歩道・並木道など奥へ細長く伸びる通路状の情景を指定した場合も、元画像のカメラ視点を変更せず、手前に広がる空間として自然に配置する。視点を通路の正面に切り替えてはならない\n` +
    `7. 元画像の既存の建築要素（建物、道路、通路、高架構造物）を保持する指示を含める\n` +
    `8. 指定されたエリアのみを変更し、それ以外の領域は元画像のまま維持する指示にする\n` +
    `9. 新たに追加するすべての要素（施設・建造物・樹木・植栽・門・塀などを含む）が、指定エリアの境界や画像の端で不自然に途中で切れないよう指示する。樹木や建物の上部は指定エリアの境界で切り落とさず、背景の空や施設の手前に自然に重なってよい。追加する樹木・建造物は、指定エリアを上方に越えて背景の建物・壁・ネット・空の手前に自然に重なってよい。背景の構造物を保持するとは「描き替えない」という意味であり、手前に樹木・建造物が重なることを禁じるものではない。樹木は幹から枝葉の先端まで樹形全体を描き、水平線・壁の高さ・エリア上端で切り落とさないこと（trees and structures may extend upward and naturally overlap in front of the background wall, netting and sky; render complete tree crowns with full canopies, do not cut off treetops at any horizontal line, the background remains visible behind them）\n` +
    `10. ${CURRENT_IMAGE_SET.edgeTreatmentRule}\n` +
    `11. 具体的で視覚的に明確な英語表現を使う\n` +
    `12. 日本特有の建造物は英語名に加えて括弧内に日本語名を補足する\n` +
    `13. 1つのパラグラフにまとめ、200語以内にする。語数が超過する場合は優先度の低い装飾的な描写を削って調整する\n` +
    `14. プロンプトのテキストのみを出力し、説明や前置きは一切不要`

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
      detail?: { msg?: string; type?: string }[]
    }

    // fal.ai が invalid_request を返した場合（COMPLETED でも detail エラーになる）
    if (resultData.detail && resultData.detail.length > 0) {
      const msg = resultData.detail[0]?.msg ?? 'fal.ai invalid_request'
      console.error('fal.ai result detail error:', msg)
      return c.json({ success: false, error: '画像の生成に失敗しました。プロンプトや入力画像を変えてお試しください。' }, 502)
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
        alt="元画像（${CURRENT_IMAGE_SET.maskAreaLabel}に建造物を生成します）"
        class="original-image-section__img"
        loading="lazy"
      />
    </div>
    <p class="original-image-section__note">※${CURRENT_IMAGE_SET.maskAreaLabel}に建造物が生成されます</p>
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
          『ゆめまち☆キャンバス』へようこそ！<br>あなたの言葉が、街の未来の景色を創ります。<br>世界に一つだけの素敵な未来、すごく楽しみです。<br>さあ、始めましょう！<br><br>では、いよいよスタートです！<br>この場所に、どんな施設を創りたいですか？<br>（例：公園、遊園地、美術館　など）
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
