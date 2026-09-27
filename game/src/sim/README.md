# sim: public API

Pure game logic (no DOM, no GL). Deterministic from the seed. Fixed step `DT = 0.05` s. World: metres, X east,
Y up, Z north; `hdg` 0 = north, π/2 = east. Load `reference/menus/common/m3.js` first (its `M3.rng` is used when
present; an identical fallback is built in, so the sim also runs in a Worker).

```js
import { Sim, DT } from './sim/sim.js'
import { setupBattle } from './sim/setup.js'          // starting forces
import { UNITS, PROJ, CLASSIFY } from './data/units.js'

const sim = new Sim(map, { seed, fog: true, mode: 'combat', aiSides: ['fleet'], difficulty: 'normal' /* or ai: { fleet: 'hard' } */,
                           supply: 600, weather /* default map.weather */,
                           timeLimit /* s; combat defaults to 7200 (then points), 0 = none */,
                           holdTime /* s, optional: hold 2/3 of the objectives this long to win */ })
setupBattle(sim, { coast: 1, fleet: 1, emplaced: true, forces })   // strength multipliers; emplaced = battery on its
// sites; forces = { coast: [['hq', 1], ['tel', 2], ...], fleet: [...] } replaces the default roster (campaign)
```

## Loop

- `sim.step()` advances one DT. Call it `rate / DT` times per real second (x32 = 640 steps/s). `sim.run(n)`.
- `sim.t` sim seconds, `sim.tick`.
- `sim.drainEvents()` → events since the last drain (FX, audio, UI). Keep draining (the buffer caps at 20k).
- `sim.result` → `null` or `{ winner: 'coast'|'fleet', reason: 'hq'|'destroyed'|'objectives'|'time', t }`. 'hq': the
  command post / carrier is destroyed. 'destroyed': a side without an HQ has nothing left. 'time': at `timeLimit`, the
  side with more points wins (`sides[side].score` = value of enemy units destroyed, an HQ counts 3000, + 300 per
  objective held).
- Render interpolation: every unit and projectile has `prev` / `pos` (and units `prevHdg` / `hdg`) of the last tick.

## Units

`sim.spawn(type, side, x, z, { hdg, alt, hold, deployed, aboard: carrierId })` → unit (side defaults to the type's).
`sim.units: Map<id, Unit>`; `sim.list()` all (alive and dying); `sim.alive(side)`; `sim.hq(side)`.

```
Unit = { id, type, side, def /* UNITS[type] */, pos, prev, hdg, prevHdg, pitch (+ nose up), roll, speed,
         hp, hpMax, alive, dying /* 0..1 death animation */, st /* HD model state */, orders, ammo: { weapon: n },
         cooldowns: { weapon: s, scan: s }, radarOn, deployed, parts: { part: 0..1 damage }, off: { token: true },
         hold, aboard /* carrier id while on deck */, dep, elev, mast, caps, cargo, drones, fuel, mag, ... }
```

- `UNITS[type].modelState(unit, t)` writes the HD model state into `unit.st` and returns it (the sim calls it each
  tick; call it again with an interpolated time for smooth rotors/antennas). Fields per model: tel `elev dep capL capR
  wheel fan`, radar `ant mast wheel`, pantsir `yaw pitch sAnt fire wheel`, catapult `carriage`, drone `prop gimYaw
  gimPitch`, destroyer `sps gunYaw gunPitch ciwsYaw[2] ciwsPitch[2] ciwsSpin vlsOpen[[cell, 0..1]]`, carrier `radar`,
  helo `rotor trotor droop`, fighter `fan nozzle ab`, hq (static, none), transloader `reload slot refill bedR bedL dep
  crane cargo wheel` (pose the crane with `TRANSLOADER.reloadPose(st.reload, { slot: st.slot })` from data/models.js
  while `st.reload > 0`). Projectiles: `p.st` = `booster wing fin cover inlet`; `PROJ[kind].model` / `.boosterModel`
  name the model keys (aliases in data/models.js).
- Damage: hull `unit.hp`; per model part `unit.parts[name]` 0..1 (the visual damage: tints, the 'part' event, debris);
  per module `unit.mods[id]` (hp taken; destroyed at the module's hp). What a hit switches off is the modules'
  (`UNITS[type].modules`, data/modules.js): tokens in `unit.off` ('move', 'radar', 'camera', 'scan', 'deploy', 'air',
  'reload', 'launch', 'sonar', 'well', weapon names), `unit.slowK` (speed factor), `unit.fire` / `unit.fireRate` (s
  left, hp/s: a fire after a heavy cook-off), `unit.cook` (null or { module id: true }: what has gone up). See
  "Damage: modules and cook-off".
- Dying: ships flood and sink over 60 s, vehicles burn 20 s, aircraft fall; then the unit is removed ('removed').

## Motion (dynamics.js, sea.js, the sinking in damage.js)

How units move is physical, per tick, deterministic and allocation-free; the numbers per type are `UNITS[type].mot`.

- **Vehicles**: power to weight (`mot.power` kW, `mot.mass` t) against rolling resistance (road / off road) and the
  grade along the heading (a K340P TEL: 8 m/s off road on the flat, ~3 m/s up a 20 % slope); the driver's acceleration
  (`accel`) and braking; a bicycle model steering on the turning circle (`mot.turnR`, an 8x8 13.5 m) and the grip he
  keeps (~0.25 g): trucks slow for bends and never pivot. `u.grade` / `u.cross` (slopes under it), `u.kap` (curvature),
  `u.sp` / `u.sr` the body's pitch / roll on its springs (sitting back under power, diving braking, rolling out of turns;
  part of `u.pitch` / `u.roll`; the render pose adds them to the drawn ground).
- **Ships**: thrust against drag ~ v^2 (a DDG ~3 min to 28 kn, the carrier ~5.5), astern at 60 % to stop; Nomoto yaw
  (`mot.yawT`) under a helmsman with counter-rudder, turning circle `mot.td` ship lengths (DDG 3.5, CVN 4.5), speed lost in
  a hard turn (~30 %); heel out of the turn after a brief lean in (a damped roll at `mot.rollT`); submerged boats lean
  in. `u.yawR` (rad/s), `u.rud` (-1..1), `u.heel`, `u.squat` (m) and `u.trimS` (by the stern with the Froude number, more
  in shallow water), `u.bow` (bow wave height, m: for the wake). Flooding (a ship with a subdivision: her floodwater,
  "Ships: compartments, systems, flooding" below; the others as follows): every hit on a ship notes where it struck
  (the `hit` event's point, else the side facing the shooter): `u.fSide` (-1 port .. 1 starboard), `u.fEnd` (-1 stern
  .. 1 bow), `u.flood` (0..0.5 afloat; a torpedo lets in three times as much): she lists toward it (`u.list`) and trims
  by that end (`u.trim`), both part of `u.roll` / `u.pitch`. The swell is not the sim's: the render pose rides the
  drawn waves (`sea.js`, below).
- **Sinking**: when she is lost (`u.sinkP`): she settles, listing and trimming, until her deck edge is at the water,
  then goes down by the flooded end (the other rising) or, flooded down one side, rolls over, floats keel up and goes;
  faster the harder she was hit. `u.pos[1]`, `u.roll` = `u.list`, `u.pitch` = `u.trim`, `u.flood` (0..1). Vehicle
  wrecks skid to a stop, slide down slopes steeper than ~19 deg and settle onto their axles (`u.settle`, `u.wtP`,
  `u.wtR`); aircraft fall under drag, nose down (a helicopter spins).
- **Aircraft**: bank to turn (turn rate g tan(bank) / v; `mot.bank` in an attack or a reversal, `mot.bankC` for routine
  turns, never more than the wing lifts at this speed: `mot.vs` stall speed), energy (thrust from the table's climb
  rate against drag, the induced drag of the load factor, the climb: hard turns and zooms cost speed), pitch = flight
  path + angle of attack, `u.vy` vertical speed. Carrier launches ride the waist catapult's 94 m (`mot.cat` end speed,
  ~2.5 s) and climb away wings level; landings fly to 5 km astern on the angled deck's axis, down the 3.5 deg glide
  slope (pursuit led by the ship's motion), trap on the wires (90 m roll-out) or wave off and go round (`u.appr`).
  On a deck `u.deck` = `{ cv, mode: 'cat' | 'trap' | 'held', x, y, z (ship frame), hd }` (the render places her in the
  ship's drawn frame); `u.trapped` = the ship's id once she is down (orders' `return` then takes her aboard: `onDeck`).
  Helicopters fly a velocity vector (`u.hvx`, `u.hvz`): the rotor tilts to accelerate and flares to stop, drifts in the
  hover, holds station over the deck spot (`mot.spot`) at the ship's speed and sets down.
- **Separation** (every 0.2 s, `separate`): hulls are capsules; a unit with another ahead gives way (ships: to
  starboard meeting or crossing, looking ahead to the closest point of approach; vehicles: away from it) and slows
  (`u.avH` heading bias, `u.avS` speed factor); a unit whose goal is taken by a stopped one stops short; overlaps are
  pushed apart (the lighter more). Aircraft whose paths cross climb 160 m apart (`u.sepY`).
- **The swell** (`sea.js`): `swellOf(weather)` builds the wave trains exactly as engine/terrain.js draws them
  (`T.waves`, `T.seaAmp`); `hullMotion(waves, amp, x, z, hdg, vx, vz, hull, t, out)` is a hull's closed-form response
  (heave, pitch, roll averaged over its waterplane, each through a damped oscillator at the encounter frequency; no
  state), used by the render pose so ships ride the waves that are drawn: a carrier nearly still, a destroyer rolling
  beam-on. `hullOf(def)` the hull's periods from `mot`.
- Aircraft on the carrier have `aboard = carrierId` (position follows the deck; draw them parked or not at all).
  Any move/patrol/attack/scan order launches them (one off the deck every 20 s). Drones launch from a catapult.
  The E-2D (`aew`) flies off the carrier like the fighters (it spreads its wings first: `spool`); its rotodome is its
  radar antenna (model state `dome` = the sweep angle, 10 s a turn, stopped on deck or under EMCON; `fold` on deck).
- Submarines (`ssn` Virginia, `ssk` Kilo; `def.sub`, sim/subs.js): `u.dive` the ordered depth (0 surface, 1 periscope
  depth, 2 deep), `u.depth` the keel depth (m), `u.mastUp` 0..1. The model's origin is the surfaced waterline, so
  `u.pos[1] = -(depth - draught)` under water. Submerged (`submerged(u)`), a boat counts as domain `'sub'` for contacts
  and weapons (`domOf(u)`, contact `dom`): radar and cameras do not see it (its masts show to a radar at short range at
  periscope depth), scans and lightning do not reach it; only sonar hears it. Boats keep to deep water (nav grid
  `'sub'`, 36 m). Missiles leave a boat only from periscope depth (weapon `sub: true`; an attack order brings it up
  for the salvo and back down after it); torpedoes at any depth. Model state: ssn `mast vptA vptB prop`, ssk `mast prop`,
  bal `elev dep n wheel`, aew `dome prop fold`.
- The landing force (sim/amphib.js): `lhd` (Wasp, `def.carry` { craft 3, veh 8 }, `def.well`, 2 MH-60R on deck), `lcac`
  (`def.hover`: the only unit that crosses the waterline, on the nav grid `'hover'`: water and flat low ground within
  1.5 km of it; carries 2 ACVs), `acv` (ACV-1.1, land, RWS gun vs land), and the coast's `kornet` (Kornet-EM on a
  Tigr-M: `def.lift`, its launcher rises to fire, `needs: 'lift'`). A new LHD spawns loaded (`def.carry.start`;
  `{ loaded: false }` spawns it empty). Carried units have `aboard` = the host (crafts in the well have `slot`, the
  berth; vehicles on an LCAC `slot` 0/1): not seen, not hit, hold no ground, their orders wait (a craft in the well asks
  for the gate itself). LHD: `well` 0..1 (stern gate; the ship slows to `def.well.slow` and ballasts down), `transit`
  (the craft in the gate); LCAC: `cushion` 0..1, `rampB` 0..1, `dockT` (the scripted slide through the gate), `cargoN`.
  Model state: lhd `well radar`, lcac `prop fan cushion rampB rampS rudder thrust`, acv `wheel yaw pitch ramp`,
  kornet `wheel up yaw pitch`. Anchors: data/models.js `LHD` (DECK_Y, WELL, GATE, SLOTS, SPOTS), `LCAC` (deckY(st),
  SLOTS, PROPS), `ACV`, `KORNET`.

- The third wave (data/models_units3.js): coast `s400` (5P85SM2-01: `def.deploy` with `elev` π/2, containers
  vertical to fire; `def.tubes` the four mouths, fired outboard first; its `sam48` weapon is `auto` vs aircraft but fires
  only erected and cued, `w.cue` { type: 's400r', r }: a radiating 92N6E of its side within r; `def.depotRefill`),
  `s400r` (92N6E: `def.mast`, the array raised before it radiates), `bereg` (A-222: `def.turret`, weapons free
  `gun130` 130 mm rounds vs ships and landing craft; `def.depotRefill`); fleet `cg` (Ticonderoga: 122 Mk 41 cells as
  `def.vlsAt`, SM-6 ×48, ESSM ×32, TLAM ×4, Mk 45 ×2, Phalanx ×2 with `w.mountAt`, two MH-60R with `def.air.spot` /
  `park`) and `lcs` (Independence: 44 kn, 57 mm `gun57`, SeaRAM `searam` (RAM), one MH-60R, a scan). Model state: cg
  `radar gunYaw gunPitch gunYawA gunPitchA ciwsYaw[2] ciwsPitch[2] ciwsSpin vlsOpen`, lcs `radar gunYaw gunPitch ramYaw`,
  s400 `elev dep n wheel`, s400r `mast ant wheel`, bereg `yaw pitch dep fire wheel`. Anchors: data/models.js `CG`, `LCS`,
  `S400`, `S400R`, `BEREG`.
- Hooks any unit may use: `def.turret` (the turret slews to the last aim bearing), `def.depotRefill` (restocks at a
  depot / its spawn; the reload order drives there), `def.tubes` (an erecting launcher's container mouths), `def.air.spot`
  (where its helicopters take off) and `def.air.park` (where they are drawn on deck), `w.mountAt` (the CIWS mounts'
  positions; default the DDG's), `w.cue` (see the S-400). The CIWS yaw `u.cYaw[i]` is the mount's bearing off the bow.

## Orders

`sim.order(ids, order)`; `order = { kind, x?, z?, target?, on?, n?, r?, queue? }`

| kind | effect |
|---|---|
| `move` | path on land (roads faster) / at sea (draught) / direct in the air. Several units: line-abreast formation at the slowest speed |
| `attack` | `target` = enemy unit id (must be a track: conf ≥ CLASSIFY). Closes to range, deploys (TEL). With `n`: one volley of n rounds, then done (the AI, campaign scripts). Without `n` (the player's): persists, volleys of the salvo size (`salvo`, else the unit's `u.salvo`, else the weapon's own; 0 = all in hand), each watched until its rounds are down (+4 s), until the target is destroyed, the weapon is empty with no reload coming (an empty TEL calls a free transloader and waits), or the track has been lost for 300 s (the order holds meanwhile, the unit stops, and resumes when the track is back). `o.st` = 'close' / 'fire' / 'look' / 'reload' / 'lost', `o.vol` volleys fired |
| `salvo` | immediate: `n` = 1 / 2 / 0 (all in hand): the unit's volley size for its persistent attacks (`u.salvo`) |
| `stop` | clear orders and halt (an aircraft on deck also leaves the launch queue) |
| `hold` | `on` (default true): hold position, offensive weapons pick their own targets. Defensive weapons always fire by themselves |
| `weapons` | `free` true/false: set the weapons-free flag (`u.hold`) without touching the orders (the player's Weapons free / Hold fire); `free: false` also drops attack orders |
| `deploy` / `undeploy` | TEL: jacks 10 s, erect 15 s (immobile while deployed). Bal: jacks 6 s, pack 8 s. S-400: jacks 12 s, containers vertical 18 s. Radar: mast 15 s, 92N6E array 20 s (needed to radiate) |
| `reload` | transloader + `target` TEL: drive beside it, 45 s per round. Transloader alone: refill at a depot. TEL: calls a transloader, else drives to a depot (90 s per round). Ships: sail to `map.replenish`. Pantsir, Bal, S-400, Bereg: depot |
| `scan` | at x, z within the unit's scan reach (moves closer if mobile, unless `stay` and not an aircraft: the player's scans pass `stay`). Needs the side's and the unit's cooldowns |
| `radar` | `on` true/false (EMCON). A radiating radar can be heard by the enemy |
| `dive` | submarines, immediate: `depth` 0 surface · 1 periscope depth · 2 deep (none: one step down) |
| `launch_drone` | catapult: 12 s, then a drone patrols x, z |
| `patrol` | aircraft: orbit x, z (radius r). Surface: shuttle between here and x, z |
| `return` | aircraft to the carrier (land, rearm from its magazine), drones to a catapult, ships to replenish |
| `land` | LCAC: out of the LHD's well (with its ACVs), to the beach nearest x, z (`beachPoint`), off cushion, ramp down, the ACVs roll off every 8 s and drive clear, then `then` (e.g. a move; `hold` sets their weapons free); with `cycle` (default) back to the LHD for more while it has vehicles, same beach; at the end it docks. `o.ph` 'go' / 'unload' / 'back' / 'dock' |
| `unload` | LCAC: land at the nearest beach (here, on one) without the return trip |
| `dock` | LCAC: `target` LHD (else the nearest with room): to the approach point astern, through the gate into a berth |
| `embark` | ACV: `target` LCAC: drive to its bow ramp and board once it is beached (room permitting) |

Orders queue with `queue: true`. The AI uses the same orders.

## Picture (fog of war)

- `sim.visible(side, unit)` → `'own' | 'track' | 'contact' | null`.
- `sim.sides[side].contacts: Map<unitId, Contact>`; `sim.contact(side, unitId)`.
  `Contact = { track: 'TRK 21', unitId, conf, cls, type, name, pos /* estimate */, vel, err /* m */, lastSeen, identified, emitting, xfix, dom, dead }`.
  `cls`/`type` are set once conf ≥ `CLASSIFY` (0.6). `identified` after a scan (inspect allowed). `classify` events
  carry `how` ('radar', 'esm', 'scan', ...).
- Emitters (radars on, the command post's comms) are heard by the other side within their `emits.range`: a rough
  contact (conf ≤ .45, error ≥ 2.5 km). ESM CROSS-FIX: the fleet's listeners (`sensors.esm`: E-2D, DDG; the
  F/A-18E has the pod instead) in line of sight take bearings (the E-2D hears 1.3× farther, `esm.reach`); bearings
  ≥ ~12° apart within 3 min (two listeners, or one that flew across) fix the emitter (`xfix` = sine of the crossing, 0 when none; error ≈ range ×
  0.02 / xfix) and raise its confidence at the listener's `esm.gain` per second (× the emitter's `emits.fix`, the
  command post's bursty comms .3) up to .8: a radar that keeps radiating is classified after 1-2 min of cross-fixed
  listening, the command post after 4-10 min. The confidence holds while the unit is still heard; a silent (EMCON)
  unit gives nothing, and a fix fades within about a minute once it goes quiet. Constants in consts.js (`ESM_*`).
- Fleet sensors over land: the DDG's radar sees land units within 3 km of the water (`radar.shore`, `SHORE_D`) at
  .45 of its surface range (inland .3); the E-2D looks down (`land` .45, moving vehicles `gmti` .7) but slowly
  (`landGain`: ~5 min to classify a parked launcher 25 km off; `hold`: a paint holds the contact 40 s); the F/A-18E's
  targeting pod (`sensors.pod`) classifies the land and sea units it passes within 5 km of and identifies them.
- `sim.projVisible(side, proj)` → the side's sensors cover that missile now.
- Sonar (`sensors.sonarTick`, 1 Hz): DDG hull sonar (less at speed), the MH-60R's dipping sonar (only while it hovers,
  `sonarWorks(u)`), the boats' own. Range = the sonar's `sub` (or `ship`, boats only) range × the target's noise
  (`subs.noiseOf`: quiet boats, louder fast; a Kilo snorting at periscope depth) × the sea state. Detections raise the
  contact like any sensor; a boat held at conf ≥ .9 counts as identified. A launch (missile or torpedo) gives the
  other side a rough contact on the shooter. Torpedoes are never seen by radar; the other side's sonars hear them.
- Radar horizon `d_km = 4.12 (√h1 + √h2)` (`horizon(h1, h2)` in sensors.js, metres), terrain line of sight with earth
  bulge, sweeps (period per radar), rain squalls cut range, land clutter for ship/air radars.
- `sim.sides[side]`: `{ supply, income, contacts, scanCd, queue, lost, kills, fired }`.

## Projectiles

`sim.projectiles: Map<id, Proj>`; `Proj = { id, kind, side, P /* PROJ[kind] */, pos, prev, vel, hdg, pitch, spd, from,
fromPos, target, tk: 'unit'|'proj', aim, phase: 'launch'|'climb'|'cruise'|'final', t0, age, alive, st /* booster wing fin cover */ }`.
Low flight follows the terrain with a look-ahead: the climb angle that clears the highest ground of the next ~2 km
of the track (short of the aim point) is a floor on the pitch, so rounds climb smoothly over cliffs (`PROJ[k].look: 0`
switches it off, for experiments). A missile loses a target that dives.
Kinds: `uran` (Kh-35U, Bal: out of the rear of the raised pack, sea-skimming at 10 m), `kalibr` (3M-54, Kilo: broaches
from the bow tubes, booster to 5 s), torpedoes `mk48` (SSN), `mk54` (DDG tubes, MH-60R drop), `t53` (Kilo): mode `run`,
under water, not drawn; they close on the target near the aim point and resolve on the pass (`hit` at the surface
over it) or end quietly (`torpedo_end`).
`oniks` (3M55: vertical cold launch, booster separation at 7 s, low over land, sea-skimming at 15 m),
`tlam` (VLS, booster 12 s, 60 m terrain following), `slam`, `hellfire`, `sm6` (2 s vertical rise, gentle
pitch-over, booster separation at 6 s), `pdms` (ESSM), `sam` (57E6, booster at 2.4 s), `aam`, `shell` (5" ballistic).

### Bodies and hits (bodies.js; nothing is rolled)

A hit is geometry: a path crossing a body during a tick. A unit's body is its part boxes in its model frame (+Z
forward, +Y up, +X starboard; the HD model's part bounds baked into `bodies.js`, each box owned by a sim part); a
munition's is a capsule, `PROJ[kind].body = [length m, diameter m, mass kg]`. A strike lands on the part whose box
it enters (the smallest box holding the point a little past the entry); the nearest other part takes the spill-over
(`applyDamage(sim, u, dmg, src, { part, part2, pos })`). Rounds miss through seeded aim dispersion only.

- Guns fire bursts of representative rounds (`sim.bursts`: each `{ id, unit, weapon, target, tk, n, x /* Float64Array
  3n positions */, st /* Uint8Array: 0 not fired, 1 flying, 2 done */, hits }`) that fly with gravity and drag; a
  renderer may draw the rounds from `x`. Weapon fields: `v0`, `rpm`, `rounds`, `disp`, `drag`, `dmgR`.
- Proj fields added: `ctrl` (false: out of control, tumbling), `fw` / `up` (its frame while tumbling, unit vectors),
  `w` (angular velocity, rad/s, world axes), `roll`, `gh` (gun hits taken, real rounds), `missed` ('wide' / 'over'
  once a strike round has passed its target; it flies on and down).
- Out of control: the round tumbles (no steering) with gravity and the drag and side force of a body at incidence
  until it comes down (`splash`, why `'spinout'`) or falls on its target (`hit`, `spin: true`, reduced damage).
  Tumbling rounds are no longer engaged by defences.
- `fireGun(sim, u, weapon, target)` and `spinout(sim, proj, info)` are exported from weapons.js (tests, scripts).
- **Interceptor end game.** A guided round steers by the launcher's track (`sig0 + sigR x range`) until its own
  seeker takes over at `PROJ.seek` m; the error then closes on `sigT` over `seekT` s, and the round must still turn
  onto the corrected point within its `turn` / `gMax` (a late correction misses). Against a target skimming the sea
  the error grows (`lowK`: multipath, fading out by 40 m). The proximity fuze fires at the closest point of the pass
  within `fuze` m (default 2.5 x `burst`); the warhead's fragments leave in a belt `cone` = [from, to] rad off the nose
  (default 40-110 deg): inside the belt a missile within `KILL` (.5) x `burst` breaks up, within `burst` it is knocked
  out of control; outside the belt the reach falls to a third. A wider burst is seen (`splash`, why `'wide'`) and
  does nothing. `intercept`, `spinout` bursts and these splashes carry `burst` (the point) and `belt` { ax, cone, R }
  (fx/lib/burst.js FragBelt draws it). Doctrine per weapon: `maxEng` rounds in the air at one threat (1: shoot, look,
  shoot), `maxShots` in all (counted over the side's weapons: an SM-6's `maxShots: 1` leaves the second shot to the
  inner layer). Guns: `open` (the range a gun opens on a missile), `frag` / `fragK` (a high-explosive round passing
  within `frag` m of the skin counts `fragK` of a hit: the Pantsir's 30 mm). A threat may weave on its last stretch
  (`PROJ.weave` = [heading amplitude, period s, from m, to m]: the 3M55).
- **Air strikes** (airstrike.js): an aircraft's `attack` or point `strike` flies a profile: climb-out (straight on,
  to height and ~cruise speed), ingress fast and low (`u.altT`, `u.vAir`) to a release point inside the weapon's
  envelope and clear of the classified SAM rings it knows of, then release only when `airReady` (nose on the target
  within ~8 deg, wings near level, level flight, fast enough; a helicopter hovers, nose on, and pops up until it sees
  the target over the ground). Rounds leave a pylon / rail along the aircraft's axis and turn after. After the volley
  `airEgress` turns it away the way it came. `u.strk` / `u.strkPh` ('out' | 'in' | 'rel') while the profile runs;
  dynamics.js drops it when the order ends. A round fired at a point (`tk: 'point'`) bursts there (`splash` why
  `'point'`; units within `P.blast`, else 2 m per hp, 20-60 m, take damage falling off with distance).

### Break-up events (for a rigid-body debris system)

`spinout`, `intercept` and the `'spinout'` splash carry what a debris system needs: `pos` (the struck point, world;
for the splash, where it came down), `vel` (the round's velocity, m/s), `w` (angular velocity, rad/s, world axes),
`hdg` / `pitch` / `roll` (its pose), `model` (PROJ[kind].model: the HD model key, aliases in data/models.js), `part`
(the model part that took the blow, or null; not on the splash), `seed` (uint32, deterministic per round and tick).
Positions and vectors are fresh arrays. `gunhit` carries only the fields in its row.

| event | when | also |
|---|---|---|
| `spinout` | knocked out of control, still whole: it tumbles from here (keep drawing the proj; it stays in `sim.projectiles` until its `splash` / `hit`) | proj, kind, side, `at` (its centre), `imp` (unit direction of the blow), `rel` (relative velocity of what struck it), by, byKind, unit, `cause` ('gun' / 'burst'), `miss` (burst distance, m), target, tk |
| `intercept` | destroyed outright: `breakup: true` (the proj is removed this tick) | proj, kind, side, `at` (its centre), `imp`, `rel`, by, byKind, unit, `cause`, `miss`, `burst` (burst point or null), target, tk; `w` is its tumble if it was already tumbling, else [0, 0, 0] |
| `splash`, why `'spinout'` | a tumbling round comes down on the ground or the sea | water, air: false |
| `gunhit` | gun rounds struck a round this tick (sparks) | unit, weapon, target, tk: 'proj', `n` (real rounds), burst |

## Damage: modules and cook-off (damage.js, data/modules.js)

Every unit type has modules: boxes in its model frame (the frame of sim/bodies.js), placed on what the model shows (the
cutaway models' interior parts: magazines, VLS blocks, engine rooms, fuel, canisters, radar faces, the cockpit...).
Each: `hp`, `disables` (with `group`: only once every module of the group is out, e.g. both SPY faces, both wheel runs),
`slow`, `lose` (ammunition), `fatal`, `armor` (0..1), `cook` (explosion risk). The table and its field list are in
data/modules.js; the numbers of the rules are `COOK` there.

- **A hit** (`applyDamage(sim, u, dmg, src, { part, part2, pos, reach })`) takes `dmg` off the hull hp, marks the
  model part (visual), then bursts as a charge. Where: the struck point (world `pos` into the model frame); a round
  that struck goes on `COOK.pen` (2 m, at most 0.3 x its reach) along its path (the velocity of the `hit` event
  weapons.js emitted just before `applyDamage`) before it bursts; a burst outside the body (a proximity fuze, a shell's fragments) reaches in from the skin; a hit without a
  point bursts at the centre of the part drawn by weight. How far: `reach` = `COOK.reach` x sqrt(dmg) m (0.5-14 m: an
  Oniks 10.7 m, a Tomahawk 8 m, a Kh-35U 7 m, a Hellfire 6 m, a 5" shell 3 m, a few 30 mm rounds 0.5-1 m); the
  munition's stats are its PROJ `dmg` only. Every module within reach takes `dmg x (1 - d / reach)^2 x (1 - armor)`
  (d = distance from the burst to its box; inside the box, all of it). So where a hit lands matters: an Oniks on a
  Burke's aft VLS takes out the 64 cells (and may set them off), one on her bow reaches the gun and its magazine.
- **The hull** has no box: a ship whose hull part is wrecked (`u.parts.hull` at 1, ~45 % of her hp in hits on it) keeps
  to `HULL_SLOW[type]` of her speed for good (multiplies `u.slowK`; data/modules.js). Her machinery's losses are modules.
- **Destroyed** (hp taken >= its hp): its `disables` (a group's: when the whole group is out), `lose` (fractions of
  the named ammunition; 'cargo': TLCs aboard), `slow` (multiplies `u.slowK`), `fatal` (the unit is lost). Event
  `module`.
- **Cook-off.** A module with `cook` and something in it (`cook.ammo`: that weapon's ammunition > 0, 'cargo', or
  always when unset) may go up on any hit that damages it: chance `cook.p x f^2 x min(1, COOK.bite x add / hp)`, f =
  its damage 0..1 after the hit, add = what this hit dealt (a hit that destroys it outright: `cook.p`; small hits on a
  fresh module: next to nothing). One draw of `sim.rng.dmg` per roll (deterministic). A module goes up once.
  - `out: 'kill'` (vehicles, aircraft, subs, the destroyers' and cruisers' VLS and gun magazines): the unit is
    destroyed outright, hull hp to -0.5 x hpMax (a ship goes down fast and hard: sinkPlan).
  - `out: 'heavy'` (the carrier's and the LHD's magazines, JP-5, hangar; the destroyers' JP-5; the HQ's generator):
    `cook.dmg` hp of structural damage (and flooding) bursting from the module's centre with reach `cook.size x
    COOK.chainR` (its neighbours take it and may go up in turn, `COOK.depth` = 2 deep), and a fire: `cook.burn` hp/s
    for `cook.fire` s (`u.fire`, `u.fireRate`; `fireout` when it is out). She may still be lost to it.
- Events (in this order): `module` (unit, side, module, label, part, disables, pos: its box centre, world), then
  `cookoff` { unit, type, side, module, label, part, pos (world, the module's centre), at (model frame), size (m: the
  fireball / blast radius to draw), out ('kill' | 'heavy'), fire (s, heavy only), depth (0 = set off by the hit, 1+ =
  by another cook-off) }, then `destroyed` if the unit is lost. The visuals (explosions, break-up) listen for
  `cookoff`.
- On a ship with a subdivision the charge, the modules it reaches and her flooding are sim/ship.js' (next section).

## Ships: compartments, systems, flooding (ship.js, data/ship_layouts.js, data/ship_systems.js)

Every warship with a subdivision (DDG, CG, carrier, LHD, LCS, SSN, SSK; not the LCAC) carries `u.ship` from its spawn.
A hit on her is no longer a sphere of damage round the burst (`burstIn`) nor a flat flood share: `applyDamage` hands
the charge to `shipHit`, and her flooding comes only from the holes it tears.

- **Subdivision** (`data/ship_layouts.js`, `layoutOf(type)`): spaces as boxes in the model frame with volume,
  floodable share (`PERM` by use: machinery .85, stores .6, full tanks .1...), deck levels; the boundaries between
  each pair (shell / deck / bulkhead / enclosure / girder / house, area, plating mm, watertight or not) with their
  doors and hatches (`OPENINGS`: a watertight door 1.3 m2 letting go at 100 kPa in the bulkheads at and above the
  damage-control deck, a hatch 1 m2 at 50 kPa in the decks, a weather door 1.5 m2 at 70 kPa: as the blast solver's
  `ventsOf`); a voxel grid (`at(x, y, z)`: the space, `SEA` -1 or `AIR` -2) and the hull form (`hb`, `deck`, `keel`);
  hydrostatics (`hydro`: waterplane, LCF, GM and GML, reserve buoyancy). The **DDG** is the blast bench's Arleigh Burke
  (`data/layout_ddg.js`, generated by `data/gen/layout_ddg_gen.js` from `game/concepts/blast/burke_structure.js`: 82
  spaces, 13 watertight bulkheads). The others are generic (`GEN`): a hull form, watertight bulkheads at sensible
  spacing, decks, the main spaces merged over the cells they span (machinery, magazines, VLS enclosures, well deck,
  hangars), side protection wings on the carrier, deckhouses as boxes, boats as a pressure-hull cylinder.
- **Systems** (`data/ship_systems.js`, `SYSTEMS[type]`): the modules (data/modules.js) and the supporting systems as
  one graph. Nodes (a box or a line; a tolerance class `TOL`: electronics, arrays, switchboards, cable ways, pumps,
  machinery, shafting, magazines, mounts, working spaces) and what each needs: `pw` (electrical power), `needs`
  (`'a|b'` alternatives, `'a+b'` both; nodes or capabilities). Power: generators feed their switchboards; the cable
  ways (port high, starboard low) run the length of the ship in segments between the watertight bulkheads; a
  switchboard ties them at its station; a load is powered when a live switchboard reaches its station along intact
  segments, else casualty power is rigged `SHIPK.casualty` s later (while some switchboard is live). Propulsion (DDG,
  CG): each shaft's prime movers through its gear, shaft line and pitch control; speed goes as the cube root of the
  power left (`u.sysK`, one shaft x0.95). Steering: the steering gear (lost: `u.steerK` .35, the rudder's authority).
  `caps`: the capability tokens (`u.off[k]`) and what each needs; on these ships a module's own `disables` is not
  used, the graph decides (`radar` needs a SPY face and the signal processor, `sm6` the radar, CIC and a VLS...).
  Re-walked only when something changed (a hit, a flooded or dried space, a fire burning a node out, casualty power).
- **A hit** (`shipHit`; charges `CHARGE`: kg TNT, effective fragments, the plating they pierce, the fuze): the hit
  point carried along the round's path to the real hull (the collision boxes stand off the plating at the ends), a
  delayed fuze 1.6 m on inside. Inside a space: the quasi-static gas pressure (qsp, the bench's) and the reflected
  Kinney-Graham shock on each boundary; plating tears within `zTearIn` x W^1/3 (x sqrt(10 / t)), or splits under the
  gas past `pGas` x t (up to half its area); doors and hatches blow at their pressures; the gas reaches the next
  spaces in proportion to what opened (a door passes a little, a torn deck most; three rings). Outside (contact, a
  shell): the plating it struck tears within `zTearOut` x W^1/3. A torn shell is a hole (`S.holes`: where, how big).
  Then every node in reach (`reach` x W^1/3, or in the gas): overpressure and impulse through what stands between
  (the line to it through the voxel grid: intact plating passes `wall`, the open share of a boundary `trans`), the
  damage index min(P / Pc, I / Ic) against its class, plus fragments on the line (F x its area / 4 pi R^2, through
  plating thinner than `pen`); a module takes its share of its hp in `hurtModule` (armour, cook-off rolls as before),
  others their 0..1 damage. A fire where it went off. A torpedo under the keel (`undex`) opens the bottom under the
  spaces over it and shakes their machinery. A heavy cook-off is the same blast from the module's contents
  (`shipCook`). Cost ~0.2-0.6 ms a hit (DDG).
- **The step** (every `SHIPK.step` ticks, `stepShips`): orifice flow (`cd` A sqrt(2 g h)) through each hole by the part
  of it under her own waterline (her sinkage, list and trim) against the space's water level; between spaces through
  torn plating (less what is shored) and open doors, by the levels either side (a full space passes on the head of
  what fills it); the pumps (the live fire pumps' eductors) on sealed spaces first. Stability: the floodwater as added
  weight: sinkage by the waterplane, trim by GML, list by the metacentric height left after the water's weight and
  a free-surface penalty (breadth^3 x length / 12 of the slack spaces, less while shallow); no GM left: she lolls.
  `u.list`, `u.trim` and the sinkage come from here (dynamics.js), `u.flood` = water / reserve (0..0.5), `u.fSide` /
  `u.fEnd` from her holes and her water (the sinking). Speed: less with her water, list and trim. She founders when a
  deck edge goes `SHIPK.awash` under or the water passes her reserve buoyancy, capsizes past `SHIPK.capsize` of list
  ('foundered' event, then `destroyed`). Fires grow, burn what is in their space (`TOL.fire` s at full), spread through
  open or torn boundaries after `fireSpread`, go out under water. Damage control (`SHIPK.teams`): fires worst first
  (the firemain: x4 slower without it), plugs holes a team can reach (up to 1.5 m2, not deeper than 4 m), shores torn
  bulkheads and blown doors round the flooded spaces, counter-floods a tank or void on the high side past `cfList` of
  list (with metacentric height to spare; the pumps leave it). General quarters (she has fired, been hit, a hostile round
  within 20 km): the doors open in cruising (`yokeOpen`) shut over `zebra` s; 15 quiet minutes and they open again.
- **Events**: `system` { unit, side, node, label, cls, state 'out' | 'restored', why ('blast' | 'frag' | 'fire' | 'flood'
  | 'shock' | 'power' | 'supply'), caps (tokens lost / back with it), pos }, `compartment` { unit, side, comp, label,
  state 'breach' (A m2, below) | 'torn' | 'flooding' | 'flooded' | 'dry' | 'fire' | 'fireout' | 'counterflood' }, `foundered` { unit,
  side, why 'foundered' | 'capsized', w (m3) }. Readouts: `shipSummary(u)`, `floodShare(u, z0, z1, side)` (game/structure
  seeds her sections' flooding from it), `shipRefresh(sim, u)`. Console / tests: `sim/ship_probe.js` `strike({ type,
  kind, at, from, secs })` -> the log of one hit and the minutes after it.

## Economy

`sim.buy(side, type)` → true if paid; arrives at the side's spawn after `UNITS[type].buildTime` (aircraft on the
carrier, drones into a catapult). Supply: base 1.2/s + per held objective (held = own units inside r, no enemy).
Placement (`findSpot`, economy.js): a valid spot clear of every other unit by `GAP` (vehicles 60 m, ships 450 m, a
carrier more), random tries near the point first, then outward ring by ring; `spreadOut(sim, units)` steps apart any
units a planner put on one spot (game/setup.js runs it on the starting forces).

## Events

`{ type, t, ... }`, positions are `[x, y, z]` copies.

| type | fields |
|---|---|
| `launch` | proj, kind, side, from, target, tk, pos, hdg, pitch, weapon |
| `booster_sep` | proj, kind, side, pos, vel |
| `intercept` | pos, proj (the round killed), kind, side, by (interceptor id / gun unit), byKind, unit; break-up fields (see Projectiles: Break-up events) |
| `spinout` | a round knocked out of control (see Projectiles: Break-up events) |
| `hit` | pos (the struck point), target, kind, side, from, proj, part (the part it struck), vel; `n` (gun: real rounds), `burst` / `miss` (a burst near an aircraft), `blast` (a shell's fragments, m), `spin` (a tumbling round fell on it), `under` / `depth` (torpedo) |
| `splash` | pos, kind, side, proj, air, water, miss, why ('moved'\|'terrain'\|'selfdestruct'\|'short'\|'lost'\|'miss' (an interceptor passed its target)\|'burst' (it went off near its target, knocking it out of control)\|'wide' (a strike round passed its target; an interceptor whose burst was out of reach)\|'over' (a strike round passed its target)\|'point' (a round fired at a map point burst there)\|'spinout'); kind 'crash' for aircraft |
| `gunfire` | unit, side, weapon, pos (muzzle), to, aim (where the burst is pointed), tof (s), dur, n (real rounds), hit (always false: rounds resolve in flight, see `gunhit` / `hit`), target, tk, mount, burst (id in `sim.bursts`) |
| `gunhit` | unit, side, weapon, target (a round), tk, pos, n, part, vel, burst |
| `damage` / `part` | unit, part, hp / label, disables |
| `module` | unit, side, module, label, part, disables (what went off with it; [] until its group is all out), pos |
| `cookoff` / `fireout` | see "Damage: modules and cook-off" / unit, side (a heavy cook-off's fire is out) |
| `destroyed` / `removed` | unit, type, side, pos, by |
| `detect` / `classify` / `lost` | side, unit (or proj), track, pos, how ('radar'|'camera'|'esm'|'scan'|'lightning'), cls, name |
| `scan` | phase 'start' (from, pos, r, delay, by, side) then 'hit' (pos, r, hits: unit ids) |
| `deploy` | unit, what ('jacks'|'erect'|'lowered'|'stowed'|'mast_up'|'mast_down'|'well_open'|'well_shut'|'lift_up'|'lift_down') |
| `reload_start` / `reload_done` / `reload_end` / `resupply` | unit, by, ammo / what |
| `radar` | unit, side, on |
| `takeoff` / `land` | unit, type, from / to |
| `lightning` | pos, top, r |
| `sonar` | side, by (listener), unit, track, pos (the fix), r (its roughness, m): the side heard a contact (≤ 1 per 5 s per contact) |
| `dive` / `torpedo_end` | unit, side, depth / pos, kind, side, proj, why |
| `order_unit` / `reinforce` / `objective` / `result` | side, type, unit / id, owner / winner, reason |
| `well` | unit (the craft), host, side, dir ('out' / 'clear' / 'in' / 'docked'), pos: an LCAC through the LHD's stern gate |
| `landing` / `unload` / `embark` | unit, side, state ('done' / 'empty' / 'nobeach' / 'noroute'), n / unit, from, type / unit, host |
| `overrun` | side ('fleet'), unit (the command post), state ('start' / 'lost' / 'taken'), t (s held), by: fleet ground units within 1.5 km of the coast's command post with no coast ground unit there for 120 s take it (it is destroyed: the `hq` result) |
| `engage` | unit, side, target, track, state ('volley' / 'lost' / 'resume' / 'done'), why ('destroyed' / 'empty' / 'lost' / 'out' / 'noweapon' / 'reach'), n (volleys), weapon: a persistent attack order |

## AI

`aiSides` + `difficulty` ('easy'|'normal'|'hard'). The AI reads only its own units, its contacts, its missiles and the
map. `sim.ai[side].log` holds its recent decisions. `AI.emplace()` (used by `setupBattle`) puts the battery on the
sites it would choose.

## Headless (Node): `tools/sim.mjs`

No browser needed: the harness shims `window` (and `window.M3` from `reference/menus/common/m3.js`, evaluated with `vm`),
generates maps directly (`loadMap(id, { worker: false, cache: false })`) and runs the page code itself.

| Command | What |
|---|---|
| `node tools/sim.mjs test [--only s] [--map id] [--long]` | every test in `tests.js` (as `tests.html`), PASS / FAIL lines, exit code 1 on a failure |
| `node tools/sim.mjs balance --maps all --seeds 24 [--seed 1] [--level normal] [--limit 7200] [--set …] [--workers k] [--rows] [--json f]` | the AI-vs-AI batches of `balance.html`: `src/balance.js` runs the matches in `worker_threads` (its own worker protocol), same table |
| `node tools/sim.mjs bench [--perftest] [--map id] [--secs 60] [--warm 90] [--reps 3] [--fn 25] [--lines fn]` | cost of a 200-unit battle with 250-470 rounds in flight (`--perftest`: the field of the tests.js perf test): ms per sim-second warm (best of fresh runs) and cold (the first run in the process, as the first match of a page), per stage (a copy of `step()` with a clock round each stage; checked to give the same state hash as `step()`), per file (CPU profile self time) |
| `node tools/sim.mjs hash [--maps stub,fjord] [--seeds 1,2,3] [--ticks 36000] [--bench] [--json f]` | `sim.hash()` and a deep hash (every field of units, rounds, bursts, contacts, sides, AI, weather, objectives at full float precision, every event, the next draw of each seeded stream) after N ticks: run before and after a change that must not change behaviour |

## Performance notes (keep these when changing the sim)

- A step is ~9 ms per sim-second for 200 units and ~350 rounds in flight once the JIT has settled (x32 costs ~30 % of a
  core), ~11 cold. Rounds (`stepOne`: two atan2 and four sin/cos per round per tick) and movement are the largest parts.
- Keep objects in one layout: every field a unit can ever get is declared in `sim.spawn` (unset fields as `undefined`),
  likewise the projectile literal in `launch`, the contact in `getContact` and the Sim's own fields. A unit that grows
  a field later forks its hidden class, and every property read on units anywhere in the sim becomes a slow generic
  lookup (this alone cost ~25 %). Per-type caches go on the unit tables at load (mech.js, weapons.js), never mid-match.
- `primeLayouts()` (sim.js) runs once per page / Worker: it spawns one unit of every type on a tiny private sim and
  gives every field that takes fractions in play one, so the first match does not keep throwing away optimised code
  when a field first gets a fraction. The lists (`FRAC`) were sampled over full AI battles on every map; add a field
  there when a new one takes fractions (a missing one only costs speed).
- Sensors scan flat per-tick tables (foes, own sensors) and cache per-foe terms (weather, height, rcs^.25); a cheap
  pre-test rejects pairs well outside the radar's sweep sector before the exact test. Only pure tests are cached or
  reordered: the seeded draws happen for the same pairs in the same order.
- Contacts change only through sensors.js (`PICTURE.v` counts the changes); weapons.js lists the air tracks and the
  classified tracks once per weapons tick and again when the picture changes.
- Check every optimisation with `node tools/sim.mjs hash` before / after (the deep hash must not change) and the
  balance table (the rows must be identical).

## Files

`sim.js` (state, step, visible, hash) · `nav.js` (grids, A*) · `movement.js` · `dynamics.js` (vehicle, ship and
aircraft dynamics, separation) · `sea.js` (the swell and a hull's response to it) · `orders.js` · `mech.js` (deploy,
reload, refill, turrets, carrier deck) · `sensors.js` (radar, camera, ESM, contacts, scan) · `weapons.js` · `bodies.js`
(part boxes, collision tests) · `damage.js` · `ship.js` (compartments, systems, flooding, fire, damage control) ·
`ship_probe.js` (one hit on a ship, the log after it)
· `economy.js` · `weather.js` · `ai.js` · `setup.js` · `amphib.js` (well deck, LCAC, landings, overrun) · `stubmap.js` (Map-contract test coast) · `probe.js` (headless
battle for the console) · `tests.js`, `tests_physics.js` (game/tests.html) · `consts.js`, `util.js`, `rand.js`.
