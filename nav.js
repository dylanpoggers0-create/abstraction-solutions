/* =========================================================
   nav.js — builds the header, Menu tab and side nav on EVERY page.

   Each page needs, right after <body>:
       <div id="site-nav"></div>
       <script src="nav.js"></script>
   and says which page it is on the <body> tag:
       <body data-page="services">

   TO ADD A PAGE: add one line to PAGES below. Every page's menu updates.
   ========================================================= */

// Little icon drawings (SVG paths). Add your own here if you need more.
const ICONS = {
    home:     '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    services: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
    contact:  '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/>',
    menu:     '<line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/>',
    close:    '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    about:    '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    order:    '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/>',
    admin:    '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    roi:      '<line x1="4" y1="20" x2="20" y2="20"/><rect x="5" y="12" width="3" height="8"/><rect x="10.5" y="8" width="3" height="12"/><rect x="16" y="4" width="3" height="16"/>',
    cases:    '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="2" y1="13" x2="22" y2="13"/>',
    privacy:  '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    returns:  '<polyline points="1 4 1 10 7 10"/><path d="M3.5 15a9 9 0 1 0 2.1-9.4L1 10"/>',
    terms:    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/>',
    changelog: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'
};

// The menu. "id" must match data-page="..." on that page's <body>.
// hrefs are relative to the main site folder (nav.js adds BASE in front of each one).
const PAGES = [
    { id: 'home',     label: 'Home',     href: '',                   icon: 'home' },     // '' = the main page (abstraction-solutions.com/)
    { id: 'services', label: 'Services', href: 'services.html',      icon: 'services' },
    { id: 'cases',    label: 'Case Studies', href: 'case-studies.html', icon: 'cases' },
    { id: 'roi',      label: 'ROI Calculator', href: 'roi.html',        icon: 'roi' },
    { id: 'about',    label: 'About Us', href: 'aboutus.html',       icon: 'about' },
    { id: 'order',    label: 'Order',    href: 'order.html',         icon: 'order' },
    { id: 'contact',  label: 'Contact',  href: '#contact',           icon: 'contact' },  // = abstraction-solutions.com/#contact

    // group: 'legal' puts these under their own small LEGAL heading in the menu
    { id: 'privacy',  label: 'Privacy Policy',    href: 'privacy.html', icon: 'privacy', group: 'legal' },
    { id: 'returns',  label: 'Returns & Refunds', href: 'returns.html', icon: 'returns', group: 'legal' },
    { id: 'terms',    label: 'Terms of Service',  href: 'terms.html',   icon: 'terms',   group: 'legal' },

    // hidden: true = not in the menu (linked from the footer), but still named correctly as the current page
    { id: 'changelog', label: 'Changelog', href: 'changelog.html', icon: 'changelog', hidden: true },
    { id: 'recipes',   label: 'Automation Recipes', href: 'recipes/', icon: 'services', hidden: true }
];

// The folder nav.js lives in (your main site folder). Putting BASE in front of
// links and images makes them work from pages inside subfolders too.
const BASE = document.currentScript.src.replace(/nav\.js.*$/, '');

function svg(name) {
    return '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">' + ICONS[name] + '</svg>';
}

// Which page are we on? (falls back to Home if a page forgets data-page)
const currentId = document.body.dataset.page || 'home';
const current = PAGES.find(function (p) { return p.id === currentId; }) || PAGES[0];

// One link per page; the current one gets class="active" (turns green)
function navLink(p) {
    const active = p.id === current.id ? ' class="active" aria-current="page"' : '';
    return '<a href="' + BASE + p.href + '"' + active + '>' + svg(p.icon) + p.label + '</a>';
}
const links = PAGES.filter(function (p) { return !p.group && !p.hidden; }).map(navLink).join('') +
    '<small style="margin-top:14px">LEGAL</small>' +
    PAGES.filter(function (p) { return p.group === 'legal'; }).map(navLink).join('');

document.getElementById('site-nav').innerHTML =
    // hidden checkbox that remembers open/closed (must come first)
    '<input type="checkbox" id="nav-toggle" class="nav-check" aria-label="Open menu">' +

    // floating header — clicking it opens the nav
    '<div class="header-wrapper">' +
        '<label for="nav-toggle" class="header-container" title="Open menu">' +
            '<span class="brand-box">' +
                '<span class="brand-name">ABSTRACTION SOLUTIONS</span>' +
                '<img src="' + BASE + 'abstraction_solutions.jpg" alt="Abstraction Solutions logo">' +
            '</span>' +
        '</label>' +
    '</div>' +

    // Menu tab on the left edge — also opens the nav
    '<label for="nav-toggle" class="side-tab" title="Open menu">' + svg('menu') + '<span>MENU</span></label>' +

    // the side nav itself
    '<aside class="side-nav">' +
        '<div class="side-nav-top">' +
            '<div class="side-brand">' +
                '<img src="' + BASE + 'abstraction_solutions.jpg" alt="">' +
                '<span>ABSTRACTION<br>SOLUTIONS</span>' +
            '</div>' +
            '<label for="nav-toggle" class="close-btn" title="Close menu">' + svg('close') + '</label>' +
        '</div>' +
        '<div class="current-page">' +
            '<small>CURRENT PAGE</small>' +
            '<div><span class="icon-badge">' + svg(current.icon) + '</span>' + current.label + '</div>' +
        '</div>' +
        '<nav class="side-links"><small>PAGES</small>' + links + '</nav>' +
        '<div class="side-footer">© 2026 Abstraction Solutions</div>' +
    '</aside>' +

    // dark backdrop — clicking it closes the nav
    '<label for="nav-toggle" class="nav-overlay"></label>';

// Close the nav after clicking a link (needed for links on the same page, like Contact)
document.querySelectorAll('.side-links a').forEach(function (a) {
    a.addEventListener('click', function () {
        document.getElementById('nav-toggle').checked = false;
    });
});

/* ---------------------------------------------------------
   LOOPING BACKGROUND VIDEO
   Adds the silent network animation behind every page.
   Skipped for visitors who turned on "reduce motion" on their device.
   --------------------------------------------------------- */
(function () {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;

    const bg = document.createElement('video');
    bg.className = 'bg-loop';
    bg.src = BASE + 'videos/network-loop.mp4';
    bg.muted = true;          // must be muted, or browsers won't autoplay it
    bg.loop = true;
    bg.autoplay = true;
    bg.playsInline = true;    // stops iPhones from opening it fullscreen
    bg.setAttribute('aria-hidden', 'true');
    document.body.prepend(bg);
})();

/* ---------------------------------------------------------
   WAKE UP THE SERVER
   The free Render server sleeps after 15 minutes. Poking it from every page
   means it's usually awake by the time someone asks for a quote or orders.
   --------------------------------------------------------- */
fetch('https://abstraction-quote-engine.onrender.com/health').catch(function () {});

/* ---------------------------------------------------------
   SITE FOOTER
   Fills in the <footer> on every page (or adds one if a page has none),
   so the links and email only live here.
   --------------------------------------------------------- */
(function () {
    const css = document.createElement('style');
    css.textContent =
        '.site-footer{max-width:1000px;margin:60px auto 0;padding:34px 24px 40px;border-top:1px solid var(--line,#1e2a20);' +
            'display:flex;flex-wrap:wrap;justify-content:space-between;gap:28px;text-align:left;color:var(--text-muted,#9aa69c);font-size:.9rem}' +
        '.site-footer .f-brand{display:flex;align-items:center;gap:12px;color:#fff;font-weight:bold;letter-spacing:2px;font-size:.85rem}' +
        '.site-footer .f-brand img{width:34px;height:34px;border-radius:8px}' +
        '.site-footer p{margin:10px 0 0;max-width:280px;line-height:1.5}' +
        '.site-footer h4{margin:0 0 10px;color:var(--green,#7ee96f);font-size:.75rem;letter-spacing:2px}' +
        '.site-footer ul{list-style:none;margin:0;padding:0}' +
        '.site-footer li{margin:0 0 8px}' +
        '.site-footer a{color:#dfe7df;text-decoration:none}' +
        '.site-footer a:hover{color:var(--green,#7ee96f)}' +
        '.site-footer .f-copy{flex-basis:100%;padding-top:18px;border-top:1px solid var(--line,#1e2a20);font-size:.8rem}' +
        '@media(max-width:600px){.site-footer{padding-left:44px}}';
    document.head.appendChild(css);

    function link(href, text) {
        return '<li><a href="' + BASE + href + '">' + text + '</a></li>';
    }

    function build() {
        let footer = document.querySelector('footer');
        if (!footer) {
            footer = document.createElement('footer');
            document.body.appendChild(footer);
        }
        footer.className = 'site-footer';
        footer.innerHTML =
            '<div>' +
                '<div class="f-brand"><img src="' + BASE + 'abstraction_solutions.jpg" alt="">ABSTRACTION SOLUTIONS</div>' +
                '<p>AI automations, workflows, machine learning models and AI education.</p>' +
            '</div>' +
            '<div><h4>EXPLORE</h4><ul>' +
                link('services.html', 'Services') + link('services/education.html', 'AI Education') + link('recipes/', 'Automation Recipes') + link('aboutus.html', 'About Us') +
                link('case-studies.html', 'Case Studies') + link('roi.html', 'ROI Calculator') + link('index.html#quote', 'Free quote') + link('order.html', 'Order') +
                link('order.html#lookup', 'Check an order') + link('changelog.html', 'Changelog') +
            '</ul></div>' +
            '<div><h4>CONTACT</h4><ul>' +
                '<li><a href="mailto:dylanpogue@abstraction-solutions.com">dylanpogue@abstraction-solutions.com</a></li>' +
                '<li><a href="https://www.youtube.com/@abstractionsolutions" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-3px;margin-right:8px"><rect x="2" y="5" width="20" height="14" rx="4"/><polygon points="10,9 15.5,12 10,15" fill="currentColor" stroke="none"/></svg>@abstractionsolutions</a></li>' +
                '<li><a href="https://www.instagram.com/abstraction.solutions/" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-3px;margin-right:8px"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.6" cy="6.4" r="1" fill="currentColor" stroke="none"/></svg>@abstraction.solutions</a></li>' +
            '</ul></div>' +
            '<div><h4>LEGAL</h4><ul>' +
                link('privacy.html', 'Privacy Policy') + link('returns.html', 'Returns &amp; Refunds') +
                link('terms.html', 'Terms of Service') +
            '</ul></div>' +
            '<div class="f-copy">© ' + new Date().getFullYear() + ' Abstraction Solutions · Tennessee, USA</div>';
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
    else build();
})();

/* ---------------------------------------------------------
   ANALYTICS (GoatCounter: free, no cookies, no personal data)
   1. Sign up at goatcounter.com and pick a code (e.g. "abstraction")
   2. Put that code between the quotes below. Leave it empty to turn analytics off.
   Pages call trackEvent('quote-requested') etc. to count quotes, orders and payments.
   --------------------------------------------------------- */
const GOATCOUNTER_CODE = 'abstractiondp';

window.trackEvent = function (name) {
    try {
        if (window.goatcounter && window.goatcounter.count) {
            window.goatcounter.count({ path: name, title: name, event: true });
        }
    } catch (e) {}
};

(function () {
    if (!GOATCOUNTER_CODE) return;
    const gc = document.createElement('script');
    gc.async = true;
    gc.src = 'https://gc.zgo.at/count.js';
    gc.dataset.goatcounter = 'https://' + GOATCOUNTER_CODE + '.goatcounter.com/count';
    document.head.appendChild(gc);
})();
