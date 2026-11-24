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
     EVERY EYE IS DIFFERENT — the iris ring engine (DESIGN-BRIEF-v3-changes Part 2).
     Native scroll only: one requestAnimationFrame loop, active only near the section.
     We read a progress number p (0..1) across the section, lerp a smoothed `current`
     toward it, and for each of the ten eyes drive its polar values — angle --a, radius
     --r (as a multiple of the CSS --R) and scale --s, plus opacity. Interpolating the
     polar values (not x/y) makes each eye fly in along a gentle spiral. ONE mode for
     both widths; only the start-radius factor differs. Reduced motion / no-JS keep the
     CSS finished ring (no html.iris-anim), and teardown clears the inline styles so the
     finished ring returns.
     ==================================================================== */

  var START_LEAD = 60;      // degrees "behind" the final slot at the start
  var WIN_LEN = 0.26;       // each eye's travel window length
  var T0_BASE = 0.04, T0_STEP = 0.07;  // eye k starts at p = 0.04 + 0.07k
  var FADE = 0.08;          // opacity ramp length
  var RING_DONE = 0.93;     // ring complete here; the last 7% holds still

  function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }
  function smoothstep(t) { t = clamp01(t); return t * t * (3 - 2 * t); }

  function setupIris() {
    var section = document.getElementById("iris-scroll");
    if (!section) return;
    var stage = section.querySelector(".iris-stage");
    var figs = Array.prototype.slice.call(section.querySelectorAll(".iris-fig"));
    if (!stage || !figs.length) return;

    var anim = false, raf = 0, running = false, near = false;
    var current = 0, target = 0;
    var io = null, scrollHandler = null;

    window.__irisFrames = 0;
    window.__irisRunning = false;
    window.__irisMode = "static";

    function wantsAnim() { return !reduceMQ.matches; }
    // Start radius: 1.60 R on desktop, 1.45 R on phones (the one width-dependent constant).
    function r0Factor() { return window.innerWidth < 700 ? 1.45 : 1.60; }

    function progress() {
      var r = section.getBoundingClientRect();
      var denom = (r.height - window.innerHeight) || 1;
      return clamp01(-r.top / denom);
    }

    function render(p) {
      var f0 = r0Factor();
      for (var i = 0; i < figs.length; i++) {
        var fig = figs[i];
        var k = parseFloat(fig.style.getPropertyValue("--k"));
        if (isNaN(k)) k = i;
        var t0 = T0_BASE + T0_STEP * k;
        var e = smoothstep(clamp01((p - t0) / WIN_LEN));
        var a = (36 * k - START_LEAD) + START_LEAD * e;   // deg, ends at 36k
        var factor = f0 + (1 - f0) * e;                   // multiple of --R, ends at 1
        var s = 0.70 + 0.30 * e;
        var o = clamp01((p - t0) / FADE);
        fig.style.setProperty("--a", a.toFixed(2) + "deg");
        fig.style.setProperty("--r", "calc(" + factor.toFixed(4) + " * var(--R))");
        fig.style.setProperty("--s", s.toFixed(3));
        fig.style.opacity = o.toFixed(3);
      }
      // Pupil "breath" as the ring settles (0.80-0.93): 1 -> 1.04 -> 1, a single sin hump.
      var bp = 1;
      if (p > 0.80 && p < RING_DONE) bp = 1 + 0.04 * Math.sin((p - 0.80) / (RING_DONE - 0.80) * Math.PI);
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
        f.style.removeProperty("--a");
        f.style.removeProperty("--r");
        f.style.removeProperty("--s");
        f.style.willChange = "";
      });
      if (stage) stage.style.removeProperty("--pupil-scale");
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

    // Deterministic hook for the self-check: render an exact p and report values.
    window.__irisRenderAt = function (p) {
      if (!anim) return null;
      current = target = clamp01(p);
      render(current);
      return current;
    };

    build();

    // Width changes (desktop<->phone) are handled live by the CSS --R/--d vars and r0Factor();
    // only a reduced-motion change needs a rebuild.
    var resizeTimer = 0;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (wantsAnim() !== anim) { teardown(); build(); }
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
