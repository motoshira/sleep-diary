/**
 * 記録の保存先。今は localStorage だが、呼び出し側から見た形（非同期）は
 * サーバー保存に差し替えても変わらないようにしてある。
 *
 * 1つのブラウザを複数の Google アカウントで使うことがあるため、
 * キーはユーザー（Google の sub）ごとに分ける。
 */
const storeKey = (userKey) => `sleep-diary:v1:${userKey}`;

export async function loadEntries(userKey) {
  try {
    const raw = localStorage.getItem(storeKey(userKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // 壊れた値や localStorage が使えない環境。空で開始する。
    return [];
  }
}

export async function saveEntries(userKey, entries) {
  localStorage.setItem(storeKey(userKey), JSON.stringify(entries));
}

export async function clearEntries(userKey) {
  localStorage.removeItem(storeKey(userKey));
}
