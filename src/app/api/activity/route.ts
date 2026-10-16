import { NextResponse } from "next/server";
import { listActivity, recordActivity } from "@/lib/activity";
import { requireSession } from "@/lib/ghl/requestSession";
import type { ActivityAction } from "@/lib/types";

export async function GET() {
  const { session, error } = await requireSession();
  if (!session) return error;
  const records = await listActivity(session.locationId);
  return NextResponse.json({ records });
}

export async function POST(request: Request) {
  const { session, error } = await requireSession();
  if (!session) return error;
  const body = (await request.json()) as {
    action?: ActivityAction;
    marketId?: string;
    marketLabel?: string;
    city?: string;
    stateCode?: string;
    count?: number;
    format?: string;
    filterSummary?: string;
    status?: "ok" | "partial" | "failed";
    detail?: string;
  };
  if (body.action !== "csv" && body.action !== "import") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  const record = await recordActivity({
    locationId: session.locationId,
    locationName: session.locationName,
    userId: session.userId,
    userName: session.userName,
    userEmail: session.email,
    action: body.action,
    marketId: body.marketId || "",
    marketLabel: body.marketLabel || "",
    city: body.city || "",
    stateCode: body.stateCode || "",
    count: Number(body.count) || 0,
    format: body.format || "",
    filterSummary: body.filterSummary || "",
    status: body.status || "ok",
    detail: body.detail || "",
  });
  return NextResponse.json({ record });
}
