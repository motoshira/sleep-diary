export type Entry = {
  id: string;
  date: string;
  bedTime: string;
  latency: number;
  waso: number;
  wakeTime: string;
  outTime: string;
  quality: number;
  tags: string[];
  note: string;
};

type Row = {
  id: string;
  date: string;
  bed_time: string;
  latency: number;
  waso: number;
  wake_time: string;
  out_time: string | null;
  quality: number;
  tags: string;
  note: string;
};

function toEntry(row: Row): Entry {
  let tags: string[] = [];
  try {
    const parsed = JSON.parse(row.tags);
    if (Array.isArray(parsed)) tags = parsed.map(String);
  } catch {
    // 壊れた値はタグ無しとして扱う
  }
  return {
    id: row.id,
    date: row.date,
    bedTime: row.bed_time,
    latency: row.latency,
    waso: row.waso,
    wakeTime: row.wake_time,
    outTime: row.out_time ?? "",
    quality: row.quality,
    tags,
    note: row.note,
  };
}

const SELECT =
  "SELECT id, date, bed_time, latency, waso, wake_time, out_time, quality, tags, note FROM entries";

/** 新しい順に返す。UI もこの順で扱う。 */
export async function listEntries(db: D1Database, userId: string): Promise<Entry[]> {
  const { results } = await db
    .prepare(`${SELECT} WHERE user_id = ?1 ORDER BY date DESC`)
    .bind(userId)
    .all<Row>();
  return results.map(toEntry);
}

/**
 * 1日1件なので (user_id, date) で upsert する。
 * 同じ日付の記録が既にあれば、id は元のものを保つ。
 */
export function upsertStatement(db: D1Database, userId: string, entry: Entry) {
  return db
    .prepare(
      `INSERT INTO entries
         (id, user_id, date, bed_time, latency, waso, wake_time, out_time, quality, tags, note)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
       ON CONFLICT (user_id, date) DO UPDATE SET
         bed_time = excluded.bed_time,
         latency = excluded.latency,
         waso = excluded.waso,
         wake_time = excluded.wake_time,
         out_time = excluded.out_time,
         quality = excluded.quality,
         tags = excluded.tags,
         note = excluded.note,
         updated_at = datetime('now')`
    )
    .bind(
      entry.id,
      userId,
      entry.date,
      entry.bedTime,
      entry.latency,
      entry.waso,
      entry.wakeTime,
      entry.outTime || null,
      entry.quality,
      JSON.stringify(entry.tags),
      entry.note
    );
}

export async function upsertEntry(
  db: D1Database,
  userId: string,
  entry: Entry
): Promise<Entry | null> {
  await upsertStatement(db, userId, entry).run();
  const row = await db
    .prepare(`${SELECT} WHERE user_id = ?1 AND date = ?2`)
    .bind(userId, entry.date)
    .first<Row>();
  return row ? toEntry(row) : null;
}

/** 消えた件数を返す。他人の記録は user_id で弾かれる。 */
export async function deleteEntry(db: D1Database, userId: string, id: string): Promise<number> {
  const result = await db
    .prepare("DELETE FROM entries WHERE user_id = ?1 AND id = ?2")
    .bind(userId, id)
    .run();
  return result.meta.changes ?? 0;
}

export async function deleteAllEntries(db: D1Database, userId: string): Promise<void> {
  await db.prepare("DELETE FROM entries WHERE user_id = ?1").bind(userId).run();
}
