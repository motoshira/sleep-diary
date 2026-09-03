interface Env {
  ASSETS: Fetcher;
  /** デプロイ先全体にかける Basic 認証。secret で渡す。 */
  BASIC_AUTH_USER: string;
  BASIC_AUTH_PASSWORD: string;
}
