// YouTube search/browse/play component for ACQUA HOUSE.
//
// Role split (per Cloud.md's iframe note -- youtube.com itself can't be
// framed, only individual videos via the embed endpoint):
//   - YouTube Data API v3    -> search + "popular videos" grid (metadata only)
//   - YouTube IFrame Player API -> actual playback of the chosen video
//
// Playback state (which video, playing/paused, position) is mirrored through
// Firebase Realtime Database at db.ref('youtube') so every visitor's ACQUA
// HOUSE tab shows the same "now playing" state, the same way presence/ball/
// charge state already works in chat.js. This file is self-contained and
// does not depend on chat.js -- it opens its own firebase.database() handle.
(() => {
  'use strict';

  const MAX_RESULTS = 16;
  const SEEK_THRESHOLD_SEC = 1.5;   // bigger than this vs. expected elapsed => treat as a manual seek
  const POLL_MS = 1000;             // how often we sample currentTime to detect seeks while playing
  const APPLYING_REMOTE_MS = 3000;  // how long we ignore local playback events after applying a remote update (covers typical buffering time for the new video to actually start)

  const overlay = document.getElementById('ytOverlay'); // the search/browse modal only -- NOT playback, see below
  const closeBtn = document.getElementById('ytCloseBtn');
  const searchForm = document.getElementById('ytSearchForm');
  const searchInput = document.getElementById('ytSearchInput');
  const searchBtn = document.getElementById('ytSearchBtn');
  const gridEl = document.getElementById('ytGrid');
  const statusEl = document.getElementById('ytStatus');
  const stageEl = document.getElementById('chatStage');

  if (!overlay || !stageEl) return;

  // The actual video renders inside the room itself (over the big window in
  // aqua_House_screen.png -- see the .yt-room-screen rules in
  // css/youtube-widget.css), not in the search modal above, so that
  // everyone's avatars/chat/movement stay usable while watching together.
  const roomScreen = document.createElement('div');
  roomScreen.className = 'yt-room-screen';
  roomScreen.hidden = true;
  roomScreen.innerHTML = `
    <div class="yt-room-screen-frame" id="ytRoomScreenFrame"></div>
    <div class="yt-room-screen-bar">
      <span class="yt-room-screen-title" id="ytRoomScreenTitle"></span>
      <button type="button" class="yt-room-screen-close" id="ytRoomScreenClose" aria-label="閉じる">✕</button>
    </div>
  `;
  stageEl.appendChild(roomScreen);
  const roomScreenFrame = document.getElementById('ytRoomScreenFrame');
  const roomScreenTitle = document.getElementById('ytRoomScreenTitle');
  const roomScreenClose = document.getElementById('ytRoomScreenClose');

  let locallyHidden = false; // per-viewer-only "hide the screen" -- doesn't touch shared state, doesn't stop it for anyone else
  // As soon as anyone picks a video, it syncs to every visitor's room
  // automatically (no need for each person to tap monitor.png themselves
  // first) -- that's the whole "watch together" point.
  function updateRoomScreenVisibility() {
    roomScreen.hidden = !currentVideoId || locallyHidden;
  }
  roomScreenClose.addEventListener('click', () => {
    locallyHidden = true;
    updateRoomScreenVisibility();
  });

  const apiKey = (typeof YOUTUBE_API_KEY === 'string') ? YOUTUBE_API_KEY : '';
  const keyConfigured = !!apiKey && apiKey.indexOf('YOUR_') !== 0;

  // ---------- external hooks -------------------------------------------
  // Other scripts (chat.js, or anything else) can subscribe to these without
  // knowing anything about the YouTube API or Firebase.
  const hooks = { videoSelected: [], playState: [], seek: [] };
  function fire(list, ...args) {
    list.forEach((fn) => {
      try { fn(...args); } catch (err) { console.error('[youtube-widget] hook error', err); }
    });
  }
  window.YoutubeWidget = {
    onVideoSelected(fn) { hooks.videoSelected.push(fn); }, // fn(videoId, title)
    onPlayState(fn) { hooks.playState.push(fn); },         // fn(isPlaying, seconds)
    onSeek(fn) { hooks.seek.push(fn); },                   // fn(seconds)
    open: openPanel,
    close: closePanel,
  };

  // ---------- Firebase sync (best-effort) -------------------------------
  // Same defensive pattern as chat.js: databaseURL may not be configured in
  // every environment, so a failure here just means "local-only playback",
  // not a broken widget.
  let db = null;
  try {
    if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length) db = firebase.database();
  } catch (err) {
    console.error('[youtube-widget] Firebase Realtime Database unavailable, playback sync disabled', err);
  }
  function myUid() {
    try { return (firebase.auth().currentUser && firebase.auth().currentUser.uid) || 'anon'; }
    catch (err) { return 'anon'; }
  }

  let player = null;
  let playerReady = false;
  let currentVideoId = null;
  let applyingRemote = false;
  let applyingRemoteResetTimer = null;
  let lastAppliedUpdatedAt = 0;
  let lastKnownSeconds = 0;
  let lastPollAt = 0;
  let pollTimer = null;

  function setStatus(msg) {
    if (!msg) { statusEl.hidden = true; statusEl.textContent = ''; return; }
    statusEl.hidden = false;
    statusEl.textContent = msg;
  }

  /* ---------- search panel open/close (playback is unaffected either way -- see roomScreen above) ---------- */
  function openPanel() {
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    if (!gridEl.dataset.loaded) loadMostPopular();
  }
  function closePanel() {
    overlay.hidden = true;
    document.body.style.overflow = '';
  }
  closeBtn.addEventListener('click', closePanel);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closePanel(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !overlay.hidden) closePanel(); });

  /* ---------- YouTube Data API v3 (search + metadata only) ---------- */
  function api(path, params) {
    if (!keyConfigured) {
      setStatus('YouTube機能を使うには js/youtube-config.js に YOUTUBE_API_KEY を設定してください。');
      return Promise.reject(new Error('no api key'));
    }
    const qs = new URLSearchParams(Object.assign({ key: apiKey }, params));
    return fetch('https://www.googleapis.com/youtube/v3/' + path + '?' + qs.toString())
      .then((res) => {
        if (!res.ok) {
          return res.json()
            .then((body) => { throw new Error((body.error && body.error.message) || res.statusText); })
            .catch(() => { throw new Error(res.statusText); });
        }
        return res.json();
      });
  }

  function renderGrid(items) {
    gridEl.innerHTML = '';
    gridEl.dataset.loaded = '1';
    items.forEach((item) => {
      const videoId = typeof item.id === 'string' ? item.id : (item.id && item.id.videoId);
      if (!videoId) return;
      const snip = item.snippet;
      const thumbs = snip.thumbnails || {};
      const thumbUrl = (thumbs.medium || thumbs.high || thumbs.default || {}).url;
      if (!thumbUrl) return;

      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'yt-card';

      const thumbWrap = document.createElement('span');
      thumbWrap.className = 'yt-thumb-wrap';
      const img = document.createElement('img');
      img.src = thumbUrl;
      img.alt = '';
      img.loading = 'lazy';
      thumbWrap.appendChild(img);

      const titleEl = document.createElement('span');
      titleEl.className = 'yt-card-title';
      titleEl.textContent = snip.title || '';

      const channelEl = document.createElement('span');
      channelEl.className = 'yt-card-channel';
      channelEl.textContent = snip.channelTitle || '';

      card.append(thumbWrap, titleEl, channelEl);
      card.addEventListener('click', () => {
        selectVideo(videoId, snip.title || '');
        closePanel(); // picked something -- get the search list out of the way so the room screen is visible
      });
      gridEl.appendChild(card);
    });
    if (!items.length) setStatus('見つかりませんでした。');
  }

  function loadMostPopular() {
    if (!keyConfigured) { setStatus('YouTube機能を使うには js/youtube-config.js に YOUTUBE_API_KEY を設定してください。'); return; }
    setStatus('読み込み中...');
    api('videos', { part: 'snippet', chart: 'mostPopular', regionCode: 'JP', maxResults: String(MAX_RESULTS) })
      .then((data) => { setStatus(''); renderGrid(data.items || []); })
      .catch((err) => { setStatus('動画一覧を取得できませんでした（' + err.message + '）'); });
  }

  function searchVideos(query) {
    if (!keyConfigured) { setStatus('YouTube機能を使うには js/youtube-config.js に YOUTUBE_API_KEY を設定してください。'); return; }
    setStatus('検索中...');
    api('search', { part: 'snippet', type: 'video', q: query, maxResults: String(MAX_RESULTS) })
      .then((data) => { setStatus(''); renderGrid(data.items || []); })
      .catch((err) => { setStatus('検索に失敗しました（' + err.message + '）'); });
  }

  searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = searchInput.value.trim();
    searchBtn.disabled = true;
    if (q) searchVideos(q); else loadMostPopular();
    setTimeout(() => { searchBtn.disabled = false; }, 400); // light debounce against double-submits, not a real rate limiter
  });

  /* ---------- YouTube IFrame Player API (actual playback) ---------- */
  let iframeApiPromise = null;
  function ensureIframeApi() {
    if (iframeApiPromise) return iframeApiPromise;
    iframeApiPromise = new Promise((resolve) => {
      if (window.YT && window.YT.Player) { resolve(); return; }
      const prevCb = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { if (prevCb) prevCb(); resolve(); };
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    });
    return iframeApiPromise;
  }

  // Memoized on its own (not just ensureIframeApi()) so that two overlapping
  // callers -- e.g. a local selectVideo() and the 'value' listener's echo of
  // that same write, which can both land while the iframe API script is
  // still loading -- share the exact same promise instead of the second one
  // grabbing the not-yet-ready `player` object and calling methods on it
  // before onReady has fired.
  let playerCreatePromise = null;
  function ensurePlayer() {
    if (playerCreatePromise) return playerCreatePromise;
    playerCreatePromise = ensureIframeApi().then(() => new Promise((resolve) => {
      const mount = document.createElement('div');
      roomScreenFrame.appendChild(mount);
      player = new YT.Player(mount, {
        width: '100%',
        height: '100%',
        playerVars: { rel: 0, playsinline: 1 },
        events: {
          onReady: () => { playerReady = true; resolve(player); },
          onStateChange: handlePlayerStateChange,
        },
      });
    }));
    return playerCreatePromise;
  }

  function selectVideo(videoId, title, opts) {
    opts = opts || {};
    const isNewVideo = videoId !== currentVideoId;
    if (isNewVideo) locallyHidden = false; // a genuine new pick should reappear even if this viewer had dismissed the previous one
    currentVideoId = videoId;
    updateRoomScreenVisibility();
    roomScreenTitle.textContent = title || '';
    ensurePlayer().then((p) => {
      p.loadVideoById({ videoId, startSeconds: opts.startSeconds || 0 });
      if (opts.paused) p.pauseVideo();
    });
    fire(hooks.videoSelected, videoId, title);
    if (!opts.fromRemote) broadcastState({ videoId, title, isPlaying: !opts.paused, seconds: opts.startSeconds || 0 });
  }

  function handlePlayerStateChange(e) {
    if (applyingRemote) return; // caused by us applying a remote update, not a local user action -- don't echo it back
    if (e.data === YT.PlayerState.PLAYING) {
      fire(hooks.playState, true, player.getCurrentTime());
      broadcastState({ isPlaying: true, seconds: player.getCurrentTime() });
      startPolling();
    } else if (e.data === YT.PlayerState.PAUSED) {
      fire(hooks.playState, false, player.getCurrentTime());
      broadcastState({ isPlaying: false, seconds: player.getCurrentTime() });
    }
  }

  // The IFrame API has no native "seek" event, so seeks are inferred: while
  // playing, sample currentTime once a second and compare it against what
  // pure elapsed-time playback would predict. A gap bigger than
  // SEEK_THRESHOLD_SEC means the user dragged the scrubber.
  function startPolling() {
    if (pollTimer) return;
    lastKnownSeconds = player.getCurrentTime();
    lastPollAt = Date.now();
    pollTimer = setInterval(() => {
      if (!player || applyingRemote) return;
      if (player.getPlayerState() !== YT.PlayerState.PLAYING) { clearInterval(pollTimer); pollTimer = null; return; }
      const now = Date.now();
      const cur = player.getCurrentTime();
      const expected = lastKnownSeconds + (now - lastPollAt) / 1000;
      if (Math.abs(cur - expected) > SEEK_THRESHOLD_SEC) {
        fire(hooks.seek, cur);
        broadcastState({ seconds: cur });
      }
      lastKnownSeconds = cur;
      lastPollAt = now;
    }, POLL_MS);
  }

  /* ---------- Firebase sync ---------- */
  function broadcastState(patch) {
    if (!db) return;
    const payload = Object.assign({
      videoId: currentVideoId,
      updatedAt: firebase.database.ServerValue.TIMESTAMP,
      updatedBy: myUid(),
    }, patch);
    db.ref('youtube').update(payload).catch(() => {});
  }

  function applyRemoteState(data) {
    if (data.updatedAt && data.updatedAt <= lastAppliedUpdatedAt) return;
    lastAppliedUpdatedAt = data.updatedAt || Date.now();

    applyingRemote = true;
    clearTimeout(applyingRemoteResetTimer);
    applyingRemoteResetTimer = setTimeout(() => {
      applyingRemote = false;
      if (player && playerReady) { lastKnownSeconds = player.getCurrentTime(); lastPollAt = Date.now(); }
    }, APPLYING_REMOTE_MS);

    if (data.videoId !== currentVideoId) {
      selectVideo(data.videoId, data.title, { fromRemote: true, startSeconds: data.seconds || 0, paused: !data.isPlaying });
    } else {
      ensurePlayer().then((p) => {
        const cur = p.getCurrentTime();
        if (typeof data.seconds === 'number' && Math.abs(cur - data.seconds) > SEEK_THRESHOLD_SEC) p.seekTo(data.seconds, true);
        if (data.isPlaying) p.playVideo(); else p.pauseVideo();
      });
    }
    fire(hooks.playState, !!data.isPlaying, data.seconds || 0);
  }

  // The room screen is part of the room itself now (not gated behind the
  // search panel), so this listens unconditionally -- it also fires once
  // immediately on attach with whatever's currently in the DB, which is what
  // shows the in-progress video to someone who just walked into the room.
  if (db) {
    db.ref('youtube').on('value', (snap) => {
      const data = snap.val();
      if (data && data.videoId) applyRemoteState(data);
    });
  }
})();
