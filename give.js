/* Give page: donate on this page with Pledge's donation form (opens in a dialog over the page).
   Pledge processes the payment and issues the tax receipt; we never see card details or the money.

   Turned on by the partner key on <main data-pledge-key="...">. Pledge's partner key is a public,
   client-side identifier (safe in HTML). While it's empty, nothing from Pledge loads and each button
   stays a plain link to the charity's Every.org page (also the fallback with JavaScript off). */
(function () {
    "use strict";
    var main = document.querySelector("[data-pledge-key]");
    var key = main ? (main.getAttribute("data-pledge-key") || "").trim() : "";
    if (!key || location.protocol !== "https:") return;   // Pledge's form needs https

    var BRAND = "#7ee96f";                                   // the site's green (--green)
    var links = document.querySelectorAll("a[data-ein]");
    Array.prototype.forEach.call(links, function (a) {
        // Pledge's script opens its form in a dialog when one of these is clicked
        a.setAttribute("data-plg-action", "donate");
        a.setAttribute("data-partner-key", key);
        a.setAttribute("data-style-brand-color", BRAND);
        a.removeAttribute("target");
        a.textContent = "Donate";
        a.setAttribute("aria-label", "Donate to " + a.getAttribute("data-name") + " on this page");
    });

    document.documentElement.classList.add("pledge-on");     // swaps the note text (see give.html)

    var s = document.createElement("script");
    s.src = "https://www.pledge.to/embed/widget.js";
    s.async = true;
    s.onerror = function () {                                // Pledge unreachable: back to plain links
        document.documentElement.classList.remove("pledge-on");
        Array.prototype.forEach.call(links, function (a) {
            a.removeAttribute("data-plg-action");
            a.setAttribute("target", "_blank");
            a.textContent = "Donate on Every.org";
            a.setAttribute("aria-label", "Donate to " + a.getAttribute("data-name") + " on Every.org");
        });
    };
    document.head.appendChild(s);

    // thank the donor when Pledge says the donation went through
    var thanks = document.querySelector("[data-give-thanks]");
    window.addEventListener("message", function (e) {
        if (e.origin !== "https://www.pledge.to" || typeof e.data !== "string") return;
        var payload;
        try { payload = JSON.parse(e.data); } catch (err) { return; }
        if (payload && payload.message === "DonateCompleted" && thanks) {
            thanks.hidden = false;
            thanks.focus();
        }
    });
})();
