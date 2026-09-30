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

  const port = new osc.WebSocketPort({ url: `ws://${location.host}`, metadata: true });
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

  Object.assign(window, { param, send, on, logLine, setStatus });
})();
