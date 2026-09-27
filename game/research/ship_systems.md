# Ship systems, compartments and flooding — game design research

Scope: how existing games and general naval-architecture textbooks model a ship's internal systems,
compartmentation and flooding, and a recommended design for our headless deterministic sim
(`game/src/sim/`). Game design and general engineering only — no data about any real warship's actual
vulnerabilities, armor layout or weak points.

## 1. How existing games model it

### World of Warships (Wargaming)
Arcade-speed model built for readability at a glance, not hydrostatics.
- **Modules as hit-boxes with HP**: main battery turrets, torpedo tubes, engine, steering, funnels each have
  their own HP pool and a per-hit incapacitation *chance* that rises as the module's HP drops, rather than a
  hard "destroyed at 0 HP" cutoff for all effects — a wounded module fails probabilistically before it is fully
  dead. See [Ship:Modules](https://wiki.worldofwarships.com/Ship:Modules) and
  [Mechanics & Design: Modules](https://worldofwarships.eu/en/news/game-guides/mechanics-and-design-modules-131/).
- **Flooding as a flat damage-over-time buff/debuff**: a torpedo/bomb hit below the waterline rolls a flooding
  chance; once triggered, flooding ticks a fixed % of max HP per second for a fixed duration and cuts top speed
  ~30%, regardless of where the hole is or how large. No compartment volumes, no list/trim. See
  [Ship:Flooding](https://wiki.worldofwarships.com/Ship:Flooding).
- **Damage Control Party** is a single consumable, limited charges (or 1 with infinite recharge on some
  ships), that instantly clears *all* fires/floods/module knockouts and gives a short window of immunity. This
  is the "it stays fun" design: a chunky, legible counterplay button rather than a repair-crew simulation. See
  [Ship:Consumables](https://wiki.worldofwarships.com/Ship:Consumables).
- Fire works the same way as flooding: a %HP/second burn, extinguished by the same consumable, with its own
  independent trigger chance per hit and duration.
- **Why it works for the genre**: everything is a percentage and a timer, so the client and server only track
  a handful of floats per ship; feedback is instant and unambiguous (an icon, a red bar draining); the counter
  is a single button press, which keeps flooding a tempo/resource-management puzzle instead of a simulation
  the player has to interpret. **What feels fake**: no relationship between hole size/depth and flood rate, no
  sense of "where" the ship is flooded, capsizing effectively doesn't exist as a distinct failure state.

### War Thunder naval
Heavier simulation layer than WoWS, still real-time-cheap.
- **Compartments as physical hit-boxes with their own crew**: a compartment has a durability pool and houses a
  fixed crew count; damage in that compartment kills crew proportionally (e.g. 500 HP / 4 crew → 1 crew lost
  per 125 damage), and dead crew stop performing that compartment's jobs (firefighting, pumping, gunnery). This
  ties personnel *and* structure to the same location, which is the key idea worth stealing: a compartment is
  a place with both hit points and workers in it. See
  [Ship Crew Mechanics](https://wiki.warthunder.com/640-ship-crew-mechanics) and
  [Ship Modules](https://wiki.warthunder.com/mechanics/5245-ship-modules).
- **Two-stage flood response**: first patch the breach (stops inflow), then pump out standing water (removes
  what's already in); pumps drain faster with more/better pumps assigned. A hit can also destroy a bulkhead
  outright, permanently disabling repair for that compartment — a hard "this space is gone" state instead of
  a repairable HP bar. See the
  [dev blog on the damage-control rework](https://warthunder.com/en/news/9795-development-the-new-damage-control-mechanic-for-naval-en).
- **Automated presets** (firefighting / module repair / pumping) with a player-adjustable priority slider, so
  the player manages *policy* ("prioritize pumping") rather than clicking individual valves — a good pattern
  for an RTS where you don't want to babysit one ship.
- What players found convincing: compartments as physical spaces you can reason about ("the aft magazine is
  flooding"); what felt arbitrary: patch/pump speed is crew-count based rather than hole-size based, so a
  pinprick and a gash drain at rates set mostly by crew logistics.

### Cold Waters / Sea Power: Naval Combat in the Missile Age
Both are hard-ish tactical sims (sub and surface warfare respectively) built around a damage-state graph
rather than a flooding fluid model: a hit rolls against a table of possible failures (fire, flooding,
propulsion loss, sensor kill, structural breach) weighted by hit location and warhead type, and each failure
is tracked as a discrete state with its own repair timer. Flooding, where modeled, is a compartment-level
percentage that climbs toward "compartment lost" and can be slowed by damage control down time rather than
computed from an orifice equation. This is a good template for "cheap but structured": no real fluid sim, just
a well-authored table of *what breaks* and *how badly*, keyed by where the impact landed.

### Rule the Waves 2/3 and Atlantic Fleet
Strategic/operational-scale sims where a "hit" resolves instantly into abstracted consequences rather than a
tick-by-tick simulation:
- **Compartments as flood-state counters**: each hit floods a number of compartments (by hit size/location),
  which converts directly into a **flooding tonnage** that adds weight and reduces freeboard/speed; multiple
  flooded compartments compound toward a sinking threshold.
- **List and trim as an emergent readout, not a physics solve**: asymmetric flooding (one side/one end) is
  tracked as a list/trim value that degrades gun accuracy and top speed, and which the player (or an AI order)
  can partially correct with counter-flooding — deliberately flooding a compartment on the *opposite* side to
  bring the ship back upright at the cost of more displacement/slower speed. This is the single most useful
  "list mitigation as a game mechanic" idea here: trading buoyancy for uprightness is a real, playable decision
  with a real cost. Discussion of the general mechanic:
  [NWS forum: Flooding](https://nws-online.proboards.com/thread/717/flooding).
- Because these are turn/event-resolved games (RTW) or a light real-time layer over the same event model
  (Atlantic Fleet), the "compartment" only ever needs to be an integer counter and a couple of derived scalars
  (list °, trim °, flood tonnage) — there is no need for volumes or connectivity graphs at all.

### From the Depths, NavalArt, Stormworks
Voxel/block sim-builders where the ship *is* its damage model:
- **Stormworks** genuinely simulates water as a cellular fluid inside the hull's voxel grid — water flows
  cell-to-cell, seeks a level, and buoyancy/mass is recomputed from the actual water volume in each hull
  block. This is the most "real" of the group and by far the most expensive: it is only tractable because
  Stormworks ships are small (tens to low hundreds of voxels) and single-instance (one player's vehicle, not
  hundreds of simultaneous ships as in an RTS).
- **From the Depths / NavalArt** are closer to War Thunder's compartment model at block granularity: each
  block is a small HP pool; a breached hull block lets water in and it fills connected below-waterline blocks
  toward the surrounding waterline, contributing buoyancy loss and list. Community consensus in both is that
  the "block floods to local waterline, connected blocks flood in sequence" model reads as convincing while
  staying cheap, because it only needs a flood-fill over blocks marked "breached" rather than a real fluid
  solve.
- **Why this doesn't fit an RTS**: per-voxel water is O(hull volume) per ship per tick; fine for one
  player-built vessel, not for dozens of ships. The right takeaway for us is the *connectivity* idea (flooding
  spreads along a graph of openings to neighboring spaces) without the *per-cell fluid* cost.

### Silent Hunter (III/4/5)
Submarine sim: compartments (bow torpedo room, control room, engine room, etc.) each have HP, and a hit that
penetrates causes that compartment to flood at a rate tied to depth (deeper = more inflow, matching real
hydrostatic head) and to hole severity; flooding raises weight in that compartment, which changes trim
(bow-down/stern-down) and can send the boat past crush depth or under before it can surface. Repair crews
assigned to a compartment reduce flood rate and eventually can seal it. The "depth increases inflow rate" and
"flooding shifts trim, not just adds weight" pieces are exactly the physically-motivated details worth keeping
even in an abstracted model.

### Ultimate Admiral: Dreadnoughts
Real-time tactical sim with a fairly granular internal model: hits are traced through **armor belts, decks and
citadel** to an internal component (boiler, magazine, engine, steering, crew stations) with a chance to trigger
a secondary effect (fire, magazine detonation risk, flooding). Flooding is tracked per compartment as a percent
full, contributes to displacement/list, and is fought by damage-control parties with a limited work rate that
the player allocates. Community feedback: the module-penetration chain (which layer stops the shell, which
component gets hit) reads as convincing when shown to the player (hit markers, compartment diagrams);
flooding pacing has been repeatedly tuned by the developers because "everything sinks too fast/slow" is the
first thing players notice when the compartment→flood-rate curve is off — a strong argument for making that
curve a small number of exposed, tunable constants rather than something buried in a physics solve.

## 2. General naval-architecture principles (textbook level)

These are standard undergraduate naval-architecture/damage-control material
(e.g. SNAME's *Principles of Naval Architecture*, USNA's damage-control notes, USCG stability guides), not
information about any specific ship.

- **Watertight subdivision**: the hull is divided by transverse (and sometimes longitudinal) bulkheads into
  watertight compartments. The design intent is that flooding *one* compartment (or a defined number of
  adjacent ones, the ship's "damage length" standard) still leaves enough reserve buoyancy and stability margin
  to stay afloat and upright. This is the origin of "one-compartment" / "two-compartment" ship standards.
- **Watertight doors and hatches** are the deliberate openings in that subdivision: closed, they block flow
  between compartments; open (for access) they let flooding spread. A ship's actual survivability under damage
  depends heavily on door status at the moment of the hit — a major reason "damage control" as a job exists:
  crews close doors/hatches proactively (set "condition zebra") before an expected engagement.
- **Progressive flooding**: water entering one compartment can spread to adjacent ones through open doors,
  hatches, cableways, ventilation ducts, or further hull/bulkhead damage, not just through the original hole.
  This is why a single hit can eventually flood far more volume than the hole's compartment alone.
- **Inflow through a submerged opening — orifice equation**: the standard idealized model for water entering
  through a hole of area `A` at depth `h` below the waterline is
  `Q = Cd · A · sqrt(2 g h)` (torricelli/orifice flow), where `Cd` (~0.6–0.8 for a ragged hull breach) accounts
  for the real, non-ideal jet contraction and friction losses. Flow rate rises with the square root of depth
  and linearly with hole area; as the compartment fills, `h` becomes the *differential* head (sea level minus
  compartment water level), so inflow slows as the compartment equalizes, asymptoting rather than filling at a
  constant rate. See the general
  [orifice equation](https://engineering.fandom.com/wiki/Orifice_equation) and, applied specifically to ship
  flooding,
  ["Dynamic orifice flow model and compartment models for flooding simulation of a damaged ship"](https://www.researchgate.net/publication/283659358_Dynamic_orifice_flow_model_and_compartment_models_for_flooding_simulation_of_a_damaged_ship).
- **Typical flooding timescales**: for a small-to-moderate breach a few meters below the waterline, orifice
  flow gives inflow on the order of hundreds of liters to a few cubic meters per second per square meter of
  hole at ordinary hull depths (a few meters of head); a compartment of a few hundred to a few thousand cubic
  meters therefore floods in minutes at a large-hole/torpedo scale and can take much longer (tens of minutes
  to hours) for a small splinter hole or a slow leak, matching the qualitative pacing every game above lands
  on (a torpedo hit is a minutes-scale event; a fragment hole is a slow-drain nuisance). Exact numbers depend
  on hole size and depth, not on anything ship-specific.
- **Free-surface effect**: a partially-filled compartment (or tank) lets its water surface shift toward the
  low side as the ship heels, which shifts the effective center of gravity toward that side and *reduces* the
  righting arm — i.e. a half-flooded compartment is *more* destabilizing than either an empty or a completely
  full one of the same size. This is why real damage control tries to either pump a compartment dry or let it
  flood completely/vent it, rather than leave it half full. See
  [Free surface effect](https://en.wikipedia.org/wiki/Free_surface_effect).
- **Loss of buoyancy and stability, list, trim, capsize**: added flood water is (mostly) modeled as lost
  buoyancy (the flooded volume no longer displaces water) rather than simply as added weight, which lowers
  freeboard and metacentric height (GM); asymmetric flooding (off-centerline, or fore/aft of the ship's
  center of flotation) produces list (heel) or trim (bow/stern down) respectively. Enough loss of GM/righting
  arm at a given list angle leads to capsize (loss of positive stability) even before the hull is fully
  submerged; enough loss of freeboard/reserve buoyancy leads to foundering (sinking on an even keel). See
  [Ship stability](https://en.wikipedia.org/wiki/Ship_stability) and the
  [USNA stability chapter](https://usna.edu/NAOE/_files/documents/Courses/EN400/02.04%20Chapter%204.pdf).
- **Counter-flooding and damage control as mitigations**: deliberately flooding an intact compartment on the
  opposite side (or pumping ballast/fuel across) restores upright trim at the cost of *more* lost buoyancy and
  freeboard — a real and correctly-modeled trade-off in Rule the Waves' abstraction. Damage control in reality
  is: shore/patch the breach to cut `A` toward zero, pump to reduce standing volume, close doors to stop
  spread, and counter-flood/counter-ballast to fight list — exactly the four levers worth exposing as distinct
  player/AI actions.

## 3. Modeling generic internal systems as a dependency graph

Across War Thunder, UA:D and From the Depths, the recurring shape for "systems" (as opposed to raw
compartments) is: **a system is a small object placed in a compartment; systems depend on other systems; a
node without a live upstream is disabled.** Concretely:

- **Power**: generator nodes feed a switchboard/bus node; bus feeds cable runs to consumer nodes (turrets,
  radar, pumps, steering gear). Redundancy is modeled as *multiple generators feeding one bus* and/or
  *multiple buses cross-tied* — losing one generator degrades total capacity rather than instantly killing
  consumers, but losing the one cable run to a consumer (or the bus itself) kills it outright regardless of
  generator health. This "single point of failure in the wiring, not just the source" is what makes a single
  well-placed hit dramatic without needing a full circuit simulation: it's a reachability check on a graph,
  computed once per topology change (hit), not per tick.
- **Propulsion chain**: fuel/boiler → shaft/engine → propeller, as a linear dependency; losing any link zeroes
  thrust from that shaft. Multiple shafts give partial-speed redundancy (lose one of four shafts → ~75% max
  speed, not 0%), which is exactly how War Thunder and UA:D both read to players as "still limping, not dead."
- **Steering**: rudder + steering-gear node, usually with a manual/backup mode (slower response, not zero) if
  the primary is knocked out — a good place for a graceful-degradation tier instead of a binary.
- **Ventilation / fire spread**: modeled as an adjacency graph over compartments (same graph flooding uses);
  fire has a per-tick chance to jump to an adjacent compartment if the connecting hatch/vent is open, and
  ventilation nodes (if destroyed) raise that spread chance rather than being load-bearing themselves.
- **Sensors and command spaces**: treated as consumer nodes like any weapon system — a radar/lookout node
  needs power + an unbroken structural path to be "alive"; a command/bridge node's loss can gate a fixed
  penalty (order latency, targeting accuracy) applied at the ship level rather than modeled as its own
  sub-graph.
- **Fast damage rules used across these games** (cheap, table-driven, not physics):
  - **Overpressure/impulse threshold**: an explosion within radius `r` of a node applies a scalar "shock"
    value; if it exceeds the node's threshold, the node is disabled (chance-scaled near the threshold rather
    than a hard cliff, as WoWS does with module HP).
  - **Fragment/hit chance by exposed area**: a node's chance of being the thing that got hit scales with its
    footprint relative to the compartment's, a cheap way to avoid needing real ray-traced fragmentation.
  - **Fire**: binary "is burning" flag per compartment with a %HP/tick burn (WoWS-style) or a spread-graph walk
    (UA:D-style); either is O(compartments) per tick.
  - **Flooding**: per-compartment scalar (0–1 fill fraction) updated by the orifice-style rate below; that's
    the one piece worth giving real (if simplified) physics rather than a flat timer, because list/trim/speed
    loss reading as *proportional to hole size and depth* is what several of the reviewed games are praised or
    criticized for getting right or wrong.

## 4. Recommended design for ONIKS

Goal: deterministic, cheap enough for dozens of ships in a headless sim ticking well under 16 ms/frame
(`game/src/sim/`), while giving list/trim/speed loss that visibly tracks hole size and depth (the thing
players notice when it's *wrong*), and a small, exposed set of tunable constants (matching the project's
existing damage/blast constants in `game/src/sim/damage.js`, `game/src/blast/`).

### Data layout

```
ship.compartments: Compartment[]        // small, fixed array per hull, authored per ship class
  Compartment {
    id, volumeM3, centerX, centerY, centerZFromKeel,   // for list/trim moment arms
    openings: [{ toCompartmentId | toSea, areaM2, depthBelowWL, state: 'open'|'shored'|'sealed' }],
    fillFraction: 0..1,                                 // the one per-tick state variable
    permeability: 0..1,                                 // fraction of volume that can hold water (machinery ~0.85, void ~0.97, tank ~0 if already full of fuel)
  }

ship.systems: SystemNode[]              // power, propulsion, steering, sensors, command, pumps
  SystemNode { id, compartmentId, kind, dependsOn: SystemNode[], alive: bool, capacity: 0..1 }

ship.stability: derived, recomputed from compartments each tick:
  listDeg, trimDeg, freeboardM, GM_effective, speedFraction
```

Compartments are authored once per ship class (a dozen or so per ship, like War Thunder/UA:D, not a voxel
grid) — a short list in `game/src/data/units.js`-style data, not a simulated volume mesh. Systems are placed
into compartments and reference each other by id, forming the dependency graph from §3; that graph only needs
re-walking (a cheap reachability pass) when a node's `alive` flag changes, not every tick.

### Per-tick update (cheap, deterministic)

1. **Flooding integration** (only for compartments with `fillFraction < 1` and an open sea opening): for each
   opening, `dV/dt = Cd · A · sqrt(2 g · max(0, depthBelowWL + shipList/trim adjustment − waterLevelInCompartment))`,
   clamped so a compartment can't overfill; sum contributions from openings to already-flooded neighbors too
   (progressive flooding), so a breach in compartment A raises A's level, which raises flow through any open
   A→B door. This is a handful of sqrt's per breached compartment (there are normally very few at once), not
   a fluid solve — cost is O(open compartments × their openings), which is tiny.
2. **List/trim**: sum each compartment's `fillFraction · volumeM3 · permeability` as a point mass at its
   center, combine with the ship's intact mass distribution to get a shifted center of gravity, and derive
   list/trim from the standard small-angle stability relation (righting arm ≈ GM·sinθ); apply a free-surface
   penalty (reduce effective GM) for every *partially* full compartment, matching §2 — this is one extra
   subtractive term, cheap and gives the "half-full is worse than full" behavior players expect.
3. **Derived penalties**: freeboard loss and list/trim feed simple, already-cheap multipliers onto top speed,
   turn rate and gun accuracy (the same kind of scalar penalty WoWS/UA:D apply), so this stage is O(1) per
   ship regardless of compartment count.
4. **System graph re-walk**: only triggered on a hit event (a node's `alive` changes), a plain reachability
   check on a small graph (tens of nodes) — negligible cost, and never needs to run on ticks with no new
   damage.
5. **Damage control**: a per-ship work-rate budget (crew/pumps assigned) reduces open-opening `areaM2` toward
   zero (patching/shoring) and/or actively removes volume (pumping) at a fixed rate; counter-flooding is an
   explicit action that adds `fillFraction` to a chosen intact compartment on the opposite side, trading
   buoyancy for uprightness exactly as in §2/Rule the Waves.

### Determinism and cost

- All flooding math is a pure function of `(current fillFraction, opening area/depth, dt)` — no RNG in the
  per-tick integration, matching the project's existing rule that render/sim state is a pure function of time
  and seeded inputs; the only randomness is at the *hit* event (which compartment, hole size, whether a system
  node is knocked out), which can reuse the sim's existing seeded RNG (`game/src/sim/rand.js`).
- Fixed, small compartment/system counts per ship (~8–15 compartments, ~10–20 system nodes) keep this
  O(ships × ~20) per tick, in line with the rest of `sim.js`'s per-tick budget; no per-frame allocation is
  needed if compartments/openings are preallocated arrays per ship (same pattern as `damage.js`/`bodies.js`).
- Expose `Cd`, permeability-by-compartment-kind, free-surface-penalty coefficient, and damage-control work
  rates as named constants (alongside the existing blast/damage constants) so flooding pacing is a tuning
  pass, not a code change — the UA:D lesson from §1 is that this curve gets adjusted often and should be cheap
  to retune.
