"""
sockets.py

Socket.io event handlers for the Crowd Flow Optimizer.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Dict

import socketio

from simulator import SimulationManager
from venue import Venue

logger = logging.getLogger(
    "crowdsense.sockets"
)

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    socketio_path="api/socket.io",
)

_managers: Dict[
    str,
    SimulationManager
] = {}

_broadcast_tasks: Dict[
    str,
    asyncio.Task
] = {}

BROADCAST_INTERVAL = 0.1


def _get_manager(
    sid: str,
) -> SimulationManager:
    if sid not in _managers:
        _managers[sid] = (
            SimulationManager()
        )

    return _managers[sid]


@sio.event
async def connect(
    sid,
    environ,
):
    logger.info(
        "client connected: %s",
        sid,
    )

    _managers[sid] = (
        SimulationManager()
    )

    await sio.emit(
        "connected",
        {
            "sid": sid,
            "message": (
                "connected to CrowdSense AI"
            ),
        },
        to=sid,
    )


@sio.event
async def disconnect(
    sid,
):
    logger.info(
        "client disconnected: %s",
        sid,
    )

    task = _broadcast_tasks.pop(
        sid,
        None,
    )

    if task:
        task.cancel()

    _managers.pop(
        sid,
        None,
    )


@sio.event
async def start_simulation(
    sid,
    data,
):
    try:
        manager = _get_manager(
            sid
        )

        venue_data = (
            data.get("venue")
        )

        num_agents = int(
            data.get(
                "num_agents",
                500,
            )
        )

        if not venue_data:
            await sio.emit(
                "error",
                {
                    "message": (
                        "Missing 'venue' in "
                        "start_simulation payload"
                    )
                },
                to=sid,
            )
            return

        venue = Venue.load_from_json(
            venue_data
        )

        manager.init_simulation(
            venue,
            num_agents=num_agents,
        )

        await manager.start()

        existing = _broadcast_tasks.get(
            sid
        )

        if existing:
            existing.cancel()

        _broadcast_tasks[sid] = (
            asyncio.create_task(
                _broadcast_loop(sid)
            )
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
        logger.exception(
            "start_simulation failed"
        )

        await sio.emit(
            "error",
            {
                "message": (
                    f"start_simulation failed: "
                    f"{exc}"
                )
            },
            to=sid,
        )


@sio.event
async def stop_simulation(
    sid,
    data=None,
):
    manager = _managers.get(
        sid
    )

    if manager:
        await manager.stop()

    task = _broadcast_tasks.pop(
        sid,
        None,
    )

    if task:
        task.cancel()

    await sio.emit(
        "simulation_stopped",
        {},
        to=sid,
    )


# ----------------------------------------------------------------------
# Multiple crowd surge event
# ----------------------------------------------------------------------

@sio.event
async def crowd_surge(
    sid,
    data,
):
    """
    Expected payload:

    {
        "locations": [
            {"id": "gate-a", "x": 10, "y": 20},
            {"id": "gate-c", "x": 90, "y": 5}
        ],
        "fraction": 0.70,
        "radius": 1.4
    }

    Backward compatibility:
    If locations is omitted, x/y are accepted as a single target.
    """

    manager = _managers.get(
        sid
    )

    if (
        not manager
        or not manager.running
    ):
        await sio.emit(
            "error",
            {
                "message": (
                    "Start the simulation "
                    "before triggering a crowd surge"
                )
            },
            to=sid,
        )
        return

    try:
        raw_locations = (
            data.get("locations")
        )

        # ------------------------------------------------------------
        # Preferred multi-location format.
        # ------------------------------------------------------------

        if isinstance(
            raw_locations,
            list,
        ):
            locations = []

            for location in raw_locations:
                if not isinstance(
                    location,
                    dict,
                ):
                    continue

                try:
                    locations.append(
                        {
                            "id": location.get(
                                "id"
                            ),
                            "x": float(
                                location[
                                    "x"
                                ]
                            ),
                            "y": float(
                                location[
                                    "y"
                                ]
                            ),
                        }
                    )
                except (
                    KeyError,
                    TypeError,
                    ValueError,
                ):
                    continue

        else:
            # --------------------------------------------------------
            # Backward-compatible single target.
            # --------------------------------------------------------

            locations = [
                {
                    "x": float(
                        data.get(
                            "x",
                            42,
                        )
                    ),
                    "y": float(
                        data.get(
                            "y",
                            20,
                        )
                    ),
                }
            ]

        if not locations:
            await sio.emit(
                "error",
                {
                    "message": (
                        "No valid surge locations supplied"
                    )
                },
                to=sid,
            )
            return

        fraction = float(
            data.get(
                "fraction",
                0.70,
            )
        )

        radius = float(
            data.get(
                "radius",
                1.4,
            )
        )

        affected = (
            manager.trigger_multiple_crowd_surges(
                locations=locations,
                fraction=fraction,
                radius=radius,
            )
        )

        logger.info(
            "Crowd surge triggered for %s: "
            "%d agents across %d locations",
            sid,
            affected,
            len(locations),
        )

        await sio.emit(
            "crowd_surge_triggered",
            {
                "affected_agents": affected,
                "locations": locations,
            },
            to=sid,
        )

    except Exception as exc:
        logger.exception(
            "crowd_surge failed"
        )

        await sio.emit(
            "error",
            {
                "message": (
                    f"crowd_surge failed: "
                    f"{exc}"
                )
            },
            to=sid,
        )


# ----------------------------------------------------------------------
# Config updates
# ----------------------------------------------------------------------

@sio.event
async def update_config(
    sid,
    data,
):
    manager = _managers.get(
        sid
    )

    if (
        not manager
        or not manager.venue
    ):
        await sio.emit(
            "error",
            {
                "message": (
                    "No active simulation "
                    "to configure"
                )
            },
            to=sid,
        )
        return

    try:
        if "num_agents" in data:
            manager.init_simulation(
                manager.venue,
                num_agents=int(
                    data[
                        "num_agents"
                    ]
                ),
            )

        await sio.emit(
            "config_updated",
            {
                "ok": True
            },
            to=sid,
        )

    except Exception as exc:
        logger.exception(
            "update_config failed"
        )

        await sio.emit(
            "error",
            {
                "message": (
                    f"update_config failed: "
                    f"{exc}"
                )
            },
            to=sid,
        )


# ----------------------------------------------------------------------
# Broadcast loop
# ----------------------------------------------------------------------

async def _broadcast_loop(
    sid: str,
) -> None:
    manager = _managers.get(
        sid
    )

    if not manager:
        return

    try:
        previously_had_bottleneck = (
            False
        )

        while manager.running:
            manager.step()

            state = (
                manager.get_state()
            )

            await sio.emit(
                "simulation_update",
                state,
                to=sid,
            )

            if state["bottlenecks"]:

                await sio.emit(
                    "bottleneck_alert",
                    {
                        "bottlenecks": state[
                            "bottlenecks"
                        ],
                        "risk": state[
                            "risk"
                        ],
                    },
                    to=sid,
                )

                previously_had_bottleneck = (
                    True
                )

            elif previously_had_bottleneck:

                await sio.emit(
                    "bottleneck_cleared",
                    {},
                    to=sid,
                )

                previously_had_bottleneck = (
                    False
                )

            if state["routes"]:

                await sio.emit(
                    "reroute_suggestion",
                    {
                        "routes": state[
                            "routes"
                        ]
                    },
                    to=sid,
                )

            await asyncio.sleep(
                BROADCAST_INTERVAL
            )

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