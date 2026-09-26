# Blast test bench: solvers and results (2026-09-26)

Test section: 24 m of a destroyer's side (10 mm HSLA-80, frames 2.5 m, longitudinals 0.75 m), weather deck
9.5 mm, second deck and a bulkhead 6.5 mm, four compartments. Machine: AMD RX 9070 XT (in-app Chromium/ANGLE),
with other agents' batch runs loading the CPU.

## Methods tried

| # | Method | Result |
|---|---|---|
| 1 | Explicit mass-spring on the CPU (reference) | 3.1 s (Oniks contact), 13.5 s (Oniks inside) at 0.25 m. The bonds take ~30 ns each in JS. |
| 2 | XPBD with small steps (CPU) | Same per-step cost as explicit. Matches the reference at 25 µs (1.3 mm) and 50 µs (2.9 mm) steps, 2x faster at 50 µs; at 100+ µs it goes soft (2x the deflection) and loses the shock through the hole. Not worth it. |
| 3 | Local patch (only nodes the shock moves > 2 m/s, + 1.5 m) | Hellfire contact 5.7x faster, identical (0.2 mm). A 120 kg charge moves the whole 24 m panel, so it barely helps big hits. Kept as an option. |
| 4 | Lumped compartment gas with orifice venting | Built into every solver (cheap, CPU). |
| 5 | Global collapse layer | Lives in the game (`game/src/game/structure/`, hull girder sections as rigid bodies), fed by local failures. Not part of this bench. |
| 6 | **The explicit model on the GPU** (WebGL2 passes: bonds / nodes / cells) | Same physics as the reference: identical results on outside hits, within ~10 % on the chaotic inside case. **25–40x faster**; the GPU cost barely grows with the number of nodes (per-step overhead dominates), so a finer grid costs only the extra steps. |

What made the GPU fast: line of sight for the shock done on the GPU every step, crack starts predicted from the
shock (no readback), torn cells read back asynchronously only when gas needs them, mass scaling x64 once only
the slow gas load is left (results within ~10 % of x16, x256 drifts).

## Grid convergence (GPU)

| Case | 0.25 m | 0.125 m | 0.0625 m |
|---|---|---|---|
| Oniks contact, side torn | 1.69 m² | 1.52 m² | 1.93 m² |
| Oniks inside, side torn | 2.06 m² | 6.7 m² | 5.8 m² |
| Oniks 5 m, dish | 68 mm | 47 mm | – |

0.125 m agrees with 0.0625 m; 0.25 m under-tears thick plating driven by gas and no fracture-strain setting
fixes it. **0.125 m is the grid to use.** Dishing at 5 m sits next to the Nurick–Martin panel estimate (~53 mm).

## Results at the chosen setting (GPU, 0.125 m, x64 gas phase)

| Case | Side | Weather deck | 2nd deck | Bulkhead | Max set | GPU run |
|---|---|---|---|---|---|---|
| 30 mm HE contact | – | – | – | – | 0 mm | 106 ms |
| 127 mm HE contact | 0.09 m² | – | – | – | 5 mm | 150 ms |
| Hellfire contact | 0.09 m² | – | – | – | 8 mm | 132 ms |
| Oniks 5 m standoff | – | – | – | – | 47 mm | 129 ms |
| Oniks contact | 1.52 m² | – | 3.28 m² | 2.11 m² | 121 mm | 163 ms |
| Oniks inside (1.6 m in) | 7.41 m² | 12.0 m² | 20.8 m² | 23.8 m² | 5.5 m | 710 ms |
| Missile cells ×8, motors burn | – | 1.89 m² | 5.73 m² | 1.91 m² | 0.78 m | 518 ms |
| Missile cells ×8, mass detonation | 29.2 m² | 75 m² | 55 m² | 51 m² | section gone | 822 ms |
| Fuel tank vapour burn | – | – | – | – | 40 mm | 495 ms |

In a game frame the GPU issues ~100 steps in ~6 ms, so an outside hit resolves in ~0.3 s and an inside one in
~2 s of frames, behind the fireball. Many hits can share one set of textures (one patch per hit), so several
hits cost about the same as one.

## Still open

- Hole sizes at contact are not yet calibrated against measured test data (a literature agent is collecting
  plate deflection/mode data from structural-impact papers; the tear threshold `TEAR_K` and fracture strain
  `EF_MESH` get fitted to it).
- The shock passes through a hole at full strength (no diffraction loss), which over-tears plating behind small holes.
- Collision on the GPU corrects position and velocity but doesn't push back on the struck plate.
