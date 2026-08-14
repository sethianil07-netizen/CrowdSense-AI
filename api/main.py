import os
import sys
import importlib.util

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(ROOT_DIR, "backend")
BACKEND_MAIN = os.path.join(BACKEND_DIR, "main.py")

if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

spec = importlib.util.spec_from_file_location(
    "crowdsense_backend_main",
    BACKEND_MAIN,
)

backend_main = importlib.util.module_from_spec(spec)
sys.modules["crowdsense_backend_main"] = backend_main
spec.loader.exec_module(backend_main)

app = backend_main.socket_app