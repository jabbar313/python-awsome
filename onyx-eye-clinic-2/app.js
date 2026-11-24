/*
  Onyx Eye Clinic, concept preview (sample 2). Plain vanilla JavaScript, no libraries.

  WHATSAPP NUMBER
  Set the clinic's WhatsApp number here once it is confirmed: digits only, with the
  country code and no "+" or spaces (India numbers start with 91).
  While it is empty, every WhatsApp button opens https://wa.me/?text=<message>, so the
  visitor picks the chat in WhatsApp. Nothing is ever sent from this page: no form
  posts, no network calls, nothing stored.
*/
const WA_NUMBER = "";

(function () {
  "use strict";

  var MESSAGES = {
    book: "Hello, I'd like to book an appointment with Dr. Kamat.",
    question: "Hello, I have a question for Onyx Eye Clinic."
  };

  var NOTES = {
    open: "This only opens WhatsApp with the message ready. You choose the chat and press send yourself.",
    clinic: "This opens a WhatsApp chat with the clinic with the message ready. Nothing is sent until you press send yourself."
  };

  var digits = String(WA_NUMBER).replace(/\D/g, "");
  var reduceMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
  var reduceMotion = reduceMQ.matches;

  function waLink(message) {
    var text = encodeURIComponent(message || MESSAGES.book)
      .replace(/'/g, "%27")
      .replace(/\(/g, "%28")
      .replace(/\)/g, "%29");
    return "https://wa.me/" + digits + "?text=" + text;
  }

  function messageFor(el) {
    var key = el.getAttribute("data-wa");
    return MESSAGES[key] || el.getAttribute("data-wa-text") || MESSAGES.book;
  }

  function setWa(el, message) {
    if (message) el.setAttribute("data-wa-text", message);
    el.setAttribute("href", waLink(messageFor(el)));
  }

  // Small feedback nudge, native Web Animations API (not a library).
  function pop(el) {
    if (reduceMotion || !el || !el.animate) return;
    el.animate(
      [{ transform: "translateY(6px)", opacity: 0.65 }, { transform: "none", opacity: 1 }],
      { duration: 420, easing: "cubic-bezier(0.32,0.72,0,1)" }
    );
  }

  /* ---------- WhatsApp links ---------- */
  function wireLinks() {
    document.querySelectorAll("[data-wa]").forEach(function (a) { setWa(a); });
  }

  /* ---------- Message chooser (builds a wa.me link, sends nothing) ---------- */
  function wireComposer() {
    var text = document.getElementById("composer-text");
    var link = document.getElementById("composer-link");
    var note = document.getElementById("composer-note");
    var toggles = document.querySelectorAll("[data-msg]");
    if (!text || !link) return;

    if (note) note.textContent = digits ? NOTES.clinic : NOTES.open;

    toggles.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var key = btn.getAttribute("data-msg");
        toggles.forEach(function (b) {
          var on = b === btn;
          b.classList.toggle("is-active", on);
          b.setAttribute("aria-pressed", on ? "true" : "false");
        });
        text.textContent = MESSAGES[key];
        link.setAttribute("data-wa", key);
        setWa(link);
        pop(text.parentNode);
      });
    });
  }

  /* ---------- Request form: preview only. No action, no fetch, nothing stored.
     Submitting only writes a WhatsApp message and builds a wa.me link. ---------- */
  function wireForm() {
    var form = document.getElementById("request-form");
    var submit = document.getElementById("rf-submit");
    var result = document.getElementById("form-result");
    var out = document.getElementById("form-result-text");
    var link = document.getElementById("form-wa");
    if (!form || !submit || !result || !out || !link) return;

    // The submit button ships disabled, so with JavaScript off the form cannot submit at all.
    submit.disabled = false;

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = document.getElementById("rf-name").value.trim();
      var day = document.getElementById("rf-day").value;
      var msg = document.getElementById("rf-msg").value.trim();
      var lines = [MESSAGES.book];
      if (name) lines.push("Name: " + name);
      lines.push("Preferred day: " + day);
      if (msg) lines.push("Message: " + msg);
      var message = lines.join("\n");
      out.textContent = message;
      setWa(link, message);
      result.hidden = false;
      pop(result);
    });
  }

  /* ---------- Choose a day: no availability, no booking. Builds a wa.me link only. ---------- */
  function wireDays() {
    var radios = document.querySelectorAll('input[name="visit-day"]');
    var text = document.getElementById("day-text");
    var link = document.getElementById("day-link");
    var name = document.getElementById("day-name");
    if (!radios.length || !text || !link) return;

    function update(day) {
      var message = "I'd like to book on " + day + ", between 8:30 am and 6:30 pm.";
      text.textContent = message;
      if (name) name.textContent = day;
      setWa(link, message);
    }

    radios.forEach(function (r) {
      r.addEventListener("change", function () {
        if (r.checked) { update(r.value); pop(text.parentNode); }
      });
      if (r.checked) update(r.value);
    });
  }

  /* ---------- Header state (IntersectionObserver, no scroll listener) ---------- */
  function wireHeader() {
    var header = document.getElementById("header");
    var hero = document.getElementById("home");
    if (!header || !hero || !("IntersectionObserver" in window)) return;
    var io = new IntersectionObserver(function (entries) {
      header.classList.toggle("is-scrolled", entries[0].intersectionRatio < 0.85);
    }, { threshold: [0, 0.85, 1] });
    io.observe(hero);
  }

  /* ---------- Scroll reveals (vanilla) ----------
     Everything is visible by default (no opacity:0 in markup or CSS). JS sets the start
     state inline only on elements still below the fold, animates them in on view, and a
     2.6s safety net clears every inline style so nothing can stay hidden. */
  function wireReveals() {
    if (reduceMotion || !("IntersectionObserver" in window)) return;
    var items = Array.prototype.slice.call(document.querySelectorAll("[data-reveal]"));
    var vh = window.innerHeight || document.documentElement.clientHeight;
    var pending = items.filter(function (el) { return el.getBoundingClientRect().top > vh * 0.9; });

    pending.forEach(function (el) {
      el.style.transition = "none";
      el.style.opacity = "0";
      el.style.transform = "translateY(28px)";
    });
    // Re-enable transitions a frame later so the reveal animates rather than snapping.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { pending.forEach(function (el) { el.style.transition = ""; }); });
    });

    var io = new IntersectionObserver(function (entries) {
      entries.filter(function (e) { return e.isIntersecting; }).forEach(function (e, i) {
        io.unobserve(e.target);
        var el = e.target;
        el.style.transitionDelay = (Math.min(i, 6) * 0.07) + "s";
        el.style.opacity = "1";
        el.style.transform = "none";
      });
    }, { rootMargin: "0px 0px -6% 0px", threshold: 0 });
    pending.forEach(function (el) { io.observe(el); });

    function clearAll() {
      items.forEach(function (el) {
        el.style.transition = "none";
        el.style.opacity = "";
        el.style.transform = "";
        el.style.transitionDelay = "";
      });
    }
    setTimeout(clearAll, 2600);
    window.addEventListener("beforeprint", clearAll);
  }

  /* ---------- Hero iris: gentle parallax scale (transform only) ---------- */
  function wireHeroIris() {
    var iris = document.querySelector(".hero-iris");
    var hero = document.getElementById("home");
    if (!iris || !hero || reduceMotion) return;
    var ticking = false;
    function update() {
      ticking = false;
      var r = hero.getBoundingClientRect();
      var p = Math.min(Math.max(-r.top / (r.height || 1), 0), 1);
      iris.style.transform = "scale(" + (1 + 0.12 * p).toFixed(4) + ")";
    }
    window.addEventListener("scroll", function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }

  /* ====================================================================
     EVERY EYE IS DIFFERENT — the iris ring engine (change round 2).
     "One big eye moves around, then the others appear and make the circle; no eye
     ever touches another." Native scroll only: one requestAnimationFrame loop, active
     only near the section. We read a progress number p (0..1) across the pinned track
     and lerp a smoothed `current` toward it; render(p) is a pure function of p, so the
     whole story is reversible on scroll-up.
       A  p 0.00-0.40  only the lead eye (k = 0, blue) is visible, about 2.5x ring size,
                       drifting clockwise round a lazy loop about the ring centre with a
                       slight iris turn. The other nine are opacity 0 AND scale 0. The
                       title is hidden, so the big eye never covers text.
       B  p 0.40-0.55  the lead eye shrinks to ring size while gliding into its own slot
                       (the top of the ring).
       C  p 0.55-0.85  the other nine appear one after another, clockwise from the lead
                       eye, each growing in on its own spoke from 1.1 R to R, so it never
                       crosses a neighbour. The title fades in (p 0.56-0.68) once the
                       lead eye is home.
       D  p 0.85-1.00  calm hold on the finished ring (one pupil breath).
     The big eye's size and loop are fitted to the measured stage, header and phone bar,
     so it stays fully on screen below the nav at any viewport. Only transform and
     opacity change: eye position/scale through the --x/--y/--a/--r/--s vars of the CSS
     transform, the iris turn as a transform on the inner svg, and the title's opacity.
     Reduced motion / no-JS keep the CSS finished ring (no html.iris-anim), and teardown
     clears the inline styles so the finished ring returns.
     ==================================================================== */

  var A_END = 0.40, B_END = 0.55;    // phase ends (A: big eye loops, B: it shrinks home)
  var C_STEP = 0.025, C_LEN = 0.10;  // eye k (1..9) grows in over p = 0.55 + 0.025(k-1) .. +0.10
  var DRIFT = 0.10;                  // ring eyes start 10% further out on their own spoke
  var BIG = 2.5;                     // lead eye size in phase A, as a multiple of the ring eye
  var LOOP_FROM = -250;              // lead eye angle at p = 0 (deg clockwise from the top slot)
  var TURN = 10;                     // slight iris turn (deg) while the big eye loops
  var TITLE_IN = 0.56, TITLE_LEN = 0.12;
  var BREATH_FROM = 0.86, BREATH_TO = 0.96;

  function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }
  function smoothstep(t) { t = clamp01(t); return t * t * (3 - 2 * t); }

  function setupIris() {
    var section = document.getElementById("iris-scroll");
    if (!section) return;
    var stage = section.querySelector(".iris-stage");
    var head = section.querySelector(".iris-head");
    var figs = Array.prototype.slice.call(section.querySelectorAll(".iris-fig"));
    if (!stage || !figs.length) return;

    var ks = figs.map(function (f, i) { var k = parseFloat(f.style.getPropertyValue("--k")); return isNaN(k) ? i : k; });
    var lead = figs[ks.indexOf(0)] || figs[0];
    var leadSvg = lead.querySelector(".iris");

    var anim = false, raf = 0, running = false, near = false;
    var current = 0, target = 0, geo = null;
    var io = null, scrollHandler = null;

    window.__irisFrames = 0;
    window.__irisRunning = false;
    window.__irisMode = "static";

    function wantsAnim() { return !reduceMQ.matches; }

    function progress() {
      var r = section.getBoundingClientRect();
      var denom = (r.height - window.innerHeight) || 1;
      return clamp01(-r.top / denom);
    }

    // Stage geometry in px (only on build and resize). The ring radius R is read from the lead
    // eye sitting in its CSS slot, so it always matches the finished ring exactly.
    function measure() {
      ["--x", "--y", "--a", "--r", "--s"].forEach(function (v) { lead.style.removeProperty(v); });
      var W = stage.clientWidth, H = stage.clientHeight;
      var d = lead.offsetWidth, cx = lead.offsetLeft, cy = lead.offsetTop;
      var sr = stage.getBoundingClientRect(), lr = lead.getBoundingClientRect();
      var R = (sr.top + cy) - (lr.top + lr.height / 2);
      // Safe band for the big eye: below the fixed banner + floating header, above the phone bar.
      var top = 0, bottom = H;
      var banner = document.querySelector(".concept-banner");
      var header = document.getElementById("header");
      var bar = document.querySelector(".mobile-bar");
      if (banner) top = banner.offsetHeight;
      if (header) top = Math.max(top, (parseFloat(getComputedStyle(header).top) || 0) + header.offsetHeight);
      if (bar && getComputedStyle(bar).display !== "none") bottom = H - bar.offsetHeight;
      var m = W < 700 ? 12 : 16;
      var big = Math.max(1, Math.min(BIG, 0.8 * Math.min(W - 2 * m, bottom - top - 2 * m) / (d || 1)));
      var rb = big * d / 2;
      geo = {
        R: R, big: big,
        ax: Math.max(0, Math.min(cx - m - rb, W - cx - m - rb, 1.2 * R)),
        ay: Math.max(0, Math.min(cy - top - m - rb, bottom - m - rb - cy, 1.2 * R))
      };
    }

    function render(p) {
      if (!geo) measure();
      // Lead eye: phases A + B, then parked in its CSS slot.
      if (p < B_END) {
        var ang = LOOP_FROM * (1 - smoothstep(p / B_END));     // deg, reaches 0 (its slot) at B_END
        var tb = smoothstep((p - A_END) / (B_END - A_END));   // 0 = big loop, 1 = ring slot
        var open = 0.45 + 0.55 * smoothstep(p / 0.30);        // the loop opens out from near the centre
        var ax = geo.ax * open, ay = geo.ay * open;
        ax += (geo.R - ax) * tb;
        ay += (geo.R - ay) * tb;
        var rad = ang * Math.PI / 180;
        lead.style.setProperty("--x", (ax * Math.sin(rad)).toFixed(2) + "px");
        lead.style.setProperty("--y", (-ay * Math.cos(rad)).toFixed(2) + "px");
        lead.style.setProperty("--a", "0deg");
        lead.style.setProperty("--r", "0px");
        lead.style.setProperty("--s", (geo.big + (1 - geo.big) * tb).toFixed(4));
        if (leadSvg) leadSvg.style.transform = "rotate(" + (TURN * ang / -LOOP_FROM).toFixed(2) + "deg)";
      } else {
        lead.style.setProperty("--x", "0px");
        lead.style.setProperty("--y", "0px");
        lead.style.setProperty("--a", "0deg");
        lead.style.setProperty("--r", "calc(1 * var(--R))");
        lead.style.setProperty("--s", "1");
        if (leadSvg) leadSvg.style.transform = "";
      }
      lead.style.opacity = "1";

      // The other nine: hidden through A and B, then each grows in at its own slot.
      for (var i = 0; i < figs.length; i++) {
        var fig = figs[i], k = ks[i];
        if (fig === lead) continue;
        var u = (p - (B_END + C_STEP * (k - 1))) / C_LEN;
        var e = smoothstep(u);
        fig.style.setProperty("--a", (36 * k) + "deg");
        fig.style.setProperty("--r", "calc(" + (1 + DRIFT * (1 - e)).toFixed(4) + " * var(--R))");
        fig.style.setProperty("--s", e.toFixed(4));
        fig.style.opacity = smoothstep(u / 0.6).toFixed(3);
      }

      if (head) head.style.opacity = smoothstep((p - TITLE_IN) / TITLE_LEN).toFixed(3);

      // Pupil "breath" on the finished ring: 1 -> 1.04 -> 1, a single sin hump.
      var bp = 1;
      if (p > BREATH_FROM && p < BREATH_TO) bp = 1 + 0.04 * Math.sin((p - BREATH_FROM) / (BREATH_TO - BREATH_FROM) * Math.PI);
      stage.style.setProperty("--pupil-scale", bp.toFixed(4));
    }

    function frame() {
      target = progress();
      // Section far from the viewport: snap and stop, so the loop never spins off screen.
      if (!near) { current = target; render(current); window.__irisFrames++; running = false; window.__irisRunning = false; raf = 0; return; }
      current += (target - current) * 0.12;
      if (Math.abs(target - current) < 0.0005) current = target;
      render(current);
      window.__irisFrames++;
      if (Math.abs(target - current) < 0.0005) { running = false; window.__irisRunning = false; raf = 0; return; }
      raf = requestAnimationFrame(frame);
    }
    function start() { if (!running && anim) { running = true; window.__irisRunning = true; raf = requestAnimationFrame(frame); } }

    function clearStyles() {
      figs.forEach(function (f) {
        f.style.opacity = "";
        ["--x", "--y", "--a", "--r", "--s"].forEach(function (v) { f.style.removeProperty(v); });
        f.style.willChange = "";
      });
      if (leadSvg) leadSvg.style.transform = "";
      if (head) head.style.opacity = "";
      if (stage) stage.style.removeProperty("--pupil-scale");
      geo = null;
    }

    function teardown() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0; running = false; window.__irisRunning = false;
      if (io) { io.disconnect(); io = null; }
      if (scrollHandler) { window.removeEventListener("scroll", scrollHandler); scrollHandler = null; }
      document.documentElement.classList.remove("iris-anim");
      if (stage) stage.classList.remove("is-live");
      clearStyles();
      anim = false; window.__irisMode = "static";
    }

    function build() {
      if (!wantsAnim()) { window.__irisMode = "static"; return; }   // reduced motion -> static finished ring
      anim = true;
      document.documentElement.classList.add("iris-anim");
      window.__irisMode = "ring";
      measure();
      current = target = progress();
      render(current);                                        // first frame synchronously: no flash

      near = false;
      io = new IntersectionObserver(function (entries) {
        near = entries[0].isIntersecting;
        if (stage) stage.classList.toggle("is-live", near);    // will-change only while near
        if (near) start();
      }, { rootMargin: "100% 0px 100% 0px", threshold: 0 });
      io.observe(section);

      scrollHandler = function () { if (near) start(); };
      window.addEventListener("scroll", scrollHandler, { passive: true });
    }

    // Deterministic hook for the self-check: render an exact p (smoothing bypassed).
    window.__irisRenderAt = function (p) {
      if (!anim) return null;
      current = target = clamp01(p);
      render(current);
      return current;
    };

    build();

    // Width/height changes: re-fit the big eye's size and loop to the new stage. A reduced-motion
    // change needs a full rebuild.
    var resizeTimer = 0;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (wantsAnim() !== anim) { teardown(); build(); return; }
        if (anim) { measure(); render(current); }
      }, 200);
    });
    var onReduceChange = function () { teardown(); build(); };
    if (reduceMQ.addEventListener) reduceMQ.addEventListener("change", onReduceChange);
    else if (reduceMQ.addListener) reduceMQ.addListener(onReduceChange);
  }

  function init() {
    wireLinks();
    wireComposer();
    wireForm();
    wireDays();
    wireHeader();
    wireHeroIris();
    wireReveals();
    setupIris();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
