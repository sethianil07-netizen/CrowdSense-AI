"""
simulator.py

SimulationManager owns the lifecycle of one crowd simulation run:
spawning agents at venue entry points, stepping physics +
bottleneck detection + rerouting, and exposing a serializable
state snapshot for broadcast over Socket.IO.
"""

from __future__ import annotations

import asyncio
import math
import random
from typing import Dict, List, Optional

from agents import Agent
from bottleneck import (
    detect_bottlenecks,
    suggest_rerouting,
    build_base_nav_graph,
)
from physics import update_crowd
from venue import Venue


DT = 0.1
STEP_HZ = 10

BOTTLENECK_CHECK_EVERY = 3
MAX_RENDERED_AGENTS = 2500


class SimulationManager:
    """
    Manages a single running crowd simulation:
    agent population, venue layout, per-step physics,
    bottleneck detection, and rerouting.
    """

    def __init__(self):
        self.venue: Optional[Venue] = None
        self.agents: List[Agent] = []

        self.bottlenecks: List[dict] = []
        self.routes: List[dict] = []

        self.running: bool = False

        self.sim_time: float = 0.0
        self.step_count: int = 0

        self._task: Optional[asyncio.Task] = None
        self._lock = asyncio.Lock()

        self._nav_cache: Optional[dict] = None

        self._last_bottleneck_signature = None

    # ------------------------------------------------------------------
    # Setup
    # ------------------------------------------------------------------

    def init_simulation(
        self,
        venue: Venue,
        num_agents: int = 500,
    ) -> None:
        self.venue = venue

        self.agents = []
        self.bottlenecks = []
        self.routes = []

        self.sim_time = 0.0
        self.step_count = 0

        self._last_bottleneck_signature = None

        self._nav_cache = build_base_nav_graph(
            venue
        )

        if not venue.entry_points:
            raise ValueError(
                "Venue has no entry points to spawn agents at"
            )

        assignments = [
            random.choice(
                venue.entry_points
            )
            for _ in range(num_agents)
        ]

        per_gate_count: Dict[str, int] = {}

        for entry in assignments:
            per_gate_count[entry.id] = (
                per_gate_count.get(entry.id, 0) + 1
            )

        for entry in assignments:
            goal_x, goal_y = (
                self._random_destination(
                    venue
                )
            )

            n_here = per_gate_count.get(
                entry.id,
                1,
            )

            spawn_radius = max(
                1.5,
                min(
                    20.0,
                    math.sqrt(n_here) * 0.9,
                ),
            )

            angle = random.uniform(
                0,
                2 * math.pi,
            )

            radius = (
                spawn_radius
                * math.sqrt(
                    random.uniform(
                        0,
                        1,
                    )
                )
            )

            offset_x = (
                radius
                * math.cos(angle)
            )

            offset_y = (
                radius
                * math.sin(angle)
            )

            agent = Agent(
                x=max(
                    0.0,
                    min(
                        venue.width,
                        entry.x + offset_x,
                    ),
                ),
                y=max(
                    0.0,
                    min(
                        venue.height,
                        entry.y + offset_y,
                    ),
                ),
                goal_x=goal_x,
                goal_y=goal_y,
                entry_point=entry.id,
            )

            self.agents.append(agent)

    # ------------------------------------------------------------------
    # Destination helpers
    # ------------------------------------------------------------------

    def _random_destination(
        self,
        venue: Venue,
    ):
        candidates = list(
            venue.exit_points
        )

        candidates.extend(
            venue.concessions
        )

        if not candidates:
            return (
                venue.width / 2,
                venue.height / 2,
            )

        choice = random.choice(
            candidates
        )

        return (
            choice.x,
            choice.y,
        )

    def assign_new_destination(
        self,
        agent: Agent,
    ) -> None:
        if not self.venue:
            return

        goal_x, goal_y = (
            self._random_destination(
                self.venue
            )
        )

        agent.goal_x = goal_x
        agent.goal_y = goal_y

        agent.reached_goal = False
        agent.path = []
        agent.path_index = 0

    # ------------------------------------------------------------------
    # Single crowd surge
    # ------------------------------------------------------------------

    def trigger_crowd_surge(
        self,
        target_x: float,
        target_y: float,
        fraction: float = 0.70,
        radius: float = 1.4,
    ) -> int:
        """
        Create a single deterministic crowd surge.
        """

        return self.trigger_multiple_crowd_surges(
            [
                {
                    "x": target_x,
                    "y": target_y,
                }
            ],
            fraction=fraction,
            radius=radius,
        )

    # ------------------------------------------------------------------
    # Multiple crowd surges
    # ------------------------------------------------------------------

    def trigger_multiple_crowd_surges(
        self,
        locations: List[dict],
        fraction: float = 0.70,
        radius: float = 1.4,
    ) -> int:
        """
        Create simultaneous crowd surges at multiple locations.

        `locations` should contain:
            [
                {"x": 10, "y": 20},
                {"x": 90, "y": 5},
                ...
            ]

        The selected portion of the crowd is split among the
        requested surge locations.
        """

        if (
            not self.venue
            or not self.agents
            or not locations
        ):
            return 0

        fraction = max(
            0.05,
            min(
                1.0,
                float(fraction),
            ),
        )

        # Clean and clamp locations.
        clean_locations = []

        for location in locations:
            try:
                x = float(
                    location["x"]
                )
                y = float(
                    location["y"]
                )
            except (
                KeyError,
                TypeError,
                ValueError,
            ):
                continue

            x = max(
                0.0,
                min(
                    self.venue.width,
                    x,
                ),
            )

            y = max(
                0.0,
                min(
                    self.venue.height,
                    y,
                ),
            )

            clean_locations.append(
                {
                    "x": x,
                    "y": y,
                }
            )

        if not clean_locations:
            return 0

        # Total number of affected agents.
        affected_count = max(
            1,
            int(
                len(self.agents)
                * fraction
            ),
        )

        selected_agents = random.sample(
            self.agents,
            min(
                affected_count,
                len(self.agents),
            ),
        )

        # Divide the selected agents across surge points.
        for index, agent in enumerate(
            selected_agents
        ):
            location = clean_locations[
                index
                % len(clean_locations)
            ]

            target_x = location["x"]
            target_y = location["y"]

            # Spread agents in a compact disk.
            angle = random.uniform(
                0,
                2 * math.pi,
            )

            distance = (
                radius
                * math.sqrt(
                    random.uniform(
                        0,
                        1,
                    )
                )
            )

            x = (
                target_x
                + math.cos(angle)
                * distance
            )

            y = (
                target_y
                + math.sin(angle)
                * distance
            )

            agent.x = max(
                0.0,
                min(
                    self.venue.width,
                    x,
                ),
            )

            agent.y = max(
                0.0,
                min(
                    self.venue.height,
                    y,
                ),
            )

            # Stop old movement briefly so the surge is visible.
            agent.velocity_x = 0.0
            agent.velocity_y = 0.0

            # Give the agent a nearby local target so normal
            # physics resumes naturally afterward.
            goal_angle = random.uniform(
                0,
                2 * math.pi,
            )

            goal_distance = random.uniform(
                2.0,
                5.0,
            )

            goal_x = (
                target_x
                + math.cos(goal_angle)
                * goal_distance
            )

            goal_y = (
                target_y
                + math.sin(goal_angle)
                * goal_distance
            )

            agent.goal_x = max(
                0.0,
                min(
                    self.venue.width,
                    goal_x,
                ),
            )

            agent.goal_y = max(
                0.0,
                min(
                    self.venue.height,
                    goal_y,
                ),
            )

            agent.path = []
            agent.path_index = 0
            agent.reached_goal = False

        # Make sure the next analysis cycle sees the new crowd
        # distribution immediately.
        self._last_bottleneck_signature = None
        self.step_count = 0

        return len(selected_agents)

    # ------------------------------------------------------------------
    # Simulation step
    # ------------------------------------------------------------------

    def step(self) -> None:
        if (
            not self.venue
            or not self.agents
        ):
            return

        update_crowd(
            self.agents,
            DT,
        )

        for agent in self.agents:
            if agent.reached_goal:
                self.assign_new_destination(
                    agent
                )

        should_check = (
            self.step_count
            % BOTTLENECK_CHECK_EVERY
            == 0
        )

        if should_check:
            detected = detect_bottlenecks(
                self.agents,
                self.venue,
            )

            self.bottlenecks = detected

            signature = tuple(
                (
                    b["x"],
                    b["y"],
                    b["count"],
                    b["severity"],
                )
                for b in detected[:10]
            )

            congestion_changed = (
                signature
                != self._last_bottleneck_signature
            )

            if detected:

                if congestion_changed:
                    self.routes = (
                        suggest_rerouting(
                            self.agents,
                            self.venue,
                            detected,
                            nav_cache=self._nav_cache,
                        )
                    )

                    self._apply_routes(
                        self.routes
                    )

                self._last_bottleneck_signature = (
                    signature
                )

            else:
                self.routes = []
                self._last_bottleneck_signature = None

        self.sim_time += DT
        self.step_count += 1

    # ------------------------------------------------------------------
    # Apply routes
    # ------------------------------------------------------------------

    def _apply_routes(
        self,
        routes: List[dict],
    ) -> None:
        if not routes:
            return

        agents_by_id = {
            agent.agent_id: agent
            for agent in self.agents
        }

        for route in routes:
            agent = agents_by_id.get(
                route["agent_id"]
            )

            if agent is None:
                continue

            agent.path = list(
                route["new_path"]
            )

            agent.path_index = 0

    # ------------------------------------------------------------------
    # State export
    # ------------------------------------------------------------------

    def get_state(self) -> dict:
        total = len(
            self.agents
        )

        density = 0.0

        if (
            self.venue
            and self.venue.width
            and self.venue.height
        ):
            density = (
                total
                / (
                    self.venue.width
                    * self.venue.height
                )
            )

        risk = "LOW"

        if self.bottlenecks:
            max_severity = max(
                b["severity"]
                for b in self.bottlenecks
            )

            if max_severity > 0.66:
                risk = "HIGH"

            elif max_severity > 0.33:
                risk = "MODERATE"

        if (
            total
            <= MAX_RENDERED_AGENTS
        ):
            render_agents = self.agents
        else:
            stride = max(
                1,
                total
                // MAX_RENDERED_AGENTS,
            )

            render_agents = (
                self.agents[::stride]
            )[
                :MAX_RENDERED_AGENTS
            ]

        return {
            "sim_time": round(
                self.sim_time,
                2,
            ),
            "step": self.step_count,
            "venue_id": (
                self.venue.venue_id
                if self.venue
                else None
            ),
            "total_agents": total,
            "density": round(
                density,
                4,
            ),
            "risk": risk,
            "agents": [
                agent.to_dict()
                for agent in render_agents
            ],
            "bottlenecks": self.bottlenecks,
            "routes": self.routes,
        }

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def start(self) -> None:
        async with self._lock:
            self.running = True

    async def stop(self) -> None:
        async with self._lock:
            self.running = False