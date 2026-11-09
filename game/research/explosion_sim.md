# Structural blast damage: survey and recommendation

Context: `game/concepts/blast/blast.js` is a 0.25 m mass-spring lattice of a 24 m hull panel, elastic-plastic
springs, Kinney-Graham + Rankine-Hugoniot reflected load, explicit integration at ~23 µs. Result checked
against Nurick-Martin. ~3 s CPU/hit, with interpenetration and venting problems. Goal: similar visual/physical
fidelity, many hits per match, browser real time.

## 1. How games do it

- **BeamNG.drive (node-beam soft body)** — closest existing analogue to our lattice. Nodes = mass points,
  beams = massless springs with a **deformation threshold** (permanent set, i.e. elastic-plastic) and a
  **break threshold** (beam removed, mimics tearing). Stability comes from tuning beam stiffness against the
  fixed physics tick rather than adapting the timestep; the tech paper describes a semi-implicit / substepped
  integrator, and known failure mode is exactly ours — beams too stiff for the step "vibrate and explode" (self-
  reported in their own docs). No FEM, no global stiffness matrix: local springs only, so cost is O(#beams).
  Real cars run at a few thousand nodes/beams in real time. [BeamNG physics](https://beamng.com/game/about/physics/),
  [JBeam beams](https://documentation.beamng.com/modding/vehicle/sections/beams/), [tech paper](https://beamng.tech/blog/2021-06-21-beamng-tech-whitepaper/bng_technical_paper.pdf).
- **Teardown** — fully voxel, not a plating solver; destruction = removing/reshading voxels + a lightweight
  rigid-body split for disconnected chunks. Relevant idea: **fixed small volume elements + connectivity
  flood-fill** for support loss, not per-element stress integration. Good model for "does this compartment
  now vent / is this deck now unsupported", bad model for realistic plate tearing look.
- **From the Depths / Stormworks / Sprocket** — per-block HP and armor-class blocks; damage = block removal +
  simple penetration/HE-vs-armor-class lookup, no continuum mechanics at all. Confirms that a **coarse
  block/module HP layer** for gameplay/AI is normal even in "hardcore" sim-building games, decoupled from any
  visual tearing layer.
- **War Thunder** — overpressure is a separate resolved mechanic from penetration: HE fill above a
  TNT-equivalent threshold (170 g) triggers a compartment overpressure kill *only if it breaches into a
  compartment*, independent of continuum stress; spall = discrete secondary-fragment objects with an RHA-mm
  equivalent roll, not simulated fragmentation physics. [Overpressure mechanics](https://wiki.warthunder.com/mechanics/4236-the-mechanics-of-high-explosive-effect-and-overpressure),
  [spall liners devblog](https://warthunder.com/en/news/8670-development-detailed-information-surrounding-spall-liners-in-war-thunder-en).
  World of Warships is analogous: fixed **module HP boxes** (magazines, engines, steering) resolved by
  penetration formula, cosmetic hole/fire decals layered on top — no structural solve. This matches our
  existing `game/src/game` module-box damage system; it is the industry-standard shortcut.
- **Battlefield/Frostbite** — destruction is mostly **pre-authored breakable meshes** (piece states swapped or
  glued fragments released) driven by a damage-graph, not physics-derived fracture; a small stress propagation
  pass decides which pre-cut chunks separate. Confirms pre-fracture + trigger, not runtime FEM, even at AAA
  budgets.
- **Red Faction Guerrilla (Geo-Mod 2.0)** — buildings are built from real segments (beams, walls, joints);
  each hit removes/weakens joints and a **graph-based stress propagation** decides delayed collapse of
  unsupported subgraphs. This is the best AAA precedent for "local damage now, global structural consequence
  later" and maps well onto a ship's frame graph (JBeam-like breakable idea generalized to buildings).
  [Geo-Mod 2.0](https://www.redfactionwiki.com/wiki/Geo-Mod_2.0).
- **Unreal Chaos / NVIDIA Blast / Havok Destruction** — all converge on the same architecture: **offline
  pre-fracture** (Voronoi/Houdini RBD) into a chunk hierarchy + a **support graph**; runtime cost is rigid-body
  simulation of already-separated chunks plus graph connectivity checks, not stress/strain integration. NVIDIA
  Blast explicitly avoids per-frame allocation and keeps the fracture *authoring* offline; the runtime library
  only manages actor splitting on a precomputed chunk graph. [NVIDIA Blast SDK docs](https://nvidia-omniverse.github.io/PhysX/blast/index.html),
  [Blast SDK on GitHub](https://github.com/NVIDIAGameWorks/Blast).

Takeaway: no shipped real-time game runs a continuum/FEM plate solver per hit at our fidelity. All of them
separate **local visual tearing** (cheap, often canned/parametric) from **global consequence** (a graph or
box-HP layer, cheap by construction).

## 2. Engineering blast/structure methods and their real-time shortcuts

- **Load generation**: UFC 3-340-02 and the Kingery-Bulmash polynomial fits (basis of CONWEP) already reduce
  a hemispherical/spherical free-air/surface burst to closed-form polynomials in scaled distance `Z = R/W^{1/3}`
  (Hopkinson-Cranz) for peak pressure, impulse, arrival time, duration. This is exactly the shortcut our own
  blast.js already uses; it is *the* accepted fast load model in the field (military and civil, e.g. used
  inside SDOF risk codes). CONWEP itself is distribution-limited but Kingery-Bulmash curve-fits are public
  and this is the standard reference implementation.
  [Kingery-Bulmash overview](https://unsaferguard.org/un-saferguard/kingery-bulmash), [Cornell air-blast load paper](https://sites.coecis.cornell.edu/earls/files/2019/08/Guzas_Earls_2010_SCS_10_5.pdf).
- **Structural response fast-running models (FRMs)**: instead of FEM, blast/vulnerability codes reduce a
  panel or beam to a **single-degree-of-freedom (SDOF) oscillator** with an equivalent mass, resistance
  (elastic-plastic or trilinear resistance-deflection curve fit to the real section), and the measured
  pressure-time pulse, then integrate one ODE (µs-scale, trivial cost) instead of a lattice. This is *the*
  workhorse of blast risk/vulnerability tools and directly analogous to collapsing our lattice per-panel into
  one or a few modal DOFs.
- **LS-DYNA / Autodyn / Europlexus** are the "ground truth" tools (Lagrange/ALE/SPH coupling, full continuum),
  used to *calibrate* the FRMs/SDOF curves and empirical fits, not run at game rates — 3 s/hit on our lattice
  is already faster than these, but still far from useful for "many hits per match."
- **Empirical plate response**: **Nurick-Martin** correlation (already used in blast.js) gives permanent
  mid-point deflection from a single non-dimensional impulse parameter, fit across Modes I-III (large ductile
  deformation → tensile tearing → transverse shear at the support). This alone can replace an *entire lattice
  solve* for "how big is the dish, did it tear" on a flat panel, at O(1) cost — reserve the lattice only for
  visual tessellation of that result. **Petalling/discing** criteria (Wierzbicki & co., Lee & Wierzbicki) give
  closed-form thresholds for the transition from dishing to petal tearing to disc ejection based on
  thickness, standoff and impulse — usable directly as a decision tree for "which failure texture/geometry to
  spawn" instead of deriving it from lattice fracture. [Petalling of plates](https://planets.utsc.utoronto.ca/~pawel/s/wierzbicki-1999.pdf).
- **Compartment gas/venting**: our own `~2.25 MPa (W/V)^0.72` quasi-static-pressure fit is the standard
  confined-blast shortcut (Kinney/Cooper-style QSP correlations used in vulnerability codes); the missing
  piece is **hole-area venting** — model the compartment as a single control volume, discharge coefficient
  through the (evolving) torn hole area (compressible orifice flow, closed-form), and for multi-compartment
  spread use a simple **1-D network of orifices between fixed control volumes** (the standard "lumped gas
  network" approach in vented-explosion codes) rather than any CFD.

## 3. Fire and stored-energy events (public safety-engineering level)

- **Pool fires / fireballs**: TNO Yellow Book (PGS2/CPR14E) gives closed-form pool-fire diameter/height/burn
  rate and BLEVE fireball correlations (`D ≈ 5.8·M^0.333`, duration ~`M^{1/6}`), plus solid-flame surface
  emissive power for thermal radiation — all O(1) formulas suitable for driving a fire FX system's size/duration/
  light output procedurally instead of hand-keying. [Yellow Book](https://publications.tno.nl/publication/34634119/QIKv78/TNO-2005-yellow.pdf),
  [BLEVE fireball calculator](https://midstreamcalculator.com/calculators/safety-relief/bleve-fireball.html). NIST
  Fire Dynamics Simulator (FDS) is the CFD-grade tool these correlations are validated against; not real-time,
  used only as the reference for tuning.
- **Propellant/stored-munition events**: safety-engineering practice (hazard classification, not weapon
  design) treats a **deflagration** (propellant burning, pressure vessel rupture, fragments + fireball, no
  supersonic shock) as physically distinct from a **detonation** (shock-driven, TNT-equivalence applies) —
  risk codes assign a TNT-equivalent yield fraction per energetic-material hazard class for the *detonation*
  case and a separate "fireball + fragment + overpressure vessel-burst" model for the *deflagration/cook-off*
  case. For our HUD's "cook-off" events, this maps cleanly to: pick a class (contact-fire cook-off = vessel
  burst + fireball + thrown fragments, no shock front) vs (sympathetic detonation = full Kingery-Bulmash blast
  again at the module's stored yield) — a design switch already implicit in ONIKS's module data (`cookoff
  risk` per magazine/VLS cell), not a new physics system.

## 4. Fast numerical methods that fit a browser budget

- **XPBD (Macklin et al. 2016)** — reformulates constraints with a compliance term so stiffness no longer
  depends on iteration count/timestep, fixing exactly the "too-stiff springs blow up" failure both BeamNG and
  our own lattice hit. [XPBD paper](https://matthias-research.github.io/pages/publications/XPBD.pdf).
- **Small Steps (Macklin 2019)** — shows splitting one frame into N substeps with a *single* XPBD iteration
  each converges better and cheaper than fewer, bigger steps with many iterations; directly applicable to
  replace our fixed 23 µs explicit substepping with a coarser outer step (game frame) subdivided into a
  handful of XPBD substeps — likely a 10-100x reduction in required steps for the same stability.
  [Small Steps paper](https://mmacklin.com/smallsteps.pdf).
- **GPU mass-spring / position-based cloth-style solvers**: our lattice is structurally a mass-spring mesh;
  the same Jacobi/Gauss-Seidel-friendly XPBD update used for cloth in WebGPU compute shaders (or WebGL2
  transform-feedback if compute is unavailable) parallelizes per-node, is a natural fit for a fixed 0.25 m
  panel grid, and keeps the *existing* lattice topology — no rewrite of blast.js's structure needed, just its
  integrator.
- **MPM / peridynamics** — used in research for ductile tearing and fragmentation (e.g. "Ductile Fracture with
  MPM", MLS-MPM/Taichi) and are the *right* physics for fracture without mesh-topology surgery, but current
  real-time MPM work still targets tens-of-thousands of particles at *interactive*, not 16 ms, budgets, and
  needs a background grid + P2G/G2P transfer each step — meaningfully more machinery than XPBD-on-existing-
  lattice for a WebGL2/no-build-step target. [Real-time MPM on GPUs](https://arxiv.org/pdf/2111.00699). Treat
  as a later, optional upgrade path, not a first target.
- **Reduced-order models / precomputed response**: offline-fit a small modal/SDOF basis (or a direct lookup
  table keyed on charge, standoff, plate gauge, framing spacing) for the *far-field* / non-tearing response,
  falling back to full local solve only in a tearing radius — matches how blast-vulnerability FRMs already
  work (see §2) and is the cheapest possible option for hits that don't rupture the plate.
- **Locality + multi-resolution**: solve only a bounded patch around the hit (our lattice already fixes nodes
  at a 24 m boundary — good) sized to the blast's structural influence radius (a few plate spans), at 0.25 m
  where torn/plastic, coarser or ROM elsewhere.
- **Workers + SIMD**: WASM+SIMD physics reports up to ~4x over scalar JS and near-native throughput for this
  kind of dense numeric loop; SharedArrayBuffer lets a worker own the lattice state without postMessage
  copies, keeping the main thread free for render — real option for running the solve fully off the critical
  path across a frame or two instead of stalling. [WASM SIMD/threads overview](https://www.alldevtoolshub.com/blog/webassembly-browser-tools-2026-simd-threads-wasm-3/).

## 5. Recommendation for ONIKS

**Architecture**: keep the existing mass-spring lattice topology (it is already calibrated and validated
against Nurick-Martin) but replace the explicit 23 µs integrator with **substepped XPBD** (§4), run the solve
**in a Web Worker** over 1-3 game frames (hit effects are not read back instantly anyway — there's already a
lightning-scan/reveal delay to hide latency), and bound the active lattice to a **local patch** (the blast's
structural influence radius, not the whole 24 m panel) with a **coarse SDOF/ROM fallback** for anything outside
the tearing radius or for hits that clearly won't rupture the plate (skip the lattice entirely, look up
Nurick-Martin deflection + petal/disc criterion for the visual). Compartment gas venting: model each
compartment as one control volume with orifice-flow discharge through the current torn-hole area (closed
form, replaces the current unbounded-buildup problem) and chain compartments as a small lumped-volume network
for multi-compartment spread. Global consequence (whole-ship flooding/collapse) stays a **graph/support-check**
layer over the module boxes, per Red Faction Guerrilla / Chaos-style support graphs — decoupled from the
per-panel solve, same as your existing module-HP system.

**Expected accuracy**: SDOF/Nurick-Martin-only path matches published test-correlation scatter (~20-30%
typical for these fits) — fine for a game. Local XPBD lattice only where texture/tearing needs to look right;
same physical basis as now (elastic-plastic, tear at mesh-scale strain) just faster and stable.

**Expected cost per hit**: patch of maybe 20x20 nodes (structural influence radius) instead of the whole panel,
substepped XPBD instead of 23 µs explicit — plausibly two to three orders of magnitude below 3 s; target
sub-16 ms even on the main thread for the common case, with the worker/SIMD path as headroom for salvos (many
hits per second).

**Prototype first, in order**:
1. Swap the explicit integrator for substepped XPBD on the *same* lattice — cheapest change, directly fixes
   the interpenetration/instability problems, keep everything else.
2. Bound the solve to a local patch sized from the blast's structural influence radius; fall further hits
   outside that radius to the SDOF/Nurick-Martin lookup.
3. Closed-form compartment venting (orifice flow through current hole area) to fix the gas-pressure buildup
   problem directly.
4. Move the lattice solve to a Worker (postpone WASM/SIMD until profiling says JS is the bottleneck).
5. Only then consider MPM/peridynamics for fragmentation-heavy hits (cook-off, large HE) if the lattice+ROM
   combo still looks wrong there.

**Pitfalls to design around**:
- *Stability*: springs stiff enough to look like steel plus a large timestep is the single most common
  failure (BeamNG's own docs, our current 3 s/hit budget) — XPBD substepping is specifically the fix, not
  more damping.
- *Interpenetration*: mass-spring lattices have no real collision volume; add a cheap penalty/shell offset
  per node (or a signed-distance check against the ship's other surfaces) rather than relying on spring
  stiffness to prevent pass-through.
- *Mesh-dependent fracture*: tearing strain thresholds in a fixed 0.25 m lattice are resolution-dependent
  (well documented for lattice/peridynamics fracture) — keep the tear criterion calibrated at 0.25 m
  specifically (as blast.js already does with `EF_MESH`) and don't change the grid spacing without
  re-fitting it against Nurick-Martin.
- *Global vs local coupling*: don't let the local plate solve drive whole-ship structural collapse directly —
  keep that as a separate graph/support layer (Geo-Mod-style), fed by discrete "this frame/bulkhead failed"
  events from the local solve, not by continuous force feedback.
