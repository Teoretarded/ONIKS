# Blast bench: model, checks, results (v34, 2026-09-26)

Test page: `game/concepts/blast/index.html` (served by `tools/serve_game.py`). Scenes: **Section · 30 m** (a
destroyer side section: side, weather deck, second deck, platform deck, two bulkheads), **Arleigh Burke** (a patch
of the whole ship from `burke_structure.js` around the aim point; the rest of the ship is drawn but rigid), and a
**clamped plate** (Nurick–Martin checks, script only). Solvers: **CPU reference** and **GPU**, the GPU on **WebGPU**
compute (`gpu_wgpu.js`) where the browser has it and on **WebGL2** (`gpu.js`) otherwise and for blocking (headless)
runs; the three run the same passes and agree to 0.01–0.05 %. Machine: AMD RX 9070 XT, in-app Chromium (ANGLE / Dawn).

## The model (what replaced what)

| # | Was (v22) | Now | Source |
|---|---|---|---|
| 1 | Node torn out when its received impulse beat 6 % of a tearing work (`TEAR_K`, tuned down by eye): 36.7 m/s for 10 mm HSLA, plate brittle | Cells erode (element deletion) when their equivalent plastic strain accumulated in non-compressive states (triaxiality > −1/3) plus the plastic bending strain of the outer fibre reaches the mesh-regularised failure strain | GL criterion (Scharrer, Zhang & Egge 2002; Zhang et al. 2004); Bao & Wierzbicki 2004 cut-off |
| 2 | Fracture strain `ef × 0.6` at every grid | `eps_f = 0.056 + 0.54 t / l_e` per cell (10 mm plate: 0.078 / 0.099 / 0.142 at 0.25 / 0.125 / 0.0625 m) | GL |
| 3 | 24 m box, rigid infinitely strong edges, no floor | 30 m section with a platform deck, decks out to the centreline; where the ship continues: elastic-plastic anchors (E h b / 2 m, yield σy h b) with Lysmer dashpots ρ c h b so waves leave. Burke: a box around the charge, half-size L = clamp(3 + 1.5 W^⅓, 3, 14) m, joined with the compartment the blast works in (the one holding the charge or behind the struck plating); plating cut by the box is anchored. Graded grid: the chosen S within 1.5 + 0.6 W^⅓ m (2–6 m) of the hit on each axis, 2 S outside (coarse lines are every other fine line, so pieces still share lines). P-800: 31 k cells at 0.25 m, 114 k at 0.125 m | Lysmer & Kuhlemeyer 1969 |
| 4 | Gas only from inside charges | Openings in outside plating let the detonation products in: the products heading into each torn cell (share by solid angle, arriving after the cell opened) add their quasi-static pressure to the compartment behind; then it vents through the torn area | UFC 3-340-02 QS fit 2.25 MPa (W/V)^0.72 |
| 5 | Shock through a hole kept a fixed 50 % | Each opening is a secondary source on its far side (Lambert-distributed, strength = energy and momentum through it by solid angle × the share of the pulse after the cell opened), capped by the feeding source's unobstructed wave over the whole path (an opening re-radiates, it cannot focus). Two generations (hole → compartment → next hole) | aperture/Kirchhoff-type re-radiation |
| 6 | Kinney–Graham with Z ≥ 0.053: contact impulse ~6× low | Near field: the detonation products carry W·U (U = mean speed of a homologous Gurney sphere, TNT E_G = 2.98 MJ/kg); a surface element gets W U cos²α / 4πR² (products stagnate), arriving from R/u_max with a t⁻⁵ tail. The larger of this and the air shock applies (crossover near Z ≈ 0.6, where the swept air mass equals the charge) | Gurney 1943; Cooper 1996 |
| 7 | Inside: direct shock + QS pressure only | First-order image sources across every wall of the compartment (weakened by the torn share of that wall); outside, the sea surface reflects | image-charge method |
| 8 | Bonds: EPP, compression capped at 0.12 fy; "bending" a one-sided Laplacian spring (not conservative, stiffness ∝ 1/S²); frames/stiffeners as ties to fixed anchors | Membrane: 4 crossed constant-strain triangles per cell, corotational, plane-stress J2 (Simo–Taylor return map), linear hardening, Cowper–Symonds (constants moving from initial-yield to large-strain values, Jones 1989). Bending: dihedral hinges on every shared edge (Bridson/Tamstorf–Grinspun gradients), plastic moment σy h²/4 per length reduced by membrane utilisation (M/Mp + (N/Np)² = 1); plate junctions are hinges too. Stiffeners: axial members + a shear-limited (Timoshenko-type) beam on the member's own line: bending as the angle between the chords to the nodes m cells either side (m = round(0.75 d / S), base ~1.5 × the section depth, k = EI/(m² S), cap Mp/m), plus the shear of each segment against the chord around it (G A_w, cap τy A_w). The angles are taken about axes in the plating: for the bending at a node, the line between the plating nodes across it on either side; for a segment's shear, the line between the far corners of the cells on either side; their gradients run through those axes too, so the member exerts no net moment, and nothing prefers one side or one end (the bending at a node needs both segments there, a segment fails on the larger start-of-step bending strain of its two nodes). Where a member runs into a perpendicular plate (a frame at a deck), in-plane web-end ties (area A_w) carry its end reaction into that plate over the web depth. Fail at the GL strain of the web. Compression to full yield; buckling comes from the geometry, with hungry-horse imperfections min(0.1 β² t, b/200) between stiffeners | Simo & Taylor 1986; Grinspun et al. 2003; Jones 2012; Smith et al. 1988 |
| 9 | Mass scaling ×64 in the gas phase | None. Stable step node by node (Gershgorin); the few nodes stiffer than the 0.2th percentile get extra mass (added mass 1e-10 … 3e-4 of the total, reported per build) | |
| 10 | Fragments drawn only (kick from the render loop); seams double stiffness; mass/area per plate edge | Casing fragments: Gurney velocity (cylinder), Fisher/Fano blast reduction W(0.2 + 0.8/(1 + M/C)), deterministic spray ray-traced through the structure with air drag; each impact perforates (Recht–Ipson plugging) or embeds, passes its momentum, and holes the plate (net-section damage, erosion at 100 %). Mass, area, stiffness assembled per cell, so seams and edges get exactly their share. Water-backed plating (radiation pressure ρ_w c_w v_n, cavitation limit). A burst at the waterline also drives a water shock: the charge's share below or within 2 charge radii above the surface (½ at the surface) as an equivalent charge just under it; Cole's similitude (Pm = 52.4 MPa (W^⅓/R)^1.13, θ = 0.084 ms W^⅓ (W^⅓/R)^−0.23), cut off when the free surface's relief (negative image) arrives, (1 + cos) × incident on wet plating in view through the water; with the radiation term this is Taylor's plate. Loose pieces found by connectivity | Recht & Ipson 1963; Fisher 1953; Taylor 1941; Cole 1948 |
| 11 | — | Folding a coarse grid cannot resolve: the side's push folds the deck edge at the seam, which needs cells of ~1/10 of the fold length (H = 0.9 (b² t)^⅓, b = 1 m: 0.17 m for 6.5 mm). Plating and members within 0.6 m of a junction between plates at an angle get a compressive knock-down of their yield (weighted by the trial stress's compression, ramped in over 0.4 % plastic strain), tabled against S/H: 0.03 / 0.12 / 0.15 / 0.4 / 1 at S/H = 1.49 / 0.74 / 0.37 / 0.19 / 0.09 (0.25 / 0.125 / 0.0625 / 0.031 / 0.016 m for the 6.5 mm deck). Section frames have brackets (a square of web plate, legs ~ the frame's depth) where they meet the decks | calibrated here (grid convergence below) |
| 12 | Openings always open | The scene's own openings are open; hatches (1 m², 50 kPa), watertight doors (1.3 m², 100 kPa), ventilation trunks (≤ 1.2 m², 30 kPa) and weather doors (1.5 m², 70 kPa) are shut until the pressure across them reaches that (condition Zebra; the game's ventsOf) | public damage-control figures |
| 13 | Read-backs used when they arrive | Torn cells (every sync) and the attached structure's motion (every 200 steps) are used a fixed ~1 ms later (a whole number of syncs) on the CPU, WebGL2 and WebGPU alike; a hole source that appears late delivers what it owed on its first step. Runs are deterministic: async WebGPU, async WebGL2 and headless runs end on the same step with the same result | |

Also fixed on the way: the GPU hinges never yielded in the first rewrite (a material uniform was only set when a
shader used both material blocks: infinite rate factor) — the game port copied that version (446c6a3); GPU node
positions are stored as displacements and element rest vectors uploaded exactly (float32 absolute coordinates
rounded the strain); a synchronous run never saw a torn cell (fences only complete between browser tasks), so
there were no hole sources, vents or products inflow in scripted runs; a NaN node from a zero-length hull strip
poisoned the GPU origin on the 56 m Burke patch; mixed-shape joins now drop degenerate cells.

Transverse shear (mode III) is not a separate criterion. The shear band is ~h wide and cannot be resolved by cells
of 6–25 h; a geometric "offset across a cell" test fired on ordinary buckling waves, so it was removed. Discing
under near-contact loads is tensile tearing at the rim of the loaded area (Nurick & Radford 1997), which the GL
erosion produces.

## Checks

**Forces are energy gradients.** Finite differences of the element energies against the element forces (cells,
hinges, members incl. the members' pull on their plating cell's corners) agree to 1e-6 (`BLAST.fdCheck`). Internal
forces sum to 7e-8 N and their moment to 0.13 N·m against 26 MN of load (1015 N·m while the member angles used a
fixed axis; verify.html `momentum`).

**Symmetry.** A mirror-symmetric displacement gives exactly mirror-symmetric member forces, and the CPU run of a
charge on the frame line stays symmetric to round-off (1e-15 m) until the waves reach the section's bulkheads, which
are not symmetric (x = −10 and 5 m). The member failure used the bending of the segment's own node from this step and
its neighbour's from the last, and the bending at a node was owned by the segment to its right: both broke the mirror
under a contact charge (fixed). verify.html's `mirror 120 kg contact, GPU 0.125` still fails (5–6 %; 4.6 % at 11cab80
as well): on the GPU, mirrored cells reach the erosion limit within float32 round-off and tear a step apart, and the
hole grows from there; the 30 kg cases pass (0.004–0.02 %).

**Energy ledger (CPU).** Work of the loads = kinetic + elastic + plastic (membrane, hinges, members, anchors) +
damping + boundary radiation + contact + fracture. Plastic work is booked with the mean of last step's and this step's
returned force over the plastic increment (trapezoid, as the leapfrog kinetic energy); booking it with the trial force
counted the explicit step's overshoot as dissipation, which moved with dt (AUDIT A2): 120 kg contact, first 4 ms,
unexplained −3.7 % → +0.5 % at dt and +0.3 % at dt/2, membrane plastic 4.8 / 4.8 %, members 3.4 / 3.2 % (was 6.5 / 5.6
and 5.9 / 4.3). Box, 30 kg at 2 m, 0.25 m: closes to 0.36 %. Plate 120 kg at 3 m:
1.2 % (59 kJ in: 48 membrane plastic, 10.5 hinge plastic). Plate torn open (120 kg at 1.5 m, φ 35): 7.5 % — the
corotational CST uses Biot strain with a Cauchy-like stress, not an exact hyperelastic pair, and loses conservation
at the very large strains of a shredded plate. Numerical damping (stiffness-proportional, 3 % of critical at the
highest mesh frequency) takes 2–11 %.

**CPU = GPU.** Same steps, same state: 0.05 % (L2 of the displacement field, 600 steps, plastic); with tearing
(1200 kg contact, 400 steps, 187 cells torn) 0.036 % and the same cells torn. WebGPU against the CPU on verify.html's
five parity cases (30 kg at 2 m, Hellfire, 120 kg contact and inside, Oniks with casing and fragments): 0.004–0.05 %,
the same cells torn in all five (`BLAST.parityA`); WebGL vs WebGPU 3e-5. WebGPU runs are deterministic (the contact
push-back is summed in node order, not by float atomics). verify.html's parity (headless WebGL, which now reads the
torn cells at every sync, as the CPU sees them): all five pass, the fragments case too (it failed on the old every-4th
-sync read).

**Nurick–Martin (quadrangular plates, δ/h = 0.480 φ + 0.277), impulsive regime** — a lab-size plate (0.3 × 0.3 m,
2 mm mild steel, clamped, 0.0125 m cells; the regime the fit comes from, pulse ≪ response time):

| TNT @ standoff | φ | Nurick–Martin δ | Model δ |
|---|---|---|---|
| 0.1 kg @ 0.2 m | 7.6 | 7.8 mm | 7.6 mm |
| 0.1 kg @ 0.15 m | 10.1 | 10.2 mm | 11.7 mm |
| 0.2 kg @ 0.15 m | 20.1 | 19.9 mm | 24.3 mm |
| 0.3 kg @ 0.15 m | 30.2 | 29.5 mm | 38.8 mm |

Within the fit's scatter (±25–30 %). Mesh: the φ 20 case gives 26.0 / 24.3 / 26.3 mm at 12 / 24 / 48 cells across.

**Rate and the ship-scale panel (AUDIT A3).** The verifier's rig (2.5 × 0.75 m, 6 mm mild, clamped, 2 m standoff) is
grid-converged (above), so its shortfall is not A1: with Cowper–Symonds on, φ 16.7 / 24.8 / 46.8 give 60 / 78 / 86 %
of Nurick–Martin; with the rate effect off 86 / 101 % (and the φ 47 plate blows out). Nurick–Martin's φ uses static
yield, so most of the gap is the rate law (mild steel D 40.4 → 6844 /s, q 5 → 3.91 with strain, Jones). Measured
localised tests (Langdon, Lee & Louca 2015, 4 mm mild 400 mm square, PE4 discs at 25 mm; game/research/
plate_validation.csv): the spherical-charge near field gives 40 % of the measured impulse (23–34 vs 56–83 N·s: a disc
throws its products at the plate), and 64 % of the measured deflection per unit impulse. No tearing data in the file
yet (all mode I), so tearing onset (A4) is still unchecked against data.

**At ship scale** (2.5 × 0.75 m panel, 10 mm, 0.125 m cells) the model dishes less than the fit: HSLA 120 kg at
2 m: 59 vs 73 mm, at 1.5 m 106 vs 112 mm; mild steel 120 kg at 3 m 41 vs 62 mm, at 2 m 90 vs 111 mm; small φ
(< 8) mostly elastic. This is expected physics, not a calibration gap: at 1.5–8 m a 120 kg pulse lasts about as
long as the panel takes to respond, so the load is not impulsive (work done 59 kJ vs I²/2m = 73 kJ at 3 m), and
HSLA's elastic range (with rate hardening) is a large share of these deflections. Tearing sets in near φ ≈ 35 for
mild steel (1.06 m² torn at 1.5 m), consistent with the mode II onset of clamped steel plates.

**Grid convergence (AUDIT A1).** The side dish kept growing with refinement (80 / 111 / 173 mm at 0.25 / 0.125 /
0.0625 m) while the loads were the same on every grid (215.8 kN·s on the side). A clamped plate alone converges (mild
6 mm, φ 17 and 25: 29 / 35 / 30 / 35 and 57 / 57 / 60 mm at 0.25 … 0.031 m; HSLA 10 mm 120 kg at 2 m: 44 / 58 / 59 / 57),
so the plating is not the cause. Runs on a reduced section (x ±5 m, decks 4 m; `boxX`, `boxZ`) down to 0.0156 m
(870 k cells) show where it goes: the side pushes the second deck's edge in and the deck folds at the seam. A coarse
grid cannot fold, so it holds the side up; the fold needs cells of ~1/10 of its length.

| 120 kg at 5 m, 20 ms, erosion off | 0.25 | 0.125 | 0.0625 | 0.031 | 0.0156 m |
|---|---|---|---|---|---|
| side at the charge (no knock-down) | 92 | 124 | 143 | 218 | **242** mm |
| deck edge at the frame (no knock-down) | 49 | 80 | 104 | 187 | **217** mm |
| side at the charge (knock-down, row 11) | 210 | 230 | 240 | 239 | |
| deck edge at the frame (knock-down) | 182 | 206 | 219 | 214 | |

Checked on two cases it was not fitted to (0.0156 m reference; side / deck edge at 20 ms, then at 30 ms):
120 kg at 8 m: fine 130 / 118, 167 / 150; knock-down 0.25 m 114 / 103, 126 / 112; 0.125 m 127 / 116, 154 / 138
(without it 54 / 28 and 75 / 48). 30 kg at 2 m: fine 49 / 40 at 10 ms, 43 / 35 at 30 ms; knock-down 0.25 m 43 / 33,
41 / 34; 0.125 m 49 / 40, 49 / 41 (without it 21 / 7 and 28 / 15). So 0.125 m with the knock-down is within ~10 % of
the fine grid and 0.25 m within ~10–25 % (low), where both were 50–75 % low. verify.html `mesh` (full section, final
set): dish 234 / 180 / 192 mm, 0.125 vs 0.0625 6 % — PASS (was 80 / 111 / 173, FAIL). The knock-down's range: it was
calibrated on deck-edge folding under a side push (6.5–10 mm plating, mild/HSLA); folding elsewhere (bulkheads under
gas, decks crushed from above) uses the same table unverified.

The contact hole is not converged, and not monotonic: full section 5.6 / 4.0 / 10.8 m² at 0.25 / 0.125 / 0.0625 m
(side 3.7 / 2.0 / 3.6, second deck 2.1 / 1.4 / 6.5); reduced section down to 0.031 m: 4.9 / 2.7 / 4.9 / 3.5 m² (side
3.7 / 2.1 / 3.4 / 2.3, second deck 1.2 / 0.6 / 1.2 / 0.9). Tearing scatters ±30 % from grid to grid around the 0.031 m
value; 0.25 m tears ~40 % more than 0.031 m. Not calibrated (a single fine value would be fitting noise).

verify.html `?quick=1` after these changes: 28 pass, 3 fail, 3 info. The fails are the GPU mirror check under tearing
(float32 tie-breaks, above) and the two "petals, not cut-outs" checks (53 % / 81 % of the torn side thrown loose,
was 61 / 82 % at the audit); energy near contact, momentum, dt, parity, mesh dish now pass.

**Seam tearing at the frames (AUDIT A1b).** 120 kg at 8 m tore the second deck at every frame station where the
side frame meets it (the frame's reaction entered the deck at one node: 10 % compression in the first cell). With the
web-end ties: 0.66 → 0 m² at 0.25 m, 0.68 → 0.2–0.5 m² at 0.125 m; 120 kg contact at 0.125 m: second deck torn
1.06 → 0.28 m². What remains at 0.125 m: the member model has no web shear yield, so a frame can pass more than τy A_w
to the deck (tried: capping each bending element's moment by its web's shear capacity also capped the moment at
coarse grids; bar knees to the deck landed out of plane on one node and doubled contact-case deck tearing).

**Deck hit from inside (the game's deck Oniks).** 120 kg + 130 kg casing 0.8 m under the Burke's main deck in the
CPO mess (411 m³): the compartment's quasi-static pressure is ~1 MPa. Torn within 30 ms: 105.5 m² at 0.25 m, 102.6 m²
at 0.125 m (first cells at ~9–10 ms, half by ~19 ms: the gas, not the shock), of which ~30 m² within 0.3 m of a seam
on both grids; the rest is the WT bulkheads (53 m²), the second deck below (~25 m²), the shell and the main deck
(~7 m²) bursting. The shut openings barely matter (the first, a ventilation trunk, goes at 0.3 ms; 1–1.5 m² against
~100 m² of holes). So the extent is physical (≈ 1 MPa on 6–10 mm plating), and on the bench it is not a seam or
frame-end artefact; the roof is not cut free along its seams here. By 400 ms the gas has burst through ~500 m² of the
patch. Found on the way: an inside charge on the Burke never pressurised its compartment (the outside space is index 0
there, and the gas source was only made for spaces below it); the game's shell/model.js has the same test (`cc < sc.OUT`).

## The user's cases

Box, GPU, 0.25 m (torn area, m²; max displacement):

| Case | Side | Weather deck | 2nd deck | Platform | Bulkheads |
|---|---|---|---|---|---|
| P-800 contact | 2.75 | 0 | 0.19 (150 mm) | 0 (62 mm) | 0 |
| P-800 delayed, 1.6 m inside | 4.1 | 0.4 | 54 | 53 | 36, 40 |
| 1200 kg contact | 22 | 7 | 58 (deck behind torn and folded, 7 m) | 32 | 43, 40 |
| 5000 kg contact | 63 | 76 | 113 | 53 | 63, 46 — nothing within reach left untouched |

Arleigh Burke, GPU, 0.25 m, contact at the waterline amidships (starboard, x 0, y 2.5):

| Case | Patch | Torn | Behind the hole |
|---|---|---|---|
| P-800 contact | x −14.8 … 19.4 m, 95 k cells | shell 3.0 m² | 2nd deck dished 394 mm, WT bulkhead 294 mm, inner bottom 165 mm; MER 1 at 7 kPa from the products |
| P-800 inside MER 1 (before the v34 gas fix: the compartment was never pressurised; now its QS pressure bursts the WT bulkheads, inner bottom and 2nd deck, verify.html) | same | inner bottom 0.4, 2nd deck 0.2, WT bulkhead 0.5 m² | shell dished 138 mm, decks and bulkheads ~0.43 m (MER 1 vents through the uptakes) |
| 1200 kg contact | x −27 … 29 m, 163 k cells | shell 63, inner bottom 82, 2nd deck 117, WT bulkheads 139, deckhouse 5 m² | decks folded up to 7.5 m |
| 5000 kg contact | same | shell 230, inner bottom 212, 2nd deck 155, main deck 73, WT bulkheads 270, deckhouse sides 116 m² | section wrecked |

## Cost

**Step.** dt is the stiffest node's (Gershgorin, 0.75 of it), a few stiff joins mass-scaled. At 0.125 m it was set by
the deep frames' Euler–Bernoulli bending over 0.125 m elements (grid frequency ∝ 1/S²): 3.42 µs on the box. The
shear-limited member (bending over the base m S either side, shear of each segment) lifts it to **6.48 µs** (box) and
5.64 µs (Burke, graded); 0.0625 m 0.85 → 3.55 µs; 0.25 m unchanged (12.27 / 11.85 µs, membranes).

**Per-step overhead.** WebGL2: every texture sits on its own unit for the run (texture arrays for the ping-pong state:
nodes, cells, hinges, members, element forces) and each program has an even and an odd version with its samplers
fixed, so a step is ~30 calls (useProgram, bindFramebuffer, viewport, a uniform or two, draw) instead of ~150; torn
cells are read as packed bytes (4 B/cell). WebGPU: one bind group for everything (which half is current is a per-step
uniform at a dynamic offset), 200 steps per command buffer, three in flight, loads/impulses/damage copied in between
steps where the CPU set them, mapAsync read backs. Both are now GPU-bound: 97 µs/step on the 31 k-cell Burke patch,
0.2–0.4 ms at 114 k cells (gather 0.18, hinges 0.10, cells 0.09, contact 0.05, members 0.03, nodes 0.03 ms by timer
queries at 0.125 m). With a heavy WebGL scene rendering alongside (worker, 8000 draw calls a frame, GPU saturated)
the two stay within ±25 % of each other (0.25 m: WebGPU 154, WebGL 201 µs/step; 0.125 m: 600 / 493); WebGPU's
gains are a queue of its own, cheap encoding and use from a worker, not speed on this GPU.

| Case (runCaseAsync) | Grid | Cells | dt | Steps | Simulated | Wall |
|---|---|---|---|---|---|---|
| Box, 120 kg contact | 0.25 m | 21.6 k | 12.3 µs | 14 200 | 174 ms | **0.93 s** (was 0.98) |
| Box, 120 kg contact | 0.125 m | 86 k | 6.48 µs | 38 600 | 250 ms | 9.1 s (was 12.3 for 160 ms) |
| Burke, P-800 contact | 0.25 m | 31 k | 11.85 µs | 13 800 | 163 ms | **1.7 s** (was 8.7 s on the 95 k-cell patch) |
| Burke, P-800 inside MER 1 | 0.25 m | 31 k | 11.85 µs | 15 200 | 180 ms | **1.4 s** |
| Burke, P-800 contact | 0.125 m | 114 k | 5.64 µs | 28 800 | 162 ms | 11.1 s (WebGL 12.4) |
| Burke, P-800 inside MER 1 | 0.125 m | 114 k | 5.64 µs | 44 300 | 250 ms | 16 s |
| Box, 120 kg, verify.html mesh | 0.0625 m | 345 k | 3.55 µs | | | 68–103 s (audit: 270–450) |

Targets (P-800 contact ≤ ~1 s, inside ≤ ~4 s): met at 0.25 m (with a 80 ms relax, contact 0.9 s); at 0.125 m ~10×
off, and verify.html's convergence check passes at no grid yet (above). What would cut it further: multi-rate steps
(the coarse ring at 2 dt), a gather that reads each adjacency record once, a shorter horizon (deck tearing continues
under the products' gas pressure: relaxing at 70 ms instead of the natural end (250 ms here) loses 5 % of the side and
11 % of the second-deck tearing, at 40 ms 70 % of the deck's).

## Approximations still in the model

- Shell: crossed CST membranes (Biot strain, not exactly hyperelastic at large strain) + discrete hinges with a
  plastic moment interaction; no through-thickness integration (membrane and bending plasticity are separate, joined
  by M/Mp + (N/Np)² = 1). Plastic bending hinges use the mean of the two cells' utilisation.
- Fracture: GL (calibrated for ship steels in LS-DYNA shells) with a triaxiality cut-off; Al 5456 uses GL scaled
  by 0.6. No separate mode III shear; no crack-tip singularity below the cell size; erosion removes the cell's
  stiffness but keeps its mass on the nodes. Distorted cells (area ratio < 0.25) erode.
- Stiffeners: shear-limited beams on grid lines (composite tee with the attached plate, minus the plate's own
  bending); no web shear yield in the bending (a frame can pass more than τy A_w to its support), no tripping or web
  crippling; member ends at plate edges are pinned; stiffeners at seams are placed on the piece that owns the line.
  Bending switches off where the plating cell is eroded or the member has turned off the plating's plane.
- Joints: coincident nodes (box); separately gridded pieces (Burke) are joined by snapping free edges to the nearest
  node within 0.55 S (a few hundred edge nodes per patch stay free — reported as `scene.unsnapped`), plus a handful
  of degenerate cells dropped (`scene.dropped`).
- Loads: Kinney–Graham air shock with Rankine–Hugoniot reflection and cos² obliquity (no Mach stem); reflected
  impulse scaled as (Pr/Ps)^0.75 (acoustic limit 1.68 instead of 2); spherical charges only (flat or cased
  near-contact charges push more momentum along their axis); products assumed to stagnate on the plate (e = 0).
  Secondary sources are points at the hole centroid (clustered within 3 m), two generations, first-order images
  only, compartments treated as convex boxes for line of sight and reflections; outside line of sight is ray-traced
  on the rest geometry at detonation; inside charges and hole sources see their whole compartment (no shadowing).
  Water shock only from a burst at the waterline (no bubble, no bulk cavitation, no underwater charges).
- Gas: lumped compartments, isothermal orifice venting (no choking), fixed volumes; products let in once, as
  their QS pressure. Water: plane-wave radiation pressure only (no added-mass build-up, no hydrostatics, no flooding).
- Fragments: fixed mass per round (approximate public figures), isotropic spray, perforation by a plugging energy
  with a ×2 dynamic shear strength; damage is a net-section area fraction.
- Boundaries: anchors are isotropic (same stiffness in every direction) with a 2 m continuation length; no
  rotational restraint at the cut; the rest of the Burke is rigid; gravity only on loose pieces.
- Timing: the permanent set is read after dynamic relaxation (strong mass damping once the motion of the structure
  still joined to the ship has decayed: debris is left out); if a mechanism is still moving, the last 25 ms of
  relaxation damp it. Runs are deterministic (row 13).
- The unresolved-folding knock-down (row 11) is a calibration, not a fold model: it makes 0.125 m within ~10 % and
  0.25 m within ~10–25 % of a 0.0156 m grid on deck-edge folding under a side push; other folding modes use it
  unverified. The contact hole is still grid-sensitive (fold strain over one cell).
- Read-backs are used ~1 ms after the step they describe (hole sources, vents and fragments see new holes that late;
  a late hole source delivers the impulse it owed at once).

## For scripts

`BLAST.runCaseAsync(cfg)` (fast) or `BLAST.runCase(cfg)` (synchronous, reproducible) with `{ scene: 'box' | 'burke' |
'plate', grid, kg, casing, fuze: 'contact' | 'standoff' | 'inside', standoff, solver: 'gpu' | 'cpu', backend: 'auto' |
'webgpu' | 'webgl', h, mat, plate: [a, b] }` plus knobs `relaxAt` (fixed relax time), `relaxGas` (relax under
sustained gas), `patchL`, `fineR`, `uniformGrid`, `noWebEnds`, `noWater`, `wgBatch`, `wgDepth`, `dtK`, `betaK`, `boxX`,
`boxZ` (reduced section), `brackets`, `kLaw`, `kComp`, `kBand`, `kEps` (knock-down), `efScale` (failure strain ×),
`shutVents`, `inDepth` (inside charge depth), `insideLOS`, `latMs` (read-back latency), `noRate`;
`BLAST.probe(cfg, times, points, stopAt)` (displacements at points and times, headless or WebGPU);
results per piece (torn m², max displacement), `energy` (CPU), `nm` (plate). `BLAST.parity(cfg, steps)` (CPU vs
WebGL), `BLAST.parityA({ ...cfg, pair: ['cpu' | 'gpu' | 'webgpu', ...] }, steps)`, `BLAST.bench(n, backend)`
(steps/s), `BLAST.stress(iters, draws)` (a heavy WebGL scene alongside; 0 stops it), `BLAST.fdCheck(node, 'cell' |
'hinge' | 'truss')`, `BLAST.gpuProfile(n)` (WebGL timer queries), `BLAST.model()` (all arrays: cells `CN`, `CER`,
`CDM`, `CEP`; hinges `HN`, `HTP`, `HTPS`; members `TA`, `TB`, `TFL`, `TBA`, `TBB`, `TSC`, `TCL`; pieces `PAN`, `CMAP`;
`scene`).
