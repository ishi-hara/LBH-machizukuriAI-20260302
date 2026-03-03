# まちづくりAI

## プロジェクト概要
- **名称**: まちづくりAI
- **目的**: 駅前の花壇エリアに、AIがユーザーの要望に沿った建造物画像を生成するSPA
- **主な機能**:
  - 5問チャットで建造物・雰囲気・周囲環境・季節/時間帯・追加要素を収集
  - GPT-4.1-mini で日本語→英語プロンプト最適化
  - fal.ai NanaBananaPro (inpainting) で画像生成（ポーリング方式）
  - 元画像 / 生成結果をタブで切り替え表示
  - ダウンロード・やり直し機能

## URL
- **開発サーバー**: http://localhost:3000
- **サンドボックス**: https://3000-i3r50dcbzi8z7sieikxd0-c07dda5e.sandbox.novita.ai

## ファイル構成
```
webapp/
├── src/index.tsx              # Hono バックエンド（API + HTML 配信）
├── public/static/
│   ├── styles.css             # モバイルファースト CSS
│   └── app.js                 # チャットボット・画像生成ロジック
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
| `/api/generate-status?id=` | GET | ジョブステータス取得 (`IN_QUEUE` / `IN_PROGRESS` / `COMPLETED` / `FAILED`) |
| `/api/generate-result?id=` | GET | 生成画像 URL 取得 |

## 環境変数
| 変数名 | 用途 |
|---|---|
| `OPENAI_API_KEY` | GPT-4.1-mini プロンプト最適化 |
| `FAL_KEY` | fal.ai NanaBananaPro 画像生成 |

**ローカル**: `.dev.vars` に記載（コミット対象外）  
**本番**: `npx wrangler pages secret put OPENAI_API_KEY` で設定

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
- **ステータス**: 🚧 ローカル開発中
- **技術スタック**: Hono + TypeScript + TailwindCSS (CDN) + fal.ai + OpenAI
- **最終更新**: 2026-03-03
