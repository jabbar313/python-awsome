/* Tayhami Labs — page behaviour. Plain vanilla JS + GSAP; no build step.
   Content stays fully visible when JS or GSAP is unavailable. */
(() => {
  const EMAIL = 'info@tayhamilabs.in';

  // Header gains a rule once the page scrolls.
  const header = document.querySelector('.site-header');
  const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 40);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // The orb drifts toward the pointer on fine-pointer devices.
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const orb = document.querySelector('.hero__orb');
  if (orb && !reduce && matchMedia('(pointer: fine)').matches) {
    window.addEventListener('pointermove', (e) => {
      orb.style.setProperty('--mx', `${(e.clientX / innerWidth - 0.5) * 30}px`);
      orb.style.setProperty('--my', `${(e.clientY / innerHeight - 0.5) * 22}px`);
    }, { passive: true });
  }

  // Enquiry form: opens a prefilled email draft, as the production site does.
  const form = document.getElementById('enquiry');
  const note = document.getElementById('form-note');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const name = (data.get('name') || '').trim();
    const email = (data.get('email') || '').trim();
    if (!name || !/^\S+@\S+\.\S+$/.test(email)) {
      note.textContent = 'Please add your name and a valid email address.';
      return;
    }
    const profession = data.get('profession');
    const subject = encodeURIComponent(`New enquiry from ${name} (${profession})`);
    const body = encodeURIComponent(`Name: ${name}\nEmail: ${email}\nBusiness type: ${profession}\n\n${data.get('message') || ''}`);
    window.location.href = `mailto:${EMAIL}?subject=${subject}&body=${body}`;
    note.textContent = `We have opened a draft to ${EMAIL} with your details. Hit send and we will be in touch.`;
  });

  // Services rail: on wide screens the section pins and scroll drives the cards sideways.
  // Otherwise the rail stays a native horizontal scroller (phones, reduced motion, no JS).
  const railQuery = matchMedia('(min-width: 981px)');
  const railTrigger = document.getElementById('rail-trigger');
  const railViewport = railTrigger.querySelector('.rail-viewport');
  const railTrack = document.getElementById('service-rail');
  let railTravel = 0;
  let railFrame = 0;

  const pinnedRail = () => railQuery.matches && !reduce;
  const moveRail = () => {
    if (!pinnedRail() || !railTravel) return;
    const start = railTrigger.getBoundingClientRect().top + scrollY;
    const p = Math.min(1, Math.max(0, (scrollY - start) / railTravel));
    railTrack.style.transform = `translate3d(${Math.round(-railTravel * p)}px,0,0)`;
  };
  const measureRail = () => {
    railTrigger.classList.toggle('is-pinned', pinnedRail());
    railTrack.style.transform = '';
    railTrigger.style.height = '';
    railTravel = 0;
    if (!pinnedRail()) return;
    const lastCard = railTrack.lastElementChild.getBoundingClientRect();
    const endGap = parseFloat(getComputedStyle(railTrack).paddingRight);
    railTravel = Math.max(0, Math.ceil(lastCard.right + endGap - railViewport.getBoundingClientRect().right));
    railTrigger.style.height = `${innerHeight + railTravel}px`;
    moveRail();
  };
  window.addEventListener('scroll', () => {
    if (!railFrame) railFrame = requestAnimationFrame(() => { railFrame = 0; moveRail(); });
  }, { passive: true });
  window.addEventListener('resize', measureRail);
  railQuery.addEventListener('change', measureRail);
  measureRail();

  // Motion: only when GSAP has loaded. Elements are hidden by script, never by CSS,
  // and a 2.6s safety net force-shows anything still hidden.
  if (!window.gsap || reduce) return;
  const gsap = window.gsap;
  const heroIn = [...document.querySelectorAll('.hero__kicker, .hero__title, .hero__sub, .hero__actions, .hero__foot')];
  const reveals = [...document.querySelectorAll('.reveal')];
  const inView = (el) => el.getBoundingClientRect().top < innerHeight * 0.92;

  // Below-the-fold reveals start hidden and animate in once they scroll into view.
  const below = reveals.filter((el) => !inView(el));
  const shown = reveals.filter((el) => !below.includes(el));

  const forceShow = () => {
    gsap.killTweensOf([...heroIn, ...shown]);
    gsap.set([...heroIn, ...shown], { clearProps: 'opacity,transform' });
  };
  const safety = setTimeout(forceShow, 2600);

  gsap.fromTo(heroIn,
    { opacity: 0, y: 24 },
    { opacity: 1, y: 0, duration: 1.1, ease: 'power3.out', stagger: 0.12, delay: 0.15, immediateRender: false,
      onComplete: () => clearTimeout(safety) });

  gsap.set(below, { opacity: 0, y: 28 });
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      io.unobserve(entry.target);
      gsap.fromTo(entry.target,
        { opacity: 0, y: 28 },
        { opacity: 1, y: 0, duration: 1, ease: 'power3.out', immediateRender: false });
    });
  }, { rootMargin: '0px 0px -8% 0px' });
  below.forEach((el) => io.observe(el));
})();
