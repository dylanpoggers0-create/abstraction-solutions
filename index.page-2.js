/* Moved out of index.html by tools/strict_csp.py so the page can forbid inline scripts. */
        (function () {
            const query = new URLSearchParams(location.search);
            const text = query.get('describe');
            if (text) document.getElementById('quoteText').value = text.slice(0, 2000);
            if (query.get('nonprofit') === '1') document.getElementById('quoteNonprofit').checked = true;
        })();
    
