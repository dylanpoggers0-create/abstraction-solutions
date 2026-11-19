/* Moved out of index.html by tools/strict_csp.py so the page can forbid inline scripts. */
        (function () {
            const hrs = document.getElementById('miniHours');
            const rate = document.getElementById('miniRate');
            let counted = false;
            function calc(fromUser) {
                const h = Math.max(0, Number(hrs.value) || 0);
                const r = Math.max(0, Number(rate.value) || 0);
                const month = h * 0.6 * r * 52 / 12;
                document.getElementById('miniMonth').textContent = '$' + Math.round(month).toLocaleString('en-US');
                document.getElementById('miniLink').href = 'roi.html?hours=' + h + '&rate=' + r;
                if (fromUser && !counted && window.trackEvent) { counted = true; trackEvent('roi-mini'); }
            }
            hrs.addEventListener('input', function () { calc(true); });
            rate.addEventListener('input', function () { calc(true); });
            calc(false);
        })();
    
