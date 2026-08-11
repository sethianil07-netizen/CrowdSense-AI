import { ShieldHalf, Radio } from "lucide-react";

function formatClock(simTime) {
  const totalSeconds = Math.floor(simTime);
  const m = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export default function Header({
  connected,
  backendAvailable,
  venues,
  selectedVenueId,
  onSelectVenue,
  simTime,
  running,
}) {
  const isLive = backendAvailable && connected && running;

  return (
    <header className="border-b border-ink-border bg-ink-panel/60 backdrop-blur">
      <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-lg bg-signal-live/10 border border-signal-live/30">
            <ShieldHalf className="w-5 h-5 text-signal-live" strokeWidth={2} />
          </div>
          <div>
            <h1 className="font-display text-xl font-semibold tracking-tight text-text-primary leading-none">
              CrowdSense AI
            </h1>
            <p className="text-xs text-text-muted mt-1 font-body">
              Real-Time Crowd Prediction &amp; Safe Rerouting
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <select
            value={selectedVenueId || ""}
            onChange={(e) => onSelectVenue(e.target.value)}
            disabled={!backendAvailable || venues.length === 0}
            className="bg-ink-raised border border-ink-border text-sm text-text-primary font-body rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-signal-live/50 disabled:opacity-50"
          >
            {venues.length === 0 && <option>Mumbai Central Arena (offline)</option>}
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>

          <div className="hidden sm:flex items-center gap-2 font-mono text-sm text-text-muted">
            <span className="tabular-nums">{formatClock(simTime)}</span>
          </div>

          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-mono font-medium ${
              isLive
                ? "border-signal-safe/40 bg-signal-safe/10 text-signal-safe"
                : "border-ink-border bg-ink-raised text-text-faint"
            }`}
          >
            <Radio className={`w-3 h-3 ${isLive ? "animate-pulse-glow" : ""}`} strokeWidth={2.5} />
            {isLive ? "LIVE" : "STANDBY"}
          </div>
        </div>
      </div>
    </header>
  );
}
