# audio

Synthesized sound for ONIKS: WebAudio only, no audio files, in the films' voice (quiet, precise, mechanical:
square blips for the interface, sines and filtered noise for the world). Positional, and **late by distance**:
every world sound travels to the camera at 343 m/s, so a far blast flashes first and booms seconds later, and
thunder follows lightning by the distance to the nearest part of its channel.

Audition page: `http://localhost:8771/game/audio.html` (every sound at 50 m / 1 km / 10 km / 30 km, loops,
weather, time rates, a salvo stress test with peak metering, a thunder-after-lightning demo with a live
top view of the sound fronts).

## API

```js
import { createAudio } from './audio/index.js';
const audio = createAudio(game);   // a system: { name: 'audio', init, update, onEvent, ui, play, ... }
game.addSystem(audio);             // init(game) also sets game.audio = audio if it is free

audio.ui('select');                              // interface / sensor sound (non-positional; opts.pos pans it)
audio.play('explosion', [x, y, z], { size: .8 }); // any sound; world sounds are queued until their front arrives
audio.play('clank', pos, { delay: false });      // now, no travel time
audio.play('thunder', pos, { top: [x, 3500, z] });
audio.update(dtReal, dtSim);                     // every frame (the game loop calls it); dtSim = 0 when paused
audio.onEvent(simEvent);                         // every drained sim event
audio.reset();                                   // drop everything in flight (a new match; also automatic when game.sim changes)
audio.mute(on) · audio.unlock() · audio.ready · audio.stats() · audio.fronts() · audio.core
```

If `game.bus` exists, `bus.emit('sound', { name, pos?, opts? })` is the same as `audio.play(name, pos, opts)`.

**Time rate and pause are watched**: the system plays `rate` (up or down; the auto drop to x1 gets a second
tick) and `pause` / `resume` itself when `game.timeRate` / `game.paused` change. Calls to `ui('rate')` inside
the merge window are dropped, so calling it too is harmless. Selection, orders and refusals come from the
caller: `ui('select')`, `ui('order')`, `ui('invalid')`.

### What it reads from the game (all optional, read defensively)

| Field | Used for |
|---|---|
| `game.camera` (or `game.renderer.camera`): `eye` [x, y, z], `f` forward, `r` right (`forward`, `right`, `target` accepted); `followFn` | the listener: distance, pan, front/back dulling, Doppler (camera velocity counts fully only while following something) |
| `game.sim.t` | the clock of the sound fronts (falls back to the sum of `dtSim`) |
| `game.sim.projectiles` (`id kind alive pos vel t0 P.sepAt P.boost`) | tracked missile voices: booster roar and crackle, sustainer, Doppler, Mach cone |
| `game.sim.units` (`id type alive dying aboard pos prev spool ab elev dep mast crane tYaw tPitch antA antW antT def.domain`) | rotor / jet / drone loops, fires, sinking hulls, machinery, radar sweep ticks |
| `game.sim.weather` (`kind wind sea squalls`) or `game.map.weather` | rain (inside a squall = full), wind, sea state |
| `game.map.h(x, z)`, `game.map.water(x, z)` | camera height above ground; open sea vs coast vs land around the camera |
| `game.side`, `game.selection`, `game.timeRate`, `game.paused` | own vs enemy events, radar ticks of selected radars, rate/pause sounds |

Settings (`data/settings.js`, live via `onSettings`): `volume` (master, squared like the shell) and `uiSound`
(the `ui` bus). Sensor alerts are on the `sig` bus and stay on when UI sound is off.

## How it works

- **One AudioContext**, created on the first pointer or key gesture; suspended while the tab is hidden.
- **Master**: buses (world, ambience, sig, ui, shared outdoor reverb) -> mix -> 24 Hz high-pass -> glue
  compressor (-18 dB, 2.5:1) -> limiter (-4 dB, 20:1, 1 ms) -> soft clip (identity to 0.8, never past 0.99)
  -> volume. Two analysers (before the chain, and after the clip but before volume) give `stats().preDb` and
  `peakDb`.
- **Levels** (measured with the audition page's level sweep, after the chain, volume excluded): at 50 m a 3M55
  hit or close thunder peaks near -3 dBFS (the limiter just touches it), a 5" report or booster ignition -5,
  the Phalanx -8.5, 30 mm -9.5, a splash -13; at 15 m a crane clank or hydraulic end stop about -20; interface
  blips -35 to -38, alerts -31 to -35; ambience on a calm coast about -33 peak. Salvo test (8 launches, 11
  interceptor launches and intercepts, 4 hits, cannon bursts, a ship kill in 10 s, camera 40 m up among the
  launchers): peak -6 to -7 dBFS, no limiting. Worst case (12 point-blank 3M55 hits, close lightning, Phalanx
  and 30 mm at once): +3 dBFS into the chain, -1.7 dBFS out.
- **Distance**: gain `(ref / d)^roll` per sound, with a floor for big sounds that fades to 0 at `max`
  (a far blast stays a low boom); air absorption lowpass `18 kHz / (1 + d/450)^0.9` (50 m: 16 kHz, 1 km:
  5.9 kHz, 10 km: 1 kHz, 30 km: 400 Hz), 28 % duller behind the camera; pan from the camera's right vector;
  reverb send grows with distance. Recipes also switch layers by distance (`near`: the crack, debris; `far`:
  the rolling echo).
- **Sound travel**: a world sound is a front leaving its source at the event's sim time and growing at
  343 m/s of *sim* time. It plays when the front reaches the camera: x8 compresses delays 8x, pause holds
  them, moving the camera toward a blast hears it sooner. Travel is exact while the wait is under 12 s real
  (4 km at x1, 33 km at x8); longer waits speed up gently and are capped at 30 s; at most 64 fronts are in
  flight (the least important are dropped). Thunder's roll is
  computed from the arrivals along the channel (ground to cloud), compressed by `1/sqrt(rate)`.
- **Voices**: one-shots have a cap per class (world 26, sig 8, ui 8). A new sound steals the weakest voice
  (priority + loudness - age) or is refused. Same-name sounds inside their merge gap are dropped. Nodes are
  counted (`stats().nodes`) and released when a voice ends.
- **Loops** are small pools of long-lived slots whose gain / filter / pitch follow the camera at 30 Hz:
  missile 5, jet 2, rotor 2, drone 2, fire 3, sink 1, machinery 2, plus sea / wind / rain ambience. The
  nearest, loudest candidates hold the slots (sticky by one rank); an idle slot is torn down after 5 s.
- **Doppler**: `c / (c + v_r)` from the relative velocity (source minus camera), clamped 0.3-2.5. A
  supersonic missile is silent until its Mach cone (half-angle `asin(c / v)`) sweeps the camera, then a sonic
  boom and the receding roar. Tracked voices use retarded time: the camera hears the booster phase the
  missile was in `d / 343` s ago.
- **Noise** buffers (white, pink, brown, crackle) are made once, RMS-normalized, loop-seamless, and reused
  with random offsets. Nothing uses `Math.random`.

## Event -> sound

| Sim event | Sound (world sounds are positional and delayed by distance) |
|---|---|
| `launch` kind `oniks` | `cold_launch` (cap pop, gas slam, thump, venting hiss); `ignition` 0.35 s later, 8 m up; tracked booster roar + crackle, then the ramjet |
| `launch` `sm6` `tlam` `pdms` | `vls_launch` (hatch, blast up the uptake); tracked booster, then sustainer / turbofan |
| `launch` `sam` (57E6) | `tube_launch` (bang, tearing whoosh); tracked booster (coasting dart after) |
| `launch` `aam` `slam` `hellfire` | `rail_launch` (whoosh away); tracked motor |
| `launch` `shell` | `gun5` (Mk 45: crack, blast, thump, the report rolling off the water) |
| `booster_sep` | `sep` (crack, thud); the tracked voice switches to its sustainer |
| `gunfire` `gun30` / `ciws` | `gun30` (2A38M: 83 rounds/s tearing burst) / `ciws` (Phalanx: 75 rounds/s buzz, drive whine); burst length = `dur / rate` |
| `intercept` | `intercept` (crack, pop, fragments, far roll); gun kills: `intercept_small` 0.5 s later |
| `hit` | missile / shell: `explosion` sized by kind (3M55 1, Tomahawk .85, SLAM-ER .75, Hellfire .45, 5" .45), steel ringing on ships; on aircraft `airburst`; cannon rounds `hit_small` |
| `splash` | into the sea `splash`; in the air (self-destruct) small `airburst`; into land `explosion`; aircraft `crash` / `splash` |
| `destroyed` | ships and HQ `secondary` (+1 s); vehicles `cookoff` (+0.5 s); aircraft `airburst`; drones a small one. Own: `damage` blip |
| `part` (own) | `damage` blip |
| `detect` (own side) | a missile: `alarm` (incoming, 2.6 s merge); a unit: lime `alert` (at most every 6 s), otherwise `contact` / `contact_esm` ping |
| `classify` / `lost` (own) | `classify` chirp / `lost` |
| `scan` own `start` / `hit` | `scan_charge` (rising zap over the order-to-strike delay) / `scan_strike` (rising zap, electrical crackle, sub thump, the front sweeping out) + `classify` if it found anything. Heard wherever the camera is (an interface effect). Enemy scans: `scan_far`, physical |
| `reload_start` / `reload_done` | `crane_start` / `seat` (+ own `confirm`); crane motor loop and chain clanks while the crane moves |
| `deploy` `jacks` `stowed` `erect` `lowered` `mast_up` `mast_down` | `jacks_down` `jacks_up` `erect_stop` `lower_stop` `mast_stop`; the hydraulic whine loop runs while the erector / jacks / mast move |
| `radar` | own `radar_on` / `radar_off` blips; `radar_motor` spin up / down (near only) |
| `lightning` | `thunder`: a tearing crack under ~3.5 km, then the roll along the channel |
| `reinforce` / `objective` (own) | `reinforce` / `objective` (gained) or `objective_lost` |
| `takeoff` / `land` | fighter `catapult_steam` / `trap`; drone `catapult_drone` |

Loops from state: helos within 3.5 km (blade slap at 17.2 Hz, turbine, tail rotor; spools with `spool`
aboard), fighters within 12 km (roar, afterburner), drones within 1.2 km, burning wrecks (`!alive`,
`dying < 1`) within 2 km, sinking ships within 5 km (groans, venting, water), machinery within 600 m
(erector / jacks / mast hydraulics, crane and turret drives), selected own radars (a soft tick per antenna
revolution). Ambience: sea swell and shore wash (fades out by 1.5 km of height; wash strongest on a coast),
wind (thins and whistles with height, panned from the wind direction), rain (full inside a squall, a distant
hiss near one, gone above 6 km).

## Interface and sensor sound names

`ui` bus (UI sound setting): `select order invalid rate pause resume move tick enter back deny start`.
`sig` bus (always on): `alert alarm contact contact_esm classify lost sweep confirm objective objective_lost
reinforce radar_on radar_off damage`.

## Files

`index.js` (the system, listener, fronts, events, loops, ambience) · `core.js` (context, master chain, buffers,
Voice / Slot, voice cap) · `patches.js` (SPEC, one-shot recipes SHOTS, loop patches LOOPS).
