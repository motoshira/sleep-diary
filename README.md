# sleep-diary

夜ごとの睡眠を記録して、睡眠時間・睡眠効率・起床時刻の傾向を眺めるための小さな日誌アプリ。

## 開発

```sh
bun install
bun run dev      # 開発サーバ
bun run build    # dist/ に本番ビルド
bun run preview  # ビルド結果をローカルで確認
```

## 構成

- `index.html` / `src/main.jsx` — エントリポイント
- `src/SleepDiary.jsx` — アプリ本体（スタイルはコンポーネント内の `<style>` が持つ）
- `src/storage.js` — 記録の保存先。現在は `localStorage`

## デプロイ（Cloudflare Workers）

```sh
bun run start           # dist をビルドして wrangler dev で確認
bun run deploy          # production へデプロイ
bun run deploy:preview  # preview 環境へデプロイ
```

`main` への push で GitHub Actions（`.github/workflows/deploy.yml`）が production へ自動デプロイする。
あらかじめ repository secrets に以下を登録しておく。

| secret | 内容 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Workers の編集権限を持つ API トークン |
| `CLOUDFLARE_ACCOUNT_ID` | デプロイ先アカウントの ID |

## Basic 認証

デプロイ先はまだ一般公開しないので、サイト全体に Basic 認証をかけている。アプリのユーザー認証ではなく、単なる目隠し。

```sh
wrangler secret put BASIC_AUTH_USER --env=""
wrangler secret put BASIC_AUTH_PASSWORD --env=""
```

secret は環境ごとに持つので、preview 環境にも別途入れる。

```sh
wrangler secret put BASIC_AUTH_USER --env preview
wrangler secret put BASIC_AUTH_PASSWORD --env preview
```

- **secret を入れ忘れると 503 を返す。** 設定漏れでサイト全体が素通しになるより、開かないほうが安全なため
- `wrangler.jsonc` の `run_worker_first: true` で静的アセットへのリクエストも Worker を通している。これを外すと HTML や JS が Basic 認証を通らずに配信される
- ローカルで動かすときは `.dev.vars` に同じ 2 つを書く（`.dev.vars.example` を参照）

## Google ログイン

記録は Google アカウント（ID トークンの `sub`）ごとに分かれる。

### 1. OAuth クライアントを作る

Google Cloud コンソールの「APIとサービス → 認証情報」で OAuth 2.0 クライアント ID（種別: ウェブアプリケーション）を作り、承認済みのリダイレクト URI に以下を登録する。

- `http://localhost:8787/api/auth/callback`（ローカル開発）
- `https://<デプロイ先のドメイン>/api/auth/callback`

### 2. 秘密情報を設定する

ローカルは `.dev.vars.example` を `.dev.vars` にコピーして値を入れる。デプロイ先には wrangler で登録する。

```sh
wrangler secret put GOOGLE_CLIENT_ID --env=""
wrangler secret put GOOGLE_CLIENT_SECRET --env=""
wrangler secret put SESSION_SECRET --env=""   # openssl rand -base64 32
```

### 3. ローカルで動かす

`bun run dev`（Vite）は `/api/*` を `http://localhost:8787` の Worker に転送する。別のターミナルで `wrangler dev` を起動しておく。OAuth のリダイレクト先を揃えるなら、`bun run start` で Worker 側（8787）だけを使うほうが確実。

### エンドポイント

| メソッド | パス | 内容 |
| --- | --- | --- |
| GET | `/api/auth/login` | Google の認可画面へリダイレクト（state + PKCE） |
| GET | `/api/auth/callback` | コードを交換し ID トークンを検証してセッション Cookie を発行 |
| POST | `/api/auth/logout` | セッション Cookie を破棄 |
| GET | `/api/me` | ログイン中のユーザー。未ログインなら 401 |

## データの保存（D1）

記録は Cloudflare D1 に保存され、`user_id`（Google の `sub`）で分離される。1日1件で、同じ日付を保存すると上書きされる。

### 準備

```sh
wrangler d1 create sleep-diary          # 出力された database_id を wrangler.jsonc に書く
bun run db:migrate:local                # ローカルの D1 にマイグレーションを適用
bun run db:migrate                      # デプロイ先の D1 に適用
```

`main` への push では GitHub Actions がデプロイ前にマイグレーションを適用する。

### エンドポイント

| メソッド | パス | 内容 |
| --- | --- | --- |
| GET | `/api/entries` | 自分の記録を新しい順に返す |
| PUT | `/api/entries` | 記録を保存する（同じ日付があれば上書き） |
| DELETE | `/api/entries/:id` | 1件削除 |
| DELETE | `/api/entries` | 全件削除 |
| POST | `/api/entries/import` | localStorage に残っていた記録の取り込み |
| GET | `/api/stats` | 直近7日の平均（睡眠時間・睡眠効率・起床時刻） |

睡眠時間の計算は `src/shared/sleep.js` に置き、サーバーの集計とクライアントの表示で共有している。

## 時刻の書き方

時刻は `HH:MM` で、24時以降の表記も受け付ける。`25:30` は深夜1時30分のことで、`01:30` と同じ夜を指す。区切りなしの `2530` も同じものとして扱う。

記録日は起きた日なので、12時より前の時刻はその朝、12時以降は前夜とみなす。昼まで眠った朝のようにこの境目を越える時刻は、`36:00`（＝正午）のように24時以降の表記で書けば表せる。上限は `47:59`。
