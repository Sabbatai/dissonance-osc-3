/* =====================================================================
   dissonance.js: shared network + routing layer for every instrument

   Load it at the END of <body>, after osc-browser.min.js:

     <script src="osc-browser.min.js"></script>
     <script src="dissonance.js"></script>
     <script> ...your instrument... </script>

   ---------------------------------------------------------------------
   param(id, options)   register a parameter; a small routing strip
                        appears right after its control:
                          in   none, or any address heard on the
                               network (other players' params too)
                          inv  flip incoming values (shown while listening)
                          out  off | shared | mine | both

     options:
       input     id of a slider/button to bind (optional)
       anchor    id of the element to put the strip after (default: input;
                 params with neither go in #routing, or above #log)
       min, max  native range (default: from the slider, else 0..1)
       value     starting value
       kind      "value" (default) | "trigger" | "out"
                   trigger: no value, just fires (buttons, beats)
                   out:     send only, never listens (e.g. notes played)
       send      default send mode   (default "shared")
       listen    default address to listen to (default "/shared/<id>");
                 "" means listen to nobody
       onChange  fn(value) called on local gestures AND incoming control

     returns p with:
       p.value       current native value
       p.set(v)      local gesture: apply + send (if sending)
       p.emit(v)     send only, don't apply locally

   Values travel as 0..1 floats. Received values are never re-sent, so
   routing can't loop between players.

   Audio (needs the https:// address):
     audioContext()          the shared AudioContext; call it from your
                             Start button instead of new AudioContext()
     audioOut({ anchor })    returns a node: connect your final sound to
                             it instead of ctx.destination. Its strip has
                             "send audio" (to the room) and "my speakers"
     audioIn(id, { anchor }) returns a node carrying another player's
                             sound; its strip picks whose. Connect it
                             into your effect. A limiter guards loops.

   Lower-level, bypassing routing:
     send(address, value)   on(address, fn)   on("*", fn)
   ===================================================================== */
(function () {
  const SCHEMA = ["/shared/density", "/shared/brightness", "/shared/pulse"];
  const handlers = {};
  const params = [];
  const known = new Set(SCHEMA);
  const $id = (id) => document.getElementById(id);

  // ---------- connection ----------
  function on(address, fn) { (handlers[address] ||= []).push(fn); }

  const WS = location.protocol === "https:" ? "wss" : "ws";
  const port = new osc.WebSocketPort({ url: `${WS}://${location.host}`, metadata: true });
  port.on("ready", () => setStatus(true));
  port.on("close", () => { setStatus(false); setTimeout(() => location.reload(), 2000); });
  port.on("error", () => {});
  port.on("message", (msg) => {
    const v = msg.args && msg.args[0] ? msg.args[0].value : undefined;
    logLine("← " + msg.address + (v !== undefined ? " " + Number(v).toFixed(3) : ""));
    discover(msg.address);
    (handlers[msg.address] || []).forEach((fn) => fn(v, msg));
    (handlers["*"] || []).forEach((fn) => fn(v, msg));
    for (const p of params) if (p.listen && p.listen === msg.address) p._receive(v);
  });
  port.open();

  function send(address, value) {
    const args = value === undefined ? [] : [{ type: "f", value: Math.min(1, Math.max(0, value)) }];
    try { port.send({ address, args }); } catch (_) {}
  }

  function myName() {
    const el = $id("name");
    return ((el && el.value.trim()) || "player").replace(/[^\w-]/g, "_");
  }

  // ---------- params ----------
  function param(id, o = {}) {
    const input = typeof o.input === "string" ? $id(o.input) : o.input || null;
    const kind = o.kind || "value";
    const min = o.min ?? (input && input.min !== "" ? +input.min : 0);
    const max = o.max ?? (input && input.max !== "" ? +input.max : 1);
    const saved = load(id);

    const p = {
      id, kind, min, max,
      value: o.value ?? (input && kind === "value" ? +input.value : min),
      send: saved.send ?? o.send ?? "shared",
      listen: kind === "out" ? "" : saved.listen ?? (o.listen !== undefined ? o.listen : `/shared/${id}`),
      invert: saved.invert ?? false,
      onChange: o.onChange || (() => {}),
      _input: input,
      _anchor: o.anchor,
    };
    const norm = (v) => (max === min ? 0 : (v - min) / (max - min));
    const denorm = (n) => min + n * (max - min);

    p.addresses = () => {
      const a = [];
      if (p.send === "shared" || p.send === "both") a.push(`/shared/${id}`);
      if (p.send === "personal" || p.send === "both") a.push(`/player/${myName()}/${id}`);
      return a;
    };
    p.emit = (v = p.value) => {
      for (const a of p.addresses()) kind === "trigger" ? send(a) : send(a, norm(v));
    };
    function apply(v) {
      if (kind !== "trigger") { p.value = v; if (input) input.value = v; }
      p.onChange(v);
    }
    p.set = (v) => { apply(v); p.emit(v); };
    p._receive = (n) => {
      if (kind === "out") return;
      if (kind === "trigger") { apply(); flash(p); return; }
      if (typeof n !== "number") return;
      n = Math.min(1, Math.max(0, n));
      if (p.invert) n = 1 - n;
      apply(denorm(n));
      flash(p);
    };

    if (input) {
      const isButton = input.tagName === "BUTTON" || input.type === "button";
      input.addEventListener(isButton ? "click" : "input", () => p.set(kind === "trigger" ? undefined : +input.value));
    }
    if (p.listen) known.add(p.listen);
    params.push(p);
    whenReady(renderRouting);
    return p;
  }

  // ---------- inline routing strips ----------
  // Each param gets a small strip right after its own control:
  //   ● dot (lights when someone else moves it)
  //   in:  none | any address heard on the network
  //   inv  (only shown while listening)
  //   out: off | shared | mine | both
  // Params with no control of their own go in #routing (or before #log).
  let renderQueued = false;
  function whenReady(fn) {
    if (renderQueued) return;
    renderQueued = true;
    const go = () => { renderQueued = false; fn(); };
    document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", go) : setTimeout(go, 0);
  }

  function renderRouting() {
    injectStyle();
    for (const p of params) if (!p._strip) place(p, makeStrip(p));
  }

  function place(p, strip) {
    p._strip = strip;
    const anchor = typeof p._anchor === "string" ? $id(p._anchor) : p._anchor || p._input;
    if (anchor) { anchor.after(strip); return; }
    let box = $id("routing");
    if (!box) {
      box = document.createElement("div");
      box.id = "routing";
      const log = $id("log");
      log ? log.before(box) : document.body.append(box);
    }
    const row = document.createElement("div");
    row.className = "rt-row";
    row.innerHTML = `<span class="rt-name">${p.id}</span>`;
    row.append(strip);
    box.append(row);
  }

  function makeStrip(p) {
    const strip = document.createElement("span");
    strip.className = "rt";

    const dot = document.createElement("span");
    dot.className = "rt-dot"; p._dot = dot;
    dot.title = "lights when someone else moves this";

    const sendSel = document.createElement("select");
    for (const [v, t] of [["off", "out: off"], ["shared", "out: shared"], ["personal", "out: mine"], ["both", "out: both"]]) sendSel.add(new Option(t, v));
    sendSel.value = p.send;
    sendSel.title = `shared = /shared/${p.id}\nmine = /player/<my name>/${p.id}`;
    sendSel.onchange = () => { p.send = sendSel.value; save(p); paint(); };

    strip.append(dot);

    let listenSel, invLab;
    if (p.kind !== "out") {
      listenSel = document.createElement("select");
      listenSel.onchange = () => { p.listen = listenSel.value; save(p); paint(); };
      p._listenSel = listenSel;
      fillListen(p);

      invLab = document.createElement("label");
      invLab.className = "rt-inv";
      const inv = document.createElement("input");
      inv.type = "checkbox"; inv.checked = p.invert;
      inv.onchange = () => { p.invert = inv.checked; save(p); };
      invLab.append(inv, "inv");
      invLab.title = "flip incoming values";
      strip.append(listenSel);
      if (p.kind === "value") strip.append(invLab);
    }
    strip.append(sendSel);

    function paint() {
      sendSel.classList.toggle("on", p.send !== "off");
      if (listenSel) listenSel.classList.toggle("on", !!p.listen);
      if (invLab) invLab.style.display = p.listen ? "" : "none";
    }
    paint();
    return strip;
  }

  // "/shared/density" -> "in: shared density", "/player/ana/pitch" -> "in: ana pitch"
  function short(a) {
    const m = a.match(/^\/player\/([^/]+)\/(.+)$/);
    if (m) return `${m[1]} ${m[2].replace(/\//g, " ")}`;
    return a.replace(/^\//, "").replace(/\//g, " ");
  }

  function fillListen(p) {
    const sel = p._listenSel;
    if (!sel) return;
    const mine = `/player/${myName()}/`;
    const opts = [...known].filter((a) => !a.startsWith(mine)).sort();
    if (p.listen && !opts.includes(p.listen)) opts.push(p.listen);
    sel.innerHTML = "";
    sel.add(new Option("in: none", ""));
    for (const a of opts) { const o = new Option("in: " + short(a), a); o.title = a; sel.add(o); }
    sel.value = p.listen;
  }

  function discover(address) {
    if (known.has(address)) return;
    known.add(address);
    params.forEach(fillListen);
  }

  function flash(p) {
    if (!p._dot) return;
    p._dot.classList.add("hit");
    clearTimeout(p._t);
    p._t = setTimeout(() => p._dot.classList.remove("hit"), 120);
  }

  // routing choices survive the automatic reload on reconnect
  function key(id) { return `dissonance:${location.pathname}:${id}`; }
  function save(p) {
    try { localStorage.setItem(key(p.id), JSON.stringify({ send: p.send, listen: p.listen, invert: p.invert })); } catch (_) {}
  }
  function load(id) {
    try { return JSON.parse(localStorage.getItem(key(id))) || {}; } catch (_) { return {}; }
  }

  // ---------- audio routing ----------
  // Audio streams travel through the relay's /audio hub as 48 kHz mono.
  // Requires the https address (browsers only allow AudioWorklet there).
  let actx = null, workletReady = null;

  function audioContext() {
    if (!actx) {
      try { actx = new AudioContext({ sampleRate: 48000, latencyHint: "interactive" }); }
      catch (_) { actx = new AudioContext(); }
      workletReady = actx.audioWorklet
        ? actx.audioWorklet.addModule("audio-worklet.js")
        : Promise.reject(new Error("open the https:// address to route audio"));
      workletReady.catch((e) => logLine("audio routing unavailable: " + e.message));
    }
    actx.resume();
    return actx;
  }

  // everything connected to the returned node goes to my speakers and/or the room
  let outBus = null;
  function audioOut(o = {}) {
    if (outBus) return outBus;
    const ctx = audioContext();
    const bus = ctx.createGain();
    const speaker = ctx.createGain();
    bus.connect(speaker).connect(ctx.destination);
    const st = { net: loadA("out-net", true), speaker: loadA("out-speaker", true) };
    speaker.gain.value = st.speaker ? 1 : 0;

    let ws = null, sendNode = null, as = null;
    const dot = mkDot();
    function connect() {
      if (!sendNode) return;
      const want = st.net ? myName() : null;
      if (want === as && ws) return;
      if (ws) { ws.onclose = null; ws.close(); ws = null; }
      as = want;
      sendNode.port.postMessage({ on: !!want });
      if (!want) return;
      ws = new WebSocket(`${WS}://${location.host}/audio?pub=${encodeURIComponent(want)}`);
      ws.onclose = () => { ws = null; setTimeout(connect, 1000); };
    }
    workletReady.then(() => {
      sendNode = new AudioWorkletNode(ctx, "dissonance-send");
      const sink = ctx.createGain(); sink.gain.value = 0;
      bus.connect(sendNode); sendNode.connect(sink).connect(ctx.destination);   // keeps it running everywhere
      let n = 0;
      sendNode.port.onmessage = (e) => {
        if (ws && ws.readyState === 1) { ws.send(e.data); if (++n % 8 === 0) pulseDot(dot); }
      };
      connect();
    }).catch(() => {});
    onNameChange(connect);

    const strip = mkStrip(dot,
      toggle("send audio", st.net, (v) => { st.net = v; saveA("out-net", v); connect(); }),
      toggle("my speakers", st.speaker, (v) => { st.speaker = v; saveA("out-speaker", v); speaker.gain.setTargetAtTime(v ? 1 : 0, ctx.currentTime, 0.02); }));
    placeStrip(o.anchor || "start", "audio out", strip);
    outBus = bus;
    return bus;
  }

  // a node carrying another player's sound (choose whose in its strip)
  //   audioIn("input", { anchor, source, bufferMs, strip: false })
  //   node.setSource(name)   switch source from code ("" for none)
  const audioIns = [];
  function audioIn(id = "audio", o = {}) {
    const ctx = audioContext();
    const out = ctx.createGain();
    const limiter = ctx.createDynamicsCompressor();          // guards against feedback loops
    limiter.threshold.value = -6; limiter.knee.value = 0; limiter.ratio.value = 20;
    limiter.attack.value = 0.003; limiter.release.value = 0.1;
    limiter.connect(out);

    const A = { id, source: o.source ?? loadA("in-" + id, ""), gen: 0, ws: null, recv: null, strip: o.strip !== false };
    A.dot = mkDot();
    function subscribe() {
      const g = ++A.gen;
      if (A.ws) { A.ws.onclose = null; A.ws.close(); A.ws = null; }
      if (A.recv) { A.recv.disconnect(); A.recv = null; }
      if (!A.source) return;
      workletReady.then(() => {
        if (g !== A.gen) return;
        A.recv = new AudioWorkletNode(ctx, "dissonance-receive", {
          numberOfInputs: 0, outputChannelCount: [1], processorOptions: { bufferMs: o.bufferMs || 60 } });
        A.recv.connect(limiter);
        const ws = A.ws = new WebSocket(`${WS}://${location.host}/audio?sub=${encodeURIComponent(A.source)}`);
        ws.binaryType = "arraybuffer";
        let n = 0;
        ws.onmessage = (e) => { if (A.recv) A.recv.port.postMessage(e.data, [e.data]); if (++n % 8 === 0) pulseDot(A.dot); };
        ws.onclose = () => { if (g === A.gen) setTimeout(subscribe, 1000); };
      }).catch(() => {});
    }
    out.setSource = (name) => { A.source = name || ""; if (A.sel) A.sel.value = A.source; subscribe(); };
    out.source = () => A.source;

    if (A.strip) {
      A.sel = document.createElement("select");
      A.sel.onchange = () => { saveA("in-" + id, A.sel.value); out.setSource(A.sel.value); A.sel.classList.toggle("on", !!A.sel.value); };
      placeStrip(o.anchor, id, mkStrip(A.dot, A.sel));
      fillAudioSel(A);
    }
    audioIns.push(A);
    subscribe();
    pollStreams();
    return out;
  }

  // who is streaming: polled from the relay
  let streams = [], polling = false;
  const streamListeners = [];
  function onStreams(fn) { streamListeners.push(fn); pollStreams(); if (streams.length) fn(streams); }
  function pollStreams() {
    if (polling) return;
    polling = true;
    const tick = () => fetch("/streams", { cache: "no-store" }).then((r) => r.json()).then((list) => {
      if (JSON.stringify(list) !== JSON.stringify(streams)) {
        streams = list;
        audioIns.forEach(fillAudioSel);
        streamListeners.forEach((fn) => fn(streams));
      }
    }).catch(() => {}).finally(() => setTimeout(tick, 2000));
    tick();
  }
  function fillAudioSel(A) {
    if (!A.sel) return;
    const names = streams.filter((n) => n !== myName());
    if (A.source && !names.includes(A.source)) names.push(A.source);
    A.sel.innerHTML = "";
    A.sel.add(new Option("audio in: none", ""));
    for (const n of names) A.sel.add(new Option("audio in: " + n, n));
    A.sel.value = A.source;
    A.sel.classList.toggle("on", !!A.source);
  }

  // ---------- small strip helpers ----------
  function mkDot() { const d = document.createElement("span"); d.className = "rt-dot"; return d; }
  function pulseDot(d) { d.classList.add("hit"); clearTimeout(d._t); d._t = setTimeout(() => d.classList.remove("hit"), 150); }
  function mkStrip(...els) { injectStyle(); const s = document.createElement("span"); s.className = "rt"; s.append(...els); return s; }
  function toggle(label, value, fn) {
    const sel = document.createElement("select");
    sel.add(new Option(label + ": on", "1")); sel.add(new Option(label + ": off", "0"));
    sel.value = value ? "1" : "0";
    sel.classList.toggle("on", value);
    sel.onchange = () => { const v = sel.value === "1"; sel.classList.toggle("on", v); fn(v); };
    return sel;
  }
  function placeStrip(anchor, label, strip) {
    const a = typeof anchor === "string" ? $id(anchor) : anchor;
    if (a) { a.after(strip); return; }
    let box = $id("routing");
    if (!box) { box = document.createElement("div"); box.id = "routing"; const log = $id("log"); log ? log.before(box) : document.body.append(box); }
    const row = document.createElement("div"); row.className = "rt-row";
    row.innerHTML = `<span class="rt-name">${label}</span>`;
    row.append(strip); box.append(row);
  }
  function onNameChange(fn) { const el = $id("name"); if (el) el.addEventListener("change", fn); }
  function saveA(k, v) { try { localStorage.setItem(key("audio-" + k), JSON.stringify(v)); } catch (_) {} }
  function loadA(k, d) { try { const v = JSON.parse(localStorage.getItem(key("audio-" + k))); return v ?? d; } catch (_) { return d; } }

  // ---------- status + log (created if the page doesn't have them) ----------
  function setStatus(ok) {
    let el = $id("status");
    if (!el) { el = document.createElement("div"); el.id = "status"; document.body.prepend(el); }
    el.textContent = ok ? "connected to " + location.host : "disconnected, retrying...";
    el.className = ok ? "status on" : "status";
  }
  function logLine(s) {
    let el = $id("log");
    if (!el) { el = document.createElement("div"); el.id = "log"; document.body.append(el); }
    el.textContent = s + "\n" + el.textContent.slice(0, 4000);
  }

  let styled = false;
  function injectStyle() {
    if (styled) return;
    styled = true;
    const s = document.createElement("style");
    s.textContent = `
      .rt { display: inline-flex; align-items: center; gap: 4px; margin: 2px 0 2px 6px; font-size: 12px; vertical-align: middle; flex-wrap: wrap; }
      .rt select { font: 12px system-ui, sans-serif; background: #1b1b1b; color: #777; border: 1px solid #333; border-radius: 3px; padding: 1px 2px; max-width: 150px; }
      .rt select.on { color: #eee; border-color: #666; }
      .rt-inv { display: inline-flex; align-items: center; gap: 2px; color: #999; margin: 0; cursor: pointer; }
      .rt-inv input { margin: 0; }
      .rt-dot { width: 8px; height: 8px; border-radius: 50%; background: #333; flex: none; }
      .rt-dot.hit { background: #6c6; }
      #routing .rt-row { display: flex; align-items: center; gap: 6px; margin: 8px 0; font-size: 13px; }
      #routing .rt-name { color: #aaa; }
    `;
    document.head.append(s);
  }

  onNameChange(() => params.forEach(fillListen));
  Object.assign(window, { param, send, on, logLine, setStatus, audioContext, audioOut, audioIn, onStreams });
})();
