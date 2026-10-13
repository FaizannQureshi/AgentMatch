import type { AgentStats } from "@/lib/agents";

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-soft px-6 py-3 [&:not(:last-child)]:border-r">
      <div className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted">{label}</div>
      {children}
    </div>
  );
}

const num = "mt-0.5 text-[26px] font-bold leading-tight";

export default function StatsStrip({ stats, total }: { stats: AgentStats; total: number }) {
  const heads = stats.sell + stats.buy;
  const sellPct = heads ? (stats.sell / heads) * 100 : 50;
  const filtered = stats.count !== total;

  return (
    <div className="hidden shrink-0 grid-cols-5 border-b border-line bg-surface md:grid" aria-label="Summary of agents in view">
      <Stat label={filtered ? "Agents matching" : "Agents in view"}>
        <div className={num}>
          {stats.count.toLocaleString()}
          {filtered && <span className="ml-1.5 text-[13px] font-medium text-muted">of {total.toLocaleString()}</span>}
        </div>
      </Stat>
      <Stat label="Transactions">
        <div className={num}>{stats.transactions.toLocaleString()}</div>
      </Stat>
      <Stat label="Sell / buy split">
        <div className="mt-2.5 flex items-center gap-2.5">
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-buy">
            <div className="h-full bg-sell" style={{ width: `${sellPct}%` }} />
          </div>
          <div className="whitespace-nowrap text-[13px] font-semibold">
            {Math.round(sellPct)} / {100 - Math.round(sellPct)}
          </div>
        </div>
      </Stat>
      <Stat label="Active last 90 days">
        <div className={num}>{stats.recent90.toLocaleString()}</div>
      </Stat>
      <Stat label="With phone on file">
        <div className={num}>{stats.withPhone.toLocaleString()}</div>
      </Stat>
    </div>
  );
}
