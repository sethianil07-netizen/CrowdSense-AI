"""
main.py

FastAPI application for the Crowd Flow Optimizer backend. Exposes REST
endpoints for venue data and simulation control, and mounts a
Socket.io ASGI app (from sockets.py) for real-time streaming of
simulation state to the frontend.

Run with:
    uvicorn main:socket_app --reload --port 8000
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import List, Optional

import socketio
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from simulator import SimulationManager
from sockets import sio, _managers  # noqa: F401  (re-exported for socket handlers)
from venue import Venue

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("crowdsense.main")

DATA_DIR = Path(__file__).parent / "data"
VENUES_FILE = DATA_DIR / "venues.json"

app = FastAPI(
    title="Crowd Flow Optimizer API",
    description="Backend for CrowdSense AI — real-time crowd bottleneck prediction and rerouting.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# A default simulation manager used by the plain REST start/stop
# endpoints (independent of any particular socket session). The socket
# layer (sockets.py) manages its own per-session SimulationManagers for
# real-time streaming; this one backs simple polling / REST-only clients.
rest_manager = SimulationManager()


# ----------------------------------------------------------------------
# Pydantic request/response models
# ----------------------------------------------------------------------
class SimulationStartRequest(BaseModel):
    venue_id: str = Field(..., description="ID of the venue to simulate")
    num_agents: int = Field(500, ge=1, le=20000, description="Number of agents to spawn")


class SimulationStartResponse(BaseModel):
    status: str
    venue_id: str
    num_agents: int


class SimulationStopResponse(BaseModel):
    status: str


# ----------------------------------------------------------------------
# Venue data loading
# ----------------------------------------------------------------------
def _load_all_venues() -> List[dict]:
    if not VENUES_FILE.exists():
        raise HTTPException(status_code=500, detail=f"venues.json not found at {VENUES_FILE}")
    try:
        with open(VENUES_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data["venues"]
    except (json.JSONDecodeError, KeyError) as exc:
        raise HTTPException(status_code=500, detail=f"Malformed venues.json: {exc}") from exc


def _find_venue(venue_id: str) -> dict:
    for v in _load_all_venues():
        if v["id"] == venue_id:
            return v
    raise HTTPException(status_code=404, detail=f"Venue '{venue_id}' not found")


# ----------------------------------------------------------------------
# REST endpoints
# ----------------------------------------------------------------------
@app.get("/api/venues")
async def list_venues():
    """Return a lightweight list of all available venues."""
    try:
        venues = _load_all_venues()
        return {
            "venues": [
                {
                    "id": v["id"],
                    "name": v["name"],
                    "width": v["width"],
                    "height": v["height"],
                    "num_gates": len(v.get("entry_points", [])),
                    "num_exits": len(v.get("exit_points", [])),
                    "num_concessions": len(v.get("concessions", [])),
                }
                for v in