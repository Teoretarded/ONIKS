/* Dev: stage a solved hit and take stills (in play.html's console):
     const B = await import('/game/src/blast/lab.js');
     await B.stage(ONIKS, { type: 'ddg', loc: [10, 3, 4], kind: 'oniks', from: [1, .05, 0], rate: .1,
       view: { yaw: 2, pitch: .15, dist: 22 }, shots: [[.02, 'a'], [.2, 'b'], [3, 'c']] })
   A fresh unit at a clear spot (so earlier marks never get in the way), the UI hidden, the camera on the hit (yaw
   relative to her heading: 0 from ahead, PI/2 from starboard), the time rate, the hit through the sim's own path, stills
   at the given game seconds after it (ONIKS.still -> game/shots/<name>.png). Returns the patch's numbers. */
import { spawn, hit, look } from '../dev/scar_lab.js';

const wait = ms => new Promise(r => setTimeout(r, ms));
let slot = 0;
export async function stage(O, o = {}) {
  const g = O.game, sim = O.sim;
  const ref = [...sim.units.values()].find(u => u.def.domain === 'sea') || { pos: [0, 0, 0] };
  const k = ++slot, x = ref.pos[0] + 2500 + (k % 4) * 900, z = ref.pos[2] + 2500 + Math.floor(k / 4) * 900;
  const id = o.id || spawn(O, o.type || 'ddg', x, z, o.hdg || 0, o.side);
  g.setUiHidden && g.setUiHidden(o.ui !== true);
  const v = o.view || {};
  look(O, id, v.loc || o.loc, { yaw: v.yaw !== undefined ? v.yaw : Math.PI / 2 + .4, pitch: v.pitch !== undefined ? v.pitch : .12, dist: v.dist || 30 });
  await wait(o.pre || 2500);
  if (o.rate) g.setRate(o.rate);
  const t0 = g.t;
  const r = hit(O, id, o.loc, o.kind || 'oniks', { from: o.from || [1, .05, 0], dmg: o.dmg !== undefined ? o.dmg : 0 });
  const B = g.blast && g.blast.last(id);
  const out = { id, hit: r, shots: [] };
  for (const [ts, name] of o.shots || []) {
    while (g.t - t0 < ts) await wait(16);
    const aim = B && B.spec ? B.spec.frame.O : (v.loc || o.loc);
    if (o.follow !== false) look(O, id, v.loc || aim, { yaw: v.yaw !== undefined ? v.yaw : Math.PI / 2 + .4, pitch: v.pitch !== undefined ? v.pitch : .12, dist: v.dist || 30 });
    await O.still(name);
    out.shots.push([name, +(g.t - t0).toFixed(3), B ? +(B.tSolve * 1000).toFixed(1) : null, B ? +(B.torn || 0).toFixed(2) : null]);
  }
  if (o.rate) g.setRate(1);
  if (B) {
    const t1 = performance.now();
    while (B.state !== 'done' && B.state !== 'fail' && performance.now() - t1 < (o.maxWait || 15000)) await wait(50);
    Object.assign(out, { state: B.state, torn: B.torn, below: B.below, byPlate: B.byPlate, setMm: Math.round((B.setMax || 0) * 1000), wallMs: Math.round(B.wallMs || 0),
      simMs: +(B.tSolve * 1000).toFixed(1), N: B.info && B.info.N, frames: B.res && B.res.framesTorn, kind: B.spec.kind, charge: B.spec.charge });
  }
  return out;
}
