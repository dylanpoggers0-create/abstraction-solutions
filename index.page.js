/* Home page quotes under the hero (kept out of index.html so the page can forbid inline scripts).
   One quote at a time; about every 14 seconds it's edited into the next one: backspaced, then typed.
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
    const EVERY = 14000, FADE = 700;

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
       - the change to the next quote: it's backspaced and the next one typed in (see typeTo)
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
        cur = tokens(n);
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
    /* the change to the next quote: it's edited, like someone at a keyboard.
       A green caret backspaces the old quote from the end (the letters just ahead of it break into code
       first), down to whatever the two quotes share, then types the new one. Each typed letter lands as
       code and decodes a moment later. The block grows and shrinks line by line as it's edited, and
       glides to stay centred. Deleting speeds up the longer it goes, like holding the key down. */
    const EASE = 'cubic-bezier(.22, .8, .24, 1)';
    const caret = document.createElement('span');
    caret.className = 'q-caret';
    caret.setAttribute('aria-hidden', 'true');
    let job = 0, cur = [];
    function tokens(n) {                     // the quote as letters and spaces, each letter marked if it's highlighted
        const d = document.createElement('div'); d.innerHTML = QUOTES[n][0];
        const out = [];
        (function walk(node, hl) {
            Array.prototype.forEach.call(node.childNodes, function (c) {
                if (c.nodeType === 1) { walk(c, hl || c.classList.contains('hl')); return; }
                c.nodeValue.replace(/\s+/g, ' ').split('').forEach(function (ch) { out.push({ c: ch, hl: ch !== ' ' && hl }); });
            });
        })(d, false);
        return out;
    }
    function reindex() {                     // letters and words from what's on screen, for the idle glitches
        letters = Array.prototype.slice.call(text.querySelectorAll('.af-ch'));
        words = Array.prototype.map.call(text.querySelectorAll('.qw'), function (w) { return Array.prototype.slice.call(w.children); });
    }
    // keeps the text centred without jumping when a line comes or goes
    function steady(fn) {
        const before = text.getBoundingClientRect().top;
        fn();
        const after = text.getBoundingClientRect().top;
        if (Math.abs(before - after) > 1) text.animate([{ transform: 'translateY(' + (before - after).toFixed(1) + 'px)' }, { transform: 'none' }],
                                                       { duration: 280, easing: EASE, composite: 'add' });
    }
    function lastUnit() { return caret.previousSibling; }
    function backspace() {
        const u = lastUnit();
        if (!u) return;
        if (u.nodeType === 3) { u.remove(); }
        else {
            u.lastChild.remove();
            if (!u.firstChild) u.remove();
        }
        cur.pop();
    }
    function type(t) {
        if (t.c === ' ') { text.insertBefore(document.createTextNode(' '), caret); cur.push(t); return null; }
        let w = lastUnit();
        if (!w || w.nodeType === 3 || w.classList.contains('hl') !== t.hl) {
            w = document.createElement('span');
            w.className = 'qw' + (t.hl ? ' hl' : '');
            text.insertBefore(w, caret);
        }
        const l = document.createElement('span');
        l.className = 'af-ch'; l.dataset.c = t.c; l.textContent = t.c;
        w.appendChild(l);
        cur.push(t);
        GK.lock([l]);                        // its real width, so the glitches that follow don't nudge the line
        return l;
    }
    function typeTo(n) {
        const me = ++job, next = tokens(n);
        swapping = { typing: me };
        caret.classList.add('is-typing');
        text.appendChild(caret);
        sr.textContent = plain(n) + ' — ' + QUOTES[n][1];
        i = n; mark();
        attr.getAnimations().forEach(function (an) { an.cancel(); });
        attr.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' });
        // how much of the start the two quotes share (the opening quote mark, at least)
        let keep = 0;
        while (keep < cur.length && keep < next.length && cur[keep].c === next[keep].c && cur[keep].hl === next[keep].hl) keep++;
        const keepLetters = cur.slice(0, keep).filter(function (t) { return t.c !== ' '; }).length;
        let gap = 46;
        (function del() {
            if (me !== job) return;
            if (cur.length > keep) {
                steady(backspace);
                // the next few letters break into code before the caret reaches them
                const all = text.querySelectorAll('.af-ch'), z = all.length - 5 >= keepLetters ? all[all.length - 5] : null;
                if (z && !z.classList.contains('af-glyph')) { GK.setGlyph(z, GK.pick(Math.random() < 0.6 ? GK.BIN : GK.SYM)); GK.pulse(z, 120); }
                gap = Math.max(7, gap * 0.9);
                setTimeout(del, gap);
                return;
            }
            // anything kept that's mid-glitch settles back to its real letter before typing starts
            Array.prototype.forEach.call(text.querySelectorAll('.af-ch.af-glyph'), function (l) { GK.land(l, function () {}); });
            setTimeout(function () { typeNext(keep); }, 260);
        })();
        function typeNext(k) {
            if (me !== job) return;
            if (k >= next.length) { finish(); return; }
            let l = null;
            steady(function () { l = type(next[k]); });
            if (l) {
                GK.setGlyph(l, GK.pick(Math.random() < 0.7 ? GK.BIN : GK.HEX));
                GK.pulse(l, 100);
                GK.run(l, 60 + Math.random() * 90, 1 + (Math.random() * 3 | 0), 55, function (c, st) {
                    if (Math.random() < 0.2) GK.setFace(c, Math.random() * GK.FACES.length | 0);
                    else GK.setGlyph(c, GK.pick(st ? GK.HEX : GK.BIN));
                }, function () {});
            }
            const ch = next[k].c;
            setTimeout(function () { typeNext(k + 1); }, 16 + Math.random() * 22 + (/[.,;:!?]/.test(ch) ? 110 : ch === ' ' ? 18 : 0));
        }
        function finish() {
            const who = '— ' + QUOTES[n][1];
            attr.getAnimations().forEach(function (an) { an.cancel(); });
            attr.textContent = '';
            let k = 0;
            (function typeAttr() {
                if (me !== job) return;
                attr.textContent = who.slice(0, ++k);
                if (k < who.length) { setTimeout(typeAttr, 14 + Math.random() * 14); return; }
                caret.classList.remove('is-typing');
                setTimeout(function () {
                    if (me !== job) return;
                    caret.remove();
                    reindex();
                    swapping = null;
                }, 1400);
            })();
        }
    }
    function show(n) {
        if (n === i && !swapping) return;
        clearTimeout(swapping);                        // (a quote being typed is stopped by typeTo itself)
        if (calm.matches) { i = n; fill(i); mark(); swapping = null; return; }
        if (kit()) { if (!quiet) typeTo(n); else setTimeout(function () { show(n); }, 400); return; }
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
            if (hovered || focused || pressing || document.hidden || swapping) return;   // (never while one is being typed)
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
