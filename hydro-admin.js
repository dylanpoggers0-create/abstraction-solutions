/* =========================================================
   hydro-admin.js: the "Hydro Cart" tab on admin.html

   Shows live data from the hydroponic cart. The data comes from the Python app
   (hydro-cart/app/hydro_app.py) on the Raspberry Pi the Arduino Mega is plugged into.
     - On the Pi itself: read straight from the app (http://127.0.0.1:8000).
     - Anywhere else: the Pi's cloud_sync.py sends a copy to the website's server every 15 s,
       and this tab reads that copy with your admin login. The readings stay on the Pi.

   admin.html calls HydroAdmin.start() when the tab opens and HydroAdmin.stop() when it closes.
   ========================================================= */
(function () {
    // On the cart app's own page (http://localhost:8000) the app sets HYDRO_APP_BASE to itself.
    const LOCAL = typeof window.HYDRO_APP_BASE === 'string';
    const DEFAULT_APP = LOCAL ? window.HYDRO_APP_BASE : 'http://127.0.0.1:8000';
    let appBase = DEFAULT_APP;
    if (!LOCAL) { try { appBase = localStorage.getItem('hydroApp') || DEFAULT_APP; } catch (e) {} }
    const CLOUD = 'https://abstraction-quote-engine.onrender.com/hydro';
    let remote = false;      // true = reading the copy on the website's server
    let picked = false;      // has the data source been chosen yet

    function adminToken() { try { return sessionStorage.getItem('adminToken'); } catch (e) { return null; } }

    // the cart app on this computer if it answers quickly, otherwise the website's copy
    async function pickSource() {
        picked = true;
        remote = false;
        if (LOCAL) return;
        const ctl = new AbortController();
        const t = setTimeout(function () { ctl.abort(); }, 1500);
        try {
            const r = await fetch(appBase + '/api/config', { cache: 'no-store', signal: ctl.signal });
            if (r.ok) return;
        } catch (e) {
        } finally {
            clearTimeout(t);
        }
        remote = !!adminToken();
    }

    let cfg = null;          // the app's settings (healthy ranges etc.)
    let hours = 24;          // chart range
    let timer = null;
    let tick = 0;
    const charts = {};
    let benchH = null;       // benchmark horizon shown (seconds)
    let benchPhase = 'all';  // 'all' data or the frozen 'test' window
    let built = false;

    // ---------- small helpers (textContent only: nothing from the app runs as code) ----------
    function el(tag, cls, text) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text !== undefined && text !== null) e.textContent = text;
        return e;
    }

    function $(id) { return document.getElementById(id); }

    async function post(path) {
        if (remote) throw new Error('only works on the Pi');
        const r = await fetch(appBase + path, { method: 'POST', cache: 'no-store',
                                                headers: { 'X-Hydro-Action': 'yes' } });
        let j = {};
        try { j = await r.json(); } catch (e) {}
        if (!r.ok) throw new Error(j.error || ('app error ' + r.status));
        return j;
    }

    // a button that needs two clicks within 5 s (for anything that can't be undone)
    function confirmButton(label, armedLabel, action) {
        const b = el('button', 'small-btn', label);
        b.type = 'button';
        let armed = null;
        b.addEventListener('click', async function () {
            if (!armed) {
                b.textContent = armedLabel;
                b.classList.add('hy-danger');
                armed = setTimeout(function () { armed = null; b.textContent = label; b.classList.remove('hy-danger'); }, 5000);
                return;
            }
            clearTimeout(armed);
            armed = null;
            b.disabled = true;
            b.classList.remove('hy-danger');
            b.textContent = 'Working…';
            let msg;
            try { msg = await action(); } catch (e) { msg = 'Failed: ' + e.message; }
            b.textContent = msg || 'Done';
            setTimeout(function () { b.textContent = label; b.disabled = false; }, 4000);
        });
        return b;
    }

    async function getJSON(path) {
        const r = remote
            ? await fetch(CLOUD + path, { cache: 'no-store', headers: { 'Authorization': 'Bearer ' + adminToken() } })
            : await fetch(appBase + path, { cache: 'no-store' });
        if (!r.ok) throw new Error((remote ? 'cloud ' : 'app error ') + r.status);
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
        const conn = el('label', 'hy-conn hy-pionly', 'App address ');
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
        const exp = el('a', 'small-btn hy-pionly', 'Download all data (CSV)');
        exp.id = 'hyExport';
        exp.href = appBase + '/api/export.csv';
        const reset = confirmButton('Reset readings', 'Click again to erase all readings', async function () {
            try {
                await post('/api/reset');
            } catch (e) {
                return e.message.indexOf('app error') === 0 || e.message === 'not allowed'
                    ? 'Reset failed: restart start.bat with the new files' : 'Reset failed: ' + e.message;
            }
            await refresh(true);
            return 'Reset done (old data backed up)';
        });
        reset.id = 'hyReset';
        reset.classList.add('hy-pionly');
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
                        Object.assign(el('div', 'hy-row'), { id: 'hyBenchCtl' }),
                        Object.assign(el('div', 'hy-alert'), { id: 'hyBenchWarn', hidden: true }),
                        el('h2', 'hy-h hy-h2', 'Your model vs the strongest other model'),
                        Object.assign(el('div', 'hy-table-wrap'), { id: 'hyVerdict' }),
                        el('h2', 'hy-h hy-h2', 'Every model'),
                        Object.assign(el('div', 'hy-table-wrap'), { id: 'hyBench' }),
                        el('h2', 'hy-h hy-h2', 'Model health'),
                        Object.assign(el('div', 'hy-table-wrap'), { id: 'hyHealth' }),
                        el('h2', 'hy-h hy-h2', 'Study controls'),
                        Object.assign(el('div', 'hy-rigor'), { id: 'hyRigor' }),
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
    const fmtH = function (sec) { return sec < 3600 ? Math.round(sec / 60) + ' min' : Math.round(sec / 360) / 10 + ' h'; };
    const fmtP = function (p) { return p === null || p === undefined ? '--' : p < 0.001 ? '< 0.001' : p.toFixed(3); };
    const digits = function (k) { return k === 'ph' ? 3 : 2; };
    const fmtDate = function (ts) { return new Date(ts * 1000).toLocaleString(); };

    function table(headers, rows) {
        const t = el('table', 'hy-table');
        const head = el('tr');
        headers.forEach(function (h) { head.append(el('th', '', h)); });
        t.append(head);
        rows.forEach(function (cells) {
            const tr = el('tr');
            cells.forEach(function (c) {
                const td = el('td', c.cls || '');
                (Array.isArray(c.text) ? c.text : [c.text]).forEach(function (line, i) {
                    td.append(i ? el('div', 'hy-sub', line) : document.createTextNode(line));
                });
                tr.append(td);
            });
            t.append(tr);
        });
        return t;
    }

    function showBenchmark(b) {
        const m = b.models;
        const res = m.results;
        if (benchH === null || m.horizons_s.indexOf(benchH) < 0) benchH = m.horizons_s[0];
        const hk = String(benchH);
        const label = function (k) { return m.labels[k] + (k === 'ph' && !m.ph_calibrated ? ' · uncalibrated' : ''); };

        $('hyBenchNote').textContent =
            'Every model gets the same last ' + m.history_h + ' hours of readings and predicts each value ' +
            m.horizons_s.map(fmtH).join(', ') + ' ahead. Each prediction is saved before the real value exists, ' +
            'then scored against what the sensors actually read (no peeking). ± is the average error (MAE, lower ' +
            'is better). "× persistence" compares a model with "nothing changes" on exactly the same moments: below 1 ' +
            'beats it. p is a Diebold-Mariano significance test; below 0.05 means the difference is very unlikely ' +
            'to be luck. p appears only after about 10 horizon-lengths of data.';

        // controls: horizon + which data
        const ctl = $('hyBenchCtl');
        ctl.replaceChildren();
        const hz = el('div', 'hy-range');
        m.horizons_s.forEach(function (h) {
            const btn = el('button', 'small-btn' + (h === benchH ? ' active' : ''), fmtH(h) + ' ahead');
            btn.type = 'button';
            btn.addEventListener('click', function () { benchH = h; showBenchmark(b); });
            hz.append(btn);
        });
        const ph = el('div', 'hy-range');
        [['all', 'All data'], ['test', 'Test window only']].forEach(function (p) {
            const btn = el('button', 'small-btn' + (p[0] === benchPhase ? ' active' : ''), p[1]);
            btn.type = 'button';
            btn.disabled = p[0] === 'test' && !m.test_window;
            btn.addEventListener('click', async function () {
                benchPhase = p[0];
                try { showBenchmark(await getJSON('/api/benchmark?phase=' + benchPhase)); } catch (e) {}
            });
            ph.append(btn);
        });
        ctl.append(hz, ph);

        const warn = $('hyBenchWarn');
        const warnings = [];
        if (res && res !== 'computing' && res.invalid) warnings.push('Test window invalid: ' + res.invalid);
        if (benchPhase === 'all' && m.test_window)
            warnings.push('Showing all data. For the final result, use "Test window only".');
        warn.textContent = warnings.join(' ');
        warn.hidden = !warnings.length;

        const user = m.models.filter(function (x) { return x.kind === 'yours'; })[0];
        if (res === 'computing' || !res) {
            const msg = res === 'computing' ? 'Calculating results…' : 'No test window yet.';
            $('hyVerdict').replaceChildren(el('p', 'hy-note', msg));
            $('hyBench').replaceChildren(el('p', 'hy-note', msg));
        } else {
            // headline: your model vs the strongest other model, Holm-corrected
            const vh = res.yours_vs_best[hk] || {};
            const vbox = $('hyVerdict');
            vbox.replaceChildren();
            if (user && user.status !== 'running') vbox.append(el('p', 'hy-note', user.name + ': ' + user.status));
            {
                vbox.append(table(
                    ['Value', 'Strongest other model', 'Your error vs it', 'p (corrected)', 'Result'],
                    m.keys.map(function (k) {
                        const v = vh[k] || { verdict: 'not enough data' };
                        const diff = v.rel === null || v.rel === undefined ? '--'
                            : v.rel < 1 ? Math.round((1 - v.rel) * 1000) / 10 + '% lower'
                            : Math.round((v.rel - 1) * 1000) / 10 + '% higher';
                        const cls = v.verdict.indexOf('better') === 0 ? 'hy-best'
                            : v.verdict.indexOf('worse') === 0 ? 'hy-bad' : 'hy-muted';
                        return [{ text: label(k), cls: 'hy-model' }, { text: v.baseline || '--' },
                                { text: [diff, v.n_eff ? '≈' + v.n_eff + ' independent samples' : ''] },
                                { text: fmtP(v.p_holm) }, { text: v.verdict, cls: cls }];
                    })));
            }
            // every model, every value
            const by = res.by_h[hk] || {};
            const best = {};
            m.keys.forEach(function (k) {
                let top = null;
                Object.keys(by[k] || {}).forEach(function (name) {
                    const c = by[k][name];
                    if (c.n >= m.min_scored && (top === null || c.mae < by[k][top].mae)) top = name;
                });
                best[k] = top;
            });
            $('hyBench').replaceChildren(table(['Model'].concat(m.keys.map(label)), m.models.map(function (mod) {
                return [{ text: mod.name, cls: 'hy-model' }].concat(m.keys.map(function (k) {
                    const c = (by[k] || {})[mod.name];
                    if (!c || c.n < m.min_scored) return { text: '--' };
                    const isBest = best[k] === mod.name;
                    let sub = mod.name === m.persistence ? 'reference'
                        : (c.rel === null ? '' : c.rel.toFixed(2) + '× persistence') + (c.p !== null && c.p !== undefined ? ' · p ' + fmtP(c.p) : '');
                    if (c.coverage !== null && c.coverage < 0.95) sub += ' · ' + Math.round(c.coverage * 100) + '% covered';
                    return { text: ['±' + c.mae.toFixed(digits(k)) + (isBest ? ' ★' : ''), sub], cls: isBest ? 'hy-best' : '' };
                }));
            })));
        }

        $('hyHealth').replaceChildren(table(['Model', 'Speed', 'Rounds', 'Crashes', 'Code fingerprint', 'Status'],
            m.models.map(function (mod) {
                return [{ text: mod.name, cls: 'hy-model' },
                        { text: mod.avg_ms === null ? '--' : mod.avg_ms + ' ms' }, { text: String(mod.runs) },
                        { text: String(mod.errors), cls: mod.errors ? 'hy-bad' : '' }, { text: mod.code || '--' },
                        { text: mod.last_error ? mod.status + ' · last error: ' + mod.last_error : mod.status,
                          cls: mod.status === 'running' ? '' : 'hy-muted' }];
            })));

        // study controls: frozen test window, exports, noise floor, rules
        const rig = $('hyRigor');
        rig.replaceChildren();
        const w = m.test_window;
        const status = el('p', 'hy-note');
        const btns = el('div', 'hy-range');
        if (!w || w.ended_ts) {
            status.textContent = (w ? 'Last test window: ' + fmtDate(w.started_ts) + ' → ' + fmtDate(w.ended_ts) +
                (w.invalid_reason ? ' (invalid: ' + w.invalid_reason + ')' : '') + '. ' : 'No test window yet. ') +
                'When your model is final, start a test window. Its code gets fingerprinted, and only predictions ' +
                'made inside the window count for the final result. Changing my_model.py during the window makes ' +
                'it invalid. Run it 2+ weeks for 24 h results.';
            btns.append(confirmButton('Start test window', 'Click again: model is final', async function () {
                await post('/api/test/start');
                await refresh(true);
                return 'Test window started';
            }));
        } else {
            const days = Math.round((Date.now() / 1000 - w.started_ts) / 8640) / 10;
            status.textContent = 'Test window running since ' + fmtDate(w.started_ts) + ' (' + days + ' days). ' +
                'Frozen model: ' + w.model_name + ', fingerprint ' + (w.model_hash || '').slice(0, 12) + '. ' +
                (w.invalid_reason ? 'INVALID: ' + w.invalid_reason : 'Don\'t edit my_model.py until you end it.');
            btns.append(confirmButton('End test window', 'Click again to end it', async function () {
                await post('/api/test/end');
                await refresh(true);
                return 'Test window ended';
            }));
        }
        const link = function (text, path) {
            const a = el('a', 'small-btn hy-pionly', text);
            a.href = appBase + path;
            return a;
        };
        btns.append(link('Download study protocol (JSON)', '/api/protocol.json'),
                    link('Download every prediction (CSV)', '/api/export_predictions.csv'));
        rig.append(status, btns);

        const noise = el('ul', 'hy-list');
        m.keys.forEach(function (k) {
            const n = m.noise[k];
            noise.append(el('li', '', label(k) + ': ' + (n.noise_avg !== null && n.noise_avg !== undefined
                ? 'noise floor ≈ ' + n.noise_avg + ' (one reading ≈ ' + n.noise + ')' : 'not enough readings yet') +
                (n.accuracy ? ' · sensor accuracy ±' + n.accuracy : '')));
        });
        const r2 = res && res !== 'computing' ? res : null;
        rig.append(el('p', 'hy-note', 'Noise floor: forecasts are scored against 2-minute averages, so an error near these ' +
                      'numbers can\'t be told apart from sensor noise. Sensor accuracy limits how true the readings ' +
                      'are, not the forecast score (every model is judged against the same sensor).'), noise,
                   el('p', 'hy-note', 'Data: ' + (r2 ? r2.scored + ' predictions scored, ' + r2.missing +
                      ' had no reading to check against, ' + r2.pending + ' waiting. ' : '') +
                      m.skipped_rounds + ' rounds skipped while the cart was offline.'));
        const rules = el('details', 'hy-details');
        rules.append(el('summary', '', 'Pre-declared rules (what counts and what doesn\'t)'));
        const ul = el('ul', 'hy-list');
        m.exclusion_rules.forEach(function (t) { ul.append(el('li', '', t)); });
        rules.append(ul);
        rig.append(rules);

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
            if (!picked) { await pickSource(); cfg = null; full = true; }
            document.querySelectorAll('#hydroPanel .hy-pionly').forEach(function (b) { b.hidden = remote; });
            if (!cfg) cfg = await getJSON('/api/config');
            const latest = await getJSON('/api/latest');
            $('hyHelp').hidden = true;
            const at = function (ts) { return new Date(ts * 1000).toLocaleTimeString(); };
            setStatus(latest.online ? 'on' : 'off', latest.online
                ? (remote ? 'Live from the Pi at home · updated ' : 'Live · updated ') + at(latest.reading.ts)
                : remote
                    ? (latest.reading ? 'The cart stopped reporting · last reading ' + at(latest.reading.ts)
                                      : 'The Pi is connected, but no readings from the Arduino')
                    : 'App running, but no readings from the Arduino');
            showCards(latest.reading);
            showSuggestions(await getJSON('/api/suggestions'));
            showEvents(await getJSON('/api/events?limit=40'));
            $('hyExport').href = appBase + '/api/export.csv';
            if (full) {
                const rows = await getJSON('/api/history?hours=' + hours);
                Object.values(charts).forEach(function (c) { c.rows = rows; draw(c); });
                showBenchmark(await getJSON('/api/benchmark?phase=' + benchPhase));
            }
        } catch (e) {
            if (remote) {
                setStatus('off', e.message === 'cloud 404' ? 'Waiting for the Pi to send its first update'
                    : e.message === 'cloud 401' ? 'Log in again to see the cart'
                    : 'Can\'t reach the website\'s server right now');
                $('hyHelp').hidden = true;
            } else {
                setStatus('off', 'Can\'t reach the cart app at ' + appBase);
                $('hyHelp').hidden = false;
            }
            picked = false;          // look again next time (e.g. the Pi app just started)
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
