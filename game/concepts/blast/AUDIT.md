# Blast bench audit (independent verification, 2026-09-26)

Scope: the structural model of the blast bench (`blast.js`, `gpu.js`): steel ship plating under blast loading.
The audit started on the lattice model (v22, 1596bde). While it ran, the physics agent replaced that model with a
shell finite-element model (446c6a3 v30 ... ca26a00 v32). The suite was rebuilt for the new model, and the final run
is on ca26a00 (bench v32), box, clamped-plate and Burke scenes.

- Part A: the current model (v32): findings from reading the code and from the suite, and the suite's final results.
- Part B: the audit of the lattice model (v22) that led to the rewrite, with the status of each finding in v32.

Suite: `verify.html` + `verify.js` (http://127.0.0.1:8771/game/concepts/blast/verify.html; `?quick=1` skips the
slow checks, `?only=energy,nurick` runs a subset; results in `window.VERIFY.results`; a full run takes ~1.5 h, most
of it the 0.0625 m grid and the Burke). It loads the bench's own blast.js/gpu.js (only the relative gpu.js import is
made absolute and a read-only accessor appended: the same arrays as `BLAST.model()` plus the step functions and the
per-step load array FL), stubs the render loop, runs every case headless like `runCase`, and finds everything
scene-specific from the model's arrays, so the same checks run on the box, the clamped plate and the Burke. The CPU
reference is 15-30 ms a step at 0.25 m, so CPU checks use the loading window (3-6 ms) and full runs are on the GPU.

# Part A: the shell model (v32, ca26a00)

## In short

- The rewrite fixes what made steel look brittle and plating look pristine. Internal forces sum to zero (5e-8 N
  against 26 MN of load), the bench's energy ledger closes to 0.1-0.6 % while plating deforms and agrees with an
  independent count of the loads' work and the kinetic energy, tearing is strain-driven (GL) instead of a 37 m/s
  trigger, holes petal, products flow into the compartment behind a hole, a dished clamped plate keeps 93 % of its
  peak (the lattice kept 37-47 %), and GPU = CPU (0.0003-0.04 % on the field, same torn cells) now that the v30 hinge
  bug is fixed.
- Two things bias the damage numbers most: grid convergence and spurious tearing at the deck/side seam where frames
  end (A1, A1b). Grid: the side panel's dish grows 112 / 146 / 190 mm and the contact hole
  3.8 / 4.9 / 9.4 m^2 from 0.25 to 0.125 to 0.0625 m. 0.125 m is not converged for either (A1).
- Near contact the energy split still moves with the time step (-4.2 % unexplained and plastic 13.3 % of the input
  at dt; -2.0 % and 10.9 % at dt/2) (A2).
- The clamped 2.5 x 0.75 m, 6 mm mild plate dishes 70-100 % of Nurick-Martin in the plastic range (phi 17-25): inside
  the fit's +-30 % from phi 20, 30 % short at phi 17 (A3). Tearing starts between phi 47 and 68 (A4).
- The user's cases: 1200 kg contact on the box tears the side and blows the second deck behind it away; 5000 kg
  leaves nothing within 8.5 m pristine (0.6 %). Burke: 120 kg inside main engine room 1 moves all 80 bounding panels
  (decks and WT bulkheads 0.5-0.7 m); a deckhouse hit dents the structure behind; a waterline contact barely holes
  the belt and 5000 kg leaves 4.1 % of the plating within 8.5 m under 2h, because nothing below the waterline is
  loaded (A8).

## Findings, ranked

### A1. Not grid-converged at 0.125 m (high)
Box, GPU. Panel centre dish, 120 kg at 5 m: 111.7 / 146.0 / 190.0 mm at 0.25 / 0.125 / 0.0625 m (+23 %, +30 %).
Contact hole, 120 kg: 3.81 / 4.86 / 9.43 m^2 (0.0625 m tears twice as much). BENCH.md's own grid study covers a
0.3 m lab plate at 12-48 cells across (converged) and the box only at 0.25 vs 0.125; the side panel is 0.75 m wide,
so 0.125 m puts 6 cells across it, too few to resolve its dish, and near contact the loaded spot and the erosion
front are cell-sized. Numbers from the default grid are low on dishing and on hole size. Options: a finer grid
(0.0625 m costs ~20x: dt 0.85 us instead of 3.4 us, set by the frames' Euler-Bernoulli bending at grid scale, plus
4x the cells), a Timoshenko member (BENCH.md already names it) to lift dt, or local refinement around the hit;
and a calibration of the GL constants per grid for near-contact loading, which GL was not made for.

### A1b. Decks tear at the side seam, at every frame, under far hits (high)
120 kg at 8 m (Z = 1.6; the side dishes ~0.1 m) tears 37 cells (0.58 m^2), all of them second-deck cells at the
side junction (z = 0 to -0.13 m, y = 3.5 m) on the frame lines x = -7.5, -5, -2.5, 0, 2.5, 10: the side frames end on
the deck edge (member ends are pinned at plate edges, BENCH.md) and pull on single deck cells, whose strain passes
the GL limit. The same seam tearing runs the length of the section in the contact cases (it is why 90 % of the torn
side plating lies within ~11 m of a 1200 kg charge although only ~40 m^2 is torn) and it opens vents along the
seam. Real frames end in brackets that spread the load over the deck; model the connection (a bracket element or
the member's end load spread over the cells it lands on), or exclude junction cells from single-cell erosion.

### A2. Energy split not converged near contact (medium)
120 kg contact, first 4 ms, CPU 0.25 m: unexplained -4.2 % of the loads' work at dt, -2.0 % at dt/2; plastic work
13.3 % -> 10.9 % of the input (hinges 7.0 -> 5.4 %, membrane 6.3 -> 5.4 %). Displacements agree between the two
steps (field 0.03 mm), so it is the dissipation at very large strain increments per step: strain rates of 1e3-1e4 /s
near the charge, the rate factor taken from the start-of-step rate and capped at 1e4 /s, and (BENCH.md) the Biot
strain / Cauchy-like stress pair that is not exactly hyperelastic at large strain. The 30 kg and Hellfire cases
close to 0.1-0.6 % and don't move with dt. Suggest the Cowper-Symonds factor at the step's mid rate and sub-stepped
returns when the plastic increment per step exceeds a few yield strains; keep the dt/2 ledger as the gate.

### A3. Clamped plate 70-100 % of Nurick-Martin (medium-low)
Bench plate scene (2.5 x 0.75 m, 6 mm mild steel, clamped), impulse on the plate measured on the CPU (edge nodes
half-weighted), dish on the GPU at 0.125 m: phi 16.9 -> 35 mm vs 50 (70 %), phi 20.4 -> 44 vs 60 (73 %), phi 22.4 -> 66
vs 66 (100 %), phi 25.0 -> 57 vs 74 (77 %). Below Er = 10 (kinetic energy given / elastic capacity) the plate is
largely elastic and not judged. BENCH.md explains the ship-scale shortfall by the pulse not being impulsive; A1
(6 cells across the 0.75 m width) is a second cause, and the rate law a third (Cowper-Symonds for mild steel roughly
doubles yield at ~100 /s, while Nurick-Martin's phi uses static yield and already contains the rate effect of the
tested plates). A convergence study of this scene at 0.0625 m would separate them.

### A4. Tearing onset (low, needs data)
Clamped plate, 2 m standoff: no torn cell at phi 47 (dish 19 h), 88 cells at phi 68. BENCH.md puts the onset near
phi 35 (1.5 m standoff). The suite only checks a floor (phi >= 20); `game/research/plate_validation.csv` has no
tearing points yet. Add mode II onset data and make this a real pass/fail; mind A1 (erosion is grid-sensitive).

### A5. Hidden element deletion and force switches (medium)
- `jmin < .25`: a cell whose smallest triangle keeps under 25 % of its area erodes (cellPass; GPU CELL_FS), and
  `F22 = max(p3y / P3y, .05)` clamps the transverse stretch. This deletes cells that are crushed or folded, not
  failed in tension. It shows in the runs: in the 0.0625 m contact case cells were still eroding at 0.19 s (debris
  folding in flight), which kept the run from relaxing until T1 (A6).
- A hinge whose flap lever is under 0.2 d (`hmin`) contributes no force and its stored energy leaves the ledger
  unbooked; it comes back with its old plastic rotation when the lever grows.
- Rates are capped at 1e4 /s in the Cowper-Symonds factor.
- The member line-angle term is not exactly rotation-free: the internal torque sums to 293 N m in the 30 kg case
  (it was 0.3 N m before that term; negligible physically, but it shows the term uses a fixed frame).

### A6. The end of a run (medium)
Relax (250 /s global damping) starts once the loads are quiet and the kinetic energy is under 5 % of its peak, or
at tMin + 0.1 s, and lasts at most 25 ms. In the 30 kg at 2 m whole run (CPU, cut at 147 ms) damping took 36 % of the
loads' work and plastic work 49 %; most of the damping is the stiffness-proportional term eating the elastic ringing
of the whole section, which has to go somewhere, but check that plastic work has stopped before relax. Any cell
eroding restarts the 5 ms "quiet" clock, so flying debris that keeps eroding (A5) holds the run to T1. Debris is
only found in `settle`. Interactive runs (async reads) end at a step that depends on when GPU fences complete, so
they are not reproducible; `runCase` (headless) is.

### A7. Line of sight (medium on the Burke)
Visibility is traced once at detonation on the rest geometry and only for an outside charge (and its sea image).
Inside charges and hole sources load every cell of their compartment as if in view (compartments are treated as
convex boxes, BENCH.md), including cells shadowed by machinery, enclosure walls or other decks' edges.

### A8. Nothing below the waterline is loaded by an air or contact burst (medium on the Burke)
`detonate`: `if (CWET[c] >= 0) continue` - wet cells never get line of sight, and water is only a radiation
pressure on moving plating. A contact charge at the waterline (the Burke case below, 0.3 m above it) loads only the
dry half of the hull around it; the underwater half of the charge would drive a water shock into the hull, which is
stronger than the air shock at the same distance. The Burke waterline case therefore tears little (see results).

### A9. Loads (low-medium)
Kinney-Graham air shock, ad hoc reflected impulse is (Pr/Ps)^0.75, ideal-gas reflection, cos^2 obliquity without a
Mach stem; spherical charges only; products stagnate. Secondary sources are clustered points, two generations,
first-order images only, and the list is capped (10 holes per generation, 32 sources). BENCH.md lists these.

### A10. Boundaries and the Burke patch (low)
Open edges are isotropic anchors (the in-plane continuation stiffness also out of plane) with Lysmer dashpots. On
the Burke only a patch is simulated (x within 4 + 2 W^(1/3) m of the hit, out to the next WT bulkhead); beyond it the
ship is rigid and pristine by construction, and there is no hull-girder response.

### A11. Cost (information)
GPU 0.125 m box runs: 14-21 s (dish, contact); 0.0625 m: 270-450 s; Burke at 0.125 m: see results. The CPU reference
is 15-30 ms a step at 0.25 m; a full reference run takes minutes to hours, so parity is checked over the loading
window.

### A12. The game module (for whoever owns game/src/blast)

`game/src/blast` (2bda277) carries the shell solver re-ported from ca26a00, but the lattice (1596bde, Part B) is
still its default because the shell costs ~7x the GPU time per hit, so in the game the v22 findings still apply.
Its patch around a hit (`spec.js:60`) spans Rp = clamp(2.5 W^(1/3), 3, 10 or 14) m along the hull, 0.75 Rp up/down
(clipped at the draught), at most 6 m inboard, three inner decks and one bulkhead, with a fixed boundary: plating
beyond it is never simulated and stays pristine by construction, and the clamped patch edge acts as a rigid
support. Together with the lattice's velocity tear-out (Part B, 3) that is a likely source of "a 5000 kg charge
leaves nearby plating pristine" in the game.

## Final suite results (bench v32, ca26a00; full run, GPU at 0.125 m and box scene unless stated)

Wall times on the RX 9070 XT with other agents' work running.

| Check | Result | Numbers |
|---|---|---|
| bench loads | PASS | 86 633 nodes, 86 400 cells, 173 752 hinges, 14 424 member elements; dt 3.42 us; mass added for the step 6e-8 % |
| reruns, GPU and CPU (headless) | PASS | identical to the bit (interactive runs are not: A6) |
| energy, loading window, CPU 0.25 m: 30 kg @ 2 m, Hellfire contact, both at dt and dt/2 | PASS | ledger closes to 0.1-0.6 %; the independent count of the loads' work and of the (leapfrog) kinetic energy match the ledger exactly |
| energy, 120 kg contact, first 4 ms | FAIL at dt, PASS at dt/2 | unexplained -4.2 % / -2.0 %; plastic work 13.3 % / 10.9 % of the input (A2) |
| energy, 30 kg @ 2 m, whole run (CPU, cut at 147 ms) | FAIL (flag) | closes (-1.3 %); damping 36.2 % of the input, plastic 49.1 %, elastic 4.7 % (A6) |
| internal force sum (both cases) | PASS | 5e-8 N against 26 MN and 740 MN of load |
| internal torque, 30 kg @ 2 m / 120 kg contact | FAIL / PASS | 293 N m / 5.5 kN m (threshold 1e-5 N m per N of load); tiny, from the member line-angle term (A5) |
| mirror symmetry, early: GPU 0.125, CPU 0.25, tearing | PASS | 0.027 %, 0.004 %, 0.067 % |
| mirror symmetry, final | INFO | 0.73 % (the box is not mirror-symmetric about the panel) |
| dt vs dt/2: CPU windows; GPU 30 kg @ 2 m; GPU 120 kg contact | PASS | fields within 0.1 %; contact torn 4.86 / 4.73 m^2 |
| mesh, 120 kg @ 5 m, side panel centre | FAIL | 111.7 / 146.0 / 190.0 mm at 0.25 / 0.125 / 0.0625 m (A1) |
| mesh, 120 kg contact, torn area | FAIL | 3.81 / 4.86 / 9.43 m^2 (A1) |
| GPU vs CPU (0.25 m, 3-5 ms): 30 kg @ 2 m, Hellfire, 120 kg contact, 120 kg inside | PASS | fields within 0.0003-0.04 %; same torn area (inside: 4 cells differ, same total) |
| GPU vs CPU: Oniks with casing and fragments | FAIL | field 0.02 %, but torn 1.50 vs 1.25 m^2 (4 cells): the fragment-damage path differs slightly |
| Nurick-Martin, clamped 6 mm mild plate, phi 16.9 / 20.4 / 22.4 / 25.0 | FAIL / PASS / PASS / PASS | dish 35 / 44 / 66 / 57 mm vs 50 / 60 / 66 / 74 mm (A3) |
| Nurick-Martin, phi 7.9 and 11.9 (Er < 10) | INFO | largely elastic: 8 and 6 mm |
| tearing onset, clamped plate | PASS (floor) | none at phi 47.1 (dish 19 h); 88 cells at phi 67.7 (A4) |
| springback, clamped plate | PASS | keeps 93 % (47 -> 44 mm) |
| springback, box side 120 kg @ 3 m | INFO | keeps 67 % (214 -> 143 mm; includes the elastic swing of the stiffened side) |
| monotonic: charge @ 3 m | PASS | torn 0.02 / 0.69 / 9.6 / 79 m^2 for 30 / 120 / 500 / 2000 kg |
| monotonic: contact | PASS | 0.13 / 0.75 / 4.9 / 108 / 217 m^2 for 5 / 30 / 120 / 500 / 1200 kg |
| monotonic: standoff, 120 kg | PASS | 0.50 / 0.91 / 0.88 / 2.14 m^2 at 8 / 4 / 2 / 1 m (4 m and 2 m equal within 2 cells; note 8 m tears at all) |
| monotonic: side thickness, 120 kg contact | PASS | 21.4 / 4.9 / 2.0 / 1.2 m^2 for 6 / 10 / 16 / 25 mm |
| 1200 kg contact: structure behind | PASS | hull torn 39.7 m^2; all 443 nodes of the second deck within 2.5 m torn and blown away; 369 kPa of products in the struck space at 4 ms (CPU), ~30 kPa in the neighbours at the end |
| 1200 kg contact: petals | FAIL (loose share) | 61 % of the torn side thrown loose (criterion <= 50 %), rim moved up to 1.9 m, intact ring 1 m outside the hole: 89 % set > 5h |
| 1200 kg: load reaches the structure behind (CPU) | PASS | 106 / 106 nodes loaded |
| 5000 kg contact: structure behind | PASS | hull torn 63.5 m^2; second deck behind blown away |
| 5000 kg contact: nothing pristine within 8.5 m | PASS | 154 of 24 919 nodes under 2h (0.6 %, all on the side); 94 % of the region torn |
| 5000 kg contact: petals | FAIL (loose share) | 82 % thrown loose, rim up to 15.9 m, ring 86 % > 5h |
| Burke, 1200 kg contact amidships at the waterline (aim 0.3 m above it) | PASS | 30 nodes of other plating within 3 m behind, all set > 50 mm; hole radius 1.6 m, all of it thrown loose; small because nothing below the waterline is loaded (A8); 254 s |
| Burke, 120 kg contact on the forward deckhouse side | PASS | 1943 nodes within 3 m behind: 16 torn, 1380 set > 50 mm, 547 under; hole 2.1 m, 48 % loose, rim up to 0.9 m; 168 s |
| Burke, 120 kg inside main engine room 1 | PASS | all 80 bounding panels respond: inner bottom up to 0.70 m, 2nd deck 0.54 m, WT bulkheads fr 25 / fr 32 0.62 / 0.69 m, shell 0.03-0.24 m; a few cells torn in the decks and bulkheads; 133 s |
| Burke, 5000 kg contact amidships | PASS (barely) | within 8.5 m: 28 399 nodes, 16 157 torn (13 783 loose), 1153 (4.1 %) under 2h, most likely the underwater plating (A8); 312 s |

Totals: 37 pass, 9 fail, 4 info. The fails: energy near contact at the default step (A2), the whole-run damping
share (A6), the member torque (A5), grid convergence x2 (A1), GPU-CPU torn area with fragments (4 cells), Nurick at
phi 16.9 (A3), and the petal loose-share heuristic at 1200 and 5000 kg (61 % and 82 % of the torn side thrown loose).

# Part B: the lattice model (v22, 1596bde), superseded

This is the audit that led to the rewrite, kept for the record. Line numbers refer to 1596bde. The suite version that
produced these numbers is verify.js at 99ad039.

## Status of each v22 finding in the shell model (v32)

| # | v22 finding | v32 |
|---|---|---|
| 1 | one-sided Laplacian "bending" (momentum, energy, 1/S^2 stiffening, springback) | replaced by dihedral hinges with exact gradients: internal forces sum to 7e-8 N, a clamped plate keeps 91 % of its peak dish. Fixed |
| 2 | frames/stiffeners as springs to world anchors | members (axial elements + composite tee bending on the hinges they cross); world anchors only at open section edges. Fixed |
| 3 | tear-out at 37 m/s | GL ductile erosion (plus the distortion deletion of A5): first tearing at phi 47-68 on the clamped plate. Fixed (see A4) |
| 4 | perfect plasticity, no rate, fixed fracture strain | J2 with hardening and Cowper-Symonds, GL mesh-regularised fracture strain. Fixed (rate law, A3) |
| 5 | compression cap at 12 % yield with set | continuum J2, buckling through the hinges and built-in imperfections. Fixed |
| 6 | 30-45 % of the energy to artificial damping | stiffness-proportional damping 0.4-10 % during loading; global damping only in the end relax (31 %, A6). Mostly fixed |
| 7 | an outside charge sends no gas inside | products let in through outside openings (366 kPa in the struck space at 4 ms, 1200 kg contact). Fixed |
| 8 | scripted cracks | removed; cracks are erosion paths. Fixed |
| 9 | a cell torn when any of its bonds breaks | cells erode whole; vent area = eroded area. Fixed |
| 10 | GPU and CPU run different models | same passes; the v30 hinge-yield bug (found by the parity check and by the physics agent) fixed in 5916518; parity 0.0003-0.04 % |
| 11 | line of sight stale / every 8 steps | traced once on the rest geometry, outside charges only (A7). Partly |
| 12 | shock load (Kinney-Graham, ad hoc reflection) | unchanged, products near field added (A9). Open |
| 13 | seam and edge nodes load | loads per cell on the current area vector. Fixed |
| 14 | x64 mass scaling | gone; selective mass scaling of the stiffest 0.2 % of nodes (reported in the load check). Fixed |
| 15 | fragments only in the render loop | fragments stepped in the sync, deterministic. Fixed |
| 16 | GPU objects leaked, runCase mutated st | `dispose()`, runCase restores st. Fixed |

## v22: what the numbers said

- The plate itself absorbs almost none of the blast energy. Energy ledger (CPU reference, 0.25 m): of the work the
  loads do, plate bonds take 0.5-5 %, the frame/stiffener ties (springs to fixed world anchors) take 40-56 %,
  artificial damping (global velocity damping, bending dashpot, bond dashpots) takes 30-45 %, and the bending
  operator creates or destroys another 5-12 % (it is not conservative).
- Panels between stiffeners do not dish. For 120 kg at 3 m the panel centre and its four edges all move 58-61 mm:
  the whole grillage translates, relative dishing is 0-1 mm where Nurick-Martin predicts ~44 mm. BENCH.md's
  Nurick table compares the largest side displacement (grillage translation) with panel dishing.
- Dished plating springs most of the way back: the panel centre keeps 37 % (GPU 0.125) / 47 % (CPU 0.25) of its
  peak displacement. With the bending operator switched off it keeps 91 %. Real thin plating dished 7h keeps ~95 %.
- Plating tears out at a velocity, not a strain: 36.7 m/s for 10 mm HSLA. A near-uniformly loaded panel tears out at
  phi = 9.7 (delta/h ~ 4.9); the bench's own readout puts tearing at phi > 28, and clamped steel plates in tests dish
  to roughly 10-15 h before tearing. So plating is either gone or barely dented: the "brittle" look.
- Holes are cut out, not petalled: of the torn side plating 79 % (1200 kg contact) and 87 % (5000 kg) is thrown
  loose as free pieces; the plating left attached at the rim moves at most 0.37-0.39 m around holes of 4.1 m and
  7.6 m radius. The deck behind the 1200 kg hole is torn (438 of 441 nodes within 2.5 m) but 400 of them are thrown
  loose: holed, not bent.
- The dish shrinks as the grid is refined (120 kg at 5 m: 59 / 24 / 22 mm at 0.25 / 0.125 / 0.0625; 30 kg at 2 m:
  25 / 10.5 / 6.6 mm): the bending term stiffens with 1/S^2 (finding 1).
- Solver numerics are fine: dt vs dt/2 identical (< 1 %), early-time mirror symmetry exact (5e-6), reruns identical,
  GPU matches CPU exactly when diffraction is off. The problems are in the model, not the integration.
- Mass scaling is not harmless: the 120 kg inside case tears 67 m^2 unscaled vs 53 m^2 at x16 / x64 (side 13.8 vs
  7.2 m^2); x16 and x64 agree with each other, not with x1.

## v22 findings, ranked

### 1. The "plastic bending" term is a one-sided Laplacian spring (high)
`blast.js:138-156` (setup), `451-463` (explicit), `545-557` (XPBD); `gpu.js:104-119`.
- What it does: `F_i = KB (mean of in-plane neighbours - x_i - UB_i)`, applied to node i only, KB = 48 D / S^2,
  capped at KBY = 4 sy h^2 per node, plus a dashpot `KBC (v_mean - v_i)` (25 % critical), also one-sided.
- Why it is wrong:
  - No reaction on the neighbours: internal forces don't sum to zero. Suite: peak net internal force 752 kN,
    net torque 4000 kN m (30 kg at 2 m); bonds alone sum to zero.
  - Not the gradient of an energy: it creates or destroys 5-12 % of the input energy (ledger).
  - Wrong operator and wrong scaling. The umbrella vector is (S^2/4) Lap(w), so the force per node is
    12 D Lap(w) and the equivalent pressure 12 D Lap(w) / S^2: a membrane tension T = 12 D / S^2, which grows 4x per
    grid halving (3.6, 14.6, 58 MN/m at 0.25/0.125/0.0625 m for 10 mm steel, against the plate's own yield
    membrane force sy h = 5.5 MN/m). Real bending is D Lap^2(w), independent of S. At 0.125 m a 50 mm dish over a
    0.75 m panel gets ~160 kN of restoring force per node, ~40x real bending, still under the 220 kN cap.
  - The cap is almost never reached (bending plastic dissipation 0.0 % in the ledger), so the term stays elastic
    and pushes dished plating back flat after the pulse (springback above). The header comment says 16 D/S^2, the
    code uses 48.
  - It switches off completely at any node with one broken neighbour bond (`n === UNB[i+1]-UNB[i]`), so hole rims
    and petals have no bending stiffness and absorb no bending work (in real petalling most of the energy goes into
    bending the petals back).
- Bias: stiffer plating that springs back flat (pristine look), grid-dependent (finer = stiffer; BENCH.md's
  68 -> 47 mm dish from 0.25 to 0.125 m is this), limp petals, spurious momentum.
- Fix: make it the gradient of the discrete bending energy E = 1/2 k sum_i |L_i|^2 (L_i = mean_j x_j - x_i - UB_i):
  the force on node m is k L_m - sum over neighbours i of (k / n_i) L_i, i.e. each node also pushes each of its
  neighbours with -F_i / n_i. That is the discrete biharmonic: pressure ~ k S^2/16 Lap^2(w), so k = 16 D / S^2 gives
  D Lap^2(w) at every grid; momentum and energy are conserved. For plasticity, cap the moment per hinge (Mp = sy h^2/4
  per unit length times the hinge length S) rather than a per-node force; or switch to dihedral-angle hinges on each
  interior cell edge (standard discrete-shell bending) with that cap. Keep the hinges that remain when a neighbour
  bond breaks. Make the dashpot two-sided the same way.
- Tried from the suite (CPU reference, 120 kg at 3 m, panel centre; the missing reactions added to the neighbours
  after each step, KB = 16 D / S^2): permanent set 163 mm at 0.25 m and 165 mm at 0.125 m (grid-independent; now
  59 and 28 mm), and it keeps 86-87 % of its peak (now 47 % / 37 %). The larger set then exposes finding 2: the
  grillage is too weak and translates.

### 2. Frames and stiffeners are springs to fixed world anchors (high)
`blast.js:95-96` (TK, TFY), `442-450`; `gpu.js:100-103`.
- What it does: every frame/longitudinal node is tied to its own rest position with an elastic-perfectly-plastic
  spring (frames 16 kN x S/0.25, longitudinals 5 kN x S/0.25), plus extra bond area along the line. The anchor is the
  world, not the structure.
- Why it is wrong: no beam action (a load on one node is not shared along the member), the member reactions go into
  the ground instead of into the decks and bulkheads that carry them in a ship, and ties never break.
- Measured: ties dissipate 40-56 % of the blast work; the plating bonds 0.5-5 %. The panel between stiffeners does
  not dish relative to its edges (0-1 mm vs Nurick-Martin 17-44 mm in the six Nurick cases): the grillage translates
  as a block, its edges moving as much as its centre. Tie capacities are also low: 5 kN per 0.25 m on a 2.5 m span
  is a collapse moment of ~8 kN m for a longitudinal.
- Bias: decks and bulkheads behind the side get no load through the frames (only through the seam bond and the
  shock through holes); side damage is a uniform push rather than dished panels; results depend on tie numbers
  that are not tied to a section.
- Fix: frames and longitudinals as beams: the axial bonds along the line already exist; add bending (rotational)
  springs along the member with the section's EI and Mp, connected at their ends to the deck/bulkhead nodes; keep
  world anchors only at the section's outer boundary. Size them from real scantlings (the Burke data).

### 3. Tear-out by node velocity at 37 m/s (high)
`blast.js:94` (v_c), `160` (x1.8 frames, x1.25 stiffeners), `474`, `508`, GPU prediction `581-597`; `gpu.js:130`.
- What it does: a node whose accumulated shock impulse per unit plate mass passes v_c = sqrt(2 TEAR_K sy ef / rho)
  (TEAR_K = 0.06: 36.7 m/s for HSLA) loses all its bonds and flies.
- Why it is wrong: it tests velocity, not deformation. A panel moving uniformly at 37 m/s is not stretched at all,
  yet it is cut out. Tearing is driven by strain (membrane stretch at supports, mode II) or by a velocity jump across
  a line (transverse shear, mode III). The threshold sits far below real steel: a near-uniform load tears the panel
  at phi = 9.7, delta/h ~ 4.9 (suite `tearonset`), the bench readout marks tearing at phi > 28, and plates in tests
  dish to ~10-15 h first.
- Bias: the main source of the brittle look. Plating either tears out or stays below ~5 h; the band of heavily
  dished, still-attached plating around a hole is missing. Hole size is set by the load footprint above 37 m/s.
- Fix: drop the velocity test for uniform motion; tear by bond strain (already there) and add transverse shear
  failure only on relative motion between neighbours (e.g. relative normal displacement over a bond > ~h, or a
  velocity jump above a mode III threshold). Calibrate against Nurick-Martin mode I/II thresholds.
- Tried from the suite (CPU reference, 0.25 m, 1200 kg contact, tear-out disabled, everything else as is): the side
  still opens by bond fracture, 5.3 m^2 instead of 13.6, with 2 % of the torn plating thrown loose instead of 68 %
  (petals). But the decks behind then get almost nothing (0.56 / 0.06 / 0 m^2 torn instead of 73 / 81 / 44 without
  diffraction): the only load reaching them is the shock through cells already open when it passes. With a
  strain-driven hole, the product gas of finding 7 becomes the load path the decks need. Single-bond "hinges" also
  let a petal node swing 19 m (no bending across one bond; finding 1).

### 4. Bonds: perfectly plastic, rate-independent, fixed fracture strain (medium-high)
`blast.js:82` (SEF), `428-432`; `gpu.js:35`, `49-50`.
- Elastic-perfectly plastic with no hardening: once a bond yields it carries no more force, so further stretch
  collects in the first bonds to yield instead of spreading (hardening spreads it). Strain localises in one bond
  row and hits the fracture strain early.
- No strain-rate effect (Cowper-Symonds: dynamic yield 1.3-2x for mild steel at blast rates; less for HSLA).
- Fracture strain ef x 0.6 at every grid (0.096 HSLA, 0.12 mild). Mesh-size rules for shells scale it with t/l_e,
  e.g. 0.056 + 0.54 t/l_e: 0.078 / 0.099 / 0.142 for 10 mm at 0.25 / 0.125 / 0.0625 m, and 0.084 for the 6.5 mm
  decks at 0.125 m (the bench uses 0.12 there).
- Fix: linear hardening (E_t ~ 1-2 GPa), optional Cowper-Symonds on fy, SEF from an element-size formula using L0
  and the plate thickness.

### 5. Compression capped at 12 % of yield with permanent set (medium)
`blast.js:432`, `524`; `gpu.js:50`.
- Any compression past 0.12 fy shortens the bond for good. Plate buckling is elastic up to the critical stress (for
  a 0.75 m x 10 mm panel ~0.24 sy) and a buckle does not set without a hinge. With the elastic bending term (1)
  pushing a dish back flat, this cap lets the dish flatten by yielding in compression.
- Fix: compression limit from the panel slenderness, elastic (no set) below the hinge moment.

### 6. Artificial damping takes 30-45 % of the energy (medium-high)
`blast.js:133` (bond dashpots 12 % critical), `155` (bending dashpot 25 % critical, one-sided), `479`
(global velocity damping 30 /s, 250 /s after tLoad on outside hits), `602` (same on GPU).
- Ledger: global velocity damping 10-15 % of the work on attached plating (plus ~37 % taken from flying pieces in
  the Hellfire case), bending dashpot 15-21 %, bond dashpots 0.3-2 %. That energy should end as plastic work.
- 250 /s after tLoad also freezes loose plate in mid-air (terminal velocity g / 250 = 4 cm/s) until settle.
- Fix: no mass-proportional damping during the response; keep a small stiffness-proportional damping for the
  highest lattice modes; end the run on kinetic energy (e.g. < 1 % of its peak) instead of damping it out.

### 7. An outside charge sends no gas inside (medium, user case 1)
`blast.js:261` (`if (cc < 4)`).
- Gas sources are created only when the charge is inside a compartment. A contact charge that blows a 14 m^2 hole
  (1200 kg) leaves all compartments at 0 kPa (suite `user1200`). The detonation products entering through the hole
  pressurise the compartment behind in reality and load the decks and bulkheads there.
- Fix: when the hull opens, feed the compartment behind with the products (quasi-static pressure of W in that
  volume, limited by the hole area and time), and vent it like the internal cases.

### 8. Cracks are scripted, not driven (medium)
`blast.js:325-360` (CPU), GPU `gpu.js:36-48` with setup in `blast.js:581-597`.
- 4-7 radial lines at random angles (seed = 11 + 7p + round(3W)) to 1.4-2.3x the hole radius, through any bond
  stretched past 0.4 % (about 1.5x the yield strain). They cut plating that is barely yielding, far beyond the
  loaded zone; the seed changes with W, so damage is not smooth in W and not mirror-symmetric.
- CPU candidates stop at 6 m (`blast.js:339`), GPU has no limit. GPU crack starts are predicted once at detonation
  from direct line of sight; tear-outs later (behind holes, from gas) never start or grow cracks on the GPU.
- Fix: let a crack advance only where a bond reaches its fracture strain (optionally lowered at a crack tip), no
  preset length or direction.

### 9. A cell counts as torn when any one of its six bonds breaks (medium)
`blast.js:315-317`; `gpu.js:159-170`.
- One broken bond (a crack edge, a single diagonal) opens both neighbouring cells: shock line of sight passes, gas
  vents through the full S^2 per cell, contact ignores the cell, and the torn-area readouts count it. A crack of
  length Lc reads as ~2 S Lc of hole (0.5 m wide at 0.25 m). BENCH.md's hole areas and grid study rely on this
  count.
- Fix: open a cell by the actual gap (distance between its nodes across the broken bonds), vent through that gap;
  report hole area from free nodes / open cells only.

### 10. GPU and CPU no longer run the same model (medium)
- Diffraction (`gpu.js:71-83`, st.diff = 0.5 per hole) exists only on the GPU; the CPU (`blast.js:215-219`, `471-475`)
  passes the full shock through holes. The CPU is not a reference for any case with holes.
- Contact: GPU moves the node only (`gpu.js:136-155`), CPU exchanges momentum (`blast.js:663-671`).
- Crack limits and crack starts (8).
- Float32 absolute positions on the GPU (`gpu.js:156`): coordinates up to 12 m have a 1 um step; per-step motion
  below ~0.1 m/s (dt = 11 us) is rounded, bond strain noise ~1e-5 (0.4-0.6 % of the yield strain at 0.125/0.0625).
  Store displacement from R0 instead.
- Suite (0.25 m): 30 kg at 2 m and Hellfire contact identical; 120 kg contact: second deck torn 0.5 m^2 (GPU,
  diffraction 0.5) vs 4.0 m^2 (CPU); with diffraction 1 the two are identical to the node; 120 kg inside: weather
  deck 0 vs 9 m^2, 415 cells differ.

### 11. Line of sight (low-medium)
`blast.js:402-405`, `471`. The CPU re-tests only every 8 steps, only while the pulse is on and before tLoad, and never
clears a flag; up to 8 steps of a pulse through a newly opened hole are lost. Rays test the plates' rest planes (a
dished or petalled plate still blocks at its rest plane).

### 12. Shock load (low-medium)
`blast.js:187-194`, `249-258`. Kinney-Graham impulse is weak in the near field (Z < ~0.3); reflected impulse
is scaled ad hoc as is (Pr/Ps)^0.75; ideal-gas reflection caps Pr/Ps at 8 (real near-field reflection is much
higher); cos^2 obliquity has no Mach-stem enhancement around 40-50 deg; all computed once on the rest geometry; Z
clamped at 0.053 and R at the charge radius. Suggest Kingery-Bulmash / UFC 3-340-02 reflected pressure and impulse
with the angle-of-incidence curves.

### 13. Seam and edge nodes (low)
`blast.js:93`, `165-166`, `469-470`. A node shared by two plates gets both plates' area and mass but is loaded along
the first plate's normal only (the deck's share of a side/deck seam node is pushed along the side normal), and its
gas faces are sampled along that normal only (lower-compartment pressure does not act on the second-deck seam
line). Plate-edge nodes carry a full S^2 of area and mass (should be half / quarter); only seams are affected since
the outer edges are fixed.

### 14. Mass scaling x64 in the gas phase (low-medium)
`blast.js:420`, `600`. Panel periods x8 (~10 ms -> ~80 ms), comparable with burn rises (60-120 ms) and venting, so the
phase is not quasi-static; a shock arriving after tFast gives 1/64 of the velocity. Suite `massscale` (120 kg
inside, GPU 0.125): torn 66.9 m^2 unscaled, 53.5 at x16, 52.8 at x64; side 13.8 vs 7.2 m^2; x1 takes 4.0 s vs 0.8 s.
BENCH.md's "within ~10 % of x16" is true, but x16 is itself 20 % off the unscaled run. If x64 stays, check it against
x1 on every source type, or scale only once the structure is at rest under the gas load.

### 15. Fragments only in the render loop (low)
`blast.js:283-294`, `880-895`. `strike()` changes velocities from `draw()`, keyed to frame time: headless runs
(runCase, this suite) never apply them, the GPU path ignores them (CPU V is never uploaded), and interactive CPU
results depend on the frame rate.

### 16. Housekeeping (low)
- `createGPU` per build, nothing deleted (`blast.js:183`, `gpu.js:172-233`): every run leaks its textures, FBOs and
  programs (hundreds of MB per run at 0.0625). The suite frees them itself.
- `runCase` merges its config into `st` for good (`blast.js:1024`), so later runs inherit it.
- `F` of fixed nodes is never zeroed (accumulates forever; unused). `sim.torn` isn't updated on the GPU (readout
  "bonds" wrong). `runCase` calls `gpuFinish` twice. The rng `seed` is shared by crack setup and the renderer.
- The stable step ignores ties and bending, harmless (they are 100x softer than the bonds).
- Gas: incompressible orifice flow (no choking; ~20 % high at 2 MPa), isothermal, fixed volumes; GPU gas every 25
  steps. Acceptable for the purpose.
- Readouts: "max set" is the largest side displacement anywhere (grillage translation incl. elastic part at T1),
  not a dish; "side torn" includes crack-adjacent cells (9).

## v22: hazards for the move to the whole ship

- Four plates and five spaces are hard-coded: `blast.js:54` (GP[5], OPEN[25]), `202`, `269` (cracks[4]), `285`, `348`,
  `363`, `592`, `642`; `gpu.js:22` (uCr[4], uCrA/uCrL[32]), `59` (uGP[5]), `60` (uPl[4]...), `73`, `107`, `137`.
- Line of sight and contact loop over every plate for every node every step (`gpu.js:73`, `137`; CPU `firstHit`,
  `collide`): with the Burke's ~2000 panels that is the cost, and uniform arrays don't hold it. Needs a spatial
  structure (per-cell occupancy grid / BVH texture) or a per-hit shortlist of nearby plates.
- Rays and contact use each plate's rest plane and axis-aligned (u, v) cell lookup; the Burke shell is curved
  (ruled strips) and the deckhouse sides are inclined.
- The bending neighbour encoding `j * 32 + k` in a float (`gpu.js:109`, `219`) is exact only below 2^24 / 32 =
  524 288 nodes; a whole Burke at 0.125 m is well above that. Node textures are 128 wide, so N / 128 rows must stay
  under the GPU's texture height (8192-16384).
- Compartments: `comp()` and GV are the box's (`blast.js:56-57`); the Burke data has 85 spaces and `compAt`.
- The ties (finding 2) anchor frames to the world: on a whole ship there is no "world" to anchor to; the frames have
  to become members.

## v22 suite

Open http://127.0.0.1:8771/game/concepts/blast/verify.html (full run ~3 min, most of it CPU reference runs);
`?quick=1` skips the slow ones, `?only=energy,mesh` runs a subset; results in `window.VERIFY.results`. It loads the
bench's own blast.js/gpu.js (only the relative import of gpu.js is made absolute, and a read-only accessor is
appended), stubs the render loop, frees each run's WebGL objects, and runs every case synchronously to T1.
Everything scene-specific is found from the model (plates, frames from FRM, fixed edges, charge position), so the
checks carry over to other scenes.

| Check | What passes |
|---|---|
| energy | CPU explicit: work of the loads (taken at the step-mean velocity, as symplectic Euler gains it) = kinetic + element elastic energy + plastic work (force at yield x plastic increment, bonds / ties / bending) + fracture (energy held by a bond when it breaks) + dashpots + global velocity damping; unexplained < 3 % |
| momentum | sum of internal forces and torques (total force minus loads minus ground ties, incl. the bond forces on fixed nodes) ~ 0 |
| symmetry | x-mirror about a panel centre, before the wave reaches anything asymmetric: < 1 % (final state shown for information) |
| dt | dt vs dt/2 on CPU and GPU: set and field within 10 %, torn area within 15 % |
| mesh | GPU 0.25 / 0.125 / 0.0625: panel-centre set (standoff) or torn area (contact / inside) within 15 % between the two finest |
| parity | GPU vs CPU at 0.25: set and field within 10 %, torn area within 20 % |
| nurick | panel dish relative to its edges within +-30 % (or +-h) of Nurick-Martin, using the impulse actually applied over the panel |
| tearonset | near-uniform load (8 m off): first tearing at phi >= 20 |
| springback | panel centre keeps >= 60 % of its peak displacement |
| mono | more charge / closer / thinner: torn area never falls; at equal tearing the max set never falls |
| massscale | x1 vs x64 within 15 % |
| user1200 | plating of other plates within 2.5 m behind the hole is torn or set > 50 mm (>= 50 %); the CPU reference shows the load reaching it |
| user5000 | < 5 % of the plating within 0.5 W^(1/3) m of the charge (>= 1 m from fixed edges) has set < 2h; a dished band (> 5h) round the hole; petals: under half of the torn struck plate thrown loose and the rim moved > 1/4 of the hole radius |

### Results at 1596bde (bench v22, defaults: GPU, 0.125 m, diffraction 0.5, x64)

| Check | Result | Numbers |
|---|---|---|
| bench loads | PASS | 36 025 nodes, 143 160 bonds, dt 11.4 us |
| tear-out threshold | FAIL | v_c 36.7 m/s = phi 9.5 for a uniform panel (readout says tearing at phi > 28) |
| reruns (GPU, CPU) | PASS | identical |
| energy 30 kg @ 2 m | FAIL | plate bonds 4.8 %, ties 56 %, bending dashpot 15 %, global damping 15 %, unexplained 5.8 % (bending operator 5.2 %); same at dt/2 |
| energy Hellfire contact | FAIL | plate bonds 0.5 %, ties 40 %, bending dashpot 21 %, damping 10 % (+37 % on loose pieces), unexplained -10.9 % (bending operator -11.6 %) |
| energy 120 kg @ 3 m | FAIL | plate bonds 8.4 %, ties 46 %, damping 23 %, bending dashpot 12 %, unexplained 5.3 % (bending 4.8 %) |
| linear momentum | FAIL | net internal force 752 kN (2.9 % of the peak load), all from the bending operator |
| angular momentum | FAIL | 4000 kN m, all from the bending operator |
| symmetry, early (GPU / CPU) | PASS | 5e-6 / 0 |
| symmetry, final | INFO | 1.6 % (non-tearing), 1.0 % (contact): the section is not mirror-symmetric |
| dt vs dt/2 (5 cases) | PASS | < 1 % everywhere; inside case 0.8 % field, torn 52.8 / 53.0 m^2 |
| mesh 120 kg @ 5 m | PASS (barely) | centre set 59 / 24 / 22 mm; 0.25 is 59 % off |
| mesh 30 kg @ 2 m | FAIL | 25 / 10.5 / 6.6 mm |
| mesh 120 kg contact | FAIL | torn 2.19 / 1.58 / 1.91 m^2 (18 % between the two finest) |
| parity 30 kg @ 2 m, Hellfire | PASS | identical / 1.8 % |
| parity 120 kg contact, diff 0.5 | FAIL | second deck 0.5 vs 4.0 m^2 (CPU has no diffraction) |
| parity 120 kg contact, diff 1 | PASS | identical |
| parity 120 kg inside | FAIL | weather deck 0 vs 9 m^2, max set 1.36 vs 1.06 m |
| Nurick-Martin (6 cases) | FAIL | panel dish relative to its edges 0-1 mm vs 17-42 mm predicted; the whole grillage moves 7-26 mm |
| tearing onset | FAIL | phi 9.7 (400 kg at 8 m); 300 kg at 8 m (phi 8.2) dishes 52 mm |
| springback | FAIL | keeps 37 % (GPU 0.125) / 47 % (CPU 0.25); 91 % with the bending term off |
| monotonic (charge, contact, standoff, thickness x2) | PASS | torn area and set rise with charge and fall with thickness |
| 1200 kg: structure behind | PASS | 438 / 441 nodes torn, 400 thrown loose |
| 1200 kg: load reaches it (CPU) | PASS | 104 / 104 nodes loaded; gas 0 kPa everywhere (finding 7) |
| 5000 kg: nothing pristine in reach | PASS | 4 of 19 291 nodes under 20 mm |
| dished band round the hole | PASS | 81-86 % of the 1 m ring > 50 mm |
| petals, not cut-outs (1200, 5000) | FAIL | 79 % / 87 % of the torn side thrown loose; rim moved <= 0.37 / 0.39 m |
| mass scaling | FAIL | 66.9 (x1) vs 52.8 m^2 (x64) |
| Burke (4 cases from burke_structure.js) | INFO | the bench has no scene switch yet; cases wired: 1200 kg contact amidships at the waterline, 120 kg on the deckhouse, 120 kg inside MER 1 (every plate bounding the space must tear or set > 2h), 5000 kg contact (nothing pristine within 8.5 m) |
