import type { Sql } from "postgres";

const globalStore = globalThis as unknown as { appSql?: Sql };

/**
 * One pooled Postgres client per server instance. `prepare: false` keeps it
 * working through the Supabase transaction pooler (port 6543).
 */
export async function db(): Promise<Sql | null> {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (!globalStore.appSql) {
    const postgres = (await import("postgres")).default;
    globalStore.appSql = postgres(url, { ssl: "require", max: 3, prepare: false, idle_timeout: 20 });
  }
  return globalStore.appSql;
}
