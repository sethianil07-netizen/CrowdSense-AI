import { useMemo } from "react";
import { DoorOpen, LogOut, UtensilsCrossed } from "lucide-react";

const MAX_RENDERED_AGENTS = 700; // render cap for browser performance
const MAX_RENDERED_ROUTES = 40;  // cap distinct route lines drawn, even if backend sends more

function severityColor(severity) {
  if (severity > 0.66) return "#FF5568";
  if (severity > 0.33) return "#F2B44D";
  return "#4FD1FF";
}

function gateColor(gate, bottlenecks) {
  const near = bottlenecks.find(
    (b) => Math.hypot(b.x - gate.x, b.y - gate.y) < 12
  );
  if (!near) return "#2BD576";
  if (near.severity > 0.66) return "#FF5568";
  if (near.severity > 0.33) return "#F2B44D";
  return "#2BD576";
}

export default function VenueMap({ venue, agents, bottlenecks, routes, rerouteApplied }) {
  const { width, height } = venue;

  const sampledAgents = useMemo(() => {
    if (agents.length <= MAX_RENDERED_AGENTS) return agents;
    const step = Math.ceil(agents.length / MAX_RENDERED_AGENTS);
    return agents.filter((_, i) => i % step === 0);
  }, [agents]);

  // Densely packed agents heading to the same congested zone almost
  // always get near-identical reroute paths from the backend. Rendering
  // one animated <polyline> per agent (which could be hundreds, even
  // capped server-side at 300) is unnecessary DOM/animation load for a
  // visual that looks the same either way — so we dedupe by rounded
  // path shape and cap the distinct lines actually drawn.
  const dedupedRoutes = useMemo(() => {
    if (!routes?.length) return [];
    const seen = new Map();
    for (const route of routes) {
      const key = route.new_path.map(([x, y]) => `${Math.round(x)},${Math.round(y)}`).join("|");
      if (!seen.has(key)) seen.set(key, route);
      if (seen.size >= MAX_RENDERED_ROUTES) break;
    }
    return Array.from(seen.values());
  }, [routes]);

  const strokeW = Math.max(width, height) * 0.004;

  return (
    <div className="relative rounded-lg border border-ink-border bg-ink-panel overflow-hidden grid-floor">
      <div className="absolute top-3 left-4 z-10 flex items-center gap-2">
        <span className="text-[11px] font-body font-medium uppercase tracking-wider text-text-muted">
          Venue Map
        </span>
        <span className="text-[11px] font-mono text-text-faint">
          {venue.name} · {width}m × {height}m
        </span>
      </div>

      <svg
        viewBox={`-6 -6 ${width + 12} ${height + 12}`}
        className="w-full h-full min-h-[420px]"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* venue boundary */}
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

        {/* obstacles: stages, barriers, booths */}
        {venue.obstacles?.map((o, i) => (
          <g key={`obs-${i}`}>
            <rect
              x={o.x}
              y={o.y}
              width={o.width}
              height={o.height}
              rx={Math.min(o.width, o.height) * 0.15}
              fill="#182339"
              stroke="#2E4064"
              strokeWidth={strokeW * 0.7}
            />
            <text
              x={o.x + o.width / 2}
              y={o.y + o.height / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={Math.min(width, height) * 0.018}
              fill="#7C8AA3"
              fontFamily="Inter, sans-serif"
            >
              {o.label}
            </text>
          </g>
        ))}

        {/* concessions: small markers */}
        {venue.concessions?.map((c) => (
          <circle
            key={c.id}
            cx={c.x}
            cy={c.y}
            r={Math.min(width, height) * 0.006}
            fill="#F2B44D"
            opacity={0.5}
          />
        ))}

        {/* reroute path, if applied */}
        {rerouteApplied &&
          dedupedRoutes.map((route, i) => {
            const points = route.new_path.map(([x, y]) => `${x},${y}`).join(" ");
            return (
              <polyline
                key={`route-${route.agent_id}-${i}`}
                points={points}
                fill="none"
                stroke="#4FD1FF"
                strokeWidth={strokeW * 0.8}
                strokeDasharray="3 2"
                strokeLinecap="round"
                opacity={0.55}
                className="animate-flow-dash"
              />
            );
          })}

        {/* bottleneck zones: pulsing sonar rings */}
        {bottlenecks.map((b, i) => (
          <g key={`bn-${i}`}>
            <circle
              cx={b.x}
              cy={b.y}
              r={Math.min(width, height) * 0.02}
              fill={severityColor(b.severity)}
              opacity={0.85}
            />
            <circle
              cx={b.x}
              cy={b.y}
              r={Math.min(width, height) * 0.02}
              fill="none"
              stroke={severityColor(b.severity)}
              strokeWidth={strokeW}
              className="animate-sonar-ping origin-center"
              style={{ transformOrigin: `${b.x}px ${b.y}px` }}
            />
          </g>
        ))}

        {/* live crowd dots */}
        {sampledAgents.map((a) => (
          <circle
            key={a.id}
            cx={a.x}
            cy={a.y}
            r={Math.min(width, height) * 0.0035}
            fill="#EAF0F7"
            opacity={0.45}
          />
        ))}

        {/* entry gates */}
        {venue.entry_points?.map((gate) => (
          <g key={gate.id}>
            <circle
              cx={gate.x}
              cy={gate.y}
              r={Math.min(width, height) * 0.018}
              fill={gateColor(gate, bottlenecks)}
              opacity={0.9}
            />
            <text
              x={gate.x}
              y={gate.y - Math.min(width, height) * 0.028}
              textAnchor="middle"
              fontSize={Math.min(width, height) * 0.02}
              fontWeight={600}
              fill="#EAF0F7"
              fontFamily="'JetBrains Mono', monospace"
            >
              {gate.label}
            </text>
          </g>
        ))}

        {/* exit gates */}
        {venue.exit_points?.map((exit) => (
          <g key={exit.id}>
            <rect
              x={exit.x - Math.min(width, height) * 0.012}
              y={exit.y - Math.min(width, height) * 0.012}
              width={Math.min(width, height) * 0.024}
              height={Math.min(width, height) * 0.024}
              fill="#4FD1FF"
              opacity={0.75}
              rx={Math.min(width, height) * 0.004}
            />
          </g>
        ))}
      </svg>

      <div className="absolute bottom-3 right-4 flex items-center gap-4 text-[10px] font-mono text-text-faint">
        <span className="flex items-center gap-1">
          <DoorOpen className="w-3 h-3" /> Gate
        </span>
        <span className="flex items-center gap-1">
          <LogOut className="w-3 h-3" /> Exit
        </span>
        <span className="flex items-center gap-1">
          <UtensilsCrossed className="w-3 h-3" /> Concession
        </span>
      </div>
    </div>
  );
}
