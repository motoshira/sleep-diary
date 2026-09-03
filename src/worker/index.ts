/**
 * Workers のエントリポイント。
 *
 * ビルド成果物に一致するパスは Workers 側の静的アセット配信が先に処理するため、
 * ここに来るのは「アセットに無いパス」だけ。今は API を持たないので、
 * /api/* は 404 を返し、それ以外は SPA として index.html を返す。
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return Response.json({ error: "Not Found" }, { status: 404 });
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
