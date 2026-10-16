import { NextResponse } from "next/server";
import { withSessionCookie } from "@/lib/ghl/requestSession";

export async function POST(request: Request) {
  const expected = process.env.GHL_PREVIEW_TOKEN;
  if (!expected) return NextResponse.json({ error: "Preview is not enabled" }, { status: 404 });

  let token = "";
  try {
    const body = (await request.json()) as { token?: string };
    token = body.token || "";
  } catch {
    token = "";
  }
  if (token !== expected) return NextResponse.json({ error: "Preview token was rejected" }, { status: 401 });

  const session = {
    locationId: process.env.GHL_PREVIEW_LOCATION_ID || "preview",
    locationName: "Preview subaccount",
    userId: "preview",
    userName: "Preview user",
    email: "preview@local",
    companyId: process.env.GHL_COMPANY_ID || "",
  };
  return withSessionCookie(NextResponse.json({ session }), session);
}
