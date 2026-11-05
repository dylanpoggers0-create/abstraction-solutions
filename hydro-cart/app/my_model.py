"""
YOUR MODEL GOES HERE (SLGN + DPE).

The app calls predict() about once a minute, once for each horizon, and benchmarks it against five
baseline models on the dashboard's "AI benchmark" table (see models.py for how scoring works).

predict(history, horizon_s) gets:
  history    a list of readings, oldest first, covering the last 50 hours. Each reading is a dict:
             {"ts": 1730770000.0,          # time (seconds since 1970)
              "ph": 6.02, "ph_volts": 2.68,
              "t_top": 24.0, "h_top": 61.0, # DHT11 at the tower top, drip zone (D26)
              "t_low": 22.0, "h_low": 58.0, # ambient DHT11 up top (D27)
              "strip_water": 410,               # backup tank strip (A0, 0 = dry)
              "strip_nutr": 380}                # plant tank strip (A1)
             Any value can be None if that sensor missed a reading.
  horizon_s  how far ahead to predict, in seconds: 1800 (30 min), 21600 (6 h) and 86400 (24 h)

Return a dict with your predictions for that future moment, using any of these keys:
  "ph", "t_top", "h_top", "t_low", "h_low"
Return {} (empty) if you can't predict yet. Errors are caught and shown on the dashboard,
so a bug here never crashes the app.

After editing this file, restart hydro_app.py to load the new version.
Once you start a test window, don't edit this file until it ends: a change makes the window invalid.
"""

NAME = "SLGN+DPE"


def predict(history, horizon_s):
    # Not implemented yet: replace this with your model.
    # Example of the shape to return:
    #   return {"ph": 5.95, "t_top": 24.3}
    return {}
