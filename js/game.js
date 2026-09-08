(() => {
  'use strict';

  const ROUND_SECONDS = 30;
  const BUBBLE_TYPES = [
    { cls: 'bubble-white', points: 100, weight: 55, sizeMin: 44, sizeMax: 80, speedMin: 198, speedMax: 450 },
    { cls: 'bubble-blue', points: 150, weight: 30, sizeMin: 34, sizeMax: 62, speedMin: 266, speedMax: 514 },
    { cls: 'bubble-purple', points: 300, weight: 15, sizeMin: 26, sizeMax: 48, speedMin: 332, speedMax: 594, hitPad: 16 },
  ];
  const TOTAL_WEIGHT = BUBBLE_TYPES.reduce((s, t) => s + t.weight, 0);
  const RANK_THRESHOLDS = [
    { rank: 'S', min: 8000 },
    { rank: 'A', min: 6000 },
    { rank: 'B', min: 4000 },
    { rank: 'C', min: 0 },
  ];
  const RESULT_LINES = {
    S: { name: 'OZ', img: 'img/OZ_kawaii.png', line: 'すごい！めっちゃうまいじゃん！' },
    A: { name: 'YUU', img: 'img/YUU_kawaii.png', line: 'おっ、やるじゃん！その調子！' },
    B: { name: 'OZ', img: 'img/OZ_kawaii.png', line: 'なかなかいい感じ！もっといけるよ！' },
    C: { name: 'YUU', img: 'img/YUU_kawaii.png', line: 'まあまあかな。次はがんばろう！' },
  };
  const LEADERBOARD_COLLECTION = 'leaderboard';
  const LEADERBOARD_MAX = 20;
  const leaderboardDb = (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length)
    ? firebase.firestore()
    : null;

  const modal = document.getElementById('gameModal');
  const navBtn = document.getElementById('gameNavBtn');
  const closeBtn = document.getElementById('gameClose');
  const closeBtn2 = document.getElementById('gameCloseBtn2');
  const quitBtn = document.getElementById('gameQuitBtn');
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
  const resultCharEl = document.getElementById('gameResultChar');
  const resultNameEl = document.getElementById('gameResultName');
  const resultLineEl = document.getElementById('gameResultLine');
  const bgVideo = document.getElementById('gameBgVideo');
  const rankingBtn = document.getElementById('gameRankingBtn');
  const rankingPanel = document.getElementById('gameRanking');
  const rankingList = document.getElementById('rankingList');
  const rankingBackBtn = document.getElementById('gameRankingBackBtn');
  const rankingYouEl = document.getElementById('rankingYou');
  const saveScorePrompt = document.getElementById('saveScorePrompt');
  const saveScoreYesNo = document.getElementById('saveScoreYesNo');
  const saveScoreYesBtn = document.getElementById('saveScoreYesBtn');
  const saveScoreNoBtn = document.getElementById('saveScoreNoBtn');
  const saveScoreNameArea = document.getElementById('saveScoreNameArea');
  const saveScoreNameInput = document.getElementById('saveScoreNameInput');
  const saveScoreSubmitBtn = document.getElementById('saveScoreSubmitBtn');
  const saveScoreSummaryRank = document.getElementById('saveScoreSummaryRank');
  const saveScoreSummaryScore = document.getElementById('saveScoreSummaryScore');

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

  const resultSfx = new Audio('audio/result.mp3');
  resultSfx.volume = 0.6;

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
  let lastRank = 'D';

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
    rankingPanel.hidden = name !== 'ranking';
  }

  /* ---------- leaderboard (shared, via Firestore) ---------- */
  function saveLeaderboardEntry(name, score, rank) {
    if (!leaderboardDb) return Promise.reject(new Error('Firestore not available'));
    return leaderboardDb.collection(LEADERBOARD_COLLECTION).add({
      name,
      score,
      rank,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function renderRanking(highlightId) {
    rankingYouEl.hidden = true;
    if (!leaderboardDb) {
      rankingList.innerHTML = '<p class="ranking-empty">ランキングを読み込めませんでした</p>';
      return;
    }
    rankingList.innerHTML = '<p class="ranking-empty">読み込み中…</p>';
    leaderboardDb.collection(LEADERBOARD_COLLECTION)
      .orderBy('score', 'desc')
      .limit(LEADERBOARD_MAX)
      .get()
      .then((snapshot) => {
        if (snapshot.empty) {
          rankingList.innerHTML = '<p class="ranking-empty">まだ記録がありません</p>';
          return;
        }
        const rows = [];
        snapshot.forEach((doc) => rows.push({ id: doc.id, ...doc.data() }));
        // ties share the same rank (competition ranking), matching showYourRank()'s math
        let pos = 1;
        rankingList.innerHTML = rows.map((entry, i) => {
          if (i > 0 && rows[i - 1].score > entry.score) pos = i + 1;
          const isTop3 = pos <= 3;
          return `
          <div class="ranking-row${isTop3 ? ' is-top3' : ''}${entry.id === highlightId ? ' is-you' : ''}">
            <span class="ranking-pos">${pos}</span>
            <span class="ranking-name">${escapeHtml(entry.name || 'なまえなし')}</span>
            <span class="ranking-score">${entry.score}</span>
            <span class="ranking-badge">${entry.rank}</span>
          </div>
        `;
        }).join('');
        if (highlightId && rows.some((e) => e.id === highlightId)) {
          requestAnimationFrame(() => {
            const el = rankingList.querySelector('.ranking-row.is-you');
            el && el.scrollIntoView({ block: 'center' });
          });
        }
      })
      .catch(() => {
        rankingList.innerHTML = '<p class="ranking-empty">ランキングを読み込めませんでした</p>';
      });
  }

  function showYourRank(score) {
    if (!leaderboardDb) return;
    leaderboardDb.collection(LEADERBOARD_COLLECTION)
      .where('score', '>', score)
      .get()
      .then((snapshot) => {
        rankingYouEl.textContent = `きみの順位: ${snapshot.size + 1}位`;
        rankingYouEl.hidden = false;
      })
      .catch(() => {});
  }

  function showSaveScorePrompt(score, rank) {
    saveScoreSummaryRank.textContent = rank;
    saveScoreSummaryScore.textContent = score;
    saveScoreNameInput.value = '';
    saveScoreNameArea.hidden = true;
    saveScoreYesNo.hidden = false;
    saveScoreSubmitBtn.disabled = false;
    saveScoreSubmitBtn.textContent = 'とうろく';
    saveScorePrompt.hidden = false;
  }

  function hideSaveScorePrompt() {
    saveScorePrompt.hidden = true;
  }

  navBtn && navBtn.addEventListener('click', (e) => { e.preventDefault(); openModal(); });
  closeBtn && closeBtn.addEventListener('click', closeModal);
  closeBtn2 && closeBtn2.addEventListener('click', closeModal);
  quitBtn && quitBtn.addEventListener('click', closeModal);
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

    // small bubbles (e.g. purple) get an invisible hit-area boost so they're
    // easier to tap without changing how big they look
    const hitPad = type.hitPad || 0;
    const boxSize = size + hitPad * 2;

    const el = document.createElement('div');
    el.className = 'bubble ' + type.cls;
    el.style.width = boxSize + 'px';
    el.style.height = boxSize + 'px';
    el.style.left = (x - hitPad) + 'px';
    el.style.top = (rect.height - hitPad) + 'px';
    if (hitPad) el.style.backgroundSize = size + 'px';
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
  const SPAWN_RATE_BOOST = 1.2;

  function scheduleSpawn() {
    if (!running) return;
    spawnBubble();
    const elapsed = ROUND_SECONDS - timeLeft;
    const baseInterval = Math.max(260, 720 - elapsed * 14);
    let interval = baseInterval + Math.random() * 220;
    interval /= SPAWN_RATE_BOOST;
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
    stopGame();
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
    resultSfx.pause();
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
    let rank = 'C';
    for (const t of RANK_THRESHOLDS) {
      if (score >= t.min) { rank = t.rank; break; }
    }
    rankEl.textContent = rank;
    lastRank = rank;
    const line = RESULT_LINES[rank];
    resultCharEl.src = line.img;
    resultCharEl.alt = line.name;
    resultNameEl.textContent = line.name;
    resultLineEl.textContent = line.line;
    showPanel('result');
    showSaveScorePrompt(score, rank);
    resultSfx.currentTime = 0;
    resultSfx.play().catch(() => {});
  }

  playBtn && playBtn.addEventListener('click', startGame);
  retryBtn && retryBtn.addEventListener('click', startGame);

  rankingBtn && rankingBtn.addEventListener('click', () => {
    renderRanking();
    showPanel('ranking');
  });
  rankingBackBtn && rankingBackBtn.addEventListener('click', () => showPanel('start'));

  saveScoreYesBtn && saveScoreYesBtn.addEventListener('click', () => {
    saveScoreYesNo.hidden = true;
    saveScoreNameArea.hidden = false;
    saveScoreNameInput.focus();
  });
  saveScoreNoBtn && saveScoreNoBtn.addEventListener('click', hideSaveScorePrompt);
  saveScoreSubmitBtn && saveScoreSubmitBtn.addEventListener('click', () => {
    const name = saveScoreNameInput.value.trim() || 'なまえなし';
    saveScoreSubmitBtn.disabled = true;
    saveScoreSubmitBtn.textContent = 'とうろく中…';
    saveLeaderboardEntry(name, score, lastRank)
      .then((docRef) => {
        hideSaveScorePrompt();
        showPanel('ranking');
        renderRanking(docRef.id);
        showYourRank(score);
      })
      .catch(() => {
        saveScoreSubmitBtn.textContent = 'しっぱい。もう一度';
      })
      .finally(() => {
        saveScoreSubmitBtn.disabled = false;
        if (!saveScorePrompt.hidden) return;
        saveScoreSubmitBtn.textContent = 'とうろく';
      });
  });
  saveScoreNameInput && saveScoreNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveScoreSubmitBtn.click();
  });

})();
