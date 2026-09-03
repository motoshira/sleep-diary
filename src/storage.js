/**
 * 記録の保存先。今は localStorage だが、呼び出し側から見た形（非同期）は
 * サーバー保存に差し替えても変わらないようにしてある。
 */
const STORE_KEY = "sleep-diary:v1";

export async function loadEntries() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // 壊れた値や localStorage が使えない環境。空で開始する。
    return [];
  }
}

export async function saveEntries(entries) {
  localStorage.setItem(STORE_KEY, JSON.stringify(entries));
}

export async function clearEntries() {
  localStorage.removeItem(STORE_KEY);
}
