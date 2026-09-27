/* Dev check: the shell bench's test box (game/concepts/blast/blast.js sceneBox at 200fe28: 30 m of a destroyer's side,
   weather / second / platform decks, two bulkheads, nine spaces) as a patch spec, solved by this module's shell runner
   on the main thread, to compare with the bench's runCase.
     const C = await import('/game/src/blast/shell/check.js'); C.start({ kg: 120, casing: 130, fuze: 'contact', grid: .25 }); ...
   (async reads between yields, as the bench's runCaseAsync; { webgpu: true } on WebGPU, as its runCaseAsync where it has
   WebGPU; { sync: true } reads blocking, as its runCase). start() is async (the WebGPU device).
     C.result   (null until done: { areas: [side, weather deck, decks, bulkheads] m^2, setMm, simMs, steps, ms }) */
import { createShellRunner } from './runner.js';
import { initWebGPU } from './gpu_wgpu.js';
import { ventsOf } from '../spec.js';
let dev = null;

export function boxSpec(o = {}) {
  const XA = -15, XZ = 15, YB = -2, YI = 3.5, YD = 7, ZC = -10, XB = [-10, 5], ZF = -20;
  const h = (o.h || 10) / 1000, mat = o.mat || 'hsla';
  const plates = [
    { ax: 2, val: 0, u0: XA, u1: XZ, v0: YB, v1: YD, h, mat, fv: .75, pv: YB, fu: 2.5, pu: XA, skin: 1, kind: 0, open: [1, 1, 1, 0] },
    { ax: 1, val: YD, u0: XA, u1: XZ, v0: ZC, v1: 0, h: .0095, mat: 'mild', fv: 1, pv: 0, fu: 2.5, pu: XA, skin: 1, kind: 1, open: [1, 1, 1, 0] },
    { ax: 1, val: YI, u0: XA, u1: XZ, v0: ZC, v1: 0, h: .0065, mat: 'mild', fv: 1, pv: 0, fu: 2.5, pu: XA, kind: 2, open: [1, 1, 1, 0] },
    { ax: 1, val: YB, u0: XA, u1: XZ, v0: ZC, v1: 0, h: .008, mat: 'mild', fv: 1, pv: 0, fu: 2.5, pu: XA, kind: 2, open: [1, 1, 1, 0] },
    ...XB.map(x => ({ ax: 0, val: x, u0: ZC, u1: 0, v0: YB, v1: YD, h: .0065, mat: 'mild', fu: .75, pu: 0, kind: 3, open: [1, 0, 1, 0] })),
  ];
  const xb = [-25, XB[0], XB[1], 20], yb = [YB - 5, YB, YI, YD], comps = [];
  for (let iy = 0; iy < 3; iy++) for (let ix = 0; ix < 3; ix++) {
    const b = [xb[ix], yb[iy], ZF, xb[ix + 1], yb[iy + 1], 0];
    comps.push({ b, V: (b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]) });
  }
  const fill = o.kg !== undefined ? o.kg : 120, rc = Math.cbrt(3 * Math.max(fill, .01) / (4 * Math.PI * 1600)), a = o.aim || [0, 2.2, 0];
  const C = o.C || (o.fuze === 'inside' ? [a[0], a[1], a[2] - 1.6] : [a[0], a[1], a[2] + (o.fuze === 'standoff' ? Math.max(o.standoff || 3, rc) : rc)]);
  // (the bench's shut openings on its spaces: the game's ventsOf; frame brackets come with a side patch, sceneOf)
  return { latMs: o.latMs || 1, vents: o.vents === false ? [] : ventsOf(comps, 1, YD), S: o.grid || .25, shellS: o.grid || .25, plates, box: [XA, YB, ZC, XZ, YD, 0], comps, depth: 10, kind: 'side', frame: { O: [0, 0, 0], X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] },
    charge: { C, fill, Mc: o.casing !== undefined ? o.casing : 130, mf: o.mf || .03, Wgas: o.Wgas || 0, vapour: o.vapour || 0 }, wl: -1e9, wlLocal: 0, watch: false, solver: 'shell', syncReads: !!o.sync, fastEnd: !!o.fastEnd, scatter: o.scatter || 0, seed: o.seed || 0 };
}
export let result = null, runner = null, t0 = 0, last = null;
export function progress() { const R = runner && [...runner.pats.values()][0]; return R ? { t: R.M.sim.t, steps: R.steps, relax: R.M.sim.relax, T1: R.M.sim.T1, ms: Math.round(performance.now() - t0), state: R.state } : result; }
export async function start(o = {}) {
  result = null;
  const cv = new OffscreenCanvas(1, 1), gl = cv.getContext('webgl2');
  if (o.webgpu && !dev) dev = await initWebGPU();
  const Rn = runner = createShellRunner(gl, { wg: o.webgpu ? dev : null, batch: 200, depth: 3 }); t0 = performance.now();
  const info = Rn.submit(1, boxSpec(o)); Rn.target(1, 10, false);
  const ch = new MessageChannel();
  const tick = () => {
    for (const R of Rn.pats.values()) last = R;
    for (const m of Rn.pump(o.chunk || (o.webgpu ? 200 : 50))) if (m.final) {
      const areas = [0, 0, 0, 0], R = m;
      const spec = boxSpec(o), kinds = spec.plates.map(p => p.kind);
      R.byPlate.forEach((a, p) => { areas[kinds[p]] += a; });
      // torn (eroded) cells by plate, as the bench's byPanel; byPlate also counts the cells of pieces cut loose (debris)
      const Mm = last.M, er = spec.plates.map(() => 0); for (let c = 0; c < Mm.NC; c++) if (Mm.CER[c]) er[Mm.CPAN[c]] += Mm.CAR[c];
      result = { torn: er.map(a => +a.toFixed(2)), areas: areas.map(a => +a.toFixed(2)), byPlate: R.byPlate.map(a => +a.toFixed(2)), setMm: Math.round(R.setMax * 1000), simMs: +(R.t * 1000).toFixed(1), steps: R.steps, ms: Math.round(performance.now() - t0), N: info.N, dt: info.dt };
      return;
    }
    ch.port2.postMessage(0);
  };
  ch.port1.onmessage = tick; tick();
  return info;
}
