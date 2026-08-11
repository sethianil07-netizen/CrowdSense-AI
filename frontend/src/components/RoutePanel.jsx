import { useState } from "react";
import { Play, Square } from "lucide-react";

const LEVELS = [
  { key: "LOW", label: "Low", color: "#2BD576" },
  { key: "MODERATE", label: "Moderate", color: "#F2B44D" },
  { key: "HIGH", label: "Critical", color: "#FF5568" },
];

const PRESETS = [500, 1500, 3000, 5000];
const MIN_AGENTS = 50;
const MAX_AGENTS = 6000; // tested ceiling for <50ms/step on the backend physics loop

export default function RoutePanel({ risk, running, onStart, onStop, backendAvailable }) {
  const activeIndex = LEVELS.findIndex((l) => l.key === risk);
  const [numAgents, setNumAgents] = useState(500);

  const clamp = (n) => Math.min(MAX_AGENTS, Math.max(MIN_AGENTS, n));

  return (
    <div className="rounded-lg border border-ink-border bg-ink-panel px-4 py-3.5 h-full flex flex-col justify-between">
      <div>
        <span className="text-[11px] font-body font-medium uppercase tracking-wider text-text-muted">
          Risk Level
        </span>
        <div className="flex items-center gap-2 mt-3">
          {LEVELS.map((level, i) => (
            <div key={level.key} className="flex items-center gap-2 flex-1">
              <div
                className="h-1.5 flex-1 rounded-full transition-all"
                style={{
                  background: i <= activeIndex ? level.color : "#22314A",
                  opacity: i <= activeIndex ? 1 : 0.5,
                }}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-1.5">
          {LEVELS.map((level, i) => (
            <span
              key={level.key}
              className="text-[10px] font-mono"
              style={{ color: i === activeIndex ? level.color : "#4A5A78" }}
            >
              {level.label}
            </span>
          ))}
        </div>
      </div>

      {!running && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-body font-medium uppercase tracking-wider text-text-muted">
              Crowd Size
            </span>
            <span className="text-sm font-mono text-text-primary tabular-nums">{numAgents}</span>
          </div>
          <input
            type="range"
            min={MIN_AGENTS}
            max={MAX_AGENTS}
            step={50}
            value={numAgents}
            onChange={(e) => setNumAgents(clamp(Number(e.target.value)))}
            className="w-full accent-signal-live"
          />
          <div className="flex gap-1.5 mt-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => setNumAgents(p)}
                className={`flex-1 text-[10px] font-mono py-1 rounded border transition-colors ${
                  numAgents === p
                    ? "border-signal-live/50 bg-signal-live/10 text-signal-live"
                    : "border-ink-border text-text-muted hover:border-ink-border/80 hover:text-text-primary"
                }`}
              >
                {p >= 1000 ? `${p / 1000}k` : p}
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={running ? onStop : () => onStart(numAgents)}
        className={`mt-4 flex items-center justify-center gap-2 w-full px-3 py-2 rounded-md text-sm font-body font-semibold transition-colors ${
          running
            ? "bg-signal-critical/10 text-signal-critical border border-signal-critical/30 hover:bg-signal-critical/20"
            : "bg-signal-live text-ink hover:bg-signal-live/90"
        }`}
        title={!backendAvailable ? "Connect the backend to run a live simulation" : undefined}
      >
        {running ? (
          <>
            <Square className="w-3.5 h-3.5" /> Stop Simulation
          </>
        ) : (
          <>
            <Play className="w-3.5 h-3.5" /> Start Simulation
          </>
        )}
      </button>
    </div>
  );
}
