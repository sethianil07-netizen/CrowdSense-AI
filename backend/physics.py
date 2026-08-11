"""
physics.py

Implements a (simplified) Social Force Model for pedestrian crowd dynamics,
vectorized with NumPy so it can process thousands of agents per simulation
step within a tight time budget (<50ms for 5000+ agents on typical hardware).

Model reference: Helbing & Molnar's Social Force Model. The repulsive force
between two pedestrians i and j is modeled as:

    F_ij = A * exp(-d_ij / B) * n_ij

where d_ij is the distance between agents, A is the interaction strength,
B is the interaction range, and n_ij is the unit vector pointing from j to i.

Per the spec here we use the requested formula:

    force = (A / distance) * exp(-distance / B)

with A=2000, B=0.08, applied along the vector connecting the two agents.
"""

from __future__ import annotations

from typing import List, Sequence, Tuple

import numpy as np
from scipy.spatial import cKDTree

from agents import Agent

# Social force constants (as specified)
A_CONST = 2000.0
B_CONST = 0.08

# Interaction cutoff: beyond this distance the repulsive force is
# negligible, so we skip it entirely for performance.
INTERACTION_CUTOFF = 3.0

# Minimum distance used to avoid division by zero / force blow-up when
# agents overlap.
MIN_DISTANCE = 0.05

# How strongly agents are pulled toward their goal/waypoint.
GOAL_ATTRACTION_STRENGTH = 1.2

# Radius (m) within which nearby agents count toward local-crowd auto-slow.
CROWD_SLOWDOWN_RADIUS = 1.5

# Simple linear damping so forces don't cause runaway oscillation.
DAMPING = 0.9


def calculate_social_forces(agent: Agent, nearby_agents: Sequence[Agent]) -> Tuple[float, float]:
    """
    Compute the net repulsive social force acting on `agent` due to
    `nearby_agents`, using:

        force = (A / distance) * exp(-distance / B)

    applied along the direction from the neighbor to the agent.

    This scalar (non-vectorized) version is provided for clarity/testing
    and for use on small neighbor sets (e.g. from spatial-hash queries).
    For bulk simulation steps, use `update_crowd`, which vectorizes the
    same formula across the whole agent population with NumPy.
    """
    fx, fy = 0.0, 0.0
    for other in nearby_agents:
        if other is agent:
            continue
        dx = agent.x - other.x
        dy = agent.y - other.y
        distance = (dx ** 2 + dy ** 2) ** 0.5
        if distance > INTERACTION_CUTOFF:
            continue
        distance = max(distance, MIN_DISTANCE)
        magnitude = (A_CONST / distance) * np.exp(-distance / B_CONST)
        # Cap magnitude to keep the simulation numerically stable —
        # at very small distances exp(-d/B) with B=0.08 still explodes.
        magnitude = min(magnitude, 5000.0)
        fx += magnitude * (dx / distance)
        fy += magnitude * (dy / distance)
    return fx, fy


def _pairwise_social_forces(positions: np.ndarray, tree: "cKDTree") -> np.ndarray:
    """
    Vectorized pairwise social force computation, restricted to agent
    pairs within INTERACTION_CUTOFF of each other.

    A naive O(N^2) dense pairwise computation (as a first implementation
    might do) is far too slow at scale — for 5000 agents that's 25M
    pairs recomputed every step, which blows past the <50ms budget by
    two orders of magnitude. Instead we use a KD-tree (`scipy.spatial.
    cKDTree`) to enumerate only the pairs actually within interaction
    range via `query_pairs`, which is roughly O(N log N) for realistically
    dispersed crowds, then vectorize the force math over just those pairs
    with NumPy.

    positions: (N, 2) array of agent x/y coordinates.
    tree: a cKDTree already built over `positions`.
    returns: (N, 2) array of net force vectors, one per agent.
    """
    n = positions.shape[0]
    forces = np.zeros((n, 2), dtype=np.float64)
    if n <= 1:
        return forces

    pairs = tree.query_pairs(r=INTERACTION_CUTOFF, output_type="ndarray")
    if pairs.size == 0:
        return forces

    i_idx, j_idx = pairs[:, 0], pairs[:, 1]

    # Vector from j -> i (force pushes i away from j).
    diff = positions[i_idx] - positions[j_idx]
    dist = np.sqrt(np.sum(diff ** 2, axis=-1))
    safe_dist = np.clip(dist, MIN_DISTANCE, None)

    magnitude = (A_CONST / safe_dist) * np.exp(-safe_dist / B_CONST)
    magnitude = np.clip(magnitude, 0.0, 5000.0)

    unit = diff / safe_dist[:, None]
    pair_force = unit * magnitude[:, None]                        # (M, 2)

    # Newton's third law: force on i from j is the negative of the
    # force on j from i. Scatter-add into the per-agent force array.
    np.add.at(forces, i_idx, pair_force)
    np.add.at(forces, j_idx, -pair_force)
    return forces


def _goal_forces(positions: np.ndarray, targets: np.ndarray, max_speed: np.ndarray) -> np.ndarray:
    """Attractive 'desired direction' force pulling each agent toward its
    current target (waypoint or final goal)."""
    direction = targets - positions
    dist = np.linalg.norm(direction, axis=1, keepdims=True)
    dist_safe = np.clip(dist, 1e-6, None)
    unit_dir = direction / dist_safe
    return unit_dir * max_speed[:, None] * GOAL_ATTRACTION_STRENGTH


def update_crowd(agents: List[Agent], dt: float) -> None:
    """
    Vectorized update of an entire agent population for one simulation
    step. Mutates each Agent's velocity_x/velocity_y and position in
    place. Designed to comfortably process 5000+ agents in well under
    50ms on typical hardware, since all pairwise force math is done with
    NumPy array operations rather than Python loops.
    """
    n = len(agents)
    if n == 0:
        return

    positions = np.array([[a.x, a.y] for a in agents], dtype=np.float64)
    targets = np.array([a.current_target() for a in agents], dtype=np.float64)
    max_speeds = np.array([a.max_speed for a in agents], dtype=np.float64)
    velocities = np.array([[a.velocity_x, a.velocity_y] for a in agents], dtype=np.float64)

    tree = cKDTree(positions)

    social_force = _pairwise_social_forces(positions, tree)
    goal_force = _goal_forces(positions, targets, max_speeds)

    total_force = social_force + goal_force

    # Semi-implicit Euler: update velocity from force, apply damping,
    # then clamp to max speed per-agent.
    new_velocity = velocities * DAMPING + total_force * dt
    speed = np.linalg.norm(new_velocity, axis=1)
    scale = np.where(speed > max_speeds, max_speeds / np.clip(speed, 1e-6, None), 1.0)
    new_velocity = new_velocity * scale[:, None]

    # Auto-slow in dense local crowds: count neighbors within
    # CROWD_SLOWDOWN_RADIUS for each agent using the same KD-tree
    # (avoids another O(N^2) distance matrix).
    neighbor_counts = tree.query_ball_point(
        positions, r=CROWD_SLOWDOWN_RADIUS, return_length=True
    ) - 1  # subtract self-match
    neighbor_counts = np.clip(neighbor_counts, 0, None)
    slow_factor = np.clip(1.0 - np.minimum(neighbor_counts, 10) / 10.0 * 0.6, 0.4, 1.0)
    new_velocity = new_velocity * slow_factor[:, None]

    new_positions = positions + new_velocity * dt

    for i, agent in enumerate(agents):
        agent.velocity_x, agent.velocity_y = float(new_velocity[i, 0]), float(new_velocity[i, 1])
        agent.x, agent.y = float(new_positions[i, 0]), float(new_positions[i, 1])
        agent.advance_waypoint_if_close()
        if ((agent.goal_x - agent.x) ** 2 + (agent.goal_y - agent.y) ** 2) ** 0.5 < 1.0:
            agent.reached_goal = True
