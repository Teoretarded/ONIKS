# Blast bench audit (independent verification, 2026-09-26)

Scope: `blast.js` and `gpu.js` at commit 1596bde (bench v22), structural model only (steel plating under blast
loading). Verification suite: `verify.html` + `verify.js` (runs the bench's own code; results below). Line numbers
refer to 1596bde. Ranked by how much each item biases the results the user questioned (steel looks brittle, the deck
behind a contact hole doesn't respond, a very large charge leaves plating pristine).

Status: DRAFT, being updated while the suite runs. Final suite results at the bottom.

## What the numbers say, in short

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
- Solver numerics are fine: dt vs dt/2 identical (< 0.1 %), early-time mirror symmetry exact, reruns identical,
  GPU matches CPU on outside hits without holes. The problems are in the model, not the integration.

## Findings, ranked

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
- Suite results: see `parity`.

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
phase is not quasi-static; a shock arriving after tFast gives 1/64 of the velocity. Suite: `massscale`.

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

## Suite results

(pending: filled at the end of the run)
