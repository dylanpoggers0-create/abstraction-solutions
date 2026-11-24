/* =========================================================
   rewards.js: the Rewards panel. Loaded by account.js the first time someone opens it
   (the coin button next to Account, "Your coins and rewards" in the account panel, or any link to #rewards).

   Shows your coin balance, a bar to the next discount with a coin on each tier, the four discounts
   (unlocked ones have a Redeem button and a confirm step), your discount code if you have one,
   the videos you've earned coins for, and the rules in one line.

   Every number comes from the server (GET /api/rewards); redeeming is POST /api/rewards/redeem,
   which checks the coins, spends them and makes the code. Nothing here decides a balance.
   ========================================================= */
(function () {
    'use strict';
    if (window.ASRewards) return;

    const API = 'https://abstraction-quote-engine.onrender.com';
    const s = document.querySelector('script[src*="rewards.js"]');
    const BASE = s ? s.src.replace(/rewards(\.min)?\.js.*$/, '') : '/';
    const COIN = BASE + 'assets/coin.svg';

    let box = null, opener = null, data = null, confirming = null, busy = false;
    function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function coinImg(size) { const i = el('img'); i.src = COIN; i.alt = ''; i.width = size; i.height = size; return i; }
    function day(iso) {
        try {
            const d = new Date(iso), o = { day: 'numeric', month: 'short' };
            if (d.getFullYear() !== new Date().getFullYear()) o.year = 'numeric';
            return d.toLocaleDateString(undefined, o);
        } catch (e) { return ''; }
    }

    function build() {
        box = el('div', 'rw-backdrop');
        box.hidden = true;
        box.innerHTML =
            '<div class="rw-panel" role="dialog" aria-modal="true" aria-labelledby="rwTitle">' +
                '<button type="button" class="rw-close" aria-label="Close">' +
                    '<svg viewBox="0 0 24 24" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' +
                '<h2 id="rwTitle">Your coins</h2>' +
                '<div class="rw-body"><p class="rw-msg" role="status">Loading…</p></div>' +
            '</div>';
        document.body.appendChild(box);
        box.addEventListener('click', function (e) { if (e.target === box) close(); });
        box.querySelector('.rw-close').addEventListener('click', close);
        document.addEventListener('keydown', function (e) {
            if (box.hidden) return;
            if (e.key === 'Escape') { e.preventDefault(); if (confirming) { confirming = null; render(); } else close(); return; }
            if (e.key !== 'Tab') return;
            const f = Array.prototype.filter.call(box.querySelectorAll('button, a[href]'), function (x) { return x.offsetParent !== null && !x.disabled; });
            if (!f.length) return;
            if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
            else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
        });
    }

    function open(from) {
        if (!box) build();
        opener = from || document.activeElement;
        confirming = null;
        box.hidden = false;
        document.documentElement.classList.add('rw-open');
        requestAnimationFrame(function () { box.classList.add('is-open'); });
        setTimeout(function () { box.querySelector('.rw-close').focus(); }, 60);
        if (data) render();
        load();
    }
    function close() {
        if (!box || box.hidden) return;
        box.classList.remove('is-open');
        document.documentElement.classList.remove('rw-open');
        setTimeout(function () { box.hidden = true; }, 200);
        if (opener && opener.focus) opener.focus();
    }

    function load() {
        const p = window.ASCoins ? ASCoins.refresh(true) : Promise.resolve(null);
        p.then(function (d) {
            if (d) { data = d; render(); return; }
            if (!data) body().innerHTML = '<p class="rw-msg is-bad" role="status">Couldn\'t load your coins just now. Please try again in a moment.</p>';
        });
    }
    function body() { return box.querySelector('.rw-body'); }

    function render() {
        const b = body(), cfg = data.config, tiers = cfg.tiers, bal = data.balance;
        const top = tiers[tiers.length - 1].coins;
        const next = tiers.filter(function (t) { return t.coins > bal; })[0];
        const open = (data.codes || []).filter(function (c) { return !c.used_at; })[0];
        const focusKey = document.activeElement && document.activeElement.getAttribute('data-k');
        b.textContent = '';

        // balance
        const head = el('div', 'rw-balance');
        head.appendChild(coinImg(56));
        const n = el('div');
        n.appendChild(el('strong', null, String(bal)));
        n.appendChild(el('span', null, bal === 1 ? ' coin' : ' coins'));
        head.appendChild(n);
        b.appendChild(head);
        b.appendChild(el('p', 'rw-next', next ? (next.coins - bal) + ' more to unlock ' + next.percent + '% off.'
                                               : 'You\'ve unlocked every discount, up to ' + tiers[tiers.length - 1].percent + '% off.'));

        // the bar, with a coin on each tier
        const track = el('div', 'rw-track');
        track.setAttribute('role', 'progressbar');
        track.setAttribute('aria-label', 'Coins toward the top discount');
        track.setAttribute('aria-valuemin', '0');
        track.setAttribute('aria-valuemax', String(top));
        track.setAttribute('aria-valuenow', String(Math.min(bal, top)));
        const fill = el('div', 'rw-fill');
        fill.style.width = Math.min(100, bal / top * 100) + '%';
        track.appendChild(fill);
        tiers.forEach(function (t) {
            const m = el('div', 'rw-mark' + (bal >= t.coins ? ' is-reached' : ''));
            m.style.left = (t.coins / top * 100) + '%';
            m.appendChild(coinImg(28));
            m.appendChild(el('span', null, String(t.coins)));
            track.appendChild(m);
        });
        b.appendChild(track);

        // the discounts
        const list = el('ul', 'rw-tiers');
        tiers.forEach(function (t) {
            const unlocked = bal >= t.coins;
            const li = el('li', 'rw-tier' + (unlocked ? ' is-unlocked' : ''));
            li.appendChild(el('strong', null, t.percent + '%'));
            li.appendChild(el('small', null, t.coins + ' coins'));
            const btn = el('button', null, unlocked ? 'Redeem' : 'Locked');
            btn.type = 'button';
            btn.setAttribute('data-k', 'tier' + t.percent);
            btn.disabled = !unlocked || !!open || busy;
            btn.setAttribute('aria-label', unlocked ? 'Redeem ' + t.coins + ' coins for ' + t.percent + '% off one project'
                                                    : t.percent + '% off: needs ' + t.coins + ' coins');
            btn.addEventListener('click', function () { confirming = t; render(); });
            li.appendChild(btn);
            list.appendChild(li);
        });
        b.appendChild(list);

        // the confirm step
        if (confirming) {
            const c = el('div', 'rw-confirm');
            c.appendChild(el('p', null, 'Spend ' + confirming.coins + ' coins for ' + confirming.percent + '% off one project?'));
            const row = el('div');
            const yes = el('button', null, busy ? 'Redeeming…' : 'Yes, redeem');
            yes.type = 'button'; yes.disabled = busy; yes.setAttribute('data-k', 'yes');
            yes.addEventListener('click', function () { redeem(confirming); });
            const no = el('button', 'rw-ghost', 'Cancel');
            no.type = 'button'; no.disabled = busy;
            no.addEventListener('click', function () { confirming = null; render(); });
            row.appendChild(yes); row.appendChild(no);
            c.appendChild(row);
            b.appendChild(c);
            if (!busy) setTimeout(function () { yes.focus(); }, 0);
        }

        // your code
        if (open) {
            const c = el('div', 'rw-code');
            c.appendChild(el('p', null, 'Your code for ' + open.percent + '% off one project'));
            c.appendChild(el('strong', null, open.code));
            c.appendChild(el('p', null, 'Mention this code when you book. It works once, and you can get another after it\'s used.'));
            b.appendChild(c);
        }
        const msg = el('p', 'rw-msg');
        msg.setAttribute('role', 'status');
        b.appendChild(msg);

        // what you've earned
        b.appendChild(el('h3', null, 'Coins earned'));
        if (data.earned && data.earned.length) {
            const ul = el('ul', 'rw-list');
            data.earned.forEach(function (e) {
                const li = el('li');
                li.appendChild(el('span', null, e.title));
                li.appendChild(el('span', 'rw-coins', '+' + e.coins));
                const tm = el('time', null, day(e.awarded_at));
                tm.dateTime = e.awarded_at;
                li.appendChild(tm);
                ul.appendChild(li);
            });
            b.appendChild(ul);
        } else {
            const p = el('p', 'rw-empty', 'Nothing yet. Watch an ');
            const a = el('a', null, 'AI Education video');
            a.href = BASE + 'services/education.html#shorts';
            p.appendChild(a);
            p.appendChild(document.createTextNode(' all the way through to earn your first coins.'));
            b.appendChild(p);
        }

        // the rules, in one line
        const rows = cfg.coins_by_length;
        b.appendChild(el('p', 'rw-rules',
            'Finish a video to earn coins once: ' + rows.map(function (r, i) {
                return r.up_to_seconds == null ? 'longer earns ' + r.coins
                                               : 'up to ' + r.up_to_seconds + ' seconds earns ' + r.coins;
            }).join(', ') + '. Only time you actually watch counts. Spend coins on one discount at a time, up to ' +
            tiers[tiers.length - 1].percent + '% off.'));

        if (focusKey && !confirming) { const f = b.querySelector('[data-k="' + focusKey + '"]'); if (f && !f.disabled) f.focus(); }
    }

    function redeem(t) {
        const token = window.ASAccount && ASAccount.token();
        if (!token || busy) return;
        busy = true;
        render();
        fetch(API + '/api/rewards/redeem', {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
            body: JSON.stringify({ percent: t.percent })
        }).then(function (r) {
            return r.json().catch(function () { return {}; }).then(function (d) {
                if (!r.ok) throw new Error(d.detail || 'Couldn\'t redeem just now. Please try again.');
                return d;
            });
        }).then(function (d) {
            busy = false; confirming = null;
            data.balance = d.balance;
            data.codes = [{ code: d.code, percent: d.percent, coins_spent: d.coins_spent, created_at: d.created_at, used_at: null }].concat(data.codes || []);
            if (window.ASCoins) ASCoins.set(d.balance);
            render();
            body().querySelector('.rw-msg').textContent = 'Done: ' + d.coins_spent + ' coins spent. Your code is above.';
            window.trackEvent && trackEvent('rewards-redeem');
        }).catch(function (err) {
            busy = false; confirming = null;
            render();
            const m = body().querySelector('.rw-msg');
            m.textContent = err instanceof TypeError ? 'Our system is waking up or offline. Please try again in a moment.' : err.message;
            m.classList.add('is-bad');
            load();
        });
    }

    window.ASRewards = { open: open, close: close };
})();
