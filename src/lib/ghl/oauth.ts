import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

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

async function readStored(): Promise<StoredAuth | null> {
  if (cache.ghlAuth?.refreshToken) return cache.ghlAuth;
  const url = process.env.DATABASE_URL;
  if (url) {
    const postgres = (await import("postgres")).default;
    const sql = postgres(url, { ssl: "require", max: 1 });
    const rows = await sql<{ refresh_token: string; access_token: string | null; access_expires_at: string | null; company_id: string | null }[]>`
      select refresh_token, access_token, access_expires_at, company_id from ghl_oauth where id = 'agency'
    `.catch(() => []);
    await sql.end();
    const row = rows[0];
    if (row?.refresh_token) {
      const stored = {
        refreshToken: row.refresh_token,
        accessToken: row.access_token || undefined,
        accessExpiresAt: row.access_expires_at ? Number(row.access_expires_at) : undefined,
        companyId: row.company_id || process.env.GHL_COMPANY_ID,
      };
      cache.ghlAuth = stored;
      return stored;
    }
  }
  try {
    const parsed = JSON.parse(await readFile(tokenFile(), "utf8")) as StoredAuth;
    if (parsed.refreshToken) {
      cache.ghlAuth = parsed;
      return parsed;
    }
  } catch {
    // No file yet.
  }
  const fromEnv = process.env.GHL_REFRESH_TOKEN;
  if (!fromEnv) return null;
  return { refreshToken: fromEnv, companyId: process.env.GHL_COMPANY_ID };
}

async function writeStored(next: StoredAuth) {
  cache.ghlAuth = next;
  const file = tokenFile();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(next), "utf8");

  const url = process.env.DATABASE_URL;
  if (!url) return;
  const postgres = (await import("postgres")).default;
  const sql = postgres(url, { ssl: "require", max: 1 });
  await sql`
    create table if not exists ghl_oauth (
      id text primary key,
      refresh_token text not null,
      access_token text,
      access_expires_at bigint,
      company_id text,
      updated_at timestamptz not null default now()
    )
  `;
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
  await sql.end();
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

async function agencyAccessToken(): Promise<{ token: string; companyId: string }> {
  const stored = await readStored();
  if (!stored) {
    throw new Error("Install the agency app before importing. An agency private integration cannot create contacts.");
  }
  if (stored.accessToken && stored.accessExpiresAt && stored.accessExpiresAt > Date.now()) {
    return { token: stored.accessToken, companyId: stored.companyId || process.env.GHL_COMPANY_ID || "" };
  }
  const { clientId, clientSecret } = clientConfig();
  const data = await tokenRequest(
    new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: stored.refreshToken,
      user_type: "Company",
    }),
  );
  const next: StoredAuth = {
    refreshToken: data.refresh_token || stored.refreshToken,
    accessToken: data.access_token,
    accessExpiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 - 60_000,
    companyId: data.companyId || stored.companyId || process.env.GHL_COMPANY_ID,
  };
  await writeStored(next);
  return { token: data.access_token!, companyId: next.companyId || "" };
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

  const agency = await agencyAccessToken();
  if (!agency.companyId) throw new Error("GHL_COMPANY_ID is missing");
  const res = await fetch(`${API}/oauth/locationToken`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${agency.token}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Version: "2021-07-28",
    },
    body: new URLSearchParams({ companyId: agency.companyId, locationId }),
  });
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
