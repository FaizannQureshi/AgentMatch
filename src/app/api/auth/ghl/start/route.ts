import { NextResponse } from "next/server";
import { installUrl } from "@/lib/ghl/oauth";

export async function GET() {
  try {
    return NextResponse.redirect(installUrl());
  } catch (error) {
    const message = error instanceof Error ? error.message : "App credentials are missing";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
