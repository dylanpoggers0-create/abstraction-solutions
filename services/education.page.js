/* Moved out of education.html by tools/strict_csp.py so the page can forbid inline scripts. */
        // ---------- This Week's AI News ----------
        // Everything is shown with textContent (never as HTML), and links only open https:// addresses.
        (function () {
            const API_BASE = 'https://abstraction-quote-engine.onrender.com';
            const section = document.getElementById('ai-news');
            const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

            // "2026-11-02" -> {y, m, d} (read as a calendar date, so time zones can't shift it a day)
            function parts(iso) { const p = String(iso).split('-').map(Number); return { y: p[0], m: p[1] - 1, d: p[2] }; }
            function day(iso) { const p = parts(iso); return MONTHS[p.m] + ' ' + p.d + ', ' + p.y; }
            function range(a, b) {
                const s = parts(a), e = parts(b);
                if (s.y === e.y && s.m === e.m) return MONTHS[s.m] + ' ' + s.d + '\u2013' + e.d + ', ' + e.y;
                if (s.y === e.y) return MONTHS[s.m] + ' ' + s.d + ' \u2013 ' + MONTHS[e.m] + ' ' + e.d + ', ' + e.y;
                return day(a) + ' \u2013 ' + day(b);
            }
            function stamp(ts) { const t = new Date(ts); return isNaN(t) ? '' : MONTHS[t.getMonth()] + ' ' + t.getDate() + ', ' + t.getFullYear(); }
            function safeUrl(u) { try { const x = new URL(u); return x.protocol === 'https:' ? x.href : null; } catch (e) { return null; } }
            function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

            function articleItem(a) {
                const li = el('li', 'news-item');
                const h = el('h3');
                const url = safeUrl(a.url);
                if (url) {
                    const link = el('a', null, a.headline);
                    link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
                    link.appendChild(el('span', 'ext', '\u2197'));
                    link.setAttribute('aria-label', a.headline + ' (opens ' + a.publisher + ' in a new tab)');
                    h.appendChild(link);
                } else {
                    h.textContent = a.headline;
                }
                li.appendChild(h);
                li.appendChild(el('p', 'news-source', a.publisher + ' \u00b7 ' + day(a.published_on)));
                li.appendChild(el('p', null, a.summary));
                if (a.why_it_matters) {
                    const why = el('p', 'news-why');
                    why.appendChild(el('strong', null, 'Why it matters: '));
                    why.appendChild(document.createTextNode(a.why_it_matters));
                    li.appendChild(why);
                }
                return li;
            }

            function fill(list, edition) {
                list.textContent = '';
                edition.articles.forEach(function (a) { list.appendChild(articleItem(a)); });
            }

            function show(data) {
                const latest = data && data.latest;
                if (!latest || !latest.articles || !latest.articles.length) return;      // nothing real yet: stay hidden
                // only call it "this week" while it's actually current; afterwards, date it plainly
                const end = parts(latest.week_end);
                const current = (new Date() - new Date(end.y, end.m, end.d + 1)) / 86400000 < 3;
                document.getElementById('newsHeading').textContent = current ? 'This Week\u2019s AI News' : 'AI News';
                document.getElementById('newsMeta').textContent =
                    (current ? 'Week of ' : 'Most recent edition: week of ') + range(latest.week_start, latest.week_end) +
                    ' \u00b7 Updated ' + stamp(latest.updated_at) +
                    '. Summaries are ours; each headline opens the original article.';
                fill(document.getElementById('newsList'), latest);

                const archive = (data.archive || []).filter(function (e) { return e.article_count > 0; });
                if (archive.length) {
                    const ul = document.getElementById('newsArchiveList');
                    ul.textContent = '';                     // show() can run twice (cached copy, then fresh)
                    archive.forEach(function (e) {
                        const li = el('li');
                        const btn = el('button', null, 'Week of ' + range(e.week_start, e.week_end) + ' \u00b7 ' +
                                       e.article_count + ' article' + (e.article_count === 1 ? '' : 's'));
                        btn.type = 'button';
                        btn.setAttribute('aria-expanded', 'false');
                        const box = el('div'); box.hidden = true;
                        btn.addEventListener('click', async function () {
                            const open = btn.getAttribute('aria-expanded') === 'true';
                            btn.setAttribute('aria-expanded', String(!open));
                            box.hidden = open;
                            if (open || box.dataset.loaded) return;
                            box.appendChild(el('p', 'news-edition-note', 'Loading\u2026'));
                            try {
                                const r = await fetch(API_BASE + '/news/' + encodeURIComponent(e.id));
                                if (!r.ok) throw new Error();
                                const ed = await r.json();
                                box.textContent = '';
                                box.appendChild(el('p', 'news-edition-note', 'Week of ' + range(ed.week_start, ed.week_end) +
                                                   ' \u00b7 Updated ' + stamp(ed.updated_at) + ' \u00b7 Archived edition'));
                                const ol = el('ol', 'news-list'); fill(ol, ed); box.appendChild(ol);
                                box.dataset.loaded = '1';
                            } catch (err) {
                                box.textContent = ''; box.appendChild(el('p', 'news-edition-note', 'Couldn\u2019t load that edition. Try again later.'));
                            }
                        });
                        li.appendChild(btn); li.appendChild(box); ul.appendChild(li);
                    });
                    document.getElementById('newsArchive').hidden = false;
                }
                section.hidden = false;
            }

            // The free server may be asleep: keep trying quietly for about a minute. If it never answers,
            // the section just stays hidden; the rest of the page (and the videos) never waits on it.
            // stale-while-revalidate: last week's copy shows instantly (no wait on the sleeping server), then it refreshes
            async function load() {
                let cached = null;
                try { cached = JSON.parse(localStorage.getItem('swr:news') || 'null'); } catch (e) {}
                if (cached && cached.data) { try { show(cached.data); } catch (e) {} }
                const giveUp = Date.now() + 70000;
                let wait = 2000;
                while (Date.now() < giveUp) {
                    try {
                        const r = await fetch(API_BASE + '/news', { signal: AbortSignal.timeout(30000) });
                        if (r.ok) {
                            const data = await r.json();
                            if (cached && JSON.stringify(cached.data) === JSON.stringify(data)) return;
                            try { localStorage.setItem('swr:news', JSON.stringify({ at: Date.now(), data: data })); } catch (e) {}
                            return show(data);
                        }
                        if (r.status !== 502 && r.status !== 503 && r.status !== 504) return;
                    } catch (e) { /* asleep or offline: try again */ }
                    await new Promise(function (done) { setTimeout(done, wait); });
                    wait = Math.min(wait * 1.5, 10000);
                }
            }
            load();
        })();
    
