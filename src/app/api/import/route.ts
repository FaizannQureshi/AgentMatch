import { NextResponse } from "next/server";
import { recordActivity } from "@/lib/activity";
import { upsertContact } from "@/lib/ghl/client";
import { requireSession } from "@/lib/ghl/requestSession";

const CHUNK = 40;
const CONCURRENCY = 4;
const AUTH_ERROR = /invalid_grant|expired|unauthorized|install the agency/i;

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
  const skipped = (body.contacts || []).length - contacts.length;

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
  let failed = 0;
  const failures: string[] = [];
  let authFailure = "";
  let next = 0;

  // A few contacts in flight at once; the client backs off on HighLevel 429s.
  // Every contact in the batch is attempted so none are silently skipped,
  // unless the agency connection itself is broken.
  async function worker() {
    while (next < batch.length && !authFailure) {
      const contact = batch[next++];
      try {
        await upsertContact(session!.locationId, {
          firstName: contact.firstName || "",
          lastName: contact.lastName || "",
          email: (contact.email || "").trim().toLowerCase(),
          phone: contact.phone || "",
          tags,
        });
        imported += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Import failed";
        failed += 1;
        if (failures.length < 5) failures.push(`${contact.email || contact.phone}: ${message}`);
        if (AUTH_ERROR.test(message)) authFailure = message;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batch.length) }, worker));
  const notAttempted = batch.length - imported - failed;

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

  if (authFailure) {
    return NextResponse.json(
      {
        error: "Agency CRM connection expired. Reinstall the app at /api/auth/crm/start, then try again.",
        imported,
        failed: failed + notAttempted,
        skipped,
        remaining: Math.max(0, contacts.length - batch.length),
        errors: failures.slice(0, 3),
        status,
        record,
      },
      { status: 401 },
    );
  }

  if (imported === 0) {
    return NextResponse.json(
      {
        error: detail || "Import failed for every contact",
        imported: 0,
        failed,
        skipped,
        remaining: Math.max(0, contacts.length - batch.length),
        errors: failures.slice(0, 3),
        status,
        record,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    imported,
    failed,
    skipped,
    remaining: Math.max(0, contacts.length - batch.length),
    errors: failures.slice(0, 3),
    status,
    record,
  });
}
