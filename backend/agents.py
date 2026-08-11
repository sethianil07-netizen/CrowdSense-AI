"""
agents.py

Defines the Agent class representing a single pedestrian in the crowd
simulation. Each agent tracks its own kinematic state (position, velocity,
goal) and exposes helper methods used by the physics and bottleneck
detection subsystems.
"""

from __future__ import annotations

import math
import uuid
from dataclasses import dataclass, field
from typing import Optional, Tuple

MAX_SPEED = 1.5          # m/s, per simulation parameters
PERSONAL_RADIUS = 0.5    # m
CROWD_SLOWDOWN_RADIUS = 1.5   # m, agents within this range trigger auto-slow
CROWD_SLOWDOWN_FACTOR = 0.4   # fraction of max speed retained in dense crowds


@dataclass
class Agent:
    """A single pedestrian agent in the simulation."""

    x: float
    y: float
    goal_x: float
    goal_y: float
    velocity_x: float = 0.0
    velocity_y: float = 0.0
    radius: float = PERSONAL_RADIUS
    max_speed: float = MAX_SPEED
    agent_id: str = field(default_factory=lambda: uuid.uuid4().hex[:8])
    entry_point: Optional[str] = None
    exit_point: Optional[str] = None
    path: list = field(default_factory=list)   # list of (x, y) waypoints
    path_index: int = 0
    reached_goal: bool = False

    # ------------------------------------------------------------------
    # Core kinematics
    # ------------------------------------------------------------------
    def desired_direction(self) -> Tuple[float, float]:
        """Unit vector pointing from current position toward the current
        target (next waypoint if a path is set, else the final goal)."""
        target_x, target_y = self.current_target()
        dx = target_x - self.x
        dy = target_y - self.y
        dist = math.hypot(dx, dy)
        if dist < 1e-6:
            return 0.0, 0.0
        return dx / dist, dy / dist

    def current_target(self) -> Tuple[float, float]:
        if self.path and self.path_index < len(self.path):
            return self.path[self.path_index]
        return self.goal_x, self.goal_y

    def advance_waypoint_if_close(self, threshold: float = 1.0) -> None:
        """If close enough to the current waypoint, advance to the next one."""
        if not self.path or self.path_index >= len(self.path):
            return
        tx, ty = self.path[self.path_index]
        if math.hypot(tx - self.x, ty - self.y) < threshold:
            self.path_index += 1

    def get_distance_to(self, other: "Agent") -> float:
        """Euclidean distance to another agent."""
        return math.hypot(self.x - other.x, self.y - other.y)

    def local_density_slowdown(self, nearby_count: int) -> float:
        """Return a speed multiplier in [CROWD_SLOWDOWN_FACTOR, 1.0] based on
        how many agents are packed nearby. More neighbors -> slower agent."""
        if nearby_count <= 0:
            return 1.0
        # Linear falloff, clamped, saturating once ~10 neighbors are close.
        factor = 1.0 - min(nearby_count, 10) / 10.0 * (1.0 - CROWD_SLOWDOWN_FACTOR)
        return max(CROWD_SLOWDOWN_FACTOR, factor)

    def update_position(self, dt: float) -> None:
        """Integrate velocity into position using simple Euler integration,
        clamping speed to max_speed."""
        speed = math.hypot(self.velocity_x, self.velocity_y)
        if speed > self.max_speed:
            scale = self.max_speed / speed
            self.velocity_x *= scale
            self.velocity_y *= scale

        self.x += self.velocity_x * dt
        self.y += self.velocity_y * dt

        self.advance_waypoint_if_close()

        if math.hypot(self.goal_x - self.x, self.goal_y - self.y) < 1.0:
            self.reached_goal = True

    def to_dict(self) -> dict:
        return {
            "id": self.agent_id,
            "x": round(self.x, 3),
            "y": round(self.y, 3),
            "vx": round(self.velocity_x, 3),
            "vy": round(self.velocity_y, 3),
            "goal_x": round(self.goal_x, 3),
            "goal_y": round(self.goal_y, 3),
            "reached_goal": self.reached_goal,
        }
