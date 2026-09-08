(() => {
  'use strict';

  const ROUND_SECONDS = 30;
  const BUBBLE_TYPES = [
    { cls: 'bubble-white', points: 100, weight: 55, sizeMin: 44, sizeMax: 80, speedMin: 198, speedMax: 450 },
    { cls: 'bubble-blue', points: 150, weight: 30, sizeMin: 34, sizeMax: 62, speedMin: 266, speedMax: 514 },
    { cls: 'bubble-purple', points: 300, weight: 15, sizeMin: 26, sizeMax: 48, speedMin: 332, speedMax: 594 },
  ];
  const TOTAL_WEIGHT = BUBBLE_TYPES.reduce((s, t) => s + t.weight, 0);
  const RANK_THRESHOLDS = [
    { rank: 'S', min: 5000 },
    { rank: 'A', min: 3500 },
    { rank: 'B', min: 2200 },
    { rank: 'C', min: 1200 },
  ];

  const modal = document.getElementById('gameModal');
  const navBtn = document.getElementById('gameNavBtn');
  const closeBtn = document.getElementById('gameClose');
  const closeBtn2 = document.getElementById('gameCloseBtn2');
  const startPanel = document.getElementById('gameStart');
  const playPanel = document.getElementById('gamePlay');
  const resultPanel = document.getElementById('gameResult');
  const playBtn = document.getElementById('gamePlayBtn');
  const retryBtn = document.getElementById('gameRetryBtn');
  const field = document.getElementById('bubbleField');
  const scoreEl = document.getElementById('gameScoreVal');
  const timerEl = document.getElementById('gameTimerVal');
  const rankEl = document.getElementById('gameRank');
  const finalScoreEl = document.getElementById('gameFinalScore');
  const bgVideo = document.getElementById('gameBgVideo');

  if (!modal || !field) return;

  function loadBgVideo() {
    if (!bgVideo || bgVideo.src) return;
    bgVideo.src = bgVideo.dataset.src;
    bgVideo.load();
    bgVideo.play().catch(() => {});
  }

  const bgm = new Audio('audio/game.mp3');
  bgm.loop = true;
  bgm.volume = 0.5;

  const popSoundSrc = 'audio/bubble.mp3';
  let audioCtx = null;
  let popBuffer = null;
  let popBufferLoading = null;

  function loadPopBuffer() {
    if (!popBufferLoading) {
      popBufferLoading = fetch(popSoundSrc)
        .then(res => res.arrayBuffer())
        .then(data => audioCtx.decodeAudioData(data))
        .then(buffer => { popBuffer = buffer; })
        .catch(() => {});
    }
    return popBufferLoading;
  }

  function initAudio() {
    if (audioCtx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioCtx = new Ctx();
    loadPopBuffer();
  }

  // Fallback pool used only if Web Audio decoding is unavailable/fails,
  // so we still avoid allocating a fresh <audio> element on every pop.
  const fallbackPoolSize = 6;
  const fallbackPool = [];
  let fallbackIndex = 0;

  function playPopSoundFallback() {
    if (fallbackPool.length < fallbackPoolSize) {
      const sfx = new Audio(popSoundSrc);
      sfx.volume = 0.7;
      fallbackPool.push(sfx);
    }
    const sfx = fallbackPool[fallbackIndex];
    fallbackIndex = (fallbackIndex + 1) % fallbackPool.length;
    sfx.currentTime = 0;
    sfx.play().catch(() => {});
  }

  function playPopSound() {
    if (audioCtx && popBuffer) {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const source = audioCtx.createBufferSource();
      source.buffer = popBuffer;
      const gain = audioCtx.createGain();
      gain.gain.value = 0.7;
      source.connect(gain).connect(audioCtx.destination);
      source.start(0);
      return;
    }
    playPopSoundFallback();
  }

  let score = 0;
  let timeLeft = ROUND_SECONDS;
  let bubbles = [];
  let running = false;
  let rafId = null;
  let spawnTimeoutId = null;
  let tickIntervalId = null;
  let lastFrameTime = 0;

  /* ---------- modal open/close ---------- */
  function openModal() {
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    showPanel('start');
    loadBgVideo();
    document.dispatchEvent(new CustomEvent('minigame:open'));
  }

  function closeModal() {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    stopGame();
    document.dispatchEvent(new CustomEvent('minigame:close'));
  }

  function showPanel(name) {
    startPanel.hidden = name !== 'start';
    playPanel.hidden = name !== 'play';
    resultPanel.hidden = name !== 'result';
  }

  navBtn && navBtn.addEventListener('click', (e) => { e.preventDefault(); openModal(); });
  closeBtn && closeBtn.addEventListener('click', closeModal);
  closeBtn2 && closeBtn2.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('is-open')) closeModal();
  });

  /* ---------- bubble spawning ---------- */
  function pickType() {
    let r = Math.random() * TOTAL_WEIGHT;
    for (const t of BUBBLE_TYPES) {
      if (r < t.weight) return t;
      r -= t.weight;
    }
    return BUBBLE_TYPES[0];
  }

  function spawnBubble() {
    const rect = field.getBoundingClientRect();
    const type = pickType();
    const size = Math.random() * (type.sizeMax - type.sizeMin) + type.sizeMin;
    const x = Math.random() * Math.max(0, rect.width - size);

    const el = document.createElement('div');
    el.className = 'bubble ' + type.cls;
    el.style.width = size + 'px';
    el.style.height = size + 'px';
    el.style.left = x + 'px';
    el.style.top = rect.height + 'px';
    field.appendChild(el);

    const bubble = {
      el,
      x,
      y: rect.height,
      spawnTop: rect.height,
      size,
      speed: Math.random() * (type.speedMax - type.speedMin) + type.speedMin,
      wobblePhase: Math.random() * Math.PI * 2,
      wobbleSpeed: Math.random() * 1.4 + 0.6,
      wobbleAmp: Math.random() * 14 + 6,
      points: type.points,
      popped: false,
    };
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); popBubble(bubble); });
    el.addEventListener('click', (e) => { e.preventDefault(); popBubble(bubble); });
    bubbles.push(bubble);
  }

  const FINAL_STRETCH_SECONDS = 10;
  const FINAL_STRETCH_BOOST = 1.3;

  function scheduleSpawn() {
    if (!running) return;
    spawnBubble();
    const elapsed = ROUND_SECONDS - timeLeft;
    const baseInterval = Math.max(260, 720 - elapsed * 14);
    let interval = baseInterval + Math.random() * 220;
    if (timeLeft <= FINAL_STRETCH_SECONDS) interval /= FINAL_STRETCH_BOOST;
    spawnTimeoutId = setTimeout(scheduleSpawn, interval);
  }

  /* ---------- pop & score ---------- */
  function popBubble(bubble) {
    if (bubble.popped || !running) return;
    bubble.popped = true;
    playPopSound();
    score += bubble.points;
    scoreEl.textContent = score;
    showScorePop(bubble);
    const wobbleX = Math.sin(bubble.wobblePhase) * bubble.wobbleAmp;
    const dy = bubble.y - bubble.spawnTop;
    bubble.el.style.transition = 'transform .2s ease, opacity .2s ease';
    bubble.el.style.transform = `translate3d(${wobbleX}px, ${dy}px, 0) scale(1.5)`;
    bubble.el.classList.add('is-popped');
    setTimeout(() => bubble.el.remove(), 200);
    bubbles = bubbles.filter(b => b !== bubble);
  }

  function showScorePop(bubble) {
    const pop = document.createElement('div');
    pop.className = 'score-pop';
    pop.textContent = '+' + bubble.points;
    pop.style.left = (bubble.x + bubble.size / 2 - 16) + 'px';
    pop.style.top = bubble.y + 'px';
    field.appendChild(pop);
    setTimeout(() => pop.remove(), 650);
  }

  /* ---------- render loop ---------- */
  function loop(time) {
    if (!running) return;
    if (!lastFrameTime) lastFrameTime = time;
    const dt = Math.min((time - lastFrameTime) / 1000, 0.05);
    lastFrameTime = time;

    bubbles.forEach(b => {
      b.y -= b.speed * dt;
      b.wobblePhase += b.wobbleSpeed * dt;
      const wobbleX = Math.sin(b.wobblePhase) * b.wobbleAmp;
      const dy = b.y - b.spawnTop;
      b.el.style.transform = `translate3d(${wobbleX}px, ${dy}px, 0)`;
    });

    bubbles = bubbles.filter(b => {
      if (b.y < -b.size) { b.el.remove(); return false; }
      return true;
    });

    rafId = requestAnimationFrame(loop);
  }

  /* ---------- game flow ---------- */
  function startGame() {
    initAudio();
    score = 0;
    timeLeft = ROUND_SECONDS;
    bubbles.forEach(b => b.el.remove());
    bubbles = [];
    field.querySelectorAll('.score-pop').forEach(p => p.remove());
    scoreEl.textContent = '0';
    timerEl.textContent = String(timeLeft);

    showPanel('play');
    running = true;
    lastFrameTime = 0;

    bgm.currentTime = 0;
    bgm.play().catch(() => {});

    rafId = requestAnimationFrame(loop);
    scheduleSpawn();
    tickIntervalId = setInterval(() => {
      timeLeft--;
      timerEl.textContent = String(Math.max(timeLeft, 0));
      if (timeLeft <= 0) endGame();
    }, 1000);
  }

  function stopGame() {
    running = false;
    bgm.pause();
    if (rafId) cancelAnimationFrame(rafId);
    if (spawnTimeoutId) clearTimeout(spawnTimeoutId);
    if (tickIntervalId) clearInterval(tickIntervalId);
    rafId = spawnTimeoutId = tickIntervalId = null;
    bubbles.forEach(b => b.el.remove());
    bubbles = [];
    field.querySelectorAll('.score-pop').forEach(p => p.remove());
  }

  function endGame() {
    if (!running) return;
    stopGame();
    finalScoreEl.textContent = String(score);
    let rank = 'D';
    for (const t of RANK_THRESHOLDS) {
      if (score >= t.min) { rank = t.rank; break; }
    }
    rankEl.textContent = rank;
    showPanel('result');
  }

  playBtn && playBtn.addEventListener('click', startGame);
  retryBtn && retryBtn.addEventListener('click', startGame);

})();
