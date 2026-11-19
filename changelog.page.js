/* Moved out of changelog.html by tools/strict_csp.py so the page can forbid inline scripts. */
        (function () {
            const log = document.getElementById('log');

            function show(entries) {
                entries.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
                entries.forEach(function (e) {
                    const row = document.createElement('article');
                    row.className = 'entry';

                    const time = document.createElement('time');
                    time.dateTime = e.date;
                    // noon, so the date never shifts a day because of time zones
                    time.textContent = new Date(e.date + 'T12:00:00').toLocaleDateString('en-US',
                        { year: 'numeric', month: 'long', day: 'numeric' });

                    const body = document.createElement('div');
                    const h = document.createElement('h2');
                    h.textContent = e.title;
                    const ul = document.createElement('ul');
                    (e.items || []).forEach(function (item) {
                        const li = document.createElement('li');
                        li.textContent = item;
                        ul.appendChild(li);
                    });
                    body.append(h, ul);
                    row.append(time, body);
                    log.appendChild(row);
                });
            }

            fetch('changelog.json', { cache: 'no-cache' })
                .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
                .then(function (d) { log.querySelectorAll('.log-static').forEach(function (n) { n.remove(); }); show(d); })
                .catch(function () {
                    const p = document.createElement('p');
                    p.className = 'log-note';
                    p.textContent = "The changelog couldn't load. Please refresh the page.";
                    log.appendChild(p);
                });
        })();
    
