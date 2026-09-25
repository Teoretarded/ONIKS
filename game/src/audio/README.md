# audio

Synthesized sound for ONIKS: WebAudio only, no audio files, in the films' voice (quiet, precise, mechanical:
square blips for the interface, sines and filtered noise for the world). Positional, and **late by distance**:
every world sound travels to the camera at 343 m/s, so a far blast flashes first and booms seconds later, and
thunder follows lightning by the distance to the nearest part of its channel.

Audition page: `http://localhost:8771/game/audio.html` (every sound at 50 m / 1 km / 10 km / 30 km, loops,
weather, time rates, a salvo stress test with peak metering, a thunder-after-lightning demo with a live
top view of the sound fronts, the hit replay's slow motion, a rate-ramp spam check).

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

**Time rate and pause are heard**: the system plays `rate` (up or down; the auto drop to x1 gets a second
tick) and `pause` / `resume` itself, from the bus `rate` events whose `why` is `'user'`, `'auto'` or `'inspect'`
(single steps). The hit replay's eases, the film maker's and the debrief's ramps (`'replay'`, `'film'`, or no event
at all) are silent. Without a bus it watches `game.timeRate` / `game.paused`, and only steps between the player's
rates (1 2 4 8 16 32) sound. Calls to `ui('rate')` inside the merge window are dropped, so calling it too is
harmless. Selection, orders and refusals come from the caller: `ui('select')`, `ui('order')`, `ui('invalid')`.

**The hit replay is heard in slow motion** (`game.replay.active` / `.state`, or the bus `replay` `{ on }`): as it
starts, `replay_in` (time falling away); every new sound is played lower and longer (pitch and time x0.58, like a
tape), the loops' pitch drops with it, the world, its reverb and the ambience pass a lowpass that closes to
1.5 kHz, the ambience ducks and the reverb grows; a slow double sub pulse (about 56 a minute) runs under it; at
the impact (`state.tHit`, or the sim `hit` on the watched hull) `replay_boom`, a long low boom, heard at once
(the real blast still arrives late by its distance, slowed). Everything eases back in ~0.3 s as it ends.

### What it reads from the game (all optional, read defensively)

| Field | Used for |
|---|---|
| `game.camera` (or `game.renderer.camera`): `eye` [x, y, z], `f` forward, `r` right (`forward`, `right`, `target` accepted); `followFn` | the listener: distance, pan, front/back dulling, Doppler (camera velocity counts fully only while following something) |
| `game.sim.t` | the clock of the sound fronts (falls back to the sum of `dtSim`) |
| `game.sim.projectiles` (`id kind alive pos vel t0 P.sepAt P.boost`) | tracked missile voices: booster roar and crackle, sustainer, Doppler, Mach cone |
| `game.sim.units` (`id type alive dying aboard pos prev spool ab elev dep mast crane tYaw tPitch antA antW antT def.domain`) | rotor / jet / drone loops, fires, sinking hulls, machinery, radar sweep ticks |
| `game.sim.weather` (`kind wind sea squalls`, and `cells()` / `rainAt(x, z)` when present) or `game.map.weather` | rain (how deep in a cell's rain the camera is), the rain curtain of a cell nearby, gust fronts ahead of moving cells, wind, sea state (rougher under a storm) |
| `game.replay` (`active`, `state.tHit`, `state.id`), bus `replay` / `rate` | the slow-motion treatment and its boom; which rate changes sound |
| boats: `def.sub` (`pd`), `def.draught`, `u.depth`, `u.dive`, `u.mastUp`, `u.speed`; sonars: `def.sensors.sonar` (`hull`, `dip`), `u.off.sonar` | vents / blow / breaking the surface, the mast wash, the sonar pings |
| `game.map.h(x, z)`, `game.map.water(x, z)` | camera height above ground; open sea vs coast vs land around the camera |
| `game.side`, `game.selection`, `game.timeRate`, `game.paused` | own vs enemy events, radar ticks of selected radars, rate/pause sounds |

Settings (`data/settings.js`, live via `onSettings`): `volume` (master, squared like the shell) and `uiSound`
(the `ui` bus). Sensor alerts are on the `sig` bus and stay on when UI sound is off.

## How it works

- **One AudioContext**, created on the first pointer or key gesture; suspended while the tab is hidden.
- **Master**: buses (world, ambience, sig, ui, shared outdoor reverb) -> mix -> 24 Hz high-pass -> glue
  compressor (-18 dB, 2.5:1) -> limiter (-4 dB, 20:1, 1 ms) -> soft clip (identity to 0.8, never past 0.99)
  -> volume. The world bus, the reverb and the ambience first pass a lowpass that is wide open (Nyquist) except
  in the hit replay's slow motion (`core.setSlow(k)`); a separate `fx` bus (the replay's boom and pulse) goes
  straight to the mix. Two analysers (before the chain, and after the clip but before volume) give
  `stats().preDb` and `peakDb`.
- **Levels** (measured with the audition page's level sweep, after the chain, volume excluded): at 50 m a 3M55
  hit or close thunder peaks near -3 dBFS (the limiter just touches it), a 5" report or booster ignition -5,
  the Phalanx -8.5, 30 mm -9.5, a splash -13; at 15 m a crane clank or hydraulic end stop about -20; interface
  blips -35 to -38, alerts -31 to -35; ambience on a calm coast about -33 peak. Salvo test (8 launches, 11
  interceptor launches and intercepts, 4 hits, cannon bursts, a ship kill in 10 s, camera 40 m up among the
  launchers): peak -6 to -7 dBFS, no limiting. Worst case (12 point-blank 3M55 hits, close lightning, Phalanx
  and 30 mm at once): +3 dBFS into the chain, -1.7 dBFS out.
  Re-measured with the additions below (2026-09-25): salvo -7.8 dBFS peak, no limiting, 361 nodes max, 10 voices;
  worst case +1.8 in, -1.8 out (3.3 dB of limiting), 490 nodes. At 50 m: a Kh-35U box launch -7.1, a broach -8.3,
  a boat's torpedo tube -15, Mk 32 -15, vents -16, blow -17, breaking the surface -13, a sonar ping -23 (at its
  300 m reference too), the IC rumble -12 (about -18 at 5 km, where they happen); the sonar tick -36; the
  replay's boom -4.3, its way in -17, its pulse about -16 (sub-bass). A whole replay (boom, the slowed blast, the
  pulse): -2.8 dBFS peak, no limiting. Ambience peaks: calm coast -33, a storm cell 6 km off -31 (its gust front
  rising), inside its core -17 (as loud as the storm preset's squall, -17).
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
- **Voices**: one-shots have a cap per class (world 26, sig 8, ui 8, fx 4). A new sound steals the weakest voice
  (priority + loudness - age) or is refused. Same-name sounds inside their merge gap are dropped. Nodes are
  counted (`stats().nodes`) and released when a voice ends.
- **Loops** are small pools of long-lived slots whose gain / filter / pitch follow the camera at 30 Hz:
  missile 5, jet 2, rotor 2, drone 2, prop (E-2D) 2, torpedo 2, mast wash 1, fire 3, sink 1, machinery 2, plus
  sea / wind / rain ambience and the replay's pulse (built only while a replay runs). The
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
| `launch` `uran` (Bal) | `box_launch` (cover, booster blast); tracked booster 2 s, then a small turbofan (a higher whine than the Tomahawk's, no ramjet) |
| `launch` from a boat (`kalibr` from a Kilo, `tlam` from a Virginia) | `broach` at the surface (hollow pop, water tearing, spray falling back), `ignition` 0.45 s later; tracked booster, then the turbofan |
| `launch` `mk48` `t53` from a boat | `torpedo_sub` (the impulse air: a deep muffled thump, water ram, venting bubbles), near the camera only (2 km) |
| `launch` `mk54` from a DDG / a helicopter | `torpedo_tube` (Mk 32: pneumatic crack, hiss, the splash 0.7 s on) / the release, then a small `splash` when it reaches the sea |
| `launch` `shell` | `gun5` (Mk 45: crack, blast, thump, the report rolling off the water) |
| `booster_sep` | `sep` (crack, thud); the tracked voice switches to its sustainer |
| `gunfire` `gun30` / `ciws` | `gun30` (2A38M: 83 rounds/s tearing burst) / `ciws` (Phalanx: 75 rounds/s buzz, drive whine); burst length = `dur / rate` |
| `intercept` | `intercept` (crack, pop, fragments, far roll); gun kills: `intercept_small` 0.5 s later |
| `hit` | missile / shell: `explosion` sized by kind (3M55 1, Tomahawk .85, SLAM-ER .75, Hellfire .45, 5" .45), steel ringing on ships; on aircraft `airburst`; cannon rounds `hit_small`; a torpedo (`under`): the explosion muffled under the keel, then the column of water rising and falling back. On the hull the hit replay is watching: `replay_boom` at once |
| `splash` | into the sea `splash`; in the air (self-destruct) small `airburst`; into land `explosion`; aircraft `crash` / `splash` |
| `destroyed` | ships and HQ `secondary` (+1 s); vehicles `cookoff` (+0.5 s); aircraft `airburst`; drones a small one. Own: `damage` blip |
| `part` (own) | `damage` blip |
| `detect` (own side) | a missile: `alarm` (incoming, 2.6 s merge); a unit: lime `alert` (at most every 6 s), otherwise `contact` / `contact_esm` / `sonar_contact` ping |
| `sonar` | own side: `sonar_contact` (a soft rounded tick, 1.5 s merge); every side: remembered per listener, so its next ping carries the echo |
| `classify` / `lost` (own) | `classify` chirp / `lost` |
| `scan` own `start` / `hit` | `scan_charge` (rising zap over the order-to-strike delay) / `scan_strike` (rising zap, electrical crackle, sub thump, the front sweeping out) + `classify` if it found anything. Heard wherever the camera is (an interface effect). Enemy scans: `scan_far`, physical |
| `reload_start` / `reload_done` | `crane_start` / `seat` (+ own `confirm`); crane motor loop and chain clanks while the crane moves |
| `deploy` `jacks` `stowed` `erect` `lowered` `mast_up` `mast_down` | `jacks_down` `jacks_up` `erect_stop` `lower_stop` `mast_stop`; the hydraulic whine loop runs while the erector / jacks / mast move |
| `radar` | own `radar_on` / `radar_off` blips; `radar_motor` spin up / down (near only) |
| `lightning` | `thunder`: a tearing crack under ~3.5 km, then the roll along the channel (level by the strike's `s`) |
| `lightning_ic` | `rumble`: no crack, a low roll that swells in from the cloud, arrivals from across the lit area, late by its distance like thunder |
| `weather` `front` `arrive` / `leave` | the wind lifts a little map-wide while a squall line is up (the cells themselves are read from `sim.weather.cells()`) |
| `reinforce` / `objective` (own) | `reinforce` / `objective` (gained) or `objective_lost` |
| `takeoff` / `land` | fighter and E-2D `catapult_steam` / `trap`; drone `catapult_drone` |

Loops from state: helos within 3.5 km (blade slap at 17.2 Hz, turbine, tail rotor; spools with `spool`
aboard), fighters within 12 km (roar, afterburner), E-2Ds within 16 km (two T56s: 8-blade props at 1,106 rpm =
147.5 Hz blade pass, the two a hair apart so they beat about once a second, prop wash, turbine whine; spools on
deck), torpedoes in the water within 1.5 km (a thin high whine, muffled, Doppler), boats at periscope depth under
way within 1.5 km (water washing round the masts), drones within 1.2 km, burning wrecks (`!alive`,
`dying < 1`) within 2 km, sinking ships within 5 km (groans, venting, water), machinery within 600 m
(erector / jacks / mast hydraulics, crane and turret drives, a boat's masts), selected own radars (a soft tick per
antenna revolution). Ambience: sea swell and shore wash (fades out by 1.5 km of height; wash strongest on a coast;
rougher under a storm), wind (thins and whistles with height, panned from the wind direction; rises and buffets in
the gust front that runs ahead of a moving storm cell), rain (`rainAt` under the camera: full in a cell's core;
the rain curtain of a cell within ~7 km as a darker distant hiss; gone above 6 km).

State-driven one-shots:
- **Sonar pings**: an own hull sonar (DDG) or dipping sonar (MH-60R hovering) pings on the pulse game/sonar.js
  draws (every 6.5 s sim per unit): `sonar_ping`, a pure tone with a hard front ringing away (hull 1.18 kHz, dipping
  1.76 kHz), heard without travel delay. One at a time, at most every 4 s real, not past x8: a selected sonar
  wherever the camera is, else the nearest within 4 km. If that sonar heard a contact in the last 9 s, the echo
  comes back fainter and shifted after the round trip at 1,500 m/s (0.35-3 s real).
- **Boats**: from `u.dive` against `u.depth` (so the attack orders' trips to periscope depth count too): leaving the
  surface, `sub_dive` (the vents: air roaring out, the sea flooding in; soft for a trim deeper from periscope
  depth); rising, `sub_blow` (high-pressure air into the tanks, bubbling up; soft on the way to periscope depth);
  the hull breaking the surface, `sub_surface`. Near the camera only (2.5 km).

## Interface and sensor sound names

`ui` bus (UI sound setting): `select order invalid rate pause resume move tick enter back deny start`.
`sig` bus (always on): `alert alarm contact contact_esm classify lost sweep confirm objective objective_lost
reinforce radar_on radar_off damage sonar_contact`. `fx` bus (cinematic, not positional): `replay_in replay_boom`.

## Files

`index.js` (the system, listener, fronts, events, loops, ambience) · `core.js` (context, master chain, buffers,
Voice / Slot, voice cap) · `patches.js` (SPEC, one-shot recipes SHOTS, loop patches LOOPS).
