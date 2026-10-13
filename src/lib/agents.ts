import Papa from "papaparse";
import { getMarket } from "./markets";
import type { Agent, AgentFilters, Market, MarketId } from "./types";

interface RawRow {
  "Agent Name"?: string;
  Email?: string;
  Phone?: string;
  "State License"?: string;
  "Sell-Side Transactions"?: string;
  "Buy-Side Transactions"?: string;
  "Total Transactions"?: string;
  "Zips Active"?: string;
  "First Transaction"?: string;
  "Last Transaction"?: string;
}

function toNumber(value?: string): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Deterministic pseudo-location around a market centroid when CSV has no lat/lng. */
function coordsForAgent(seed: string, market: Market): { lat: number; lng: number } {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }

  const angle = ((hash % 360) * Math.PI) / 180;
  const radiusKm = ((hash % 1000) / 1000) * market.spreadKm;
  const kmPerDegLat = 110.574;
  const kmPerDegLng = 111.32 * Math.cos((market.center[0] * Math.PI) / 180);

  return {
    lat: market.center[0] + (radiusKm * Math.sin(angle)) / kmPerDegLat,
    lng: market.center[1] + (radiusKm * Math.cos(angle)) / kmPerDegLng,
  };
}

export function parseAgentsCsv(csvText: string, marketId: MarketId): Agent[] {
  const market = getMarket(marketId);
  const parsed = Papa.parse<RawRow>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  const agents: Agent[] = [];

  parsed.data.forEach((row, index) => {
    const name = (row["Agent Name"] ?? "").trim();
    if (!name) return;

    const license = (row["State License"] ?? "").trim();
    const email = (row.Email ?? "").trim();
    const seed = `${marketId}:${license || email || name}:${index}`;
    const { lat, lng } = coordsForAgent(seed, market);

    agents.push({
      id: seed,
      name,
      email,
      phone: (row.Phone ?? "").trim(),
      license,
      sellSide: toNumber(row["Sell-Side Transactions"]),
      buySide: toNumber(row["Buy-Side Transactions"]),
      total: toNumber(row["Total Transactions"]),
      zipsActive: toNumber(row["Zips Active"]),
      firstTransaction: (row["First Transaction"] ?? "").trim(),
      lastTransaction: (row["Last Transaction"] ?? "").trim(),
      marketId,
      city: market.city,
      state: market.state,
      zip: market.zip,
      lat,
      lng,
    });
  });

  return agents;
}

function inDateRange(value: string, from: string, to: string): boolean {
  if (!value) return !from && !to;
  if (from && value < from) return false;
  if (to && value > to) return false;
  return true;
}

export function filterAgents(agents: Agent[], filters: AgentFilters): Agent[] {
  const q = filters.query.trim().toLowerCase();

  const filtered = agents.filter((agent) => {
    if (agent.total < filters.minTotal) return false;
    if (agent.sellSide < filters.minSell) return false;
    if (agent.buySide < filters.minBuy) return false;
    if (agent.zipsActive < filters.minZips) return false;

    if (filters.sideFocus === "sell" && agent.sellSide <= agent.buySide) return false;
    if (filters.sideFocus === "buy" && agent.buySide <= agent.sellSide) return false;
    if (
      filters.sideFocus === "balanced" &&
      Math.abs(agent.sellSide - agent.buySide) > 1
    ) {
      return false;
    }

    if (!inDateRange(agent.firstTransaction, filters.firstFrom, filters.firstTo)) {
      return false;
    }
    if (!inDateRange(agent.lastTransaction, filters.lastFrom, filters.lastTo)) {
      return false;
    }

    if (!q) return true;

    return (
      agent.name.toLowerCase().includes(q) ||
      agent.email.toLowerCase().includes(q) ||
      agent.phone.toLowerCase().includes(q) ||
      agent.license.toLowerCase().includes(q)
    );
  });

  const sorted = [...filtered];
  sorted.sort((a, b) => {
    switch (filters.sort) {
      case "total-asc":
        return a.total - b.total || a.name.localeCompare(b.name);
      case "sell-desc":
        return b.sellSide - a.sellSide || b.total - a.total;
      case "buy-desc":
        return b.buySide - a.buySide || b.total - a.total;
      case "name-asc":
        return a.name.localeCompare(b.name);
      case "last-desc":
        return (b.lastTransaction || "").localeCompare(a.lastTransaction || "");
      case "zips-desc":
        return b.zipsActive - a.zipsActive || b.total - a.total;
      case "total-desc":
      default:
        return b.total - a.total || a.name.localeCompare(b.name);
    }
  });

  return sorted;
}

export function agentsToCsv(agents: Agent[]): string {
  const header = [
    "Agent Name",
    "Email",
    "Phone",
    "State License",
    "Sell-Side Transactions",
    "Buy-Side Transactions",
    "Total Transactions",
    "Zips Active",
    "First Transaction",
    "Last Transaction",
    "City",
    "State",
    "Zip",
  ];

  const rows = agents.map((agent) => [
    agent.name,
    agent.email,
    agent.phone,
    agent.license,
    String(agent.sellSide),
    String(agent.buySide),
    String(agent.total),
    String(agent.zipsActive),
    agent.firstTransaction,
    agent.lastTransaction,
    agent.city,
    agent.state,
    agent.zip ?? "",
  ]);

  return Papa.unparse({ fields: header, data: rows });
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export const DEFAULT_FILTERS: AgentFilters = {
  query: "",
  minTotal: 0,
  minSell: 0,
  minBuy: 0,
  minZips: 0,
  sideFocus: "all",
  firstFrom: "",
  firstTo: "",
  lastFrom: "",
  lastTo: "",
  sort: "total-desc",
};
