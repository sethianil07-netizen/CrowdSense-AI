import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import {
  MOCK_VENUE,
  MOCK_STATS,
  MOCK_BOTTLENECK,
  MOCK_DENSITY_HISTORY,
  generateMockAgents,
} from "../data/mockData";

const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ||
  (import.meta.env.DEV ? "http://localhost:8000" : "/api");
const MAX_HISTORY_POINTS = 40;

/**
 * Owns the connection to the CrowdSense backend: fetches the venue list,
 * opens a Socket.io connection, starts/stops simulations, and folds
 * incoming `simulation_update` / `bottleneck_alert` / `reroute_suggestion`
 * events into React state the dashboard can render.
 *
 * If the backend isn't reachable, falls back to static mock data so the
 * UI is still fully demoable (Phase 1 of the build plan).
 */
export function useCrowdSim() {
  const [connected, setConnected] = useState(false);
  const [backendAvailable, setBackendAvailable] = useState(null); // null = unknown yet
  const [venues, setVenues] = useState([]);
  const [selectedVenueId, setSelectedVenueId] = useState(null);
  const [venue, setVenue] = useState(MOCK_VENUE);
  const [running, setRunning] = useState(false);
  const [agents, setAgents] = useState(() => generateMockAgents(MOCK_VENUE));
  const [bottlenecks, setBottlenecks] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [stats, setStats] = useState(MOCK_STATS);
  const [densityHistory, setDensityHistory] = useState(MOCK_DENSITY_HISTORY);
  const [simTime, setSimTime] = useState(0);
  const [rerouteApplied, setRerouteApplied] = useState(false);

  const socketRef = useRef(null);

  // --- fetch venue list on mount -------------------------------------
  useEffect(() => {
    let cancelled = false;
    fetch(`${BACKEND_URL}/api/venues`)
      .then((r) => {
        if (!r.ok) throw new Error("bad response");
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        setVenues(data.venues || []);
        setBackendAvailable(true);
        if (data.venues && data.venues.length > 0) {
          setSelectedVenueId(data.venues[0].id);
        }
      })
      .catch(() => {
        if (!cancelled) setBackendAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // --- fetch full venue layout whenever selection changes ------------
  useEffect(() => {
    if (!selectedVenueId || !backendAvailable) return;
    let cancelled = false;
    fetch(`${BACKEND_URL}/api/venue/${selectedVenueId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setVenue(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedVenueId, backendAvailable]);

  // --- socket lifecycle -----------------------------------------------
  useEffect(() => {
    if (!backendAvailable) return;

    const socket = io(BACKEND_URL, { transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("simulation_update", (state) => {
      setAgents(state.agents || []);
      setBottlenecks(state.bottlenecks || []);
      setRoutes(state.routes || []);
      setSimTime(state.sim_time || 0);
      setStats({
        total_agents: state.total_agents,
        density: state.density,
        risk: state.risk,
        high_risk_zones: (state.bottlenecks || []).length,
        avg_flow: Math.round((state.total_agents || 0) * 0.02 * 60) / 60, // rough live estimate
      });
      setDensityHistory((prev) => {
        const next = [
          ...prev,
          { t: state.sim_time?.toFixed(1) ?? prev.length, density: Math.round((state.density || 0) * 1000) },
        ];
        return next.slice(-MAX_HISTORY_POINTS);
      });
    });

    socket.on("bottleneck_alert", () => {
      setRerouteApplied(false);
    });

    socket.on("bottleneck_cleared", () => {
      setBottlenecks([]);
      setRerouteApplied(false);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [backendAvailable]);

  // --- controls ---------------------------------------------------------
  const startSimulation = useCallback(
    (numAgents = 500) => {
      if (!backendAvailable || !socketRef.current || !venue) return;
      setDensityHistory([]);
      setRerouteApplied(false);
      socketRef.current.emit("start_simulation", { venue, num_agents: numAgents });
      setRunning(true);
    },
    [backendAvailable, venue]
  );

  const stopSimulation = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit("stop_simulation", {});
    }
    setRunning(false);
  }, []);

  const applyRerouting = useCallback(() => {
    // The backend already reroutes automatically each physics step once
    // a bottleneck is detected; this flags it as acknowledged in the UI
    // and is what visually snaps the recommended path onto the map.
    setRerouteApplied(true);
  }, []);

  const primaryBottleneck = bottlenecks.length > 0 ? bottlenecks[0] : null;

  return {
    backendAvailable,     // null = checking, true/false once known
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
    stats,
    densityHistory,
    simTime,
    rerouteApplied,
    startSimulation,
    stopSimulation,
    applyRerouting,
    mockBottleneck: MOCK_BOTTLENECK,
  };
}
