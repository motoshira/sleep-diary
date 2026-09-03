interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  /** デプロイ先全体にかける Basic 認証。secret で渡す。 */
  BASIC_AUTH_USER: string;
  BASIC_AUTH_PASSWORD: string;
  /** Google OAuth クライアント ID。公開値だが設定として secret 経由で渡す。 */
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  /** セッション Cookie の署名鍵。 */
  SESSION_SECRET: string;
}
