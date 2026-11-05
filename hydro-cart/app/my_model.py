"""
YOUR MODEL GOES HERE (SLGN + DPE).

The app calls predict() about once a minute and benchmarks it against the built-in models
(Persistence and Linear trend) on the dashboard's "AI benchmark" table.

predict(history, horizon_s) gets:
  history    a list of readings, oldest first, covering the last 6 hours. Each reading is a dict:
             {"ts": 1730770000.0,          # time (seconds since 1970)
              "ph": 6.02, "ph_volts": 2.68,
              "t_top": 24.0, "h_top": 61.0, # top DHT11: °C and %
              "t_low": 22.0, "h_low": 58.0, # low DHT11
              "strip_water": 410, "strip_nutr": 380}   # side-tank strips (0 = dry)
             Any value can be None if that sensor missed a reading.
  horizon_s  how far ahead to predict, in seconds (default 30 minutes = 1800)

Return a dict with your predictions for that future moment, using any of these keys:
  "ph", "t_top", "h_top", "t_low", "h_low"
Return {} (empty) if you can't predict yet. Errors are caught and shown on the dashboard,
so a bug here never crashes the app.

After editing this file, restart hydro_app.py to load the new version.
"""

NAME = "SLGN+DPE"


def predict(history, horizon_s):
    # Not implemented yet: replace this with your model.
    # Example of the shape to return:
    #   return {"ph": 5.95, "t_top": 24.3}
    return {}
