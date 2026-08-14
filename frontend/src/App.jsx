import {
  Users,
  Gauge,
  TriangleAlert,
  Activity,
} from "lucide-react";

import Header from "./components/Header";
import StatsCard from "./components/StatsCard";
import VenueMap from "./components/VenueMap";
import AlertPanel from "./components/AlertPanel";
import RoutePanel from "./components/RoutePanel";
import CrowdChart from "./components/CrowdChart";

import {
  useCrowdSim,
} from "./hooks/useCrowdSim";

import {
  MOCK_BOTTLENECK,
} from "./data/mockData";

export default function App() {
  const {
    backendAvailable,
    connected,

    venues,
    venue,

    selectedVenueId,
    setSelectedVenueId,

    running,

    agents,

    bottlenecks,
    primaryBottleneck,

    routes,
    appliedRoutes,

    stats,
    densityHistory,
    simTime,

    rerouteApplied,

    startSimulation,
    stopSimulation,

    crowdSurge,
    surgeActive,

    applyRerouting,
  } = useCrowdSim();

  // ---------------------------------------------------------------
  // Build surge options automatically from the selected venue.
  // ---------------------------------------------------------------

  const surgeLocations =
    venue?.entry_points?.map(
      (gate) => ({
        id: gate.id,
        label: gate.label,
        x: gate.x,
        y: gate.y,
      })
    ) ?? [];

  const displayedBottleneck =
    backendAvailable === false
      ? {
          x: 42,
          y: 24,
          severity: 0.82,
          density:
            MOCK_BOTTLENECK.density,
          count: 340,
        }
      : primaryBottleneck;

  return (
    <div className="min-h-screen bg-ink text-text-primary font-body">

      <div className="scanline-layer">
        <div className="scanline animate-scanline" />
      </div>

      <Header
        connected={connected}
        backendAvailable={
          backendAvailable
        }
        venues={venues}
        selectedVenueId={
          selectedVenueId
        }
        onSelectVenue={
          setSelectedVenueId
        }
        simTime={simTime}
        running={running}
      />

      {backendAvailable === false && (
        <div className="max-w-[1400px] mx-auto px-6 pt-4">
          <div className="text-xs font-mono text-signal-caution border border-signal-caution/30 bg-signal-caution/5 rounded-md px-3 py-2">
            Backend not reachable at the configured URL — showing demo data. Start the FastAPI server and refresh to go live.
          </div>
        </div>
      )}

      <main className="max-w-[1400px] mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5">

        <aside className="flex flex-col gap-4 order-2 lg:order-1">

          <StatsCard
            icon={Users}
            label="Total Crowd"
            value={
              stats.total_agents?.toLocaleString?.() ??
              stats.total_agents
            }
          />

          <StatsCard
            icon={Gauge}
            label="Current Density"
            value={Math.round(
              (stats.density ?? 0) *
                100
            )}
            suffix="%"
          />

          <StatsCard
            icon={TriangleAlert}
            label="Risk"
            value={stats.risk}
            riskLevel={
              stats.risk
            }
          />

          <StatsCard
            icon={Activity}
            label="Avg Flow"
            value={
              stats.avg_flow
            }
            suffix="/min"
          />

          <RoutePanel
            risk={stats.risk}
            running={running}
            onStart={
              startSimulation
            }
            onStop={
              stopSimulation
            }
            onCrowdSurge={
              crowdSurge
            }
            surgeActive={
              surgeActive
            }
            backendAvailable={
              !!backendAvailable
            }
            surgeLocations={
              surgeLocations
            }
          />

        </aside>

        <section className="order-1 lg:order-2 min-h-[440px]">
          <VenueMap
            venue={venue}
            agents={agents}
            bottlenecks={
              bottlenecks
            }
            routes={
              appliedRoutes
            }
            rerouteApplied={
              rerouteApplied
            }
          />
        </section>

        <section className="lg:col-span-2 order-3">

          <AlertPanel
            bottleneck={
              displayedBottleneck
            }
            onApply={
              applyRerouting
            }
            applied={
              rerouteApplied
            }
            hasBackend={
              !!backendAvailable
            }
          />

        </section>

        <section className="lg:col-span-2 order-4">

          <CrowdChart
            data={
              densityHistory
            }
          />

        </section>
      </main>

      <footer className="max-w-[1400px] mx-auto px-6 pb-6">
        <p className="text-[10px] font-mono text-text-faint">
          CrowdSense AI · Detect → Predict → Redirect
        </p>
      </footer>

    </div>
  );
}