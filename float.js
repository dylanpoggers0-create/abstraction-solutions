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
   5. The top headline settles in once when the page opens; cards further
      down rise into place as you reach them; headings sit on a deeper layer.
   6. The brand mark at the top has a slow green aura behind the logo (style.css).

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
            amp: 2.6 + rand() * 2.4,
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

        const vh = function () { return window.innerHeight; };

        // later content (order lists, admin tabs, chat replies) gets the look too
        let pending = null;
        new MutationObserver(function () {
            if (pending) return;
            pending = setTimeout(function () {
                pending = null;
                const before = surfaces.length + buttons.length;
                scan(document.querySelector('main') || document.body);
                if (surfaces.length + buttons.length !== before) watchAll(false);
            }, 250);
        }).observe(document.querySelector('main') || document.body, { childList: true, subtree: true });

        /* cards below the first screen wait just under where they'll sit,
           then rise up into place as they come into view */
        let riseQueue = 0;
        const io = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                const b = e.target.__afBody;
                if (!b) return;
                b.visible = e.isIntersecting;
                if (e.isIntersecting && b.waiting) {
                    b.waiting = false;
                    b.riseAt = performance.now() + (riseQueue++ % 6) * 85;   // neighbours follow one another
                    setTimeout(function () { riseQueue = 0; }, 400);
                    wake();
                }
            });
        }, { rootMargin: '0px 0px -8% 0px' }) : null;

        function watchAll(first) {
            surfaces.concat(buttons).forEach(function (b) {
                if (b.el.__afBody) return;
                b.el.__afBody = b;
                if (b.kind === 'surface') {
                    const r = b.el.getBoundingClientRect();
                    if (first && !b.still && r.top > vh() * 0.92) {
                        b.waiting = true;
                        b.y = 46 + b.depth * 20;
                        b.el.style.opacity = '0';
                        b.el.style.translate = '0 ' + b.y + 'px';
                    }
                    if (!b.still && finePointer) {
                        const p = b.el.parentElement;
                        if (p && p !== document.body && !p.style.perspective) p.style.perspective = '1100px';
                    }
                    bindSurface(b);
                } else if (finePointer) bindButton(b);
                if (io) io.observe(b.el);
            });
        }

        function bindSurface(b) {
            b.el.addEventListener('pointerenter', function () { b.hover = true; add(b.el, 'lit'); b.rect = b.el.getBoundingClientRect(); wake(); });
            b.el.addEventListener('pointermove', function (e) {
                const r = b.rect || (b.rect = b.el.getBoundingClientRect());
                const lx = e.clientX - r.left, ly = e.clientY - r.top;
                b.el.style.setProperty('--mx', lx + 'px');
                b.el.style.setProperty('--my', ly + 'px');
                // tilt toward the cursor: up to about 5 degrees on a small card, less on a wide one
                const k = Math.min(1, 320 / Math.max(r.width, r.height));
                b.tiltX = ((ly / r.height) - 0.5) * -9 * k;
                b.tiltY = ((lx / r.width) - 0.5) * 9 * k;
            });
            b.el.addEventListener('pointerleave', function () {
                b.hover = false; b.rect = null; b.tiltX = 0; b.tiltY = 0;
                b.el.setAttribute('data-af', b.el.getAttribute('data-af').replace(/\s*\blit\b/, ''));
                b.el.style.removeProperty('--mx'); b.el.style.removeProperty('--my');
            });
        }

        function bindButton(b) {
            b.el.addEventListener('pointerenter', function () { b.hover = true; b.rect = b.el.getBoundingClientRect(); wake(); });
            b.el.addEventListener('pointermove', function (e) {
                const r = b.rect || (b.rect = b.el.getBoundingClientRect());
                const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
                b.tx = Math.max(-9, Math.min(9, dx * 0.2));
                b.ty = Math.max(-6, Math.min(6, dy * 0.28));
            });
            b.el.addEventListener('pointerleave', function () { b.hover = false; b.tx = 0; b.ty = 0; b.rect = null; });
            b.el.addEventListener('pointerdown', function () { b.vy += 2.6; });
        }

        watchAll(true);

        /* section headings sit on a slightly deeper layer, so the page has depth as you scroll */
        const layers = [];
        document.querySelectorAll('h2, .section-title, .section-sub, .eyebrow').forEach(function (el) {
            if (el.closest('[data-af~="surface"], ' + SKIP) || layers.length > 40) return;
            // anything on the opening screen starts exactly where the page put it
            const r0 = el.getBoundingClientRect(), mid0 = r0.top + scrollY + r0.height / 2;
            layers.push({ el: el, depth: el.matches('.section-sub') ? 0.035 : el.matches('.eyebrow') ? 0.07 : 0.06, cur: 0,
                          rest: mid0 < vh() ? mid0 - vh() / 2 : 0 });
        });

        /* the opening headline and the hero's picture/video lean a little with the cursor */
        const hero = [];
        const h1 = document.querySelector('h1');
        if (h1 && finePointer) {
            hero.push({ el: h1, f: -10, x: 0, y: 0, vx: 0, vy: 0 });
            const media = document.querySelector('.hero video, .hero img, .hero-video, .hero [data-af~="surface"]');
            if (media && !media.closest('.header-wrapper')) hero.push({ el: media.closest('[data-af~="surface"]') || media, f: 14, x: 0, y: 0, vx: 0, vy: 0, skipTranslate: true });
        }

        /* two lights behind the page: a white one that follows the cursor,
           and a wide green aura that drifts around on its own */
        function makeLight(cls) {
            const d = document.createElement('div');
            d.className = cls;
            d.setAttribute('aria-hidden', 'true');
            document.body.prepend(d);
            return d;
        }
        const light = makeLight('af-light');
        const aura = makeLight('af-aura');
        const L = { x: innerWidth * 0.7, y: innerHeight * 0.3, vx: 0, vy: 0, tx: innerWidth * 0.7, ty: innerHeight * 0.3, seen: false };
        const A = { x: innerWidth * 0.2, y: innerHeight * 0.7, vx: 0, vy: 0 };
        let px = innerWidth / 2, py = innerHeight / 2;
        if (finePointer) {
            window.addEventListener('pointermove', function (e) { L.tx = px = e.clientX; L.ty = py = e.clientY; L.seen = true; }, { passive: true });
        }

        /* the brand mark at the top scrolls away with the page */
        const header = document.querySelector('.header-container');

        /* scrolling pushes the cards, like a wake */
        let lastY = scrollY, scrollV = 0;
        window.addEventListener('scroll', function () {
            const y = scrollY;
            scrollV += y - lastY;
            lastY = y;
            document.documentElement.classList.toggle('af-scrolled', y > 40);
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
        function clamp(v, a) { return v < -a ? -a : v > a ? a : v; }

        function tick(now) {
            const dt = Math.min(2.5, (now - last) / 16.667);   // in 60fps frames, so a slow phone doesn't explode
            last = now;
            const kick = scrollV;
            scrollV = 0;
            const h = vh();
            // read first, write after: measuring between writes makes the browser redo layout
            for (let i = 0; i < layers.length; i++) layers[i].r = layers[i].el.getBoundingClientRect();

            for (let i = 0; i < surfaces.length; i++) {
                const b = surfaces[i];
                if (b.still || b.waiting) continue;
                if (!b.visible && !b.riseAt) continue;
                if (b.riseAt) {
                    if (now < b.riseAt) continue;
                    // rising: a softer spring, so it glides up and settles with a tiny overshoot
                    spring(b, 0, 0, 0.03, 0.2, dt);
                    const o = Math.max(0, Math.min(1, 1 - b.y / 60));
                    b.el.style.opacity = o > 0.995 ? '' : o.toFixed(3);
                    if (Math.abs(b.y) < 0.6 && Math.abs(b.vy) < 0.05) { b.riseAt = 0; b.el.style.opacity = ''; }
                } else {
                    // the slow bob: two sine waves at odd periods, so it never looks looped
                    const bob = Math.sin(now * b.w1 + b.p1) * b.amp + Math.sin(now * b.w2 + b.p2) * b.amp * 0.5;
                    const drift = Math.sin(now * b.w2 * 0.7 + b.p1) * b.amp * 0.6;
                    b.vy += clamp(kick * 0.06 * b.depth, 4);
                    spring(b, drift, bob + (b.hover ? -7 : 0), 0.022, 0.15, dt);
                    b.y = clamp(b.y, 22);
                }
                // tilt (cursor) + a little sway from the bob and the scroll
                b.rx = (b.rx || 0) + (((b.tiltX || 0) - b.vy * 0.25) - (b.rx || 0)) * 0.12 * dt;
                b.ry = (b.ry || 0) + (((b.tiltY || 0) + b.vx * 0.3) - (b.ry || 0)) * 0.12 * dt;
                const ang = Math.sqrt(b.rx * b.rx + b.ry * b.ry);
                b.el.style.translate = b.x.toFixed(2) + 'px ' + b.y.toFixed(2) + 'px';
                b.el.style.rotate = ang < 0.02 ? '' : (b.rx / ang).toFixed(3) + ' ' + (b.ry / ang).toFixed(3) + ' 0 ' + ang.toFixed(3) + 'deg';
            }

            for (let i = 0; i < buttons.length; i++) {
                const b = buttons[i];
                if (!b.visible) continue;
                spring(b, b.tx, b.ty, 0.09, 0.3, dt);
                const moving = Math.abs(b.x) + Math.abs(b.y) + Math.abs(b.vx) + Math.abs(b.vy) > 0.02;
                if (moving || b.hover) {
                    b.el.style.translate = b.x.toFixed(2) + 'px ' + b.y.toFixed(2) + 'px';
                    b.rested = false;
                } else if (!b.rested) {
                    b.x = b.y = b.vx = b.vy = 0;
                    b.el.style.translate = '';
                    b.rested = true;
                }
            }

            // headings drift at their own depth as they pass through the screen
            for (let i = 0; i < layers.length; i++) {
                const l = layers[i];
                const r = l.r;
                if (r.bottom < -100 || r.top > h + 100) continue;
                const off = clamp(((r.top + r.height / 2 - l.cur - h / 2) - l.rest) * l.depth, 28);
                l.cur += (off - l.cur) * 0.2 * dt;
                l.el.style.translate = '0 ' + l.cur.toFixed(2) + 'px';
            }

            // hero lean
            const nx = (px / innerWidth) - 0.5, ny = (py / innerHeight) - 0.5;
            for (let i = 0; i < hero.length; i++) {
                const o = hero[i];
                spring(o, nx * o.f, ny * o.f * 0.6, 0.03, 0.22, dt);
                if (!o.skipTranslate) o.el.style.translate = o.x.toFixed(2) + 'px ' + o.y.toFixed(2) + 'px';
                else if (o.el.__afBody) { o.el.__afBody.tiltY = (o.el.__afBody.hover ? o.el.__afBody.tiltY : o.x * 0.25); o.el.__afBody.tiltX = o.el.__afBody.hover ? o.el.__afBody.tiltX : -o.y * 0.25; }
            }

            // lights
            if (!L.seen) {
                L.tx = innerWidth * (0.55 + 0.25 * Math.sin(now * 0.00012));
                L.ty = innerHeight * (0.35 + 0.2 * Math.sin(now * 0.00009 + 1.3));
            }
            spring(L, L.tx, L.ty, 0.012, 0.14, dt);
            light.style.translate = L.x.toFixed(1) + 'px ' + L.y.toFixed(1) + 'px';
            spring(A,
                innerWidth * (0.5 + 0.42 * Math.sin(now * 0.000071)) + (L.x - innerWidth / 2) * 0.15,
                innerHeight * (0.55 + 0.35 * Math.sin(now * 0.000053 + 2.1)) - kick * 0.5,
                0.004, 0.09, dt);
            aura.style.translate = A.x.toFixed(1) + 'px ' + A.y.toFixed(1) + 'px';


            if (!document.hidden) requestAnimationFrame(tick); else running = false;
        }

        /* ---------- the one entrance: the top of the page settles in ---------- */
        (function intro() {
            if (!h1 || scrollY > 200) return;
            const group = [h1];
            let sib = h1.nextElementSibling, n = 0;
            while (sib && n < 3) { group.push(sib); sib = sib.nextElementSibling; n++; }
            const prev = h1.previousElementSibling;
            if (prev) group.unshift(prev);
            const name = header && header.querySelector('.brand-name');
            if (name && !name.querySelector('.af-ch')) {
                name.setAttribute('aria-label', name.textContent);
                // letters are wrapped per word, so a phone breaks the line between words, never inside one
                name.innerHTML = name.textContent.split(' ').map(function (word) {
                    return '<span class="af-w" aria-hidden="true">' + word.split('').map(function (ch) {
                        return '<span class="af-ch">' + ch + '</span>';
                    }).join('') + '</span>';
                }).join(' ');
            }
            function play() {
                if (name) name.querySelectorAll('.af-ch').forEach(function (ch, i) {
                    ch.animate([
                        { opacity: 0, transform: 'translateY(0.45em) rotate(4deg)', filter: 'blur(6px)' },
                        { opacity: 1, transform: 'none', filter: 'blur(0)' }
                    ], { duration: 900, delay: 120 + i * 32, easing: 'cubic-bezier(.16, 1, .3, 1)', fill: 'backwards' });
                });
                group.forEach(function (el, i) {
                    if (!el.animate) return;
                    el.animate([
                        { opacity: 0, transform: 'translateY(26px)', filter: 'blur(8px)' },
                        { opacity: 1, transform: 'none', filter: 'blur(0)' }
                    ], { duration: 1100, delay: 520 + i * 110, easing: 'cubic-bezier(.16, 1, .3, 1)', fill: 'backwards' });
                });
                const logo = header && header.querySelector('img');
                if (logo && logo.animate) logo.animate([
                    { opacity: 0, transform: 'scale(.6) rotate(-20deg)' },
                    { opacity: 1, transform: 'none' }
                ], { duration: 1000, easing: 'cubic-bezier(.34, 1.56, .64, 1)', fill: 'backwards' });
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
