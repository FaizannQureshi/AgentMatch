import AgentDirectory from "@/components/AgentDirectory";
import { loadAgentsForMarket } from "@/lib/loadAgents";
import type { MarketId } from "@/lib/types";

export default async function Home() {
  const marketIds: MarketId[] = ["tampa-33647", "tampa-citywide"];
  const loaded = await Promise.all(
    marketIds.map(async (id) => [id, await loadAgentsForMarket(id)] as const),
  );

  const agentsByMarket = Object.fromEntries(loaded) as Record<
    MarketId,
    Awaited<ReturnType<typeof loadAgentsForMarket>>
  >;

  return <AgentDirectory agentsByMarket={agentsByMarket} />;
}
