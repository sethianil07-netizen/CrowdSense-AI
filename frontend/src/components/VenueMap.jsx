import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  DoorOpen,
  LogOut,
  UtensilsCrossed,
} from "lucide-react";

const MAX_RENDERED_AGENTS = 700;
const MAX_RENDERED_ROUTES = 40;

function severityColor(
  severity
) {
  if (severity > 0.66) {
    return "#FF5568";
  }

  if (severity > 0.33) {
    return "#F2B44D";
  }

  return "#4FD1FF";
}

function gateColor(
  gate,
  bottlenecks
) {
  const near =
    bottlenecks.find(
      (bottleneck) =>
        Math.hypot(
          bottleneck.x -
            gate.x,
          bottleneck.y -
            gate.y
        ) < 12
    );

  if (!near) {
    return "#2BD576";
  }

  if (near.severity > 0.66) {
    return "#FF5568";
  }

  if (near.severity > 0.33) {
    return "#F2B44D";
  }

  return "#2BD576";
}

export default function VenueMap({
  venue,
  agents,
  bottlenecks,
  routes,
  rerouteApplied,
}) {
  const {
    width,
    height,
  } = venue;

  const canvasRef =
    useRef(null);

  const containerRef =
    useRef(null);

  const [canvasSize, setCanvasSize] =
    useState({
      width: 0,
      height: 0,
    });

  // ---------------------------------------------------------------
  // Track map size
  // ---------------------------------------------------------------

  useEffect(() => {
    const container =
      containerRef.current;

    if (!container) {
      return;
    }

    const updateSize = () => {
      const rect =
        container.getBoundingClientRect();

      setCanvasSize({
        width: rect.width,
        height: rect.height,
      });
    };

    updateSize();

    const observer =
      new ResizeObserver(
        updateSize
      );

    observer.observe(
      container
    );

    return () => {
      observer.disconnect();
    };
  }, []);

  // ---------------------------------------------------------------
  // Sample agents
  // ---------------------------------------------------------------

  const sampledAgents =
    useMemo(() => {
      if (
        !agents ||
        agents.length <=
          MAX_RENDERED_AGENTS
      ) {
        return agents || [];
      }

      const step =
        Math.ceil(
          agents.length /
            MAX_RENDERED_AGENTS
        );

      return agents.filter(
        (_, index) =>
          index % step === 0
      );
    }, [agents]);

  // ---------------------------------------------------------------
  // Deduplicate route paths
  // ---------------------------------------------------------------

  const dedupedRoutes =
    useMemo(() => {
      if (!routes?.length) {
        return [];
      }

      const seen = new Map();

      for (const route of routes) {
        const key = (
          route.new_path || []
        )
          .map(
            ([x, y]) =>
              `${Math.round(
                x
              )},${Math.round(y)}`
          )
          .join("|");

        if (!seen.has(key)) {
          seen.set(
            key,
            route
          );
        }

        if (
          seen.size >=
          MAX_RENDERED_ROUTES
        ) {
          break;
        }
      }

      return Array.from(
        seen.values()
      );
    }, [routes]);

  // ---------------------------------------------------------------
  // Canvas crowd
  // ---------------------------------------------------------------

  useEffect(() => {
    const canvas =
      canvasRef.current;

    if (
      !canvas ||
      !canvasSize.width ||
      !canvasSize.height
    ) {
      return;
    }

    const context =
      canvas.getContext(
        "2d"
      );

    if (!context) {
      return;
    }

    const dpr =
      window.devicePixelRatio ||
      1;

    const cssWidth =
      canvasSize.width;

    const cssHeight =
      canvasSize.height;

    canvas.width =
      Math.round(
        cssWidth * dpr
      );

    canvas.height =
      Math.round(
        cssHeight * dpr
      );

    canvas.style.width =
      `${cssWidth}px`;

    canvas.style.height =
      `${cssHeight}px`;

    context.setTransform(
      dpr,
      0,
      0,
      dpr,
      0,
      0
    );

    context.clearRect(
      0,
      0,
      cssWidth,
      cssHeight
    );

    const viewBoxWidth =
      width + 12;

    const viewBoxHeight =
      height + 12;

    const scale =
      Math.min(
        cssWidth /
          viewBoxWidth,
        cssHeight /
          viewBoxHeight
      );

    const renderedWidth =
      viewBoxWidth * scale;

    const renderedHeight =
      viewBoxHeight * scale;

    const offsetX =
      (
        cssWidth -
        renderedWidth
      ) / 2;

    const offsetY =
      (
        cssHeight -
        renderedHeight
      ) / 2;

    const mapX = (x) =>
      offsetX +
      (x + 6) * scale;

    const mapY = (y) =>
      offsetY +
      (y + 6) * scale;

    const radius =
      Math.min(
        width,
        height
      ) *
      0.0035 *
      scale;

    context.fillStyle =
      "#EAF0F7";

    context.globalAlpha = 0.45;

    context.beginPath();

    for (
      const agent of sampledAgents
    ) {
      if (
        typeof agent.x !==
          "number" ||
        typeof agent.y !==
          "number"
      ) {
        continue;
      }

      const x =
        mapX(agent.x);

      const y =
        mapY(agent.y);

      context.moveTo(
        x + radius,
        y
      );

      context.arc(
        x,
        y,
        Math.max(
          0.8,
          radius
        ),
        0,
        Math.PI * 2
      );
    }

    context.fill();
    context.globalAlpha = 1;
  }, [
    sampledAgents,
    canvasSize,
    width,
    height,
  ]);

  const strokeW =
    Math.max(
      width,
      height
    ) * 0.004;

  return (
    <div
      ref={containerRef}
      className="relative rounded-lg border border-ink-border bg-ink-panel overflow-hidden grid-floor"
    >
      {/* -----------------------------------------------------------
          Header
      ----------------------------------------------------------- */}

      <div className="absolute top-3 left-4 z-20 flex items-center gap-2">
        <span className="text-[11px] font-body font-medium uppercase tracking-wider text-text-muted">
          Venue Map
        </span>

        <span className="text-[11px] font-mono text-text-faint">
          {venue.name} · {width}m ×{" "}
          {height}m
        </span>
      </div>

      {/* -----------------------------------------------------------
          SVG map
      ----------------------------------------------------------- */}

      <svg
        viewBox={`-6 -6 ${
          width + 12
        } ${
          height + 12
        }`}
        className="w-full h-full min-h-[420px]"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Venue boundary */}

        <rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill="none"
          stroke="#22314A"
          strokeWidth={strokeW}
          rx={width * 0.01}
        />

        {/* Obstacles */}

        {venue.obstacles?.map(
          (
            obstacle,
            index
          ) => (
            <g
              key={`obs-${index}`}
            >
              <rect
                x={obstacle.x}
                y={obstacle.y}
                width={
                  obstacle.width
                }
                height={
                  obstacle.height
                }
                rx={
                  Math.min(
                    obstacle.width,
                    obstacle.height
                  ) * 0.15
                }
                fill="#182339"
                stroke="#2E4064"
                strokeWidth={
                  strokeW * 0.7
                }
              />

              <text
                x={
                  obstacle.x +
                  obstacle.width /
                    2
                }
                y={
                  obstacle.y +
                  obstacle.height /
                    2
                }
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={
                  Math.min(
                    width,
                    height
                  ) * 0.018
                }
                fill="#7C8AA3"
                fontFamily="Inter, sans-serif"
              >
                {
                  obstacle.label
                }
              </text>
            </g>
          )
        )}

        {/* Concessions */}

        {venue.concessions?.map(
          (concession) => (
            <circle
              key={
                concession.id
              }
              cx={concession.x}
              cy={concession.y}
              r={
                Math.min(
                  width,
                  height
                ) * 0.006
              }
              fill="#F2B44D"
              opacity={0.5}
            />
          )
        )}

        {/* ---------------------------------------------------------
            Persistent reroute visualization
        --------------------------------------------------------- */}

        {rerouteApplied &&
          dedupedRoutes.map(
            (
              route,
              index
            ) => {
              const points = (
                route.new_path ||
                []
              )
                .map(
                  ([x, y]) =>
                    `${x},${y}`
                )
                .join(" ");

              return (
                <g
                  key={`route-group-${route.agent_id}-${index}`}
                >
                  {/* Soft glow underneath */}

                  <polyline
                    points={points}
                    fill="none"
                    stroke="#1AA8FF"
                    strokeWidth={
                      strokeW * 2.0
                    }
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={0.18}
                  />

                  {/* Main route */}

                  <polyline
                    points={points}
                    fill="none"
                    stroke="#4FD1FF"
                    strokeWidth={
                      strokeW * 1.25
                    }
                    strokeDasharray="6 3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={0.95}
                    className="animate-flow-dash"
                  />
                </g>
              );
            }
          )}

        {/* Bottleneck zones */}

        {bottlenecks.map(
          (
            bottleneck,
            index
          ) => (
            <g
              key={`bn-${index}`}
            >
              <circle
                cx={bottleneck.x}
                cy={bottleneck.y}
                r={
                  Math.min(
                    width,
                    height
                  ) * 0.02
                }
                fill={severityColor(
                  bottleneck.severity
                )}
                opacity={0.85}
              />

              <circle
                cx={bottleneck.x}
                cy={bottleneck.y}
                r={
                  Math.min(
                    width,
                    height
                  ) * 0.02
                }
                fill="none"
                stroke={severityColor(
                  bottleneck.severity
                )}
                strokeWidth={strokeW}
                className="animate-sonar-ping origin-center"
                style={{
                  transformOrigin:
                    `${bottleneck.x}px ${bottleneck.y}px`,
                }}
              />
            </g>
          )
        )}

        {/* Entry gates */}

        {venue.entry_points?.map(
          (gate) => (
            <g
              key={gate.id}
            >
              <circle
                cx={gate.x}
                cy={gate.y}
                r={
                  Math.min(
                    width,
                    height
                  ) * 0.018
                }
                fill={gateColor(
                  gate,
                  bottlenecks
                )}
                opacity={0.9}
              />

              <text
                x={gate.x}
                y={
                  gate.y -
                  Math.min(
                    width,
                    height
                  ) * 0.028
                }
                textAnchor="middle"
                fontSize={
                  Math.min(
                    width,
                    height
                  ) * 0.02
                }
                fontWeight={600}
                fill="#EAF0F7"
                fontFamily="'JetBrains Mono', monospace"
              >
                {gate.label}
              </text>
            </g>
          )
        )}

        {/* Exit gates */}

        {venue.exit_points?.map(
          (exit) => (
            <g
              key={exit.id}
            >
              <rect
                x={
                  exit.x -
                  Math.min(
                    width,
                    height
                  ) * 0.012
                }
                y={
                  exit.y -
                  Math.min(
                    width,
                    height
                  ) * 0.012
                }
                width={
                  Math.min(
                    width,
                    height
                  ) * 0.024
                }
                height={
                  Math.min(
                    width,
                    height
                  ) * 0.024
                }
                fill="#4FD1FF"
                opacity={0.75}
                rx={
                  Math.min(
                    width,
                    height
                  ) * 0.004
                }
              />
            </g>
          )
        )}
      </svg>

      {/* Canvas crowd layer */}

      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />

      {/* Legend */}

      <div className="absolute bottom-3 right-4 z-20 flex items-center gap-4 text-[10px] font-mono text-text-faint">
        <span className="flex items-center gap-1">
          <DoorOpen className="w-3 h-3" />
          Gate
        </span>

        <span className="flex items-center gap-1">
          <LogOut className="w-3 h-3" />
          Exit
        </span>

        <span className="flex items-center gap-1">
          <UtensilsCrossed className="w-3 h-3" />
          Concession
        </span>
      </div>
    </div>
  );
}