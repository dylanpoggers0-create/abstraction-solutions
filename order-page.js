/* Page script for order.html. Kept in its own file so the page's Content-Security-Policy
   can forbid inline scripts (an injected <script> would be blocked). */
    const API_BASE = 'https://abstraction-quote-engine.onrender.com';

    // The free server sleeps when nobody uses it, and restarts after an update. While it's starting, Render
    // answers with an error page the browser isn't allowed to read, which looks exactly like "no internet".
    // So instead of giving up on the first try, keep trying for about 75 seconds before saying it's offline.
    async function fetchWithWake(url, options) {
        const giveUp = Date.now() + 75000;
        let wait = 2000;
        while (true) {
            try {
                const response = await fetch(url, Object.assign({}, options, { signal: AbortSignal.timeout(60000) }));
                const starting = response.status === 502 || response.status === 503 || response.status === 504;
                if (!starting || Date.now() + wait >= giveUp) return response;
            } catch (error) {
                if (Date.now() + wait >= giveUp) throw error;
            }
            await new Promise(function (done) { setTimeout(done, wait); });
            wait = Math.min(wait * 1.5, 10000);
        }
    }

    const orderForm = document.getElementById('orderForm');
    const orderButton = document.getElementById('orderButton');
    const orderMsg = document.getElementById('orderMsg');

    // Wake up the free server as soon as the page opens
    fetch(API_BASE + '/health').catch(function () {});

    // Idempotency keys: one random key per submission. If the same submission is sent again (a retry while the
    // server wakes up, or a second click after a timeout), the server recognizes the key and returns the first
    // answer instead of creating a second order. Editing the form starts a new submission (new key).
    const submissionKeys = {};
    function keyFor(kind, payload) {
        const body = JSON.stringify(payload), k = submissionKeys[kind];
        if (k && k.body === body) return k.key;
        const key = (window.UX && UX.idempotencyKey) ? UX.idempotencyKey()
            : Array.from(crypto.getRandomValues(new Uint8Array(16)), function (b) { return b.toString(16).padStart(2, '0'); }).join('');
        submissionKeys[kind] = { body: body, key: key };
        return key;
    }
    function doneWith(kind) { delete submissionKeys[kind]; }


    orderForm.addEventListener('submit', async function (event) {
        event.preventDefault();                    // stop the page from reloading

        const order = Object.fromEntries(new FormData(orderForm));
        // order is now: { name: "...", email: "...", service: "...", details: "..." }

        orderButton.disabled = true;               // stop double-clicks = double orders
        orderButton.textContent = 'Sending...';
        orderMsg.textContent = '';
        const slowOrder = setTimeout(function () {   // slow = the free server is waking up
            orderButton.textContent = 'Waking up the server (up to a minute)...';
        }, 5000);

        try {
            const headers = { 'Content-Type': 'application/json', 'Idempotency-Key': keyFor('order', order) };
            const account = orderForm.closest('#signIn') ? currentAccount() : null;
            if (account) headers.Authorization = 'Bearer ' + account.token;   // saves the order to their account
            const response = await fetchWithWake(API_BASE + '/orders', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(order)
            });
            if (response.status === 401 && account) {
                signOut();
                throw new Error('Your sign-in expired. Please sign in again (your order was not sent).');
            }

            if (response.status === 422) throw new Error('Please check your email and give at least 20 characters of detail.');
            if (response.status === 429) throw new Error('Too many orders from you today. Please email us instead.');
            if (!response.ok) throw new Error('Something went wrong on our end. Please try again or email us.');

            const result = await response.json();  // { ok: true, confirmation: "12345678" }
            doneWith('order');
            window.trackEvent && trackEvent('order-placed');
            orderForm.hidden = true;               // hide the form
            orderMsg.textContent = 'Order received! Your confirmation number is ' + result.confirmation +
                '. We\'ve emailed it to you, and we\'ll be in touch within 2 business days.';
            if (result.support && window.CrisisSupport) CrisisSupport.show(orderMsg, result.support);
            if (account) loadMyOrders();
        } catch (error) {
            orderMsg.textContent = error instanceof TypeError
                ? 'Our order system is offline right now. Please email dylanpogue@abstraction-solutions.com.'
                : error.message;
        } finally {
            clearTimeout(slowOrder);
            orderButton.disabled = false;
            orderButton.textContent = 'Place order';
        }
    });

    // ---------- CHECK AN EXISTING ORDER ----------
    const lookupForm = document.getElementById('lookupForm');
    const lookupButton = document.getElementById('lookupButton');
    const lookupMsg = document.getElementById('lookupMsg');
    const lookupResult = document.getElementById('lookupResult');

    const STATUS_TEXT = { new: 'Received', in_progress: 'In progress', complete: 'Complete', cancelled: 'Cancelled' };
    let lastSearch = null;   // the email + number from the last search (used by Pay now)
    const dollars = function (cents) {
        return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 });
    };

    // ---------- THE THREE PANELS ----------
    const signInPanel = document.getElementById('signIn');
    const newOrderPanel = document.getElementById('newOrder');
    const lookupPanel = document.getElementById('lookup');
    const allPanels = [signInPanel, newOrderPanel, lookupPanel];

    // opening one panel closes the others
    allPanels.forEach(function (panel) {
        panel.addEventListener('toggle', function () {
            if (!panel.open) return;
            allPanels.forEach(function (other) { if (other !== panel) other.open = false; });
            placeOrderForm();
        });
    });

    // The email link fills in the number and opens Check order: order.html?c=12345678#lookup
    const codeFromLink = new URLSearchParams(location.search).get('c');
    if (codeFromLink && /^[0-9]{8}$/.test(codeFromLink)) {
        document.getElementById('lookupCode').value = codeFromLink;
    }
    // both panels start closed, unless they came from the email link: then open Check order
    document.querySelectorAll('[data-open-panel]').forEach(function (a) {
        a.addEventListener('click', function (e) {
            const panel = document.getElementById(a.dataset.openPanel);
            if (!panel) return;
            e.preventDefault(); panel.open = true;
            panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
            history.replaceState(null, '', '#' + panel.id);
        });
    });
    if (location.hash === '#newOrder') document.getElementById('newOrder').open = true;
    if (location.hash === '#signIn') document.getElementById('signIn').open = true;   // "Sign in to save your progress" links here
    // phones: show the bottom button only while the top one is off screen and the order form is closed
    (function () {
        const bar = document.querySelector('.mobile-cta'), top = document.querySelector('.order-main-cta'), form = document.getElementById('newOrder');
        if (!bar || !top || !('IntersectionObserver' in window)) return;
        let topVisible = true;
        function sync() { bar.classList.toggle('away', topVisible || form.open); }
        new IntersectionObserver(function (e) { topVisible = e[0].isIntersecting; sync(); }).observe(top);
        form.addEventListener('toggle', sync); sync();
    })();
    if (codeFromLink || location.hash === '#lookup') {
        lookupPanel.open = true;
        document.getElementById('lookupEmail').focus();
    }

    // ---------- CUSTOMER ACCOUNTS: Google or an emailed link, then a signed token from our server ----------
    // The token is kept in this browser until it expires (3 days) or they sign out.
    const ACCOUNT_KEY = 'asAccount';
    const signInMsg = document.getElementById('signInMsg');

    function currentAccount() {
        try {
            const saved = JSON.parse(localStorage.getItem(ACCOUNT_KEY) || 'null');
            if (saved && saved.token && saved.expires * 1000 > Date.now()) return saved;
            localStorage.removeItem(ACCOUNT_KEY);
        } catch (e) {}
        return null;
    }

    function saveAccount(result) {   // result = { token: "42.1731200000.sig", customer: { email, name, user_id } }
        const account = { token: result.token, email: result.customer.email, name: result.customer.name || '',
                          userId: result.customer.user_id || null, expires: Number(result.token.split('.')[1]) };
        try { localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account)); } catch (e) {}
        return account;
    }

    function signOut() {
        try { localStorage.removeItem(ACCOUNT_KEY); localStorage.removeItem(ORDERS_SNAP); } catch (e) {}
        if (window.google && google.accounts) google.accounts.id.disableAutoSelect();
        renderAccount();
    }

    // The order form lives in one place at a time: inside "Sign in to checkout" when signed in, else "Checkout as guest"
    function placeOrderForm() {
        const account = currentAccount();
        const block = document.getElementById('orderBlock');
        const emailBox = document.getElementById('email');
        const nameBox = document.getElementById('name');
        if (account && !newOrderPanel.open) {
            document.getElementById('accountFormSlot').appendChild(block);
            emailBox.value = account.email;
            emailBox.readOnly = true;            // signed-in orders always use the account's email
            if (!nameBox.value) nameBox.value = account.name;
        } else {
            document.getElementById('guestFormSlot').appendChild(block);
            if (emailBox.readOnly) { emailBox.readOnly = false; emailBox.value = ''; }
        }
    }

    function renderAccount() {
        const account = currentAccount();
        document.getElementById('signedOut').hidden = !!account;
        document.getElementById('signedInBox').hidden = !account;
        signInPanel.querySelector('.panel-sub').textContent = account
            ? 'Signed in as ' + account.email : 'Keep your orders and quotes in one place';
        document.getElementById('lookupMine').hidden = !account;
        document.getElementById('lookupManual').hidden = !!account;
        lookupPanel.querySelector('.panel-sub').textContent = account
            ? 'Your orders, ready to open' : 'See the status and quote of an existing order';
        showUserId(account);
        if (account) {
            document.getElementById('accountEmail').textContent = account.email;
            document.getElementById('lookupMineEmail').textContent = account.email;
            loadMyOrders();
        }
        placeOrderForm();
    }

    // The account's permanent 8-digit user ID (a label, not a password). Older saved sign-ins don't have it yet,
    // so it's fetched once from /me and remembered.
    function showUserId(account) {
        const box = document.getElementById('accountUserId');
        if (!box) return;
        box.hidden = !(account && account.userId);
        if (account && account.userId) { box.querySelector('strong').textContent = account.userId; return; }
        if (!account) return;
        fetchWithWake(API_BASE + '/me', { headers: { Authorization: 'Bearer ' + account.token } })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (me) {
                if (!me || !me.user_id) return;
                const now = currentAccount();
                if (!now || now.token !== account.token) return;
                now.userId = me.user_id;
                try { localStorage.setItem(ACCOUNT_KEY, JSON.stringify(now)); } catch (e) {}
                showUserId(now);
            }).catch(function () {});
    }

    // Snapshot of the signed-in customer's order list on this device: it shows instantly next visit
    // (no waiting on the server waking up), then the live list replaces it. Removed on sign-out.
    const ORDERS_SNAP = 'snap:myOrders';
    function readSnap(email) {
        try { const s = JSON.parse(localStorage.getItem(ORDERS_SNAP) || 'null'); return s && s.email === email ? s.orders : null; } catch (e) { return null; }
    }
    async function loadMyOrders() {
        const account = currentAccount();
        const list = document.getElementById('myOrders');
        const msg = document.getElementById('myOrdersMsg');
        if (!account) return;
        msg.textContent = '';
        const snap = readSnap(account.email);
        if (snap) showMyOrders(snap);
        else [list, document.getElementById('lookupMyOrders')].forEach(function (l) {
            if (l.children.length) return;   // skeleton rows until the list arrives
            for (let i = 0; i < 2; i++) { const s = document.createElement('li'); s.className = 'skeleton skeleton-card'; s.style.height = '64px'; s.setAttribute('aria-hidden', 'true'); l.appendChild(s); }
        });
        try {
            const response = await fetchWithWake(API_BASE + '/me/orders', {
                headers: { Authorization: 'Bearer ' + account.token }
            });
            if (response.status === 401) { signOut(); signInMsg.textContent = 'Your sign-in expired. Please sign in again.'; return; }
            if (!response.ok) throw new Error();
            const orders = await response.json();
            try { localStorage.setItem(ORDERS_SNAP, JSON.stringify({ email: account.email, orders: orders })); } catch (e) {}
            showMyOrders(orders);
        } catch (e) {
            document.querySelectorAll('#myOrders .skeleton, #lookupMyOrders .skeleton').forEach(function (s) { s.remove(); });
            if (!snap) { document.getElementById('lookupMineMsg').textContent = 'Couldn\'t load your orders right now. You can still look one up below.'; document.getElementById('lookupManual').hidden = false; }
            if (!snap) msg.textContent = 'Couldn\'t load your orders right now. Please try again in a minute.';
        }
    }
    function showMyOrders(orders) {
        showOrderList(orders, document.getElementById('myOrders'), document.getElementById('myOrdersMsg'));
        showOrderList(orders, document.getElementById('lookupMyOrders'), document.getElementById('lookupMineMsg'));
    }
    function showOrderList(orders, list, msg) {
            list.replaceChildren();
            msg.textContent = orders.length ? '' : 'No orders yet. Your first one will show up here.';
            orders.forEach(function (o) {
                const li = document.createElement('li');
                const title = document.createElement('strong');
                title.textContent = '#' + o.confirmation + ' · ' + o.service;
                const open = document.createElement('button');
                open.className = 'link-button open-order';
                open.type = 'button';
                open.textContent = o.amount_due_cents ? 'View & pay' : 'View';
                open.addEventListener('click', function () { openOrder(o); });
                const meta = document.createElement('span');
                meta.className = 'meta';
                const stageName = { planning: 'Planning', coding: 'Coding', testing: 'Testing', done: 'Done' }[o.stage];
                meta.textContent = (o.status === 'cancelled' ? 'Cancelled' : o.paid_at ? 'Paid in full'
                    : (o.status === 'in_progress' && stageName) || STATUS_TEXT[o.status] || o.status) +
                    (o.amount_due_cents ? ' · Payment due ' + dollars(o.amount_due_cents)
                     : o.quote_cents ? ' · ' + dollars(o.quote_cents) : ' · Quote coming') +
                    ' · ' + new Date(o.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                li.append(title, open, meta);
                list.appendChild(li);
            });
    }

    // "View" on one of their orders: reuse the Find an order panel (status, quote, Pay now)
    function openOrder(o) {
        document.getElementById('lookupEmail').value = o.email || currentAccount().email;
        document.getElementById('lookupCode').value = o.confirmation;
        lookupPanel.open = true;
        lookupPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        document.getElementById('lookupForm').requestSubmit();
    }

    async function finishSignIn(path, body) {   // shared by Google and the email link
        signInMsg.textContent = 'Signing you in...';
        try {
            const response = await fetchWithWake(API_BASE + path, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const result = await response.json().catch(function () { return {}; });
            if (response.status === 503) throw new Error('Sign-in isn\'t available yet. Please checkout as guest for now.');
            if (!response.ok) throw new Error(result.detail || 'Sign-in failed. Please try again.');
            saveAccount(result);
            signInMsg.textContent = '';
            window.trackEvent && trackEvent('customer-signin');
            renderAccount();
        } catch (error) {
            signInMsg.textContent = error instanceof TypeError
                ? 'Our sign-in system is offline right now. Please checkout as guest.' : error.message;
        }
    }

    // 1. Email: ask for a link
    document.getElementById('emailSignInForm').addEventListener('submit', async function (event) {
        event.preventDefault();
        const button = document.getElementById('emailSignInButton');
        button.disabled = true;
        button.textContent = 'Sending...';
        signInMsg.textContent = '';
        try {
            const response = await fetchWithWake(API_BASE + '/auth/email/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: document.getElementById('signInEmail').value.trim() })
            });
            if (response.status === 422) throw new Error('Please enter a valid email address.');
            if (response.status === 429) throw new Error('Too many sign-in emails. Please wait a minute and try again.');
            if (response.status === 503) throw new Error('Sign-in isn\'t available yet. Please checkout as guest for now.');
            if (!response.ok) throw new Error('Something went wrong on our end. Please try again.');
            signInMsg.textContent = 'Check your email for a sign-in link. It works once and expires in 15 minutes.';
        } catch (error) {
            signInMsg.textContent = error instanceof TypeError
                ? 'Our sign-in system is offline right now. Please checkout as guest.' : error.message;
        } finally {
            button.disabled = false;
            button.textContent = 'Email me a sign-in link';
        }
    });

    // 2. Email: they clicked the link (order.html#signin=CODE). The code after # never reaches any server log.
    function signInFromLink() {
        const linkCode = location.hash.startsWith('#signin=') ? location.hash.slice(8) : '';
        if (!linkCode) return;
        history.replaceState(null, '', location.pathname + location.search);   // take the code out of the address bar
        signInPanel.open = true;
        finishSignIn('/auth/email/verify', { token: linkCode });
    }
    signInFromLink();
    window.addEventListener('hashchange', signInFromLink);   // link opened in a tab that already had this page

    // 3. Google: only shown once the server says a Client ID is set (GOOGLE_CLIENT_ID on Render)
    let googleStarted = false;
    function startGoogle(config) {
        if (googleStarted || !config || !config.google_client_id) return;
        googleStarted = true;
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.onload = function () {
            google.accounts.id.initialize({
                client_id: config.google_client_id,
                callback: function (reply) { finishSignIn('/auth/google', { credential: reply.credential }); }
            });
            const box = document.getElementById('googleButton');
            google.accounts.id.renderButton(box, {
                theme: 'filled_black', size: 'large', shape: 'rectangular', text: 'continue_with',
                width: Math.min(320, box.clientWidth || 320)
            });
            document.getElementById('googleBox').hidden = false;
        };
        document.head.appendChild(script);
    }
    try { startGoogle(JSON.parse(localStorage.getItem('swr:authConfig') || 'null')); } catch (e) {}
    fetchWithWake(API_BASE + '/auth/config').then(function (r) { return r.ok ? r.json() : null; }).then(function (config) {
        if (!config) return;
        try { localStorage.setItem('swr:authConfig', JSON.stringify({ google_client_id: config.google_client_id || null })); } catch (e) {}
        startGoogle(config);
    }).catch(function () {});

    document.getElementById('signOutButton').addEventListener('click', signOut);
    document.getElementById('lookupOtherButton').addEventListener('click', function () {
        document.getElementById('lookupManual').hidden = false;
        document.getElementById('lookupEmail').focus();
    });

    // "Download my data": a JSON file of everything we hold (account, orders, payments, agreements, mailing list)
    function saveFile(blob, name) {
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    }
    document.getElementById('exportAccountButton').addEventListener('click', async function () {
        const account = currentAccount(); if (!account) return;
        try {
            const r = await fetchWithWake(API_BASE + '/me/export', { headers: { Authorization: 'Bearer ' + account.token } });
            if (r.status === 401) { signOut(); signInMsg.textContent = 'Your sign-in expired. Please sign in again.'; return; }
            if (!r.ok) throw new Error();
            saveFile(await r.blob(), 'abstraction-solutions-my-data.json');
        } catch (e) { signInMsg.textContent = 'Couldn\'t download your data right now. Please try again in a minute.'; }
    });
    document.getElementById('exportOrderButton').addEventListener('click', async function () {
        try {
            const r = await fetchWithWake(API_BASE + '/orders/export', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lastSearch) });
            if (r.status === 429) throw new Error('Too many tries. Please wait a minute.');
            if (!r.ok) throw new Error('Couldn\'t download the data right now. Please try again in a minute.');
            saveFile(await r.blob(), 'abstraction-solutions-order-' + lastSearch.confirmation + '.json');
        } catch (e) { lookupMsg.textContent = e instanceof TypeError ? 'Our system is offline right now.' : e.message; }
    });

    // delete account: two clicks, then it's gone (orders stay on record and can still be looked up)
    (function () {
        const btn = document.getElementById('deleteAccountButton');
        let armed = null;
        btn.addEventListener('click', async function () {
            if (!armed) {
                btn.textContent = 'Click again to permanently delete your account';
                armed = setTimeout(function () { armed = null; btn.textContent = 'Delete account'; }, 6000);
                return;
            }
            clearTimeout(armed); armed = null;
            const account = currentAccount();
            if (!account) return;
            btn.disabled = true; btn.textContent = 'Deleting...';
            try {
                const response = await fetchWithWake(API_BASE + '/me/delete', {
                    method: 'POST', headers: { Authorization: 'Bearer ' + account.token }
                });
                if (!response.ok && response.status !== 401) throw new Error();
                signOut();
                signInMsg.textContent = 'Your account was deleted. Your orders stay on record for our business and tax records, ' +
                    'and you can still look them up with your email and confirmation number.';
            } catch (e) {
                signInMsg.textContent = 'Couldn\'t delete your account right now. Please try again, or email dylanpogue@abstraction-solutions.com.';
            } finally { btn.disabled = false; btn.textContent = 'Delete account'; }
        });
    })();

    // cancel a project from the order page
    (function () {
        const form = document.getElementById('cancelForm'), msg = document.getElementById('cancelMsg');
        document.getElementById('cancelButton').addEventListener('click', function () {
            document.getElementById('cancelStart').hidden = true; form.hidden = false; msg.textContent = '';
            document.getElementById('cancelReason').focus();
        });
        document.getElementById('cancelKeep').addEventListener('click', function () {
            form.hidden = true; document.getElementById('cancelStart').hidden = false;
        });
        form.addEventListener('submit', async function (event) {
            event.preventDefault();
            const button = document.getElementById('cancelConfirm');
            button.disabled = true; button.textContent = 'Cancelling...';
            try {
                const payload = Object.assign({ confirm: true, reason: document.getElementById('cancelReason').value.trim() || null }, lastSearch);
                const response = await fetchWithWake(API_BASE + '/orders/cancel', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
                });
                const data = await response.json().catch(function () { return {}; });
                if (response.status === 429) throw new Error('Too many tries. Please wait a minute.');
                if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Something went wrong. Please try again.');
                window.trackEvent && trackEvent('order-cancelled');
                document.getElementById('lookupForm').requestSubmit();       // reload the order to show it cancelled
                setTimeout(function () { lookupMsg.textContent = 'Your project is cancelled and nothing more is due. We\'ve emailed you a confirmation.'; }, 1500);
            } catch (error) {
                msg.textContent = error instanceof TypeError ? 'Our system is offline right now. Please try again in a minute.' : error.message;
            } finally { button.disabled = false; button.textContent = 'Yes, cancel my project'; }
        });
    })();

    renderAccount();

    // "Accept this quote" on the home page sends ?service=...&details=... : fill in and open an order panel
    const fromQuote = new URLSearchParams(location.search);
    if (fromQuote.get('details') && !codeFromLink) {
        const serviceBox = document.getElementById('service');
        const wanted = fromQuote.get('service');
        if ([...serviceBox.options].some(function (o) { return o.value === wanted; })) serviceBox.value = wanted;
        document.getElementById('details').value = fromQuote.get('details').slice(0, 3000);
        (currentAccount() ? signInPanel : newOrderPanel).open = true;
        document.getElementById(currentAccount() ? 'service' : 'name').focus();
    }

    lookupForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        lookupButton.disabled = true;
        lookupButton.textContent = 'Searching...';
        lookupMsg.textContent = '';
        lookupResult.hidden = true;
        const slowLookup = setTimeout(function () {
            lookupButton.textContent = 'Waking up the server (up to a minute)...';
        }, 5000);

        lastSearch = {
            email: document.getElementById('lookupEmail').value.trim(),
            confirmation: document.getElementById('lookupCode').value.trim()
        };
        try {
            const response = await fetchWithWake(API_BASE + '/orders/lookup', {
                method: 'POST',   // POST keeps the email out of the address bar and server logs
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(lastSearch)
            });

            if (response.status === 404) throw new Error('No order matches that email and confirmation number.');
            if (response.status === 422) throw new Error('The confirmation number should be exactly 8 digits.');
            if (response.status === 429) throw new Error('Too many searches. Please wait a minute and try again.');
            if (!response.ok) throw new Error('Something went wrong on our end. Please try again.');

            showOrder(await response.json());
        } catch (error) {
            lookupMsg.textContent = error instanceof TypeError
                ? 'Our order system is offline right now. Please try again in a minute.'
                : error.message;
        } finally {
            clearTimeout(slowLookup);
            lookupButton.disabled = false;
            lookupButton.textContent = 'Find my order';
        }
    });

    // textContent (never innerHTML) so nothing from the server can run as code
    function showOrder(order) {
        document.getElementById('resCode').textContent = order.confirmation;
        document.getElementById('resService').textContent = order.service;
        document.getElementById('resDate').textContent = new Date(order.created_at).toLocaleDateString();

        const badge = document.getElementById('resStatus');
        badge.textContent = order.status === 'in_progress' && order.stage_name ? order.stage_name : (STATUS_TEXT[order.status] || order.status);
        badge.className = 'status-badge ' + order.status;

        const hasQuote = order.quote_cents !== null;
        const paid = Boolean(order.paid_at);
        const quote = document.getElementById('resQuote');
        quote.textContent = hasQuote ? dollars(order.quote_cents) : 'Being prepared';
        if (paid) {
            const p = document.createElement('span');
            p.className = 'status-badge paid';
            p.textContent = 'Paid ✓';
            quote.append(' ', p);
        }

        // the payment stages: paid / due / upcoming
        const plan = order.plan || [];
        const planList = document.getElementById('resPlan');
        planList.replaceChildren();
        plan.forEach(function (p) {
            const li = document.createElement('li');
            li.className = p.state;
            const name = document.createElement('strong');
            name.textContent = p.number + '. ' + p.name;
            const amt = document.createElement('span');
            amt.className = 'amt';
            amt.textContent = dollars(p.amount_cents);
            const sub = document.createElement('span');
            sub.className = 'sub';
            sub.textContent = p.percent + '% of the quote';
            const st = document.createElement('span');
            st.className = 'st';
            st.textContent = p.state === 'paid' ? '✓ Paid' : p.state === 'due' ? (p.due_at ? 'Due ' + shortDate(p.due_at) : 'Due now')
                : p.state === 'no_charge' ? 'No charge' : order.status === 'cancelled' ? 'Cancelled' : 'Later';
            li.append(name, amt, sub, st);
            if (p.refunded_cents) {
                const refund = document.createElement('span');
                refund.className = 'refund';
                refund.textContent = 'Refunded ' + dollars(p.refunded_cents);
                li.append(refund);
            }
            planList.appendChild(li);
        });
        document.getElementById('resPlanBox').hidden = !plan.length;
        const due = plan.find(function (p) { return p.state === 'due'; });
        const first = plan.find(function (p) { return p.amount_cents > 0; }) || plan[0];   // first stage that costs something

        document.getElementById('resNote').textContent =
            order.status === 'cancelled' ? 'This project was cancelled, so nothing more is due. Questions? Reply to any of our emails.'
            : paid ? 'Paid in full on ' + new Date(order.paid_at).toLocaleDateString() + '. Thank you!'
            : order.status === 'complete' ? 'This project is complete. Thank you for working with us!'
            : due ? due.name + ' is ready to start. Pay ' + dollars(due.amount_cents) + (due.due_at ? ' by ' + shortDate(due.due_at) : '') +
                    ' to begin it; we\'ll start as soon as it\'s paid.'
            : order.stage ? 'Nothing is due right now. We\'ll email you when the next stage starts.'
            : hasQuote ? 'Your quote is ready. You don\'t pay it all at once: the first ' + first.percent + '% (' +
                         dollars(first.amount_cents) + ') is due when ' + first.name + ' begins, and we\'ll email you then.'
            : 'We\'re reviewing your project and will email you a final quote soon.';

        // "Pay $X for Coding" only when a stage payment is due
        const payBox = document.getElementById('payBox');
        payBox.hidden = !due;
        document.getElementById('payButton').textContent = due ? 'Pay ' + dollars(due.amount_cents) + ' for ' + due.name : 'Pay now';
        paidStagesShown = plan.filter(function (p) { return p.state === 'paid'; }).length;
        lastOrder = order;
        showAgreement(order, due);
        showChanges(order);
        const ended = order.status === 'cancelled' || order.status === 'complete';
        document.getElementById('cancelBox').hidden = ended;
        document.getElementById('cancelForm').hidden = true;
        document.getElementById('cancelStart').hidden = false;
        document.getElementById('payMsg').textContent = '';
        document.getElementById('checkout-form').replaceChildren();   // clear any earlier payment form

        lookupResult.hidden = false;
    }

    // ---------- SERVICE AGREEMENT ----------
    let agreement = null;   // what the server sent: the draft (with its fingerprint) or the signed copy
    let lastOrder = null;
    const agreeBox = document.getElementById('agreeBox'), agreeStatus = document.getElementById('agreeStatus');
    const agreeForm = document.getElementById('agreeForm'), agreeMsg = document.getElementById('agreeMsg');
    function setPayLock(locked) {
        const pay = document.getElementById('payButton');
        pay.disabled = locked;
        pay.title = locked ? 'Sign the service agreement first' : '';
    }
    async function showAgreement(order, due) {
        const info = order.contract || {};
        agreeBox.hidden = order.quote_cents === null || order.status === 'cancelled' && !info.signed;
        if (agreeBox.hidden) return;
        // the first payment needs a signature; later payments don't wait on it
        const needsSignature = !info.signed && !order.plan.some(function (p) { return p.state === 'paid'; });
        setPayLock(Boolean(due) && needsSignature);
        agreeStatus.textContent = info.signed
            ? 'Signed by ' + info.signer + ' on ' + new Date(info.signed_at).toLocaleDateString() + '.'
            : needsSignature ? 'Please read and sign your service agreement before your first payment.' : 'Your service agreement is ready to read.';
        agreeForm.hidden = true; document.getElementById('agreeTools').hidden = true;
        document.getElementById('agreeDoc').replaceChildren();
        try {
            const r = await fetch(API_BASE + '/orders/contract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lastSearch) });
            agreement = await r.json().catch(function () { return {}; });
            if (!r.ok) throw new Error(agreement.detail || 'Couldn\'t load the agreement.');
            // the agreement is our own template, with every value escaped by the server
            document.getElementById('agreeDoc').innerHTML = agreement.html;
            document.getElementById('agreeTools').hidden = false;
            if (!agreement.signed && order.status !== 'cancelled') {
                agreeForm.hidden = false;
                document.getElementById('agreeName').value = agreement.legal_name || '';
                if (needsSignature) document.getElementById('agreeRead').open = true;
            }
        } catch (error) {
            agreeStatus.textContent = error instanceof TypeError ? 'The agreement couldn\'t load right now. Please try again in a minute.' : error.message;
        }
    }
    agreeForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        if (!agreement || !lastSearch) return;
        const button = document.getElementById('agreeButton');
        button.disabled = true; agreeMsg.textContent = 'Signing...';
        try {
            const r = await fetch(API_BASE + '/orders/contract/sign', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(Object.assign({}, lastSearch, { legal_name: document.getElementById('agreeName').value.trim(),
                                                                     agree: document.getElementById('agreeCheck').checked, sha256: agreement.sha256 }))
            });
            const data = await r.json().catch(function () { return {}; });
            if (!r.ok) throw new Error(data.detail || 'Couldn\'t sign. Please try again.');
            agreement = data;
            document.getElementById('agreeDoc').innerHTML = data.html;
            agreeForm.hidden = true;
            agreeStatus.textContent = 'Signed by ' + data.signer + ' on ' + new Date(data.signed_at).toLocaleDateString() + '. We emailed you a copy.';
            setPayLock(false);
            if (window.UX && UX.toast) UX.toast('Agreement signed');
        } catch (error) {
            agreeMsg.textContent = error instanceof TypeError ? 'We couldn\'t reach our server. Please try again in a minute.' : error.message;
            if (/changed since you opened it/.test(error.message) && lastOrder)
                showAgreement(lastOrder, (lastOrder.plan || []).find(function (p) { return p.state === 'due'; }));
        }
        button.disabled = false;
        if (!agreeForm.hidden && agreeMsg.textContent === 'Signing...') agreeMsg.textContent = '';
    });
    document.getElementById('agreeDownload').addEventListener('click', function () {
        if (!agreement) return;
        const code = lastSearch ? lastSearch.confirmation : 'order';
        const page = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Service Agreement AS-' + code + '</title>' +
            '<style>body{font:15px/1.6 Georgia,serif;max-width:760px;margin:40px auto;padding:0 20px;color:#111}table{border-collapse:collapse;width:100%}' +
            'th,td{border:1px solid #bbb;padding:6px 8px;text-align:left}blockquote{border-left:3px solid #999;margin:0;padding:4px 14px}</style></head><body>' +
            agreement.html + '</body></html>';
        const link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob([page], { type: 'text/html' }));
        link.download = 'Service-Agreement-AS-' + code + '.html';
        document.body.append(link); link.click(); link.remove();
        setTimeout(function () { URL.revokeObjectURL(link.href); }, 2000);
    });

    // ---------- PAY ----------
    const payButton = document.getElementById('payButton');
    const payMsg = document.getElementById('payMsg');

    payButton.addEventListener('click', async function () {
        if (!lastSearch) return;
        payButton.disabled = true;
        const label = payButton.textContent;
        payButton.textContent = 'Opening secure checkout...';
        payMsg.textContent = '';
        try {
            // we only say WHICH order; the server looks up the price itself
            const response = await fetch(API_BASE + '/orders/pay', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(lastSearch)
            });
            const data = await response.json().catch(function () { return {}; });
            if (!response.ok) throw new Error(data.detail || 'Couldn\'t start the payment. Please try again.');

            if (data.url) {            // backup: Stripe's own checkout page (never anywhere else)
                if (!/^https:\/\/checkout\.stripe\.com\//.test(data.url)) throw new Error('Couldn\'t start the payment. Please try again.');
                location.href = data.url;
                return;
            }
            await showPaymentForm(data.client_secret, data.publishable_key);
            document.getElementById('payBox').hidden = true;   // the form has its own Pay button
        } catch (error) {
            payMsg.textContent = error instanceof TypeError
                ? 'Our payment system is offline right now. Please try again in a minute.'
                : error.message;
            payButton.disabled = false;
            payButton.textContent = label;
        }
    });

    // Stripe's embedded form (from the code Stripe gave us), styled to match the site
    // Stripe's script loads only when someone pays, so visitors who don't pay never contact Stripe
    function loadStripe() {
        if (typeof Stripe !== 'undefined') return Promise.resolve();
        return new Promise(function (resolve) {
            const tag = document.createElement('script');
            tag.src = 'https://js.stripe.com/dahlia/stripe.js';
            tag.onload = resolve; tag.onerror = resolve;          // the check below reports a failure
            document.head.appendChild(tag);
        });
    }

    async function showPaymentForm(clientSecret, publishableKey) {
        await loadStripe();
        if (typeof Stripe === 'undefined') throw new Error('The payment form couldn\'t load. Please check your connection and try again.');
        if (!publishableKey) throw new Error('Online payment isn\'t set up yet. Please email us to pay.');
        const stripe = Stripe(publishableKey);

        const checkout = stripe.initCheckoutFormSdk({
            clientSecret: clientSecret,
            appearance: {
                theme: 'night',
                inputs: 'spaced',
                labels: 'auto',
                variables: {
                    borderRadius: '12px',
                    colorBackground: '#0b100c',
                    colorPrimary: '#7ee96f',
                    colorText: '#ffffff',
                    colorDanger: '#ff8a80',
                    colorSuccess: '#7ee96f',
                    fontSizeBase: '16px',
                    spacingUnit: '4px'
                }
            }
        });

        const form = checkout.createForm({ layout: 'expanded' });
        form.mount('#checkout-form');

        const loadActionsResult = await checkout.loadActions();
        if (loadActionsResult.type !== 'success') throw new Error('The payment form couldn\'t load. Please try again.');

        form.on('confirm', async function (event) {
            try {
                // cards finish right here (no page change); some methods may still redirect to the return page
                const result = await loadActionsResult.actions.confirm({ formConfirmEvent: event, redirect: 'if_required' });
                if (result && result.type === 'error') {
                    payMsg.textContent = result.error.message;   // e.g. card declined
                    return;
                }
                form.unmount();
                window.trackEvent && trackEvent('payment-completed');
                payMsg.textContent = 'Payment received, thank you! Updating your order...';
                checkPaid(0);
            } catch (error) {
                payMsg.textContent = 'Payment didn\'t go through: ' + (error.message || 'please try again.');
            }
        });
    }

    // Stripe tells OUR server (webhook) a moment after paying, so ask a few times until it shows Paid
    let paidStagesShown = 0;

    function shortDate(iso) {
        return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    // ---------- CHANGE REQUESTS (until Testing begins) ----------
    const CHANGE_STATUS = { pending: 'Waiting for our reply', accepted: 'Accepted', declined: 'Not included' };
    function showChanges(order) {
        const box = document.getElementById('changeBox');
        const list = document.getElementById('changeList');
        const changes = order.changes || [];
        list.replaceChildren();
        changes.forEach(function (ch) {
            const li = document.createElement('li');
            const msg = document.createElement('p');
            msg.className = 'msg';
            msg.textContent = ch.message;
            const meta = document.createElement('p');
            meta.className = 'meta';
            meta.textContent = shortDate(ch.created_at) + ' · ' + (CHANGE_STATUS[ch.status] || ch.status) + (ch.admin_note ? ' · ' + ch.admin_note : '');
            li.append(msg, meta);
            list.appendChild(li);
        });
        const form = document.getElementById('changeForm');
        form.hidden = !order.can_request_change;
        document.getElementById('changeNote').textContent = order.can_request_change
            ? 'You can request changes until Testing begins. If a change affects the price, we\'ll email you the new payment plan before going ahead.'
            : order.status === 'cancelled' || order.status === 'complete' ? ''
            : 'Testing has started, so new change requests are closed. For anything else, reply to any of our emails.';
        box.hidden = !order.can_request_change && !changes.length;
    }

    document.getElementById('changeForm').addEventListener('submit', async function (event) {
        event.preventDefault();
        const button = document.getElementById('changeButton');
        const note = document.getElementById('changeNote');
        button.disabled = true;
        button.textContent = 'Sending...';
        try {
            const payload = Object.assign({ message: document.getElementById('changeText').value.trim() }, lastSearch);
            const response = await fetchWithWake(API_BASE + '/orders/change-request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Idempotency-Key': keyFor('change', payload) },
                body: JSON.stringify(payload)
            });
            const data = await response.json().catch(function () { return {}; });
            if (response.status === 422) throw new Error('Please describe the change in at least 10 characters.');
            if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Something went wrong. Please try again.');
            doneWith('change');
            if (data.support && window.CrisisSupport) CrisisSupport.show(note, data.support);
            document.getElementById('changeText').value = '';
            document.getElementById('lookupForm').requestSubmit();   // reload the order to show it
            setTimeout(function () { note.textContent = 'Request sent. We\'ll reply by email, usually within 2 business days.'; }, 1500);
        } catch (error) {
            note.textContent = error instanceof TypeError ? 'Our system is offline right now. Please try again in a minute.' : error.message;
        } finally {
            button.disabled = false;
            button.textContent = 'Send request';
        }
    });   // how many stages showed as paid before paying (to spot the new one)

    function checkPaid(tries) {
        setTimeout(async function () {
            try {
                const response = await fetch(API_BASE + '/orders/lookup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(lastSearch)
                });
                if (response.ok) {
                    const order = await response.json();
                    const paidNow = (order.plan || []).filter(function (p) { return p.state === 'paid'; }).length;
                    if (paidNow > paidStagesShown) { showOrder(order); return; }   // the stage now shows Paid
                }
            } catch (e) {}
            if (tries < 2) checkPaid(tries + 1);
            else payMsg.textContent = 'Payment received, thank you! It may take a minute to show as Paid here.';
        }, [2000, 4000, 8000][tries]);
    }

    // ---------- BACK FROM STRIPE ----------
    const params = new URLSearchParams(location.search);
    if (params.get('paid') === '1') {
        lookupMsg.textContent = 'Thank you! Your payment went through. Enter your email to see your order marked as paid.';
    } else if (params.get('canceled') === '1') {
        lookupMsg.textContent = 'Payment canceled, and you weren\'t charged. Enter your email to try again anytime.';
    }
