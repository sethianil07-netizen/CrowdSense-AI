import { useEffect, useState } from "react";
import {
  Play,
  Square,
  Siren,
} from "lucide-react";

const LEVELS = [
  {
    key: "LOW",
    label: "Low",
    color: "#2BD576",
  },
  {
    key: "MODERATE",
    label: "Moderate",
    color: "#F2B44D",
  },
  {
    key: "HIGH",
    label: "Critical",
    color: "#FF5568",
  },
];

const PRESETS = [
  500,
  1500,
  3000,
  5000,
];

const MIN_AGENTS = 50;
const MAX_AGENTS = 6000;

export default function RoutePanel({
  risk,
  running,
  onStart,
  onStop,
  onCrowdSurge,
  surgeActive,
  backendAvailable,
  surgeLocations,
}) {
  const activeIndex =
    LEVELS.findIndex(
      (level) =>
        level.key === risk
    );

  const [numAgents, setNumAgents] =
    useState(500);

  const [selectedSurgeIds, setSelectedSurgeIds] =
    useState([]);

  const clamp = (number) =>
    Math.min(
      MAX_AGENTS,
      Math.max(
        MIN_AGENTS,
        number
      )
    );

  // ---------------------------------------------------------------
  // Reset/validate selected gates whenever the venue changes.
  // ---------------------------------------------------------------

  useEffect(() => {
    setSelectedSurgeIds(
      (previous) =>
        previous.filter(
          (id) =>
            surgeLocations.some(
              (location) =>
                location.id === id
            )
        )
    );
  }, [surgeLocations]);

  // ---------------------------------------------------------------
  // Toggle a gate
  // ---------------------------------------------------------------

  const toggleSurgeLocation = (
    locationId
  ) => {
    setSelectedSurgeIds(
      (previous) => {
        if (
          previous.includes(
            locationId
          )
        ) {
          return previous.filter(
            (id) =>
              id !== locationId
          );
        }

        return [
          ...previous,
          locationId,
        ];
      }
    );
  };

  // ---------------------------------------------------------------
  // Select all
  // ---------------------------------------------------------------

  const selectAllSurgeLocations =
    () => {
      setSelectedSurgeIds(
        surgeLocations.map(
          (location) =>
            location.id
        )
      );
    };

  // ---------------------------------------------------------------
  // Clear all
  // ---------------------------------------------------------------

  const clearSurgeLocations =
    () => {
      setSelectedSurgeIds([]);
    };

  // ---------------------------------------------------------------
  // Selected location objects
  // ---------------------------------------------------------------

  const selectedLocations =
    surgeLocations.filter(
      (location) =>
        selectedSurgeIds.includes(
          location.id
        )
    );

  const handleSurge = () => {
    if (
      selectedLocations.length ===
      0
    ) {
      return;
    }

    onCrowdSurge(
      selectedLocations
    );
  };

  return (
    <div className="rounded-lg border border-ink-border bg-ink-panel px-4 py-3.5 h-full flex flex-col justify-between">

      {/* =========================================================
          Risk
      ========================================================= */}

      <div>
        <span className="text-[11px] font-body font-medium uppercase tracking-wider text-text-muted">
          Risk Level
        </span>

        <div className="flex items-center gap-2 mt-3">
          {LEVELS.map(
            (level, index) => (
              <div
                key={level.key}
                className="flex items-center gap-2 flex-1"
              >
                <div
                  className="h-1.5 flex-1 rounded-full transition-all"
                  style={{
                    background:
                      index <=
                      activeIndex
                        ? level.color
                        : "#22314A",
                    opacity:
                      index <=
                      activeIndex
                        ? 1
                        : 0.5,
                  }}
                />
              </div>
            )
          )}
        </div>

        <div className="flex justify-between mt-1.5">
          {LEVELS.map(
            (level, index) => (
              <span
                key={level.key}
                className="text-[10px] font-mono"
                style={{
                  color:
                    index ===
                    activeIndex
                      ? level.color
                      : "#4A5A78",
                }}
              >
                {level.label}
              </span>
            )
          )}
        </div>
      </div>

      {/* =========================================================
          Crowd Size
      ========================================================= */}

      {!running && (
        <div className="mt-4">

          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-body font-medium uppercase tracking-wider text-text-muted">
              Crowd Size
            </span>

            <span className="text-sm font-mono text-text-primary tabular-nums">
              {numAgents.toLocaleString()}
            </span>
          </div>

          <input
            type="range"
            min={MIN_AGENTS}
            max={MAX_AGENTS}
            step={50}
            value={numAgents}
            onChange={(event) =>
              setNumAgents(
                clamp(
                  Number(
                    event.target.value
                  )
                )
              )
            }
            className="w-full accent-signal-live"
          />

          <div className="flex gap-1.5 mt-2">
            {PRESETS.map(
              (preset) => (
                <button
                  key={preset}
                  onClick={() =>
                    setNumAgents(
                      preset
                    )
                  }
                  className={`flex-1 text-[10px] font-mono py-1 rounded border transition-colors ${
                    numAgents ===
                    preset
                      ? "border-signal-live/50 bg-signal-live/10 text-signal-live"
                      : "border-ink-border text-text-muted hover:border-ink-border/80 hover:text-text-primary"
                  }`}
                >
                  {preset >=
                  1000
                    ? `${preset / 1000}k`
                    : preset}
                </button>
              )
            )}
          </div>
        </div>
      )}

      {/* =========================================================
          Start / Stop
      ========================================================= */}

      <button
        onClick={
          running
            ? onStop
            : () =>
                onStart(
                  numAgents
                )
        }
        disabled={
          !backendAvailable
        }
        className={`mt-4 flex items-center justify-center gap-2 w-full px-3 py-2 rounded-md text-sm font-body font-semibold transition-colors ${
          running
            ? "bg-signal-critical/10 text-signal-critical border border-signal-critical/30 hover:bg-signal-critical/20"
            : "bg-signal-live text-ink hover:bg-signal-live/90"
        } ${
          !backendAvailable
            ? "opacity-50 cursor-not-allowed"
            : ""
        }`}
      >
        {running ? (
          <>
            <Square className="w-3.5 h-3.5" />
            Stop Simulation
          </>
        ) : (
          <>
            <Play className="w-3.5 h-3.5" />
            Start Simulation
          </>
        )}
      </button>

      {/* =========================================================
          Surge locations
      ========================================================= */}

      {running && (
        <div className="mt-3">

          <div className="flex items-center justify-between mb-2">

            <label className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
              Surge Locations
            </label>

            <span className="text-[9px] font-mono text-text-faint">
              {selectedLocations.length} selected
            </span>

          </div>

          <div className="flex gap-1.5 mb-2">

            <button
              type="button"
              onClick={
                selectAllSurgeLocations
              }
              disabled={
                surgeActive ||
                surgeLocations.length ===
                  0
              }
              className="flex-1 text-[9px] font-mono py-1 rounded border border-ink-border text-text-muted hover:text-text-primary hover:border-ink-border/80 disabled:opacity-40"
            >
              Select All
            </button>

            <button
              type="button"
              onClick={
                clearSurgeLocations
              }
              disabled={
                surgeActive ||
                selectedSurgeIds.length ===
                  0
              }
              className="flex-1 text-[9px] font-mono py-1 rounded border border-ink-border text-text-muted hover:text-text-primary hover:border-ink-border/80 disabled:opacity-40"
            >
              Clear
            </button>

          </div>

          <div className="grid grid-cols-2 gap-1.5">

            {surgeLocations.map(
              (location) => {
                const selected =
                  selectedSurgeIds.includes(
                    location.id
                  );

                return (
                  <button
                    key={
                      location.id
                    }
                    type="button"
                    onClick={() =>
                      toggleSurgeLocation(
                        location.id
                      )
                    }
                    disabled={
                      surgeActive
                    }
                    className={`text-left px-2 py-1.5 rounded border text-[9px] font-mono transition-all ${
                      selected
                        ? "border-signal-caution/50 bg-signal-caution/10 text-signal-caution"
                        : "border-ink-border text-text-muted hover:text-text-primary hover:border-ink-border/80"
                    } ${
                      surgeActive
                        ? "opacity-50 cursor-not-allowed"
                        : ""
                    }`}
                  >
                    <div className="flex items-center gap-1.5">

                      <span
                        className={`inline-flex w-3 h-3 items-center justify-center rounded-sm border text-[8px] ${
                          selected
                            ? "border-signal-caution bg-signal-caution text-ink"
                            : "border-text-faint"
                        }`}
                      >
                        {selected
                          ? "✓"
                          : ""}
                      </span>

                      <span>
                        {
                          location.label
                        }
                      </span>

                    </div>
                  </button>
                );
              }
            )}

          </div>

          {selectedLocations.length >
            0 && (
            <div className="mt-2 text-[9px] font-mono text-text-faint">
              Selected:{" "}
              {selectedLocations
                .map(
                  (
                    location
                  ) =>
                    location.label
                )
                .join(", ")}
            </div>
          )}
        </div>
      )}

      {/* =========================================================
          Trigger surge
      ========================================================= */}

      {running && (
        <button
          onClick={
            handleSurge
          }
          disabled={
            !backendAvailable ||
            surgeActive ||
            selectedLocations.length ===
              0
          }
          className={`mt-2 flex items-center justify-center gap-2 w-full px-3 py-2 rounded-md text-sm font-body font-semibold transition-colors border ${
            surgeActive
              ? "border-signal-critical/40 bg-signal-critical/10 text-signal-critical"
              : "border-signal-caution/40 bg-signal-caution/10 text-signal-caution hover:bg-signal-caution/20"
          } ${
            !backendAvailable ||
            surgeActive ||
            selectedLocations.length ===
              0
              ? "opacity-50 cursor-not-allowed"
              : ""
          }`}
        >
          <Siren className="w-3.5 h-3.5" />

          {surgeActive
            ? "Crowd Surge Active"
            : selectedLocations.length >
                0
              ? `Trigger Surge · ${selectedLocations.length} Spot${
                  selectedLocations.length ===
                  1
                    ? ""
                    : "s"
                }`
              : "Select Surge Locations"}
        </button>
      )}
    </div>
  );
}