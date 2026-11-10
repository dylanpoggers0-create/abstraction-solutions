#!/usr/bin/env python3
"""
Hydro Cart cloud sync: lets admin.html show the cart's live data from anywhere.

Runs on the Raspberry Pi next to hydro_app.py. Every 15 seconds it reads the dashboard data from the
app on this Pi (http://127.0.0.1:8000) and sends a copy to the website's server, which only keeps the
newest copy. All readings, settings and benchmark data stay on the Pi. hydro_app.py is not changed,
so the test window's code fingerprint stays valid.

Settings: cloud.json in this folder (not uploaded to GitHub):
    {"url": "https://abstraction-quote-engine.onrender.com", "key": "<same as HYDRO_DEVICE_KEY on Render>"}

Run:  python3 cloud_sync.py        (or as the hydro-cloud service, see README)
Standard library only.
"""
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
APP = "http://127.0.0.1:8000"
EVERY_S = 15            # how often the live parts are sent
SLOW_EVERY = 8          # charts, settings and benchmark: every 8th time (every 2 minutes)

FAST = {"latest": "/api/latest", "suggestions": "/api/suggestions", "events": "/api/events?limit=40"}
SLOW = {"config": "/api/config",
        "benchmark_all": "/api/benchmark?phase=all", "benchmark_test": "/api/benchmark?phase=test",
        "history_6": "/api/history?hours=6", "history_24": "/api/history?hours=24",
        "history_168": "/api/history?hours=168"}

local = urllib.request.build_opener(urllib.request.ProxyHandler({}))   # the app on this Pi, never via a proxy


def log(msg):
    print(time.strftime("%Y-%m-%d %H:%M:%S"), msg, flush=True)


def load_settings():
    path = HERE / "cloud.json"
    try:
        cfg = json.loads(path.read_text())
        url, key = cfg["url"].strip().rstrip("/"), cfg["key"].strip()
    except (OSError, ValueError, KeyError, AttributeError):
        sys.exit(f"Make {path} with your server address and device key (see README).")
    if not url.startswith("https://") or not key or "PASTE" in key:
        sys.exit(f"Fill in the real url and key in {path}.")
    return url, key


def read_app(paths):
    """Gets each part from the app on this Pi. Raises if the app isn't running."""
    out = {}
    for name, path in paths.items():
        with local.open(APP + path, timeout=20) as r:
            out[name] = json.loads(r.read())
    return out


def push(url, key, parts):
    body = json.dumps(parts, separators=(",", ":")).encode()
    req = urllib.request.Request(url + "/hydro/push", data=body, method="POST",
                                 headers={"Content-Type": "application/json", "X-Hydro-Key": key})
    with urllib.request.urlopen(req, timeout=60) as r:     # 60 s: Render's free server can be slow to wake
        return json.loads(r.read())


def main():
    url, key = load_settings()
    log(f"Sending cart data to {url} every {EVERY_S} s")
    n, need_slow, last_problem = 0, True, None
    while True:
        started = time.time()
        try:
            slow = need_slow or n % SLOW_EVERY == 0
            parts = read_app({**FAST, **SLOW} if slow else FAST)
            push(url, key, parts)
            need_slow = False
            if last_problem:
                log("Sending again.")
                last_problem = None
            elif n % 240 == 0:
                log("Sending fine.")                       # a sign of life in the log about once an hour
        except urllib.error.HTTPError as e:
            problem = f"Server said {e.code}" + (" (check the key in cloud.json and HYDRO_DEVICE_KEY on Render)"
                                                 if e.code == 401 else "")
            need_slow = True
        except (urllib.error.URLError, OSError, ValueError) as e:
            problem = f"Can't send right now ({e}). Will keep trying."
            need_slow = True
        else:
            problem = None
        if problem and problem != last_problem:
            log(problem)
            last_problem = problem
        n += 1
        time.sleep(max(1.0, EVERY_S - (time.time() - started)))


if __name__ == "__main__":
    main()
