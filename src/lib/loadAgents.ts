import { readFile } from "fs/promises";
import path from "path";
import { parseAgentsCsv } from "./agents";
import { getMarket } from "./markets";
import type { Agent, MarketId } from "./types";

export async function loadAgentsForMarket(marketId: MarketId): Promise<Agent[]> {
  const market = getMarket(marketId);
  const filePath = path.join(process.cwd(), "data", market.filename);
  const csvText = await readFile(filePath, "utf8");
  return parseAgentsCsv(csvText, marketId);
}
