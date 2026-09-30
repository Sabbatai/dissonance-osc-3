# Dissonance OSC relay

One laptop runs the relay. Everyone else opens a web page, or connects
from SuperCollider / Pd / Max / TouchDesigner / Python. Every message
anyone sends reaches everyone else.

```
 browser ──┐                       ┌── browser
 browser ──┼── WebSocket ─ relay ─ UDP OSC ──┼── SuperCollider / Pd / Max
 browser ──┘      (port 8080)       (57121 in)  └── ...
```

## Run it

Needs Node.js 18 or newer. `node_modules` is included, so this works offline.

```
node server.js
```

It prints the address to share, e.g. `http://192.168.1.20:8080`.
Participants open that in a browser, press **Start sound**, and move sliders.
Open it in two tabs on one laptop to test alone.

`QUIET=1 node server.js` hides the message log.

## Shared schema

| address | value |
|---|---|
| `/shared/<param>` | float 0..1 (or no args for a trigger) |
| `/player/<name>/<param>` | float 0..1, one player's own parameter |

`density`, `brightness` and `pulse` are the common ones every instrument
starts with. Any other parameter can be shared under `/shared/<name>`
too; others will see it appear in their menus once it has been sent.

## Routing: who controls what

Every instrument loads `public/dissonance.js`, which handles the
network and puts a small routing strip right next to each control:

- **dot:** lights when someone else is moving this control
- **out:** off, shared (`/shared/<param>`), mine
  (`/player/<my name>/<param>`), or both
- **in:** none, or any address heard on the network. New addresses
  (another player's pitch, a sequencer's notes) are added as soon as
  they arrive, so your root can follow someone's pitch, your density
  can follow someone's melody, and so on.
- **inv:** flip incoming values; only appears while listening

Active choices are bright, inactive ones dimmed. Parameters without a
control of their own (like the sequencer's `note` output) get their
strip near the bottom of the page.

Choices are remembered per page in that browser. Values received from
others are never re-sent, so two instruments listening to each other
can't feed back endlessly.

Give each player a distinct name; personal addresses use it.

## Prototyping with an LLM

Participants give the LLM an instrument file (`index.html` is the
smallest) and ask for a new one. Something like:

> Here is an instrument for a networked improvisation. It loads
> osc-browser.min.js and dissonance.js; keep those two script tags and
> the elements with ids status, name and log. Rewrite the
> instrument so that it [idea]. Register every control a player might
> want to share or have controlled with param(), as in the example;
> the API is:
>
> param(id, { input, min, max, kind, send, listen, onChange })
>   kind: "value" (default), "trigger", or "out" (send only)
>   send: "off" | "shared" | "personal" | "both" (default "shared")
>   listen: address to follow, "" for none (default "/shared/<id>")
>   onChange(v) runs for local moves and for incoming control.
> Returns p with p.value, p.set(v) (apply and send), p.emit(v) (send
> only). Include density, brightness and pulse.

Save the result as a new file in `public/` (e.g. `public/ana.html`)
and open `http://<relay-ip>:8080/ana.html`. The routing strips appear
by themselves.

## Included instruments

- `index.html`: two detuned saws, the minimal template. Params:
  density (detune), brightness, pitch, pulse.
- `sequencer.html`: four-lane polymetric sequencer. Lanes of 5, 7, 11
  and 13 steps (editable, 2 to 16) drift against each other. Density
  sets how many hits each lane gets, brightness opens filters and
  lengthens decays, pulse snaps every lane back to step 1. It sends
  `pulse` whenever the 5 and 7 lanes line up (every 35 steps). The
  pluck lane is tuned to a 24-ratio just intonation scale (3-, 5- and
  7-limit, each switchable) with a pitch slider per step. Params:
  density, brightness, pulse, tempo, swing, root, note (out).

## Native tools

Send OSC to the relay's IP on port **57121**. Send `/hello` once so the
relay knows where to send messages back (it replies to the port you send from).

SuperCollider:

```supercollider
~relay = NetAddr("192.168.1.20", 57121);
~relay.sendMsg("/hello");
OSCdef(\bright, { |msg| msg[1].postln }, "/shared/brightness");
~relay.sendMsg("/shared/density", 0.4);
```

## The network in Vaasa

The relay does not need the internet. It needs laptops that can reach
each other, and venue Wi-Fi (including eduroam) often blocks that
("client isolation"). Plan in this order:

1. **Bring a travel router** (any cheap one). Everyone joins its
   network; the relay laptop joins too. Nothing depends on the venue.
   This is the reliable option.
2. **Relay laptop as a hotspot.** Works for a handful of people; most
   laptop hotspots cap at about 8 clients.
3. **Venue Wi-Fi.** Test on the day: two people open the relay page.
   If the page doesn't load on the second device, the network isolates
   clients and you move to option 1.

A firewall prompt may appear on the relay laptop the first time; allow it.

## Intervening in the traffic

All messages pass through `relay()` in `server.js`. That is the one
place to delay, drop, invert, or reroute messages for the whole room.
