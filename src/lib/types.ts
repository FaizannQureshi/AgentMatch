export type MarketId = "tampa-33647" | "tampa-citywide";

export type SideFocus = "all" | "sell" | "buy" | "balanced";

export type SortKey =
  | "total-desc"
  | "total-asc"
  | "sell-desc"
  | "buy-desc"
  | "name-asc"
  | "last-desc"
  | "zips-desc";

export interface Market {
  id: MarketId;
  label: string;
  city: string;
  state: string;
  zip?: string;
  filename: string;
  center: [number, number];
  spreadKm: number;
}

export interface Agent {
  id: string;
  name: string;
  email: string;
  phone: string;
  license: string;
  sellSide: number;
  buySide: number;
  total: number;
  zipsActive: number;
  firstTransaction: string;
  lastTransaction: string;
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
  minSell: number;
  minBuy: number;
  minZips: number;
  sideFocus: SideFocus;
  firstFrom: string;
  firstTo: string;
  lastFrom: string;
  lastTo: string;
  sort: SortKey;
}
