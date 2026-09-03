import { checkBasicAuth } from "./lib/basic-auth.js";

/**
 * Workers のエントリポイント。
 *
 * wrangler.jsonc で run_worker_first を有効にしているため、静的アセットへの
 * リクエストもここを通る。まず Basic 認証で全体を閉じ、通ったものだけを
 * API と SPA に振り分ける。今は API を持たないので、/api/* は 404 を返す。
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const denied = await checkBasicAuth(request, env);
    if (denied) return denied;

    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return Response.json({ error: "Not Found" }, { status: 404 });
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
