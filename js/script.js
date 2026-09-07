(() => {
  'use strict';

  /* ---------- mobile nav toggle ---------- */
  const navToggle = document.getElementById('navToggle');
  const mainNav = document.getElementById('mainNav');

  if (navToggle && mainNav) {
    navToggle.addEventListener('click', () => {
      const isOpen = mainNav.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
    });

    mainNav.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        mainNav.classList.remove('is-open');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /* ---------- header background on scroll ---------- */
  const header = document.getElementById('siteHeader');
  const onScroll = () => {
    if (window.scrollY > 40) {
      header.style.borderBottomColor = 'rgba(0,224,255,0.25)';
    } else {
      header.style.borderBottomColor = '';
    }
  };
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---------- active nav link on scroll ---------- */
  const navLinks = document.querySelectorAll('[data-nav]');
  const sections = Array.from(navLinks)
    .map(link => document.querySelector(link.getAttribute('href')))
    .filter(Boolean);

  const setActiveLink = () => {
    let current = sections[0];
    const scrollPos = window.scrollY + 140;
    sections.forEach(sec => {
      if (sec.offsetTop <= scrollPos) current = sec;
    });
    navLinks.forEach(link => {
      link.classList.toggle('active', link.getAttribute('href') === `#${current.id}`);
    });
  };
  window.addEventListener('scroll', setActiveLink, { passive: true });
  setActiveLink();

  /* ---------- scroll reveal ---------- */
  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });
    revealEls.forEach(el => io.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('is-visible'));
  }

  /* ---------- track play/pause ---------- */
  const setBtnPaused = (btn) => { btn.textContent = '▶'; btn.setAttribute('aria-label', '再生'); };
  const setBtnPlaying = (btn) => { btn.textContent = '❙❙'; btn.setAttribute('aria-label', '一時停止'); };

  let currentAudio = null;
  let currentBtn = null;

  document.querySelectorAll('.track-play[data-src]').forEach(btn => {
    const audio = new Audio(btn.dataset.src);

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (currentAudio && currentAudio !== audio) {
        currentAudio.pause();
        setBtnPaused(currentBtn);
      }
      if (audio.paused) {
        audio.play();
        setBtnPlaying(btn);
        currentAudio = audio;
        currentBtn = btn;
      } else {
        audio.pause();
        setBtnPaused(btn);
        currentAudio = null;
        currentBtn = null;
      }
    });

    audio.addEventListener('ended', () => {
      setBtnPaused(btn);
      currentAudio = null;
      currentBtn = null;
    });
  });

  /* ---------- cyber neon particles background ---------- */
  const bgCanvas = document.getElementById('bgParticles');
  if (bgCanvas && bgCanvas.getContext) {
    const ctx = bgCanvas.getContext('2d');
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let particles = [];
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      bgCanvas.width = window.innerWidth * dpr;
      bgCanvas.height = window.innerHeight * dpr;
      bgCanvas.style.width = window.innerWidth + 'px';
      bgCanvas.style.height = window.innerHeight + 'px';
    };

    const createParticles = () => {
      const count = Math.min(90, Math.round((window.innerWidth * window.innerHeight) / 18000));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        r: Math.random() * 1.6 + 0.6,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.15,
        white: Math.random() < 0.22,
        hue: Math.random() * 360,
        hueSpeed: (Math.random() - 0.5) * 0.06,
        phase: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.0015 + 0.0008
      }));
    };

    const draw = (time) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      particles.forEach(p => {
        if (!reduceMotion) {
          p.x += p.vx; p.y += p.vy;
          if (p.x < -10) p.x = window.innerWidth + 10;
          if (p.x > window.innerWidth + 10) p.x = -10;
          if (p.y < -10) p.y = window.innerHeight + 10;
          if (p.y > window.innerHeight + 10) p.y = -10;
          p.hue = (p.hue + p.hueSpeed + 360) % 360;
        }
        const twinkle = reduceMotion ? 0.5 : (Math.sin(time * p.speed + p.phase) + 1) / 2;
        const alpha = 0.15 + twinkle * 0.55;
        const glowR = p.r * (2.5 + twinkle * 2);
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowR);
        if (p.white) {
          grad.addColorStop(0, `rgba(255,255,255,${alpha})`);
          grad.addColorStop(1, 'rgba(255,255,255,0)');
        } else {
          grad.addColorStop(0, `hsla(${p.hue},90%,65%,${alpha})`);
          grad.addColorStop(1, `hsla(${p.hue},90%,65%,0)`);
        }
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, glowR, 0, Math.PI * 2);
        ctx.fill();
      });
      if (!reduceMotion) requestAnimationFrame(draw);
    };

    resize();
    createParticles();
    window.addEventListener('resize', () => { resize(); createParticles(); }, { passive: true });
    requestAnimationFrame(draw);
  }

  /* ---------- underwater bubbles ---------- */
  const bubbleCanvas = document.getElementById('bgBubbles');
  if (bubbleCanvas && bubbleCanvas.getContext) {
    const bctx = bubbleCanvas.getContext('2d');
    const reduceMotionB = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let bubbles = [];
    let bdpr = Math.min(window.devicePixelRatio || 1, 2);

    const bResize = () => {
      bdpr = Math.min(window.devicePixelRatio || 1, 2);
      bubbleCanvas.width = window.innerWidth * bdpr;
      bubbleCanvas.height = window.innerHeight * bdpr;
      bubbleCanvas.style.width = window.innerWidth + 'px';
      bubbleCanvas.style.height = window.innerHeight + 'px';
    };

    const makeBubble = (initial) => ({
      x: Math.random() * window.innerWidth,
      y: initial ? Math.random() * window.innerHeight : window.innerHeight + 20,
      r: Math.pow(Math.random(), 2.2) * 11 + 2,
      speed: Math.random() * 0.5 + 0.2,
      wobble: Math.random() * Math.PI * 2,
      wobbleSpeed: Math.random() * 0.018 + 0.006,
      wobbleAmp: Math.random() * 10 + 3,
      alpha: Math.random() * 0.3 + 0.18
    });

    const createBubbles = () => {
      const count = Math.min(50, Math.round((window.innerWidth * window.innerHeight) / 30000));
      bubbles = Array.from({ length: count }, () => makeBubble(true));
    };

    const bDraw = () => {
      bctx.setTransform(bdpr, 0, 0, bdpr, 0, 0);
      bctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      bubbles.forEach(b => {
        if (!reduceMotionB) {
          b.y -= b.speed;
          b.wobble += b.wobbleSpeed;
          if (b.y < -20) Object.assign(b, makeBubble(false));
        }
        const x = b.x + Math.sin(b.wobble) * b.wobbleAmp;
        const y = b.y;
        const r = b.r;

        // glassy body: faint fill, brighter toward the rim (refraction look)
        const body = bctx.createRadialGradient(x, y, r * 0.15, x, y, r);
        body.addColorStop(0, `rgba(190,225,255,${b.alpha * 0.04})`);
        body.addColorStop(0.75, `rgba(190,225,255,${b.alpha * 0.06})`);
        body.addColorStop(1, `rgba(210,235,255,${b.alpha * 0.5})`);
        bctx.beginPath();
        bctx.arc(x, y, r, 0, Math.PI * 2);
        bctx.fillStyle = body;
        bctx.fill();

        // thin outer rim
        bctx.beginPath();
        bctx.arc(x, y, r, 0, Math.PI * 2);
        bctx.strokeStyle = `rgba(215,238,255,${b.alpha * 0.55})`;
        bctx.lineWidth = Math.max(0.6, r * 0.06);
        bctx.stroke();

        // crescent specular highlight (upper-left)
        if (r > 2.2) {
          bctx.beginPath();
          bctx.arc(x - r * 0.32, y - r * 0.32, r * 0.55, Math.PI * 0.75, Math.PI * 1.55);
          bctx.strokeStyle = `rgba(255,255,255,${b.alpha * 0.85})`;
          bctx.lineWidth = Math.max(0.5, r * 0.18);
          bctx.lineCap = 'round';
          bctx.stroke();
        }
      });
      if (!reduceMotionB) requestAnimationFrame(bDraw);
    };

    bResize();
    createBubbles();
    window.addEventListener('resize', () => { bResize(); createBubbles(); }, { passive: true });
    requestAnimationFrame(bDraw);
  }

  /* ---------- cursor glow (desktop only) ---------- */
  const glow = document.getElementById('cursorGlow');
  if (glow && matchMedia('(hover: hover)').matches) {
    window.addEventListener('pointermove', (e) => {
      glow.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`;
    }, { passive: true });
  }

})();
