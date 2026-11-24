/* Home page quotes under the hero (kept out of index.html so the page can forbid inline scripts).
   One quote at a time, fading to the next about every 6 seconds.
   - Pauses while the pointer is over it, while anything in it has keyboard focus, and while a dot is pressed.
   - With "reduce motion" on: no auto-rotate and no fade; the dots switch quotes instantly.
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
    const EVERY = 6000, FADE = 700;

    const section = document.getElementById('homeQuotes');
    const card = document.getElementById('homeQuoteCard');
    const text = document.getElementById('homeQuoteText');
    const attr = document.getElementById('homeQuoteAttr');
    const dots = document.getElementById('homeQuoteDots');
    if (!section || !card) return;

    const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
    let i = 0, timer = null, swapping = null;
    let hovered = false, focused = false, pressing = false;

    function fill(n) {
        text.innerHTML = QUOTES[n][0];                 // our own fixed text, never visitor input
        attr.textContent = '— ' + QUOTES[n][1];
    }
    function mark() {
        Array.prototype.forEach.call(dots.children, function (b, n) { b.setAttribute('aria-current', n === i ? 'true' : 'false'); });
    }
    function show(n) {
        if (n === i && !swapping) return;
        clearTimeout(swapping);
        if (calm.matches) { i = n; fill(i); mark(); swapping = null; return; }
        card.classList.add('is-out');
        swapping = setTimeout(function () {
            i = n; fill(i); mark();
            card.classList.remove('is-out');
            swapping = null;
        }, FADE);
    }

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
        card.style.minHeight = Math.ceil(tallest) + 'px';
    }
    let rt = null;
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(reserve, 150); });

    fill(0); mark();
    reserve();
    // measure again once the quote font has arrived, since it changes line breaks
    if (document.fonts && document.fonts.load) document.fonts.load('italic 400 1em "Newsreader"').then(reserve, function () {});
    window.addEventListener('load', reserve);
    restart();
})();
