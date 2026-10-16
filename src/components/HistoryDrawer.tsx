"use client";

import { useEffect, useMemo, useState } from "react";
import { downloadCsv } from "@/lib/agents";
import type { ActivityRecord } from "@/lib/types";
import { CloseIcon } from "./Icons";

const ACTION_LABEL = { csv: "CSV export", import: "CRM import" } as const;

function recordsToCsv(records: ActivityRecord[]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const header = ["When", "User", "Email", "Action", "City", "State", "Market", "Contacts", "Status", "Detail"];
  const rows = records.map((r) =>
    [r.at, r.userName, r.userEmail, r.action, r.city, r.stateCode, r.marketLabel, r.count, r.status, r.detail]
      .map(esc)
      .join(","),
  );
  return [header.map(esc).join(","), ...rows].join("\n");
}

function formatWhen(iso: string, now: number) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const days = Math.floor((now - d.getTime()) / 86_400_000);
  if (new Date(now).toDateString() === d.toDateString()) return `Today, ${time}`;
  if (days <= 1) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${time}`;
}

export default function HistoryDrawer({
  records,
  onClose,
}: {
  records: ActivityRecord[];
  onClose: () => void;
}) {
  const [now] = useState(() => Date.now());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const month = useMemo(() => {
    const ref = new Date(now);
    const rows = records.filter((r) => {
      const d = new Date(r.at);
      return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
    });
    return {
      contacts: rows.reduce((n, r) => n + r.count, 0),
      exports: rows.length,
      markets: new Set(rows.map((r) => r.marketId)).size,
    };
  }, [records, now]);

  return (
    <div
      className="fixed inset-0 z-[2000] flex justify-end bg-[rgba(16,32,26,0.52)]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Export history"
        className="flex h-full w-full max-w-[460px] flex-col bg-surface shadow-[-12px_0_40px_rgba(16,32,26,0.25)]"
      >
        <div className="flex items-center justify-between gap-3 border-b border-soft px-6 pb-4 pt-6">
          <h2 className="text-xl font-bold">Export history</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={records.length === 0}
              onClick={() => downloadCsv("ai-partnership-activity-log.csv", recordsToCsv(records))}
              className="h-[34px] rounded-lg border border-field bg-surface px-3 text-[13px] font-semibold hover:bg-background disabled:opacity-40"
            >
              Download log
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close export history"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-background text-ink2 hover:bg-soft"
            >
              <CloseIcon width={18} height={18} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2.5 px-6 py-4">
          {[
            { label: "This month", value: month.contacts, unit: "contacts" },
            { label: "Exports", value: month.exports, unit: "this month" },
            { label: "Markets", value: month.markets, unit: "exported from" },
          ].map((s) => (
            <div key={s.label} className="rounded-[10px] bg-background p-3">
              <div className="text-[11px] font-bold uppercase tracking-[0.05em] text-muted">{s.label}</div>
              <div className="mt-0.5 text-2xl font-bold">{s.value.toLocaleString()}</div>
              <div className="text-xs text-muted">{s.unit}</div>
            </div>
          ))}
        </div>

        <div className="mx-6 mb-1.5 mt-1 text-xs font-bold uppercase tracking-[0.06em] text-muted">Recent</div>
        <div className="am-scroll min-h-0 flex-1 overflow-y-auto px-6">
          {records.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">
              No activity yet. CSV exports and CRM imports from this subaccount show up here.
            </p>
          ) : (
            <ul>
              {records.map((r) => (
                <li key={r.id} className="border-b border-soft py-3.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <b>
                      {r.city}, {r.stateCode} · {r.marketLabel.split("· ")[1] ?? r.marketLabel}
                    </b>
                    <b className="text-base">{r.count.toLocaleString()}</b>
                  </div>
                  <p className="mt-0.5 text-[12.5px] text-muted">
                    {formatWhen(r.at, now)} · {ACTION_LABEL[r.action]}
                    {r.userName ? ` · ${r.userName}` : ""}
                    {r.filterSummary ? ` · ${r.filterSummary}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-soft px-6 py-4 text-[12.5px] leading-relaxed text-muted">
          Saved for this subaccount. Other subaccounts cannot see this log.
        </div>
      </aside>
    </div>
  );
}
