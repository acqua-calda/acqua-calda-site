(() => {
  'use strict';

  // Nudge a 1px scroll so mobile Safari collapses its address bar (the page
  // has 1px of extra scroll room reserved for exactly this in chat.css).
  // The fixed-position room covers the screen regardless of scroll offset.
  function collapseAddressBar() { window.scrollTo(0, 1); }
  collapseAddressBar();
  window.addEventListener('load', collapseAddressBar);
  window.addEventListener('orientationchange', () => setTimeout(collapseAddressBar, 300));

  const AVATARS = [
    { id: 'a', name: 'A', src: 'img/A.png', gender: 'male' },
    { id: 'b', name: 'B', src: 'img/B.png', gender: 'male' },
    { id: 'c', name: 'C', src: 'img/C.png', gender: 'male' },
    { id: 'd', name: 'D', src: 'img/D.png', gender: 'male' },
    { id: 'e', name: 'E', src: 'img/E.png', gender: 'male' },
    { id: 'f', name: 'F', src: 'img/F.png', gender: 'male' },
    { id: 'g', name: 'G', src: 'img/G.png', gender: 'male' },
    { id: 'h', name: 'H', src: 'img/H.png', gender: 'female' },
    { id: 'i', name: 'I', src: 'img/I.png', gender: 'female' },
    { id: 'j', name: 'J', src: 'img/J.png', gender: 'female' },
    { id: 'k', name: 'K', src: 'img/K.png', gender: 'female' },
    { id: 'l', name: 'L', src: 'img/L.png', gender: 'female' },
    { id: 'm', name: 'M', src: 'img/M.png', gender: 'female' },
    { id: 'oz', name: 'OZ', src: 'img/OZ_kawaii.png', restricted: true },
    { id: 'yuu', name: 'YUU', src: 'img/YUU_kawaii.png', restricted: true },
  ];
  // Gender categories for the picker's tab buttons. Add more entries here
  // (and tag avatars with the matching `gender`) once other genders have art.
  const GENDERS = [
    { id: 'male', label: '男性' },
    { id: 'female', label: '女性' },
  ];
  const ADMIN_STORAGE_KEY = 'acquaHouseAdmin';
  const ADMIN_DURATION_MS = 24 * 60 * 60 * 1000; // must match js/script.js's ACCESS_KEY_DURATION_MS
  const WORLD_W = 900;
  const WORLD_H = 480;
  const AVATAR_W = 81;   // world units, footprint used for movement clamping (matches the 9% x 209:332 CSS box)
  const AVATAR_H = 129;
  const MOVE_SPEED = 260;         // world units / sec
  const BUBBLE_MS = 5000;
  const POS_SEND_MS = 120;
  const SEND_COOLDOWN_MS = 800;
  const LOG_LIMIT = 30;
  const NAME_MAX = 10;
  const MSG_MAX = 200;
  const IDLE_LIMIT_MS = 60 * 60 * 1000;   // auto-leave after 1 hour with no movement/chat
  const IDLE_CHECK_MS = 60 * 1000;        // how often to check idleness / sweep stale peers
  const STORAGE_KEY = 'acquaChatProfile';
  const BGM_VOLUME_KEY = 'acquaHouseBgmVolume';
  const MOVE_KEYS = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'];

  const stage = document.getElementById('chatStage');
  const entryOverlay = document.getElementById('chatEntry');
  const entryNameInput = document.getElementById('entryNameInput');
  const entryGenderTabs = document.getElementById('entryGenderTabs');
  const entryAvatarPicker = document.getElementById('entryAvatarPicker');
  const entryRestrictedPicker = document.getElementById('entryRestrictedPicker');
  const entryEnterBtn = document.getElementById('entryEnterBtn');
  const inputForm = document.getElementById('chatInputForm');
  const inputText = document.getElementById('chatInputText');
  const myAvatarBtn = document.getElementById('chatMyAvatarBtn');
  const myAvatarImg = document.getElementById('chatMyAvatarImg');
  const logEl = document.getElementById('chatLog');
  const onlineCountEl = document.getElementById('chatOnlineCount');
  const leaveBtn = document.getElementById('chatLeaveBtn');
  const fullscreenBtn = document.getElementById('chatFullscreenBtn');
  const dpad = document.getElementById('chatDpad');
  const volumeWrap = document.getElementById('chatVolume');
  const volumeSlider = document.getElementById('chatVolumeSlider');
  const volumeIcon = document.getElementById('chatVolumeIcon');
  const rhythmToastEl = document.getElementById('rhythmToast');
  const rhythmHudEl = document.getElementById('rhythmHud');
  const rhythmScoreValEl = document.getElementById('rhythmScoreVal');
  const rhythmCountdownEl = document.getElementById('rhythmCountdown');
  const rhythmConfirmEl = document.getElementById('rhythmConfirm');
  const rhythmConfirmYesBtn = document.getElementById('rhythmConfirmYesBtn');
  const rhythmConfirmNoBtn = document.getElementById('rhythmConfirmNoBtn');
  const rhythmSongSelectEl = document.getElementById('rhythmSongSelect');
  const rhythmSongListEl = document.getElementById('rhythmSongList');
  const rhythmSongCancelBtn = document.getElementById('rhythmSongCancelBtn');
  const rhythmResultEl = document.getElementById('rhythmResult');
  const rhythmResultScoreValEl = document.getElementById('rhythmResultScoreVal');
  const rhythmResultCloseBtn = document.getElementById('rhythmResultCloseBtn');

  if (!stage) return;

  let db = null;
  let auth = null;
  let fbReady = false;
  try {
    if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length) {
      db = firebase.database();
      auth = firebase.auth();
      fbReady = true;
    }
  } catch (err) {
    console.error('[chat] Firebase Realtime Database init failed (databaseURL not configured yet?)', err);
  }

  function avatarById(id) { return AVATARS.find(a => a.id === id) || AVATARS[0]; }

  function loadProfile() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; }
  }
  function saveProfile(p) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch { /* ignore */ }
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function isAdminUnlocked() {
    try {
      const unlockedAt = Number(localStorage.getItem(ADMIN_STORAGE_KEY));
      if (!unlockedAt || Date.now() - unlockedAt > ADMIN_DURATION_MS) {
        localStorage.removeItem(ADMIN_STORAGE_KEY);
        return false;
      }
      return true;
    } catch { return false; }
  }
  function publicAvatarsByGender(genderId) {
    return AVATARS.filter(a => !a.restricted && a.gender === genderId);
  }
  function restrictedAvatars() {
    return isAdminUnlocked() ? AVATARS.filter(a => a.restricted) : [];
  }

  let profile = loadProfile();
  let myUid = null;
  let presenceRef = null;
  let myEl = null;
  const myState = { x: WORLD_W / 2, y: WORLD_H / 2, facing: 'right' };
  const keys = new Set();
  const remoteAvatars = new Map(); // uid -> { el }
  let lastSendAt = 0;
  let lastSendPos = null;
  let lastMessageSentAt = 0;
  let lastActivityAt = Date.now();
  let idleIntervalId = null;
  let listenersAttached = false;

  function markActivity() { lastActivityAt = Date.now(); }

  /* ---------- iPhone push notification on entry (via ntfy.sh) ---------- */
  // Topic is an unguessable random slug rather than a secret -- ntfy has no
  // auth on the free tier, so anyone who found it could publish fake joins,
  // but that's a minor annoyance, not a security issue (who's in the room is
  // already publicly visible to anyone in it).
  const NTFY_TOPIC = 'acquahouse-3b7438a3b969';
  function notifyEntry(name, avatarLabel) {
    fetch('https://ntfy.sh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: NTFY_TOPIC,
        title: 'ACQUA HOUSE',
        message: `${name}さん（${avatarLabel}）が入室しました`,
        tags: ['door'],
      }),
    }).catch(() => { /* best-effort; never block room entry on this */ });
  }

  /* ---------- sound effects & BGM ---------- */
  const ponSfx = new Audio('audio/pon.mp3');
  ponSfx.volume = 0.49; // 30% quieter than the original 0.7
  function playPon() {
    try { ponSfx.currentTime = 0; ponSfx.play().catch(() => {}); } catch { /* ignore */ }
  }

  const bgm = new Audio('audio/aqua_House.mp3');
  bgm.loop = true;
  bgm.preload = 'none';

  function loadBgmVolume() {
    let v = 60;
    try {
      const stored = localStorage.getItem(BGM_VOLUME_KEY);
      if (stored !== null) v = Number(stored);
    } catch { /* ignore */ }
    return Number.isFinite(v) ? clamp(v, 0, 100) : 60;
  }
  function applyBgmVolume(v) {
    bgm.volume = v / 100;
    bgm.muted = v <= 0;
    if (volumeIcon) volumeIcon.textContent = v <= 0 ? '🔇' : v < 50 ? '🔉' : '🔊';
  }
  if (volumeSlider) {
    const initialVolume = loadBgmVolume();
    volumeSlider.value = String(initialVolume);
    applyBgmVolume(initialVolume);
    volumeSlider.addEventListener('input', () => {
      const v = Number(volumeSlider.value);
      applyBgmVolume(v);
      try { localStorage.setItem(BGM_VOLUME_KEY, String(v)); } catch { /* ignore */ }
    });
  }
  function playBgm() {
    if (volumeWrap) volumeWrap.hidden = false;
    bgm.play().catch(() => {});
  }
  function stopBgm() {
    bgm.pause();
    bgm.currentTime = 0;
    if (volumeWrap) volumeWrap.hidden = true;
  }

  /* ---------- entry overlay ---------- */
  let selectedAvatarId = AVATARS[0].id;
  let selectedGenderId = GENDERS[0].id;

  function selectAvatar(id) {
    selectedAvatarId = id;
    entryAvatarPicker.querySelectorAll('.chat-avatar-option').forEach(b => b.classList.toggle('is-selected', b.dataset.id === id));
    entryRestrictedPicker.querySelectorAll('.chat-avatar-option').forEach(b => b.classList.toggle('is-selected', b.dataset.id === id));
  }

  function renderAvatarGrid(container, avatars) {
    container.innerHTML = '';
    avatars.forEach(a => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.id = a.id;
      btn.className = 'chat-avatar-option' + (a.id === selectedAvatarId ? ' is-selected' : '');
      btn.innerHTML = `<img src="${a.src}" alt="${a.name}"><span>${a.name}</span>`;
      btn.addEventListener('click', () => selectAvatar(a.id));
      container.appendChild(btn);
    });
  }

  function renderGenderTabs() {
    entryGenderTabs.innerHTML = '';
    GENDERS.forEach(g => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chat-gender-tab' + (g.id === selectedGenderId ? ' is-selected' : '');
      btn.textContent = g.label;
      btn.addEventListener('click', () => {
        if (selectedGenderId === g.id) return;
        selectedGenderId = g.id;
        renderGenderTabs();
        const genderAvatars = publicAvatarsByGender(selectedGenderId);
        if (!genderAvatars.some(a => a.id === selectedAvatarId)) selectedAvatarId = genderAvatars[0].id;
        renderAvatarGrid(entryAvatarPicker, genderAvatars);
        selectAvatar(selectedAvatarId);
      });
      entryGenderTabs.appendChild(btn);
    });
  }

  function renderAvatarPicker(preferredId) {
    const restricted = restrictedAvatars();
    const isRestrictedPreferred = restricted.some(a => a.id === preferredId);

    if (isRestrictedPreferred) {
      selectedAvatarId = preferredId;
    } else {
      const genderMatch = AVATARS.find(a => a.id === preferredId && !a.restricted);
      selectedGenderId = genderMatch ? genderMatch.gender : GENDERS[0].id;
      const genderAvatars = publicAvatarsByGender(selectedGenderId);
      selectedAvatarId = genderMatch ? preferredId : genderAvatars[0].id;
    }

    renderGenderTabs();
    renderAvatarGrid(entryAvatarPicker, publicAvatarsByGender(selectedGenderId));
    entryRestrictedPicker.hidden = restricted.length === 0;
    renderAvatarGrid(entryRestrictedPicker, restricted);
    selectAvatar(selectedAvatarId);
  }

  function openEntry() {
    entryNameInput.value = profile ? profile.name : '';
    renderAvatarPicker(profile ? profile.avatar : AVATARS[0].id);
    entryOverlay.hidden = false;
    entryNameInput.focus();
  }
  function closeEntry() { entryOverlay.hidden = true; }

  function showSetupNotice() {
    entryOverlay.querySelector('.chat-entry-card').innerHTML = `
      <h2>準備中です</h2>
      <p>チャットサーバーの設定が完了していません。<br>しばらくしてから再度お試しください。</p>
    `;
    entryOverlay.hidden = false;
  }

  function showNotice(text) {
    openEntry();
    let note = entryOverlay.querySelector('.chat-entry-error');
    if (!note) {
      note = document.createElement('p');
      note.className = 'chat-entry-error';
      entryOverlay.querySelector('.chat-entry-card').appendChild(note);
    }
    note.textContent = text;
  }
  function showConnectError() {
    showNotice('チャットへの接続に失敗しました。時間をおいて再度お試しください。');
  }

  function submitEntry() {
    entryNameInput.blur(); // dismiss the mobile keyboard so it can't cover the room
    const name = entryNameInput.value.trim().slice(0, NAME_MAX) || 'なまえ未設定';
    const avatarId = selectedAvatarId || AVATARS[0].id;
    profile = { name, avatar: avatarId };
    saveProfile(profile);
    closeEntry();
    applyMyAvatarButton();
    enterRoom();
  }
  entryEnterBtn.addEventListener('click', submitEntry);
  entryNameInput.addEventListener('keydown', (e) => {
    // Enter just dismisses the keyboard here -- the user still needs to see
    // the avatar picker below to choose one before actually entering.
    if (e.key === 'Enter') { e.preventDefault(); entryNameInput.blur(); }
  });
  myAvatarBtn.addEventListener('click', openEntry);

  function applyMyAvatarButton() {
    const a = avatarById(profile.avatar);
    myAvatarImg.src = a.src;
    myAvatarImg.alt = a.name;
  }

  /* ---------- avatar DOM ---------- */
  function createAvatarEl(isMe) {
    const el = document.createElement('div');
    el.className = 'chat-avatar' + (isMe ? ' is-me' : '');
    el.innerHTML = `
      <div class="chat-bubble" hidden></div>
      <img class="chat-avatar-img" alt="">
      <span class="chat-avatar-name"></span>
    `;
    stage.appendChild(el);
    return el;
  }
  function positionAvatarEl(el, x, y) {
    el.style.left = (x / WORLD_W) * 100 + '%';
    el.style.top = (y / WORLD_H) * 100 + '%';
  }
  const positionWorldEl = positionAvatarEl; // same world-space -> % conversion, used for non-avatar room objects too
  function setAvatarFacing(el, facing) {
    el.querySelector('.chat-avatar-img').style.transform = facing === 'left' ? 'scaleX(-1)' : 'scaleX(1)';
  }
  function showBubble(el, text) {
    const bubble = el.querySelector('.chat-bubble');
    bubble.textContent = text;
    bubble.hidden = false;
    clearTimeout(el._bubbleTimer);
    el._bubbleTimer = setTimeout(() => { bubble.hidden = true; }, BUBBLE_MS);
    playPon();
  }

  /* ========================================================================
     RHYTHM MINIGAME (popn) -- a cooperative shared session: whoever picks a
     song broadcasts just a {song, startAt, endAt} signal over Firebase, and
     every client independently decodes that track and runs the same simple
     onset-detector over it, so everyone ends up with an identical falling
     -note chart without needing to sync every single note over the network.
     Catching is cooperative too: a note counts as caught if ANY avatar
     (yourself or someone else, using their latest known on-screen position)
     is standing under its lane when it lands, and every client tallies that
     shared score locally from the same shared position data.
     ======================================================================== */
  const RHYTHM_SONGS = [
    { id: 'game1', name: 'ゲーム1', src: 'audio/ゲーム1.mp3' },
    { id: 'game2', name: 'ゲーム2', src: 'audio/ゲーム2.mp3' },
    { id: 'game3', name: 'ゲーム3', src: 'audio/ゲーム3.mp3' },
  ];
  const RHYTHM_PREROLL_MS = 3200; // gap between "song picked" and the first note actually falling -- gives every client time to decode+chart the track and count in together
  const RHYTHM_LANES = 5;
  const RHYTHM_NOTE_FALL_MS = 1500; // time a note takes to fall from the top of the room to the hit line
  const RHYTHM_HIT_TOLERANCE = AVATAR_W * 0.7;
  const RHYTHM_NOTE_SIZE = 42;
  const RHYTHM_STALE_GRACE_MS = 2000;

  let rhythmAudioCtx = null;
  function ensureRhythmAudioCtx() {
    if (!rhythmAudioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) rhythmAudioCtx = new Ctx();
    }
    return rhythmAudioCtx;
  }
  const rhythmAudio = new Audio();
  rhythmAudio.preload = 'auto';

  const rhythmChartCache = new Map(); // song id -> Promise<{ chart, durationMs }>

  function rhythmLaneXs() {
    const minX = AVATAR_W / 2 + 10;
    const maxX = WORLD_W - AVATAR_W / 2 - 10;
    const xs = [];
    for (let i = 0; i < RHYTHM_LANES; i++) xs.push(minX + (maxX - minX) * (i / (RHYTHM_LANES - 1)));
    return xs;
  }

  // Lightweight energy-based onset detector: downmix to mono, track short-window
  // RMS energy, flag frames where energy rises faster than the local recent
  // average (a simple "spectral flux" stand-in) as note onsets. This is not a
  // beat-accurate chart, but it does land notes on the track's actual hits/
  // accents rather than pure random timing.
  function buildChartFromBuffer(buffer) {
    const sr = buffer.sampleRate;
    const chans = buffer.numberOfChannels;
    const len = buffer.length;
    const mono = new Float32Array(len);
    for (let c = 0; c < chans; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < len; i++) mono[i] += data[i] / chans;
    }
    const hop = Math.round(sr * 0.01);
    const frame = Math.round(sr * 0.04);
    const numFrames = Math.max(0, Math.floor((len - frame) / hop));
    const energy = new Float32Array(numFrames);
    for (let f = 0; f < numFrames; f++) {
      let sum = 0;
      const start = f * hop;
      for (let i = 0; i < frame; i += 4) { // stride to keep this cheap on longer tracks
        const s = mono[start + i];
        sum += s * s;
      }
      energy[f] = Math.sqrt(sum / (frame / 4));
    }
    const flux = new Float32Array(numFrames);
    for (let f = 1; f < numFrames; f++) {
      const d = energy[f] - energy[f - 1];
      flux[f] = d > 0 ? d : 0;
    }
    const smoothWin = 10;
    const minGapFrames = Math.round(0.2 / 0.01);
    const laneXs = rhythmLaneXs();
    const chart = [];
    let lastFrameIdx = -Infinity;
    for (let f = 2; f < numFrames - 2; f++) {
      const lo = Math.max(0, f - smoothWin);
      const hi = Math.min(numFrames - 1, f + smoothWin);
      let sum = 0;
      for (let k = lo; k <= hi; k++) sum += flux[k];
      const mean = sum / (hi - lo + 1);
      const threshold = mean * 1.6 + 0.0012;
      if (flux[f] > threshold && flux[f] >= flux[f - 1] && flux[f] >= flux[f + 1] && f - lastFrameIdx >= minGapFrames) {
        const t = f * hop / sr;
        const idx = chart.length;
        // deterministic pseudo-random lane pick (same on every client, since it
        // only depends on the onset's own time/index) -- no shared seed needed
        const laneIdx = Math.floor(Math.abs(Math.sin(t * 12.9898 + idx)) * 1000) % laneXs.length;
        chart.push({ t, laneX: laneXs[laneIdx] });
        lastFrameIdx = f;
      }
    }
    return chart;
  }

  function analyzeSong(song) {
    if (rhythmChartCache.has(song.id)) return rhythmChartCache.get(song.id);
    const promise = fetch(song.src)
      .then((res) => res.arrayBuffer())
      .then((buf) => ensureRhythmAudioCtx().decodeAudioData(buf))
      .then((buffer) => ({
        chart: buildChartFromBuffer(buffer),
        durationMs: Math.round(buffer.duration * 1000),
      }));
    rhythmChartCache.set(song.id, promise);
    promise.catch(() => rhythmChartCache.delete(song.id)); // let a failed decode be retried later
    return promise;
  }

  /* ---------- shared cooperative catch detection ---------- */
  function avatarsNearLane(laneX) {
    const catchers = [];
    if (myEl && Math.abs(myState.x - laneX) <= RHYTHM_HIT_TOLERANCE) catchers.push(myEl);
    remoteAvatars.forEach((entry) => {
      if (Math.abs(entry.curX - laneX) <= RHYTHM_HIT_TOLERANCE) catchers.push(entry.el);
    });
    return catchers;
  }

  function flashAvatarCatch(el) {
    el.classList.remove('is-note-catch');
    void el.offsetWidth; // restart the CSS animation even if it's already mid-flash from a previous catch
    el.classList.add('is-note-catch');
    clearTimeout(el._catchGlowTimer);
    el._catchGlowTimer = setTimeout(() => el.classList.remove('is-note-catch'), 400);
  }

  /* ---------- toast ---------- */
  let rhythmToastTimer = null;
  function flashRoomToast(text) {
    if (!rhythmToastEl) return;
    rhythmToastEl.textContent = text;
    rhythmToastEl.hidden = false;
    requestAnimationFrame(() => rhythmToastEl.classList.add('is-visible'));
    clearTimeout(rhythmToastTimer);
    rhythmToastTimer = setTimeout(() => {
      rhythmToastEl.classList.remove('is-visible');
      setTimeout(() => { rhythmToastEl.hidden = true; }, 250);
    }, 2200);
  }

  /* ---------- movement lock (left/right only, snapped to the bottom row) ---------- */
  let movementLockedToGame = false;
  let bgmWasPlayingBeforeGame = false;
  function lockMovementToGame() {
    if (movementLockedToGame) return;
    movementLockedToGame = true;
    if (dpad) dpad.classList.add('is-rhythm-locked');
    bgmWasPlayingBeforeGame = !bgm.paused;
    bgm.pause(); // let the song being played take over instead of overlapping the room's ambient BGM
  }
  function unlockMovementFromGame() {
    if (!movementLockedToGame) return;
    movementLockedToGame = false;
    if (dpad) dpad.classList.remove('is-rhythm-locked');
    if (bgmWasPlayingBeforeGame) bgm.play().catch(() => {});
  }

  /* ---------- confirm / song-select dialogs ---------- */
  function openRhythmConfirm() { rhythmConfirmEl.hidden = false; }
  function closeRhythmConfirm() { rhythmConfirmEl.hidden = true; }
  function openRhythmSongSelect() {
    rhythmSongListEl.innerHTML = '';
    RHYTHM_SONGS.forEach((song) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-outline rhythm-song-btn';
      btn.textContent = song.name;
      btn.addEventListener('click', () => {
        closeRhythmSongSelect();
        requestStartRhythmSession(song);
      });
      rhythmSongListEl.appendChild(btn);
    });
    rhythmSongSelectEl.hidden = false;
  }
  function closeRhythmSongSelect() { rhythmSongSelectEl.hidden = true; }

  rhythmConfirmYesBtn && rhythmConfirmYesBtn.addEventListener('click', () => { closeRhythmConfirm(); openRhythmSongSelect(); });
  rhythmConfirmNoBtn && rhythmConfirmNoBtn.addEventListener('click', closeRhythmConfirm);
  rhythmSongCancelBtn && rhythmSongCancelBtn.addEventListener('click', closeRhythmSongSelect);
  rhythmResultCloseBtn && rhythmResultCloseBtn.addEventListener('click', () => { rhythmResultEl.hidden = true; });

  /* ---------- popn button (world object, part of the room itself) ---------- */
  const POPN_POS_KEY = 'acquaHousePopnPos';
  const POPN_DEFAULT_POS = { x: 150, y: 260 };
  const POPN_LONG_PRESS_MS = 450;
  const POPN_MOVE_CANCEL_PX = 10; // if the pointer wanders this far before the long-press fires, it's a stray touch/scroll, not drag intent

  function loadPopnPos() {
    try {
      const raw = JSON.parse(localStorage.getItem(POPN_POS_KEY));
      if (raw && Number.isFinite(raw.x) && Number.isFinite(raw.y)) return raw;
    } catch { /* ignore */ }
    return { ...POPN_DEFAULT_POS };
  }
  function savePopnPos(pos) {
    try { localStorage.setItem(POPN_POS_KEY, JSON.stringify(pos)); } catch { /* ignore */ }
  }
  function clientToWorld(clientX, clientY) {
    const rect = stage.getBoundingClientRect();
    return {
      x: clamp(((clientX - rect.left) / rect.width) * WORLD_W, 0, WORLD_W),
      y: clamp(((clientY - rect.top) / rect.height) * WORLD_H, 0, WORLD_H),
    };
  }

  const popnBtn = document.createElement('button');
  popnBtn.type = 'button';
  popnBtn.className = 'acqua-popn-btn';
  popnBtn.setAttribute('aria-label', 'ミニゲームを始める（長押しで移動できます）');
  popnBtn.innerHTML = '<img src="img/popn.png" alt="">';
  let popnPos = loadPopnPos();
  positionWorldEl(popnBtn, popnPos.x, popnPos.y);
  stage.appendChild(popnBtn);

  // long-press to drag it anywhere in the room; a plain tap still opens the
  // game dialog. Position is a per-browser preference (like the BGM volume
  // slider) rather than something synced to everyone else in the room.
  let popnLongPressTimer = null;
  let popnDragging = false;
  let popnDidDrag = false;

  function startPopnDrag() {
    popnDragging = true;
    popnDidDrag = true;
    popnBtn.classList.add('is-dragging');
  }
  function endPopnDrag() {
    if (!popnDragging) return;
    popnDragging = false;
    popnBtn.classList.remove('is-dragging');
    savePopnPos(popnPos);
  }

  popnBtn.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const startX = e.clientX, startY = e.clientY;
    popnDidDrag = false;
    clearTimeout(popnLongPressTimer);
    popnLongPressTimer = setTimeout(startPopnDrag, POPN_LONG_PRESS_MS);

    const onMove = (ev) => {
      if (popnDragging) {
        popnPos = clientToWorld(ev.clientX, ev.clientY);
        positionWorldEl(popnBtn, popnPos.x, popnPos.y);
      } else if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > POPN_MOVE_CANCEL_PX) {
        clearTimeout(popnLongPressTimer);
      }
    };
    const onUp = () => {
      clearTimeout(popnLongPressTimer);
      endPopnDrag();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  });

  popnBtn.addEventListener('click', () => {
    if (popnDidDrag) { popnDidDrag = false; return; } // this click just ended a drag -- don't also open the dialog
    if (!fbReady || !myUid) return;
    if (rhythmState) { flashRoomToast('いまはほかの人が音ゲー中だよ'); return; }
    openRhythmConfirm();
  });

  /* ---------- session lifecycle ---------- */
  let rhythmState = null;

  function requestStartRhythmSession(song) {
    flashRoomToast('曲を読み込み中…');
    analyzeSong(song).then(({ durationMs }) => getServerNow().then((serverNow) => {
      const startAt = serverNow + RHYTHM_PREROLL_MS;
      // a transaction (rather than a plain set) so two people tapping "start"
      // at nearly the same moment can't stomp each other's session -- only
      // the first write lands if nobody else's session is already active.
      return db.ref('game').transaction((current) => {
        if (current && current.active) return; // someone beat us to it -- abort, leave their session alone
        return {
          active: true,
          song: song.id,
          startedBy: myUid,
          startAt,
          endAt: startAt + durationMs,
        };
      });
    })).then((result) => {
      if (!result.committed) { flashRoomToast('いまはほかの人が音ゲー中だよ'); return; }
      db.ref('game').onDisconnect().update({ active: false }); // safety net if the starter drops mid-song
    }).catch(() => {
      flashRoomToast('曲の読み込みに失敗しました');
    });
  }

  function showRhythmHud() {
    rhythmScoreValEl.textContent = '0';
    rhythmHudEl.hidden = false;
  }
  function hideRhythmHud() { rhythmHudEl.hidden = true; }

  function showRhythmCountdown(delayMs) {
    rhythmCountdownEl.hidden = false;
    const endPerf = performance.now() + delayMs;
    clearInterval(rhythmState.countdownInterval);
    rhythmState.countdownInterval = setInterval(() => {
      const remain = endPerf - performance.now();
      rhythmCountdownEl.textContent = remain > 0 ? String(Math.ceil(remain / 1000)) : 'START!';
      if (remain <= 0) clearInterval(rhythmState.countdownInterval);
    }, 100);
  }
  function hideRhythmCountdown() {
    if (rhythmState) clearInterval(rhythmState.countdownInterval);
    rhythmCountdownEl.hidden = true;
  }

  function showRhythmResult(score) {
    rhythmResultScoreValEl.textContent = String(score);
    rhythmResultEl.hidden = false;
  }

  function spawnRhythmNote(entry) {
    const el = document.createElement('div');
    el.className = 'rhythm-note';
    el.style.width = RHYTHM_NOTE_SIZE + 'px';
    el.style.height = RHYTHM_NOTE_SIZE + 'px';
    stage.appendChild(el);
    rhythmState.notes.push({ el, laneX: entry.laneX, hitTime: entry.t, judged: false });
  }

  function actuallyStart(offsetMs) {
    const st = rhythmState;
    if (!st) return;
    hideRhythmCountdown();
    st.startPerf = performance.now() - offsetMs;
    st.started = true;
    if (st.chart) {
      let idx = st.chart.findIndex((e) => e.t * 1000 - RHYTHM_NOTE_FALL_MS > offsetMs);
      st.nextChartIndex = idx === -1 ? st.chart.length : idx;
    } else {
      st.nextChartIndex = 0;
    }
    rhythmAudio.src = st.song.src;
    rhythmAudio.currentTime = Math.max(0, offsetMs / 1000);
    rhythmAudio.play().catch(() => {});
  }

  function scheduleRhythmStart() {
    const st = rhythmState;
    getServerNow().then((serverNow) => {
      if (rhythmState !== st) return; // superseded by a newer/other session
      const delayMs = st.startAt - serverNow;
      if (delayMs > 80) {
        showRhythmCountdown(delayMs);
        st.startTimer = setTimeout(() => actuallyStart(0), delayMs);
      } else {
        const offset = Math.max(0, Math.min(-delayMs, st.durationMs - 200));
        actuallyStart(offset);
      }
    });
  }

  function enterRhythmGameMode(gameData) {
    if (rhythmState && rhythmState.startAt === gameData.startAt && rhythmState.song.id === gameData.song) return;
    exitRhythmGameMode();
    const song = RHYTHM_SONGS.find((s) => s.id === gameData.song);
    if (!song) return;
    rhythmState = {
      song,
      startAt: gameData.startAt,
      endAt: gameData.endAt,
      durationMs: gameData.endAt - gameData.startAt,
      startedBy: gameData.startedBy,
      score: 0,
      notes: [],
      nextChartIndex: 0,
      chart: null,
      started: false,
      ended: false,
      startTimer: null,
      countdownInterval: null,
    };
    rhythmResultEl.hidden = true; // clear any leftover result popup from a previous round
    showRhythmHud();
    lockMovementToGame();
    const st = rhythmState;
    analyzeSong(song).then(({ chart }) => {
      if (rhythmState !== st) return; // session already moved on
      st.chart = chart;
      scheduleRhythmStart();
    }).catch(() => {
      // decode failed -- the player stays locked to the bottom row (in sync
      // with everyone else) until the shared session's endAt is reached below
    });
  }

  function endRhythmGame() {
    const st = rhythmState;
    if (!st || st.ended) return;
    st.ended = true;
    clearTimeout(st.startTimer);
    clearInterval(st.countdownInterval);
    rhythmAudio.pause();
    st.notes.forEach((n) => n.el.remove());
    st.notes = [];
    hideRhythmCountdown();
    hideRhythmHud();
    showRhythmResult(st.score);
    unlockMovementFromGame();
    if (st.startedBy === myUid) {
      db.ref('game').onDisconnect().cancel();
      db.ref('game').update({ active: false }).catch(() => {});
    }
    rhythmState = null;
  }

  function exitRhythmGameMode() {
    if (!rhythmState) return;
    clearTimeout(rhythmState.startTimer);
    clearInterval(rhythmState.countdownInterval);
    rhythmAudio.pause();
    rhythmState.notes.forEach((n) => n.el.remove());
    hideRhythmCountdown();
    hideRhythmHud();
    unlockMovementFromGame();
    rhythmState = null;
  }

  function updateRhythmGame(perfNow) {
    const st = rhythmState;
    if (!st || !st.started || st.ended) return;
    const elapsedMs = perfNow - st.startPerf;

    if (st.chart) {
      while (st.nextChartIndex < st.chart.length
        && (st.chart[st.nextChartIndex].t * 1000 - RHYTHM_NOTE_FALL_MS) <= elapsedMs) {
        spawnRhythmNote(st.chart[st.nextChartIndex]);
        st.nextChartIndex++;
      }
    }

    st.notes = st.notes.filter((n) => {
      const startMs = n.hitTime * 1000 - RHYTHM_NOTE_FALL_MS;
      const progress = (elapsedMs - startMs) / RHYTHM_NOTE_FALL_MS;
      const y = clamp(progress, 0, 1) * WORLD_H;
      positionWorldEl(n.el, n.laneX, y);
      if (!n.judged && progress >= 0.97) {
        n.judged = true;
        const catchers = avatarsNearLane(n.laneX);
        if (catchers.length) {
          st.score++;
          rhythmScoreValEl.textContent = String(st.score);
          n.el.classList.add('is-hit');
          catchers.forEach(flashAvatarCatch);
          playPon();
        } else {
          n.el.classList.add('is-miss');
        }
      }
      if (progress >= 1.2) { n.el.remove(); return false; }
      return true;
    });

    if (elapsedMs >= st.durationMs) endRhythmGame();
  }

  function attachRhythmGameListener() {
    db.ref('game').on('value', (snap) => {
      const data = snap.val();
      if (data && data.active) {
        getServerNow().then((now) => {
          const liveData = data; // (re-check nothing changed while awaiting server time)
          if (now > liveData.endAt + RHYTHM_STALE_GRACE_MS) {
            db.ref('game').update({ active: false }).catch(() => {}); // stale session that never got cleaned up (e.g. starter dropped offline) -- self-heal
            return;
          }
          enterRhythmGameMode(liveData);
        });
      } else {
        exitRhythmGameMode();
      }
    });
  }

  /* ---------- movement input ---------- */
  window.addEventListener('keydown', (e) => {
    if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
    const k = e.key.toLowerCase();
    if (MOVE_KEYS.includes(k)) {
      keys.add(k);
      markActivity();
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => { keys.delete(e.key.toLowerCase()); });
  window.addEventListener('blur', () => keys.clear());

  function bindDpadButton(btn, key) {
    if (!btn) return;
    const press = (e) => { e.preventDefault(); keys.add(key); markActivity(); };
    const release = (e) => { e.preventDefault(); keys.delete(key); };
    btn.addEventListener('pointerdown', press);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointerleave', release);
    btn.addEventListener('pointercancel', release);
  }
  if (dpad) {
    bindDpadButton(dpad.querySelector('[data-dir="up"]'), 'arrowup');
    bindDpadButton(dpad.querySelector('[data-dir="down"]'), 'arrowdown');
    bindDpadButton(dpad.querySelector('[data-dir="left"]'), 'arrowleft');
    bindDpadButton(dpad.querySelector('[data-dir="right"]'), 'arrowright');
  }

  let lastFrame = performance.now();
  let loopStarted = false;
  function loop(now) {
    const dt = Math.min((now - lastFrame) / 1000, 0.1);
    lastFrame = now;

    if (myEl) {
      let dx = 0, dy = 0;
      if (keys.has('arrowup') || keys.has('w')) dy -= 1;
      if (keys.has('arrowdown') || keys.has('s')) dy += 1;
      if (keys.has('arrowleft') || keys.has('a')) dx -= 1;
      if (keys.has('arrowright') || keys.has('d')) dx += 1;
      // during the rhythm minigame everyone is pinned to the bottom row and
      // can only shuffle left/right to get under falling notes
      if (movementLockedToGame) dy = 0;

      const moving = dx !== 0 || dy !== 0;
      if (moving) {
        const len = Math.hypot(dx, dy) || 1;
        // (x,y) is the avatar's feet/bottom-center point (see the translate(-50%,-100%)
        // in CSS), so the walkable range has to be offset by the avatar's own footprint
        // rather than starting the clamp at 0 -- otherwise the bottom/side margins are
        // wasted and the avatar can't actually reach the edges of the room.
        myState.x = clamp(myState.x + (dx / len) * MOVE_SPEED * dt, AVATAR_W / 2, WORLD_W - AVATAR_W / 2);
        myState.y = clamp(myState.y + (dy / len) * MOVE_SPEED * dt, AVATAR_H, WORLD_H);
        if (dx < 0) myState.facing = 'left';
        if (dx > 0) myState.facing = 'right';
      }
      if (movementLockedToGame) myState.y = WORLD_H;
      myEl.classList.toggle('is-walking', moving);
      positionAvatarEl(myEl, myState.x, myState.y);
      setAvatarFacing(myEl, myState.facing);

      if (presenceRef && now - lastSendAt > POS_SEND_MS) {
        lastSendAt = now;
        const changed = !lastSendPos
          || Math.abs(lastSendPos.x - myState.x) > 0.5
          || Math.abs(lastSendPos.y - myState.y) > 0.5
          || lastSendPos.facing !== myState.facing;
        if (changed) {
          lastSendPos = { x: myState.x, y: myState.y, facing: myState.facing };
          presenceRef.update({
            x: myState.x, y: myState.y, facing: myState.facing,
            updatedAt: firebase.database.ServerValue.TIMESTAMP,
          });
        }
      }
    }

    // Smoothly chase each remote avatar's latest known network position
    // instead of snapping to it -- see the comment above updateRemoteAvatar().
    const remoteLerp = Math.min(1, REMOTE_CATCHUP_RATE * dt);
    remoteAvatars.forEach((entry) => {
      entry.curX += (entry.targetX - entry.curX) * remoteLerp;
      entry.curY += (entry.targetY - entry.curY) * remoteLerp;
      positionAvatarEl(entry.el, entry.curX, entry.curY);
      setAvatarFacing(entry.el, entry.targetFacing);
    });

    if (rhythmState && rhythmState.started && !rhythmState.ended) updateRhythmGame(now);

    requestAnimationFrame(loop);
  }

  /* ---------- remote presence sync ---------- */
  // Remote positions only arrive over the network every POS_SEND_MS (120ms),
  // so snapping straight to each new (x,y) makes other people's avatars look
  // stepped/choppy next to our own locally-simulated, every-frame movement.
  // Instead we keep a target (latest known network position) and smoothly
  // chase it every animation frame -- see the interpolation step in loop().
  const REMOTE_CATCHUP_RATE = 18; // higher = snappier but jerkier, lower = smoother but laggier
  function updateRemoteAvatar(uid, data) {
    const entry = remoteAvatars.get(uid);
    if (!entry || !data) return;
    const a = avatarById(data.avatar);
    const img = entry.el.querySelector('.chat-avatar-img');
    if (img.getAttribute('src') !== a.src) img.src = a.src;
    entry.el.querySelector('.chat-avatar-name').textContent = data.name || '';

    const newX = data.x || 0;
    const newY = data.y || 0;
    const moved = Math.abs(newX - entry.targetX) > 0.5 || Math.abs(newY - entry.targetY) > 0.5;
    entry.targetX = newX;
    entry.targetY = newY;
    entry.targetFacing = data.facing || 'right';
    if (moved) {
      // Sender only pushes updates while actually moving, so if no fresher
      // position shows up soon, assume they've stopped and drop the bob animation.
      entry.el.classList.add('is-walking');
      clearTimeout(entry.walkTimer);
      entry.walkTimer = setTimeout(() => entry.el.classList.remove('is-walking'), POS_SEND_MS * 2);
    }

    // Only (re)show the bubble/pon sound when this is actually a new message --
    // otherwise every unrelated presence update (movement, etc.) within the
    // 5s bubble window re-triggers it as long as messageAt is still "recent".
    if (data.message && data.messageAt && data.messageAt !== entry.lastMessageAt
        && Date.now() - data.messageAt < BUBBLE_MS) {
      entry.lastMessageAt = data.messageAt;
      showBubble(entry.el, data.message);
    }
  }

  function attachPresenceListeners() {
    const presenceRoot = db.ref('presence');
    presenceRoot.on('child_added', (snap) => {
      const uid = snap.key;
      if (uid === myUid) return;
      const data = snap.val() || {};
      const startX = data.x || WORLD_W / 2;
      const startY = data.y || WORLD_H / 2;
      const el = createAvatarEl(false);
      positionAvatarEl(el, startX, startY);
      setAvatarFacing(el, data.facing || 'right');
      remoteAvatars.set(uid, {
        el, curX: startX, curY: startY,
        targetX: startX, targetY: startY, targetFacing: data.facing || 'right',
        lastMessageAt: null, walkTimer: null,
      });
      updateRemoteAvatar(uid, data);
    });
    presenceRoot.on('child_changed', (snap) => {
      if (snap.key === myUid) return;
      updateRemoteAvatar(snap.key, snap.val());
    });
    presenceRoot.on('child_removed', (snap) => {
      const entry = remoteAvatars.get(snap.key);
      if (entry) { entry.el.remove(); remoteAvatars.delete(snap.key); }
    });
    presenceRoot.on('value', (snap) => {
      onlineCountEl.textContent = snap.numChildren();
    });
  }

  /* ---------- chat log ---------- */
  function appendLogLine(entry) {
    const row = document.createElement('p');
    row.className = 'chat-log-row';
    const time = entry.createdAt ? new Date(entry.createdAt) : new Date();
    const hh = String(time.getHours()).padStart(2, '0');
    const mm = String(time.getMinutes()).padStart(2, '0');
    row.innerHTML = `<span class="chat-log-time">${hh}:${mm}</span><span class="chat-log-name">${escapeHtml(entry.name || '')}</span><span class="chat-log-text">${escapeHtml(entry.text || '')}</span>`;
    logEl.appendChild(row);
    while (logEl.children.length > LOG_LIMIT) logEl.removeChild(logEl.firstChild);
    logEl.scrollTop = logEl.scrollHeight;
  }
  let logQuery = null;
  let logCallback = null;
  let logAttachToken = 0;
  function getServerNow() {
    // Date.now() alone can't be trusted here -- if the client clock is even
    // a little behind the server, "new" messages sent right after we join
    // would still land after our startAt cutoff and leak through.
    return db.ref('.info/serverTimeOffset').once('value')
      .then(snap => Date.now() + (snap.val() || 0))
      .catch(() => Date.now());
  }
  function attachLogListener() {
    // Only messages sent from this moment on -- leaving/re-entering (or a
    // fresh visit) should never show a log full of stuff said before you
    // showed up.
    const token = ++logAttachToken;
    getServerNow().then(startTime => {
      if (token !== logAttachToken) return; // left again before this resolved
      logQuery = db.ref('log').orderByChild('createdAt').startAt(startTime);
      logCallback = (snap) => appendLogLine(snap.val());
      logQuery.on('child_added', logCallback);
    });
  }
  function detachLogListener() {
    logAttachToken++; // invalidate any attach still waiting on getServerNow()
    if (logQuery && logCallback) logQuery.off('child_added', logCallback);
    logQuery = null;
    logCallback = null;
    logEl.innerHTML = '';
  }

  /* ---------- sending messages ---------- */
  inputForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = inputText.value.trim().slice(0, MSG_MAX);
    if (!text || !fbReady || !presenceRef) return;
    const now = Date.now();
    if (now - lastMessageSentAt < SEND_COOLDOWN_MS) return;
    lastMessageSentAt = now;
    markActivity();
    inputText.value = '';
    inputText.blur(); // dismiss the on-screen keyboard so mobile users see the room again right away

    presenceRef.update({ message: text, messageAt: firebase.database.ServerValue.TIMESTAMP });
    if (myEl) showBubble(myEl, text);
    db.ref('log').push({ uid: myUid, name: profile.name, text, createdAt: firebase.database.ServerValue.TIMESTAMP });
  });

  /* ---------- idle timeout + stale-peer cleanup ---------- */
  function sweepStalePeers() {
    const cutoff = Date.now() - IDLE_LIMIT_MS;
    db.ref('presence').once('value').then((snap) => {
      snap.forEach((child) => {
        if (child.key === myUid) return;
        const updatedAt = child.child('updatedAt').val();
        if (typeof updatedAt === 'number' && updatedAt < cutoff) {
          child.ref.remove().catch(() => {});
        }
      });
    }).catch(() => {});
  }

  function startIdleWatch() {
    stopIdleWatch();
    idleIntervalId = setInterval(() => {
      if (!presenceRef) return;
      if (Date.now() - lastActivityAt > IDLE_LIMIT_MS) {
        clearMyPresence();
        showNotice('1時間操作がなかったため自動的に退室しました。');
        return;
      }
      sweepStalePeers();
    }, IDLE_CHECK_MS);
  }
  function stopIdleWatch() {
    if (idleIntervalId) { clearInterval(idleIntervalId); idleIntervalId = null; }
  }

  /* ---------- leave room ---------- */
  function clearMyPresence() {
    let removed = Promise.resolve();
    if (presenceRef) {
      presenceRef.onDisconnect().cancel();
      removed = presenceRef.remove().catch(() => {});
      presenceRef = null;
    }
    if (myEl) { myEl.remove(); myEl = null; }
    stopIdleWatch();
    if (leaveBtn) leaveBtn.hidden = true;
    stopBgm();
    detachLogListener();
    exitRhythmGameMode();
    return removed; // let callers wait for this before navigating away
  }

  if (leaveBtn) {
    leaveBtn.addEventListener('click', () => {
      // Wait for the presence delete to actually reach the server -- firing
      // off navigation right away can abort the in-flight request and leave
      // a ghost avatar behind.
      clearMyPresence().then(() => { window.location.href = 'index.html'; });
    });
  }

  /* ---------- fullscreen (best-effort; unsupported on iOS Safari) ---------- */
  if (fullscreenBtn && document.documentElement.requestFullscreen) {
    fullscreenBtn.hidden = false;
    fullscreenBtn.addEventListener('click', () => {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      } else {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    });
  }

  /* ---------- room entry ---------- */
  function enterRoom() {
    if (!fbReady) { showSetupNotice(); return; }

    const ready = () => {
      myUid = auth.currentUser.uid;
      presenceRef = db.ref('presence/' + myUid);
      myState.x = WORLD_W / 2 + (Math.random() - 0.5) * 100;
      myState.y = WORLD_H / 2 + (Math.random() - 0.5) * 60;
      myEl = createAvatarEl(true);
      myEl.querySelector('.chat-avatar-img').src = avatarById(profile.avatar).src;
      myEl.querySelector('.chat-avatar-name').textContent = profile.name;
      positionAvatarEl(myEl, myState.x, myState.y);

      presenceRef.set({
        name: profile.name,
        avatar: profile.avatar,
        x: myState.x,
        y: myState.y,
        facing: myState.facing,
        updatedAt: firebase.database.ServerValue.TIMESTAMP,
      });
      presenceRef.onDisconnect().remove();
      notifyEntry(profile.name, avatarById(profile.avatar).name);

      if (!listenersAttached) {
        listenersAttached = true;
        attachPresenceListeners();
        attachRhythmGameListener();
      }
      attachLogListener(); // fresh each entry so old messages never show up
      if (!loopStarted) { loopStarted = true; requestAnimationFrame(loop); }

      markActivity();
      startIdleWatch();
      if (leaveBtn) leaveBtn.hidden = false;
      playBgm();
    };

    if (auth.currentUser) {
      ready();
    } else {
      auth.signInAnonymously().then(ready).catch((err) => {
        console.error('[chat] anonymous sign-in failed', err);
        showConnectError();
      });
    }
  }

  /* ---------- init ---------- */
  openEntry();
})();
