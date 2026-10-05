/* snap-pair live demo: host + controller over BroadcastChannel. Plain JavaScript, no library.
   Mirrors what BroadcastChannelTransport does: PIN -> channel, hello/welcome, heartbeats, messages. */
(function () {
  'use strict';
  // Run after app.js has applied the language (it boots on DOMContentLoaded too, and registered first).
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demo);
  else demo();

  function demo() {

  var CHANNEL_PREFIX = 'snap-pair-demo/';
  var HEARTBEAT_MS = 2000;
  var TIMEOUT_MS = 6500;
  var JOIN_TIMEOUT_MS = 1500;
  var CLAIM_WINDOW_MS = 150;
  var MAX_PEERS = 8;
  var COLORS = ['#4f46e5', '#db2777', '#0d9488', '#ea580c', '#7c3aed', '#0284c7', '#16a34a', '#ca8a04'];

  var $ = function (id) { return document.getElementById(id); };
  var t = function (key, vars) {
    var s = (window.snapPair && window.snapPair.t(key)) || key;
    if (vars) Object.keys(vars).forEach(function (k) { s = s.replace('{' + k + '}', vars[k]); });
    return s;
  };

  function randomId() {
    var a = new Uint8Array(8);
    crypto.getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  // Uniform 6-digit PIN with rejection sampling (same idea as generatePin()).
  function generatePin() {
    var buf = new Uint32Array(1);
    var limit = Math.floor(0x100000000 / 1000000) * 1000000;
    do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
    return String(buf[0] % 1000000).padStart(6, '0');
  }

  // Full-width digits, spaces and dashes are accepted (same idea as normalizePin()).
  function normalizePin(value) {
    return String(value || '')
      .replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/[\s\-‐-―−ー－]/g, '');
  }
  function formatPin(pin) { return pin.slice(0, 3) + ' ' + pin.slice(3); }
  function isValidPin(pin) { return /^\d{6}$/.test(pin); }

  function setStatus(el, text, kind) {
    el.textContent = text;
    el.className = 'status' + (kind ? ' ' + kind : '');
  }

  /* Canvas sized to its box at device pixel ratio. */
  function fitCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(1, Math.round(rect.width * dpr));
    var h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; return true; }
    return false;
  }

  if (typeof BroadcastChannel === 'undefined') {
    var u = $('unsupported');
    u.hidden = false;
    u.textContent = t('demo.js.unsupported');
    $('btn-host').disabled = true;
    $('btn-ctrl').disabled = true;
    return;
  }

  var params = new URLSearchParams(location.search);
  var views = { choose: $('view-choose'), host: $('view-host'), ctrl: $('view-ctrl') };
  function show(name) {
    Object.keys(views).forEach(function (k) { views[k].hidden = k !== name; });
  }

  /* ======================= HOST ======================= */
  var host = null;

  function startHost() {
    show('host');
    history.replaceState(null, '', '?role=host');
    host = { id: randomId(), pin: null, channel: null, peers: new Map(), strokes: [], live: new Map(), timers: [] };
    claimPin(0);
  }

  // Before using a PIN, ask whether another host already owns its channel.
  function claimPin(attempt) {
    var pin = generatePin();
    var ch = new BroadcastChannel(CHANNEL_PREFIX + pin);
    var taken = false;
    ch.onmessage = function (e) { if (e.data && e.data.t === 'taken') taken = true; };
    ch.postMessage({ t: 'probe', from: host.id });
    setTimeout(function () {
      if (taken && attempt < 5) { ch.close(); claimPin(attempt + 1); return; }
      host.pin = pin;
      host.channel = ch;
      ch.onmessage = onHostMessage;
      $('host-pin').textContent = formatPin(pin);
      var joinUrl = new URL('demo.html?role=controller&pin=' + pin, location.href).href;
      $('open-ctrl').href = joinUrl;
      $('join-url').textContent = joinUrl;
      host.timers.push(setInterval(hostTick, HEARTBEAT_MS));
      renderPeers();
      resizeHost();
    }, CLAIM_WINDOW_MS);
  }

  function hostSend(msg) { if (host && host.channel) host.channel.postMessage(msg); }

  function onHostMessage(e) {
    var m = e.data;
    if (!m || typeof m !== 'object' || typeof m.from !== 'string') return;
    var peer = host.peers.get(m.from);
    switch (m.t) {
      case 'probe':
        hostSend({ t: 'taken', to: m.from });
        break;
      case 'hello': {
        if (!peer) {
          if (host.peers.size >= MAX_PEERS) { hostSend({ t: 'full', to: m.from }); return; }
          var used = new Set(Array.from(host.peers.values()).map(function (p) { return p.color; }));
          var color = COLORS.find(function (c) { return !used.has(c); }) || COLORS[host.peers.size % COLORS.length];
          var n = 1;
          var names = new Set(Array.from(host.peers.values()).map(function (p) { return p.n; }));
          while (names.has(n)) n += 1;
          peer = { id: m.from, color: color, n: n, lastSeen: Date.now() };
          host.peers.set(m.from, peer);
          window.snapPair && window.snapPair.toast(t('demo.js.joined', { name: t('demo.js.player') + ' ' + n }));
          renderPeers();
        }
        peer.lastSeen = Date.now();
        hostSend({ t: 'welcome', to: m.from, color: peer.color, n: peer.n });
        break;
      }
      case 'ping':
        if (peer) peer.lastSeen = Date.now();
        else hostSend({ t: 'kick', to: m.from }); // unknown peer: ask it to say hello again
        break;
      case 'stroke':
        if (!peer || !Array.isArray(m.pts) || m.pts.length > 500) return;
        peer.lastSeen = Date.now();
        addPoints(peer, m);
        break;
      case 'clear':
        if (!peer) return;
        host.strokes = host.strokes.filter(function (s) { return s.peer !== peer.id; });
        redrawHost();
        break;
      case 'bye':
        if (peer) removePeer(peer);
        break;
    }
  }

  function addPoints(peer, m) {
    var aspect = typeof m.aspect === 'number' && m.aspect > 0.1 && m.aspect < 10 ? m.aspect : 1;
    var pts = m.pts.filter(function (p) {
      return Array.isArray(p) && isFinite(p[0]) && isFinite(p[1]) && p[0] >= -0.05 && p[0] <= 1.05 && p[1] >= -0.05 && p[1] <= 1.05;
    });
    if (!pts.length) return;
    var stroke = m.start ? null : host.live.get(peer.id);
    if (!stroke || stroke.sid !== m.sid) {
      stroke = { peer: peer.id, color: peer.color, sid: m.sid, aspect: aspect, pts: [] };
      host.strokes.push(stroke);
      host.live.set(peer.id, stroke);
      if (host.strokes.length > 2000) host.strokes.shift();
    }
    var from = stroke.pts.length ? stroke.pts[stroke.pts.length - 1] : null;
    Array.prototype.push.apply(stroke.pts, pts);
    drawSegment(stroke, from, pts);
    $('stage-empty').textContent = '';
  }

  function removePeer(peer) {
    host.peers.delete(peer.id);
    host.live.delete(peer.id);
    window.snapPair && window.snapPair.toast(t('demo.js.left', { name: t('demo.js.player') + ' ' + peer.n }));
    renderPeers();
  }

  function hostTick() {
    hostSend({ t: 'host-ping', from: host.id });
    var now = Date.now();
    host.peers.forEach(function (peer) { if (now - peer.lastSeen > TIMEOUT_MS) removePeer(peer); });
  }

  function renderPeers() {
    var list = $('peer-list');
    list.innerHTML = '';
    host.peers.forEach(function (peer) {
      var li = document.createElement('li');
      var dot = document.createElement('i');
      dot.style.background = peer.color;
      li.appendChild(dot);
      li.appendChild(document.createTextNode(t('demo.js.player') + ' ' + peer.n));
      list.appendChild(li);
    });
    var count = host.peers.size;
    setStatus($('host-status'), count ? t('demo.js.peers', { n: count }) : t('demo.js.waiting'), count ? 'ok' : 'warn');
    $('stage-empty').textContent = host.strokes.length ? '' : t('demo.js.waiting');
  }

  // Fit the controller's pad (with its aspect ratio) inside the host canvas, centered.
  function frameFor(canvas, aspect) {
    var W = canvas.width, H = canvas.height;
    var w = Math.min(W, H * aspect);
    var h = w / aspect;
    return { x: (W - w) / 2, y: (H - h) / 2, w: w, h: h };
  }

  function strokeStyle(ctx, canvas, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(3, Math.min(canvas.width, canvas.height) * 0.012);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  function drawSegment(stroke, from, pts) {
    var canvas = $('host-canvas');
    var ctx = canvas.getContext('2d');
    var f = frameFor(canvas, stroke.aspect);
    strokeStyle(ctx, canvas, stroke.color);
    ctx.beginPath();
    var start = from || pts[0];
    ctx.moveTo(f.x + start[0] * f.w, f.y + start[1] * f.h);
    if (!from && pts.length === 1) ctx.lineTo(f.x + start[0] * f.w + 0.01, f.y + start[1] * f.h);
    pts.forEach(function (p) { ctx.lineTo(f.x + p[0] * f.w, f.y + p[1] * f.h); });
    ctx.stroke();
  }

  function redrawHost() {
    var canvas = $('host-canvas');
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    host.strokes.forEach(function (s) { drawSegment(s, null, s.pts); });
    $('stage-empty').textContent = host.strokes.length ? '' : t('demo.js.waiting');
  }

  function resizeHost() {
    if (!host) return;
    fitCanvas($('host-canvas'));
    redrawHost();
  }

  function stopHost() {
    if (!host) return;
    hostSend({ t: 'close', from: host.id });
    host.timers.forEach(clearInterval);
    if (host.channel) host.channel.close();
    host = null;
  }

  /* ===================== CONTROLLER ===================== */
  var ctrl = null;

  function startController(prefill) {
    show('ctrl');
    history.replaceState(null, '', '?role=controller' + (prefill ? '&pin=' + prefill : ''));
    $('pin-form').hidden = false;
    $('ctrl-live').hidden = true;
    var input = $('pin-input');
    input.value = prefill ? formatPin(prefill) : '';
    $('pin-error').textContent = '';
    if (prefill) joinWithPin(prefill); else input.focus();
  }

  function joinWithPin(raw) {
    var pin = normalizePin(raw);
    var err = $('pin-error');
    if (!isValidPin(pin)) { err.textContent = t('demo.js.invalidPin'); return; }
    err.textContent = t('demo.js.connecting');
    leaveController(false);
    var c = ctrl = { id: randomId(), pin: pin, channel: new BroadcastChannel(CHANNEL_PREFIX + pin), joined: false,
      hostSeen: 0, timers: [], sid: 0, pending: [], drawing: false, aspect: 1, mine: [] };

    c.channel.onmessage = function (e) {
      var m = e.data;
      if (!m || typeof m !== 'object' || ctrl !== c) return;
      if (m.to && m.to !== c.id) return;
      switch (m.t) {
        case 'welcome':
          c.hostSeen = Date.now();
          if (!c.joined) { c.joined = true; onJoined(c, m); }
          break;
        case 'host-ping':
          c.hostSeen = Date.now();
          break;
        case 'kick':
          c.channel.postMessage({ t: 'hello', from: c.id });
          break;
        case 'full':
          err.textContent = t('demo.js.full');
          leaveController(false);
          break;
        case 'close':
          hostGone(c);
          break;
      }
    };
    c.channel.postMessage({ t: 'hello', from: c.id });
    c.timers.push(setTimeout(function () {
      if (ctrl === c && !c.joined) { err.textContent = t('demo.js.noHost'); leaveController(false); }
    }, JOIN_TIMEOUT_MS));
  }

  function onJoined(c, m) {
    history.replaceState(null, '', '?role=controller&pin=' + c.pin);
    c.color = m.color;
    c.n = m.n;
    $('pin-form').hidden = true;
    $('ctrl-live').hidden = false;
    renderMe();
    setStatus($('ctrl-status'), t('demo.js.connected'), 'ok');
    resizePad();
    c.timers.push(setInterval(function () {
      c.channel.postMessage({ t: 'ping', from: c.id });
      if (Date.now() - c.hostSeen > TIMEOUT_MS) hostGone(c);
    }, HEARTBEAT_MS));
    requestAnimationFrame(function flush() {
      if (ctrl !== c) return;
      if (c.pending.length) {
        c.channel.postMessage({ t: 'stroke', from: c.id, sid: c.sid, start: c.startNext, aspect: c.aspect, pts: c.pending.splice(0) });
        c.startNext = false;
      }
      requestAnimationFrame(flush);
    });
  }

  function renderMe() {
    if (!ctrl || !ctrl.joined) return;
    var me = $('me');
    me.innerHTML = '';
    var dot = document.createElement('i');
    dot.style.background = ctrl.color;
    me.appendChild(dot);
    me.appendChild(document.createTextNode(t('demo.js.you') + ' ' + t('demo.js.player') + ' ' + ctrl.n));
  }

  function hostGone(c) {
    if (ctrl !== c) return;
    setStatus($('ctrl-status'), t('demo.js.hostGone'), 'err');
    c.timers.forEach(function (id) { clearInterval(id); clearTimeout(id); });
    c.timers = [];
    c.joined = false;
  }

  function leaveController(sayBye) {
    if (!ctrl) return;
    if (sayBye) ctrl.channel.postMessage({ t: 'bye', from: ctrl.id });
    ctrl.timers.forEach(function (id) { clearInterval(id); clearTimeout(id); });
    ctrl.channel.close();
    ctrl = null;
  }

  /* Pad drawing: local echo + normalized points to the host. */
  function padPoint(e) {
    var rect = $('pad-canvas').getBoundingClientRect();
    return [(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height];
  }

  function padDraw(from, to) {
    var canvas = $('pad-canvas');
    var ctx = canvas.getContext('2d');
    strokeStyle(ctx, canvas, ctrl.color);
    ctx.beginPath();
    ctx.moveTo(from[0] * canvas.width, from[1] * canvas.height);
    ctx.lineTo(to[0] * canvas.width + (from === to ? 0.01 : 0), to[1] * canvas.height);
    ctx.stroke();
  }

  function redrawPad() {
    if (!ctrl) return;
    var canvas = $('pad-canvas');
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    ctrl.mine.forEach(function (s) {
      for (var i = 0; i < s.length; i += 1) padDraw(s[i - 1] || s[i], s[i]);
    });
  }

  function resizePad() {
    var canvas = $('pad-canvas');
    fitCanvas(canvas);
    if (ctrl) ctrl.aspect = canvas.width / canvas.height;
    redrawPad();
  }

  function round(p) { return [Math.round(p[0] * 10000) / 10000, Math.round(p[1] * 10000) / 10000]; }

  var pad = $('pad');
  pad.addEventListener('pointerdown', function (e) {
    if (!ctrl || !ctrl.joined) return;
    e.preventDefault();
    pad.setPointerCapture(e.pointerId);
    $('pad-hint').hidden = true;
    if (ctrl.pending.length) {
      ctrl.channel.postMessage({ t: 'stroke', from: ctrl.id, sid: ctrl.sid, start: ctrl.startNext, aspect: ctrl.aspect, pts: ctrl.pending.splice(0) });
    }
    var p = round(padPoint(e));
    ctrl.drawing = true;
    ctrl.sid += 1;
    ctrl.startNext = true;
    ctrl.pending = [p];
    ctrl.mine.push([p]);
    padDraw(p, p);
  });
  pad.addEventListener('pointermove', function (e) {
    if (!ctrl || !ctrl.drawing) return;
    var events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    if (!events.length) events = [e];
    var stroke = ctrl.mine[ctrl.mine.length - 1];
    events.forEach(function (ev) {
      var p = round(padPoint(ev));
      var last = stroke[stroke.length - 1];
      if (Math.abs(p[0] - last[0]) + Math.abs(p[1] - last[1]) < 0.002) return;
      padDraw(last, p);
      stroke.push(p);
      ctrl.pending.push(p);
    });
  });
  function endStroke() { if (ctrl) ctrl.drawing = false; }
  pad.addEventListener('pointerup', endStroke);
  pad.addEventListener('pointercancel', endStroke);

  /* ======================= Wiring ======================= */
  $('btn-host').addEventListener('click', startHost);
  $('btn-ctrl').addEventListener('click', function () { startController(''); });
  $('pin-form').addEventListener('submit', function (e) { e.preventDefault(); joinWithPin($('pin-input').value); });
  $('host-clear').addEventListener('click', function () { if (host) { host.strokes = []; host.live.clear(); redrawHost(); } });
  $('host-leave').addEventListener('click', function () { stopHost(); show('choose'); history.replaceState(null, '', location.pathname); });
  $('ctrl-clear').addEventListener('click', function () {
    if (!ctrl) return;
    ctrl.mine = [];
    redrawPad();
    $('pad-hint').hidden = false;
    if (ctrl.joined) ctrl.channel.postMessage({ t: 'clear', from: ctrl.id });
  });
  $('ctrl-leave').addEventListener('click', function () {
    leaveController(true);
    show('choose');
    history.replaceState(null, '', location.pathname);
  });

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { resizeHost(); if (ctrl && ctrl.joined) resizePad(); }, 100);
  });
  window.addEventListener('pagehide', function () { stopHost(); leaveController(true); });

  document.addEventListener('snap:lang', function () {
    if (host) renderPeers();
    renderMe();
    if (ctrl && ctrl.joined) setStatus($('ctrl-status'), t('demo.js.connected'), 'ok');
  });

  var role = params.get('role');
  var pinParam = normalizePin(params.get('pin'));
  if (role === 'host') startHost();
  else if (role === 'controller' || isValidPin(pinParam)) startController(isValidPin(pinParam) ? pinParam : '');
  else show('choose');
  }
})();
