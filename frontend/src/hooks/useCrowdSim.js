import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

import {
  MOCK_VENUE,
  MOCK_STATS,
  MOCK_BOTTLENECK,
  MOCK_DENSITY_HISTORY,
  generateMockAgents,
} from "../data/mockData";

// -------------------------------------------------------------------
// Backend configuration
// -------------------------------------------------------------------
//
// Local development:
//   http://localhost:8000
//
// Production:
//   VITE_BACKEND_URL should contain the Render backend URL:
//
//   https://crowdsense-backend-cdaz.onrender.com
//
// When no production URL is supplied, the deployed Vercel version
// can still use the same-origin backend.
// -------------------------------------------------------------------

const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ??
  (import.meta.env.DEV
    ? "http://localhost:8000"
    : "");

// -------------------------------------------------------------------
// Socket.IO configuration
// -------------------------------------------------------------------
//
// The deployed Render backend has been verified to respond successfully
// at:
//
//   /api/socket.io/?EIO=4&transport=polling
//
// Therefore the frontend must use /api/socket.io.
//
// VITE_SOCKET_PATH can override this if necessary, but the default is
// deliberately /api/socket.io.
// -------------------------------------------------------------------

const SOCKET_PATH =
  import.meta.env.VITE_SOCKET_PATH ??
  "/api/socket.io";

const MAX_HISTORY_POINTS = 40;

// -------------------------------------------------------------------
// Hook
// -------------------------------------------------------------------

export function useCrowdSim() {
  const [connected, setConnected] = useState(false);

  // null = still checking
  // true = backend reachable
  // false = backend unavailable
  const [backendAvailable, setBackendAvailable] =
    useState(null);

  const [venues, setVenues] = useState([]);
  const [selectedVenueId, setSelectedVenueId] =
    useState(null);

  const [venue, setVenue] =
    useState(MOCK_VENUE);

  const [running, setRunning] =
    useState(false);

  const [agents, setAgents] = useState(() =>
    generateMockAgents(MOCK_VENUE)
  );

  const [bottlenecks, setBottlenecks] =
    useState([]);

  const [routes, setRoutes] =
    useState([]);

  const [stats, setStats] =
    useState(MOCK_STATS);

  const [densityHistory, setDensityHistory] =
    useState(MOCK_DENSITY_HISTORY);

  const [simTime, setSimTime] =
    useState(0);

  const [rerouteApplied, setRerouteApplied] =
    useState(false);

  const socketRef = useRef(null);

  // -----------------------------------------------------------------
  // Fetch venue list
  // -----------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    const venuesUrl =
      `${BACKEND_URL}/api/venues`;

    console.log(
      "CrowdSense backend:",
      BACKEND_URL || window.location.origin
    );

    console.log(
      "CrowdSense REST venues URL:",
      venuesUrl
    );

    fetch(venuesUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            `Venue request failed: ${response.status}`
          );
        }

        return response.json();
      })
      .then((data) => {
        if (cancelled) {
          return;
        }

        const venueList =
          data?.venues || [];

        setVenues(venueList);

        setBackendAvailable(true);

        if (venueList.length > 0) {
          setSelectedVenueId(
            venueList[0].id
          );
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

  // -----------------------------------------------------------------
  // Fetch selected venue layout
  // -----------------------------------------------------------------

  useEffect(() => {
    if (
      !selectedVenueId ||
      !backendAvailable
    ) {
      return;
    }

    let cancelled = false;

    const venueUrl =
      `${BACKEND_URL}/api/venue/${selectedVenueId}`;

    console.log(
      "Fetching venue:",
      venueUrl
    );

    fetch(venueUrl)
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
  }, [
    selectedVenueId,
    backendAvailable,
  ]);

  // -----------------------------------------------------------------
  // Socket.IO lifecycle
  // -----------------------------------------------------------------

  useEffect(() => {
    if (!backendAvailable) {
      return;
    }

    console.log(
      "Connecting Socket.IO to:",
      BACKEND_URL || window.location.origin
    );

    console.log(
      "Socket.IO path:",
      SOCKET_PATH
    );

    const socket = io(
      BACKEND_URL || undefined,
      {
        path: SOCKET_PATH,

        // Start with polling because the Render
        // backend has been verified to support it.
        //
        // Socket.IO can then upgrade to WebSocket.
        transports: [
          "polling",
          "websocket",
        ],

        // Let Socket.IO attempt another transport
        // if the first one fails.
        tryAllTransports: true,

        // Allow polling -> websocket upgrade.
        upgrade: true,

        // Keep reconnecting if the connection drops.
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,

        timeout: 20000,
      }
    );

    socketRef.current = socket;

    // ---------------------------------------------------------------
    // Connection events
    // ---------------------------------------------------------------

    socket.on(
      "connect",
      () => {
        console.log(
          "Socket.IO connected:",
          socket.id
        );

        console.log(
          "Socket.IO transport:",
          socket.io.engine.transport.name
        );

        setConnected(true);
      }
    );

    socket.on(
      "disconnect",
      (reason) => {
        console.warn(
          "Socket.IO disconnected:",
          reason
        );

        setConnected(false);
      }
    );

    socket.on(
      "connect_error",
      (error) => {
        console.error(
          "Socket.IO connection error:",
          error
        );

        setConnected(false);
      }
    );

    // ---------------------------------------------------------------
    // Transport upgrade
    // ---------------------------------------------------------------

    socket.io.engine?.on(
      "upgrade",
      (transport) => {
        console.log(
          "Socket.IO upgraded transport to:",
          transport.name
        );
      }
    );

    // ---------------------------------------------------------------
    // Simulation started
    // ---------------------------------------------------------------

    socket.on(
      "simulation_started",
      (data) => {
        console.log(
          "Simulation started:",
          data
        );

        setRunning(true);
      }
    );

    // ---------------------------------------------------------------
    // Simulation stopped
    // ---------------------------------------------------------------

    socket.on(
      "simulation_stopped",
      () => {
        console.log(
          "Simulation stopped"
        );

        setRunning(false);
      }
    );

    // ---------------------------------------------------------------
    // Live simulation update
    // ---------------------------------------------------------------

    socket.on(
      "simulation_update",
      (state) => {
        // Live agents
        setAgents(
          state?.agents || []
        );

        // Live bottlenecks
        setBottlenecks(
          state?.bottlenecks || []
        );

        // Live reroute paths
        setRoutes(
          state?.routes || []
        );

        // Live simulation clock
        setSimTime(
          state?.sim_time || 0
        );

        // Live dashboard statistics
        setStats({
          total_agents:
            state?.total_agents ?? 0,

          density:
            state?.density ?? 0,

          risk:
            state?.risk ?? "LOW",

          high_risk_zones:
            (
              state?.bottlenecks || []
            ).length,

          // Keep the existing dashboard
          // flow calculation.
          avg_flow:
            Math.round(
              (state?.total_agents || 0) *
                0.02 *
                60
            ) / 60,
        });

        // Live density history
        setDensityHistory(
          (previous) => {
            const next = [
              ...previous,
              {
                t:
                  state?.sim_time?.toFixed(1) ??
                  previous.length,

                density:
                  Math.round(
                    (state?.density || 0) *
                      1000
                  ),
              },
            ];

            return next.slice(
              -MAX_HISTORY_POINTS
            );
          }
        );
      }
    );

    // ---------------------------------------------------------------
    // Bottleneck detected
    // ---------------------------------------------------------------

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

    // ---------------------------------------------------------------
    // Bottleneck cleared
    // ---------------------------------------------------------------

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

    // ---------------------------------------------------------------
    // Reroute suggestion
    // ---------------------------------------------------------------

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

    // ---------------------------------------------------------------
    // Backend/socket errors
    // ---------------------------------------------------------------

    socket.on(
      "error",
      (data) => {
        console.error(
          "Backend simulation error:",
          data
        );
      }
    );

    // ---------------------------------------------------------------
    // Cleanup
    // ---------------------------------------------------------------

    return () => {
      console.log(
        "Cleaning up Socket.IO connection"
      );

      socket.disconnect();

      socketRef.current = null;
    };
  }, [backendAvailable]);

  // -----------------------------------------------------------------
  // Start simulation
  // -----------------------------------------------------------------

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
        "Starting simulation with:",
        numAgents,
        "agents"
      );

      // Reset live UI state
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

  // -----------------------------------------------------------------
  // Stop simulation
  // -----------------------------------------------------------------

  const stopSimulation = useCallback(
    () => {
      console.log(
        "Stopping simulation"
      );

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

  // -----------------------------------------------------------------
  // Apply rerouting
  // -----------------------------------------------------------------

  const applyRerouting = useCallback(
    () => {
      setRerouteApplied(true);
    },
    []
  );

  // -----------------------------------------------------------------
  // Primary bottleneck
  // -----------------------------------------------------------------

  const primaryBottleneck =
    bottlenecks.length > 0
      ? bottlenecks[0]
      : null;

  // -----------------------------------------------------------------
  // Hook return
  // -----------------------------------------------------------------

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