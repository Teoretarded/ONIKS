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
- Damage per part: `unit.parts[name]` 0..1; a part at 1 is destroyed and switches off `UNITS[type].parts[name].disables`
  (tokens in `unit.off`: 'move', 'radar', 'camera', 'scan', 'deploy', 'air', 'reload', 'launch', weapon names).
- Dying: ships list and settle over 60 s, vehicles burn 20 s, aircraft fall; then the unit is removed ('removed').
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

## Orders

`sim.order(ids, order)`; `order = { kind, x?, z?, target?, on?, n?, r?, queue? }`

| kind | effect |
|---|---|
| `move` | path on land (roads faster) / at sea (draught) / direct in the air. Several units: line-abreast formation at the slowest speed |
| `attack` | `target` = enemy unit id (must be a track: conf ≥ CLASSIFY). Closes to range, deploys (TEL), fires `n` rounds (default the weapon's salvo) |
| `stop` | clear orders and halt (an aircraft on deck also leaves the launch queue) |
| `hold` | `on` (default true): hold position, offensive weapons pick their own targets. Defensive weapons always fire by themselves |
| `weapons` | `free` true/false: set the weapons-free flag (`u.hold`) without touching the orders (the player's Weapons free / Hold fire); `free: false` also drops attack orders |
| `deploy` / `undeploy` | TEL: jacks 10 s, erect 15 s (immobile while deployed). Radar: mast 15 s (needed to radiate) |
| `reload` | transloader + `target` TEL: drive beside it, 45 s per round. Transloader alone: refill at a depot. TEL: calls a transloader, else drives to a depot (90 s per round). Ships: sail to `map.replenish`. Pantsir: depot |
| `scan` | at x, z within the unit's scan reach (moves closer if mobile, unless `stay` and not an aircraft: the player's scans pass `stay`). Needs the side's and the unit's cooldowns |
| `radar` | `on` true/false (EMCON). A radiating radar can be heard by the enemy |
| `dive` | submarines, immediate: `depth` 0 surface · 1 periscope depth · 2 deep (none: one step down) |
| `launch_drone` | catapult: 12 s, then a drone patrols x, z |
| `patrol` | aircraft: orbit x, z (radius r). Surface: shuttle between here and x, z |
| `return` | aircraft to the carrier (land, rearm from its magazine), drones to a catapult, ships to replenish |

Orders queue with `queue: true`. The AI uses the same orders.

## Picture (fog of war)

- `sim.visible(side, unit)` → `'own' | 'track' | 'contact' | null`.
- `sim.sides[side].contacts: Map<unitId, Contact>`; `sim.contact(side, unitId)`.
  `Contact = { track: 'TRK 21', unitId, conf, cls, type, name, pos /* estimate */, vel, err /* m */, lastSeen, identified, emitting, dom, dead }`.
  `cls`/`type` are set once conf ≥ `CLASSIFY` (0.6). `identified` after a scan (inspect allowed).
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
Guns (Phalanx, 2A38M) fire bursts resolved at once: `gunfire` events.

## Economy

`sim.buy(side, type)` → true if paid; arrives at the side's spawn after `UNITS[type].buildTime` (aircraft on the
carrier, drones into a catapult). Supply: base 1.2/s + per held objective (held = own units inside r, no enemy).

## Events

`{ type, t, ... }`, positions are `[x, y, z]` copies.

| type | fields |
|---|---|
| `launch` | proj, kind, side, from, target, tk, pos, hdg, pitch, weapon |
| `booster_sep` | proj, kind, side, pos, vel |
| `intercept` | pos, proj (the round killed), kind, side, by (interceptor id / gun unit), byKind, unit |
| `hit` | pos, target, kind, side, from, proj |
| `splash` | pos, kind, side, proj, air, water, miss, why ('pk'|'moved'|'terrain'|'selfdestruct'|'short'|'lost') ; kind 'crash' for aircraft |
| `gunfire` | unit, side, weapon, pos (muzzle), to, dur, hit, target, tk, mount |
| `damage` / `part` | unit, part, hp / label, disables |
| `destroyed` / `removed` | unit, type, side, pos, by |
| `detect` / `classify` / `lost` | side, unit (or proj), track, pos, how ('radar'|'camera'|'esm'|'scan'|'lightning'), cls, name |
| `scan` | phase 'start' (from, pos, r, delay, by, side) then 'hit' (pos, r, hits: unit ids) |
| `deploy` | unit, what ('jacks'|'erect'|'lowered'|'stowed'|'mast_up'|'mast_down') |
| `reload_start` / `reload_done` / `reload_end` / `resupply` | unit, by, ammo / what |
| `radar` | unit, side, on |
| `takeoff` / `land` | unit, type, from / to |
| `lightning` | pos, top, r |
| `sonar` | side, by (listener), unit, track, pos (the fix), r (its roughness, m): the side heard a contact (≤ 1 per 5 s per contact) |
| `dive` / `torpedo_end` | unit, side, depth / pos, kind, side, proj, why |
| `order_unit` / `reinforce` / `objective` / `result` | side, type, unit / id, owner / winner, reason |

## AI

`aiSides` + `difficulty` ('easy'|'normal'|'hard'). The AI reads only its own units, its contacts, its missiles and the
map. `sim.ai[side].log` holds its recent decisions. `AI.emplace()` (used by `setupBattle`) puts the battery on the
sites it would choose.

## Files

`sim.js` (state, step, visible, hash) · `nav.js` (grids, A*) · `movement.js` · `orders.js` · `mech.js` (deploy,
reload, refill, turrets, carrier deck) · `sensors.js` (radar, camera, ESM, contacts, scan) · `weapons.js` · `damage.js`
· `economy.js` · `weather.js` · `ai.js` · `setup.js` · `stubmap.js` (Map-contract test coast) · `probe.js` (headless
battle for the console) · `tests.js` (game/tests.html) · `consts.js`, `util.js`, `rand.js`.
