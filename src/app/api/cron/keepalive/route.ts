import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  return header === `Bearer ${secret}`;
}

async function pingPostgres() {
  const url = process.env.DATABASE_URL;
  if (!url) return { ok: false as const, via: "postgres", error: "DATABASE_URL not set" };
  const postgres = (await import("postgres")).default;
  const sql = postgres(url, { ssl: "require", max: 1 });
  try {
    await sql`select 1 as ok`;
    return { ok: true as const, via: "postgres" };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function pingSupabaseRest() {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!base || !key) {
    return { ok: false as const, via: "rest", error: "SUPABASE_URL / SUPABASE_ANON_KEY not set" };
  }
  const res = await fetch(`${base.replace(/\/$/, "")}/rest/v1/`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    cache: "no-store",
  });
  // Any HTTP response means the project is awake.
  return { ok: res.status < 500, via: "rest", status: res.status };
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = [];
  try {
    results.push(await pingPostgres());
  } catch (err) {
    results.push({
      ok: false as const,
      via: "postgres",
      error: err instanceof Error ? err.message : "Postgres ping failed",
    });
  }
  try {
    results.push(await pingSupabaseRest());
  } catch (err) {
    results.push({
      ok: false as const,
      via: "rest",
      error: err instanceof Error ? err.message : "REST ping failed",
    });
  }

  const ok = results.some((r) => r.ok);
  return NextResponse.json(
    { ok, at: new Date().toISOString(), results },
    { status: ok ? 200 : 503 },
  );
}
