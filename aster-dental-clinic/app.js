const WA_NUMBER = ""; // Clinic WhatsApp number, digits only with country code. Empty until the clinic confirms it.

// Aster Dental Clinic — concept preview. Vanilla JS, no network calls, nothing is sent anywhere.
(function () {
  var WA_TEXT = "Hello, I'd like to book an appointment at Aster Dental Clinic.";

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
})();
