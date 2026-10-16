import { NextResponse } from "next/server";
import { requireSession } from "@/lib/ghl/requestSession";
import { loadAgentsForMarket } from "@/lib/loadAgents";
import { MARKETS } from "@/lib/markets";
import type { MarketId } from "@/lib/types";

export async function GET() {
  const { session, error } = await requireSession();
  if (!session) return error;
  const loaded = await Promise.all(
    MARKETS.map(async (market) => [market.id, await loadAgentsForMarket(market.id)] as const),
  );
  const agentsByMarket = Object.fromEntries(loaded) as Record<MarketId, unknown>;
  return NextResponse.json({ agentsByMarket });
}
