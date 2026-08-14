"""
bottleneck.py

Two responsibilities:

1. `detect_bottlenecks` — bins agents into a 5m x 5m spatial hash grid and
   flags any cell whose pedestrian density exceeds 4 people/m^2 as a
   bottleneck, returning severity-scored cells.

2. `suggest_rerouting` — builds a walkable navigation graph over the venue
   (a coarse grid graph with obstacle cells removed) and uses NetworkX's
   A* implementation to find alternate paths for agents currently heading
   toward/through a congested cell, routing them to the nearest safe exit
   instead.
"""

from __future__ import annotations

import math
from collections import defaultdict
from typing import Dict, List, Sequence, Tuple

import networkx as nx

from agents import Agent
from venue import Venue

# Spatial hash cell size, in meters, per spec.
CELL_SIZE = 5.0

# Density threshold, people per square meter, above which a cell is
# flagged as a bottleneck.
DENSITY_THRESHOLD = 4.0

CELL_AREA = CELL_SIZE * CELL_SIZE

# Graph node spacing for the pathfinding grid. Coarser than the density
# grid to keep the graph small and A* fast.
GRAPH_NODE_SPACING = 5.0


def _cell_for(x: float, y: float) -> Tuple[int, int]:
    return int(x // CELL_SIZE), int(y // CELL_SIZE)


def detect_bottlenecks(
    agents: Sequence[Agent],
    venue: Venue,
    density_threshold: float = DENSITY_THRESHOLD,
) -> List[dict]:
    """
    Spatial-hash the agent population into CELL_SIZE x CELL_SIZE cells and
    flag any cell exceeding `density_threshold` people/m^2.

    Returns a list of dicts: [{x, y, severity, count}, ...] where (x, y)
    is the cell's center point, `count` is the number of agents in the
    cell, and `severity` is a normalized 0-1 score (1.0 = at least double
    the density threshold).
    """
    grid: Dict[Tuple[int, int], List[Agent]] = defaultdict(list)
    for agent in agents:
        grid[_cell_for(agent.x, agent.y)].append(agent)

    bottlenecks: List[dict] = []
    for (cx, cy), cell_agents in grid.items():
        count = len(cell_agents)
        density = count / CELL_AREA
        if density > density_threshold:
            severity = min(1.0, (density - density_threshold) / density_threshold)
            bottlenecks.append({
                "x": round((cx + 0.5) * CELL_SIZE, 2),
                "y": round((cy + 0.5) * CELL_SIZE, 2),
                "severity": round(severity, 3),
                "count": count,
                "density": round(density, 3),
            })

    bottlenecks.sort(key=lambda b: b["severity"], reverse=True)
    return bottlenecks


# ----------------------------------------------------------------------
# Rerouting: build a coarse walkable grid graph and run A*
# ----------------------------------------------------------------------

def build_base_nav_graph(venue: Venue) -> dict:
    """
    Build the venue's walkable navigation graph *once* (pure walkability —
    no knowledge of current crowd congestion). This is the expensive part
    (grid construction + edge wiring), so callers should build it a single
    time per venue and reuse the cache across every simulation step,
    rather than rebuilding it every time congestion is rechecked (which
    is what the initial implementation did, and was the main cause of a
    real single-step cost of 100-200ms once bottlenecks appeared).

    Returns a dict: {"graph", "node_positions", "kdtree", "node_list"}
    where kdtree/node_list support fast nearest-node lookup via SciPy.
    """
    graph = nx.Graph()
    node_positions: Dict[Tuple[int, int], Tuple[float, float]] = {}

    cols = int(venue.width // GRAPH_NODE_SPACING) + 1
    rows = int(venue.height // GRAPH_NODE_SPACING) + 1

    for i in range(cols):
        for j in range(rows):
            x, y = i * GRAPH_NODE_SPACING, j * GRAPH_NODE_SPACING
            if not venue.is_walkable(x, y):
                continue
            node_positions[(i, j)] = (x, y)
            graph.add_node((i, j), pos=(x, y))

    for (i, j) in list(graph.nodes):
        for di, dj in [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)]:
            neighbor = (i + di, j + dj)
            if neighbor in graph.nodes:
                dist = math.hypot(di * GRAPH_NODE_SPACING, dj * GRAPH_NODE_SPACING)
                graph.add_edge((i, j), neighbor, weight=dist)

    node_list = list(node_positions.keys())
    kdtree = None
    if node_list:
        import numpy as np
        from scipy.spatial import cKDTree
        coords = np.array([node_positions[n] for n in node_list], dtype=np.float64)
        kdtree = cKDTree(coords)

    return {
        "graph": graph,
        "node_positions": node_positions,
        "kdtree": kdtree,
        "node_list": node_list,
    }


def _nearest_node_fast(pos: Tuple[float, float], nav_cache: dict):
    """O(log n) nearest-node lookup via the cached KD-tree, instead of
    scanning every node per call."""
    if nav_cache["kdtree"] is None:
        return None
    _, idx = nav_cache["kdtree"].query(pos)
    return nav_cache["node_list"][idx]


def _nearest_node(pos: Tuple[float, float], node_positions: Dict[Tuple[int, int], Tuple[float, float]]):
    """Fallback linear-scan nearest-node lookup, used only when no
    cached KD-tree is available (e.g. ad-hoc/test calls)."""
    bx, by = pos
    best_node, best_dist = None, math.inf
    for node, (nx_, ny_) in node_positions.items():
        d = math.hypot(nx_ - bx, ny_ - by)
        if d < best_dist:
            best_dist, best_node = d, node
    return best_node


def _heuristic(node_positions):
    def h(u, v):
        ux, uy = node_positions[u]
        vx, vy = node_positions[v]
        return math.hypot(ux - vx, uy - vy)
    return h


def suggest_rerouting(
    agents: Sequence[Agent],
    venue: Venue,
    bottlenecks: List[dict] = None,
    nav_cache: dict = None,
) -> List[dict]:
    """
    For agents whose current target lies in (or near) a detected
    bottleneck cell, compute an alternate path to the nearest exit using
    A* over a coarse walkable navigation graph, avoiding congested cells.

    `nav_cache` should be the dict returned by `build_base_nav_graph`,
    built once per venue and reused across steps by the caller (see
    SimulationManager). If omitted, a graph is built on the fly — fine
    for one-off/test calls, but callers running a live simulation loop
    should always pass a cached graph to avoid rebuilding it every step.

    Returns: [{agent_id, new_path: [(x, y), ...]}, ...]
    """
    if bottlenecks is None:
        bottlenecks = detect_bottlenecks(agents, venue)
    if not bottlenecks or not venue.exit_points:
        return []

    if nav_cache is None:
        nav_cache = build_base_nav_graph(venue)

    graph = nav_cache["graph"]
    node_positions = nav_cache["node_positions"]
    if not graph.nodes:
        return []

    blocked_cells = {(_cell_for(b["x"], b["y"])) for b in bottlenecks}
    blocked_nodes = {
        node for node, pos in node_positions.items() if _cell_for(*pos) in blocked_cells
    }

    def make_edge_weight(exempt_node):
        # Returning None tells networkx to treat the edge as untraversable,
        # so congested cells are avoided without touching the graph itself.
        # `exempt_node` (the agent's own start node) is excluded from the
        # block — an agent standing inside a congested cell still needs to
        # be able to leave it, so we only block *other* congested nodes
        # from being routed *through*.
        def edge_weight(u, v, data):
            if (u in blocked_nodes and u != exempt_node) or (v in blocked_nodes and v != exempt_node):
                return None
            return data.get("weight", 1.0)
        return edge_weight

    heuristic = _heuristic(node_positions)
    suggestions: List[dict] = []

    # Packed agents overwhelmingly share the same nearest nav-graph node,
    # so cache each node's best A* path rather than recomputing it once
    # per agent. This is what actually bounds the cost when hundreds of
    # agents are jammed into the same small crush zone — the number of
    # *distinct* start nodes stays small (bounded by graph resolution)
    # even when the agent count is huge.
    path_cache: Dict[Tuple[int, int], List[Tuple[float, float]]] = {}

    # Still cap total suggestions returned, purely to keep the Socket.io
    # payload (and the frontend's SVG render) bounded when a crush spans
    # thousands of agents — beyond this, agents rely on the normal
    # social-force repulsion to disperse rather than an explicit path.
    max_suggestions = 300

    for agent in agents:
        if len(suggestions) >= max_suggestions:
            break

        target_cell = _cell_for(agent.goal_x, agent.goal_y)
        agent_cell = _cell_for(agent.x, agent.y)
        near_bottleneck = any(
            abs(agent_cell[0] - bc[0]) <= 1 and abs(agent_cell[1] - bc[1]) <= 1
            for bc in blocked_cells
        ) or target_cell in blocked_cells
        if not near_bottleneck:
            continue

        start_node = _nearest_node_fast((agent.x, agent.y), nav_cache)
        if start_node is None:
            continue

        if start_node in path_cache:
            best_path_coords = path_cache[start_node]
        else:
            # Route to whichever exit yields the shortest safe A* path.
            best_path_coords = None
            best_length = math.inf
            for exit_point in venue.exit_points:
                goal_node = _nearest_node_fast((exit_point.x, exit_point.y), nav_cache)
                if goal_node is None or goal_node not in graph or goal_node in blocked_nodes:
                    continue
                try:
                    path_nodes = nx.astar_path(
                        graph, start_node, goal_node,
                        heuristic=heuristic, weight=make_edge_weight(start_node),
                    )
                except (nx.NetworkXNoPath, nx.NodeNotFound):
                    continue
                length = sum(
                    graph[path_nodes[k]][path_nodes[k + 1]]["weight"]
                    for k in range(len(path_nodes) - 1)
                )
                if length < best_length:
                    best_length = length
                    best_path_coords = [node_positions[n] for n in path_nodes] + [
                        (exit_point.x, exit_point.y)
                    ]
            path_cache[start_node] = best_path_coords

        if best_path_coords:
            suggestions.append({
                "agent_id": agent.agent_id,
                "new_path": [(round(x, 2), round(y, 2)) for x, y in best_path_coords],
            })

    return suggestions
