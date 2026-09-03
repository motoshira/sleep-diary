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
