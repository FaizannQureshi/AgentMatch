"use client";

import dynamic from "next/dynamic";
import { useDeferredValue, useState } from "react";
import { formatDate } from "@/lib/agents";
import type { Agent, MapColorMode, Market } from "@/lib/types";
import { CloseIcon } from "./Icons";

const AgentMap = dynamic(() => import("./AgentMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-[#eaf0ec] text-sm text-muted">Loading map…</div>
  ),
});

const MODES: { id: MapColorMode; label: string }[] = [
  { id: "side", label: "Side focus" },
  { id: "volume", label: "Volume" },
  { id: "recency", label: "Recency" },
];

const LEGENDS: Record<MapColorMode, { color: string; label: string }[]> = {
  side: [
    { color: "#0f7b6c", label: "Sell-heavy" },
    { color: "#2f5fd0", label: "Buy-heavy" },
    { color: "#c27d0e", label: "Balanced" },
  ],
  volume: [
    { color: "#bfdcd3", label: "1 txn" },
    { color: "#7dbbab", label: "2–3" },
    { color: "#3f9884", label: "4–7" },
    { color: "#16705e", label: "8–14" },
    { color: "#0b4a3e", label: "15+" },
  ],
  recency: [
    { color: "#0b4a3e", label: "Last 30 days" },
    { color: "#3f9884", label: "31–90 days" },
    { color: "#a9cfc4", label: "91–180 days" },
    { color: "#c9d3ce", label: "Older" },
  ],
};

const card = "rounded-[10px] bg-surface shadow-[0_1px_3px_rgba(16,32,26,0.18)]";

export default function MapPanel({
  agents,
  market,
  through,
  selected,
  onSelect,
}: {
  agents: Agent[];
  market: Market;
  through: string;
  selected: Agent | null;
  onSelect: (id: string | null) => void;
}) {
  const [mode, setMode] = useState<MapColorMode>("side");
  const [copied, setCopied] = useState(false);
  // Keep typing in the search box snappy; the map catches up a beat later.
  const mapAgents = useDeferredValue(agents);

  async function copyEmail() {
    if (!selected?.email) return;
    try {
      await navigator.clipboard.writeText(selected.email);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked: the address is still visible on the card.
    }
  }

  return (
    <div className="relative h-full w-full">
      <AgentMap
        agents={mapAgents}
        market={market}
        selectedId={selected?.id ?? null}
        colorMode={mode}
        through={through}
        onSelect={onSelect}
      />

      <div className="pointer-events-none absolute inset-x-3 top-3 z-[500] flex items-start justify-between gap-2">
        <div className="pointer-events-auto flex flex-col gap-2">
          <div className={`${card} flex p-[3px] text-[13px] font-semibold`} role="group" aria-label="Color pins by">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={mode === m.id}
                onClick={() => setMode(m.id)}
                className={`h-8 rounded-lg px-3 transition ${
                  mode === m.id ? "bg-tint text-brand-deep" : "text-[#4a5a53] hover:text-ink"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className={`${card} flex flex-col gap-1.5 px-3 py-2.5 text-xs text-ink2`}>
            {LEGENDS[mode].map((l) => (
              <div key={l.label} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />
                {l.label}
              </div>
            ))}
            <div className="border-t border-soft pt-1.5 text-muted">Pin size = transactions</div>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-3 bottom-3 z-[500] flex justify-end">
        {selected && (
          <div className="pointer-events-auto relative w-full rounded-[14px] bg-surface p-4 shadow-[0_8px_28px_rgba(16,32,26,0.22)] sm:w-[340px]">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#cfe7df] font-bold text-brand-deep">
                {selected.firstName[0]}
                {selected.lastName[0] ?? ""}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-bold">{selected.name}</div>
                <div className="text-[12.5px] text-muted">
                  {selected.license ? `${market.state} license ${selected.license}` : "License not listed"}
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold leading-none">{selected.total}</div>
                <div className="text-[11px] text-muted">transactions</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onSelect(null)}
              aria-label="Close agent card"
              className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-ink text-white shadow-md hover:bg-brand-deep"
            >
              <CloseIcon width={14} height={14} />
            </button>
            <div className="mt-3.5 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-tint py-2">
                <div className="text-base font-bold text-[#0b6558]">{selected.sellSide}</div>
                <div className="text-[11px] text-ink2">Sell</div>
              </div>
              <div className="rounded-lg bg-[#e8eefb] py-2">
                <div className="text-base font-bold text-[#244fb8]">{selected.buySide}</div>
                <div className="text-[11px] text-ink2">Buy</div>
              </div>
              <div className="rounded-lg bg-background py-2">
                <div className="text-base font-bold">{selected.zipsActive}</div>
                <div className="text-[11px] text-ink2">ZIPs</div>
              </div>
            </div>
            <p className="mt-2.5 text-xs text-muted">
              {formatDate(selected.firstTransaction, false)} → {formatDate(selected.lastTransaction)}
            </p>
            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                onClick={copyEmail}
                disabled={!selected.email}
                className="h-9 flex-1 rounded-lg border border-field bg-surface text-[13px] font-semibold hover:bg-sunken disabled:opacity-40"
              >
                {copied ? "Copied" : "Copy email"}
              </button>
              {selected.phone ? (
                <a
                  href={`tel:${selected.phone.replace(/\D/g, "")}`}
                  className="flex h-9 flex-1 items-center justify-center rounded-lg border border-field bg-surface text-[13px] font-semibold hover:bg-sunken"
                >
                  Call {selected.phone}
                </a>
              ) : (
                <span className="flex h-9 flex-1 items-center justify-center rounded-lg border border-soft bg-sunken text-[13px] text-muted">
                  No phone on file
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
