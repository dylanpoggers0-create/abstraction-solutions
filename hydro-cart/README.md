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
   `{"t_top":23.0,"h_top":55,"t_low":22.0,"h_low":58,"strip_water":0,"strip_nutr":0,"ph_volts":2.512,"boot":1,"up":35,"saved":0}`

## No laptop needed: the cart records on its own
Power the Mega from **any USB phone charger** (the same USB cable, plugged into a wall charger instead of the laptop).
It saves a 10-minute average of every sensor in its own memory, which keeps its contents without power: **372
readings, about 2.6 days**. After that, the oldest readings are replaced by new ones.

To collect the data, move the USB cable from the charger to the laptop and run `start.bat`. The app downloads
everything the cart saved, gives each reading its real time, scores the AI models on it (each model only ever
sees readings from before the moment it predicts), and clears the cart's memory. Then move the cable back
to the charger. Do this **at least every 2 days** so nothing gets overwritten.

Good to know:
- Use a **wall charger, not a power bank**: many power banks switch off when so little power is drawn.
  A 9V battery would only last a few hours.
- While the laptop is plugged in and the app is running, readings come in live every 5 seconds, as before.
- The Mega has no clock, so readings are dated by counting time since it was powered on. If the cart loses
  power while on its own (charger unplugged, power cut), readings from before that can't be dated and are
  skipped, never guessed. One case can't be detected: if the charger loses power and you then plug in the
  laptop without powering the charger back up first, the run before that gets dated as if the cable had
  just been swapped.
- The memory is rated for about 100,000 writes per spot. The busiest spot is written about 50 times a day,
  so the memory lasts roughly 5 years of 24/7 use.

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

## Raspberry Pi: always on, see it from anywhere
The Pi runs the app 24/7 with the Mega plugged into it, and `app/cloud_sync.py` sends the dashboard's current data
to the website's server every 15 seconds. Then admin.html → **Hydro Cart** works from any phone or laptop
("Live from the Pi at home"). All readings stay on the Pi; the server only keeps the newest copy, in memory.
On the Pi itself the tab still reads the app directly. Downloads, reset and the test-window buttons only appear on the Pi.

1. Render → quote engine → Environment: add `HYDRO_DEVICE_KEY` (a long random string:
   `python3 -c "import secrets;print(secrets.token_urlsafe(32))"`).
2. On the Pi, in `hydro-cart/app`, make `cloud.json` (not uploaded to GitHub):
   `{"url": "https://abstraction-quote-engine.onrender.com", "key": "<the same key>"}`
3. Two services start everything on boot: `hydro-cart` (runs `hydro_app.py`) and `hydro-cloud` (runs `cloud_sync.py`).
   Logs: `journalctl -u hydro-cart -f` and `journalctl -u hydro-cloud -f`.

If the Pi loses power or internet, the tab says "The cart stopped reporting" with the time of the last reading.

## What it does
- **Live readings:** pH, the plant tank and the backup tank, and temperature and humidity at the tower top (D26) and room air up top (D27).
- **Suggestions:** pH low/high, pH drifting out of range soon, plant tank low ("More water!"), backup tank empty, too hot or humid,
  humidity near the electronics, sensors not answering, cart offline. Each start and clear is saved in the alert history.
- **AI benchmark (built to be rigorous):** every model gets the same 50 hours of history and predicts each value
  30 min, 6 h and 24 h ahead (change with `--horizons 30,360,1440`). Predictions are saved before the real value
  exists, then scored against what actually happened. Five baselines: persistence, same time yesterday, linear trend,
  Holt exponential smoothing, ridge regression. Results show MAE, error relative to persistence on the same moments,
  and Diebold-Mariano significance (Holm-corrected for your model vs the strongest baseline).
- **Test window:** when your model is final, click "Start test window". The code of every model is fingerprinted;
  editing `my_model.py` during the window marks it invalid. Use "Test window only" results for any paper.
  "Download study protocol" gives the full plan + fingerprints (e.g. for OSF pre-registration), and
  "Download every prediction" gives the raw data.
- **Your model:** put SLGN+DPE in `app/my_model.py` (instructions inside) and restart. It appears in the benchmark
  automatically, and a crash in your model never stops the app.
- **Data for training:** "Download all data (CSV)" on the dashboard.
- **Start fresh:** "Reset readings" (click twice) erases all readings, alerts and benchmark scores, e.g. after testing
  with empty tanks. A backup copy is saved first in the `app` folder as `hydro_backup_<date>.db`.

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
- `app/cloud_sync.py`: sends the dashboard data to the website so admin.html works from anywhere (Pi)
- `app/static/`: dashboard page. `hydro-admin.js` and `hydro-admin.css` are copies of the website's files of the same name.
