/* Blast QA battery (dev, visual / performance QA of ship hits). In play.html?mode=sandbox&intro=0's console:
     const Q = await import('/game/src/dev/blast_qa.js');
     Q.start(ONIKS, { only: ['ddg_bow'] })     // runs in the background (works with the page hidden); window.QA holds progress
     QA.done, QA.rows                           // one row a case: resolve time, frame p50/p95, torn area, systems, qa check
     Q.table()                                  // the rows as a markdown table (QA.md)
   Each case: a fresh unit at a clear spot, the UI hidden, the hit through the sim's own path (dev/scar_lab.js hit), the
   game driven frame by frame at 60 Hz of game time (each frame GPU-synced and timed; yields between frames so the
   solver's worker runs), stills at 1 s after the hit (two close angles) and once settled (solve done + debris landed):
   close 60 m from two angles, a detail 25 m, a wide 300 m -> game/shots/qa/<case>_<tag>.png. The floating-dot check
   (game/src/blast/qa.js) runs on the settled state when it exists. */
import { spawn, hit, look } from './scar_lab.js';
import { kill } from '../sim/damage.js';
import { removeUnits } from '../game/sandbox.js';
import { attitude } from '../engine/models.js';

const PI = Math.PI;
const FACE = { stbd: [PI / 2, .16], port: [-PI / 2, .16], fwd: [0, .16], aft: [PI, .16], deck: [PI / 2, .85], deckP: [-PI / 2, .85] };

/* model frame: +X starboard, +Y up (0 the waterline), +Z bow. from: toward where the round came from */
export const CASES = [
  // DDG-51
  { id: 'ddg_bow', type: 'ddg', kind: 'oniks', loc: [10, 5, 60], from: [1, .05, 0], face: 'stbd' },
  { id: 'ddg_mid', type: 'ddg', kind: 'oniks', loc: [10, 4, 0], from: [1, .05, 0], face: 'stbd' },
  { id: 'ddg_sheer', type: 'ddg', kind: 'oniks', loc: [10, 6.6, -5], from: [1, .05, 0], face: 'stbd' },
  { id: 'ddg_wl', type: 'ddg', kind: 'oniks', loc: [10, .8, -10], from: [1, .02, 0], face: 'stbd' },
  { id: 'ddg_gundeck', type: 'ddg', kind: 'oniks', loc: [3, 9, 61], from: [.25, 1, .35], face: 'deck' },
  { id: 'ddg_spy', type: 'ddg', kind: 'oniks', loc: [7, 14, 27], from: [1, .1, .6], face: 'stbd' },
  { id: 'ddg_house', type: 'ddg', kind: 'uran', loc: [9.8, 10, -5], from: [1, .05, 0], face: 'stbd' },
  { id: 'ddg_mast', type: 'ddg', kind: 'shell', loc: [1, 30, 19], from: [1, .2, 0], face: 'stbd' },
  { id: 'ddg_vls', type: 'ddg', kind: 'oniks', loc: [0, 6.2, -29], from: [.4, 1, 0], face: 'deck' },
  { id: 'ddg_hangar', type: 'ddg', kind: 'oniks', loc: [0, 8, -53.5], from: [0, .1, -1], face: 'aft' },
  { id: 'ddg_stern', type: 'ddg', kind: 'oniks', loc: [9, 3, -70], from: [1, .05, 0], face: 'stbd' },
  { id: 'ddg_kh35', type: 'ddg', kind: 'uran', loc: [-10, 4, 30], from: [-1, .05, 0], face: 'port' },
  { id: 'ddg_sm6', type: 'ddg', kind: 'sm6', loc: [10, 6, 10], from: [1, .15, 0], face: 'stbd' },
  { id: 'ddg_127', type: 'ddg', kind: 'shell', loc: [10, 5, 20], from: [1, .05, 0], face: 'stbd' },
  { id: 'ddg_30mm', type: 'ddg', kind: 'gun30', loc: [10, 5, 5], from: [1, .05, 0], face: 'stbd', burst: 10 },
  { id: 'ddg_cookoff', type: 'ddg', cook: 'vlsF', face: 'deck', loc: [0, 7.4, 39], settle: 20 },
  { id: 'ddg_breakup', type: 'ddg', kind: 'oniks', loc: [10, 3, -5], from: [1, .05, 0], face: 'stbd', dmg: 999, settle: 40 },
  // flooding: a hole under the water, its spread over time
  { id: 'ddg_below', type: 'ddg', kind: 'oniks', loc: [9.9, -1.2, -12], from: [1, -.05, 0], face: 'stbd', ff: 180 },
  { id: 'ddg_wl_ff', type: 'ddg', kind: 'oniks', loc: [10, .8, 20], from: [1, .02, 0], face: 'stbd', ff: 180 },
  // CG-47
  { id: 'cg_side', type: 'cg', kind: 'oniks', loc: [8.4, 4, -10], from: [1, .05, 0], face: 'stbd' },
  { id: 'cg_deck', type: 'cg', kind: 'oniks', loc: [2, 8, 58], from: [.25, 1, .3], face: 'deck' },
  // CVN-68
  { id: 'cvn_side', type: 'carrier', kind: 'oniks', loc: [30, 8, 110], from: [1, .05, 0], face: 'stbd' },
  { id: 'cvn_deck', type: 'carrier', kind: 'oniks', loc: [0, 19.6, 80], from: [.2, 1, .3], face: 'deckP' },
  { id: 'cvn_island', type: 'carrier', kind: 'oniks', loc: [21.5, 35, -30], from: [-1, .1, 0], face: 'port' },
  // LCS-2
  { id: 'lcs_side', type: 'lcs', kind: 'oniks', loc: [4.2, 4, 40], from: [1, .05, 0], face: 'stbd' },
  { id: 'lcs_kh35', type: 'lcs', kind: 'uran', loc: [15.8, 6, 0], from: [1, .05, 0], face: 'stbd' },
  // LHD-1
  { id: 'lhd_side', type: 'lhd', kind: 'oniks', loc: [15.9, 10, 30], from: [1, .05, 0], face: 'stbd' },
  { id: 'lhd_deck', type: 'lhd', kind: 'oniks', loc: [0, 18.3, 60], from: [.2, 1, .3], face: 'deck' },
];

const q = [];
let chan = null;
/* yield to the event loop without timers (a hidden page throttles setTimeout to ~1 s) */
function yieldNow() {
  if (!chan) { chan = new MessageChannel(); chan.port1.onmessage = () => { const f = q.shift(); f && f(); }; }
  return new Promise(r => { q.push(r); chan.port2.postMessage(0); });
}
const pct = (a, p) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(2); };

/* one frame of 1/60 s game time: rendered, GPU-synced and timed; then ~16.7 ms of real time handed to the worker */
async function frame(O, rec) {
  const gl = O.R.gl, px = new Uint8Array(4), a = performance.now();
  O.advance(1 / 60, 1);
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const ms = performance.now() - a;
  if (rec) rec.push(ms);
  while (performance.now() - a < 16.7) await yieldNow();
  return ms;
}
async function frames(O, n, rec) { for (let i = 0; i < n; i++) await frame(O, rec); }

let slot = 0;
function clearSpot(O) {
  // open water away from the other side: the fleet ship furthest from the coast side's units, then 3 km further out
  const sim = O.sim, all = [...sim.units.values()];
  const coast = all.filter(u => u.side === 'coast' && u.alive);
  const cx = coast.reduce((a, u) => a + u.pos[0], 0) / Math.max(1, coast.length), cz = coast.reduce((a, u) => a + u.pos[2], 0) / Math.max(1, coast.length);
  const sea = all.filter(u => u.def.domain === 'sea' && u.side !== 'coast');
  let ref = sea[0] || { pos: [0, 0, 0] }, bd = -1;
  for (const u of sea) { const d = Math.hypot(u.pos[0] - cx, u.pos[2] - cz); if (d > bd) { bd = d; ref = u; } }
  const dx = ref.pos[0] - cx, dz = ref.pos[2] - cz, l = Math.hypot(dx, dz) || 1;
  const k = ++slot, ox = ref.pos[0] + dx / l * 3000, oz = ref.pos[2] + dz / l * 3000;
  return [ox + (k % 3) * 1200 * (-dz / l), oz + (k % 3) * 1200 * (dx / l) + Math.floor(k / 3) % 4 * 0];
}

function views(c) {
  const [y0, p0] = FACE[c.face] || FACE.stbd, deck = c.face && c.face.startsWith('deck');
  return {
    a: { yaw: y0 + .45, pitch: deck ? .8 : p0, dist: 60 },
    b: { yaw: y0 - .7, pitch: deck ? .5 : .42, dist: 60 },
    d: { yaw: y0 + .2, pitch: deck ? .75 : .1, dist: 25 },
    e: { yaw: y0 + .08, pitch: deck ? 1.1 : .06, dist: 12 },
    w: { yaw: y0 + .35, pitch: .3, dist: 300 },
  };
}

function systems(O, id) {
  const u = O.sim.units.get(id);
  if (!u) return null;
  const mods = [];
  for (const m of u.def.modules || []) { const d = u.mods && u.mods[m.id]; if (d > 0) mods.push(`${m.id}:${Math.round(100 * d / m.hp)}%`); }
  const parts = [];
  for (const p in (u.parts || {})) { const v = u.parts[p]; if (typeof v === 'number' && v > 0) parts.push(`${p}:${Math.round(v)}`); }
  // whatever the systems / flooding model keeps on the unit (names with flood, comp, space, sys, dc), shallow
  const extra = {};
  for (const k in u) if (/flood|comp|space|sys|dc|water/i.test(k) && k !== 'flood' && k !== 'ship') { try { extra[k] = JSON.parse(JSON.stringify(u[k], (a, v) => typeof v === 'number' ? +v.toFixed(3) : v)); } catch (e) { extra[k] = String(u[k]); } }
  // the ship model (sim/ship.js: compartments, systems, flooding) when she has one
  let ship = null;
  const S = u.ship;
  if (S && S.L) {
    const L = S.L, wet = [], fire = [];
    for (let c = 0; c < L.n; c++) {
      const cap = L.vol[c] * L.perm[c];
      if (S.water[c] > .5) wet.push(`${L.ids[c]}:${Math.round(100 * S.water[c] / Math.max(1, cap))}%`);
      if (S.fire[c] > 0) fire.push(L.ids[c]);
    }
    const out = S.sp ? S.sp.nodes.filter(n => !S.ok[n.i]).map(n => n.id) : [];
    const torn = []; if (S.torn) for (let k = 0; k < S.torn.length; k++) if (S.torn[k] > 0) torn.push(`${L.bA ? L.ids[L.bA[k]] : k}>${L.bB && L.bB[k] >= 0 ? L.ids[L.bB[k]] : 'x'}:${S.torn[k].toFixed(1)}`);
    const doors = S.door ? [...S.door].filter(v => v > 0).length : 0;
    ship = { holes: (S.holes || []).map(h => `${L.ids[h.c]} y${h.y.toFixed(1)} ${h.A.toFixed(1)}m2${h.sea ? ' sea' : ''}`), wet, fire, out, torn, doorsOpen: doors,
      w: Math.round(S.w || 0), sink: +(S.sink || 0).toFixed(2), list: +((S.list || 0) * 57.3).toFixed(1), trim: +((S.trim || 0) * 57.3).toFixed(2), prop: S.prop, caps: S.caps };
  }
  return { hp: Math.round(u.hp), hpMax: u.hpMax, flood: +(u.flood || 0).toFixed(3), fire: +(u.fire || 0).toFixed(1), alive: u.alive, mods, parts, extra, ship };
}

/* an exact view (the orbit camera rides its target on the sea surface and tilts up when low: not usable close to a
   hull): the eye at dist from the model-frame point, from yaw (model frame: 0 from ahead, PI/2 from starboard) and
   pitch above, looking at the point; the unit's full pose (list, trim, sinking) */
function exactView(O, id, loc, v) {
  const u = O.sim.units.get(id); if (!u) return null;
  const P = O.game.unitPose ? O.game.unitPose(u) : { pos: u.pos, hdg: u.hdg };
  const M = attitude(P.hdg, P.pitch || 0, P.roll || 0), p0 = P.pos;
  const w = q => [p0[0] + M[0] * q[0] + M[1] * q[1] + M[2] * q[2], p0[1] + M[3] * q[0] + M[4] * q[1] + M[5] * q[2], p0[2] + M[6] * q[0] + M[7] * q[1] + M[8] * q[2]];
  const a = v.yaw, pc = v.pitch, d = v.dist;
  const e = [loc[0] + d * Math.cos(pc) * Math.sin(a), loc[1] + d * Math.sin(pc), loc[2] + d * Math.cos(pc) * Math.cos(a)];
  const eye = w(e); eye[1] = Math.max(eye[1], 1.5);
  return { eye, look: w(loc) };
}
async function shot(O, id, loc, v, name) {
  const V = exactView(O, id, v.loc || loc, v);
  look(O, id, v.loc || loc, { yaw: 0, pitch: .3, dist: Math.max(40, v.dist) });
  if (V) for (let i = 0; i < 4; i++) { O.cam.view = V; O.advance(0, 1); }
  if (V) O.cam.view = V;
  await O.still(name, 0, 0);
}

export async function runCase(O, c, o = {}) {
  const g = O.game, sim = O.sim, dir = o.dir || 'qa';
  const [x, z] = clearSpot(O);
  // the player on the struck ship's side for the systems cases (the log and Inspect report own ships in full)
  if ((c.ff || o.hud) && g.setSide && g.side !== 'fleet') g.setSide('fleet');
  const id = spawn(O, c.type, x, z, 0);
  g.setUiHidden && g.setUiHidden(true);
  const V = views(c), row = { id: c.id, type: c.type, kind: c.cook ? 'cookoff' : c.kind, shots: [] };
  look(O, id, c.loc, V.a);
  const base = [];
  await frames(O, 30);
  await frames(O, 60, base);
  row.base = [pct(base, .5), pct(base, .95)];
  const t0 = g.t, s0 = sim.t, u = sim.units.get(id);
  // the hit
  if (c.cook) {
    const m = u.def.modules.find(m => m.id === c.cook), b = m.box, C = m.cook || {};
    const at = [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2];
    u.cook = u.cook || {}; u.cook[m.id] = true; u.mods[m.id] = m.hp;
    const cs = Math.cos(u.hdg), sn = Math.sin(u.hdg);
    sim.emit('cookoff', { unit: u.id, type: u.type, side: u.side, module: m.id, label: m.label, part: m.part,
      pos: [u.pos[0] + at[0] * cs + at[2] * sn, u.pos[1] + at[1], u.pos[2] - at[0] * sn + at[2] * cs], at, size: C.size, out: 'kill', fire: 0, depth: 0 });
    if (C.out !== 'heavy') { u.hp = -u.hpMax; kill(sim, u, null); }
    g.dispatchEvents();
  } else if (c.burst) {
    for (let i = 0; i < c.burst; i++) {
      const j = [c.loc[0], c.loc[1] + Math.sin(i * 2.3) * 1.2, c.loc[2] + Math.cos(i * 1.7) * 1.5];
      hit(O, id, j, c.kind, { from: c.from, dmg: 1 });
      await frames(O, 3);
    }
  } else {
    hit(O, id, c.loc, c.kind, { from: c.from, dmg: c.dmg });
  }
  const B = g.blast && g.blast.last && g.blast.last(id);
  row.patch = !!B;
  const SC = g.scars && g.scars.last && g.scars.last(id);
  const aim = SC && isFinite(SC.x) ? [SC.x, SC.y, SC.z] : c.loc;
  row.at = aim.map(v => +v.toFixed(1));
  const rec = [], maxT = o.maxT || 70;
  let shot1 = false, doneAt = null;
  while (g.t - t0 < maxT) {
    await frame(O, rec);
    const t = g.t - t0;
    if (!shot1 && t >= 1) {
      shot1 = true;
      await shot(O, id, aim, V.a, `${dir}/${c.id}_1s_a60`); await shot(O, id, aim, V.b, `${dir}/${c.id}_1s_b60`);
      row.shots.push('1s_a60', '1s_b60'); look(O, id, c.loc, V.a);
      if (c.ff || o.hud) { g.setUiHidden && g.setUiHidden(false); await frame(O); await O.hudShot(`${dir}/${c.id}_1s_hud`); g.setUiHidden && g.setUiHidden(true); }
    }
    const solved = !B || B.state === 'done' || B.state === 'fail';
    if (solved && doneAt === null) doneAt = t;
    if (doneAt !== null && shot1 && t - doneAt >= (c.settle || 3)) break;
  }
  row.resolve = B ? (B.state === 'done' ? +((B.doneT || sim.t) - s0).toFixed(2) : B.state) : null;
  row.wallMs = B ? Math.round(B.wallMs || 0) : null;
  row.solve = [pct(rec, .5), pct(rec, .95), rec.length];
  if (B) Object.assign(row, { flapM2: +(B.openM2 || 0).toFixed(2), torn: +(B.torn || 0).toFixed(2), below: +(B.below || 0).toFixed(2), setMm: Math.round((B.setMax || 0) * 1000), frames: B.res && B.res.framesTorn,
    byPlate: (B.byPlate || []).map(v => +v.toFixed(2)), W: B.meta && B.meta.W && +B.meta.W.toFixed(1), err: B.err });
  // settled stills
  for (const [k, tag] of [['a', 'set_a60'], ['b', 'set_b60'], ['d', 'set_d25'], ['e', 'set_e12'], ['w', 'set_w300']]) { await shot(O, id, aim, V[k], `${dir}/${c.id}_${tag}`); row.shots.push(tag); }
  row.sys = systems(O, id);
  // flooding over time: the sim run ahead (no rendering), the state again and a wide still
  if (c.ff) { const lost = []; const oe = sim.emit.bind(sim); sim.emit = (t, e) => { if (e && (e.unit === id || e.target === id) && lost.length < 40) lost.push([t, +sim.t.toFixed(1), JSON.stringify(e, (a, v) => typeof v === 'number' ? +v.toFixed(3) : v).slice(0, 240)]); return oe(t, e); }; O.ff(c.ff); sim.emit = oe; row.ffEvents = lost; O.advance(.1, 3); row.sys2 = systems(O, id); await shot(O, id, aim, V.w, `${dir}/${c.id}_ff${c.ff}_w300`); await shot(O, id, aim, V.a, `${dir}/${c.id}_ff${c.ff}_a60`); row.shots.push('ff'); }
  // what the player is told: the HUD (its log) and the Inspect view of her with X-ray (systems out, flooded spaces)
  if (c.ff || o.hud) {
    try {
      g.setUiHidden && g.setUiHidden(false);
      for (let i = 0; i < 5; i++) await frame(O);
      await shot(O, id, aim, V.b, `${dir}/${c.id}_hud_bare`);
      await O.hudShot(`${dir}/${c.id}_hud`);
      const I = g.inspect, IS = g.getSystem && g.getSystem('inspect');
      O.cam.view = null;
      if (I && I.open) {
        I.open(id); for (let i = 0; i < 90; i++) await frame(O);
        await O.hudShot(`${dir}/${c.id}_inspect`);
        if (IS && IS.onKey) { IS.onKey({ code: 'KeyX', key: 'x', preventDefault() {}, stopPropagation() {} }); for (let i = 0; i < 90; i++) await frame(O); await O.hudShot(`${dir}/${c.id}_xray`); }
        I.close(); for (let i = 0; i < 150; i++) await frame(O);
      }
      row.shots.push('hud', 'inspect', 'xray');
    } catch (e) { row.hudErr = String(e && e.message); }
    g.setUiHidden && g.setUiHidden(true);
  }
  // the floating-dot check, when game/src/blast/qa.js exists
  try {
    const QM = await import('/game/src/blast/qa.js');
    const r = QM.check(O, { unit: id }), k = {};
    for (const f of r.flags || []) k[f.kind] = (k[f.kind] || 0) + (f.n || 1);
    row.qa = { ok: r.ok, k, flags: (r.flags || []).slice(0, 12), stats: r.stats, err: r.err };
  } catch (e) { row.qa = 'n/a: ' + (e && e.message); }
  row.ms = Math.round(performance.now());
  if (o.keep !== true) { if (g.blast && g.blast.dropUnit) g.blast.dropUnit(id); removeUnits(g, [id]); }
  await frames(O, 10);
  return row;
}

export function start(O, o = {}) {
  const list = CASES.filter(c => !o.only || o.only.includes(c.id) || o.only.some(p => p.endsWith('*') && c.id.startsWith(p.slice(0, -1))));
  const QA = window.QA = { done: false, rows: [], cur: null, err: [], n: list.length };
  (async () => {
    for (const c of list) {
      QA.cur = c.id;
      try { QA.rows.push(await runCase(O, c, o)); } catch (e) { QA.err.push([c.id, String(e && e.stack || e)]); }
    }
    QA.cur = null; QA.done = true;
    O.game.setUiHidden && O.game.setUiHidden(false);
  })();
  return QA;
}

export function table(rows = window.QA.rows) {
  const L = ['| case | round | resolve s | solver wall ms | frame p50/p95 ms (base) | torn m2 (below) | set mm | frames | sim: flood / damaged modules | qa |', '|---|---|---|---|---|---|---|---|---|---|'];
  for (const r of rows) L.push(`| ${r.id} | ${r.kind} | ${r.resolve ?? '-'} | ${r.wallMs ?? '-'} | ${r.solve[0]}/${r.solve[1]} (${r.base[0]}/${r.base[1]}) | ${r.torn ?? '-'} (${r.below ?? '-'}) | ${r.setMm ?? '-'} | ${r.frames ?? '-'} | ${r.sys ? `${r.sys.flood} / ${r.sys.mods.join(' ') || '-'}` : 'gone'} | ${r.qa === undefined ? '-' : typeof r.qa === 'object' ? (r.qa.ok ? 'ok' : JSON.stringify(r.qa.k)) : r.qa} |`);
  return L.join('\n');
}
