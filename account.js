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
    }
    // keep the Menu button and this one side by side, whatever the Menu button's width
    function place() {
        const tab = document.querySelector('.side-tab');
        if (tab) document.documentElement.style.setProperty('--menu-w', Math.round(tab.getBoundingClientRect().width) + 'px');
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

    /* ---------- wire up ---------- */
    document.addEventListener('click', function (e) {
        const b = e.target.closest && e.target.closest('[data-account-open]');
        if (!b || e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        open(b.getAttribute('data-account-open') || 'login', b);
    });
    window.addEventListener('storage', function (e) { if (e.key === ACCOUNT_KEY) labels(); });   // signed in or out in another tab
    window.addEventListener('as-account-change', labels);                                        // the Order page's own sign-in
    window.addEventListener('resize', place);
    window.addEventListener('hashchange', finishFromLink);   // the link opened in a tab that already had this page
    window.ASAccount = { open: open, signedIn: function () { return !!account(); } };

    function start() { labels(); place(); finishFromLink(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
