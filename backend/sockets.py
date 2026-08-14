"""
sockets.py

Socket.io event handlers for the Crowd Flow Optimizer. Handles client
connections, simulation start/config updates over the socket channel, and
runs the background broadcast loop that pushes simulation_update every
100ms plus bottleneck_alert / reroute_suggestion events when relevant.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Dict

import socketio

from simulator import SimulationManager
from venue import Venue

logger = logging.getLogger("crowdsense.sockets")

# Async Socket.IO server.
#
# The production frontend is served from Vercel, while the Socket.IO
# handshake is routed through /api/socket.io. CORS is therefore open here
# so the deployed frontend can establish the connection.
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    socketio_path="socket.io",
)

# One SimulationManager per connected session.
_managers: Dict[str, SimulationManager] = {}
_broadcast_tasks: Dict[str, asyncio.Task] = {}

BROADCAST_INTERVAL = 0.1  # 100ms


def _get_manager(sid: str) -> SimulationManager:
    if sid not in _managers:
        _managers[sid] = SimulationManager()
    return _managers[sid]


@sio.event
async def connect(sid, environ):
    logger.info("client connected: %s", sid)
    _managers[sid] = SimulationManager()

    await sio.emit(
        "connected",
        {
            "sid": sid,
            "message": "connected to CrowdSense AI",
        },
        to=sid,
    )


@sio.event
async def disconnect(sid):
    logger.info("client disconnected: %s", sid)

    task = _broadcast_tasks.pop(sid, None)
    if task:
        task.cancel()

    _managers.pop(sid, None)


@sio.event
async def start_simulation(sid, data):
    """
    data:
    {
        "venue": <venue dict>,
        "num_agents": int
    }
    """
    try:
        manager = _get_manager(sid)

        venue_data = data.get("venue")
        num_agents = int(data.get("num_agents", 500))

        if not venue_data:
            await sio.emit(
                "error",
                {
                    "message": "Missing 'venue' in start_simulation payload"
                },
                to=sid,
            )
            return

        venue = Venue.load_from_json(venue_data)

        manager.init_simulation(
            venue,
            num_agents=num_agents,
        )

        await manager.start()

        existing = _broadcast_tasks.get(sid)
        if existing:
            existing.cancel()

        _broadcast_tasks[sid] = asyncio.create_task(
            _broadcast_loop(sid)
        )

        await sio.emit(
            "simulation_started",
            {
                "venue_id": venue.venue_id,
                "num_agents": num_agents,
            },
            to=sid,
        )

    except Exception as exc:
        logger.exception("start_simulation failed")

        await sio.emit(
            "error",
            {
                "message": f"start_simulation failed: {exc}"
            },
            to=sid,
        )


@sio.event
async def stop_simulation(sid, data=None):
    manager = _managers.get(sid)

    if manager:
        await manager.stop()

    task = _broadcast_tasks.pop(sid, None)
    if task:
        task.cancel()

    await sio.emit(
        "simulation_stopped",
        {},
        to=sid,
    )


@sio.event
async def update_config(sid, data):
    """
    Allows the client to tweak live simulation parameters, e.g.

    {
        "num_agents": 800
    }

    without a full stop/start round trip.
    """
    manager = _managers.get(sid)

    if not manager or not manager.venue:
        await sio.emit(
            "error",
            {
                "message": "No active simulation to configure"
            },
            to=sid,
        )
        return

    try:
        if "num_agents" in data:
            manager.init_simulation(
                manager.venue,
                num_agents=int(data["num_agents"]),
            )

        await sio.emit(
            "config_updated",
            {
                "ok": True
            },
            to=sid,
        )

    except Exception as exc:
        logger.exception("update_config failed")

        await sio.emit(
            "error",
            {
                "message": f"update_config failed: {exc}"
            },
            to=sid,
        )


async def _broadcast_loop(sid: str) -> None:
    """
    Background task:
    - steps the simulation
    - emits simulation_update approximately every 100ms
    - emits bottleneck alerts
    - emits reroute suggestions
    """
    manager = _managers.get(sid)

    if not manager:
        return

    try:
        previously_had_bottleneck = False

        while manager.running:
            manager.step()

            state = manager.get_state()

            await sio.emit(
                "simulation_update",
                state,
                to=sid,
            )

            if state.get("bottlenecks"):
                await sio.emit(
                    "bottleneck_alert",
                    {
                        "bottlenecks": state["bottlenecks"],
                        "risk": state["risk"],
                    },
                    to=sid,
                )

                previously_had_bottleneck = True

            elif previously_had_bottleneck:
                await sio.emit(
                    "bottleneck_cleared",
                    {},
                    to=sid,
                )

                previously_had_bottleneck = False

            if state.get("routes"):
                await sio.emit(
                    "reroute_suggestion",
                    {
                        "routes": state["routes"],
                    },
                    to=sid,
                )

            await asyncio.sleep(BROADCAST_INTERVAL)

    except asyncio.CancelledError:
        logger.info(
            "broadcast loop cancelled for %s",
            sid,
        )

    except Exception:
        logger.exception(
            "broadcast loop crashed for %s",
            sid,
        )
