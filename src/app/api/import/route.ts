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

  if (batch.length === 0) {
    return NextResponse.json(
      {
        error: "No contacts left to import after clean-up filters. Turn off “Skip shared team inboxes” or pick agents with email/phone.",
        imported: 0,
        failed: 0,
        remaining: 0,
        errors: [],
        status: "failed",
      },
      { status: 400 },
    );
  }

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
  const detail = failures.slice(0, 3).join(" | ");
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
    detail,
  });

  const authExpired = failures.some((f) => /invalid_grant|expired|unauthorized|install the agency/i.test(f));
  if (imported === 0) {
    return NextResponse.json(
      {
        error: authExpired
          ? "Agency CRM connection expired. Reinstall the app at /api/auth/crm/start, then try again."
          : detail || "Import failed for every contact",
        imported: 0,
        failed: failures.length,
        remaining: Math.max(0, contacts.length - batch.length),
        errors: failures.slice(0, 3),
        status,
        record,
      },
      { status: authExpired ? 401 : 502 },
    );
  }

  return NextResponse.json({
    imported,
    failed: failures.length,
    remaining: Math.max(0, contacts.length - batch.length),
    errors: failures.slice(0, 3),
    status,
    record,
  });
}
