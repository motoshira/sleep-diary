import { handleAuthRoutes } from "./auth/index.js";
import { handleEntryRoutes } from "./entries/index.js";
import { checkBasicAuth } from "./lib/basic-auth.js";

/**
 * Workers のエントリポイント。
 *
 * wrangler.jsonc で run_worker_first を有効にしているため、静的アセットへの
 * リクエストもここを通る。まず Basic 認証で全体を閉じ、通ったものだけを
 * /api/* と SPA に振り分ける。
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const denied = await checkBasicAuth(request, env);
    if (denied) return denied;

    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      const response =
        (await handleAuthRoutes(request, env)) ?? (await handleEntryRoutes(request, env));
      if (response) return response;
      return Response.json({ error: "Not Found" }, { status: 404 });
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
