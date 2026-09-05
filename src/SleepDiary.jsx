import { useState, useEffect, useMemo } from "react";
import {
  clearEntries,
  deleteEntry,
  fetchStats,
  importLegacyEntries,
  listEntries,
  saveEntry,
} from "./api.js";
import { analyze, normalizeTime, pad, relToClock } from "./shared/sleep.js";

/* ---------- time helpers ---------- */
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const fmtDur = (min) => {
  if (min == null || isNaN(min)) return "—";
  const a = Math.max(0, Math.round(min));
  return `${Math.floor(a / 60)}時間${a % 60}分`;
};

const shiftDays = (iso, n) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
};

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];
const fmtDate = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${m}/${d} ${WEEK[dt.getDay()]}`;
};

const TAGS = ["カフェイン", "飲酒", "運動", "昼寝", "夜更かし"];

const TIME_FIELDS = ["bedTime", "wakeTime", "outTime"];

const blankEntry = () => ({
  id: null,
  date: todayISO(),
  bedTime: "23:30",
  latency: 15,
  waso: 0,
  wakeTime: "07:00",
  outTime: "",
  quality: 3,
  tags: [],
  note: "",
});

/* ---------- timeline ---------- */
const AX_START = -360; // 18:00
const AX_END = 720; // 12:00
const AX_SPAN = AX_END - AX_START;
const pct = (rel) => ((Math.min(AX_END, Math.max(AX_START, rel)) - AX_START) / AX_SPAN) * 100;

function NightChart({ entries }) {
  const rows = entries.slice(0, 14).reverse();
  const ticks = [-360, -180, 0, 180, 360, 540, 720];

  if (!rows.length) {
    return (
      <div className="empty">
        <p>まだ記録がありません。</p>
        <p className="empty-sub">昨夜の眠りを1つ書き留めると、ここに夜が並びはじめます。</p>
      </div>
    );
  }

  return (
    <div className="chart">
      <div className="chart-grid" aria-hidden="true">
        {ticks.map((t) => (
          <span key={t} className="grid-line" style={{ left: `${pct(t)}%` }} />
        ))}
      </div>

      {rows.map((e) => {
        const a = analyze(e);
        if (!a) return null;
        const sleepStart = a.bed + (e.latency || 0);
        return (
          <div key={e.id} className="night-row">
            <span className="night-label">{fmtDate(e.date)}</span>
            <div className="night-track">
              <span
                className="bar-bed"
                style={{ left: `${pct(a.bed)}%`, width: `${pct(a.out) - pct(a.bed)}%` }}
              />
              <span
                className="bar-sleep"
                style={{
                  left: `${pct(sleepStart)}%`,
                  width: `${Math.max(0.8, pct(a.wake) - pct(sleepStart))}%`,
                  opacity: 0.45 + (e.quality || 3) * 0.11,
                }}
              />
            </div>
            <span className="night-dur">{(a.tst / 60).toFixed(1)}h</span>
          </div>
        );
      })}

      <div className="axis" aria-hidden="true">
        {ticks.map((t) => (
          <span key={t} className="axis-tick" style={{ left: `${pct(t)}%` }}>
            {relToClock(t).slice(0, 2)}
          </span>
        ))}
      </div>
      <p className="legend">
        <span className="key key-bed" />
        床の中
        <span className="key key-sleep" />
        眠っていた時間（濃さは睡眠の質）
      </p>
    </div>
  );
}

/* ---------- app ---------- */
export default function SleepDiary({ user, onLogout }) {
  const [entries, setEntries] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(blankEntry());
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [from, setFrom] = useState(shiftDays(todayISO(), -29));
  const [to, setTo] = useState(todayISO());

  useEffect(() => {
    (async () => {
      try {
        await importLegacyEntries(user.sub);
        setEntries(await listEntries());
        setStats(await fetchStats());
      } catch {
        setError("記録を読み込めませんでした。通信の状態をご確認ください。");
      } finally {
        setLoading(false);
      }
    })();
  }, [user.sub]);

  const refreshStats = async () => {
    try {
      setStats(await fetchStats());
    } catch {
      // 集計は表示だけなので、取れなければ前の値のままにする。
    }
  };

  // 画面を先に更新し、サーバー側が失敗したら元に戻す。
  const commit = async (next, action) => {
    const prev = entries;
    setEntries(next);
    try {
      await action();
      setError("");
      await refreshStats();
    } catch {
      setEntries(prev);
      setError("保存できませんでした。もう一度お試しください。");
    }
  };

  const flash = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2200);
  };

  const sorted = useMemo(
    () => [...entries].sort((a, b) => (a.date < b.date ? 1 : -1)),
    [entries]
  );

  const save = () => {
    const tidy = { ...form };
    for (const k of TIME_FIELDS) {
      if (tidy[k]) tidy[k] = normalizeTime(tidy[k]) || tidy[k];
    }
    if (!analyze(tidy) || TIME_FIELDS.some((k) => tidy[k] && !normalizeTime(tidy[k]))) {
      setError("時刻は 23:30 や 25:30（深夜1時30分）のように入れてください。");
      return;
    }
    const rec = { ...tidy, id: tidy.id || `${tidy.date}-${Date.now()}` };
    const next = [...entries.filter((e) => e.id !== rec.id && e.date !== rec.date), rec];
    commit(next, () => saveEntry(rec));
    setForm(blankEntry());
    setOpen(false);
    flash("記録しました");
  };

  const edit = (e) => {
    setForm({ ...blankEntry(), ...e });
    setOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const remove = (id) => {
    commit(entries.filter((e) => e.id !== id), () => deleteEntry(id));
    if (form.id === id) {
      setForm(blankEntry());
      setOpen(false);
    }
    flash("削除しました");
  };

  const inRange = useMemo(
    () => sorted.filter((e) => e.date >= from && e.date <= to).slice().reverse(),
    [sorted, from, to]
  );

  const buildCsv = () => {
    const head = "日付,就床,入眠までの分,中途覚醒の分,起床,離床,総睡眠時間(分),睡眠効率(%),睡眠の質,タグ,メモ";
    const cell = (v) => {
      const s = String(v == null ? "" : v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = inRange.map((e) => {
      const a = analyze(e) || {};
      return [
        e.date, e.bedTime, e.latency || 0, e.waso || 0, e.wakeTime, e.outTime || e.wakeTime,
        Math.round(a.tst || 0), (a.eff || 0).toFixed(1), e.quality,
        (e.tags || []).join(" "), e.note || "",
      ].map(cell).join(",");
    });
    return [head, ...lines].join("\r\n");
  };

  const downloadCsv = () => {
    if (!inRange.length) {
      setError("その期間には記録がありません。");
      return;
    }
    try {
      // Excelで文字化けしないようBOM付きUTF-8にする
      const blob = new Blob(["\uFEFF" + buildCsv()], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `睡眠日誌_${from}_${to}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setError("");
      flash(`${inRange.length}件を書き出しました`);
    } catch {
      setError("保存できませんでした。コピーをお使いください。");
    }
  };

  const copyCsv = async () => {
    if (!inRange.length) {
      setError("その期間には記録がありません。");
      return;
    }
    try {
      await navigator.clipboard.writeText(buildCsv());
      setError("");
      flash(`${inRange.length}件をコピーしました`);
    } catch {
      setError("コピーできませんでした。");
    }
  };

  const setPreset = (days) => {
    const end = sorted.length ? sorted[0].date : todayISO();
    if (days === null) {
      setFrom(sorted.length ? sorted[sorted.length - 1].date : end);
    } else {
      setFrom(shiftDays(end, -(days - 1)));
    }
    setTo(end);
    setError("");
  };

  const clearAll = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 4000);
      return;
    }
    setConfirmClear(false);
    await commit([], clearEntries);
    flash("すべて削除しました");
  };

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  // 入力から離れた時点で "HH:MM" に整える。読めない間は打ちかけとみなして触らない。
  const tidyTime = (k) => () =>
    setForm((f) => {
      const v = normalizeTime(f[k]);
      return v && v !== f[k] ? { ...f, [k]: v } : f;
    });
  const badTime = (k) => (form[k] && !normalizeTime(form[k]) ? " bad" : "");

  const toggleTag = (t) =>
    setForm((f) => ({
      ...f,
      tags: (f.tags || []).includes(t) ? f.tags.filter((x) => x !== t) : [...(f.tags || []), t],
    }));

  const preview = analyze(form);

  return (
    <div className="app">
      <style>{`
        .app{
          background:var(--night); color:var(--text); min-height:100%;
          font-family:system-ui,-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif;
          padding:22px 18px 56px; -webkit-font-smoothing:antialiased;
        }
        .app *{box-sizing:border-box;}
        .title{font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;
          font-size:26px; font-weight:400; letter-spacing:.02em; margin:0;}
        .sub{color:var(--muted); font-size:13px; margin:4px 0 22px;}
        .account{display:flex; align-items:center; justify-content:flex-end; gap:8px;
          margin-bottom:10px;}
        .account-name{font-size:12px; color:var(--muted);}

        .chart{position:relative; margin-bottom:26px;}
        .chart-grid{position:absolute; left:52px; right:38px; top:0; bottom:34px;}
        .grid-line{position:absolute; top:0; bottom:0; width:1px; background:var(--line);}
        .night-row{display:flex; align-items:center; gap:8px; height:20px;}
        .night-label{width:44px; flex:none; font-size:11px; color:var(--muted); text-align:right;}
        .night-track{position:relative; flex:1; height:11px;}
        .night-dur{width:30px; flex:none; font-size:11px; color:var(--muted);
          font-variant-numeric:tabular-nums;}
        .bar-bed{position:absolute; top:0; height:11px; border-radius:3px;
          background:rgba(110,119,196,.32);}
        .bar-sleep{position:absolute; top:0; height:11px; border-radius:3px; background:var(--moon);}
        .axis{position:relative; height:16px; margin:6px 38px 0 52px;}
        .axis-tick{position:absolute; transform:translateX(-50%); font-size:10px; color:var(--muted);
          font-variant-numeric:tabular-nums;}
        .legend{display:flex; align-items:center; gap:6px; font-size:11px; color:var(--muted);
          margin:10px 0 0 52px;}
        .key{width:14px; height:8px; border-radius:2px; display:inline-block;}
        .key-bed{background:rgba(110,119,196,.32);}
        .key-sleep{background:var(--moon); margin-left:10px;}

        .empty{border:1px dashed var(--line); border-radius:10px; padding:26px 18px;
          text-align:center; margin-bottom:26px;}
        .empty p{margin:0; font-size:14px;}
        .empty-sub{color:var(--muted); font-size:12px; margin-top:6px !important;}

        .stats{display:flex; gap:10px; margin-bottom:24px;}
        .stat{flex:1; border-top:1px solid var(--line); padding-top:10px;}
        .stat-v{font-family:"Iowan Old Style",Palatino,Georgia,serif; font-size:21px;
          font-variant-numeric:tabular-nums;}
        .stat-k{font-size:11px; color:var(--muted); margin-top:2px;}

        .btn{border:1px solid var(--line); background:transparent; color:var(--text);
          border-radius:8px; padding:11px 14px; font-size:14px; cursor:pointer; font-family:inherit;}
        .btn:hover{border-color:var(--dusk);}
        .btn:focus-visible{outline:2px solid var(--moon); outline-offset:2px;}
        .btn-main{width:100%; background:var(--moon); color:#221A0B; border-color:var(--moon);
          font-weight:600;}
        .btn-ghost{font-size:12px; color:var(--muted); padding:7px 10px;}

        .form{border:1px solid var(--line); border-radius:12px; padding:16px; margin-bottom:24px;
          background:var(--raised);}
        .grid2{display:grid; grid-template-columns:1fr 1fr; gap:12px;}
        .field{display:flex; flex-direction:column; gap:5px; margin-bottom:12px;}
        .field label{font-size:12px; color:var(--muted);}
        .field input, .field textarea{background:var(--night); border:1px solid var(--line);
          color:var(--text); border-radius:7px; padding:9px 10px; font-size:15px;
          font-family:inherit; width:100%;}
        .field input:focus, .field textarea:focus{outline:none; border-color:var(--dusk);}
        .field input.bad{border-color:#F0917E;}
        .hint{font-size:11px; color:var(--muted); margin:-4px 0 14px;}
        .hint b{color:var(--text); font-weight:600; font-variant-numeric:tabular-nums;}
        .quality{display:flex; gap:6px;}
        .q{flex:1; padding:9px 0; border-radius:7px; border:1px solid var(--line);
          background:transparent; color:var(--muted); cursor:pointer; font-size:13px;}
        .q.on{background:var(--dusk); border-color:var(--dusk); color:#fff;}
        .tags{display:flex; flex-wrap:wrap; gap:6px;}
        .tag{padding:6px 11px; border-radius:999px; border:1px solid var(--line);
          background:transparent; color:var(--muted); font-size:12px; cursor:pointer;}
        .tag.on{border-color:var(--moon); color:var(--moon);}
        .preview{font-size:12px; color:var(--muted); margin:2px 0 14px;
          font-variant-numeric:tabular-nums;}
        .preview b{color:var(--text); font-weight:600;}

        .log h2{font-size:13px; font-weight:600; color:var(--muted); margin:0 0 10px;}
        .item{display:flex; align-items:center; gap:12px; padding:12px 0;
          border-top:1px solid var(--line);}
        .item-d{width:52px; flex:none; font-size:12px; color:var(--muted);}
        .item-m{flex:1; min-width:0;}
        .item-t{font-size:14px; font-variant-numeric:tabular-nums;}
        .item-s{font-size:11px; color:var(--muted); margin-top:3px; overflow:hidden;
          text-overflow:ellipsis; white-space:nowrap;}
        .icon{border:none; background:none; color:var(--muted); cursor:pointer; font-size:12px;
          padding:6px;}
        .icon:hover{color:var(--text);}
        .export{border:1px solid var(--line); border-radius:12px; padding:16px;
          margin-top:22px; background:var(--raised);}
        .presets{display:flex; flex-wrap:wrap; gap:6px; margin-bottom:14px;}
        .foot{display:flex; justify-content:space-between; margin-top:26px;}
        .err{color:#F0917E; font-size:12px; margin:10px 0;}
        .toast{position:fixed; left:50%; bottom:22px; transform:translateX(-50%);
          background:var(--raised); border:1px solid var(--line); color:var(--text);
          padding:9px 16px; border-radius:999px; font-size:13px;}
        @media (prefers-reduced-motion:reduce){.app *{transition:none !important;}}
      `}</style>

      <div className="account">
        <span className="account-name">{user.name}</span>
        <button className="icon" onClick={onLogout}>ログアウト</button>
      </div>

      <h1 className="title">睡眠日誌</h1>
      <p className="sub">起きた朝に、昨夜のことを書き留める。</p>

      {loading ? (
        <p className="sub">読み込み中…</p>
      ) : (
        <>
          <NightChart entries={sorted} />

          {stats && (
            <div className="stats">
              <div className="stat">
                <div className="stat-v">{(stats.tst / 60).toFixed(1)}<span style={{ fontSize: 13 }}>h</span></div>
                <div className="stat-k">平均睡眠時間</div>
              </div>
              <div className="stat">
                <div className="stat-v">{stats.eff.toFixed(0)}<span style={{ fontSize: 13 }}>%</span></div>
                <div className="stat-k">平均睡眠効率</div>
              </div>
              <div className="stat">
                <div className="stat-v">{relToClock(stats.wake)}</div>
                <div className="stat-k">平均起床時刻</div>
              </div>
            </div>
          )}

          {!open && (
            <button className="btn btn-main" onClick={() => setOpen(true)}>
              昨夜を記録する
            </button>
          )}

          {open && (
            <div className="form">
              <div className="field">
                <label htmlFor="d">起きた日</label>
                <input id="d" type="date" value={form.date}
                  onChange={(e) => set("date")(e.target.value)} />
              </div>

              <div className="grid2">
                <div className="field">
                  <label htmlFor="bt">床に入った時刻</label>
                  <input id="bt" type="text" inputMode="numeric" placeholder="23:30"
                    className={badTime("bedTime").trim()} value={form.bedTime}
                    onChange={(e) => set("bedTime")(e.target.value)}
                    onBlur={tidyTime("bedTime")} />
                </div>
                <div className="field">
                  <label htmlFor="wt">目が覚めた時刻</label>
                  <input id="wt" type="text" inputMode="numeric" placeholder="07:00"
                    className={badTime("wakeTime").trim()} value={form.wakeTime}
                    onChange={(e) => set("wakeTime")(e.target.value)}
                    onBlur={tidyTime("wakeTime")} />
                </div>
                <div className="field">
                  <label htmlFor="lt">寝つくまで（分）</label>
                  <input id="lt" type="number" min="0" max="600" value={form.latency}
                    onChange={(e) => set("latency")(Number(e.target.value) || 0)} />
                </div>
                <div className="field">
                  <label htmlFor="wo">夜中に起きていた合計（分）</label>
                  <input id="wo" type="number" min="0" max="600" value={form.waso}
                    onChange={(e) => set("waso")(Number(e.target.value) || 0)} />
                </div>
              </div>

              <p className="hint">
                24時をまたぐ時刻は <b>25:30</b>（深夜1時30分）のようにも書けます。
              </p>

              <div className="field">
                <label htmlFor="ot">床を離れた時刻（空欄なら起床時刻と同じ）</label>
                <input id="ot" type="text" inputMode="numeric" placeholder="07:20"
                  className={badTime("outTime").trim()} value={form.outTime}
                  onChange={(e) => set("outTime")(e.target.value)}
                  onBlur={tidyTime("outTime")} />
              </div>

              <div className="field">
                <label>眠りの質</label>
                <div className="quality">
                  {[1, 2, 3, 4, 5].map((q) => (
                    <button key={q} className={`q ${form.quality === q ? "on" : ""}`}
                      onClick={() => set("quality")(q)}>{q}</button>
                  ))}
                </div>
              </div>

              <div className="field">
                <label>思い当たること</label>
                <div className="tags">
                  {TAGS.map((t) => (
                    <button key={t} className={`tag ${(form.tags || []).includes(t) ? "on" : ""}`}
                      onClick={() => toggleTag(t)}>{t}</button>
                  ))}
                </div>
              </div>

              <div className="field">
                <label htmlFor="nt">メモ</label>
                <textarea id="nt" rows="2" value={form.note}
                  onChange={(e) => set("note")(e.target.value)} />
              </div>

              {preview && (
                <p className="preview">
                  睡眠時間 <b>{fmtDur(preview.tst)}</b>　睡眠効率 <b>{preview.eff.toFixed(0)}%</b>
                </p>
              )}
              {error && <p className="err">{error}</p>}

              <button className="btn btn-main" onClick={save}>この日を保存する</button>
              <button className="btn btn-ghost" style={{ marginTop: 8, width: "100%" }}
                onClick={() => { setForm(blankEntry()); setOpen(false); setError(""); }}>
                やめる
              </button>
            </div>
          )}

          {sorted.length > 0 && (
            <div className="log">
              <h2>記録</h2>
              {sorted.map((e) => {
                const a = analyze(e);
                return (
                  <div key={e.id} className="item">
                    <span className="item-d">{fmtDate(e.date)}</span>
                    <div className="item-m">
                      <div className="item-t">
                        {fmtDur(a && a.tst)}　効率 {a ? a.eff.toFixed(0) : "—"}%
                      </div>
                      <div className="item-s">
                        {e.bedTime}〜{e.wakeTime}　質{e.quality}
                        {(e.tags || []).length ? `　${e.tags.join("・")}` : ""}
                        {e.note ? `　${e.note}` : ""}
                      </div>
                    </div>
                    <button className="icon" onClick={() => edit(e)}>直す</button>
                    <button className="icon" onClick={() => remove(e.id)}>消す</button>
                  </div>
                );
              })}
              {exportOpen && (
                <div className="export">
                  <div className="presets">
                    <button className="tag" onClick={() => setPreset(7)}>直近7日</button>
                    <button className="tag" onClick={() => setPreset(30)}>直近30日</button>
                    <button className="tag" onClick={() => setPreset(90)}>直近90日</button>
                    <button className="tag" onClick={() => setPreset(null)}>すべて</button>
                  </div>
                  <div className="grid2">
                    <div className="field">
                      <label htmlFor="ef">開始日</label>
                      <input id="ef" type="date" value={from} max={to}
                        onChange={(e) => { setFrom(e.target.value); setError(""); }} />
                    </div>
                    <div className="field">
                      <label htmlFor="et">終了日</label>
                      <input id="et" type="date" value={to} min={from}
                        onChange={(e) => { setTo(e.target.value); setError(""); }} />
                    </div>
                  </div>
                  <p className="preview">
                    この期間の記録 <b>{inRange.length}件</b>
                    {inRange.length > 0 &&
                      `（${fmtDate(inRange[0].date)}〜${fmtDate(inRange[inRange.length - 1].date)}）`}
                  </p>
                  {error && <p className="err">{error}</p>}
                  <button className="btn btn-main" onClick={downloadCsv}>CSVファイルを保存</button>
                  <div className="foot" style={{ marginTop: 8 }}>
                    <button className="btn btn-ghost" onClick={copyCsv}>かわりにコピー</button>
                    <button className="btn btn-ghost"
                      onClick={() => { setExportOpen(false); setError(""); }}>閉じる</button>
                  </div>
                </div>
              )}

              <div className="foot">
                <button className="btn btn-ghost"
                  onClick={() => { setExportOpen(!exportOpen); setError(""); }}>
                  {exportOpen ? "書き出しを閉じる" : "CSVで書き出す"}
                </button>
                <button className="btn btn-ghost" onClick={clearAll}
                  style={confirmClear ? { color: "#F0917E", borderColor: "#F0917E" } : null}>
                  {confirmClear ? "もう一度押すと全消去" : "すべて削除"}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
