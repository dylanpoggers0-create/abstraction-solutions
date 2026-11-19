/* Page script for admin.html. Kept in its own file so the page's Content-Security-Policy
   can forbid inline scripts (an injected <script> would be blocked). */
    const API_BASE = 'https://abstraction-quote-engine.onrender.com';

    const loginForm = document.getElementById('loginForm');
    const loginButton = document.getElementById('loginButton');
    const loginMsg = document.getElementById('loginMsg');
    const dashboard = document.getElementById('dashboard');
    const dashMsg = document.getElementById('dashMsg');
    const orderList = document.getElementById('orderList');

    fetch(API_BASE + '/health').catch(function () {});   // wake the free server

    // ---------- the login token ----------
    // sessionStorage = remembered until you close this browser tab
    function getToken() {
        try { return sessionStorage.getItem('adminToken'); } catch (e) { return null; }
    }
    function setToken(token) {
        try {
            if (token) sessionStorage.setItem('adminToken', token);
            else sessionStorage.removeItem('adminToken');
        } catch (e) {}
        memoryToken = token;
    }
    let memoryToken = getToken();

    // every admin request goes through here, with the token attached
    async function api(path, options) {
        options = options || {};
        options.headers = Object.assign({ 'Authorization': 'Bearer ' + memoryToken }, options.headers);
        const response = await fetch(API_BASE + path, options);
        if (response.status === 401 || response.status === 403) {   // token missing or expired
            logout('Your login expired. Please log in again.');
            throw new Error('logged out');
        }
        if (!response.ok) {   // show the server's own explanation when it gives one (e.g. "Waiting on the Planning payment")
            const body = await response.json().catch(function () { return {}; });
            throw new Error(typeof body.detail === 'string' ? body.detail : 'Server error (' + response.status + ')');
        }
        return response.json();
    }

    // ---------- log in / log out ----------
    // the server answers {detail: "..."} or, for two-factor steps, {detail: {message, code_required | setup_required}}
    async function readError(response) {
        const body = await response.json().catch(function () { return {}; });
        return typeof body.detail === 'object' && body.detail ? body.detail : { message: body.detail };
    }

    const codeWrap = document.getElementById('codeWrap');
    const loginCode = document.getElementById('loginCode');

    loginForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        loginButton.disabled = true;
        loginButton.textContent = 'Checking...';
        loginMsg.textContent = '';
        const creds = { username: document.getElementById('username').value, password: document.getElementById('password').value };
        try {
            const body = Object.assign({}, creds);
            if (!codeWrap.hidden && loginCode.value.trim()) body.code = loginCode.value.trim();
            const response = await fetch(API_BASE + '/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (response.ok) {
                finishLogin((await response.json()).token);
                return;
            }
            const error = await readError(response);
            if (response.status === 401 && error.code_required) {        // right password: ask for the code
                codeWrap.hidden = false;
                loginCode.value = '';
                loginCode.focus();
                throw new Error(error.message);
            }
            if (response.status === 403 && error.setup_required) {       // two-factor is required: set it up now
                await startTwofaSetup(creds, true);
                loginMsg.textContent = '';
                return;
            }
            if (response.status === 401) throw new Error('Wrong username or password.');
            if (response.status === 429) throw new Error(error.message || 'Too many attempts. Wait a minute and try again.');
            throw new Error(error.message || 'Server error (' + response.status + ').');
        } catch (error) {
            loginMsg.textContent = error instanceof TypeError
                ? 'Can\'t reach the server. It may be waking up: try again in a minute.'
                : error.message;
        } finally {
            loginButton.disabled = false;
            loginButton.textContent = 'Log in';
        }
    });

    function finishLogin(token) {
        setToken(token);
        document.getElementById('password').value = '';
        loginCode.value = '';
        codeWrap.hidden = true;
        showDashboard();
    }

    // ---------- two-factor setup (from the login screen, or from the Security tab) ----------
    let setupCreds = null, setupFromLogin = false, pendingToken = null;
    const twofaSetup = document.getElementById('twofaSetup'), twofaBackup = document.getElementById('twofaBackup');
    const twofaMsg = document.getElementById('twofaMsg');

    async function startTwofaSetup(creds, fromLogin) {
        const response = await fetch(API_BASE + '/admin/2fa/setup', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(creds)
        });
        if (!response.ok) throw new Error((await readError(response)).message || 'Couldn\'t start setup.');
        const data = await response.json();
        setupCreds = creds;
        setupFromLogin = fromLogin;
        document.getElementById('twofaQr').src = data.qr;
        document.getElementById('twofaSecret').textContent = data.secret;
        document.getElementById('twofaCode').value = '';
        twofaMsg.textContent = '';
        loginForm.hidden = true;
        dashboard.hidden = true;
        twofaSetup.hidden = false;
        document.getElementById('twofaCode').focus();
    }

    document.getElementById('twofaConfirm').addEventListener('click', async function () {
        const button = this;
        button.disabled = true;
        twofaMsg.textContent = '';
        try {
            const response = await fetch(API_BASE + '/admin/2fa/confirm', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(Object.assign({ code: document.getElementById('twofaCode').value.trim() }, setupCreds))
            });
            if (!response.ok) throw new Error((await readError(response)).message || 'That didn\'t work. Try again.');
            const data = await response.json();
            pendingToken = data.token;
            setupCreds = null;
            const list = document.getElementById('backupList');
            list.replaceChildren();
            data.backup_codes.forEach(function (c) { list.append(el('li', '', c)); });
            twofaSetup.hidden = true;
            twofaBackup.hidden = false;
        } catch (error) {
            twofaMsg.textContent = error instanceof TypeError ? 'Can\'t reach the server. Try again in a minute.' : error.message;
        } finally {
            button.disabled = false;
        }
    });

    document.getElementById('twofaCancel').addEventListener('click', function () {
        setupCreds = null;
        twofaSetup.hidden = true;
        if (setupFromLogin || !getToken()) { loginForm.hidden = false; } else { dashboard.hidden = false; showTab('security'); }
    });

    document.getElementById('backupCopy').addEventListener('click', async function () {
        const text = Array.from(document.querySelectorAll('#backupList li')).map(function (li) { return li.textContent; }).join('\n');
        try { await navigator.clipboard.writeText(text); this.textContent = '✓ Copied'; } catch (e) { this.textContent = 'Select and copy them by hand'; }
    });

    document.getElementById('backupDone').addEventListener('click', function () {
        twofaBackup.hidden = true;
        document.getElementById('backupList').replaceChildren();   // don't leave the codes on screen
        document.getElementById('backupCopy').textContent = 'Copy codes';
        finishLogin(pendingToken);
        pendingToken = null;
        if (!setupFromLogin) showTab('security');
    });

    // ---------- Security tab: who has two-factor, set up your own, owner can reset ----------
    async function loadSecurity() {
        const msg = document.getElementById('secMsg');
        msg.textContent = '';
        try {
            const st = await api('/admin/2fa/status');
            document.getElementById('secRequired').textContent = st.required
                ? 'Required: every admin must use a code from their authenticator app to log in.'
                : 'Optional for now. Once everyone has it on, set ADMIN_2FA_REQUIRED=true on Render to make it required.';
            const list = document.getElementById('secList');
            list.replaceChildren();
            st.admins.forEach(function (a) {
                const li = el('li');
                li.append(el('span', 'who', a.username + (a.username === st.you ? ' (you)' : '')),
                          el('span', a.on ? 'sec-on' : 'sec-off', a.on ? '✓ On · ' + a.backup_codes_left + ' backup codes left' : 'Off'));
                if (st.owner && a.on) {
                    let codeBox = null;
                    if (a.username === st.you) {
                        codeBox = el('input'); codeBox.type = 'text'; codeBox.inputMode = 'numeric'; codeBox.placeholder = 'Current code';
                        codeBox.maxLength = 20; codeBox.setAttribute('aria-label', 'Current code to reset your own two-factor');
                        li.append(codeBox);
                    }
                    li.append(confirmButton('Reset', 'Click again: ' + a.username + ' sets it up again at next login', 'danger', async function () {
                        await postJson('/admin/2fa/reset/' + encodeURIComponent(a.username), { code: codeBox ? codeBox.value.trim() : null });
                        if (a.username === st.you) { logout('Your two-factor was reset. Log in to set it up again.'); return; }
                        loadSecurity();
                    }));
                }
                list.append(li);
            });
            const me = st.admins.find(function (a) { return a.username === st.you; });
            document.getElementById('secSetupBox').hidden = !me || me.on;
            loadWatch();
        } catch (error) {
            if (error.message !== 'logged out') msg.textContent = 'Couldn\'t load security settings: ' + error.message;
        }
    }

    // ---------- request watch: flagged requests, each with its fingerprint drawn as a square wave ----------
    async function loadWatch() {
        const list = document.getElementById('watchList'), stats = document.getElementById('watchStats');
        try {
            const data = await api('/admin/request-watch');
            const s = data.stats || {};
            stats.textContent = 'Last 7 days: ' + (s.seen || 0) + ' requests watched, ' + (s.flagged || 0) + ' flagged, ' +
                (s.labeled || 0) + ' marked by you. Certification votes so far: ' + (s.cert_votes || 0) + '.';
            list.replaceChildren();
            if (!data.items.length) { list.append(el('li', 'watch-sum', 'Nothing flagged. 👍')); return; }
            data.items.forEach(function (it) {
                const li = el('li');
                const top = el('div', 'watch-top');
                top.append(el('span', 'who', it.endpoint),
                           el('span', 'watch-p' + (it.p_suspicious < 0.6 ? ' low' : ''), Math.round(it.p_suspicious * 100) + '% unusual'),
                           el('span', 'watch-sum', new Date(it.at).toLocaleString() + ' · visitor ' + it.visitor));
                const wave = el('div', 'watch-wave');
                wave.title = 'Fingerprint: ' + it.wave;
                it.wave.split('').forEach(function (b) { wave.append(el('span', b === '1' ? 'on' : '')); });
                li.append(top, wave, el('div', 'watch-sum', it.summary + (it.signals.length ? ' · ' + it.signals.join(', ') : '')));
                const row = el('div', 'watch-top');
                if (it.label) row.append(el('span', 'watch-label', 'Marked: ' + it.label));
                ['normal', 'suspicious'].forEach(function (label) {
                    if (label === it.label) return;
                    const b = el('button', 'small-btn' + (label === 'normal' ? ' go' : ''), label === 'normal' ? 'Fine' : 'Suspicious');
                    b.type = 'button';
                    b.addEventListener('click', async function () {
                        b.disabled = true;
                        try { await postJson('/admin/request-watch/' + it.id + '/label', { label: label }); loadWatch(); }
                        catch (error) { b.disabled = false; if (error.message !== 'logged out') stats.textContent = error.message; }
                    });
                    row.append(b);
                });
                li.append(row);
                list.append(li);
            });
        } catch (error) {
            if (error.message !== 'logged out') stats.textContent = 'Couldn\'t load the request watch: ' + error.message;
        }
    }

    document.getElementById('secStart').addEventListener('click', async function () {
        const msg = document.getElementById('secMsg');
        msg.textContent = '';
        try {
            const st = await api('/admin/2fa/status');
            await startTwofaSetup({ username: st.you, password: document.getElementById('secPassword').value }, false);
            document.getElementById('secPassword').value = '';
        } catch (error) {
            if (error.message !== 'logged out') msg.textContent = error instanceof TypeError ? 'Can\'t reach the server.' : error.message;
        }
    });

    function logout(message) {
        setToken(null);
        codeWrap.hidden = true;
        loginCode.value = '';
        showTab('orders');
        dashboard.hidden = true;
        loginForm.hidden = false;
        loginMsg.textContent = message || '';
    }

    document.getElementById('logoutButton').addEventListener('click', function () { logout(); });

    // ---------- tabs ----------
    function showTab(name) {
        const panels = { orders: ['tabOrders', 'ordersPanel', 'Orders'], customers: ['tabCustomers', 'customersPanel', 'Customers'],
                         news: ['tabNews', 'newsPanel', 'Newsletter'],
                         ainews: ['tabAiNews', 'aiNewsPanel', 'AI News'], hydro: ['tabHydro', 'hydroPanel', 'Hydro Cart'],
                         social: ['tabSocial', 'socialPanel', 'Social'], security: ['tabSecurity', 'securityPanel', 'Security'] };
        Object.keys(panels).forEach(function (k) {
            document.getElementById(panels[k][0]).classList.toggle('active', k === name);
            document.getElementById(panels[k][1]).hidden = k !== name;
        });
        const inGroup = ['customers', 'news', 'ainews'].indexOf(name) !== -1;
        document.getElementById('tabCustomerGroup').classList.toggle('active', inGroup);
        document.getElementById('tabCustomerSub').textContent = inGroup && name !== 'customers' ? ': ' + panels[name][2] : '';
        closeCustomerMenu(false);
        document.getElementById('adminTitle').textContent = panels[name][2];
        // tabs loaded in the last minute (e.g. fetched in the background at login) open instantly
        if (name === 'news' && !fresh('news')) loadSubscribers();
        if (name === 'customers' && !fresh('customers')) loadCustomers();
        if (name === 'ainews') anShowList();
        if (name === 'security') loadSecurity();
        if (name === 'social' && !fresh('social')) loadSocial();
        document.querySelector('main').classList.toggle('wide', name === 'hydro');
        if (name === 'hydro') window.HydroAdmin.start();
        else if (window.HydroAdmin) window.HydroAdmin.stop();
    }
    document.getElementById('tabOrders').addEventListener('click', function () { showTab('orders'); });
    document.getElementById('tabHydro').addEventListener('click', function () { showTab('hydro'); });
    document.getElementById('tabCustomers').addEventListener('click', function () { showTab('customers'); });

    // Customers menu (Customer list, Newsletter, AI News)
    var groupBtn = document.getElementById('tabCustomerGroup'), customerMenu = document.getElementById('customerMenu');
    function menuItems() { return Array.from(customerMenu.querySelectorAll('[role=menuitem]')); }
    function openCustomerMenu() {
        customerMenu.hidden = false; groupBtn.setAttribute('aria-expanded', 'true');
        (customerMenu.querySelector('.active') || menuItems()[0]).focus();
    }
    function closeCustomerMenu(refocus) {
        if (!customerMenu || customerMenu.hidden) return;
        customerMenu.hidden = true; groupBtn.setAttribute('aria-expanded', 'false');
        if (refocus) groupBtn.focus();
    }
    groupBtn.addEventListener('click', function () { customerMenu.hidden ? openCustomerMenu() : closeCustomerMenu(true); });
    groupBtn.addEventListener('keydown', function (e) { if (e.key === 'ArrowDown') { e.preventDefault(); openCustomerMenu(); } });
    customerMenu.addEventListener('keydown', function (e) {
        const items = menuItems(), i = items.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeCustomerMenu(true); }
        else if (e.key === 'Tab') closeCustomerMenu(false);
    });
    document.addEventListener('click', function (e) { if (!e.target.closest('.tab-group')) closeCustomerMenu(false); });
    document.getElementById('tabNews').addEventListener('click', function () { showTab('news'); });
    document.getElementById('tabAiNews').addEventListener('click', function () { showTab('ainews'); });
    document.getElementById('tabSecurity').addEventListener('click', function () { showTab('security'); });
    document.getElementById('tabSocial').addEventListener('click', function () { showTab('social'); });
    document.getElementById('refreshButton').addEventListener('click', loadOrders);

    // keyboard shortcuts: 1-7 switch tabs (when you're not typing); they're also in the Ctrl/⌘ K menu
    const TAB_KEYS = [['orders', 'Orders'], ['customers', 'Customers'], ['news', 'Newsletter'], ['ainews', 'AI News'], ['hydro', 'Hydro Cart'], ['security', 'Security'], ['social', 'Social']];
    TAB_KEYS.forEach(function (t, i) {
        const ids = { orders: 'tabOrders', customers: 'tabCustomers', news: 'tabNews', ainews: 'tabAiNews', hydro: 'tabHydro', security: 'tabSecurity', social: 'tabSocial' };
        const b = document.getElementById(ids[t[0]]);
        if (b) { b.title = t[1] + ' (press ' + (i + 1) + ')'; b.setAttribute('aria-keyshortcuts', String(i + 1)); }
    });
    document.addEventListener('keydown', function (e) {
        if (dashboard.hidden || e.metaKey || e.ctrlKey || e.altKey) return;
        const t = e.target;
        if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= TAB_KEYS.length) { e.preventDefault(); showTab(TAB_KEYS[n - 1][0]); }
    });
    window.uxReady.then(function (UX) {
        UX.addCommands(TAB_KEYS.map(function (t, i) {
            return { g: 'Admin', t: t[1] + ' tab', hint: String(i + 1), run: function () { if (!dashboard.hidden) showTab(t[0]); } };
        }).concat([{ g: 'Admin', t: 'Refresh orders', run: function () { if (!dashboard.hidden) { showTab('orders'); loadOrders(); } } }]));
    }).catch(function () {});

    // When the dashboard opens, every tab's data is requested at the same time instead of
    // one tab at a time, so switching tabs afterwards doesn't wait on the server.
    const loadedAt = {};
    function fresh(name) { const ok = Date.now() - (loadedAt[name] || 0) < 60000; loadedAt[name] = Date.now(); return ok; }
    function showDashboard() {
        loginForm.hidden = true;
        dashboard.hidden = false;
        loadOrders();
        fresh('social'); fresh('customers'); fresh('news');
        loadSocial(); loadCustomers(); loadSubscribers();
        if (location.hash === '#social') showTab('social');      // back from connecting TikTok
    }

    // ---------- Social: daily view targets per platform (1 = met, 0 = missed) + the outlook ----------
    const SOCIAL_RESULT = { 'tiktok-connected': 'TikTok is connected. Its daily views start after two morning checks.',
        'tiktok-cancelled': 'TikTok connection was cancelled.', 'tiktok-expired': 'That TikTok link expired. Try Connect TikTok again.',
        'tiktok-failed': 'TikTok didn\'t accept the connection. Check the app settings and try again.' };
    async function loadSocial() {
        const msg = document.getElementById('socMsg');
        const result = new URLSearchParams(location.search).get('social');
        if (SOCIAL_RESULT[result]) {          // show the TikTok result once, then tidy the address bar
            msg.textContent = SOCIAL_RESULT[result];
            history.replaceState(null, '', location.pathname + '#social');
        }
        try {
            const s = await api('/admin/social');
            MatchChart.update(s.platforms);
            document.getElementById('socToday').textContent = s.bitstream;
            document.getElementById('socToday').title = s.bitstream_days.join(' · ') + ' (oldest first). Each group: TikTok, LinkedIn, YouTube, Instagram.';
            document.getElementById('socTodayDays').textContent = 'TikTok · LinkedIn · YouTube · Instagram, ' + s.bitstream_days[0].slice(5) + ' to ' + s.bitstream_days[2].slice(5);
            const grid = document.getElementById('socGrid'); grid.replaceChildren();
            const conn = document.getElementById('socConn'); conn.replaceChildren();
            s.platforms.forEach(function (p) {
                const row = el('div', 'soc-row');
                const name = el('div', 'soc-name', p.label);
                const st = p.settings, WHY = { 'usual day': 'from your usual day', followers: 'from followers', minimum: 'your minimum', fixed: 'fixed' };
                const barLine = el('small', 'soc-bar'); barLine.append('bar today: ', el('b', null, p.bar_today.toLocaleString()));
                barLine.title = (st.mode === 'auto' ? 'Auto' : 'Fixed') + ' · ' + WHY[p.bar_why];
                const editBtn = el('button', 'small-btn', 'Edit bar'); editBtn.type = 'button';
                editBtn.setAttribute('aria-expanded', 'false');
                name.append(barLine, el('small', null, st.mode === 'auto' ? 'Auto · ' + WHY[p.bar_why] : 'Fixed number'), editBtn);
                const bits = el('div', 'soc-bits');
                p.days.forEach(function (d) {
                    const b = el('span', d.bit === 1 ? 'b1' : d.bit === 0 ? 'b0' : '', d.bit === null ? '·' : String(d.bit));
                    b.title = d.day + ': ' + (d.views === null ? 'no number' : d.views.toLocaleString() + ' views' + (d.source === 'manual' ? ' (typed)' : d.source === 'email' ? ' (emailed report)' : '')) +
                              ' · bar ' + d.bar.toLocaleString();
                    bits.append(b);
                });
                const side = el('div', 'soc-side');
                side.append(el('div', null, p.streak ? p.streak + '-day streak' : 'no streak'),
                            el('div', null, p.week_known ? 'last 7 days: ' + Math.round(p.week_rate * 100) + '% met' : 'last 7 days: no data'));
                const o = p.outlook, line = el('div');
                if (o.ready) { line.append('next ' + s.ahead_days + ' days: '); line.append(el('b', null, '~' + Math.round(o.predicted * 100) + '% likely')); }
                else line.textContent = 'outlook: still learning (' + o.learned + '/10 days)';
                side.append(line);
                row.append(name, bits, side, socEditor(p, editBtn, msg)); grid.append(row);

                const li = el('li');
                li.append(el('span', 'who', p.label),
                          el('span', p.connected || p.emailed ? 'sec-on' : 'sec-off',
                             p.connected ? '✓ Automatic (API)' : p.emailed ? "✓ Grok's email" :
                             p.key === 'youtube' ? 'Not connected' : "Waiting for Grok's email"));
                if (!p.connected && p.key !== 'youtube')
                    li.append(el('span', 'watch-sum', p.last_email_day ? 'numbers up to ' + p.last_email_day : 'every 3 days at 9 PM'));
                if (p.key === 'tiktok' && p.can_connect) {
                    const b = el('button', 'small-btn', p.connected ? 'Reconnect TikTok' : 'Connect TikTok'); b.type = 'button';
                    b.addEventListener('click', async function () {
                        try { location.href = (await api('/admin/social/tiktok/connect')).url; }
                        catch (e) { if (e.message !== 'logged out') msg.textContent = e.message; }
                    });
                    li.append(b);
                }
                if (p.key === 'instagram' && p.connected) {
                    const b = el('button', 'small-btn', p.connected ? 'Replace token' : 'Add token'); b.type = 'button';
                    b.addEventListener('click', function () { document.getElementById('socIgBox').hidden = false; document.getElementById('socIgToken').focus(); });
                    li.append(b);
                }
                if (p.key === 'youtube' && !p.connected) li.append(el('span', 'watch-sum', 'add YOUTUBE_API_KEY + YOUTUBE_CHANNEL_ID on Render'));
                conn.append(li);
            });
            document.getElementById('socRun').textContent = s.last_run
                ? 'Last check: ' + new Date(s.last_run.at).toLocaleString() + ' · ' +
                  Object.keys(s.last_run.report).filter(function (k) { return k !== 'sbss_learned_days'; })
                      .map(function (k) { return k + ': ' + s.last_run.report[k]; }).join(' · ')
                : 'No check has run yet. It runs every morning, or press Check now.';
            const dayBox = document.getElementById('socDay');
            if (!dayBox.value) { const y = new Date(Date.now() - 86400000); dayBox.value = y.toLocaleDateString('en-CA'); }
        } catch (error) {
            if (error.message !== 'logged out') msg.textContent = 'Couldn\'t load social stats: ' + error.message;
        }
    }
    // ---------- current vs best stretch: two step functions, the current one coloured by how well it matches ----------
    const MatchChart = (function () {
        const NS = 'http://www.w3.org/2000/svg', H = 280, L = 52, R = 12, T = 14, B = 30;
        let W = 720;                        // set to the chart's real width before each draw, so text never stretches
        function fit() {
            W = Math.max(300, Math.round(svg.getBoundingClientRect().width) || 720);
            svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
            grad.setAttribute('x2', W - R); hit.setAttribute('width', W - L - R);
        }
        const RED = [255, 90, 90], AMBER = [240, 168, 48], GREEN = [157, 255, 122], BEST = '#7ee96f';
        const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
        const svg = document.getElementById('matchSvg'), tip = document.getElementById('matchTip');
        let platforms = [], key = null, shown = null, anim = 0;
        function mk(tag, attrs, parent) { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); if (parent) parent.append(n); return n; }
        function mix(a, b, t) { return a.map(function (v, i) { return Math.round(v + (b[i] - v) * t); }); }
        // red at 50% or less, amber at 70%, neon green at 90%+, blended in between
        function rgb(m) {
            if (m === null || m === undefined) return [120, 130, 122];
            if (m <= 0.5) return RED;
            if (m < 0.7) return mix(RED, AMBER, (m - 0.5) / 0.2);
            if (m < 0.9) return mix(AMBER, GREEN, (m - 0.7) / 0.2);
            return GREEN;
        }
        function css(c) { return 'rgb(' + c.join(',') + ')'; }
        function word(m) { return m === null ? 'no numbers to compare yet' : m >= 0.9 ? 'close to its best' : m >= 0.7 ? 'decent match' : 'well below its best'; }
        function niceMax(v) { if (v <= 0) return 10; const p = Math.pow(10, Math.floor(Math.log10(v))); return [1, 2, 2.5, 5, 10].map(function (k) { return k * p; }).find(function (n) { return n >= v; }); }
        function fmt(n) { return n === null || n === undefined ? '–' : Math.round(n).toLocaleString(); }
        const layers = {};
        ['grid', 'best', 'bar', 'cur', 'hover'].forEach(function (k) { layers[k] = mk('g', {}, svg); });
        const defs = mk('defs', {}, svg); svg.insertBefore(defs, svg.firstChild);
        const grad = mk('linearGradient', { id: 'matchGrad', gradientUnits: 'userSpaceOnUse', x1: L, x2: W - R, y1: 0, y2: 0 }, defs);
        const bestFill = mk('path', { fill: BEST, 'fill-opacity': '0.10', stroke: 'none' }, layers.best);
        const bestLine = mk('path', { fill: 'none', stroke: BEST, 'stroke-width': 2, 'stroke-dasharray': '6 4', 'stroke-linejoin': 'round' }, layers.best);
        const barLine = mk('path', { fill: 'none', stroke: '#e8ece8', 'stroke-opacity': '0.7', 'stroke-width': 1, 'stroke-dasharray': '1 3' }, layers.bar);
        const curLine = mk('path', { fill: 'none', stroke: 'url(#matchGrad)', 'stroke-width': 3, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, layers.cur);
        const hair = mk('line', { y1: T, y2: H - B, stroke: '#e8ece8', 'stroke-opacity': '0.35', 'stroke-width': 1, visibility: 'hidden' }, layers.hover);
        const dot = mk('circle', { r: 5, stroke: '#0b100c', 'stroke-width': 2, visibility: 'hidden' }, layers.hover);
        const hit = mk('rect', { x: L, y: T, width: W - L - R, height: H - T - B, fill: 'transparent', tabindex: '0',
                                 'aria-label': 'Chart: use left and right arrow keys to read each day' }, svg);
        // what's drawn: numbers per day (current, best, bar, match), tweened between platforms
        function target(p) {
            return { cur: p.days.map(function (d) { return d.views; }), best: p.days.map(function (d) { return d.best; }),
                     bar: p.days.map(function (d) { return d.bar; }), match: p.days.map(function (d) { return d.match; }),
                     max: niceMax(1.1 * Math.max.apply(null, [1].concat(p.days.map(function (d) { return Math.max(d.views || 0, d.best || 0, d.bar || 0); })))) };
        }
        function lerp(a, b, t) { return (a === null || b === null) ? (t < 0.5 ? a : b) : a + (b - a) * t; }
        function blend(a, b, t) {
            return { cur: b.cur.map(function (v, i) { return lerp(a.cur[i], v, t); }), best: b.best.map(function (v, i) { return lerp(a.best[i], v, t); }),
                     bar: b.bar.map(function (v, i) { return lerp(a.bar[i], v, t); }), match: b.match.map(function (v, i) { return lerp(a.match[i], v, t); }),
                     max: lerp(a.max, b.max, t) };
        }
        function draw(f) {
            const n = f.cur.length, step = (W - L - R) / n, x = function (i) { return L + i * step; },
                  y = function (v) { return H - B - (v / f.max) * (H - T - B); };
            function stepPath(vals, close) {      // a step function: flat across each day, gaps where unknown
                let d = '', open = false, first = null, last = null;
                vals.forEach(function (v, i) {
                    if (v === null || v === undefined) { open = false; return; }
                    d += (open ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1) + 'L' + x(i + 1).toFixed(1) + ' ' + y(v).toFixed(1);
                    if (first === null) first = i; last = i; open = true;
                });
                if (close && first !== null) d = 'M' + x(first) + ' ' + y(0) + d.replace(/^M/, 'L') + 'L' + x(last + 1) + ' ' + y(0) + 'Z';
                return d;
            }
            layers.grid.replaceChildren();
            for (let k = 0; k <= 4; k++) {
                const v = f.max * k / 4;
                mk('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: '#1e2a20', 'stroke-width': 1 }, layers.grid);
                mk('text', { x: L - 8, y: y(v) + 4, 'text-anchor': 'end' }, layers.grid).textContent = fmt(v);
            }
            bestFill.setAttribute('d', f.best.some(function (v) { return v !== null; }) ? stepPath(f.best.map(function (v) { return v === null ? null : v; }), true) : '');
            bestLine.setAttribute('d', stepPath(f.best));
            barLine.setAttribute('d', stepPath(f.bar));
            curLine.setAttribute('d', stepPath(f.cur));
            grad.replaceChildren();                 // a colour stop in the middle of each day, so colours blend smoothly across the steps
            f.match.forEach(function (m, i) {
                mk('stop', { offset: ((i + 0.5) / n).toFixed(4), 'stop-color': css(rgb(m)) }, grad);
            });
        }
        function labels(p) {
            const n = p.days.length, step = (W - L - R) / n;
            layers.grid.querySelectorAll('.xl').forEach(function (t) { t.remove(); });
            p.days.forEach(function (d, i) {
                if (i % 2 && i !== n - 1) return;
                const t = mk('text', { x: L + (i + 0.5) * step, y: H - 10, 'text-anchor': 'middle', class: 'xl' }, layers.grid);
                t.textContent = d.day.slice(5).replace('-', '/');
            });
        }
        function render() {
            const p = platforms.find(function (q) { return q.key === key; });
            if (!p) return;
            const to = target(p), from = shown || to, start = performance.now(), dur = reduce || !shown ? 0 : 500;
            cancelAnimationFrame(anim);
            (function frame(now) {
                const t = dur ? Math.min(1, (now - start) / dur) : 1, e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
                shown = blend(from, to, e); fit(); draw(shown); labels(p);
                if (t < 1) anim = requestAnimationFrame(frame);
            })(start);
            const m = p.match, pct = document.getElementById('matchPct');
            pct.textContent = m === null ? '–' : Math.round(m * 100) + '%';
            pct.style.color = m === null ? '' : css(rgb(m));
            document.getElementById('matchWord').textContent = (m === null ? '' : 'of best · ') + word(m);
            document.getElementById('matchBestDates').textContent = p.best_start ? '(from ' + p.best_start.slice(5).replace('-', '/') + ')' : '(not enough history yet)';
            document.getElementById('matchTitle').textContent = p.label + ': current 14 days vs best stretch, ' + (m === null ? 'no match yet' : Math.round(m * 100) + '% match');
            const rows = document.getElementById('matchRows'); rows.replaceChildren();
            p.days.forEach(function (d) {
                const tr = el('tr');
                [d.day, fmt(d.views), fmt(d.best), d.match === null ? '–' : Math.round(d.match * 100) + '%', fmt(d.bar)].forEach(function (v) { tr.append(el('td', null, v)); });
                rows.append(tr);
            });
            hideTip();
        }
        function showTip(i) {
            const p = platforms.find(function (q) { return q.key === key; }); if (!p || !shown) return;
            const d = p.days[i], n = p.days.length, step = (W - L - R) / n, cx = L + (i + 0.5) * step;
            const box = svg.getBoundingClientRect(), sx = box.width / W;
            hair.setAttribute('x1', cx); hair.setAttribute('x2', cx); hair.setAttribute('visibility', 'visible');
            if (d.views !== null) {
                dot.setAttribute('cx', cx); dot.setAttribute('cy', H - B - (d.views / shown.max) * (H - T - B));
                dot.setAttribute('fill', css(rgb(d.match))); dot.setAttribute('visibility', 'visible');
            } else dot.setAttribute('visibility', 'hidden');
            tip.replaceChildren();
            tip.append(el('div', null, new Date(d.day + 'T12:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })));
            function row(color, value, label, dashed) {
                const r = el('div'), k = el('span', 'k'); k.style.borderTopColor = color; if (dashed) k.style.borderTopStyle = 'dashed';
                r.append(k, el('b', null, value), ' ' + label); tip.append(r);
            }
            row(css(rgb(d.match)), fmt(d.views), 'current');
            row(BEST, fmt(d.best), 'best stretch', true);
            row('#e8ece8', fmt(d.bar), 'bar', true);
            tip.append(el('div', null, d.match === null ? 'no match (missing numbers)' : Math.round(d.match * 100) + '% match · ' + word(d.match)));
            tip.hidden = false;
            const left = cx * sx + 14, wide = tip.offsetWidth;
            tip.style.left = Math.max(0, Math.min(left, box.width - wide - 4) - (left + wide > box.width ? wide + 28 : 0)) + 'px';
            active = i;
        }
        function hideTip() { tip.hidden = true; hair.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); active = -1; }
        let active = -1;
        function dayAt(clientX) {
            const p = platforms.find(function (q) { return q.key === key; }); if (!p) return -1;
            const box = svg.getBoundingClientRect(), xv = (clientX - box.left) * W / box.width;
            return Math.max(0, Math.min(p.days.length - 1, Math.floor((xv - L) / ((W - L - R) / p.days.length))));
        }
        hit.addEventListener('pointermove', function (e) { showTip(dayAt(e.clientX)); });
        hit.addEventListener('pointerleave', hideTip);
        hit.addEventListener('blur', hideTip);
        hit.addEventListener('keydown', function (e) {
            const p = platforms.find(function (q) { return q.key === key; }); if (!p) return;
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault();
                showTip(Math.max(0, Math.min(p.days.length - 1, (active < 0 ? p.days.length : active) + (e.key === 'ArrowRight' ? 1 : -1))));
            } else if (e.key === 'Escape') hideTip();
        });
        let resizeTimer = 0;
        window.addEventListener('resize', function () {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function () { if (shown && !svg.closest('[hidden]')) { fit(); draw(shown); const p = platforms.find(function (q) { return q.key === key; }); if (p) labels(p); hideTip(); } }, 120);
        });
        function pick(k) {
            key = k;
            try { localStorage.setItem('matchPlatform', k); } catch (e) {}
            document.querySelectorAll('#matchChips button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.key === k)); });
            render();
        }
        return {
            update: function (list) {
                platforms = list;
                const chips = document.getElementById('matchChips');
                if (!chips.children.length) list.forEach(function (p) {
                    const b = el('button', null, p.label); b.type = 'button'; b.dataset.key = p.key;
                    b.addEventListener('click', function () { pick(p.key); }); chips.append(b);
                });
                let saved = null; try { saved = localStorage.getItem('matchPlatform'); } catch (e) {}
                pick(key || (list.some(function (p) { return p.key === saved; }) ? saved : list[0].key));
            }
        };
    })();

    // the bar editor for one platform: fixed number, or auto (grows with your usual day and followers)
    function socEditor(p, btn, msg) {
        const st = p.settings, box = el('div', 'soc-edit' + (st.mode === 'fixed' ? ' fixed' : ''));
        box.hidden = true;
        function field(label, input, cls) { const l = el('label', cls || null, label); l.append(input); box.append(l); return input; }
        function num(v, min, max) { const i = el('input'); i.type = 'number'; i.min = min; i.max = max; i.value = v; return i; }
        const mode = el('select'); mode.innerHTML = '<option value="auto">Auto (grows)</option><option value="fixed">Fixed number</option>';
        mode.value = st.mode;
        field('Mode', mode);
        const min = field('Minimum views a day', num(st.threshold, 0, 100000000));
        const growth = field('% of your usual day', num(st.growth_pct, 50, 500), 'auto-only');
        const per1k = field('Views per 1,000 followers (0 = off)', num(st.per_1k, 0, 1000), 'auto-only');
        const win = field('Usual day looks back (days)', num(st.window_days, 7, 90), 'auto-only');
        const pool = el('select'); pool.innerHTML = '<option value="1">Each day on its own</option><option value="3">Last 3 days together</option>';
        pool.value = String(st.pool_days);
        field('Count views', pool);
        mode.addEventListener('change', function () { box.classList.toggle('fixed', mode.value === 'fixed'); });
        const facts = [];
        facts.push(p.usual_day !== null ? 'Usual day (last 28): ' + Math.round(p.usual_day).toLocaleString() + ' views' : 'Usual day: needs a few more days of numbers');
        facts.push(p.followers !== null ? 'Followers: ' + p.followers.toLocaleString() + ' (' + p.followers_day + ')' : 'Followers: none recorded yet');
        facts.push(p.suggested !== null ? 'Suggested minimum: ' + p.suggested.toLocaleString() + ' (beaten on about 60% of recent days)' : 'Suggested minimum: after 7 days of numbers');
        box.append(el('p', 'hint', facts.join(' · ')));
        box.append(el('p', 'hint', '"Last 3 days together": a day is a 1 when it and the 2 days before add up to 3 times its bar, so a post whose views build slowly still counts. ' +
                                    'Auto: the bar each day is the highest of your minimum, that % of your usual day, and views per 1,000 followers. ' +
                                    'Saving a change makes the outlook relearn from your stored numbers.'));
        const row = el('div', 'stage-row');
        const sug = el('button', 'small-btn', 'Use suggestion'); sug.type = 'button'; sug.disabled = p.suggested === null;
        sug.addEventListener('click', function () { min.value = p.suggested; });
        const save = el('button', 'small-btn go', 'Save'); save.type = 'button';
        save.addEventListener('click', async function () {
            save.disabled = true;
            try {
                const r = await postJson('/admin/social/threshold', { platform: p.key, mode: mode.value, threshold: Number(min.value),
                    growth_pct: Number(growth.value), per_1k: Number(per1k.value), window_days: Number(win.value), pool_days: Number(pool.value) });
                msg.textContent = r.relearning ? p.label + ' bar saved. The outlook is relearning with it.' : 'Nothing changed.';
                loadSocial();
            } catch (e) { if (e.message !== 'logged out') msg.textContent = e.message; save.disabled = false; }
        });
        row.append(sug, save); box.append(row);
        btn.addEventListener('click', function () {
            box.hidden = !box.hidden; btn.setAttribute('aria-expanded', String(!box.hidden));
            if (!box.hidden) mode.focus();
        });
        return box;
    }
    document.getElementById('socPasteSave').addEventListener('click', async function () {
        const box = document.getElementById('socPaste'), out = document.getElementById('socPasteMsg'), btn = this;
        if (box.value.indexOf('SOCIAL-REPORT') === -1) { out.textContent = 'No SOCIAL-REPORT lines in that.'; return; }
        btn.disabled = true; out.textContent = 'Adding…';
        try {
            const r = await postJson('/admin/social/report', { text: box.value });
            const n = r.days || 1;
            out.textContent = 'Added ' + n + ' day' + (n === 1 ? '' : 's') + '.' +
                              (r.sbss_learned_days ? ' SBSS learned from ' + r.sbss_learned_days + ' more days.' : '');
            box.value = ''; loadSocial();
        } catch (e) { if (e.message !== 'logged out') out.textContent = e.message; }
        btn.disabled = false;
    });
    document.getElementById('socSave').addEventListener('click', async function () {
        const msg = document.getElementById('socMsg'), kind = document.getElementById('socKind').value;
        try {
            const body = { platform: document.getElementById('socPlat').value, day: document.getElementById('socDay').value };
            body[kind] = Number(document.getElementById('socViews').value);
            await postJson(kind === 'followers' ? '/admin/social/followers' : '/admin/social/views', body);
            document.getElementById('socViews').value = ''; msg.textContent = 'Saved.'; loadSocial();
        } catch (e) { if (e.message !== 'logged out') msg.textContent = e.message; }
    });
    document.getElementById('socIgSave').addEventListener('click', async function () {
        const msg = document.getElementById('socMsg'), box = document.getElementById('socIgToken');
        try {
            await postJson('/admin/social/instagram-token', { token: box.value.trim() });
            box.value = ''; document.getElementById('socIgBox').hidden = true; msg.textContent = 'Instagram is connected.'; loadSocial();
        } catch (e) { if (e.message !== 'logged out') msg.textContent = e.message; }
    });
    document.getElementById('socRunNow').addEventListener('click', async function () {
        const btn = this; btn.disabled = true;
        try { await postJson('/admin/social/run', {}); loadSocial(); }
        catch (e) { if (e.message !== 'logged out') document.getElementById('socMsg').textContent = e.message; }
        finally { btn.disabled = false; }
    });

    // ---------- newsletter: subscribers + sending ----------
    let subscribers = [];
    const nlMsg = document.getElementById('nlMsg'), nlOk = document.getElementById('nlOk');
    const nlSend = document.getElementById('nlSendButton');

    async function loadSubscribers() {
        nlMsg.textContent = '';
        try {
            subscribers = await api('/admin/subscribers');
        } catch (error) {
            if (error.message !== 'logged out') nlMsg.textContent = 'Couldn\'t load subscribers: ' + error.message;
            return;
        }
        const active = subscribers.filter(function (x) { return !x.unsubscribed_at; });
        document.getElementById('nlCount').textContent = active.length + ' subscribed' +
            (subscribers.length > active.length ? ' · ' + (subscribers.length - active.length) + ' unsubscribed' : '');
        nlSend.textContent = 'Send to all ' + active.length + ' subscribers';
        const rows = document.getElementById('nlRows');
        rows.textContent = '';
        subscribers.forEach(function (x) {
            const tr = document.createElement('tr');
            if (x.unsubscribed_at) tr.className = 'gone';
            [x.first_name + ' ' + x.last_name, x.email, new Date(x.opted_in_at).toLocaleDateString()].forEach(function (v) {
                const td = document.createElement('td'); td.textContent = v; tr.appendChild(td);   // textContent = safe
            });
            rows.appendChild(tr);
        });
    }

    document.getElementById('nlRefreshButton').addEventListener('click', loadSubscribers);

    document.getElementById('nlCsvButton').addEventListener('click', function () {
        const cell = function (v) { v = String(v == null ? '' : v); if (/^[=+\-@]/.test(v)) v = "'" + v;   // stop spreadsheet formulas
                                     return '"' + v.replace(/"/g, '""') + '"'; };
        const lines = [['First name', 'Last name', 'Email', 'Joined', 'Unsubscribed'].map(cell).join(',')];
        subscribers.forEach(function (x) {
            lines.push([x.first_name, x.last_name, x.email, x.opted_in_at, x.unsubscribed_at || ''].map(cell).join(','));
        });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/csv' }));
        link.download = 'subscribers-' + new Date().toISOString().slice(0, 10) + '.csv';
        link.click();
        URL.revokeObjectURL(link.href);
    });

    // ---------- the PDF: read in this browser tab only, sent with the request, then forgotten ----------
    const nlPdf = document.getElementById('nlPdf'), nlPdfRemove = document.getElementById('nlPdfRemove');
    const nlPdfInfo = document.getElementById('nlPdfInfo'), pdfHelp = nlPdfInfo.textContent;
    let pdfFile = null;
    nlPdf.addEventListener('change', function () {
        nlMsg.textContent = '';
        const f = nlPdf.files[0] || null;
        if (f && !/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') { clearPdf(); nlMsg.textContent = 'That file isn\'t a PDF.'; return; }
        if (f && f.size > 8 * 1024 * 1024) { clearPdf(); nlMsg.textContent = 'That PDF is over 8 MB. Export a smaller one.'; return; }
        pdfFile = f;
        nlPdfRemove.hidden = !f;
        nlPdfInfo.textContent = f ? 'Attached: ' + f.name + ' (' + (f.size / 1048576).toFixed(1) + ' MB). It will be sent, then removed from this page.' : pdfHelp;
    });
    function clearPdf() { pdfFile = null; nlPdf.value = ''; nlPdfRemove.hidden = true; nlPdfInfo.textContent = pdfHelp; }
    nlPdfRemove.addEventListener('click', clearPdf);
    function readBase64(file) {
        return new Promise(function (resolve, reject) {
            const reader = new FileReader();
            reader.onload = function () { resolve(String(reader.result).split(',')[1]); };   // drop "data:...;base64,"
            reader.onerror = function () { reject(new Error('Couldn\'t read that PDF. Choose it again.')); };
            reader.readAsDataURL(file);
        });
    }

    async function sendNewsletter(testTo) {
        nlMsg.textContent = ''; nlOk.textContent = '';
        const subject = document.getElementById('nlSubject').value.trim();
        const body = document.getElementById('nlBody').value;
        if (!pdfFile && body.trim().length < 10) { nlMsg.textContent = 'Write the message or attach a PDF first.'; return; }
        const payload = { subject: subject, body: body };
        if (testTo) payload.test_to = testTo;
        if (pdfFile) {
            try { payload.pdf_base64 = await readBase64(pdfFile); payload.pdf_name = pdfFile.name; }
            catch (error) { nlMsg.textContent = error.message; return; }
        }
        nlOk.textContent = testTo ? 'Sending test...' :
            pdfFile ? 'Sending with the PDF, one email at a time (about 2 a second). Keep this tab open...' : 'Sending...';
        try {
            const response = await fetch(API_BASE + '/admin/newsletter', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + memoryToken, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (response.status === 401 || response.status === 403) { logout('Your login expired. Please log in again.'); return; }
            const data = await response.json().catch(function () { return {}; });
            if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Server error (' + response.status + ')');
            nlOk.textContent = (data.test ? 'Test sent to ' + testTo + '. Check your inbox.' :
                'Sent to ' + data.sent + ' subscriber' + (data.sent === 1 ? '' : 's') + '.') +
                (data.failed ? ' ' + data.failed + ' failed (see Render logs).' : '');
            if (!data.test) {               // done: clear everything so it's ready for next time
                const hadPdf = !!pdfFile;
                clearPdf();
                document.getElementById('nlSubject').value = '';
                document.getElementById('nlBody').value = '';
                if (hadPdf) nlOk.textContent += ' The PDF has been removed. Ready for next time.';
            }
        } catch (error) {
            nlOk.textContent = '';
            nlMsg.textContent = error instanceof TypeError ? 'Can\'t reach the server. Try again in a minute.' : error.message;
        }
    }

    document.getElementById('nlTestButton').addEventListener('click', function () {
        const to = document.getElementById('nlTestTo').value.trim();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) { nlMsg.textContent = 'Enter the email to send the test to.'; return; }
        sendNewsletter(to);
    });

    // sending to everyone takes two clicks, so it can't happen by accident
    let armTimer = null;
    nlSend.addEventListener('click', function () {
        if (!nlSend.classList.contains('armed')) {
            nlSend.classList.add('armed');
            nlSend.dataset.label = nlSend.textContent;
            nlSend.textContent = 'Click again to send for real';
            armTimer = setTimeout(function () { nlSend.classList.remove('armed'); nlSend.textContent = nlSend.dataset.label; }, 5000);
            return;
        }
        clearTimeout(armTimer);
        nlSend.classList.remove('armed'); nlSend.textContent = nlSend.dataset.label;
        nlSend.disabled = true;
        sendNewsletter(null).finally(function () { nlSend.disabled = false; });
    });

    // ---------- AI NEWS editor ----------
    // Everything typed here is plain text: it's shown with textContent, and the server rejects HTML/scripts.
    const AN = { id: null, status: 'draft' };
    const $ = function (id) { return document.getElementById(id); };

    async function anRequest(method, path, body) {
        const response = await fetch(API_BASE + path, {
            method: method,
            headers: Object.assign({ 'Authorization': 'Bearer ' + memoryToken },
                                   body ? { 'Content-Type': 'application/json' } : {}),
            body: body ? JSON.stringify(body) : undefined
        });
        if (response.status === 401 || response.status === 403) { logout('Your login expired. Please log in again.'); throw new Error('logged out'); }
        const data = await response.json().catch(function () { return {}; });
        if (!response.ok) {
            const err = new Error('Server error (' + response.status + ')');
            err.list = anErrorList(data.detail);
            throw err;
        }
        return data;
    }

    // turn the server's validation details into readable lines like "Article 2 url: must start with https://"
    function anErrorList(detail) {
        if (typeof detail === 'string') return [detail];
        if (!Array.isArray(detail)) return ['Something went wrong.'];
        return detail.map(function (d) {
            const loc = (d.loc || []).filter(function (x) { return x !== 'body'; });
            let where = '';
            if (loc[0] === 'articles' && typeof loc[1] === 'number') where = 'Article ' + (loc[1] + 1) + (loc[2] ? ' ' + loc[2] : '');
            else where = loc.join(' ');
            return (where ? where + ': ' : '') + String(d.msg || '').replace(/^Value error, /, '');
        });
    }

    function anShowErrors(listId, lines) {
        const ul = $(listId); ul.textContent = '';
        (lines || []).forEach(function (t) { const li = document.createElement('li'); li.textContent = t; ul.appendChild(li); });
    }

    function anFmtDay(iso) { const p = String(iso).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
    function anFmtStamp(ts) { return ts ? new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''; }

    function anView(which) {
        $('anListView').hidden = which !== 'list';
        $('anImportView').hidden = which !== 'import';
        $('anEditView').hidden = which !== 'edit';
    }

    // ----- list
    async function anShowList() {
        anView('list'); $('anListMsg').textContent = '';
        let rows;
        try { rows = await anRequest('GET', '/admin/news'); }
        catch (e) { if (e.message !== 'logged out') $('anListMsg').textContent = 'Couldn\'t load editions: ' + (e.list || [e.message]).join(' '); return; }
        $('anCount').textContent = rows.length + ' edition' + (rows.length === 1 ? '' : 's') + ' · ' +
            rows.filter(function (r) { return r.status === 'published'; }).length + ' published';
        const tb = $('anList'); tb.textContent = '';
        if (!rows.length) {
            const tr = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = 5;
            td.textContent = 'No editions yet. Click "New edition" or "Import JSON".'; tr.appendChild(td); tb.appendChild(tr);
        }
        rows.forEach(function (r) {
            const tr = document.createElement('tr');
            const week = document.createElement('td');
            week.textContent = anFmtDay(r.week_start) + ' – ' + anFmtDay(r.week_end) + (r.title ? ' · ' + r.title : '');
            const st = document.createElement('td'); const badge = document.createElement('span');
            badge.className = 'an-status ' + r.status; badge.textContent = r.status.toUpperCase(); st.appendChild(badge);
            const n = document.createElement('td'); n.textContent = r.article_count;
            const who = document.createElement('td');
            who.textContent = (r.status === 'published' && r.published_by ? 'Published by ' + r.published_by + ' · ' : '') +
                              'Edited by ' + r.updated_by + ', ' + anFmtStamp(r.updated_at);
            const act = document.createElement('td'); const b = document.createElement('button');
            b.className = 'small-btn'; b.type = 'button'; b.textContent = 'Edit';
            b.addEventListener('click', function () { anOpen(r.id); });
            act.appendChild(b);
            [week, st, n, who, act].forEach(function (x) { tr.appendChild(x); });
            tb.appendChild(tr);
        });
    }
    $('anRefreshButton').addEventListener('click', anShowList);
    $('anBackButton').addEventListener('click', anShowList);

    // ----- editor
    function anArticleCard(a) {
        a = a || {};
        const box = document.createElement('div'); box.className = 'an-art';
        const top = document.createElement('div'); top.className = 'an-art-top';
        const label = document.createElement('strong'); top.appendChild(label);
        [['↑', -1, 'Move up'], ['↓', 1, 'Move down']].forEach(function (m) {
            const b = document.createElement('button'); b.type = 'button'; b.className = 'small-btn'; b.textContent = m[0];
            b.setAttribute('aria-label', m[2]);
            b.addEventListener('click', function () {
                const sib = m[1] < 0 ? box.previousElementSibling : box.nextElementSibling;
                if (sib) { m[1] < 0 ? box.parentNode.insertBefore(box, sib) : box.parentNode.insertBefore(sib, box); anNumber(); }
            });
            top.appendChild(b);
        });
        const del = document.createElement('button'); del.type = 'button'; del.className = 'small-btn'; del.textContent = 'Remove';
        del.addEventListener('click', function () { box.remove(); anNumber(); });
        top.appendChild(del);
        box.appendChild(top);
        const fields = [['headline', 'HEADLINE', 'input', 200], ['publisher', 'PUBLISHER', 'input', 100],
                        ['published_on', 'PUBLISHED ON', 'date', 0], ['url', 'LINK TO THE ORIGINAL (https://)', 'url', 2000],
                        ['summary', 'SHORT SUMMARY IN OUR OWN WORDS', 'textarea', 600],
                        ['why_it_matters', 'WHY IT MATTERS (OPTIONAL)', 'textarea', 300]];
        fields.forEach(function (f) {
            const lab = document.createElement('label'); lab.textContent = f[1];
            const inp = document.createElement(f[2] === 'textarea' ? 'textarea' : 'input');
            if (f[2] === 'date') inp.type = 'date'; else if (f[2] === 'url') inp.type = 'url'; else if (f[2] === 'input') inp.type = 'text';
            if (f[3]) inp.maxLength = f[3];
            inp.dataset.field = f[0]; inp.value = a[f[0]] || '';
            const id = 'an_' + f[0] + '_' + Math.random().toString(36).slice(2); inp.id = id; lab.htmlFor = id;
            box.appendChild(lab); box.appendChild(inp);
        });
        return box;
    }
    function anNumber() {
        Array.prototype.forEach.call($('anArticles').children, function (box, i) {
            box.querySelector('.an-art-top strong').textContent = 'Article ' + (i + 1);
        });
    }
    $('anAddArticle').addEventListener('click', function () { $('anArticles').appendChild(anArticleCard()); anNumber(); });

    function anFill(ed) {
        AN.id = ed.id || null; AN.status = ed.status || 'draft';
        $('anStart').value = ed.week_start || ''; $('anEnd').value = ed.week_end || ''; $('anTitle').value = ed.title || '';
        const list = $('anArticles'); list.textContent = '';
        (ed.articles || []).forEach(function (a) { list.appendChild(anArticleCard(a)); });
        if (!list.children.length) list.appendChild(anArticleCard());
        anNumber();
        $('anPreview').textContent = ''; $('anOk').textContent = ''; anShowErrors('anErrors', []);
        anButtons();
        const hist = $('anHistory'); hist.textContent = '';
        (ed.history || []).forEach(function (h) {
            const li = document.createElement('li');
            li.textContent = anFmtStamp(h.at) + ': ' + h.action + ' by ' + h.admin + (h.detail ? ' (' + h.detail + ')' : '');
            hist.appendChild(li);
        });
        $('anHistoryBox').hidden = !(ed.history && ed.history.length);
        anView('edit');
    }

    function anButtons() {
        const pub = AN.status === 'published';
        $('anEditLabel').textContent = AN.id ? 'Edition #' + AN.id + ' · ' + (pub ? 'PUBLISHED (changes go live when saved)' : 'DRAFT (not public)') : 'New edition · not saved yet';
        $('anSaveButton').textContent = pub ? 'Save changes (live)' : 'Save draft';
        $('anPublishButton').hidden = pub;
        $('anUnpublishButton').hidden = !pub;
        $('anDeleteButton').hidden = pub || !AN.id;
    }

    function anCollect() {
        const articles = Array.prototype.map.call($('anArticles').children, function (box) {
            const a = {};
            box.querySelectorAll('[data-field]').forEach(function (inp) { a[inp.dataset.field] = inp.value.trim(); });
            if (!a.why_it_matters) delete a.why_it_matters;
            return a;
        }).filter(function (a) { return Object.keys(a).some(function (k) { return a[k]; }); });   // skip blank cards
        const ed = { week_start: $('anStart').value, week_end: $('anEnd').value, articles: articles };
        const title = $('anTitle').value.trim(); if (title) ed.title = title;
        return ed;
    }

    function anPreviewInto(target, ed) {
        target.textContent = '';
        const wrap = document.createElement('div'); wrap.className = 'an-preview';
        const h = document.createElement('h3'); h.textContent = 'Preview: This Week’s AI News'; wrap.appendChild(h);
        const meta = document.createElement('p'); meta.className = 'pv-src';
        meta.textContent = 'Week of ' + anFmtDay(ed.week_start) + ' – ' + anFmtDay(ed.week_end) + (ed.title ? ' · ' + ed.title : '');
        wrap.appendChild(meta);
        (ed.articles || []).forEach(function (a) {
            const item = document.createElement('div'); item.className = 'pv-item';
            const link = document.createElement('a'); link.textContent = a.headline + ' ↗';
            link.href = a.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; item.appendChild(link);
            const src = document.createElement('p'); src.className = 'pv-src'; src.textContent = a.publisher + ' · ' + anFmtDay(a.published_on); item.appendChild(src);
            const sum = document.createElement('p'); sum.textContent = a.summary; item.appendChild(sum);
            if (a.why_it_matters) { const w = document.createElement('p'); w.className = 'pv-why'; w.textContent = 'Why it matters: ' + a.why_it_matters; item.appendChild(w); }
            wrap.appendChild(item);
        });
        target.appendChild(wrap);
    }

    // every action checks the edition on the server first, so the preview shows exactly what would be saved
    async function anValidate() {
        anShowErrors('anErrors', []); $('anOk').textContent = '';
        try { return await anRequest('POST', '/admin/news/validate', anCollect()); }
        catch (e) { if (e.message !== 'logged out') anShowErrors('anErrors', e.list || [e.message]); return null; }
    }

    $('anPreviewButton').addEventListener('click', async function () {
        const ed = await anValidate(); if (ed) { anPreviewInto($('anPreview'), ed); $('anOk').textContent = 'Looks good. This is how it will appear.'; }
    });

    async function anSave() {
        const ed = await anValidate(); if (!ed) return false;
        try {
            const r = AN.id ? await anRequest('PUT', '/admin/news/' + AN.id, ed) : await anRequest('POST', '/admin/news', ed);
            AN.id = r.id; AN.status = r.status;
            return true;
        } catch (e) { if (e.message !== 'logged out') anShowErrors('anErrors', e.list || [e.message]); return false; }
    }

    async function anOpen(id, note) {
        try { const ed = await anRequest('GET', '/admin/news/' + id); anFill(ed); if (note) $('anOk').textContent = note; }
        catch (e) { if (e.message !== 'logged out') $('anListMsg').textContent = (e.list || [e.message]).join(' '); }
    }

    $('anSaveButton').addEventListener('click', async function () {
        if (await anSave()) anOpen(AN.id, AN.status === 'published' ? 'Saved. The live page now shows these changes.' : 'Draft saved. It is not public.');
    });
    $('anPublishButton').addEventListener('click', async function () {
        if (!(await anSave())) return;
        try { await anRequest('POST', '/admin/news/' + AN.id + '/publish'); anOpen(AN.id, 'Published! It’s now on the AI Education page.'); }
        catch (e) { if (e.message !== 'logged out') anShowErrors('anErrors', e.list || [e.message]); }
    });
    $('anUnpublishButton').addEventListener('click', async function () {
        try { await anRequest('POST', '/admin/news/' + AN.id + '/unpublish'); anOpen(AN.id, 'Unpublished. It’s a draft again and no longer public.'); }
        catch (e) { if (e.message !== 'logged out') anShowErrors('anErrors', e.list || [e.message]); }
    });
    let anDelArmed = null;
    $('anDeleteButton').addEventListener('click', async function () {
        const b = $('anDeleteButton');
        if (!anDelArmed) { b.textContent = 'Click again to delete'; anDelArmed = setTimeout(function () { b.textContent = 'Delete draft'; anDelArmed = null; }, 5000); return; }
        clearTimeout(anDelArmed); anDelArmed = null; b.textContent = 'Delete draft';
        try { await anRequest('DELETE', '/admin/news/' + AN.id); anShowList(); }
        catch (e) { if (e.message !== 'logged out') anShowErrors('anErrors', e.list || [e.message]); }
    });

    $('anNewButton').addEventListener('click', function () {
        // default to this Monday-Sunday
        const t = new Date(), mon = new Date(t.getFullYear(), t.getMonth(), t.getDate() - ((t.getDay() + 6) % 7));
        const iso = function (d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
        anFill({ week_start: iso(mon), week_end: iso(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6)), articles: [] });
    });

    // ----- import
    let anImported = null;
    $('anImportButton').addEventListener('click', function () {
        anImported = null; $('anImportLoad').hidden = true; $('anImportPreview').textContent = ''; anShowErrors('anImportErrors', []);
        anView('import');
    });
    $('anImportCancel').addEventListener('click', anShowList);
    $('anImportCheck').addEventListener('click', async function () {
        anImported = null; $('anImportLoad').hidden = true; $('anImportPreview').textContent = ''; anShowErrors('anImportErrors', []);
        let parsed;
        try { parsed = JSON.parse($('anImportText').value); }
        catch (e) { anShowErrors('anImportErrors', ['That isn’t valid JSON: ' + e.message + '. Compare it with the template below.']); return; }
        try {
            anImported = await anRequest('POST', '/admin/news/validate', parsed);
            if (!anImported.articles.length) { anShowErrors('anImportErrors', ['The JSON has no articles.']); anImported = null; return; }
            anPreviewInto($('anImportPreview'), anImported);
            $('anImportLoad').hidden = false;
        } catch (e) { if (e.message !== 'logged out') anShowErrors('anImportErrors', e.list || [e.message]); }
    });
    $('anImportLoad').addEventListener('click', function () {
        if (!anImported) return;
        anFill(anImported);   // a NEW, unsaved edition: review it, then Save draft or Publish
        $('anOk').textContent = 'Imported. Review it, then Save draft or Publish.';
    });

    // ---------- show the orders ----------
    // skeleton cards while a list loads for the first time (later refreshes keep the old list until the new one arrives)
    function skeletons(list, n) {
        if (list.children.length) return;
        for (let i = 0; i < n; i++) { const s = el('div', 'skeleton skeleton-card'); s.setAttribute('aria-hidden', 'true'); list.append(s); }
    }

    async function loadOrders() {
        dashMsg.textContent = '';
        skeletons(orderList, 3);
        if (document.getElementById('splitBox').hidden) loadDefaultSplit();
        try {
            const orders = await api('/admin/orders');
            document.getElementById('orderCount').textContent =
                orders.length + ' order' + (orders.length === 1 ? '' : 's') + ' · ' +
                orders.filter(function (o) { return o.status !== 'complete' && o.status !== 'cancelled'; }).length + ' open';
            orderList.replaceChildren();
            if (!orders.length) {
                const p = document.createElement('p');
                p.className = 'empty';
                p.textContent = 'No orders yet.';
                orderList.append(p);
            }
            orders.forEach(function (order) { orderList.append(orderCard(order)); });
        } catch (error) {
            if (error.message !== 'logged out') dashMsg.textContent = 'Couldn\'t load orders: ' + error.message;
        }
    }

    // small helper: make an element with some text (textContent keeps it safe)
    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    // send a change (status and/or quote) for one order
    function patchOrder(order, changes) {
        return api('/admin/orders/' + order.id, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(changes)
        });
    }

    function orderCard(order) {
        const card = el('article', 'order ' + order.status);

        const top = el('div', 'order-top');
        const title = el('h3', '', order.name + ' · ');
        title.append(el('span', 'code', order.confirmation));
        if (order.paid_at) title.append(el('span', 'paid-badge', 'Paid ' + new Date(order.paid_at).toLocaleDateString()));
        top.append(title, el('span', 'when', new Date(order.created_at).toLocaleString()));

        const meta = el('p', 'meta', order.service + ' · ');
        const email = el('a', '', order.email);
        email.href = 'mailto:' + order.email;
        meta.append(email);

        const details = el('p', 'details', order.details);

        // status dropdown: new -> in progress -> complete
        const status = el('select');
        status.setAttribute('aria-label', 'Status');
        [['new', 'New'], ['in_progress', 'In progress'], ['complete', 'Complete'], ['cancelled', 'Cancelled']].forEach(function (pair) {
            const option = el('option', '', pair[1]);
            option.value = pair[0];
            option.selected = order.status === pair[0];
            option.disabled = pair[0] === 'cancelled';   // use the Cancel project button instead
            status.append(option);
        });
        status.disabled = order.status === 'cancelled';
        // optimistic: the card changes right away; if the server says no, it changes back
        status.addEventListener('change', async function () {
            const before = order.status, next = status.value;
            card.className = 'order ' + next;
            try {
                await patchOrder(order, { status: next });
                order.status = next;
            } catch (error) {
                status.value = before;
                card.className = 'order ' + before;
                if (error.message !== 'logged out') dashMsg.textContent = 'Couldn\'t update ' + order.confirmation + ': ' + error.message;
            }
        });

        // quote: type dollars, Save -> the customer gets a "your quote is ready" email
        const quoteBox = el('div', 'quote-box');
        const quoteInput = el('input');
        quoteInput.type = 'number';
        quoteInput.min = '0';
        quoteInput.step = '0.01';
        quoteInput.placeholder = 'Quote $';
        quoteInput.setAttribute('aria-label', 'Quote in dollars');
        if (order.quote_cents !== null) quoteInput.value = (order.quote_cents / 100).toFixed(2);
        const saveQuote = el('button', 'small-btn', order.quote_cents === null ? 'Save quote' : 'Update quote');
        saveQuote.type = 'button';
        const saved = el('span', 'saved');
        saveQuote.addEventListener('click', async function () {
            const dollars = parseFloat(quoteInput.value);
            if (isNaN(dollars) || dollars < 0) {
                saved.textContent = 'Enter an amount';
                return;
            }
            try {
                await patchOrder(order, { quote: dollars });
                saveQuote.textContent = 'Update quote';
                saved.textContent = '✓ Saved, customer emailed';
                loadOrders();   // show the new plan
            } catch (error) {
                if (error.message !== 'logged out') dashMsg.textContent = 'Couldn\'t save the quote: ' + error.message;
            }
        });
        quoteBox.append(el('span', '', '$'), quoteInput, saveQuote, saved);
        if (order.paid_at) {   // a paid quote can't change (the server refuses too)
            quoteInput.disabled = true;
            saveQuote.disabled = true;
            saveQuote.textContent = 'Paid';
        }

        // delete (for spam/tests): the card disappears right away with an Undo button for 6 seconds;
        // the order is only deleted on the server once that time is up
        const del = el('button', 'delete-btn', 'Delete');
        del.type = 'button';
        let timer;
        del.addEventListener('click', async function () {
            if (window.UX && UX.toast) {
                card.hidden = true;
                UX.toast('Order ' + order.confirmation + ' deleted.', {
                    undo: function () { card.hidden = false; },
                    onCommit: async function () {
                        try {
                            await api('/admin/orders/' + order.id, { method: 'DELETE', keepalive: true });
                            card.remove();
                            loadOrders();   // update the count
                        } catch (error) {
                            card.hidden = false;
                            if (error.message !== 'logged out') dashMsg.textContent = 'Couldn\'t delete ' + order.confirmation + ': ' + error.message;
                        }
                    }
                });
                return;
            }
            if (!del.classList.contains('confirm')) {
                del.classList.add('confirm');
                del.textContent = 'Click again to delete';
                timer = setTimeout(function () {
                    del.classList.remove('confirm');
                    del.textContent = 'Delete';
                }, 4000);
                return;
            }
            clearTimeout(timer);
            try {
                await api('/admin/orders/' + order.id, { method: 'DELETE' });
                card.remove();
                loadOrders();   // update the count
            } catch (error) {
                if (error.message !== 'logged out') dashMsg.textContent = 'Couldn\'t delete ' + order.confirmation + ': ' + error.message;
            }
        });

        const actions = el('div', 'order-actions');
        actions.append(status, quoteBox, del);

        // a cancelled order's quote can't change (the server refuses too)
        if (order.status === 'cancelled') {
            quoteInput.disabled = true;
            saveQuote.disabled = true;
            saveQuote.textContent = 'Cancelled';
        }

        card.append(top, meta, details, actions, editDetailsBox(order), agreementBox(order), stagesBox(order));
        return card;
    }

    // ---------- payment stages: each stage bills its part when you move the project into it ----------
    const money = function (cents) { return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 }); };
    const STATE_TEXT = { paid: '✓ Paid', due: '● Due', no_charge: 'No charge', upcoming: 'Upcoming' };

    // a button that needs a second click: the first click says exactly what will happen
    function confirmButton(label, confirmText, className, action) {
        const button = el('button', 'small-btn ' + (className || ''), label);
        button.type = 'button';
        let timer;
        button.addEventListener('click', async function () {
            if (!button.classList.contains('confirm')) {
                button.classList.add('confirm');
                button.textContent = typeof confirmText === 'function' ? confirmText() : confirmText;
                timer = setTimeout(function () { button.classList.remove('confirm'); button.textContent = label; }, 5000);
                return;
            }
            clearTimeout(timer);
            button.disabled = true;
            try {
                await action();
            } catch (error) {
                button.disabled = false;
                button.classList.remove('confirm');
                button.textContent = label;
                if (error.message !== 'logged out') dashMsg.textContent = error.message;
            }
        });
        return button;
    }

    const postJson = function (path, body, method) {
        return api(path, { method: method || 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    };

    function stagesBox(order) {
        const box = el('div', 'stages');
        const plan = order.plan || [];
        const row = el('div', 'stage-row');
        if (!plan.length) {
            row.append(el('span', 'hint', 'Set a quote to see the payment stages.'));
            box.append(row, changesBox(order));
            return box;
        }
        const chips = el('div', 'stage-chips');
        plan.forEach(function (p) {
            const chip = el('div', 'stage-chip ' + p.state);
            chip.append(el('strong', '', p.name + ' · ' + p.percent + '%'), el('span', '', money(p.amount_cents) + ' '),
                        el('span', 'state', STATE_TEXT[p.state]));
            if (p.refunded_cents) chip.append(el('span', 'refunded', 'Refunded ' + money(p.refunded_cents)));
            if (p.due_at) chip.append(el('span', 'due-date', 'Due ' + new Date(p.due_at).toLocaleDateString()));
            chips.append(chip);
        });
        box.append(chips);

        const cancelled = order.status === 'cancelled';
        const due = plan.find(function (p) { return p.state === 'due'; });
        const next = plan.find(function (p) { return p.state === 'upcoming'; });
        const msg = el('span', 'hint');
        if (cancelled) {
            msg.textContent = 'Cancelled ' + new Date(order.cancelled_at).toLocaleDateString() + '. Paid stages can still be refunded.';
            row.append(msg);
        } else if (due) {
            msg.textContent = 'Waiting on the ' + due.name + ' payment (' + money(due.amount_cents) + ').';
            const remind = el('button', 'small-btn', 'Send payment reminder');
            remind.type = 'button';
            remind.addEventListener('click', async function () {
                remind.disabled = true;
                try {
                    await api('/admin/orders/' + order.id + '/remind', { method: 'POST' });
                    remind.textContent = '✓ Reminder sent';
                } catch (error) {
                    remind.disabled = false;
                    if (error.message !== 'logged out') dashMsg.textContent = 'Couldn\'t send the reminder: ' + error.message;
                }
            });
            row.append(msg, remind);
        } else if (next) {
            const nextAmount = order.paid_at ? 0 : next.amount_cents;
            const label = (order.stage ? 'Move to ' : 'Start ') + next.name + (nextAmount ? ' & bill ' + money(nextAmount) : '');
            const go = confirmButton(label,
                order.paid_at ? 'Click again: already paid, no email sent'
                : nextAmount ? 'Click again: emails ' + order.name + ' a ' + money(nextAmount) + ' bill'
                : 'Click again: emails ' + order.name + ' an update (no charge)',
                'go', async function () {
                    await api('/admin/orders/' + order.id + '/advance', { method: 'POST' });
                    loadOrders();
                });
            msg.textContent = order.stage ? 'Now in ' + order.stage_name + '.' : 'Not started.';
            row.append(msg, go);
        } else {
            msg.textContent = order.paid_at ? 'All stages done and paid in full. ✓' : 'All stages done.';
            row.append(msg);
        }
        box.append(row);

        // the tools: edit plan, refunds, cancel (closed until you open them)
        const tools = el('details', 'stage-tools');
        tools.append(el('summary', '', cancelled ? 'Refunds' : 'Edit payments, refunds, cancel'));
        if (!cancelled && plan.some(function (p) { return p.state === 'due' || p.state === 'upcoming'; })) {
            tools.append(planEditor(order));   // only unpaid stages can change
        }
        tools.append(refundTools(order));
        if (!cancelled) tools.append(cancelTools(order));
        box.append(tools, changesBox(order));
        return box;
    }

    // orders paid in full before stages existed show every stage "paid" without a payment date
    function paidBeforeStages(order) {
        return (order.plan || []).some(function (p) { return p.state === 'paid' && !p.paid_at; });
    }

    // ----- edit what each unpaid stage costs, by percent or by dollars -----
    function planEditor(order) {
        const wrap = el('div', 'tool');
        wrap.append(el('h4', '', 'Payment plan'));
        const base = order.quote_cents;                     // percents are worked out from the total
        const table = el('div', 'plan-edit');
        const inputs = {};
        const totalLine = el('p', 'hint');
        function total() {
            return order.plan.reduce(function (sum, p) {
                return sum + (inputs[p.stage] ? Math.round(parseFloat(inputs[p.stage].dollars.value || '0') * 100) : p.amount_cents);
            }, 0);
        }
        // every percent is a share of the order's CURRENT total, so the stages add up to 100% exactly when the total
        // stays the same (set Coding to 25% and move another stage to make room)
        function refresh(changedKey) {
            const t = total();
            if (changedKey && base) {      // dollars typed: show that stage's share of the current total
                const cents = Math.round(parseFloat(inputs[changedKey].dollars.value || '0') * 100);
                inputs[changedKey].pct.value = (cents * 100 / base).toFixed(1);
            }
            const pctSum = order.plan.reduce(function (sum, p) {
                return sum + (inputs[p.stage] ? (parseFloat(inputs[p.stage].pct.value) || 0) : (base ? p.amount_cents * 100 / base : p.percent));
            }, 0);
            totalLine.textContent = 'Percents add up to ' + (Math.round(pctSum * 10) / 10) + '%' +
                (Math.abs(pctSum - 100) < 0.05 ? ' ✓' : ' (set them to 100% to keep the same total)') +
                ' · New total: ' + money(t) + (t !== base ? ' (was ' + money(base) + ')' : '');
            totalLine.classList.toggle('warn', Math.abs(pctSum - 100) >= 0.05);
        }
        order.plan.forEach(function (p) {
            const line = el('div', 'plan-line');
            line.append(el('span', 'plan-name', p.name), el('span', 'state-small', STATE_TEXT[p.state]));
            const editable = p.state === 'due' || p.state === 'upcoming';
            if (editable) {
                const pct = el('input'); pct.type = 'number'; pct.min = '0'; pct.max = '100'; pct.step = '0.1';
                pct.setAttribute('aria-label', p.name + ' percent'); pct.value = p.percent;
                const dollars = el('input'); dollars.type = 'number'; dollars.min = '0'; dollars.step = '0.01';
                dollars.setAttribute('aria-label', p.name + ' dollars'); dollars.value = (p.amount_cents / 100).toFixed(2);
                pct.addEventListener('input', function () {   // percent of the current total -> dollars
                    dollars.value = (base * (parseFloat(pct.value) || 0) / 10000).toFixed(2);
                    refresh();
                });
                pct.addEventListener('change', function () { pct.value = (parseFloat(pct.value) || 0).toFixed(1); refresh(); });
                pct.value = base ? (p.amount_cents * 100 / base).toFixed(1) : p.percent;
                dollars.addEventListener('input', function () { refresh(p.stage); });
                inputs[p.stage] = { pct: pct, dollars: dollars };
                const pctBox = el('label', 'unit'); pctBox.append(pct, el('span', '', '%'));
                const dolBox = el('label', 'unit'); dolBox.append(el('span', '', '$'), dollars);
                line.append(pctBox, dolBox);
            } else {
                line.append(el('span', 'fixed', p.percent + '%'), el('span', 'fixed', money(p.amount_cents)));
            }
            table.append(line);
        });
        wrap.append(table, totalLine);
        const due = order.plan.find(function (p) { return p.state === 'due'; });
        let dueInput = null;
        if (due) {
            const label = el('label', 'inline', 'Due date for ' + due.name + ' ');
            dueInput = el('input'); dueInput.type = 'date';
            if (due.due_at) dueInput.value = new Date(due.due_at).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
            label.append(dueInput);
            wrap.append(label);
        }
        const note = el('input'); note.type = 'text'; note.maxLength = 1000; note.placeholder = 'Note for the customer (optional)';
        note.className = 'wide';
        const notify = el('input'); notify.type = 'checkbox'; notify.checked = true;
        const notifyLabel = el('label', 'inline'); notifyLabel.append(notify, ' Email the customer the new plan');
        const saveMsg = el('span', 'saved');
        const save = el('button', 'small-btn go', 'Save plan');
        save.type = 'button';
        save.addEventListener('click', async function () {
            const amounts = {};
            for (const key of Object.keys(inputs)) {
                const cents = Math.round(parseFloat(inputs[key].dollars.value || '0') * 100);
                if (cents < 0 || (cents > 0 && cents < 50)) { saveMsg.textContent = 'Each stage must be $0 or at least $0.50.'; return; }
                amounts[key] = cents;
            }
            save.disabled = true;
            try {
                await postJson('/admin/orders/' + order.id + '/plan', {
                    amounts: amounts, due_date: dueInput && dueInput.value ? dueInput.value : null,
                    notify: notify.checked, note: note.value.trim() || null
                }, 'PUT');
                loadOrders();
            } catch (error) {
                save.disabled = false;
                if (error.message !== 'logged out') saveMsg.textContent = error.message;
            }
        });
        const actions = el('div', 'stage-row');
        actions.append(save, notifyLabel, saveMsg);
        wrap.append(note, actions);
        refresh();
        return wrap;
    }

    // ----- refunds: any amount up to what was paid for that stage -----
    function refundTools(order) {
        const wrap = el('div', 'tool');
        wrap.append(el('h4', '', 'Refunds'));
        const paid = (order.plan || []).filter(function (p) { return p.state === 'paid' && p.paid_at && p.amount_cents > p.refunded_cents; });
        if (!paid.length) {
            wrap.append(el('p', 'hint', paidBeforeStages(order)
                ? 'This order was paid in full before stages existed. Refund it in your Stripe dashboard.'
                : 'Nothing to refund yet.'));
            return wrap;
        }
        paid.forEach(function (p) {
            const line = el('div', 'stage-row');
            const left = p.amount_cents - p.refunded_cents;
            const amount = el('input'); amount.type = 'number'; amount.min = '0.01'; amount.step = '0.01';
            amount.max = (left / 100).toFixed(2); amount.value = (left / 100).toFixed(2);
            amount.setAttribute('aria-label', 'Refund amount for ' + p.name);
            const dol = el('label', 'unit'); dol.append(el('span', '', '$'), amount);
            const button = confirmButton('Refund', function () { return 'Click again: refund $' + parseFloat(amount.value || 0).toFixed(2) + ' to the card'; },
                'danger', async function () {
                    const cents = Math.round(parseFloat(amount.value || '0') * 100);
                    if (!(cents > 0 && cents <= left)) throw new Error('Refund between $0.01 and ' + money(left) + '.');
                    await postJson('/admin/orders/' + order.id + '/refund', { stage: p.stage, amount_cents: cents });
                    loadOrders();
                });
            line.append(el('span', 'plan-name', p.name + ' (paid ' + money(p.amount_cents) + ')'), dol, button);
            wrap.append(line);
        });
        return wrap;
    }

    // ----- cancel: withdraws the payment that's due; paid stages stay paid until refunded -----
    function cancelTools(order) {
        const wrap = el('div', 'tool');
        wrap.append(el('h4', '', 'Cancel project'));
        const note = el('input'); note.type = 'text'; note.maxLength = 1000; note.className = 'wide';
        note.placeholder = 'Reason for the customer (optional, included in the email)';
        const button = confirmButton('Cancel project', 'Click again: cancel and email ' + order.name, 'danger', async function () {
            await postJson('/admin/orders/' + order.id + '/cancel', { note: note.value.trim() || null });
            loadOrders();
        });
        wrap.append(note, button);
        return wrap;
    }

    // ----- change requests from the customer -----
    function changesBox(order) {
        const box = el('div', 'changes');
        const changes = order.changes || [];
        if (!changes.length) return box;
        box.append(el('h4', '', 'Change requests'));
        changes.forEach(function (ch) {
            const item = el('div', 'change ' + ch.status);
            item.append(el('p', 'change-msg', '“' + ch.message + '”'));
            const meta = el('p', 'hint', new Date(ch.created_at).toLocaleString() + ' · ' +
                (ch.status === 'pending' ? 'Waiting for your answer' : ch.status === 'accepted' ? 'Accepted' : 'Declined') +
                (ch.admin_note ? ' · Your note: ' + ch.admin_note : ''));
            item.append(meta);
            if (ch.status === 'pending') {
                const note = el('input'); note.type = 'text'; note.maxLength = 1000; note.className = 'wide';
                note.placeholder = 'Note for the customer (optional). Update the plan first if the price changes.';
                const actions = el('div', 'stage-row');
                ['accepted', 'declined'].forEach(function (decision) {
                    const b = confirmButton(decision === 'accepted' ? 'Accept' : 'Decline',
                        'Click again: email ' + order.name, decision === 'accepted' ? 'go' : 'danger', async function () {
                            await postJson('/admin/orders/' + order.id + '/changes/' + ch.id, { decision: decision, note: note.value.trim() || null });
                            loadOrders();
                        });
                    actions.append(b);
                });
                item.append(note, actions);
            }
            box.append(item);
        });
        return box;
    }

    // ----- your default split for new quotes -----
    async function loadDefaultSplit() {
        const box = document.getElementById('splitBox');
        try {
            const data = await api('/admin/settings/stages');
            const fields = document.getElementById('splitFields');
            fields.replaceChildren();
            data.stages.forEach(function (s) {
                const label = el('label', 'unit');
                const input = el('input'); input.type = 'number'; input.min = '0'; input.max = '100'; input.step = '1';
                input.value = data.percents[s.stage]; input.dataset.stage = s.stage;
                input.setAttribute('aria-label', s.name + ' percent');
                input.addEventListener('input', splitSum);
                label.append(el('span', 'plan-name', s.name), input, el('span', '', '%'));
                fields.append(label);
            });
            splitSum();
            box.hidden = false;
        } catch (error) { /* older server: hide the box */ }
    }
    function splitSum() {
        const inputs = document.querySelectorAll('#splitFields input');
        const sum = Array.from(inputs).reduce(function (s, i) { return s + (parseInt(i.value, 10) || 0); }, 0);
        const msg = document.getElementById('splitMsg');
        msg.textContent = sum === 100 ? 'Adds up to 100%.' : 'Adds up to ' + sum + '%. It needs to be 100%.';
        msg.className = 'hint' + (sum === 100 ? '' : ' warn');
        document.getElementById('splitSave').disabled = sum !== 100;
    }
    document.getElementById('splitSave').addEventListener('click', async function () {
        const percents = {};
        document.querySelectorAll('#splitFields input').forEach(function (i) { percents[i.dataset.stage] = parseInt(i.value, 10) || 0; });
        try {
            await postJson('/admin/settings/stages', { percents: percents }, 'PUT');
            document.getElementById('splitMsg').textContent = '✓ Saved. New quotes use this split.';
        } catch (error) {
            if (error.message !== 'logged out') document.getElementById('splitMsg').textContent = error.message;
        }
    });

    // ---------- edit an order's details (name, email, service, description) ----------
    const SERVICES = ['AI Automation', 'Custom Workflows', 'Custom ML Model', 'AI Education', 'Nonprofit website', 'Other'];

    // ----- service agreement: status, the text, and a button to email the link -----
    function agreementBox(order) {
        const box = el('details', 'stage-tools agreement-tools');
        const info = order.contract || {};
        box.append(el('summary', '', info.signed
            ? 'Agreement ✓ signed by ' + info.signer + ' (' + new Date(info.signed_at).toLocaleDateString() + ')'
            : order.quote_cents === null ? 'Agreement (ready once you set a quote)' : 'Agreement · not signed yet'));
        const tool = el('div', 'tool');
        const doc = el('div', 'agree-doc');
        const msg = el('span', 'saved');
        const send = el('button', 'small-btn', info.signed ? 'Email them the signed copy link' : 'Email them a link to sign');
        send.type = 'button'; send.disabled = order.quote_cents === null;
        send.addEventListener('click', async function () {
            send.disabled = true;
            try { await postJson('/admin/orders/' + order.id + '/contract/send', {}); msg.textContent = 'Sent.'; if (window.UX && UX.toast) UX.toast('Agreement link sent'); }
            catch (error) { if (error.message !== 'logged out') msg.textContent = error.message; }
            send.disabled = false;
        });
        const row = el('div', 'stage-row'); row.append(send, msg);
        tool.append(el('p', 'hint', info.signed
            ? 'This is the exact signed copy, with the signer\'s name, time and document fingerprint. Their IP address is kept in the record but not shown here.'
            : 'This is the current draft, filled in from the quote, payment plan, legal name and scope. The customer signs it on the order page before their first payment.'), doc, row);
        box.append(tool);
        let loaded = false;
        box.addEventListener('toggle', async function () {
            if (!box.open || loaded || order.quote_cents === null) return;
            loaded = true; doc.textContent = 'Loading…';
            try {
                const data = await api('/admin/orders/' + order.id + '/contract');
                doc.innerHTML = data.html;      // our own template; every value is escaped by the server
            } catch (error) { loaded = false; doc.textContent = error.message; }
        });
        return box;
    }

    function editDetailsBox(order) {
        const box = el('details', 'stage-tools edit-details');
        box.append(el('summary', '', 'Edit order details'));
        const form = el('div', 'tool');
        const field = function (label, input) {
            const wrap = el('label', 'edit-field');
            wrap.append(el('span', 'label', label), input);
            form.append(wrap);
            return input;
        };
        const name = field('NAME', el('input')); name.maxLength = 100; name.value = order.name;
        const email = field('EMAIL', el('input')); email.type = 'email'; email.maxLength = 200; email.value = order.email;
        const service = field('SERVICE', el('select'));
        SERVICES.concat(SERVICES.includes(order.service) ? [] : [order.service]).forEach(function (s) {
            const option = el('option', '', s);
            option.selected = s === order.service;
            service.append(option);
        });
        const details = field('PROJECT DETAILS', el('textarea')); details.maxLength = 3000; details.value = order.details;
        const legal = field('LEGAL NAME FOR THE AGREEMENT (BLANK = USE THE NAME ABOVE)', el('input')); legal.maxLength = 200; legal.value = order.legal_name || '';
        const scope = field('FINAL SCOPE FOR THE AGREEMENT (BLANK = USE THE PROJECT DETAILS)', el('textarea')); scope.maxLength = 5000; scope.value = order.scope || '';
        const msg = el('span', 'saved');
        const save = el('button', 'small-btn go', 'Save details');
        save.type = 'button';
        save.addEventListener('click', async function () {
            // send only what changed
            const changes = {};
            if (name.value.trim() !== order.name) changes.name = name.value.trim();
            if (email.value.trim().toLowerCase() !== order.email.toLowerCase()) changes.email = email.value.trim();
            if (service.value !== order.service) changes.service = service.value;
            if (details.value.trim() !== order.details) changes.details = details.value.trim();
            if (legal.value.trim() !== (order.legal_name || '')) changes.legal_name = legal.value.trim();
            if (scope.value.trim() !== (order.scope || '')) changes.scope = scope.value.trim();
            if (!Object.keys(changes).length) { msg.textContent = 'Nothing changed.'; return; }
            if (changes.details !== undefined && changes.details.length < 20) { msg.textContent = 'Project details need at least 20 characters.'; return; }
            save.disabled = true;
            try {
                await postJson('/admin/orders/' + order.id + '/details', changes, 'PATCH');
                loadOrders();
            } catch (error) {
                save.disabled = false;
                if (error.message !== 'logged out') msg.textContent = error.message;
            }
        });
        const row = el('div', 'stage-row');
        row.append(save, msg);
        form.append(row, el('p', 'hint', 'If you change the email, the old address gets a short notice. Legal name and final scope go into the service agreement; once it is signed, the signed copy doesn\'t change.'));
        box.append(form);
        return box;
    }

    // ---------- Customers tab: accounts made with Google or an email link ----------
    async function loadCustomers() {
        const list = document.getElementById('customerList');
        const msg = document.getElementById('customerMsg');
        msg.textContent = '';
        skeletons(list, 3);
        try {
            const customers = await api('/admin/customers');
            document.getElementById('customerCount').textContent = customers.length + (customers.length === 1 ? ' customer' : ' customers');
            list.replaceChildren();
            if (!customers.length) list.append(el('p', 'empty', 'No customer accounts yet.'));
            customers.forEach(function (c) { list.append(customerCard(c)); });
        } catch (error) {
            if (error.message !== 'logged out') msg.textContent = 'Couldn\'t load customers: ' + error.message;
        }
    }

    function customerCard(c) {
        const card = el('article', 'order customer');
        const top = el('div', 'order-top');
        top.append(el('strong', '', c.name || '(no name)'), el('span', 'badge-small', c.google ? 'Google' : 'Email link'));
        const meta = el('p', 'meta', c.email + ' · ' + c.orders + (c.orders === 1 ? ' order' : ' orders') +
            ' · joined ' + new Date(c.created_at).toLocaleDateString() +
            (c.last_login_at ? ' · last sign-in ' + new Date(c.last_login_at).toLocaleDateString() : ''));
        const edit = el('details', 'stage-tools');
        edit.append(el('summary', '', 'Edit customer'));
        const form = el('div', 'tool');
        const nameWrap = el('label', 'edit-field'); const name = el('input'); name.maxLength = 100; name.value = c.name || '';
        nameWrap.append(el('span', 'label', 'NAME'), name);
        const emailWrap = el('label', 'edit-field'); const email = el('input'); email.type = 'email'; email.maxLength = 200; email.value = c.email;
        emailWrap.append(el('span', 'label', 'EMAIL (USED TO SIGN IN)'), email);
        const move = el('input'); move.type = 'checkbox'; move.checked = true;
        const moveLabel = el('label', 'inline'); moveLabel.append(move, ' Also change the email on their orders');
        const msg = el('span', 'saved');
        const save = el('button', 'small-btn go', 'Save customer');
        save.type = 'button';
        save.addEventListener('click', async function () {
            const changes = { update_orders: move.checked };
            if (name.value.trim() !== (c.name || '')) changes.name = name.value.trim();
            if (email.value.trim().toLowerCase() !== c.email) changes.email = email.value.trim();
            if (Object.keys(changes).length === 1) { msg.textContent = 'Nothing changed.'; return; }
            save.disabled = true;
            try {
                await postJson('/admin/customers/' + c.id, changes, 'PATCH');
                loadCustomers();
            } catch (error) {
                save.disabled = false;
                if (error.message !== 'logged out') msg.textContent = error.message;
            }
        });
        const row = el('div', 'stage-row'); row.append(save, msg);
        form.append(nameWrap, emailWrap, moveLabel, row,
            el('p', 'hint', c.google ? 'They sign in with Google, which keeps working after an email change.'
                                     : 'They sign in with email links, which will go to the new address.'));
        edit.append(form);
        card.append(top, meta, edit);
        return card;
    }
    document.getElementById('customerRefresh').addEventListener('click', loadCustomers);

    // already logged in this tab? go straight to the orders
    if (memoryToken) showDashboard();
