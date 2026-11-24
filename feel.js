/* =========================================================
   feel.js: how the site answers you. Loaded by nav.js on every page; styles at the end of style.css.
   (float.js handles the look and the ambient movement; this file is about responses to what you do.)

   Built around the classic animation and UX principles:
     squash & stretch, anticipation   buttons wind up when pressed and stretch back when released
     follow through, slow in/out      every release overshoots a touch and settles (springs, never linear)
     secondary action                 the main buttons throw a small ring and sparks from where you clicked
     staging                          hovering a card softly dims its neighbours; the open menu blurs the page
     moving in arcs                   menu links swing in on a curve, one after another
     exaggerated feedback             a field you missed shakes and turns red, instead of a quiet message
     snappy timing / Doherty          anything you press reacts in under 100 ms; page changes and form sends
                                      show progress straight away, well inside the 400 ms threshold
     bigger hit areas / Fitts         small buttons and icons get an invisible 44 x 44 px touch area
     Postel                           forms accept sloppy input: stray spaces, capital letters in emails,
                                      a website typed without https://
     Miller                           phone numbers group themselves as you type: (901) 555-0123
     Jakob                            the layout people expect: logo top left goes home, menu top right
     frequency of use                 press M to open the menu, / or Ctrl K to search, from any page

   Visitors with "reduce motion" on still get every response, just as quick fades and colour
   changes instead of movement.
   ========================================================= */
(function () {
    'use strict';
    if (window.__feel) return;
    window.__feel = true;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fine = window.matchMedia('(pointer: fine)').matches;
    const SPRING = 'cubic-bezier(.34, 1.56, .64, 1)';
    const OUT = 'cubic-bezier(.16, 1, .3, 1)';
    const PRESSABLE = '[data-af~="btn"], .side-tab, button:not([disabled]), [role="button"], .cmdk-item, summary';

    function ready(fn) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }
    function anim(el, frames, opts) { return el.animate ? el.animate(frames, opts) : null; }

    /* ---------- squash & stretch + anticipation: press and release ---------- */
    let pressed = null;
    // the menu button's position is locked with transform, so it squashes with the separate `scale` property instead
    function sq(el, x, y) { return el.matches('.side-tab') ? { scale: x + ' ' + y } : { transform: 'scale(' + x + ', ' + y + ')' }; }
    document.addEventListener('pointerdown', function (e) {
        if (e.button !== 0) return;
        const el = e.target.closest(PRESSABLE);
        if (!el || el.closest('.brand-name')) return;
        pressed = el;
        el.__press = reduce
            ? anim(el, [{ filter: 'brightness(1)' }, { filter: 'brightness(0.85)' }], { duration: 80, fill: 'forwards' })
            // wind-up: it squashes down a little before anything happens
            : anim(el, [sq(el, 1, 1), sq(el, 1.03, 0.9)], { duration: 90, easing: 'ease-out', fill: 'forwards' });
    }, { passive: true });

    function release() {
        const el = pressed;
        pressed = null;
        if (!el) return;
        if (el.__press) { el.__press.cancel(); el.__press = null; }
        if (reduce) return;
        // stretch past normal, then settle (follow through)
        const k = function (x, y, o) { const f = sq(el, x, y); if (o) f.offset = o; return f; };
        anim(el, [k(1.03, 0.9), k(0.97, 1.06, 0.35), k(1.01, 0.99, 0.7), k(1, 1)], { duration: 420, easing: 'ease-out' });
    }
    document.addEventListener('pointerup', release, { passive: true });
    document.addEventListener('pointercancel', release, { passive: true });

    /* ---------- secondary action: a ring and a few sparks behind the main buttons ---------- */
    function burst(x, y, dark) {
        if (reduce) return;
        const ring = document.createElement('div');
        ring.className = 'af-ring' + (dark ? ' af-dark' : '');
        ring.style.left = x + 'px';
        ring.style.top = y + 'px';
        document.body.appendChild(ring);
        anim(ring, [{ transform: 'translate(-50%,-50%) scale(0.2)', opacity: 0.9 }, { transform: 'translate(-50%,-50%) scale(2.4)', opacity: 0 }],
             { duration: 600, easing: OUT }).onfinish = function () { ring.remove(); };
        for (let i = 0; i < 7; i++) {
            const s = document.createElement('div');
            s.className = 'af-spark' + (i % 3 === 0 ? ' af-white' : '');
            s.style.left = x + 'px';
            s.style.top = y + 'px';
            document.body.appendChild(s);
            const a = (i / 7) * Math.PI * 2 + Math.random() * 0.6, d = 26 + Math.random() * 26;
            const dx = Math.cos(a) * d, dy = Math.sin(a) * d;
            // sparks travel on a slight curve: out, then dropping a little, like they have weight
            anim(s, [
                { transform: 'translate(-50%,-50%) translate(0,0) scale(1)', opacity: 1 },
                { transform: 'translate(-50%,-50%) translate(' + dx * 0.75 + 'px,' + (dy * 0.75 - 6) + 'px) scale(0.9)', opacity: 1, offset: 0.55 },
                { transform: 'translate(-50%,-50%) translate(' + dx + 'px,' + (dy + 8) + 'px) scale(0.3)', opacity: 0 }
            ], { duration: 620 + Math.random() * 200, easing: 'cubic-bezier(.2,.7,.4,1)' }).onfinish = function () { s.remove(); };
        }
    }
    document.addEventListener('click', function (e) {
        const el = e.target.closest('[data-af~="lead"], [data-af~="solid"], [data-af~="accent"], .side-tab, button[type="submit"]');
        if (!el || !e.clientX) return;
        burst(e.clientX, e.clientY, false);
    });

    /* ---------- exaggerated feedback: a missed field shakes and turns red ---------- */
    function shake(el) {
        if (!el) return;
        el.classList.add('af-bad');
        if (!reduce) anim(el, [
            { transform: 'translateX(0)' }, { transform: 'translateX(-10px)' }, { transform: 'translateX(9px)' },
            { transform: 'translateX(-6px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(-2px)' }, { transform: 'translateX(0)' }
        ], { duration: 420, easing: 'ease-out' });
        const clear = function () { el.classList.remove('af-bad'); el.removeEventListener('input', clear); el.removeEventListener('change', clear); };
        el.addEventListener('input', clear);
        el.addEventListener('change', clear);
    }
    let lastShake = 0;
    document.addEventListener('invalid', function (e) {
        // the browser fires this for every bad field at once; shake them all, but only once per try
        shake(e.target);
        const now = Date.now();
        if (now - lastShake > 300) {
            lastShake = now;
            const btn = e.target.form && e.target.form.querySelector('[type="submit"], button:not([type])');
            if (btn && !reduce) anim(btn, [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }], { duration: 300 });
        }
    }, true);
    // error messages the page shows itself (role="alert") get the same nudge when they appear
    ready(function () {
        if (!('MutationObserver' in window)) return;
        new MutationObserver(function (list) {
            list.forEach(function (m) {
                const el = (m.target.nodeType === 1 ? m.target : m.target.parentElement);
                const alert = el && el.closest('[role="alert"], .error, .form-error');
                if (alert && alert.textContent.trim() && alert.offsetParent && !alert.__afShook) {
                    alert.__afShook = true;
                    setTimeout(function () { alert.__afShook = false; }, 600);
                    if (!reduce) anim(alert, [{ transform: 'translateX(0)' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(0)' }], { duration: 380 });
                }
            });
        }).observe(document.body, { childList: true, subtree: true, characterData: true });
    });

    /* ---------- staging: hovering one card softly dims the others in its row ---------- */
    if (fine) {
        document.addEventListener('pointerover', function (e) {
            const card = e.target.closest && e.target.closest('[data-af~="surface"]');
            const group = card && card.parentElement;
            document.querySelectorAll('.af-stage').forEach(function (g) { if (g !== group) g.classList.remove('af-stage'); });
            if (!group) return;
            const peers = Array.prototype.filter.call(group.children, function (c) { return c.matches('[data-af~="surface"]'); });
            if (peers.length >= 3) group.classList.add('af-stage');
        });
    }

    /* ---------- the footer's gloss follows the cursor ---------- */
    if (fine) document.addEventListener('pointermove', function (e) {
        const f = e.target.closest && e.target.closest('footer.site-footer');
        if (!f) return;
        const r = f.getBoundingClientRect();
        f.style.setProperty('--fx', (e.clientX - r.left) + 'px');
        f.style.setProperty('--fy', (e.clientY - r.top) + 'px');
    }, { passive: true });

    /* ---------- moving in arcs + follow through: menu links swing in one by one ---------- */
    ready(function () {
        document.querySelectorAll('.side-links a, .side-links small').forEach(function (a, i) { a.style.setProperty('--n', i); });
    });

    /* ---------- Doherty threshold: show progress straight away ---------- */
    // 1. a thin bar along the top the moment you leave for another page
    let bar = null;
    function startBar() {
        if (!bar) { bar = document.createElement('div'); bar.className = 'af-progress'; document.body.appendChild(bar); }
        bar.classList.remove('af-done');
        void bar.offsetWidth;
        bar.classList.add('af-go');
        clearTimeout(bar.__t);
        bar.__t = setTimeout(function () { bar.classList.remove('af-go'); }, 7000);   // never left hanging
    }
    document.addEventListener('click', function (e) {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const a = e.target.closest('a[href]');
        if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
        let url;
        try { url = new URL(a.href, location.href); } catch (err) { return; }
        if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
        startBar();
    });
    window.addEventListener('pageshow', function () { if (bar) bar.classList.remove('af-go'); });
    // 2. a send button lights up the instant you press it, until the page answers
    document.addEventListener('submit', function (e) {
        const btn = e.submitter || (e.target.querySelector && e.target.querySelector('[type="submit"], button:not([type])'));
        if (!btn) return;
        btn.classList.add('af-pending');
        const stop = function () { btn.classList.remove('af-pending'); if (mo) mo.disconnect(); };
        const mo = 'MutationObserver' in window ? new MutationObserver(function () { setTimeout(stop, 150); }) : null;
        if (mo) mo.observe(e.target, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['disabled', 'class', 'hidden'] });
        setTimeout(stop, 8000);
    }, true);

    /* ---------- Postel: be forgiving with what people type ---------- */
    document.addEventListener('blur', function (e) {
        const el = e.target;
        if (!el || el.tagName !== 'INPUT' || el.readOnly || el.disabled) return;
        const type = (el.type || '').toLowerCase();
        if (!/^(text|email|url|search|tel)$/.test(type)) return;
        let v = el.value, out = v.replace(/^\s+|\s+$/g, '');
        if (type === 'email') out = out.replace(/\s+/g, '').replace(/^mailto:/i, '').toLowerCase();
        if (type === 'url' && out && !/^[a-z][a-z0-9+.-]*:\/\//i.test(out) && /\.[a-z]{2,}/i.test(out)) out = 'https://' + out;
        if (out !== v) {
            el.value = out;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }, true);

    /* ---------- Miller: phone numbers group themselves as you type ---------- */
    document.addEventListener('input', function (e) {
        const el = e.target;
        if (!el || el.tagName !== 'INPUT' || !(el.type === 'tel' || el.autocomplete === 'tel')) return;
        const d = el.value.replace(/\D/g, '');
        if (el.value.trim().charAt(0) === '+' || d.length > 11 || (d.length === 11 && d.charAt(0) !== '1')) return;   // international: leave it alone
        const n = d.length === 11 ? d.slice(1) : d;
        let out = n;
        if (n.length > 6) out = '(' + n.slice(0, 3) + ') ' + n.slice(3, 6) + '-' + n.slice(6, 10);
        else if (n.length > 3) out = '(' + n.slice(0, 3) + ') ' + n.slice(3);
        if (out !== el.value && e.inputType !== 'deleteContentBackward') el.value = (d.length === 11 ? '+1 ' : '') + out;
    });

    /* ---------- bigger hit areas (Fitts): small controls get a 44 x 44 touch area ---------- */
    function grow(root) {
        (root || document).querySelectorAll('a, button, summary, label[for], [role="button"], input[type="checkbox"], input[type="radio"]').forEach(function (el) {
            if (el.classList.contains('af-hit') || el.closest('p, .brand-name')) return;
            const r = el.getBoundingClientRect();
            if (!r.width || !r.height || (r.width >= 44 && r.height >= 44)) return;
            const cs = getComputedStyle(el);
            if (cs.display === 'inline' || getComputedStyle(el, '::after').content !== 'none') return;
            if (cs.position === 'static') el.classList.add('af-hit-rel');
            el.classList.add('af-hit');
        });
    }
    ready(function () { setTimeout(grow, 600); });

    /* ---------- frequency of use: M opens the menu from anywhere ---------- */
    document.addEventListener('keydown', function (e) {
        if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
        const t = e.target;
        if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
        if (e.key === 'm' || e.key === 'M') {
            const nav = document.getElementById('nav-toggle');
            if (nav) { nav.checked = !nav.checked; e.preventDefault(); }
        } else if (e.key === 'Escape') {
            const nav = document.getElementById('nav-toggle');
            if (nav && nav.checked) nav.checked = false;
        }
    });
    ready(function () {
        const tab = document.querySelector('.side-tab');
        if (tab) tab.title = 'Menu: press M. Search: press /';
    });
})();
