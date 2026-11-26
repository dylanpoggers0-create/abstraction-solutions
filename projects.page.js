/* Order page: "Things we've built". Switches each card between its 3D model and its video, and loads
   the three.js models (projects3d.js: Email Cyberdeck, HydroCart, Family Plant Monitor) only when they scroll into view. Without WebGL or JavaScript,
   each viewer keeps its still picture and the videos still play. */
(function () {
    "use strict";
    var cards = document.querySelectorAll("[data-built]");
    if (!cards.length) return;

    function webglOK() {
        try {
            var c = document.createElement("canvas");
            return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
        } catch (e) { return false; }
    }
    var canGL = webglOK();
    var modP = null;
    // wait until the page has loaded and gone quiet, so the 3D library never competes with the first paint
    var settled = new Promise(function (res) {
        function idle() { setTimeout(function () { (window.requestIdleCallback || setTimeout)(res, { timeout: 1500 }); }, 1200); }
        if (document.readyState === "complete") idle(); else window.addEventListener("load", idle, { once: true });
    });
    function loadModels() {
        if (!modP) modP = settled.then(function () { return import("./projects3d.js"); });
        return modP;
    }

    Array.prototype.forEach.call(cards, function (card) {
        var viewer = card.querySelector("[data-model]");
        var video = card.querySelector("video");
        var tabs = card.querySelectorAll("[data-show]");
        var tools = card.querySelector(".built-tools");
        var ctl = null, mounting = false, onScreen = false;

        // 3D model / video switch
        function show(which) {
            Array.prototype.forEach.call(tabs, function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-show") === which)); });
            var model = which === "model";
            if (viewer) viewer.hidden = !model;
            if (tools) tools.hidden = !model || !ctl;
            if (video) {
                video.hidden = model;
                if (model) video.pause();
                else {
                    var p = video.play();
                    if (p && p.catch) p.catch(function () {});
                }
            }
            if (ctl) ctl.setVisible(model && onScreen);
        }
        Array.prototype.forEach.call(tabs, function (b) {
            b.addEventListener("click", function () { show(b.getAttribute("data-show")); });
        });

        if (!viewer || !canGL) return;
        var hint = viewer.querySelector(".viewer-hint");

        function mount() {
            if (mounting) return;
            mounting = true;
            viewer.classList.add("is-loading");
            loadModels().then(function (m) {
                ctl = m.mount(viewer, viewer.getAttribute("data-model"));
                viewer.classList.remove("is-loading");
                viewer.classList.add("is-live");
                if (tools) tools.hidden = viewer.hidden;
                ctl.setVisible(onScreen && !viewer.hidden);
                if (ctl.kind === "plant") {
                    var pstatus = card.querySelector("[data-plant-status]");
                    var dryBtn = tools && tools.querySelector('[data-act="dry"]');
                    var words = {
                        idle: "All five plants are healthy. Press Dry out a pot to watch it water itself.",
                        drying: "Plant 3 is drying out. Its probe reads lower every two seconds.",
                        needs: "Plant 3 dropped below 35%: Needs Water. The Mega clicks the relay on.",
                        pump: "The pump pushes water up into the PVC line, and every pot gets a drip.",
                        soak: "Watered. It waits 30 minutes for the water to soak in before checking again."
                    };
                    ctl.onState = function (s) {
                        if (pstatus) pstatus.textContent = words[s] || words.idle;
                        if (dryBtn) dryBtn.disabled = s !== "idle" && s !== "soak";
                    };
                }
                if (ctl.kind === "cyberdeck") {
                    var status = card.querySelector("[data-deck-status]");
                    ctl.onState = function (s) {
                        if (status) status.textContent = s === "yes" ? "YES pressed: the meeting is accepted and added to the calendar."
                            : s === "no" ? "NO pressed: it politely asks for another time."
                            : "A meeting request is waiting. Press YES or NO.";
                    };
                }
            }).catch(function () {
                viewer.classList.remove("is-loading");
                mounting = false;
            });
        }

        // tool buttons
        if (tools) {
            tools.addEventListener("click", function (e) {
                var b = e.target.closest("button");
                if (!b || !ctl) return;
                var act = b.getAttribute("data-act");
                if (act === "dry") ctl.runCycle();
                else if (act === "readings") {
                    var shown = b.getAttribute("aria-pressed") !== "true";
                    b.setAttribute("aria-pressed", String(shown));
                    ctl.setBadges(shown);
                } else if (act === "explode" || act === "lights" || act === "flow") {
                    var on = b.getAttribute("aria-pressed") !== "true";
                    b.setAttribute("aria-pressed", String(on));
                    if (act === "explode") ctl.setExplode(on);
                    if (act === "lights") ctl.setLights(on);
                    if (act === "flow") ctl.setFlow(on);
                } else if (act === "yes" || act === "no") ctl.answer(act === "yes");
                else if (act === "in") ctl.zoom(0.85);
                else if (act === "out") ctl.zoom(1 / 0.85);
                else if (act === "reset") ctl.reset();
            });
        }
        viewer.addEventListener("pointerdown", function () { if (hint) hint.classList.add("gone"); }, { once: true });

        if ("IntersectionObserver" in window) {
            new IntersectionObserver(function (entries) {
                entries.forEach(function (en) {
                    onScreen = en.isIntersecting;
                    if (onScreen) mount();
                    if (ctl) ctl.setVisible(onScreen && !viewer.hidden);
                });
            }, { rootMargin: "100px 0px" }).observe(viewer);
        } else {
            onScreen = true; mount();
        }
        document.addEventListener("visibilitychange", function () {
            if (ctl) ctl.setVisible(!document.hidden && onScreen && !viewer.hidden);
        });
    });
})();
