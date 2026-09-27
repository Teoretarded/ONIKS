/* Impact test (Inspect, sandbox): strike the inspected unit with any round in the game and watch the real hit.

   B in the Inspect view of a unit (sandbox) opens it. A column on the right lists every munition the game knows (built
   from data/units.js: every PROJ round, then every gun of every unit, so a new round or gun appears here by itself):
   class chip, name, warhead mass. Click a point on the model to strike it there, or F to strike at the aim preset
   (click point · random · waterline · deck). The round comes in along the camera's line of sight (Camera) or from a
   bearing / elevation set on the dial (Dial: ← → bearing, PgUp PgDn elevation, or click the dial). A waterline strike
   skims in (elevation at most 3°), a deck strike dives (at least 50°). R repeats the last strike exactly, Z steps the
   time x1 / x0.25 / x0.1 / x0.02 (shown on screen), C resets (marks, fires, smoke and debris gone; after sim damage a
   fresh unit of the type takes the old one's place), D applies the sim's damage (off: visual only).

   On a ship a blast charge is solved on the GPU (game/src/blast): the plating dents, tears and petals as the solver
   goes, never ahead of the time shown (at x0.1 / x0.02 the tear follows the fireball); the readout shows the solver's
   physical time against the hit's, the torn plating (skin, under the water, decks and bulkheads inside), the plating's
   set and how long the GPU took.

   The hit is the game's own: sim 'hit' events through game.dispatchEvents (scars.js carves the hole and seats the fire,
   fx lays the hull blast, splash, torpedo column; debris blows off the struck module), at the round's real size and
   speed; with sim damage on, sim/damage.js applyDamage takes it as a real hit (parts disabled, flooding, the unit can
   be lost). Visual only, the part damage the hit would do is kept here, and a module it would destroy is blown off
   (the debris system's own 'part' handling, fed directly: nothing reaches the sim). Gun rounds come as a burst: a few
   hits spread over the burst's length, the tracers drawn coming in.

   createImpact(I) -> { on, toggle(V), leave(), update(dt), draw3d(), draw2d(ctx, W, H, A), onKey(e), onPointer(ev, x, y),
   readout(F, Wt), keys(), reserve } for inspect.js. I = { game, sim, R, cam, O, pcam, state() (the open view) } */
import { applyDamage } from '../../sim/damage.js';
import { partNear } from '../../sim/bodies.js';
import { attitude } from '../../engine/models.js';
import { spawnUnit, removeUnits } from '../../game/sandbox.js';
import { WH } from '../../game/scars.js';

const D2R = Math.PI / 180;
const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const SPEEDS = [1, .25, .1, .02];
const AIMS = ['click', 'random', 'waterline', 'deck'];
const ORDER = ['ASCM', 'LACM', 'ASM', 'ATGM', 'SAM', 'AAM', 'SHELL', 'GUN', 'TORP'];
/* the warhead's kind, public-reference level (a round of a newer class falls back to 'HE') */
const WCLASS = { ASCM: 'HE penetrator', LACM: 'HE', ASM: 'HE penetrator', ATGM: 'Tandem HEAT', SAM: 'Blast-frag', AAM: 'Blast-frag',
  SHELL: 'HE', TORP: 'HE · under keel', GUN: 'HE' };
const GUN = { ciws: { name: 'Phalanx 20 mm', wc: 'Tungsten APDS', ke: true }, gun30: { name: '2A38M 30 mm', wc: 'HE-frag' },
  rws: { name: 'M2HB 12.7 mm', wc: 'Ball / AP', ke: true } };

/* every round and gun in the game, sorted by class */
export function munitions(UNITS, PROJ) {
  const out = [];
  for (const k in PROJ) {
    const P = PROJ[k], kg = WH[k] !== undefined ? WH[k] : (P.dmg || 10) * 2.5;
    out.push({ key: k, name: P.name || k, cls: P.cls || 'RND', wc: WCLASS[P.cls] || 'HE', kg, model: P.model || null, speed: P.speed || 300,
      dmg: P.dmg || 10, torpedo: !!P.torpedo, gun: null });
  }
  const seen = new Set();
  for (const t in UNITS) {
    const d = UNITS[t];
    for (const w in d.weapons || {}) {
      const W = d.weapons[w];
      if (!W.gun || seen.has(w)) continue;
      seen.add(w);
      const g = GUN[w] || {}, lab = Object.values(d.parts || {}).find(p => p.disables && p.disables.includes(w));
      out.push({ key: w, name: g.name || (lab ? lab.label.replace(/\s*×\d+$/, '') : w), cls: 'GUN', wc: g.wc || 'HE', kg: WH[w] !== undefined ? WH[w] : .1,
        ke: !!g.ke, model: null, speed: W.v0 || 1000, dmg: 0, torpedo: false, gun: W, on: d.name });
    }
  }
  const rank = c => { const i = ORDER.indexOf(c); return i < 0 ? ORDER.length : i; };
  out.sort((a, b) => rank(a.cls) - rank(b.cls) || b.kg - a.kg);
  for (const m of out) m.kgTxt = m.ke ? 'KE' : m.kg >= 10 ? `${Math.round(m.kg)} kg` : m.kg >= 1 ? `${m.kg.toFixed(1)} kg` : `${m.kg.toFixed(2)} kg`;
  return out;
}

export function createImpact(I) {
  const { game, sim, R, cam, O } = I;
  const LIME = O.LIME, CORAL = O.CORAL;
  const list = munitions(game.UNITS, game.PROJ);
  const st = {
    on: false, sel: Math.max(0, list.findIndex(m => m.key === 'oniks')), aim: 'click', from: 'camera', brg: 90, elev: 8, speed: 1,
    simDmg: false, touched: false, last: null, shot: null, hover: null, hoverAt: 0, mouse: null, res: null, xrWas: null,
  };
  const owned = [];                      // fx effects our strikes laid: { e, id } (taken out on reset)
  const vdmg = new Map();                // unit id -> { part: damage } the visual-only hits would have done
  const hitBoxes = [];                   // panel chips this frame: { box, fn }
  const clouds = new Map();              // model key -> { P, N, n, sp, r, yDeck }
  const M = [1, 0, 0, 0, 1, 0, 0, 0, 1], w3 = [0, 0, 0], s3 = [0, 0, 0], s4 = [0, 0, 0];
  const inst = { key: '', T: [0, 0, 0], R: [1, 0, 0, 0, 1, 0, 0, 0, 1], st: {}, tint: null, alpha: 1 };
  let dialBox = null, PW = 300, lastW = 1920;

  const cur = () => list[st.sel];
  const V = () => { const S = I.state(); return S && S.kind === 'unit' ? S : null; };
  const unitOf = () => { const S = V(); return S ? sim.units.get(S.id) : null; };
  const fxSys = () => game.getSystem('fx');
  const usable = (m, u) => !m.torpedo || (u && u.def.domain === 'sea' && !u.def.hover);
  const toast = (text, bad) => game.bus.emit('toast', { text, bad });
  function setRate(r) {
    st.speed = r;
    if (game.timeRate !== r || game.paused) { game.timeRate = r; game.paused = false; game.bus.emit('rate', { rate: r, paused: false, why: 'inspect' }); }
  }

  /* ------------------------------------------------------------ the unit's surface: its model's dots, model frame */
  function cloudOf(u) {
    const key = u.def.model;
    let C = clouds.get(key);
    if (C) return C;
    if (!R.models.has(key)) return null;
    const e = R.models.get(key), stt = (u.def.modelState ? u.def.modelState(u, game.t) : u.st) || {};
    const want = Math.max(.12, e.L / 420);
    let lod = 0; while (lod < e.lods.length - 1 && e.lods[lod] < want) lod++;
    const Ps = [], Ns = [];
    let sp = 0;
    for (const P of e.parts) {
      if (P.part.inside) continue;
      let shown = true; try { shown = !P.part.show || !!P.part.show(stt); } catch (err) { shown = true; }
      if (!shown) continue;
      let cl = null; try { cl = R.models.cloud(e, P, lod, stt, true); } catch (err) { cl = null; }
      if (!cl || !cl.n) continue;
      let X = null; try { X = P.part.xf ? P.part.xf(stt) : null; } catch (err) { X = null; }
      const f = cl.pts, by = new Int8Array(f.buffer, f.byteOffset, cl.n * 16), step = Math.max(1, Math.ceil(cl.n / 9000));
      sp = Math.max(sp, (cl.sp || want) * Math.sqrt(step));
      for (let i = 0; i < cl.n; i += step) {
        let x = f[i * 4], y = f[i * 4 + 1], z = f[i * 4 + 2], nx = by[i * 16 + 12] / 127, ny = by[i * 16 + 13] / 127, nz = by[i * 16 + 14] / 127;
        if (X) {
          const Q = X.R, T = X.T;
          const x2 = Q[0] * x + Q[1] * y + Q[2] * z + T[0], y2 = Q[3] * x + Q[4] * y + Q[5] * z + T[1], z2 = Q[6] * x + Q[7] * y + Q[8] * z + T[2];
          const n0 = Q[0] * nx + Q[1] * ny + Q[2] * nz, n1 = Q[3] * nx + Q[4] * ny + Q[5] * nz, n2 = Q[6] * nx + Q[7] * ny + Q[8] * nz;
          x = x2; y = y2; z = z2; nx = n0; ny = n1; nz = n2;
        }
        Ps.push(x, y, z); Ns.push(nx, ny, nz);
      }
    }
    const n = Ps.length / 3;
    if (!n) return null;
    // the main deck: the height most upward-facing dots share (a flight deck, not the island's roof)
    const hist = new Map();
    let rr = 0;
    for (let i = 0; i < n; i++) {
      rr = Math.max(rr, Math.hypot(Ps[i * 3], Ps[i * 3 + 1], Ps[i * 3 + 2]));
      if (Ns[i * 3 + 1] > .8) { const b = Math.round(Ps[i * 3 + 1]); hist.set(b, (hist.get(b) || 0) + 1); }
    }
    let yDeck = null, hb = 0; for (const [b, c] of hist) if (c > hb) { hb = c; yDeck = b; }
    C = { P: Float32Array.from(Ps), N: Float32Array.from(Ns), n, sp: Math.max(sp, .15), r: rr, yDeck, L: e.L };
    clouds.set(key, C);
    return C;
  }
  /* the part a model-frame point belongs to has been blown off (debris): not a surface any more */
  function goneFn(id) { const D = game.debris; return D && D.gone ? D.gone(id) : null; }
  /* first surface along a model-frame ray (o, d unit) within tol of it, facing the ray -> { p, n, s } | null */
  function cast(C, o, d, tol) {
    const P = C.P, N = C.N, t2 = tol * tol;
    let bs = 1e9, bi = -1;
    for (let i = 0, n = C.n; i < n; i++) {
      const vx = P[i * 3] - o[0], vy = P[i * 3 + 1] - o[1], vz = P[i * 3 + 2] - o[2];
      const s = vx * d[0] + vy * d[1] + vz * d[2];
      if (s <= 0 || s >= bs) continue;
      if (vx * vx + vy * vy + vz * vz - s * s > t2) continue;
      const nd = N[i * 3] * d[0] + N[i * 3 + 1] * d[1] + N[i * 3 + 2] * d[2], nn = N[i * 3] ** 2 + N[i * 3 + 1] ** 2 + N[i * 3 + 2] ** 2;
      if (nn > .01 && nd > .35) continue;
      bs = s; bi = i;
    }
    if (bi < 0) return null;
    return { p: [P[bi * 3], P[bi * 3 + 1], P[bi * 3 + 2]], n: [N[bi * 3], N[bi * 3 + 1], N[bi * 3 + 2]], s: bs };
  }
  /* world <-> model frame of the drawn unit */
  function frame(u) {
    const p = game.unitPose(u), A = attitude(p.hdg, p.pitch || 0, p.roll || 0);
    for (let i = 0; i < 9; i++) M[i] = A[i];
    return p;
  }
  const toModelDir = (d, o) => { o[0] = M[0] * d[0] + M[3] * d[1] + M[6] * d[2]; o[1] = M[1] * d[0] + M[4] * d[1] + M[7] * d[2]; o[2] = M[2] * d[0] + M[5] * d[1] + M[8] * d[2]; return o; };
  const toWorldDir = (d, o) => { o[0] = M[0] * d[0] + M[1] * d[1] + M[2] * d[2]; o[1] = M[3] * d[0] + M[4] * d[1] + M[5] * d[2]; o[2] = M[6] * d[0] + M[7] * d[1] + M[8] * d[2]; return o; };
  function toModelPt(p, pos, o) { const x = p[0] - pos[0], y = p[1] - pos[1], z = p[2] - pos[2]; o[0] = M[0] * x + M[3] * y + M[6] * z; o[1] = M[1] * x + M[4] * y + M[7] * z; o[2] = M[2] * x + M[5] * y + M[8] * z; return o; }
  function toWorldPt(h, pos, o) { o[0] = pos[0] + M[0] * h[0] + M[1] * h[1] + M[2] * h[2]; o[1] = pos[1] + M[3] * h[0] + M[4] * h[1] + M[5] * h[2]; o[2] = pos[2] + M[6] * h[0] + M[7] * h[1] + M[8] * h[2]; return o; }

  /* the round's direction of travel, model frame: from the camera's line of sight or the dial; a waterline strike skims
     in, a deck strike dives */
  function approach(u, dw) {
    const out = [0, 0, 0];
    if (st.from === 'dial') {
      const b = st.brg * D2R, e = st.elev * D2R;
      out[0] = -Math.sin(b) * Math.cos(e); out[1] = -Math.sin(e); out[2] = -Math.cos(b) * Math.cos(e);
    } else toModelDir(dw || cam.f, out);
    if (st.aim === 'waterline' || st.aim === 'deck') {
      const hz = Math.hypot(out[0], out[2]) || 1, el = Math.asin(clamp(-out[1], -1, 1));
      const e = st.aim === 'deck' ? Math.max(el, 50 * D2R) : Math.min(Math.max(el, 0), 3 * D2R);
      out[0] = out[0] / hz * Math.cos(e); out[2] = out[2] / hz * Math.cos(e); out[1] = -Math.sin(e);
    }
    return out;
  }
  /* a point for the aim preset along the approach din (model frame) -> { p, n } | null */
  function presetPoint(u, C, din) {
    const B = u.def.size[1], sea = u.def.domain === 'sea' && !u.def.hover, air = u.def.domain === 'air';
    let y0 = -1e9, y1 = 1e9;
    for (let i = 0; i < C.n; i++) { const y = C.P[i * 3 + 1]; if (y < y1) y1 = y; if (y > y0) y0 = y; }
    const H = y0 - y1, ok = [];
    for (let i = 0; i < C.n; i++) {
      const x = C.P[i * 3], y = C.P[i * 3 + 1], nx = C.N[i * 3], ny = C.N[i * 3 + 1], nz = C.N[i * 3 + 2];
      const face = nx * din[0] + ny * din[1] + nz * din[2];
      if (st.aim === 'random') { if (face < -.2) ok.push(i); }
      else if (st.aim === 'waterline') {
        if (face > -.3) continue;
        if (sea ? y > .3 && y < 2.4 : air ? ny < -.3 : y < y1 + Math.max(.5, H * .3)) ok.push(i);
      } else if (st.aim === 'deck') {
        if (ny < .75) continue;
        if (C.yDeck !== null && Math.abs(y - C.yDeck) < 1.6 && Math.abs(x) < B * .4) ok.push(i);
      }
    }
    for (let k = 0; k < 24 && ok.length; k++) {
      const i = ok[Math.floor(Math.random() * ok.length)], t = [C.P[i * 3], C.P[i * 3 + 1], C.P[i * 3 + 2]];
      const far = C.r * 2 + 40, o = [t[0] - din[0] * far, t[1] - din[1] * far, t[2] - din[2] * far];
      const h = cast(C, o, din, C.sp * 1.4);
      if (h) return h;
    }
    return null;
  }

  /* ------------------------------------------------------------ strikes */
  /* a strike: the round, the unit, where (model frame) and along what; guns: a burst of hits over its length */
  function strike(h, din) {
    const u = unitOf(), m = cur();
    if (!u || !m) return false;
    if (!usable(m, u)) { toast('TORPEDO · SEA TARGETS ONLY', true); return false; }
    if (!u.alive) { toast('LOST · C RESETS', true); return false; }
    const C = cloudOf(u);
    // it comes into view from about a model length and a half off (a torpedo from further, slowly)
    const lead = clamp(Math.max(90, (C ? C.r : 20) * 1.6) / m.speed, .08, 4);
    const t0 = game.t, sh = { m, id: u.id, h: h.slice(), din: din.slice(), t0, tHit: t0 + lead, lead, hits: [], sent: 0 };
    if (m.gun) {
      // the burst: its length, a handful of hit events spread over it, each carrying its share of the rounds
      const dur = m.gun.burst || 1, N = 8, real = (m.gun.rpm || 3000) * dur / 60;
      for (let i = 0; i < N; i++) {
        const j = [(Math.random() - .5) * 1.2, (Math.random() - .5) * 1.2, (Math.random() - .5) * 1.2];
        sh.hits.push({ t: sh.tHit + dur * (i + .5) / N, j, n: real / N * .6 });
      }
      sh.dur = dur; sh.real = real;
    } else sh.hits.push({ t: sh.tHit, j: null, n: 1 });
    st.shot = sh; st.last = { h: h.slice(), din: din.slice(), key: m.key };
    if (m.model && R.models.has(m.model)) { try { R.models.warm(m.model); } catch (e) { /* */ } }
    if (game.paused || game.timeRate !== st.speed) setRate(st.speed);
    return true;
  }
  function strikePreset() {
    const u = unitOf(); if (!u) return;
    const C = cloudOf(u); if (!C) { toast('NO SURFACE TO STRIKE', true); return; }
    const pose = frame(u), din = approach(u);
    let h = null;
    if (st.aim === 'click') {
      // the last point clicked, else the middle of the side facing the round
      if (st.last && st.last.h) h = { p: st.last.h };
      else { const far = C.r * 2 + 40, o = [-din[0] * far, C.yDeck !== null ? C.yDeck * .5 : 1, -din[2] * far]; h = cast(C, o, din, C.sp * 2) || presetPoint(u, C, din); }
    } else h = presetPoint(u, C, din);
    if (!h) { toast('NO POINT FOR THAT AIM FROM HERE', true); return; }
    void pose;
    strike(h.p, din);
  }
  function repeat() {
    const L = st.last;
    if (!L) { toast('NOTHING TO REPEAT', true); return; }
    const i = list.findIndex(m => m.key === L.key); if (i >= 0) st.sel = i;
    strike(L.h, L.din);
  }
  /* one hit event of the strike now */
  function fire(sh, hk) {
    const u = sim.units.get(sh.id), m = sh.m;
    if (!u || !u.alive) return;
    const pose = frame(u), C = cloudOf(u);
    let h = sh.h;
    if (hk.j && C) {
      // a round of the burst: the aim line moved by its scatter, first surface along it
      const far = C.r * 2 + 40, o = [h[0] + hk.j[0] - sh.din[0] * far, h[1] + hk.j[1] - sh.din[1] * far, h[2] + hk.j[2] - sh.din[2] * far];
      const q = cast(C, o, sh.din, C.sp * 1.4);
      if (!q) return;
      h = q.p;
    }
    const pos = toWorldPt(h, pose.pos, [0, 0, 0]), dw = toWorldDir(sh.din, [0, 0, 0]);
    const d = u.def, part = partNear(d, h[0], h[1], h[2]) || d.partNames[0], part2 = partNear(d, h[0], h[1], h[2], part);
    const ev = { pos, target: u.id, kind: m.key, side: game.ENEMY[u.side], from: 0, part, lab: true };
    let at = pos;
    if (m.torpedo) {
      // under the keel on the side it ran in from
      const sx = h[0] >= 0 ? 1 : -1, hk2 = [sx * d.size[1] * .35, -Math.max(1, (d.draught || 5) * .6), h[2]];
      at = toWorldPt(hk2, pose.pos, [0, 0, 0]);
      ev.pos = [at[0], .5, at[2]]; ev.under = true; ev.depth = -at[1];
    } else ev.vel = [dw[0] * m.speed, dw[1] * m.speed, dw[2] * m.speed];
    if (m.gun) ev.n = +hk.n.toFixed(1);
    const dmg = m.gun ? hk.n * (m.gun.dmgR || .2) : m.dmg;
    const f = fxSys(), n0 = f && f.fx ? f.fx.length : 0;
    sim.emit('hit', ev);
    let brk = null;
    if (st.simDmg) { applyDamage(sim, u, dmg, null, { part, part2, pos: at }); st.touched = true; }
    else brk = visualDamage(u, part, part2, dmg);
    game.dispatchEvents();
    // a module the hit would destroy comes off (debris), visual only: straight to the debris system, not the sim
    if (brk && game.debris && game.debris.onEvent) {
      const P = d.parts[brk];
      try { game.debris.onEvent({ type: 'part', t: sim.t, unit: u.id, side: u.side, part: brk, label: P ? P.label : brk, disables: [], pos: u.pos.slice() }); } catch (e) { console.error('impact: part', e); }
    }
    if (f && f.fx) for (let i = n0; i < f.fx.length; i++) owned.push({ e: f.fx[i], id: u.id });
    const P = d.parts[part];
    st.res = { t: game.realT, m, part: P ? P.label : part, dmg, applied: st.simDmg, hp: u.hp, hpMax: u.hpMax, alive: u.alive, brk: brk ? (d.parts[brk] || {}).label || brk : null,
      h: h.slice(), id: u.id, n: m.gun ? (st.res && st.res.t0 === sh.t0 ? st.res.n + 1 : 1) : 1, t0: sh.t0 };
  }
  /* the part damage a visual-only hit would do (sim/damage.js hurtPart's shares): the part it would destroy, if any */
  function visualDamage(u, part, part2, dmg) {
    let D = vdmg.get(u.id); if (!D) vdmg.set(u.id, D = {});
    const hurt = (p, k) => { const b = D[p] || u.parts[p] || 0, a = Math.min(1, b + dmg / u.hpMax * k); D[p] = a; return b < 1 && a >= 1; };
    let brk = hurt(part, 2.2) ? part : null;
    if (part2 && part2 !== part && hurt(part2, .8) && !brk) brk = part2;
    return brk;
  }

  /* ------------------------------------------------------------ reset */
  function reset() {
    const S = V(), u = unitOf();
    if (!S) return;
    const id = S.id;
    st.shot = null; st.res = null;
    // what our strikes laid: blasts, splashes, columns, smoke
    const f = fxSys();
    if (f && f.fx) for (const o of owned) { const i = f.fx.indexOf(o.e); if (i >= 0) f.fx.splice(i, 1); }
    owned.length = 0;
    if (f) {
      if (f.falls) f.falls.delete(id);
      if (f.fires && f.fires.get(id)) { const F = f.fires.get(id); F.stop(sim.t); const i = f.fx.indexOf(F); if (i >= 0) f.fx.splice(i, 1); f.fires.delete(id); }
      if (f.hitAt) f.hitAt.delete(id);
    }
    // the debris: pieces of it anywhere near, its masks
    const Dg = game.debris;
    if (Dg && u) {
      const r = (u.def.size[0] || 50) * 1.5 + 400, p = u.pos;
      if (Dg.world && Dg.world.each) Dg.world.each(b => { if (Math.abs(b.p[0] - p[0]) < r && Math.abs(b.p[2] - p[2]) < r) Dg.world.release(b); });
      try { Dg.onEvent({ type: 'removed', t: sim.t, unit: id, side: u.side }); } catch (e) { /* */ }
    }
    const d = game.drawn && game.drawn.get(id); if (d) { d.partAlpha = null; d.scars = null; }
    if (game.scars && game.scars.clear) game.scars.clear(id);
    vdmg.delete(id);
    if (u && (st.touched || !u.alive)) {
      // the sim took the damage: a fresh one of the type in her place (hp, parts, flooding, ammo as new)
      const type = u.type, side = u.side, x = u.pos[0], z = u.pos[2], hdg = u.hdg;
      removeUnits(game, [id]);
      const nu = spawnUnit(game, type, side, x, z, { hdg, deployed: true });
      game.dispatchEvents();
      if (nu) { S.id = nu.id; S.u = nu; S.lostT = 0; S.lostWhy = ''; S.dmg = {}; S.subj.simMapFor = null; }
    }
    st.touched = false;
    toast('DAMAGE RESET');
  }

  /* ------------------------------------------------------------ per frame */
  function update() {
    if (!st.on) return;
    const S = V();
    if (!S) { leave(); return; }
    const sh = st.shot;
    if (sh) {
      while (sh.sent < sh.hits.length && game.t >= sh.hits[sh.sent].t) { const hk = sh.hits[sh.sent++]; try { fire(sh, hk); } catch (e) { console.error('impact: hit', e); } }
      if (sh.sent >= sh.hits.length && game.t > sh.tHit + (sh.dur || 0) + .5) st.shot = null;
      if (sh.id !== S.id) st.shot = null;
    }
    // the point under the cursor (a few times a second)
    const mm = st.mouse;
    if (mm && game.realT - st.hoverAt > .06) {
      st.hoverAt = game.realT;
      st.hover = null;
      const u = unitOf();
      if (u && !mm.panel && !S.drag) {
        const C = cloudOf(u);
        if (C) {
          const pose = frame(u), ray = cam.ray(mm.x, mm.y), o = toModelPt(ray.o, pose.pos, [0, 0, 0]), dm = toModelDir(ray.d, [0, 0, 0]);
          const q = cast(C, o, dm, Math.max(C.sp * 1.3, .2));
          if (q) st.hover = { h: q.p, n: q.n, din: dm };
        }
      }
    }
  }

  /* the round coming in (its model, flame and trail), a gun burst's tracers, a torpedo's track */
  function draw3d(frameInfo) {
    const sh = st.shot;
    if (!st.on || !sh) return;
    const u = sim.units.get(sh.id); if (!u) return;
    const m = sh.m, pose = frame(u), t = game.t, sink = game.sink;
    const hw = toWorldPt(sh.h, pose.pos, [0, 0, 0]), dw = toWorldDir(sh.din, [0, 0, 0]);
    if (m.gun) {
      // tracers: each round a short hot streak on its line, arriving over the burst
      const nR = Math.min(60, Math.round(sh.real || 30)), v = m.speed, dur = sh.dur || 1;
      for (let i = 0; i < nR; i++) {
        const ta = sh.tHit + dur * i / nR, a = ta - t;
        if (a < 0 || a > sh.lead) continue;
        const jx = Math.sin(i * 12.9898) * .8, jy = Math.sin(i * 78.233) * .8;
        const x = hw[0] - dw[0] * v * a + jx, y = hw[1] - dw[1] * v * a + jy, z = hw[2] - dw[2] * v * a;
        for (let k = 0; k < 4; k++) sink.add(x - dw[0] * k * 1.6, y - dw[1] * k * 1.6, z - dw[2] * k * 1.6, 2, 255, 214 - k * 30, 150 - k * 30, .9 - k * .2);
      }
      return;
    }
    const a = sh.tHit - t;
    if (a < 0) return;
    const v = m.speed, p = [hw[0] - dw[0] * v * a, hw[1] - dw[1] * v * a, hw[2] - dw[2] * v * a];
    if (m.torpedo) {
      // the track on the water: bubbles along the run behind it
      for (let k = 0; k < 90; k++) {
        const s = k * 1.2; if (s > v * (sh.lead - a)) break;
        sink.dot(p[0] - dw[0] * s + Math.sin(k * 3.1) * .5, .25, p[2] - dw[2] * s + Math.cos(k * 2.3) * .5, 1, 236, 240, 236, .7 * (1 - k / 90));
      }
      return;
    }
    // the round itself, closed, along its path
    if (m.model && R.models.has(m.model)) {
      const hdg = Math.atan2(dw[0], dw[2]), pitch = Math.asin(clamp(dw[1], -1, 1)), A = attitude(hdg, pitch, 0);
      inst.key = m.model; inst.T[0] = p[0]; inst.T[1] = p[1]; inst.T[2] = p[2];
      for (let i = 0; i < 9; i++) inst.R[i] = A[i];
      inst.st = {};
      R.draw(inst);
    } else sink.add(p[0], p[1], p[2], 3, 255, 240, 220, 1);
    if (m.cls !== 'SHELL') {
      // its motor: a hot point at the tail, a thin trail laid along the path it flew
      const L = (game.PROJ[m.key] && game.PROJ[m.key].body && game.PROJ[m.key].body[0]) || 4;
      sink.glow(p[0] - dw[0] * L * .55, p[1] - dw[1] * L * .55, p[2] - dw[2] * L * .55, 6, 255, 190, 120, .9);
      const flown = v * (sh.lead - a), n = 70;
      for (let k = 1; k < n; k++) {
        const s = L * .6 + k * Math.max(1.5, flown / n); if (s > flown) break;
        const age = s / v, al = .5 * Math.exp(-age * 1.2) * (1 - k / n);
        sink.dot(p[0] - dw[0] * s, p[1] - dw[1] * s, p[2] - dw[2] * s, 1, 226, 228, 220, al);
      }
    }
  }

  /* ------------------------------------------------------------ 2D */
  function chip(ctx, x, y, id, label, on, fn, a, dim) {
    const b = O.tag(ctx, x, y, id, label, '', { kind: on ? 'lime' : 'ghost', a: a * (dim ? .4 : 1), size: 10 });
    if (b && fn) hitBoxes.push({ box: b, fn });
    return b;
  }
  function draw2d(ctx, W, H, A) {
    hitBoxes.length = 0; dialBox = null; lastW = W;
    const S = V();
    if (!S) return;
    if (!st.on) {
      // the way in: a chip at the top right
      if (game.mode === 'sandbox') chip(ctx, W - 34 - O.tagWidth(ctx, 'B', 'Impact test', '', 10), 74, 'B', 'Impact test', false, () => toggle(S), A);
      return;
    }
    const u = unitOf();
    drawMarks(ctx, W, H, A, u);
    // the column: the rounds, then the settings
    let w = 0;
    for (const m of list) w = Math.max(w, O.tagWidth(ctx, m.cls, m.name, m.kgTxt, 10));
    PW = Math.max(318, w);
    const x0 = W - 34 - PW;
    let y = 66;
    O.kick(ctx, x0 + 2, y + 8, 'Impact test', A);
    y += 22;
    const rh = Math.max(15, Math.min(21, (H - 420 - y) / list.length));
    list.forEach((m, i) => {
      const on = i === st.sel, ok = usable(m, u);
      const b = O.tag(ctx, x0, y, m.cls, m.name, m.kgTxt, { kind: on ? 'lime' : 'ghost', a: A * (ok ? 1 : .35), size: 10, hi: on });
      if (b) hitBoxes.push({ box: [x0, b[1], x0 + PW, b[3]], fn: () => { st.sel = i; if (m.model && R.models.has(m.model)) { try { R.models.warm(m.model); } catch (e) { /* */ } } } });
      y += rh;
    });
    y += 12;
    const F = 'rgba(255,255,255,.36)', row = (lab) => { O.runs(ctx, x0, y + 14, [[lab, F]], { size: 10, a: A }); return x0 + 88; };
    let x = row('Aim · A');
    for (const k of AIMS) { const b = chip(ctx, x, y, '', k === 'waterline' && u && u.def.domain !== 'sea' ? 'Low' : k, st.aim === k, () => { st.aim = k; }, A); x = (b ? b[2] : x) + 4; }
    y += 24; x = row('From · V');
    for (const k of ['camera', 'dial']) { const b = chip(ctx, x, y, '', k, st.from === k, () => { st.from = k; }, A); x = (b ? b[2] : x) + 4; }
    if (st.from === 'dial') { x += 8; O.runs(ctx, x, y + 14, [[`${String(Math.round(st.brg)).padStart(3, '0')}°`, '#FFFFFF'], [' · el ', F], [`${Math.round(st.elev)}°`, '#FFFFFF']], { size: 10.5, a: A }); }
    y += 24; x = row('Time · Z');
    for (const r of SPEEDS) { const b = chip(ctx, x, y, '', `×${r}`, Math.abs(st.speed - r) < 1e-6, () => setRate(r), A); x = (b ? b[2] : x) + 4; }
    y += 24; x = row('Sim dmg · D');
    for (const k of [false, true]) { const b = chip(ctx, x, y, '', k ? 'On' : 'Off', st.simDmg === k, () => { st.simDmg = k; }, A); x = (b ? b[2] : x) + 4; }
    y += 30; x = x0;
    for (const [k, lab, fn] of [['F', 'Strike', strikePreset], ['R', 'Repeat', repeat], ['C', 'Reset', reset]]) {
      const b = O.tag(ctx, x, y, k, lab, '', { kind: 'lime', a: A * (k === 'R' && !st.last ? .4 : 1), size: 10.5 });
      if (b) { hitBoxes.push({ box: b, fn }); x = b[2] + 6; }
    }
    y += 30;
    if (st.from === 'dial') drawDial(ctx, x0 + 40, y + 40, 34, A, u);
  }
  /* the dial: the unit seen from above (bow up), the bearing the round comes from, its elevation */
  function drawDial(ctx, cx, cy, r, A, u) {
    dialBox = [cx - r - 4, cy - r - 4, cx + r + 4, cy + r + 4, cx, cy, r];
    ctx.globalAlpha = A;
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    for (let i = 0; i < 72; i++) { const a = i / 72 * Math.PI * 2, rr = i % 6 === 0 ? r - 4 : r - 1; ctx.fillRect(Math.round(cx + Math.sin(a) * rr), Math.round(cy - Math.cos(a) * rr), 1, 1); }
    // the hull, bow up, as long as the dial allows at its proportions
    const L = u ? u.def.size[0] : 10, B = u ? u.def.size[1] : 3, k = (r * 1.1) / Math.max(L, B);
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(cx - B * k / 2) + .5, Math.round(cy - L * k / 2) + .5, Math.max(2, Math.round(B * k)), Math.max(2, Math.round(L * k)));
    ctx.fillRect(Math.round(cx) - 1, Math.round(cy - L * k / 2) - 3, 2, 2);
    const b = st.brg * D2R, ex = cx + Math.sin(b) * r, ey = cy - Math.cos(b) * r;
    ctx.globalAlpha = 1;
    O.leader(ctx, ex, ey, cx + Math.sin(b) * r * .35, cy - Math.cos(b) * r * .35, LIME, A);
    O.adot(ctx, ex, ey, LIME, A, 5);
    O.runs(ctx, cx + r + 14, cy - 4, [['Brg ', 'rgba(255,255,255,.36)'], [`${String(Math.round(st.brg)).padStart(3, '0')}°`, '#FFFFFF']], { size: 10.5, a: A });
    O.runs(ctx, cx + r + 14, cy + 14, [['Elev ', 'rgba(255,255,255,.36)'], [`${Math.round(st.elev)}°`, '#FFFFFF']], { size: 10.5, a: A });
  }
  /* on the model: the aim (reticle and the line the round will come in on), the round in flight, the last hit */
  function drawMarks(ctx, W, H, A, u) {
    if (!u) return;
    const pose = frame(u), m = cur(), pc = I.pcam;
    const hv = st.hover && !st.shot ? st.hover : null;
    if (hv) {
      const hw = toWorldPt(hv.h, pose.pos, [0, 0, 0]);
      if (pc.project(hw, s3)) {
        const din = st.from === 'dial' || st.aim === 'waterline' || st.aim === 'deck' ? approach(u, toWorldDir(hv.din, [0, 0, 0])) : hv.din;
        const dw = toWorldDir(din, [0, 0, 0]), C = cloudOf(u), Lm = Math.max(12, (C ? C.r : 20) * .9);
        const back = [hw[0] - dw[0] * Lm, hw[1] - dw[1] * Lm, hw[2] - dw[2] * Lm];
        reticle(ctx, s3[0], s3[1], A, usable(m, u) ? LIME : CORAL);
        // (from the camera the line runs into the screen: the tag steps off the reticle)
        if (!pc.project(back, s4) || Math.hypot(s4[0] - s3[0], s4[1] - s3[1]) < 44) { s4[0] = s3[0] + 30; s4[1] = s3[1] - 34; }
        {
          O.leader(ctx, s4[0], s4[1], s3[0], s3[1], LIME, .75 * A);
          O.tag(ctx, s4[0] + (s4[0] > s3[0] ? 6 : -6), s4[1] - 10, m.cls, m.name, `${Math.round(m.speed)} m/s`, { kind: 'lime', a: A, size: 10, align: s4[0] > s3[0] ? 'left' : 'right' });
        }
      }
    }
    const sh = st.shot;
    if (sh && !sh.m.gun && game.t < sh.tHit) {
      const hw = toWorldPt(sh.h, pose.pos, [0, 0, 0]), dw = toWorldDir(sh.din, [0, 0, 0]), a = sh.tHit - game.t;
      const p = [hw[0] - dw[0] * sh.m.speed * a, sh.m.torpedo ? .3 : hw[1] - dw[1] * sh.m.speed * a, hw[2] - dw[2] * sh.m.speed * a];
      if (pc.project(p, s3) && s3[0] > -40 && s3[0] < W + 40 && s3[1] > -40 && s3[1] < H + 40) {
        O.adot(ctx, s3[0], s3[1], LIME, A);
        O.leader(ctx, s3[0], s3[1], s3[0] + 18, s3[1] - 24, LIME, .8 * A);
        O.tag(ctx, s3[0] + 20, s3[1] - 36, sh.m.cls, sh.m.name, `${Math.round(sh.m.speed)} m/s · ${Math.round(sh.m.speed * a)} m`, { kind: 'lime', a: A, size: 10 });
      }
    }
    const r = st.res;
    if (r && r.id === u.id && game.realT - r.t < 6) {
      const hw = toWorldPt(r.h, pose.pos, [0, 0, 0]), a = A * (1 - sat((game.realT - r.t - 4.5) / 1.5));
      if (pc.project(hw, s3)) {
        const val = r.applied ? `Dmg ${r.dmg.toFixed(1)} · HP ${Math.max(0, Math.ceil(r.hp))} / ${r.hpMax}` : `Dmg ${r.dmg.toFixed(1)} · visual`;
        O.adot(ctx, s3[0], s3[1], CORAL, a);
        O.leader(ctx, s3[0], s3[1], s3[0] - 26, s3[1] + 34, CORAL, .8 * a);
        const b = O.tag(ctx, s3[0] - 28, s3[1] + 34, r.m.gun ? `Hit ×${r.n}` : 'Hit', r.part, val, { kind: 'coral', a, size: 10, align: 'right' });
        if (b && r.brk) O.tag(ctx, b[2], b[3] + 4, 'Part', r.brk, r.applied ? 'destroyed' : 'destroyed · visual', { kind: 'coral', a, size: 10, align: 'right' });
      }
    }
  }
  function reticle(ctx, x, y, a, col) {
    ctx.globalAlpha = a; ctx.fillStyle = col;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let k = 5; k <= 13; k += 2) ctx.fillRect(Math.round(x + dx * k), Math.round(y + dy * k), 1, 1);
    ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
    ctx.globalAlpha = 1;
  }

  /* ------------------------------------------------------------ input */
  function onKey(e) {
    if (e.type !== 'keydown') return false;
    if (e.code === 'KeyB') { if (!e.repeat) toggle(I.state()); return true; }
    if (!st.on) return false;
    switch (e.code) {
      case 'KeyF': if (!e.repeat) strikePreset(); return true;
      case 'KeyR': if (!e.repeat) repeat(); return true;
      case 'KeyC': if (!e.repeat) reset(); return true;
      case 'KeyD': st.simDmg = !st.simDmg; toast(st.simDmg ? 'SIM DAMAGE ON · PARTS TAKE IT' : 'VISUAL ONLY'); return true;
      case 'KeyZ': { const i = SPEEDS.findIndex(r => Math.abs(r - st.speed) < 1e-6); setRate(SPEEDS[(i + 1) % SPEEDS.length]); return true; }
      case 'KeyA': st.aim = AIMS[(AIMS.indexOf(st.aim) + 1) % AIMS.length]; return true;
      case 'KeyV': st.from = st.from === 'camera' ? 'dial' : 'camera'; return true;
      case 'ArrowUp': case 'ArrowDown': st.sel = (st.sel + (e.code === 'ArrowUp' ? -1 : 1) + list.length) % list.length; return true;
      case 'ArrowLeft': case 'ArrowRight': st.from = 'dial'; st.brg = (st.brg + (e.code === 'ArrowRight' ? 15 : -15) + 360) % 360; return true;
      case 'PageUp': case 'PageDown': st.from = 'dial'; st.elev = clamp(st.elev + (e.code === 'PageUp' ? 5 : -5), -5, 85); return true;
    }
    return false;
  }
  /* x, y: the 2D layer's 1080p px */
  function onPointer(ev, x, y) {
    if (ev.type === 'click' && ev.button === 0) {
      for (const h of hitBoxes) { const b = h.box; if (x >= b[0] - 2 && x <= b[2] + 2 && y >= b[1] - 2 && y <= b[3] + 2) { h.fn(); return true; } }
      if (!st.on) return false;
      if (dialBox && x >= dialBox[0] && x <= dialBox[2] && y >= dialBox[1] && y <= dialBox[3]) {
        st.brg = (Math.round(Math.atan2(x - dialBox[4], -(y - dialBox[5])) / D2R / 5) * 5 + 360) % 360; return true;
      }
      // on the model: strike there
      const u = unitOf(), C = u && cloudOf(u);
      if (!C) return false;
      const pose = frame(u), ray = cam.ray(ev.x, ev.y), o = toModelPt(ray.o, pose.pos, [0, 0, 0]), dm = toModelDir(ray.d, [0, 0, 0]);
      const q = cast(C, o, dm, Math.max(C.sp * 1.3, .2));
      if (!q) return false;
      st.aim = 'click';
      const din = st.from === 'dial' ? approach(u) : dm;
      if (st.from === 'dial') {
        // the dial's line through the point clicked: first surface along it
        const far = C.r * 2 + 40, o2 = [q.p[0] - din[0] * far, q.p[1] - din[1] * far, q.p[2] - din[2] * far];
        const q2 = cast(C, o2, din, Math.max(C.sp * 1.3, .2));
        strike((q2 || q).p, din);
      } else strike(q.p, din);
      return true;
    }
    if (ev.type === 'move') {
      let panel = false;
      if (st.on) {
        if (x > lastW - 34 - PW - 20) panel = true;
        for (const h of hitBoxes) { const b = h.box; if (x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]) panel = true; }
      }
      st.mouse = { x: ev.x, y: ev.y, panel };
      if (panel || !st.on) st.hover = null;
    }
    return false;
  }

  function toggle(S) {
    if (!S || S.kind !== 'unit' || game.mode !== 'sandbox') return;
    if (st.on) { leave(); return; }
    st.on = true;
    // the hull solid (no x-ray ghosting), assembled; time at x1
    st.xrWas = S.xr.on; S.xr.on = false; if (S.ex.on) S.ex.on = false;
    const u = unitOf(); if (u) cloudOf(u);
    setRate(1);
    toast('IMPACT TEST · CLICK THE MODEL · F STRIKE');
  }
  function leave() {
    if (!st.on) return;
    st.on = false; st.shot = null; st.hover = null;
    const S = I.state();
    if (S && st.xrWas !== null) S.xr.on = st.xrWas;
    st.xrWas = null;
  }
  /* lines for the readout block (inspect.js drawReadout) */
  function readout(F, Wt) {
    if (!st.on) return [];
    const m = cur(), L = [];
    L.push([['Impact test', LIME], [' · ', F], [st.simDmg ? 'sim damage on' : 'visual only', st.simDmg ? CORAL : Wt]]);
    L.push([['Round ', F], [m.name, Wt], [' · ', F], [m.cls, Wt], [m.on ? ` · ${m.on}` : '', F]]);
    L.push([['Warhead ', F], [m.wc, Wt], [' · ', F], [m.kgTxt, Wt], [' · ', F], [`${Math.round(m.speed)} m/s`, Wt]]);
    const r = st.res;
    if (r) L.push([['Last ', F], [r.part, CORAL], [' · dmg ', F], [r.dmg.toFixed(1), Wt], [r.applied ? ' · applied' : ' · not applied', F]]);
    // the blast solver on the last strike (game/src/blast)
    const u = unitOf(), Bs = game.blast, B = u && Bs ? Bs.last(u.id) : null;
    if (Bs && !Bs.mode && Bs.mode !== 'boot') L.push([['Solver ', F], ['off', Wt], [' · analytic marks', F]]);
    else if (B && r && B.t0 >= (r.t0 || 0) - 1e-6 && B.meta) {
      const ms = v => v < 1 ? `${(v * 1000).toFixed(v < .01 ? 1 : 0)} ms` : `${v.toFixed(2)} s`;
      const shown = Math.max(0, game.t - B.t0);
      const st2 = B.state === 'done' ? 'settled' : B.state === 'fail' ? 'failed' : B.state === 'wait' ? 'building' : 'solving';
      L.push([['Solver ', F], [st2, B.state === 'fail' ? CORAL : LIME], [' · ', F], [ms(B.tSolve || 0), Wt], [B.state === 'done' ? '' : ` of ${ms(shown)} shown`, F],
        [B.info ? ` · ${B.info.solver === 'shell' ? 'shell FE' : 'lattice'} · ${Math.round(B.info.N / 1000)}k nodes` : '', F], [B.state === 'done' && B.wallMs ? ` · ${(B.wallMs / 1000).toFixed(1)} s` : '', F]]);
      const bp = B.byPlate || [], inner = bp.reduce((a, b) => a + b, 0) - (B.torn || 0);
      L.push([['Torn ', F], [`${(B.torn || 0).toFixed(2)} m²`, (B.torn || 0) > 0 ? CORAL : Wt], [' skin · ', F], [`${(B.below || 0).toFixed(2)} m²`, (B.below || 0) > 0 ? CORAL : Wt],
        [' under water · ', F], [`${Math.max(0, inner).toFixed(1)} m²`, Wt], [' inside · ', F], [`${(B.openM2 || 0).toFixed(1)} m²`, Wt], [' bent open', F]]);
      L.push([['Set ', F], [`${Math.round((B.setMax || 0) * 1000)} mm`, Wt], [' · ', F], [B.meta.kind && B.meta.kind.startsWith('cookoff') ? B.meta.kind.slice(8) : `${B.meta.W >= 10 ? Math.round(B.meta.W) : (B.meta.W || 0).toFixed(1)} kg TNT · ${B.meta.fz === 'in' ? 'inside' : B.meta.fz === 'frag' ? 'blast-frag' : 'contact'}`, Wt],
        [B.res && B.res.framesTorn ? ` · ${B.res.framesTorn} frames torn` : '', F]]);
    }
    return L;
  }
  function keys() {
    return [['Click', 'Strike there'], ['F', 'Strike'], ['R', 'Repeat'], ['↑ ↓', 'Round'], ['A', 'Aim'], ['V', 'From'], ['Z', 'Time'], ['D', 'Sim dmg'], ['C', 'Reset'], ['B', 'End test']];
  }
  return {
    get on() { return st.on; }, get reserve() { return st.on ? PW + 60 : 0; }, st, list,
    toggle, leave, update, draw3d, draw2d, onKey, onPointer, readout, keys, reset, strike: strikePreset, repeat,
    /* console: pick a round by key, set the aim / approach */
    set(o) {
      if (o.round) { const i = list.findIndex(m => m.key === o.round); if (i >= 0) st.sel = i; }
      for (const k of ['aim', 'from', 'brg', 'elev', 'simDmg']) if (o[k] !== undefined) st[k] = o[k];
      if (o.speed !== undefined) setRate(o.speed);
      return st;
    },
  };
}
