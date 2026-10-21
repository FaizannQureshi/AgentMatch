import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { Sql, TransactionSql } from "postgres";
import { db } from "@/lib/db";

const API = "https://services.leadconnectorhq.com";
const AUTH = "https://marketplace.gohighlevel.com/v2/oauth/chooselocation";
const SCOPES = [
  "contacts.readonly",
  "contacts.write",
  "locations.readonly",
  "oauth.readonly",
  "oauth.write",
].join(" ");

interface StoredAuth {
  refreshToken: string;
  accessToken?: string;
  accessExpiresAt?: number;
  companyId?: string;
}

const cache = globalThis as unknown as {
  ghlAuth?: StoredAuth;
  ghlLocationTokens?: Map<string, { token: string; exp: number }>;
};

function tokenFile() {
  if (process.env.VERCEL) return path.join("/tmp", "ghl-oauth.json");
  return path.join(process.cwd(), "data", "ghl-oauth.json");
}

function clientConfig() {
  const clientId = process.env.GHL_CLIENT_ID;
  const clientSecret = process.env.GHL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GHL_CLIENT_ID and GHL_CLIENT_SECRET are not set");
  }
  return { clientId, clientSecret };
}

export function redirectUri() {
  return process.env.GHL_REDIRECT_URI || "https://agentmatch-six.vercel.app/api/auth/crm/callback";
}

export function installUrl() {
  const { clientId } = clientConfig();
  // Marketplace client ids look like "{appId}-{suffix}". The install URL needs both
  // client_id and version_id (the app/version id before the suffix).
  const versionId =
    process.env.GHL_APP_VERSION_ID || clientId.split("-")[0] || clientId;
  const params = new URLSearchParams({
    response_type: "code",
    redirect_uri: redirectUri(),
    client_id: clientId,
    scope: SCOPES,
    version_id: versionId,
  });
  return `${AUTH}?${params.toString()}`;
}

type OauthRow = {
  refresh_token: string;
  access_token: string | null;
  access_expires_at: string | null;
  company_id: string | null;
};

function rowToStored(row: OauthRow): StoredAuth {
  return {
    refreshToken: row.refresh_token,
    accessToken: row.access_token || undefined,
    accessExpiresAt: row.access_expires_at ? Number(row.access_expires_at) : undefined,
    companyId: row.company_id || process.env.GHL_COMPANY_ID,
  };
}

let tableReady: Promise<void> | null = null;

async function ensureTable(sql: Sql) {
  tableReady ??= sql`
    create table if not exists ghl_oauth (
      id text primary key,
      refresh_token text not null,
      access_token text,
      access_expires_at bigint,
      company_id text,
      updated_at timestamptz not null default now()
    )
  `.then(() => undefined, (err) => {
    tableReady = null;
    throw err;
  });
  return tableReady;
}

async function upsertRow(sql: Sql | TransactionSql, next: StoredAuth) {
  await sql`
    insert into ghl_oauth (id, refresh_token, access_token, access_expires_at, company_id)
    values ('agency', ${next.refreshToken}, ${next.accessToken ?? null}, ${next.accessExpiresAt ?? null}, ${next.companyId ?? null})
    on conflict (id) do update set
      refresh_token = excluded.refresh_token,
      access_token = excluded.access_token,
      access_expires_at = excluded.access_expires_at,
      company_id = excluded.company_id,
      updated_at = now()
  `;
}

async function readFileOrEnv(): Promise<StoredAuth | null> {
  try {
    const parsed = JSON.parse(await readFile(tokenFile(), "utf8")) as StoredAuth;
    if (parsed.refreshToken) return parsed;
  } catch {
    // No file yet.
  }
  const fromEnv = process.env.GHL_REFRESH_TOKEN;
  if (!fromEnv) return null;
  return { refreshToken: fromEnv, companyId: process.env.GHL_COMPANY_ID };
}

async function readStored(): Promise<StoredAuth | null> {
  if (cache.ghlAuth?.refreshToken) return cache.ghlAuth;
  const sql = await db();
  if (sql) {
    await ensureTable(sql);
    const rows = await sql<OauthRow[]>`
      select refresh_token, access_token, access_expires_at, company_id from ghl_oauth where id = 'agency'
    `;
    if (rows[0]?.refresh_token) {
      cache.ghlAuth = rowToStored(rows[0]);
      return cache.ghlAuth;
    }
  }
  const fallback = await readFileOrEnv();
  if (fallback) cache.ghlAuth = fallback;
  return fallback;
}

async function writeFileStore(next: StoredAuth) {
  const file = tokenFile();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(next), "utf8");
}

async function writeStored(next: StoredAuth) {
  cache.ghlAuth = next;
  const sql = await db();
  if (!sql) {
    await writeFileStore(next);
    return;
  }
  await ensureTable(sql);
  await upsertRow(sql, next);
}

function accessValid(stored: StoredAuth | null | undefined): stored is StoredAuth & { accessToken: string } {
  return Boolean(stored?.accessToken && stored.accessExpiresAt && stored.accessExpiresAt > Date.now());
}

async function tokenRequest(body: URLSearchParams) {
  const res = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    companyId?: string;
    error_description?: string;
    message?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.message || "GoHighLevel token request failed");
  }
  return data;
}

export async function saveAuthorizationCode(code: string) {
  const { clientId, clientSecret } = clientConfig();
  const data = await tokenRequest(
    new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      user_type: "Company",
      redirect_uri: redirectUri(),
    }),
  );
  if (!data.refresh_token) throw new Error("GoHighLevel did not return a refresh token");
  await writeStored({
    refreshToken: data.refresh_token,
    accessToken: data.access_token,
    accessExpiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 - 60_000,
    companyId: data.companyId || process.env.GHL_COMPANY_ID,
  });
  return { companyId: data.companyId || "", refreshToken: data.refresh_token };
}

function asAgency(stored: StoredAuth & { accessToken: string }) {
  return { token: stored.accessToken, companyId: stored.companyId || process.env.GHL_COMPANY_ID || "" };
}

async function refreshAgency(stored: StoredAuth): Promise<StoredAuth & { accessToken: string }> {
  const { clientId, clientSecret } = clientConfig();
  let data;
  try {
    data = await tokenRequest(
      new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: stored.refreshToken,
        user_type: "Company",
      }),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Token refresh failed";
    if (/invalid_grant|invalid token|expired/i.test(message)) {
      throw new Error(
        "Agency CRM connection expired. Reinstall at /api/auth/crm/start and store the new refresh token.",
      );
    }
    throw err;
  }
  return {
    refreshToken: data.refresh_token || stored.refreshToken,
    accessToken: data.access_token!,
    accessExpiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 - 60_000,
    companyId: data.companyId || stored.companyId || process.env.GHL_COMPANY_ID,
  };
}

const NOT_INSTALLED =
  "Install the agency app before importing. An agency private integration cannot create contacts.";

async function agencyAccessToken(): Promise<{ token: string; companyId: string }> {
  if (accessValid(cache.ghlAuth)) return asAgency(cache.ghlAuth);

  const sql = await db();
  if (!sql) {
    // No database: single-instance best effort (local dev).
    const stored = await readStored();
    if (!stored) throw new Error(NOT_INSTALLED);
    if (accessValid(stored)) return asAgency(stored);
    const next = await refreshAgency(stored);
    if (next.refreshToken) process.env.GHL_REFRESH_TOKEN = next.refreshToken;
    await writeStored(next);
    return asAgency(next);
  }

  // HighLevel refresh tokens are single-use. Every server instance must read the
  // latest one from the database and refresh under a row lock, or a second
  // instance refreshes with a token that was already rotated and gets invalid_grant.
  await ensureTable(sql);
  const next = await sql.begin(async (tx) => {
    const rows = await tx<OauthRow[]>`
      select refresh_token, access_token, access_expires_at, company_id
      from ghl_oauth where id = 'agency' for update
    `;
    const stored = rows[0]?.refresh_token ? rowToStored(rows[0]) : await readFileOrEnv();
    if (!stored) throw new Error(NOT_INSTALLED);
    if (accessValid(stored)) return stored;
    const refreshed = await refreshAgency(stored);
    await upsertRow(tx, refreshed);
    return refreshed;
  });
  cache.ghlAuth = next;
  return asAgency(next);
}

export async function getAgencyToken() {
  if (process.env.GHL_CLIENT_ID && process.env.GHL_CLIENT_SECRET) {
    const stored = await readStored();
    if (stored) return agencyAccessToken();
  }
  const pit = process.env.GHL_AGENCY_TOKEN;
  if (!pit) throw new Error("Connect the agency app before using subaccount data");
  return { token: pit, companyId: process.env.GHL_COMPANY_ID || "" };
}

export async function getLocationToken(locationId: string) {
  if (!cache.ghlLocationTokens) cache.ghlLocationTokens = new Map();
  const hit = cache.ghlLocationTokens.get(locationId);
  if (hit && hit.exp > Date.now()) return hit.token;

  const request = async () => {
    const agency = await agencyAccessToken();
    if (!agency.companyId) throw new Error("GHL_COMPANY_ID is missing");
    return fetch(`${API}/oauth/locationToken`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${agency.token}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        Version: "2021-07-28",
      },
      body: new URLSearchParams({ companyId: agency.companyId, locationId }),
    });
  };
  let res = await request();
  if (res.status === 401) {
    // Another instance may have rotated the agency token; drop ours and reload it.
    cache.ghlAuth = undefined;
    res = await request();
  }
  const data = (await res.json()) as { access_token?: string; expires_in?: number; message?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(data.message || "Could not open this subaccount for contact import");
  }
  cache.ghlLocationTokens.set(locationId, {
    token: data.access_token,
    exp: Date.now() + Math.min(data.expires_in ?? 3600, 1800) * 1000,
  });
  return data.access_token;
}
