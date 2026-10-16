import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifyLocation } from "@/lib/ghl/client";
import { withSessionCookie } from "@/lib/ghl/requestSession";
import { EMBED_COOKIE } from "@/lib/ghl/cookies";

export async function POST(request: Request) {
  const jar = await cookies();
  const embed = jar.get(EMBED_COOKIE)?.value;
  if (!embed) {
    return NextResponse.json(
      { error: "Open AI Partnership Platform from the sidebar inside a subaccount" },
      { status: 401 },
    );
  }

  let locationId = "";
  let userId = "";
  let userName = "";
  let email = "";
  try {
    const body = (await request.json()) as {
      locationId?: string;
      userId?: string;
      userName?: string;
      email?: string;
    };
    locationId = body.locationId || "";
    userId = body.userId || "";
    userName = body.userName || "";
    email = body.email || "";
  } catch {
    return NextResponse.json({ error: "Missing subaccount" }, { status: 400 });
  }

  if (!locationId || locationId !== embed) {
    return NextResponse.json({ error: "Subaccount did not match the sidebar link" }, { status: 401 });
  }

  try {
    const locationName = await verifyLocation(locationId);
    const session = {
      locationId,
      locationName,
      userId,
      userName,
      email,
      companyId: process.env.GHL_COMPANY_ID || "",
    };
    return withSessionCookie(NextResponse.json({ session }), session);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not verify this subaccount";
    const status = message.includes("not set") ? 503 : 401;
    return NextResponse.json({ error: message }, { status });
  }
}
