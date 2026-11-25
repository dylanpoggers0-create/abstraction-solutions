/* =========================================================
   account.js: sign in or sign up from any page. Loaded by nav.js on every page; styles at the end of style.css.

   - "Sign in" sits next to Menu (top right; bottom left on phones) and at the top of the side menu.
     Both open one small panel with two tabs, Log in and Sign up. There are no passwords: either way
     you get an emailed one-time link, or you continue with Google.
   - You come back to the page you were on:
       Google: you never leave the page; it reloads signed in.
       Email:  the link is made for this page (return_to), so it opens right here and finishes signing in.
   - Signed in, the same button shows your initial and opens your account: email, 8-digit user ID,
     your orders, and Sign out.
   - Signed in, a coin button with your balance sits next to it (the Rewards panel, rewards.js, opens from it).
     window.ASCoins: refresh() reloads the balance; explode()/add() send coins flying into it and count it up.
   The sign-in is the same one the Order page uses (saved in this browser as "asAccount"), so signing in
   here or there counts everywhere. Without JavaScript, the buttons are plain links to the Order page's sign-in.
   ========================================================= */
(function () {
    'use strict';
    if (window.__account) return;
    window.__account = true;

    const API = 'https://abstraction-quote-engine.onrender.com';
    const ACCOUNT_KEY = 'asAccount';
    const ORDERS_SNAP = 'snap:myOrders';
    const MIN = /\.min\.js/.test((document.currentScript || {}).src || '');   // the condensed copy loads condensed copies
    const onOrderPage = /\/order(\.html)?$/.test(location.pathname);   // the Order page runs its own sign-in

    /* ---------- the saved sign-in ---------- */
    function account() {
        try {
            const a = JSON.parse(localStorage.getItem(ACCOUNT_KEY) || 'null');
            if (a && a.token && a.expires * 1000 > Date.now()) return a;
            if (a) localStorage.removeItem(ACCOUNT_KEY);   // expired
        } catch (e) {}
        return null;
    }
    function save(result) {   // { token, customer: { email, name, user_id } }, the same shape the Order page saves
        const a = { token: result.token, email: result.customer.email, name: result.customer.name || '',
                    userId: result.customer.user_id || null, expires: Number(result.token.split('.')[1]) };
        try { localStorage.setItem(ACCOUNT_KEY, JSON.stringify(a)); } catch (e) {}
        return a;
    }
    function signOut() {
        try { localStorage.removeItem(ACCOUNT_KEY); localStorage.removeItem(ORDERS_SNAP); } catch (e) {}
        if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect();
        location.reload();
    }

    /* ---------- the buttons: "Sign in" or your initial ---------- */
    function initial(a) { return ((a.name || a.email || '?').trim().charAt(0) || '?').toUpperCase(); }
    function labels() {
        const a = account();
        document.querySelectorAll('[data-account-open]').forEach(function (b) {
            const text = b.querySelector('[data-account-label]');
            const badge = b.querySelector('.acct-initial');
            if (text) text.textContent = a ? 'Account' : 'Sign in';
            if (badge) { badge.textContent = a ? initial(a) : ''; badge.hidden = !a; }
            b.classList.toggle('is-signed-in', !!a);
            b.setAttribute('aria-label', a ? 'Your account (' + a.email + ')' : 'Sign in or sign up');
        });
        const coin = coinTab();
        if (coin) coin.hidden = !a;
        document.documentElement.classList.toggle('has-coins', !!a);
        // signed in (here, on the Order page, or in another tab) as someone whose balance isn't loaded yet:
        // show the last number this browser saw for them, then ask the server
        if (a && coinsFor !== a.email) {
            coinsFor = a.email;
            let c = null;
            try { c = JSON.parse(localStorage.getItem(COINS_KEY) || 'null'); } catch (e) {}
            showCoins(c && c.u === a.email ? c.b : 0);
            loadRewards(true);
        }
        if (!a) coinsFor = null;
        fitTitle();
    }
    // keep the Menu button and this one side by side, whatever the Menu button's width
    function place() {
        const tab = document.querySelector('.side-tab');
        if (tab) document.documentElement.style.setProperty('--menu-w', Math.round(tab.getBoundingClientRect().width) + 'px');
        const acct = document.querySelector('.acct-tab');
        if (acct) document.documentElement.style.setProperty('--acct-w', Math.round(acct.getBoundingClientRect().width) + 'px');
        fitTitle();
    }
    /* Keep the big title clear of the buttons on its right. The CSS size is a good guess; this measures what's
       really there (the buttons' widths change with the balance and the Account label) and shrinks the title
       if it would run under them. float.js locks each letter's width, so after a change it's asked to re-lock. */
    let fitT = 0, measurer = null;
    function fitTitle() {
        cancelAnimationFrame(fitT);
        fitT = requestAnimationFrame(function () {
            const name = document.querySelector('.brand-name'), box = document.querySelector('.header-container');
            if (!name || !box) return;
            const before = name.style.getPropertyValue('font-size') + (name.classList.contains('is-two-line') ? '2' : '');
            name.style.removeProperty('font-size');
            name.classList.remove('is-two-line');
            let size = '', two = false, maxWord = 0;
            if (innerWidth > 700) {
                const btns = ['.side-tab', '.acct-tab', '.coin-tab'].map(function (s) { return document.querySelector(s); })
                    .filter(function (b) { return b && !b.hidden && b.offsetWidth; });
                const edge = Math.min.apply(null, btns.map(function (b) { return b.getBoundingClientRect().left; }).concat([innerWidth]));
                const cs = getComputedStyle(name), fs = parseFloat(cs.fontSize);
                // the name's natural width at the CSS size (its letters may be locked to an older size)
                if (!measurer) { measurer = document.createElement('span'); measurer.setAttribute('aria-hidden', 'true');
                                 measurer.style.cssText = 'position:absolute;left:-9999px;top:0;white-space:nowrap;visibility:hidden'; document.body.appendChild(measurer); }
                ['fontFamily', 'fontSize', 'fontWeight', 'fontStretch', 'letterSpacing', 'textTransform'].forEach(function (k) { measurer.style[k] = cs[k]; });
                if (!name.dataset.text) name.dataset.text = (name.getAttribute('aria-label') || name.textContent).replace(/\s+/g, ' ').trim();   // never glitch letters
                function width(t) { measurer.textContent = t; return measurer.getBoundingClientRect().width; }
                const natural = width(name.dataset.text);
                const longest = Math.max.apply(null, name.dataset.text.split(' ').map(width));
                maxWord = longest / fs;                                   // the longest word's width per px of font size
                const nr = name.getBoundingClientRect(), br = box.getBoundingClientRect();
                const others = br.width - nr.width;                         // the logo and the gap beside the name
                const room = edge - 36 - br.left - others;
                if (room > 0) {
                    // as big as fits (up to the CSS cap of 5.4rem), on one line if that's still a good size
                    const cap = 5.4 * parseFloat(getComputedStyle(document.documentElement).fontSize);
                    const one = Math.min(cap, fs * room / natural);
                    if (one >= 26) size = Math.floor(one) + 'px';
                    else { two = true; size = Math.max(16, Math.floor(Math.min(cap, 40, fs * room / longest))) + 'px'; }   // too small on one line: two lines
                }
            }
            if (size) name.style.setProperty('font-size', size, 'important');
            // the three buttons sit on the logo's centre line (they're pinned, so this is for the top of the page)
            const logo = box.querySelector('img');
            if (innerWidth > 700 && logo) {
                const lr = logo.getBoundingClientRect(), mid = lr.top + window.scrollY + lr.height / 2;
                const h = (document.querySelector('.side-tab') || {}).offsetHeight || 46;
                document.documentElement.style.setProperty('--bar-top', Math.max(16, Math.min(60, Math.round(mid - h / 2))) + 'px');
            } else document.documentElement.style.removeProperty('--bar-top');
            name.classList.toggle('is-two-line', two);
            name.style.maxWidth = two ? Math.ceil(maxWord * parseFloat(size) + 6) + 'px' : '';
            if (size + (two ? '2' : '') !== before) window.dispatchEvent(new Event('resize'));  // float.js re-locks the letters
        });
    }

    /* ---------- the panel ---------- */
    let panel = null, opener = null, tab = 'login', googleConfig = null;
    function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

    function build() {
        panel = el('div', 'acct-backdrop');
        panel.hidden = true;
        panel.innerHTML =
            '<div class="acct-panel" role="dialog" aria-modal="true" aria-labelledby="acctTitle">' +
                '<button type="button" class="acct-close" aria-label="Close">' +
                    '<svg viewBox="0 0 24 24" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' +
                '<div class="acct-out">' +
                    '<div class="acct-tabs" role="tablist" aria-label="Log in or sign up">' +
                        '<button type="button" role="tab" id="acctTabLogin" aria-controls="acctBody" data-tab="login">Log in</button>' +
                        '<button type="button" role="tab" id="acctTabSignup" aria-controls="acctBody" data-tab="signup">Sign up</button>' +
                    '</div>' +
                    '<div id="acctBody" role="tabpanel">' +
                        '<h2 class="acct-title" id="acctTitle"></h2>' +
                        '<p class="acct-sub" id="acctSub"></p>' +
                        '<form class="acct-form" novalidate>' +
                            '<label for="acctEmail">Email</label>' +
                            '<input id="acctEmail" type="email" autocomplete="email" inputmode="email" required maxlength="200" placeholder="you@example.com">' +
                            '<button type="submit" class="acct-primary">Email me a sign-in link</button>' +
                        '</form>' +
                        '<div class="acct-google" hidden><div class="acct-or"><span>or</span></div><div class="acct-gbtn"></div></div>' +
                        '<p class="acct-msg" role="status" aria-live="polite"></p>' +
                        '<p class="acct-fine">No password needed. We email you a link that signs you in and brings you back to this page. ' +
                            '<a href="' + base() + 'privacy.html">Privacy</a></p>' +
                    '</div>' +
                '</div>' +
                '<div class="acct-in" hidden>' +
                    '<div class="acct-me"><span class="acct-avatar"></span><div><h2 class="acct-title" id="acctTitleIn">Your account</h2>' +
                        '<p class="acct-email"></p></div></div>' +
                    '<dl class="acct-facts"><dt>User ID</dt><dd class="acct-uid">…</dd></dl>' +
                    '<div class="acct-links">' +
                        '<a class="acct-link" href="' + base() + 'order.html#lookup">Your orders</a>' +
                        '<a class="acct-link" href="' + base() + 'services/education.html#shorts">Your video progress</a>' +
                        '<a class="acct-link" href="' + base() + 'services/education.html#rewards" data-rewards-open>Your coins and rewards</a>' +
                    '</div>' +
                    '<button type="button" class="acct-signout">Sign out</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(panel);

        panel.addEventListener('click', function (e) { if (e.target === panel) close(); });
        panel.querySelector('.acct-close').addEventListener('click', close);
        panel.querySelectorAll('[role="tab"]').forEach(function (b) {
            b.addEventListener('click', function () { setTab(b.getAttribute('data-tab')); });
            b.addEventListener('keydown', function (e) {        // arrow keys move between the two tabs
                if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
                setTab(tab === 'login' ? 'signup' : 'login');
                panel.querySelector('[data-tab="' + tab + '"]').focus();
            });
        });
        panel.querySelector('.acct-form').addEventListener('submit', sendLink);
        panel.querySelector('.acct-signout').addEventListener('click', signOut);
        // on the whole page while open: focus can drop to the page (e.g. a button disables while sending)
        document.addEventListener('keydown', function (e) { if (!panel.hidden) trapFocus(e); });
    }
    function base() {
        const s = document.querySelector('script[src*="nav.min.js"], script[src*="nav.js"]');
        return s ? s.src.replace(/nav(\.min)?\.js.*$/, '') : '/';
    }

    const COPY = {
        login: ['Welcome back', 'Sign in to see your orders and pick up your video progress where you left off.'],
        signup: ['Create your free account', 'One account for your orders and your AI Education progress. It only takes your email.']
    };
    function setTab(which) {
        tab = which;
        panel.querySelectorAll('[role="tab"]').forEach(function (b) {
            const on = b.getAttribute('data-tab') === which;
            b.setAttribute('aria-selected', on ? 'true' : 'false');
            b.tabIndex = on ? 0 : -1;
        });
        panel.querySelector('#acctTitle').textContent = COPY[which][0];
        panel.querySelector('#acctSub').textContent = COPY[which][1];
        panel.querySelector('[role="tabpanel"]').setAttribute('aria-labelledby', which === 'login' ? 'acctTabLogin' : 'acctTabSignup');
        panel.querySelector('.acct-primary').textContent = which === 'login' ? 'Email me a sign-in link' : 'Email me a link to sign up';
        renderGoogle();
    }

    function open(which, from) {
        if (!panel) build();
        opener = from || document.activeElement;
        const a = account();
        panel.querySelector('.acct-out').hidden = !!a;
        panel.querySelector('.acct-in').hidden = !a;
        panel.querySelector('.acct-panel').setAttribute('aria-labelledby', a ? 'acctTitleIn' : 'acctTitle');
        panel.querySelector('.acct-msg').textContent = '';
        if (a) showAccount(a); else { setTab(which || 'login'); loadGoogle(); }
        panel.hidden = false;
        document.documentElement.classList.add('acct-open');
        requestAnimationFrame(function () { panel.classList.add('is-open'); });
        const first = a ? panel.querySelector('.acct-link') : panel.querySelector('#acctEmail');
        setTimeout(function () { first && first.focus(); }, 60);
        const nav = document.getElementById('nav-toggle');
        if (nav) nav.checked = false;                      // opened from the side menu: close the menu
    }
    function close() {
        if (!panel || panel.hidden) return;
        panel.classList.remove('is-open');
        document.documentElement.classList.remove('acct-open');
        setTimeout(function () { panel.hidden = true; }, 180);
        if (opener && opener.focus) opener.focus();
    }
    function trapFocus(e) {
        if (e.key === 'Escape') { e.preventDefault(); close(); return; }
        if (e.key !== 'Tab') return;
        const f = Array.prototype.filter.call(panel.querySelectorAll('button, a[href], input, iframe, [tabindex]:not([tabindex="-1"])'),
                                              function (x) { return x.offsetParent !== null && !x.disabled; });
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }

    /* ---------- signed in: your account ---------- */
    function showAccount(a) {
        panel.querySelector('.acct-avatar').textContent = initial(a);
        panel.querySelector('.acct-email').textContent = a.email;
        const uid = panel.querySelector('.acct-uid');
        uid.textContent = a.userId || '…';
        if (a.userId) return;
        fetch(API + '/me', { headers: { Authorization: 'Bearer ' + a.token } })   // older sign-ins don't have the ID saved yet
            .then(function (r) {
                if (r.status === 401) { try { localStorage.removeItem(ACCOUNT_KEY); } catch (e) {} labels(); close(); return null; }
                return r.ok ? r.json() : null;
            })
            .then(function (me) {
                if (!me || !me.user_id) return;
                a.userId = me.user_id;
                try { localStorage.setItem(ACCOUNT_KEY, JSON.stringify(a)); } catch (e) {}
                uid.textContent = me.user_id;
            }).catch(function () { uid.textContent = 'Couldn\'t load just now'; });
    }

    /* ---------- email: ask for a link that comes back to this page ---------- */
    function msg(text, bad) {
        const m = panel.querySelector('.acct-msg');
        m.textContent = text;
        m.classList.toggle('is-bad', !!bad);
    }
    function sendLink(e) {
        e.preventDefault();
        const box = panel.querySelector('#acctEmail'), btn = panel.querySelector('.acct-primary');
        const email = box.value.trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
            box.setAttribute('aria-invalid', 'true');
            msg('Please enter a valid email address, like you@example.com.', true);
            box.focus();
            return;
        }
        box.removeAttribute('aria-invalid');
        btn.disabled = true;
        const label = btn.textContent;
        btn.textContent = 'Sending…';
        msg('');
        const path = location.pathname.replace(/\/index\.html$/, '/');
        fetch(API + '/auth/email/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email, return_to: /^\/[A-Za-z0-9_\/.-]*$/.test(path) && path.length <= 120 ? path : undefined })
        }).then(function (r) {
            if (r.status === 429) throw new Error('Too many sign-in emails. Please wait a minute and try again.');
            if (r.status === 503) throw new Error('Sign-in isn\'t available right now. Please try again later.');
            if (!r.ok) throw new Error('Something went wrong on our end. Please try again.');
            msg('Check your inbox: we sent a link to ' + email + '. It works once, expires in 15 minutes, and brings you back here.');
            window.trackEvent && trackEvent(tab === 'signup' ? 'account-signup-link' : 'account-signin-link');
        }).catch(function (err) {
            msg(err instanceof TypeError ? 'Our sign-in system is waking up or offline. Please try again in a moment.' : err.message, true);
        }).finally(function () { btn.disabled = false; btn.textContent = label; });
    }

    /* ---------- email: they clicked the link and landed back on this page (#signin=CODE) ---------- */
    function finishFromLink() {
        if (onOrderPage || !location.hash.startsWith('#signin=')) return;
        const code = location.hash.slice(8);
        history.replaceState(null, '', location.pathname + location.search);   // take the code out of the address bar
        open('login');
        msg('Signing you in…');
        finish('/auth/email/verify', { token: code });
    }
    function finish(path, body) {
        fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
            .then(function (r) {
                return r.json().catch(function () { return {}; }).then(function (data) {
                    if (!r.ok) throw new Error(data.detail || 'That sign-in didn\'t work. Please try again.');
                    return data;
                });
            })
            .then(function (data) {
                save(data);
                window.trackEvent && trackEvent('customer-signin');
                location.replace(location.pathname + location.search);   // back on the same page, now signed in
            })
            .catch(function (err) {
                if (!panel || panel.hidden) open('login');
                msg(err instanceof TypeError ? 'Our sign-in system is offline right now. Please try again in a moment.'
                    : (/expired|used/i.test(err.message) ? 'That link has expired or was already used. Send yourself a new one below.' : err.message), true);
            });
    }

    /* ---------- Google: only shown once the server says it's set up ---------- */
    let gisLoading = false, gisReady = false;
    function loadGoogle() {
        try { googleConfig = googleConfig || JSON.parse(localStorage.getItem('swr:authConfig') || 'null'); } catch (e) {}
        startGis();
        fetch(API + '/auth/config').then(function (r) { return r.ok ? r.json() : null; }).then(function (c) {
            if (!c) return;
            googleConfig = { google_client_id: c.google_client_id || null };
            try { localStorage.setItem('swr:authConfig', JSON.stringify(googleConfig)); } catch (e) {}
            startGis();
        }).catch(function () {});
    }
    function startGis() {
        if (gisLoading || !googleConfig || !googleConfig.google_client_id) return;
        gisLoading = true;
        const s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client';
        s.async = true;
        s.onload = function () {
            google.accounts.id.initialize({
                client_id: googleConfig.google_client_id,
                callback: function (reply) { msg('Signing you in…'); finish('/auth/google', { credential: reply.credential }); }
            });
            gisReady = true;
            renderGoogle();
        };
        s.onerror = function () { gisLoading = false; };
        document.head.appendChild(s);
    }
    function renderGoogle() {
        if (!gisReady || !panel) return;
        const wrap = panel.querySelector('.acct-google'), box = panel.querySelector('.acct-gbtn');
        box.textContent = '';
        google.accounts.id.renderButton(box, {
            theme: 'filled_black', size: 'large', shape: 'pill', text: tab === 'signup' ? 'signup_with' : 'continue_with',
            width: Math.min(340, (panel.querySelector('.acct-form').clientWidth || 320))
        });
        wrap.hidden = false;
    }

    /* ---------- coins: the balance next to Account ---------- */
    const COINS_KEY = 'asCoins';                       // { u: email, b: balance }: the last balance seen, shown at once
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let coinsShown = null, coinsLoad = null, live = null, coinsFor = null;
    function coinTab() { return document.querySelector('.coin-tab'); }
    function showCoins(n) {
        coinsShown = n;
        const t = coinTab();
        if (!t) return;
        const was = t.querySelector('.coin-num').textContent;
        t.querySelector('.coin-num').textContent = n;
        if (String(n).length !== was.length) place();
        t.setAttribute('aria-label', 'Rewards: ' + n + ' coin' + (n === 1 ? '' : 's'));
    }
    function keepCoins(n) {
        const a = account();
        if (a) try { localStorage.setItem(COINS_KEY, JSON.stringify({ u: a.email, b: n })); } catch (e) {}
    }
    function setCoins(n) { keepCoins(n); showCoins(n); }
    // the server is the only source of the balance; this asks it (once per page unless forced)
    // (the free server can take a while to wake up, so a failed try is repeated a few times)
    function loadRewards(force) {
        const a = account();
        if (!a) return Promise.resolve(null);
        if (coinsLoad && !force) return coinsLoad;
        function attempt(n) {
            return fetch(API + '/api/rewards', { headers: { Authorization: 'Bearer ' + a.token } })
                .then(function (r) {
                    if (r.status === 401) { try { localStorage.removeItem(ACCOUNT_KEY); } catch (e) {} labels(); return null; }
                    if (!r.ok) throw new Error('rewards ' + r.status);
                    return r.json();
                })
                .catch(function (err) {
                    if (n >= 3) throw err;
                    return new Promise(function (res) { setTimeout(res, [3000, 8000, 20000][n]); }).then(function () { return attempt(n + 1); });
                });
        }
        const p = coinsLoad = attempt(0)
            .then(function (d) {
                const now = account();
                if (d && now && now.email === a.email && !flying) setCoins(d.balance);
                return d;
            })
            .catch(function () { if (coinsLoad === p) coinsLoad = null; return null; });
        return p;
    }
    function announce(text) {
        if (!live) { live = el('div', 'coin-live'); live.setAttribute('aria-live', 'polite'); document.body.appendChild(live); }
        live.textContent = '';
        setTimeout(function () { live.textContent = text; }, 50);
    }
    function bump() {
        const t = coinTab();
        if (!t) return;
        t.classList.add('is-bump');
        setTimeout(function () { t.classList.remove('is-bump'); }, 160);
    }
    function flip() {
        const img = coinTab() && coinTab().querySelector('img');
        if (img && img.animate && !reduceMotion.matches) img.animate([{ transform: 'rotateY(0)' }, { transform: 'rotateY(360deg)' }],
                                                                      { duration: 650, easing: 'cubic-bezier(.3, .7, .3, 1)' });
    }
    // where the coins fly to: the balance, or the top right corner if it's out of sight
    function target() {
        const t = coinTab();
        const r = t && !t.hidden && getComputedStyle(t).opacity !== '0' ? t.querySelector('img').getBoundingClientRect() : null;
        return r && r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2, size: r.width }
                            : { x: innerWidth - 60, y: 40, size: 26 };
    }

    /* coins in the air: one animation loop for all of them.
       burst: they shoot out from a point, spinning, slowed by air and pulled down a little;
       then each one curves into the balance, and the number goes up as they land. */
    let coins = [], raf = 0, flying = 0, last = 0;
    function loop(now) {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        coins = coins.filter(function (c) {
            if (now < c.flyAt) {
                c.vy += 900 * dt;                                   // gravity
                const drag = Math.pow(0.08, dt);                    // air: most of the speed is gone in a second
                c.vx *= drag; c.vy *= drag;
                c.x += c.vx * dt; c.y += c.vy * dt;
                c.spin += c.spinV * dt; c.spinV *= Math.pow(0.4, dt);
                c.x0 = c.x; c.y0 = c.y;
                draw(c, 1);
                return true;
            }
            const T = target();
            const k = Math.min(1, (now - c.flyAt) / c.dur), e = k * k * (3 - 2 * k) * 0.4 + k * k * 0.6;   // speeds up as it nears
            const cx = (c.x0 + T.x) / 2 + c.bend, cy = Math.min(c.y0, T.y) - 140;
            c.x = (1 - e) * (1 - e) * c.x0 + 2 * (1 - e) * e * cx + e * e * T.x;
            c.y = (1 - e) * (1 - e) * c.y0 + 2 * (1 - e) * e * cy + e * e * T.y;
            c.spin += c.spinV * 0.4 * dt + 14 * dt;
            draw(c, 1 + (T.size / c.size - 1) * e);
            if (k < 1) return true;
            c.el.remove();
            c.land();
            return false;
        });
        raf = coins.length ? requestAnimationFrame(loop) : 0;
    }
    function draw(c, scale) {
        // a coin spinning on its edge: squash it across as it turns
        const sx = Math.cos(c.spin);
        c.el.style.transform = 'translate(' + c.x.toFixed(1) + 'px,' + c.y.toFixed(1) + 'px) scale(' + (scale * Math.max(0.08, Math.abs(sx))).toFixed(3) + ',' + scale.toFixed(3) + ')';
    }
    function spawn(x, y, size, speed, angle, flyAt, land) {
        const node = el('div', 'coin-fly');
        node.innerHTML = '<img src="' + base() + 'assets/coin.svg" alt="" width="30" height="30">';
        node.style.width = node.style.height = size + 'px';
        node.style.margin = (-size / 2) + 'px 0 0 ' + (-size / 2) + 'px';
        document.body.appendChild(node);
        const c = { el: node, x: x, y: y, x0: x, y0: y, size: size, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
                    spin: Math.random() * 6, spinV: (Math.random() < 0.5 ? -1 : 1) * (10 + Math.random() * 14),
                    flyAt: flyAt, dur: 560 + Math.random() * 180, bend: (Math.random() - 0.5) * 160, land: land };
        draw(c, 1);
        coins.push(c);
        if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); }
    }
    // the "+15" that rides along and lands with the last coin
    function toast(n, x, y, flyAt, dur) {
        const t = el('div', 'coin-toast');
        t.innerHTML = '<img src="' + base() + 'assets/coin.svg" alt="" width="22" height="22"><span>+' + n + '</span>';
        document.body.appendChild(t);
        const w = t.offsetWidth, h = t.offsetHeight, x0 = x - w / 2, y0 = y + 70;
        const pop = t.animate([{ transform: 'translate(' + x0 + 'px,' + (y0 + 20) + 'px) scale(0.4)', opacity: 0 },
                               { transform: 'translate(' + x0 + 'px,' + y0 + 'px) scale(1.12)', opacity: 1, offset: 0.6 },
                               { transform: 'translate(' + x0 + 'px,' + y0 + 'px) scale(1)', opacity: 1 }],
                              { duration: 380, easing: 'ease-out', fill: 'forwards' });
        setTimeout(function () {
            const T = target();
            pop.cancel();
            t.animate([{ transform: 'translate(' + x0 + 'px,' + y0 + 'px) scale(1)', opacity: 1 },
                       { transform: 'translate(' + ((x0 + T.x - w / 2) / 2) + 'px,' + (Math.min(y0, T.y) - 90) + 'px) scale(0.9)', opacity: 1, offset: 0.5 },
                       { transform: 'translate(' + (T.x - w / 2) + 'px,' + (T.y - h / 2) + 'px) scale(0.35)', opacity: 0 }],
                      { duration: dur, easing: 'cubic-bezier(.55, 0, .45, 1)', fill: 'forwards' }).onfinish = function () { t.remove(); };
        }, Math.max(0, flyAt - performance.now()));
    }

    /* Coins earned: n of them, from the point (x, y), ending at the server's balance.
       big: the burst from the celebration (more coins, a bigger blast, a moment in the air). */
    function explode(n, from, balance, big) {
        if (!(n > 0)) { if (balance != null) setCoins(balance); return; }
        const start = coinsShown == null ? Math.max(0, (balance != null ? balance : n) - n) : coinsShown;
        const end = balance != null ? balance : start + n;
        keepCoins(end);
        announce('+' + n + ' coins. You have ' + end + ' coins.');
        if (reduceMotion.matches || !coinTab() || coinTab().hidden) { showCoins(end); return; }   // no motion: the number just changes
        const count = big ? Math.min(18, Math.max(8, n + 3)) : Math.min(8, Math.max(4, Math.round(n / 2)));
        const now = performance.now(), hold = big ? 820 : 380;
        let landed = 0, credited = start;
        flying++;
        for (let i = 0; i < count; i++) {
            const angle = (big ? i / count * Math.PI * 2 : -Math.PI / 2 + (i / (count - 1 || 1) - 0.5) * 2.2) + (Math.random() - 0.5) * 0.5;
            const speed = big ? 620 + Math.random() * 520 : 260 + Math.random() * 200;
            const size = big ? 30 + Math.round(Math.random() * 20) : 26;
            spawn(from.x, from.y, size, speed, angle, now + hold + i * (big ? 55 : 70), function () {
                landed++;
                credited = landed === count ? end : Math.max(credited, start + Math.floor(n * landed / count));
                showCoins(credited);
                bump();
                if (landed === count) { flip(); flying--; }
            });
        }
        toast(n, from.x, from.y, now + hold + count * (big ? 55 : 70) - 200, 700);
    }
    window.ASCoins = {
        refresh: loadRewards,                               // -> Promise of the GET /api/rewards reply (or null)
        set: setCoins,
        explode: function (n, from, balance) { explode(n, from, balance, true); },
        add: function (n, from, balance) { explode(n, from || target(), balance, false); },
        shown: function () { return coinsShown; }
    };

    /* the Rewards panel: loaded the first time it's opened */
    let rewardsLoading = null;
    function openRewards(from) {
        if (!account()) { open('signup', from); return; }
        close();
        if (window.ASRewards) { ASRewards.open(from); return; }
        if (!rewardsLoading) rewardsLoading = new Promise(function (resolve, reject) {
            const s = document.createElement('script');
            s.src = base() + (MIN ? 'rewards.min.js' : 'rewards.js');
            s.onload = resolve;
            s.onerror = function () { rewardsLoading = null; reject(); };
            document.head.appendChild(s);
        });
        rewardsLoading.then(function () { ASRewards.open(from); }, function () { location.href = base() + 'services/education.html#rewards'; });
    }
    function rewardsFromHash() {
        if (location.hash !== '#rewards') return;
        history.replaceState(null, '', location.pathname + location.search);
        openRewards();
    }

    /* ---------- wire up ---------- */
    document.addEventListener('click', function (e) {
        const r = e.target.closest && e.target.closest('[data-rewards-open]');
        if (!r || e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        openRewards(r);
    });
    document.addEventListener('click', function (e) {
        const b = e.target.closest && e.target.closest('[data-account-open]');
        if (!b || e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        open(b.getAttribute('data-account-open') || 'login', b);
    });
    window.addEventListener('storage', function (e) { if (e.key === ACCOUNT_KEY) labels(); });   // signed in or out in another tab
    window.addEventListener('as-account-change', labels);                                        // the Order page's own sign-in
    window.addEventListener('resize', place);
    window.addEventListener('hashchange', function () { finishFromLink(); rewardsFromHash(); });   // the link opened in a tab that already had this page
    window.ASAccount = { open: open, signedIn: function () { return !!account(); }, token: function () { const a = account(); return a ? a.token : null; } };
    window.dispatchEvent(new Event('as-coins-ready'));

    function start() {
        labels(); place(); finishFromLink();
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitTitle);
        rewardsFromHash();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
