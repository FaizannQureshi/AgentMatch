"use client";

import { formatDate } from "@/lib/agents";
import { marketTree } from "@/lib/markets";
import type { Market, MarketId } from "@/lib/types";
import { ChevronDown, ClockIcon } from "./Icons";

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="relative block">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 appearance-none rounded-lg border border-line bg-surface pl-3 pr-8 text-[13px] font-semibold text-ink hover:border-field"
      >
        {children}
      </select>
      <ChevronDown
        width={12}
        height={12}
        strokeWidth={2.5}
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted"
      />
    </label>
  );
}

export default function Header({
  market,
  onMarketChange,
  through,
  exportCount,
  locationName,
  onOpenHistory,
}: {
  market: Market;
  onMarketChange: (id: MarketId) => void;
  through: string;
  exportCount: number;
  locationName: string;
  onOpenHistory: () => void;
}) {
  const tree = marketTree();
  const state = tree.find((s) => s.code === market.state) ?? tree[0];
  const city = state.cities.find((c) => c.name === market.city) ?? state.cities[0];

  return (
    <header className="shrink-0 border-b border-line bg-surface">
      <div className="flex items-center gap-3 px-4 py-3 lg:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-brand text-[12px] font-bold tracking-wide text-white">
            AI
          </div>
          <div className="min-w-0">
            <div className="truncate text-[17px] font-semibold leading-tight tracking-tight lg:text-[19px]">
              AI Partnership Platform
            </div>
            <div className="mt-0.5 truncate text-[12px] leading-snug text-muted">
              {locationName ? `${locationName} · ` : ""}
              Vendor data through {formatDate(through)}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenHistory}
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-[13px] font-semibold leading-none hover:border-field"
        >
          <ClockIcon />
          <span className="hidden sm:inline">Export history</span>
          {exportCount > 0 && (
            <span className="rounded-full bg-brand px-1.5 text-[11px] font-semibold leading-none text-white">
              {exportCount}
            </span>
          )}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-soft bg-surface px-4 py-2.5 lg:px-6">
        <Select
          label="State"
          value={state.code}
          onChange={(code) => {
            const s = tree.find((x) => x.code === code);
            const first = s?.cities[0]?.markets[0];
            if (first) onMarketChange(first.id);
          }}
        >
          {tree.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name} ({s.code})
            </option>
          ))}
        </Select>
        <Select
          label="City"
          value={city.name}
          onChange={(name) => {
            const c = state.cities.find((x) => x.name === name);
            if (c) onMarketChange(c.markets[0].id);
          }}
        >
          {state.cities.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </Select>
        <div
          role="group"
          aria-label="Market scope"
          className="flex rounded-[9px] bg-sunken p-[3px] text-[13px] font-semibold"
        >
          {city.markets.map((m) => {
            const on = m.id === market.id;
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={on}
                onClick={() => onMarketChange(m.id)}
                className={`h-[30px] whitespace-nowrap rounded-[7px] px-3 leading-none transition ${
                  on ? "bg-tint text-ink shadow-sm" : "text-muted hover:text-ink"
                }`}
              >
                {m.scopeLabel}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
}
