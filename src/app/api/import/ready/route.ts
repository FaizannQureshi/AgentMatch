import { NextResponse } from "next/server";
import { countVisible } from "@/lib/ghl/client";
import { requireSession } from "@/lib/ghl/requestSession";

const MAX_SAMPLE = 5;

/** Checks whether a sample of just-imported emails already shows in the Contacts list. */
export async function POST(request: Request) {
  const { session, error } = await requireSession();
  if (!session) return error;
  if (session.locationId === "preview") return NextResponse.json({ visible: 0, checked: 0 });

  const body = (await request.json().catch(() => ({}))) as { emails?: string[] };
  const emails = (body.emails || []).filter((e) => typeof e === "string" && e.includes("@")).slice(0, MAX_SAMPLE);
  if (emails.length === 0) return NextResponse.json({ visible: 0, checked: 0 });

  try {
    const visible = await countVisible(session.locationId, emails);
    return NextResponse.json({ visible, checked: emails.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not check Contacts";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
