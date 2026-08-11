# CrowdSense AI

CrowdSense AI is a real-time crowd flow monitoring and rerouting demo built as a two-part web application:

- `backend/`: FastAPI + Socket.IO backend that runs a crowd simulation, detects bottlenecks, and suggests reroute paths.
- `frontend/`: React + Vite + Tailwind UI dashboard that connects to the backend and visualizes crowd density, alerts, and venue maps.

The project is designed to demonstrate how a crowd-management control center could detect dangerous density zones, stream live simulation state, and present actionable reroute suggestions.

---

## Key Features

- Real-time crowd simulation streamed over WebSockets
- Bottleneck detection using a spatial-hash density grid
- A* rerouting around congested areas via a walkable graph
- Live venue map with agents, obstacles, gates, and bottleneck alerts
- UI fallback to static demo data when backend is unavailable
- Fast simulation physics using a simplified Social Force Model with NumPy / SciPy

---

## Architecture Overview

### Backend

The backend lives in `backend/` and is responsible for:

- loading venue definitions from `backend/data/venues.json`
- exposing REST APIs for venue metadata, simulation control, and health checks
- hosting a Socket.IO ASGI application for live simulation streaming
- running a `SimulationManager` that advances agents, detects bottlenecks, and applies rerouting

Core backend modules:

- `backend/main.py` — FastAPI app and REST API endpoints
- `backend/sockets.py` — Socket.IO event handlers and broadcast loop
- `backend/simulator.py` — simulation lifecycle, time stepping, and state export
- `backend/physics.py` — agent crowd physics and social forces
- `backend/bottleneck.py` — bottleneck detection and rerouting suggestion logic
- `backend/agents.py` — agent model and movement helpers
- `backend/venue.py` — venue layout loading and spatial queries

### Frontend

The frontend lives in `frontend/` and provides a live dashboard experience:

- fetches venue list and layout from the backend
- connects to the backend over Socket.IO
- receives live simulation updates and alerts
- renders the map, agent positions, metrics, density chart, and reroute actions
- uses offline mock data when the backend is unreachable

Core frontend modules:

- `frontend/src/App.jsx` — top-level dashboard composition
- `frontend/src/hooks/useCrowdSim.js` — backend connection and simulation state management
- `frontend/src/components/` — UI components for header, venue map, stats, alerts, and charts
- `frontend/src/data/mockData.js` — demo fallback data for offline mode

---

## Getting Started

### Prerequisites

- Node.js 20+ / npm
- Python 3.11+ (recommended)
- `pip` for backend dependencies

### Backend Setup

1. Open a terminal in `backend/`
2. Create a Python virtual environment (recommended):
   ```bash
   python -m venv .venv
   .venv\Scripts\activate
   ```
3. Install backend dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Start the backend server:
   ```bash
   uvicorn main:socket_app --reload --port 8000
   ```

The backend will be available at `http://localhost:8000`.

### Frontend Setup

1. Open a terminal in `frontend/`
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Open `http://localhost:5173`

If the backend is running, the dashboard will connect automatically and display live simulation data. If the backend is unavailable, the UI falls back to demo data.

---

## Folder Structure

```
backend/
  agents.py
  bottleneck.py
  data/
    venues.json
  main.py
  physics.py
  simulator.py
  sockets.py
  venue.py
  requirements.txt
frontend/
  public/
  src/
    App.jsx
    index.css
    main.jsx
    components/
    data/mockData.js
    hooks/useCrowdSim.js
  package.json
  postcss.config.js
  tailwind.config.js
  vite.config.js
  README.md
```

---

## Backend API

### REST endpoints

- `GET /api/venues`
  - returns a lightweight list of available venues
  - each venue includes `id`, `name`, dimensions, gate counts, exits, and concessions

- `GET /api/venue/{venue_id}`
  - returns the full venue layout for the requested venue

- `POST /api/simulation/start`
  - starts a REST-tracked simulation
  - request body: `{ "venue_id": "mumbai-central", "num_agents": 500 }`

- `POST /api/simulation/stop`
  - stops the REST-tracked simulation

- `GET /api/simulation/state`
  - returns the current state of the REST-tracked simulation

- `GET /api/health`
  - returns a simple service health check

### Socket.IO events

#### Client -> Server

- `start_simulation`
  - payload: `{ venue, num_agents }`
  - starts a per-session simulation manager and begins broadcast updates

- `stop_simulation`
  - stops the per-session simulation

- `update_config`
  - payload: `{ num_agents }`
  - respawns the current simulation with a new agent count

#### Server -> Client

- `connected`
  - confirms the socket connection

- `simulation_started`
  - signals that the simulation has started successfully

- `simulation_update`
  - streamed every ~100ms with the latest state
  - contains agent positions, density, risk level, bottlenecks, and reroute suggestions

- `bottleneck_alert`
  - emitted when the simulation detects a congested zone

- `bottleneck_cleared`
  - emitted when congestion is resolved

- `reroute_suggestion`
  - emitted when a reroute path is available for affected agents

- `error`
  - emitted for socket-level error conditions

---

## Venue Data and Simulation Model

### Venue schema

Each venue includes:

- `id`: venue identifier
- `name`: display name
- `width`, `height`: venue bounds in meters
- `entry_points`: starting gates for agents
- `exit_points`: end goals and exits
- `obstacles`: rectangular impassable zones
- `concessions`: optional intermediate destinations

This schema is defined in `backend/data/venues.json` and loaded by `backend/venue.py`.

### Agents

Each simulated pedestrian agent tracks:

- position (`x`, `y`)
- velocity (`vx`, `vy`)
- destination goal coordinates (`goal_x`, `goal_y`)
- current path waypoints and progression
- whether it has reached its goal

Agents are created at entry points and assigned random destinations, biased toward exits but sometimes heading to concessions.

When an agent reaches its goal, the backend assigns a new random target so the crowd flow remains continuous.

### Physics

The crowd physics are implemented in `backend/physics.py` using a simplified Social Force Model:

- attraction force toward the goal or current waypoint
- repulsive social force from nearby neighbors
- damping and max-speed clamping
- local slowdown when many agents are within a short radius

The physics update is vectorized with NumPy and SciPy's KD-tree to keep per-step performance reasonable for hundreds or thousands of agents.

### Bottleneck detection

Bottlenecks are detected by binning agents into `5m x 5m` cells using a spatial hash.
A cell is considered congested when the pedestrian density exceeds `4 people / m^2`.
Detected bottlenecks are reported with:

- `x`, `y`: cell center
- `severity`: normalized 0-1 score
- `count`: number of agents
- `density`: people per square meter

This logic is implemented in `backend/bottleneck.py`.

### Rerouting

When a bottleneck is detected, the backend attempts to suggest alternate routes for affected agents.

- builds a walkable navigation graph on a coarse 5m grid
- removes nodes inside obstacles or congested cells
- runs NetworkX A* to find safe paths to exits
- returns reroute suggestions with waypoint sequences for affected agents

Suggested routes are applied directly to agent path state in `backend/simulator.py`.

---

## Frontend Behavior

The app dashboard enables:

- venue selection from backend data
- live status and connection health display
- start / stop simulation controls
- crowd density, risk, and average flow metrics
- bottleneck alerts and reroute acknowledgement actions
- animated venue map with agents, obstacles, and route overlays
- density history trend chart

The frontend automatically falls back to demo mode if the backend is unavailable, so the UI can still be developed and reviewed without the backend.

---

## Development Notes

- `frontend/package.json` uses Vite, React, Tailwind CSS, Recharts, and Socket.IO client.
- `backend/requirements.txt` includes FastAPI, Uvicorn, NumPy, SciPy, NetworkX, and python-socketio.
- The backend mounts Socket.IO as a sub-application on top of FastAPI via `socketio.ASGIApp`.
- The frontend hook `useCrowdSim` centralizes REST fetching, socket events, and state updates.

### Running both together

1. Start backend:
   ```bash
   cd backend
   uvicorn main:socket_app --reload --port 8000
   ```
2. Start frontend:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
3. Open `http://localhost:5173`

If the backend is not running, the app displays an offline banner and uses local mock data.

---

## Extending CrowdSense AI

Possible enhancements:

- add more venue layouts to `backend/data/venues.json`
- support multiple live sessions and shared simulation state
- add UI controls for agent density, attraction weights, or obstacle placement
- improve rerouting by considering dynamic flow and exit capacity
- add backend persistence or telemetry logging
- add tests for simulation accuracy and API responses

---

## Troubleshooting

- If the frontend cannot connect, verify the backend is running at `http://localhost:8000`.
- If the backend fails to start, ensure Python dependencies are installed and `requirements.txt` is satisfied.
- If the Socket.IO connection is unstable, confirm the frontend and backend origins match and CORS is enabled.

---

## Contact

This README documents the current `CrowdSense AI` project in this workspace. Use it as the launch point for further experimentation, analysis, and feature work.
