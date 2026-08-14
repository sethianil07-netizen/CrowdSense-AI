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
from typing import List

import socketio
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from simulator import SimulationManager
from sockets import sio, _managers  # noqa: F401
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
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Default REST simulation manager.
# The Socket.IO layer has its own per-session managers.
rest_manager = SimulationManager()


# ----------------------------------------------------------------------
# Pydantic request/response models
# ----------------------------------------------------------------------
class SimulationStartRequest(BaseModel):
    venue_id: str = Field(
        ...,
        description="ID of the venue to simulate",
    )
    num_agents: int = Field(
        500,
        ge=1,
        le=20000,
        description="Number of agents to spawn",
    )


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
        raise HTTPException(
            status_code=500,
            detail=f"venues.json not found at {VENUES_FILE}",
        )

    try:
        with open(VENUES_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)

        return data["venues"]

    except (json.JSONDecodeError, KeyError) as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Malformed venues.json: {exc}",
        ) from exc


def _find_venue(venue_id: str) -> dict:
    for venue in _load_all_venues():
        if venue["id"] == venue_id:
            return venue

    raise HTTPException(
        status_code=404,
        detail=f"Venue '{venue_id}' not found",
    )


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
                    "id": venue["id"],
                    "name": venue["name"],
                    "width": venue["width"],
                    "height": venue["height"],
                    "num_gates": len(venue.get("entry_points", [])),
                    "num_exits": len(venue.get("exit_points", [])),
                    "num_concessions": len(
                        venue.get("concessions", [])
                    ),
                }
                for venue in venues
            ]
        }

    except HTTPException:
        raise

    except Exception as exc:
        logger.exception("list_venues failed")
        raise HTTPException(
            status_code=500,
            detail=str(exc),
        ) from exc


@app.get("/api/venue/{venue_id}")
async def get_venue(venue_id: str):
    """Return the full layout for a single venue."""
    return _find_venue(venue_id)


@app.post(
    "/api/simulation/start",
    response_model=SimulationStartResponse,
)
async def start_simulation(request: SimulationStartRequest):
    """
    Start or restart the default REST-tracked simulation.

    Real-time clients should instead use Socket.IO and emit
    'start_simulation'.
    """
    try:
        venue_data = _find_venue(request.venue_id)
        venue = Venue.load_from_json(venue_data)

        rest_manager.init_simulation(
            venue,
            num_agents=request.num_agents,
        )

        await rest_manager.start()

        return SimulationStartResponse(
            status="started",
            venue_id=venue.venue_id,
            num_agents=request.num_agents,
        )

    except HTTPException:
        raise

    except Exception as exc:
        logger.exception("start_simulation failed")

        raise HTTPException(
            status_code=500,
            detail=str(exc),
        ) from exc


@app.post(
    "/api/simulation/stop",
    response_model=SimulationStopResponse,
)
async def stop_simulation():
    await rest_manager.stop()

    return SimulationStopResponse(
        status="stopped",
    )


@app.get("/api/simulation/state")
async def simulation_state():
    """
    Poll the current state of the REST-tracked simulation.
    """
    if not rest_manager.venue:
        raise HTTPException(
            status_code=400,
            detail="No simulation has been started yet",
        )

    if rest_manager.running:
        rest_manager.step()

    return rest_manager.get_state()


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "service": "crowdsense-backend",
    }


# ----------------------------------------------------------------------
# Mount Socket.IO as an ASGI sub-application
# ----------------------------------------------------------------------
socket_app = socketio.ASGIApp(
    sio,
    other_asgi_app=app,
    socketio_path="api/socket.io",
)
