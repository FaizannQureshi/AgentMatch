"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  activeFilters,
  DEFAULT_FILTERS,
  dataThrough,
  describeFilters,
  filterAgents,
  summarize,
} from "@/lib/agents";
import { DEFAULT_MARKET_ID, getMarket } from "@/lib/markets";
import type { ActivityRecord, Agent, AgentFilters, GhlSession, MarketId } from "@/lib/types";
import AgentList from "./AgentList";
import ExportDialog from "./ExportDialog";
import FilterPanel from "./FilterPanel";
import Header from "./Header";
import HistoryDrawer from "./HistoryDrawer";
import { DownloadIcon, SlidersIcon } from "./Icons";
import MapPanel from "./MapPanel";
import StatsStrip from "./StatsStrip";

const EMPTY: Agent[] = [];

export default function AgentDirectory({
  session,
  agentsByMarket,
}: {
  session: GhlSession;
  agentsByMarket: Record<MarketId, Agent[]>;
}) {
  const [marketId, setMarketId] = useState<MarketId>(DEFAULT_MARKET_ID);
  const [filters, setFilters] = useState<AgentFilters>(DEFAULT_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [mobileView, setMobileView] = useState<"list" | "map">("list");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [desktopFiltersOpen, setDesktopFiltersOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [activity, setActivity] = useState<ActivityRecord[]>([]);

  useEffect(() => {
    fetch("/api/activity")
      .then((res) => (res.ok ? res.json() : { records: [] }))
      .then((data: { records?: ActivityRecord[] }) => setActivity(data.records ?? []))
      .catch(() => setActivity([]));
  }, []);

  const market = getMarket(marketId);
  const agents = agentsByMarket[marketId] ?? EMPTY;
  const through = useMemo(() => dataThrough(agents), [agents]);

  const filtered = useMemo(() => filterAgents(agents, filters, through), [agents, filters, through]);
  const stats = useMemo(() => summarize(filtered, through), [filtered, through]);

  const selected = useMemo(
    () => (selectedId ? (filtered.find((a) => a.id === selectedId) ?? null) : null),
    [filtered, selectedId],
  );

  const selectedInView = useMemo(
    () => filtered.filter((a) => selectedIds.has(a.id)),
    [filtered, selectedIds],
  );
  const exportSource = selectedInView.length > 0 ? selectedInView : filtered;
  const exportScope =
    selectedInView.length > 0
      ? `${selectedInView.length.toLocaleString()} selected`
      : describeFilters(filters) === "No filters"
        ? "All agents"
        : describeFilters(filters);

  const changeMarket = useCallback((id: MarketId) => {
    setMarketId(id);
    setSelectedId(null);
    setSelectedIds(new Set());
  }, []);

  const patchFilters = useCallback(
    (patch: Partial<AgentFilters>) => setFilters((prev) => ({ ...prev, ...patch })),
    [],
  );

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(
    (checked: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const a of filtered) {
          if (checked) next.add(a.id);
          else next.delete(a.id);
        }
        return next;
      });
    },
    [filtered],
  );

  const pickAgent = useCallback((id: string | null) => {
    setSelectedId(id);
  }, []);

  const activeCount = activeFilters(filters).length;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-ink">
      <Header
        market={market}
        onMarketChange={changeMarket}
        through={through}
        exportCount={activity.length}
        locationName={session.locationName}
        onOpenHistory={() => setHistoryOpen(true)}
      />
      <StatsStrip stats={stats} total={agents.length} />

      {/* Small screens: switch between list and map */}
      <div className="flex shrink-0 items-center gap-2 border-b border-line bg-surface px-4 py-2.5 lg:hidden">
        <div className="flex flex-1 rounded-[10px] bg-sunken p-[3px] text-sm font-semibold" role="group" aria-label="View">
          {(["list", "map"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={mobileView === v}
              onClick={() => setMobileView(v)}
              className={`h-9 flex-1 rounded-lg transition ${
                mobileView === v ? "bg-tint text-ink shadow-sm" : "text-muted"
              }`}
            >
              {v === "list" ? `List · ${filtered.length.toLocaleString()}` : "Map"}
            </button>
          ))}
        </div>
        {mobileView === "list" && (
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            className="flex h-11 items-center gap-1.5 rounded-[10px] border border-field bg-surface px-3.5 text-sm font-semibold"
          >
            <SlidersIcon /> Filters
            {activeCount > 0 && (
              <span className="rounded-full bg-brand px-1.5 text-[11px] font-semibold text-white">{activeCount}</span>
            )}
          </button>
        )}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(380px,480px)_1fr]">
        <section
          aria-label="Agent list"
          className={`min-h-0 min-w-0 flex-col border-r border-line bg-surface ${
            mobileView === "list" ? "flex" : "hidden lg:flex"
          }`}
        >
          <FilterPanel
            filters={filters}
            onChange={patchFilters}
            onReset={() => setFilters(DEFAULT_FILTERS)}
            matchCount={filtered.length}
            mobileOpen={filtersOpen}
            desktopOpen={desktopFiltersOpen}
            onToggleDesktop={() => setDesktopFiltersOpen((v) => !v)}
          />
          <AgentList
            agents={filtered}
            selectedId={selectedId}
            selectedIds={selectedIds}
            sort={filters.sort}
            onSort={(sort) => patchFilters({ sort })}
            onSelect={pickAgent}
            onToggle={toggleSelect}
            onToggleAll={toggleAll}
          />

          <div className="flex shrink-0 flex-col gap-2 border-t border-line bg-surface px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {selectedInView.length > 0 && (
              <div className="text-[13.5px] text-ink">
                <b>{selectedInView.length.toLocaleString()} selected</b>{" "}
                <span className="text-muted">of {filtered.length.toLocaleString()}</span>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="ml-2.5 text-[13px] text-muted underline hover:text-ink"
                >
                  Clear
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={() => setExporting(true)}
              disabled={exportSource.length === 0}
              className="flex h-[38px] w-full items-center justify-center gap-2 rounded-[9px] border border-ink bg-tint px-4 text-[13.5px] font-bold text-ink hover:bg-[#f7e9b8] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <DownloadIcon strokeWidth={2.4} />
              Export or import {exportSource.length.toLocaleString()}
            </button>
          </div>
        </section>

        <section
          aria-label="Map"
          className={`relative min-h-0 min-w-0 ${mobileView === "map" ? "block" : "hidden lg:block"}`}
        >
          <MapPanel
            agents={filtered}
            market={market}
            through={through}
            selected={selected}
            onSelect={(id) => {
              pickAgent(id);
            }}
          />
        </section>
      </div>

      {exporting && (
        <ExportDialog
          agents={exportSource}
          market={market}
          scopeLabel={exportScope}
          filterSummary={selectedInView.length > 0 ? describeFilters(filters) : "No filters"}
          onLogged={(record) => setActivity((prev) => [record, ...prev])}
          onClose={() => setExporting(false)}
        />
      )}
      {historyOpen && <HistoryDrawer records={activity} onClose={() => setHistoryOpen(false)} />}
    </div>
  );
}
