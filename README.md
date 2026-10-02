# Dissonance Workshop Toolkit

Dissonance is a browser-based environment for making, modifying, and connecting small musical instruments during the workshop. Everyone joins the same local network, opens an instrument in a browser, and can then play locally, send sound to the room mixer, or let one instrument control another.

You do **not** need to know JavaScript, OSC, WebSockets, or audio programming to participate.

---

## Participant quick start

### 1. Join the workshop network

Connect your laptop to the Wi-Fi network provided by the facilitators.

### 2. Open the workshop link

A facilitator will give you an address that looks something like:

```text
https://192.168.1.20:8443
```

Open it in Chrome if possible.

The first time you connect, your browser may warn you that the connection is not private. This is expected: the workshop server uses a local certificate because browser audio requires HTTPS.

In Chrome, choose **Advanced** and then **Proceed**.

### 3. Choose an instrument

The toolkit currently includes:

- **Basic instrument** — a simple synthesizer and the easiest place to begin.
- **Sequencer** — a four-part rhythmic sequencer with changing pattern lengths and tuning controls.
- **Melody** — a monophonic melodic instrument that can be played manually, generate phrases, or follow another instrument.
- **Effect** — processes audio sent by another participant.
- **Mixer** — used by the facilitators or whoever is connected to the room speakers.
- **Instrument gallery** — shared instruments made and posted by workshop participants.

You can also open the shared participant gallery directly at:

```text
https://<workshop-address>:8443/gallery.html
```

The gallery grows during the workshop as people post new instruments.

### 4. Enter a name

Give yourself a short, unique name. This is how other people will see your instrument in routing menus.

For example:

```text
alex
maria
laptop3
```

Avoid using the same name as someone else.

### 5. Start sound

Click **Start sound**.

Every instrument has two important audio options:

- **send audio** — sends your instrument to the shared mixer.
- **my speakers** — plays the instrument directly through your own laptop.

During a room performance, you will normally leave **send audio** on and turn **my speakers** off so everyone hears you through the shared PA rather than from individual laptops.

Use **Stop sound** if you need to silence your instrument completely. **Resume sound** brings it back without resetting your work.

---

## The main idea: instruments can affect one another

Most controls have a small routing strip next to them. You can use it to decide whether a control is yours alone, whether you share it with the room, or whether it follows something another participant is doing.

You do not need to understand OSC addresses to use this.

### `in`

Choose something from another instrument that you want this control to follow.

Examples:

- make your **brightness** follow someone else's density;
- make your **root note** follow another player's pitch;
- make the Melody's **position** follow the Sequencer's notes.

Choose **none** to control the parameter yourself again.

### `inv`

When a control is following something else, **inv** reverses the incoming value.

For example, a bright sound could become dark when another player's control becomes bright.

### `out`

This decides whether your movement is available to other players.

The useful choices are:

- **off** — do not send this control anywhere;
- **shared** — make it available to everyone;
- **mine** — identify it specifically as coming from you;
- **both** — send both versions.

If you are unsure, leave the default settings alone.

### The small dot

The dot next to a parameter lights when that parameter is being moved by incoming network activity.

---

## A few things to try

You can use the instruments independently, but the interesting part of the workshop is making connections between them.

Try things like:

- Route one person's **density** into another person's **brightness**.
- Route a Sequencer's **note** output into the Melody's **position** so the Melody follows the same pitches.
- Change the Sequencer's pattern lengths so the four lanes drift in and out of alignment.
- Send an instrument into the **Effect**, then send the processed result to the Mixer.
- Make several people listen to the same shared control and then change it from one place.
- Intentionally create strange relationships between unrelated parameters and see what happens.

There is no requirement that a routing choice make conventional musical sense.

---

## Make and post a new instrument

Part of the workshop is rapid prototyping. You can use an LLM to make a new instrument, controller, effect, or other small musical tool and then post it to the shared Dissonance server so everyone can open it.

You do **not** need access to the server computer's file system.

### 1. Make a single HTML file

The easiest approach is to give an LLM one of the existing instruments as an example and ask it to transform the idea while keeping the Dissonance networking intact.

A useful prompt is:

> This is a browser instrument for a collaborative networked music workshop. Keep the existing Dissonance networking and audio code intact, but redesign the instrument so that it [describe your idea]. Keep the existing name, status, routing, and audio controls working. Make any new musical controls routable so other participants can control them or listen to them. Return one complete HTML file. Do not replace the shared networking or audio functions with new browser APIs.

Examples:

> Turn this into a noisy resonator with three frequency bands.

> Make a controllable swarm of buzzing voices with swarm size, fundamental pitch, spread, and chaos.

> Make a vocal processor with several simultaneous pitch shifts and adjustable spacing between them.

> Make four LFOs that can be routed to parameters on other instruments.

Try to keep generated instruments as **one complete `.html` file**. This makes them easy to post and share.

### 2. Open the submission page

Go to:

```text
https://<workshop-address>:8443/submit.html
```

For example, if the workshop server is:

```text
https://192.168.1.20:8443
```

then the submission page is:

```text
https://192.168.1.20:8443/submit.html
```

### 3. Post your instrument

On the submission page:

1. Give the instrument a name.
2. Optionally enter your own name.
3. Choose the `.html` file from your computer **or** paste the complete HTML into the text box.
4. Click **Post instrument**.

You do not need to rename the file first. The server creates a unique stored filename so one participant cannot accidentally overwrite another participant's instrument.

### 4. Open the shared gallery

Go to:

```text
https://<workshop-address>:8443/gallery.html
```

Your instrument should appear in the gallery immediately.

Click **Open instrument** to launch it in a new tab.

Anyone connected to the same Dissonance server can open instruments from this gallery.

### 5. Connect it to other instruments

A posted instrument is not isolated. If it uses the Dissonance routing helpers, its controls and outputs can appear in other instruments' routing menus.

For example:

- route an LFO into the Bee Swarm's **fundamental**;
- route another LFO into **chaos**;
- send a generated synthesizer's audio to the shared Mixer;
- process another participant's audio with a generated effect.

### Important for generated instruments

If you are asking an LLM to modify an existing workshop instrument, tell it **not to remove or replace the Dissonance networking/audio infrastructure**.

Generated instruments should continue using the helpers already present in the workshop files for:

- starting audio;
- sending audio to the mixer;
- receiving another player's audio;
- routing parameters;
- timing sequencers and other repeating events.

The shared server automatically makes normal Dissonance references such as these work from posted instruments:

```html
<script src="osc-browser.min.js"></script>
<script src="dissonance.js"></script>
```

If a generated instrument breaks networking or audio, return to the last working version and make smaller changes.

### A note about very fast control signals

Control instruments such as LFOs can generate many network messages. Very high update rates, especially from several controllers at once, can compete with realtime audio and create audible artifacts.

For workshop use, prefer moderate control rates and avoid sending changes faster than they are musically useful. Slow modulation usually does not need dozens or hundreds of updates per second.

---

## Included instruments

### Basic instrument — `index.html`

A simple two-oscillator synthesizer and the smallest example in the project.

Useful controls include density, brightness, pitch, and pulse.

This is the best file to copy when building something new.

### Sequencer — `sequencer.html`

A four-lane polymetric sequencer. The lanes can have different lengths, so their patterns drift in and out of alignment.

Density changes how many events occur. Brightness changes filtering and decay. Pulse resets the lanes back to their first step.

The pitched lane uses a just-intonation scale and can send its current note to other instruments.

### Melody — `melody.html`

A monophonic melodic instrument using the same tuning system as the Sequencer.

You can play it from the screen, let **Auto phrase** generate a line, or route another instrument into **position**.

To make the Melody follow the Sequencer's exact pitches, set Melody **position** to listen to the Sequencer's **note** output.

### Effect — `fx.html`

Processes another participant's incoming audio using ring modulation, filtering, and delay.

Choose whose sound you want to process from the **audio in** menu.

### Mixer — `mixer.html`

Collects audio from everyone who has **send audio** enabled.

Each participant appears as a mixer channel with level, mute, solo, and meter controls. The mixer also has a master output and limiter.

Usually only the facilitator or the laptop connected to the room speakers needs to use this page.

---

## If something goes wrong

### I cannot hear my instrument

Check:

1. Did you click **Start sound**?
2. Is **Stop sound** currently active?
3. If you want to hear the instrument from your laptop, is **my speakers** turned on?
4. If you are listening through the room mixer, is **send audio** turned on?
5. Is your channel muted or turned down on the Mixer?

### I cannot see another person's controls in a routing menu

Make sure both of you are connected to the same workshop server and that the other instrument has been started and is sending activity.

### The Effect is silent

Choose an active participant from its **audio in** menu and make sure that participant has **send audio** enabled.

### The page will not load on another laptop

The laptops may not actually be able to communicate with one another on the current Wi-Fi network. Tell a facilitator.

### The browser shows a security warning

This is expected for the workshop's local HTTPS connection. Use the browser's advanced option to proceed to the local site.

### Everything gets loud unexpectedly

Turn down the Mixer master or mute the relevant channel. Routing processed audio back into itself can create feedback.

---

# Facilitator and collaborator setup

Everything below this point is mainly for people running or extending the workshop.

## Start the relay

The relay computer needs Node.js 18 or newer.

The first time you use the project, install its dependencies while connected to the internet:

```bash
npm install
```

Then start it with:

```bash
npm start
```

The terminal prints the local HTTPS address to share with participants, for example:

```text
https://192.168.1.20:8443
```

The relay can run without internet access once the dependencies have been installed.

To hide the continuous message log:

```bash
QUIET=1 node server.js
```

## Recommended workshop network

The relay needs all participating laptops to be able to reach one another on the local network.

Venue Wi-Fi and eduroam often prevent this through client isolation.

Preferred order:

1. **Travel router** — most reliable. Connect the relay laptop and all participants to the same router.
2. **Relay laptop hotspot** — workable for a small group, though operating systems may limit the number of connected devices.
3. **Venue Wi-Fi** — use only after testing that one participant can actually open the relay page hosted by another machine.

The first time the relay runs, the operating system may display a firewall prompt. Allow local network access.

## HTTPS certificate

The relay creates its own local certificate because browser audio streaming requires a secure context.

The certificate is stored in `cert/` and is not committed to Git.

Participants will normally see a browser warning once and must manually proceed.

The older HTTP address on port 8080 redirects to HTTPS.

---

# Technical reference

## Shared control addresses

```text
/shared/<parameter>
/player/<name>/<parameter>
```

`/shared/...` is available to everyone. `/player/...` identifies a value from a specific participant.

Common parameters include `density`, `brightness`, and `pulse`, but instruments can expose any additional parameters they need.

The relay remembers the latest value sent to each address. A participant joining late therefore receives the most recent state rather than starting completely disconnected from the room.

Restart the relay to clear that stored state.

## Audio routing

Browser instruments can stream mono audio to the relay and receive other streams from it.

Each instrument uses the shared audio controls for:

- sending audio to the room;
- optionally monitoring through the local laptop;
- stopping and resuming sound.

Effects can select another stream as input. The mixer subscribes to all active participant streams.

Network audio has latency and should not be treated as a sample-accurate substitute for a physical audio interface. It is most useful for distributed textures, transformations, and workshop experimentation.

## Native OSC clients

SuperCollider, Pure Data, Max, TouchDesigner, Python, and other OSC-capable environments can communicate with the relay using UDP port **57121**.

Send `/hello` once so the relay knows where to return OSC messages.

Example in SuperCollider:

```supercollider
~relay = NetAddr("192.168.1.20", 57121);
~relay.sendMsg("/hello");
OSCdef(\bright, { |msg| msg[1].postln }, "/shared/brightness");
~relay.sendMsg("/shared/density", 0.4);
```

## For developers and LLM-generated instruments

Every browser instrument loads `public/dissonance.js`.

When adding a routable parameter, use the existing `param()` helper rather than creating a separate networking system.

```js
param(id, {
  input,
  min,
  max,
  kind,
  send,
  listen,
  onChange
})
```

Typical values:

```text
kind: "value", "trigger", or "out"
send: "off", "shared", "personal", or "both"
listen: an incoming address, or "" for none
```

For audio, use the project's existing audio helpers instead of constructing an unrelated Web Audio graph around them.

Use:

```js
audioContext()
audioOut()
audioIn()
```

For repeating musical processes, use the timing helpers already provided by `dissonance.js` rather than ordinary `setInterval()` or `setTimeout()`.

This is especially important for sequencers and generative processes running while another browser window is in front.

## Intervening in network traffic

All messages pass through `relay()` in `server.js`.

That is the central place to experiment with whole-room transformations such as delaying, dropping, inverting, or rerouting network messages.

## Shared instrument library

Participant-facing posting instructions are above under **Make and post a new instrument**.

Uploaded instruments are stored in the server's `instruments/` folder. They cannot overwrite the built-in instruments in `public/`. Restarting the relay does not erase them.

If the facilitator wants a fresh gallery before a new workshop:

1. Remove the contributed `.html` files from `instruments/`.
2. Replace `instruments/index.json` with an empty array:

```json
[]
```

The server adds the path handling needed for posted instruments to continue loading the shared Dissonance JavaScript files from the project root.

## Optional remote access with Cloudflare Tunnel

For testing or remote collaboration, the Dissonance HTTPS server can be exposed temporarily through a Cloudflare Tunnel.

This has been tested successfully with one participant controlling instrument parameters remotely through the tunnel while the Dissonance server and receiving instrument were on another network.

Start Dissonance normally, then run:

```bash
cloudflared tunnel --url https://localhost:8443 --no-tls-verify
```

`cloudflared` prints a temporary public address similar to:

```text
https://example-words.trycloudflare.com
```

Remote collaborators can use that address in place of the local workshop address. For example:

```text
https://example-words.trycloudflare.com/gallery.html
https://example-words.trycloudflare.com/submit.html
```

The `--no-tls-verify` option is needed for the project's locally generated HTTPS certificate.

### Important

A Quick Tunnel is useful for **testing and remote collaboration**, but the normal workshop setup should still use the local workshop network when possible.

Remote network latency and jitter can affect audio, and high-rate control streams can increase network load. Parameter routing is generally more forgiving than realtime audio over a long-distance connection.
