import type { Market } from "./types";

export const MARKETS: Market[] = [
  {
    id: "tampa-citywide",
    label: "Tampa · City-wide",
    scopeLabel: "City-wide",
    city: "Tampa",
    state: "FL",
    stateName: "Florida",
    filename: "tampa_agents_city-wide.csv",
    // Shifted east of downtown so the pin cloud sits on land, not in Tampa Bay.
    center: [28.0, -82.43],
    spreadKm: [14, 11],
  },
  {
    id: "tampa-33647",
    label: "Tampa · ZIP 33647",
    scopeLabel: "ZIP 33647",
    city: "Tampa",
    state: "FL",
    stateName: "Florida",
    zip: "33647",
    filename: "tampa_agents_33647.csv",
    center: [28.151887, -82.318179],
    spreadKm: [4.5, 4.5],
  },
];

export const DEFAULT_MARKET_ID = MARKETS[0].id;

export function getMarket(id: string): Market {
  return MARKETS.find((m) => m.id === id) ?? MARKETS[0];
}

export interface StateGroup {
  code: string;
  name: string;
  cities: { name: string; markets: Market[] }[];
}

/** State → city → markets, built from MARKETS so new vendor files appear automatically. */
export function marketTree(): StateGroup[] {
  const states = new Map<string, StateGroup>();
  for (const m of MARKETS) {
    let state = states.get(m.state);
    if (!state) {
      state = { code: m.state, name: m.stateName, cities: [] };
      states.set(m.state, state);
    }
    let city = state.cities.find((c) => c.name === m.city);
    if (!city) {
      city = { name: m.city, markets: [] };
      state.cities.push(city);
    }
    city.markets.push(m);
  }
  return [...states.values()];
}

const KM_PER_DEG_LAT = 110.574;

function kmPerDegLng(lat: number) {
  return 111.32 * Math.cos((lat * Math.PI) / 180);
}

/** Outline of a market's approximate pin area (an ellipse), for drawing on the map. */
export function marketOutline(market: Market, steps = 72): [number, number][] {
  const [ns, ew] = market.spreadKm;
  const points: [number, number][] = [];
  for (let i = 0; i < steps; i += 1) {
    const t = (i / steps) * Math.PI * 2;
    points.push([
      market.center[0] + (ns * Math.sin(t)) / KM_PER_DEG_LAT,
      market.center[1] + (ew * Math.cos(t)) / kmPerDegLng(market.center[0]),
    ]);
  }
  return points;
}

export { KM_PER_DEG_LAT, kmPerDegLng };
