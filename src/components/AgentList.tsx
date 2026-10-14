"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { formatDate, initials } from "@/lib/agents";
import type { Agent, SortKey } from "@/lib/types";

const PAGE = 60;

const AgentRow = memo(function AgentRow({
  agent,
  active,
  checked,
  onSelect,
  onToggle,
  register,
}: {
  agent: Agent;
  active: boolean;
  checked: boolean;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  register: (id: string, el: HTMLElement | null) => void;
}) {
  const heads = agent.sellSide + agent.buySide;
  const sellPct = heads ? (agent.sellSide / heads) * 100 : 50;

  return (
    <li
      ref={(el) => register(agent.id, el)}
      className={`flex gap-3 border-b border-soft border-l-[3px] py-3.5 pl-[17px] pr-5 transition-colors ${
        active ? "border-l-brand bg-tint" : "border-l-transparent hover:bg-sunken"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onToggle(agent.id)}
        className="mt-3.5 h-4 w-4 shrink-0 accent-brand lg:h-4 lg:w-4"
        aria-label={`Select ${agent.name}`}
      />
      <button
        type="button"
        onClick={() => onSelect(agent.id)}
        aria-current={active}
        className="flex min-w-0 flex-1 gap-3 text-left"
      >
        <div
          className={`hidden h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-bold sm:flex ${
            active ? "bg-tint text-ink" : "bg-sunken text-ink2"
          }`}
        >
          {initials(agent.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-[15px] font-bold leading-tight">{agent.name}</p>
            <p className="shrink-0 text-xl font-bold leading-none">
              {agent.total}
              <span className="ml-0.5 text-[11px] font-medium text-muted">txns</span>
            </p>
          </div>
          <p className="mt-1 flex items-center gap-2 truncate text-[12.5px] text-muted">
            <span className="truncate">
              {agent.email || "No email"}
              {agent.phone ? ` · ${agent.phone}` : ""}
            </span>
            {agent.sharedEmail && (
              <span
                className="shrink-0 rounded bg-tint px-1.5 py-px text-[10.5px] font-bold tracking-wide text-[var(--am-warn-ink)]"
                title="Another agent in this market uses the same email. A CRM import may merge them into one contact."
              >
                SHARED EMAIL
              </span>
            )}
          </p>
          <div
            className="mt-2.5 flex h-1.5 overflow-hidden rounded-full bg-buy"
            role="img"
            aria-label={`${agent.sellSide} sell-side, ${agent.buySide} buy-side`}
          >
            <div className="bg-sell" style={{ width: `${sellPct}%` }} />
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3.5 gap-y-0.5 text-xs text-ink2">
            <span>
              <b className="text-ink">{agent.sellSide}</b> sell
            </span>
            <span>
              <b className="text-gold">{agent.buySide}</b> buy
            </span>
            <span>
              {agent.zipsActive} ZIP{agent.zipsActive === 1 ? "" : "s"}
            </span>
            <span className="ml-auto text-muted">Last {formatDate(agent.lastTransaction)}</span>
          </div>
        </div>
      </button>
    </li>
  );
});

export default function AgentList({
  agents,
  selectedId,
  selectedIds,
  sort,
  onSort,
  onSelect,
  onToggle,
  onToggleAll,
}: {
  agents: Agent[];
  selectedId: string | null;
  selectedIds: Set<string>;
  sort: SortKey;
  onSort: (s: SortKey) => void;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onToggleAll: (checked: boolean) => void;
}) {
  const [shown, setShown] = useState(PAGE);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLLIElement>(null);
  const rowRefs = useRef<Map<string, HTMLElement>>(new Map());
  const allRef = useRef<HTMLInputElement>(null);
  const [prevAgents, setPrevAgents] = useState(agents);

  // New result set → back to the first page and the top of the list.
  if (prevAgents !== agents) {
    setPrevAgents(agents);
    setShown(PAGE);
  }
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [agents]);

  // Grow the rendered window as the user nears the bottom.
  useEffect(() => {
    const node = sentinelRef.current;
    const root = scrollRef.current;
    if (!node || !root) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setShown((n) => n + PAGE);
      },
      { root, rootMargin: "400px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [agents, shown]);

  // Bring a map-selected agent into view, rendering more rows first if needed.
  const [prevSelected, setPrevSelected] = useState(selectedId);
  if (prevSelected !== selectedId) {
    setPrevSelected(selectedId);
    const idx = selectedId ? agents.findIndex((a) => a.id === selectedId) : -1;
    if (idx >= shown) setShown(idx + 20);
  }
  useEffect(() => {
    if (!selectedId) return;
    rowRefs.current.get(selectedId)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId, shown]);

  const selectedInView = agents.reduce((n, a) => n + (selectedIds.has(a.id) ? 1 : 0), 0);
  const allChecked = agents.length > 0 && selectedInView === agents.length;
  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = selectedInView > 0 && !allChecked;
  }, [selectedInView, allChecked]);

  const register = useCallback((id: string, el: HTMLElement | null) => {
    if (el) rowRefs.current.set(id, el);
    else rowRefs.current.delete(id);
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-soft bg-sunken px-5">
        <input
          ref={allRef}
          type="checkbox"
          checked={allChecked}
          disabled={agents.length === 0}
          onChange={(e) => onToggleAll(e.target.checked)}
          className="h-4 w-4 accent-brand"
          aria-label={`Select all ${agents.length} matching agents`}
        />
        <div className="whitespace-nowrap text-[13px]">
          <b>{agents.length.toLocaleString()}</b> agents match
        </div>
        <div className="flex-1" />
        <label htmlFor="sort" className="hidden text-[12.5px] text-muted sm:block">
          Sort
        </label>
        <select
          id="sort"
          value={sort}
          onChange={(e) => onSort(e.target.value as SortKey)}
          className="h-[30px] min-w-0 rounded-lg border border-field bg-surface px-2 text-[13px]"
        >
          <option value="total-desc">Most transactions</option>
          <option value="total-asc">Fewest transactions</option>
          <option value="sell-desc">Most sell-side</option>
          <option value="buy-desc">Most buy-side</option>
          <option value="zips-desc">Most ZIPs active</option>
          <option value="last-desc">Most recent</option>
          <option value="name-asc">Name A–Z</option>
        </select>
      </div>

      <div ref={scrollRef} className="am-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {agents.length === 0 ? (
          <div className="px-8 py-14 text-center">
            <p className="font-semibold">No agents match these filters</p>
            <p className="mt-1 text-sm text-muted">Try removing a filter chip or resetting all filters.</p>
          </div>
        ) : (
          <ul>
            {agents.slice(0, shown).map((agent) => (
              <AgentRow
                key={agent.id}
                agent={agent}
                active={agent.id === selectedId}
                checked={selectedIds.has(agent.id)}
                onSelect={onSelect}
                onToggle={onToggle}
                register={register}
              />
            ))}
            {shown < agents.length && (
              <li ref={sentinelRef} className="py-4 text-center text-xs text-muted">
                Showing {shown.toLocaleString()} of {agents.length.toLocaleString()}…
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
