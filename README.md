# まちづくりAI

## プロジェクト概要

スマホブラウザで動作する、画像インペインティング（マスク部分の置換）Webアプリ。  
駅周辺の写真の白くマスクされた部分に、ユーザーが指定した建造物をAI画像生成で合成します。

---

## 現在完了している機能（ステップ1: UI骨格）

- [x] ヘッダー（アプリ名「まちづくりAI」、青背景50px）
- [x] 元画像表示エリア（指定URL画像＋注記テキスト）
- [x] チャットエリア（LINEライクUI、AI初期メッセージ表示、Enterキー送信対応）
- [x] 画像生成結果エリア（初期非表示、CSSスピナー、ダウンロード・やり直しボタン）
- [x] モバイルファーストCSS（375px〜430px基準）
- [x] Noto Sans JP フォント適用

---

## 機能エントリポイント（URI一覧）

| パス | 内容 |
|---|---|
| `GET /` | メインページ（HTML） |
| `GET /static/styles.css` | スタイルシート |
| `GET /static/app.js` | フロントエンドJavaScript |

---

## ファイル構成

```
webapp/
├── src/
│   └── index.tsx          # Honoバックエンド（HTML配信）
├── public/
│   ├── index.html         # 静的HTMLテンプレート（参照用）
│   └── static/
│       ├── styles.css     # モバイルファーストCSS
│       └── app.js         # フロントエンドJS（空関数スタブ）
├── dist/                  # ビルド成果物（自動生成）
├── ecosystem.config.cjs   # PM2設定
├── wrangler.jsonc          # Cloudflare設定
├── vite.config.ts         # Viteビルド設定
└── package.json
```

---

## app.js 空関数スタブ一覧

| 関数名 | 役割 | 実装状況 |
|---|---|---|
| `sendMessage()` | メッセージ送信処理 | スタブのみ |
| `addMessage(text, isUser)` | チャットにメッセージ追加 | スタブのみ |
| `buildPrompt(answers)` | プロンプト組み立て | スタブのみ |
| `refinePrompt(draftPrompt)` | LLMでプロンプト最適化 | スタブのみ |
| `generateImage()` | 画像生成 | スタブのみ |
| `downloadImage(url)` | 画像ダウンロード | スタブのみ |
| `resetChat()` | チャットリセット | スタブのみ |

---

## デプロイ情報

- **プラットフォーム**: Cloudflare Pages
- **ステータス**: ローカル開発中
- **技術スタック**: Hono + TypeScript + Vanilla JS + Tailwind CSS (CDN予定)
- **最終更新**: 2026-03-02

---

## 未実装（次のステップ）

- [ ] `sendMessage()` の実装（質問フロー制御）
- [ ] `addMessage()` の実装（バブルDOM生成）
- [ ] `buildPrompt()` / `refinePrompt()` の実装（LLM連携）
- [ ] `generateImage()` の実装（OpenAI Images Edit API連携）
- [ ] `downloadImage()` の実装
- [ ] `resetChat()` の実装
- [ ] Cloudflare Pagesへの本番デプロイ

---

## ローカル開発

```bash
# 依存関係インストール
npm install

# ビルド
npm run build

# PM2で起動（ポート3000）
pm2 start ecosystem.config.cjs

# ログ確認
pm2 logs webapp --nostream
```
