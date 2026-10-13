import Papa from "papaparse";
import { getMarket, KM_PER_DEG_LAT, kmPerDegLng } from "./markets";
import type {
  Agent,
  AgentFilters,
  ExportOptions,
  Market,
  MarketId,
  RecencyWindow,
} from "./types";

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

/**
 * The vendor file was written in DOS code page 437 but read as Windows-1252, so
 * "DÍAZ" arrives as "D¡AZ". Map the affected bytes back to the intended letters.
 */
const MOJIBAKE: Record<string, string> = {
  "¡": "Í",
  "¢": "Ó",
  "£": "Ú",
  "¤": "Ñ",
  "¥": "Ñ",
  "‚": "É",
  "ƒ": "Â",
  "„": "Ä",
  "…": "À",
  "‡": "Ç",
  "ˆ": "Ê",
  "‰": "Ë",
  "Š": "È",
  "‹": "Ï",
  "Œ": "Î",
  "“": "Ô",
  "”": "Ö",
  "˜": "Ÿ",
  "™": "Ö",
  "š": "Ü",
};

function repairText(value: string): string {
  return value.replace(/[¡¢£¤¥‚ƒ„…‡ˆ‰Š‹Œ“”˜™š]/g, (ch) => MOJIBAKE[ch] ?? ch);
}

const UPPER_SUFFIXES = new Set(["II", "III", "IV"]);
const DROPPED_SUFFIXES = new Set(["PA", "P.A.", "LLC", "INC", "PLLC"]);

function titleWord(word: string): string {
  if (UPPER_SUFFIXES.has(word)) return word;
  if (word === "JR" || word === "SR") return word[0] + word.slice(1).toLowerCase();
  return word
    .toLowerCase()
    .replace(/(^|[-'’])([a-zà-ÿ])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase())
    .replace(/^(Mc)([a-z])/, (_, mc: string, ch: string) => mc + ch.toUpperCase());
}

function cleanName(vendorName: string): { name: string; firstName: string; lastName: string } {
  const words = vendorName.split(/\s+/).filter(Boolean);
  while (words.length > 2 && DROPPED_SUFFIXES.has(words[words.length - 1].toUpperCase())) {
    words.pop();
  }
  const cased = words.map(titleWord);
  return {
    name: cased.join(" "),
    firstName: cased[0] ?? "",
    lastName: cased.slice(1).join(" "),
  };
}

/** Small seeded PRNG so pin positions are stable between renders and deploys. */
function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The vendor CSV has no addresses, so each agent gets a stable pseudo-location inside the
 * market's pin area, weighted toward the centre. Replace with real geocoding when the feed has it.
 */
function coordsForAgent(seed: string, market: Market): { lat: number; lng: number } {
  const rand = seededRandom(seed);
  const angle = rand() * Math.PI * 2;
  const frac = (rand() + rand()) / 2; // triangular: denser toward the middle
  const [ns, ew] = market.spreadKm;

  return {
    lat: market.center[0] + (ns * frac * Math.sin(angle)) / KM_PER_DEG_LAT,
    lng: market.center[1] + (ew * frac * Math.cos(angle)) / kmPerDegLng(market.center[0]),
  };
}

export function parseAgentsCsv(csvText: string, marketId: MarketId): Agent[] {
  const market = getMarket(marketId);
  const parsed = Papa.parse<RawRow>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  const agents: Agent[] = [];
  const emailCounts = new Map<string, number>();

  parsed.data.forEach((row, index) => {
    const vendorName = repairText((row["Agent Name"] ?? "").trim());
    if (!vendorName) return;

    const license = (row["State License"] ?? "").trim();
    const email = (row.Email ?? "").trim().toLowerCase();
    const seed = `${marketId}:${license || email || vendorName}:${index}`;
    const { lat, lng } = coordsForAgent(seed, market);
    if (email) emailCounts.set(email, (emailCounts.get(email) ?? 0) + 1);

    agents.push({
      id: seed,
      ...cleanName(vendorName),
      vendorName,
      email,
      phone: (row.Phone ?? "").trim(),
      license,
      sellSide: toNumber(row["Sell-Side Transactions"]),
      buySide: toNumber(row["Buy-Side Transactions"]),
      total: toNumber(row["Total Transactions"]),
      zipsActive: toNumber(row["Zips Active"]),
      firstTransaction: (row["First Transaction"] ?? "").trim(),
      lastTransaction: (row["Last Transaction"] ?? "").trim(),
      sharedEmail: false,
      marketId,
      city: market.city,
      state: market.state,
      zip: market.zip,
      lat,
      lng,
    });
  });

  for (const agent of agents) {
    agent.sharedEmail = !!agent.email && (emailCounts.get(agent.email) ?? 0) > 1;
  }

  return agents;
}

/* ───────────── dates ───────────── */

/** "Today" for recency math is the newest transaction in the vendor file, not the wall clock. */
export function dataThrough(agents: Agent[]): string {
  let max = "";
  for (const a of agents) if (a.lastTransaction > max) max = a.lastTransaction;
  return max;
}

function shiftDate(iso: string, days: number): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function formatDate(value: string, withYear = true): string {
  if (!value) return "—";
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: withYear ? "numeric" : undefined,
    timeZone: "UTC",
  });
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function formatPhone(phone: string): string {
  return phone || "No phone";
}

/* ───────────── filtering ───────────── */

export const DEFAULT_FILTERS: AgentFilters = {
  query: "",
  minTotal: 0,
  maxTotal: 0,
  minSell: 0,
  minBuy: 0,
  minZips: 0,
  sideFocus: "all",
  recency: "any",
  hasPhone: false,
  firstFrom: "",
  firstTo: "",
  lastFrom: "",
  lastTo: "",
  sort: "total-desc",
};

export function sideOf(agent: Agent): "sell" | "buy" | "balanced" {
  // 60/40 or stronger counts as a lean; anything closer is "balanced".
  const share = agent.total > 0 ? agent.sellSide / agent.total : 0.5;
  if (share >= 0.6) return "sell";
  if (share <= 0.4) return "buy";
  return "balanced";
}

function inDateRange(value: string, from: string, to: string): boolean {
  if (!from && !to) return true;
  if (!value) return false;
  if (from && value < from) return false;
  if (to && value > to) return false;
  return true;
}

export function filterAgents(
  agents: Agent[],
  filters: AgentFilters,
  through: string,
): Agent[] {
  const q = filters.query.trim().toLowerCase();
  const digits = q.replace(/\D/g, "");
  const recencyCutoff =
    filters.recency === "any" ? "" : shiftDate(through, Number(filters.recency));

  const filtered = agents.filter((agent) => {
    if (agent.total < filters.minTotal) return false;
    if (filters.maxTotal > 0 && agent.total > filters.maxTotal) return false;
    if (agent.sellSide < filters.minSell) return false;
    if (agent.buySide < filters.minBuy) return false;
    if (agent.zipsActive < filters.minZips) return false;
    if (filters.hasPhone && !agent.phone) return false;

    if (filters.sideFocus !== "all" && sideOf(agent) !== filters.sideFocus) return false;
    if (recencyCutoff && agent.lastTransaction < recencyCutoff) return false;

    if (!inDateRange(agent.firstTransaction, filters.firstFrom, filters.firstTo)) return false;
    if (!inDateRange(agent.lastTransaction, filters.lastFrom, filters.lastTo)) return false;

    if (!q) return true;

    return (
      agent.name.toLowerCase().includes(q) ||
      agent.vendorName.toLowerCase().includes(q) ||
      agent.email.includes(q) ||
      agent.license.toLowerCase().includes(q) ||
      (digits.length >= 3 && agent.phone.replace(/\D/g, "").includes(digits))
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

/* ───────────── active filter chips ───────────── */

const RECENCY_LABEL: Record<RecencyWindow, string> = {
  any: "Any time",
  "30": "Last 30 days",
  "90": "Last 90 days",
  "180": "Last 6 months",
  "365": "Last 12 months",
};
export const RECENCY_OPTIONS = (Object.keys(RECENCY_LABEL) as RecencyWindow[]).map((value) => ({
  value,
  label: RECENCY_LABEL[value],
}));

export interface ActiveFilter {
  id: string;
  label: string;
  reset: Partial<AgentFilters>;
}

export function activeFilters(f: AgentFilters): ActiveFilter[] {
  const out: ActiveFilter[] = [];
  const D = DEFAULT_FILTERS;
  if (f.query.trim()) out.push({ id: "query", label: `“${f.query.trim()}”`, reset: { query: "" } });
  if (f.minTotal !== D.minTotal || f.maxTotal !== D.maxTotal) {
    const hi = f.maxTotal > 0 ? `–${f.maxTotal}` : "+";
    out.push({
      id: "total",
      label: `${f.minTotal}${hi} transactions`,
      reset: { minTotal: D.minTotal, maxTotal: D.maxTotal },
    });
  }
  if (f.sideFocus !== D.sideFocus) {
    const label = { sell: "Sell-heavy", buy: "Buy-heavy", balanced: "Balanced", all: "All" }[f.sideFocus];
    out.push({ id: "side", label, reset: { sideFocus: D.sideFocus } });
  }
  if (f.recency !== D.recency) {
    out.push({ id: "recency", label: `Active: ${RECENCY_LABEL[f.recency].toLowerCase()}`, reset: { recency: D.recency } });
  }
  if (f.minZips > 0) out.push({ id: "zips", label: `${f.minZips}+ ZIPs`, reset: { minZips: 0 } });
  if (f.hasPhone) out.push({ id: "phone", label: "Has phone", reset: { hasPhone: false } });
  if (f.minSell > 0) out.push({ id: "minSell", label: `${f.minSell}+ sell-side`, reset: { minSell: 0 } });
  if (f.minBuy > 0) out.push({ id: "minBuy", label: `${f.minBuy}+ buy-side`, reset: { minBuy: 0 } });
  if (f.firstFrom || f.firstTo) {
    out.push({
      id: "first",
      label: `First txn ${f.firstFrom ? formatDate(f.firstFrom) : "…"} → ${f.firstTo ? formatDate(f.firstTo) : "…"}`,
      reset: { firstFrom: "", firstTo: "" },
    });
  }
  if (f.lastFrom || f.lastTo) {
    out.push({
      id: "last",
      label: `Last txn ${f.lastFrom ? formatDate(f.lastFrom) : "…"} → ${f.lastTo ? formatDate(f.lastTo) : "…"}`,
      reset: { lastFrom: "", lastTo: "" },
    });
  }
  return out;
}

export function describeFilters(f: AgentFilters): string {
  const parts = activeFilters(f).map((a) => a.label);
  return parts.length ? parts.join(", ") : "No filters";
}

/* ───────────── summaries ───────────── */

export interface AgentStats {
  count: number;
  transactions: number;
  sell: number;
  buy: number;
  recent90: number;
  withPhone: number;
}

export function summarize(agents: Agent[], through: string): AgentStats {
  const cutoff = shiftDate(through, 90);
  const stats: AgentStats = { count: agents.length, transactions: 0, sell: 0, buy: 0, recent90: 0, withPhone: 0 };
  for (const a of agents) {
    stats.transactions += a.total;
    stats.sell += a.sellSide;
    stats.buy += a.buySide;
    if (a.lastTransaction >= cutoff) stats.recent90 += 1;
    if (a.phone) stats.withPhone += 1;
  }
  return stats;
}

/* ───────────── export ───────────── */

function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return phone;
}

export interface ExportPlan {
  agents: Agent[];
  skippedShared: number;
  skippedNoPhone: number;
}

export function planExport(agents: Agent[], options: ExportOptions): ExportPlan {
  let skippedShared = 0;
  let skippedNoPhone = 0;
  const kept = agents.filter((a) => {
    if (options.skipSharedEmail && a.sharedEmail) {
      skippedShared += 1;
      return false;
    }
    if (options.requirePhone && !a.phone) {
      skippedNoPhone += 1;
      return false;
    }
    return true;
  });
  return { agents: kept, skippedShared, skippedNoPhone };
}

export function buildCsv(agents: Agent[], market: Market, options: ExportOptions, isoDate: string): string {
  if (options.format === "ghl") {
    const tags = options.tagMarket
      ? ["agentmatch", `${market.city}-${market.state}`.toLowerCase(), market.scopeLabel.toLowerCase().replace(/\s+/g, "-"), isoDate].join(",")
      : "agentmatch";
    return Papa.unparse({
      fields: ["First Name", "Last Name", "Email", "Phone", "Tags", "City", "State"],
      data: agents.map((a) => [a.firstName, a.lastName, a.email, a.phone ? toE164(a.phone) : "", tags, a.city, a.state]),
    });
  }

  return Papa.unparse({
    fields: [
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
      "Market",
    ],
    data: agents.map((a) => [
      a.name,
      a.email,
      a.phone,
      a.license,
      a.sellSide,
      a.buySide,
      a.total,
      a.zipsActive,
      a.firstTransaction,
      a.lastTransaction,
      a.city,
      a.state,
      a.zip ?? "",
      market.label,
    ]),
  });
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
