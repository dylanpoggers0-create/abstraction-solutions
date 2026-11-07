// Always use the secure address: the quote engine only answers https://abstraction-solutions.com,
// so a page opened as http:// would say "offline" even when everything is up.
// Tries once per visit, so if the https address ever sends people back to http (a hosting setting),
// visitors stay on the page instead of bouncing back and forth.
if (location.protocol === 'http:' && /(^|\.)abstraction-solutions\.com$/.test(location.hostname)) {
  let triedHttps = false;
  try { triedHttps = sessionStorage.getItem('triedHttps') === '1'; sessionStorage.setItem('triedHttps', '1'); } catch (e) {}
  if (!triedHttps) location.replace('https://' + location.host + location.pathname + location.search + location.hash);
}

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
    changelog: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    memphis:  '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
    clubs:    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'
};

// The menu. "id" must match data-page="..." on that page's <body>.
// hrefs are relative to the main site folder (nav.js adds BASE in front of each one).
const PAGES = [
    { id: 'home',     label: 'Home',     href: '',                   icon: 'home' },     // '' = the main page (abstraction-solutions.com/)
    { id: 'services', label: 'Services', href: 'services.html',      icon: 'services' },
    // hidden: Case Studies now lives at the bottom of the Order page, ROI on the homepage
    { id: 'cases',    label: 'Case Studies', href: 'order.html#case-studies', icon: 'cases', hidden: true },
    { id: 'roi',      label: 'ROI Calculator', href: 'roi.html',        icon: 'roi', hidden: true },
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
// Where the site's files are, taken from this script's own address. It's checked before use, because the menu and
// footer are built as HTML text: an address with quotes or angle brackets in it can never become markup.
const BASE = (function () {
    const base = document.currentScript.src.replace(/nav\.js.*$/, '');
    return /^https?:\/\/[^\s"'<>`]+\/$/.test(base) ? base : '/';
})();

/* ---------------------------------------------------------
   FREE NEWSLETTER (email only, every 2 weeks)
   1. Make a free account at buttondown.com
   2. Put your Buttondown username between the quotes below (it's public, not a secret).
      Leave it empty and the signup forms stay hidden.
   Any element with data-newsletter gets a signup form (the homepage has one, and so does the footer).
   --------------------------------------------------------- */
const NEWSLETTER_BUTTONDOWN = '';

function fillNewsletters() {
    if (!NEWSLETTER_BUTTONDOWN) return;
    if (!document.getElementById('nl-css')) {
        const css = document.createElement('style');
        css.id = 'nl-css';
        css.textContent =
            '.nl{max-width:560px;margin:0 auto;text-align:center}' +
            '.nl h3{margin:0 0 6px;color:#fff;font-size:1.1rem}' +
            '.nl p{margin:0 auto 14px;color:var(--text-muted,#9aa69c);max-width:none}' +
            '.nl form{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}' +
            '.nl input{flex:1 1 220px;max-width:320px;padding:12px 16px;border-radius:50px;border:1px solid var(--line,#1e2a20);' +
                'background:var(--panel,#0b100c);color:#fff;font:inherit}' +
            '.nl input:focus{outline:none;border-color:var(--green,#7ee96f)}' +
            '.nl button{padding:12px 22px;border-radius:50px;border:1px solid var(--green,#7ee96f);background:var(--green,#7ee96f);' +
                'color:#061006;font:inherit;font-weight:bold;cursor:pointer}' +
            '.nl .nl-thanks{color:var(--green,#7ee96f);font-weight:bold;margin:0}' +
            '.nl .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}';
        document.head.appendChild(css);
    }
    document.querySelectorAll('[data-newsletter]').forEach(function (box, i) {
        if (box.dataset.ready) return;
        box.dataset.ready = '1';
        box.hidden = false;
        const user = encodeURIComponent(NEWSLETTER_BUTTONDOWN);
        const id = 'nl-email-' + i;
        const frame = 'nl-frame-' + i;
        box.innerHTML =
            '<div class="nl">' +
                '<h3>Get our progress updates</h3>' +
                '<p>A free email every 2 weeks with what Abstraction Solutions is building. Unsubscribe any time.</p>' +
                '<form action="https://buttondown.com/api/emails/embed-subscribe/' + user + '" method="post" target="' + frame + '">' +
                    '<label class="sr" for="' + id + '">Email address</label>' +
                    '<input id="' + id + '" type="email" name="email" required maxlength="200" autocomplete="email" placeholder="you@example.com">' +
                    '<button type="submit">Subscribe</button>' +
                '</form>' +
                '<iframe name="' + frame + '" title="Newsletter signup" hidden></iframe>' +
            '</div>';
        const form = box.querySelector('form');
        let sent = false;
        form.addEventListener('submit', function () {
            sent = true;
            window.trackEvent && trackEvent('newsletter-signup');
        });
        // Buttondown answers inside the hidden frame; when it loads after a submit, show the thank-you
        box.querySelector('iframe').addEventListener('load', function () {
            if (!sent) return;
            form.outerHTML = '<p class="nl-thanks" role="status">Thanks! Check your inbox to confirm your subscription.</p>';
        });
    });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fillNewsletters);
else fillNewsletters();

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

/* Quote promo lines (<p class="promo-line" data-promo-until="...">).
   Delete this function, or delete those paragraphs, to remove the promo early.
   data-promo-until is the first moment it should disappear: start of Saturday,
   November 14, 2026, America/Chicago (CST, UTC-6). */
(function () {
    function applyPromo() {
        document.querySelectorAll('[data-promo-until]').forEach(function (el) {
            var end = Date.parse(el.getAttribute('data-promo-until'));
            if (!end || Date.now() >= end) el.remove();
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyPromo);
    else applyPromo();
})();

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
        '.site-footer .f-explore{columns:2;column-gap:32px}' +
        '.site-footer .f-explore li{break-inside:avoid}' +
        '.site-footer .f-legal{margin-top:22px}' +
        '.site-footer a{color:#dfe7df;text-decoration:none}' +
        '.site-footer a:hover{color:var(--green,#7ee96f)}' +
        '.site-footer .f-copy{flex-basis:100%;padding-top:18px;border-top:1px solid var(--line,#1e2a20);font-size:.8rem;display:flex;flex-wrap:wrap;gap:8px 18px}' +
        '.site-footer .f-admin{color:var(--text-muted,#9aa69c);font-size:.8rem}' +
        '.site-footer .f-news{flex-basis:100%;padding-bottom:26px;border-bottom:1px solid var(--line,#1e2a20)}' +
        '@media(max-width:600px){.site-footer{padding-left:44px}}';
    document.head.appendChild(css);

    function link(href, text) {
        return '<li><a href="' + BASE + href + '">' + text + '</a></li>';
    }

    // newsletter signup at the top of the footer (only once NEWSLETTER_BUTTONDOWN is filled in below)
    function signup() {
        return NEWSLETTER_BUTTONDOWN ? '<div class="f-news" data-newsletter></div>' : '';
    }

    function build() {
        let footer = document.querySelector('footer');
        if (!footer) {
            footer = document.createElement('footer');
            document.body.appendChild(footer);
        }
        footer.className = 'site-footer';
        footer.innerHTML =
            signup() +
            '<div>' +
                '<div class="f-brand"><img src="' + BASE + 'abstraction_solutions.jpg" alt="">ABSTRACTION SOLUTIONS</div>' +
                '<p>AI made simple: plain-language AI education, automations and custom AI tools.</p>' +
            '</div>' +
            '<div><h4>EXPLORE</h4><ul class="f-explore">' +
                link('services.html', 'Services') + link('services/education.html', 'AI Education') + link('recipes/', 'Automation Recipes') + link('aboutus.html', 'About Us') +
                link('order.html#case-studies', 'Case Studies') + link('index.html#roi', 'ROI Calculator') + link('index.html#quote', 'Free quote') + link('order.html', 'Order') +
                link('order.html#lookup', 'Check an order') + link('changelog.html', 'Changelog') +
            '</ul></div>' +
            '<div class="f-side"><h4>CONTACT</h4><ul>' +
                '<li><a href="mailto:dylanpogue@abstraction-solutions.com">dylanpogue@abstraction-solutions.com</a></li>' +
                '<li><a href="https://www.youtube.com/@abstractionsolutions" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-3px;margin-right:8px"><rect x="2" y="5" width="20" height="14" rx="4"/><polygon points="10,9 15.5,12 10,15" fill="currentColor" stroke="none"/></svg>@abstractionsolutions</a></li>' +
                '<li><a href="https://www.instagram.com/abstraction.solutions/" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-3px;margin-right:8px"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.6" cy="6.4" r="1" fill="currentColor" stroke="none"/></svg>@abstraction.solutions</a></li>' +
                '<li><a href="https://www.tiktok.com/@abstraction.soluti" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:8px"><path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 3c.6 2.6 2.6 4.3 5 4.5"/></svg>@abstraction.soluti</a></li>' +
            '</ul>' +
            '<h4 class="f-legal">LEGAL</h4><ul>' +
                link('privacy.html', 'Privacy Policy') + link('returns.html', 'Returns &amp; Refunds') +
                link('terms.html', 'Terms of Service') +
            '</ul></div>' +
            '<div class="f-copy">© ' + new Date().getFullYear() + ' Abstraction Solutions · Tennessee, USA' +
                '<a class="f-admin" href="' + BASE + 'admin.html">Admin</a></div>';
        fillNewsletters();
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

/* ---------------------------------------------------------
   SITE ASSISTANT (chat bubble, bottom right)
   Searches this website's own pages right in the visitor's browser: no server, so it's always on and instant.
   The search index lives in chatbot/index/ and is rebuilt from the pages by a GitHub Action on every push.
     - keyword search (BM25) works immediately
     - when chatbot/index/vectors.json exists, it also loads the MiniLM model in the browser for smarter matching
   Set CHAT_ON to false to hide the bubble.
   --------------------------------------------------------- */
const CHAT_ON = true;

(function () {
    if (!CHAT_ON) return;
    const INDEX = BASE + 'chatbot/index/';
    const EMAIL = 'dylanpogue@abstraction-solutions.com';
    const MIN_SEMANTIC = 0.35;   // same cutoff as chatbot/rag.py
    const MIN_COVERAGE = 0.34;   // keyword search: about a third of the question's important words must match

    const css = document.createElement('style');
    css.textContent =
        '.chat-btn{position:fixed;right:18px;bottom:18px;z-index:250;display:flex;align-items:center;gap:8px;padding:12px 18px;' +
            'border-radius:50px;border:1px solid var(--green,#7ee96f);background:#0b100c;color:#fff;font:inherit;font-weight:bold;' +
            'cursor:pointer;box-shadow:0 6px 24px rgba(0,0,0,.6)}' +
        '.chat-btn svg{width:20px;height:20px;stroke:var(--green,#7ee96f);fill:none;stroke-width:2}' +
        '.chat-box{position:fixed;right:18px;bottom:18px;z-index:260;width:360px;max-width:calc(100vw - 36px);height:520px;' +
            'max-height:calc(100vh - 36px);display:flex;flex-direction:column;background:#0b100c;border:1px solid var(--line,#1e2a20);' +
            'border-radius:18px;box-shadow:0 10px 40px rgba(0,0,0,.7);overflow:hidden}' +
        '.chat-box[hidden]{display:none}' +
        '.chat-head{display:flex;align-items:center;gap:8px;padding:14px 16px;border-bottom:1px solid var(--line,#1e2a20);font-weight:bold}' +
        '.chat-head .demo{font-size:.65rem;letter-spacing:1.5px;color:#f5c451;border:1px solid #f5c451;border-radius:50px;padding:2px 8px}' +
        '.chat-head button{margin-left:auto;background:none;border:0;color:#9aa69c;font-size:1.4rem;cursor:pointer;line-height:1}' +
        '.chat-note{margin:0;padding:10px 16px;font-size:.78rem;color:#9aa69c;border-bottom:1px solid var(--line,#1e2a20)}' +
        '.chat-log{flex:1;overflow-y:auto;padding:14px 16px;display:flex;flex-direction:column;gap:10px}' +
        '.chat-msg{max-width:88%;padding:10px 13px;border-radius:14px;line-height:1.5;font-size:.92rem;word-wrap:break-word}' +
        '.chat-msg.me{align-self:flex-end;background:var(--green-soft,rgba(126,233,111,.12));border:1px solid var(--green-dim,rgba(126,233,111,.35))}' +
        '.chat-msg.bot{align-self:flex-start;background:#141a15;border:1px solid var(--line,#1e2a20)}' +
        '.chat-src{margin-top:8px;font-size:.78rem;color:#9aa69c}' +
        '.chat-src a{color:var(--green,#7ee96f);margin-right:10px}' +
        '.chat-form{display:flex;gap:8px;padding:12px;border-top:1px solid var(--line,#1e2a20)}' +
        '.chat-form input{flex:1;min-width:0;padding:11px 14px;border-radius:50px;border:1px solid var(--line,#1e2a20);background:#050805;color:#fff;font:inherit}' +
        '.chat-form input:focus{outline:none;border-color:var(--green,#7ee96f)}' +
        '.chat-form button{padding:10px 16px;border-radius:50px;border:0;background:var(--green,#7ee96f);color:#061006;font:inherit;font-weight:bold;cursor:pointer}' +
        '.chat-p{margin:0 0 8px}' +
        '.chat-lead{color:#9aa69c;font-size:.85rem}' +
        '.chat-quote{margin:0;padding:8px 12px;border-left:3px solid var(--green,#7ee96f);background:#0f1510;border-radius:0 10px 10px 0;white-space:pre-line}' +
        '.chat-msg.bot a{color:var(--green,#7ee96f)}' +
        '.chat-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}' +
        '.chat-head .chat-title{display:flex;flex-direction:column;line-height:1.25}' +
        '.chat-head .chat-sub{font-weight:normal;font-size:.75rem;color:#9aa69c}' +
        '.chat-list{margin:4px 0 8px;padding-left:18px}.chat-list li{margin-bottom:6px}' +
        '.chat-list strong{color:#fff}' +
        '.chat-chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:4px}' +
        '.chat-chip{padding:8px 12px;border-radius:50px;border:1px solid var(--line,#1e2a20);background:#050805;color:#dfe7df;' +
            'font:inherit;font-size:.85rem;cursor:pointer}' +
        '.chat-chip:hover{border-color:var(--green,#7ee96f);color:#fff}' +
        // PHONES: the chat opens as its own full screen (like a messaging app) instead of a small floating panel,
        // and the button shrinks to a round icon so it doesn't cover the page
        '@media(max-width:600px){' +
            '.chat-btn{right:14px;bottom:14px;width:56px;height:56px;padding:0;justify-content:center;border-radius:50%}' +
            '.chat-btn .chat-label{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}' +
            '.chat-btn svg{width:24px;height:24px}' +
            '.chat-box{inset:0;right:0;bottom:0;width:100%;max-width:none;height:100%;height:100dvh;max-height:none;' +
                'border:0;border-radius:0;z-index:400}' +
            '.chat-head{padding:14px 16px;padding-top:calc(14px + env(safe-area-inset-top))}' +
            '.chat-head button{font-size:2rem;width:44px;height:44px}' +
            '.chat-form{padding:10px 12px calc(10px + env(safe-area-inset-bottom))}' +
            '.chat-form input{font-size:16px}' +          // 16px stops iPhones zooming in on the box
            '.chat-msg{max-width:92%;font-size:1rem}' +
        '}';
    document.head.appendChild(css);

    // ---------- search ----------
    const STOP = new Set(('a an the and or but of to in on for with at by from is are was were be been being do does did ' +
        'can could you your yours we our ours us i me my it its this that these those what how who whom when where which ' +
        'why about have has had will would should shall may might must any some there their they them as if so not no ' +
        'yes just also into than then too very get got make made want need tell know please hi hello thanks thank ' +
        'offer offers offered provide provides available use using used work works anything something').split(' '));
    const ALIAS = { contact: ['email'], reach: ['email'], phone: ['email'], call: ['email'], calls: ['email'],
                    cancel: ['refund'], money: ['refund'], ml: ['machine', 'learning'], data: ['information', 'privacy'],
                    payment: ['pay', 'stripe'], payments: ['pay', 'stripe'], pay: ['payment'], founded: ['founder'],
                    owner: ['founder'], who: ['founder'], located: ['memphis', 'tennessee'], where: ['memphis'],
                    nonprofit: ['club'], nonprofits: ['club'],
                    dues: ['club'], rsvp: ['event', 'signup'], volunteer: ['club'], discount: ['50', 'off', 'club'],
                    discounts: ['50', 'off', 'club'], charity: ['nonprofit', 'club'] };

    function stem(w) {
        if (w.length <= 4) return w;
        if (/ies$/.test(w)) return w.slice(0, -3) + 'y';
        return w.replace(/(ing|ed|es|s)$/, '');
    }
    function words(text) {
        const out = [];
        (text.toLowerCase().match(/[a-z0-9]+/g) || []).forEach(function (w) {
            (ALIAS[w] || []).forEach(function (a) { if (a !== w) out.push(stem(a)); });
            if (STOP.has(w) || w.length < 2) return;
            out.push(stem(w));
        });
        return out;
    }

    let chunks = null, bm = null, vectors = null, model = null, loading = null;

    function buildBM25() {
        const docs = chunks.map(function (c) {   // the page title and section heading count double
            const t = words(c.title + ' ' + (c.heading || ''));
            return t.concat(t, words(c.text));
        });
        const df = {};
        docs.forEach(function (d) { new Set(d).forEach(function (w) { df[w] = (df[w] || 0) + 1; }); });
        const N = docs.length;
        const idf = {};
        Object.keys(df).forEach(function (w) { idf[w] = Math.log(1 + (N - df[w] + 0.5) / (df[w] + 0.5)); });
        const avg = docs.reduce(function (s, d) { return s + d.length; }, 0) / N;
        const tf = docs.map(function (d) { const m = {}; d.forEach(function (w) { m[w] = (m[w] || 0) + 1; }); return m; });
        const heads = chunks.map(function (c) { return new Set(words(c.heading || '')); });
        bm = { docs: docs, idf: idf, avg: avg, tf: tf, heads: heads };
    }

    // Terms, Privacy and Returns use everyday words too ("Our services", "data"), so they only come first when the
    // question is actually about policies; otherwise their matches count for much less.
    const LEGAL_PAGE = /\/(terms|privacy|returns)\.html$/;
    const LEGAL_QUESTION = /\b(terms|privacy|polic(y|ies)|refunds?|returns?|cancel\w*|legal|liabilit\w*|warrant\w*|guarantee\w*|data|cookies?|personal|information|law|dispute|bug ?fix\w*|own\w*|rights?)\b/i;

    function keywordSearch(q) {
        const legal = LEGAL_QUESTION.test(q);
        const qs = Array.from(new Set(words(q)));   // words not on the site count too, so off-topic questions don't match
        const total = qs.reduce(function (s, w) { return s + (bm.idf[w] || Math.log(1 + bm.docs.length)); }, 0);
        if (!total) return [];
        return chunks.map(function (c, i) {
            let score = 0, matched = 0;
            qs.forEach(function (w) {
                const f = bm.tf[i][w];
                if (!f) return;
                matched += bm.idf[w];
                score += bm.idf[w] * f * 2.2 / (f + 1.2 * (0.25 + 0.75 * bm.docs[i].length / bm.avg));
                if (bm.heads[i].has(w)) score += bm.idf[w] * 1.5;   // the section is about this word
            });
            if (LEGAL_PAGE.test(chunks[i].url)) score *= legal ? 1.6 : 0.35;
            else if (legal) score *= 0.5;       // a policy question: policy pages first
            return { i: i, score: score, coverage: matched / total };
        }).filter(function (h) { return h.coverage >= MIN_COVERAGE; })
          .sort(function (a, b) { return b.score - a.score; }).slice(0, 3);
    }

    async function semanticSearch(q) {
        const legal = LEGAL_QUESTION.test(q);
        const out = await model(q, { pooling: 'mean', normalize: true });
        const v = out.data;
        return vectors.map(function (row, i) {
            let s = 0;
            for (let j = 0; j < row.length; j++) s += row[j] * v[j];
            if (LEGAL_PAGE.test(chunks[i].url)) s += legal ? 0.05 : -0.12;
            else if (legal) s -= 0.05;
            return { i: i, score: s };
        }).filter(function (h) { return h.score >= MIN_SEMANTIC; })
          .sort(function (a, b) { return b.score - a.score; }).slice(0, 3);
    }

    function load() {   // the index is small; the MiniLM model (~23 MB) only loads if vectors exist and data saver is off
        if (loading) return loading;
        loading = fetch(INDEX + 'chunks.json').then(function (r) {
            if (!r.ok) throw new Error('index');
            return r.json();
        }).then(function (data) {
            chunks = data;
            buildBM25();
            if (navigator.connection && navigator.connection.saveData) return;
            fetch(INDEX + 'vectors.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (vj) {
                if (!vj || vj.vectors.length !== chunks.length) return;
                return import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2').then(function (t) {
                    return t.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
                }).then(function (m) { model = m; vectors = vj.vectors; });
            }).catch(function () { model = null; });   // keyword search keeps working without it
        });
        loading.catch(function () { loading = null; });
        return loading;
    }

    function passage(text) {
        let t = text.replace(/\s+\n/g, '\n').trim();
        // drop small page labels at the top of a section ("LEGAL", "Effective November 4, 2026")
        t = t.replace(/^(?:(?:[A-Z0-9&·' -]{2,40}|Effective [^\n]{0,40})\n)+/, '').trim();
        if (/^[a-z]/.test(t)) {                    // starts mid-sentence (chunk overlap): skip to the next line or sentence
            const cut = t.search(/\n|\. /);
            if (cut > -1 && cut < 120) t = t.slice(cut + 1).trim();
        }
        if (t.length > 420) {
            const end = t.lastIndexOf('. ', 420);
            t = t.slice(0, end > 200 ? end + 1 : 420).trim() + (end > 200 ? '' : '…');
        }
        return t;
    }

    // "What do you do?", "What services do you offer?", "Who are you?": questions about the company as a whole.
    // They have almost no searchable words, so they get the list of services straight from the Services page.
    const ABOUT_US = /\b(you|your|y'?all|abstraction|company|business|team)\b/i;
    const GENERAL = new Set(['servic', 'service', 'offer', 'product', 'help', 'build', 'make', 'sell', 'provide', 'company',
                             'business', 'abstraction', 'solution', 'team', 'about', 'kind', 'type', 'thing', 'stuff']);
    function isOverview(q) {
        if (!/\b(what|who|tell|about|services?|offer\w*|do you do)\b/i.test(q)) return false;
        if (!ABOUT_US.test(q) && !/\bservices?\b/i.test(q)) return false;
        return words(q).filter(function (w) { return !GENERAL.has(w); }).length === 0;
    }
    function overview() {
        const services = [];
        chunks.forEach(function (c) {
            if (!/\/services\.html$/.test(c.url) || !c.heading || /made simple|not sure|recipes/i.test(c.heading)) return;
            if (services.some(function (s) { return s.heading === c.heading; })) return;
            services.push(c);
        });
        return services;
    }

    async function answer(q) {
        await load();
        if (isOverview(q)) return { overview: overview(), hits: [], notes: [] };
        // "Do you build websites?": answer from the sections that are about websites
        if (/\bwebsites?\b|\bweb ?sites?\b/i.test(q) && /\b(build|make|design|do|create|offer|help)\b/i.test(q)) {
            const about = chunks.filter(function (c) { return /website/i.test(c.heading || ''); });
            about.sort(function (a, b) { return (/\.com\/$/.test(b.url) ? 1 : 0) - (/\.com\/$/.test(a.url) ? 1 : 0); });   // homepage first
            if (about.length) return { hits: about.slice(0, 3), notes: [] };
        }
        let hits = [];
        if (model) {
            try { hits = await semanticSearch(q); } catch (e) { hits = []; }
        }
        if (!hits.length) hits = keywordSearch(q);
        const notes = [];
        if (/\b(quote|quotes|estimate|estimates)\b/i.test(q) && /\b(how|where|get|can i|want|need|request)\b/i.test(q))
            return { hits: [], notes: [{ text: 'Describe your project in the free instant quote on our homepage and you get an ' +
                'estimate in seconds. Like it? Tap "Accept this quote" to open the order form with everything filled in.',
                href: BASE + 'index.html#quote', link: 'Get a free quote' }] };
        if (/\b(price|prices|pricing|cost|costs|how much|charge|rate|rates|fee|fees|expensive|cheap|budget)\b/i.test(q))
            notes.push({ text: 'We don\'t list prices. The free instant quote gives you an estimate in seconds.', href: BASE + 'index.html#quote', link: 'Get a free quote' });
        if (/\b(call|calls|phone|meeting|meet|zoom)\b/i.test(q))
            notes.push({ text: 'We work by email and through this website, no calls needed: ' + EMAIL + '.' });
        return { hits: hits.map(function (h) { return chunks[h.i]; }), notes: notes };   // chunk objects, best first
    }

    // ---------- chat window ----------
    const btn = document.createElement('button');
    btn.className = 'chat-btn';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Ask our site');
    btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
                    '<span class="chat-label">Ask our site</span>';

    const box = document.createElement('div');
    box.className = 'chat-box';
    box.hidden = true;
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Site assistant');
    box.innerHTML =
        '<div class="chat-head"><span class="chat-title">Ask Abstraction Solutions' +
            '<span class="chat-sub">Answers from our website, with the page they came from</span></span>' +
            '<button type="button" aria-label="Close chat">&times;</button></div>' +
        '<div class="chat-log" aria-live="polite"></div>' +
        '<form class="chat-form">' +
            '<label class="chat-sr" for="chatInput">Your question</label>' +
            '<input id="chatInput" type="text" maxlength="300" autocomplete="off" placeholder="Ask about our services…" required>' +
            '<button type="submit">Send</button>' +
        '</form>';

    function ready() { document.body.append(btn, box); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
    else ready();

    const log = box.querySelector('.chat-log');
    const form = box.querySelector('form');
    const input = box.querySelector('input');

    function el(tag, cls, text) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text) e.textContent = text;
        return e;
    }
    function link(href, text) {
        const a = el('a', '', text);
        a.href = href;
        return a;
    }
    function say(cls, text) {
        const m = el('div', 'chat-msg ' + cls, text);
        log.appendChild(m);
        log.scrollTop = log.scrollHeight;
        return m;
    }

    const phone = window.matchMedia('(max-width: 600px)');
    const SUGGESTIONS = ['What do you do?', 'Nonprofit discount', 'How do refunds work?', 'How do I get a quote?'];

    function openChat() {
        box.hidden = false;
        btn.hidden = true;
        if (phone.matches) document.documentElement.style.overflow = 'hidden';   // the page behind stays still
        load().catch(function () {});
        if (!log.children.length) {
            const hi = say('bot', 'Hi! Ask me anything about Abstraction Solutions, or tap a question:');
            const chips = el('div', 'chat-chips');
            SUGGESTIONS.forEach(function (text) {
                const chip = el('button', 'chat-chip', text);
                chip.type = 'button';
                chip.addEventListener('click', function () { ask(text); });
                chips.appendChild(chip);
            });
            hi.appendChild(chips);
        }
        if (!phone.matches) input.focus();   // on phones, don't pop the keyboard over the suggestions
    }
    function closeChat() {
        box.hidden = true;
        btn.hidden = false;
        document.documentElement.style.overflow = '';
        btn.focus();
    }
    btn.addEventListener('click', openChat);
    box.querySelector('.chat-head button').addEventListener('click', closeChat);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !box.hidden) closeChat(); });

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        ask(input.value.trim());
    });

    async function ask(q) {
        if (q.length < 2) return;
        say('me', q);
        input.value = '';
        window.trackEvent && trackEvent('chat-question');
        const m = say('bot', '');
        let res;
        try { res = await answer(q); } catch (err) {
            m.textContent = 'The search couldn\'t load. Please refresh the page and try again.';
            return;
        }
        if (res.overview && res.overview.length) {
            m.appendChild(el('p', 'chat-p', 'We help people and businesses put AI to work. What we do:'));
            const list = el('ul', 'chat-list');
            res.overview.forEach(function (s) {
                const li = el('li');
                li.appendChild(el('strong', '', s.heading + ': '));
                const first = passage(s.text).split(/\.\s/)[0].replace(/\.$/, '');   // just the first sentence
                li.appendChild(document.createTextNode(first + '.'));
                list.appendChild(li);
            });
            m.appendChild(list);
            const src = el('div', 'chat-src', 'From: ');
            src.appendChild(link(BASE + 'services.html', 'Services'));
            src.appendChild(link(BASE + 'index.html#quote', 'Get a free quote'));
            m.appendChild(src);
            log.scrollTop = log.scrollHeight;
            return;
        }
        res.notes.forEach(function (n) {
            const p = el('p', 'chat-p', n.text + ' ');
            if (n.href) p.appendChild(link(n.href, n.link));
            m.appendChild(p);
        });
        if (res.hits.length) {
            const top = res.hits[0];
            m.appendChild(el('p', 'chat-p chat-lead', 'Here\'s what our site says:'));
            m.appendChild(el('blockquote', 'chat-quote', passage(top.text)));
            const src = el('div', 'chat-src', 'From: ');
            src.appendChild(link(top.url, top.title + (top.heading && top.heading !== top.title ? ' › ' + top.heading : '')));
            m.appendChild(src);
            const more = [];
            res.hits.slice(1).forEach(function (h) {
                if (h.url !== top.url && more.every(function (x) { return x.url !== h.url; })) more.push(h);
            });
            if (more.length) {
                const rel = el('div', 'chat-src', 'Related: ');
                more.forEach(function (h) { rel.appendChild(link(h.url, h.title)); });
                m.appendChild(rel);
            }
        } else if (!res.notes.length) {
            const p = el('p', 'chat-p', 'I couldn\'t find that on our website. For a project estimate, try the ');
            p.appendChild(link(BASE + 'index.html#quote', 'free instant quote'));
            p.appendChild(document.createTextNode(', or email ' + EMAIL + '.'));
            m.appendChild(p);
        }
        log.scrollTop = log.scrollHeight;
        if (!phone.matches) input.focus();
    }
})();
