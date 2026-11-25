/* Home page quotes under the hero (kept out of index.html so the page can forbid inline scripts).
   One quote at a time; about every 9 seconds it glitches into the next, the way the title glitches.
   - Pauses while the pointer is over it, while anything in it has keyboard focus, and while a dot is pressed.
   - With "reduce motion" on: no auto-rotate, no glitching and no fade; the dots switch quotes instantly.
   - The card's height is set to fit the longest quote at the current width, so nothing below it moves. */
(function () {
    'use strict';
    const QUOTES = [
        ['“The purpose of <span class="hl">abstracting</span> is not to be vague, but to create a new semantic level in which one can be absolutely <span class="hl">precise</span>.”', 'Edsger W. Dijkstra'],
        ['“<span class="hl">Civilization</span> advances by extending the number of important <span class="hl">operations</span> which we can perform without <span class="hl">thinking</span> about them.”', 'Alfred North Whitehead'],
        ['“<span class="hl">Creativity</span> is just <span class="hl">connecting</span> things.”', 'Steve Jobs'],
        ['“<span class="hl">Imagination</span> is more important than <span class="hl">knowledge</span>. Knowledge is limited. Imagination encircles the world.”', 'Albert Einstein'],
        ['“You can’t use up <span class="hl">creativity</span>. The more you use, the more you <span class="hl">have</span>.”', 'Maya Angelou'],
        ['“Just as <span class="hl">electricity</span> transformed industry after industry 100 years ago, I think <span class="hl">AI</span> will now do the same.”', 'Andrew Ng'],
        ['“We can only see a short distance <span class="hl">ahead</span>, but we can see plenty there that needs to be <span class="hl">done</span>.”', 'Alan Turing']
    ];
    const EVERY = 9000, FADE = 700;

    const section = document.getElementById('homeQuotes');
    const card = document.getElementById('homeQuoteCard');
    const text = document.getElementById('homeQuoteText');
    const attr = document.getElementById('homeQuoteAttr');
    const dots = document.getElementById('homeQuoteDots');
    if (!section || !card) return;

    const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
    let i = 0, timer = null, swapping = null;
    let hovered = false, focused = false, pressing = false;

    /* Glitching (float.js lends its glitch kit as window.ASGlitch; without it, or with "reduce motion",
       quotes simply fade). Each quote is built letter by letter, the way the title is:
       - while it's showing, a word or two glitches now and then, on a different beat from the title
       - the change to the next quote: the old one breaks up into bits left to right, then the new one decodes in
       Screen readers get the plain quote from a hidden copy; the moving letters are hidden from them. */
    const sr = document.createElement('span');
    sr.className = 'visually-hidden';
    card.insertBefore(sr, card.firstChild);
    let GK = null, letters = [], words = [], idle = null, quiet = 0;
    function kit() { return GK && !calm.matches ? GK : null; }

    function plain(n) { const d = document.createElement('div'); d.innerHTML = QUOTES[n][0]; return d.textContent; }
    // builds the quote as words of letters; highlighted words keep their green
    function build(n) {
        letters = []; words = [];
        const d = document.createElement('div'); d.innerHTML = QUOTES[n][0];
        const out = document.createDocumentFragment();
        (function walk(node, hl) {
            Array.prototype.forEach.call(node.childNodes, function (c) {
                if (c.nodeType === 1) { walk(c, hl || c.classList.contains('hl')); return; }
                c.nodeValue.split(/(\s+)/).forEach(function (part) {
                    if (!part) return;
                    if (/^\s+$/.test(part)) { out.appendChild(document.createTextNode(' ')); return; }
                    const w = document.createElement('span');
                    w.className = 'qw' + (hl ? ' hl' : '');
                    const ws = [];
                    part.split('').forEach(function (ch) {
                        const l = document.createElement('span');
                        l.className = 'af-ch'; l.dataset.c = ch; l.textContent = ch;
                        w.appendChild(l); ws.push(l); letters.push(l);
                    });
                    words.push(ws); out.appendChild(w);
                });
            });
        })(d, false);
        text.textContent = '';
        text.setAttribute('aria-hidden', 'true');
        text.appendChild(out);
        attr.setAttribute('aria-hidden', 'true');
        attr.textContent = '— ' + QUOTES[n][1];
        sr.textContent = plain(n) + ' — ' + QUOTES[n][1];
        if (kit()) GK.lock(letters);
    }
    function fill(n) {
        if (kit()) { build(n); return; }
        text.innerHTML = QUOTES[n][0];                 // our own fixed text, never visitor input
        text.removeAttribute('aria-hidden'); attr.removeAttribute('aria-hidden'); sr.textContent = '';
        attr.textContent = '— ' + QUOTES[n][1];
    }
    function mark() {
        Array.prototype.forEach.call(dots.children, function (b, n) { b.setAttribute('aria-current', n === i ? 'true' : 'false'); });
    }
    // a small glitch on the quote that's showing: one style, on a word or two
    function nudge() {
        if (!kit() || swapping || document.hidden || !words.length) return;
        const mode = GK.modes[Math.random() * GK.modes.length | 0];
        let pickWords = [];
        const hl = words.filter(function (w) { return w[0].parentNode.classList.contains('hl'); });
        if (mode === 'fonts' && hl.length) pickWords = hl;                                     // the green words run through typefaces
        else if (mode === 'bits') { const s0 = Math.random() * Math.max(1, words.length - 4) | 0; pickWords = words.slice(s0, s0 + 4); }   // a wave over a few words
        else pickWords = [words[Math.random() * words.length | 0]].concat(Math.random() < 0.5 ? [words[Math.random() * words.length | 0]] : []);
        const set = [];
        pickWords.forEach(function (w) { w.forEach(function (l) { if (set.indexOf(l) < 0 && /\S/.test(l.dataset.c)) set.push(l); }); });
        quiet++;
        GK.round(mode, set, function () { quiet--; });
    }
    function idleLoop() {
        clearTimeout(idle);
        if (!kit()) return;
        idle = setTimeout(function () { nudge(); idleLoop(); }, 2800 + Math.random() * 2200);
    }
    /* the change to the next quote, in one continuous move:
       1. the old quote turns to code, left to right (it stays where it is, nothing vanishes)
       2. the new quote takes its place letter for letter: each new letter starts on top of an old one
          (spread evenly, so a longer quote fans out and a shorter one gathers in) and glides to its own spot,
          so the block of code reshapes itself into the new quote's lines
       3. while they move the letters keep flickering through code, then each one decodes and settles */
    const EASE = 'cubic-bezier(.22, .8, .24, 1)';
    let flicker = null, flying = [];
    function startFlicker() {
        if (flicker) return;
        flicker = setInterval(function () {
            flying = flying.filter(function (l) { return l.__fly; });
            flying.forEach(function (l) { if (Math.random() < 0.45) GK.setGlyph(l, GK.pick(Math.random() < 0.65 ? GK.BIN : GK.HEX)); });
            if (!flying.length) { clearInterval(flicker); flicker = null; }
        }, 85);
    }
    function glitchTo(n) {
        const old = letters.slice(), OUT = Math.min(520, 160 + old.length * 3);
        old.forEach(function (l, k) {
            setTimeout(function () {
                GK.setGlyph(l, GK.pick(k % 4 ? GK.BIN : GK.HEX)); GK.pulse(l, 120);
                l.__fly = true; flying.push(l); startFlicker();
            }, (k / old.length) * OUT * 0.8);
        });
        attr.animate([{ opacity: 1, filter: 'blur(0)' }, { opacity: 0, filter: 'blur(4px)' }], { duration: 320, delay: OUT * 0.4, fill: 'forwards', easing: 'ease-in' });
        swapping = setTimeout(function () {
            // where every old letter is right now
            const from = old.map(function (l) { const r = l.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; });
            old.forEach(function (l) { l.__fly = false; });
            i = n; build(i); mark();
            const total = letters.length, to = letters.map(function (l) { const r = l.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; });
            let left = total;
            letters.forEach(function (l, j) {
                const src = from[Math.round(j * (from.length - 1) / Math.max(1, total - 1))] || to[j], dst = to[j];
                const dx = src.x - dst.x, dy = src.y - dst.y, sc = Math.max(0.6, Math.min(1.6, src.w / Math.max(1, dst.w)));
                GK.setGlyph(l, GK.pick(GK.BIN));
                l.__fly = true; flying.push(l);
                const delay = (j / total) * 220, dur = 760 + Math.random() * 160;
                l.animate([{ transform: 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px) scale(' + sc.toFixed(2) + ')' },
                           { transform: 'none' }], { duration: dur, delay: delay, easing: EASE, fill: 'backwards' });
                // once it has arrived: a few last flickers, then the real letter
                setTimeout(function () {
                    l.__fly = false;
                    GK.run(l, Math.random() * 140, 2 + (Math.random() * 3 | 0), 60, function (c, s2) {
                        if (Math.random() < 0.25) GK.setFace(c, Math.random() * GK.FACES.length | 0);
                        else GK.setGlyph(c, GK.pick(s2 ? GK.HEX : GK.BIN));
                    }, function () { if (--left === 0) swapping = null; });
                }, delay + dur - 60);
            });
            startFlicker();
            attr.getAnimations().forEach(function (an) { an.cancel(); });
            attr.animate([{ opacity: 0, filter: 'blur(4px)', transform: 'translateY(6px)' }, { opacity: 1, filter: 'blur(0)', transform: 'none' }],
                         { duration: 700, delay: 900, easing: EASE, fill: 'backwards' });
            setTimeout(function () { if (swapping) swapping = null; }, 3200);   // never stuck
        }, OUT);
    }
    function show(n) {
        if (n === i && !swapping) return;
        clearTimeout(swapping);
        if (calm.matches) { i = n; fill(i); mark(); swapping = null; return; }
        if (kit()) { if (!quiet) glitchTo(n); else setTimeout(function () { show(n); }, 400); return; }
        card.classList.add('is-out');
        swapping = setTimeout(function () {
            i = n; fill(i); mark();
            card.classList.remove('is-out');
            swapping = null;
        }, FADE);
    }
    function useKit(k) {
        k.ready.then(function () {
            return document.fonts && document.fonts.load ? document.fonts.load('italic 400 1em "Newsreader"') : null;
        }).catch(function () {}).then(function () {
            GK = k;
            if (calm.matches) return;
            build(i); idleLoop();
        });
    }
    if (window.ASGlitch) useKit(window.ASGlitch);
    else window.addEventListener('as-glitch-ready', function () { useKit(window.ASGlitch); }, { once: true });

    QUOTES.forEach(function (q, n) {
        const b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('aria-label', 'Show quote ' + (n + 1) + ' of ' + QUOTES.length + ', by ' + q[1]);
        b.addEventListener('pointerdown', function () { pressing = true; });
        b.addEventListener('click', function () { pressing = false; show(n); restart(); });
        dots.appendChild(b);
    });
    document.addEventListener('pointerup', function () { pressing = false; });

    function restart() {
        clearInterval(timer);
        timer = null;
        if (calm.matches) return;
        timer = setInterval(function () {
            if (hovered || focused || pressing || document.hidden) return;
            show((i + 1) % QUOTES.length);
        }, EVERY);
    }
    section.addEventListener('mouseenter', function () { hovered = true; });
    section.addEventListener('mouseleave', function () { hovered = false; });
    section.addEventListener('focusin', function () { focused = true; });
    section.addEventListener('focusout', function (e) { if (!section.contains(e.relatedTarget)) focused = false; });
    if (calm.addEventListener) calm.addEventListener('change', restart);

    /* reserve room for the longest quote at the current width: measure each one in an invisible copy */
    function reserve() {
        const probe = card.cloneNode(true);
        probe.removeAttribute('id');
        probe.removeAttribute('aria-live');
        probe.setAttribute('aria-hidden', 'true');
        probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;left:0;right:0;min-height:0;';
        probe.style.width = card.getBoundingClientRect().width + 'px';
        section.appendChild(probe);
        const t = probe.querySelector('.home-quote-text'), a = probe.querySelector('.home-quote-attr');
        let tallest = 0;
        QUOTES.forEach(function (q) {
            t.innerHTML = q[0];
            a.textContent = '— ' + q[1];
            tallest = Math.max(tallest, probe.getBoundingClientRect().height);
        });
        probe.remove();
        card.style.minHeight = Math.ceil(tallest + 14) + 'px';   // a little spare: glitching letters aren't kerned
    }
    let rt = null;
    window.addEventListener('resize', function () {
        clearTimeout(rt);
        rt = setTimeout(function () { reserve(); if (kit() && !swapping && !quiet) build(i); }, 150);
    });

    fill(0); mark();
    reserve();
    // measure again once the quote font has arrived, since it changes line breaks
    if (document.fonts && document.fonts.load) document.fonts.load('italic 400 1em "Newsreader"').then(reserve, function () {});
    window.addEventListener('load', reserve);
    restart();
})();
