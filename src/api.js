/**
 * サーバー（Workers + D1）への読み書き。記録はログイン中のアカウントに
 * ひも付けて保存されるので、クライアント側はユーザーを意識しなくてよい。
 */
async function request(path, options = {}) {
  const res = await fetch(path, { credentials: "same-origin", ...options });

  if (res.status === 401) {
    // セッションが切れている。ログイン画面へ戻す。
    window.location.href = "/";
    throw new Error("unauthorized");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `${path} returned ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

const json = (method, body) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export async function listEntries() {
  return (await request("/api/entries")).entries;
}

/** 同じ日付の記録があれば上書きされる。 */
export async function saveEntry(entry) {
  return (await request("/api/entries", json("PUT", entry))).entry;
}

export function deleteEntry(id) {
  return request(`/api/entries/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function clearEntries() {
  return request("/api/entries", { method: "DELETE" });
}

export async function fetchStats() {
  return (await request("/api/stats")).stats;
}

/**
 * サーバー保存に移す前にブラウザへ溜まっていた記録を一度だけ取り込む。
 * 取り込めたら localStorage 側は消す。
 */
export async function importLegacyEntries(userSub) {
  const keys = [`sleep-diary:v1:${userSub}`, "sleep-diary:v1"];
  const entries = [];

  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) entries.push(...parsed);
    } catch {
      // 壊れた値は無視する
    }
  }
  if (!entries.length) return 0;

  const { imported } = await request("/api/entries/import", json("POST", { entries }));
  for (const key of keys) localStorage.removeItem(key);
  return imported;
}
