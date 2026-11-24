/* =========================================================
   gideon.js: Gideon, the face of the site assistant. nav.js loads it lazily (first hover/focus/tap of
   "Ask our site", opening the chat, or browser idle time), so it never holds up the page;
   styles are at the end of style.css. The chat itself (search, answers) stays in nav.js.

   What's here:
   1. face()       builds Gideon's robot face as SVG. It's articulated: the antenna wobbles on a
                   spring, the eyes follow your cursor and blink, the mouth eases from a flat line
                   into a smile, and it can "talk" (mouth opens and closes) while typing.
   2. The peek     hovering "Ask our site" pops Gideon up over the button: he bounces in with
                   squash and stretch, smiles, blinks, and keeps bobbing while you stay.
   3. thinking()   the three dots shown while Gideon "thinks" (while the search runs): each one hops
                   and lights up green in turn.
   4. typeOut()    reveals an answer one word at a time, like it's being typed, with a short pause
                   after punctuation. Links, lists and quotes keep their formatting. The answer grows
                   as it types, and the chat follows the newest words unless you've scrolled up.

   With "reduce motion" on: no bouncing; the dots just glow in turn and answers appear whole.
   ========================================================= */
(function () {
    'use strict';
    if (window.Gideon) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fine = window.matchMedia('(pointer: fine)').matches;
    const NS = 'http://www.w3.org/2000/svg';
    const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

    /* ---------- 1. the face ---------- */
    function face(size) {
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', '0 0 64 64');
        svg.setAttribute('width', size);
        svg.setAttribute('height', size);
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('class', 'gideon-face');
        svg.innerHTML =
            '<g class="g-ant">' +                                           // antenna: pivots at the top of the head
                '<line x1="32" y1="15" x2="32" y2="7" />' +
                '<circle class="g-bulb" cx="32" cy="5.5" r="3.4" />' +
            '</g>' +
            '<rect class="g-ear" x="5" y="26" width="6" height="12" rx="3" />' +
            '<rect class="g-ear" x="53" y="26" width="6" height="12" rx="3" />' +
            '<rect class="g-head" x="10" y="14" width="44" height="38" rx="13" />' +
            '<rect class="g-screen" x="16" y="20" width="32" height="25" rx="9" />' +
            '<circle class="g-cheek" cx="21" cy="38" r="2.6" />' +
            '<circle class="g-cheek" cx="43" cy="38" r="2.6" />' +
            '<g class="g-eyes">' +
                '<g class="g-eye"><circle cx="25" cy="30" r="3.8" /><circle class="g-glint" cx="26.3" cy="28.6" r="1.1" /></g>' +
                '<g class="g-eye"><circle cx="39" cy="30" r="3.8" /><circle class="g-glint" cx="40.3" cy="28.6" r="1.1" /></g>' +
            '</g>' +
            '<path class="g-mouth" d="M26 38.5 Q32 38.5 38 38.5" />';

        const ant = svg.querySelector('.g-ant');
        const eyes = svg.querySelector('.g-eyes');
        const eyeEls = svg.querySelectorAll('.g-eye');
        const mouth = svg.querySelector('.g-mouth');
        const cheeks = svg.querySelectorAll('.g-cheek');

        // everything that moves is a spring: [value, velocity, target]
        const S = { ant: [0, 0, 0], ex: [0, 0, 0], ey: [0, 0, 0], smile: [0, 0, 0], open: [0, 0, 0] };
        let running = false, last = 0;

        function step(sp, k, c, dt) {
            sp[1] += (-(sp[0] - sp[2]) * k - sp[1] * c) * dt;
            sp[0] += sp[1] * dt;
        }
        function draw() {
            ant.setAttribute('transform', 'rotate(' + S.ant[0].toFixed(2) + ' 32 15)');
            eyes.setAttribute('transform', 'translate(' + S.ex[0].toFixed(2) + ' ' + S.ey[0].toFixed(2) + ')');
            // mouth: a flat line (smile 0) curves up into a smile (1); "open" drops the lower lip for talking
            const sm = S.smile[0], op = Math.max(0, S.open[0]);
            const endY = 38.5 - sm * 1.6, ctrlY = 38.5 + sm * 5.5;
            mouth.setAttribute('d', op > 0.05
                ? 'M26 ' + endY.toFixed(2) + ' Q32 ' + (ctrlY - 1).toFixed(2) + ' 38 ' + endY.toFixed(2) +
                  ' Q32 ' + (ctrlY + op * 5).toFixed(2) + ' 26 ' + endY.toFixed(2) + 'Z'
                : 'M26 ' + endY.toFixed(2) + ' Q32 ' + ctrlY.toFixed(2) + ' 38 ' + endY.toFixed(2));
            mouth.classList.toggle('g-open', op > 0.05);
            cheeks.forEach(function (c) { c.style.opacity = Math.max(0, Math.min(1, sm)).toFixed(2); });
        }
        function tick(now) {
            const dt = Math.min(2.5, (now - last) / 16.667);
            last = now;
            step(S.ant, 0.08, 0.12, dt);       // loose and wobbly
            step(S.ex, 0.12, 0.35, dt);
            step(S.ey, 0.12, 0.35, dt);
            step(S.smile, 0.1, 0.3, dt);
            step(S.open, 0.35, 0.45, dt);      // quick, for talking
            draw();
            const moving = Object.keys(S).some(function (n) { return Math.abs(S[n][0] - S[n][2]) > 0.01 || Math.abs(S[n][1]) > 0.01; });
            if (moving) requestAnimationFrame(tick); else running = false;
        }
        function go() {
            if (reduce) { Object.keys(S).forEach(function (n) { S[n][0] = S[n][2]; S[n][1] = 0; }); draw(); return; }
            if (!running) { running = true; last = performance.now(); requestAnimationFrame(tick); }
        }

        const api = {
            el: svg,
            smile: function (on) { S.smile[2] = on ? 1 : 0; go(); },
            wobble: function (kick) { S.ant[1] += kick || 6; go(); },
            look: function (x, y) {           // -1..1 each way
                S.ex[2] = Math.max(-1, Math.min(1, x)) * 2.6;
                S.ey[2] = Math.max(-1, Math.min(1, y)) * 2;
                go();
            },
            blink: function () {
                if (reduce || !eyeEls[0].animate) return;
                eyeEls.forEach(function (e) {
                    e.animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(0.1)' }, { transform: 'scaleY(1)' }],
                              { duration: 180, easing: 'ease-in-out' });
                });
            },
            talk: function () { S.open[1] += 0.55; go(); },     // one flap of the mouth per word
            think: function (on) {             // eyes drift up and to the side while thinking
                svg.classList.toggle('g-thinking', !!on);
                if (on) api.look(0.7, -0.9); else api.look(0, 0);
            }
        };
        draw();

        // blink every few seconds, at uneven gaps like a person does
        (function blinker() {
            setTimeout(function () { if (svg.isConnected) api.blink(); blinker(); }, 2400 + Math.random() * 3200);
        })();
        // eyes follow the cursor around the page
        if (fine) window.addEventListener('pointermove', function (e) {
            if (!svg.isConnected || svg.classList.contains('g-thinking')) return;
            const r = svg.getBoundingClientRect();
            if (!r.width) return;
            api.look((e.clientX - (r.left + r.width / 2)) / 300, (e.clientY - (r.top + r.height / 2)) / 300);
        }, { passive: true });
        return api;
    }

    /* ---------- 2. the peek over the "Ask our site" button ---------- */
    function attachPeek(btn) {
        if (btn.__gideon) return;
        const g = face(58);
        const peek = document.createElement('span');
        peek.className = 'gideon-peek';
        peek.setAttribute('aria-hidden', 'true');
        peek.appendChild(g.el);
        btn.appendChild(peek);
        btn.__gideon = g;

        let bob = null;
        function show() {
            peek.classList.add('g-up');
            if (!reduce && peek.animate) {
                // bounce in: rises past its spot stretched tall, squashes on landing, settles
                peek.animate([
                    { transform: 'translate(-50%, 34px) scale(0.6, 0.6)', opacity: 0 },
                    { transform: 'translate(-50%, -8px) scale(0.9, 1.14)', opacity: 1, offset: 0.45 },
                    { transform: 'translate(-50%, 2px) scale(1.1, 0.88)', offset: 0.7 },
                    { transform: 'translate(-50%, 0) scale(1, 1)' }
                ], { duration: 560, easing: 'cubic-bezier(.2, .8, .3, 1)' });
                bob = setInterval(function () {        // a little hop every so often while you stay
                    peek.animate([
                        { transform: 'translate(-50%, 0) scale(1, 1)' },
                        { transform: 'translate(-50%, 1px) scale(1.06, 0.94)', offset: 0.2 },
                        { transform: 'translate(-50%, -7px) scale(0.96, 1.05)', offset: 0.5 },
                        { transform: 'translate(-50%, 0) scale(1.04, 0.96)', offset: 0.8 },
                        { transform: 'translate(-50%, 0) scale(1, 1)' }
                    ], { duration: 620, easing: 'ease-out' });
                    g.wobble(5);
                }, 1700);
            }
            g.wobble(9);
            setTimeout(function () { g.smile(true); }, 160);
            setTimeout(g.blink, 420);
        }
        function hide() {
            clearInterval(bob);
            g.smile(false);
            peek.classList.remove('g-up');
            if (!reduce && peek.animate) peek.animate([
                { transform: 'translate(-50%, 0) scale(1, 1)', opacity: 1 },
                { transform: 'translate(-50%, 30px) scale(0.7, 0.7)', opacity: 0 }
            ], { duration: 260, easing: 'ease-in' });
        }
        btn.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') show(); });
        btn.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') hide(); });
        btn.addEventListener('focus', function () { if (btn.matches(':focus-visible')) show(); });
        btn.addEventListener('blur', hide);
        btn.addEventListener('click', hide);
    }

    /* ---------- 3. thinking dots ---------- */
    function thinking(container) {
        const dots = document.createElement('span');
        dots.className = 'gideon-dots';
        dots.setAttribute('role', 'status');
        dots.setAttribute('aria-label', 'Gideon is thinking');
        dots.innerHTML = '<i></i><i></i><i></i>';
        container.appendChild(dots);
        return function stop() { dots.remove(); };
    }

    /* ---------- 4. type the answer out one word at a time ----------
       Words that haven't been "typed" yet take up no space, and neither do paragraphs, lists or quotes
       until their first word arrives. So the answer grows as it's typed, the way a real reply would,
       and opts.pin() can keep the newest words in view. */
    const BLOCKS = 'p, ul, ol, li, blockquote, div, table, tr, td, pre';
    function typeOut(msg, opts) {
        opts = opts || {};
        const pin = opts.pin || function () {};
        // wrap every word in its own span (inside links, lists and quotes too).
        // This runs before the browser draws, so the full answer never flashes up first.
        const words = [];
        const walker = document.createTreeWalker(msg, NodeFilter.SHOW_TEXT);
        const texts = [];
        while (walker.nextNode()) if (walker.currentNode.nodeValue.trim()) texts.push(walker.currentNode);
        texts.forEach(function (t) {
            const frag = document.createDocumentFragment();
            t.nodeValue.split(/(\s+)/).forEach(function (part) {
                if (!part) return;
                if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
                const w = document.createElement('span');
                w.className = 'g-word';
                w.textContent = part;
                words.push(w);
                frag.appendChild(w);
            });
            t.parentNode.replaceChild(frag, t);
        });
        if (reduce || !words.length) {           // reduce motion: the whole answer at once
            words.forEach(function (w) { w.classList.add('g-in', 'g-still'); });
            pin();
            return Promise.resolve();
        }
        const blocks = Array.prototype.slice.call(msg.querySelectorAll(BLOCKS));
        blocks.forEach(function (b) { b.classList.add('g-pending'); });
        msg.classList.add('g-typing');            // hides link underlines until their words arrive

        function reveal(w) {
            for (let el = w.parentElement; el && el !== msg; el = el.parentElement) el.classList.remove('g-pending');
            w.classList.add('g-in');
        }
        // a steady pace, a little uneven like typing, quicker for long answers so nobody waits too long
        const pace = Math.max(22, Math.min(70, 3800 / words.length));
        return (async function () {
            for (let i = 0; i < words.length; i++) {
                reveal(words[i]);
                if (opts.onWord) opts.onWord(words[i], i);
                pin();
                // a breath after punctuation, shorter on long answers so they don't drag
                const pause = (/[.!?]$/.test(words[i].textContent) ? 220 : /[,:;]$/.test(words[i].textContent) ? 110 : 0) * pace / 70;
                await sleep(pace * (0.75 + Math.random() * 0.5) + pause);
            }
            blocks.forEach(function (b) { b.classList.remove('g-pending'); });   // anything with no words (e.g. empty rows)
            msg.classList.remove('g-typing');
            pin();
        })();
    }

    window.Gideon = { face: face, attachPeek: attachPeek, thinking: thinking, typeOut: typeOut, sleep: sleep };
    document.dispatchEvent(new Event('gideon-ready'));
})();
