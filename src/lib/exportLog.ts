"use client";

import { useSyncExternalStore } from "react";
import type { ExportRecord } from "./types";

/**
 * Phase 1 keeps the export log in this browser. Phase 2 replaces `readLog` /
 * `appendExport` with calls that write per GHL sub-account on the server;
 * callers only depend on the ExportRecord shape.
 */
const KEY = "agentmatch.exportLog.v1";
const MAX_RECORDS = 500;
const EMPTY: ExportRecord[] = [];

let cache: ExportRecord[] | null = null;
const listeners = new Set<() => void>();

function readLog(): ExportRecord[] {
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as ExportRecord[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function emit() {
  listeners.forEach((l) => l());
}

export function appendExport(record: Omit<ExportRecord, "id" | "at">): ExportRecord {
  const full: ExportRecord = {
    ...record,
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    at: new Date().toISOString(),
  };
  cache = [full, ...readLog()].slice(0, MAX_RECORDS);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // Storage full or blocked: the in-memory log still works for this session.
  }
  emit();
  return full;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useExportLog(): ExportRecord[] {
  return useSyncExternalStore(subscribe, readLog, () => EMPTY);
}

export function logToCsv(records: ExportRecord[]): string {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = records.map((r) =>
    [r.at, r.city, r.stateCode, r.marketLabel, r.count, r.format, r.filterSummary].map(esc).join(","),
  );
  return [["Exported At", "City", "State", "Market", "Contacts", "Format", "Filters"].map(esc).join(","), ...rows].join("\n");
}
