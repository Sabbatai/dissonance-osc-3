// Dissonance relay: one laptop runs this, everyone else connects to it.
//
//  - Serves the instruments in ./public over HTTPS (port 8443). Browsers
//    only allow audio streaming on secure pages, so the relay makes its
//    own certificate (saved in ./cert). Everyone clicks through a browser
//    warning once. Plain http://...:8080 redirects to https.
//  - Control hub (WebSocket "/"): every OSC message a browser sends is
//    rebroadcast to everyone else.
//  - Audio hub (WebSocket "/audio"): instruments publish their sound
//    under their player name; anyone can subscribe to anyone.
//    GET /streams lists who is streaming.
//  - UDP bridge (57121 in): native tools (SuperCollider, Pd, Max,
//    TouchDesigner, Python) join the control conversation.
//
// Run:  npm start   (or: node server.js)

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const os = require("os");
const osc = require("osc");
const selfsigned = require("selfsigned");
const { WebSocketServer } = require("ws");

const HTTP_PORT = 8080;
const HTTPS_PORT = 8443;
const UDP_IN = 57121;
const PUBLIC = path.join(__dirname, "public");
const CERT_DIR = path.join(__dirname, "cert");
const INSTRUMENT_DIR = path.join(__dirname, "instruments");
const INSTRUMENT_META = path.join(INSTRUMENT_DIR, "index.json");

const udpPeers = new Map(); // "ip:port" -> {address, port}

main().catch((e) => { console.error(e); process.exit(1); });

async function main() {
  const creds = await certificate();
  fs.mkdirSync(INSTRUMENT_DIR, { recursive: true });
  if (!fs.existsSync(INSTRUMENT_META)) fs.writeFileSync(INSTRUMENT_META, "[]\n");

  // ---------- static files ----------
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
  function serve(req, res) {
    const url = new URL(req.url, "https://x");
    if (url.pathname === "/streams") {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      return res.end(JSON.stringify([...publishers.keys()].sort()));
    }

    // Shared instrument library. Participants post a complete HTML instrument
    // from submit.html; the relay stores it outside ./public so uploaded files
    // can never overwrite the built-in workshop instruments.
    if (url.pathname === "/api/instruments") {
      if (req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        return res.end(JSON.stringify(readInstrumentIndex()));
      }
      if (req.method === "POST") return receiveInstrument(req, res);
      res.writeHead(405, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "method not allowed" }));
    }

    if (url.pathname.startsWith("/instruments/")) {
      const name = path.basename(decodeURIComponent(url.pathname));
      if (!name.endsWith(".html")) { res.writeHead(404); return res.end("not found"); }
      const file = path.join(INSTRUMENT_DIR, name);
      return fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); return res.end("not found"); }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
        res.end(data);
      });
    }

    const file = path.join(PUBLIC, url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname));
    if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end("not found"); }
      res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
      res.end(data);
    });
  }
  const server = https.createServer(creds, serve);

  // plain http: send people to the https address
  http.createServer((req, res) => {
    const host = (req.headers.host || "localhost").replace(/:\d+$/, "");
    res.writeHead(301, { Location: `https://${host}:${HTTPS_PORT}${req.url}` });
    res.end();
  }).listen(HTTP_PORT, "0.0.0.0");

  // ---------- two WebSocket hubs on the same port ----------
  const controlWss = new WebSocketServer({ noServer: true });
  const audioWss = new WebSocketServer({ noServer: true, perMessageDeflate: false });
  server.on("upgrade", (req, socket, head) => {
    const { pathname } = new URL(req.url, "https://x");
    const wss = pathname === "/audio" ? audioWss : controlWss;
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });

  // ---------- control hub (OSC over WebSocket) ----------
  // The relay remembers the latest value sent to every address, and
  // sends that snapshot to each browser as it joins, so a page opened
  // late starts in step with the room (same root, density, scale...).
  // Triggers (messages with no value) aren't remembered. Restart the
  // relay to forget everything.
  const sockets = new Set();
  const latest = new Map();   // address -> last message
  controlWss.on("connection", (raw, req) => {
    const port = new osc.WebSocketPort({ socket: raw, metadata: true });
    sockets.add(port);
    log(`browser joined (${req.socket.remoteAddress}), ${sockets.size} connected`);
    setTimeout(() => { for (const m of latest.values()) { try { port.send(m); } catch (_) {} } }, 50);
    port.on("message", (msg) => relay(msg, port));
    port.on("close", () => { sockets.delete(port); log(`browser left, ${sockets.size} connected`); });
    port.on("error", () => {});
  });

  // ---------- audio hub ----------
  // /audio?pub=<name>  send binary audio packets
  // /audio?sub=<name>  receive that player's packets
  // Slow receivers get packets dropped rather than delayed.
  const publishers = new Map();   // name -> ws
  const subscribers = new Map();  // name -> Set<ws>
  audioWss.on("connection", (ws, req) => {
    const q = new URL(req.url, "https://x").searchParams;
    const pub = q.get("pub"), sub = q.get("sub");
    if (pub) {
      publishers.set(pub, ws);
      log(`audio: ${pub} streaming`);
      ws.on("message", (data) => {
        for (const s of subscribers.get(pub) || []) {
          if (s.readyState === 1 && s.bufferedAmount < 64 * 1024) s.send(data, { binary: true });
        }
      });
      ws.on("close", () => { if (publishers.get(pub) === ws) { publishers.delete(pub); log(`audio: ${pub} stopped`); } });
    } else if (sub) {
      if (!subscribers.has(sub)) subscribers.set(sub, new Set());
      subscribers.get(sub).add(ws);
      ws.on("close", () => subscribers.get(sub)?.delete(ws));
    } else ws.close();
    ws.on("error", () => {});
  });

  // ---------- UDP bridge ----------
  const udp = new osc.UDPPort({ localAddress: "0.0.0.0", localPort: UDP_IN, metadata: true });
  udp.on("message", (msg, _time, info) => {
    const key = `${info.address}:${info.port}`;
    if (!udpPeers.has(key)) { udpPeers.set(key, { address: info.address, port: info.port }); log(`native peer ${key}`); }
    if (msg.address === "/hello") return;
    relay(msg, null, key);
  });
  udp.on("error", (e) => log("udp error: " + e.message));
  udp.open();

  // ---------- the control relay ----------
  // One place to intervene in the room's control traffic: delay it,
  // drop it, invert values, remap addresses...
  function relay(msg, fromSocket, fromUdpKey) {
    if (msg.args && msg.args.length) latest.set(msg.address, msg);
    for (const s of sockets) if (s !== fromSocket) { try { s.send(msg); } catch (_) {} }
    for (const [key, p] of udpPeers) if (key !== fromUdpKey) udp.send(msg, p.address, p.port);
    if (process.env.QUIET !== "1") log(fmt(msg));
  }

  server.listen(HTTPS_PORT, "0.0.0.0", () => {
    console.log("\nDissonance relay running");
    for (const ip of localIPs()) console.log(`  open:  https://${ip}:${HTTPS_PORT}`);
    console.log(`  (the browser will warn about the certificate once: choose Advanced, then proceed)`);
    console.log(`  native OSC: send to port ${UDP_IN} (send /hello once to subscribe)\n`);
  });
}


function readInstrumentIndex() {
  try {
    const parsed = JSON.parse(fs.readFileSync(INSTRUMENT_META, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) { return []; }
}

function receiveInstrument(req, res) {
  const MAX = 768 * 1024; // plenty for a single-file Web Audio instrument
  let size = 0, body = "";
  req.setEncoding("utf8");
  req.on("data", (chunk) => {
    size += Buffer.byteLength(chunk);
    if (size > MAX) {
      res.writeHead(413, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "instrument is too large" }));
      req.destroy();
      return;
    }
    body += chunk;
  });
  req.on("end", () => {
    if (res.writableEnded) return;
    let data;
    try { data = JSON.parse(body); }
    catch (_) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "invalid upload" }));
    }

    const title = cleanLabel(data.title, 80);
    const author = cleanLabel(data.author, 80);
    let html = typeof data.html === "string" ? data.html.trim() : "";
    if (!title || !html || !/<html|<!doctype/i.test(html)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "give the instrument a name and upload a complete HTML file" }));
    }

    // Participant-generated files usually refer to dissonance.js relatively.
    // A <base> tag makes those references resolve to the relay root even though
    // contributions live under /instruments/.
    if (!/<base\b/i.test(html)) {
      html = /<head[^>]*>/i.test(html)
        ? html.replace(/<head([^>]*)>/i, '<head$1>\n<base href="/">')
        : '<base href="/">\n' + html;
    }

    const stem = slug(title) || "instrument";
    const stamp = Date.now().toString(36);
    const filename = `${stem}-${stamp}.html`;
    fs.writeFileSync(path.join(INSTRUMENT_DIR, filename), html, "utf8");

    const items = readInstrumentIndex();
    const item = {
      id: filename.replace(/\.html$/, ""),
      title,
      author,
      file: filename,
      url: `/instruments/${filename}`,
      createdAt: new Date().toISOString(),
    };
    items.unshift(item);
    fs.writeFileSync(INSTRUMENT_META, JSON.stringify(items.slice(0, 250), null, 2) + "\n");

    log(`instrument posted: ${title}${author ? ` by ${author}` : ""}`);
    res.writeHead(201, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(item));
  });
}

function cleanLabel(value, max) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}
function slug(value) {
  return String(value || "").toLowerCase().normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}

// A self-made certificate, created once and reused so browsers only warn once.
async function certificate() {
  const keyFile = path.join(CERT_DIR, "key.pem"), certFile = path.join(CERT_DIR, "cert.pem");
  if (fs.existsSync(keyFile) && fs.existsSync(certFile)) {
    return { key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) };
  }
  const notAfter = new Date(); notAfter.setDate(notAfter.getDate() + 365);
  const altNames = [{ type: 2, value: "localhost" }, ...localIPs().concat("127.0.0.1").map((ip) => ({ type: 7, ip }))];
  const pems = await selfsigned.generate([{ name: "commonName", value: "dissonance relay" }], {
    keySize: 2048, algorithm: "sha256", notAfterDate: notAfter,
    extensions: [{ name: "subjectAltName", altNames }],
  });
  fs.mkdirSync(CERT_DIR, { recursive: true });
  fs.writeFileSync(keyFile, pems.private);
  fs.writeFileSync(certFile, pems.cert);
  console.log("made a new certificate in ./cert");
  return { key: pems.private, cert: pems.cert };
}

function localIPs() {
  const ips = Object.values(os.networkInterfaces()).flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i.address);
  return ips.length ? ips : ["localhost"];
}
function fmt(m) { return `${m.address} ${(m.args || []).map((a) => (typeof a.value === "number" ? a.value.toFixed(3) : a.value)).join(" ")}`; }
function log(s) { console.log(new Date().toISOString().slice(11, 19), s); }
