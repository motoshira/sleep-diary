-- 睡眠の記録。user_id は Google アカウントの sub で、テナントの境界になる。
CREATE TABLE entries (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  date       TEXT NOT NULL,          -- 起床日 (YYYY-MM-DD)
  bed_time   TEXT NOT NULL,          -- HH:MM
  latency    INTEGER NOT NULL DEFAULT 0,
  waso       INTEGER NOT NULL DEFAULT 0,
  wake_time  TEXT NOT NULL,
  out_time   TEXT,
  quality    INTEGER NOT NULL DEFAULT 3,
  tags       TEXT NOT NULL DEFAULT '[]',   -- JSON 配列
  note       TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 1日1件。取得も (user_id, date) 順なのでこの索引がそのまま効く。
CREATE UNIQUE INDEX entries_user_date ON entries (user_id, date);
