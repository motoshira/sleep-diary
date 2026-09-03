import { withUser } from "../auth/index.js";
import { summarize } from "../../shared/sleep.js";
import {
  deleteAllEntries,
  deleteEntry,
  listEntries,
  upsertEntry,
  upsertStatement,
} from "./repository.js";
import type { Entry } from "./repository.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;
const MAX_IMPORT = 2000;

class BadRequest extends Error {}

function toInt(value: unknown, min: number, max: number, field: string): number {
  const n = Math.round(Number(value ?? 0));
  if (!Number.isFinite(n) || n < min || n > max) throw new BadRequest(`${field} が不正です`);
  return n;
}

/** クライアントから来た値をそのまま信用せず、保存できる形に整える。 */
function parseEntry(input: unknown): Entry {
  if (typeof input !== "object" || input === null) throw new BadRequest("記録の形式が不正です");
  const e = input as Record<string, unknown>;

  const date = String(e.date ?? "");
  if (!DATE.test(date)) throw new BadRequest("date が不正です");

  const bedTime = String(e.bedTime ?? "");
  const wakeTime = String(e.wakeTime ?? "");
  if (!TIME.test(bedTime) || !TIME.test(wakeTime)) throw new BadRequest("時刻が不正です");

  const outTime = e.outTime ? String(e.outTime) : "";
  if (outTime && !TIME.test(outTime)) throw new BadRequest("outTime が不正です");

  const tags = Array.isArray(e.tags) ? e.tags.slice(0, 20).map((t) => String(t).slice(0, 40)) : [];
  const id = e.id ? String(e.id).slice(0, 64) : `${date}-${Date.now()}`;

  return {
    id,
    date,
    bedTime,
    wakeTime,
    outTime,
    latency: toInt(e.latency, 0, 600, "latency"),
    waso: toInt(e.waso, 0, 600, "waso"),
    quality: toInt(e.quality ?? 3, 1, 5, "quality"),
    tags,
    note: String(e.note ?? "").slice(0, 2000),
  };
}

/**
 * /api/entries と /api/stats を処理する。担当外のパスなら null を返す。
 * すべてログイン必須で、user.sub の範囲だけを読み書きする。
 */
export async function handleEntryRoutes(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path !== "/api/entries" && !path.startsWith("/api/entries/") && path !== "/api/stats") {
    return null;
  }

  return withUser(request, env, async (user) => {
    try {
      if (path === "/api/stats" && request.method === "GET") {
        const entries = await listEntries(env.DB, user.sub);
        return Response.json({ stats: summarize(entries) });
      }

      if (path === "/api/entries" && request.method === "GET") {
        return Response.json({ entries: await listEntries(env.DB, user.sub) });
      }

      if (path === "/api/entries" && request.method === "PUT") {
        const entry = parseEntry(await request.json());
        return Response.json({ entry: await upsertEntry(env.DB, user.sub, entry) });
      }

      if (path === "/api/entries" && request.method === "DELETE") {
        await deleteAllEntries(env.DB, user.sub);
        return new Response(null, { status: 204 });
      }

      // ブラウザに残っている記録の取り込み。既に同じ日付があれば上書きする。
      if (path === "/api/entries/import" && request.method === "POST") {
        const body = (await request.json()) as { entries?: unknown };
        if (!Array.isArray(body.entries)) throw new BadRequest("entries が配列ではありません");
        if (body.entries.length > MAX_IMPORT) throw new BadRequest("一度に取り込める件数を超えています");

        const statements = body.entries
          .map(parseEntry)
          .map((entry) => upsertStatement(env.DB, user.sub, entry));
        if (statements.length) await env.DB.batch(statements);

        return Response.json({ imported: statements.length });
      }

      if (path.startsWith("/api/entries/") && request.method === "DELETE") {
        const id = decodeURIComponent(path.slice("/api/entries/".length));
        const changes = await deleteEntry(env.DB, user.sub, id);
        if (!changes) return Response.json({ error: "Not Found" }, { status: 404 });
        return new Response(null, { status: 204 });
      }

      return Response.json({ error: "Method Not Allowed" }, { status: 405 });
    } catch (err) {
      if (err instanceof BadRequest) {
        return Response.json({ error: err.message }, { status: 400 });
      }
      if (err instanceof SyntaxError) {
        return Response.json({ error: "リクエストの本文が不正です" }, { status: 400 });
      }
      console.error("entries route failed", err);
      return Response.json({ error: "Internal Server Error" }, { status: 500 });
    }
  });
}
