/* Dev check: the bench's test section (game/concepts/blast: 24 m of a destroyer's side, 10 mm HSLA, frames 2.5 m,
   longitudinals 0.75 m, weather deck 9.5 mm, second deck and a bulkhead 6.5 mm, four compartments) built as a patch
   spec and run on this module's runner, to compare with the bench (BLAST.runCase) case by case.
     const C = await import('/game/src/blast/check.js'); await C.run({ kg: 120, fuze: 'contact' })
   -> { areas: [side, weather deck, 2nd deck, bulkhead] m^2, setMm, simMs, steps, ms } */
import { createRunner } from './runner.js';
import { chargeR } from './phys.js';

export function benchSpec(o = {}) {
  const XA = -12, XZ = 12, YB = -2, YI = 3.5, YD = 7, ZI = -6, XBH = 6, S = .125;
  const plates = [
    { ax: 2, val: 0, u0: XA, u1: XZ, v0: YB, v1: YD, h: (o.h || 10) / 1000, mat: o.mat || 'hsla', fu: 2.5, pu: XA, fv: .75, pv: YB, heavy: 30e-4, light: 12e-4, skin: 1 },
    { ax: 1, val: YD, u0: XA, u1: XZ, v0: ZI, v1: 0, h: .0095, mat: 'mild', fu: 2.5, pu: XA, fv: 1, pv: ZI, heavy: 30e-4, light: 10e-4, skin: 1 },
    { ax: 1, val: YI, u0: XA, u1: XZ, v0: ZI, v1: 0, h: .0065, mat: 'mild', fu: 2.5, pu: XA, fv: 1, pv: ZI, heavy: 20e-4, light: 8e-4 },
    { ax: 0, val: XBH, u0: ZI, u1: 0, v0: YB, v1: YD, h: .0065, mat: 'mild', fu: 0, fv: 1, pv: YB, heavy: 0, light: 8e-4 },
  ];
  const comps = [
    { b: [XA, YB, ZI, XBH, YI, 0], V: (XBH - XA) * (YI - YB) * -ZI },
    { b: [XBH, YB, ZI, XZ, YI, 0], V: (XZ - XBH) * (YI - YB) * -ZI },
    { b: [XA, YI, ZI, XBH, YD, 0], V: (XBH - XA) * (YD - YI) * -ZI },
    { b: [XBH, YI, ZI, XZ, YD, 0], V: (XZ - XBH) * (YD - YI) * -ZI },
  ];
  const W = o.kg !== undefined ? o.kg : 120, a = o.aim || [0, 2.2, 0];
  let C;
  if (o.C) C = o.C;
  else if (o.fuze === 'inside') C = [a[0], a[1], a[2] - 1.6];
  else C = [a[0], a[1], a[2] + (o.fuze === 'standoff' ? o.standoff || 3 : chargeR(W) + .05)];
  return { S, plates, box: [XA, YB, ZI, XZ, YD, 0], comps, depth: 6, frame: { O: [0, 0, 0], X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] },
    charge: { C, W: o.W !== undefined ? o.W : W, Wgas: o.Wgas || 0, vapour: o.vapour || 0 }, wl: -1e9, syncReads: true, watch: false };
}

let RUN = null;
function runner() {
  if (RUN) return RUN;
  const cv = new OffscreenCanvas(1, 1), gl = cv.getContext('webgl2');
  RUN = createRunner(gl, { pool: { rows: 400 } });
  RUN.gl = gl;
  return RUN;
}
const wait = ms => new Promise(r => setTimeout(r, ms));
/* one case to the end, as fast as it goes */
export async function run(o = {}) {
  const Rn = runner(), id = (run.n = (run.n || 0) + 1);
  const t0 = performance.now();
  const info = Rn.submit(id, o.spec || benchSpec(o));
  Rn.target(id, 10, !!o.watch);
  let fin = null;
  while (!fin) {
    const out = Rn.pump(o.steps || 200);
    for (const m of out) { if (m.id === id && m.final) fin = m; if (m.type === 'fail') throw new Error(m.err); }
    if (!fin) { Rn.gl.finish(); await wait(0); }
  }
  const ms = performance.now() - t0;
  Rn.drop(id);
  return { areas: fin.byPlate.map(a => +a.toFixed(2)), setMm: Math.round(fin.setMax * 1000), simMs: +(fin.t * 1000).toFixed(1), steps: fin.steps, ms: Math.round(ms),
    buildMs: Math.round(info.buildMs), N: info.N, K: info.K, results: fin.results, fin };
}
/* several at once (the batch): they share the passes */
export async function runMany(list) {
  const Rn = runner(), ids = [];
  const t0 = performance.now();
  for (const o of list) { const id = (run.n = (run.n || 0) + 1); Rn.submit(id, o.spec || benchSpec(o)); Rn.target(id, 10, false); ids.push(id); }
  const fin = new Map();
  while (fin.size < ids.length) {
    for (const m of Rn.pump(200)) if (m.final) fin.set(m.id, m);
    Rn.gl.finish(); await wait(0);
  }
  for (const id of ids) Rn.drop(id);
  return { ms: Math.round(performance.now() - t0), each: ids.map(id => { const f = fin.get(id); return { areas: f.byPlate.map(a => +a.toFixed(2)), setMm: Math.round(f.setMax * 1000), simMs: +(f.t * 1000).toFixed(1) }; }) };
}
