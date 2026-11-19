/* Moved out of education.html by tools/strict_csp.py so the page can forbid inline scripts. */
        // Videos behind "Show all" fetch their cover pictures only when someone opens the list
        document.querySelectorAll('details.more-videos').forEach(function (d) {
            d.addEventListener('toggle', function () {
                if (!d.open) return;
                d.querySelectorAll('video[data-poster]').forEach(function (v) { v.poster = v.dataset.poster; v.removeAttribute('data-poster'); });
            });
        });
    
