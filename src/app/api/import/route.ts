import { NextResponse } from "next/server";
import { recordActivity } from "@/lib/activity";
import { upsertContact } from "@/lib/ghl/client";
import { requireSession } from "@/lib/ghl/requestSession";

const CHUNK = 40;

interface Incoming {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  sharedEmail?: boolean;
}

export async function POST(request: Request) {
  const { session, error } = await requireSession();
  if (!session) return error;
  if (session.locationId === "preview") {
    return NextResponse.json(
      { error: "Preview mode cannot write contacts. Open the app from a real subaccount." },
      { status: 400 },
    );
  }

  const body = (await request.json()) as {
    contacts?: Incoming[];
    skipSharedEmail?: boolean;
    tags?: string[];
    marketId?: string;
    marketLabel?: string;
    city?: string;
    stateCode?: string;
    filterSummary?: string;
  };

  const tags = (body.tags || []).map((tag) => tag.trim()).filter(Boolean).slice(0, 10);
  const contacts = (body.contacts || []).filter((c) => (c.email || c.phone) && !(body.skipSharedEmail && c.sharedEmail));
  const batch = contacts.slice(0, CHUNK);

  let imported = 0;
  const failures: string[] = [];
  for (const contact of batch) {
    try {
      await upsertContact(session.locationId, {
        firstName: contact.firstName || "",
        lastName: contact.lastName || "",
        email: (contact.email || "").trim().toLowerCase(),
        phone: contact.phone || "",
        tags,
      });
      imported += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Import failed";
      failures.push(`${contact.email || contact.phone}: ${message}`);
      if (failures.length >= 5) break;
    }
  }

  const status = imported === 0 ? "failed" : failures.length ? "partial" : "ok";
  const record = await recordActivity({
    locationId: session.locationId,
    locationName: session.locationName,
    userId: session.userId,
    userName: session.userName,
    userEmail: session.email,
    action: "import",
    marketId: body.marketId || "",
    marketLabel: body.marketLabel || "",
    city: body.city || "",
    stateCode: body.stateCode || "",
    count: imported,
    format: "ghl",
    filterSummary: body.filterSummary || "",
    status,
    detail: failures.slice(0, 3).join(" | "),
  });

  return NextResponse.json({
    imported,
    failed: failures.length,
    remaining: Math.max(0, contacts.length - batch.length),
    errors: failures.slice(0, 3),
    status,
    record,
  });
}
