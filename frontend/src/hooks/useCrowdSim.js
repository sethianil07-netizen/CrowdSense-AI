import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { io } from "socket.io-client";

import {
  MOCK_VENUE,
  MOCK_STATS,
  MOCK_BOTTLENECK,
  MOCK_DENSITY_HISTORY,
  generateMockAgents,
} from "../data/mockData";

const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ??
  (import.meta.env.DEV
    ? "http://localhost:8000"
    : "");

const SOCKET_PATH =
  import.meta.env.VITE_SOCKET_PATH ??
  "/api/socket.io";

const MAX_HISTORY_POINTS = 40;

export function useCrowdSim() {
  const [connected, setConnected] =
    useState(false);

  const [backendAvailable, setBackendAvailable] =
    useState(null);

  const [venues, setVenues] =
    useState([]);

  const [selectedVenueId, setSelectedVenueId] =
    useState(null);

  const [venue, setVenue] =
    useState(MOCK_VENUE);

  const [running, setRunning] =
    useState(false);

  const [agents, setAgents] =
    useState(() =>
      generateMockAgents(
        MOCK_VENUE
      )
    );

  const [bottlenecks, setBottlenecks] =
    useState([]);

  const [routes, setRoutes] =
    useState([]);

  const [appliedRoutes, setAppliedRoutes] =
    useState([]);

  const latestRoutesRef =
    useRef([]);

  const [stats, setStats] =
    useState(MOCK_STATS);

  const [densityHistory, setDensityHistory] =
    useState(
      MOCK_DENSITY_HISTORY
    );

  const [simTime, setSimTime] =
    useState(0);

  const [rerouteApplied, setRerouteApplied] =
    useState(false);

  const [surgeActive, setSurgeActive] =
    useState(false);

  const socketRef =
    useRef(null);

  // ---------------------------------------------------------------
  // Venues
  // ---------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    fetch(
      `${BACKEND_URL}/api/venues`
    )
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

        setVenues(
          venueList
        );

        setBackendAvailable(
          true
        );

        if (
          venueList.length > 0
        ) {
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
          setBackendAvailable(
            false
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // ---------------------------------------------------------------
  // Selected venue
  // ---------------------------------------------------------------

  useEffect(() => {
    if (
      !selectedVenueId ||
      !backendAvailable
    ) {
      return;
    }

    let cancelled = false;

    fetch(
      `${BACKEND_URL}/api/venue/${selectedVenueId}`
    )
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

  // ---------------------------------------------------------------
  // Socket.IO
  // ---------------------------------------------------------------

  useEffect(() => {
    if (!backendAvailable) {
      return;
    }

    const socket = io(
      BACKEND_URL || undefined,
      {
        path: SOCKET_PATH,
        transports: [
          "polling",
          "websocket",
        ],
        tryAllTransports: true,
        upgrade: true,
        reconnection: true,
        reconnectionAttempts:
          Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
      }
    );

    socketRef.current = socket;

    socket.on(
      "connect",
      () => {
        console.log(
          "Socket.IO connected:",
          socket.id
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

    socket.on(
      "simulation_stopped",
      () => {
        setRunning(false);

        setRoutes([]);
        setAppliedRoutes([]);
        setBottlenecks([]);
        setRerouteApplied(false);
        setSurgeActive(false);

        latestRoutesRef.current = [];
      }
    );

    socket.on(
      "crowd_surge_triggered",
      (data) => {
        console.log(
          "Crowd surge triggered:",
          data
        );

        setSurgeActive(true);
      }
    );

    socket.on(
      "simulation_update",
      (state) => {
        setAgents(
          state?.agents || []
        );

        setBottlenecks(
          state?.bottlenecks || []
        );

        if (
          Array.isArray(
            state?.routes
          )
        ) {
          setRoutes(
            state.routes
          );

          if (
            state.routes.length > 0
          ) {
            latestRoutesRef.current = [
              ...state.routes,
            ];
          }
        }

        setSimTime(
          state?.sim_time || 0
        );

        setStats({
          total_agents:
            state?.total_agents ?? 0,

          density:
            state?.density ?? 0,

          risk:
            state?.risk ?? "LOW",

          high_risk_zones:
            (
              state?.bottlenecks ||
              []
            ).length,

          avg_flow:
            Math.round(
              (
                state?.total_agents ||
                0
              ) *
                0.02 *
                60
            ) / 60,
        });

        setDensityHistory(
          (previous) => {
            const next = [
              ...previous,
              {
                t:
                  state?.sim_time?.toFixed(
                    1
                  ) ??
                  previous.length,

                density:
                  Math.round(
                    (
                      state?.density ||
                      0
                    ) * 1000
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

    socket.on(
      "bottleneck_alert",
      (data) => {
        setBottlenecks(
          data?.bottlenecks || []
        );

        setRerouteApplied(false);
      }
    );

    socket.on(
      "bottleneck_cleared",
      () => {
        setBottlenecks([]);
        setRerouteApplied(false);
      }
    );

    socket.on(
      "reroute_suggestion",
      (data) => {
        if (
          Array.isArray(
            data?.routes
          ) &&
          data.routes.length > 0
        ) {
          const freshRoutes = [
            ...data.routes,
          ];

          setRoutes(
            freshRoutes
          );

          latestRoutesRef.current =
            freshRoutes;
        }
      }
    );

    socket.on(
      "error",
      (data) => {
        console.error(
          "Backend simulation error:",
          data
        );
      }
    );

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [backendAvailable]);

  // ---------------------------------------------------------------
  // Start
  // ---------------------------------------------------------------

  const startSimulation =
    useCallback(
      (numAgents = 500) => {
        if (
          !backendAvailable ||
          !socketRef.current ||
          !venue
        ) {
          return;
        }

        setRoutes([]);
        setAppliedRoutes([]);
        setBottlenecks([]);
        setDensityHistory([]);
        setSimTime(0);
        setRerouteApplied(false);
        setSurgeActive(false);

        latestRoutesRef.current = [];

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

  // ---------------------------------------------------------------
  // MULTI-LOCATION CROWD SURGE
  // ---------------------------------------------------------------

  const crowdSurge =
    useCallback(
      (surgeLocations) => {
        if (
          !backendAvailable ||
          !socketRef.current ||
          !running
        ) {
          return;
        }

        if (
          !Array.isArray(
            surgeLocations
          ) ||
          surgeLocations.length === 0
        ) {
          console.warn(
            "No surge locations selected."
          );
          return;
        }

        const locations =
          surgeLocations.map(
            (location) => ({
              id: location.id,
              x: location.x,
              y: location.y,
            })
          );

        console.log(
          "Triggering multi-location crowd surge:",
          locations
        );

        socketRef.current.emit(
          "crowd_surge",
          {
            locations,
            fraction: 0.70,
            radius: 1.4,
          }
        );
      },
      [
        backendAvailable,
        running,
      ]
    );

  // ---------------------------------------------------------------
  // Stop
  // ---------------------------------------------------------------

  const stopSimulation =
    useCallback(() => {
      if (
        socketRef.current
      ) {
        socketRef.current.emit(
          "stop_simulation",
          {}
        );
      }

      setRunning(false);
      setRoutes([]);
      setAppliedRoutes([]);
      setBottlenecks([]);
      setRerouteApplied(false);
      setSurgeActive(false);

      latestRoutesRef.current = [];
    }, []);

  // ---------------------------------------------------------------
  // Apply rerouting
  // ---------------------------------------------------------------

  const applyRerouting =
    useCallback(() => {
      const candidateRoutes =
        latestRoutesRef.current;

      if (
        Array.isArray(
          candidateRoutes
        ) &&
        candidateRoutes.length > 0
      ) {
        setAppliedRoutes(
          [...candidateRoutes]
        );

        setRerouteApplied(
          true
        );

        return;
      }

      if (
        Array.isArray(routes) &&
        routes.length > 0
      ) {
        setAppliedRoutes(
          [...routes]
        );

        setRerouteApplied(
          true
        );

        latestRoutesRef.current = [
          ...routes,
        ];
      }
    }, [routes]);

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

    mockBottleneck:
      MOCK_BOTTLENECK,
  };
}