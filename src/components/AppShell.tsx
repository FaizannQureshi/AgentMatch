"use client";

import { useEffect, useState } from "react";
import type { Agent, GhlSession, MarketId } from "@/lib/types";
import AccessGate from "./AccessGate";
import AgentDirectory from "./AgentDirectory";

type Phase = "booting" | "locked" | "ready";

function requestSsoPayload(timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      resolve(null);
    }, timeoutMs);
    function onMessage(event: MessageEvent) {
      const data = event.data as { message?: string; payload?: string } | null;
      if (!data || data.message !== "REQUEST_USER_DATA_RESPONSE" || !data.payload) return;
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve(data.payload);
    }
    window.addEventListener("message", onMessage);
    window.parent.postMessage({ message: "REQUEST_USER_DATA" }, "*");
  });
}

async function menuLogin(params: URLSearchParams): Promise<{ session?: GhlSession; error?: string }> {
  const locationId = params.get("location_id");
  if (!locationId) return {};
  const res = await fetch("/api/auth/menu", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      locationId,
      userId: params.get("user_id") || "",
      userName: params.get("user_name") || "",
      email: params.get("user_email") || "",
    }),
  });
  return (await res.json()) as { session?: GhlSession; error?: string };
}

async function ssoLogin(encrypted: string): Promise<{ session?: GhlSession; error?: string }> {
  const res = await fetch("/api/auth/sso", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ encryptedData: encrypted }),
  });
  return (await res.json()) as { session?: GhlSession; error?: string };
}

function BootShell({ note }: { note: string }) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background text-ink">
      <div className="flex shrink-0 items-center gap-3 border-b border-line bg-surface px-4 py-3 lg:px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-brand text-[12px] font-bold text-white">
          AI
        </div>
        <div className="min-w-0">
          <div className="text-[17px] font-semibold tracking-tight lg:text-[19px]">AI Partnership Platform</div>
          <div className="text-[12px] text-muted">{note}</div>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 animate-pulse grid-cols-1 lg:grid-cols-[minmax(380px,480px)_1fr]">
        <div className="border-r border-line bg-surface p-5">
          <div className="mb-4 h-9 rounded-lg bg-sunken" />
          <div className="space-y-3">
            <div className="h-16 rounded-xl bg-sunken" />
            <div className="h-16 rounded-xl bg-sunken" />
            <div className="h-16 rounded-xl bg-sunken" />
            <div className="h-16 rounded-xl bg-sunken" />
          </div>
        </div>
        <div className="hidden bg-[#f0f0f0] lg:block" />
      </div>
    </div>
  );
}

export default function AppShell() {
  const [phase, setPhase] = useState<Phase>("booting");
  const [message, setMessage] = useState("");
  const [session, setSession] = useState<GhlSession | null>(null);
  const [agentsByMarket, setAgentsByMarket] = useState<Record<MarketId, Agent[]> | null>(null);

  useEffect(() => {
    const embedded = window.self !== window.top;
    document.documentElement.dataset.embed = embedded ? "crm" : "solo";
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function openDirectory(next: GhlSession) {
      const res = await fetch("/api/agents");
      if (!res.ok) {
        setMessage("Signed in, but the directory could not load.");
        setPhase("locked");
        return;
      }
      const data = (await res.json()) as { agentsByMarket: Record<MarketId, Agent[]> };
      if (cancelled) return;
      setSession(next);
      setAgentsByMarket(data.agentsByMarket);
      setPhase("ready");
    }

    async function boot() {
      const params = new URLSearchParams(window.location.search);
      const preview = params.get("preview");
      const locationId = params.get("location_id") || "";
      const embedded = window.parent !== window;

      if (preview) {
        const res = await fetch("/api/auth/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: preview }),
        });
        if (res.ok) {
          const data = (await res.json()) as { session: GhlSession };
          if (!cancelled) await openDirectory(data.session);
          return;
        }
      }

      // Reuse an existing cookie only when it matches this subaccount.
      const existing = await fetch("/api/auth/session");
      if (existing.ok) {
        const data = (await existing.json()) as { session: GhlSession };
        if (!locationId || data.session.locationId === locationId) {
          if (!cancelled) await openDirectory(data.session);
          return;
        }
      }

      if (embedded) {
        // Custom menu links send location_id — auth that path first (no 2.5s SSO wait).
        if (locationId) {
          const menu = await menuLogin(params);
          if (menu.session) {
            if (!cancelled) await openDirectory(menu.session);
            return;
          }
          if (menu.error && !cancelled) setMessage(menu.error);
        }

        const encrypted = await requestSsoPayload(locationId ? 800 : 2000);
        if (encrypted) {
          const sso = await ssoLogin(encrypted);
          if (sso.session && (!locationId || sso.session.locationId === locationId)) {
            if (!cancelled) await openDirectory(sso.session);
            return;
          }
          if (sso.error && !cancelled) setMessage(sso.error);
        }
      }

      if (!cancelled) setPhase("locked");
    }

    boot().catch(() => {
      if (!cancelled) {
        setMessage("Could not reach the app.");
        setPhase("locked");
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (phase === "ready" && session && agentsByMarket) {
    return <AgentDirectory session={session} agentsByMarket={agentsByMarket} />;
  }
  if (phase === "booting") {
    return <BootShell note="Opening your subaccount…" />;
  }
  return <AccessGate status="locked" message={message} />;
}
