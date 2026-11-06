"""
AI models + a rigorous benchmark for the hydroponic cart.

Design (what makes the comparison fair and hard to fool):
  - No peeking: every model only ever sees readings from before the moment it predicts. Live, the prediction is
    saved before the real value exists. For readings the cart saved on its own (no laptop connected), the app
    replays those moments in order after downloading them (a walk-forward evaluation), with the same rule.
  - Same inputs for every model: the same history (last HISTORY_H hours), the same moment, the same horizons.
  - Several horizons (default 30 min, 6 h, 24 h), because short horizons are dominated by "nothing changes".
  - Strong baselines, not just easy ones: persistence, seasonal naive (same time yesterday), linear trend,
    Holt's damped-trend exponential smoothing, and a ridge-regression autoregressive model.
  - Paired scoring: every model is compared with persistence on exactly the same targets
    (Rel. MAE = model MAE / persistence MAE on those targets; below 1 = better than persistence).
  - Significance: Diebold-Mariano test with Newey-West (HAC) variance and the Harvey-Leybourne-Newbold
    small-sample correction, because forecasts made a minute apart have correlated errors.
    "Your model vs the strongest baseline" p-values are Holm-Bonferroni corrected across all values x horizons.
  - Frozen test window: when it starts, the exact code of every model is fingerprinted (SHA-256).
    If my_model.py changes during the window, the window is marked invalid.
  - Pre-declared exclusion rules (see EXCLUSION_RULES), sensor noise floor, and full export of every prediction.

Your model: put it in my_model.py (see the template there). It is benchmarked automatically.
"""
import bisect
import hashlib
import importlib.util
import math
import sqlite3
import threading
import time
import traceback
from pathlib import Path

HERE = Path(__file__).resolve().parent
KEYS = ["ph", "t_top", "h_top", "t_low", "h_low"]          # what every model predicts
LABELS = {"ph": "pH", "t_top": "Temp tower top (°C)", "h_top": "Humidity tower top (%)",
          "t_low": "Temp room (°C)", "h_low": "Humidity room (%)"}
LIMITS = {"ph": (0, 14), "t_top": (-10, 60), "h_top": (0, 100), "t_low": (-10, 60), "h_low": (0, 100)}
# manufacturer accuracy / resolution (DHT11 datasheet). pH accuracy depends on calibration.
SPEC = {"ph": {"accuracy": None, "resolution": 0.01},
        "t_top": {"accuracy": 2.0, "resolution": 1.0}, "t_low": {"accuracy": 2.0, "resolution": 1.0},
        "h_top": {"accuracy": 5.0, "resolution": 1.0}, "h_low": {"accuracy": 5.0, "resolution": 1.0}}
PERSISTENCE = "Persistence (baseline)"
DAY = 86400
STEP = 600                     # baselines that need an even time grid use 10-minute averages (the cart's logger rate)
MIN_SCORED = 5                 # fewer scored predictions than this = no score shown
EXCLUSION_RULES = [
    "A round of predictions is skipped if the newest reading is more than 60 s old (cart offline).",
    "The actual value for a target time is the average of all readings within ±60 s of it.",
    "Readings that are missing or physically impossible (pH outside 0-14, temperature outside -10-60 °C, "
    "humidity outside 0-100 %) are never used as actual values.",
    "A prediction with no usable reading within ±60 s of its target time is counted as 'missing' and not scored.",
    "A model's MAE only includes targets it actually predicted; its Rel. MAE and significance test only use "
    "targets that persistence also predicted (paired).",
    "pH results are flagged as uncalibrated until ph_calibrated is true in config.json.",
    "Readings the cart saved on its own are 10-minute averages; their predictions are made by walk-forward replay "
    "after download, using only readings from before each moment. Saved readings whose time can't be pinned down "
    "(from before an earlier power cut) are dropped, never guessed.",
]


def _clamp(key, v):
    lo, hi = LIMITS[key]
    return max(lo, min(hi, v))


def _sha256(path):
    try:
        return hashlib.sha256(Path(path).read_bytes()).hexdigest()
    except OSError:
        return None


BASELINE_HASH = _sha256(__file__)


# ------------------------------------------------------------------ helpers
def _series(history, key):
    return [(r["ts"], r[key]) for r in history if r.get(key) is not None]


def _grid(history, key, step=STEP):
    """5-minute averages: {bucket number: mean value}"""
    sums = {}
    for t, v in _series(history, key):
        b = int(t // step)
        s = sums.setdefault(b, [0.0, 0])
        s[0] += v
        s[1] += 1
    return {b: s[0] / s[1] for b, s in sums.items()}


def _solve(a, b):
    """Gaussian elimination with partial pivoting (a is n x n, b is length n)"""
    n = len(b)
    m = [row[:] + [b[i]] for i, row in enumerate(a)]
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(m[r][c]))
        if abs(m[p][c]) < 1e-12:
            return None
        m[c], m[p] = m[p], m[c]
        for r in range(n):
            if r != c:
                f = m[r][c] / m[c][c]
                for k in range(c, n + 1):
                    m[r][k] -= f * m[c][k]
    return [m[i][n] / m[i][i] for i in range(n)]


# ------------------------------------------------------------------ baseline models
def _latest_mean(history, key, window_s=120):
    """average of the last 2 minutes, the same averaging used for the actual values (±60 s)"""
    now = history[-1]["ts"]
    vals = []
    for r in reversed(history):
        if r["ts"] < now - window_s:
            break
        if r.get(key) is not None:
            vals.append(r[key])
    return sum(vals) / len(vals) if vals else None


class Persistence:
    """the future equals the current value (average of the last 2 minutes)"""
    name = PERSISTENCE

    def predict(self, history, horizon_s):
        out = {k: _latest_mean(history, k) for k in KEYS}
        return {k: v for k, v in out.items() if v is not None}


class SeasonalNaive:
    """the future equals the reading at the same time of day, one day earlier"""
    name = "Seasonal naive (same time yesterday)"

    def predict(self, history, horizon_s):
        now = history[-1]["ts"]
        target = now + horizon_s - DAY * max(1, math.ceil(horizon_s / DAY))
        ts = [r["ts"] for r in history]
        lo, hi = bisect.bisect_left(ts, target - 150), bisect.bisect_right(ts, target + 150)
        out = {}
        for k in KEYS:
            vals = [history[i][k] for i in range(lo, hi) if history[i].get(k) is not None]
            if vals:
                out[k] = sum(vals) / len(vals)
        return out


class LinearTrend:
    """straight line through the last 2 hours, extended"""
    name = "Linear trend"

    def predict(self, history, horizon_s):
        now = history[-1]["ts"]
        recent = [r for r in history if r["ts"] >= now - 2 * 3600]
        out = {}
        for k in KEYS:
            pts = _series(recent, k)
            if len(pts) < 10 or pts[-1][0] - pts[0][0] < 20 * 60:
                continue                      # not enough data for a trend yet
            mx = sum(t for t, _ in pts) / len(pts)
            my = sum(v for _, v in pts) / len(pts)
            den = sum((t - mx) ** 2 for t, _ in pts)
            slope = sum((t - mx) * (v - my) for t, v in pts) / den if den else 0.0
            out[k] = _clamp(k, my + slope * (now + horizon_s - mx))
        return out


class HoltDamped:
    """Holt's exponential smoothing with a damped trend; smoothing constants picked by one-step error"""
    name = "Exp. smoothing (Holt, damped)"
    PHI = 0.98
    GRID = [(a, b) for a in (0.05, 0.1, 0.2, 0.4, 0.7) for b in (0.0, 0.02, 0.1)]

    def predict(self, history, horizon_s):
        out = {}
        steps = max(1, round(horizon_s / STEP))
        for k in KEYS:
            g = _grid(history, k)
            ys = [g[b] for b in sorted(g)]
            if len(ys) < 12:                  # at least 2 hours of 10-minute averages
                continue
            best = None
            for a, b in self.GRID:
                level, trend, sse = ys[0], ys[1] - ys[0], 0.0
                for y in ys[1:]:
                    f = level + self.PHI * trend
                    sse += (y - f) ** 2
                    new_level = a * y + (1 - a) * f
                    trend = b * (new_level - level) + (1 - b) * self.PHI * trend
                    level = new_level
                if best is None or sse < best[0]:
                    best = (sse, level, trend)
            _, level, trend = best
            damp = sum(self.PHI ** i for i in range(1, steps + 1))
            out[k] = _clamp(k, level + damp * trend)
        return out


class RidgeAR:
    """direct autoregressive ridge regression: learns how the value changes over the horizon from
    recent changes and time of day, trained only on the history it is given"""
    name = "Ridge regression (autoregressive)"
    LAMBDA = 1.0
    MIN_SAMPLES = 60

    @staticmethod
    def _features(g, i, target_t):
        y = g[i]
        hour = 2 * math.pi * ((target_t % DAY) / DAY)
        return [1.0, y, y - g[i - 1], y - g[i - 3], y - g[i - 6], math.sin(hour), math.cos(hour)]   # 10, 30, 60 min ago

    def predict(self, history, horizon_s):
        out = {}
        m = max(1, round(horizon_s / STEP))
        for k in KEYS:
            g = _grid(history, k)
            if not g:
                continue
            last = max(g)
            need = (1, 3, 6)
            xs, ys = [], []
            for i in g:
                if i + m in g and all(i - d in g for d in need):
                    xs.append(self._features(g, i, (i + m) * STEP))
                    ys.append(g[i + m] - g[i])
            if len(xs) < self.MIN_SAMPLES or not all(last - d in g for d in need):
                continue
            # standardize the non-constant features, then ridge: (X'X + λI) w = X'y
            n_f = len(xs[0])
            mu = [sum(x[j] for x in xs) / len(xs) for j in range(n_f)]
            sd = [math.sqrt(sum((x[j] - mu[j]) ** 2 for x in xs) / len(xs)) or 1.0 for j in range(n_f)]
            mu[0], sd[0] = 0.0, 1.0
            zs = [[(x[j] - mu[j]) / sd[j] for j in range(n_f)] for x in xs]
            a = [[sum(z[r] * z[c] for z in zs) + (self.LAMBDA if r == c and r else 0.0) for c in range(n_f)]
                 for r in range(n_f)]
            b = [sum(z[r] * y for z, y in zip(zs, ys)) for r in range(n_f)]
            w = _solve(a, b)
            if w is None:
                continue
            x_now = self._features(g, last, (last + m) * STEP)
            z_now = [(x_now[j] - mu[j]) / sd[j] for j in range(n_f)]
            base = _latest_mean(history, k)
            base = g[last] if base is None else base
            out[k] = _clamp(k, base + sum(wj * zj for wj, zj in zip(w, z_now)))
        return out


class UserModel:
    """wraps my_model.py so a broken or missing model never crashes the app"""
    kind = "yours"

    def __init__(self, path):
        self.path, self.fn, self.name, self.load_error = path, None, "Your model (my_model.py)", None
        self.code_hash = _sha256(path)
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


# ------------------------------------------------------------------ statistics
def _betacf(a, b, x):
    """continued fraction for the incomplete beta function (Numerical Recipes)"""
    qab, qap, qam = a + b, a + 1, a - 1
    c, d = 1.0, 1 - qab * x / qap
    d = 1 / (d if abs(d) > 1e-30 else 1e-30)
    h = d
    for m in range(1, 300):
        m2 = 2 * m
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1 + aa * d
        d = 1 / (d if abs(d) > 1e-30 else 1e-30)
        c = 1 + aa / c if abs(1 + aa / c) > 1e-30 else 1e-30
        h *= d * c
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1 + aa * d
        d = 1 / (d if abs(d) > 1e-30 else 1e-30)
        c = 1 + aa / c if abs(1 + aa / c) > 1e-30 else 1e-30
        de = d * c
        h *= de
        if abs(de - 1) < 1e-12:
            break
    return h


def _betai(a, b, x):
    if x <= 0:
        return 0.0
    if x >= 1:
        return 1.0
    lbt = math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b) + a * math.log(x) + b * math.log(1 - x)
    if x < (a + 1) / (a + b + 2):
        return math.exp(lbt) * _betacf(a, b, x) / a
    return 1 - math.exp(lbt) * _betacf(b, a, 1 - x) / b


def t_two_sided_p(t, df):
    """two-sided p-value of Student's t"""
    return _betai(df / 2, 0.5, df / (df + t * t))


def diebold_mariano(d, h_steps):
    """d = loss differences (model A error - model B error) on an even time grid.
    Returns (statistic, p, n) or None. Negative statistic = A has the smaller error."""
    n = len(d)
    if n < max(20, 10 * h_steps):      # at least ~10 non-overlapping horizon lengths of data
        return None
    mean = sum(d) / n
    dev = [x - mean for x in d]
    gamma = lambda k: sum(dev[i] * dev[i - k] for i in range(k, n)) / n
    lags = max(0, h_steps - 1)
    var = gamma(0) + 2 * sum(gamma(k) for k in range(1, lags + 1))       # Diebold-Mariano (rectangular)
    if var <= 0:                                                             # rare: fall back to Newey-West
        var = gamma(0) + 2 * sum((1 - k / (lags + 1)) * gamma(k) for k in range(1, lags + 1))
    if var <= 0:
        return None
    dm = mean / math.sqrt(var / n)
    hln = (n + 1 - 2 * h_steps + h_steps * (h_steps - 1) / n) / n                            # Harvey et al. 1997
    if hln <= 0:
        return None
    dm *= math.sqrt(hln)
    return dm, t_two_sided_p(dm, n - 1), n


def holm(pvals):
    """Holm-Bonferroni adjusted p-values (same order as given)"""
    order = sorted(range(len(pvals)), key=lambda i: pvals[i])
    adj, running = [0.0] * len(pvals), 0.0
    for rank, i in enumerate(order):
        running = max(running, min(1.0, (len(pvals) - rank) * pvals[i]))
        adj[i] = running
    return adj


def noise_floor(history):
    """how small a forecast error can get before it's indistinguishable from sensor noise, per value.
    Scoring compares with a 2-minute average (±60 s), so the relevant noise is that of the average."""
    gaps = sorted(b["ts"] - a["ts"] for a, b in zip(history[-200:], history[-199:]))
    per_window = 120 / max(1.0, gaps[len(gaps) // 2]) if gaps else 1     # readings in one 2-minute average
    out = {}
    for k in KEYS:
        pts = _series(history, k)
        diffs = sorted(abs(b[1] - a[1]) for a, b in zip(pts, pts[1:]) if b[0] - a[0] <= 15)
        one = None
        if diffs:
            kept = diffs[:max(1, int(len(diffs) * 0.99))]       # drop the top 1% (real jumps, not noise)
            one = math.sqrt(sum(d * d for d in kept) / len(kept) / 2)   # noise of one reading
        out[k] = {"noise": round(one, 3) if one is not None else None,
                  "noise_avg": round(one / math.sqrt(max(1.0, per_window)), 3) if one is not None else None,
                  "accuracy": SPEC[k]["accuracy"], "resolution": SPEC[k]["resolution"]}
    return out


# ------------------------------------------------------------------ benchmark
class Benchmark:
    def __init__(self, store, horizons_min=(30, 360, 1440), every_s=60, history_h=50, ph_calibrated=False):
        self.store = store
        self.horizons = sorted({int(round(h * 60)) for h in horizons_min})
        self.every_s = every_s
        self.history_s = int(history_h * 3600)
        self.ph_calibrated = ph_calibrated
        self.user = UserModel(HERE / "my_model.py")
        self.models = [Persistence(), SeasonalNaive(), LinearTrend(), HoltDamped(), RidgeAR(), self.user]
        for m in self.models:
            if not hasattr(m, "code_hash"):
                m.code_hash = BASELINE_HASH
        self.lock = threading.Lock()
        self.round_lock = threading.Lock()   # live rounds and replays of downloaded data never overlap
        self._cache = {}
        self._wake = threading.Event()
        # analysis reads through its own connection, so long statistics never block new sensor readings
        self.ro = sqlite3.connect(str(store.path), check_same_thread=False)
        self.ro_lock = threading.Lock()
        db = store.db
        with store.lock:
            db.execute("""CREATE TABLE IF NOT EXISTS predictions (
                model TEXT, made_ts REAL, target_ts REAL, key TEXT, predicted REAL,
                actual REAL, scored INTEGER DEFAULT 0)""")
            cols = {r[1] for r in db.execute("PRAGMA table_info(predictions)")}
            if "horizon_s" not in cols:      # data from the older single-horizon version
                db.execute("ALTER TABLE predictions ADD COLUMN horizon_s INTEGER")
                db.execute("UPDATE predictions SET horizon_s = CAST(ROUND(target_ts - made_ts) AS INTEGER)")
            if "code" not in cols:
                db.execute("ALTER TABLE predictions ADD COLUMN code TEXT")
            db.execute("CREATE INDEX IF NOT EXISTS pred_target ON predictions(scored, target_ts)")
            db.execute("CREATE INDEX IF NOT EXISTS pred_pair ON predictions(key, horizon_s, model, made_ts)")
            db.execute("""CREATE TABLE IF NOT EXISTS test_window (
                started_ts REAL, ended_ts REAL, model_name TEXT, model_hash TEXT, baselines_hash TEXT,
                app_hash TEXT, horizons TEXT, history_h REAL, ph_calibrated INTEGER, invalid_reason TEXT)""")
            db.commit()
        self.reset()
        w = self.test_window()
        if w and w["ended_ts"] is None and not w["invalid_reason"]:
            when = f"(detected when the app restarted at {time.strftime('%Y-%m-%d %H:%M')})"
            if w["model_hash"] != self.user.code_hash:
                self._invalidate(f"my_model.py was changed while the test window was running {when}")
            elif w["baselines_hash"] != BASELINE_HASH:
                self._invalidate(f"the baseline models (models.py) changed while the test window was running {when}")

    def reset(self):
        """start the scoreboard over (the store's reset already deleted the saved predictions)"""
        with self.lock:
            self.stats = {m.name: {"runs": 0, "errors": 0, "empty": 0, "ms_total": 0.0, "calls": 0,
                                   "last_error": None, "last_prediction": {}} for m in self.models}
            self.rounds, self.skipped = 0, 0
            self.started = time.time()
            self._cache = {}
        self._wake.set()

    # ---------- test window
    def test_window(self):
        with self.store.lock:
            row = self.store.db.execute(
                "SELECT rowid, started_ts, ended_ts, model_name, model_hash, baselines_hash, app_hash, horizons, "
                "history_h, ph_calibrated, invalid_reason FROM test_window ORDER BY started_ts DESC LIMIT 1"
            ).fetchone()
        if not row:
            return None
        keys = ["id", "started_ts", "ended_ts", "model_name", "model_hash", "baselines_hash", "app_hash",
                "horizons", "history_h", "ph_calibrated", "invalid_reason"]
        return dict(zip(keys, row))

    def _invalidate(self, reason):
        w = self.test_window()
        with self.store.lock:
            self.store.db.execute("UPDATE test_window SET invalid_reason = ? WHERE rowid = ?", (reason, w["id"]))
            self.store.db.commit()
        self._wake.set()

    def start_test(self, app_hash):
        w = self.test_window()
        if w and w["ended_ts"] is None:
            return "A test window is already running."
        if self.user.load_error:
            return f"Your model isn't loaded: {self.user.load_error}"
        with self.store.lock:
            self.store.db.execute(
                "INSERT INTO test_window VALUES (?,?,?,?,?,?,?,?,?,?)",
                (time.time(), None, self.user.name, self.user.code_hash, BASELINE_HASH, app_hash,
                 ",".join(str(h) for h in self.horizons), self.history_s / 3600, int(self.ph_calibrated), None))
            self.store.db.commit()
        self._wake.set()
        return None

    def end_test(self):
        w = self.test_window()
        if not w or w["ended_ts"] is not None:
            return "No test window is running."
        with self.store.lock:
            self.store.db.execute("UPDATE test_window SET ended_ts = ? WHERE rowid = ?", (time.time(), w["id"]))
            self.store.db.commit()
        self._wake.set()
        return None

    # ---------- one round: every model predicts every horizon, then due predictions get scored
    def replay(self, times):
        """Walk-forward replay for readings the cart saved while no laptop was connected: at each saved moment,
        every model predicts from only the data before it, exactly as if it had been running live."""
        done = 0
        for t in sorted(times):
            self.run_once(now=t)
            done += 1
        self._wake.set()
        return done

    def run_once(self, now=None):
        with self.round_lock:
            self._run_once(now)

    def _run_once(self, now=None):
        now = now or time.time()
        history = [r for r in self.store.since(now - self.history_s) if r["ts"] <= now]   # never the future
        if history and now - history[-1]["ts"] <= 60:     # only predict from fresh data
            with self.lock:
                self.rounds += 1
            rows = []
            for m in self.models:
                st = self.stats[m.name]
                failed, preds = None, {}
                ms = 0.0
                for h in self.horizons:
                    t0 = time.perf_counter()
                    try:
                        preds[h] = m.predict(history, h)
                    except Exception as e:
                        failed = f"{type(e).__name__}: {e}"
                        print(f"[benchmark] {m.name} crashed ({h // 60} min ahead):\n{traceback.format_exc()}")
                        continue
                    ms += (time.perf_counter() - t0) * 1000
                with self.lock:
                    st["runs"] += 1
                    st["calls"] += len(preds)
                    st["ms_total"] += ms
                    if failed:
                        st["errors"] += 1
                        st["last_error"] = failed
                    if not any(preds.values()):
                        st["empty"] += 1
                    first = preds.get(self.horizons[0]) or {}
                    st["last_prediction"] = {k: round(v, 2) for k, v in first.items()}
                for h, pred in preds.items():
                    rows += [(m.name, now, now + h, h, k, float(v), m.code_hash) for k, v in pred.items()]
            with self.store.lock:
                self.store.db.executemany(
                    "INSERT INTO predictions (model, made_ts, target_ts, horizon_s, key, predicted, code) "
                    "VALUES (?,?,?,?,?,?,?)", rows)
                self.store.db.commit()
        else:
            with self.lock:
                self.skipped += 1
        self.score(now)

    def score(self, now):
        """compare predictions whose time has come with what the sensors actually read"""
        with self.store.lock:
            due = self.store.db.execute(
                "SELECT rowid, target_ts, key FROM predictions WHERE scored = 0 AND target_ts <= ?",
                (now - 60,)).fetchall()
            for rowid, target, key in due:
                if key not in KEYS:                      # only ever our own column names in SQL
                    self.store.db.execute("UPDATE predictions SET scored = 1 WHERE rowid = ?", (rowid,))
                    continue
                lo, hi = LIMITS[key]
                row = self.store.db.execute(
                    f"SELECT AVG({key}) FROM readings WHERE ts BETWEEN ? AND ? AND {key} BETWEEN ? AND ?",
                    (target - 60, target + 60, lo, hi)).fetchone()
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

    # ---------- analysis
    def _q(self, sql, params=()):
        with self.ro_lock:
            return self.ro.execute(sql, params).fetchall()

    def _phase_filter(self, phase, w):
        if phase == "test":
            if not w:
                return None
            end = w["ended_ts"] if w["ended_ts"] is not None else 1e18
            return " AND m.made_ts >= %r AND m.made_ts <= %r" % (float(w["started_ts"]), float(end))
        return ""

    def _dm(self, a, b, key, h, extra):
        """Diebold-Mariano on absolute errors of models a and b, paired by prediction time"""
        bucket = max(STEP, h // 12)                  # even time grid; ~12 overlapping steps per horizon
        h_steps = math.ceil(h / bucket) + 1          # conservative overlap (+1 for bucket averaging)
        rows = self._q(
            f"""SELECT CAST(m.made_ts / ? AS INTEGER) AS b,
                       AVG(ABS(m.predicted - m.actual) - ABS(p.predicted - p.actual))
                FROM predictions m JOIN predictions p
                  ON p.key = m.key AND p.horizon_s = m.horizon_s AND p.made_ts = m.made_ts AND p.model = ?
                WHERE m.model = ? AND m.key = ? AND m.horizon_s = ? AND m.scored = 1
                  AND m.actual IS NOT NULL AND p.actual IS NOT NULL {extra}
                GROUP BY b ORDER BY b""", (bucket, b, a, key, h))
        res = diebold_mariano([r[1] for r in rows], h_steps)
        if not res:
            return {"p": None, "stat": None, "n_eff": round(len(rows) / h_steps, 1)}
        stat, p, n = res
        return {"p": p, "stat": round(stat, 3), "n_eff": round(n / h_steps, 1)}

    def analyze(self, phase="all"):
        w = self.test_window()
        extra = self._phase_filter(phase, w)
        if extra is None:
            return None
        names = [m.name for m in self.models]
        own = self._q(
            f"""SELECT m.horizon_s, m.key, m.model, COUNT(*), AVG(ABS(m.predicted - m.actual)),
                       AVG((m.predicted - m.actual) * (m.predicted - m.actual))
                FROM predictions m WHERE m.scored = 1 AND m.actual IS NOT NULL {extra}
                GROUP BY m.horizon_s, m.key, m.model""")
        paired = self._q(
            f"""SELECT m.horizon_s, m.key, m.model, COUNT(*), AVG(ABS(m.predicted - m.actual)),
                       AVG(ABS(p.predicted - p.actual))
                FROM predictions m JOIN predictions p
                  ON p.key = m.key AND p.horizon_s = m.horizon_s AND p.made_ts = m.made_ts AND p.model = ?
                WHERE m.scored = 1 AND m.actual IS NOT NULL AND p.actual IS NOT NULL {extra}
                GROUP BY m.horizon_s, m.key, m.model""", (PERSISTENCE,))
        counts = self._q(
            f"""SELECT SUM(m.scored = 1 AND m.actual IS NOT NULL), SUM(m.scored = 1 AND m.actual IS NULL),
                       SUM(m.scored = 0) FROM predictions m WHERE 1 = 1 {extra}""")[0]
        bad_code = None
        if phase == "test" and w:
            bad_code = self._q(
                f"SELECT COUNT(*) FROM predictions m WHERE m.model = ? AND m.code IS NOT ? {extra}",
                (w["model_name"], w["model_hash"]))[0][0]
        by = {}
        for h, k, model, n, mae, mse in own:
            by.setdefault(str(h), {}).setdefault(k, {})[model] = {
                "n": n, "mae": round(mae, 4), "rmse": round(math.sqrt(mse), 4), "rel": None, "p": None}
        for h, k, model, n, mae_m, mae_p in paired:
            cell = by.get(str(h), {}).get(k, {}).get(model)
            if cell is not None and n >= MIN_SCORED and mae_p:
                cell["rel"] = round(mae_m / mae_p, 4)
                cell["n_paired"] = n
        # significance vs persistence, for every model, value and horizon
        for h in self.horizons:
            for k in KEYS:
                cells = by.get(str(h), {}).get(k, {})
                pn = cells.get(PERSISTENCE, {}).get("n", 0)
                for model, cell in cells.items():
                    cell["coverage"] = round(min(1.0, cell["n"] / pn), 3) if pn else None
                    if model != PERSISTENCE and cell["n"] >= MIN_SCORED:
                        cell.update({k2: v for k2, v in self._dm(model, PERSISTENCE, k, h, extra).items()})
        # the headline result: your model vs the strongest baseline, Holm-corrected across values x horizons
        verdicts, tests = {}, []
        user = self.user.name
        for h in self.horizons:
            for k in KEYS:
                cells = by.get(str(h), {}).get(k, {})
                if cells.get(user, {}).get("n", 0) < MIN_SCORED:
                    verdicts.setdefault(str(h), {})[k] = {"verdict": "not enough data"}
                    continue
                base = [(c["mae"], name) for name, c in cells.items()
                        if name != user and c["n"] >= MIN_SCORED]
                if not base:
                    verdicts.setdefault(str(h), {})[k] = {"verdict": "not enough data"}
                    continue
                strongest = min(base)[1]
                pr = self._q(
                    f"""SELECT COUNT(*), AVG(ABS(m.predicted - m.actual)), AVG(ABS(p.predicted - p.actual))
                        FROM predictions m JOIN predictions p ON p.key = m.key AND p.horizon_s = m.horizon_s
                          AND p.made_ts = m.made_ts AND p.model = ?
                        WHERE m.model = ? AND m.key = ? AND m.horizon_s = ? AND m.scored = 1
                          AND m.actual IS NOT NULL AND p.actual IS NOT NULL {extra}""",
                    (strongest, user, k, h))[0]
                dm = self._dm(user, strongest, k, h, extra)
                v = {"baseline": strongest, "n_paired": pr[0],
                     "rel": round(pr[1] / pr[2], 4) if pr[0] and pr[2] else None,
                     "p": dm["p"], "stat": dm["stat"], "n_eff": dm["n_eff"]}
                verdicts.setdefault(str(h), {})[k] = v
                if dm["p"] is not None:
                    tests.append(v)
        for v, p_adj in zip(tests, holm([t["p"] for t in tests])):
            v["p_holm"] = p_adj
        for hv in verdicts.values():
            for v in hv.values():
                if "verdict" in v:
                    continue
                if v.get("p_holm") is None:
                    v["verdict"] = "not enough independent data yet"
                elif v["p_holm"] < 0.05:
                    v["verdict"] = "better (significant)" if v["stat"] < 0 else "worse (significant)"
                else:
                    v["verdict"] = "no significant difference"
        for cells in by.values():
            for kc in cells.values():
                for cell in kc.values():
                    for f in ("p",):
                        if cell.get(f) is not None:
                            cell[f] = float("%.3g" % cell[f])
        for hv in verdicts.values():
            for v in hv.values():
                for f in ("p", "p_holm"):
                    if v.get(f) is not None:
                        v[f] = float("%.3g" % v[f])
        invalid = None
        if phase == "test" and w:
            invalid = w["invalid_reason"] or (
                f"{bad_code} predictions in this window came from a different version of my_model.py"
                if bad_code else None)
        return {"by_h": by, "yours_vs_best": verdicts, "models": names,
                "scored": counts[0] or 0, "missing": counts[1] or 0, "pending": counts[2] or 0,
                "invalid": invalid}

    def analysis_loop(self, every_s=120):
        """recompute the statistics in the background, so the dashboard never waits for them"""
        while True:
            try:
                for phase in ("all", "test"):
                    t0 = time.time()
                    res = self.analyze(phase)
                    if res is not None:
                        res["computed_ts"], res["compute_s"] = time.time(), round(time.time() - t0, 2)
                    self._cache[phase] = res
            except Exception:
                print(f"[benchmark] analysis failed:\n{traceback.format_exc()}")
            self._wake.wait(every_s)
            self._wake.clear()

    # ---------- what the dashboard shows
    def summary(self, phase="all"):
        models = []
        with self.lock:
            for m in self.models:
                st = self.stats[m.name]
                models.append({
                    "name": m.name, "kind": getattr(m, "kind", "baseline"),
                    "status": (getattr(m, "load_error", None) or
                               ("no predictions yet (predict() returns nothing)" if isinstance(m, UserModel)
                                and st["runs"] and st["empty"] == st["runs"] else "running")),
                    "runs": st["runs"], "errors": st["errors"], "last_error": st["last_error"],
                    "avg_ms": round(st["ms_total"] / st["calls"], 3) if st["calls"] else None,
                    "last_prediction": st["last_prediction"], "code": (m.code_hash or "")[:12],
                })
            rounds, skipped = self.rounds, self.skipped
        w = self.test_window()
        return {"horizons_s": self.horizons, "keys": KEYS, "labels": LABELS, "models": models,
                "persistence": PERSISTENCE, "user": self.user.name, "min_scored": MIN_SCORED,
                "rounds": rounds, "skipped_rounds": skipped, "every_s": self.every_s,
                "history_h": self.history_s / 3600, "ph_calibrated": self.ph_calibrated,
                "noise": noise_floor(self.store.since(time.time() - DAY)),
                "test_window": w, "phase": phase, "results": self._cache.get(phase, "computing"),
                "exclusion_rules": EXCLUSION_RULES}
