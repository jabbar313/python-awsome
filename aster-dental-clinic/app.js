const WA_NUMBER = ""; // Clinic WhatsApp number, digits only with country code. Empty until the clinic confirms it.

// Aster Dental Clinic — concept preview v2. Vanilla JS, no network calls, nothing is sent anywhere.
(function () {
  var WA_TEXT = "Hello, I'd like to book an appointment at Aster Dental Clinic.";
  var reduce = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };

  // WhatsApp links: the HTML already carries https://wa.me/?text=... so they work without JS.
  // Once WA_NUMBER is filled in, point every booking link at the clinic's chat.
  var number = String(WA_NUMBER).replace(/\D/g, "");
  if (number) {
    var href = "https://wa.me/" + number + "?text=" + encodeURIComponent(WA_TEXT);
    document.querySelectorAll("a.wa-link").forEach(function (a) { a.href = href; });
  }

  // Header shadow once the page has scrolled.
  var header = document.querySelector(".site-header");
  if (header) {
    var onScroll = function () { header.classList.toggle("is-scrolled", window.scrollY > 8); };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  // Scroll reveal. Nothing is hidden in CSS: content renders fully without JS. Each item plays one short
  // Web Animation as it enters the viewport; a 2.6 s safety net finishes any that are still running.
  if (!reduce.matches && "IntersectionObserver" in window && Element.prototype.animate) {
    var running = [];
    var play = function (el) {
      var delay = parseFloat(el.getAttribute("data-reveal")) || 0;
      running.push(el.animate(
        [{ opacity: 0, transform: "translateY(26px)" }, { opacity: 1, transform: "none" }],
        { duration: 900, delay: delay, easing: "cubic-bezier(.22,.8,.24,1)", fill: "backwards" }
      ));
    };
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { io.unobserve(e.target); play(e.target); }
      });
    }, { rootMargin: "0px 0px -6% 0px" });
    document.querySelectorAll("[data-reveal]").forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.bottom > 0 && r.left < window.innerWidth && r.bottom - r.height < window.innerHeight) play(el);
      else io.observe(el);
    });
    setTimeout(function () {
      running.forEach(function (a) { if (a.playState === "running" || a.playState === "pending") a.finish(); });
    }, 2600);
  }

  var root = document.querySelector("[data-carousel]");
  if (root) carousel(root);

  // Treatments carousel. Base is a CSS scroll-snap row (swipe and scroll work with no JS).
  // JS adds previous/next, dots, Left/Right keys, mouse/pen drag (pointer events), and autoplay
  // that pauses on hover and on focus, stops when the user navigates, and never starts under reduced motion.
  function carousel(root) {
    var track = root.querySelector(".car-track");
    var slides = [].slice.call(root.querySelectorAll(".slide"));
    var dots = [].slice.call(root.querySelectorAll(".car-dot"));
    var controls = root.querySelector(".car-controls");
    var toggle = root.querySelector(".car-toggle");
    var toggleLabel = toggle.querySelector(".car-toggle-label");
    var toggleIcon = toggle.querySelector("use");
    var status = root.querySelector(".car-status");
    var DELAY = 6000;
    var index = 0, timer = null, locked = false, lockTimer = 0, lockAt = 0, raf = 0;
    var playing = !reduce.matches;
    var hovering = false, focused = false, inView = true;

    controls.hidden = false;
    root.classList.add("is-enhanced");

    var name = function (i) { return slides[i].getAttribute("aria-label"); };
    var padStart = function () { return parseFloat(getComputedStyle(track).paddingLeft) || 0; };
    var targetFor = function (i) {
      return track.scrollLeft + slides[i].getBoundingClientRect().left - track.getBoundingClientRect().left - padStart();
    };

    function mark(i) {
      index = i;
      dots.forEach(function (d, n) {
        if (n === i) d.setAttribute("aria-current", "true"); else d.removeAttribute("aria-current");
      });
      slides.forEach(function (s, n) { s.classList.toggle("is-active", n === i); });
    }

    function announce() { status.textContent = "Showing " + name(index); }

    function go(i, byUser) {
      i = (i + slides.length) % slides.length;
      var instant = reduce.matches;
      locked = true;
      clearTimeout(lockTimer);
      lockTimer = setTimeout(unlock, instant ? 120 : 1600);
      lockAt = Math.max(0, Math.min(targetFor(i), track.scrollWidth - track.clientWidth));
      track.scrollTo({ left: lockAt, behavior: instant ? "instant" : "smooth" });
      mark(i);
      if (byUser) { stop(); announce(); }
    }

    // While a programmatic scroll runs, ignore scroll events; release once the row has landed on the target
    // (a late scrollend from an earlier drag step must not release it early), or on a fallback timer.
    function unlock() {
      if (!locked) return;
      locked = false;
      clearTimeout(lockTimer);
      track.classList.remove("is-dragging"); // snap back on only once the drag's glide has landed
      sync();
    }
    track.addEventListener("scrollend", function () { if (Math.abs(track.scrollLeft - lockAt) < 2) unlock(); });

    // Keep the active dot in step with native swipes and scrolling.
    function sync() {
      raf = 0;
      if (locked) return;
      var max = track.scrollWidth - track.clientWidth;
      var i = 0;
      if (track.scrollLeft >= max - 4) i = slides.length - 1;
      else {
        var near = Infinity;
        slides.forEach(function (s, n) {
          var d = Math.abs(targetFor(n) - track.scrollLeft);
          if (d < near) { near = d; i = n; }
        });
      }
      if (i !== index) { mark(i); stop(); announce(); }
    }
    track.addEventListener("scroll", function () { if (!raf) raf = requestAnimationFrame(sync); }, { passive: true });

    // Autoplay
    function tick() { go(index + 1, false); }
    function update() {
      var run = playing && !hovering && !focused && inView && !document.hidden;
      if (run && !timer) timer = setInterval(tick, DELAY);
      if (!run && timer) { clearInterval(timer); timer = null; }
      status.setAttribute("aria-live", timer ? "off" : "polite");
    }
    function setPlaying(on) {
      playing = on;
      toggleLabel.textContent = on ? "Pause" : "Play";
      toggleIcon.setAttribute("href", on ? "#i-pause" : "#i-play");
      update();
    }
    function stop() { if (playing) setPlaying(false); }

    toggle.addEventListener("click", function () { setPlaying(!playing); });
    root.querySelector(".car-prev").addEventListener("click", function () { go(index - 1, true); });
    root.querySelector(".car-next").addEventListener("click", function () { go(index + 1, true); });
    dots.forEach(function (d, n) { d.addEventListener("click", function () { go(n, true); }); });

    root.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        go(index + (e.key === "ArrowRight" ? 1 : -1), true);
      }
    });
    root.addEventListener("mouseenter", function () { hovering = true; update(); });
    root.addEventListener("mouseleave", function () { hovering = false; update(); });
    root.addEventListener("focusin", function () { focused = true; update(); });
    root.addEventListener("focusout", function (e) { if (!root.contains(e.relatedTarget)) { focused = false; update(); } });
    document.addEventListener("visibilitychange", update);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (en) { inView = en[0].isIntersecting; update(); }, { threshold: 0.35 }).observe(root);
    }

    // Pointer events: touch keeps native scroll-snap swiping; a mouse or pen drag swipes one slide.
    var drag = null;
    track.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "touch" || e.button !== 0) return;
      drag = { x: e.clientX, left: track.scrollLeft, moved: false, id: e.pointerId };
    });
    track.addEventListener("pointermove", function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) > 6) {
        drag.moved = true;
        track.classList.add("is-dragging");
        track.setPointerCapture(e.pointerId);
      }
      if (drag.moved) track.scrollLeft = drag.left - dx;
    });
    var end = function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x, moved = drag.moved;
      drag = null;
      if (!moved) return;
      var step = Math.abs(dx) > 50 ? (dx < 0 ? 1 : -1) : 0;
      go(index + step, true);
    };
    track.addEventListener("pointerup", end);
    track.addEventListener("pointercancel", end);

    mark(0);
    setPlaying(playing);
  }
})();
