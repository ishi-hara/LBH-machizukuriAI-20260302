# まちづくりAI

## プロジェクト概要
- **名称**: まちづくりAI
- **目的**: 対象エリアの現況写真に対し、ユーザーの要望に沿った建造物・広場の画像をAIが生成するSPA。現地に施設が入るとどう見えるかを可視化する
- **主な機能**:
  - 6問チャットで施設・利用シーン・スタイル・周囲環境・季節/時間帯・追加要素を収集
  - GPT-4.1-mini で日本語→英語プロンプト最適化
  - fal.ai NanoBananaPro (nano-banana-pro/edit) で画像生成（ポーリング方式）
  - Canvas による元画像との合成（上部の背景を元画像で保持）
  - 元画像 / 生成結果をタブで切り替え表示
  - ダウンロード・やり直し機能
  - PWA対応（ホーム画面に追加可能）
  - スマートフォン最適化（safe-area・min-height 44px）

## URL
- **本番**: https://machizukuri-ai.pages.dev/
- **サンドボックス**: http://localhost:3000

## ファイル構成
```
webapp/
├── src/index.tsx              # Hono バックエンド（API + HTML 配信 + IMAGE_SETS 定義）
├── public/
│   ├── manifest.json          # PWA マニフェスト
│   └── static/
│       ├── styles.css         # モバイルファースト CSS（safe-area対応）
│       ├── app.js             # チャットボット・画像生成・Canvas合成ロジック
│       ├── icon-192.png       # PWA アイコン 192px
│       ├── icon-512.png       # PWA アイコン 512px
│       └── images/            # 画像セットの元画像・マスク画像
├── .dev.vars                  # ローカル環境変数（.gitignore 済み）
├── ecosystem.config.cjs       # PM2 起動設定
├── wrangler.jsonc             # Cloudflare Pages 設定
└── package.json
```

## API エンドポイント
| エンドポイント | メソッド | 説明 |
|---|---|---|
| `/api/refine-prompt` | POST | 日本語プロンプト → 英語最適化 (GPT-4.1-mini) |
| `/api/generate-submit` | POST | fal.ai にジョブ投入、requestId 返却 |
| `/api/generate-status?id=` | GET | ジョブステータス取得 |
| `/api/generate-result?id=` | GET | 生成画像 URL 取得 |
| `/manifest.json` | GET | PWA マニフェスト |

## 環境変数
| 変数名 | 用途 |
|---|---|
| `OPENAI_API_KEY` | GPT-4.1-mini プロンプト最適化 |
| `FAL_KEY` | fal.ai NanoBananaPro 画像生成 |

**ローカル**: `.dev.vars` に記載（コミット対象外）  
**本番**: Cloudflare Pages シークレットとして登録済み

## チャット質問フロー（6問）
| Step | 質問内容 | 回答キー |
|---|---|---|
| Q1 | 創りたい施設（初期表示済み） | `facilityType` |
| Q2 | 誰が・どんな気持ちで・何をして過ごす施設か | `usageScene` |
| Q3 | スタイル・規模・階数・造り | `style` |
| Q4 | 周囲の環境・追加したい設備・装飾 | `surroundings` |
| Q5 | 季節・時間帯 | `timeOfDay` |
| Q6 | 追加したい要素・こだわり | `additionalNotes` |

Q1 は初期メッセージとして表示済みのため、`sendMessage()` の質問定義（`QUESTIONS`）には Q2〜Q6 のみを持つ。

## スキップキーワード（部分一致）
`なし` `ない` `なんでも` `特に` `とくに` `任せ`

Q2〜Q6 の回答がこれらを含む場合、その行は日本語ドラフトから省略される。

## 画像セットの切り替え
元画像・マスク画像・プロンプト文言・合成パラメータはセット単位で管理され、`src/index.tsx` 冒頭の `IMAGE_SET_ID` を変更するだけで切り替わる。

```typescript
// 1 / 2 / 3 / 4 のいずれかを設定する
const IMAGE_SET_ID = 4
```

| ID | 対象地 | 元画像ファイル | fal.ai に渡す画像 | maskMode |
|---|---|---|---|---|
| 1 | 駅前ロータリー | 001-motogazou-station01.jpg | 001-white01.png | `white` |
| 2 | 駅前ロータリー | 002-motogazou-station01.jpg | 002-white01.png | `white` |
| 3 | 尼崎・ゼロカーボンベースボールパーク隣接公園 | 003-motogazou-amagasaki.jpg | 003-motogazou-amagasaki.jpg | `none` |
| 4 | キセラ川西せせらぎ公園 | 004-motogazou-kisera-1700x956.jpg | 004-motogazou-kisera-1700x956.jpg | `none` |

- 存在しない値を設定した場合はセット1にフォールバックする
- 変更後は `npm run build` でリビルドし、デプロイすること
- `public/static/images/` には未使用の `003-white01.jpg` / `003-white02.jpg` / `004-white01.jpg` 等が残っているが、現行コードからは参照していない

### IMAGE_SETS の各フィールド

| フィールド | 型 | 役割 |
|---|---|---|
| `original` | string | 画面に表示する元画像のファイル名。Canvas合成の元データにも使う |
| `mask` | string | fal.ai に渡す画像のファイル名。`maskMode: 'none'` のセットでは `original` と同一 |
| `sceneDescription` | string | 元画像の場所説明。systemPrompt の背景情報に展開される |
| `maskAreaLabel` | string | 生成対象範囲の呼び名。alt・注記・`buildPrompt()` の冒頭に展開される |
| `maskAreaDetail` | string | 生成対象範囲の位置・形状、保持すべき背景要素、禁止事項。systemPrompt に展開される |
| `edgeTreatmentRule` | string | エッジ処理ルール。柵の有無など。systemPrompt ルール6に展開される |
| `maskMode` | `'none' \| 'white'` | 白塗り画像を送るか、元画像をそのまま送るか |
| `aspectRatio` | string | fal.ai に渡す縦横比。セット1〜3は `'4:3'`、セット4は `'16:9'` |
| `compositeCutRatio` | number | Canvas合成の区切り位置（生成画像高さ比）。セット1〜3は `0.30`、セット4は `0.35` |
| `compositeFeatherRatio` | number（任意） | 境界ぼかし幅を生成画像高さ比で指定。未指定なら絶対値 60px を使用。セット4は `0.05` |

### maskMode による挙動の違い

**`'white'`（セット1・2）**  
白く塗りつぶしたマスク画像を fal.ai に送り、白い範囲を生成対象として扱う。`buildPrompt()` の冒頭は「マスクした白のエリアを〜」となり、systemPrompt にも「白い範囲が変更対象です」という説明が入る。

**`'none'`（セット3・4）**  
加工していない元画像をそのまま送る。`fal-ai/nano-banana-pro/edit` は `mask_url` を受け付けず画像全体を描き直すため、白塗りは「白い物体」として解釈されるおそれがある。そのため領域指定は白塗りではなく次の2層で行う。

1. **プロンプトによる領域指定** — `maskAreaDetail` に保持すべき背景要素を列挙し、生成対象を自然言語で指定する。`white` / `mask` といった語の使用を明示的に禁止する
2. **Canvas合成による背景保持** — 生成結果の上部を元画像で上書きし、空・山稜線・建物上層を確実に保持する

`buildPrompt()` の冒頭は `maskAreaLabel`（セット4なら「広場のエリア」）に切り替わり、「マスク」「白」という語は draftPrompt に一切含まれない。

## Canvas 合成の仕組み

`app.js` の `compositeWithOriginal()` が、生成画像の上部を元画像で置き換える。

```
cutY      = 生成画像の高さ × compositeCutRatio
feather   = compositeFeatherRatio があれば 高さ × 比率（最小12px）、なければ 60px
fadeStart = cutY - feather / 2
fadeEnd   = cutY + feather / 2

y <= fadeStart            → 元画像 100%
fadeStart < y < fadeEnd   → 線形αブレンド
y >= fadeEnd              → 生成画像 100%
```

セット4（生成画像 1376×768）の実測値は cutY=269 / feather=38 / fadeStart=250 / fadeEnd=288。屋上サイン（y≈80〜100）と山稜線（y≈200）はいずれも fadeStart より上にあり、元画像100%の領域で保持される。

`compositeCutRatio` を大きくすると背景の保持範囲が広がる一方、生成物の上端が水平に切り落とされやすくなる。高い構造物が切れる場合は値を下げる。

### セットごとのパラメータ受け渡し

`src/index.tsx` が HTML に以下のインラインスクリプトを出力し、`app.js` 読み込みの**前**にセット情報を渡す。

```html
<script>
  window.__IMAGE_SET__ = {
    originalUrl: '/static/images/004-motogazou-kisera-1700x956.jpg',
    compositeCutRatio: 0.35,
    compositeFeatherRatio: 0.05,
    maskMode: 'none',
    maskAreaLabel: '広場のエリア'
  };
</script>
<script src="/static/app.js"></script>
```

`app.js` はトップレベルで `COMPOSITE_CUT_RATIO` を評価するため、この順序が逆になると設定が読まれずフォールバック値（0.30）が使われる。インラインスクリプトの構文エラーでも同じ事故が起きるため、変更時はブラウザのコンソールでエラーがないことを確認すること。

### 合成のスキップ

夜景・夕景・花火・ドローンショー・大屋根など、画像上部が元画像と大きく変わる指定があった場合は `shouldSkipComposite()` が働き、合成せず生成画像をそのまま表示する。判定語は `NIGHTTIME_KEYWORDS` と `SKIP_KEYWORDS_EXTRA` に定義。`SKIP_EXTRA_ENABLED = false` にすると拡張リストが無効化され、「雨」「曇り」を含む旧挙動に戻る。

デバッグ用に `COMPOSITE_ENABLED = false` とすると、合成前の生の生成結果を確認できる。

## データフロー
```
ユーザー入力 (6問)
  → buildPrompt() → 日本語ドラフト（maskMode で冒頭表現を切り替え）
  → shouldSkipComposite() 判定
  → refinePrompt() → POST /api/refine-prompt → GPT-4.1-mini → 英語プロンプト
  → POST /api/generate-submit → fal.ai キュー投入（aspect_ratio はセット値） → requestId
  → ポーリング GET /api/generate-status (3秒間隔・最大360秒)
  → GET /api/generate-result → imageUrl
  → compositeWithOriginal() → Canvas合成 → blob URL
  → displayResult() → タブUI表示・ダウンロード有効化
```

## 使い方
1. ページを開くと AI からの最初の質問が表示される
2. 6つの質問に答える（「特になし」「お任せします」などでスキップ可）
3. 画像生成が開始（通常1〜2分）
4. 生成完了後、タブで「元画像」「生成結果」を切り替えて確認
5. 「画像をダウンロード」で保存、「もう一度やり直す」でリセット

## 新しい画像セットを追加する手順
1. 元画像を `public/static/images/` に配置する。`aspectRatio` に指定する比率と実寸を合わせておくと合成時のずれがない（例：16:9 なら 1700×956）
2. `IMAGE_SETS` に新しいIDのエントリを追加する。`maskMode: 'none'` の場合は `original` と `mask` に同じファイル名を設定する
3. `maskAreaDetail` に、生成対象範囲・保持すべき背景要素・禁止事項を日本語と英語の両方で記述する
4. `compositeCutRatio` は、保持したい背景の下端と生成物の上端の間に来るよう設定する。まず低層の施設で生成し、切り落としが起きたら値を下げる
5. `IMAGE_SET_ID` を新しいIDに変更し、`npm run build` してデプロイする

## 既知の課題
- `app.js` の `buildPrompt()` に「建物、道路、通路、高架構造物、その他すべての建築要素は元の画像のまま保持する」という固定文があり、セット4の「新設する構造物は病院建物の手前に重なってよい」という指示と論理的に競合する。現状は GPT-4.1-mini が解決しているが、生成物が不自然に小さくなる・奥に配置される事象が出た場合はここが原因候補
- `public/static/images/` に未使用の白塗り画像が残っている

## デプロイ
- **プラットフォーム**: Cloudflare Pages
- **プロジェクト名**: machizukuri-ai
- **ステータス**: ✅ 本番稼働中
- **技術スタック**: Hono + TypeScript + fal.ai NanoBananaPro + OpenAI GPT-4.1-mini
- **最終デプロイ**: 2026-09-24（セット4「キセラ川西せせらぎ公園」対応）

## 今後の改善候補
- 複数の元画像をユーザーが選択できる機能
- 生成履歴の保存（Cloudflare KV/D1 活用）
- シェア機能（SNS投稿）
- 画面上からの画像セット切り替え（現在はコード変更＋再デプロイが必要）
