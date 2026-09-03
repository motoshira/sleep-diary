interface Env {
  ASSETS: Fetcher;
  /** Google OAuth クライアント ID。公開値だが設定として secret 経由で渡す。 */
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  /** セッション Cookie の署名鍵。 */
  SESSION_SECRET: string;
}
