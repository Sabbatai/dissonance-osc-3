// Dissonance relay: one laptop runs this, everyone else connects to it.
//
//  - Serves the browser instruments in ./public over HTTP (port 8080)
//  - WebSocket hub on the same port: every OSC message a browser sends
//    is rebroadcast to all other browsers
//  - UDP bridge (port 57121 in, 57120 out): native tools (SuperCollider,
//    Pd, Max, TouchDesigner, Python) join the same conversation
//
// Run:  node server.js
// Then open http://<this-laptop-ip>:8080 on any device on the network.

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const osc = require("osc");
const { WebSocketServer } = require("ws");

const HTTP_PORT = 8080;
const UDP_IN = 57121;      // native tools send here
const UDP_OUT = 57120;     // native tools listen here (SuperCollider default)

// Native clients register by sending /hello from their UDP port.
// Anyone who has ever sent us something also gets messages back.
const udpPeers = new Map(); // "ip:port" -> {address, port}

// ---------- HTTP: serve ./public ----------
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = http.createServer((req, res) => {
  const file = path.join(__dirname, "public", req.url === "/" ? "index.html" : req.url);
  if (!file.startsWith(path.join(__dirname, "public"))) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
});

// ---------- WebSocket hub ----------
const wss = new WebSocketServer({ server });
const sockets = new Set();

wss.on("connection", (raw, req) => {
  const port = new osc.WebSocketPort({ socket: raw, metadata: true });
  sockets.add(port);
  log(`browser joined (${req.socket.remoteAddress}), ${sockets.size} connected`);

  port.on("message", (msg) => relay(msg, port));
  port.on("close", () => { sockets.delete(port); log(`browser left, ${sockets.size} connected`); });
  port.on("error", () => {});
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

// ---------- the relay itself ----------
// This function is also where a workshop could intervene in the
// traffic: delay it, drop it, invert values, remap addresses...
function relay(msg, fromSocket, fromUdpKey) {
  for (const s of sockets) if (s !== fromSocket) safeSend(s, msg);
  for (const [key, p] of udpPeers) if (key !== fromUdpKey) udp.send(msg, p.address, p.port);
  if (process.env.QUIET !== "1") log(fmt(msg));
}

function safeSend(port, msg) { try { port.send(msg); } catch (_) {} }
function fmt(m) { return `${m.address} ${(m.args || []).map((a) => (typeof a.value === "number" ? a.value.toFixed(3) : a.value)).join(" ")}`; }
function log(s) { console.log(new Date().toISOString().slice(11, 19), s); }

server.listen(HTTP_PORT, "0.0.0.0", () => {
  const ips = Object.values(os.networkInterfaces()).flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i.address);
  console.log("\nDissonance relay running");
  for (const ip of ips.length ? ips : ["localhost"]) console.log(`  browsers:  http://${ip}:${HTTP_PORT}`);
  console.log(`  native OSC: send to port ${UDP_IN} (send /hello once to subscribe)\n`);
});
