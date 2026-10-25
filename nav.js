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
    close:    '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'
};

// The menu. "id" must match data-page="..." on that page's <body>.
const PAGES = [
    { id: 'home',     label: 'Home',     href: 'index.html',         icon: 'home' },
    { id: 'services', label: 'Services', href: 'services.html',      icon: 'services' },
    { id: 'contact',  label: 'Contact',  href: 'index.html#contact', icon: 'contact' }
];

function svg(name) {
    return '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">' + ICONS[name] + '</svg>';
}

// Which page are we on? (falls back to Home if a page forgets data-page)
const currentId = document.body.dataset.page || 'home';
const current = PAGES.find(function (p) { return p.id === currentId; }) || PAGES[0];

// One link per page; the current one gets class="active" (turns green)
const links = PAGES.map(function (p) {
    const active = p.id === current.id ? ' class="active" aria-current="page"' : '';
    return '<a href="' + p.href + '"' + active + '>' + svg(p.icon) + p.label + '</a>';
}).join('');

document.getElementById('site-nav').innerHTML =
    // hidden checkbox that remembers open/closed (must come first)
    '<input type="checkbox" id="nav-toggle" class="nav-check" aria-label="Open menu">' +

    // floating header — clicking it opens the nav
    '<div class="header-wrapper">' +
        '<label for="nav-toggle" class="header-container" title="Open menu">' +
            '<span class="brand-box">' +
                '<span class="brand-name">ABSTRACTION SOLUTIONS</span>' +
                '<img src="abstraction_solutions.jpg" alt="Abstraction Solutions logo">' +
            '</span>' +
        '</label>' +
    '</div>' +

    // Menu tab on the left edge — also opens the nav
    '<label for="nav-toggle" class="side-tab" title="Open menu">' + svg('menu') + '<span>MENU</span></label>' +

    // the side nav itself
    '<aside class="side-nav">' +
        '<div class="side-nav-top">' +
            '<div class="side-brand">' +
                '<img src="abstraction_solutions.jpg" alt="">' +
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