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
    { id: 'a', name: 'A', src: 'img/A/A.png', gender: 'male' },
    { id: 'b', name: 'B', src: 'img/B/B.png', gender: 'male' },
    { id: 'c', name: 'C', src: 'img/C/C.png', gender: 'male' },
    { id: 'd', name: 'D', src: 'img/D/D.png', gender: 'male' },
    { id: 'e', name: 'E', src: 'img/E/E.png', gender: 'male' },
    { id: 'f', name: 'F', src: 'img/F/F.png', gender: 'male' },
    { id: 'g', name: 'G', src: 'img/G/G.png', gender: 'male' },
    { id: 'h', name: 'H', src: 'img/H/H.png', gender: 'female' },
    { id: 'i', name: 'I', src: 'img/I/I.png', gender: 'female' },
    { id: 'j', name: 'J', src: 'img/J/J.png', gender: 'female' },
    { id: 'k', name: 'K', src: 'img/K/K.png', gender: 'female' },
    { id: 'l', name: 'L', src: 'img/L/L.png', gender: 'female' },
    { id: 'm', name: 'M', src: 'img/M/M.png', gender: 'female' },
    { id: 'n', name: 'N', src: 'img/N/N.png', gender: 'female', restricted: true },
    { id: 'oz', name: 'OZ', src: 'img/OZ_kawaii/OZ_kawaii.png', restricted: true },
    { id: 'yuu', name: 'YUU', src: 'img/YUU_kawaii/YUU_kawaii.png', restricted: true },
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
  const myState = { x: WORLD_W / 2, y: WORLD_H / 2, facing: 'left' };
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

  // Genki Dama's landing shakes the room: the moment it bursts (see
  // updateGenkiFlights), everyone's ambient BGM and background swap to these
  // (triggerHoukaiEffect below), reverting on their own once this track
  // finishes playing.
  const houkaiBgm = new Audio('audio/houkai.mp3');
  houkaiBgm.preload = 'none';

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
    houkaiBgm.volume = bgm.volume;
    houkaiBgm.muted = bgm.muted;
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

  let bgmWasPlayingBeforeHoukai = false;
  function endHoukaiEffect() {
    stage.classList.remove('is-houkai');
    houkaiBgm.pause();
    houkaiBgm.currentTime = 0;
    if (bgmWasPlayingBeforeHoukai) bgm.play().catch(() => {});
  }
  houkaiBgm.addEventListener('ended', endHoukaiEffect);
  houkaiBgm.addEventListener('error', endHoukaiEffect); // don't get stuck on the destroyed room if the track fails to load/play
  function triggerHoukaiEffect() {
    stage.classList.add('is-houkai');
    bgmWasPlayingBeforeHoukai = !bgm.paused;
    bgm.pause(); // let houkai.mp3 take over instead of overlapping the room's ambient BGM
    houkaiBgm.currentTime = 0;
    houkaiBgm.play().catch(() => {});
  }

  // Ducks the ambient BGM while a YouTube video (js/youtube-widget.js) is
  // actively playing in the room -- same idea as the houkai/rhythm-game
  // ducking above, just triggered by that script's onPlayState hook instead
  // of a local event, since js/youtube-widget.js knows nothing about chat.js
  // (and chat.js needn't know anything about Firebase/the YouTube API).
  let bgmWasPlayingBeforeYoutube = false;
  if (window.YoutubeWidget) {
    window.YoutubeWidget.onPlayState((isPlaying) => {
      if (isPlaying) {
        if (bgm.paused) return; // nothing playing to duck
        bgmWasPlayingBeforeYoutube = true;
        bgm.pause();
      } else if (bgmWasPlayingBeforeYoutube) {
        bgmWasPlayingBeforeYoutube = false;
        bgm.play().catch(() => {});
      }
    });
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
  // Sets a CSS custom property rather than el.style.transform directly --
  // walking/ball-hit CSS animations also animate transform on this same
  // element, and a plain inline transform gets silently discarded for as
  // long as one of those animations is running (see the comment above
  // .chat-avatar-img in chat.css). Every keyframe there composes
  // scaleX(var(--facing-scale)) into its own transform so the mirror
  // survives regardless of which animation (if any) is currently active.
  function setAvatarFacing(el, facing) {
    // Every avatar's base art is drawn facing left, so left needs no mirror
    // and only right has to flip it via scaleX(-1).
    el.querySelector('.chat-avatar-img').style.setProperty('--facing-scale', facing === 'right' ? '-1' : '1');
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
  const RHYTHM_HIT_LINE_Y = WORLD_H - AVATAR_H * 0.45; // roughly chest height -- catches are decided and vanish here instead of down at the feet
  const RHYTHM_MISS_FALL_MS = 260; // extra fall time for a miss to keep dropping from the catch line down to the floor
  const RHYTHM_MISS_FADE_MS = 150; // matches .rhythm-note.is-miss's CSS transition duration
  const RHYTHM_HIT_FADE_MS = 200; // matches .rhythm-note.is-hit's CSS transition duration (with a little margin)
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
  rhythmAudio.volume = 0.5;

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
    // thin the detected onsets down to half -- keeps the same timing feel
    // without doubling every other beat, just fewer notes overall.
    return chart.filter((_, i) => i % 2 === 0);
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
  // A mouse can hold dead-still for 450ms; a finger naturally can't -- on a
  // touchscreen this stayed well under 10px almost never, silently
  // cancelling the long-press before it ever fired and making popn.png/
  // monitor.png effectively undraggable on mobile. Wide enough now to
  // absorb normal finger tremor while still catching an actual drag/swipe.
  const POPN_MOVE_CANCEL_PX = 24;

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

    // Capture the pointer on the button itself so every subsequent move/up
    // for this gesture keeps routing here even if the button has already
    // been dragged underneath some other overlay (dpad, chat log, etc.) --
    // otherwise a drag that ends up behind another element could get its
    // release event "stolen", leaving the drag stuck or unable to restart.
    try { popnBtn.setPointerCapture(e.pointerId); } catch { /* ignore */ }

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
      try { popnBtn.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      popnBtn.removeEventListener('pointermove', onMove);
      popnBtn.removeEventListener('pointerup', onUp);
      popnBtn.removeEventListener('pointercancel', onUp);
    };
    popnBtn.addEventListener('pointermove', onMove);
    popnBtn.addEventListener('pointerup', onUp);
    popnBtn.addEventListener('pointercancel', onUp);
  });

  popnBtn.addEventListener('click', () => {
    if (popnDidDrag) { popnDidDrag = false; return; } // this click just ended a drag -- don't also open the dialog
    if (!fbReady || !myUid) return;
    if (rhythmState) { flashRoomToast('いまはほかの人が音ゲー中だよ'); return; }
    openRhythmConfirm();
  });

  /* ---------- monitor button (world object, opens js/youtube-widget.js) ---------- */
  // Same long-press-to-drag / tap-to-open interaction as popn.png above --
  // deliberately a standalone draggable prop rather than a tap zone on the
  // background image itself (see Cloud.md's "見送った機能" entry for why the
  // cover-fit hit-testing approach was dropped in favor of this).
  const MONITOR_POS_KEY = 'acquaHouseMonitorPos';
  const MONITOR_DEFAULT_POS = { x: 800, y: 430 }; // bottom-right corner, clear of the in-room YouTube screen over the big window (see js/youtube-widget.js)

  function loadMonitorPos() {
    try {
      const raw = JSON.parse(localStorage.getItem(MONITOR_POS_KEY));
      if (raw && Number.isFinite(raw.x) && Number.isFinite(raw.y)) return raw;
    } catch { /* ignore */ }
    return { ...MONITOR_DEFAULT_POS };
  }
  function saveMonitorPos(pos) {
    try { localStorage.setItem(MONITOR_POS_KEY, JSON.stringify(pos)); } catch { /* ignore */ }
  }

  const monitorBtn = document.createElement('button');
  monitorBtn.type = 'button';
  monitorBtn.className = 'acqua-monitor-btn';
  monitorBtn.setAttribute('aria-label', 'YouTubeを見る（長押しで移動できます）');
  monitorBtn.innerHTML = '<img src="img/monitor.png" alt="">';
  let monitorPos = loadMonitorPos();
  positionWorldEl(monitorBtn, monitorPos.x, monitorPos.y);
  stage.appendChild(monitorBtn);

  let monitorLongPressTimer = null;
  let monitorDragging = false;
  let monitorDidDrag = false;

  function startMonitorDrag() {
    monitorDragging = true;
    monitorDidDrag = true;
    monitorBtn.classList.add('is-dragging');
  }
  function endMonitorDrag() {
    if (!monitorDragging) return;
    monitorDragging = false;
    monitorBtn.classList.remove('is-dragging');
    saveMonitorPos(monitorPos);
  }

  monitorBtn.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const startX = e.clientX, startY = e.clientY;
    monitorDidDrag = false;
    clearTimeout(monitorLongPressTimer);
    monitorLongPressTimer = setTimeout(startMonitorDrag, POPN_LONG_PRESS_MS); // same drag-gesture thresholds as popn.png

    try { monitorBtn.setPointerCapture(e.pointerId); } catch { /* ignore */ }

    const onMove = (ev) => {
      if (monitorDragging) {
        monitorPos = clientToWorld(ev.clientX, ev.clientY);
        positionWorldEl(monitorBtn, monitorPos.x, monitorPos.y);
      } else if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > POPN_MOVE_CANCEL_PX) {
        clearTimeout(monitorLongPressTimer);
      }
    };
    const onUp = () => {
      clearTimeout(monitorLongPressTimer);
      endMonitorDrag();
      try { monitorBtn.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      monitorBtn.removeEventListener('pointermove', onMove);
      monitorBtn.removeEventListener('pointerup', onUp);
      monitorBtn.removeEventListener('pointercancel', onUp);
    };
    monitorBtn.addEventListener('pointermove', onMove);
    monitorBtn.addEventListener('pointerup', onUp);
    monitorBtn.addEventListener('pointercancel', onUp);
  });

  monitorBtn.addEventListener('click', () => {
    if (monitorDidDrag) { monitorDidDrag = false; return; } // this click just ended a drag -- don't also open the panel
    if (window.YoutubeWidget) window.YoutubeWidget.open();
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
      if (!n.judged) {
        // falling phase: rises toward RHYTHM_HIT_LINE_Y (around chest height)
        // -- that's where a catch is decided, not down at the feet/floor.
        const startMs = n.hitTime * 1000 - RHYTHM_NOTE_FALL_MS;
        const rawProgress = (elapsedMs - startMs) / RHYTHM_NOTE_FALL_MS;
        positionWorldEl(n.el, n.laneX, clamp(rawProgress, 0, 1) * RHYTHM_HIT_LINE_Y);
        if (rawProgress >= 1) {
          n.judged = true;
          n.judgedAtMs = elapsedMs;
          const catchers = avatarsNearLane(n.laneX);
          if (catchers.length) {
            n.missed = false;
            st.score++;
            rhythmScoreValEl.textContent = String(st.score);
            n.el.classList.add('is-hit');
            catchers.forEach(flashAvatarCatch);
            playPon();
          } else {
            n.missed = true;
          }
        }
        return true;
      }

      if (n.missed) {
        // a miss keeps falling the rest of the way to the floor instead of
        // vanishing at chest height like a catch does, so it still reads as
        // "dropped" rather than "caught".
        const fallProgress = clamp((elapsedMs - n.judgedAtMs) / RHYTHM_MISS_FALL_MS, 0, 1);
        positionWorldEl(n.el, n.laneX, RHYTHM_HIT_LINE_Y + (WORLD_H - RHYTHM_HIT_LINE_Y) * fallProgress);
        if (fallProgress >= 1) {
          if (!n.el.classList.contains('is-miss')) n.el.classList.add('is-miss'); // trigger the fade-out only once it lands
          if (elapsedMs - n.judgedAtMs >= RHYTHM_MISS_FALL_MS + RHYTHM_MISS_FADE_MS) { n.el.remove(); return false; }
        }
        return true;
      }

      // caught -- frozen at the chest-height catch point, just fading out
      if (elapsedMs - n.judgedAtMs >= RHYTHM_HIT_FADE_MS) { n.el.remove(); return false; }
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

  /* ========================================================================
     ROOM BALL (catch / kick) -- a shared toy sitting in the room. Pressing
     catch near it picks it up (it follows whoever's holding it); pressing
     kick sends it flying in whichever way you're currently facing. Only the
     kick EVENT (start position/velocity/time) travels over Firebase, like
     the rhythm chart's timing -- every client then derives the ball's
     flight position locally from that, so there's no need to broadcast its
     position every frame. Getting hit is cosmetic only (a little shake +
     sound); it never affects movement, so small cross-client disagreement
     about an exact hit doesn't matter.
     ======================================================================== */
  const BALL_SIZE = 44;
  const BALL_CATCH_RADIUS = AVATAR_W * 0.9;
  const BALL_KICK_RADIUS = AVATAR_W * 0.9;
  const BALL_KICK_SPEED = 520; // world units / second
  const BALL_GRAVITY = 900; // world units / s^2, pulls the ball back down toward the floor
  const BALL_BOUNCE_DAMP = 0.55; // speed kept after each wall/floor bounce
  const BALL_MAX_FLIGHT_MS = 3200; // long enough to let it bounce a few times before it's declared landed
  const BALL_HIT_RADIUS = AVATAR_W * 0.6;
  // the ball's div is centered on its (x,y) via translate(-50%,-50%) (unlike
  // avatars, which are anchored at their feet), so the floor it bounces/rests
  // on has to sit half the ball's height above WORLD_H -- otherwise its
  // center would touch the true floor line and it'd look sunk in halfway.
  const BALL_FLOOR_Y = WORLD_H - BALL_SIZE / 2;
  const BALL_DEFAULT_POS = { x: WORLD_W / 2, y: WORLD_H / 2 };

  function randomRange(min, max) { return min + Math.random() * (max - min); }

  // Deterministic bounce-physics replay: given the kick's starting
  // position/velocity and how much time has passed, step a simple
  // gravity+bounce simulation forward with a fixed timestep. Every client
  // runs the exact same arithmetic on the exact same inputs, so they all
  // land on the same position at any given moment without needing the
  // ball's position broadcast frame-by-frame -- only the kick itself synced.
  function simulateBallFlight(kick, elapsedSec) {
    const dt = 1 / 90;
    let x = kick.fromX, y = kick.fromY, vx = kick.vx, vy = kick.vy;
    let t = 0;
    while (t < elapsedSec) {
      const step = Math.min(dt, elapsedSec - t);
      vy += BALL_GRAVITY * step;
      x += vx * step;
      y += vy * step;
      if (x < 0) { x = 0; vx = -vx * BALL_BOUNCE_DAMP; }
      else if (x > WORLD_W) { x = WORLD_W; vx = -vx * BALL_BOUNCE_DAMP; }
      if (y > BALL_FLOOR_Y) { y = BALL_FLOOR_Y; vy = -vy * BALL_BOUNCE_DAMP; }
      else if (y < 0) { y = 0; vy = -vy * BALL_BOUNCE_DAMP; }
      t += step;
    }
    return { x, y, vx, vy };
  }

  const ballEl = document.createElement('div');
  ballEl.className = 'room-ball';
  ballEl.style.width = BALL_SIZE + 'px';
  ballEl.style.height = BALL_SIZE + 'px';
  stage.appendChild(ballEl);

  const ballHitSfx = new Audio('audio/poko.mp3');
  ballHitSfx.volume = 0.6;
  function playBallHitSfx() {
    try { ballHitSfx.currentTime = 0; ballHitSfx.play().catch(() => {}); } catch { /* ignore */ }
  }
  const ballThrowSfx = new Audio('audio/syu!.mp3');
  ballThrowSfx.volume = 0.6;
  function playBallThrowSfx() {
    try { ballThrowSfx.currentTime = 0; ballThrowSfx.play().catch(() => {}); } catch { /* ignore */ }
  }
  const ballKickSfx = new Audio('audio/bon.mp3');
  ballKickSfx.volume = 0.6;
  function playBallKickSfx() {
    try { ballKickSfx.currentTime = 0; ballKickSfx.play().catch(() => {}); } catch { /* ignore */ }
  }
  const ballBounceSfx = new Audio('audio/piyon.mp3');
  ballBounceSfx.volume = 0.5;
  function playBallBounceSfx() {
    try { ballBounceSfx.currentTime = 0; ballBounceSfx.play().catch(() => {}); } catch { /* ignore */ }
  }
  // Each special move gets its own charge/release sound pair so YUU's beam
  // and N's genki dama don't sound identical.
  const chargeSfx = new Audio('audio/charge.mp3');
  chargeSfx.volume = 0.6;
  const releaseSfx = new Audio('audio/basyuu.mp3');
  releaseSfx.volume = 0.7;
  const genkiChargeSfx = new Audio('audio/charge2.mp3');
  genkiChargeSfx.volume = 0.6;
  const genkiReleaseSfx = new Audio('audio/genkidama.mp3');
  genkiReleaseSfx.volume = 0.7;
  function playChargeSfx(move) {
    const sfx = move === 'genkidama' ? genkiChargeSfx : chargeSfx;
    try { sfx.currentTime = 0; sfx.play().catch(() => {}); } catch { /* ignore */ }
  }
  function playReleaseSfx(move) {
    const chargeEl = move === 'genkidama' ? genkiChargeSfx : chargeSfx;
    const releaseEl = move === 'genkidama' ? genkiReleaseSfx : releaseSfx;
    try { chargeEl.pause(); chargeEl.currentTime = 0; } catch { /* ignore */ } // cut the charge sound off the moment the release fires
    try { releaseEl.currentTime = 0; releaseEl.play().catch(() => {}); } catch { /* ignore */ }
  }
  let ballLastVx = null;
  let ballLastVy = null; // previous frame's flight velocity, used to detect a wall/floor/ceiling bounce (a sign flip) for piyon.mp3

  let ballState = null; // latest value from Firebase: { state: 'idle'|'held'|'flying', x, y, heldBy, kick }
  let ballKickStartPerf = null; // performance.now() anchor matching ballState.kick.atMs (recomputed whenever a new kick shows up)
  let ballHitAvatars = new Set(); // avatars already reacted-to during the current flight, so one pass doesn't re-trigger every frame
  let ballLandingPending = false; // guards against spamming the "it landed" transaction every frame while waiting for Firebase to catch up

  function ballPositionNow() {
    if (!ballState) return BALL_DEFAULT_POS;
    if (ballState.state === 'held') {
      if (ballState.heldBy === myUid && myEl) return { x: myState.x, y: myState.y - AVATAR_H * 0.5 };
      const entry = remoteAvatars.get(ballState.heldBy);
      if (entry) return { x: entry.curX, y: entry.curY - AVATAR_H * 0.5 };
      return { x: ballState.x ?? BALL_DEFAULT_POS.x, y: ballState.y ?? BALL_DEFAULT_POS.y }; // holder unknown (maybe already left) -- fall back
    }
    if (ballState.state === 'flying' && ballState.kick && ballKickStartPerf !== null) {
      const elapsedSec = Math.max(0, (performance.now() - ballKickStartPerf) / 1000);
      const sim = simulateBallFlight(ballState.kick, elapsedSec);
      return { x: sim.x, y: sim.y };
    }
    return { x: ballState.x ?? BALL_DEFAULT_POS.x, y: ballState.y ?? BALL_DEFAULT_POS.y };
  }

  function updateBall(nowPerf) {
    if (!ballState) return;
    const pos = ballPositionNow();
    positionWorldEl(ballEl, pos.x, pos.y);
    ballEl.classList.toggle('is-flying', ballState.state === 'flying');

    if (ballState.state !== 'flying' || !ballState.kick) { ballLastVx = ballLastVy = null; return; }

    // detect a wall/floor/ceiling bounce as a sign flip in velocity between
    // consecutive frames -- gravity only ever pushes vy one direction between
    // bounces, and vx never changes except at a wall, so any reversal here
    // really is a bounce (not just natural deceleration).
    const elapsedSec = ballKickStartPerf !== null ? Math.max(0, (nowPerf - ballKickStartPerf) / 1000) : 0;
    const sim = simulateBallFlight(ballState.kick, elapsedSec);
    if (ballLastVx !== null && (sim.vx * ballLastVx < 0 || sim.vy * ballLastVy < 0)) playBallBounceSfx();
    ballLastVx = sim.vx;
    ballLastVy = sim.vy;

    // cosmetic-only collision reaction -- each client decides this locally
    // from its own best-known avatar positions, so it's fine if two clients
    // don't agree down to the pixel on exactly who got bonked.
    const checkHit = (uid, x, y, el) => {
      if (uid === ballState.kick.by || ballHitAvatars.has(uid)) return;
      if (Math.abs(x - pos.x) <= BALL_HIT_RADIUS && Math.abs(y - pos.y) <= AVATAR_H) {
        ballHitAvatars.add(uid);
        el.classList.remove('is-ball-hit');
        void el.offsetWidth; // restart the shake even if it's already mid-animation from a previous hit
        el.classList.add('is-ball-hit');
        flashAvatarPose(uid, 'ite.png');
        playBallHitSfx();
      }
    };
    if (myEl && myUid) checkHit(myUid, myState.x, myState.y, myEl);
    remoteAvatars.forEach((entry, uid) => checkHit(uid, entry.curX, entry.curY, entry.el));

    const elapsedMs = ballKickStartPerf !== null ? nowPerf - ballKickStartPerf : 0;
    if (!ballLandingPending && elapsedMs >= BALL_MAX_FLIGHT_MS) {
      ballLandingPending = true;
      const landedX = clamp(pos.x, AVATAR_W / 2, WORLD_W - AVATAR_W / 2);
      const landedY = clamp(pos.y, 0, BALL_FLOOR_Y);
      const kickAtMs = ballState.kick.atMs;
      db.ref('ball').transaction((current) => {
        if (!current || current.state !== 'flying' || !current.kick || current.kick.atMs !== kickAtMs) return; // already resolved (by us or someone else), or superseded by a newer kick
        return { state: 'idle', x: landedX, y: landedY, heldBy: null, kick: null };
      }).finally(() => { ballLandingPending = false; });
    }
  }

  // A kick and a throw both launch the ball with a randomized pop of
  // speed/height baked into the shared kick event itself -- so the bounce
  // physics play out the same for everyone, but no two throws look alike.
  function launchBall(fromHeld) {
    const vx = (myState.facing === 'left' ? -1 : 1) * randomRange(BALL_KICK_SPEED * 0.75, BALL_KICK_SPEED * 1.25);
    const vy = -randomRange(280, 520); // negative = an initial upward pop before gravity takes over
    getServerNow().then((serverNow) => {
      db.ref('ball').transaction((current) => {
        if (!current) return;
        if (fromHeld && current.heldBy !== myUid) return; // lost the ball in the meantime
        if (!fromHeld && current.state !== 'idle') return; // someone beat us to it
        return {
          state: 'flying',
          heldBy: null,
          x: null,
          y: null,
          kick: { fromX: myState.x, fromY: myState.y, vx, vy, atMs: serverNow, by: myUid, thrown: fromHeld },
        };
      });
    });
  }

  // ○: catch a nearby ball, or -- if already holding it -- throw it (a
  // second press toggles catch into throw, per spec).
  function handleCatchButton() {
    if (!myEl || !myUid || !ballState) return;
    if (ballState.heldBy === myUid) { launchBall(true); return; }
    const pos = ballPositionNow();
    if (Math.hypot(myState.x - pos.x, myState.y - pos.y) > BALL_CATCH_RADIUS) return;
    db.ref('ball').transaction((current) => {
      if (!current || current.heldBy) return; // someone already has it
      return { state: 'held', heldBy: myUid, x: null, y: null, kick: null };
    });
  }

  // ✕: kick a ball resting on the ground directly, without catching it first.
  function handleKickButton() {
    if (!myEl || !myUid || !ballState) return;
    if (ballState.state !== 'idle') return; // can't kick one that's held or already flying
    const pos = ballPositionNow();
    if (Math.hypot(myState.x - pos.x, myState.y - pos.y) > BALL_KICK_RADIUS) return;
    launchBall(false);
  }

  // catch.png / throw.png live alongside each avatar's normal image (same
  // folder), so everyone in the room -- not just the one pressing the
  // button -- briefly sees that pose, driven entirely off the shared ball
  // state (no extra network event needed for "pose" itself).
  const BALL_POSE_MS = 450;
  function avatarFolder(avatarId) {
    const src = avatarById(avatarId).src;
    return src.slice(0, src.lastIndexOf('/'));
  }
  // Resolves the <img>, its normal (non-posed) src, and (for remote avatars)
  // the tracked entry -- shared plumbing for both the brief flash poses and
  // the persistent "holding the ball" pose.
  function resolveAvatarPoseTarget(uid) {
    const isMe = uid === myUid;
    const avatarId = isMe ? (profile && profile.avatar) : (remoteAvatars.get(uid) && remoteAvatars.get(uid).avatarId);
    const el = isMe ? myEl : (remoteAvatars.get(uid) && remoteAvatars.get(uid).el);
    if (!avatarId || !el) return null;
    return {
      img: el.querySelector('.chat-avatar-img'),
      normalSrc: avatarById(avatarId).src,
      avatarId,
      entry: isMe ? null : remoteAvatars.get(uid),
    };
  }
  // Brief reaction pose (throw/kick/hit) that reverts to normal on its own after BALL_POSE_MS.
  function flashAvatarPose(uid, poseFile) {
    const target = resolveAvatarPoseTarget(uid);
    if (!target) return;
    const { img, normalSrc, avatarId, entry } = target;
    if (entry) entry.poseUntil = performance.now() + BALL_POSE_MS;
    img.onerror = () => { img.onerror = null; img.src = normalSrc; };
    img.src = avatarFolder(avatarId) + '/' + poseFile;
    clearTimeout(img._poseTimer);
    img._poseTimer = setTimeout(() => { img.onerror = null; img.src = normalSrc; }, BALL_POSE_MS);
  }
  // Persistent pose (currently just "holding the ball") that stays until
  // releaseAvatarPose() is called -- doesn't revert on a timer.
  function holdAvatarPose(uid, poseFile) {
    const target = resolveAvatarPoseTarget(uid);
    if (!target) return;
    const { img, normalSrc, avatarId, entry } = target;
    clearTimeout(img._poseTimer);
    if (entry) entry.poseUntil = Infinity; // keep updateRemoteAvatar from syncing this back to normal while it's held
    img.onerror = () => { img.onerror = null; img.src = normalSrc; };
    img.src = avatarFolder(avatarId) + '/' + poseFile;
  }
  function releaseAvatarPose(uid) {
    const target = resolveAvatarPoseTarget(uid);
    if (!target) return;
    const { img, normalSrc, entry } = target;
    clearTimeout(img._poseTimer);
    if (entry) entry.poseUntil = 0;
    img.onerror = null;
    img.src = normalSrc;
    const box = img.closest('.chat-avatar');
    if (box) box.classList.remove('is-charging', 'is-firing', 'is-genki-charging');
  }

  let ballHoldPoseUid = null; // who currently has the persistent "holding the ball" pose active, if anyone

  function attachBallListener() {
    const ballRef = db.ref('ball');
    ballRef.transaction((current) => current || { state: 'idle', x: BALL_DEFAULT_POS.x, y: BALL_DEFAULT_POS.y, heldBy: null, kick: null });
    ballRef.on('value', (snap) => {
      const data = snap.val();
      const isNewKick = data && data.kick && (!ballState || !ballState.kick || ballState.kick.atMs !== data.kick.atMs);
      const isNewCatch = data && data.state === 'held' && data.heldBy
        && (!ballState || ballState.state !== 'held' || ballState.heldBy !== data.heldBy);
      ballState = data;

      // release the held-pose the moment the ball is no longer held by that
      // person, for any reason (thrown, dropped/reset, they disconnected)
      if (ballHoldPoseUid && (!data || data.state !== 'held' || data.heldBy !== ballHoldPoseUid)) {
        releaseAvatarPose(ballHoldPoseUid);
        ballHoldPoseUid = null;
      }

      if (isNewKick) {
        // throw.png is the "throwing a held ball" pose; kick.png is for
        // booting an idle ball off the ground without catching it first.
        flashAvatarPose(data.kick.by, data.kick.thrown ? 'throw.png' : 'kick.png');
        if (data.kick.thrown) playBallThrowSfx(); else playBallKickSfx();
        ballHitAvatars = new Set();
        ballLandingPending = false;
        ballLastVx = ballLastVy = null; // fresh flight -- don't compare its first velocity against the previous flight's trailing one
        const kickAtMs = data.kick.atMs;
        getServerNow().then((serverNow) => {
          if (!ballState || !ballState.kick || ballState.kick.atMs !== kickAtMs) return; // superseded already
          ballKickStartPerf = performance.now() - (serverNow - kickAtMs);
        });
      }
      if (isNewCatch) {
        holdAvatarPose(data.heldBy, 'catch.png');
        ballHoldPoseUid = data.heldBy;
      }
      if (!data || data.state !== 'flying') ballKickStartPerf = null;
    });
  }

  const actionCatchBtn = document.querySelector('#chatActionPad [data-act="catch"]');
  const actionKickBtn = document.querySelector('#chatActionPad [data-act="kick"]');
  actionKickBtn && actionKickBtn.addEventListener('click', handleKickButton);

  /* ========================================================================
     CHARGE / RELEASE POSE (long-press ○) -- unrelated to the ball, works
     regardless of whether you're holding one. Holding ○ for CHARGE_HOLD_MS
     switches to a single charging-pose image, then releasing swaps to a
     single firing-pose image and plays a CSS/JS effect, then reverts.
     Different avatars can have different special moves (SPECIAL_MOVE_BY_
     AVATAR below); avatars with none configured do nothing on long-press.
     Earlier YUU's version used two hand-drawn frame sequences (a tall
     charge sheet, a wide beam sheet), but fitting both into the avatar's
     one portrait-shaped box made him visibly shrink once the wide beam art
     took over -- a single pose per phase (each given its own box size
     matching its own art) plus a CSS effect sidesteps that entirely. Same
     "broadcast just the start/release event, replay it deterministically
     from elapsed time" trick as the ball/rhythm game -- no per-frame
     network traffic for the charge/release itself (the thrown Genki Dama
     below is the one exception, driven by the shared per-frame loop()
     like the ball, since its landing point depends on flight time).
     ======================================================================== */
  const CHARGE_HOLD_MS = 2000;

  // avatarId -> which special move long-press ○ triggers; avatars with no
  // entry here just do nothing (same as before any special move existed).
  const SPECIAL_MOVE_BY_AVATAR = { yuu: 'beam', n: 'genkidama' };

  const BEAM_HOLD_MS = 480; // beam shown at full size before fading
  const BEAM_FADE_MS = 260;
  const BEAM_TOTAL_MS = BEAM_HOLD_MS + BEAM_FADE_MS;
  const BEAM_MAX_WIDTH_PCT = 72; // beam length as % of the room stage's width
  const BEAM_HIT_TICKS = 5; // how many times the beam re-checks for a hit while it's out, so a sustained beam can tag someone more than once (unlike the ball's one-shot hit)
  const BEAM_HIT_Y_TOLERANCE = AVATAR_H; // world units, same generosity as the ball's cosmetic hit check

  // Where the hands sit within each pose image, as a fraction of the avatar
  // box's own width/height measured from its bottom-center (the box's
  // translate(-50%,-100%) anchor, i.e. the avatar's world position), for a
  // facing-left pose (the base art) -- mirrored for facing-right. Re-measure
  // these if the pose art is ever redrawn/re-cropped.
  const CHARGE_HAND_ANCHOR = { fx: -0.167, fy: 0.532 };
  const FIRE_HAND_ANCHOR = { fx: 0.257, fy: 0.669 };

  // N's Genki Dama (Dragon Ball spirit bomb): hop up holding a huge energy
  // orb overhead (GENKI1.png) while charging, then on release drop back to
  // the ground (GENKI2.png) and let the orb fall away in a straight
  // diagonal line at the same speed the avatar walks at, until it hits the
  // floor (or drifts off the room) and bursts.
  // (how high N visually hops while charging lives in CSS, .chat-avatar.is-genki-charging)
  const GENKI_ORB_WIDTH_PCT = 15; // orb diameter as % of the room stage's width (also set in CSS .genki-orb -- keep in sync)
  const GENKI_THROW_ANGLE_DEG = 55; // below horizontal; "diagonal downward" per the reference art
  const GENKI_MAX_FLIGHT_MS = 3000; // safety upper bound used only to time the Firebase charge-node cleanup (the actual flight ends whenever it lands)
  const GENKI_HIT_RADIUS = (GENKI_ORB_WIDTH_PCT / 100) * WORLD_W / 2; // world units -- matches the orb's own on-screen radius
  const GENKI_HIT_Y_TOLERANCE = AVATAR_H; // same generosity as the ball/beam's cosmetic hit check
  const GENKI_MAX_HITS = 5; // caps how many avatars a single thrown orb can tag

  const chargeAnimTimers = new Map(); // uid -> pending setTimeout id (reverting the pose)
  const chargeFx = new Map(); // uid -> {glowEl, beamEl} currently on screen for them
  const chargeKnown = new Map(); // uid -> last known {startAt, releasedAt}, to detect new starts/releases
  const genkiFlights = new Map(); // uid -> in-flight Genki Dama state, updated once per frame from loop()

  function facingOf(uid, entry) {
    return uid === myUid ? myState.facing : (entry ? entry.targetFacing : 'left');
  }

  // Screen position of the hands, as a percentage of the room stage, given
  // the avatar box currently on screen and which pose's anchor to use.
  function handStagePercent(box, anchor, facing) {
    const stageRect = stage.getBoundingClientRect();
    const boxRect = box.getBoundingClientRect();
    const sign = facing === 'right' ? -1 : 1;
    const handX = boxRect.left + boxRect.width / 2 + sign * anchor.fx * boxRect.width;
    const handY = boxRect.bottom - anchor.fy * boxRect.height;
    return {
      leftPct: ((handX - stageRect.left) / stageRect.width) * 100,
      topPct: ((handY - stageRect.top) / stageRect.height) * 100,
    };
  }

  function clearChargeFx(uid) {
    const fx = chargeFx.get(uid);
    if (!fx) return;
    if (fx.glowEl) fx.glowEl.remove();
    if (fx.beamEl) fx.beamEl.remove();
    if (fx.flareEl) fx.flareEl.remove();
    if (fx.impactEl) fx.impactEl.remove();
    if (fx.orbEl) fx.orbEl.remove();
    chargeFx.delete(uid);
  }

  // Screen position for the Genki Dama orb, centered above the given box's
  // own top edge with enough clearance that the orb's own circle -- sized
  // orbWidthPct as a % of the *stage width* -- never overlaps the avatar,
  // regardless of the box's aspect ratio (mixing a stage-width-relative
  // size with a box-height-relative offset was exactly how the previous
  // version ended up with an orb big/low enough to completely cover N --
  // reported with a screenshot). Working entirely in this function's own
  // pixel math instead sidesteps that.
  function genkiOrbStagePosition(box, orbWidthPct) {
    const stageRect = stage.getBoundingClientRect();
    const boxRect = box.getBoundingClientRect();
    const orbRadiusPx = (orbWidthPct / 100) * stageRect.width / 2;
    const gapPx = boxRect.height * 0.05; // small breathing room above the raised hands
    const x = boxRect.left + boxRect.width / 2;
    const y = boxRect.top - gapPx - orbRadiusPx;
    return {
      leftPct: ((x - stageRect.left) / stageRect.width) * 100,
      topPct: ((y - stageRect.top) / stageRect.height) * 100,
    };
  }

  function showChargeGlow(uid, box, facing) {
    clearChargeFx(uid);
    const glowEl = document.createElement('div');
    glowEl.className = 'charge-glow';
    const pos = handStagePercent(box, CHARGE_HAND_ANCHOR, facing);
    glowEl.style.left = pos.leftPct + '%';
    glowEl.style.top = pos.topPct + '%';
    stage.appendChild(glowEl);
    chargeFx.set(uid, { glowEl, beamEl: null, flareEl: null, impactEl: null, orbEl: null });
  }

  // Cosmetic-only collision reaction, same spirit as the ball's checkHit:
  // each client decides this locally from its own best-known avatar
  // positions, so it's fine if two clients don't quite agree pixel-for-
  // pixel on who got hit. Called BEAM_HIT_TICKS times while a beam is out
  // so a sustained beam can tag someone repeatedly rather than just once.
  function checkBeamHits(shooterUid, originX, originY, facing) {
    const tipX = originX + (facing === 'left' ? -1 : 1) * (BEAM_MAX_WIDTH_PCT / 100) * WORLD_W;
    const minX = Math.min(originX, tipX);
    const maxX = Math.max(originX, tipX);
    const check = (targetUid, x, y, el) => {
      if (targetUid === shooterUid) return;
      if (x >= minX && x <= maxX && Math.abs(y - originY) <= BEAM_HIT_Y_TOLERANCE) {
        el.classList.remove('is-ball-hit');
        void el.offsetWidth; // restart the shake even if it's already mid-animation from a previous tick's hit
        el.classList.add('is-ball-hit');
        flashAvatarPose(targetUid, 'ite.png');
        playBallHitSfx();
      }
    };
    if (myEl && myUid) check(myUid, myState.x, myState.y, myEl);
    remoteAvatars.forEach((entry, targetUid) => check(targetUid, entry.curX, entry.curY, entry.el));
  }

  function fireBeam(uid, box, facing) {
    clearChargeFx(uid);
    const pos = handStagePercent(box, FIRE_HAND_ANCHOR, facing);
    // fire_pose.png itself was drawn reaching toward the right in its
    // unmirrored (facing==='left') form -- opposite of every other pose's
    // "base art faces left" convention -- so the hand position above (which
    // tracks the art correctly) sits on the character's right when facing
    // left. Only the shoot *direction* needs correcting for that: it has to
    // point the same way the hands are actually drawn, i.e. the reverse of
    // the normal facing-left-shoots-left assumption. handStagePercent above
    // is unaffected -- it already matches the art.
    const shootFacing = facing === 'left' ? 'right' : 'left';

    const beamEl = document.createElement('div');
    beamEl.className = 'charge-beam';
    beamEl.style.top = pos.topPct + '%';
    beamEl.style.width = BEAM_MAX_WIDTH_PCT + '%';
    if (shootFacing === 'left') {
      beamEl.style.left = (pos.leftPct - BEAM_MAX_WIDTH_PCT) + '%';
      beamEl.style.transformOrigin = 'right center';
    } else {
      beamEl.style.left = pos.leftPct + '%';
      beamEl.style.transformOrigin = 'left center';
    }
    stage.appendChild(beamEl);

    // the burst of light erupting from the hands where the beam originates
    const flareEl = document.createElement('div');
    flareEl.className = 'beam-flare';
    flareEl.style.left = pos.leftPct + '%';
    flareEl.style.top = pos.topPct + '%';
    stage.appendChild(flareEl);

    // the explosion at the far tip, where the beam actually lands
    const tipLeftPct = shootFacing === 'left' ? pos.leftPct - BEAM_MAX_WIDTH_PCT : pos.leftPct + BEAM_MAX_WIDTH_PCT;
    const impactEl = document.createElement('div');
    impactEl.className = 'beam-impact';
    impactEl.style.left = tipLeftPct + '%';
    impactEl.style.top = pos.topPct + '%';
    stage.appendChild(impactEl);

    chargeFx.set(uid, { glowEl: null, beamEl, flareEl, impactEl, orbEl: null });
    // Show the beam+flare at full size/opacity immediately -- no grow-in
    // animation. An animated grow (via a CSS transition or the Web
    // Animations API) turned out unreliable here: it depends on the browser
    // committing the zero-width starting state before the animation begins,
    // which isn't guaranteed to happen inside the same tick as element
    // creation, and when it doesn't the beam is left stuck invisible at
    // zero width with no visible failure. Popping in instantly sidesteps
    // that entirely; only fade-outs (a plain opacity transition, safe to
    // skip if it doesn't fire since the element is removed a moment later
    // anyway) are animated.
    beamEl.style.opacity = '1';
    beamEl.style.transform = 'translateY(-50%) scaleX(1)';
    flareEl.style.opacity = '1';
    flareEl.style.transform = 'translate(-50%, -50%) scale(1)';
    setTimeout(() => {
      beamEl.style.transition = `opacity ${BEAM_FADE_MS}ms ease-in`;
      flareEl.style.transition = `opacity ${BEAM_FADE_MS}ms ease-in`;
      beamEl.style.opacity = '0';
      flareEl.style.opacity = '0';
      // pop the impact explosion in right as the beam itself starts fading
      impactEl.style.opacity = '1';
      impactEl.style.transform = 'translate(-50%, -50%) scale(1.2)';
      setTimeout(() => {
        impactEl.style.transition = `opacity ${BEAM_FADE_MS}ms ease-in, transform ${BEAM_FADE_MS}ms ease-in`;
        impactEl.style.opacity = '0';
        impactEl.style.transform = 'translate(-50%, -50%) scale(1.6)';
      }, 90);
    }, BEAM_HOLD_MS);

    // hit detection: re-checked BEAM_HIT_TICKS times over the beam's held
    // duration so a target standing in it gets tagged more than once
    const originWorldX = (pos.leftPct / 100) * WORLD_W;
    const originWorldY = (pos.topPct / 100) * WORLD_H;
    for (let i = 0; i < BEAM_HIT_TICKS; i++) {
      setTimeout(() => checkBeamHits(uid, originWorldX, originWorldY, shootFacing), (i * BEAM_HOLD_MS) / BEAM_HIT_TICKS);
    }
  }

  // N's charge: hop up (a CSS class + transition on the already-on-screen
  // avatar box -- unlike a freshly-created element, an existing element's
  // transitions fire reliably, so this one's safe to animate rather than
  // pop instantly) into GENKI1.png, with an energy orb floating above the head.
  function beginGenkiCharge(uid) {
    const target = resolveAvatarPoseTarget(uid);
    if (!target) return;
    const { img, normalSrc, avatarId, entry } = target;
    const box = img.closest('.chat-avatar');
    if (!box) return;
    if (entry) entry.poseUntil = Infinity;
    img.onerror = () => { img.onerror = null; img.src = normalSrc; };
    img.src = avatarFolder(avatarId) + '/GENKI1.png';
    box.classList.add('is-genki-charging');

    // in case an earlier throw's orb is still mid-flight (unlikely given
    // CHARGE_HOLD_MS, but cheap to guard) -- don't leak its element
    const prevFlight = genkiFlights.get(uid);
    if (prevFlight) { prevFlight.el.remove(); genkiFlights.delete(uid); }

    clearChargeFx(uid);
    const pos = genkiOrbStagePosition(box, GENKI_ORB_WIDTH_PCT);
    const orbEl = document.createElement('div');
    orbEl.className = 'genki-orb';
    orbEl.style.left = pos.leftPct + '%';
    orbEl.style.top = pos.topPct + '%';
    orbEl.style.opacity = '1';
    stage.appendChild(orbEl);
    chargeFx.set(uid, { glowEl: null, beamEl: null, flareEl: null, impactEl: null, orbEl });
  }

  // The burst where a landed/expired Genki Dama bursts -- reuses the beam's
  // own impact look (same soft hot-flash treatment) but bigger, and placed
  // directly (world coordinates) rather than relative to an avatar box.
  function spawnGenkiImpact(worldX, worldY) {
    const impactEl = document.createElement('div');
    impactEl.className = 'beam-impact genki-impact';
    positionWorldEl(impactEl, worldX, worldY);
    impactEl.style.transform = 'translate(-50%, -50%) scale(1)';
    impactEl.style.opacity = '1';
    stage.appendChild(impactEl);
    setTimeout(() => {
      impactEl.style.transition = `opacity ${BEAM_FADE_MS}ms ease-in, transform ${BEAM_FADE_MS}ms ease-in`;
      impactEl.style.opacity = '0';
      impactEl.style.transform = 'translate(-50%, -50%) scale(1.6)';
      setTimeout(() => impactEl.remove(), BEAM_FADE_MS + 50);
    }, 60);
  }

  // N's release: drop back to the ground in GENKI2.png and let the orb
  // (detached from chargeFx -- it now lives entirely in genkiFlights, driven
  // once per frame from loop()) fall away in a straight diagonal line.
  function throwGenkiDama(uid) {
    const target = resolveAvatarPoseTarget(uid);
    if (!target) return;
    const { img, normalSrc, avatarId, entry } = target;
    const box = img.closest('.chat-avatar');
    const facing = facingOf(uid, entry);

    const fx = chargeFx.get(uid);
    const orbEl = fx && fx.orbEl;
    chargeFx.delete(uid); // detach without removing the element -- ownership moves to genkiFlights below

    if (entry) entry.poseUntil = Infinity;
    img.onerror = () => { img.onerror = null; img.src = normalSrc; };
    img.src = avatarFolder(avatarId) + '/GENKI2.png';
    if (box) box.classList.remove('is-genki-charging');

    if (!orbEl) { releaseAvatarPose(uid); return; } // charge state was somehow already gone -- nothing to throw

    const stageRect = stage.getBoundingClientRect();
    const orbRect = orbEl.getBoundingClientRect();
    const startWorldX = ((orbRect.left + orbRect.width / 2 - stageRect.left) / stageRect.width) * WORLD_W;
    const startWorldY = ((orbRect.top + orbRect.height / 2 - stageRect.top) / stageRect.height) * WORLD_H;

    const angleRad = (GENKI_THROW_ANGLE_DEG * Math.PI) / 180;
    const dir = facing === 'left' ? -1 : 1;
    genkiFlights.set(uid, {
      el: orbEl,
      startWorldX, startWorldY,
      vx: dir * MOVE_SPEED * Math.cos(angleRad),
      vy: MOVE_SPEED * Math.sin(angleRad),
      startPerf: performance.now(),
      hitAvatars: new Set(), // avatars already tagged by this throw, so a lingering orb doesn't re-hit the same person every frame
    });
  }

  // Called once per frame from loop() -- advances every in-flight Genki
  // Dama by elapsed time (not by dt) so its speed stays exactly MOVE_SPEED
  // regardless of any single frame's length, same reasoning as the ball's
  // simulateBallFlight.
  // cosmetic-only collision reaction, same "each client decides locally"
  // reasoning as the ball's checkHit -- tags up to GENKI_MAX_HITS avatars
  // per throw, each only once even while the orb keeps overlapping them.
  function checkGenkiHits(uid, flight, x, y) {
    if (flight.hitAvatars.size >= GENKI_MAX_HITS) return;
    const checkHit = (targetUid, tx, ty, el) => {
      if (targetUid === uid || flight.hitAvatars.has(targetUid) || flight.hitAvatars.size >= GENKI_MAX_HITS) return;
      if (Math.abs(tx - x) <= GENKI_HIT_RADIUS && Math.abs(ty - y) <= GENKI_HIT_Y_TOLERANCE) {
        flight.hitAvatars.add(targetUid);
        el.classList.remove('is-ball-hit');
        void el.offsetWidth; // restart the shake even if it's already mid-animation from a previous hit
        el.classList.add('is-ball-hit');
        flashAvatarPose(targetUid, 'ite.png');
        playBallHitSfx();
      }
    };
    if (myEl && myUid) checkHit(myUid, myState.x, myState.y, myEl);
    remoteAvatars.forEach((entry, targetUid) => checkHit(targetUid, entry.curX, entry.curY, entry.el));
  }

  function updateGenkiFlights(nowPerf) {
    genkiFlights.forEach((flight, uid) => {
      const elapsedSec = (nowPerf - flight.startPerf) / 1000;
      const x = flight.startWorldX + flight.vx * elapsedSec;
      const y = flight.startWorldY + flight.vy * elapsedSec;
      checkGenkiHits(uid, flight, x, y);
      if (y >= WORLD_H || x < -60 || x > WORLD_W + 60) {
        const landX = clamp(x, 0, WORLD_W);
        const landY = Math.min(y, WORLD_H);
        spawnGenkiImpact(landX, landY);
        triggerHoukaiEffect();
        flight.el.remove();
        genkiFlights.delete(uid);
        releaseAvatarPose(uid);
        return;
      }
      positionWorldEl(flight.el, x, y);
    });
  }

  function setAvatarPoseImage(uid, poseFile, boxClass) {
    const target = resolveAvatarPoseTarget(uid);
    if (!target) return null;
    const { img, normalSrc, avatarId, entry } = target;
    if (entry) entry.poseUntil = Infinity; // keep updateRemoteAvatar from fighting the in-progress pose
    img.onerror = () => { img.onerror = null; img.src = normalSrc; };
    img.src = avatarFolder(avatarId) + '/' + poseFile;
    const box = img.closest('.chat-avatar');
    if (box) {
      box.classList.remove('is-charging', 'is-firing');
      box.classList.add(boxClass);
    }
    return { box, facing: facingOf(uid, entry) };
  }

  function specialMoveFor(uid) {
    const target = resolveAvatarPoseTarget(uid);
    return target ? SPECIAL_MOVE_BY_AVATAR[target.avatarId] : null;
  }

  function beginChargeAnimation(uid, startAtMs) {
    const existingTimer = chargeAnimTimers.get(uid);
    if (existingTimer) clearTimeout(existingTimer);
    const move = specialMoveFor(uid);
    if (!move) return; // this avatar has no special move configured
    getServerNow().then((serverNow) => {
      const latest = chargeKnown.get(uid);
      if (!latest || latest.startAt !== startAtMs) return; // superseded by a newer start/release already
      playChargeSfx(move);
      if (move === 'beam') {
        const posed = setAvatarPoseImage(uid, 'charge_pose.png', 'is-charging');
        if (posed) showChargeGlow(uid, posed.box, posed.facing);
      } else if (move === 'genkidama') {
        beginGenkiCharge(uid);
      }
    });
  }

  function endChargeAnimation(uid) {
    const move = specialMoveFor(uid);
    if (!move) return;
    playReleaseSfx(move);
    if (move === 'beam') {
      const posed = setAvatarPoseImage(uid, 'fire_pose.png', 'is-firing');
      if (posed) fireBeam(uid, posed.box, posed.facing);
      const timer = setTimeout(() => {
        chargeAnimTimers.delete(uid);
        clearChargeFx(uid);
        releaseAvatarPose(uid);
      }, BEAM_TOTAL_MS);
      chargeAnimTimers.set(uid, timer);
    } else if (move === 'genkidama') {
      // no chargeAnimTimers entry here -- the pose reverts once the thrown
      // orb actually lands, driven by updateGenkiFlights() every frame
      // rather than a fixed timer (flight time varies with where it's thrown from).
      throwGenkiDama(uid);
    }
  }

  function stopChargeAnimNoRelease(uid) {
    const timer = chargeAnimTimers.get(uid);
    if (timer) { clearTimeout(timer); chargeAnimTimers.delete(uid); }
    chargeKnown.delete(uid);
    clearChargeFx(uid);
    const flight = genkiFlights.get(uid);
    if (flight) { flight.el.remove(); genkiFlights.delete(uid); }
    releaseAvatarPose(uid);
  }

  function handleChargeUpdate(uid, data) {
    if (!data) return;
    const prev = chargeKnown.get(uid);
    // the very first time we see this uid's node (e.g. right after attaching
    // on room entry) and it's already got a releasedAt, it's a leftover from
    // a past completed cycle, not something happening now -- record it
    // without replaying it (this is also why stopCharging() below cleans the
    // node up a little while after release, as belt-and-suspenders).
    const isStaleHistorical = !prev && data.releasedAt;
    const isNewStart = !prev || prev.startAt !== data.startAt;
    const isNewRelease = data.releasedAt && (!prev || prev.releasedAt !== data.releasedAt);
    chargeKnown.set(uid, data);
    if (isStaleHistorical) return;
    if (isNewStart) beginChargeAnimation(uid, data.startAt);
    if (isNewRelease) endChargeAnimation(uid);
  }

  function attachChargeListener() {
    const chargeRoot = db.ref('charge');
    chargeRoot.on('child_added', (snap) => handleChargeUpdate(snap.key, snap.val()));
    chargeRoot.on('child_changed', (snap) => handleChargeUpdate(snap.key, snap.val()));
    chargeRoot.on('child_removed', (snap) => stopChargeAnimNoRelease(snap.key));
  }

  function startCharging() {
    if (!myUid) return;
    getServerNow().then((serverNow) => {
      db.ref('charge/' + myUid).set({ startAt: serverNow });
      db.ref('charge/' + myUid).onDisconnect().remove();
    });
  }
  function stopCharging() {
    if (!myUid) return;
    const myUidAtRelease = myUid;
    getServerNow().then((serverNow) => {
      db.ref('charge/' + myUidAtRelease).update({ releasedAt: serverNow });
      db.ref('charge/' + myUidAtRelease).onDisconnect().cancel();
      // clean up once the release animation has had time to play out for
      // everyone, so this cycle doesn't linger and get mistaken for a fresh
      // event by the next client that attaches the listener (e.g. a reload)
      const move = SPECIAL_MOVE_BY_AVATAR[profile && profile.avatar];
      const releaseDurationMs = (move === 'genkidama' ? GENKI_MAX_FLIGHT_MS : BEAM_TOTAL_MS) + 500;
      setTimeout(() => { db.ref('charge/' + myUidAtRelease).remove(); }, releaseDurationMs);
    });
  }

  // ○ needs to tell a quick tap (catch/throw) apart from a 2s+ hold (charge)
  // on the very same button -- same press/hold-timer/suppress-the-click
  // pattern already used for dragging popn.png.
  let catchLongPressTimer = null;
  let catchIsLongPress = false;
  // Touch has no hover state, so lifting a finger fires 'pointerup' AND
  // 'pointerleave' back to back for the same release -- without this guard
  // that ran stopCharging() (and so the release pose) twice on mobile, and
  // N's Genki Dama in particular has no orb left for the second call, so it
  // fell into the "already gone" branch and instantly reverted GENKI2.png.
  let catchChargeEnded = false;
  if (actionCatchBtn) {
    actionCatchBtn.addEventListener('pointerdown', () => {
      catchIsLongPress = false;
      catchChargeEnded = false;
      clearTimeout(catchLongPressTimer);
      catchLongPressTimer = setTimeout(() => {
        catchIsLongPress = true;
        startCharging();
      }, CHARGE_HOLD_MS);
    });
    const endCatchPress = () => {
      clearTimeout(catchLongPressTimer);
      if (catchIsLongPress && !catchChargeEnded) {
        catchChargeEnded = true;
        stopCharging();
      }
    };
    actionCatchBtn.addEventListener('pointerup', endCatchPress);
    actionCatchBtn.addEventListener('pointerleave', endCatchPress);
    actionCatchBtn.addEventListener('pointercancel', endCatchPress);
    actionCatchBtn.addEventListener('click', () => {
      if (catchIsLongPress) { catchIsLongPress = false; return; } // this click followed a charge -- don't also catch/throw
      handleCatchButton();
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
        // during the rhythm minigame movement is left/right-only (dy forced
        // to 0 above), and everyone's darting under falling notes, so bump
        // the pace up to make that side-to-side dodging feel snappier
        const speed = MOVE_SPEED * (movementLockedToGame ? 1.5 : 1);
        // (x,y) is the avatar's feet/bottom-center point (see the translate(-50%,-100%)
        // in CSS), so the walkable range has to be offset by the avatar's own footprint
        // rather than starting the clamp at 0 -- otherwise the bottom/side margins are
        // wasted and the avatar can't actually reach the edges of the room.
        myState.x = clamp(myState.x + (dx / len) * speed * dt, AVATAR_W / 2, WORLD_W - AVATAR_W / 2);
        myState.y = clamp(myState.y + (dy / len) * speed * dt, AVATAR_H, WORLD_H);
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
    updateBall(now);
    updateGenkiFlights(now);

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
    entry.avatarId = data.avatar;
    const a = avatarById(data.avatar);
    const img = entry.el.querySelector('.chat-avatar-img');
    // skip while a catch/throw pose is actively showing (see flashAvatarPose)
    // so this doesn't stomp it back to the normal sprite mid-pose
    if ((!entry.poseUntil || performance.now() > entry.poseUntil) && img.getAttribute('src') !== a.src) img.src = a.src;
    entry.el.querySelector('.chat-avatar-name').textContent = data.name || '';

    const newX = data.x || 0;
    const newY = data.y || 0;
    const moved = Math.abs(newX - entry.targetX) > 0.5 || Math.abs(newY - entry.targetY) > 0.5;
    entry.targetX = newX;
    entry.targetY = newY;
    entry.targetFacing = data.facing || 'left';
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
      setAvatarFacing(el, data.facing || 'left');
      remoteAvatars.set(uid, {
        el, curX: startX, curY: startY,
        targetX: startX, targetY: startY, targetFacing: data.facing || 'left',
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
        attachBallListener();
        attachChargeListener();
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
