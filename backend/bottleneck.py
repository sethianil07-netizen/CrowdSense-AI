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

def _build_nav_graph(venue: Venue, blocked_cells: set) -> Tuple[nx.Graph, Dict[Tuple[int, int], Tuple[float, float]]]:
    """Construct a grid graph over the venue at GRAPH_NODE_SPACING
    resolution, skipping nodes that fall inside obstacles or inside a
    currently-congested (blocked) cell."""
    graph = nx.Graph()
    node_positions: Dict[Tuple[int, int], Tuple[float, float]] = {}

    cols = int(venue.width // GRAPH_NODE_SPACING) + 1
    rows = int(venue.height // GRAPH_NODE_SPACING) + 1

    def node_blocked(i: int, j: int) -> bool:
        x, y = i * GRAPH_NODE_SPACING, j * GRAPH_NODE_SPACING
        if not venue.is_walkable(x, y):
            return True
        cell = _cell_for(x, y)
        return cell in blocked_cells

    for i in range(cols):
        for j in range(rows):
            if node_blocked(i, j):
                continue
            x, y = i * GRAPH_NODE_SPACING, j * GRAPH_NODE_SPACING
            node_positions[(i, j)] = (x, y)
            graph.add_node((i, j), pos=(x, y))

    # Connect each node to its 8-directional neighbors.
    for (i, j) in list(graph.nodes):
        for di, dj in [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)]:
            neighbor = (i + di, j + dj)
            if neighbor in graph.nodes:
                dist = math.hypot(di * GRAPH_NODE_SPACING, dj * GRAPH_NODE_SPACING)
                graph.add_edge((i, j), neighbor, weight=dist)

    return graph, node_positions


def _nearest_node(pos: Tuple[float, float], node_positions: Dict[Tuple[int, int], Tuple[float, float]]):
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
) -> List[dict]:
    """
    For agents whose current target lies in (or near) a detected
    bottleneck cell, compute an alternate path to the nearest exit using
    A* over a coarse walkable navigation graph, avoiding congested cells.

    Returns: [{agent_id, new_path: [(x, y), ...]}, ...]
    """
    if bottlenecks is None:
        bottlenecks = detect_bottlenecks(agents, venue)
    if not bottlenecks or not venue.exit_points:
        return []

    blocked_cells = {(_cell_for(b["x"], b["y"])) for b in bottlenecks}
    graph, node_positions = _build_nav_graph(venue, blocked_cells)
    if not graph.nodes:
        return []

    heuristic = _heuristic(node_positions)
    suggestions: List[dict] = []

    for agent in agents:
        target_cell = _cell_for(agent.goal_x, agent.goal_y)
        agent_cell = _cell_for(agent.x, agent.y)
        near_bottleneck = any(
            abs(agent_cell[0] - bc[0]) <= 1 and abs(agent_cell[1] - bc[1]) <= 1
            for bc in blocked_cells
        ) or target_cell in blocked_cells
        if not near_bottleneck:
            continue

        start_node = _nearest_node((agent.x, agent.y), node_positions)
        if start_node is None:
            continue

        # Route to whichever exit yields the shortest safe A* path.
        best_path_coords = None
        best_length = math.inf
        for exit_point in venue.exit_points:
            goal_node = _nearest_node((exit_point.x, exit_point.y), node_positions)
            if goal_node is None or goal_node not in graph:
                continue
            try:
                path_nodes = nx.astar_path(
                    graph, start_node, goal_node,
                    heuristic=heuristic, weight="weight",
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

        if best_path_coords:
            suggestions.append({
                "agent_id": agent.agent_id,
                "new_path": [(round(x, 2), round(y, 2)) for x, y in best_path_coords],
            })

    return suggestions
