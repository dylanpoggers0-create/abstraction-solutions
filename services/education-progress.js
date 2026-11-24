/* =========================================================
   education-progress.js: how much of each AI Education video you've watched.
   (Kept out of education.html so the page can forbid inline scripts.)

   Counting
     Only seconds actually played count. While a video plays, each small step forward in time
     (timeupdate) is added to a list of played ranges, and overlapping ranges are merged. Seeking or
     scrubbing jumps the clock without playing, so it adds nothing: dragging to the end isn't "watched".
     Progress = played seconds / length, rounded down. It only reads 100% when the whole video has been
     played (the last half second is forgiven for rounding).

   The sticker
     Every video card has a small sticker in its top corner: a ring that fills to the percent with the
     number in the middle, or a green check in a circle once it's 100%.

   Saving
     Signed in (the account saved by the Order page): progress loads from the server when the page opens,
     and saves at most every 10 seconds while playing, plus on pause, at the end, and when you leave the tab.
     The server never lowers progress and never undoes a completion.
     Signed out: progress shows for this visit only, with a "Sign in to save your progress" note. It's also
     kept in this browser as a pending copy, and added to the account (keeping the higher value) the next
     time this page opens signed in. Nothing is sent to analytics.

   The celebration
     The first time a video reaches 100% for you: the screen dims, a big black circle-check appears, fills
     with green liquid from the bottom (it sloshes a little), glows, then shrinks and flies into the video's
     sticker. About 2.7 seconds; click, tap or Esc skips it. Once per video, never on replays.
     With "reduce motion" on there's no overlay: the sticker simply fades to green.
   ========================================================= */
(function () {
    'use strict';
    const API_BASE = 'https://abstraction-quote-engine.onrender.com';
    const ACCOUNT_KEY = 'asAccount';                  // the Order page's saved sign-in
    const PENDING_KEY = 'asVideoProgressPending';     // signed-out progress waiting to be added to an account
    const SAVE_EVERY = 10000;                         // at most one save per video per 10 s while playing
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const SVGNS = 'http://www.w3.org/2000/svg';

    const videos = Array.prototype.slice.call(document.querySelectorAll('video[data-video-id]'));
    if (!videos.length) return;

    function account() {
        try {
            const a = JSON.parse(localStorage.getItem(ACCOUNT_KEY) || 'null');
            return a && a.token && a.expires * 1000 > Date.now() ? a : null;
        } catch (e) { return null; }
    }

    /* ---------- played ranges ---------- */
    function merge(ranges) {
        const r = ranges.filter(function (x) { return x && x[1] > x[0]; })
                        .map(function (x) { return [x[0], x[1]]; })
                        .sort(function (a, b) { return a[0] - b[0]; });
        const out = [];
        r.forEach(function (x) {
            const last = out[out.length - 1];
            if (last && x[0] <= last[1] + 0.25) last[1] = Math.max(last[1], x[1]);
            else out.push(x);
        });
        return out;
    }
    function playedSeconds(ranges) { return ranges.reduce(function (s, x) { return s + (x[1] - x[0]); }, 0); }
    function percentOf(st) {
        if (!st.duration) return st.saved || 0;
        const played = playedSeconds(st.ranges);
        if (played >= st.duration - 0.5) return 100;                 // the whole thing (last half second forgiven)
        return Math.max(st.saved || 0, Math.min(99, Math.floor(played / st.duration * 100)));
    }

    /* ---------- the sticker ---------- */
    const RING = 2 * Math.PI * 15;   // circumference of the ring (r = 15)
    function makeSticker(fig) {
        const s = document.createElement('div');
        s.className = 'vp-sticker';
        s.setAttribute('role', 'img');
        s.innerHTML =
            '<svg viewBox="0 0 40 40" aria-hidden="true">' +
                '<circle class="vp-track" cx="20" cy="20" r="15"/>' +
                '<circle class="vp-fill" cx="20" cy="20" r="15" transform="rotate(-90 20 20)" stroke-dasharray="' + RING.toFixed(2) + '" stroke-dashoffset="' + RING.toFixed(2) + '"/>' +
                '<g class="vp-done"><circle cx="20" cy="20" r="17"/><path d="M12.5 20.5l5 5 10-11"/></g>' +
            '</svg><span class="vp-pct">0%</span>';
        fig.appendChild(s);
        return s;
    }
    function paint(st) {
        const pct = st.completed ? 100 : percentOf(st);
        const s = st.sticker;
        s.classList.toggle('is-done', !!st.completed);
        s.classList.toggle('is-zero', pct === 0 && !st.completed);
        s.querySelector('.vp-fill').setAttribute('stroke-dashoffset', (RING * (1 - pct / 100)).toFixed(2));
        s.querySelector('.vp-pct').textContent = pct + '%';
        s.setAttribute('aria-label', st.completed ? 'Watched' : pct + '% watched');
    }

    /* ---------- state for every video ---------- */
    const state = {};
    videos.forEach(function (v) {
        const id = v.getAttribute('data-video-id');
        const fig = v.closest('figure') || v.parentElement;
        fig.classList.add('vp-card');
        const st = state[id] = { id: id, video: v, ranges: [], duration: 0, saved: 0, completed: false,
                                 celebrated: false, dirty: false, lastSave: 0, lastT: null, sticker: makeSticker(fig) };
        paint(st);

        function setDuration() { if (isFinite(v.duration) && v.duration > 0) st.duration = v.duration; }
        v.addEventListener('loadedmetadata', setDuration);
        v.addEventListener('durationchange', setDuration);
        v.addEventListener('play', function () { st.lastT = v.currentTime; });
        v.addEventListener('seeking', function () { st.lastT = null; });          // a jump: nothing in between was played
        v.addEventListener('seeked', function () { if (!v.paused) st.lastT = v.currentTime; });
        // the time since the last check was really played (not a jump): add it to the played ranges
        function step() {
            const t = v.currentTime, d = st.lastT === null ? -1 : t - st.lastT;
            // timeupdate fires a few times a second, so a real step is short (longer at faster speeds)
            if (d > 0 && d <= 1.5 * Math.max(1, v.playbackRate) + 0.5) { st.ranges = merge(st.ranges.concat([[st.lastT, t]])); st.dirty = true; }
            st.lastT = t;
        }
        v.addEventListener('timeupdate', function () {
            if (v.seeking) { st.lastT = null; return; }
            if (v.paused) return;                      // pause/ended handle the last stretch
            step();
            update(st, false);
        });
        function stop() {                              // pause and the end both count the last stretch before it
            setDuration();
            if (!v.seeking) step();
            st.lastT = null;
            update(st, true);
        }
        v.addEventListener('pause', stop);
        v.addEventListener('ended', stop);
    });

    function update(st, forceSave) {
        const pct = percentOf(st);
        if (pct >= 100 && !st.completed) {
            st.completed = true;
            st.dirty = true;
            if (!st.celebrated) { st.celebrated = true; celebrate(st); }
            forceSave = true;
        } else {
            paint(st);
        }
        if (st.dirty && (forceSave || Date.now() - st.lastSave >= SAVE_EVERY)) save(st);
    }

    /* ---------- saving ---------- */
    function save(st, leaving) {
        st.dirty = false;
        st.lastSave = Date.now();
        const body = { percent: st.completed ? 100 : percentOf(st), watched_ranges: st.ranges.map(function (r) { return [+r[0].toFixed(1), +r[1].toFixed(1)]; }) };
        const acct = account();
        if (!acct) { keepPending(st, body); return; }
        fetch(API_BASE + '/api/progress/videos/' + encodeURIComponent(st.id), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + acct.token },
            body: JSON.stringify(body),
            keepalive: !!leaving                       // finishes even if the tab is closing
        }).then(function (r) {
            if (!r.ok) { st.dirty = true; return null; }
            return r.json();
        }).then(function (res) {
            if (res) st.saved = Math.max(st.saved, res.percent || 0);
        }).catch(function () { st.dirty = true; });   // offline: try again on the next save
    }
    function keepPending(st, body) {
        try {
            const p = JSON.parse(localStorage.getItem(PENDING_KEY) || '{}');
            const old = p[st.id] || { percent: 0, watched_ranges: [] };
            p[st.id] = { percent: Math.max(old.percent, body.percent), watched_ranges: merge(old.watched_ranges.concat(body.watched_ranges)) };
            localStorage.setItem(PENDING_KEY, JSON.stringify(p));
        } catch (e) {}
    }
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState !== 'hidden') return;
        Object.keys(state).forEach(function (id) { if (state[id].dirty) save(state[id], true); });
    });

    /* ---------- page open: load the account's progress, add any pending signed-out progress ---------- */
    const acct = account();
    document.querySelectorAll('[data-progress-note]').forEach(function (n) { n.hidden = !!acct; });
    if (acct) {
        fetch(API_BASE + '/api/progress/videos', { headers: { Authorization: 'Bearer ' + acct.token } })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (res) {
                if (!res) return;
                Object.keys(res.videos || {}).forEach(function (id) {
                    const st = state[id], row = res.videos[id];
                    if (!st) return;
                    st.saved = Math.max(st.saved, row.percent || 0);
                    st.ranges = merge(st.ranges.concat(row.watched_ranges || []));
                    if (row.completed) { st.completed = true; st.celebrated = true; }   // already done: steady check, no animation
                    paint(st);
                });
                addPending(acct);
            }).catch(function () {});
    }
    function addPending(acct) {
        let p;
        try { p = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null'); } catch (e) { p = null; }
        if (!p) return;
        const jobs = Object.keys(p).filter(function (id) { return state[id]; }).map(function (id) {
            const st = state[id];
            st.ranges = merge(st.ranges.concat(p[id].watched_ranges || []));
            st.saved = Math.max(st.saved, p[id].percent || 0);
            if (p[id].percent >= 100) { st.completed = true; st.celebrated = true; }
            paint(st);
            return fetch(API_BASE + '/api/progress/videos/' + encodeURIComponent(id), {
                method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + acct.token },
                body: JSON.stringify(p[id])
            }).then(function (r) { if (!r.ok) throw new Error('save'); });
        });
        Promise.all(jobs).then(function () { try { localStorage.removeItem(PENDING_KEY); } catch (e) {} }, function () {});
    }

    /* ---------- the celebration ---------- */
    let showing = null;
    function celebrate(st) {
        if (reduce.matches || showing) {               // reduce motion (or one already playing): the sticker fades to green
            st.sticker.classList.add('vp-fade');
            paint(st);
            return;
        }
        const ov = document.createElement('div');
        ov.className = 'vp-overlay';
        ov.setAttribute('role', 'status');
        ov.setAttribute('aria-label', 'Video complete');
        ov.innerHTML =
            '<div class="vp-badge">' +
                '<div class="vp-glow"></div>' +
                '<svg viewBox="0 0 200 200" aria-hidden="true">' +
                    '<defs><clipPath id="vpLiquid"><path class="vp-wave" d=""/></clipPath></defs>' +
                    // empty: a black disc with a dark check
                    '<circle cx="100" cy="100" r="86" fill="#000" stroke="rgba(245,248,244,0.35)" stroke-width="4"/>' +
                    '<path d="M58 102l28 28 56-62" fill="none" stroke="#2a332c" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>' +
                    // full: the same badge in green, shown only below the liquid line
                    '<g clip-path="url(#vpLiquid)">' +
                        '<circle cx="100" cy="100" r="86" fill="#7ee96f" stroke="#b9f5ad" stroke-width="4"/>' +
                        '<path d="M58 102l28 28 56-62" fill="none" stroke="#041004" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>' +
                    '</g>' +
                '</svg>' +
            '</div>';
        document.body.appendChild(ov);
        const badge = ov.querySelector('.vp-badge');
        const wave = ov.querySelector('.vp-wave');
        showing = { ov: ov, st: st, raf: 0, timers: [] };

        // the liquid: a wavy line rising from the bottom of the 200 x 200 box, sloshing less as it fills
        const t0 = performance.now(), RISE = 1300, START = 180;
        function waveAt(now) {
            const t = Math.max(0, now - t0 - START);
            const k = Math.min(1, t / RISE);
            const ease = 1 - Math.pow(1 - k, 3);
            const level = 212 - ease * 224;                         // 212 (below) -> -12 (above): fully covered
            const amp = 9 * (1 - k) + 1.5;                           // big slosh at first, nearly calm at the top
            const tilt = Math.sin(t / 260) * 7 * (1 - k);            // the surface rocks side to side
            const ph = t / 140;
            let d = 'M0 ' + (level + tilt).toFixed(1);
            for (let x = 0; x <= 200; x += 10) {
                const y = level + tilt * (1 - x / 100) + Math.sin(x / 22 + ph) * amp + Math.sin(x / 9 - ph * 1.6) * amp * 0.35;
                d += ' L' + x + ' ' + y.toFixed(1);
            }
            wave.setAttribute('d', d + ' L200 220 L0 220 Z');
            return k;
        }
        function frame(now) {
            if (!showing || showing.ov !== ov) return;
            if (waveAt(now) < 1) showing.raf = requestAnimationFrame(frame);
        }
        waveAt(t0);
        showing.raf = requestAnimationFrame(frame);

        requestAnimationFrame(function () { ov.classList.add('is-in'); });
        showing.timers.push(setTimeout(function () { badge.classList.add('is-glowing'); }, START + RISE));
        showing.timers.push(setTimeout(function () { flyHome(); }, START + RISE + 650));
        showing.timers.push(setTimeout(finish, START + RISE + 650 + 620));

        // shrink and fly into the video's sticker
        function flyHome() {
            const from = badge.getBoundingClientRect(), to = st.sticker.getBoundingClientRect();
            const dx = (to.left + to.width / 2) - (from.left + from.width / 2);
            const dy = (to.top + to.height / 2) - (from.top + from.height / 2);
            const sc = Math.max(0.05, to.width / from.width);
            ov.classList.add('is-leaving');
            badge.animate([
                { transform: 'translate(0, 0) scale(1)' },
                { transform: 'translate(' + dx * 0.35 + 'px, ' + (dy * 0.35 - 40) + 'px) scale(' + (0.6 + sc * 0.4) + ')', offset: 0.4 },
                { transform: 'translate(' + dx + 'px, ' + dy + 'px) scale(' + sc + ')' }
            ], { duration: 600, easing: 'cubic-bezier(.5, 0, .3, 1)', fill: 'forwards' });
        }
        function finish() {
            if (!showing || showing.ov !== ov) return;
            cancelAnimationFrame(showing.raf);
            showing.timers.forEach(clearTimeout);
            showing = null;
            ov.remove();
            document.removeEventListener('keydown', onKey);
            paint(st);
            st.sticker.classList.add('vp-pop');
            setTimeout(function () { st.sticker.classList.remove('vp-pop'); }, 700);
        }
        function onKey(e) { if (e.key === 'Escape') finish(); }
        ov.addEventListener('click', finish);         // click or tap skips it
        document.addEventListener('keydown', onKey);
    }
})();
