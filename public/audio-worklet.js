// Audio worklets used by dissonance.js. You don't need to touch this.
//
// Wire format: mono 16-bit samples at 48 kHz, 512 samples per packet
// (about 10.7 ms). Both ends resample if their AudioContext runs at a
// different rate.

const WIRE_RATE = 48000;
const PACKET = 512;

// ---------- sender: mixes to mono, resamples to 48k, posts packets ----------
class DissonanceSend extends AudioWorkletProcessor {
  constructor() {
    super();
    this.step = sampleRate / WIRE_RATE;   // input samples per wire sample
    this.t = 0;                           // next read position in the current block
    this.prev = 0;
    this.buf = new Int16Array(PACKET);
    this.n = 0;
    this.on = true;
    this.mono = new Float32Array(128);
    this.port.onmessage = (e) => { if ("on" in e.data) this.on = e.data.on; };
  }
  process(inputs) {
    const inp = inputs[0];
    if (!this.on || !inp || !inp.length) return true;
    const len = inp[0].length;
    if (this.mono.length !== len) this.mono = new Float32Array(len);
    const m = this.mono;
    for (let i = 0; i < len; i++) {
      let s = 0;
      for (let c = 0; c < inp.length; c++) s += inp[c][i];
      m[i] = s / inp.length;
    }
    while (this.t <= len - 1) {
      const i = Math.floor(this.t), f = this.t - i;
      const a = i < 0 ? this.prev : m[i], b = m[i + 1 < len ? i + 1 : len - 1];
      const s = Math.max(-1, Math.min(1, a + (b - a) * f));
      this.buf[this.n++] = s * 32767;
      if (this.n === PACKET) {
        this.port.postMessage(this.buf.buffer, [this.buf.buffer]);
        this.buf = new Int16Array(PACKET);
        this.n = 0;
      }
      this.t += this.step;
    }
    this.t -= len;
    this.prev = m[len - 1];
    return true;
  }
}

// ---------- receiver: jitter buffer, resamples 48k to the local rate ----------
// Buffers TARGET before playing. If the network stalls it goes quiet and
// buffers again; if packets pile up (clock drift, a hiccup) it skips ahead,
// so delay never creeps up.
class DissonanceReceive extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const ms = (options.processorOptions && options.processorOptions.bufferMs) || 60;
    this.TARGET = Math.round(WIRE_RATE * ms / 1000);
    this.MAX = this.TARGET + Math.round(WIRE_RATE * 0.15);
    this.size = WIRE_RATE * 2;
    this.ring = new Float32Array(this.size);
    this.w = 0;        // samples written (absolute)
    this.r = 0;        // read position (absolute, fractional)
    this.playing = false;
    this.step = WIRE_RATE / sampleRate;
    this.port.onmessage = (e) => {
      const pcm = new Int16Array(e.data);
      for (let i = 0; i < pcm.length; i++) this.ring[(this.w + i) % this.size] = pcm[i] / 32768;
      this.w += pcm.length;
    };
  }
  process(_inputs, outputs) {
    const out = outputs[0];
    const len = out[0].length;
    let avail = this.w - this.r;
    if (!this.playing && avail >= this.TARGET) this.playing = true;
    if (this.playing && avail > this.MAX) { this.r = this.w - this.TARGET; avail = this.TARGET; }
    for (let i = 0; i < len; i++) {
      let s = 0;
      if (this.playing) {
        if (this.w - this.r < 2) { this.playing = false; }
        else {
          const k = Math.floor(this.r), f = this.r - k;
          const a = this.ring[k % this.size], b = this.ring[(k + 1) % this.size];
          s = a + (b - a) * f;
          this.r += this.step;
        }
      }
      for (let c = 0; c < out.length; c++) out[c][i] = s;
    }
    return true;
  }
}

registerProcessor("dissonance-send", DissonanceSend);
registerProcessor("dissonance-receive", DissonanceReceive);
