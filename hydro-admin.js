/* =========================================================
   hydro-admin.js: the "Hydro Cart" tab on admin.html

   Shows live data from the hydroponic cart. The data comes from the Python app
   (hydro-cart/app/hydro_app.py) running on the SAME computer as this browser, with the
   Arduino Mega plugged into it by USB. Nothing about the cart is stored on the website.

   admin.html calls HydroAdmin.start() when the tab opens and HydroAdmin.stop() when it closes.
   ========================================================= */
(function () {
    // On the cart app's own page (http://localhost:8000) the app sets HYDRO_APP_BASE to itself.
    const LOCAL = typeof window.HYDRO_APP_BASE === 'string';
    const DEFAULT_APP = LOCAL ? window.HYDRO_APP_BASE : 'http://127.0.0.1:8000';
    let appBase = DEFAULT_APP;
    if (!LOCAL) { try { appBase = localStorage.getItem('hydroApp') || DEFAULT_APP; } catch (e) {} }

    let cfg = null;          // the app's settings (healthy ranges etc.)
    let hours = 24;          // chart range
    let timer = null;
    let tick = 0;
    const charts = {};
    let built = false;

    // ---------- small helpers (textContent only: nothing from the app runs as code) ----------
    function el(tag, cls, text) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text !== undefined && text !== null) e.textContent = text;
        return e;
    }

    function $(id) { return document.getElementById(id); }

    async function getJSON(path) {
        const r = await fetch(appBase + path, { cache: 'no-store' });
        if (!r.ok) throw new Error('app error ' + r.status);
        return r.json();
    }

    const fmtTime = function (ts) {
        const d = new Date(ts * 1000);
        return hours > 24
            ? d.toLocaleDateString([], { month: 'short', day: 'numeric' })
            : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    };

    const num = function (v, d) { return v === null || v === undefined ? '--' : Number(v).toFixed(d); };

    // ---------- build the tab once ----------
    function build() {
        if (built) return;
        built = true;
        const root = $('hydroPanel');
        root.replaceChildren();

        const bar = el('div', 'hy-bar');
        const status = el('div', 'hy-status');
        status.append(el('span', 'hy-dot', ''), el('span', '', 'Connecting...'));
        status.id = 'hyStatus';
        const conn = el('label', 'hy-conn', 'App address ');
        const input = el('input');
        input.id = 'hyApp';
        input.value = appBase;
        input.setAttribute('spellcheck', 'false');
        input.addEventListener('change', function () {
            appBase = input.value.trim().replace(/\/+$/, '') || DEFAULT_APP;
            input.value = appBase;
            try { localStorage.setItem('hydroApp', appBase); } catch (e) {}
            cfg = null;
            refresh(true);
        });
        conn.append(input);
        bar.append(status);
        if (!LOCAL) bar.append(conn);

        const help = el('div', 'hy-help');
        help.id = 'hyHelp';
        help.hidden = true;
        help.append(
            el('strong', '', 'The cart app isn\'t running on this computer.'),
            el('p', '', 'Plug the Arduino Mega into this computer by USB, then in a terminal run:'),
            el('code', '', 'python hydro_app.py'),
            el('p', '', 'from the hydro-cart/app folder. Use Chrome or Edge. The first time, Chrome asks to let ' +
                        'this site access apps or devices on this computer / local network: click Allow. ' +
                        'If you clicked Block before, click the icon left of the address bar to change it. ' +
                        'You can also open http://localhost:8000 directly.')
        );

        const cards = el('section', 'hy-cards');
        cards.id = 'hyCards';

        const two = el('div', 'hy-two');
        const sugBox = el('section', 'hy-panel');
        sugBox.append(el('h2', 'hy-h', 'What the AI finds'), Object.assign(el('div'), { id: 'hySug' }));
        const evBox = el('section', 'hy-panel');
        const evList = el('ul', 'hy-events');
        evList.id = 'hyEvents';
        evBox.append(el('h2', 'hy-h', 'History of alerts'), evList);
        two.append(sugBox, evBox);

        const chartBox = el('section', 'hy-panel');
        const top = el('div', 'hy-row');
        const range = el('div', 'hy-range');
        [[6, '6 hours'], [24, '24 hours'], [168, '7 days']].forEach(function (p) {
            const b = el('button', 'small-btn' + (p[0] === hours ? ' active' : ''), p[1]);
            b.type = 'button';
            b.addEventListener('click', function () {
                hours = p[0];
                range.querySelectorAll('button').forEach(function (x) { x.classList.toggle('active', x === b); });
                refresh(true);
            });
            range.append(b);
        });
        const exp = el('a', 'small-btn', 'Download all data (CSV)');
        exp.id = 'hyExport';
        exp.href = appBase + '/api/export.csv';
        const reset = el('button', 'small-btn', 'Reset readings');
        reset.type = 'button';
        reset.id = 'hyReset';
        let armed = null;
        reset.addEventListener('click', async function () {
            if (!armed) {   // first click asks, second click within 5 s erases
                reset.textContent = 'Click again to erase all readings';
                reset.classList.add('hy-danger');
                armed = setTimeout(function () {
                    armed = null;
                    reset.textContent = 'Reset readings';
                    reset.classList.remove('hy-danger');
                }, 5000);
                return;
            }
            clearTimeout(armed);
            armed = null;
            reset.disabled = true;
            reset.textContent = 'Resetting…';
            try {
                const r = await fetch(appBase + '/api/reset', { method: 'POST', cache: 'no-store',
                                                                headers: { 'X-Hydro-Reset': 'yes' } });
                if (!r.ok) throw new Error('app error ' + r.status);
                reset.textContent = 'Reset done (old data backed up)';
                await refresh(true);
            } catch (e) {
                reset.textContent = 'Reset failed: restart start.bat with the new files';
            }
            reset.classList.remove('hy-danger');
            setTimeout(function () { reset.textContent = 'Reset readings'; reset.disabled = false; }, 4000);
        });
        const actions = el('div', 'hy-range');
        actions.append(exp, reset);
        top.append(range, actions);
        const grid = el('div', 'hy-charts');
        [['hyPh', 'pH'], ['hyTemp', 'Temperature (°C)'], ['hyHum', 'Humidity (%)'],
         ['hyTank', 'Tanks (water strip reading)']].forEach(function (c) {
            const wrap = el('div');
            const canvasBox = el('div', 'hy-chart');
            const cv = el('canvas');
            cv.id = c[0];
            canvasBox.append(cv);
            wrap.append(el('h2', 'hy-h', c[1]), canvasBox);
            grid.append(wrap);
        });
        chartBox.append(top, grid);

        const benchBox = el('section', 'hy-panel');
        benchBox.append(el('h2', 'hy-h', 'AI benchmark'),
                        Object.assign(el('p', 'hy-note'), { id: 'hyBenchNote' }),
                        Object.assign(el('div', 'hy-table-wrap'), { id: 'hyBench' }),
                        el('h2', 'hy-h hy-h2', 'Cart health (last hour)'),
                        Object.assign(el('div', 'hy-sys'), { id: 'hySys' }));

        root.append(bar, help, cards, two, chartBox, benchBox);

        chart('hyPh', [{ key: 'ph', label: 'pH', color: '#7ee96f' }], ['ph_min', 'ph_max']);
        chart('hyTemp', [{ key: 't_top', label: 'tower top', color: '#ffaa50' },
                         { key: 't_low', label: 'room', color: '#8ab4ff' }]);
        chart('hyHum', [{ key: 'h_top', label: 'tower top', color: '#ffaa50' },
                        { key: 'h_low', label: 'room', color: '#8ab4ff' }]);
        chart('hyTank', [{ key: 'strip_nutr', label: 'plant tank', color: '#7ee96f' },
                         { key: 'strip_water', label: 'backup tank', color: '#8ab4ff' }]);
        window.addEventListener('resize', function () { Object.values(charts).forEach(draw); });
    }

    // ---------- reading cards ----------
    function card(label, value, sub, level) {
        const c = el('div', 'hy-card ' + level);
        c.append(el('div', 'hy-label', label), el('div', 'hy-value', value), el('div', 'hy-sub', sub));
        return c;
    }

    function inRange(v, lo, hi) {
        if (v === null || v === undefined) return 'warn';
        return v < lo || v > hi ? 'warn' : 'ok';
    }

    function showCards(r) {
        const box = $('hyCards');
        box.replaceChildren();
        if (!r) { box.append(card('Cart', 'No data yet', 'waiting for the Arduino', 'urgent')); return; }
        const tank = function (v) { return v === null ? '--' : v < cfg.strip_empty_below ? 'Empty' : 'Has water'; };
        const tankLvl = function (v) { return v !== null && v < cfg.strip_empty_below ? 'urgent' : 'ok'; };
        box.append(
            card('pH', num(r.ph, 2), 'healthy ' + cfg.ph_min + '–' + cfg.ph_max, inRange(r.ph, cfg.ph_min, cfg.ph_max)),
            card('Plant tank', tank(r.strip_nutr), 'strip reading ' + num(r.strip_nutr, 0), tankLvl(r.strip_nutr)),
            card('Backup tank', tank(r.strip_water), 'strip reading ' + num(r.strip_water, 0), tankLvl(r.strip_water)),
            card('Tower top (drip zone)', num(r.t_top, 0) + '°C', num(r.h_top, 0) + '% humidity',
                 r.t_top === null ? 'warn' : 'ok'),
            card('Room air (ambient)', num(r.t_low, 0) + '°C', num(r.h_low, 0) + '% humidity',
                 r.h_low !== null && r.h_low > cfg.electronics_humidity_max ? 'urgent' :
                 inRange(r.t_low, cfg.temp_min_c, cfg.temp_max_c) === 'ok' &&
                 inRange(r.h_low, cfg.humidity_min, cfg.humidity_max) === 'ok' ? 'ok' : 'warn')
        );
    }

    // ---------- suggestions + alert history ----------
    const ORDER = { urgent: 0, warn: 1, ok: 2, info: 3 };
    const NAMES = { urgent: 'Urgent', warn: 'Check', info: 'Note', ok: 'Good' };

    function showSuggestions(list) {
        const box = $('hySug');
        box.replaceChildren();
        list.sort(function (a, b) { return ORDER[a.level] - ORDER[b.level]; });
        list.forEach(function (s) {
            const row = el('div', 'hy-sugg lvl-' + s.level);
            const text = el('div');
            text.append(el('strong', '', s.title), el('p', '', s.detail));
            row.append(el('span', 'hy-badge', NAMES[s.level] || s.level), text);
            box.append(row);
        });
    }

    function showEvents(list) {
        const ul = $('hyEvents');
        ul.replaceChildren();
        if (!list.length) { ul.append(el('li', '', 'Nothing yet.')); return; }
        list.forEach(function (e) {
            const d = new Date(e.ts * 1000);
            const li = el('li');
            li.append(
                el('time', '', d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
                               d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })),
                el('span', e.state === 'clear' ? 'ev-clear' : 'ev-' + e.level,
                   (e.state === 'clear' ? '✓ cleared: ' : (e.level === 'info' ? '• ' : '▲ ')) + e.title)
            );
            ul.append(li);
        });
    }

    // ---------- charts (drawn on canvas, no libraries) ----------
    function chart(id, series, band) {
        charts[id] = { canvas: $(id), series: series, band: band, rows: [] };
    }

    function draw(c) {
        const cv = c.canvas, box = cv.parentElement;
        if (!box.clientWidth) return;                      // tab hidden
        const dpr = window.devicePixelRatio || 1;
        const W = box.clientWidth, H = box.clientHeight;
        cv.width = W * dpr; cv.height = H * dpr;
        cv.style.width = W + 'px'; cv.style.height = H + 'px';
        const g = cv.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, W, H);
        g.font = '12px system-ui, Arial';
        const L = 44, R = 10, T = 26, B = 24;
        const rows = c.rows;
        const ys = [];
        c.series.forEach(function (s) { rows.forEach(function (r) { if (r[s.key] !== null) ys.push(r[s.key]); }); });
        if (c.band && cfg) ys.push(cfg[c.band[0]], cfg[c.band[1]]);
        if (!rows.length || !ys.length) { g.fillStyle = '#9aa69c'; g.fillText('No data yet', L, T + 20); return; }
        let y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
        const pad = (y1 - y0) * 0.1 || 1; y0 -= pad; y1 += pad;
        const x0 = rows[0].ts, x1 = rows[rows.length - 1].ts;
        const px = function (t) { return L + (t - x0) / ((x1 - x0) || 1) * (W - L - R); };
        const py = function (v) { return T + (y1 - v) / (y1 - y0) * (H - T - B); };
        g.strokeStyle = '#16201a'; g.fillStyle = '#9aa69c'; g.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const v = y0 + (y1 - y0) * i / 4, y = py(v);
            g.beginPath(); g.moveTo(L, y); g.lineTo(W - R, y); g.stroke();
            g.textAlign = 'right'; g.fillText(v.toFixed(Math.abs(y1 - y0) < 5 ? 1 : 0), L - 6, y + 4);
        }
        for (let i = 0; i <= 4; i++) {
            if (W < 420 && (i === 1 || i === 3)) continue;
            const t = x0 + (x1 - x0) * i / 4;
            g.textAlign = i === 0 ? 'left' : i === 4 ? 'right' : 'center';
            g.fillText(fmtTime(t), px(t), H - 6);
        }
        if (c.band && cfg) {
            g.setLineDash([6, 6]); g.strokeStyle = 'rgba(126,233,111,0.45)';
            c.band.forEach(function (k) { const y = py(cfg[k]); g.beginPath(); g.moveTo(L, y); g.lineTo(W - R, y); g.stroke(); });
            g.setLineDash([]);
        }
        let lx = L;
        c.series.forEach(function (s) {
            g.strokeStyle = s.color; g.lineWidth = 2; g.beginPath();
            let started = false;
            rows.forEach(function (r) {
                if (r[s.key] === null) { started = false; return; }
                const x = px(r.ts), y = py(r[s.key]);
                if (started) g.lineTo(x, y); else { g.moveTo(x, y); started = true; }
            });
            g.stroke();
            g.fillStyle = s.color; g.fillRect(lx, 8, 12, 4);
            g.fillStyle = '#9aa69c'; g.textAlign = 'left'; g.fillText(s.label, lx + 16, 14);
            lx += g.measureText(s.label).width + 34;
        });
    }

    // ---------- AI benchmark ----------
    function showBenchmark(b) {
        const m = b.models;
        const mins = m.horizon_min + (m.horizon_min === 1 ? ' minute' : ' minutes');
        $('hyBenchNote').textContent =
            'Every model predicts each reading ' + mins + ' ahead; when that time comes, it is scored against ' +
            'what the sensors actually read. ± is the average error (lower is better, ★ = best). Scores appear ' +
            'after the first ' + mins + '. ' + m.pending + ' predictions waiting to be scored.';
        const table = el('table', 'hy-table');
        const head = el('tr');
        head.append(el('th', '', 'Model'));
        m.keys.forEach(function (k) { head.append(el('th', '', m.labels[k])); });
        ['Speed', 'Runs', 'Errors', 'Status'].forEach(function (h) { head.append(el('th', '', h)); });
        table.append(head);
        m.models.forEach(function (mod) {
            const tr = el('tr');
            tr.append(el('td', 'hy-model', mod.name));
            m.keys.forEach(function (k) {
                const v = mod.mae[k];
                const best = m.best[k] === mod.name;
                tr.append(el('td', best ? 'hy-best' : '', v ? '±' + v.mae + (best ? ' ★' : '') : '--'));
            });
            tr.append(el('td', '', mod.avg_ms === null ? '--' : mod.avg_ms + ' ms'),
                      el('td', '', String(mod.runs)),
                      el('td', mod.errors ? 'hy-bad' : '', String(mod.errors)),
                      el('td', mod.status === 'running' ? '' : 'hy-muted',
                         mod.last_error ? mod.status + ' · last error: ' + mod.last_error : mod.status));
            table.append(tr);
        });
        const wrap = $('hyBench');
        wrap.replaceChildren(table);

        const s = b.system;
        const sys = $('hySys');
        sys.replaceChildren();
        const stat = function (value, label) {
            const d = el('div', 'hy-stat');
            d.append(el('strong', '', value), el('span', '', label));
            sys.append(d);
        };
        stat(s.delivery_pct + '%', 'of expected readings arrived (' + s.readings_last_hour + ' of ' + s.expected_last_hour + ')');
        stat(s.longest_gap_s === null ? '--' : s.longest_gap_s + ' s', 'longest gap between readings');
        const d = s.sensor_dropout_pct;
        stat((d.ph === null ? '--' : d.ph + '%') + ' / ' + (d.t_top === null ? '--' : d.t_top + '%') + ' / ' +
             (d.t_low === null ? '--' : d.t_low + '%'), 'missed readings: pH / tower-top / room sensor');
        const up = s.uptime_s;
        stat(up >= 3600 ? Math.floor(up / 3600) + 'h ' + Math.floor(up % 3600 / 60) + 'm' : Math.floor(up / 60) + 'm', 'app running');
    }

    // ---------- refresh ----------
    function setStatus(state, text) {
        const s = $('hyStatus');
        s.firstChild.className = 'hy-dot ' + state;
        s.lastChild.textContent = text;
    }

    async function refresh(full) {
        try {
            if (!cfg) cfg = await getJSON('/api/config');
            const latest = await getJSON('/api/latest');
            $('hyHelp').hidden = true;
            setStatus(latest.online ? 'on' : 'off', latest.online
                ? 'Live · updated ' + new Date(latest.reading.ts * 1000).toLocaleTimeString()
                : 'App running, but no readings from the Arduino');
            showCards(latest.reading);
            showSuggestions(await getJSON('/api/suggestions'));
            showEvents(await getJSON('/api/events?limit=40'));
            $('hyExport').href = appBase + '/api/export.csv';
            if (full) {
                const rows = await getJSON('/api/history?hours=' + hours);
                Object.values(charts).forEach(function (c) { c.rows = rows; draw(c); });
                showBenchmark(await getJSON('/api/benchmark'));
            }
        } catch (e) {
            setStatus('off', 'Can\'t reach the cart app at ' + appBase);
            $('hyHelp').hidden = false;
        }
    }

    window.HydroAdmin = {
        start: function () {
            build();
            refresh(true);
            if (!timer) timer = setInterval(function () { tick++; refresh(tick % 6 === 0); }, 5000);
        },
        stop: function () {
            clearInterval(timer);
            timer = null;
        }
    };
})();
