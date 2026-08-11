import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-ink-raised border border-ink-border rounded-md px-3 py-2 text-xs font-mono">
      <div className="text-text-faint">t = {label} min</div>
      <div className="text-signal-live font-semibold">{payload[0].value} density idx</div>
    </div>
  );
}

export default function CrowdChart({ data }) {
  return (
    <div className="rounded-lg border border-ink-border bg-ink-panel px-4 py-3.5 h-full">
      <span className="text-[11px] font-body font-medium uppercase tracking-wider text-text-muted">
        Crowd Density Over Time
      </span>
      <div className="h-[140px] mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 8, left: -24, bottom: 0 }}>
            <defs>
              <linearGradient id="densityFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4FD1FF" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#4FD1FF" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#1B2740" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="t"
              tick={{ fill: "#4A5A78", fontSize: 10, fontFamily: "JetBrains Mono" }}
              axisLine={{ stroke: "#22314A" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#4A5A78", fontSize: 10, fontFamily: "JetBrains Mono" }}
              axisLine={false}
              tickLine={false}
              width={32}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="density"
              stroke="#4FD1FF"
              strokeWidth={2}
              fill="url(#densityFill)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
