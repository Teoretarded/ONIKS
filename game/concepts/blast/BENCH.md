# Blast bench: model, checks, results (v32, 2026-09-26)

Test page: `game/concepts/blast/index.html` (served by `tools/serve_game.py`). Scenes: **Section · 30 m** (a
destroyer side section: side, weather deck, second deck, platform deck, two bulkheads), **Arleigh Burke** (a patch
of the whole ship from `burke_structure.js` around the aim point; the rest of the ship is drawn but rigid), and a
**clamped plate** (Nurick–Martin checks, script only). Solvers: **CPU reference** and **GPU** (same passes, same
physics; they agree to 0.01–0.05 %). Machine: AMD RX 9070 XT, in-app Chromium (ANGLE).

## The model (what replaced what)

| # | Was (v22) | Now | Source |
|---|---|---|---|
| 1 | Node torn out when its received impulse beat 6 % of a tearing work (`TEAR_K`, tuned down by eye): 36.7 m/s for 10 mm HSLA, plate brittle | Cells erode (element deletion) when their equivalent plastic strain accumulated in non-compressive states (triaxiality > −1/3) plus the plastic bending strain of the outer fibre reaches the mesh-regularised failure strain | GL criterion (Scharrer, Zhang & Egge 2002; Zhang et al. 2004); Bao & Wierzbicki 2004 cut-off |
| 2 | Fracture strain `ef × 0.6` at every grid | `eps_f = 0.056 + 0.54 t / l_e` per cell (10 mm plate: 0.078 / 0.099 / 0.142 at 0.25 / 0.125 / 0.0625 m) | GL |
| 3 | 24 m box, rigid infinitely strong edges, no floor | 30 m section with a platform deck, decks out to the centreline; where the ship continues: elastic-plastic anchors (E h b / 2 m, yield σy h b) with Lysmer dashpots ρ c h b so waves leave. Burke: a patch of the real ship (±L = 4 + 2 W^⅓ m, out to the next watertight bulkhead), 95–163 k cells at 0.25 m | Lysmer & Kuhlemeyer 1969 |
| 4 | Gas only from inside charges | Openings in outside plating let the detonation products in: the products heading into each torn cell (share by solid angle, arriving after the cell opened) add their quasi-static pressure to the compartment behind; then it vents through the torn area | UFC 3-340-02 QS fit 2.25 MPa (W/V)^0.72 |
| 5 | Shock through a hole kept a fixed 50 % | Each opening is a secondary source on its far side (Lambert-distributed, strength = energy and momentum through it by solid angle × the share of the pulse after the cell opened), capped by the feeding source's unobstructed wave over the whole path (an opening re-radiates, it cannot focus). Two generations (hole → compartment → next hole) | aperture/Kirchhoff-type re-radiation |
| 6 | Kinney–Graham with Z ≥ 0.053: contact impulse ~6× low | Near field: the detonation products carry W·U (U = mean speed of a homologous Gurney sphere, TNT E_G = 2.98 MJ/kg); a surface element gets W U cos²α / 4πR² (products stagnate), arriving from R/u_max with a t⁻⁵ tail. The larger of this and the air shock applies (crossover near Z ≈ 0.6, where the swept air mass equals the charge) | Gurney 1943; Cooper 1996 |
| 7 | Inside: direct shock + QS pressure only | First-order image sources across every wall of the compartment (weakened by the torn share of that wall); outside, the sea surface reflects | image-charge method |
| 8 | Bonds: EPP, compression capped at 0.12 fy; "bending" a one-sided Laplacian spring (not conservative, stiffness ∝ 1/S²); frames/stiffeners as ties to fixed anchors | Membrane: 4 crossed constant-strain triangles per cell, corotational, plane-stress J2 (Simo–Taylor return map), linear hardening, Cowper–Symonds (constants moving from initial-yield to large-strain values, Jones 1989). Bending: dihedral hinges on every shared edge (Bridson/Tamstorf–Grinspun gradients), plastic moment σy h²/4 per length reduced by membrane utilisation (M/Mp + (N/Np)² = 1); plate junctions are hinges too. Stiffeners: axial members + their own bending (composite tee with the attached plate) as a line angle on the member's nodes; fail at the GL strain of the web. Compression to full yield; buckling comes from the geometry, with hungry-horse imperfections min(0.1 β² t, b/200) between stiffeners | Simo & Taylor 1986; Grinspun et al. 2003; Jones 2012; Smith et al. 1988 |
| 9 | Mass scaling ×64 in the gas phase | None. Stable step node by node (Gershgorin); the few nodes stiffer than the 0.2th percentile get extra mass (added mass 1e-10 … 3e-4 of the total, reported per build) | |
| 10 | Fragments drawn only (kick from the render loop); seams double stiffness; mass/area per plate edge | Casing fragments: Gurney velocity (cylinder), Fisher/Fano blast reduction W(0.2 + 0.8/(1 + M/C)), deterministic spray ray-traced through the structure with air drag; each impact perforates (Recht–Ipson plugging) or embeds, passes its momentum, and holes the plate (net-section damage, erosion at 100 %). Mass, area, stiffness assembled per cell, so seams and edges get exactly their share. Water-backed plating (radiation pressure ρ_w c_w v_n, cavitation limit). Loose pieces found by connectivity | Recht & Ipson 1963; Fisher 1953; Taylor 1941 |

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
hinges, members) agree to 1e-6 (`BLAST.fdCheck`).

**Energy ledger (CPU).** Work of the loads = kinetic + elastic + plastic (membrane, hinges, members, anchors) +
damping + boundary radiation + contact + fracture. Box, 30 kg at 2 m, 0.25 m: closes to 0.36 %. Plate 120 kg at 3 m:
1.2 % (59 kJ in: 48 membrane plastic, 10.5 hinge plastic). Plate torn open (120 kg at 1.5 m, φ 35): 7.5 % — the
corotational CST uses Biot strain with a Cauchy-like stress, not an exact hyperelastic pair, and loses conservation
at the very large strains of a shredded plate. Numerical damping (stiffness-proportional, 3 % of critical at the
highest mesh frequency) takes 2–11 %.

**CPU = GPU.** Same steps, same state: 0.05 % (L2 of the displacement field, 600 steps, plastic); with tearing
(1200 kg contact, 400 steps, 187 cells torn) 0.036 % and the same cells torn.

**Nurick–Martin (quadrangular plates, δ/h = 0.480 φ + 0.277), impulsive regime** — a lab-size plate (0.3 × 0.3 m,
2 mm mild steel, clamped, 0.0125 m cells; the regime the fit comes from, pulse ≪ response time):

| TNT @ standoff | φ | Nurick–Martin δ | Model δ |
|---|---|---|---|
| 0.1 kg @ 0.2 m | 7.6 | 7.8 mm | 7.6 mm |
| 0.1 kg @ 0.15 m | 10.1 | 10.2 mm | 11.7 mm |
| 0.2 kg @ 0.15 m | 20.1 | 19.9 mm | 24.3 mm |
| 0.3 kg @ 0.15 m | 30.2 | 29.5 mm | 38.8 mm |

Within the fit's scatter (±25–30 %). Mesh: the φ 20 case gives 26.0 / 24.3 / 26.3 mm at 12 / 24 / 48 cells across.

**At ship scale** (2.5 × 0.75 m panel, 10 mm, 0.125 m cells) the model dishes less than the fit: HSLA 120 kg at
2 m: 59 vs 73 mm, at 1.5 m 106 vs 112 mm; mild steel 120 kg at 3 m 41 vs 62 mm, at 2 m 90 vs 111 mm; small φ
(< 8) mostly elastic. This is expected physics, not a calibration gap: at 1.5–8 m a 120 kg pulse lasts about as
long as the panel takes to respond, so the load is not impulsive (work done 59 kJ vs I²/2m = 73 kJ at 3 m), and
HSLA's elastic range (with rate hardening) is a large share of these deflections. Tearing sets in near φ ≈ 35 for
mild steel (1.06 m² torn at 1.5 m), consistent with the mode II onset of clamped steel plates.

**Grid sensitivity, box, contact** (GPU):

| Case | 0.25 m | 0.125 m |
|---|---|---|
| P-800 (120 kg fill, 130 kg casing): side torn / 2nd deck torn / 2nd deck max displacement | 2.75 m² / 0.19 m² / 150 mm | 1.75 m² / 0.59 m² / 356 mm |
| 1200 kg: side / weather / 2nd / platform / bulkheads torn | 22 / 6 / 58 / 32 / 43, 40 m² | 45 / 7 / 65 / 32 / 37, 33 m² |

Deck and bulkhead damage agree within ~15 %; the hole in the struck plate and the second-deck response at 0.25 m
are within a factor 1.5–2 of 0.125 m (the near-field load peak is sampled on coarser cells). Use 0.125 m for
numbers, 0.25 m for speed.

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
| P-800 inside MER 1 | same | inner bottom 0.4, 2nd deck 0.2, WT bulkhead 0.5 m² | shell dished 138 mm, decks and bulkheads ~0.43 m (MER 1 vents through the uptakes) |
| 1200 kg contact | x −27 … 29 m, 163 k cells | shell 63, inner bottom 82, 2nd deck 117, WT bulkheads 139, deckhouse 5 m² | decks folded up to 7.5 m |
| 5000 kg contact | same | shell 230, inner bottom 212, 2nd deck 155, main deck 73, WT bulkheads 270, deckhouse sides 116 m² | section wrecked |

## Cost

dt is set by the stiffest thing per node (Gershgorin): at 0.25 m the membranes (12.3 µs box, 7.0 µs Burke — the
Burke's thinner/stiffer members); at 0.125 m the deep web frames' bending over 0.125 m elements (Euler–Bernoulli
beam: the grid-scale frequency grows as 1/S², 3.4 µs). GPU per step (timer queries, box 0.25 m): hinges 0.011,
cells 0.012 (0.05 with 32 load sources), members 0.0004, gather 0.021, nodes 0.006 ms. Wall time is set by
WebGL call overhead (~0.07 ms/step) and by read-backs: `runCaseAsync` (yields between syncs) never stalls;
`runCase` (synchronous) must read torn cells blocking every 4th sync (~30 ms each).

| Case (runCaseAsync, GPU) | Grid | dt | Steps | Simulated | GPU wall |
|---|---|---|---|---|---|
| Box, P-800 contact | 0.25 m | 12.3 µs | 13 200 | 162 ms | **0.98 s** |
| Box, P-800 inside | 0.25 m | 12.3 µs | 32 600 | 400 ms | **2.3 s** |
| Box, 1200 kg contact | 0.25 m | 12.3 µs | 20 400 | 250 ms | 2.3 s |
| Box, P-800 contact | 0.125 m | 3.4 µs | 46 800 | 160 ms | 12.3 s |
| Burke, P-800 contact | 0.25 m | 7.0 µs | 23 000 | 161 ms | 8.7 s |
| Burke, 1200 kg contact | 0.25 m | 7.0 µs | 35 700 | 250 ms | 25 s |
| Burke, 5000 kg contact | 0.25 m | 7.0 µs | 35 700 | 250 ms | 43 s |

Before: scatter with float blending took 0.56 ms/step on the Burke patch; the gather is 0.13 ms (4×). Synchronous
reads were 60–80 % of a scripted run. What would cut it further without losing accuracy: (1) a Timoshenko member
(shear-limited grid modes) to lift the 0.125 m step from 3.4 to ~6 µs; (2) WebGPU compute (one dispatch chain per
step, no per-pass WebGL validation); (3) a shorter horizon where the plastic work rate is ~0 (now: relax after the
kinetic energy falls to 5 % of its peak or 0.1 s after the loads, then 25 ms of dynamic relaxation).

## Approximations still in the model

- Shell: crossed CST membranes (Biot strain, not exactly hyperelastic at large strain) + discrete hinges with a
  plastic moment interaction; no through-thickness integration (membrane and bending plasticity are separate, joined
  by M/Mp + (N/Np)² = 1). Plastic bending hinges use the mean of the two cells' utilisation.
- Fracture: GL (calibrated for ship steels in LS-DYNA shells) with a triaxiality cut-off; Al 5456 uses GL scaled
  by 0.6. No separate mode III shear; no crack-tip singularity below the cell size; erosion removes the cell's
  stiffness but keeps its mass on the nodes. Distorted cells (area ratio < 0.25) erode.
- Stiffeners: Euler–Bernoulli members on grid lines (composite tee with the attached plate, minus the plate's own
  bending), no tripping or web crippling; member ends at plate edges are pinned; stiffeners at seams are placed on
  the piece that owns the line.
- Joints: coincident nodes (box); separately gridded pieces (Burke) are joined by snapping free edges to the nearest
  node within 0.55 S (a few hundred edge nodes per patch stay free — reported as `scene.unsnapped`), plus a handful
  of degenerate cells dropped (`scene.dropped`).
- Loads: Kinney–Graham air shock with Rankine–Hugoniot reflection and cos² obliquity (no Mach stem); reflected
  impulse scaled as (Pr/Ps)^0.75 (acoustic limit 1.68 instead of 2); spherical charges only (flat or cased
  near-contact charges push more momentum along their axis); products assumed to stagnate on the plate (e = 0).
  Secondary sources are points at the hole centroid (clustered within 3 m), two generations, first-order images
  only, compartments treated as convex boxes for line of sight and reflections; outside line of sight is ray-traced
  on the rest geometry at detonation.
- Gas: lumped compartments, isothermal orifice venting (no choking), fixed volumes; products let in once, as
  their QS pressure. Water: plane-wave radiation pressure only (no added-mass build-up, no hydrostatics, no flooding).
- Fragments: fixed mass per round (approximate public figures), isotropic spray, perforation by a plugging energy
  with a ×2 dynamic shear strength; damage is a net-section area fraction.
- Boundaries: anchors are isotropic (same stiffness in every direction) with a 2 m continuation length; no
  rotational restraint at the cut; the rest of the Burke is rigid; gravity only on loose pieces.
- Timing: the permanent set is read after dynamic relaxation (strong mass damping once the motion has decayed);
  if a mechanism is still moving, the last 25 ms of relaxation damp it.

## For scripts

`BLAST.runCaseAsync(cfg)` (fast) or `BLAST.runCase(cfg)` (synchronous) with `{ scene: 'box' | 'burke' | 'plate',
grid, kg, casing, fuze: 'contact' | 'standoff' | 'inside', standoff, solver: 'gpu' | 'cpu', h, mat, plate: [a, b] }`;
results per piece (torn m², max displacement), `energy` (CPU), `nm` (plate). `BLAST.parity(cfg, steps)`,
`BLAST.fdCheck(node, 'cell' | 'hinge' | 'truss')`, `BLAST.gpuProfile(n)`, `BLAST.model()` (all arrays: cells `CN`,
`CER`, `CDM`, `CEP`; hinges `HN`, `HTP`, `HTPS`; members `TA`, `TB`, `TFL`; pieces `PAN`, `CMAP`; `scene`).
