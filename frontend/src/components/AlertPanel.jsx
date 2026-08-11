import { TriangleAlert, ArrowRight, CircleCheck } from "lucide-react";

export default function AlertPanel({ bottleneck, onApply, applied, hasBackend }) {
  if (!bottleneck) {
    return (
      <div className="rounded-lg border border-ink-border bg-ink-panel px-5 py-4 flex items-center gap-3">
        <CircleCheck className="w-5 h-5 text-signal-safe shrink-0" strokeWidth={2} />
        <div>
          <p className="text-sm font-body font-medium text-text-primary">No active bottlenecks</p>
          <p className="text-xs font-body text-text-muted">
            Crowd flow is within safe density thresholds across all zones.
          </p>
        </div>
      </div>
    );
  }

  const severityLabel =
    bottleneck.severity > 0.66 ? "CRITICAL" : bottleneck.severity > 0.33 ? "ELEVATED" : "WATCH";
  const severityColor =
    bottleneck.severity > 0.66
      ? "text-signal-critical border-signal-critical/40 bg-signal-critical/10"
      : "text-signal-caution border-signal-caution/40 bg-signal-caution/10";

  return (
    <div className="rounded-lg border border-signal-critical/30 bg-gradient-to-r from-signal-critical/[0.06] to-transparent px-5 py-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5">
            <TriangleAlert className="w-5 h-5 text-signal-critical" strokeWidth={2} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-display font-semibold text-text-primary tracking-tight">
                Bottleneck Detected
              </p>
              <span
                className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded border ${severityColor}`}
              >
                {severityLabel}
              </span>
            </div>
            <p className="text-xs font-mono text-text-muted mt-1">
              Zone ({bottleneck.x}, {bottleneck.y}) · density {(bottleneck.density ?? 0).toFixed(2)} ppl/m² ·{" "}
              {bottleneck.count} people
            </p>
            <div className="mt-2.5 flex items-center gap-2 text-sm font-body">
              <span className="text-text-muted">Recommended:</span>
              <span className="text-signal-live font-medium">Redirect ~35% of flow</span>
              <ArrowRight className="w-3.5 h-3.5 text-text-faint" />
              <span className="text-text-primary font-medium">nearest open exit</span>
            </div>
          </div>
        </div>

        <button
          onClick={onApply}
          disabled={applied}
          className={`shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-body font-semibold transition-colors ${
            applied
              ? "bg-signal-safe/10 text-signal-safe border border-signal-safe/30 cursor-default"
              : "bg-signal-live text-ink hover:bg-signal-live/90"
          }`}
        >
          {applied ? (
            <>
              <CircleCheck className="w-4 h-4" /> Rerouting Applied
            </>
          ) : (
            "Apply Rerouting"
          )}
        </button>
      </div>
      {!hasBackend && (
        <p className="text-[11px] font-mono text-text-faint mt-3">
          Demo mode — connect the backend for live A* rerouting.
        </p>
      )}
    </div>
  );
}
