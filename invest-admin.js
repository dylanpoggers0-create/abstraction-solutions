/* =========================================================
   invest-admin.js: the "Invest" tab on admin.html

   Stock signals + PAPER trading (fake money) for the company's Alpaca account.
   Everything is computed on the website's server (quote-engine: invest.py + /admin/invest/*);
   this file only shows it. Trades need two clicks, and every attempt is logged with who approved it.

   admin-page.js calls InvestAdmin.start() when the tab opens.
   ========================================================= */
(function () {
    const API = 'https://abstraction-quote-engine.onrender.com/admin/invest';
    const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
    const pct = function (x) { return (x >= 0 ? '+' : '') + (x * 100).toFixed(2) + '%'; };
    let panel, status = null, loadedAt = 0, chartData = null, chartRange = 252, lastSymbol = 'AAPL';

    // ---------- helpers ----------
    function el(tag, cls, text) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text !== undefined && text !== null) e.textContent = text;
        return e;
    }
    function token() { try { return sessionStorage.getItem('adminToken'); } catch (e) { return null; } }
    async function api(path, options) {
        options = options || {};
        options.headers = Object.assign({ 'Authorization': 'Bearer ' + token() }, options.headers);
        if (options.body && typeof options.body !== 'string') {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(options.body);
        }
        let r;
        try { r = await fetch(API + path, options); }
        catch (e) { throw new Error('Can\'t reach the server. It may be waking up; try again in a minute.'); }
        let data = null;
        try { data = await r.json(); } catch (e) {}
        if (r.status === 401) throw new Error('Your login expired. Log out and back in.');
        if (!r.ok) {
            const d = data && data.detail;
            throw new Error(typeof d === 'string' ? d : 'Something went wrong (' + r.status + ').');
        }
        return data;
    }
    function sig(action) {
        const cls = action === 'STRONG BUY' ? 'buy' : action === 'SELL' ? 'sell' : 'hold';
        return el('span', 'inv-sig ' + cls, action);
    }
    function signed(value, text) {
        return el('span', value > 0 ? 'inv-up' : value < 0 ? 'inv-down' : '', text);
    }
    function stat(label, value, delta, deltaValue) {
        const s = el('div', 'inv-stat');
        s.append(el('div', 'l', label), el('div', 'v', value));
        if (delta) { const d = el('div', 'd'); d.append(signed(deltaValue, delta)); s.append(d); }
        return s;
    }
    function card(title) {
        const c = el('section', 'inv-card');
        if (title) c.append(el('h3', 'inv-h', title));
        return c;
    }
    function msgLine(text, warn) { return el('p', 'inv-note' + (warn ? ' warn' : ''), text); }
    function table(headers, rows) {
        const wrap = el('div', 'inv-table-wrap'), t = el('table', 'inv-table');
        const tr = el('tr');
        headers.forEach(function (h) { tr.append(el('th', null, h)); });
        const thead = el('thead'); thead.append(tr);
        const tbody = el('tbody');
        rows.forEach(function (cells) {
            const row = el('tr');
            cells.forEach(function (c) {
                const td = el('td', c && c.cls);
                const v = c && c.node !== undefined ? c.node : c && c.text !== undefined ? c.text : c;
                if (v instanceof Node) td.append(v); else td.textContent = v === null || v === undefined ? '' : v;
                row.append(td);
            });
            tbody.append(row);
        });
        t.append(thead, tbody); wrap.append(t);
        return wrap;
    }
    // two clicks to act (same feel as the Orders tab)
    function confirmBtn(label, confirmText, cls, action, onError) {
        const b = el('button', 'small-btn ' + (cls || ''), label);
        b.type = 'button';
        let timer;
        b.addEventListener('click', async function () {
            if (!b.classList.contains('confirm')) {
                b.classList.add('confirm'); b.textContent = confirmText;
                timer = setTimeout(function () { b.classList.remove('confirm'); b.textContent = label; }, 5000);
                return;
            }
            clearTimeout(timer); b.disabled = true; b.textContent = 'Sending...';
            try { await action(); b.textContent = 'Sent ✓'; }
            catch (e) { b.disabled = false; b.classList.remove('confirm'); b.textContent = label; onError(e.message); }
        });
        return b;
    }
    function idemKey() {
        if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
        return 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12);
    }
    async function placeTrade(t) {
        return api('/trades', { method: 'POST', headers: { 'Idempotency-Key': idemKey() },
                                body: { symbol: t.symbol, side: t.side, notional: t.notional, reason: t.reason || '', confirm: true } });
    }

    // ---------- layout ----------
    const parts = {};
    function build() {
        panel.textContent = '';
        parts.bar = el('div', 'inv-bar');
        parts.msg = el('p', 'msg'); parts.msg.setAttribute('role', 'alert');
        parts.portfolio = card('Company paper account');
        parts.search = card('Look up a stock');
        parts.plan = card('Weekly cash flow → trades');
        parts.log = card('Trade log');
        parts.about = card('How the signals work');
        panel.append(parts.bar, parts.msg, parts.portfolio, parts.search, parts.plan, parts.log, parts.about);
        buildSearch(); buildPlan(); buildAbout();
    }
    function say(text) { parts.msg.textContent = text || ''; }

    // ---------- status bar ----------
    function renderStatus() {
        const s = status, bar = parts.bar;
        bar.textContent = '';
        const badges = el('div', 'inv-badges');
        badges.append(el('span', 'inv-pill paper', 'PAPER TRADING · FAKE MONEY'));
        if (s.paused) badges.append(el('span', 'inv-pill paused', 'PAUSED' + (s.paused_by ? ' by ' + s.paused_by : '')));
        const st = s.strategy;
        badges.append(el('span', 'inv-pill', st.kind === 'evolved'
            ? 'Strategy: evolved ' + (st.created_at || '').slice(0, 10) + ' · exit ' + st.exit_policy
            : 'Strategy: placeholder rule'));
        badges.append(el('span', 'inv-pill', 'Today: ' + s.today.orders + '/' + s.limits.max_orders_per_day + ' orders · '
            + usd.format(s.today.bought) + '/' + usd.format(s.limits.max_daily_buy) + ' bought'));
        bar.append(badges);
        const right = el('div', 'inv-badges');
        const refresh = el('button', 'small-btn', 'Refresh'); refresh.type = 'button';
        refresh.addEventListener('click', function () { load(true); });
        right.append(refresh);
        if (s.owner) {
            right.append(confirmBtn(s.paused ? 'Resume trading' : 'Pause trading', 'Click again to ' + (s.paused ? 'resume' : 'pause'),
                s.paused ? 'go' : 'danger', async function () {
                    await api('/pause', { method: 'POST', body: { paused: !s.paused } });
                    load(true);
                }, say));
        }
        bar.append(right);
        if (st.error) say(st.error);
    }

    // ---------- portfolio ----------
    async function loadPortfolio() {
        const c = parts.portfolio;
        c.textContent = ''; c.append(el('h3', 'inv-h', 'Company paper account'), msgLine('Loading...'));
        let p;
        try { p = await api('/portfolio'); }
        catch (e) { c.lastChild.textContent = e.message; c.lastChild.className = 'inv-note warn'; return; }
        c.lastChild.remove();
        const day = p.last_equity ? p.equity - p.last_equity : 0;
        const stats = el('div', 'inv-stats');
        stats.append(
            stat('Total account value', usd.format(p.equity), p.last_equity ? (day >= 0 ? '+' : '') + usd.format(day) + ' today' : '', day),
            stat('Holdings value', usd.format(p.holdings_value)),
            stat('Unrealized P&L', usd.format(p.unrealized_pl), p.cost_basis ? pct(p.unrealized_pl / p.cost_basis) : '', p.unrealized_pl),
            stat('Cash', usd.format(p.cash), 'Buying power ' + usd.format(p.buying_power), 0));
        c.append(stats);
        if (!p.positions.length) { c.append(msgLine('No positions yet. Approve a trade below to buy.')); return; }
        c.append(table(['Symbol', 'Qty', 'Avg cost', 'Price', 'Value', 'P&L', 'Signal', 'Why', ''], p.positions.map(function (x) {
            const s = x.signal || {};
            const sell = s.action === 'SELL'
                ? confirmBtn('Sell all', 'Click to sell ' + x.symbol, 'danger', async function () {
                    await placeTrade({ symbol: x.symbol, side: 'sell', notional: null, reason: s.reason });
                    load(true);
                }, say) : '';
            const symLink = el('a', null, x.symbol); symLink.href = '#';
            symLink.addEventListener('click', function (e) { e.preventDefault(); lookup(x.symbol); parts.search.scrollIntoView({ behavior: 'smooth' }); });
            return [{ node: symLink }, { text: x.qty.toLocaleString(undefined, { maximumFractionDigits: 4 }), cls: 'num' },
                    { text: usd.format(x.avg_cost), cls: 'num' }, { text: usd.format(x.price), cls: 'num' },
                    { text: usd.format(x.market_value), cls: 'num' },
                    { node: signed(x.unrealized_pl, usd.format(x.unrealized_pl) + ' (' + pct(x.unrealized_plpc) + ')'), cls: 'num' },
                    { node: s.action && s.action !== 'n/a' ? sig(s.action) : el('span', null, 'n/a') }, { text: s.reason || '', cls: 'why' },
                    { node: sell || el('span') }];
        })));
    }

    // ---------- ticker search + chart ----------
    function buildSearch() {
        const c = parts.search;
        const form = el('form', 'inv-row inv-search');
        const input = el('input'); input.placeholder = 'AAPL'; input.maxLength = 8; input.setAttribute('aria-label', 'Ticker symbol');
        input.autocomplete = 'off'; input.value = lastSymbol;
        const go = el('button', 'small-btn go', 'Look up'); go.type = 'submit';
        form.append(input, go);
        form.addEventListener('submit', function (e) { e.preventDefault(); lookup(input.value); });
        parts.searchInput = input;
        parts.quote = el('div');
        c.append(form, parts.quote);
    }
    async function lookup(symbol) {
        symbol = (symbol || '').trim().toUpperCase();
        if (!symbol) return;
        lastSymbol = symbol; parts.searchInput.value = symbol;
        const q = parts.quote;
        q.textContent = ''; q.append(msgLine('Loading ' + symbol + '...'));
        let v;
        try { v = await api('/symbol/' + encodeURIComponent(symbol)); }
        catch (e) { q.textContent = ''; q.append(msgLine(e.message, true)); return; }
        q.textContent = '';
        const change = v.price - v.prev_close;
        const head = el('div', 'inv-quote');
        head.append(el('strong', null, v.symbol), el('span', 'px', usd.format(v.price)),
                    signed(change, (change >= 0 ? '+' : '') + usd.format(change) + ' (' + pct(change / v.prev_close) + ')'),
                    sig(v.signal.action));
        q.append(head, msgLine(v.signal.reason));
        if (v.position) q.append(msgLine('Company holds ' + v.position.qty + ' @ ' + usd.format(v.position.avg_cost)));
        const ranges = el('div', 'inv-ranges');
        [['3M', 63], ['6M', 126], ['1Y', 252]].forEach(function (r) {
            const b = el('button', 'small-btn' + (chartRange === r[1] ? ' active' : ''), r[0]); b.type = 'button';
            b.addEventListener('click', function () {
                chartRange = r[1];
                ranges.querySelectorAll('button').forEach(function (x) { x.classList.toggle('active', x === b); });
                drawChart();
            });
            ranges.append(b);
        });
        q.append(ranges);
        parts.chart = el('div'); q.append(parts.chart);
        chartData = { c: v.chart, cost: v.position ? v.position.avg_cost : null, symbol: v.symbol };
        drawChart();
    }
    function drawChart() {
        if (!chartData || !parts.chart) return;
        const NS = 'http://www.w3.org/2000/svg', narrow = parts.chart.clientWidth > 0 && parts.chart.clientWidth < 520,
            W = narrow ? 400 : 720, H = narrow ? 240 : 260, L = 48, R = 8, T = 10, B = 26;
        const n = chartData.c.close.length, start = Math.max(0, n - chartRange);
        const pick = function (arr) { return arr.slice(start); };
        const close = pick(chartData.c.close), s20 = pick(chartData.c.sma_20), s50 = pick(chartData.c.sma_50), dates = pick(chartData.c.dates);
        const vals = close.concat(s20, s50, chartData.cost ? [chartData.cost] : []).filter(function (x) { return x !== null; });
        let lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
        const pad = (hi - lo) * 0.06 || 1; lo -= pad; hi += pad;
        const x = function (i) { return L + (i / Math.max(1, close.length - 1)) * (W - L - R); };
        const y = function (v) { return T + (1 - (v - lo) / (hi - lo)) * (H - T - B); };
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('class', 'inv-chart');
        svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', chartData.symbol + ' price chart');
        const add = function (tag, attrs, text) {
            const e = document.createElementNS(NS, tag);
            Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
            if (text) e.textContent = text;
            svg.append(e); return e;
        };
        for (let k = 0; k <= 4; k++) {
            const v = lo + (hi - lo) * k / 4;
            add('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'grid' });
            add('text', { x: L - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'axis' }, v >= 1000 ? Math.round(v).toLocaleString() : v.toFixed(2));
        }
        add('text', { x: L, y: H - 6, class: 'axis' }, dates[0] || '');
        add('text', { x: W - R, y: H - 6, 'text-anchor': 'end', class: 'axis' }, dates[dates.length - 1] || '');
        const path = function (arr, cls) {
            let d = '', pen = false;
            arr.forEach(function (v, i) {
                if (v === null) { pen = false; return; }
                d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1) + ' '; pen = true;
            });
            if (d) add('path', { d: d, class: cls });
        };
        if (chartData.cost) add('line', { x1: L, x2: W - R, y1: y(chartData.cost), y2: y(chartData.cost), class: 'cost' });
        path(s50, 's50'); path(s20, 's20'); path(close, 'close');
        const legend = el('div', 'inv-legend');
        [['Close', 'var(--green)'], ['SMA 20', '#f5c451'], ['SMA 50', '#8ab4f8']].concat(chartData.cost ? [['Company cost', '#ff8a80']] : [])
            .forEach(function (l) { const s = el('span'); const i = el('i'); i.style.background = l[1]; s.append(i, document.createTextNode(l[0])); legend.append(s); });
        parts.chart.textContent = '';
        parts.chart.append(svg, legend);
    }

    // ---------- weekly cash flow ----------
    const PLAN_KEY = function () { return 'investPlan:' + (status ? status.you : ''); };
    function savedPlan() {
        try { return JSON.parse(localStorage.getItem(PLAN_KEY())) || null; } catch (e) { return null; }
    }
    function savePlan(p) { try { localStorage.setItem(PLAN_KEY(), JSON.stringify(p)); } catch (e) {} }
    function numInput(value, label, step) {
        const l = el('label', null, label), i = el('input');
        i.type = 'number'; i.min = '0'; i.step = step || 'any'; i.value = value;
        l.append(i); return [l, i];
    }
    function buildPlan() {
        const c = parts.plan;
        c.append(msgLine('Your income stays in this browser. Only the numbers are sent to work out the plan.'));
        parts.income = el('div', 'inv-income');
        const add = el('button', 'small-btn', '+ Add income'); add.type = 'button';
        add.addEventListener('click', function () { incomeRow({ name: '', kind: 'hourly', hourly_rate: 0, weekly_hours: 0, annual_salary: 0 }); });
        const row2 = el('div', 'inv-row');
        const sav = numInput(50, 'Weekly savings ($)'), exp = numInput(50, 'Weekly expenses ($)');
        const capL = el('label', null, 'Max per stock'), cap = el('select');
        [['25%', 0.25], ['50%', 0.5], ['75%', 0.75], ['100%', 1]].forEach(function (o) {
            const op = el('option', null, o[0]); op.value = o[1]; cap.append(op);
        });
        cap.value = '0.5'; capL.append(cap);
        row2.append(sav[0], exp[0], capL);
        const wl = el('label', null, 'Watchlist (comma separated, up to 15)'), watch = el('input');
        watch.type = 'text'; watch.value = 'AAPL, MSFT, NVDA, GOOGL, AMZN'; watch.style.width = '100%'; wl.append(watch);
        wl.style.display = 'grid'; wl.style.gap = '4px'; wl.style.color = 'var(--text-muted)'; wl.style.fontSize = '0.8rem'; wl.style.marginTop = '10px';
        const calc = el('button', 'small-btn go', 'Work out this week'); calc.type = 'button';
        const calcRow = el('div', 'stage-row'); calcRow.append(calc);
        parts.planOut = el('div');
        c.append(parts.income, add, row2, wl, calcRow, parts.planOut);
        parts.planInputs = { sav: sav[1], exp: exp[1], cap: cap, watch: watch };
        calc.addEventListener('click', runPlan);
    }
    function incomeRow(src) {
        const row = el('div', 'inv-row');
        const nl = el('label', null, 'Job'), name = el('input'); name.type = 'text'; name.maxLength = 60; name.value = src.name || ''; nl.append(name);
        const kl = el('label', null, 'Paid'), kind = el('select');
        [['hourly', 'Hourly'], ['salary', 'Salary']].forEach(function (o) { const op = el('option', null, o[1]); op.value = o[0]; kind.append(op); });
        kind.value = src.kind || 'hourly'; kl.append(kind);
        const rate = numInput(src.hourly_rate || 0, '$ / hour'), hours = numInput(src.weekly_hours || 0, 'Hours / week'),
              sal = numInput(src.annual_salary || 0, '$ / year');
        const del = el('button', 'small-btn danger', '✕'); del.type = 'button'; del.setAttribute('aria-label', 'Remove');
        del.addEventListener('click', function () { row.remove(); });
        const sync = function () { const h = kind.value === 'hourly'; rate[0].hidden = !h; hours[0].hidden = !h; sal[0].hidden = h; };
        kind.addEventListener('change', sync); sync();
        row.append(nl, kl, rate[0], hours[0], sal[0], del);
        row.read = function () {
            return { name: name.value.trim(), kind: kind.value, hourly_rate: +rate[1].value || 0,
                     weekly_hours: +hours[1].value || 0, annual_salary: +sal[1].value || 0 };
        };
        parts.income.append(row);
    }
    function restorePlan() {
        const p = savedPlan();
        parts.income.textContent = '';
        (p && p.sources && p.sources.length ? p.sources : [{ name: 'Job 1', kind: 'hourly', hourly_rate: 15, weekly_hours: 10 }]).forEach(incomeRow);
        if (p) {
            const i = parts.planInputs;
            i.sav.value = p.savings; i.exp.value = p.expenses; i.watch.value = p.watchlist.join(', '); i.cap.value = String(p.max_fraction);
        }
    }
    async function runPlan() {
        const i = parts.planInputs, out = parts.planOut;
        const body = {
            sources: Array.prototype.map.call(parts.income.children, function (r) { return r.read(); }).filter(function (s) { return s.name || s.hourly_rate || s.annual_salary; }).slice(0, 10),
            savings: +i.sav.value || 0, expenses: +i.exp.value || 0, max_fraction: +i.cap.value,
            watchlist: i.watch.value.split(',').map(function (s) { return s.trim().toUpperCase(); }).filter(Boolean).slice(0, 15),
        };
        savePlan(body);
        out.textContent = ''; out.append(msgLine('Checking signals...'));
        let p;
        try { p = await api('/plan', { method: 'POST', body: body }); }
        catch (e) { out.textContent = ''; out.append(msgLine(e.message, true)); return; }
        out.textContent = '';
        const stats = el('div', 'inv-stats'); stats.style.marginTop = '14px';
        stats.append(stat('Weekly earnings', usd.format(p.weekly_earnings)), stat('Net investable cash', usd.format(p.net_investable)),
                     stat('Deployable now', usd.format(p.deployable), 'capped by buying power ' + usd.format(p.buying_power), 0));
        out.append(stats);
        const split = el('div', 'inv-split');
        const left = el('div'), right = el('div');
        left.append(el('h3', 'inv-h', 'Signals'), table(['Symbol', 'Signal', 'Why'], p.signals.map(function (s) {
            return [s.symbol, { node: s.action === 'n/a' ? el('span', null, 'n/a') : sig(s.action) }, { text: s.reason, cls: 'why' }];
        })));
        right.append(el('h3', 'inv-h', 'Proposed trades'));
        const err = function (m) { say(m); };
        if (!p.buys.length && !p.sells.length) {
            right.append(msgLine('Nothing to do this week: no STRONG BUY with cash available, and no SELL on holdings.'));
        } else {
            right.append(table(['Trade', 'Amount', ''], p.buys.map(function (b) {
                return [{ node: sig('STRONG BUY') }, { text: b.symbol + ' ' + usd.format(b.notional), cls: 'num' },
                        { node: confirmBtn('Approve trade', 'Click to buy ' + b.symbol, 'go', async function () {
                            await placeTrade({ symbol: b.symbol, side: 'buy', notional: b.notional, reason: b.reason });
                            load(true);
                        }, err) }];
            }).concat(p.sells.map(function (s) {
                return [{ node: sig('SELL') }, { text: s.symbol + ' (all ' + s.qty + ')', cls: 'num' },
                        { node: confirmBtn('Approve trade', 'Click to sell ' + s.symbol, 'danger', async function () {
                            await placeTrade({ symbol: s.symbol, side: 'sell', notional: null, reason: s.reason });
                            load(true);
                        }, err) }];
            }))));
            right.append(msgLine('Orders are market orders on the paper account. Outside market hours they fill at the next open.'));
        }
        split.append(left, right);
        out.append(split);
    }

    // ---------- trade log ----------
    async function loadLog() {
        const c = parts.log;
        c.textContent = ''; c.append(el('h3', 'inv-h', 'Trade log'));
        let rows;
        try { rows = await api('/trades'); }
        catch (e) { c.append(msgLine(e.message, true)); return; }
        if (!rows.length) { c.append(msgLine('No trades yet.')); return; }
        c.append(table(['When', 'Who', 'Trade', 'Amount', 'Status', 'Signal at the time'], rows.map(function (r) {
            const status = r.status === 'submitted' ? el('span', 'inv-up', 'sent')
                : r.status === 'rejected' ? el('span', 'inv-down', 'rejected') : el('span', null, r.status);
            if (r.error) status.title = r.error;
            return [new Date(r.created_at).toLocaleString(), r.admin, r.side.toUpperCase() + ' ' + r.symbol,
                    { text: r.notional === null ? 'all' : usd.format(r.notional), cls: 'num' }, { node: status },
                    { text: r.error ? r.error : r.reason, cls: 'why' }];
        })));
    }

    // ---------- about ----------
    function buildAbout() {
        const c = parts.about;
        [
            'Each stock gets a score from RSI, 20/50-day averages, MACD, volatility and 3-month momentum, weighted by a strategy '
            + 'evolved with a genetic algorithm (stockbot). The score puts it in one of four states.',
            'High-confidence winner: STRONG BUY only on a dip. High-confidence loser: SELL once it\'s back above the company\'s cost. '
            + 'Baseline winner/loser: HOLD. Any holding that falls past its stop-loss is sold no matter what.',
            'Safeguards: paper account only, two clicks per trade, per-order and daily limits for all admins together, '
            + 'the owner can pause trading, and every attempt is logged with who approved it.',
            'Not financial advice. Most strategies don\'t beat simply holding an index fund; compare against that before trusting it.',
        ].forEach(function (t) { c.append(msgLine(t)); });
    }

    // ---------- load ----------
    async function load(force) {
        if (!force && status && Date.now() - loadedAt < 60000) return;
        say('');
        try { status = await api('/status'); }
        catch (e) { say(e.message); return; }
        loadedAt = Date.now();
        renderStatus();
        if (!parts.restored) { restorePlan(); parts.restored = true; }
        if (!status.configured) {
            parts.portfolio.textContent = '';
            parts.portfolio.append(el('h3', 'inv-h', 'Company paper account'),
                msgLine('Not set up yet. On Render, add ALPACA_PAPER_KEY and ALPACA_PAPER_SECRET (from the company\'s Alpaca '
                    + 'paper account → API Keys; paper keys start with PK), then redeploy.', true));
            return;
        }
        loadPortfolio(); loadLog();
        if (!chartData) lookup(lastSymbol);
    }

    window.InvestAdmin = {
        start: function () {
            panel = document.getElementById('investPanel');
            if (!panel) return;
            if (!panel.childElementCount) build();
            load(false);
        },
        stop: function () {},
    };
})();
