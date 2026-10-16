import { NextResponse, type NextRequest } from "next/server";
import { EMBED_COOKIE } from "@/lib/ghl/cookies";

function hostAllowed(referer: string) {
  let host = "";
  try {
    host = new URL(referer).hostname.toLowerCase();
  } catch {
    return false;
  }
  const extras = (process.env.GHL_ALLOWED_HOSTS || "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  const suffixes = ["gohighlevel.com", "highlevel.com", "leadconnectorhq.com", "msgsndr.com", ...extras];
  return suffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

export function middleware(request: NextRequest) {
  if (request.method !== "GET" || request.nextUrl.pathname !== "/") return NextResponse.next();

  const secret = process.env.GHL_MENU_SECRET;
  const locationId = request.nextUrl.searchParams.get("location_id") || "";
  const key = request.nextUrl.searchParams.get("key") || "";
  const dest = request.headers.get("sec-fetch-dest") || "";
  const referer = request.headers.get("referer") || "";

  const fromCrmIframe = dest === "iframe" && (!referer || hostAllowed(referer));
  if (!secret || !locationId || key !== secret || !fromCrmIframe) return NextResponse.next();

  const res = NextResponse.next();
  const secure = process.env.NODE_ENV === "production";
  res.cookies.set(EMBED_COOKIE, locationId, {
    httpOnly: true,
    secure,
    sameSite: secure ? "none" : "lax",
    path: "/",
    maxAge: 60 * 10,
    partitioned: secure,
  });
  return res;
}

export const config = { matcher: ["/"] };
