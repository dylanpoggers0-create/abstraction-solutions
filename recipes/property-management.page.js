/* Moved out of property-management.html by tools/strict_csp.py so the page can forbid inline scripts. */
        document.querySelectorAll('[data-track]').forEach(function (a) {
            a.addEventListener('click', function () { window.trackEvent && trackEvent(a.dataset.track); });
        });
    
