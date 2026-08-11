# CrowdSense AI — Frontend

Real-time crowd control command centre. React + Vite + Tailwind + Recharts +
Socket.io, wired to the CrowdSense FastAPI backend.

## Run it

```bash
npm install
cp .env.example .env   # only if your backend isn't on localhost:8000
npm run dev
```

Open http://localhost:5173.

**With the backend running** (`uvicorn main:socket_app --port 8000` from the
`backend/` folder), the dashboard auto-detects it, lists real venues in the
header dropdown, and "Start Simulation" streams live agent positions,
bottleneck detection, and A* reroute suggestions over Socket.io.

**Without the backend**, the dashboard falls back to static demo data
automatically (a banner says so) — useful for pure UI iteration.

## Structure

```
src/
├── components/
│   ├── Header.jsx        top bar: title, venue selector, LIVE badge, clock
│   ├── StatsCard.jsx      reusable control-panel metric card
│   ├── VenueMap.jsx       SVG venue map: gates, obstacles, crowd dots, bottleneck pings
│   ├── AlertPanel.jsx     bottleneck alert + "Apply Rerouting" action
│   ├── RoutePanel.jsx     risk ladder + start/stop simulation control
│   └── CrowdChart.jsx     density-over-time area chart
├── hooks/
│   └── useCrowdSim.js     owns REST + Socket.io connection and simulation state
├── data/
│   └── mockData.js        offline fallback data
├── App.jsx
├── main.jsx
└── index.css              design tokens (colors, fonts, motion)
```

## Design notes

Dark ops-room palette (`ink` base + `signal` safe/caution/critical/live
accents) tuned specifically for a safety-monitoring context — the accent
colors are functional (they *are* the risk levels), not decorative. The
signature motif is the sonar-ping pulse on detected bottleneck zones,
paired with a faint scanline sweep across the whole dashboard — both tie
back to the product's actual job: detecting trouble before it happens.

Fonts: Space Grotesk (display), Inter (UI text), JetBrains Mono (live data
readouts — counts, coordinates, the clock).
