/**
 * 睡眠時間まわりの計算。サーバー（集計）とクライアント（表示・入力プレビュー）の
 * 両方から使うため、ここに置いて共有する。
 */

export const pad = (n) => String(n).padStart(2, "0");

/** 24時以降の表記をどこまで許すか。丸2日を跨ぐ入力は打ち間違いとみなす。 */
export const MAX_HOUR = 47;

/**
 * 時刻を「その日の0時からの分」に直す。「25:30」のような24時以降の表記も受け取る。
 * 区切りなしの「2530」も同じものとして扱う（数字キーパッドで打ちやすいため）。
 * 読めなければ null。
 */
export const toMinutes = (input) => {
  if (typeof input !== "string") return null;
  const m = /^(\d{1,2}):?([0-5]\d)$/.exec(input.trim());
  if (!m) return null;
  const h = Number(m[1]);
  if (h > MAX_HOUR) return null;
  return h * 60 + Number(m[2]);
};

/** 入力を保存できる "HH:MM" に整える。24時以降はその表記のまま残す。読めなければ null。 */
export const normalizeTime = (input) => {
  const v = toMinutes(input);
  return v == null ? null : `${pad(Math.floor(v / 60))}:${pad(v % 60)}`;
};

/**
 * 記録日(起床日)の午前0時を基準にした分。12時以降の時刻は前夜とみなして負の値になり、
 * 24時以降の表記（25:30 など）はそのまま起床日の朝として正の値になる。
 * 昼まで眠った朝のように 12時の境目を越える時刻は、36:00 のように書けば表せる。
 */
export const toRel = (hhmm) => {
  const v = toMinutes(hhmm);
  if (v == null) return null;
  return v >= 720 ? v - 1440 : v;
};

export const relToClock = (rel) => {
  let v = Math.round(rel) % 1440;
  if (v < 0) v += 1440;
  return `${pad(Math.floor(v / 60))}:${pad(v % 60)}`;
};

export const analyze = (e) => {
  const bed = toRel(e.bedTime);
  const wake = toRel(e.wakeTime);
  const out = toRel(e.outTime || e.wakeTime);
  if (bed == null || wake == null || out == null) return null;

  let tib = out - bed;
  if (tib <= 0) tib += 1440;
  let window = wake - bed;
  if (window <= 0) window += 1440;

  const tst = Math.max(0, window - (e.latency || 0) - (e.waso || 0));
  return { bed, wake, out, tib, tst, eff: tib > 0 ? (tst / tib) * 100 : 0 };
};

/** 新しい順に並んだ記録から、直近 days 日ぶんの平均を出す。 */
export const summarize = (entries, days = 7) => {
  const recent = entries.slice(0, days).map(analyze).filter(Boolean);
  if (!recent.length) return null;
  const avg = (f) => recent.reduce((s, r) => s + f(r), 0) / recent.length;
  return {
    n: recent.length,
    tst: avg((r) => r.tst),
    eff: avg((r) => r.eff),
    wake: avg((r) => r.wake),
  };
};
