"""
simulator.py

SimulationManager owns the lifecycle of one crowd simulation run: spawning
agents at venue entry points, stepping physics + bottleneck detection +
rerouting each tick, and exposing a serializable state snapshot for
broadcast over Socket.io.
"""

from __future__ import annotations

import asyncio
import random
import time
from typing import Dict, List, Optional

from agents import Agent
from bottleneck import detect_bottlenecks, suggest_rerouting
from physics import update_crowd
from venue import Venue

DT = 0.1                 # seconds per simulation step
STEP_HZ = 10              # ~10 steps/second


class SimulationManager:
    """
    Manages a single running crowd simulation: agent population, the
    venue layout, and per-step orchestration of physics, bottleneck
    detection, and rerouting.
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

    # ------------------------------------------------------------------
    # Setup
    # ------------------------------------------------------------------
    def init_simulation(self, venue: Venue, num_agents: int = 500) -> None:
        """Spawn `num_agents` agents at the venue's entry points, each
        assigned a random destination (an exit or a concession stand)."""
        self.venue = venue
        self.agents = []
        self.bottlenecks = []
        self.routes = []
        self.sim_time = 0.0
        self.step_count = 0

        if not venue.entry_points:
            raise ValueError("Venue has no entry points to spawn agents at")

        for i in range(num_agents):
            entry = random.choice(venue.entry_points)
            goal_x, goal_y = self._random_destination(venue)

            # Small random jitter so agents don't spawn stacked exactly
            # on top of one another.
            jitter_x = random.uniform(-1.0, 1.0)
            jitter_y = random.uniform(-1.0, 1.0)

            agent = Agent(
                x=max(0.0, min(venue.width, entry.x + jitter_x)),
                y=max(0.0, min(venue.height, entry.y + jitter_y)),
                goal_x=goal_x,
                goal_y=goal_y,
                entry_point=entry.id,
            )
            self.agents.append(agent)

    def _random_destination(self, venue: Venue):
        """Pick a random destination: mostly exits, sometimes concessions,
        to create realistic mixed crowd flow."""
        candidates = list(venue.exit_points)
        # Weight concessions in lightly so some agents linger/route there.
        candidates.extend(venue.concessions)
        if not candidates:
            return venue.width / 2, venue.height / 2
        choice = random.choice(candidates)
        return choice.x, choice.y

    def assign_new_destination(self, agent: Agent) -> None:
        if not self.venue:
            return
        goal_x, goal_y = self._random_destination(self.venue)
        agent.goal_x, agent.goal_y = goal_x, goal_y
        agent.reached_goal = False
        agent.path = []
        agent.path_index = 0

    # ------------------------------------------------------------------
    # Simulation step
    # ------------------------------------------------------------------
    def step(self) -> None:
        """Advance the simulation by one tick: physics, bottleneck
        detection, and rerouting suggestions."""
        if not self.venue or not self.agents:
            return

        update_crowd(self.agents, DT)

        # Agents that reached their goal get a fresh destination so the
        # simulation keeps producing continuous crowd flow.
        for agent in self.agents:
            if agent.reached_goal:
                self.assign_new_destination(agent)

        self.bottlenecks = detect_bottlenecks(self.agents, self.venue)
        if self.bottlenecks:
            self.routes = suggest_rerouting(self.agents, self.venue, self.bottlenecks)
            self._apply_routes(self.routes)
        else:
            self.routes = []

        self.sim_time += DT
        self.step_count += 1

    def _apply_routes(self, routes: List[dict]) -> None:
        """Assign the suggested A* paths onto the relevant agents so their
        desired direction actually follows the reroute."""
        by_id = {a.agent_id: a for a in self.agents}
        for route in routes:
            agent = by_id.get(route["agent_id"])
            if agent is not None:
                agent.path = list(route["new_path"])
                agent.path_index = 0

    # ------------------------------------------------------------------
    # State export
    # ------------------------------------------------------------------
    def get_state(self) -> dict:
        """Return a JSON-serializable snapshot of the current simulation
        state: agents, bottlenecks, and active reroute suggestions."""
        total = len(self.agents)
        density = 0.0
        if self.venue and self.venue.width and self.venue.height:
            density = total / (self.venue.width * self.venue.height)

        risk = "LOW"
        if self.bottlenecks:
            max_severity = max(b["severity"] for b in self.bottlenecks)
            if max_severity > 0.66:
                risk = "HIGH"
            elif max_severity > 0.33:
                risk = "MODERATE"
            else:
                risk = "LOW"

        return {
            "sim_time": round(self.sim_time, 2),
            "step": self.step_count,
            "venue_id": self.venue.venue_id if self.venue else None,
            "total_agents": total,
            "density": round(density, 4),
            "risk": risk,
            "agents": [a.to_dict() for a in self.agents],
            "bottlenecks": self.bottlenecks,
            "routes": self.routes,
        }

    # ------------------------------------------------------------------
    # Async run loop (used by sockets.py to broadcast at a fixed rate)
    # ------------------------------------------------------------------
    async def start(self) -> None:
        async with self._lock:
            self.running = True

    async def stop(self) -> None:
        async with self._lock:
            self.running = False
