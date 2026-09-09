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
    { id: 'oz', name: 'OZ', src: 'img/OZ_kawaii.png' },
    { id: 'yuu', name: 'YUU', src: 'img/YUU_kawaii.png' },
  ];
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
  const entryAvatarPicker = document.getElementById('entryAvatarPicker');
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

  /* ---------- sound effects & BGM ---------- */
  const ponSfx = new Audio('audio/pon.mp3');
  ponSfx.volume = 0.7;
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
  function renderAvatarPicker(selectedId) {
    entryAvatarPicker.innerHTML = '';
    AVATARS.forEach(a => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chat-avatar-option' + (a.id === selectedId ? ' is-selected' : '');
      btn.innerHTML = `<img src="${a.src}" alt="${a.name}"><span>${a.name}</span>`;
      btn.addEventListener('click', () => {
        entryAvatarPicker.querySelectorAll('.chat-avatar-option').forEach(b => b.classList.remove('is-selected'));
        btn.classList.add('is-selected');
        entryAvatarPicker.dataset.selected = a.id;
      });
      entryAvatarPicker.appendChild(btn);
    });
    entryAvatarPicker.dataset.selected = selectedId;
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

  entryEnterBtn.addEventListener('click', () => {
    const name = entryNameInput.value.trim().slice(0, NAME_MAX) || 'なまえ未設定';
    const avatarId = entryAvatarPicker.dataset.selected || AVATARS[0].id;
    profile = { name, avatar: avatarId };
    saveProfile(profile);
    closeEntry();
    applyMyAvatarButton();
    enterRoom();
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
    requestAnimationFrame(loop);
  }

  /* ---------- remote presence sync ---------- */
  function updateRemoteAvatar(uid, data) {
    const entry = remoteAvatars.get(uid);
    if (!entry || !data) return;
    const a = avatarById(data.avatar);
    const img = entry.el.querySelector('.chat-avatar-img');
    if (img.getAttribute('src') !== a.src) img.src = a.src;
    entry.el.querySelector('.chat-avatar-name').textContent = data.name || '';
    positionAvatarEl(entry.el, data.x || 0, data.y || 0);
    setAvatarFacing(entry.el, data.facing || 'right');
    if (data.message && data.messageAt && Date.now() - data.messageAt < BUBBLE_MS) {
      showBubble(entry.el, data.message);
    }
  }

  function attachPresenceListeners() {
    const presenceRoot = db.ref('presence');
    presenceRoot.on('child_added', (snap) => {
      const uid = snap.key;
      if (uid === myUid) return;
      remoteAvatars.set(uid, { el: createAvatarEl(false) });
      updateRemoteAvatar(uid, snap.val());
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
  function attachLogListener() {
    db.ref('log').limitToLast(LOG_LIMIT).on('child_added', (snap) => appendLogLine(snap.val()));
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
    if (presenceRef) {
      presenceRef.onDisconnect().cancel();
      presenceRef.remove().catch(() => {});
      presenceRef = null;
    }
    if (myEl) { myEl.remove(); myEl = null; }
    stopIdleWatch();
    if (leaveBtn) leaveBtn.hidden = true;
    stopBgm();
  }

  if (leaveBtn) {
    leaveBtn.addEventListener('click', () => {
      clearMyPresence();
      window.location.href = 'index.html';
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

      if (!listenersAttached) {
        listenersAttached = true;
        attachPresenceListeners();
        attachLogListener();
      }
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
