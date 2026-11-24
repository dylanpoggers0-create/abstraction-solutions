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
   5. Words of headings rise in one by one as they come on screen; the big headline
      keeps drifting; cards further down rise into place; headings sit on a deeper layer.
   6. The brand mark at the top has a slow green aura behind the logo (style.css).
   7. Every few seconds the title glitches: binary decode, typefaces, bit waves, noise.

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
    const SKIP = '.side-nav, .side-tab, .acct-tab, .acct-backdrop, .coin-tab, .rw-backdrop, .vp-coin, .coin-toast, .header-wrapper, .chat-box, video, iframe, svg, canvas, [data-af-skip]';   // the chat window keeps its own solid look

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
                        b.x = (surfaces.indexOf(b) % 2 ? 1 : -1) * (10 + b.depth * 10);   // starts off to one side, so it rises on a curve
                        b.el.style.opacity = '0';
                        b.el.style.translate = b.x + 'px ' + b.y + 'px';
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

        // the chat button is added by nav.js, sometimes after this runs: give it the same spring as the others
        function adoptLate() {
            document.querySelectorAll('.chat-btn').forEach(function (el) {
                if (el.__afBody || buttons.some(function (b) { return b.el === el; })) return;
                buttons.push(makeBody(el, 'btn'));
                watchAll(false);
            });
        }
        adoptLate();
        window.addEventListener('load', adoptLate);
        setTimeout(adoptLate, 1500);

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
                    // sideways settles faster than upward, so the path is an arc, not a straight line
                    b.vx += (-b.x * 0.06 - b.vx * 0.3) * dt; b.x += b.vx * dt;
                    b.vy += (-b.y * 0.03 - b.vy * 0.2) * dt; b.y += b.vy * dt;
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

        /* ---------- 5. words rise in, one after another ----------
           Headings, sub-headings and the opening paragraph are split into words. Each block's
           words rise into place as it comes on screen. The big headline's words then keep
           drifting gently, and lean toward the cursor. */
        const OUT = 'cubic-bezier(.16, 1, .3, 1)';
        function splitWords(el) {
            if (el.__afSplit) return el.__afSplit;
            const words = [];
            (function walk(node) {
                Array.prototype.slice.call(node.childNodes).forEach(function (n) {
                    if (n.nodeType === 3) {
                        if (!n.nodeValue.trim()) return;
                        const frag = document.createDocumentFragment();
                        n.nodeValue.split(/(\s+)/).forEach(function (part) {
                            if (!part) return;
                            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
                            const w = document.createElement('af-w');
                            w.textContent = part;
                            words.push(w);
                            frag.appendChild(w);
                        });
                        n.parentNode.replaceChild(frag, n);
                    } else if (n.nodeType === 1 && !/^(SVG|IMG|BR|INPUT|BUTTON|AF-W)$/i.test(n.tagName)) {
                        walk(n);
                    }
                });
            })(el);
            el.__afSplit = words;
            return words;
        }

        const name = header && header.querySelector('.brand-name');
        if (name && !name.querySelector('.af-ch')) {
            name.setAttribute('aria-label', name.textContent);
            // letters are wrapped per word, so a phone breaks the line between words, never inside one
            name.innerHTML = name.textContent.split(' ').map(function (word) {
                return '<span class="af-w" aria-hidden="true">' + word.split('').map(function (ch) {
                    return '<span class="af-ch" data-c="' + ch + '">' + ch + '</span>';
                }).join('') + '</span>';
            }).join(' ');
            // each letter carries its own colour and light from here on (see style.css), so it can move on its own
            name.querySelectorAll('.af-ch').forEach(function (ch, i) { ch.style.setProperty('--i', i); });
            name.classList.add('af-split');
        }

        const firstScreen = scrollY < 200;
        const texts = [];
        document.querySelectorAll('h1, h2, h3, .section-title, .section-sub, .eyebrow, .hero-text p, .hero > p, .lead').forEach(function (el) {
            if (el.closest('.header-wrapper, .side-nav, footer, form, [data-af~="btn"], [data-af-skip]')) return;
            if (texts.indexOf(el) !== -1 || el.querySelector('input, select, textarea, video, img')) return;
            const n = (el.textContent.match(/\S+/g) || []).length;
            if (!n || n > 70) return;
            texts.push(el);
        });

        function reveal(el, extraDelay) {
            const words = splitWords(el);
            const big = /^H1$/.test(el.tagName);
            const step = big ? 70 : words.length > 25 ? 14 : 34;
            words.forEach(function (w, i) {
                w.style.opacity = '';
                w.animate([
                    { opacity: 0, transform: 'translateY(' + (big ? 0.55 : 0.7) + 'em) rotate(' + (big ? 5 : 2) + 'deg)', filter: 'blur(' + (big ? 10 : 6) + 'px)' },
                    { opacity: 1, transform: 'none', filter: 'blur(0)' }
                ], { duration: big ? 1300 : 950, delay: extraDelay + Math.min(i * step, 1100), easing: OUT, fill: 'backwards' });
            });
            if (big) drift(el, words);
        }

        // the big headline keeps moving: each word drifts on its own slow beat, and leans toward the cursor
        function drift(el, words) {
            words.forEach(function (w, i) {
                w.animate([{ translate: '0 0' }, { translate: '0 ' + (-3 - Math.random() * 3).toFixed(1) + 'px' }], {
                    duration: 2400 + Math.random() * 1800, delay: 1400 + i * 120, direction: 'alternate',
                    iterations: Infinity, easing: 'ease-in-out', fill: 'backwards'
                });
                w.style.transition = 'scale 0.6s cubic-bezier(.34, 1.56, .64, 1), rotate 0.6s cubic-bezier(.34, 1.56, .64, 1)';
            });
            if (!finePointer) return;
            el.addEventListener('pointermove', function (e) {
                words.forEach(function (w) {
                    const r = w.getBoundingClientRect();
                    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
                    const d = Math.sqrt(dx * dx + dy * dy), k = Math.max(0, 1 - d / 260);
                    w.style.scale = (1 + k * 0.07).toFixed(3);
                    w.style.rotate = (clamp(dx, 200) / 200 * -3 * k).toFixed(2) + 'deg';
                });
            });
            el.addEventListener('pointerleave', function () {
                words.forEach(function (w) { w.style.scale = ''; w.style.rotate = ''; });
            });
        }

        function play() {
            // the title: letters rise in, the logo pops
            if (name) name.querySelectorAll('.af-ch').forEach(function (ch, i) {
                ch.animate([
                    { opacity: 0, transform: 'translateY(0.45em) rotate(4deg)', filter: 'blur(6px)' },
                    { opacity: 1, transform: 'none', filter: 'blur(0)' }
                ], { duration: 900, delay: 120 + i * 32, easing: OUT, fill: 'backwards' });
            });
            const logo = header && header.querySelector('img');
            if (logo && logo.animate) logo.animate([
                { opacity: 0, transform: 'scale(.6) rotate(-20deg)' },
                { opacity: 1, transform: 'none' }
            ], { duration: 1000, easing: 'cubic-bezier(.34, 1.56, .64, 1)', fill: 'backwards' });

            // everything else: words rise as each block comes on screen (the first screen follows the title)
            const seen = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
                let order = 0;
                entries.forEach(function (e) {
                    if (!e.isIntersecting) return;
                    seen.unobserve(e.target);
                    const top = firstScreen && e.target.getBoundingClientRect().top < vh() && !e.target.__afLate;
                    reveal(e.target, (top ? 420 : 0) + order++ * 120);
                });
            }, { rootMargin: '0px' }) : null;
            if (!seen) return;
            texts.forEach(function (el) {
                const r = el.getBoundingClientRect();
                if (!firstScreen && r.bottom < vh()) return;   // came back scrolled down: leave what's already in view alone
                el.__afLate = r.top > vh();
                splitWords(el).forEach(function (w) { w.style.opacity = '0'; });
                seen.observe(el);
            });
        }
        // prerendered pages wait until they're actually shown
        if (document.prerendering) document.addEventListener('prerenderingchange', play, { once: true });
        else play();
        if (name) glitch(name);

        /* ---------- 7. the title glitches every few seconds ----------
           Each round picks a different style, so it never repeats the same way twice in a row:
             decode:  letters scramble through binary, then hex, and resolve left to right
             fonts:   each letter runs through other tech typefaces at its own pace
             bits:    a wave of 0s and 1s rolls across the name and back
             noise:   a mix of typefaces, binary, block shades and symbols
           Every change fades in rather than snapping, letters slow down before they land,
           and each one settles with a small drop. Every letter keeps its usual width, so the
           name itself never shifts about. Hovering the title sets a round off too. */
        function glitch(name) {
            const FACES = [['G Audiowide', 0.92], ['G Chakra', 1.08], ['G MajorMono', 0.9], ['G Michroma', 0.78],
                           ['G Orbitron', 0.92], ['G Silkscreen', 0.82], ['G SpaceMono', 0.96], ['G VT323', 1.32]];
            const BIN = '01', HEX = '0123456789ABCDEF', BLOCK = '▓▒░█', SYM = '#$%&@*+=<>/\\|_{}[]';
            const pick = function (s) { return s.charAt(Math.floor(Math.random() * s.length)); };
            const chars = Array.prototype.slice.call(name.querySelectorAll('.af-ch'));
            let busy = false, modes = [];

            function lockWidths() {
                name.style.height = '';
                chars.forEach(function (ch) { ch.classList.remove('af-fixed'); ch.style.width = ''; ch.style.height = ''; ch.style.lineHeight = ''; });
                chars.forEach(function (ch) {
                    const r = ch.getBoundingClientRect();
                    ch.style.width = r.width + 'px';
                    ch.style.height = r.height + 'px';
                    ch.style.lineHeight = r.height + 'px';
                    ch.classList.add('af-fixed');
                });
                // the title's own height is fixed too, so a glitch round never nudges the page below it
                name.style.height = name.getBoundingClientRect().height + 'px';
            }
            function setFace(ch, f) {
                ch.classList.remove('af-glyph');
                ch.textContent = ch.dataset.c;
                ch.style.fontFamily = '"' + FACES[f][0] + '", monospace';
                ch.style.fontSize = FACES[f][1] + 'em';
                fit(ch, FACES[f][1]);
            }
            // a wide typeface shrinks to fit its letter's slot, so it never runs into the next letter
            function fit(ch, size) {
                const slot = parseFloat(ch.style.width), used = ch.scrollWidth;
                if (slot && used > slot) ch.style.fontSize = (size * slot / used * 0.96).toFixed(3) + 'em';
            }
            function setGlyph(ch, c) {
                ch.classList.add('af-glyph');
                ch.style.fontFamily = '';
                ch.style.fontSize = '0.86em';
                ch.textContent = c;
                fit(ch, 0.86);
            }
            function pulse(ch, d) {      // each change fades in, so the flicker reads as smooth, not jumpy
                ch.animate([{ opacity: 0.35, filter: 'blur(2px)' }, { opacity: 1, filter: 'blur(0)' }], { duration: Math.max(60, d * 0.8), easing: 'ease-out' });
            }
            function land(ch, done) {
                ch.classList.remove('af-glyph');
                ch.textContent = ch.dataset.c;
                ch.style.fontFamily = '';
                ch.style.fontSize = '';
                ch.animate([
                    { transform: 'translateY(-0.12em) scale(1.08)', filter: 'blur(3px)', opacity: 0.6 },
                    { transform: 'none', filter: 'blur(0)', opacity: 1 }
                ], { duration: 520, easing: OUT });
                done();
            }
            // runs one letter through `steps` changes; the gaps grow toward the end, so it slows before landing
            function run(ch, startAt, steps, pace, change, done) {
                let k = 0;
                setTimeout(function next() {
                    if (k >= steps) { land(ch, done); return; }
                    const d = pace * (0.7 + Math.random() * 0.5) * (1 + 1.6 * Math.pow(k / steps, 2));
                    change(ch, k, steps);
                    pulse(ch, d);
                    k++;
                    setTimeout(next, d);
                }, startAt);
            }

            const MODES = {
                decode: function (done) {
                    chars.forEach(function (ch, i) {
                        const steps = 8 + i * 0.8 | 0;
                        run(ch, Math.random() * 120, steps, 70, function (c, k, n) { setGlyph(c, pick(k < n * 0.55 ? BIN : HEX)); }, done);
                    });
                },
                fonts: function (done) {
                    chars.forEach(function (ch, i) {
                        let prev = -1;
                        run(ch, i * 40 + Math.random() * 320, 4 + (Math.random() * 5 | 0), 70 + Math.random() * 90, function (c) {
                            let f; do { f = Math.random() * FACES.length | 0; } while (f === prev);
                            prev = f; setFace(c, f);
                        }, done);
                    });
                },
                bits: function (done) {
                    const n = chars.length;
                    chars.forEach(function (ch, i) {
                        // out across the name, then back: each letter flips to bits twice as the wave passes
                        const there = i * 55, back = (2 * n - i) * 55;
                        run(ch, there, 3, 70, function (c) { setGlyph(c, pick(BIN)); }, function () {
                            run(ch, back - there - 210, 3, 70, function (c) { setGlyph(c, pick(BIN)); }, done);
                        });
                    });
                },
                noise: function (done) {
                    const POOLS = [BIN, BLOCK, SYM, HEX];
                    chars.forEach(function (ch, i) {
                        run(ch, Math.random() * 600, 5 + (Math.random() * 6 | 0), 60 + Math.random() * 80, function (c) {
                            const r = Math.random();
                            if (r < 0.4) setFace(c, Math.random() * FACES.length | 0);
                            else setGlyph(c, pick(POOLS[Math.random() * POOLS.length | 0]));
                        }, done);
                    });
                }
            };

            function round(mode) {
                if (busy || document.hidden) return;
                busy = true;
                if (!mode) {
                    if (!modes.length) modes = Object.keys(MODES).sort(function () { return Math.random() - 0.5; });
                    mode = modes.shift();
                }
                let left = chars.length;
                MODES[mode](function () { if (--left === 0) setTimeout(function () { busy = false; }, 200); });
            }
            function every() {
                setTimeout(function () { round(); every(); }, 6500 + Math.random() * 3500);
            }

            Promise.all([document.fonts.load('1em "Unbounded"')].concat(FACES.map(function (f) {
                return document.fonts.load('1em "' + f[0] + '"', 'AbstractionSolutions01');
            }))).then(function () {
                setTimeout(function () {
                    lockWidths();
                    round('decode');                                 // the first one always decodes
                    every();
                }, 2300);                                            // after the letters have risen in
                let rt = null;
                window.addEventListener('resize', function () {
                    clearTimeout(rt);
                    rt = setTimeout(function () { if (!busy) lockWidths(); }, 200);
                });
                let lastHover = 0;
                header.addEventListener('pointerenter', function () {
                    if (Date.now() - lastHover > 2500) { lastHover = Date.now(); round(); }
                });
            }).catch(function () {});
        }

        wake();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
