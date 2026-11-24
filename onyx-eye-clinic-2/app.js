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
     EVERY EYE IS DIFFERENT — the iris-scroll engine.
     One requestAnimationFrame loop, active only near the section. Native scroll only:
     we read a progress number p (0..1) and lerp a smoothed `current` toward it, then
     drive transforms/opacity. Nothing hijacks the scroll. On phones (or a coarse
     pointer) it steps one eye at a time and ends on a 3+2 grid. Reduced motion and
     no-JS keep the complete static layout.
     ==================================================================== */

  // Keyframe stops. p breakpoints, then per-eye {x(vw), y(vh), s(scale), r(deg), o(opacity)}.
  var P = [0, 0.12, 0.32, 0.55, 0.78, 0.92];
  var KF = {
    // enters centred, grows in, then slides left into the row
    blue:  { x: [0, 0, -9, -14, -17, -17], y: [0, 0, 1, 1, 1, 1], s: [0.70, 1.00, 0.92, 0.90, 0.90, 0.90], r: [0, 0, -4, -5, 0, 0], o: [0, 1, 1, 1, 1, 1] },
    // drifts in from the right during 0.12-0.32
    green: { x: [34, 34, 19, 18, 17, 17], y: [-3, -3, -1, 0, 1, 1], s: [0.62, 0.62, 0.84, 0.87, 0.90, 0.90], r: [9, 9, 4, 2, 0, 0], o: [0, 0, 1, 1, 1, 1] },
    // rises from below to the centre during 0.32-0.55 (the biggest, centre of the arc)
    hazel: { x: [0, 0, 0, 0, 0, 0], y: [36, 36, 36, -4, -4, -4], s: [0.70, 0.70, 0.70, 1.00, 1.00, 1.00], r: [0, 0, 0, 0, 0, 0], o: [0, 0, 0, 1, 1, 1] },
    // enters from the lower-left corner during 0.55-0.78
    brown: { x: [-40, -40, -40, -40, -34, -34], y: [34, 34, 34, 34, 5, 5], s: [0.60, 0.60, 0.60, 0.60, 0.82, 0.82], r: [-11, -11, -11, -11, 0, 0], o: [0, 0, 0, 0, 1, 1] },
    // enters from the lower-right corner during 0.55-0.78
    grey:  { x: [40, 40, 40, 40, 34, 34], y: [34, 34, 34, 34, 5, 5], s: [0.60, 0.60, 0.60, 0.60, 0.82, 0.82], r: [11, 11, 11, 11, 0, 0], o: [0, 0, 0, 0, 1, 1] }
  };
  // Text beats: fade windows [inStart, inEnd, outStart, outEnd] per line (1-indexed by data-beat).
  var BEATS = {
    1: [0.14, 0.19, 0.29, 0.34],
    2: [0.37, 0.42, 0.52, 0.57],
    3: [0.59, 0.64, 0.73, 0.78],
    4: [0.80, 0.85, 1.01, 1.02]
  };

  function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }
  function smoothstep(t) { t = clamp01(t); return t * t * (3 - 2 * t); }
  function beatOpacity(p, w) {
    if (p < w[0] || p > w[3]) return 0;
    if (p < w[1]) return smoothstep((p - w[0]) / (w[1] - w[0]));
    if (p <= w[2]) return 1;
    return smoothstep(1 - (p - w[2]) / (w[3] - w[2]));
  }
  function sampleField(arr, p) {
    if (p <= P[0]) return arr[0];
    if (p >= P[P.length - 1]) return arr[arr.length - 1];
    for (var i = 0; i < P.length - 1; i++) {
      if (p <= P[i + 1]) {
        var t = smoothstep((p - P[i]) / (P[i + 1] - P[i]));
        return arr[i] + (arr[i + 1] - arr[i]) * t;
      }
    }
    return arr[arr.length - 1];
  }

  function setupIris() {
    var section = document.getElementById("iris-scroll");
    if (!section) return;
    var stage = section.querySelector(".iris-stage");
    var head = section.querySelector(".iris-head");
    var figs = Array.prototype.slice.call(section.querySelectorAll(".iris-fig"));
    var lines = Array.prototype.slice.call(section.querySelectorAll(".iris-line"));
    var figMap = {};
    figs.forEach(function (f) { figMap[f.getAttribute("data-iris")] = f; });

    var mode = null;          // 'desktop' | 'mobile' | null (static)
    var raf = 0, running = false, near = false;
    var current = 0, target = 0;
    var io = null, scrollHandler = null;
    var lastIdx = -1, lastGrid = null;

    window.__irisFrames = 0;
    window.__irisRunning = false;
    window.__irisMode = "static";

    function pickMode() {
      if (reduceMQ.matches) return null;
      var coarse = window.matchMedia("(pointer: coarse)").matches;
      // Width is the primary signal; a coarse pointer also opts into the stepping mode.
      if (window.innerWidth < 700 || coarse) return "mobile";
      return "desktop";
    }

    function progress() {
      var r = section.getBoundingClientRect();
      var denom = (r.height - window.innerHeight) || 1;
      return clamp01(-r.top / denom);
    }

    function renderDesktop(p) {
      for (var name in KF) {
        if (!KF.hasOwnProperty(name)) continue;
        var kf = KF[name], f = figMap[name];
        if (!f) continue;
        var x = sampleField(kf.x, p), y = sampleField(kf.y, p), s = sampleField(kf.s, p),
            rot = sampleField(kf.r, p), o = sampleField(kf.o, p);
        f.style.opacity = o.toFixed(3);
        f.style.transform = "translate(-50%,-50%) translate3d(" + x.toFixed(2) + "vw," + y.toFixed(2) + "vh,0) scale(" + s.toFixed(3) + ") rotate(" + rot.toFixed(2) + "deg)";
        var cap = f.lastElementChild;           // figcaption
        var co = p >= 0.76 ? smoothstep((p - 0.76) / 0.09) : 0;
        if (cap) cap.style.opacity = co.toFixed(3);
      }
      if (head) head.style.opacity = "1";   // section title stays as a calm anchor
      lines.forEach(function (ln) {
        var b = BEATS[ln.getAttribute("data-beat")];
        var o = b ? beatOpacity(p, b) : 1;
        ln.style.opacity = o.toFixed(3);
        ln.style.transform = "translateX(-50%) translateY(" + ((1 - o) * 12).toFixed(1) + "px)";
      });
      // One-time pupil "breath" as the eyes settle (0.78-0.94). Reversible, calm.
      var bp = 1;
      if (p > 0.78 && p < 0.94) bp = 1 + 0.04 * Math.sin((p - 0.78) / 0.16 * Math.PI * 2);
      stage.style.setProperty("--pupil-scale", bp.toFixed(4));
    }

    function renderMobile(p) {
      var grid = p >= 0.9;
      if (grid !== lastGrid) { section.classList.toggle("show-grid", grid); lastGrid = grid; }
      if (grid) {
        if (lastIdx !== 99) { figs.forEach(function (f) { f.style.opacity = "1"; }); lastIdx = 99; }
      } else {
        var idx = Math.min(4, Math.floor(p / 0.2 + 0.0001));
        if (idx !== lastIdx) {
          figs.forEach(function (f, i) { f.style.opacity = i === idx ? "1" : "0"; });
          lastIdx = idx;
        }
      }
      var lineIdx = p < 0.22 ? 0 : p < 0.45 ? 1 : p < 0.68 ? 2 : 3;
      lines.forEach(function (ln, i) { ln.style.opacity = i === lineIdx ? "1" : "0"; });
      if (head) head.style.opacity = "1";
    }

    function render(p) {
      if (mode === "desktop") renderDesktop(p);
      else if (mode === "mobile") renderMobile(p);
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
    function start() { if (!running && mode) { running = true; window.__irisRunning = true; raf = requestAnimationFrame(frame); } }

    function clearStyles() {
      figs.forEach(function (f) {
        f.style.opacity = ""; f.style.transform = "";
        if (f.lastElementChild) f.lastElementChild.style.opacity = "";
      });
      lines.forEach(function (ln) { ln.style.opacity = ""; ln.style.transform = ""; });
      if (head) head.style.opacity = "";
      if (stage) stage.style.removeProperty("--pupil-scale");
      section.classList.remove("show-grid");
    }

    function teardown() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0; running = false; window.__irisRunning = false;
      if (io) { io.disconnect(); io = null; }
      if (scrollHandler) { window.removeEventListener("scroll", scrollHandler); scrollHandler = null; }
      document.documentElement.classList.remove("iris-anim");
      section.removeAttribute("data-mode");
      clearStyles();
      lastIdx = -1; lastGrid = null;
      mode = null; window.__irisMode = "static";
    }

    function build() {
      mode = pickMode();
      if (!mode) { window.__irisMode = "static"; return; }   // reduced motion / unsupported -> static
      document.documentElement.classList.add("iris-anim");
      section.setAttribute("data-mode", mode);
      window.__irisMode = mode;
      current = target = progress();
      render(current);                                        // first frame synchronously: no flash

      near = false;
      io = new IntersectionObserver(function (entries) {
        near = entries[0].isIntersecting;
        if (near) start();
      }, { rootMargin: "100% 0px 100% 0px", threshold: 0 });
      io.observe(section);

      scrollHandler = function () { if (near) start(); };
      window.addEventListener("scroll", scrollHandler, { passive: true });
    }

    // Deterministic hook for the self-check: render an exact p and report values.
    window.__irisRenderAt = function (p) {
      if (!mode) return null;
      current = target = clamp01(p);
      render(current);
      return current;
    };

    build();

    // Rebuild on viewport changes that flip desktop <-> mobile, and on reduced-motion toggles.
    var resizeTimer = 0;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        var want = pickMode();
        if (want !== mode) { teardown(); build(); }
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
