"use client";

import { useState } from "react";
import { activeFilters, DEFAULT_FILTERS, RECENCY_OPTIONS } from "@/lib/agents";
import type { AgentFilters, RecencyWindow, SideFocus } from "@/lib/types";
import { ChevronDown, CloseIcon, SearchIcon, SlidersIcon } from "./Icons";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-[#4a5a53]">{label}</span>
      {children}
    </label>
  );
}

function NumberInput({
  value,
  onChange,
  placeholder = "Any",
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  placeholder?: string;
  label: string;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      aria-label={label}
      value={value || ""}
      placeholder={placeholder}
      onChange={(e) => onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
      className="am-field"
    />
  );
}

export default function FilterPanel({
  filters,
  onChange,
  onReset,
  matchCount,
  mobileOpen,
  desktopOpen,
  onToggleDesktop,
}: {
  filters: AgentFilters;
  onChange: (patch: Partial<AgentFilters>) => void;
  onReset: () => void;
  matchCount: number;
  mobileOpen: boolean;
  desktopOpen: boolean;
  onToggleDesktop: () => void;
}) {
  const [more, setMore] = useState(false);
  const chips = activeFilters(filters);
  const dirty = chips.length > 0 || filters.sort !== DEFAULT_FILTERS.sort;

  return (
    <div className="flex shrink-0 flex-col gap-3 border-b border-soft p-4 lg:px-5">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <SearchIcon width={18} height={18} className="absolute left-3 top-[11px] text-muted" />
          <label htmlFor="agent-search" className="sr-only">
            Search agents
          </label>
          <input
            id="agent-search"
            type="search"
            value={filters.query}
            onChange={(e) => onChange({ query: e.target.value })}
            placeholder="Search name, email, phone or license"
            className="h-11 w-full rounded-[10px] border border-field bg-sunken pl-[38px] pr-3 text-[15px] text-ink focus:bg-surface lg:h-10 lg:text-sm"
          />
        </div>
        <button
          type="button"
          onClick={onToggleDesktop}
          aria-expanded={desktopOpen}
          className="hidden h-10 shrink-0 items-center gap-1.5 rounded-[10px] border border-field bg-surface px-3 text-[13px] font-semibold hover:border-brand lg:flex"
        >
          <SlidersIcon />
          Filters
          {chips.length > 0 && (
            <span className="rounded-full bg-brand px-1.5 text-[11px] font-semibold text-white">{chips.length}</span>
          )}
          <ChevronDown width={14} height={14} className={desktopOpen ? "rotate-180" : ""} />
        </button>
      </div>

      <div
        className={`${mobileOpen ? "flex" : "hidden"} ${desktopOpen ? "lg:flex" : "lg:hidden"} am-scroll max-h-[min(42vh,360px)] flex-col gap-3 overflow-y-auto`}
      >
        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
          <Field label="Transactions">
            <div className="flex items-center gap-1.5">
              <NumberInput label="Minimum transactions" value={filters.minTotal} placeholder="Min" onChange={(n) => onChange({ minTotal: n })} />
              <span className="text-muted">–</span>
              <NumberInput label="Maximum transactions" value={filters.maxTotal} placeholder="Max" onChange={(n) => onChange({ maxTotal: n })} />
            </div>
          </Field>
          <Field label="Last transaction">
            <select
              value={filters.recency}
              onChange={(e) => onChange({ recency: e.target.value as RecencyWindow })}
              className="am-field"
            >
              {RECENCY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Side focus">
            <select
              value={filters.sideFocus}
              onChange={(e) => onChange({ sideFocus: e.target.value as SideFocus })}
              className="am-field"
            >
              <option value="all">All agents</option>
              <option value="sell">Sell-heavy (60%+ listings)</option>
              <option value="buy">Buy-heavy (60%+ buyers)</option>
              <option value="balanced">Balanced</option>
            </select>
          </Field>
          <Field label="ZIPs active (min)">
            <NumberInput label="Minimum ZIPs active" value={filters.minZips} placeholder="Any" onChange={(n) => onChange({ minZips: n })} />
          </Field>
        </div>

        <button
          type="button"
          onClick={() => setMore((v) => !v)}
          aria-expanded={more}
          className="flex items-center gap-1 self-start text-[13px] font-semibold text-brand hover:underline"
        >
          {more ? "Fewer filters" : "More filters (sell / buy counts, dates)"}
          <ChevronDown width={14} height={14} className={more ? "rotate-180" : ""} />
        </button>

        {more && (
          <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 rounded-xl border border-soft bg-sunken p-3">
            <Field label="Min sell-side">
              <NumberInput label="Minimum sell-side" value={filters.minSell} onChange={(n) => onChange({ minSell: n })} />
            </Field>
            <Field label="Min buy-side">
              <NumberInput label="Minimum buy-side" value={filters.minBuy} onChange={(n) => onChange({ minBuy: n })} />
            </Field>
            <Field label="First txn from">
              <input type="date" value={filters.firstFrom} onChange={(e) => onChange({ firstFrom: e.target.value })} className="am-field" />
            </Field>
            <Field label="First txn to">
              <input type="date" value={filters.firstTo} onChange={(e) => onChange({ firstTo: e.target.value })} className="am-field" />
            </Field>
            <Field label="Last txn from">
              <input type="date" value={filters.lastFrom} onChange={(e) => onChange({ lastFrom: e.target.value })} className="am-field" />
            </Field>
            <Field label="Last txn to">
              <input type="date" value={filters.lastTo} onChange={(e) => onChange({ lastTo: e.target.value })} className="am-field" />
            </Field>
          </div>
        )}
      </div>

      {(chips.length > 0 || dirty) && (
        <div className="flex flex-wrap items-center gap-1.5" aria-live="polite">
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => onChange(chip.reset)}
              aria-label={`Remove filter: ${chip.label}`}
              className="flex h-7 items-center gap-1 rounded-full bg-tint pl-2.5 pr-1.5 text-xs font-semibold text-brand-deep hover:bg-[#d7ebe4]"
            >
              {chip.label}
              <CloseIcon width={12} height={12} strokeWidth={2.5} />
            </button>
          ))}
          <button type="button" onClick={onReset} className="ml-auto text-[13px] text-muted underline-offset-2 hover:text-ink hover:underline">
            Reset all
          </button>
        </div>
      )}
      <span className="sr-only" aria-live="polite">{matchCount.toLocaleString()} agents match</span>
    </div>
  );
}
