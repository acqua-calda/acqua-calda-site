(() => {
  'use strict';

  const ROUND_SECONDS = 30;
  const BUBBLE_TYPES = [
    { cls: 'bubble-white', points: 100, weight: 55, sizeMin: 44, sizeMax: 80, speedMin: 55, speedMax: 125 },
    { cls: 'bubble-blue', points: 150, weight: 30, sizeMin: 34, sizeMax: 62, speedMin: 85, speedMax: 165 },
    { cls: 'bubble-purple', points: 300, weight: 15, sizeMin: 26, sizeMax: 48, speedMin: 120, speedMax: 215 },
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

  if (!modal || !field) return;

  const bgm = new Audio('audio/game.mp3');
  bgm.loop = true;
  bgm.volume = 0.5;

  const popSoundSrc = 'audio/bubble.mp3';
  function playPopSound() {
    const sfx = new Audio(popSoundSrc);
    sfx.volume = 0.7;
    sfx.play().catch(() => {});
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
  }

  function closeModal() {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    stopGame();
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

  function scheduleSpawn() {
    if (!running) return;
    spawnBubble();
    const elapsed = ROUND_SECONDS - timeLeft;
    const baseInterval = Math.max(260, 720 - elapsed * 14);
    const interval = baseInterval + Math.random() * 220;
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

    const rect = field.getBoundingClientRect();
    bubbles.forEach(b => {
      b.y -= b.speed * dt;
      b.wobblePhase += b.wobbleSpeed * dt;
      const wobbleX = Math.sin(b.wobblePhase) * b.wobbleAmp;
      b.el.style.top = b.y + 'px';
      b.el.style.left = (b.x + wobbleX) + 'px';
    });

    bubbles = bubbles.filter(b => {
      if (b.y < -b.size) { b.el.remove(); return false; }
      return true;
    });

    rafId = requestAnimationFrame(loop);
  }

  /* ---------- game flow ---------- */
  function startGame() {
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
