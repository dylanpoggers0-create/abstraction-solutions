/* Moved out of index.html by tools/strict_csp.py so the page can forbid inline scripts. */
        // Where the Python quote engine runs (your Render server).
        // Must match the address at the top of your Render service page exactly.
        const API_BASE = 'https://abstraction-quote-engine.onrender.com';

        // The free server sleeps when nobody uses it, and restarts after an update. While it's starting, Render
        // answers with an error page the browser isn't allowed to read, which looks exactly like "no internet".
        // So instead of giving up on the first try, keep trying for about 75 seconds before saying it's offline.
        async function fetchWithWake(url, options) {
            const giveUp = Date.now() + 75000;
            let wait = 2000;
            while (true) {
                try {
                    const response = await fetch(url, Object.assign({}, options, { signal: AbortSignal.timeout(60000) }));
                    const starting = response.status === 502 || response.status === 503 || response.status === 504;
                    if (!starting || Date.now() + wait >= giveUp) return response;
                } catch (error) {
                    if (Date.now() + wait >= giveUp) throw error;
                }
                await new Promise(function (done) { setTimeout(done, wait); });
                wait = Math.min(wait * 1.5, 10000);
            }
        }

        const form = document.getElementById('quoteForm');
        const button = document.getElementById('quoteButton');
        const errorBox = document.getElementById('quoteError');
        const result = document.getElementById('quoteResult');

        const dollars = n => '$' + n.toLocaleString('en-US');

        // The free server falls asleep when nobody uses it. Poke it as soon as the page
        // loads, so it's usually awake by the time someone finishes typing.
        fetch(API_BASE + '/health').catch(function () {});

        form.addEventListener('submit', async function (event) {
            event.preventDefault();               // don't reload the page
            errorBox.textContent = '';
            button.disabled = true;
            button.textContent = 'Calculating...';

            // If it takes a while, the server is probably waking up. Say so.
            const slowTimer = setTimeout(function () {
                button.textContent = 'Waking up the engine (up to a minute)...';
            }, 5000);

            try {
                const response = await fetchWithWake(API_BASE + '/quote', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ description: document.getElementById('quoteText').value.trim() })
                });
                if (response.status === 422) throw new Error('Please describe your project in at least 10 characters.');
                if (response.status === 429) throw new Error('You\'ve asked for a lot of quotes. Please try again later, or email us.');
                if (!response.ok) throw new Error('The quote engine had a problem. Please try again.');
                const data = await response.json();
                if (data.support) {                          // they wrote that they may hurt themselves: help first
                    document.getElementById('quoteResult').hidden = true;
                    CrisisSupport.show(errorBox, data.support);
                    return;
                }
                if (window.CrisisSupport) CrisisSupport.clear();
                showQuote(data);
            } catch (error) {
                // fetch itself fails (TypeError / timeout) when the server can't be reached
                errorBox.textContent = (error instanceof TypeError || error.name === 'TimeoutError')
                    ? 'The quote engine is offline right now. Email us for a quote instead.'
                    : error.message;
            } finally {
                clearTimeout(slowTimer);
                button.disabled = false;
                button.textContent = 'Get my free instant estimate';
            }
        });

        // textContent (not innerHTML) so nothing in the answer can run as code
        function showQuote(q) {
            // Nonprofits: show the same estimate at 50% off (the regular range is shown crossed out next to it)
            const nonprofit = document.getElementById('quoteNonprofit').checked;
            const half = function (n) { return Math.round(n / 2); };
            const price = document.getElementById('quotePrice');
            price.textContent = nonprofit ? dollars(half(q.low)) + ' – ' + dollars(half(q.high)) : dollars(q.low) + ' – ' + dollars(q.high);
            if (nonprofit) {
                const was = document.createElement('s');
                was.textContent = dollars(q.low) + ' – ' + dollars(q.high);
                price.append(was);
            }
            document.getElementById('quoteLabel').textContent = nonprofit ? 'Nonprofit estimate (50% off)' : 'Estimated cost';
            const disc = document.getElementById('quoteDiscount');
            disc.hidden = !nonprofit;
            disc.textContent = nonprofit ? '50% nonprofit discount applied to the estimate. The breakdown below shows regular prices. ' +
                'We confirm the final price by email and may ask you to confirm nonprofit status.' : '';

            const [w1, w2] = q.timeline_weeks;
            document.getElementById('quoteMeta').textContent =
                q.project_type_label + ' · about ' + q.hours_low + '–' + q.hours_high + ' hours · ' +
                (w1 === w2 ? w1 : w1 + '–' + w2) + ' week' + (w2 > 1 ? 's' : '');

            const summary = document.getElementById('quoteSummary');
            summary.textContent = q.summary;
            summary.hidden = !q.summary;

            const list = document.getElementById('quoteBreakdown');
            list.replaceChildren();
            q.breakdown.forEach(function (line) {
                const li = document.createElement('li');
                const name = document.createElement('span');
                const cost = document.createElement('span');
                name.textContent = line.label;
                cost.textContent = dollars(line.low) + ' – ' + dollars(line.high);
                li.append(name, cost);
                list.append(li);
            });

            const adj = document.getElementById('quoteAdjustments');
            adj.textContent = q.adjustments.length ? 'Includes: ' + q.adjustments.join(', ') : '';
            adj.hidden = !q.adjustments.length;

            const questions = document.getElementById('quoteQuestions');
            questions.replaceChildren();
            q.questions.forEach(function (text) {
                const li = document.createElement('li');
                li.textContent = text;
                questions.append(li);
            });
            document.getElementById('quoteQuestionsBox').hidden = !q.questions.length;

            // "Accept this quote": send the service, estimate and description to the order form
            const SERVICE_FOR = {
                'Automation / workflow': 'AI Automation',
                'AI tool or chatbot': 'AI Automation',
                'Custom machine learning model': 'Custom ML Model'
            };
            const params = new URLSearchParams({
                service: SERVICE_FOR[q.project_type_label] || 'Other',
                details: (nonprofit ? 'NONPROFIT (50% off requested). Nonprofit estimate: ' + dollars(half(q.low)) + ' – ' +
                                      dollars(half(q.high)) + ', regular ' : 'Instant estimate: ') +
                         dollars(q.low) + ' – ' + dollars(q.high) +
                         ' (' + q.project_type_label + ')\n\n' + document.getElementById('quoteText').value.trim()
            });
            document.getElementById('acceptQuote').href = 'order.html?' + params.toString() + '#newOrder';
            // ROI calculator starts with the middle of this estimate as the project cost
            document.getElementById('roiLink').href = 'roi.html?cost=' + Math.round((q.low + q.high) / 2);
            window.trackEvent && trackEvent('quote-requested');

            result.hidden = false;
            result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    
