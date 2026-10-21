import { randomUUID } from "crypto";
import { appendFile, mkdir, readFile } from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import type { ActivityRecord } from "@/lib/types";

type NewActivity = Omit<ActivityRecord, "id" | "at">;

let tableReady: Promise<void> | null = null;

function filePath() {
  if (process.env.VERCEL) return path.join("/tmp", "activity-log.jsonl");
  return path.join(process.cwd(), "data", "activity-log.jsonl");
}

async function readFileLog(locationId: string): Promise<ActivityRecord[]> {
  try {
    const raw = await readFile(filePath(), "utf8");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as ActivityRecord)
      .filter((row) => row.locationId === locationId)
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 200);
  } catch {
    return [];
  }
}

async function sqlClient() {
  const sql = await db();
  if (!sql) return null;
  tableReady ??= (async () => {
    await sql`
      create table if not exists activity_log (
        id text primary key,
        at timestamptz not null default now(),
        location_id text not null,
        location_name text not null default '',
        user_id text not null default '',
        user_name text not null default '',
        user_email text not null default '',
        action text not null,
        market_id text not null,
        market_label text not null,
        city text not null,
        state_code text not null,
        count integer not null,
        format text not null default '',
        filter_summary text not null default '',
        status text not null default 'ok',
        detail text not null default ''
      )
    `;
    await sql`
      create index if not exists activity_location_idx on activity_log (location_id, at desc)
    `;
  })().catch((err) => {
    tableReady = null;
    throw err;
  });
  await tableReady;
  return sql;
}

function rowToRecord(row: Record<string, unknown>): ActivityRecord {
  return {
    id: String(row.id),
    at: new Date(String(row.at)).toISOString(),
    locationId: String(row.location_id),
    locationName: String(row.location_name ?? ""),
    userId: String(row.user_id ?? ""),
    userName: String(row.user_name ?? ""),
    userEmail: String(row.user_email ?? ""),
    action: row.action === "import" ? "import" : "csv",
    marketId: String(row.market_id),
    marketLabel: String(row.market_label),
    city: String(row.city),
    stateCode: String(row.state_code),
    count: Number(row.count),
    format: String(row.format ?? ""),
    filterSummary: String(row.filter_summary ?? ""),
    status: row.status === "failed" || row.status === "partial" ? row.status : "ok",
    detail: String(row.detail ?? ""),
  };
}

export async function listActivity(locationId: string): Promise<ActivityRecord[]> {
  const sql = await sqlClient();
  if (!sql) return readFileLog(locationId);
  const rows = await sql<Record<string, unknown>[]>`
    select * from activity_log
    where location_id = ${locationId}
    order by at desc
    limit 200
  `;
  return rows.map(rowToRecord);
}

export async function recordActivity(input: NewActivity): Promise<ActivityRecord> {
  const record: ActivityRecord = {
    ...input,
    id: randomUUID(),
    at: new Date().toISOString(),
  };
  const sql = await sqlClient();
  if (!sql) {
    const file = filePath();
    await mkdir(path.dirname(file), { recursive: true });
    await appendFile(file, `${JSON.stringify(record)}\n`, "utf8");
    return record;
  }
  await sql`
    insert into activity_log (
      id, at, location_id, location_name, user_id, user_name, user_email,
      action, market_id, market_label, city, state_code, count, format,
      filter_summary, status, detail
    ) values (
      ${record.id}, ${record.at}, ${record.locationId}, ${record.locationName},
      ${record.userId}, ${record.userName}, ${record.userEmail}, ${record.action},
      ${record.marketId}, ${record.marketLabel}, ${record.city}, ${record.stateCode},
      ${record.count}, ${record.format}, ${record.filterSummary}, ${record.status},
      ${record.detail}
    )
  `;
  return record;
}

export function activityToCsv(records: ActivityRecord[]): string {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const header = ["When", "User", "Email", "Action", "City", "State", "Market", "Contacts", "Status", "Detail"];
  const rows = records.map((r) =>
    [r.at, r.userName, r.userEmail, r.action, r.city, r.stateCode, r.marketLabel, r.count, r.status, r.detail]
      .map(esc)
      .join(","),
  );
  return [header.map(esc).join(","), ...rows].join("\n");
}
