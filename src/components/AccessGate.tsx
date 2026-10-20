"use client";

export default function AccessGate({
  status,
  message,
}: {
  status: "checking" | "locked";
  message?: string;
}) {
  return (
    <div className="flex h-full min-h-0 items-center justify-center bg-background px-6 text-ink">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-8 shadow-sm">
        <div className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-brand text-sm font-bold text-white">
          AI
        </div>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">AI Partnership Platform</h1>
        {status === "checking" ? (
          <p className="mt-3 text-sm leading-relaxed text-muted">Checking your CRM session…</p>
        ) : (
          <>
            <p className="mt-3 text-sm leading-relaxed text-ink2">
              This directory opens from the sidebar inside a loan officer subaccount. A direct link does not grant
              access.
            </p>
            {message && <p className="mt-3 text-sm text-muted">{message}</p>}
          </>
        )}
      </div>
    </div>
  );
}
