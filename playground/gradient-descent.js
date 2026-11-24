/* =========================================================
   Playground demo 1: gradient descent.
   A JavaScript port of Dylan's sympy/matplotlib script:
     - parse f(x), take its derivative symbolically (math.js stands in for sympy)
     - start at x0, repeat x_new = x - lr * f'(x), stop early when the step is under 1e-6
     - frame the plot around the path with a margin, mark the start and the minimum
   Typed text is never run as code: math.js parses it into a tree, and the tree is checked against a short
   allowlist (numbers, x, pi, e, + - * / ^, and sin cos tan exp log/ln sqrt abs) before anything is evaluated.
   ========================================================= */
(function () {
    'use strict';
    const card = document.getElementById('gradient-descent');
    if (!card || !window.math || !window.katex) return;
    const $ = function (id) { return document.getElementById(id); };
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

    const TOLERANCE = 1e-6;          // stop when a step moves x by less than this (same as the script)
    const BLOW_UP = 1e6;             // |x| past this counts as diverging
    const UPHILL_STEPS = 6;          // ...and so do this many steps in a row that climb and grow
    const LR_MIN = 0.001, LR_MAX = 1.5;
    const STEP_MS = 520;             // one step's animation at speed 1x
    // Framing: the script's margin rule could not be checked here (the original file wasn't attached), so this
    // pads the path's range by half its width on each side, and at least 1 unit. Change MARGIN_* to taste.
    const MARGIN_SHARE = 0.5, MARGIN_MIN = 1;

    /* ---------- reading the equation ---------- */
    const FUNCS = { sin: 1, cos: 1, tan: 1, exp: 1, log: 1, sqrt: 1, abs: 1 };
    const OPS = { add: 1, subtract: 1, multiply: 1, divide: 1, pow: 1, unaryMinus: 1, unaryPlus: 1 };
    const FRIENDLY = 'I couldn\'t read that. Try something like x^2 + 3x.';

    function normalize(text) {
        return text
            .replace(/\*\*/g, '^')                  // Python style powers
            .replace(/[−–]/g, '-').replace(/[×·]/g, '*').replace(/÷/g, '/')
            .replace(/π/g, 'pi')
            .replace(/\bln\s*\(/g, 'log(')          // ln = natural log (math.js log is natural log)
            .replace(/\bmath\./g, '')               // np.sin / math.sin from Python habits
            .replace(/\bnp\./g, '');
    }
    function checkTree(node) {
        let problem = null;
        node.traverse(function (n, path, parent) {
            if (problem) return;
            switch (n.type) {
                case 'ConstantNode': if (typeof n.value !== 'number') problem = FRIENDLY; break;
                case 'ParenthesisNode': break;
                case 'OperatorNode': if (!OPS[n.fn]) problem = FRIENDLY; break;
                case 'FunctionNode':
                    if (n.fn.type !== 'SymbolNode' || !FUNCS[n.fn.name]) problem = 'I don\'t know "' + (n.fn.name || '?') + '". Try sin, cos, tan, exp, log, sqrt or abs.';
                    else if (n.args.length !== 1) problem = n.fn.name + ' takes one thing in brackets, like ' + n.fn.name + '(x).';
                    break;
                case 'SymbolNode':
                    if (parent && parent.type === 'FunctionNode' && parent.fn === n) break;   // the function's own name
                    if (n.name !== 'x' && n.name !== 'pi' && n.name !== 'e') problem = 'Use x as the only letter (pi and e are fine too). "' + n.name + '" isn\'t something I can graph.';
                    break;
                default: problem = FRIENDLY;
            }
        });
        return problem;
    }
    function read(text) {
        const src = normalize(text.trim());
        if (!src) return { error: 'Type an equation, like x^2 + 3x.' };
        let node;
        try { node = math.parse(src); } catch (e) { return { error: FRIENDLY }; }
        const problem = checkTree(node);
        if (problem) return { error: problem };
        if (!/\bx\b/.test(node.toString())) return { error: 'Put an x in it, so there\'s a curve to roll down. Try x^2 + 3x.' };
        let d;
        try { d = math.derivative(node, 'x'); } catch (e) { return { error: 'I couldn\'t take the slope of that one. Try something simpler, like x^2 + 3x.' }; }
        const fc = node.compile(), dc = d.compile();
        const num = function (v) { return typeof v === 'number' ? v : NaN; };   // complex results (sqrt of a negative) -> not a number
        return {
            node: node, d: d,
            f: function (x) { try { return num(fc.evaluate({ x: x })); } catch (e) { return NaN; } },
            fp: function (x) { try { return num(dc.evaluate({ x: x })); } catch (e) { return NaN; } }
        };
    }
    function tex(node) {
        try { return node.toTex({ parenthesis: 'auto', implicit: 'hide' }); } catch (e) { return node.toString(); }
    }

    /* ---------- the descent itself (the script's loop) ---------- */
    function descend(fn, x0, lr, iters) {
        const steps = [{ x: x0, fx: fn.f(x0), g: fn.fp(x0) }];
        let status = 'max', x = x0, uphill = 0;
        for (let i = 0; i < iters; i++) {
            const g = fn.fp(x);
            if (!isFinite(g)) { status = 'diverged'; break; }
            const xn = x - lr * g;
            if (!isFinite(xn) || Math.abs(xn) > BLOW_UP || !isFinite(fn.f(xn))) { steps.push({ x: xn, fx: fn.f(xn), g: fn.fp(xn) }); status = 'diverged'; break; }
            steps.push({ x: xn, fx: fn.f(xn), g: fn.fp(xn) });
            if (Math.abs(xn - x) < TOLERANCE) { status = 'converged'; x = xn; break; }
            // going uphill with bigger and bigger jumps, several steps running: it's overshooting more each time
            const prev = steps[steps.length - 2], before = steps[steps.length - 3];
            uphill = (fn.f(xn) > prev.fx && (!before || Math.abs(xn - prev.x) > Math.abs(prev.x - before.x))) ? uphill + 1 : 0;
            if (uphill >= UPHILL_STEPS) { status = 'diverged'; break; }
            x = xn;
        }
        if (status === 'max' && Math.abs(fn.fp(x)) < 1e-4) status = 'converged';
        return { steps: steps, status: status };
    }

    /* ---------- state ---------- */
    let fn = null, run = null;
    let k = 0, t = 0, playing = false, last = 0, doneAt = 0, raf = 0;
    const exprBox = $('gdExpr'), errBox = $('gdErr');
    const startBox = $('gdStart'), lrRange = $('gdLrRange'), lrNum = $('gdLrNum'), itRange = $('gdItersRange'), itNum = $('gdItersNum');
    const speedBox = $('gdSpeed'), playBtn = $('gdPlay');
    const canvas = $('gdCanvas'), ctx = canvas.getContext('2d');

    // learning rate: a log slider (0.001 .. 1.5) kept in step with the number box
    const L0 = Math.log10(LR_MIN), L1 = Math.log10(LR_MAX);
    function lrFromSlider(v) { return Math.pow(10, L0 + (v / 1000) * (L1 - L0)); }
    function sliderFromLr(lr) { return Math.round((Math.log10(lr) - L0) / (L1 - L0) * 1000); }
    function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
    function lr() { const v = parseFloat(lrNum.value); return clamp(isFinite(v) ? v : 0.1, LR_MIN, LR_MAX); }
    function iters() { const v = parseInt(itNum.value, 10); return clamp(isFinite(v) ? v : 100, 1, 500); }
    function x0() { const v = parseFloat(startBox.value); return isFinite(v) ? v : 0; }
    function fmt(v) { return isFinite(v) ? (Math.abs(v) >= 1e6 ? v.toExponential(3) : v.toFixed(5)) : 'not a number'; }
    function setLr(v) {
        v = clamp(v, LR_MIN, LR_MAX);
        lrNum.value = +v.toPrecision(3);
        lrRange.value = sliderFromLr(v);
        lrRange.setAttribute('aria-valuetext', String(+v.toPrecision(3)));
    }
    setLr(0.1);

    /* ---------- reading the box, live ---------- */
    let typeTimer = 0;
    function onEquation() {
        const res = read(exprBox.value);
        if (res.error) {
            errBox.textContent = res.error;
            exprBox.setAttribute('aria-invalid', 'true');
            $('gdTexF').textContent = ''; $('gdTexD').textContent = '';
            fn = null; run = null; stop(); draw(); readout(); result();
            return;
        }
        errBox.textContent = '';
        exprBox.removeAttribute('aria-invalid');
        katex.render(tex(res.node), $('gdTexF'), { throwOnError: false });
        katex.render(tex(res.d), $('gdTexD'), { throwOnError: false });
        fn = res;
        recompute();
    }
    exprBox.addEventListener('input', function () { clearTimeout(typeTimer); typeTimer = setTimeout(onEquation, 160); });

    // tap keys put text where the cursor is
    card.querySelectorAll('.pg-key').forEach(function (b) {
        b.addEventListener('click', function () {
            const ins = b.getAttribute('data-insert');
            const s = exprBox.selectionStart != null ? exprBox.selectionStart : exprBox.value.length;
            const e = exprBox.selectionEnd != null ? exprBox.selectionEnd : s;
            exprBox.value = exprBox.value.slice(0, s) + ins + exprBox.value.slice(e);
            exprBox.focus();
            exprBox.setSelectionRange(s + ins.length, s + ins.length);
            onEquation();
        });
    });
    card.querySelectorAll('.pg-chip').forEach(function (b) {
        b.addEventListener('click', function () {
            exprBox.value = b.getAttribute('data-expr');
            startBox.value = b.getAttribute('data-start');
            setLr(parseFloat(b.getAttribute('data-lr')));
            onEquation();
            play();
        });
    });
    startBox.addEventListener('input', recompute);
    lrRange.addEventListener('input', function () { setLr(lrFromSlider(+lrRange.value)); recompute(); });
    lrNum.addEventListener('change', function () { setLr(lr()); recompute(); });
    itRange.addEventListener('input', function () { itNum.value = itRange.value; recompute(); });
    itNum.addEventListener('change', function () { itNum.value = iters(); itRange.value = iters(); recompute(); });
    speedBox.addEventListener('input', function () { speedBox.setAttribute('aria-valuetext', speedBox.value + 'x'); });

    /* ---------- framing (x range from the path plus a margin, y range from the curve) ---------- */
    let view = null;
    function frame() {
        if (!fn || !run) { view = null; return; }
        // a diverging run can fly off to huge numbers: frame only the sane part of it
        const xs = run.steps.map(function (s) { return s.x; }).filter(function (x) { return isFinite(x) && Math.abs(x) <= 1e3; }).slice(0, 60);
        let lo = Math.min.apply(null, xs), hi = Math.max.apply(null, xs);
        const margin = Math.max(MARGIN_MIN, (hi - lo) * MARGIN_SHARE);
        lo -= margin; hi += margin;
        const N = 400, pts = [];
        let ylo = Infinity, yhi = -Infinity;
        for (let i = 0; i <= N; i++) {
            const x = lo + (hi - lo) * i / N, y = fn.f(x);
            pts.push([x, y]);
            if (isFinite(y)) { ylo = Math.min(ylo, y); yhi = Math.max(yhi, y); }
        }
        if (!isFinite(ylo)) { ylo = -1; yhi = 1; }
        if (yhi - ylo < 1e-9) { ylo -= 1; yhi += 1; }
        const pad = (yhi - ylo) * 0.12;
        view = { x0: lo, x1: hi, y0: ylo - pad, y1: yhi + pad, pts: pts };
    }

    /* ---------- compute a run and reset the animation ---------- */
    function recompute() {
        stop();
        if (!fn) { draw(); return; }
        run = descend(fn, x0(), lr(), iters());
        k = 0; t = 0; doneAt = 0;
        frame(); draw(); readout(); result();
    }

    /* ---------- drawing ---------- */
    let W = 0, H = 0, dpr = 1;
    function size() {
        dpr = Math.min(window.devicePixelRatio || 1, 2.5);
        const r = canvas.getBoundingClientRect();
        W = r.width; H = r.height;
        canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw();
    }
    const PAD = { l: 14, r: 14, t: 16, b: 16 };
    function sx(x) { return PAD.l + (x - view.x0) / (view.x1 - view.x0) * (W - PAD.l - PAD.r); }
    function sy(y) { return PAD.t + (1 - (y - view.y0) / (view.y1 - view.y0)) * (H - PAD.t - PAD.b); }
    function ease(u) { return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; }

    function draw(now) {
        if (!W) return;
        ctx.clearRect(0, 0, W, H);
        if (!view) {
            ctx.fillStyle = 'rgba(245,248,244,0.4)'; ctx.font = '15px "Schibsted Grotesk", sans-serif'; ctx.textAlign = 'center';
            ctx.fillText('Type an equation above to see its curve.', W / 2, H / 2);
            return;
        }
        // faint grid and axes
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(245,248,244,0.05)';
        for (let i = 1; i < 8; i++) { const gx = W * i / 8; ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
        for (let i = 1; i < 5; i++) { const gy = H * i / 5; ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }
        ctx.strokeStyle = 'rgba(245,248,244,0.22)';
        if (view.x0 < 0 && view.x1 > 0) { ctx.beginPath(); ctx.moveTo(sx(0), 0); ctx.lineTo(sx(0), H); ctx.stroke(); }
        if (view.y0 < 0 && view.y1 > 0) { ctx.beginPath(); ctx.moveTo(0, sy(0)); ctx.lineTo(W, sy(0)); ctx.stroke(); }

        // the curve, in a green-to-white gradient with a soft glow
        const grad = ctx.createLinearGradient(0, 0, W, 0);
        grad.addColorStop(0, '#3fbf5a'); grad.addColorStop(0.5, '#e9fbe5'); grad.addColorStop(1, '#3fbf5a');
        ctx.save();
        ctx.strokeStyle = grad; ctx.lineWidth = 3; ctx.lineJoin = 'round';
        ctx.shadowColor = 'rgba(126,233,111,0.55)'; ctx.shadowBlur = 12;
        ctx.beginPath();
        let pen = false;
        view.pts.forEach(function (p) {
            const y = p[1];
            if (!isFinite(y)) { pen = false; return; }
            const X = sx(p[0]), Y = clamp(sy(y), -1e4, 1e4);
            if (pen) ctx.lineTo(X, Y); else { ctx.moveTo(X, Y); pen = true; }
        });
        ctx.stroke();
        ctx.restore();
        if (!run) return;

        const steps = run.steps, last = steps.length - 1;
        const kk = Math.min(k, last), next = Math.min(kk + 1, last);
        const u = ease(t);
        const bx = steps[kk].x + (steps[next].x - steps[kk].x) * u;
        const by = fn.f(bx);

        // dashed path through the points visited so far, then a fading trail of red step dots
        ctx.save();
        ctx.setLineDash([5, 6]); ctx.strokeStyle = 'rgba(245,248,244,0.45)'; ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i <= kk; i++) { const X = sx(steps[i].x), Y = sy(steps[i].fx); if (!isFinite(Y)) break; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }
        if (isFinite(by)) ctx.lineTo(sx(bx), sy(by));
        ctx.stroke();
        ctx.restore();
        for (let i = 1; i <= kk; i++) {
            const age = kk - i, a = Math.max(0.12, 1 - age / 14);
            const X = sx(steps[i].x), Y = sy(steps[i].fx);
            if (!isFinite(Y)) continue;
            ctx.fillStyle = 'rgba(255,90,80,' + a.toFixed(2) + ')';
            ctx.beginPath(); ctx.arc(X, Y, 4, 0, 6.2832); ctx.fill();
        }

        // green start marker
        const s0x = sx(steps[0].x), s0y = sy(steps[0].fx);
        if (isFinite(s0y)) {
            ctx.strokeStyle = '#7ee96f'; ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.arc(s0x, s0y, 9, 0, 6.2832); ctx.stroke();
        }

        // the tangent line at the ball: the slope it's feeling
        const slope = fn.fp(bx);
        if (isFinite(by) && isFinite(slope)) {
            const dx = (view.x1 - view.x0) * 0.12;
            ctx.strokeStyle = 'rgba(245,248,244,0.75)'; ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(sx(bx - dx), sy(by - slope * dx));
            ctx.lineTo(sx(bx + dx), sy(by + slope * dx));
            ctx.stroke();
        }

        // gold minimum marker, with a burst when it converges
        const finished = kk >= last && run.status === 'converged';
        if (finished) {
            const mx = sx(steps[last].x), my = sy(steps[last].fx);
            const since = doneAt ? ((now || performance.now()) - doneAt) : 1e9;
            if (since < 900 && !reduce.matches) {
                const p = since / 900;
                for (let r = 0; r < 3; r++) {
                    const q = Math.min(1, p * 1.3 - r * 0.15);
                    if (q <= 0) continue;
                    ctx.strokeStyle = 'rgba(255,207,90,' + (0.8 * (1 - q)).toFixed(2) + ')'; ctx.lineWidth = 2;
                    ctx.beginPath(); ctx.arc(mx, my, 10 + q * 40, 0, 6.2832); ctx.stroke();
                }
            }
            ctx.save();
            ctx.fillStyle = '#ffcf5a'; ctx.shadowColor = 'rgba(255,207,90,0.9)'; ctx.shadowBlur = 16;
            ctx.beginPath(); ctx.arc(mx, my, 7, 0, 6.2832); ctx.fill();
            ctx.restore();
        }

        // the glowing ball
        if (isFinite(by)) {
            const X = sx(bx), Y = clamp(sy(by), -50, H + 50);
            const g = ctx.createRadialGradient(X - 3, Y - 3, 1, X, Y, 11);
            g.addColorStop(0, '#ffffff'); g.addColorStop(0.6, '#c9f7be'); g.addColorStop(1, '#7ee96f');
            ctx.save();
            ctx.shadowColor = 'rgba(126,233,111,0.9)'; ctx.shadowBlur = 22;
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(X, Y, 10, 0, 6.2832); ctx.fill();
            ctx.restore();
        }
    }

    /* ---------- readout and the plain-language result ---------- */
    function readout() {
        if (!run) { ['gdIt', 'gdX', 'gdFx', 'gdDx', 'gdUpd'].forEach(function (id) { $(id).textContent = '–'; }); return; }
        const s = run.steps[Math.min(k, run.steps.length - 1)];
        const r = lr();
        $('gdIt').textContent = Math.min(k, run.steps.length - 1) + ' of ' + (run.steps.length - 1);
        $('gdX').textContent = fmt(s.x);
        $('gdFx').textContent = fmt(s.fx);
        $('gdDx').textContent = fmt(s.g);
        const xn = s.x - r * s.g;
        $('gdUpd').textContent = 'x_new = x − lr × f′(x) = ' + fmt(s.x) + ' − ' + r + ' × ' + fmt(s.g) + ' = ' + fmt(xn);
    }
    function result() {
        const box = $('gdResult');
        box.className = 'pg-result';
        if (!run || k < run.steps.length - 1) { box.textContent = ''; return; }
        const end = run.steps[run.steps.length - 1];
        if (run.status === 'diverged') {
            box.classList.add('bad');
            box.textContent = 'The step size is too big, so it overshoots. Try a smaller learning rate.';
            return;
        }
        if (run.status === 'max') {
            box.classList.add('warn');
            box.textContent = 'Still rolling after ' + (run.steps.length - 1) + ' steps. Try more iterations or a bigger learning rate.';
            return;
        }
        let text = 'Found a low point at x = ' + end.x.toFixed(5) + ', y = ' + end.fx.toFixed(5) + ' after ' + (run.steps.length - 1) + ' steps.';
        if (lowerNearby(end)) { box.classList.add('warn'); text += ' This is a low point, but maybe not the lowest. Try a different starting x.'; }
        box.textContent = text;
    }
    // is there a clearly lower point within a wide window? (then this is a local minimum, like on the bumpy curve)
    function lowerNearby(end) {
        const span = Math.max(10, (view ? view.x1 - view.x0 : 10) * 2);
        for (let i = 0; i <= 1200; i++) {
            const x = end.x - span + 2 * span * i / 1200, y = fn.f(x);
            if (isFinite(y) && y < end.fx - 1e-3 * Math.max(1, Math.abs(end.fx))) return true;
        }
        return false;
    }

    /* ---------- animation controls ---------- */
    function tick(now) {
        const dt = now - last; last = now;
        if (playing && run) {
            t += dt / (STEP_MS / parseFloat(speedBox.value));
            while (t >= 1 && playing) {
                t -= 1; k++;
                readout();
                if (k >= run.steps.length - 1) { k = run.steps.length - 1; t = 0; finish(now); }
            }
        }
        draw(now);
        if (playing || (doneAt && now - doneAt < 1000)) raf = requestAnimationFrame(tick);
        else raf = 0;
    }
    function kick() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); } }
    function finish(now) {
        playing = false; playBtn.textContent = 'Play';
        doneAt = run.status === 'converged' ? now : 0;
        readout(); result();
    }
    function play() {
        if (!run) return;
        if (k >= run.steps.length - 1) { k = 0; t = 0; doneAt = 0; result(); }
        if (reduce.matches) { k = run.steps.length - 1; t = 0; readout(); finish(performance.now()); draw(); return; }   // jump straight to the answer
        playing = true; playBtn.textContent = 'Pause';
        kick();
    }
    function stop() { playing = false; playBtn.textContent = 'Play'; }
    playBtn.addEventListener('click', function () { playing ? stop() : play(); });
    $('gdStep').addEventListener('click', function () {
        if (!run) return;
        stop();
        if (k >= run.steps.length - 1) return;
        k++; t = 0; readout();
        if (k >= run.steps.length - 1) finish(performance.now());
        kick(); draw();
    });
    $('gdReset').addEventListener('click', function () { stop(); k = 0; t = 0; doneAt = 0; readout(); result(); draw(); });

    if ('ResizeObserver' in window) new ResizeObserver(size).observe(canvas);
    else window.addEventListener('resize', size);
    size();
    onEquation();
})();
