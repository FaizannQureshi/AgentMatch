"use client";

import { useEffect, useState } from "react";
import type { Agent, GhlSession, MarketId } from "@/lib/types";
import AccessGate from "./AccessGate";
import AgentDirectory from "./AgentDirectory";

type Phase = "checking" | "locked" | "ready";

function requestSsoPayload(): Promise<string | null> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      resolve(null);
    }, 2500);
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

export default function AppShell() {
  const [phase, setPhase] = useState<Phase>("checking");
  const [message, setMessage] = useState("");
  const [session, setSession] = useState<GhlSession | null>(null);
  const [agentsByMarket, setAgentsByMarket] = useState<Record<MarketId, Agent[]> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const params = new URLSearchParams(window.location.search);
      const preview = params.get("preview");
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

      if (window.parent !== window) {
        const encrypted = await requestSsoPayload();
        if (encrypted) {
          const res = await fetch("/api/auth/sso", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ encryptedData: encrypted }),
          });
          const data = (await res.json()) as { session?: GhlSession; error?: string };
          if (res.ok && data.session) {
            if (!cancelled) await openDirectory(data.session);
            return;
          }
          if (!cancelled && data.error) setMessage(data.error);
        }

        const locationId = params.get("location_id");
        if (locationId) {
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
          const data = (await res.json()) as { session?: GhlSession; error?: string };
          if (res.ok && data.session) {
            if (!cancelled) await openDirectory(data.session);
            return;
          }
          if (!cancelled && data.error) setMessage(data.error);
        }
      }

      const existing = await fetch("/api/auth/session");
      if (existing.ok) {
        const data = (await existing.json()) as { session: GhlSession };
        if (!cancelled) await openDirectory(data.session);
        return;
      }

      if (!cancelled) setPhase("locked");
    }

    async function openDirectory(next: GhlSession) {
      const res = await fetch("/api/agents");
      if (!res.ok) {
        setMessage("Signed in, but the directory could not load.");
        setPhase("locked");
        return;
      }
      const data = (await res.json()) as { agentsByMarket: Record<MarketId, Agent[]> };
      setSession(next);
      setAgentsByMarket(data.agentsByMarket);
      setPhase("ready");
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
  return <AccessGate status={phase === "checking" ? "checking" : "locked"} message={message} />;
}
