/* Moved out of index.html by tools/strict_csp.py so the page can forbid inline scripts. */
        // Newsletter signup -> quote engine (POST /newsletter), which saves it to the database
        (function () {
            const form = document.getElementById('signupForm');
            if (!form) return;
            const button = document.getElementById('signupButton');
            const status = document.getElementById('signupStatus');
            function say(text, kind) { status.textContent = text; status.className = 'signup-status ' + (kind || ''); }

            form.addEventListener('submit', async function (event) {
                event.preventDefault();
                const first = form.first_name.value.trim(), last = form.last_name.value.trim(), email = form.email.value.trim();
                if (!first || !last) return say('Please enter your first and last name.', 'err');
                if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return say('Please enter a valid email address.', 'err');
                if (!form.opt_in.checked) return say('Please check the box to agree to receive emails.', 'err');

                button.disabled = true; button.textContent = 'Subscribing...'; say('');
                try {
                    const response = await fetchWithWake(API_BASE + '/newsletter', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ first_name: first, last_name: last, email: email,
                                               opt_in: true, website: form.website.value })
                    });
                    if (response.status === 429) throw new Error('Too many signups from here. Please try again later.');
                    if (!response.ok) throw new Error('Something went wrong. Please try again.');
                    form.reset();
                    say("You're on the list, " + first + '! Watch your inbox for updates.', 'ok');
                } catch (error) {
                    say(error.name === 'TypeError' || error.name === 'TimeoutError'
                        ? 'Our signup system is offline right now. Please try again in a minute.'
                        : error.message, 'err');
                } finally {
                    button.disabled = false; button.textContent = 'Subscribe';
                }
            });
        })();
    
