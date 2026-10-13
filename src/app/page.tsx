import AgentDirectory from "@/components/AgentDirectory";
import { loadAgentsForMarket } from "@/lib/loadAgents";
import { MARKETS } from "@/lib/markets";
import type { Agent, MarketId } from "@/lib/types";

export default async function Home() {
  const loaded = await Promise.all(
    MARKETS.map(async (m) => [m.id, await loadAgentsForMarket(m.id)] as const),
  );
  const agentsByMarket = Object.fromEntries(loaded) as Record<MarketId, Agent[]>;

  return <AgentDirectory agentsByMarket={agentsByMarket} />;
}
