/* Moved out of education.html by tools/strict_csp.py so the page can forbid inline scripts. */
        // ---------- Certifications: browse, sort by cost, and AI recommendations ----------
        // Everything from the catalog or the server is shown with textContent (never as HTML).
        (function () {
            const API_BASE = 'https://abstraction-quote-engine.onrender.com';
            const LEVELS = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };
            let catalog = [], fields = {}, byId = {};
            const $ = function (id) { return document.getElementById(id); };
            function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
            function safeUrl(u) { try { const x = new URL(u); return x.protocol === 'https:' ? x.href : null; } catch (e) { return null; } }

            function card(c, rank, why) {
                const li = el('li', 'cert-card');
                const h = el('h4');
                if (rank) h.appendChild(el('span', 'cert-rank', String(rank)));
                const url = safeUrl(c.url);
                if (url) {
                    const a = el('a', null, c.name); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
                    a.setAttribute('aria-label', c.name + ' (official page, opens in a new tab)');
                    h.appendChild(a);
                } else h.appendChild(document.createTextNode(c.name));
                li.appendChild(h);
                const price = el('div', 'cert-price', c.cost_label);
                if (c.cost_note) price.appendChild(el('small', null, c.cost_note));
                li.appendChild(price);
                li.appendChild(el('div', 'cert-meta', [c.provider, LEVELS[c.level] || c.level, c.time,
                    (c.fields || []).map(function (f) { return fields[f] || f; }).join(', ')].filter(Boolean).join(' · ')));
                if (why) li.appendChild(el('p', 'cert-why', why));
                li.appendChild(el('p', null, c.summary));
                if (c.prereq) li.appendChild(el('p', 'cert-meta', 'Before you start: ' + c.prereq));
                return li;
            }

            // unknown prices (null) always go last, whichever way you sort
            function byCost(dir) {
                return function (a, b) {
                    const x = a.cost_usd, y = b.cost_usd;
                    if (x == null && y == null) return a.name.localeCompare(b.name);
                    if (x == null) return 1;
                    if (y == null) return -1;
                    return (x - y) * dir || a.name.localeCompare(b.name);
                };
            }

            function render() {
                const q = $('certSearch').value.trim().toLowerCase();
                const f = $('certField').value, lv = $('certLevel').value, sort = $('certSort').value;
                const shown = catalog.filter(function (c) {
                    if (f && (c.fields || []).indexOf(f) < 0) return false;
                    if (lv && c.level !== lv) return false;
                    if (!q) return true;
                    const text = [c.name, c.provider, c.summary, c.prereq].concat((c.fields || []).map(function (k) { return fields[k] || k; }))
                        .join(' ').toLowerCase();
                    return q.split(/\s+/).every(function (w) { return text.indexOf(w) >= 0; });
                }).sort(sort === 'name' ? function (a, b) { return a.name.localeCompare(b.name); }
                                        : byCost(sort === 'cost-desc' ? -1 : 1));
                const list = $('certList'); list.textContent = ''; list.removeAttribute('aria-busy');
                shown.forEach(function (c) { list.appendChild(card(c)); });
                $('certCount').textContent = shown.length === catalog.length ? 'Showing all ' + shown.length + ' certifications'
                    : (shown.length ? 'Showing ' + shown.length + ' of ' + catalog.length : 'No certifications match. Try fewer words or another filter.');
            }

            function useCatalog(data) {
                catalog = data.certifications || []; fields = data.fields || {}; byId = {};
                catalog.forEach(function (c) { byId[c.id] = c; });
                const pick = $('certField'), keep = pick.value;
                while (pick.options.length > 1) pick.remove(1);
                Object.keys(fields).forEach(function (k) { const o = el('option', null, fields[k]); o.value = k; pick.appendChild(o); });
                pick.value = keep;
                $('certFine').textContent = 'Official US list prices, checked ' + data.checked + '. ' +
                    'Subscriptions are sorted by their estimated total at about 10 hours a week. Prices can change; each name links to the official page.';
                render();
            }
            // stale-while-revalidate: a returning visitor sees the list instantly from last time, then it refreshes
            async function loadCatalog() {
                try {
                    const UX = await window.uxReady;
                    await UX.swr('certifications', '../data/certifications.json', useCatalog);
                } catch (e) {
                    try {
                        const r = await fetch('../data/certifications.json', { cache: 'no-cache' });
                        if (!r.ok) throw new Error();
                        useCatalog(await r.json());
                    } catch (e2) { $('certCount').textContent = 'Couldn’t load the list. Please refresh the page.'; }
                }
            }
            ['certSearch', 'certField', 'certLevel', 'certSort'].forEach(function (id) {
                $(id).addEventListener(id === 'certSearch' ? 'input' : 'change', render);
            });

            // "Upload resume.pdf": the button opens the file picker (the hidden <input type=file>).
            $('certUpload').addEventListener('click', function () { $('certFile').click(); });

            // The file as base64 text, so it can travel inside JSON ("data:application/pdf;base64,JVBER..." -> "JVBER...")
            function toBase64(file) {
                return new Promise(function (resolve, reject) {
                    const reader = new FileReader();
                    reader.onload = function () { resolve(String(reader.result).split(',')[1] || ''); };
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });
            }

            $('certFile').addEventListener('change', async function () {
                const file = this.files[0]; this.value = '';          // reset, so picking the same file again still works
                if (!file) return;
                const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
                if (!isPdf) {                                          // a .txt file is read right here in the browser
                    if (file.size > 200000) { status('That file is too big. Paste the text instead.', true); return; }
                    $('certResume').value = (await file.text()).slice(0, 15000);
                    status('Loaded \u201c' + file.name + '\u201d. Check it, then press Recommend.');
                    return;
                }
                if (file.size > 3000000) { status('That PDF is over 3 MB. Paste the text instead.', true); return; }
                const btn = $('certUpload'); btn.disabled = true;
                status('Reading your resume\u2026 (the first try can take up to a minute while our server wakes up)');
                try {
                    const body = JSON.stringify({ pdf_base64: await toBase64(file) });
                    let r, tries = 0;
                    while (true) {          // the free server may be asleep: retry a few times on 502/503/504
                        r = await fetch(API_BASE + '/certs/resume-text', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body,
                            signal: AbortSignal.timeout(60000)
                        });
                        if ([502, 503, 504].indexOf(r.status) < 0 || ++tries >= 3) break;
                        await new Promise(function (d) { setTimeout(d, 4000); });
                    }
                    const data = await r.json().catch(function () { return {}; });
                    if (!r.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Couldn\u2019t read that PDF. Paste the text instead.');
                    $('certResume').value = data.text;
                    status('Loaded \u201c' + file.name + '\u201d. Check the text, delete your phone number and address, then press Recommend.');
                    $('certResume').focus();
                } catch (e) {
                    status(e.name === 'TimeoutError' || e.name === 'TypeError' ? 'Couldn\u2019t reach our server. Please try again in a minute.' : e.message, true);
                } finally { btn.disabled = false; }
            });

            // "Helpful?" on each pick: anonymous, one vote per pick, and it improves future suggestions
            function voteRow(token, id) {
                const row = el('div', 'cert-vote', 'Helpful?');
                [['Yes', true], ['No', false]].forEach(function (v) {
                    const b = el('button', null, v[0]); b.type = 'button';
                    b.addEventListener('click', function () {
                        row.querySelectorAll('button').forEach(function (x) { x.disabled = true; });
                        fetch(API_BASE + '/certs/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ token: token, id: id, helpful: v[1] }) })
                            .then(function (r) { row.textContent = r.ok ? 'Thanks! That helps us improve suggestions.' : 'Couldn\u2019t save that vote.'; })
                            .catch(function () { row.textContent = 'Couldn\u2019t save that vote.'; });
                    });
                    row.appendChild(b);
                });
                return row;
            }

            function status(msg, isError) { const s = $('certStatus'); s.textContent = msg; s.className = 'cert-status' + (isError ? ' error' : ''); }

            $('certForm').addEventListener('submit', async function (ev) {
                ev.preventDefault();
                const goal = $('certGoal').value.trim(), resume = $('certResume').value.trim();
                if (goal.length < 2) { status('Tell us the field you want to work in.', true); $('certGoal').focus(); return; }
                if (resume.length < 30) { status('Paste a bit more of your resume (at least a few lines).', true); $('certResume').focus(); return; }
                const btn = $('certGo'); btn.disabled = true;
                window.uxReady.then(function (UX) { if (btn.disabled) { $('certResults').hidden = false; $('certSummary').textContent = '';
                    UX.skeleton($('certPicks'), 3, 'card'); } }).catch(function () {});
                status('Thinking… (the first request can take up to a minute while our server wakes up)');
                try {
                    let r, tries = 0;
                    while (true) {          // the free server may be asleep: retry a few times on 502/503/504
                        r = await fetch(API_BASE + '/certs/recommend', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ field: goal, resume: resume.slice(0, 15000) }),
                            signal: AbortSignal.timeout(60000)
                        });
                        if ([502, 503, 504].indexOf(r.status) < 0 || ++tries >= 3) break;
                        await new Promise(function (d) { setTimeout(d, 4000); });
                    }
                    if (r.status === 429) throw new Error('You’ve reached the limit for now. Please try again later.');
                    if (!r.ok) throw new Error('Something went wrong. Please try again in a minute.');
                    const data = await r.json();
                    if (data.support) {                      // they wrote that they may hurt themselves: help first
                        $('certResults').hidden = true; status('');
                        CrisisSupport.show($('certStatus'), data.support);
                        return;
                    }
                    if (window.CrisisSupport) CrisisSupport.clear();
                    const picks = (data.recommendations || []).filter(function (p) { return byId[p.id]; });
                    if (!picks.length) throw new Error('No matches this time. Try describing the field differently.');
                    const ol = $('certPicks'); ol.textContent = '';
                    picks.forEach(function (p, i) {
                        const li = card(byId[p.id], i + 1, p.why);
                        if (data.feedback_token) li.appendChild(voteRow(data.feedback_token, p.id));
                        ol.appendChild(li);
                    });
                    $('certSummary').textContent = data.summary || 'Suggested order, starting from the top:';
                    $('certResults').hidden = false;
                    status('');
                    $('certResults').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                } catch (e) {
                    if ($('certPicks').querySelector('.skeleton')) $('certResults').hidden = true;   // no stale skeletons on errors
                    status(e.name === 'TimeoutError' || e.name === 'TypeError' ? 'Couldn’t reach our server. Please try again in a minute.' : e.message, true);
                } finally { btn.disabled = false; }
            });

            loadCatalog();
        })();
    
