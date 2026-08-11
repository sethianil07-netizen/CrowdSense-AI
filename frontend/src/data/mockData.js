// Fallback data used when the backend (FastAPI + Socket.io) isn't
// reachable, so the dashboard is still fully demoable offline.

export const MOCK_VENUE = {
  id: "mumbai-central",
  name: "Mumbai Central Arena",
  width: 150,
  height: 80,
  entry_points: [
    { id: "gate-a", x: 5, y: 20, label: "Gate A" },
    { id: "gate-b", x: 5, y: 60, label: "Gate B" },
    { id: "gate-c", x: 145, y: 20, label: "Gate C" },
    { id: "gate-d", x: 145, y: 60, label: "Gate D" },
  ],
  exit_points: [
    { id: "exit-1", x: 75, y: 2, label: "North Exit" },
    { id: "exit-2", x: 20, y: 78, label: "South-West Exit" },
    { id: "exit-3", x: 130, y: 78, label: "South-East Exit" },
  ],
  obstacles: [
    { x: 65, y: 30, width: 20, height: 20, label: "Central Stage" },
    { x: 30, y: 5, width: 10, height: 8, label: "Ticket Booth" },
    { x: 110, y: 5, width: 10, height: 8, label: "Security Barrier" },
  ],
  concessions: [
    { id: "food-1", x: 30, y: 60, label: "Snack Counter 1" },
    { id: "food-2", x: 50, y: 65, label: "Snack Counter 2" },
    { id: "food-3", x: 95, y: 65, label: "Snack Counter 3" },
  ],
};

export const MOCK_STATS = {
  total_agents: 32450,
  density: 0.74,
  risk: "HIGH",
  high_risk_zones: 2,
  avg_flow: 128,
};

export const MOCK_BOTTLENECK = {
  zone: "Gate B → North Concourse",
  density: 0.87,
  eta_minutes: 3,
  recommended_route: "Gate B → Gate C",
  redirect_percentage: 35,
};

export const MOCK_DENSITY_HISTORY = [
  { t: "1", density: 22 },
  { t: "2", density: 38 },
  { t: "3", density: 55 },
  { t: "4", density: 71 },
  { t: "5", density: 74 },
];

// Generates a scatter of static "crowd dot" positions across the mock
// venue, purely for the visual in offline/UI-only mode.
export function generateMockAgents(venue, count = 220) {
  const agents = [];
  for (let i = 0; i < count; i++) {
    agents.push({
      id: `mock-${i}`,
      x: Math.random() * venue.width,
      y: Math.random() * venue.height,
    });
  }
  return agents;
}
