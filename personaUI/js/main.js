/* ============================================================
   KAEDE ARLOW — interaction layer
   Vanilla JS. GSAP/ScrollTrigger enhance if present, but the
   site is fully functional without them.
   ============================================================ */
(() => {
  const hasGSAP = typeof window.gsap !== 'undefined';
  if (hasGSAP && window.ScrollTrigger) gsap.registerPlugin(ScrollTrigger);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* ---------------------------------------------------------
     1. CUSTOM CURSOR (reticle) — follows pointer, reacts to hot zones
     --------------------------------------------------------- */
  const reticle = $('#reticle');
  if (reticle && !matchMedia('(max-width:760px)').matches) {
    let tx = innerWidth / 2, ty = innerHeight / 2, cx = tx, cy = ty;
    addEventListener('pointermove', e => { tx = e.clientX; ty = e.clientY; }, { passive: true });
    const ride = () => {
      cx += (tx - cx) * 0.25; cy += (ty - cy) * 0.25;
      reticle.style.transform = `translate(${cx}px,${cy}px)`;
      requestAnimationFrame(ride);
    };
    ride();
    const HOT = 'a,button,[data-tilt],.skill,.buy,.proj';
    addEventListener('pointerover', e => {
      if (e.target.closest(HOT)) reticle.classList.add('is-hot');
    });
    addEventListener('pointerout', e => {
      if (e.target.closest(HOT)) reticle.classList.remove('is-hot');
    });
    addEventListener('pointerdown', () => reticle.classList.add('is-hot'));
    addEventListener('pointerup',   () => reticle.classList.remove('is-hot'));
  }

  /* ---------------------------------------------------------
     2. SWIPE TRANSITION — Persona panel sweep
     --------------------------------------------------------- */
  const swipe = $('#swipe');
  const panels = $$('.swipe__panel', swipe);
  const swipeWord = $('.swipe__word', swipe);
  function runSwipe(midpoint) {
    return new Promise(resolve => {
      if (reduce || !hasGSAP) { midpoint && midpoint(); return resolve(); }
      const tl = gsap.timeline({ onComplete: resolve });
      tl.set(panels, { scaleX: 0 })
        .set(swipeWord, { opacity: 0, scale: 0.4, rotate: -12 })
        .to(panels, { scaleX: 1, duration: 0.34, stagger: 0.05, ease: 'power3.in' })
        .to(swipeWord, { opacity: 1, scale: 1, rotate: -8, duration: 0.18 }, '-=0.18')
        .add(() => midpoint && midpoint())
        .to(swipeWord, { opacity: 0, scale: 1.4, duration: 0.18, delay: 0.04 })
        .to(panels, {
          scaleX: 0, transformOrigin: 'right', duration: 0.32,
          stagger: 0.05, ease: 'power3.out'
        }, '-=0.05');
    });
  }

  /* ---------------------------------------------------------
     3. ENTER / TITLE screen → reveal site
     --------------------------------------------------------- */
  const enter = $('#enter');
  const nav = $('#nav');
  let entered = false;
  function doEnter() {
    if (entered) return; entered = true;
    runSwipe(() => {
      enter.classList.add('is-gone');
      document.body.style.overflow = '';
      nav.classList.add('is-live');
      heroIntro();
    });
  }
  $('#enterBtn')?.addEventListener('click', e => { e.stopPropagation(); doEnter(); });
  enter?.addEventListener('click', doEnter);

  // preview mode (?preview): skip title instantly for screenshots/deep-links
  const PREVIEW = location.search.includes('preview');
  if (PREVIEW) {
    entered = true;
    enter.classList.add('is-gone');
    nav.classList.add('is-live');
    document.documentElement.style.scrollBehavior = 'auto';
    if (location.search.includes('flat')) document.body.classList.add('preview-flat');
    const only = new URLSearchParams(location.search).get('only');
    if (only) $$('.section').forEach(s => { if (s.id !== only) s.style.display = 'none'; });
    // force final (revealed) state — IO/ScrollTrigger don't fire under headless capture
    $$('.skill, .proj, .buy, .stats').forEach(el => el.classList.add('is-in'));
    requestAnimationFrame(() => {
      document.body.style.overflow = '';
      if (location.hash) { const t = $(location.hash); t && t.scrollIntoView(); }
    });
  }
  addEventListener('keydown', e => {
    if (!entered && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); doEnter(); }
  });
  document.body.style.overflow = 'hidden';

  /* ---------------------------------------------------------
     4. HERO intro flourish
     --------------------------------------------------------- */
  function heroIntro() {
    if (reduce || !hasGSAP) return;
    gsap.from('.hero__copy > *', {
      y: 40, opacity: 0, skewX: -6, duration: 0.7,
      stagger: 0.09, ease: 'back.out(1.6)', delay: 0.1
    });
    gsap.from('.hero__card', { x: 80, opacity: 0, duration: 0.8, ease: 'power3.out', delay: 0.4 });
  }

  /* ---------------------------------------------------------
     5. NAV — smooth scroll w/ swipe + active highlighting
     --------------------------------------------------------- */
  $$('.nav__item a, [data-nav]').forEach(a => {
    a.addEventListener('click', e => {
      const id = a.getAttribute('href');
      if (!id || !id.startsWith('#')) return;
      e.preventDefault();
      const target = $(id);
      if (!target) return;
      runSwipe(() => target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }));
    });
  });

  // nav tab pulse on hover
  const sections = ['#hero', '#about', '#skills', '#work', '#shop', '#contact']
    .map(s => $(s)).filter(Boolean);
  const navLinks = $$('.nav__item a');
  const idToLink = Object.fromEntries(navLinks.map(l => [l.getAttribute('href'), l]));
  const navObserver = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      navLinks.forEach(l => l.classList.remove('is-active'));
      const link = idToLink['#' + en.target.id];
      link && link.classList.add('is-active');
    });
  }, { rootMargin: '-45% 0px -45% 0px' });
  sections.forEach(s => navObserver.observe(s));

  /* ---------------------------------------------------------
     6. STAR ratings (skills)
     --------------------------------------------------------- */
  $$('.skill__stars').forEach(el => {
    const n = +el.dataset.stars || 0;
    for (let i = 0; i < 5; i++) {
      const s = document.createElement('i');
      s.className = i < n ? 'on' : 'off';
      el.appendChild(s);
    }
  });

  /* ---------------------------------------------------------
     7. SCROLL REVEALS — IntersectionObserver (works w/o GSAP)
     --------------------------------------------------------- */
  const revealObserver = new IntersectionObserver((entries, obs) => {
    entries.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add('is-in'); obs.unobserve(en.target); }
    });
  }, { threshold: 0.18 });
  $$('.skill, .proj, .buy, .stats').forEach(el => revealObserver.observe(el));

  // section headings: pop in with GSAP if present
  if (hasGSAP && !reduce && !PREVIEW) {
    $$('.sec-head').forEach(head => {
      gsap.from(head.children, {
        scrollTrigger: { trigger: head, start: 'top 82%' },
        y: 30, opacity: 0, skewX: -8, duration: 0.6, stagger: 0.08, ease: 'back.out(1.7)'
      });
    });
    // parallax on big background words
    $$('.bigword').forEach(w => {
      gsap.to(w, {
        scrollTrigger: { trigger: w.closest('.section'), scrub: true,
          start: 'top bottom', end: 'bottom top' },
        x: () => (w.classList.contains('bigword--skill') ? -120 : 120), ease: 'none'
      });
    });
    // halftone portrait drift
    gsap.to('.halftone-card', {
      scrollTrigger: { trigger: '.about', scrub: 1, start: 'top bottom', end: 'bottom top' },
      rotate: 2, y: -30, ease: 'none'
    });
  }

  /* ---------------------------------------------------------
     8. HERO parallax (mouse) on silhouette + name shadow
     --------------------------------------------------------- */
  const sil = $('#silhouette');
  if (sil && !matchMedia('(max-width:980px)').matches && !reduce) {
    addEventListener('pointermove', e => {
      const dx = (e.clientX / innerWidth - 0.5);
      const dy = (e.clientY / innerHeight - 0.5);
      sil.style.transform = `translate(${dx * -36}px,${dy * -18}px)`;
    }, { passive: true });
  }

  /* ---------------------------------------------------------
     9. TILT cards (projects + calling card)
     --------------------------------------------------------- */
  if (!reduce) $$('[data-tilt]').forEach(card => {
    const strength = card.classList.contains('proj') ? 10 : 4;
    card.addEventListener('pointermove', e => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform =
        `perspective(900px) rotateY(${px * strength}deg) rotateX(${py * -strength}deg)`;
    });
    card.addEventListener('pointerleave', () => { card.style.transform = ''; });
  });

  /* ---------------------------------------------------------
     10. ALL-OUT ATTACK — splatter burst on [data-attack]
     --------------------------------------------------------- */
  const ATTACK_WORDS = ['STEAL!', 'TAKE IT!', 'YOU CANT ESCAPE', 'SHOWTIME', 'NICE!',
    'GOTCHA', 'ART!', 'WIN', 'CRITICAL', 'PERSONA!'];
  const JP = ['怪盗', '芸術', '美', '創', '盗', '魅', '技', '王'];
  function allOutAttack() {
    const layer = document.createElement('div');
    layer.className = 'aoa';
    document.body.appendChild(layer);
    const N = 16;
    for (let i = 0; i < N; i++) {
      const el = document.createElement('span');
      const isJP = Math.random() > 0.55;
      if (isJP) {
        el.className = 'aoa__jp';
        el.textContent = JP[(Math.random() * JP.length) | 0];
        el.style.left = 50 + (Math.random() - 0.5) * 30 + 'vw';
        el.style.top = 50 + (Math.random() - 0.5) * 30 + 'vh';
        el.style.fontSize = 24 + Math.random() * 70 + 'px';
        el.style.setProperty('--dx', (Math.random() - 0.5) * 90 + 'vw');
        el.style.setProperty('--dy', (Math.random() - 0.5) * 90 + 'vh');
        el.style.color = Math.random() > 0.5 ? '#f4f1e6' : '#e7000f';
      } else {
        el.className = 'aoa__splat';
        el.textContent = ATTACK_WORDS[(Math.random() * ATTACK_WORDS.length) | 0];
        el.style.left = Math.random() * 78 + 'vw';
        el.style.top = Math.random() * 78 + 'vh';
        el.style.fontSize = 18 + Math.random() * 40 + 'px';
        el.style.setProperty('--r', (Math.random() - 0.5) * 36 + 'deg');
        el.style.animationDelay = Math.random() * 0.18 + 's';
      }
      layer.appendChild(el);
    }
    setTimeout(() => layer.remove(), 1300);
  }
  $$('[data-attack]').forEach(btn => {
    btn.addEventListener('click', e => {
      if (btn.tagName === 'A' && btn.getAttribute('href')?.startsWith('mailto')) {
        // let the mail link work, but still flash
        allOutAttack();
        return;
      }
      e.preventDefault();
      allOutAttack();
    });
  });

  /* ---------------------------------------------------------
     11. SHOP "BUY" — confirm SE feel (ripple + attack)
     --------------------------------------------------------- */
  $$('.buy').forEach(b => b.addEventListener('click', () => allOutAttack()));

  /* ---------------------------------------------------------
     12. Magnetic links (calling card socials)
     --------------------------------------------------------- */
  if (!reduce) $$('[data-mag]').forEach(el => {
    el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect();
      el.style.transform =
        `translate(${(e.clientX - r.left - r.width / 2) * 0.3}px,${(e.clientY - r.top - r.height / 2) * 0.4}px)`;
    });
    el.addEventListener('pointerleave', () => el.style.transform = '');
  });

  /* ---------------------------------------------------------
     13. Konami-ish flourish: press "P" anywhere → attack
     --------------------------------------------------------- */
  addEventListener('keydown', e => { if (entered && e.key.toLowerCase() === 'p') allOutAttack(); });

})();
