/* Give page: one donation form, embedded in our own panel (not a pop-up, not one per card).
   The panel's picker and each card's Donate button choose who it gives to: "all six" uses our
   Pledge fundraiser, a single charity uses Pledge's form for that charity's EIN. Pledge processes
   the payment and issues the tax receipt; we never see card details or the money.

   Turned on by our public Pledge partner key on <main data-pledge-key="...">. Without it, without
   https, or if Pledge can't load, the cards stay plain links to each charity's Every.org page. */
(function () {
    "use strict";
    var main = document.querySelector("[data-pledge-key]");
    var key = main ? (main.getAttribute("data-pledge-key") || "").trim() : "";
    var panel = document.querySelector("[data-give-panel]");
    var slot = document.querySelector("[data-give-slot]");
    var msg = document.querySelector("[data-give-fallback]");
    if (!panel || !slot) return;

    function say(text) { if (msg) { msg.textContent = text; msg.hidden = false; } }
    if (!key) { say("Use each charity's Every.org button to donate."); return; }
    if (location.protocol !== "https:") { say("The donation form only loads on the live site (https). Use each charity's Every.org button here."); return; }

    var BRAND = "#7ee96f";                         // the site's green (--green)
    var FUNDRAISER = "MSythsDjZqaUx1uv";           // AI Made Simple, Footprint Made Smaller: all six
    var cards = {};                                // slug -> { ein, name, card, link }
    Array.prototype.forEach.call(document.querySelectorAll("a[data-ein][data-donate-slug]"), function (a) {
        cards[a.getAttribute("data-donate-slug")] = {
            ein: a.getAttribute("data-ein"), name: a.getAttribute("data-name"), card: a.closest(".give-card"), link: a
        };
    });
    var toLabel = panel.querySelector("[data-give-to]");
    var pickButtons = document.querySelectorAll("[data-give-pick]");   // the panel picker plus "Give to all six" at the top
    var current = null, scriptLoaded = false, scriptFailed = false;

    function render(pick) {
        if (pick === current || scriptFailed) return;
        current = pick;
        var c = cards[pick];
        // one form at a time: drop the old one, Pledge's script draws the new one
        slot.textContent = "";
        var form = document.createElement("div");
        form.className = "plg-donate";
        form.setAttribute("data-style-brand-color", BRAND);
        if (c) {
            form.setAttribute("data-partner-key", key);
            form.setAttribute("data-ein", c.ein);
        } else {
            form.setAttribute("data-widget-id", FUNDRAISER);
        }
        slot.appendChild(form);
        if (toLabel) toLabel.textContent = c ? c.name : "all six charities";
        Array.prototype.forEach.call(pickButtons, function (b) {
            if (b.closest("[data-give-panel]")) b.setAttribute("aria-pressed", String(b.getAttribute("data-give-pick") === pick));
        });
        Object.keys(cards).forEach(function (s) { if (cards[s].card) cards[s].card.classList.toggle("is-chosen", s === pick); });
    }

    function choose(pick, scroll) {
        render(pick);
        if (scroll) {
            var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            panel.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
        }
    }

    // the cards' buttons now pick that charity in the panel (Every.org stays the fallback)
    Object.keys(cards).forEach(function (s) {
        var a = cards[s].link;
        a.textContent = "Donate";
        a.removeAttribute("target");
        a.setAttribute("href", "#donate");
        a.setAttribute("aria-label", "Donate to " + cards[s].name + " here on this page");
        a.addEventListener("click", function (e) {
            if (scriptFailed) return;
            e.preventDefault();
            choose(s, true);
        });
    });
    Array.prototype.forEach.call(pickButtons, function (b) {
        b.addEventListener("click", function (e) {
            if (scriptFailed) return;
            if (b.tagName === "A") e.preventDefault();
            choose(b.getAttribute("data-give-pick"), !b.closest("[data-give-panel]"));
        });
    });

    panel.classList.add("is-live");
    if (msg) msg.hidden = true;
    render("all");

    var s = document.createElement("script");
    s.src = "https://www.pledge.to/embed/widget.js";
    s.async = true;
    s.onload = function () { scriptLoaded = true; };
    s.onerror = function () {                      // Pledge unreachable: back to plain Every.org links
        scriptFailed = true;
        panel.classList.remove("is-live");
        slot.textContent = "";
        if (msg) { slot.appendChild(msg); say("The donation form couldn't load. You can still give to any of these charities through its Every.org button."); }
        Object.keys(cards).forEach(function (k) {
            var a = cards[k].link;
            a.setAttribute("href", "https://www.every.org/" + k + "#donate");
            a.setAttribute("target", "_blank");
            a.textContent = "Donate on Every.org";
            a.setAttribute("aria-label", "Donate to " + cards[k].name + " on Every.org");
            if (cards[k].card) cards[k].card.classList.remove("is-chosen");
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
