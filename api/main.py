import os
import sys

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(ROOT_DIR, "backend")

# backend/main.py (and its sibling modules — sockets.py, simulator.py,
# venue.py, bottleneck.py, agents.py, physics.py) use bare imports like
# `from sockets import sio`, which only resolve automatically when
# Python's own search path includes the backend/ folder itself — true
# when running `uvicorn main:socket_app` directly from inside backend/,
# but NOT true when this shim imports it as the `backend.main` submodule
# (only the repo root gets added to sys.path in that case). Adding
# BACKEND_DIR here explicitly is what makes those bare imports resolve
# correctly when Vercel loads this file.
for path in (ROOT_DIR, BACKEND_DIR):
    if path not in sys.path:
        sys.path.insert(0, path)

from backend.main import socket_app as app
