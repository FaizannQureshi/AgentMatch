import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { readSession, SESSION_COOKIE, signSession, sessionCookieOptions } from "./session";
import type { GhlSession } from "@/lib/types";

export async function currentSession(): Promise<GhlSession | null> {
  const jar = await cookies();
  return readSession(jar.get(SESSION_COOKIE)?.value);
}

export function withSessionCookie(res: NextResponse, session: GhlSession) {
  const secure = process.env.NODE_ENV === "production";
  res.cookies.set(SESSION_COOKIE, signSession(session), sessionCookieOptions(secure));
  return res;
}

export async function requireSession() {
  const session = await currentSession();
  if (!session) {
    return { session: null, error: NextResponse.json({ error: "Open this app from your CRM sidebar" }, { status: 401 }) };
  }
  return { session, error: null };
}
