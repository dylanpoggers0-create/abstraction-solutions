/* =========================================================
   education.quiz.js: the "how much AI do you know?" quiz on the AI Education page.

   - First visit: a short offer ("Quick check… 2 minutes, 10 questions"), with Take the quiz / Skip for now.
     Skipping never blocks anything; a "Take the starting quiz" link stays above the lessons until it's done.
   - The quiz: one question at a time, a progress bar, Back and Next. Real radio buttons, so arrow keys,
     Tab and screen readers all work. Questions and choices come shuffled from the server.
   - After the starting ("before") quiz: just the score and a breakdown by topic. No answers yet, so the
     after quiz still measures real learning.
   - The "after" quiz unlocks once every lesson is finished (checked on the server), with the same questions.
     Its results show before vs after, the change, each topic, and every question with the right answer,
     why, and a link to the lesson that teaches it.
   - Practice quizzes (signed in) draw fresh questions any time and never change the counted scores.

   Signed out: the starting quiz is tied to a random token this browser keeps (asQuizGuest), and its score
   is kept here too. On the next signed-in visit both move to the account (POST /api/quiz/claim).
   Every answer is checked on the server (quote-engine: /api/quiz). Everything shown uses textContent.
   ========================================================= */
(function () {
    'use strict';
    const bar = document.getElementById('quizBar');
    if (!bar) return;

    const API = 'https://abstraction-quote-engine.onrender.com';
    const GUEST = 'asQuizGuest', GUEST_RESULT = 'asQuizGuestResult', SEEN = 'asQuizSeen';
    const TOPICS = { ai: 'AI and machine learning', genai: 'Generative AI', data: 'Data', cloud: 'Cloud and devices',
                     business: 'AI for business', governance: 'Responsible AI', pm: 'Building with AI' };
    let status = null, box = null, panel = null, opener = null;

    /* ---------- small helpers ---------- */
    function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
    function get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
    function put(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
    function account() {
        const a = get('asAccount');
        return a && a.token && a.expires * 1000 > Date.now() ? a : null;
    }
    function day(iso) {
        try { return new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }); } catch (e) { return ''; }
    }
    function pct(s, t) { return t ? Math.round(100 * s / t) : 0; }
    // our free server can be asleep: try a few times on 502/503/504
    async function api(path, opts) {
        opts = opts || {};
        const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
        const a = account();
        if (a) headers.Authorization = 'Bearer ' + a.token;
        let r;
        for (let tries = 0; tries < 3; tries++) {
            r = await fetch(API + path, { method: opts.method || 'GET', headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
            if ([502, 503, 504].indexOf(r.status) < 0) break;
            await new Promise(function (d) { setTimeout(d, 3500); });
        }
        const data = await r.json().catch(function () { return {}; });
        if (!r.ok) { const e = new Error(data.detail || 'Something went wrong. Please try again in a minute.'); e.status = r.status; throw e; }
        return data;
    }

    /* ---------- where they are ---------- */
    async function refresh() {
        const a = account();
        try {
            if (a) {
                const g = get(GUEST);
                if (g) {                       // took the starting quiz signed out: it moves to the account now
                    await api('/api/quiz/claim', { method: 'POST', body: { guest_token: g } }).catch(function () {});
                    put(GUEST, null); put(GUEST_RESULT, null);
                }
                status = await api('/api/quiz/me');
            } else {
                status = { guest: true, before: get(GUEST_RESULT) };
            }
        } catch (e) { status = null; }
        renderBar();
        if (status && !status.before && !status.after && !get(SEEN)) setTimeout(offer, 1400);
    }

    function link(text, fn) { const b = el('button', 'qz-link', text); b.type = 'button'; b.addEventListener('click', fn); return b; }
    function renderBar() {
        bar.textContent = '';
        if (!status) { bar.hidden = true; return; }
        bar.hidden = false;
        const s = status, line = el('p', 'qz-bar-text');
        if (!s.before && !s.after) {
            line.appendChild(document.createTextNode('How much AI do you already know? '));
            line.appendChild(link('Take the starting quiz', function (e) { start('before', e.currentTarget); }));
            line.appendChild(document.createTextNode(' (2 minutes, 10 questions).'));
        } else if (s.guest) {
            line.appendChild(document.createTextNode('Your starting quiz: ' + s.before.score + ' of ' + s.before.total + '. '));
            line.appendChild(link('Sign in', function (e) { window.ASAccount ? ASAccount.open('signup', e.currentTarget) : (location.href = '../order.html#signIn'); }));
            line.appendChild(document.createTextNode(' to keep it, then finish every lesson to unlock your after quiz.'));
        } else if (s.after) {
            line.appendChild(document.createTextNode('Your quiz: ' + (s.before ? s.before.score + ' before, ' : '') + s.after.score + ' of ' + s.after.total + ' after. '));
            line.appendChild(link('See your results', function (e) { opener = e.currentTarget; showSaved(); }));
            line.appendChild(document.createTextNode(' · '));
            line.appendChild(link('Practice quiz', function (e) { start('practice', e.currentTarget); }));
        } else if (s.unlocked) {
            line.appendChild(document.createTextNode('You’ve finished every lesson. '));
            const b = el('button', 'qz-go', 'Take your after quiz');
            b.type = 'button';
            b.addEventListener('click', function (e) { start('after', e.currentTarget); });
            line.appendChild(b);
        } else {
            if (s.before) line.appendChild(document.createTextNode('Starting quiz: ' + s.before.score + ' of ' + s.before.total + '. '));
            line.appendChild(document.createTextNode('Finish all the lessons to unlock your after quiz (' + s.lessons_done + ' of ' + s.lessons_total + ' done). '));
            if (!s.before) line.appendChild(link('Take the starting quiz', function (e) { start('before', e.currentTarget); }));
            else line.appendChild(link('Practice quiz', function (e) { start('practice', e.currentTarget); }));
        }
        bar.appendChild(line);
    }

    /* ---------- the window everything happens in ---------- */
    function build() {
        box = el('div', 'qz-backdrop');
        box.hidden = true;
        panel = el('div', 'qz-panel');
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('aria-labelledby', 'qzTitle');
        const close = el('button', 'qz-close');
        close.type = 'button';
        close.setAttribute('aria-label', 'Close');
        close.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        close.addEventListener('click', hide);
        panel.appendChild(close);
        panel.appendChild(el('div', 'qz-body'));
        box.appendChild(panel);
        document.body.appendChild(box);
        box.addEventListener('click', function (e) { if (e.target === box) hide(); });
        document.addEventListener('keydown', function (e) {
            if (box.hidden) return;
            if (e.key === 'Escape') { e.preventDefault(); hide(); return; }
            if (e.key !== 'Tab') return;
            const f = Array.prototype.filter.call(panel.querySelectorAll('button, a[href], input:not([disabled])'), function (x) {
                return x.offsetParent !== null && !x.disabled && (x.type !== 'radio' || x.checked || !panel.querySelector('input[name="' + x.name + '"]:checked'));
            });
            if (!f.length) return;
            if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
            else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
        });
    }
    function body() { return panel.querySelector('.qz-body'); }
    function show(from) {
        if (!box) build();
        if (from) opener = from;
        box.hidden = false;
        document.documentElement.classList.add('qz-open');
        requestAnimationFrame(function () { box.classList.add('is-open'); });
    }
    function hide() {
        if (!box || box.hidden) return;
        box.classList.remove('is-open');
        document.documentElement.classList.remove('qz-open');
        setTimeout(function () { box.hidden = true; }, 200);
        if (opener && opener.focus && document.contains(opener)) opener.focus();
    }
    function focusTitle() { const h = body().querySelector('#qzTitle'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); } }
    function message(text, isError) {
        const b = body(); b.textContent = '';
        b.appendChild(el('h2', null, isError ? 'Not just yet' : 'One moment')).id = 'qzTitle';
        const p = el('p', 'qz-lead' + (isError ? ' is-bad' : ''), text);
        p.setAttribute('role', 'status');
        b.appendChild(p);
        if (isError) { const r = el('div', 'qz-row'); r.appendChild(btn('Back to the lessons', hide, true)); b.appendChild(r); }
        focusTitle();
    }
    function btn(text, fn, ghost) { const b = el('button', 'qz-btn' + (ghost ? ' is-ghost' : ''), text); b.type = 'button'; b.addEventListener('click', fn); return b; }

    /* ---------- the first-visit offer ---------- */
    function offer() {
        if (box && !box.hidden) return;
        put(SEEN, 1);
        show(document.activeElement);
        const b = body(); b.textContent = '';
        b.appendChild(el('div', 'qz-mark')).setAttribute('aria-hidden', 'true');
        const h = el('h2', null, 'Quick check: how much AI do you already know?'); h.id = 'qzTitle'; b.appendChild(h);
        b.appendChild(el('p', 'qz-lead', '2 minutes, 10 questions, no wrong way to start. Take it again once you’ve finished the lessons and see how much you’ve learned.'));
        const r = el('div', 'qz-row');
        r.appendChild(btn('Take the quiz', function () { start('before'); }));
        r.appendChild(btn('Skip for now', hide, true));
        b.appendChild(r);
        setTimeout(function () { r.firstChild.focus(); }, 60);
    }

    /* ---------- taking a quiz ---------- */
    let quiz = null;
    async function start(kind, from) {
        put(SEEN, 1);
        show(from);
        message('Getting your questions ready… (the first time can take up to a minute while our server wakes up)');
        try {
            const headers = {};
            const g = get(GUEST);
            if (!account() && g) headers['X-Quiz-Guest'] = g;
            const d = await api('/api/quiz?kind=' + kind, { headers: headers });
            if (d.guest_token) put(GUEST, d.guest_token);
            quiz = { kind: kind, questions: d.questions, i: 0, answers: {}, practice_token: d.practice_token || null };
            ask();
        } catch (e) {
            message(e.status === 409 ? e.message : e.status === 403 ? e.message : e.status === 401 ? 'Please sign in to take this quiz.' :
                    (e.message || 'Couldn’t reach our server. Please try again in a minute.'), true);
            if (e.status === 409) refresh();
        }
    }
    function ask() {
        const q = quiz.questions[quiz.i], n = quiz.questions.length, b = body();
        b.textContent = '';
        const top = el('div', 'qz-top');
        const h = el('h2', 'qz-count', 'Question ' + (quiz.i + 1) + ' of ' + n); h.id = 'qzTitle';
        top.appendChild(h);
        top.appendChild(el('span', 'qz-kind', quiz.kind === 'before' ? 'Starting quiz' : quiz.kind === 'after' ? 'After quiz' : 'Practice'));
        b.appendChild(top);
        const track = el('div', 'qz-track');
        track.setAttribute('role', 'progressbar');
        track.setAttribute('aria-label', 'Quiz progress');
        track.setAttribute('aria-valuemin', '0'); track.setAttribute('aria-valuemax', String(n));
        track.setAttribute('aria-valuenow', String(Object.keys(quiz.answers).length));
        const fill = el('div', 'qz-fill'); fill.style.width = (100 * quiz.i / n) + '%';
        track.appendChild(fill);
        b.appendChild(track);
        requestAnimationFrame(function () { fill.style.width = (100 * (quiz.i + (quiz.answers[q.id] != null ? 1 : 0)) / n) + '%'; });

        const fs = el('fieldset', 'qz-q');
        fs.appendChild(el('legend', null, q.question));
        q.choices.forEach(function (c, j) {
            const lab = el('label', 'qz-choice');
            const input = el('input');
            input.type = 'radio'; input.name = 'qz-' + q.id; input.value = String(c.k);
            input.checked = quiz.answers[q.id] === c.k;
            input.addEventListener('change', function () {
                quiz.answers[q.id] = c.k;
                next.disabled = false;
                fill.style.width = (100 * (quiz.i + 1) / n) + '%';
                track.setAttribute('aria-valuenow', String(Object.keys(quiz.answers).length));
            });
            lab.appendChild(input);
            lab.appendChild(el('span', 'qz-letter', 'ABCD'.charAt(j)));
            lab.appendChild(el('span', 'qz-choice-text', c.text));
            fs.appendChild(lab);
        });
        b.appendChild(fs);
        const row = el('div', 'qz-row qz-nav');
        const back = btn('Back', function () { quiz.i--; ask(); }, true);
        back.disabled = quiz.i === 0;
        const last = quiz.i === n - 1;
        const next = btn(last ? 'See my score' : 'Next', function () {
            if (quiz.answers[q.id] == null) return;
            if (last) submit(); else { quiz.i++; ask(); }
        });
        next.disabled = quiz.answers[q.id] == null;
        row.appendChild(back); row.appendChild(next);
        b.appendChild(row);
        // Enter moves on once an answer is picked
        fs.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !next.disabled) { e.preventDefault(); next.click(); } });
        focusTitle();
    }
    async function submit() {
        message('Checking your answers…');
        try {
            const r = await api('/api/quiz/submit', { method: 'POST', body: {
                kind: quiz.kind, answers: quiz.answers,
                guest_token: !account() ? get(GUEST) : null, practice_token: quiz.practice_token } });
            if (r.saved === 'browser') put(GUEST_RESULT, { score: r.score, total: r.total, by_field: r.by_field, at: new Date().toISOString() });
            results(r);
            refresh();
        } catch (e) {
            message(e.message, true);
            if (e.status === 409) refresh();
        }
    }

    /* ---------- results ---------- */
    function topicBars(by, before) {
        const list = el('ul', 'qz-topics');
        Object.keys(by).sort(function (a, b) { return by[b].total - by[a].total; }).forEach(function (f) {
            const v = by[f], li = el('li');
            li.appendChild(el('span', 'qz-topic', TOPICS[f] || f));
            const bars = el('span', 'qz-bars');
            if (before && before[f]) {
                const bb = el('span', 'qz-b is-before'); bb.style.width = pct(before[f].correct, before[f].total) + '%';
                bb.title = 'Before: ' + before[f].correct + ' of ' + before[f].total;
                bars.appendChild(bb);
            }
            const ab = el('span', 'qz-b'); ab.style.width = Math.max(3, pct(v.correct, v.total)) + '%';
            bars.appendChild(ab);
            li.appendChild(bars);
            li.appendChild(el('span', 'qz-topic-n', (before && before[f] ? before[f].correct + ' → ' : '') + v.correct + ' of ' + v.total));
            list.appendChild(li);
        });
        return list;
    }
    function review(items) {
        const ol = el('ol', 'qz-review');
        items.forEach(function (it) {
            const li = el('li', it.correct ? 'is-right' : 'is-wrong');
            li.appendChild(el('p', 'qz-rq', it.question));
            if (!it.correct && it.chosen != null) li.appendChild(el('p', 'qz-yours', 'Your answer: ' + it.choices[it.chosen]));
            li.appendChild(el('p', 'qz-right', (it.correct ? '✓ ' : 'Answer: ') + it.choices[it.answer]));
            li.appendChild(el('p', 'qz-why', it.explanation));
            const a = el('a', 'qz-lesson', 'Watch the lesson: ' + it.lesson_title);
            a.href = '#lesson-' + it.lesson_id;
            a.addEventListener('click', function (e) { e.preventDefault(); toLesson(it.lesson_id); });
            li.appendChild(a);
            ol.appendChild(li);
        });
        return ol;
    }
    function toLesson(id) {
        hide();
        const v = document.querySelector('[data-video-id="' + CSS.escape(id) + '"]');
        if (!v) return;
        const d = v.closest('details');
        if (d && !d.open) d.open = true;                 // lessons tucked under "Show all videos"
        const fig = v.closest('figure') || v;
        setTimeout(function () {
            fig.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
            v.focus({ preventScroll: true });
        }, 220);
    }
    function results(r) {
        const b = body(); b.textContent = '';
        if (r.kind === 'before') {
            const h = el('h2', null, 'You got ' + r.score + ' of ' + r.total); h.id = 'qzTitle'; b.appendChild(h);
            b.appendChild(el('p', 'qz-lead', 'A great place to start. Here’s how it breaks down by topic:'));
            b.appendChild(topicBars(r.by_field));
            b.appendChild(el('p', 'qz-note', 'We’ll show the answers after your after quiz, so it can measure what you really learn. ' +
                'Finish every lesson to unlock it.' + (r.saved === 'browser' ? ' Sign in to keep this score with your account.' : '')));
        } else if (r.kind === 'after') {
            celebrate(b, r.before, r);
        } else {
            const h = el('h2', null, 'Practice: ' + r.score + ' of ' + r.total); h.id = 'qzTitle'; b.appendChild(h);
            b.appendChild(el('p', 'qz-lead', 'This one doesn’t change your counted scores. Here’s every answer:'));
            b.appendChild(topicBars(r.by_field));
            b.appendChild(review(r.review || []));
        }
        const row = el('div', 'qz-row');
        row.appendChild(btn('Back to the lessons', hide, r.kind !== 'before'));
        b.appendChild(row);
        focusTitle();
    }
    function celebrate(b, before, after) {
        const mark = el('div', 'qz-mark is-done'); mark.setAttribute('aria-hidden', 'true'); b.appendChild(mark);
        const h = el('h2', null, 'You got ' + after.score + ' of ' + after.total); h.id = 'qzTitle'; b.appendChild(h);
        if (before) {
            const d = after.score - before.score;
            b.appendChild(el('p', 'qz-change', (d > 0 ? '+' + d + (d === 1 ? ' question' : ' questions') : d === 0 ? 'Same score' : d + ' questions') +
                ' (' + pct(before.score, before.total) + '% → ' + pct(after.score, after.total) + '%)'));
            const cmp = el('div', 'qz-compare');
            [['Before', before, 'is-before'], ['After', after, '']].forEach(function (x) {
                const c = el('div', 'qz-stat ' + x[2]);
                c.appendChild(el('strong', null, x[1].score + '/' + x[1].total));
                c.appendChild(el('span', null, x[0]));
                cmp.appendChild(c);
            });
            b.appendChild(cmp);
            if (before.at) b.appendChild(el('p', 'qz-note', 'Starting quiz taken ' + day(before.at) + '.'));
            b.appendChild(el('h3', null, 'By topic'));
            b.appendChild(topicBars(after.by_field, before.by_field));
        } else {
            b.appendChild(el('p', 'qz-lead', 'You finished every lesson and the after quiz. (No starting quiz to compare with.)'));
            b.appendChild(topicBars(after.by_field));
        }
        b.appendChild(el('h3', null, 'Every question'));
        b.appendChild(review(after.review || []));
    }
    async function showSaved() {
        show();
        message('Loading your results…');
        try {
            const s = await api('/api/quiz/me');
            if (!s.after) { message('Take your after quiz first.', true); return; }
            const b = body(); b.textContent = '';
            celebrate(b, s.before, { score: s.after.score, total: s.after.total, by_field: s.after.by_field, review: s.review });
            const row = el('div', 'qz-row'); row.appendChild(btn('Back to the lessons', hide, true)); b.appendChild(row);
            focusTitle();
        } catch (e) { message(e.message, true); }
    }

    // finishing a lesson can unlock the after quiz; signing in or out changes everything
    let rt = 0;
    window.addEventListener('as-lesson-done', function () { clearTimeout(rt); rt = setTimeout(refresh, 1500); });
    window.addEventListener('as-account-change', refresh);
    window.addEventListener('storage', function (e) { if (e.key === 'asAccount') refresh(); });
    refresh();
})();
