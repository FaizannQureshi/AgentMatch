import { NextResponse } from "next/server";
import { verifyLocation } from "@/lib/ghl/client";
import { withSessionCookie } from "@/lib/ghl/requestSession";
import { decryptSso } from "@/lib/ghl/sso";

export async function POST(request: Request) {
  let encrypted = "";
  try {
    const body = (await request.json()) as { encryptedData?: string };
    encrypted = body.encryptedData || "";
  } catch {
    return NextResponse.json({ error: "Missing CRM session" }, { status: 400 });
  }
  if (!encrypted) return NextResponse.json({ error: "Missing CRM session" }, { status: 400 });

  try {
    const session = decryptSso(encrypted);
    try {
      session.locationName = await verifyLocation(session.locationId);
    } catch {
      session.locationName = session.locationName || "Subaccount";
    }
    return withSessionCookie(NextResponse.json({ session }), session);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not verify the CRM session";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
