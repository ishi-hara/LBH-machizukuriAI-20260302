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
- **プレビュー**: 本番以外のブランチ名でデプロイすると `https://<ブランチ名>.machizukuri-ai.pages.dev` で確認できる（例: `set6-test`）。本番には影響しない
- **画像セットの指定**: `?set=N`（N=1〜6）。パラメータなしの既定はセット4（`config/image-set.json`）。例: `https://machizukuri-ai.pages.dev/?set=6`

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
├── config/image-set.json      # 既定の画像セットID（IMAGE_SET_ID。現在は 4）
├── .dev.vars                  # ローカル環境変数（.gitignore 済み）
├── ecosystem.config.cjs       # PM2 起動設定
├── wrangler.jsonc             # Cloudflare Pages 設定
└── package.json
```

## API エンドポイント
| エンドポイント | メソッド | 説明 |
|---|---|---|
| `/api/refine-prompt` | POST | 日本語プロンプト → 英語最適化 (GPT-4.1-mini) |
| `/api/generate-concept` | POST | コンセプトのタイトル・文章を生成 (GPT-4.1-mini)。`conceptEnabled` のセット（セット6）のみ。他のセットは 403 |
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
元画像・マスク画像・プロンプト文言・合成パラメータはセット単位で管理される。既定のセットは `config/image-set.json` の `IMAGE_SET_ID` で決まり、URLクエリ `?set=N`（N=1〜6）で URL ごとに切り替えることもできる。

```typescript
// config/image-set.json（1〜6 のいずれかを設定。変更後は npm run build）
{ "IMAGE_SET_ID": 4 }
```

| ID | 対象地 | 元画像ファイル | fal.ai に渡す画像 | maskMode |
|---|---|---|---|---|
| 1 | 駅前ロータリー | 001-motogazou-station01.jpg | 001-white01.png | `white` |
| 2 | 駅前ロータリー | 002-motogazou-station01.jpg | 002-white01.png | `white` |
| 3 | 尼崎・ゼロカーボンベースボールパーク隣接公園 | 003-motogazou-amagasaki.jpg | 003-motogazou-amagasaki.jpg | `none` |
| 4 | キセラ川西せせらぎ公園 | 004-motogazou-kisera-1700x956.jpg | 004-motogazou-kisera-1700x956.jpg | `none` |
| 5 | 川西能勢口駅南口（ペデストリアンデッキ） | 005-motogazou-noseguchiminamiguchi.jpg | 005-mask-noseguchiminamiguchi-2.png | `white`（`compositeEnabled: false`） |
| 6 | 池田市・ショッピングシティ サカエマチ2番街（アーケード入口） | 006-motogazou-ikedasakaemachi2.jpg（775×620、5:4） | 006-motogazou-ikedasakaemachi2.jpg | `none` |

- `config/image-set.json` の `IMAGE_SET_ID` が 1〜6 以外の場合はセット1にフォールバックする
- URLクエリ `?set=` が 1〜6 以外（未指定・`abc`・`7` など）の場合は、`config/image-set.json` の `IMAGE_SET_ID`（現在は 4）になる。本番でも `?set=6` でセット6が開くが、パラメータなしの既定はセット4のまま
- `app.js` が API に送る `setId` は `window.__IMAGE_SET__.setId` で、未取得時のフォールバックは 4
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
| `aspectRatio` | string | fal.ai に渡す縦横比。セット1〜3は `'4:3'`、セット4・5は `'16:9'`、セット6は `'5:4'` |
| `compositeCutRatio` | number | Canvas合成の区切り位置（生成画像高さ比）。セット1〜3・5は `0.30`、セット4は `0.35`、セット6は `0.46` |
| `compositeFeatherRatio` | number（任意） | 境界ぼかし幅を生成画像高さ比で指定。未指定なら絶対値 60px を使用。セット4は `0.05`、セット6は `0.04` |
| `compositeIgnoreSkip` | string[]（任意） | `shouldSkipComposite` の判定語のうち、そのセットでスキップ判定から除外する語。セット6は アーケード・ドーム・大屋根・天蓋・屋根で覆・屋根が覆・ガラスの屋根・提灯・ちょうちん。未指定は除外なし |
| `compositeTimeOfDaySkip` | string[]（任意） | 「季節・時間帯:」の行に限ってスキップ判定に加える語。セット6は 朝・早朝・朝方・雨・曇り・雪。他の行（例:「朝市」「雨宿り」）では判定しない |
| `systemPromptRuleOverrides` | object（任意） | systemPrompt のルール 1 / 2 / 3 / 4 / 8 / 9 / 10 / 12 / 13 / 14 のセット別本文。未指定のルールは全セット共通の文言。セット6のみ指定。主な内容: 空・光を時間帯に合わせて変える（ルール10）、定型句はサーバーが付けるので LLM に書かせない（ルール1・2・4）、様式の形容詞と屋外の場所名を書かせない（ルール12）、LLM が書く中間部分は66語以内で時間帯・空・光を先に置く（ルール14）。英語の見本文は置かず、日本語の指示で書く（詳細は「セット6の仕様」） |
| `timeOfDayNote` | string（任意） | `buildPrompt()` が「季節・時間帯:」行の直後に追加する1行。セット6のみ。日本語ドラフトに入るため、判定語（夜・夕方・雨・星 等）を含めないこと |
| `conceptEnabled` / `conceptPlace` | boolean / string（任意） | `conceptEnabled: true` のセットだけ、コンセプト（タイトル・文章）を生成して生成画像の下に表示する。未指定は false 扱い。`conceptPlace` は文章で場所に触れるときの表記（セット6は `池田のサカエマチ2番街`）。セット6のみ指定 |
| `promptPrefix` / `promptSuffix` | string（任意） | `/api/refine-prompt` が返す英語プロンプトの先頭・末尾に、サーバー側で連結する固定文。セット6のみ（prefix 約115語・suffix 約90語）。内容は構造ロック（同一カメラ・看板の大きさと位置・透明な屋根と支柱の保持）、看板の面に何も重ねない、店舗に文字を描かない、写実の指定。LLM には中間部分だけを書かせる。未指定のセット1〜5は連結せず従来どおり |

### maskMode による挙動の違い

**`'white'`（セット1・2・5）**  
白く塗りつぶしたマスク画像を fal.ai に送り、白い範囲を生成対象として扱う。`buildPrompt()` の冒頭は「マスクした白のエリアを〜」となり、systemPrompt にも「白い範囲が変更対象です」という説明が入る。

**`'none'`（セット3・4・6）**  
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
    setId: 4,
    originalUrl: '/static/images/004-motogazou-kisera-1700x956.jpg',
    compositeCutRatio: 0.35,
    compositeFeatherRatio: 0.05,
    maskMode: 'none',
    maskAreaLabel: '広場のエリア',
    compositeEnabled: true
  };
</script>
<script src="/static/app.js"></script>
```

セット6では、上記に加えて任意項目 `compositeIgnoreSkip` / `compositeTimeOfDaySkip` / `timeOfDayNote` / `conceptEnabled: true` が出力される（定義があるセットのみ。セット1〜5には出力されない）。`setId` は `?set=` の解決結果で、`app.js` が `/api/refine-prompt` と `/api/generate-submit` に送る。

画像URLの基点は、アクセス元が `machizukuri-ai.pages.dev` またはそのサブドメイン（プレビュー）で https の場合はそのオリジン、それ以外は本番URLになる（`resolveImageBaseUrl`）。プレビューでは、そのプレビュー自身の画像を fal.ai に渡す。

`app.js` はトップレベルで `COMPOSITE_CUT_RATIO` を評価するため、この順序が逆になると設定が読まれずフォールバック値（0.30）が使われる。インラインスクリプトの構文エラーでも同じ事故が起きるため、変更時はブラウザのコンソールでエラーがないことを確認すること。

### 合成のスキップ

夜景・夕景・花火・ドローンショー・大屋根など、画像上部が元画像と大きく変わる指定があった場合は `shouldSkipComposite()` が働き、合成せず生成画像をそのまま表示する。判定語は `NIGHTTIME_KEYWORDS` と `SKIP_KEYWORDS_EXTRA` に定義。`SKIP_EXTRA_ENABLED = false` にすると拡張リストが無効化され、「雨」「曇り」を含む旧挙動に戻る。

**セット別の調整（セット6のみ。引数を省略するセット1〜5は従来と完全に同じ挙動）**

`shouldSkipComposite(text, ignoreWords, timeOfDayOnlyWords)` は、セット設定から次の2つを受け取る。

- `compositeIgnoreSkip`: スキップ判定の語から除外する語。セット6は、アーケード入口そのものが元画像にあるため「アーケード」「ドーム」「大屋根」「天蓋」「屋根で覆」「屋根が覆」「ガラスの屋根」「提灯」「ちょうちん」を除外する
- `compositeTimeOfDaySkip`: 「季節・時間帯:」で始まる行に限って判定に加える語。セット6は「朝」「早朝」「朝方」「雨」「曇り」「雪」。他の行（例:「朝市」「雨宿り」）にこれらの語があってもスキップしない。`timeOfDayNote` の行は「季節・時間帯:」で始めないため、この判定の対象外

デバッグ用に `COMPOSITE_ENABLED = false` とすると、合成前の生の生成結果を確認できる。

## セット6（サカエマチ2番街）の仕様

池田市「ショッピングシティ サカエマチ2番街」のアーケード入口（シャッターが閉まった商店街）を、ユーザーの回答に沿った新しい商店街のイメージに変えるセット。看板の下の通路・店先・床だけを作り替え、看板・照明・屋根・支柱・カメラは元画像のまま保つ。

### 方式
- `maskMode: 'none'`（元画像をそのまま fal.ai に渡す）、`aspectRatio: '5:4'`、`compositeCutRatio: 0.46`、`compositeFeatherRatio: 0.04`
- 夜・夕方・朝・雨・曇り・雪など、空や光が大きく変わる指定ではCanvas合成をスキップし、生成画像をそのまま表示する（「合成のスキップ」参照）
- `maskAreaLabel`（日本語ドラフトに入る）には、スキップ判定語を含めない

### 英語プロンプトの組み立て
`/api/refine-prompt` は、次の3つをサーバー側で連結して返す。

```
promptPrefix（約115語・固定）+ LLMが書く中間部分（66語以内）+ promptSuffix（約90語・固定）
```

| 部分 | 内容 |
|---|---|
| promptPrefix | 写実の指定、元画像と同一のカメラ位置・視点の高さ・画角、緑の看板（横幅の約9割・下端が画像高さの約4割）と2つの照明の保持、透明なアーチ屋根・骨組み・緑の支柱の保持 |
| 中間部分（LLM） | 時間帯・空・光 → 施設・スタイル・床の素材・人物 → 回答に空の演出があれば、その演出。固定文と重複する内容は書かせない |
| promptSuffix | 地上に足す要素は屋根の下かつ看板の下端より下に収める、**看板の面と文字には何も重ねない（光の筋・にじみ・火花・飾りを含む）**、店舗の庇・壁・窓は無地で、看板の日本語だけが文字、コラージュ・境界線なし、写実（アニメ・イラスト・CGではない） |

固定文を連結する分、LLMの中間部分は66語以内とし、合計260語前後は目安として扱う（回答の反映を優先する）。

### 空・光・空の演出
- 時間帯・天候の指定があれば、空の色と全体の光を指定に合わせて変える。指定がなければ元画像の昼間の空と光のままにする
- 雨・曇り・雪は、空・光・雰囲気の表現に限る（路面の濡れや積雪は描かない）
- **空の演出（星・月・光の演出・花火など）は、ユーザーの回答に明記されている場合だけ描く。** 「こだわりなし」「特になし」など回答にない場合は、空に何も足さず、時間帯による空の色と光の変化だけにする
- 回答にある場合も、屋根の外に見える狭い空（看板の上端より上と、看板の左右の外側）だけに小さく描き、看板の面・文字・2つの照明の上には重ねない。空を広げるために看板を縮める・画角を引く・屋根を消すことは禁止
- 屋根の透明部分や路面に演出の色が映ることを許可する文は置かない（看板に光がにじむ原因になるため。以前はこの許可文があった）

### その他の制約（日本語の指示としてsystemPromptに入れる）
- 看板は元の色（緑）のまま。時間帯による光の色味の変化だけ許可する
- 樹木は鉢植え・低木、または屋根の下端より低いものに限る。芝生などの床の指定は、屋根の下の通路の床の範囲に限る
- 店舗の庇・看板・のぼり・壁・窓・メニューなどに文字・英単語・数字・ロゴ・店名を描かない
- 施設名の直前に様式の形容詞（レトロ・モダン・和風など）を付けず、素材・色・形・照明で表す。「公園」「広場」など屋外の場所を表す語を場所の名前として書かず、通路に置く設置物として表す

### systemPrompt を書くときの方針（重要）
- **英語の見本文や具体例を書かない。** gpt-4.1-mini は「回答がある場合のみ」といった条件を守らず、systemPrompt にある英語文や具体例を、回答になくても出力に写すことがある（例: 回答に花火がないのに fireworks が出力された）
- セット6の systemPrompt（`maskAreaDetail`・ルール上書き）には、「花火」「firework」「effect」を入れない。空の演出は「回答の語を使う」という日本語の指示だけで書かせる
- 英語として残してよいもの: ルール10の時間帯の例（`an orange-to-purple dusk sky` など）、ルール12の例（`a cafe counter with dark wood paneling…` など）、芝生指定時の文、`the arcade street and its shopfronts`。なお promptSuffix の禁止文には `effects` が入るが、これは systemPrompt には入らない
- 固定文（promptPrefix / promptSuffix）で言う内容は、systemPrompt では日本語で「固定文に含まれるので英語では書かない」と指示する。同じ英語文を systemPrompt に置くと、中間部分に重複して出力される

### 変更時の確認手順
1. 共通部分（`src/index.tsx` の共通ルール、`app.js`）を変えた場合は、変更前後でセット1〜5のHTML・systemPrompt・API応答が一致すること、スキップ判定の全組合せが一致することを確認する
2. 組み立て後のセット6の systemPrompt（通常・夕暮れ）と promptPrefix に、「花火」「firework」「effect」が0件であることを文字列検索で確認する
3. ビルド後、プレビュー（別ブランチ名）にだけデプロイし、`/api/refine-prompt` を1パターン1回ずつ確認する（春の昼間・夏の夕暮れ・冬の夜＋花火・冬の朝）。空の演出は回答にある場合だけ出ること、看板の上と左右の外側の空に限定されることを見る。LLMは非決定的なため、問題が出やすいパターンは複数回確認する
4. 画像生成の結果は、プレビューの `?set=6` で人が確認する

## コンセプト（タイトル・文章）の生成（セット6のみ）
6問の回答から、プレゼンシート用の「コンセプトタイトル」と「コンセプト文章」を作り、生成画像のすぐ下（ダウンロード/やり直しボタンの上）に表示する。

- **対象**: `IMAGE_SETS[n].conceptEnabled === true` のセット（セット6のみ）。セット1〜5は HTML・`app.js` の動作・既存APIの応答が変わらない（`__IMAGE_SET__` に `conceptEnabled` が出力されず、`app.js` の `isConceptEnabled()` が false のため何もしない）
- **API**: `POST /api/generate-concept`　入力 `{ setId, answers: { facilityType, usageScene, style, surroundings, timeOfDay, additionalNotes } }`
  - 成功: `{ success: true, title, text, meta: { titleLength, textLength, paragraphs, retried, inRange } }`
  - `setId` が 1〜6 以外・コンセプト非対応のセットは **403**（OpenAI を呼ばない。`?set=` の既定にはフォールバックしない）。JSON不正・answers 欠落は 400、キー未設定は 500、上流エラー・出力不正は 502
- **モデル**: gpt-4.1-mini（`OPENAI_API_KEY`）、`response_format: json_object`、初回 temperature 0.7・再生成 0.5
- **出力の条件**: タイトル 15〜20字（句読点込み）、文章 150〜200字（改行を除く）・3〜4段落・敬体。場所は「池田のサカエマチ2番街」と書き、商店街であることは文中で自然に表す。回答にない事実・英語・他地域名は入れない
- **検査と再生成**: 文字数は `Array.from(str).length`（文章は空白・改行を除く）。文字数の範囲外・英字2文字以上の混入・「川西」を含む場合は、前回の出力と実際の文字数を伝えて **1回だけ** 再生成する。再生成後も範囲外なら、範囲に近いほうをそのまま返し、`console.log` に文字数を残す（画面は止めない）。JSON不正・項目欠落は失敗扱い
- **「特になし」の扱い**: 10字以下で、なし/ない/なんでも/特に/とくに/任せ を含む回答だけ「指定なし」として渡す（長い回答は誤判定しない）
- **systemPrompt に例文は入れない**（LLM が言い回しをそのまま写すため）。段落ごとの文字数の目安と、タイトルの作り方の手順で指示する。検証で再生成後も範囲外が半数以上なら、検証用と別の例を1つだけ足す案がある
- **画面（`app.js`）**:
  - `generateImage()` の開始時に `requestConcept()` を await せずに呼ぶ（画像の生成・表示は待たせない）
  - `#concept-box` は `#resultActions` の直前に動的に挿入し、画像の表示と同時に見せる。作成中は「コンセプトを作成中…」、失敗・タイムアウト（60秒）は「コンセプトを作成できませんでした」の1行のみ
  - 表示は `textContent` のみ。`displayResult()` のスクロールは、コンセプト欄がある場合も従来と同じ画像の見える位置（ボタン下端が画面下端になる位置）に合わせる
  - 「同じ回答で生成する」の再試行では、同じ回答で作成済み・作成中ならコンセプトを再リクエストしない
  - `resetChat()` で `#concept-box` を削除し、進行中のリクエストの応答は破棄する（世代番号 `conceptRequestId`）
- **変更時の確認**: セット1〜5で `/api/generate-concept` が呼ばれず `#concept-box` が出ないこと、setId 1〜5・不正値で 403 になることを確認してから本番に出す

## データフロー
```
ユーザー入力 (6問)
  → buildPrompt() → 日本語ドラフト（maskMode で冒頭表現を切り替え）
  → shouldSkipComposite() 判定
  → refinePrompt() → POST /api/refine-prompt → GPT-4.1-mini → 英語プロンプト
      （セット6のみ: promptPrefix + LLMの中間部分 + promptSuffix をサーバー側で連結して返す）
  → POST /api/generate-submit → fal.ai キュー投入（aspect_ratio はセット値） → requestId
  → ポーリング GET /api/generate-status (3秒間隔・最大360秒)
  → GET /api/generate-result → imageUrl
  → compositeWithOriginal() → Canvas合成 → blob URL
  → displayResult() → タブUI表示・ダウンロード有効化
（セット6のみ: generateImage() の開始時に POST /api/generate-concept を並行で呼び、画像の下にコンセプトを表示）
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
3. `maskAreaDetail` に、生成対象範囲・保持すべき背景要素・禁止事項を記述する。英語の見本文や具体例は、LLMが回答にない場合でも出力に写すことがあるため、必要最小限にする（セット6は日本語の指示のみ。「セット6の仕様」参照）
4. `compositeCutRatio` は、保持したい背景の下端と生成物の上端の間に来るよう設定する。まず低層の施設で生成し、切り落としが起きたら値を下げる
5. 動作確認は `?set=新しいID` で行う。既定にする場合は `config/image-set.json` の `IMAGE_SET_ID` を変更し、`npm run build` してデプロイする
6. `maskAreaLabel` は `buildPrompt()` の日本語ドラフトに入り、`shouldSkipComposite` の判定対象になる。`app.js` の `NIGHTTIME_KEYWORDS` / `SKIP_KEYWORDS_EXTRA` の語（アーケード・提灯・夜・ドーム・大屋根 など）を含めないこと。`sceneDescription` / `maskAreaDetail` / `edgeTreatmentRule` は systemPrompt 側に入り判定対象外
7. 空・光を時間帯に合わせて変えたいセットは、`systemPromptRuleOverrides`（ルール 1 / 2 / 3 / 4 / 8 / 9 / 10 / 12 / 13 / 14 のうち必要なもの）と `timeOfDayNote` を指定し、`maskAreaDetail` に「空は元画像のまま」と書かないこと（指定がない場合に限り元画像の昼間の空と光を維持する、という書き方にする）。看板などの色は「元の色を保ち、光による色味の変化のみ許可」と書く
8. 看板・屋根・カメラなど毎回保持させたい構造は、`promptPrefix` / `promptSuffix` の固定文として持たせ、LLMには中間部分だけを書かせる。固定文と同じ内容を systemPrompt に英語で書かないこと（中間部分に重複して出る）
9. 空の演出（花火など）は「ユーザーの回答に明記されている場合だけ描く」と日本語で書き、systemPrompt に具体的な演出名の英語例を置かないこと
10. 新しいセットを本番に出す前に、`?set=` を付けない既定（セット4）の表示・動作が変わらないことを確認する（HTMLが現行の本番とバイト一致するか、`?set=` 未指定・不正値でセット4になるかを見る）

## 既知の課題
- `app.js` の `buildPrompt()` に「建物、道路、通路、高架構造物、その他すべての建築要素は元の画像のまま保持する」という固定文があり、セット4の「新設する構造物は病院建物の手前に重なってよい」という指示と論理的に競合する。現状は GPT-4.1-mini が解決しているが、生成物が不自然に小さくなる・奥に配置される事象が出た場合はここが原因候補
- `public/static/images/` に未使用の白塗り画像が残っている
- セット6: 「レトロ」「モダン」など様式の形容詞が施設名の前に付く英語（例: `retro-style cafe area`）が出力に残ることがある。systemPrompt で禁止しているが、LLMが守らない場合がある。今のところ生成結果への悪影響は見つかっていない
- セット6: 看板の面に生成物が重ならないことは、プロンプトでの指示のみで担保している。重なる場合の対策として、看板部分を元画像から貼り戻す合成が考えられるが、未実装
- Q6 の入力例文（`app.js` の質問文）に「空には花火があがっている」があり、全セット共通で表示される。セット6でこの例文が回答の誘導になる可能性がある（プロンプトには入らない）

## デプロイ
- **プラットフォーム**: Cloudflare Pages
- **プロジェクト名**: machizukuri-ai
- **ステータス**: ✅ 本番稼働中
- **技術スタック**: Hono + TypeScript + fal.ai NanoBananaPro + OpenAI GPT-4.1-mini
- **デプロイ履歴**: Cloudflare ダッシュボードで確認する

### デプロイ方式
Git 連携なしの手動デプロイ。`main` への push・マージでは自動デプロイされない。

```bash
# 本番（main の内容をビルドしてから）
npm run build
npx wrangler pages deploy dist --project-name machizukuri-ai --branch main

# プレビュー（別ブランチ名を付ける。本番には影響しない）
npm run build
npx wrangler pages deploy dist --project-name machizukuri-ai --branch set6-test --commit-dirty=true
```

- プレビューは `https://<ブランチ名>.machizukuri-ai.pages.dev`（ブランチ名のエイリアス）と、デプロイごとの `https://<デプロイID>.machizukuri-ai.pages.dev` で開く
- 本番にしたいブランチ名は Cloudflare Pages の本番ブランチ設定（`main`）で決まる。`--branch main` 以外は本番にならない
- 以前のデプロイへ戻す場合は、Cloudflare ダッシュボードの Deployments で確認・操作する

### 開発の進め方（セット追加など）
1. 機能ブランチで開発する（例: `feature/set6-sakaemachi`）
2. ビルドして、プレビュー用のブランチ名でデプロイし、`?set=N` で確認する
3. GitHub で PR を作り、Create a merge commit でマージする
4. マージ後に、`main` を本番へ手動デプロイする

## 今後の改善候補
- 複数の元画像をユーザーが選択できる機能
- 生成履歴の保存（Cloudflare KV/D1 活用）
- シェア機能（SNS投稿）
- 画面上からの画像セット切り替え（現在は `?set=N` のURL指定、既定を変える場合はコード変更＋再デプロイが必要）
- セット6の看板の貼り戻し合成（看板の面に生成物が重ならないことを確実にする）
