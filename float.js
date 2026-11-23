/* =========================================================
   float.js: makes the page feel like it is floating.
   Loaded by nav.js on every page. Styles live at the bottom of style.css.

   What it does:
   1. Finds the cards, buttons and text boxes on the page and tags them
      (data-af="surface" / "btn" / "field") so style.css can restyle them
      without every page needing new class names.
   2. Cards bob very gently, like they're resting on water, and when you
      scroll they lag a little and settle back (a soft spring, not a fixed
      animation, so no two cards move the same).
   3. Buttons lean toward your cursor and spring back when you leave.
   4. A soft white light follows the cursor behind the page, and across cards.
   5. The top headline settles in once when the page opens.

   Nothing here changes text or layout. Visitors with "reduce motion" on get
   the new look (step 1) with no movement at all.
   ========================================================= */
(function () {
    'use strict';
    if (window.__float) return;
    window.__float = true;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finePointer = window.matchMedia('(pointer: fine)').matches;
    const isAdmin = /\/admin(\.html)?$/.test(location.pathname);   // a work screen: styled, but kept still

    /* ---------- 1. tagging ---------- */
    const SKIP = '.side-nav, .side-tab, .header-wrapper, video, iframe, svg, canvas, [data-af-skip]';

    function rgba(str) {
        const m = str && str.match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
        return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    }
    function lum(c) { return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255; }
    function radius(cs) { return parseFloat(cs.borderTopLeftRadius) || 0; }
    function add(el, word) {
        const cur = (el.getAttribute('data-af') || '').split(' ').filter(Boolean);
        if (cur.indexOf(word) === -1) { cur.push(word); el.setAttribute('data-af', cur.join(' ')); }
    }
    function has(el, word) { return (' ' + (el.getAttribute('data-af') || '') + ' ').indexOf(' ' + word + ' ') !== -1; }

    const surfaces = [];
    const buttons = [];

    function tagButton(el, cs) {
        if (el.closest(SKIP) || has(el, 'btn')) return;
        const r = el.getBoundingClientRect();
        if (r.height < 26 || r.height > 90 || r.width < 40 || r.width > 640) return;
        const bg = rgba(cs.backgroundColor);
        const bw = parseFloat(cs.borderTopWidth) || 0;
        const bc = rgba(cs.borderTopColor);
        const solid = bg && bg.a > 0.6 && lum(bg) > 0.35;
        const outlined = bw >= 1 && bc && bc.a > 0.3 && (!bg || bg.a < 0.6 || lum(bg) < 0.15);
        if (!solid && !outlined) return;
        if (radius(cs) < 6) return;
        add(el, 'btn');
        if (solid) add(el, 'solid');
        else if (bc.g > 150 && bc.r < 180 && bc.b < 170) add(el, 'accent');   // green edged
        else if (lum(bc) > 0.6) add(el, 'ghost');                           // white edged
        buttons.push(makeBody(el, 'btn'));
    }

    function tagSurface(el, cs) {
        if (el.closest(SKIP) || has(el, 'surface') || has(el, 'btn')) return;
        const bg = rgba(cs.backgroundColor);
        if (!bg || bg.a < 0.25 || lum(bg) > 0.2) return;
        if (radius(cs) < 8) return;
        const r = el.getBoundingClientRect();
        if (r.width < 54 || r.height < 34) return;
        // small boxes (icon squares) only get an etched look, never their own motion
        if (r.width < 150 || r.height < 70) {
            if (el.parentElement && el.parentElement.closest('[data-af~="surface"]')) add(el, 'chip');
            return;
        }
        add(el, 'surface');
        const nested = el.parentElement && el.parentElement.closest('[data-af~="surface"]');
        const tall = r.height > window.innerHeight * 0.85;
        const holdsForm = !!el.querySelector('input:not([type=checkbox]):not([type=radio]), textarea, select');
        const body = makeBody(el, 'surface');
        body.still = isAdmin || !!nested || tall || holdsForm;
        surfaces.push(body);
    }

    function tagField(el) {
        if (el.closest(SKIP)) return;
        if (/checkbox|radio|range|hidden|file|submit|button/.test(el.type || '')) return;
        add(el, 'field');
    }

    function scan(root) {
        const scope = root || document.querySelector('main') || document.body;
        // surfaces first (parents before children), then buttons, then fields
        scope.querySelectorAll('div, section, article, aside, form, li, figure, details, fieldset, a').forEach(function (el) {
            if (el.tagName === 'A' || el.matches('.pill, button')) return;
            tagSurface(el, getComputedStyle(el));
        });
        scope.querySelectorAll('a, button, input[type=submit], input[type=button], .pill, summary').forEach(function (el) {
            tagButton(el, getComputedStyle(el));
        });
        scope.querySelectorAll('a').forEach(function (el) {
            // link cards (a whole card that is a link) are surfaces too
            if (!has(el, 'btn')) tagSurface(el, getComputedStyle(el));
        });
        scope.querySelectorAll('input, textarea, select').forEach(tagField);
        // the newsletter box and anything else outside <main>
        if (!root) {
            document.querySelectorAll('[data-newsletter], footer').forEach(function (el) {
                if (scope.contains(el)) return;
                el.querySelectorAll('div, form').forEach(function (d) { tagSurface(d, getComputedStyle(d)); });
                el.querySelectorAll('a, button').forEach(function (b) { tagButton(b, getComputedStyle(b)); });
                el.querySelectorAll('input, textarea, select').forEach(tagField);
            });
        }
    }

    /* ---------- physics bodies ---------- */
    let seed = 7;
    function rand() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }

    function makeBody(el, kind) {
        return {
            el: el,
            kind: kind,
            x: 0, y: 0, vx: 0, vy: 0, rot: 0, vr: 0,
            // every card gets its own slow rhythm, so they never move in step
            p1: rand() * 6.283, p2: rand() * 6.283,
            w1: 0.00055 + rand() * 0.00035, w2: 0.00031 + rand() * 0.0002,
            amp: 1.6 + rand() * 1.6,
            depth: 0.55 + rand() * 0.6,   // how far it lags when you scroll
            tx: 0, ty: 0,                 // where the cursor is pulling it
            hover: false,
            visible: true,
            still: false,
            rect: null,
            rested: true
        };
    }

    /* ---------- run ---------- */
    function start() {
        scan();
        // one white lead button: the first plain button in the opening screen, if there is one
        const first = Array.prototype.find.call(document.querySelectorAll('[data-af~="ghost"]'), function (el) {
            const r = el.getBoundingClientRect();
            return r.top < window.innerHeight && r.width > 120 && !el.closest('[data-af~="surface"]');
        });
        function pinned(el) {   // the floating chat button etc. don't count
            for (; el && el !== document.body; el = el.parentElement) if (getComputedStyle(el).position === 'fixed') return true;
            return false;
        }
        const greenUp = Array.prototype.some.call(document.querySelectorAll('[data-af~="accent"], [data-af~="solid"]'), function (el) {
            return el.getBoundingClientRect().top < window.innerHeight && !pinned(el);
        });
        if (first && !greenUp && !isAdmin) add(first, 'lead');   // never compete with a green call to action
        if (reduce) return;

        // later content (order lists, admin tabs, chat replies) gets the look too
        let pending = null;
        new MutationObserver(function (list) {
            if (pending) return;
            pending = setTimeout(function () {
                pending = null;
                const main = document.querySelector('main') || document.body;
                const before = surfaces.length + buttons.length;
                scan(main);
                if (surfaces.length + buttons.length !== before) watchAll();
            }, 250);
        }).observe(document.querySelector('main') || document.body, { childList: true, subtree: true });

        const io = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                const b = e.target.__afBody;
                if (b) b.visible = e.isIntersecting;
            });
        }, { rootMargin: '80px' }) : null;

        function watchAll() {
            surfaces.concat(buttons).forEach(function (b) {
                if (b.el.__afBody) return;
                b.el.__afBody = b;
                if (io) io.observe(b.el);
                if (b.kind === 'surface') bindSurface(b);
                else if (finePointer) bindButton(b);
            });
        }

        function bindSurface(b) {
            b.el.addEventListener('pointerenter', function () { b.hover = true; add(b.el, 'lit'); b.rect = b.el.getBoundingClientRect(); });
            b.el.addEventListener('pointermove', function (e) {
                const r = b.rect || (b.rect = b.el.getBoundingClientRect());
                b.el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
                b.el.style.setProperty('--my', (e.clientY - r.top) + 'px');
            });
            b.el.addEventListener('pointerleave', function () {
                b.hover = false; b.rect = null;
                b.el.setAttribute('data-af', b.el.getAttribute('data-af').replace(/\s*\blit\b/, ''));
                b.el.style.removeProperty('--mx'); b.el.style.removeProperty('--my');
            });
        }

        function bindButton(b) {
            b.el.addEventListener('pointerenter', function () { b.hover = true; b.rect = b.el.getBoundingClientRect(); wake(); });
            b.el.addEventListener('pointermove', function (e) {
                const r = b.rect || (b.rect = b.el.getBoundingClientRect());
                const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
                b.tx = Math.max(-7, Math.min(7, dx * 0.16));
                b.ty = Math.max(-5, Math.min(5, dy * 0.22));
                wake();
            });
            b.el.addEventListener('pointerleave', function () { b.hover = false; b.tx = 0; b.ty = 0; b.rect = null; wake(); });
            b.el.addEventListener('pointerdown', function () { b.vy += 2.2; wake(); });
        }

        watchAll();

        /* the light behind the page */
        const light = document.createElement('div');
        light.className = 'af-light';
        light.setAttribute('aria-hidden', 'true');
        document.body.prepend(light);
        const L = { x: innerWidth * 0.7, y: innerHeight * 0.3, vx: 0, vy: 0, tx: innerWidth * 0.7, ty: innerHeight * 0.3, seen: false };
        if (finePointer) {
            window.addEventListener('pointermove', function (e) { L.tx = e.clientX; L.ty = e.clientY; L.seen = true; wake(); }, { passive: true });
        }

        /* header: settles smaller once you scroll */
        const header = document.querySelector('.header-container');
        const H = { y: 0, vy: 0 };

        /* scrolling pushes the cards, like a wake */
        let lastY = scrollY, scrollV = 0;
        window.addEventListener('scroll', function () {
            const y = scrollY;
            scrollV += y - lastY;
            lastY = y;
            document.documentElement.classList.toggle('af-scrolled', y > 40);
            wake();
        }, { passive: true });

        /* ---------- the one loop ---------- */
        let running = false, last = 0;
        function wake() { if (!running && !document.hidden) { running = true; last = performance.now(); requestAnimationFrame(tick); } }
        document.addEventListener('visibilitychange', function () { if (!document.hidden) wake(); });

        function spring(b, tx, ty, k, c, dt) {
            b.vx += (-(b.x - tx) * k - b.vx * c) * dt;
            b.vy += (-(b.y - ty) * k - b.vy * c) * dt;
            b.x += b.vx * dt;
            b.y += b.vy * dt;
        }

        function tick(now) {
            const dt = Math.min(2.5, (now - last) / 16.667);   // in 60fps frames, so a slow phone doesn't explode
            last = now;
            const kick = scrollV;
            scrollV = 0;
            let busy = false;

            for (let i = 0; i < surfaces.length; i++) {
                const b = surfaces[i];
                if (b.still || !b.visible) continue;
                // the slow bob: two sine waves at odd periods, so it never looks looped
                const bob = Math.sin(now * b.w1 + b.p1) * b.amp + Math.sin(now * b.w2 + b.p2) * b.amp * 0.45;
                const drift = Math.sin(now * b.w2 * 0.7 + b.p1) * b.amp * 0.35;
                b.vy += Math.max(-3, Math.min(3, kick * 0.045 * b.depth));
                spring(b, drift, bob + (b.hover ? -5 : 0), 0.022, 0.16, dt);
                b.y = Math.max(-16, Math.min(16, b.y));
                const r = Math.max(-0.5, Math.min(0.5, b.vy * 0.06));
                b.el.style.translate = b.x.toFixed(2) + 'px ' + b.y.toFixed(2) + 'px';
                b.el.style.rotate = Math.abs(r) < 0.01 ? '' : r.toFixed(3) + 'deg';
                busy = true;   // cards are always gently moving while on screen
            }

            for (let i = 0; i < buttons.length; i++) {
                const b = buttons[i];
                if (!b.visible) continue;
                spring(b, b.tx, b.ty, 0.09, 0.32, dt);
                const moving = Math.abs(b.x) + Math.abs(b.y) + Math.abs(b.vx) + Math.abs(b.vy) > 0.02;
                if (moving || b.hover) {
                    b.el.style.translate = b.x.toFixed(2) + 'px ' + b.y.toFixed(2) + 'px';
                    busy = true;
                    b.rested = false;
                } else if (!b.rested) {
                    b.x = b.y = b.vx = b.vy = 0;
                    b.el.style.translate = '';
                    b.rested = true;
                }
            }

            // light: follows the cursor lazily; with no cursor it wanders on its own
            if (!L.seen) {
                L.tx = innerWidth * (0.55 + 0.25 * Math.sin(now * 0.00012));
                L.ty = innerHeight * (0.35 + 0.2 * Math.sin(now * 0.00009 + 1.3));
            }
            spring(L, L.tx, L.ty, 0.012, 0.14, dt);
            light.style.translate = L.x.toFixed(1) + 'px ' + L.y.toFixed(1) + 'px';

            if (header) {
                H.vy += Math.max(-2, Math.min(2, kick * 0.03));
                spring(H, 0, Math.sin(now * 0.0007) * 1.2, 0.03, 0.2, dt);
                header.style.translate = '0 ' + H.y.toFixed(2) + 'px';
            }

            busy = true;   // the light and header keep breathing while the tab is open
            if (busy && !document.hidden) requestAnimationFrame(tick); else running = false;
        }

        /* ---------- 5. the one entrance: the top headline settles in ---------- */
        (function intro() {
            const h1 = document.querySelector('main h1, .hero h1, h1');
            if (!h1 || scrollY > 200) return;
            const group = [h1];
            let sib = h1.nextElementSibling, n = 0;
            while (sib && n < 3) { group.push(sib); sib = sib.nextElementSibling; n++; }
            const prev = h1.previousElementSibling;
            if (prev) group.unshift(prev);
            function play() {
                group.forEach(function (el, i) {
                    if (!el.animate) return;
                    el.animate([
                        { opacity: 0, translate: '0 18px', filter: 'blur(6px)' },
                        { opacity: 1, translate: '0 0', filter: 'blur(0)' }
                    ], { duration: 900, delay: 60 + i * 90, easing: 'cubic-bezier(.16, 1, .3, 1)', fill: 'backwards' });
                });
            }
            // prerendered pages wait until they're actually shown
            if (document.prerendering) document.addEventListener('prerenderingchange', play, { once: true });
            else play();
        })();

        wake();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
