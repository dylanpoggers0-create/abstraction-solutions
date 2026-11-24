/* =========================================================
   Playground demo 2: genetic algorithm.
   A JavaScript port of Dylan's string-guessing script, with the same constants:
     genes: letters, digits, space and ! . , ?     population: 250     mutation rate: 0.22
     the top 20% breed, and the best guess is carried into every new generation.
   The script's 1.5 s pause between generations becomes a speed slider (about 4 generations a second
   by default). Generations run inside requestAnimationFrame, a few per frame at high speeds, so the
   page never freezes.
   ========================================================= */
(function () {
    'use strict';
    const card = document.getElementById('genetic-algorithm');
    if (!card) return;
    const $ = function (id) { return document.getElementById(id); };
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

    const GENES = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 !.,?';
    const POPULATION = 250;
    const MUTATION_RATE = 0.22;
    const TOP_SHARE = 0.2;
    const MAX_LEN = 40;

    const rand = function (n) { return Math.floor(Math.random() * n); };
    const gene = function () { return GENES.charAt(rand(GENES.length)); };

    function fitness(guess, target) {
        let ok = 0;
        for (let i = 0; i < target.length; i++) if (guess.charAt(i) === target.charAt(i)) ok++;
        return ok / target.length;
    }
    // child: each letter comes from one parent or the other; then, 22% of the time, one random letter mutates.
    // (Mutating every letter 22% of the time would scramble long phrases faster than they can improve,
    //  so a 40-letter phrase would never finish.)
    function breed(a, b) {
        let child = '';
        for (let i = 0; i < a.length; i++) child += Math.random() < 0.5 ? a.charAt(i) : b.charAt(i);
        if (Math.random() < MUTATION_RATE) {
            const at = rand(child.length);
            child = child.slice(0, at) + gene() + child.slice(at + 1);
        }
        return child;
    }

    /* ---------- the target ---------- */
    const box = $('gaTarget'), note = $('gaNote');
    function cleanTarget() {
        const raw = box.value;
        let out = '';
        for (const ch of raw) if (GENES.indexOf(ch) !== -1) out += ch;
        out = out.slice(0, MAX_LEN);
        if (out !== raw) {
            note.textContent = 'Only letters, numbers, spaces and ! . , ? work here (up to ' + MAX_LEN + '), so I left out the rest.';
            const at = box.selectionStart;
            box.value = out;
            try { box.setSelectionRange(Math.min(at, out.length), Math.min(at, out.length)); } catch (e) {}
        } else {
            note.textContent = out.length >= MAX_LEN ? MAX_LEN + ' characters is the most it takes, so longer phrases are cut there.' : '';
        }
        return out;
    }

    /* ---------- state ---------- */
    let target = '', population = [], generation = 0, best = '', bestFit = 0, history = [], playing = false, raf = 0, owed = 0, last = 0;
    const playBtn = $('gaPlay'), speed = $('gaSpeed'), bestBox = $('gaBest'), line = $('gaLine');

    function reset() {
        stop();
        target = cleanTarget();
        population = [];
        for (let p = 0; p < POPULATION; p++) { let s = ''; for (let i = 0; i < target.length; i++) s += gene(); population.push(s); }
        generation = 0; history = []; best = ''; bestFit = 0;
        $('gaResult').textContent = '';
        rank();
        buildLetters();
        show();
    }
    // sort by fitness, best first, and note the best
    function rank() {
        const scored = population.map(function (g) { return [g, fitness(g, target)]; });
        scored.sort(function (a, b) { return b[1] - a[1]; });
        population = scored.map(function (s) { return s[0]; });
        best = population[0] || ''; bestFit = scored.length ? scored[0][1] : 0;
        history.push(bestFit);
    }
    // one generation: keep the best, then fill up with children of the top 20%
    function step() {
        const top = population.slice(0, Math.max(2, Math.floor(POPULATION * TOP_SHARE)));
        const next = [population[0]];
        while (next.length < POPULATION) next.push(breed(top[rand(top.length)], top[rand(top.length)]));
        population = next;
        generation++;
        rank();
    }

    /* ---------- display ---------- */
    let letters = [];
    function buildLetters() {
        bestBox.textContent = '';
        letters = [];
        for (let i = 0; i < target.length; i++) {
            const s = document.createElement('span');
            s.textContent = ' ';
            bestBox.appendChild(s);
            letters.push(s);
        }
        bestBox.setAttribute('aria-label', 'Best guess so far');
    }
    function show() {
        for (let i = 0; i < letters.length; i++) {
            const s = letters[i], ch = best.charAt(i), hit = ch === target.charAt(i);
            if (s.textContent !== ch) s.textContent = ch;
            if (hit && !s.classList.contains('hit')) {          // just locked in: light up
                s.classList.add('hit');
                if (!reduce.matches) { s.classList.remove('lock'); void s.offsetWidth; s.classList.add('lock'); }
            } else if (!hit) s.classList.remove('hit', 'lock');
        }
        line.textContent = 'Try ' + generation + " | Best: '" + best + "' | Fit: " + (bestFit * 100).toFixed(1) + '%';
        chart();
    }

    const cv = $('gaChart'), cx = cv.getContext('2d');
    let CW = 0, CH = 0;
    function sizeChart() {
        const d = Math.min(window.devicePixelRatio || 1, 2.5), r = cv.getBoundingClientRect();
        CW = r.width; CH = r.height;
        cv.width = Math.round(CW * d); cv.height = Math.round(CH * d);
        cx.setTransform(d, 0, 0, d, 0, 0);
        chart();
    }
    function chart() {
        if (!CW) return;
        cx.clearRect(0, 0, CW, CH);
        const P = 12, w = CW - 2 * P, h = CH - 2 * P;
        cx.strokeStyle = 'rgba(245,248,244,0.08)'; cx.lineWidth = 1;
        [0, 0.5, 1].forEach(function (f) { const y = P + h * (1 - f); cx.beginPath(); cx.moveTo(P, y); cx.lineTo(P + w, y); cx.stroke(); });
        cx.fillStyle = 'rgba(245,248,244,0.4)'; cx.font = '11px "Schibsted Grotesk", sans-serif';
        cx.fillText('100%', P + 2, P + 10); cx.fillText('fitness by generation', P + 2, P + h - 4);
        if (history.length < 2) return;
        const n = Math.max(history.length - 1, 1);
        cx.save();
        cx.strokeStyle = '#7ee96f'; cx.lineWidth = 2.2; cx.shadowColor = 'rgba(126,233,111,0.6)'; cx.shadowBlur = 8;
        cx.beginPath();
        history.forEach(function (f, i) { const x = P + w * i / n, y = P + h * (1 - f); i ? cx.lineTo(x, y) : cx.moveTo(x, y); });
        cx.stroke();
        cx.restore();
    }

    /* ---------- running ---------- */
    function tick(now) {
        if (!playing) { raf = 0; return; }
        const gps = parseFloat(speed.value);                  // generations per second
        owed += (now - last) / 1000 * gps;
        last = now;
        let ran = 0;
        while (owed >= 1 && ran < 30 && bestFit < 1) { step(); owed -= 1; ran++; }
        if (owed > 30) owed = 0;                              // a slow device doesn't pile up work
        if (ran) show();
        if (bestFit >= 1) {
            stop();
            $('gaResult').textContent = 'Got it in ' + generation + ' generations: "' + best + '". No one told it the answer, it just kept the best guesses and mixed them.';
            return;
        }
        raf = requestAnimationFrame(tick);
    }
    function play() {
        if (!target) { note.textContent = 'Type a phrase first, like Hello world!'; return; }
        if (bestFit >= 1) reset();
        playing = true; playBtn.textContent = 'Pause';
        last = performance.now(); owed = 1;                   // the first generation right away
        if (!raf) raf = requestAnimationFrame(tick);
    }
    function stop() { playing = false; playBtn.textContent = 'Play'; }

    playBtn.addEventListener('click', function () { playing ? stop() : play(); });
    $('gaReset').addEventListener('click', reset);
    box.addEventListener('input', reset);
    speed.addEventListener('input', function () {
        $('gaSpeedOut').textContent = speed.value;
        speed.setAttribute('aria-valuetext', speed.value + ' per second');
    });
    if ('ResizeObserver' in window) new ResizeObserver(sizeChart).observe(cv); else window.addEventListener('resize', sizeChart);
    sizeChart();
    reset();
})();
