/**
 * 睡眠時間まわりの計算。サーバー（集計）とクライアント（表示・入力プレビュー）の
 * 両方から使うため、ここに置いて共有する。
 */

export const pad = (n) => String(n).padStart(2, "0");

// 記録日(起床日)の午前0時を基準にした分。12時以降の時刻は前夜とみなして負の値になる。
export const toRel = (hhmm) => {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  const v = h * 60 + m;
  return h >= 12 ? v - 1440 : v;
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
