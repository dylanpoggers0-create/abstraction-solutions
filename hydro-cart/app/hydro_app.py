"""
Hydroponic Cart Monitor - Abstraction Solutions

Reads the Arduino Mega over USB, saves every reading, works out suggestions
("pH is lower than normal", "plant tank low", ...) and serves a live
dashboard at http://localhost:8000

Run:
    pip install pyserial
    python hydro_app.py              # real cart (finds the Arduino automatically)
    python hydro_app.py --demo       # fake data, no Arduino needed
    python hydro_app.py --port COM5  # pick the port yourself (Windows); /dev/ttyACM0 on Mac/Linux

Everything else is Python's standard library. Settings live in config.json (made on first run).
"""
import argparse
import csv
import hashlib
import io
import json
import math
import platform
import random
import sqlite3
import statistics
import sys
import threading
import time
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse, parse_qs

from models import Benchmark, EXCLUSION_RULES, KEYS, LABELS, SPEC

HERE = Path(__file__).resolve().parent
CONFIG_PATH = HERE / "config.json"

DEFAULT_CONFIG = {
    "serial_port": "auto",
    # pH board: volts at pH 7 and how many volts one pH step changes it.
    # Calibrate with pH 7 and pH 4 liquids: ph7_volts = reading in pH 7,
    # volts_per_ph = (reading in pH 4 - reading in pH 7) / 3. Then set ph_calibrated to true.
    "ph7_volts": 2.50,
    "volts_per_ph": 0.18,
    "ph_calibrated": False,
    # healthy ranges (most leafy greens and herbs)
    "ph_min": 5.5, "ph_max": 6.5,
    "temp_min_c": 18, "temp_max_c": 27,
    "humidity_min": 40, "humidity_max": 70,
    "electronics_humidity_max": 80,
    # water strips: below this number = no water touching the strip (tank empty)
    "strip_empty_below": 150,
    # no reading for this many seconds = cart offline
    "offline_after_s": 30,
}


def load_config():
    if not CONFIG_PATH.exists():
        CONFIG_PATH.write_text(json.dumps(DEFAULT_CONFIG, indent=2))
    cfg = dict(DEFAULT_CONFIG)
    cfg.update(json.loads(CONFIG_PATH.read_text()))
    return cfg


CFG = load_config()
FIELDS = ["t_top", "h_top", "t_low", "h_low", "strip_water", "strip_nutr", "ph_volts", "ph"]


# ------------------------------------------------------------------ storage
class Store:
    def __init__(self, path):
        self.path = Path(path)
        self.reset_at = 0.0
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.lock = threading.Lock()
        with self.lock:
            self.db.execute("PRAGMA journal_mode=WAL")   # lets the benchmark read while readings are written
            self.db.execute(f"CREATE TABLE IF NOT EXISTS readings (ts REAL, {', '.join(f + ' REAL' for f in FIELDS)})")
            self.db.execute("CREATE INDEX IF NOT EXISTS readings_ts ON readings(ts)")
            # every time a suggestion starts or clears, it's logged here ("stored states")
            self.db.execute("CREATE TABLE IF NOT EXISTS events (ts REAL, key TEXT, level TEXT, state TEXT, title TEXT)")
            self.db.commit()

    def add(self, ts, r):
        with self.lock:
            self.db.execute(f"INSERT INTO readings VALUES (?, {', '.join('?' * len(FIELDS))})",
                            [ts] + [r.get(f) for f in FIELDS])
            self.db.commit()

    def since(self, t0):
        with self.lock:
            cur = self.db.execute(f"SELECT ts, {', '.join(FIELDS)} FROM readings WHERE ts >= ? ORDER BY ts", (t0,))
            return [dict(zip(["ts"] + FIELDS, row)) for row in cur.fetchall()]

    def latest(self, n=1):
        with self.lock:
            cur = self.db.execute(f"SELECT ts, {', '.join(FIELDS)} FROM readings ORDER BY ts DESC LIMIT ?", (n,))
            return [dict(zip(["ts"] + FIELDS, row)) for row in cur.fetchall()]

    def log_event(self, ts, key, level, state, title):
        with self.lock:
            self.db.execute("INSERT INTO events VALUES (?,?,?,?,?)", (ts, key, level, state, title))
            self.db.commit()

    def reset(self):
        """erase all readings, alerts and AI predictions. A backup copy of the old data is saved first."""
        backup = self.path.with_name(f"{self.path.stem}_backup_{time.strftime('%Y%m%d_%H%M%S')}.db")
        with self.lock:
            dst = sqlite3.connect(backup)
            self.db.backup(dst)
            dst.close()
            for table in ("readings", "events", "predictions", "test_window"):
                if self.db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone():
                    self.db.execute(f"DELETE FROM {table}")
            self.db.commit()
            self.reset_at = time.time()
        return backup.name

    def events(self, limit=50):
        with self.lock:
            cur = self.db.execute("SELECT ts, key, level, state, title FROM events ORDER BY ts DESC LIMIT ?", (limit,))
            return [dict(zip(["ts", "key", "level", "state", "title"], r)) for r in cur.fetchall()]


def volts_to_ph(v):
    if v is None:
        return None
    return round(7.0 + (CFG["ph7_volts"] - v) / CFG["volts_per_ph"], 2)


# ------------------------------------------------------------------ suggestions ("what the AI finds")
def slope_per_hour(rows, key):
    """least-squares trend of a value, in units per hour (None if not enough data)"""
    pts = [(r["ts"], r[key]) for r in rows if r.get(key) is not None]
    if len(pts) < 20 or pts[-1][0] - pts[0][0] < 3600:
        return None
    t0 = pts[0][0]
    xs = [(t - t0) / 3600 for t, _ in pts]
    ys = [v for _, v in pts]
    mx, my = sum(xs) / len(xs), sum(ys) / len(ys)
    den = sum((x - mx) ** 2 for x in xs)
    return None if den == 0 else sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / den


def suggestions(store, now=None):
    now = now or time.time()
    out = []

    def add(key, level, title, detail):
        out.append({"key": key, "level": level, "title": title, "detail": detail})

    last = store.latest(12)
    if not last or now - last[0]["ts"] > CFG["offline_after_s"]:
        add("offline", "urgent", "No readings from the cart",
            "Check that the Arduino is plugged into this computer by USB and the sketch is uploaded.")
        return out
    r = last[0]

    # pH
    ph = r.get("ph")
    lo, hi = CFG["ph_min"], CFG["ph_max"]
    if ph is not None:
        if ph < lo:
            add("ph_low", "urgent" if ph < lo - 0.5 else "warn", f"pH is lower than normal ({ph:.1f})",
                f"Healthy range is {lo}–{hi}. Raise it slowly: a little pH Up at a time, or a partial water change, "
                "then re-check in an hour.")
        elif ph > hi:
            add("ph_high", "urgent" if ph > hi + 0.5 else "warn", f"pH is higher than normal ({ph:.1f})",
                f"Healthy range is {lo}–{hi}. Lower it slowly: a little pH Down at a time, then re-check in an hour.")
        else:
            trend = slope_per_hour(store.since(now - 6 * 3600), "ph")
            if trend is not None and abs(trend) > 0.005:
                edge = lo if trend < 0 else hi
                hours = (edge - ph) / trend
                if 0 < hours < 24:
                    add("ph_trend", "info", f"pH is drifting {'down' if trend < 0 else 'up'}",
                        f"About {abs(trend) * 24:.2f} per day. At this rate it leaves the healthy range in about "
                        f"{hours:.0f} hours. Worth checking soon.")
        recent = [x["ph"] for x in last if x.get("ph") is not None]
        if len(recent) >= 6 and statistics.pstdev(recent) > 0.15:
            add("ph_noisy", "info", "pH readings are jumping around",
                "Pumps, the heater or the air pump in the same water can disturb the probe. "
                "Also check the probe tip is clean and fully under water.")
        if not CFG["ph_calibrated"]:
            add("ph_cal", "info", "pH is only roughly calibrated",
                "For accurate pH, dip the probe in pH 7 and pH 4 liquids and put those readings in config.json.")

    # tanks: strip_water (A0) = backup tank up top, strip_nutr (A1) = plant tank
    if r.get("strip_nutr") is not None and r["strip_nutr"] < CFG["strip_empty_below"]:
        add("plant_tank_low", "urgent", "More water! The plant tank is low",
            "Refill the plant tank from the backup tank so the pump doesn't run dry.")
    if r.get("strip_water") is not None and r["strip_water"] < CFG["strip_empty_below"]:
        add("backup_empty", "warn", "The backup tank is empty",
            "Refill the backup tank up top so there's water ready for the plant tank.")

    # room air around the plants: the ambient DHT11 (D27, up top by the backup tank).
    # The D26 DHT11 sits at the tower top in the drip zone, where ~100% humidity is normal,
    # so it is shown and benchmarked but doesn't trigger air alerts.
    t, h = r.get("t_low"), r.get("h_low")
    if t is not None and t > CFG["temp_max_c"]:
        add("hot", "warn", f"The room is hot ({t:.0f}°C)",
            "Raise the grow lights a little or add airflow. Most greens prefer under 27°C.")
    if t is not None and t < CFG["temp_min_c"]:
        add("cold", "warn", f"The room is cold ({t:.0f}°C)",
            "Growth slows below 18°C. Move the cart somewhere warmer or keep the lights on longer.")
    if h is not None and h > CFG["humidity_max"]:
        add("humid", "warn", f"Room humidity is high ({h:.0f}%)",
            "Above 70% raises the risk of mold. Add airflow around the plants.")
    if h is not None and h < CFG["humidity_min"]:
        add("dry", "info", f"Room air is dry ({h:.0f}%)", "Below 40% can stress leaves. Usually fine short term.")

    # ambient air up top (DHT11 on D27, by the backup tank and electronics)
    hl = r.get("h_low")
    if hl is not None and hl > CFG["electronics_humidity_max"]:
        add("electronics_humid", "urgent", f"Ambient humidity is {hl:.0f}%, too damp for the electronics",
            "Check for splashes or condensation near the Arduino and boards.")

    # sensors not answering (3 readings in a row)
    for key, name, label, pin in (("t_top", "top", "tower-top", 26), ("t_low", "low", "ambient", 27)):
        if len(last) >= 3 and all(x.get(key) is None for x in last[:3]):
            add(f"dht_{name}", "warn", f"The {label} temperature sensor isn't answering",
                f"Check its three wires: S to D{pin}, middle to 5V, right to GND.")

    if not any(s["level"] in ("warn", "urgent") for s in out):
        out.insert(0, {"key": "ok", "level": "ok", "title": "Everything looks healthy",
                       "detail": "All readings are inside their normal ranges."})
    return out


class SuggestionTracker:
    """remembers which suggestions are active and logs when each starts or clears"""

    def __init__(self, store):
        self.store, self.active = store, {}

    def update(self, now=None):
        now = now or time.time()
        cur = {s["key"]: s for s in suggestions(self.store, now)}
        quiet = ("ok", "ph_cal")   # not worth a line in the alert history
        for k, s in cur.items():
            if k not in self.active and k not in quiet:
                self.store.log_event(now, k, s["level"], "start", s["title"])
        for k, s in self.active.items():
            if k not in cur and k not in quiet:
                self.store.log_event(now, k, s["level"], "clear", s["title"])
        self.active = cur
        return list(cur.values())


# ------------------------------------------------------------------ data sources
def find_port():
    from serial.tools import list_ports
    ports = list(list_ports.comports())
    for p in ports:
        text = f"{p.description} {p.manufacturer or ''}".lower()
        if any(w in text for w in ("arduino", "mega", "ch340", "usb serial", "usb-serial", "wch")):
            return p.device
    for p in ports:
        if "ACM" in p.device or "usbmodem" in p.device or "usbserial" in p.device:
            return p.device
    return ports[0].device if ports else None


def serial_reader(store, tracker, port_arg):
    import serial
    while True:
        port = port_arg if port_arg != "auto" else find_port()
        if not port:
            print("Waiting for the Arduino... (plug it in by USB)")
            tracker.update()
            time.sleep(5)
            continue
        try:
            with serial.Serial(port, 115200, timeout=10) as ser:
                print(f"Connected to {port}")
                while True:
                    line = ser.readline().decode("utf-8", "ignore").strip()
                    if not line.startswith("{"):
                        continue
                    try:
                        r = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    r["ph"] = volts_to_ph(r.get("ph_volts"))
                    store.add(time.time(), r)
                    tracker.update()
        except Exception as e:  # unplugged, port busy, ...
            print(f"Serial problem on {port}: {e}. Retrying in 5 s")
            tracker.update()
            time.sleep(5)


def demo_reading(t, start):
    """fake cart: pH drifts down, the backup tank runs dry after ~3 minutes, humidity creeps up"""
    mins = max(0.0, (t - start) / 60)   # minutes since the demo started (0 for backfilled history)
    day = math.sin((t % 86400) / 86400 * 2 * math.pi)
    ph = 6.15 - 0.012 * ((t - (start - 24 * 3600)) / 3600) - 0.08 * mins / 10 + random.gauss(0, 0.02)
    return {
        "t_top": round(24 + 2.5 * day + random.gauss(0, 0.3), 1),
        "h_top": round(62 + 6 * day + mins * 0.6 + random.gauss(0, 1)),
        "t_low": round(22 + 1.5 * day + random.gauss(0, 0.3), 1),
        "h_low": round(58 + 4 * day + random.gauss(0, 1)),
        "strip_water": 0 if mins > 3 else int(420 + random.gauss(0, 8)),
        "strip_nutr": int(380 + random.gauss(0, 8)),
        "ph_volts": round(CFG["ph7_volts"] - (ph - 7) * CFG["volts_per_ph"], 3),
    }


def demo_feed(store, tracker):
    start = time.time()
    if not store.latest():  # backfill a day of history so the charts have something to show
        for i in range(24 * 12, 0, -1):
            ts = start - i * 300
            r = demo_reading(ts, start)
            r["ph"] = volts_to_ph(r["ph_volts"])
            store.add(ts, r)
    while True:
        r = demo_reading(time.time(), start)
        r["ph"] = volts_to_ph(r["ph_volts"])
        store.add(time.time(), r)
        tracker.update()
        time.sleep(5)


# ------------------------------------------------------------------ web server
# Pages allowed to read this app from the browser (the website's admin page + this app's own page).
# Only reachable from this computer: the server listens on 127.0.0.1, never the network.
ALLOWED_ORIGINS = {"https://abstraction-solutions.com", "https://www.abstraction-solutions.com",
                   "http://localhost:8000", "http://127.0.0.1:8000"}
STARTED = time.time()
APP_HASH = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
ACTION_HEADERS = ("X-Hydro-Action", "X-Hydro-Reset")


def system_stats(store, every_s=5):
    """benchmark of the cart itself: is data arriving, and which sensors drop out"""
    now = time.time()
    t0 = max(now - 3600, STARTED, store.reset_at)   # last hour, only while running and since the last reset
    hour = store.since(t0)
    expected = max(1, int((now - t0) / every_s) + 1)
    drop = {}
    for k in ("ph", "t_top", "t_low", "strip_water", "strip_nutr"):
        missing = sum(1 for r in hour if r.get(k) is None)
        drop[k] = round(100 * missing / len(hour), 1) if hour else None
    gaps = [b["ts"] - a["ts"] for a, b in zip(hour, hour[1:])]
    if hour:
        gaps.append(now - hour[-1]["ts"])     # time since the newest reading counts too
    return {"uptime_s": round(now - STARTED), "readings_last_hour": len(hour),
            "expected_last_hour": max(expected, len(hour)),
            "delivery_pct": round(min(100, 100 * len(hour) / expected), 1) if hour else 0,
            "longest_gap_s": round(max(gaps), 1) if gaps else None,
            "sensor_dropout_pct": drop}


def protocol(bench):
    """everything someone needs to check or repeat the study"""
    return {
        "title": "Prospective forecasting benchmark on a sensor-monitored hydroponic cart",
        "generated": time.strftime("%Y-%m-%d %H:%M:%S %z"),
        "test_window": bench.test_window(),
        "design": {
            "prediction_rounds_every_s": bench.every_s,
            "horizons_s": bench.horizons,
            "history_given_to_every_model_h": bench.history_s / 3600,
            "targets": {k: LABELS[k] for k in KEYS},
            "models": [{"name": m.name, "kind": getattr(m, "kind", "baseline"), "sha256": m.code_hash}
                       for m in bench.models],
            "reference_model": "Persistence (baseline)",
            "metrics": ["MAE", "RMSE", "Rel. MAE = MAE / persistence MAE on the same targets (paired)",
                        "coverage = share of targets the model predicted"],
            "significance": "Diebold-Mariano test on absolute-error differences (rectangular long-run variance "
                            "up to the forecast overlap, Newey-West fallback), Harvey-Leybourne-Newbold correction, "
                            "Student t p-values, reported only with at least ~10 non-overlapping horizons of data. Loss differences "
                            "are averaged on an even grid of max(5 min, horizon/12). The headline comparison "
                            "(your model vs the strongest other model per value and horizon) is Holm-Bonferroni "
                            "corrected; alpha = 0.05.",
            "exclusion_rules": EXCLUSION_RULES,
        },
        "sensors": {"spec": SPEC, "ph_calibrated": CFG["ph_calibrated"],
                    "ph_calibration": {"ph7_volts": CFG["ph7_volts"], "volts_per_ph": CFG["volts_per_ph"]},
                    "firmware": "hydro_sensors.ino, one reading every 5 s over USB at 115200 baud"},
        "software": {"hydro_app.py_sha256": APP_HASH, "python": sys.version.split()[0],
                     "platform": platform.platform()},
    }


def make_handler(store, tracker, bench):
    index = (HERE / "static" / "index.html").read_bytes()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass  # keep the console quiet

        def send(self, body, ctype="application/json", code=200, extra=None):
            if isinstance(body, (dict, list)):
                body = json.dumps(body).encode()
            elif isinstance(body, str):
                body = body.encode()
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Cache-Control", "no-store")
            self.cors()
            for k, v in (extra or {}).items():
                self.send_header(k, v)
            self.end_headers()
            self.wfile.write(body)

        def cors(self):
            origin = self.headers.get("Origin")
            if origin in ALLOWED_ORIGINS:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")
                # Chrome asks before a public website may talk to this computer ("private network access")
                self.send_header("Access-Control-Allow-Private-Network", "true")

        def do_OPTIONS(self):   # browser "may I?" check before cross-site requests
            self.send_response(204)
            self.cors()
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, " + ", ".join(ACTION_HEADERS))
            self.send_header("Access-Control-Max-Age", "600")
            self.end_headers()

        def do_GET(self):
            url = urlparse(self.path)
            q = parse_qs(url.query)
            now = time.time()
            if url.path in ("/", "/index.html"):
                return self.send(index, "text/html; charset=utf-8")
            if url.path in ("/hydro-admin.js", "/hydro-admin.css"):   # shared with the website's admin tab
                f = HERE / "static" / url.path.lstrip("/")
                return self.send(f.read_bytes(), "application/javascript" if f.suffix == ".js" else "text/css")
            if url.path == "/api/latest":
                last = store.latest()
                return self.send({"reading": last[0] if last else None, "now": now,
                                  "online": bool(last) and now - last[0]["ts"] <= CFG["offline_after_s"]})
            if url.path == "/api/history":
                hours = min(24 * 30, max(1, float(q.get("hours", ["24"])[0])))
                rows = store.since(now - hours * 3600)
                step = max(1, len(rows) // 400)  # at most ~400 points per chart
                return self.send(rows[::step])
            if url.path == "/api/suggestions":
                return self.send(suggestions(store))   # always fresh, so "offline" shows right away
            if url.path == "/api/events":
                return self.send(store.events(int(q.get("limit", ["40"])[0])))
            if url.path == "/api/config":
                return self.send(CFG)
            if url.path == "/api/benchmark":
                phase = "test" if q.get("phase", ["all"])[0] == "test" else "all"
                return self.send({"models": bench.summary(phase), "system": system_stats(store)})
            if url.path == "/api/protocol.json":   # the study plan + fingerprints, e.g. for OSF pre-registration
                body = json.dumps(protocol(bench), indent=2)
                return self.send(body, "application/json",
                                 extra={"Content-Disposition": "attachment; filename=hydro_protocol.json"})
            if url.path == "/api/export_predictions.csv":   # every prediction ever made, for the paper
                return self.stream_predictions()
            if url.path == "/api/export.csv":  # every reading, for training models later
                buf = io.StringIO()
                w = csv.writer(buf)
                w.writerow(["time"] + FIELDS)
                for r in store.since(0):
                    w.writerow([time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(r["ts"]))] + [r[f] for f in FIELDS])
                return self.send(buf.getvalue(), "text/csv",
                                 extra={"Content-Disposition": "attachment; filename=hydro_readings.csv"})
            self.send({"error": "not found"}, code=404)

        def stream_predictions(self):
            self.send_response(200)
            self.send_header("Content-Type", "text/csv")
            self.send_header("Content-Disposition", "attachment; filename=hydro_predictions.csv")
            self.cors()
            self.end_headers()
            cols = ["model", "made_ts", "target_ts", "horizon_s", "key", "predicted", "actual", "scored", "code"]
            self.wfile.write((",".join(cols) + "\n").encode())
            conn = sqlite3.connect(str(store.path))      # separate read connection: never blocks the sensors
            try:
                cur = conn.execute(f"SELECT {', '.join(cols)} FROM predictions ORDER BY made_ts, model, horizon_s")
                while True:
                    rows = cur.fetchmany(5000)
                    if not rows:
                        break
                    buf = io.StringIO()
                    csv.writer(buf, lineterminator="\n").writerows(rows)
                    self.wfile.write(buf.getvalue().encode())
            except (BrokenPipeError, ConnectionResetError):
                pass                                     # browser cancelled the download
            finally:
                conn.close()

        def do_POST(self):
            # Dashboard buttons (reset, start/end test window). Only the dashboard pages may do this: the browser
            # must send an allowed Origin plus a custom header, which other websites can't send without permission.
            path = urlparse(self.path).path
            if path not in ("/api/reset", "/api/test/start", "/api/test/end"):
                return self.send({"error": "not found"}, code=404)
            if self.headers.get("Origin") not in ALLOWED_ORIGINS or \
                    not any(self.headers.get(h) == "yes" for h in ACTION_HEADERS):
                return self.send({"error": "not allowed"}, code=403)
            if path == "/api/reset":
                backup = store.reset()
                bench.reset()
                tracker.active = {}
                print(f"Readings reset. Old data saved as {backup}")
                return self.send({"ok": True, "backup": backup})
            err = bench.start_test(APP_HASH) if path == "/api/test/start" else bench.end_test()
            if err:
                return self.send({"error": err}, code=409)
            print("Test window started." if path == "/api/test/start" else "Test window ended.")
            return self.send({"ok": True, "test_window": bench.test_window()})

    return Handler


def main():
    ap = argparse.ArgumentParser(description="Hydroponic cart monitor")
    ap.add_argument("--demo", action="store_true", help="fake data, no Arduino needed")
    ap.add_argument("--port", default=None, help="serial port, e.g. COM5 or /dev/ttyACM0 (default: auto)")
    ap.add_argument("--http-port", type=int, default=8000)
    ap.add_argument("--db", default=None, help="database file (default: hydro.db, or demo.db with --demo)")
    ap.add_argument("--allow-origin", action="append", default=[],
                    help="extra website address allowed to read this app (for testing)")
    ap.add_argument("--horizons", default="30,360,1440",
                    help="how far ahead every model predicts, in minutes, comma separated (default 30 min, 6 h, 24 h)")
    ap.add_argument("--horizon-min", type=float, default=None, help="use one horizon only (minutes)")
    ap.add_argument("--history-h", type=float, default=50, help="hours of history every model gets (default 50)")
    a = ap.parse_args()

    ALLOWED_ORIGINS.update(a.allow_origin)
    ALLOWED_ORIGINS.update({f"http://localhost:{a.http_port}", f"http://127.0.0.1:{a.http_port}"})
    store = Store(a.db or str(HERE / ("demo.db" if a.demo else "hydro.db")))
    tracker = SuggestionTracker(store)
    if a.demo:
        threading.Thread(target=demo_feed, args=(store, tracker), daemon=True).start()
    else:
        threading.Thread(target=serial_reader, args=(store, tracker, a.port or CFG["serial_port"]),
                         daemon=True).start()
    horizons = [a.horizon_min] if a.horizon_min else [float(x) for x in a.horizons.split(",") if x.strip()]
    bench = Benchmark(store, horizons_min=horizons, every_s=max(10, min(60, min(horizons) * 6)),
                      history_h=a.history_h, ph_calibrated=bool(CFG["ph_calibrated"]))
    threading.Thread(target=bench.loop, daemon=True).start()
    threading.Thread(target=bench.analysis_loop, daemon=True).start()
    srv = ThreadingHTTPServer(("127.0.0.1", a.http_port), make_handler(store, tracker, bench))
    print(f"Dashboard: http://localhost:{a.http_port}   (Ctrl+C to stop)")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("Stopped.")


if __name__ == "__main__":
    main()
