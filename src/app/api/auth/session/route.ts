import { NextResponse } from "next/server";
import { currentSession } from "@/lib/ghl/requestSession";

export async function GET() {
  const session = await currentSession();
  if (!session) return NextResponse.json({ session: null }, { status: 401 });
  return NextResponse.json({ session });
}
