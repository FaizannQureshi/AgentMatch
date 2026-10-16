import { createHmac, timingSafeEqual } from "crypto";
import type { GhlSession } from "@/lib/types";
export { EMBED_COOKIE, SESSION_COOKIE } from "./cookies";

const MAX_AGE_SEC = 60 * 60 * 12;

export function sessionCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: (secure ? "none" : "lax") as "none" | "lax",
    path: "/",
    maxAge: MAX_AGE_SEC,
    partitioned: secure,
  };
}

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error("SESSION_SECRET is not set");
  return value;
}

export function signSession(session: GhlSession): string {
  const body = Buffer.from(
    JSON.stringify({ ...session, exp: Date.now() + MAX_AGE_SEC * 1000 }),
  ).toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readSession(token: string | undefined | null): GhlSession | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  let expected: string;
  try {
    expected = createHmac("sha256", secret()).update(body).digest("base64url");
  } catch {
    return null;
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as GhlSession & {
      exp: number;
    };
    if (!parsed.locationId || !parsed.exp || parsed.exp < Date.now()) return null;
    return {
      locationId: parsed.locationId,
      locationName: parsed.locationName || "",
      userId: parsed.userId || "",
      userName: parsed.userName || "",
      email: parsed.email || "",
      companyId: parsed.companyId || "",
    };
  } catch {
    return null;
  }
}
