import type { Market } from "./types";

export const MARKETS: Market[] = [
  {
    id: "tampa-33647",
    label: "Tampa · 33647",
    city: "Tampa",
    state: "FL",
    zip: "33647",
    filename: "tampa_agents_33647.csv",
    center: [28.151887, -82.318179],
    spreadKm: 4.5,
  },
  {
    id: "tampa-citywide",
    label: "Tampa · City-wide",
    city: "Tampa",
    state: "FL",
    filename: "tampa_agents_city-wide.csv",
    center: [27.9506, -82.4572],
    spreadKm: 18,
  },
];

export function getMarket(id: string): Market {
  return MARKETS.find((m) => m.id === id) ?? MARKETS[0];
}
