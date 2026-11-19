/* Moved out of roi.html by tools/strict_csp.py so the page can forbid inline scripts. */
        const FIELDS = ['hours', 'rate', 'share', 'cost', 'monthly'];
        const money = function (n) {
            const sign = n < 0 ? '-' : '';
            return sign + '$' + Math.round(Math.abs(n)).toLocaleString('en-US');
        };

        // The quote page can send a cost: roi.html?cost=2500
        const linkParams = new URLSearchParams(location.search);
        ['cost', 'hours', 'rate'].forEach(function (k) {
            const v = linkParams.get(k);
            if (v !== null && v !== '' && !isNaN(v)) document.getElementById(k).value = Math.round(Number(v));
        });

        // keep each slider and its number box in sync
        FIELDS.forEach(function (id) {
            const box = document.getElementById(id);
            const slider = document.getElementById(id + 'R');
            slider.value = box.value;
            slider.addEventListener('input', function () { box.value = slider.value; update(); });
            box.addEventListener('input', function () { slider.value = box.value; update(); });
        });

        function val(id) {
            const n = Number(document.getElementById(id).value);
            return isFinite(n) && n > 0 ? n : 0;
        }

        let counted = false;
        function update() {
            const hours = val('hours'), rate = val('rate'), share = Math.min(val('share'), 100) / 100;
            const cost = val('cost'), monthly = val('monthly');

            const hoursSaved = hours * share;                       // per week
            const savedMonth = hoursSaved * rate * 52 / 12;          // value of that time each month
            const netMonth = savedMonth - monthly;                   // after running costs
            const yearNet = netMonth * 12 - cost;                    // first year, after paying for the project
            const roi = cost > 0 ? yearNet / cost * 100 : 0;

            document.getElementById('hrsSaved').textContent = hoursSaved.toFixed(hoursSaved < 10 ? 1 : 0);
            document.getElementById('perMonth').textContent = money(netMonth);
            document.getElementById('perYear').textContent = money(yearNet);

            const pay = netMonth > 0 ? cost / netMonth : Infinity;
            document.getElementById('payback').textContent =
                !isFinite(pay) ? 'Never' : pay < 1 ? 'Under a month' :
                pay < 1.5 ? 'About 1 month' : 'About ' + Math.round(pay) + ' months';

            const pct = document.getElementById('roiPct');
            pct.textContent = (roi > 0 ? '+' : '') + Math.round(roi).toLocaleString('en-US') + '%';
            pct.classList.toggle('bad', roi < 0);
            document.getElementById('roiLine').textContent = roi >= 0
                ? 'Every $1 spent comes back as about $' + (1 + roi / 100).toFixed(2) + ' in year one.'
                : 'At these numbers it would take more than a year to pay off. Over 3 years: ' + money(netMonth * 36 - cost) + '.';

            drawChart(cost, netMonth);

            if (!counted && window.trackEvent) { counted = true; trackEvent('roi-calculated'); }
        }

        // simple 12-month bar chart in SVG (no libraries)
        function drawChart(cost, netMonth) {
            const svg = document.getElementById('chart');
            const vals = [];
            for (let m = 1; m <= 12; m++) vals.push(netMonth * m - cost);
            const top = Math.max(0, ...vals), bot = Math.min(0, ...vals);
            const span = (top - bot) || 1;
            const H = 170, y = function (v) { return 10 + (top - v) / span * H; };
            const zero = y(0);
            let s = '<line x1="0" x2="480" y1="' + zero + '" y2="' + zero + '" stroke="#4a5a4c" stroke-width="1"/>';
            vals.forEach(function (v, i) {
                const x = 8 + i * 39.5, w = 28;
                const y0 = Math.min(y(v), zero), h = Math.max(2, Math.abs(y(v) - zero));
                const col = v >= 0 ? '#7ee96f' : '#ff8a80';
                s += '<rect x="' + x + '" y="' + y0 + '" width="' + w + '" height="' + h + '" rx="4" fill="' + col + '" opacity="0.85"/>';
                if (i % 2 === 1 || i === 0) {
                    s += '<text x="' + (x + w / 2) + '" y="198" fill="#9aa69c" font-size="11" text-anchor="middle">' + (i + 1) + '</text>';
                }
            });
            s += '<text x="472" y="' + (zero - 6) + '" fill="#9aa69c" font-size="11" text-anchor="end">$0</text>';
            svg.innerHTML = s;   // only numbers we computed go in here, never user text
        }

        update();
    
