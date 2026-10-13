export type MarketId = "tampa-33647" | "tampa-citywide";

export type SideFocus = "all" | "sell" | "buy" | "balanced";

export type RecencyWindow = "any" | "30" | "90" | "180" | "365";

export type SortKey =
  | "total-desc"
  | "total-asc"
  | "sell-desc"
  | "buy-desc"
  | "name-asc"
  | "last-desc"
  | "zips-desc";

export type MapColorMode = "side" | "volume" | "recency";

export interface Market {
  id: MarketId;
  /** Display label for the whole market, e.g. "Tampa · City-wide". */
  label: string;
  /** Short label for the scope toggle, e.g. "City-wide" or "ZIP 33647". */
  scopeLabel: string;
  city: string;
  state: string;
  stateName: string;
  zip?: string;
  filename: string;
  center: [number, number];
  /** Half-extent of the approximate pin area in km: [north–south, east–west]. */
  spreadKm: [number, number];
}

export interface Agent {
  id: string;
  /** Cleaned, proper-case display name (no "PA"/"LLC" suffixes). */
  name: string;
  firstName: string;
  lastName: string;
  /** Name exactly as the vendor supplied it (accent damage repaired only). */
  vendorName: string;
  email: string;
  phone: string;
  license: string;
  sellSide: number;
  buySide: number;
  total: number;
  zipsActive: number;
  firstTransaction: string;
  lastTransaction: string;
  /** True when another agent in the same market uses this exact email. */
  sharedEmail: boolean;
  marketId: MarketId;
  city: string;
  state: string;
  zip?: string;
  lat: number;
  lng: number;
}

export interface AgentFilters {
  query: string;
  minTotal: number;
  /** 0 = no upper bound. */
  maxTotal: number;
  minSell: number;
  minBuy: number;
  minZips: number;
  sideFocus: SideFocus;
  recency: RecencyWindow;
  hasPhone: boolean;
  firstFrom: string;
  firstTo: string;
  lastFrom: string;
  lastTo: string;
  sort: SortKey;
}

export type ExportFormat = "ghl" | "full";

export interface ExportOptions {
  format: ExportFormat;
  skipSharedEmail: boolean;
  requirePhone: boolean;
  tagMarket: boolean;
}

export interface ExportRecord {
  id: string;
  at: string;
  marketId: MarketId;
  marketLabel: string;
  stateCode: string;
  city: string;
  count: number;
  format: ExportFormat;
  filterSummary: string;
}
