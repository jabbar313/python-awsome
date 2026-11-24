/*
  Onyx Eye Clinic, concept preview.

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
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

  function pop(el) {
    if (window.gsap && !reduceMotion && el) {
      gsap.fromTo(el, { y: 8, scale: 0.98 }, { y: 0, scale: 1, duration: 0.6, ease: "expo.out", immediateRender: false });
    }
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

  /* ---------- Scroll reveals ----------
     Everything is visible by default (no opacity:0 in markup or CSS).
     GSAP only hides an element at the moment its reveal starts (immediateRender:false),
     and a 2.6s safety net forces every element back to fully visible. */

  function forceShow(el) {
    if (window.gsap && gsap.isTweening(el)) return;
    if (window.gsap) {
      gsap.set(el, { clearProps: "opacity,visibility,transform" });
    } else {
      el.style.opacity = "";
      el.style.visibility = "";
      el.style.transform = "";
    }
  }

  function reveal(el, delay) {
    gsap.fromTo(el,
      { autoAlpha: 0, y: 32 },
      { autoAlpha: 1, y: 0, duration: 1, delay: delay || 0, ease: "expo.out", immediateRender: false,
        onComplete: function () { gsap.set(el, { clearProps: "opacity,visibility,transform" }); } });
    setTimeout(function () { forceShow(el); }, 2600 + (delay || 0) * 1000);
  }

  function wireReveals() {
    var items = Array.prototype.slice.call(document.querySelectorAll("[data-reveal]"));
    if (reduceMotion || !window.gsap || !("IntersectionObserver" in window)) return;

    var vh = window.innerHeight || document.documentElement.clientHeight;
    var pending = items.filter(function (el) {
      // Leave anything already on screen alone, so nothing visible ever blinks.
      return el.getBoundingClientRect().top > vh;
    });

    var io = new IntersectionObserver(function (entries) {
      var batch = entries.filter(function (e) { return e.isIntersecting; });
      batch.forEach(function (entry, i) {
        io.unobserve(entry.target);
        reveal(entry.target, i * 0.08);
      });
    }, { rootMargin: "0px 0px 6% 0px", threshold: 0 });

    pending.forEach(function (el) { io.observe(el); });

    // Global safety net: after 2.6s nothing may stay hidden or offset.
    setTimeout(function () { items.forEach(forceShow); }, 2600);
    window.addEventListener("beforeprint", function () { items.forEach(forceShow); });
  }

  function wireHeroImage() {
    var img = document.querySelector(".hero-img");
    if (!img || reduceMotion || !window.gsap) return;
    gsap.fromTo(img, { scale: 1.06 }, { scale: 1, duration: 2.4, ease: "power3.out", immediateRender: false });
  }

  function init() {
    wireLinks();
    wireComposer();
    wireForm();
    wireDays();
    wireHeader();
    wireHeroImage();
    wireReveals();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
