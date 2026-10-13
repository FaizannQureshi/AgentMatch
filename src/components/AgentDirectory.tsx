"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  agentsToCsv,
  DEFAULT_FILTERS,
  downloadCsv,
  filterAgents,
} from "@/lib/agents";
import { MARKETS, getMarket } from "@/lib/markets";
import type { Agent, AgentFilters, MarketId, SideFocus, SortKey } from "@/lib/types";

const AgentMap = dynamic(() => import("./AgentMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-slate-100 text-sm text-slate-500">
      Loading map…
    </div>
  ),
});

function formatDate(value: string) {
  if (!value) return "—";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export default function AgentDirectory({
  agentsByMarket,
}: {
  agentsByMarket: Record<MarketId, Agent[]>;
}) {
  const [marketId, setMarketId] = useState<MarketId>("tampa-33647");
  const [filters, setFilters] = useState<AgentFilters>(DEFAULT_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "map">("list");
  const listRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const market = getMarket(marketId);
  const agents = agentsByMarket[marketId] ?? [];

  const filtered = useMemo(
    () => filterAgents(agents, filters),
    [agents, filters],
  );

  useEffect(() => {
    setSelectedId(null);
    setSelectedIds(new Set());
  }, [marketId]);

  useEffect(() => {
    if (!selectedId) return;
    const el = rowRefs.current.get(selectedId);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  function updateFilter<K extends keyof AgentFilters>(
    key: K,
    value: AgentFilters[K],
  ) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelectedIds(new Set(filtered.map((a) => a.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function exportAgents(source: Agent[]) {
    if (source.length === 0) return;
    const csv = agentsToCsv(source);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`agentmatch-${market.id}-${stamp}.csv`, csv);
  }

  const exportCount = selectedIds.size > 0 ? selectedIds.size : filtered.length;
  const exportSource =
    selectedIds.size > 0
      ? filtered.filter((a) => selectedIds.has(a.id))
      : filtered;

  return (
    <div className="flex h-dvh flex-col bg-[var(--am-bg)] text-[var(--am-ink)]">
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--am-border)] bg-white px-4 py-3 md:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--am-forest)] text-sm font-bold text-white">
            AM
          </div>
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight md:text-xl">
              AgentMatch
            </h1>
            <p className="text-xs text-slate-500">
              Real estate agent directory · Phase 1 prototype
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs lg:hidden">
            <button
              type="button"
              onClick={() => setMobileView("list")}
              className={`rounded-md px-2.5 py-1.5 ${
                mobileView === "list"
                  ? "bg-[var(--am-forest)] text-white"
                  : "text-slate-600"
              }`}
            >
              List
            </button>
            <button
              type="button"
              onClick={() => setMobileView("map")}
              className={`rounded-md px-2.5 py-1.5 ${
                mobileView === "map"
                  ? "bg-[var(--am-forest)] text-white"
                  : "text-slate-600"
              }`}
            >
              Map
            </button>
          </div>
          <div className="hidden items-center gap-2 text-xs text-slate-500 sm:flex">
            <span className="rounded-full bg-slate-100 px-2.5 py-1">
              {market.city}, {market.state}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1">
              {filtered.length.toLocaleString()} agents
            </span>
          </div>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(320px,440px)_1fr]">
        <section
          className={`min-h-0 flex-col border-r border-[var(--am-border)] bg-white ${
            mobileView === "list" ? "flex" : "hidden lg:flex"
          }`}
        >
          <div className="shrink-0 space-y-3 border-b border-[var(--am-border)] p-4">
            <div className="grid grid-cols-2 gap-2">
              {MARKETS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMarketId(m.id)}
                  className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                    marketId === m.id
                      ? "border-[var(--am-forest)] bg-[var(--am-mint)] text-[var(--am-forest)]"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }`}
                >
                  <span className="block font-medium">{m.label}</span>
                  <span className="block text-xs opacity-70">
                    {(agentsByMarket[m.id]?.length ?? 0).toLocaleString()} agents
                  </span>
                </button>
              ))}
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Search
              </span>
              <input
                type="search"
                value={filters.query}
                onChange={(e) => updateFilter("query", e.target.value)}
                placeholder="Name, email, phone, license…"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none ring-[var(--am-teal)] focus:bg-white focus:ring-2"
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-500">
                  Min total txns
                </span>
                <input
                  type="number"
                  min={0}
                  value={filters.minTotal}
                  onChange={(e) =>
                    updateFilter("minTotal", Number(e.target.value) || 0)
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--am-teal)]"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-500">
                  Side focus
                </span>
                <select
                  value={filters.sideFocus}
                  onChange={(e) =>
                    updateFilter("sideFocus", e.target.value as SideFocus)
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--am-teal)]"
                >
                  <option value="all">All</option>
                  <option value="sell">Sell-heavy</option>
                  <option value="buy">Buy-heavy</option>
                  <option value="balanced">Balanced</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-500">
                  Sort
                </span>
                <select
                  value={filters.sort}
                  onChange={(e) =>
                    updateFilter("sort", e.target.value as SortKey)
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--am-teal)]"
                >
                  <option value="total-desc">Total ↓</option>
                  <option value="total-asc">Total ↑</option>
                  <option value="sell-desc">Sell ↓</option>
                  <option value="buy-desc">Buy ↓</option>
                  <option value="zips-desc">Zips active ↓</option>
                  <option value="last-desc">Last txn ↓</option>
                  <option value="name-asc">Name A–Z</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-500">
                  Min zips active
                </span>
                <input
                  type="number"
                  min={0}
                  value={filters.minZips}
                  onChange={(e) =>
                    updateFilter("minZips", Number(e.target.value) || 0)
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--am-teal)]"
                />
              </label>
            </div>

            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="text-xs font-medium text-[var(--am-forest)] hover:underline"
            >
              {showAdvanced ? "Hide advanced filters" : "Show advanced filters"}
            </button>

            {showAdvanced && (
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-500">
                    Min sell-side
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={filters.minSell}
                    onChange={(e) =>
                      updateFilter("minSell", Number(e.target.value) || 0)
                    }
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-500">
                    Min buy-side
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={filters.minBuy}
                    onChange={(e) =>
                      updateFilter("minBuy", Number(e.target.value) || 0)
                    }
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-500">
                    First txn from
                  </span>
                  <input
                    type="date"
                    value={filters.firstFrom}
                    onChange={(e) => updateFilter("firstFrom", e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-500">
                    First txn to
                  </span>
                  <input
                    type="date"
                    value={filters.firstTo}
                    onChange={(e) => updateFilter("firstTo", e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-500">
                    Last txn from
                  </span>
                  <input
                    type="date"
                    value={filters.lastFrom}
                    onChange={(e) => updateFilter("lastFrom", e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-500">
                    Last txn to
                  </span>
                  <input
                    type="date"
                    value={filters.lastTo}
                    onChange={(e) => updateFilter("lastTo", e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setFilters(DEFAULT_FILTERS)}
                  className="col-span-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                >
                  Reset filters
                </button>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => exportAgents(exportSource)}
                disabled={exportCount === 0}
                className="rounded-lg bg-[var(--am-forest)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--am-forest-deep)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Export CSV ({exportCount.toLocaleString()})
              </button>
              <button
                type="button"
                onClick={selectAllVisible}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                Select all
              </button>
              {selectedIds.size > 0 && (
                <button
                  type="button"
                  onClick={clearSelection}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                >
                  Clear ({selectedIds.size})
                </button>
              )}
              <span
                className="ml-auto text-xs text-slate-400"
                title="Phase 2"
              >
                GHL import soon
              </span>
            </div>
          </div>

          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                No agents match these filters.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {filtered.map((agent) => {
                  const active = agent.id === selectedId;
                  const checked = selectedIds.has(agent.id);
                  return (
                    <li key={agent.id}>
                      <div
                        className={`flex gap-3 px-4 py-3 transition ${
                          active ? "bg-[var(--am-mint)]" : "hover:bg-slate-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSelect(agent.id)}
                          className="mt-3 h-4 w-4 accent-[var(--am-forest)]"
                          aria-label={`Select ${agent.name}`}
                        />
                        <button
                          type="button"
                          ref={(el) => {
                            if (el) rowRefs.current.set(agent.id, el);
                            else rowRefs.current.delete(agent.id);
                          }}
                          onClick={() => setSelectedId(agent.id)}
                          className="flex min-w-0 flex-1 gap-3 text-left"
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--am-forest)]/10 text-xs font-semibold text-[var(--am-forest)]">
                            {initials(agent.name)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="truncate font-medium leading-tight">
                                {agent.name}
                              </p>
                              <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-700">
                                {agent.total}
                              </span>
                            </div>
                            <p className="mt-0.5 truncate text-xs text-slate-500">
                              Lic #{agent.license || "—"}
                              {agent.phone ? ` · ${agent.phone}` : ""}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                              <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-800">
                                Sell {agent.sellSide}
                              </span>
                              <span className="rounded bg-sky-50 px-1.5 py-0.5 text-sky-800">
                                Buy {agent.buySide}
                              </span>
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">
                                {agent.zipsActive} zips
                              </span>
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">
                                Last {formatDate(agent.lastTransaction)}
                              </span>
                            </div>
                          </div>
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <section
          className={`relative min-h-0 ${
            mobileView === "map" ? "block" : "hidden lg:block"
          }`}
        >
          <AgentMap
            agents={filtered}
            market={market}
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
              setMobileView("list");
            }}
          />
          <div className="pointer-events-none absolute bottom-4 left-4 max-w-[240px] rounded-lg bg-white/95 px-3 py-2 text-xs text-slate-600 shadow-sm ring-1 ring-slate-200">
            Pins are approximate market locations (CSV has no lat/lng yet).
            {filtered.length > 800
              ? ` Showing 800 of ${filtered.length.toLocaleString()} on map.`
              : null}
          </div>
        </section>
      </div>
    </div>
  );
}
