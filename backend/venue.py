"""
venue.py

Defines the Venue class, which loads a venue layout (dimensions, gates,
exits, obstacles, concessions) from JSON and answers spatial queries such
as "is this point walkable" used by both the physics engine and the A*
rerouting graph builder.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional


@dataclass
class Obstacle:
    """Axis-aligned rectangular obstacle (a stage, wall segment, barrier,
    stall, etc.) that agents and pathfinding must route around."""
    x: float
    y: float
    width: float
    height: float
    label: str = "obstacle"

    def contains(self, x: float, y: float, margin: float = 0.0) -> bool:
        return (
            self.x - margin <= x <= self.x + self.width + margin
            and self.y - margin <= y <= self.y + self.height + margin
        )


@dataclass
class PointOfInterest:
    id: str
    x: float
    y: float
    label: str = ""


class Venue:
    """
    Represents a single venue layout: overall dimensions, entry/exit
    gates, obstacles, and concession stands. Provides `is_walkable` for
    collision checks and JSON loading via `load_from_json`.
    """

    def __init__(
        self,
        venue_id: str,
        name: str,
        width: float,
        height: float,
        entry_points: Optional[List[PointOfInterest]] = None,
        exit_points: Optional[List[PointOfInterest]] = None,
        obstacles: Optional[List[Obstacle]] = None,
        concessions: Optional[List[PointOfInterest]] = None,
    ):
        self.venue_id = venue_id
        self.name = name
        self.width = width
        self.height = height
        self.entry_points = entry_points or []
        self.exit_points = exit_points or []
        self.obstacles = obstacles or []
        self.concessions = concessions or []

    # ------------------------------------------------------------------
    # Construction
    # ------------------------------------------------------------------
    @classmethod
    def load_from_json(cls, data: dict) -> "Venue":
        """Build a Venue instance from a parsed JSON dict (see
        data/venues.json for the expected schema)."""
        entry_points = [
            PointOfInterest(id=p["id"], x=p["x"], y=p["y"], label=p.get("label", p["id"]))
            for p in data.get("entry_points", [])
        ]
        exit_points = [
            PointOfInterest(id=p["id"], x=p["x"], y=p["y"], label=p.get("label", p["id"]))
            for p in data.get("exit_points", [])
        ]
        obstacles = [
            Obstacle(
                x=o["x"], y=o["y"], width=o["width"], height=o["height"],
                label=o.get("label", "obstacle"),
            )
            for o in data.get("obstacles", [])
        ]
        concessions = [
            PointOfInterest(id=p["id"], x=p["x"], y=p["y"], label=p.get("label", p["id"]))
            for p in data.get("concessions", [])
        ]
        return cls(
            venue_id=data["id"],
            name=data["name"],
            width=data["width"],
            height=data["height"],
            entry_points=entry_points,
            exit_points=exit_points,
            obstacles=obstacles,
            concessions=concessions,
        )

    @classmethod
    def load_from_file(cls, path: str | Path, venue_id: Optional[str] = None) -> "Venue":
        """Load a venue (or list of venues) from a JSON file on disk."""
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        venues = data["venues"] if isinstance(data, dict) and "venues" in data else data
        if isinstance(venues, list):
            if venue_id is None:
                return cls.load_from_json(venues[0])
            for v in venues:
                if v["id"] == venue_id:
                    return cls.load_from_json(v)
            raise ValueError(f"Venue '{venue_id}' not found in {path}")
        return cls.load_from_json(venues)

    # ------------------------------------------------------------------
    # Spatial queries
    # ------------------------------------------------------------------
    def is_walkable(self, x: float, y: float, agent_margin: float = 0.3) -> bool:
        """Return True if (x, y) is inside the venue bounds and not inside
        (or too close to) any obstacle."""
        if x < 0 or y < 0 or x > self.width or y > self.height:
            return False
        for obstacle in self.obstacles:
            if obstacle.contains(x, y, margin=agent_margin):
                return False
        return True

    def random_entry(self):
        import random
        return random.choice(self.entry_points) if self.entry_points else None

    def random_exit(self):
        import random
        return random.choice(self.exit_points) if self.exit_points else None

    def to_dict(self) -> dict:
        return {
            "id": self.venue_id,
            "name": self.name,
            "width": self.width,
            "height": self.height,
            "entry_points": [vars(p) for p in self.entry_points],
            "exit_points": [vars(p) for p in self.exit_points],
            "obstacles": [vars(o) for o in self.obstacles],
            "concessions": [vars(p) for p in self.concessions],
        }
