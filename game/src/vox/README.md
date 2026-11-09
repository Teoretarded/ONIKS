# vox: voxel ships (prototype)

A ship as one lattice of 0.25 m plating cells. Both the damage solver and the picture use this lattice, so what the
solver tore is exactly what is drawn. It is a prototype: it runs only in the blast lab (`game/lab.html`, Target →
**Voxels (prototype)**), with one hit at a time on a fresh ship. Nothing in a match uses it yet.

Why: today the same hit is worked out in four places (sim hp and modules, sim compartments, the GPU blast patch, the
structure girder). The pictures disagree with each other, and the model's dots are moved by a shader that only
approximates the patch. Here nothing is deleted. Every cell is in one of three states, so plating cannot vanish, a
piece cannot hang in the air, and a load only reaches what the charge can see:
- attached to the ship;
- part of a loose piece (falls, lands on the deck under it, sinks);
- a single fragment.

| File | What |
|---|---|
| `build.js` | `voxelize`: the model's own dots (`blast/support.js modelDots`, ~0.3 m) splatted into 0.25 m cells (each cell's point on its own footprint, so cells tile the plate). Also: the hull under the waterline from the layout's hull form (`hullDots`; the models stop at the waterline), normals oriented and smoothed, interior cells lying in the hull's surface taken as plating, plating and material by part (`blast/spec.js` HULL figures), sorted along the hull |
| `solver.js` | a hit: the region round the charge (R = 3 + 1.6 W^1/3 m, 4-14), bonds to the 26 neighbours (elastic-plastic, they tear past the steel's mesh-regularised failure strain, with a seeded ±15 % scatter), bending triplets (plastic hinges). Framing as ribs: transverse frames every 2.4 m, longitudinals every 0.75 m. Loads: the round's own hole, Kinney-Graham shock plus the detonation products close in (line of sight through the lattice, reflected by the angle, at its arrival time), the space's gas (`data/ship_layouts.js`, venting through what tore), casing fragments as rays (pocks). Phase A: the structure in 30 us steps for 60-120 ms. Phase B: what is no longer joined to an anchor flies as rigid bodies or fragments (gravity, drag, landing on the decks under them, sinking), frames every 1/60 s |
| `gpu.js` | phase A on WebGPU compute in the worker: bonds, triplets, nodes (forces gathered through each node's lists), 8 storage buffers. About 0.12 ms a step against 2.7 ms on the CPU: 4,000 steps (120 ms of physics) in ~0.5 s |
| `worker.js` | builds a class's lattice once, solves hits (GPU when the worker has WebGPU, else the CPU loop), streams frames |
| `render.js` | the cells as the films' dots (the model shading: moon, view fill, facing, back faces thinned), sub-dots on each cell's footprint (a per-cell shifted Bayer order: no moire), occlusion splats, the outside of the hull under the sea culled. Soot only on the face the fire was on, torn edges as a bright speckled line (hot while fresh), pocks as specks. The deformation view (`R.models.defo`): see below |
| `index.js` | the system `vox`: `game.vox.enable(uid)`, `hit(uid, o)` (posted at FIRE: the solve starts before the round lands), `state`, `data` (pieces, fragments, plating velocities), `field` (every cell of the region: rest point, displacement, normal, flags), playback as a pure function of tau (exact scrubbing, re-runs) |

## In the lab
- **Voxels (prototype)** / **Dots (game)** under Target: the same shot in either picture. **Compare** (Damage check)
  runs the shot in both and records each (`game/shots/lab/<name>/dots|vox/`).
- **Clean (no smoke / fire)** is on by default: the plating is seen bare.
- **Deformation** (Display, key B): every dot coloured by how far the damage moved it from where it was built.
  - Pushed out: lime from 3 cm, warm white by 25 cm, coral past 1-3 m.
  - Pushed in: blue to white.
  - Loose pieces: coral.
  - Untouched plating: dimmed grey.

  Both pictures, so they can be compared directly.
- **Vectors** (Overlays): the pieces' and fragments' velocities, and the displacement field (rest to now). Vanished
  dots are shown as coral crosses, floating clusters as rings.
- **Damage check**: Probe gives the defects:
  - vanished: metal gone with nothing carrying it;
  - floating;
  - hanging;
  - hovering: a piece neither falling, touching nor in the sea;
  - far side: m² moved past 5 cm across the centreline from the hit.

  It also gives the field's numbers: area moved past 5 / 20 / 50 / 100 cm, away from or toward the charge, out or
  in, reach, largest.

  Record steps the shot to 3 s and saves `data.json` (every tau) and `field_<ms>.json` (the vectors of every moved
  cell at 5, 20, 50, 100, 500, 3000 ms).
- `python tools/lab_analyze.py game/shots/lab/<name>` prints a recording (or a Compare folder's both sides) in numbers.

Console: `LAB.model('vox')`, `LAB.probe()`, `LAB.field()`, `LAB.deform()`, `await LAB.record({ name })`,
`await LAB.compare({ name })`, `LAB.display({ defo: true })`.

## Not yet
- One hit on a fresh ship: the solve starts from rest. A second hit does not build on the first.
- Phase A freezes the plating where it is at its end. A flap still moving then stops in place, and the gas still
  pushing is left out.
- The sim (flooding, systems) still takes its own hole. This lattice's opened area is not fed back.
- Only ships with model dots: the DDG is the tested one. Ground craters and land units are not done.
- The worker builds a class in ~0.2 s, and setup takes ~0.2 s a hit. In a match the solve would start when the
  round is ~1 s out.
