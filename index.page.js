/* Moved out of index.html by tools/strict_csp.py so the page can forbid inline scripts. */
        // flips between project facts every few seconds; pauses on hover, stays still for reduced-motion users
        (function () {
            const facts = [
                ['School-wide', 'our AI chatbot is deployed for every faculty member at a high school'],
                ['Weekly', 'hours saved on repetitive data prep with our cleanup automation']
            ];
            const box = document.getElementById('statCarousel');
            const card = box.querySelector('.stat');
            const big = document.getElementById('statBig'), small = document.getElementById('statSmall');
            const dots = document.getElementById('statDots');
            let i = 0, timer = null, paused = false;
            facts.forEach(function (f, n) {
                const b = document.createElement('button');
                b.type = 'button'; b.setAttribute('aria-label', 'Show fact ' + (n + 1));
                b.addEventListener('click', function () { show(n); restart(); });
                dots.appendChild(b);
            });
            function mark() { Array.from(dots.children).forEach(function (b, n) { b.setAttribute('aria-current', n === i ? 'true' : 'false'); }); }
            function show(n) {
                if (n === i) return;
                card.classList.add('out');
                setTimeout(function () { i = n; big.textContent = facts[i][0]; small.textContent = facts[i][1]; mark(); card.classList.remove('out'); }, 450);
            }
            function restart() {
                clearInterval(timer);
                if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
                timer = setInterval(function () { if (!paused) show((i + 1) % facts.length); }, 4000);
            }
            box.addEventListener('mouseenter', function () { paused = true; });
            box.addEventListener('mouseleave', function () { paused = false; });
            mark(); restart();
        })();
    
