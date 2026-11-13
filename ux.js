/* =========================================================
   ux.js: small interaction upgrades used on every page (loaded by nav.js).
     window.UX.toast(message, {undo, timeout})      undo toasts
     window.UX.swr(key, url, render)                 stale-while-revalidate JSON
     window.UX.skeleton(container, count, kind)      skeleton loaders
     window.UX.idempotencyKey()                      a fresh key per form submission
     window.UX.addCommands([...])                    page-specific entries for the command menu
     window.UX.closeWatch(onClose)                   Android back gesture / Esc closes an overlay
   Plus: command menu (Ctrl/⌘ K), shortcut hints, prerendering of likely next pages,
   BlurHash placeholders, swipe-to-dismiss for the menu, and the Services flyout's safe triangle.
   ========================================================= */
(function () {
    'use strict';
    const UX = window.UX = window.UX || {};
    const BASE = (document.currentScript && document.currentScript.src || '').replace(/ux\.js.*$/, '') || '/';
    const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    const MOD = IS_MAC ? '⌘' : 'Ctrl';
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
    function ready(fn) { document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn) : fn(); }

    const css = el('style');
    css.textContent =
        /* toasts */
        '.toast-stack{position:fixed;left:50%;bottom:calc(20px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:400;' +
            'display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;width:min(92vw,440px)}' +
        '.toast{pointer-events:auto;display:flex;align-items:center;gap:14px;width:100%;padding:12px 14px 12px 18px;border-radius:14px;' +
            'background:#151a16;border:1px solid var(--green-dim,#2c5a28);color:#eef3ee;box-shadow:0 10px 30px rgba(0,0,0,.6);' +
            'transition:transform .25s ease,opacity .25s ease}' +
        '.toast.enter,.toast.leave{opacity:0;transform:translateY(12px)}' +
        '.toast span{flex:1;line-height:1.4}' +
        '.toast button{border:0;background:transparent;color:var(--green,#7ee96f);font:inherit;font-weight:bold;cursor:pointer;padding:6px 8px;border-radius:8px}' +
        '.toast button:hover{background:rgba(126,233,111,.12)}' +
        /* command menu */
        '.cmdk{position:fixed;inset:0;z-index:500;display:flex;align-items:flex-start;justify-content:center;padding:12vh 16px 16px;' +
            'background:rgba(0,0,0,.55);opacity:0;pointer-events:none;transition:opacity .18s ease}' +
        '.cmdk.open{opacity:1;pointer-events:auto}' +
        '.cmdk-panel{width:min(600px,100%);max-height:70vh;display:flex;flex-direction:column;background:#111612;border:1px solid #2a352b;' +
            'border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.7);transform:translateY(-8px) scale(.98);transition:transform .18s ease;overflow:hidden}' +
        '.cmdk.open .cmdk-panel{transform:none}' +
        '.cmdk-top{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid #222b23}' +
        '.cmdk-top input{flex:1;border:0;background:transparent;color:#fff;font:inherit;font-size:1.05rem;outline:none}' +
        '.cmdk-close{border:0;background:transparent;color:#9aa69c;cursor:pointer;padding:0}' +
        '.cmdk-list{list-style:none;margin:0;padding:6px;overflow-y:auto;overscroll-behavior:contain}' +
        '.cmdk-group{padding:10px 12px 4px;color:#7b867c;font-size:.72rem;letter-spacing:1.5px}' +
        '.cmdk-item{display:flex;align-items:center;gap:10px;padding:11px 12px;border-radius:10px;color:#e5ebe5;cursor:pointer}' +
        '.cmdk-item small{margin-left:auto;color:#7b867c}' +
        '.cmdk-item[aria-selected=true]{background:rgba(126,233,111,.12);color:var(--green,#7ee96f)}' +
        '.cmdk-empty{padding:18px;color:#9aa69c;text-align:center}' +
        '.cmdk-foot{display:flex;gap:16px;padding:10px 16px;border-top:1px solid #222b23;color:#7b867c;font-size:.78rem}' +
        '@media (max-width:600px){.cmdk{padding:calc(10px + env(safe-area-inset-top)) 10px 10px}.cmdk-panel{max-height:80vh}.cmdk-foot{display:none}}' +
        '@media (prefers-reduced-motion:reduce){.cmdk,.cmdk-panel,.toast{transition:none}}' +
        /* Services flyout */
        '.nav-flyout{position:fixed;z-index:310;width:250px;padding:8px;display:none;flex-direction:column;gap:2px;background:var(--nav-bg,#121212);' +
            'border:1px solid var(--nav-line,#262626);border-radius:14px;box-shadow:8px 0 30px rgba(0,0,0,.6)}' +
        '.nav-flyout.open{display:flex}' +
        '.nav-flyout a{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;color:#dfe7df;text-decoration:none}' +
        '.nav-flyout a:hover,.nav-flyout a:focus-visible{background:rgba(126,233,111,.1);color:var(--green,#7ee96f)}';
    document.head.appendChild(css);

    /* ---------- 12. Predictive back: the Android back gesture (and Esc) closes the top overlay
       instead of leaving the page. Uses CloseWatcher where the browser has it. ---------- */
    UX.closeWatch = function (onClose) {
        if (!('CloseWatcher' in window)) return { done: function () {} };
        let w;
        try { w = new CloseWatcher(); } catch (e) { return { done: function () {} }; }
        w.onclose = onClose;
        return { done: function () { try { w.destroy(); } catch (e) {} } };
    };

    /* ---------- 5. Undo toasts ---------- */
    let stack;
    UX.toast = function (message, opts) {
        opts = opts || {};
        if (!stack) { stack = el('div', 'toast-stack'); stack.setAttribute('role', 'status'); stack.setAttribute('aria-live', 'polite'); document.body.appendChild(stack); }
        const t = el('div', 'toast enter');
        t.appendChild(el('span', null, message));
        let finished = false, timer;
        function close(undone) {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            t.classList.add('leave');
            setTimeout(function () { t.remove(); }, 260);
            if (undone) { if (opts.undo) opts.undo(); }
            else if (opts.onCommit) opts.onCommit();
        }
        if (opts.undo) {
            const b = el('button', null, 'Undo');
            b.type = 'button';
            b.addEventListener('click', function () { close(true); });
            t.appendChild(b);
        }
        stack.appendChild(t);
        requestAnimationFrame(function () { requestAnimationFrame(function () { t.classList.remove('enter'); }); });
        timer = setTimeout(function () { close(false); }, opts.timeout || (opts.undo ? 6000 : 3500));
        // leaving the page before the timer runs out still commits (e.g. the delete really happens)
        window.addEventListener('pagehide', function () { close(false); }, { once: true });
        return { close: close };
    };

    /* ---------- 6. Stale-while-revalidate: show the last copy instantly, then refresh in the background ---------- */
    UX.swr = async function (key, url, render, fetchOpts) {
        let cached = null;
        try { cached = JSON.parse(localStorage.getItem('swr:' + key) || 'null'); } catch (e) {}
        if (cached) { try { render(cached.data, { stale: true }); } catch (e) { cached = null; } }
        try {
            const r = await fetch(url, Object.assign({ cache: 'no-cache' }, fetchOpts || {}));
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const data = await r.json();
            const same = cached && JSON.stringify(cached.data) === JSON.stringify(data);
            try { localStorage.setItem('swr:' + key, JSON.stringify({ at: Date.now(), data: data })); } catch (e) {}
            if (!same) render(data, { stale: false });
            return data;
        } catch (err) {
            if (!cached) throw err;          // nothing to show at all: let the page show its error
            return cached.data;              // offline: the cached copy stays on screen
        }
    };

    /* ---------- 1. Skeleton loaders ---------- */
    UX.skeleton = function (container, count, kind) {
        container.replaceChildren();
        for (let i = 0; i < (count || 3); i++) {
            const s = el(container.tagName === 'UL' || container.tagName === 'OL' ? 'li' : 'div', 'skeleton ' + (kind === 'line' ? 'skeleton-line' : 'skeleton-card'));
            s.setAttribute('aria-hidden', 'true');
            if (kind === 'line') s.style.width = (60 + (i * 17) % 35) + '%';
            container.appendChild(s);
        }
    };

    /* ---------- 19. Idempotency keys (one per submission; reused if that submission is retried) ---------- */
    UX.idempotencyKey = function () {
        if (crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '');
        const a = new Uint8Array(16); crypto.getRandomValues(a);
        return Array.from(a, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    };

    /* ---------- 8. BlurHash placeholders (decoder; hashes are made by tools/blurhash_encode.py) ---------- */
    const B83 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~';
    function d83(s) { let v = 0; for (const c of s) v = v * 83 + B83.indexOf(c); return v; }
    function toLin(v) { const x = v / 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }
    function toSRGB(v) { const x = Math.max(0, Math.min(1, v)); return Math.round(x <= 0.0031308 ? x * 12.92 * 255 + 0.5 : (1.055 * Math.pow(x, 1 / 2.4) - 0.055) * 255 + 0.5); }
    function signPow(v, e) { return Math.sign(v) * Math.pow(Math.abs(v), e); }
    UX.blurhash = function (hash, w, h) {
        if (!/^[0-9A-Za-z#$%*+,\-.:;=?@[\]^_{|}~]{6,}$/.test(hash)) return null;
        const size = d83(hash[0]), ny = Math.floor(size / 9) + 1, nx = (size % 9) + 1;
        if (hash.length !== 4 + 2 * nx * ny) return null;
        const maxV = (d83(hash[1]) + 1) / 166, colors = [];
        for (let i = 0; i < nx * ny; i++) {
            if (i === 0) { const v = d83(hash.slice(2, 6)); colors.push([toLin(v >> 16), toLin((v >> 8) & 255), toLin(v & 255)]); }
            else {
                const v = d83(hash.slice(4 + i * 2, 6 + i * 2));
                colors.push([signPow((Math.floor(v / 361) - 9) / 9, 2) * maxV, signPow((Math.floor(v / 19) % 19 - 9) / 9, 2) * maxV, signPow((v % 19 - 9) / 9, 2) * maxV]);
            }
        }
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const ctx = c.getContext('2d'), img = ctx.createImageData(w, h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            let r = 0, g = 0, b = 0;
            for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
                const basis = Math.cos(Math.PI * x * i / w) * Math.cos(Math.PI * y * j / h), col = colors[i + j * nx];
                r += col[0] * basis; g += col[1] * basis; b += col[2] * basis;
            }
            const p = 4 * (x + y * w);
            img.data[p] = toSRGB(r); img.data[p + 1] = toSRGB(g); img.data[p + 2] = toSRGB(b); img.data[p + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
        return c.toDataURL();
    };
    function applyBlurhashes() {
        document.querySelectorAll('[data-blurhash]').forEach(function (node) {
            const url = UX.blurhash(node.getAttribute('data-blurhash'), 32, 18);
            if (!url) return;
            node.style.backgroundImage = 'url(' + url + ')';
            const done = function () { node.style.backgroundImage = ''; };
            if (node.tagName === 'IMG') { if (node.complete && node.naturalWidth) done(); else node.addEventListener('load', done, { once: true }); }
            else if (node.tagName === 'VIDEO' && node.poster) {   // posters load on their own; drop the preview once it has
                const probe = new Image(); probe.onload = done; probe.src = node.poster;
            }
        });
    }

    /* ---------- 7. Pre-rendering: the browser prepares the page you're about to open (on hover/touch-start) ---------- */
    function speculation() {
        if (!HTMLScriptElement.supports || !HTMLScriptElement.supports('speculationrules')) return;
        const s = el('script');
        s.type = 'speculationrules';
        s.textContent = JSON.stringify({
            prerender: [{
                source: 'document',
                where: { and: [
                    { href_matches: '/*' },
                    { not: { href_matches: '/admin.html*' } },        // sign-in pages are never prepared ahead
                    { not: { href_matches: '/order.html*' } },
                    { not: { selector_matches: '[target=_blank], [download], [rel~=nofollow]' } }
                ] },
                eagerness: 'moderate'
            }]
        });
        document.head.appendChild(s);
    }

    /* ---------- 3 + 4. Command menu (Ctrl/⌘ K or "/") with shortcut hints ---------- */
    const COMMANDS = [
        { g: 'Pages', t: 'Home', href: '' },
        { g: 'Pages', t: 'Services', href: 'services.html' },
        { g: 'Pages', t: 'AI Education', href: 'services/education.html', k: 'courses videos learn' },
        { g: 'Pages', t: 'Automation', href: 'services/automation.html' },
        { g: 'Pages', t: 'Custom AI models', href: 'services/models.html' },
        { g: 'Pages', t: 'Workflows', href: 'services/workflows.html' },
        { g: 'Pages', t: 'Automation recipes', href: 'recipes/' },
        { g: 'Pages', t: 'About us', href: 'aboutus.html' },
        { g: 'Pages', t: 'Order', href: 'order.html', k: 'buy checkout' },
        { g: 'Pages', t: 'Changelog', href: 'changelog.html' },
        { g: 'Jump to', t: 'Get a free quote', href: 'index.html#quote', k: 'price estimate cost' },
        { g: 'Jump to', t: 'ROI calculator', href: 'index.html#roi', k: 'savings' },
        { g: 'Jump to', t: 'Find a certification', href: 'services/education.html#certifications', k: 'certificate resume career' },
        { g: 'Jump to', t: 'This week’s AI news', href: 'services/education.html#ai-news' },
        { g: 'Jump to', t: 'Check an order', href: 'order.html#lookup', k: 'status confirmation track' },
        { g: 'Jump to', t: 'Case studies', href: 'order.html#case-studies' },
        { g: 'Jump to', t: 'Contact', href: 'index.html#contact', k: 'email' },
        { g: 'Actions', t: 'Ask our site (chat)', run: function () { window.SiteChat && window.SiteChat.open(); }, k: 'help question assistant' },
        { g: 'Actions', t: 'Email us', href: 'mailto:dylanpogue@abstraction-solutions.com', k: 'contact' },
        { g: 'Legal', t: 'Privacy policy', href: 'privacy.html' },
        { g: 'Legal', t: 'Returns & refunds', href: 'returns.html' },
        { g: 'Legal', t: 'Terms of service', href: 'terms.html' }
    ];
    UX.addCommands = function (list) { Array.prototype.unshift.apply(COMMANDS, list); };

    let cmdk, input, listEl, items = [], sel = 0, watcher = null, lastFocus = null;
    function score(c, q) {
        if (!q) return 1;
        const hay = (c.t + ' ' + (c.k || '') + ' ' + c.g).toLowerCase();
        let s = 0;
        for (const w of q.toLowerCase().split(/\s+/).filter(Boolean)) {
            if (c.t.toLowerCase().startsWith(w)) s += 3;
            else if (hay.indexOf(w) >= 0) s += 1;
            else return 0;
        }
        return s;
    }
    function buildCmdk() {
        cmdk = el('div', 'cmdk');
        cmdk.setAttribute('role', 'dialog'); cmdk.setAttribute('aria-modal', 'true'); cmdk.setAttribute('aria-label', 'Jump to');
        const panel = el('div', 'cmdk-panel');
        const top = el('div', 'cmdk-top');
        input = el('input'); input.type = 'text'; input.placeholder = 'Jump to a page or action…'; input.setAttribute('aria-label', 'Search');
        input.setAttribute('role', 'combobox'); input.setAttribute('aria-controls', 'cmdkList'); input.setAttribute('aria-expanded', 'true');
        input.autocomplete = 'off'; input.spellcheck = false;
        const close = el('button', 'cmdk-close'); close.type = 'button'; close.setAttribute('aria-label', 'Close');
        close.appendChild(el('kbd', null, 'esc'));
        top.append(input, close);
        listEl = el('ul', 'cmdk-list'); listEl.id = 'cmdkList'; listEl.setAttribute('role', 'listbox');
        const foot = el('div', 'cmdk-foot');
        [['↑', '↓', 'to move'], ['↵', 'to open'], ['esc', 'to close']].forEach(function (h) {
            const s = el('span');
            h.slice(0, -1).forEach(function (k) { s.append(el('kbd', null, k), ' '); });
            s.append(h[h.length - 1]); foot.appendChild(s);
        });
        panel.append(top, listEl, foot);
        cmdk.appendChild(panel);
        document.body.appendChild(cmdk);
        cmdk.addEventListener('mousedown', function (e) { if (e.target === cmdk) closeCmdk(); });
        close.addEventListener('click', closeCmdk);
        input.addEventListener('input', render);
        input.addEventListener('keydown', function (e) {
            if (e.key === 'ArrowDown' || (e.key === 'n' && e.ctrlKey)) { e.preventDefault(); move(1); }
            else if (e.key === 'ArrowUp' || (e.key === 'p' && e.ctrlKey)) { e.preventDefault(); move(-1); }
            else if (e.key === 'Enter') { e.preventDefault(); if (items[sel]) runCmd(items[sel]); }
            else if (e.key === 'Escape') { e.preventDefault(); closeCmdk(); }
            else if (e.key === 'Tab') { e.preventDefault(); move(e.shiftKey ? -1 : 1); }
        });
    }
    function render() {
        const q = input.value.trim();
        items = COMMANDS.map(function (c) { return { c: c, s: score(c, q) }; }).filter(function (x) { return x.s > 0; })
            .sort(function (a, b) { return q ? b.s - a.s : 0; }).map(function (x) { return x.c; }).slice(0, 40);
        listEl.replaceChildren(); sel = 0;
        if (!items.length) { listEl.appendChild(el('li', 'cmdk-empty', 'Nothing found. Try “quote”, “order” or “education”.')); return; }
        let group = null;
        items.forEach(function (c, i) {
            if (!q && c.g !== group) { group = c.g; const h = el('li', 'cmdk-group', c.g.toUpperCase()); h.setAttribute('role', 'presentation'); listEl.appendChild(h); }
            const li = el('li', 'cmdk-item', c.t);
            li.id = 'cmdk-' + i; li.setAttribute('role', 'option');
            if (c.hint) li.appendChild(el('small', null, c.hint));
            li.addEventListener('mousemove', function () { if (sel !== i) { sel = i; mark(); } });
            li.addEventListener('click', function () { runCmd(c); });
            listEl.appendChild(li);
        });
        mark();
    }
    function mark() {
        listEl.querySelectorAll('.cmdk-item').forEach(function (li) {
            const on = li.id === 'cmdk-' + sel;
            li.setAttribute('aria-selected', on ? 'true' : 'false');
            if (on) { li.scrollIntoView({ block: 'nearest' }); input.setAttribute('aria-activedescendant', li.id); }
        });
    }
    function move(d) { if (items.length) { sel = (sel + d + items.length) % items.length; mark(); } }
    function runCmd(c) {
        closeCmdk(true);
        if (c.run) return c.run();
        const href = /^(mailto:|https?:)/.test(c.href) ? c.href : BASE + c.href;
        location.href = href;
    }
    UX.openCommandMenu = function () {
        if (!cmdk) buildCmdk();
        if (cmdk.classList.contains('open')) return;
        lastFocus = document.activeElement;
        const nav = document.getElementById('nav-toggle'); if (nav) nav.checked = false;
        input.value = ''; render();
        cmdk.classList.add('open');
        document.documentElement.style.overflow = 'hidden';
        input.focus();                            // right away, so the first keys typed aren't lost
        watcher = UX.closeWatch(function () { closeCmdk(); });
    };
    function closeCmdk(navigating) {
        if (!cmdk || !cmdk.classList.contains('open')) return;
        cmdk.classList.remove('open');
        document.documentElement.style.overflow = '';
        if (watcher) { watcher.done(); watcher = null; }
        if (!navigating && lastFocus && lastFocus.focus) lastFocus.focus();
    }
    function typing(t) { return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); }
    document.addEventListener('keydown', function (e) {
        if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); UX.openCommandMenu(); }
        else if (e.key === '/' && !typing(e.target) && !e.metaKey && !e.ctrlKey) { e.preventDefault(); UX.openCommandMenu(); }
    });

    /* shortcut hint in the menu: a "Search" button that shows the keys */
    function addSearchHint() {
        const top = document.querySelector('.side-nav .current-page');
        if (!top || document.querySelector('.search-hint')) return;
        const b = el('button', 'search-hint'); b.type = 'button';
        b.innerHTML = '<span style="display:flex;align-items:center;gap:8px"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true">' +
            '<circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>Jump to…</span>';
        const keys = el('span'); keys.append(el('kbd', null, MOD), ' ', el('kbd', null, 'K'));
        if (matchMedia('(hover: hover)').matches) b.appendChild(keys);
        b.setAttribute('aria-keyshortcuts', IS_MAC ? 'Meta+K' : 'Control+K');
        b.addEventListener('click', UX.openCommandMenu);
        top.after(b);
    }

    /* ---------- 10 + 11 + 12. The side menu: swipe left to dismiss (follows your finger, can reverse mid-swipe),
       and the back gesture closes it ---------- */
    function sideNavGestures() {
        const toggle = document.getElementById('nav-toggle'), nav = document.querySelector('.side-nav');
        if (!toggle || !nav) return;
        let watcherNav = null;
        toggle.addEventListener('change', function () {
            if (toggle.checked) watcherNav = UX.closeWatch(function () { toggle.checked = false; watcherNav = null; });
            else if (watcherNav) { watcherNav.done(); watcherNav = null; }
        });
        let startX = null, startY = 0, dx = 0, t0 = 0, horizontal = null;
        nav.addEventListener('touchstart', function (e) {
            if (!toggle.checked || e.touches.length !== 1) return;
            startX = e.touches[0].clientX; startY = e.touches[0].clientY; dx = 0; t0 = performance.now(); horizontal = null;
        }, { passive: true });
        nav.addEventListener('touchmove', function (e) {
            if (startX === null) return;
            const x = e.touches[0].clientX - startX, y = e.touches[0].clientY - startY;
            if (horizontal === null && (Math.abs(x) > 8 || Math.abs(y) > 8)) horizontal = Math.abs(x) > Math.abs(y);
            if (!horizontal) return;
            dx = Math.min(0, x);
            nav.style.transition = 'none';
            nav.style.transform = 'translateX(' + dx + 'px)';
        }, { passive: true });
        function end() {
            if (startX === null) return;
            const speed = dx / Math.max(1, performance.now() - t0);        // px per ms; negative = flick left
            nav.style.transition = ''; nav.style.transform = '';           // hand back to CSS, which animates from here
            if (horizontal && (dx < -nav.offsetWidth * 0.35 || speed < -0.5)) toggle.checked = false, toggle.dispatchEvent(new Event('change'));
            startX = null;
        }
        nav.addEventListener('touchend', end); nav.addEventListener('touchcancel', end);
    }

    /* ---------- 20. Services flyout with the "Amazon safe triangle": moving the mouse diagonally from
       "Services" toward its submenu (across other links) doesn't switch away, as long as the pointer
       stays inside the triangle between where it was and the submenu's near corners. ---------- */
    const SERVICE_PAGES = [['AI Education', 'services/education.html'], ['Automation', 'services/automation.html'],
                           ['Custom AI models', 'services/models.html'], ['Workflows', 'services/workflows.html'],
                           ['Automation recipes', 'recipes/']];
    function servicesFlyout() {
        const link = Array.from(document.querySelectorAll('.side-links a')).find(function (a) { return /services\.html$/.test(a.getAttribute('href') || ''); });
        if (!link) return;
        const fly = el('nav', 'nav-flyout'); fly.setAttribute('aria-label', 'Services');
        SERVICE_PAGES.forEach(function (p) { const a = el('a', null, p[0]); a.href = BASE + p[1]; fly.appendChild(a); });
        document.body.appendChild(fly);
        const wide = matchMedia('(hover: hover) and (min-width: 900px)');
        // phones/tablets: a small arrow button opens the same links inline under Services
        const wrap = el('div', 'has-sub'); link.parentNode.insertBefore(wrap, link); wrap.appendChild(link);
        const inline = el('div', 'side-sub');
        SERVICE_PAGES.forEach(function (p) { const a = el('a', null, p[0]); a.href = BASE + p[1]; inline.appendChild(a); });
        const tog = el('button', 'sub-toggle'); tog.type = 'button'; tog.setAttribute('aria-label', 'Show service pages'); tog.setAttribute('aria-expanded', 'false');
        wrap.append(tog, inline);
        tog.addEventListener('click', function (e) {
            e.preventDefault();
            if (wide.matches) { fly.classList.contains('open') ? hide() : show(); return; }
            const open = wrap.classList.toggle('open'); tog.setAttribute('aria-expanded', open ? 'true' : 'false');
        });

        let last = null, hideTimer = null;
        function place() { const r = link.getBoundingClientRect(), nav = document.querySelector('.side-nav').getBoundingClientRect();
            fly.style.left = (nav.right + 6) + 'px'; fly.style.top = Math.max(10, Math.min(r.top - 8, innerHeight - fly.offsetHeight - 10)) + 'px'; }
        function show() { clearTimeout(hideTimer); fly.classList.add('open'); place(); tog.setAttribute('aria-expanded', 'true'); }
        function hide() { clearTimeout(hideTimer); fly.classList.remove('open'); tog.setAttribute('aria-expanded', 'false'); }
        function inTriangle(p, a, b, c) {        // is point p inside triangle abc? (same-side test)
            const s = function (p1, p2, p3) { return (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y); };
            const d1 = s(p, a, b), d2 = s(p, b, c), d3 = s(p, c, a);
            return !(((d1 < 0) || (d2 < 0) || (d3 < 0)) && ((d1 > 0) || (d2 > 0) || (d3 > 0)));
        }
        link.addEventListener('mouseenter', function () { if (wide.matches) show(); });
        fly.addEventListener('mouseenter', function () { clearTimeout(hideTimer); });
        fly.addEventListener('mouseleave', function () { hideTimer = setTimeout(hide, 250); });
        document.addEventListener('mousemove', function (e) {
            if (!fly.classList.contains('open')) { last = { x: e.clientX, y: e.clientY }; return; }
            const p = { x: e.clientX, y: e.clientY }, f = fly.getBoundingClientRect(), l = link.getBoundingClientRect();
            const overLink = p.x >= l.left && p.x <= l.right && p.y >= l.top && p.y <= l.bottom;
            const overFly = p.x >= f.left && p.x <= f.right && p.y >= f.top && p.y <= f.bottom;
            const heading = last && inTriangle(p, last, { x: f.left, y: f.top }, { x: f.left, y: f.bottom });
            if (overLink || overFly) clearTimeout(hideTimer);
            else if (heading) { clearTimeout(hideTimer); hideTimer = setTimeout(hide, 400); }   // on the way: wait a little
            else hide();                                                                         // clearly moved away
            last = p;
        });
        const toggle = document.getElementById('nav-toggle');
        if (toggle) toggle.addEventListener('change', function () { if (!toggle.checked) hide(); });
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(); });
    }

    ready(function () {
        addSearchHint();
        sideNavGestures();
        servicesFlyout();
        applyBlurhashes();
        speculation();
    });
})();
