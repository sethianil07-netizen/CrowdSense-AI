import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import {
  MOCK_VENUE,
  MOCK_STATS,
  MOCK_BOTTLENECK,
  MOCK_DENSITY_HISTORY,
  generateMockAgents,
} from "../data/mockData";

// Local development:
//   http://localhost:8000
//
// Production:
//   VITE_BACKEND_URL points to the persistent Render backend.
//
// If VITE_BACKEND_URL is empty, production falls back to the same-origin
// Vercel backend.
const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ??
  (import.meta.env.DEV ? "http://localhost:8000" : "");

// Vercel uses /api/socket.io.
// Render uses the normal /socket.io endpoint.
//
// When VITE_BACKEND_URL is set, use Render's normal Socket.IO path.
// Otherwise use Vercel's /api/socket.io route.
const SOCKET_PATH =
  import.meta.env.VITE_SOCKET_PATH ??
  (BACKEND_URL ? "/socket.io" : "/api/socket.io");

const MAX_HISTORY_POINTS = 40;

export function useCrowdSim() {
  const [connected, setConnected] = useState(false);
  const [backendAvailable, setBackendAvailable] = useState(null);
  const [venues, setVenues] = useState([]);
  const [selectedVenueId, setSelectedVenueId] = useState(null);
  const [venue, setVenue] = useState(MOCK_VENUE);
  const [running, setRunning] = useState(false);
  const [agents, setAgents] = useState(() =>
    generateMockAgents(MOCK_VENUE)
  );
  const [bottlenecks, setBottlenecks] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [stats, setStats] = useState(MOCK_STATS);
  const [densityHistory, setDensityHistory] =
    useState(MOCK_DENSITY_HISTORY);
  const [simTime, setSimTime] = useState(0);
  const [rerouteApplied, setRerouteApplied] = useState(false);

  const socketRef = useRef(null);

  // -------------------------------------------------------------------
  // Fetch venue list
  // -------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    fetch(`${BACKEND_URL}/api/venues`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            `Venue request failed: ${response.status}`
          );
        }

        return response.json();
      })
      .then((data) => {
        if (cancelled) return;

        const venueList = data.venues || [];

        setVenues(venueList);
        setBackendAvailable(true);

        if (venueList.length > 0) {
          setSelectedVenueId(venueList[0].id);
        }
      })
      .catch((error) => {
        console.error(
          "Backend venue request failed:",
          error
        );

        if (!cancelled) {
          setBackendAvailable(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // -------------------------------------------------------------------
  // Fetch selected venue layout
  // -------------------------------------------------------------------
  useEffect(() => {
    if (!selectedVenueId || !backendAvailable) {
      return;
    }

    let cancelled = false;

    fetch(`${BACKEND_URL}/api/venue/${selectedVenueId}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            `Venue detail request failed: ${response.status}`
          );
        }

        return response.json();
      })
      .then((data) => {
        if (!cancelled) {
          setVenue(data);
        }
      })
      .catch((error) => {
        console.error(
          "Venue detail request failed:",
          error
        );
      });

    return () => {
      cancelled = true;
    };
  }, [selectedVenueId, backendAvailable]);

  // -------------------------------------------------------------------
  // Socket.IO lifecycle
  // -------------------------------------------------------------------
  useEffect(() => {
    if (!backendAvailable) {
      return;
    }

    const socket = io(BACKEND_URL || undefined, {
      path: SOCKET_PATH,

      // Start with polling because this is confirmed to work on Render.
      // Socket.IO can then upgrade the connection to WebSocket.
      transports: ["polling", "websocket"],

      // Let Socket.IO try another transport if the first transport fails.
      tryAllTransports: true,

      // Allow normal polling -> WebSocket upgrade.
      upgrade: true,

      // Keep the connection alive.
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    socketRef.current = socket;

    console.log(
      "CrowdSense backend:",
      BACKEND_URL || window.location.origin
    );

    console.log(
      "CrowdSense Socket.IO path:",
      SOCKET_PATH
    );

    socket.on("connect", () => {
      console.log(
        "Socket.IO connected:",
        socket.id
      );

      setConnected(true);
    });

    socket.on("disconnect", (reason) => {
      console.warn(
        "Socket.IO disconnected:",
        reason
      );

      setConnected(false);
    });

    socket.on("connect_error", (error) => {
      console.error(
        "Socket.IO connection error:",
        error
      );

      setConnected(false);
    });

    socket.on("simulation_started", (data) => {
      console.log(
        "Simulation started:",
        data
      );

      setRunning(true);
    });

    socket.on("simulation_stopped", () => {
      console.log("Simulation stopped");

      setRunning(false);
    });

    // -----------------------------------------------------------------
    // Live simulation updates
    // -----------------------------------------------------------------
    socket.on("simulation_update", (state) => {
      setAgents(state.agents || []);

      setBottlenecks(
        state.bottlenecks || []
      );

      setRoutes(
        state.routes || []
      );

      setSimTime(
        state.sim_time || 0
      );

      setStats({
        total_agents:
          state.total_agents ?? 0,

        density:
          state.density ?? 0,

        risk:
          state.risk ?? "LOW",

        high_risk_zones:
          (state.bottlenecks || []).length,

        avg_flow:
          Math.round(
            (state.total_agents || 0) *
              0.02 *
              60
          ) / 60,
      });

      setDensityHistory((previous) => {
        const next = [
          ...previous,
          {
            t:
              state.sim_time?.toFixed(1) ??
              previous.length,

            density: Math.round(
              (state.density || 0) * 1000
            ),
          },
        ];

        return next.slice(
          -MAX_HISTORY_POINTS
        );
      });
    });

    // -----------------------------------------------------------------
    // Bottleneck events
    // -----------------------------------------------------------------
    socket.on(
      "bottleneck_alert",
      (data) => {
        console.log(
          "BOTTLENECK DETECTED:",
          data
        );

        setBottlenecks(
          data?.bottlenecks || []
        );

        setRerouteApplied(false);
      }
    );

    socket.on(
      "bottleneck_cleared",
      () => {
        console.log(
          "Bottleneck cleared"
        );

        setBottlenecks([]);
        setRerouteApplied(false);
      }
    );

    // -----------------------------------------------------------------
    // Reroute events
    // -----------------------------------------------------------------
    socket.on(
      "reroute_suggestion",
      (data) => {
        console.log(
          "Reroute suggestion:",
          data
        );

        setRoutes(
          data?.routes || []
        );
      }
    );

    // -----------------------------------------------------------------
    // Backend errors
    // -----------------------------------------------------------------
    socket.on("error", (data) => {
      console.error(
        "Backend simulation error:",
        data
      );
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [backendAvailable]);

  // -------------------------------------------------------------------
  // Start simulation
  // -------------------------------------------------------------------
  const startSimulation = useCallback(
    (numAgents = 500) => {
      if (
        !backendAvailable ||
        !socketRef.current ||
        !venue
      ) {
        console.warn(
          "Cannot start simulation: backend not ready"
        );

        return;
      }

      console.log(
        "Starting simulation with",
        numAgents,
        "agents"
      );

      setDensityHistory([]);
      setBottlenecks([]);
      setRoutes([]);
      setSimTime(0);
      setRerouteApplied(false);

      socketRef.current.emit(
        "start_simulation",
        {
          venue,
          num_agents: numAgents,
        }
      );

      setRunning(true);
    },
    [
      backendAvailable,
      venue,
    ]
  );

  // -------------------------------------------------------------------
  // Stop simulation
  // -------------------------------------------------------------------
  const stopSimulation = useCallback(
    () => {
      if (socketRef.current) {
        socketRef.current.emit(
          "stop_simulation",
          {}
        );
      }

      setRunning(false);
    },
    []
  );

  // -------------------------------------------------------------------
  // Apply rerouting in UI
  // -------------------------------------------------------------------
  const applyRerouting = useCallback(
    () => {
      setRerouteApplied(true);
    },
    []
  );

  const primaryBottleneck =
    bottlenecks.length > 0
      ? bottlenecks[0]
      : null;

  return {
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

    stats,
    densityHistory,
    simTime,

    rerouteApplied,

    startSimulation,
    stopSimulation,
    applyRerouting,

    mockBottleneck:
      MOCK_BOTTLENECK,
  };
}