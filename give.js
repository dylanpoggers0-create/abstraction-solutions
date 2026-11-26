/* Give page: donate on this page with Pledge's donation form (opens in a dialog over the page).
   Pledge processes the payment and issues the tax receipt; we never see card details or the money.

   Our fundraiser form (.plg-donate with data-widget-id) is embedded under the charities. Each card's button
   can also open Pledge's form for just that charity once a partner key is set on <main data-pledge-key="...">. Pledge's partner key is a public,
   client-side identifier (safe in HTML). While it's empty, nothing from Pledge loads and each button
   stays a plain link to the charity's Every.org page (also the fallback with JavaScript off). */
(function () {
    "use strict";
    var main = document.querySelector("[data-pledge-key]");
    var key = main ? (main.getAttribute("data-pledge-key") || "").trim() : "";
    var fundraiser = document.querySelector(".plg-donate[data-widget-id]");   // our Pledge fundraiser, embedded on the page
    if (!key && !fundraiser) return;
    var fallback = document.querySelector("[data-give-fallback]");
    if (location.protocol !== "https:") {                   // Pledge's form needs https (local previews)
        if (fallback) fallback.hidden = false;
        if (!key) return;
    }

    var BRAND = "#7ee96f";                                   // the site's green (--green)
    // with a partner key, each card's button also opens Pledge's form for that charity (by its tax ID)
    var links = key && location.protocol === "https:" ? document.querySelectorAll("a[data-ein]") : [];
    Array.prototype.forEach.call(links, function (a) {
        // Pledge's script opens its form in a dialog when one of these is clicked
        a.setAttribute("data-plg-action", "donate");
        a.setAttribute("data-partner-key", key);
        a.setAttribute("data-style-brand-color", BRAND);
        a.removeAttribute("target");
        a.textContent = "Donate";
        a.setAttribute("aria-label", "Donate to " + a.getAttribute("data-name") + " on this page");
    });

    if (links.length) document.documentElement.classList.add("pledge-on");   // swaps the note text (see give.html)

    var s = document.createElement("script");
    s.src = "https://www.pledge.to/embed/widget.js";
    s.async = true;
    s.onerror = function () {                                // Pledge unreachable: back to plain links
        document.documentElement.classList.remove("pledge-on");
        if (fallback) fallback.hidden = false;
        Array.prototype.forEach.call(links, function (a) {
            a.removeAttribute("data-plg-action");
            a.setAttribute("target", "_blank");
            a.textContent = "Donate on Every.org";
            a.setAttribute("aria-label", "Donate to " + a.getAttribute("data-name") + " on Every.org");
        });
    };
    document.head.appendChild(s);

    // messages from Pledge's frames: a finished donation (thank the donor), or the progress tracker's
    // Donate button (take them to the form on this page instead of Pledge's site)
    var thanks = document.querySelector("[data-give-thanks]");
    var form = document.getElementById("give-all-form");
    window.addEventListener("message", function (e) {
        if (e.origin !== "https://www.pledge.to" || typeof e.data !== "string") return;
        var payload;
        try { payload = JSON.parse(e.data); } catch (err) { return; }
        if (!payload) return;
        if (payload.message === "DonateCompleted" && thanks) {
            thanks.hidden = false;
            thanks.focus();
        } else if (payload.action === "donate" && form) {
            var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            form.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
        }
    });
})();
