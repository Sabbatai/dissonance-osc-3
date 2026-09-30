# Dissonance: networked browser instruments

A small system for improvising together with instruments that run in a
web browser. Everyone's instruments share their controls with each
other: you can let another player's slider move yours, follow their
notes, or process their sound. You can also ask an AI chatbot (an LLM
such as ChatGPT or Claude) to build a new instrument that joins in.

It was made for the Dissonance Workshop at NordiCHI 2026 in Vaasa.

**How it fits together:** one laptop (the *host*) runs a small program
called the **relay**. Everyone else opens a web address that the relay
gives them. The relay passes every control move and every sound stream
between the players. Nothing goes to the internet; it all stays on the
local Wi-Fi.

Jump to:
- [Joining and playing](#joining-and-playing) if you are a participant
- [Making your own instrument](#making-your-own-instrument-with-an-llm)
- [Running the relay](#running-the-relay-for-hosts) if you are hosting
- [Troubleshooting](#troubleshooting)
- [Technical reference](#technical-reference) for developers

---

## Joining and playing

You need a laptop with **Chrome** (Edge and Firefox also work) on the
same Wi-Fi as the host.

1. **Open the address the host gives you.** It looks like
   `https://192.168.1.20:8443`. Type the whole thing, including
   `https://` and `:8443`.
2. **Get past the security warning (once).** The relay makes its own
   security certificate, so the browser doesn't recognise it and
   warns you. This is expected. In Chrome click **Advanced**, then
   **Proceed**. (Firefox: **Advanced**, then **Accept the risk**.
   Safari: **Show details**, then **visit this website**.)
3. **Pick an instrument** by adding its name to the address, for
   example `https://192.168.1.20:8443/melody.html`. See
   [the instruments](#the-instruments) below.
4. **Type your name** in the "My name" box. Everyone needs a
   different name, because it is how others find your controls and
   your sound.
5. **Press Start sound.** Browsers only allow sound after a click.

If the host is playing everything through a PA system, set
**my speakers** to **off** (next to Start) so the room only hears the
PA.

### The controls next to each slider

Every slider or button has a small strip of controls beside it. They
decide how that control connects to other players:

| Control | What it does |
|---|---|
| **dot** | Lights up green when someone else is moving this control. |
| **in** | Who controls this. `none` means only you. Pick an entry to let that control follow it: `shared density` follows the room's density, `ana pitch` follows Ana's pitch slider, and so on. New entries appear as other players start moving things. |
| **inv** | Flips what comes in (high becomes low). Only shows while **in** is set. |
| **out** | Who hears you. `off`: nobody. `shared`: the room's common control of that name. `mine`: under your name, for others to pick if they want. `both`: shared and mine. |

Bright menus are active; dimmed ones are off.

Three controls are **shared** by default on every instrument:
**density**, **brightness** and **pulse**. When anyone moves one, it
moves for everyone who is listening to it. Just intonation instruments
also share their **root** and **scale**, so they stay in tune with
each other.

Your choices are remembered in your browser, so a reload keeps them.

### The sound controls next to Start

| Control | What it does |
|---|---|
| **Stop sound / Resume sound** | Pauses everything this page is doing with sound. Pressing Start also resumes. |
| **send audio** | `on` sends your sound into the room: it appears on the mixer and others can process it. |
| **my speakers** | `on` plays your sound on your own laptop. Turn it off when the PA is in use. |
| **audio in** (effects only) | Whose sound this effect processes. |

### The instruments

| Address | What it is |
|---|---|
| `/` (or `/index.html`) | **Drone.** Two detuned tones. The simplest instrument, and the template for making your own. |
| `/sequencer.html` | **Odd Sequencer.** Four rhythm lanes of 5, 7, 11 and 13 steps that drift against each other. Click steps on and off. The pluck lane is tuned in just intonation, with a pitch slider per step. |
| `/melody.html` | **Just Melody.** A single melodic voice in the same tuning as the sequencer. Play it with the on-screen keys, turn on **Auto phrase** to let it improvise, or set **position**'s **in** to another player's `note` to play their exact notes (use **harmony** to play a parallel line). |
| `/fx.html` | **Ring Delay FX.** An effect: choose whose sound to process in **audio in**, then shape it with a ring modulator and a feedback delay. **pulse** freezes the delay for two seconds. |
| `/mixer.html` | **Room Mixer.** For the laptop connected to the PA. Every player who is sending audio gets a channel with a fader, mute (M), solo (S) and a level meter. |

### Good to know

- **Sound through the network arrives a little late:** about 80 ms
  for each hop. An instrument heard through an effect and then the
  mixer is about 160 ms behind. It suits textures and layers better
  than tightly locked rhythm.
- **Loops are allowed.** If you process someone's sound while they
  process yours, you get a feedback loop. A limiter keeps it from
  getting destructively loud.
- **Keep your instrument open while you work in other windows.** It
  keeps playing in the background.

---

## Making your own instrument with an LLM

You describe an instrument in words, an AI chatbot writes it, and the
host puts it on the relay. The files here already handle all the
networking, so the chatbot only has to write the sound and the
controls.

### 1. Get the template

Open the drone (`https://<host address>:8443/`) and view its source
code: in Chrome press **Ctrl+U** (Windows) or **Cmd+Option+U** (Mac).
Select all and copy it. You can also copy `public/index.html` from this
repository.

### 2. Ask the chatbot

Paste the template into the chat together with this prompt. Replace the
part in square brackets with your idea:

```
Here is an instrument for a networked improvisation. Make a new
instrument that [describe your idea: what it sounds like, how it
behaves, what the controls do].

Rules, so it works on the shared network:
- Keep the two script tags that load osc-browser.min.js and
  dissonance.js, and keep the elements with the ids status, name
  and log.
- Register every slider or button that other players might want to
  share or control with param(), like the template does:
    param(id, { input, min, max, kind, send, listen, onChange })
    kind: "value" (default), "trigger" (a button), or "out" (send only)
    send: "off" | "shared" | "personal" | "both" (default "shared")
    listen: address to follow, "" for none (default "/shared/<id>")
    onChange(v) runs for local moves and for incoming control.
  It returns p with p.value, p.set(v) (apply and send), and
  p.emit(v) (send only).
- Include controls called density, brightness and pulse.
- Create the audio context with audioContext() instead of
  new AudioContext(), and connect the final output to audioOut()
  instead of ctx.destination.
- To process another player's sound (an effect), use
  audioIn("input", { anchor: "<id of an element>" }). It returns an
  audio node to connect into the effect.
- For anything timed (sequencers, arpeggios, automatic playing) use
  bgInterval(fn, ms), bgTimeout(fn, ms) and clearBg(id) instead of
  setInterval and setTimeout, and schedule notes up to
  ctx.currentTime + lookahead() ahead.
- Return the complete HTML file.
```

### 3. Save it

Copy everything the chatbot returns into a plain text file and name it
after yourself, for example `ana.html`. Use a plain text editor (Notepad
on Windows, TextEdit on Mac set to Format → Make Plain Text), or save it
straight from a code editor.

### 4. Put it on the relay

Send the file to the host (chat, AirDrop, USB stick). The host puts it
in the relay's `public` folder. Then open
`https://<host address>:8443/ana.html`. Your instrument's controls get
their routing strips automatically, and it shows up for everyone else.

### 5. Change it

Tell the chatbot what to change ("make it darker", "add a second
voice", "the pulse button does nothing"), save over your file, send it
again, and reload the page.

If it doesn't work, paste the chatbot's code back to it along with what
went wrong. The small black box at the bottom of the page shows the
messages your instrument receives, which can help.

---

## Running the relay (for hosts)

The relay runs on one laptop (Mac, Windows or Linux). The first-time
setup takes about 10 minutes and needs internet once. After that
everything works offline.

### First-time setup

1. **Install Node.js** (the program that runs the relay): download the
   "LTS" version from [nodejs.org](https://nodejs.org) and install it.
2. **Get this project.** On the GitHub page, click the green **Code**
   button, then **Download ZIP**, and unzip it somewhere you'll find
   again. (If you use git: `git clone` the repository instead.)
3. **Open a terminal in the project folder.**
   - Mac: open **Terminal**, type `cd ` (with a space), drag the
     project folder into the Terminal window, and press Return.
   - Windows: open the project folder in File Explorer, click the
     address bar, type `cmd` and press Enter.
4. **Install the project's parts** by typing:
   ```
   npm install
   ```
   Warnings about funding or a newer npm version are harmless.

### Every time

1. Open a terminal in the project folder (as above) and type:
   ```
   npm start
   ```
2. The relay prints one or more addresses such as
   `https://192.168.1.20:8443`. **Share the one for your Wi-Fi**: it
   usually starts with `192.168.` or `10.`. If there are several and
   you are unsure, on a Mac type `ipconfig getifaddr en0` in a second
   Terminal window; that prints your Wi-Fi address. (Addresses starting
   with `100.` are usually a VPN such as Tailscale and won't work for
   others.)
3. Open the address yourself, get past the certificate warning, and
   start the mixer (`/mixer.html`) if you use a PA.
4. The first time, your computer may ask whether to allow incoming
   connections for "node". Click **Allow**.
5. To stop the relay, press **Ctrl+C** in the terminal.

Keep the terminal window open while playing; closing it stops the relay.

**Run only one copy of the project.** If you unzip several versions,
make sure the terminal is in the folder you mean to use. A relay
started from an old folder serves old instruments.

### Adding participants' instruments

Put their `.html` file into the project's `public` folder. It is
available straight away at `https://<your address>:8443/<file name>`;
no restart needed.

### The network in Vaasa

The relay doesn't need the internet, but the laptops must be able to
reach each other, and venue or university Wi-Fi (including eduroam)
often blocks that. In order of reliability:

1. **Bring a travel router** (any cheap one). Everyone, including the
   relay laptop, joins its Wi-Fi. Nothing depends on the venue.
2. **Use the relay laptop as a hotspot.** Fine for a handful of people;
   most laptop hotspots allow about 8 devices.
3. **Try the venue Wi-Fi.** Have a second person open the relay
   address. If it doesn't load for them, the network is blocking it;
   switch to option 1.

Your address changes with the network, so read it again from the
terminal after joining the Wi-Fi in Vaasa.

**Backup plan** if sound over the network misbehaves: turn **send
audio** off everywhere, let everyone play through their own speakers,
and let effects listen through the air (a microphone input would need
a small addition).

---

## Troubleshooting

| Problem | What to try |
|---|---|
| The page doesn't load on another laptop | Is it on the same Wi-Fi? Did you type `https://` and `:8443`? On the host, allow "node" in the firewall (Mac: System Settings → Network → Firewall). Some venue networks block this entirely; see [the network in Vaasa](#the-network-in-vaasa). |
| "Your connection is not private" | Expected. Click **Advanced**, then **Proceed**. |
| No sound | Press **Start sound**. Check **my speakers** is on (or that the mixer is running), and that **Stop sound** isn't red. |
| My channel doesn't appear on the mixer | Check **send audio** is on and you pressed Start sound. Channels appear within a couple of seconds. |
| Someone's control isn't in my **in** menu | It appears once they have moved it (or started playing). Ask them to move it once. |
| Two players are mixed up | Each page needs a different **My name**. |
| Changes don't show up after an update | Hard-refresh the page: **Cmd+Shift+R** (Mac) or **Ctrl+Shift+R** (Windows). Check the relay is running from the right folder. |
| Everything is out of tune with each other | Make sure **root** and **scale** have **in** set to `shared root` and `shared scale`. |

---

## Technical reference

### Files

| File | Purpose |
|---|---|
| `server.js` | The relay: HTTPS server (8443, with 8080 redirecting), control hub, audio hub, OSC UDP bridge. |
| `public/dissonance.js` | Shared library every instrument loads: network, routing strips, audio in and out, timers. |
| `public/audio-worklet.js` | Audio capture, jitter buffer and resampling for streams. |
| `public/*.html` | The instruments and the mixer. |
| `cert/` | The relay's self-made certificate, created on first run (not in git). |

### Addresses

Controls travel as OSC messages with a single float from 0 to 1:

| Address | Meaning |
|---|---|
| `/shared/<param>` | The room's common control (no argument for triggers). |
| `/player/<name>/<param>` | One player's own control. |

The relay remembers the latest value on every address and sends that
snapshot to each page as it joins, so latecomers start in step.
Restart the relay to clear it. Values received from others are never
re-sent, so routing can't loop endlessly.

### Instrument API (from `dissonance.js`)

```
param(id, { input, anchor, min, max, value, kind, send, listen, onChange })
  -> p.value, p.set(v), p.emit(v)
audioContext()                 shared AudioContext (48 kHz)
audioOut({ anchor })           node to connect your final sound to
audioIn(id, { anchor, source, bufferMs, strip })  -> node with another player's sound
stopButton({ anchor })         Stop sound / Resume sound button
onStreams(fn)                  called with the list of players sending audio
bgInterval(fn, ms), bgTimeout(fn, ms), clearBg(id)   timers that keep time in the background
lookahead()                    seconds ahead to schedule notes (grows when the page is starved)
send(address, value), on(address, fn)   raw control messages, bypassing routing
```

### Audio streaming

Streams are mono, 48 kHz, 16-bit, in packets of 512 samples: about
0.8 Mbit/s from each sender and the same again for each listener, well
within a travel router's capacity. A 60 ms jitter buffer on each
receiver gives about 80 ms per hop. Packets pass between the audio
worklets and a network worker directly, never through the page's main
thread, and sequencers schedule further ahead when the browser slows a
page down. That is what keeps covered and background windows playing.
Every page also plays an inaudible 15 Hz tone to its own output so
Chrome counts it as active.

### Native tools (SuperCollider, Pd, Max, TouchDesigner, Python)

Send OSC to the relay's address on UDP port **57121**. Send `/hello`
once so the relay knows where to send messages back (it replies to the
port you sent from).

```supercollider
~relay = NetAddr("192.168.1.20", 57121);
~relay.sendMsg("/hello");
OSCdef(\bright, { |msg| msg[1].postln }, "/shared/brightness");
~relay.sendMsg("/shared/density", 0.4);
```

### Intervening in the traffic

Every control message passes through `relay()` in `server.js`: the one
place to delay, drop, invert or reroute messages for the whole room.
`QUIET=1 npm start` hides the message log in the terminal.
