# DDG-51 Flight IIA: structural model for the blast bench

`burke_structure.js` describes the whole Arleigh Burke as structure: hull shell, decks, watertight bulkheads,
longitudinal bulkheads, deckhouses, plating thickness and steel grade, stiffening, and the compartments these
enclose. It is plain data (it imports nothing and runs in Node or the browser, about 0.6 s to build). The bench
builds its lattice from it. `burke_view.html` shows it so the structure can be checked by eye.

Figures marked *est.* are not public; they are our estimates, set from the general practice for steel surface
combatants of this size. The subdivision is laid out to fit the game model's equipment (its engine rooms, VLS, gun
and hangar positions), not the real ship's drawings.

## Frame and hull form

- Ship frame: **x forward, y up, z starboard**, origin midships (half the length overall) on the design waterline
  (y = 0), metres. The game model uses +Z bow, +X starboard: `toModel([x, y, z]) = [z, y, x]`.
- The hull surface **is the game model's**: the deck line (sheer), the deck and waterline half-breadths, the
  knuckle, the flare, the keel line, the section exponents under water (`HD.destroyer` in
  `reference/films/common/hd_sea_air.js`, `underwater()` in `game/src/data/models.js`), the sonar dome, the skeg
  and the bilge keels. So a hit on what the player sees lands on this plating.
- Offsets (`OFFSETS`): every frame, 25 points from the keel to the deck edge, plus keel, deck height and the deck
  and waterline half-breadths.

| | This model (= game model) | DDG-51 Flight IIA, public |
|---|---|---|
| Length overall | 155.2 m | 155.3 m |
| Length on the waterline | **148.2 m** | ~142 m |
| Beam, deck / waterline | 20.0 / 18.0 m | 20.1 / ~18 m |
| Depth amidships | 12.8 m | ~12.8 m |
| Draught, hull / sonar dome | 6.3 / 8.85 m | ~6.3 / 9.4 m (navigational) |
| Displacement from the hull form | **10,670 t** | ~9,300–9,700 t full load |

The game hull carries its waterline 6 m further than the real ship (a short bow overhang and an immersed transom),
which also makes its displacement about 10 % high. That is the game model's shape; it is kept here so the
structure matches the picture.

## Frames, decks, subdivision

- **Frames**: transverse frames every **2.44 m (8 ft)** (*est.*; the bench used 2.5 m). Frame k sits at
  x = 70.6 − 2.44 k, numbered aft from the forward perpendicular (the stem at the waterline, x = 70.6).
  Web frames at every frame; longitudinals between them (below).
- **Decks** (height above the waterline):

| Deck | y (m) | Where |
|---|---|---|
| Main (1st) deck, strength deck | 5.4 aft → 6.5 amidships → 10.3 at the bow (sheer) | full length; flight deck aft of x −53 |
| Forecastle platform | 6.8 | forward of the collision bulkhead |
| 2nd deck (damage control deck) | 3.9 | forward of frame 47 |
| 3rd deck | 1.2 | outside the machinery spaces |
| 4th deck / 1st platform | −1.6 | outside the machinery spaces |
| Forward VLS floor | −0.4 | inside the forward enclosure |
| Inner bottom (tank top) | −5.1 | x −39 to +63 (where the bottom is deep enough) |
| Deckhouse: 01 level / 02 / 03 / SPY roof | 10.3 / 13.03 / 15.94 / 19.4 | SPY house (octagonal, walls inclined 8°) |
| Hangar overhead / aft deckhouse roof | 11.4 / 13.2 | aft deckhouse |

- **13 watertight transverse bulkheads** (public descriptions give about a dozen main watertight subdivisions;
  positions here are ours, on frames): fr 3 (collision, x 63.3), 7 (53.5), 11 (43.8), 14 (36.4), 17 (29.1),
  21 (19.4), 25 (9.6), 32 (−7.5), 40 (−27.0), 43 (−34.3), 47 (−44.1), 51 (−53.8), 55 (−63.6). They run from the
  bottom to the main deck. 14 watertight zones.
- **Longitudinal bulkheads**: the two Mk 41 VLS enclosures (sides at z ±4.6 from their floor to the main deck, own
  end walls), the centre vertical keel dividing the double bottom port and starboard, the hangar walls. The
  machinery spaces have none (symmetric flooding), as in US practice.
- **Machinery**: AMR 1 (fr 21–25), MER 1 (fr 25–32), MER 2 (fr 32–40) run from the inner bottom to the 2nd deck;
  AMR 2 sits under the aft VLS. The aft VLS enclosure reaches 1.4 m forward over the end of MER 2 (the game
  model's launcher sits there); frame 40 is cut round it.
- **Deckhouses** (steel, as on the real ship): the main-deck-level house forward (x 1.5–35.5, split at fr 21) with
  the SPY house on it (three levels, the four array faces are its chamfered walls), the midships house with the two
  uptake casings (open at the top: `open: true`, a vent path), the aft house with twin hangars, a centre passage,
  wing passages, a forward space and the space over the hangars. Hangar doors are marked `door: true` (3.2 mm).
  Masts, the mast house and small pedestals are left out.

83 compartments (65 in the hull, 2 VLS enclosures, 15 in the deckhouses, the flooded sonar dome), plus `AIR` and
`SEA`. Each has an id, a name, a US Navy style compartment number (deck–frame–position–use, approximate), its volume,
boundary area and bounding box. Some:

| Space | Number | Volume m³ | x | y |
|---|---|---|---|---|
| Main engine room 1 | 5-25-0-E | 2,782 | −7.3 … 9.5 | −4.9 … 3.9 |
| Main engine room 2 | 5-32-0-E | 3,112 | −26.8 … −7.6 | −4.9 … 3.9 |
| Auxiliary machinery room 1 | 5-21-0-E | 1,576 | 9.8 … 19.2 | −4.9 … 3.9 |
| Mk 41 VLS enclosure · forward (32 cells) | 4-12-0-M | 345 | 36.6 … 41.2 | −0.4 … 7.4 |
| Mk 41 VLS enclosure · aft (64 cells) | 4-39-0-M | 616 | −34.1 … −25.9 | −1.6 … 6.1 |
| Gun magazine (lower / upper) · loading room | 5-7-0-M · 4-7-0-M · 3-7-0-M | 302 · 272 · 299 | 43.9 … 53.4 | −4.9 … 3.9 |
| Hangar · port / starboard | 1-44-2-Q / 1-44-1-Q | 619 each | −52.7 … −36.6 | 5.9 … 11.4 |
| Steering gear room | 3-55-0-Q | 1,046 | −77.4 … −63.7 | 1.4 … 5.4 |

## Plating, steel, stiffening (*est.*)

| Region | Midbody (0.5 L) | Ends |
|---|---|---|
| Keel strake (1.8 m wide) | HY-80 19.1 | HY-80 15.9 |
| Bottom | HSLA-80 12.7 | HSLA-80 11.1 (12.7 under the bow) |
| Bilge (inner bottom to 4th deck) | HSLA-80 11.1 | HSLA-80 9.5 |
| Waterline belt (4th to 3rd deck) | HSLA-80 12.7 | HSLA-80 9.5 |
| Side (3rd deck to sheer strake) | HSLA-80 9.5 | HTS 7.9 (HSLA-80 11.1 in the bow flare) |
| Sheer strake (1.8 m below the deck edge) | HY-80 19.1 | HSLA-80 12.7 |
| Main deck stringer (1.5 m inboard) / main deck | HY-80 19.1 / HSLA-80 12.7 | HSLA-80 12.7 / 9.5; flight deck 9.5 |
| 2nd deck · 3rd, 4th decks, platforms · inner bottom | HTS 7.9 · OS 6.4 · HTS 9.5 | same |
| Watertight bulkheads | HTS 9.5 below the 3rd deck, 7.9 above; machinery bulkheads 9.5; collision HSLA-80 11.1 / 9.5 | |
| VLS enclosures · centre vertical keel | HSLA-80 9.5, floor 12.7 · HSLA-80 12.7 | |
| Deckhouse walls · SPY house walls · roofs · inner decks | HSLA-80 7.9 · 9.5 · 7.9 · 6.4 | |
| Hangar walls, stack casings · hangar doors | HTS 6.4 · 3.2 | |

Steel grades (`MATS`, with the bench's material key): HY-80 and HSLA-80, 552 MPa yield (80 ksi); HTS, 324 MPa
(47 ksi); OS (mild), 235 MPa. HSLA-80 is the weldable replacement for HY-80 used across US surface combatants of
this period; HY-80 is kept for the heaviest strakes. The bench's `MATS` needs an `hts` entry. The sonar dome window
is steel-reinforced rubber, not structure.

Stiffening per panel: `stiff` (the close stiffeners: direction in the plate, spacing, section) and `frame` (the
heavy members across them). Shell: longitudinals at 0.61 m (bottom, bilge, belt) and 0.76 m (side, sheer), T 8×4
and T 6×4; web frames T 18 in at every frame. Decks: longitudinals 0.61 m, beams at every frame. Bulkheads:
vertical stiffeners 0.61 m (the decks are their girders). Deckhouse: 0.61 m stiffeners, beams at half frames.
Sections (`SECS`) give web, flange and area.

Totals: 21,657 m² of plating (shell 5,503, decks 8,122, bulkheads 2,252, VLS enclosures 352, deckhouses 5,100),
1,588 t of plate and ~695 t of stiffeners and frames. Not included: brackets, pillars, deck girders, foundations,
non-watertight partitions, the mast, and the ~70 t of Kevlar spall liners the ship is publicly said to carry.

## The data

```js
import BURKE, { compAt, halfBreadth, deckY, toModel } from './burke_structure.js';
BURKE.PANELS   // 2,130 panels
BURKE.COMPS    // compartments: { idx, id, name, kind, navy, vol, area, closure, box, tank }
```

A panel is `{ kind, part, poly | strip, n, ax, area, c, t, mat, stiff, frame, sides, wet, open, door }`:

- `poly`: a planar polygon wound so its normal is `n`. 974 of them; 373 lie in an axis plane (`ax` 0/1/2 for
  x/y/z), the rest are the sheered main deck, the inclined deckhouse and SPY walls, the stacks and the dome.
- `strip: [a, b]`: the curved shell between two frame stations, two polylines with the same point count (quads
  `a[k] a[k+1] b[k+1] b[k]`); 1,156 of them. Strips break at every deck that meets the shell, at the keel strake
  edge, the waterline and the sheer strake, so each has one space inside and one plating.
- `sides: [on +n, on −n]`: compartment indices. The shell's normal points outboard (`[AIR|SEA|DOME, inside]`);
  `wet` when the sea is on one side.
- `kind`: shell, deck, bulkhead, enclosure, girder, house, appendage (skeg, bilge keels: sea both sides), dome.

`compAt(x, y, z)` is the partition itself (use it to label lattice nodes); `halfBreadth(x, y)` the hull.

**Checks** (`STATS`, `CHECK`): the boundary panels of each compartment close to within 0.3 % of its area
(|Σ n dA| / Σ dA), except five small bottom tanks where the inner bottom meets the rising bottom or the dome
(≤ 2.2 %) and the flooded dome (1.4 %). Volumes come from the panels (divergence theorem) and agree with a
0.3 × 0.25 × 0.25 m voxel count within the voxels' error. No piece holds two spaces on a side (`CHECK.mixed` is
empty). 35,189 m³ enclosed.

## Viewer

`burke_view.html` (served by `tools/serve_game.py`): the plating as dots and hairlines. Colour by structure,
thickness, steel grade, or one compartment (pick from the list); cut along x; iso, profile, plan and section views;
toggle shell, decks, bulkheads, deckhouse, wire. `?view=section&cut=2&clean=1&still=name` saves
`game/shots/name.png`. Stills from this build: `game/shots/burke_iso.png`, `burke_profile.png`,
`burke_plan_thick.png`, `burke_section_mer1.png`, `burke_section_vlsf.png`, `burke_cut_iso.png`,
`burke_sel_vls.png`.

## Sources

Public: principal dimensions (Navy fact file, Jane's-type references), the all-steel deckhouse, the Kevlar liners,
the four fixed SPY-1D faces on the deckhouse, the Mk 41 installations (32 cells forward, 64 aft), two main engine
rooms with two LM2500 each; US Navy compartment numbering and steel specifications (HY-80 MIL-S-16216, HSLA-80
MIL-S-24645, HTS MIL-S-22698). Everything else (frame spacing, bulkhead positions, deck heights, thicknesses,
stiffener sizes) is estimated as above.
