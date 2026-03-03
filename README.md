# まちづくりAI

## プロジェクト概要
- **名称**: まちづくりAI
- **目的**: 駅前の花壇エリアに、AIがユーザーの要望に沿った建造物画像を生成するSPA
- **主な機能**:
  - 5問チャットで建造物・雰囲気・周囲環境・季節/時間帯・追加要素を収集
  - GPT-4.1-mini で日本語→英語プロンプト最適化
  - fal.ai NanoBananaPro (inpainting) で画像生成（ポーリング方式）
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
├── src/index.tsx              # Hono バックエンド（API + HTML 配信）
├── public/
│   ├── manifest.json          # PWA マニフェスト
│   └── static/
│       ├── styles.css         # モバイルファースト CSS（safe-area対応）
│       ├── app.js             # チャットボット・画像生成ロジック
│       ├── icon-192.png       # PWA アイコン 192px
│       └── icon-512.png       # PWA アイコン 512px
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

## チャット質問フロー
| Step | 質問内容 | 回答キー |
|---|---|---|
| Q1 | どんな建造物を入れたいか | `buildingType` |
| Q2 | 雰囲気（和風・洋風・近未来的など） | `atmosphere` |
| Q3 | 周囲の環境（公園風・石畳など） | `surroundings` |
| Q4 | 季節・時間帯 | `timeOfDay` |
| Q5 | 追加要素・注意点 | `additionalNotes` |

## スキップキーワード（部分一致）
`なし` `ない` `なんでも` `特に` `とくに` `任せ`

## データフロー
```
ユーザー入力 (5問)
  → buildPrompt() → 日本語ドラフト
  → refinePrompt() → POST /api/refine-prompt → GPT-4.1-mini → 英語プロンプト
  → POST /api/generate-submit → fal.ai キュー投入 → requestId
  → ポーリング GET /api/generate-status (3秒間隔・最大360秒)
  → GET /api/generate-result → imageUrl
  → displayResult() → タブUI表示・ダウンロード有効化
```

## 使い方
1. ページを開くと AI からの最初の質問が表示される
2. 5つの質問に答える（「特になし」「お任せします」などでスキップ可）
3. 画像生成が開始（通常1〜2分）
4. 生成完了後、タブで「元画像」「生成結果」を切り替えて確認
5. 「画像をダウンロード」で保存、「もう一度やり直す」でリセット

## デプロイ
- **プラットフォーム**: Cloudflare Pages
- **プロジェクト名**: machizukuri-ai
- **ステータス**: ✅ 本番稼働中
- **技術スタック**: Hono + TypeScript + fal.ai NanoBananaPro + OpenAI GPT-4.1-mini
- **最終デプロイ**: 2026-03-03

## 今後の改善候補
- チャット質問の追加・カスタマイズ
- 複数の元画像選択機能
- 生成履歴の保存（Cloudflare KV/D1 活用）
- シェア機能（SNS投稿）
