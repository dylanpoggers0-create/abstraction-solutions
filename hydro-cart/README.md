# Hydro Cart: sensors → Python AI → live dashboard

```
Arduino Mega (sensors)  --USB-->  hydro_app.py on your laptop  -->  dashboard
  firmware/hydro_sensors            saves every reading               abstraction-solutions.com/admin.html → Hydro Cart tab
                                    runs + benchmarks the AI models   (or http://localhost:8000)
                                    makes suggestions
```

Your cart data never leaves your computer. The admin page reads it straight from the app running on the same laptop.

## 1. Arduino (once)
1. Arduino IDE → Tools → Manage Libraries → install **"DHT sensor library" by Adafruit** (click "Install all").
2. Open `firmware/hydro_sensors/hydro_sensors.ino`, choose board **Arduino Mega or Mega 2560** and its port, and upload.
3. Serial Monitor at 115200 should print one line like this every 5 s, then **close the Serial Monitor**:
   `{"t_top":23.0,"h_top":55,"t_low":22.0,"h_low":58,"strip_water":0,"strip_nutr":0,"ph_volts":2.512}`

## 2. Python app
**Windows: just double-click `start.bat`** (in this folder). It installs pyserial, starts the app and opens the dashboard.

Or by hand (Python 3.8+), from this `app` folder:
```
pip install pyserial
python hydro_app.py
```
It finds the Arduino automatically. If it doesn't, give the port yourself: `python hydro_app.py --port COM5` (Windows)
or `--port /dev/cu.usbmodem1101` (Mac). Want to try it without the cart? `python hydro_app.py --demo`.

## 3. Dashboard
- **Website:** log in at abstraction-solutions.com/admin.html → **Hydro Cart** tab. Use **Chrome or Edge**.
  The first time, Chrome asks to let the site access apps/devices on this computer: click **Allow**.
- **Or directly:** open http://localhost:8000. This always works while the app runs.

## What it does
- **Live readings:** pH, the plant tank and the backup tank, and temperature and humidity at the tower top (D26) and room air up top (D27).
- **Suggestions:** pH low/high, pH drifting out of range soon, plant tank low ("More water!"), backup tank empty, too hot or humid,
  humidity near the electronics, sensors not answering, cart offline. Each start and clear is saved in the alert history.
- **AI benchmark:** every model predicts each reading 30 minutes ahead (change with `--horizon-min`), then gets scored
  against what actually happened: average error, speed, runs and crashes. The built-in baselines are *Persistence*
  (nothing changes) and *Linear trend*.
- **Your model:** put SLGN+DPE in `app/my_model.py` (instructions inside) and restart. It appears in the benchmark
  automatically, and a crash in your model never stops the app.
- **Data for training:** "Download all data (CSV)" on the dashboard.

## Settings: `app/config.json` (made on first run)
| Setting | Meaning |
|---|---|
| `ph7_volts`, `volts_per_ph`, `ph_calibrated` | pH calibration. Put the probe in pH 7 liquid → `ph7_volts` = the `ph_volts` reading. Then pH 4 → `volts_per_ph` = (pH 4 reading − pH 7 reading) ÷ 3. Set `ph_calibrated` to `true`. |
| `ph_min`, `ph_max` | healthy pH range (default 5.5–6.5) |
| `temp_min_c`, `temp_max_c`, `humidity_min`, `humidity_max` | healthy air ranges |
| `strip_empty_below` | water strip reading below this = tank empty (set halfway between your dry and just-touching-water numbers) |

Restart the app after changing settings.

## Files
- `firmware/hydro_sensors/hydro_sensors.ino`: Arduino code (reads only, controls nothing)
- `app/hydro_app.py`: the app (USB reader, database, suggestions, web server)
- `app/models.py`: built-in models and the benchmark
- `app/my_model.py`: **your model goes here**
- `app/static/`: dashboard page. `hydro-admin.js` and `hydro-admin.css` are copies of the website's files of the same name.
