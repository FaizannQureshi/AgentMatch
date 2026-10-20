"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildCsv, downloadCsv, planExport } from "@/lib/agents";
import type { ActivityRecord, Agent, ExportFormat, ExportOptions, Market } from "@/lib/types";
import { CheckCircle, CloseIcon, DownloadIcon, ShieldCheck } from "./Icons";

const plural = (n: number) => (n === 1 ? "contact" : "contacts");

const DEFAULTS: ExportOptions = {
  format: "ghl",
  skipSharedEmail: true,
  requirePhone: false,
  tagMarket: true,
};

function FormatCard({
  active,
  title,
  badge,
  children,
  onClick,
}: {
  active: boolean;
  title: string;
  badge?: string;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`rounded-xl p-3.5 text-left transition ${
        active ? "border-2 border-brand bg-tint" : "border border-field hover:border-brand"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold">{title}</span>
        {badge && (
          <span className="rounded bg-brand px-1.5 py-0.5 text-[10.5px] font-bold tracking-wide text-white">{badge}</span>
        )}
      </div>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink2">{children}</p>
    </button>
  );
}

function Option({
  checked,
  onChange,
  title,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 border-b border-soft py-2.5 last:border-b-0">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-brand"
      />
      <span>
        <b>{title}</b>
        <br />
        <span className="text-[12.5px] text-muted">{hint}</span>
      </span>
    </label>
  );
}

export default function ExportDialog({
  agents,
  market,
  scopeLabel,
  filterSummary,
  onLogged,
  onClose,
}: {
  agents: Agent[];
  market: Market;
  /** Human description of what is being exported, e.g. "5+ transactions" or "2 selected agents". */
  scopeLabel: string;
  filterSummary: string;
  onLogged: (record: ActivityRecord) => void;
  onClose: () => void;
}) {
  const [options, setOptions] = useState<ExportOptions>(DEFAULTS);
  const [doneCount, setDoneCount] = useState<number | null>(null);
  const [doneLabel, setDoneLabel] = useState("exported");
  const [busy, setBusy] = useState<"csv" | "import" | null>(null);
  const [error, setError] = useState("");
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    primaryRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const plan = useMemo(() => planExport(agents, options), [agents, options]);
  const sharedTotal = useMemo(() => agents.filter((a) => a.sharedEmail).length, [agents]);
  const noPhoneTotal = useMemo(() => agents.filter((a) => !a.phone).length, [agents]);

  function set<K extends keyof ExportOptions>(key: K, value: ExportOptions[K]) {
    setOptions((o) => ({ ...o, [key]: value }));
  }

  const summary = `${scopeLabel}${filterSummary !== "No filters" ? ` · ${filterSummary}` : ""}`;

  async function logAction(action: "csv" | "import", count: number, detail = "") {
    const res = await fetch("/api/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        marketId: market.id,
        marketLabel: market.label,
        city: market.city,
        stateCode: market.state,
        count,
        format: options.format,
        filterSummary: summary,
        status: "ok",
        detail,
      }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error || "Could not save the activity log");
    }
    const data = (await res.json()) as { record: ActivityRecord };
    onLogged(data.record);
  }

  async function download() {
    if (plan.agents.length === 0 || busy) return;
    setBusy("csv");
    setError("");
    try {
      await logAction("csv", plan.agents.length);
      const iso = new Date().toISOString().slice(0, 10);
      const csv = buildCsv(plan.agents, market, options, iso);
      downloadCsv(`ai-partnership-${market.id}-${options.format}-${iso}.csv`, csv);
      setDoneLabel("exported");
      setDoneCount(plan.agents.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(null);
    }
  }

  async function importContacts() {
    if (plan.agents.length === 0 || busy) return;
    setBusy("import");
    setError("");
    try {
      const iso = new Date().toISOString().slice(0, 10);
      const tags = options.tagMarket
        ? ["ai-partnership", `${market.city}-${market.state}`.toLowerCase(), market.scopeLabel.toLowerCase().replace(/\s+/g, "-"), iso]
        : ["ai-partnership"];
      let imported = 0;
      let cursor = 0;
      const queue = plan.agents;
      while (cursor < queue.length) {
        const slice = queue.slice(cursor, cursor + 40);
        const res = await fetch("/api/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contacts: slice.map((agent) => ({
              firstName: agent.firstName,
              lastName: agent.lastName,
              email: agent.email,
              phone: agent.phone,
              sharedEmail: agent.sharedEmail,
            })),
            skipSharedEmail: options.skipSharedEmail,
            tags,
            marketId: market.id,
            marketLabel: market.label,
            city: market.city,
            stateCode: market.state,
            filterSummary: summary,
          }),
        });
        const data = (await res.json()) as {
          imported?: number;
          error?: string;
          errors?: string[];
          record?: ActivityRecord;
        };
        if (!res.ok) throw new Error(data.error || data.errors?.[0] || "Import failed");
        if (data.record) onLogged(data.record);
        const batchImported = data.imported || 0;
        if (batchImported === 0) {
          throw new Error(data.error || data.errors?.[0] || "Import failed for every contact");
        }
        imported += batchImported;
        cursor += slice.length;
      }
      setDoneLabel("imported");
      setDoneCount(imported);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-end justify-center bg-[rgba(16,32,26,0.52)] p-0 sm:items-center sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
        className="flex max-h-[92dvh] w-full max-w-[660px] flex-col overflow-hidden rounded-t-[18px] bg-surface shadow-[0_24px_64px_rgba(16,32,26,0.35)] sm:rounded-[18px]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-soft px-6 pb-4 pt-6 sm:px-7">
          <div>
            <h2 id="export-title" className="text-[22px] font-bold tracking-tight">
              {doneCount === null ? `Export ${agents.length.toLocaleString()} ${plural(agents.length)}` : "Export complete"}
            </h2>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[12.5px] font-semibold">
              <span className="rounded-full bg-tint px-2.5 py-0.5 text-ink">
                {market.city}, {market.state}
              </span>
              <span className="rounded-full bg-sunken px-2.5 py-0.5 text-ink2">{market.scopeLabel}</span>
              <span className="rounded-full bg-sunken px-2.5 py-0.5 text-ink2">{scopeLabel}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-background text-ink2 hover:bg-soft"
          >
            <CloseIcon width={18} height={18} />
          </button>
        </div>

        {doneCount !== null ? (
          <div className="flex flex-col items-center gap-3 px-8 py-12 text-center">
            <CheckCircle width={44} height={44} className="text-brand" />
            <p className="text-lg font-bold">
              {doneCount.toLocaleString()} {plural(doneCount)} {doneLabel}
            </p>
            <p className="max-w-sm text-sm text-muted">
              This action is saved on this subaccount&apos;s activity log.
            </p>
            <button
              ref={primaryRef}
              type="button"
              onClick={onClose}
              className="mt-2 h-10 rounded-[10px] bg-brand px-5 text-sm font-bold text-white hover:bg-brand-deep"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-5 overflow-y-auto px-6 py-5 sm:px-7">
              <div>
                <div className="mb-2 text-xs font-bold uppercase tracking-[0.06em] text-muted" id="fmt">
                  Format
                </div>
                <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-labelledby="fmt">
                  <FormatCard
                    active={options.format === "ghl"}
                    title="CRM contact CSV"
                    badge="RECOMMENDED"
                    onClick={() => set("format", "ghl" as ExportFormat)}
                  >
                    First Name, Last Name, Email, Phone, Tags. Ready for a standard CRM contact import. Names are cleaned
                    to proper case.
                  </FormatCard>
                  <FormatCard
                    active={options.format === "full"}
                    title="Full vendor data"
                    onClick={() => set("format", "full" as ExportFormat)}
                  >
                    Every column from the vendor file plus city, state and market. Best for analysis in a spreadsheet.
                  </FormatCard>
                </div>
              </div>

              <div>
                <div className="mb-1 text-xs font-bold uppercase tracking-[0.06em] text-muted">Clean-up</div>
                <Option
                  checked={options.skipSharedEmail}
                  onChange={(v) => set("skipSharedEmail", v)}
                  title="Skip shared team inboxes"
                  hint={`${sharedTotal.toLocaleString()} in this export share an email with another agent (e.g. contracts@…), so a CRM may merge them into one contact.`}
                />
                <Option
                  checked={options.requirePhone}
                  onChange={(v) => set("requirePhone", v)}
                  title="Only agents with a phone number"
                  hint={`${noPhoneTotal.toLocaleString()} in this export have no phone on file.`}
                />
                {options.format === "ghl" && (
                  <Option
                    checked={options.tagMarket}
                    onChange={(v) => set("tagMarket", v)}
                    title="Tag every contact with the market"
                    hint={`Adds tags: ai-partnership, ${market.city.toLowerCase()}-${market.state.toLowerCase()}, ${market.scopeLabel
                      .toLowerCase()
                      .replace(/\s+/g, "-")}, today's date`}
                  />
                )}
              </div>

              <div className="flex items-center gap-3.5 rounded-xl border border-line bg-sunken px-4 py-3.5 text-[13px] leading-relaxed text-ink2">
                <ShieldCheck width={22} height={22} className="shrink-0 text-brand" />
                <span>
                  This export is recorded in your <b>export history</b> with the market, filters and contact count.
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-soft bg-sunken px-6 py-4 sm:px-7">
              <div className="min-w-[180px] flex-1 text-[13px] text-ink2">
                <b className="text-[15px] text-ink">{plan.agents.length.toLocaleString()} {plural(plan.agents.length)}</b> ready
                {plan.skippedShared + plan.skippedNoPhone > 0 && (
                  <span className="block text-xs text-muted">
                    {(plan.skippedShared + plan.skippedNoPhone).toLocaleString()} skipped by clean-up
                  </span>
                )}
                {error && <span className="mt-1 block text-xs text-[#7a4b00]">{error}</span>}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="h-[42px] rounded-[10px] border border-field bg-surface px-[18px] text-sm font-semibold hover:bg-background"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={download}
                disabled={plan.agents.length === 0 || busy !== null}
                className="flex h-[42px] items-center gap-2 rounded-[10px] border border-ink bg-surface px-4 text-sm font-bold hover:bg-sunken disabled:cursor-not-allowed disabled:opacity-40"
              >
                <DownloadIcon /> {busy === "csv" ? "Saving…" : "Download CSV"}
              </button>
              <button
                ref={primaryRef}
                type="button"
                onClick={importContacts}
                disabled={plan.agents.length === 0 || busy !== null}
                className="flex h-[42px] items-center gap-2 rounded-[10px] bg-brand px-5 text-sm font-bold text-white hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy === "import" ? "Importing…" : "Import to CRM"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
