const riskStyles = {
  LOW: "text-signal-safe",
  MODERATE: "text-signal-caution",
  HIGH: "text-signal-critical",
};

export default function StatsCard({ icon: Icon, label, value, suffix, riskLevel }) {
  const valueColor = riskLevel ? riskStyles[riskLevel] || "text-text-primary" : "text-text-primary";

  return (
    <div className="rounded-lg border border-ink-border bg-ink-panel px-4 py-3.5">
      <div className="flex items-center gap-2 mb-2">
        {Icon && <Icon className="w-3.5 h-3.5 text-text-faint" strokeWidth={2} />}
        <span className="text-[11px] font-body font-medium uppercase tracking-wider text-text-muted">
          {label}
        </span>
      </div>
      <div className={`font-mono text-2xl font-semibold tabular-nums ${valueColor}`}>
        {value}
        {suffix && <span className="text-sm text-text-muted ml-1">{suffix}</span>}
      </div>
    </div>
  );
}
