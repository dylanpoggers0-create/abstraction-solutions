"""
AI models + benchmark for the hydroponic cart.

Every model gets the same recent history and predicts each sensor value HORIZON minutes ahead.
When that time arrives, the prediction is scored against what the sensors actually read.
That gives a fair, apples-to-apples benchmark:
  - MAE (mean absolute error): how far off the predictions were, on average (lower = better)
  - speed: how long one prediction takes
  - reliability: how often the model crashed or had nothing to say

Built-in models (baselines your model has to beat):
  - "Persistence": assumes nothing changes. Simple, but surprisingly hard to beat short-term.
  - "Linear trend": fits a straight line to the last 2 hours and extends it.
Your model: put it in my_model.py (see the template there). It shows up automatically.
"""
import importlib.util
import threading
import time
import traceback
from pathlib import Path

HERE = Path(__file__).resolve().parent
KEYS = ["ph", "t_top", "h_top", "t_low", "h_low"]          # what every model predicts
LABELS = {"ph": "pH", "t_top": "Temp tower top (°C)", "h_top": "Humidity tower top (%)",
          "t_low": "Temp ambient (°C)", "h_low": "Humidity ambient (%)"}
LIMITS = {"ph": (0, 14), "t_top": (-10, 60), "h_top": (0, 100), "t_low": (-10, 60), "h_low": (0, 100)}


def _clamp(key, v):
    lo, hi = LIMITS[key]
    return max(lo, min(hi, v))


# ------------------------------------------------------------------ built-in models
class Persistence:
    name = "Persistence (baseline)"

    def predict(self, history, horizon_s):
        last = history[-1]
        return {k: last[k] for k in KEYS if last.get(k) is not None}


class LinearTrend:
    name = "Linear trend"

    def predict(self, history, horizon_s):
        now = history[-1]["ts"]
        recent = [r for r in history if r["ts"] >= now - 2 * 3600]
        out = {}
        for k in KEYS:
            pts = [(r["ts"], r[k]) for r in recent if r.get(k) is not None]
            if len(pts) < 10 or pts[-1][0] - pts[0][0] < 20 * 60:
                continue                      # not enough data for a trend yet
            mx = sum(t for t, _ in pts) / len(pts)
            my = sum(v for _, v in pts) / len(pts)
            den = sum((t - mx) ** 2 for t, _ in pts)
            slope = sum((t - mx) * (v - my) for t, v in pts) / den if den else 0.0
            out[k] = _clamp(k, my + slope * (now + horizon_s - mx))
        return out


class UserModel:
    """wraps my_model.py so a broken or missing model never crashes the app"""

    def __init__(self, path):
        self.path, self.fn, self.name, self.load_error = path, None, "Your model (my_model.py)", None
        if not path.exists():
            self.load_error = "my_model.py not found"
            return
        try:
            spec = importlib.util.spec_from_file_location("my_model", path)
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            self.fn = getattr(mod, "predict")
            self.name = getattr(mod, "NAME", self.name)
        except Exception as e:
            self.load_error = f"couldn't load my_model.py: {e}"

    def predict(self, history, horizon_s):
        if self.fn is None:
            return {}
        out = self.fn(history, horizon_s) or {}
        return {k: _clamp(k, float(v)) for k, v in out.items() if k in KEYS and v is not None}


# ------------------------------------------------------------------ benchmark
class Benchmark:
    def __init__(self, store, horizon_min=30, every_s=60):
        self.store = store
        self.horizon_s = int(horizon_min * 60)
        self.every_s = every_s
        self.models = [Persistence(), LinearTrend(), UserModel(HERE / "my_model.py")]
        self.stats = {m.name: {"runs": 0, "errors": 0, "empty": 0, "ms_total": 0.0, "last_error": None,
                               "last_prediction": {}} for m in self.models}
        self.started = time.time()
        self.lock = threading.Lock()
        with store.lock:
            store.db.execute("""CREATE TABLE IF NOT EXISTS predictions (
                model TEXT, made_ts REAL, target_ts REAL, key TEXT, predicted REAL,
                actual REAL, scored INTEGER DEFAULT 0)""")
            store.db.execute("CREATE INDEX IF NOT EXISTS pred_target ON predictions(scored, target_ts)")
            store.db.commit()

    # one round: every model predicts, then old predictions get scored
    def run_once(self, now=None):
        now = now or time.time()
        history = self.store.since(now - 6 * 3600)
        if history and now - history[-1]["ts"] <= 60:     # only predict from fresh data
            for m in self.models:
                st = self.stats[m.name]
                t0 = time.perf_counter()
                try:
                    pred = m.predict(history, self.horizon_s)
                except Exception as e:
                    with self.lock:
                        st["runs"] += 1
                        st["errors"] += 1
                        st["last_error"] = f"{type(e).__name__}: {e}"
                    print(f"[benchmark] {m.name} crashed:\n{traceback.format_exc()}")
                    continue
                ms = (time.perf_counter() - t0) * 1000
                with self.lock:
                    st["runs"] += 1
                    st["ms_total"] += ms
                    st["last_prediction"] = {k: round(v, 2) for k, v in pred.items()}
                    if not pred:
                        st["empty"] += 1
                with self.store.lock:
                    self.store.db.executemany(
                        "INSERT INTO predictions (model, made_ts, target_ts, key, predicted) VALUES (?,?,?,?,?)",
                        [(m.name, now, now + self.horizon_s, k, float(v)) for k, v in pred.items()])
                    self.store.db.commit()
        self.score(now)

    def score(self, now):
        """compare predictions whose time has come with what the sensors actually read"""
        with self.store.lock:
            due = self.store.db.execute(
                "SELECT rowid, target_ts, key FROM predictions WHERE scored = 0 AND target_ts <= ?",
                (now - 30,)).fetchall()
            for rowid, target, key in due:
                if key not in KEYS:                      # only ever our own column names in SQL
                    self.store.db.execute("UPDATE predictions SET scored = 1 WHERE rowid = ?", (rowid,))
                    continue
                row = self.store.db.execute(
                    f"SELECT AVG({key}) FROM readings WHERE ts BETWEEN ? AND ? AND {key} IS NOT NULL",
                    (target - 60, target + 60)).fetchone()
                self.store.db.execute("UPDATE predictions SET actual = ?, scored = 1 WHERE rowid = ?",
                                      (row[0], rowid))
            self.store.db.commit()

    def loop(self):
        while True:
            try:
                self.run_once()
            except Exception:
                print(f"[benchmark] round failed:\n{traceback.format_exc()}")
            time.sleep(self.every_s)

    # what the dashboard shows
    def summary(self):
        with self.store.lock:
            rows = self.store.db.execute(
                """SELECT model, key, COUNT(*), AVG(ABS(predicted - actual))
                   FROM predictions WHERE scored = 1 AND actual IS NOT NULL GROUP BY model, key""").fetchall()
            pending = self.store.db.execute("SELECT COUNT(*) FROM predictions WHERE scored = 0").fetchone()[0]
        mae = {}
        for model, key, n, err in rows:
            mae.setdefault(model, {})[key] = {"n": n, "mae": round(err, 3)}
        models = []
        with self.lock:
            for m in self.models:
                st = self.stats[m.name]
                ok_runs = st["runs"] - st["errors"]
                models.append({
                    "name": m.name,
                    "status": (getattr(m, "load_error", None) or
                               ("no predictions yet (predict() returns nothing)" if isinstance(m, UserModel)
                                and st["runs"] and st["empty"] == st["runs"] else "running")),
                    "runs": st["runs"], "errors": st["errors"], "last_error": st["last_error"],
                    "avg_ms": round(st["ms_total"] / ok_runs, 3) if ok_runs else None,
                    "last_prediction": st["last_prediction"],
                    "mae": mae.get(m.name, {}),
                })
        # best model per value = lowest MAE (needs at least 5 scored predictions to count)
        best = {}
        for k in KEYS:
            cands = [(m["mae"][k]["mae"], m["name"]) for m in models if k in m["mae"] and m["mae"][k]["n"] >= 5]
            if cands:
                top = min(cands)[0]
                winners = [n for e, n in cands if e == top]
                best[k] = winners[0] if len(winners) == 1 else "tie"
        return {"horizon_min": self.horizon_s / 60, "keys": KEYS, "labels": LABELS, "models": models,
                "best": best, "pending": pending}
