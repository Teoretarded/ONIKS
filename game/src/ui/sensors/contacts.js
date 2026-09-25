/* Contacts and tracks as the player's picture shows them (p5 Confidence, p2 Clutter):
   - a contact (sim.visible === 'contact') is an uncertainty cloud: dots sampled from the unit's own model, set
     round the ESTIMATE (never the truth), each point scattered by the contact's error and (1 - conf): along the
     line of sight a little, across it a lot. Every radar return redraws a share of the points from a tighter
     spread (eased, flashing lime), with a ping ring where the return landed; a dotted 2-sigma ellipsoid; tag
     TRK 21 · ? 0.44 with the class-probability bars.
   - classification (conf >= CLASSIFY): the cloud snaps onto the hull with a lime flash and hands over to the
     coral model (the render system draws tracks); the tag becomes TRK 21 · DDG · ARLEIGH BURKE 0.89 in coral.
   - lost: the cloud spreads and fades, the tag reads LOST.
   - heard emitters: a dotted coral bearing fan from the listening unit toward the emitter.
   Cost: a cloud's point arrays exist only once it is drawn; returns on contacts off screen only mark it for a
   redraw; all clouds share one dot budget per frame (by their size on screen); tags are capped (nearest the
   middle of the screen first), the rest are marks. */
import { LIME, CORAL, WH, TAU, sat, clamp, ss, hsh, gH, outCubic, pad2, wrapPi } from './core.js';
import { sampleOf } from './samples.js';
import { TRACK } from '../../game/labels.js';
import { barsW } from './tags.js';
import { crossW, W1 } from './orb.js';

const CLS_SHOW = { HQ: 'CP' };
const CANDS = { sea: ['DDG', 'CVN'], land: ['TEL', 'RADAR', 'SAM', 'TLV', 'CP', 'UAV-L'], air: ['FTR', 'HELO', 'UAV'] };
const BUDGET = 6500;               // cloud dots per frame, all contacts together
const MAX_TAGS = 20, MAX_FANS = 6, MAX_ELLIPSOIDS = 4, MAX_BARS = 3;

export function createContacts(S) {
  const { game } = S, sim = game.sim, R = game.R;
  const vis = new Map();            // unit id -> cloud state
  const pings = [];                 // { x, y, z, t0, L, kind }
  const q = [0, 0, 0];
  const seen = new Set();
  const drawList = [], fanList = [], ellList = [], tagList = [];

  /* ---------- the state of one contact (cheap; the cloud's arrays come when it is first drawn) ---------- */
  function make(u, c, v) {
    return {
      id: u.id, u, c, key: u.def.model, s: null, n: 0, OP: null, ON: null, TU: null, FL: null, arr: false, dirty: true,
      sig: 0, hits: c.hits, ctr: [c.pos[0], c.pos[1], c.pos[2]], hdg: hsh(u.id, 91) * TAU, los: [1, 0],
      state: v === 'track' ? 'track' : 'contact', tSnap: -9, tLost: 0, born: S.clock, lastPing: -9, conf: c.conf,
      probs: null, shown: null, cands: null, track: c.track, dom: u.def.domain, L: Math.max(u.def.size[0], 1),
      rot: new Float32Array(9), flashT: -9, seenF: -9, px: 0, keyN: 0, fd: 0,
    };
  }
  function arrays(cv) {
    if (cv.arr) return true;
    const s = sampleOf(R, cv.key);
    if (!s) return false;
    const n = s.n;
    cv.s = s; cv.n = n; cv.L = Math.max(s.L, 1);
    cv.OP = new Float32Array(n * 3); cv.ON = new Float32Array(n * 3); cv.TU = new Float32Array(n).fill(-9); cv.FL = new Float32Array(n).fill(-9);
    cv.arr = true; cv.dirty = true;
    return true;
  }
  function sigOf(c, L) { return clamp(Math.min(c.err, 5000) * 1.15 * (1.12 - c.conf), L * .06, 3500); }
  /* the line of sight from the nearest own sensor (radar spread is across it) */
  function losOf(cv) {
    let best = null, bd = 1e18;
    for (const o of sim.alive(game.side)) {
      if (o.aboard || !(o.def.sensors && (o.def.sensors.radar || o.def.sensors.camera))) continue;
      const d = (o.pos[0] - cv.c.pos[0]) ** 2 + (o.pos[2] - cv.c.pos[2]) ** 2;
      if (d < bd) { bd = d; best = o; }
    }
    if (!best) return;
    const dx = cv.c.pos[0] - best.pos[0], dz = cv.c.pos[2] - best.pos[2], l = Math.hypot(dx, dz) || 1;
    cv.los[0] = dx / l; cv.los[1] = dz / l;
  }
  /* redraw point i from the spread (eased from where it is shown now) */
  function resample(cv, i, sig, key, flash, instant) {
    const j = i * 3, OP = cv.OP, ON = cv.ON;
    if (!instant) { const k = easeK(cv, i); OP[j] += (ON[j] - OP[j]) * k; OP[j + 1] += (ON[j + 1] - OP[j + 1]) * k; OP[j + 2] += (ON[j + 2] - OP[j + 2]) * k; }
    const a = gH(i, key) * sig * .42, b = gH(i, key + 2) * sig, vs = cv.dom === 'air' ? sig * .38 : Math.min(sig * .3, cv.L * .35 + 4);
    const h = gH(i, key + 4) * vs;
    const lx = cv.los[0], lz = cv.los[1];
    ON[j] = lx * a + lz * b; ON[j + 1] = h; ON[j + 2] = lz * a - lx * b;
    if (instant) { OP[j] = ON[j]; OP[j + 1] = ON[j + 1]; OP[j + 2] = ON[j + 2]; }
    cv.TU[i] = S.clock; if (flash) cv.FL[i] = S.clock;
  }
  function easeK(cv, i) { const u = (S.clock - cv.TU[i]) / .38; return u >= 1 ? 1 : u <= 0 ? 0 : 1 - (1 - u) * (1 - u) * (1 - u); }

  /* a radar / camera return on this contact */
  function onHit(cv) {
    const c = cv.c;
    cv.sig = sigOf(c, cv.L);
    cv.keyN = (c.hits * 131 + cv.id * 7) & 0xffff;
    const onScreen = game.frameN - cv.seenF < 3;
    if (cv.state === 'contact' && cv.arr && !cv.dirty && onScreen) {
      // on screen: redraw a share of the points from the tighter spread, flashing
      losOf(cv);
      const key = cv.keyN, pd = .45 + .4 * c.conf;
      for (let i = 0; i < cv.n; i++) if (hsh(i, key) < pd) resample(cv, i, cv.sig * (.8 + .4 * hsh(i, key + 9)), key * 3 + 11, true, false);
    } else cv.dirty = true;
    if (onScreen && S.clock - cv.lastPing > .35) { cv.lastPing = S.clock; ping(cv.ctr[0], cv.ctr[1], cv.ctr[2], cv.L, cv.state === 'track' ? 1 : 0); }
  }
  function ping(x, y, z, L, kind) {
    if (pings.length > 48) pings.shift();
    pings.push({ x, y, z, t0: S.clock, L, kind });
  }

  /* ---------- per frame: follow the sim's picture ---------- */
  function update(dt) {
    const side = game.side, S0 = sim.sides[side];
    const now = seen; now.clear();
    const k = 1 - Math.exp(-10 * dt), kc = Math.min(1, dt * 4), kh = Math.min(1, dt * 2);
    if (S0) for (const c of S0.contacts.values()) {
      const u = sim.units.get(c.unitId);
      if (!u || u.aboard) continue;
      now.add(u.id);
      const v = sim.visible(side, u);
      let cv = vis.get(u.id);
      if (!cv || cv.state === 'lost' || cv.c !== c) { cv = make(u, c, v); vis.set(u.id, cv); }
      // the estimate the picture shows (smoothed; the sim moves it every sensor tick)
      if (Math.abs(c.pos[0] - cv.ctr[0]) + Math.abs(c.pos[2] - cv.ctr[2]) > 5000) { cv.ctr[0] = c.pos[0]; cv.ctr[2] = c.pos[2]; }
      cv.ctr[0] += (c.pos[0] - cv.ctr[0]) * k; cv.ctr[2] += (c.pos[2] - cv.ctr[2]) * k;
      const onScreen = game.frameN - cv.seenF < 3;
      const tgtY = cv.dom === 'air' ? c.pos[1] : cv.dom === 'land' ? (onScreen ? Math.max(0, R.terrain.heightAt(cv.ctr[0], cv.ctr[2])) : cv.ctr[1]) : 0;
      cv.ctr[1] += (tgtY - cv.ctr[1]) * k;
      if (c.vel[0] * c.vel[0] + c.vel[2] * c.vel[2] > 4) { const h = Math.atan2(c.vel[0], c.vel[2]); cv.hdg += wrapPi(h - cv.hdg) * kh; }
      cv.conf += (c.conf - cv.conf) * kc;
      if (c.hits !== cv.hits) { cv.hits = c.hits; onHit(cv); }
      if (cv.state === 'contact' && v === 'track') {
        cv.state = 'snap'; cv.tSnap = S.clock; cv.flashT = S.clock;
        if (onScreen) ping(cv.ctr[0], cv.ctr[1], cv.ctr[2], cv.L * 1.6, 2);
      } else if ((cv.state === 'track' || cv.state === 'snap') && v === 'contact') {
        cv.state = 'contact'; cv.sig = sigOf(c, cv.L); cv.dirty = true;
      } else if (cv.state === 'snap' && S.clock - cv.tSnap > 1.2) cv.state = 'track';
    }
    for (const [id, cv] of vis) {
      if (now.has(id)) continue;
      if (cv.state === 'lost') { if (S.clock - cv.tLost > 2.2) vis.delete(id); continue; }
      if (cv.state === 'contact' && cv.arr) { cv.state = 'lost'; cv.tLost = S.clock; }
      else vis.delete(id);
    }
    for (let i = pings.length - 1; i >= 0; i--) if (S.clock - pings[i].t0 > 1) pings.splice(i, 1);
  }

  /* class probabilities (p5): a seeded prior that wanders with the returns, converging on the truth as the
     evidence builds; unknown takes what is left */
  function probsOf(cv) {
    const u = cv.u, dom = cv.dom === 'sea' ? 'sea' : cv.dom === 'air' ? 'air' : 'land';
    if (!cv.cands) { cv.cands = CANDS[dom]; cv.probs = new Float32Array(cv.cands.length + 1); cv.shown = new Float32Array(cv.cands.length + 1); cv.shown[0] = .7; }
    const truth = CLS_SHOW[u.def.cls] || u.def.cls, e = cv.conf / game.CLASSIFY, tn = parseInt(cv.track.slice(4), 10) || cv.id;
    let sum = 0;
    const P = cv.probs;
    for (let i = 0; i < cv.cands.length; i++) {
      let w = .6 + .8 * hsh(tn, i + 3) + .35 * hsh(tn * 13 + cv.hits, i);
      if (cv.cands[i] === truth) w *= 1 + 3 * Math.pow(ss(.35, 1.2, e), 2);
      else w *= 1 - .5 * ss(.45, 1.2, e);
      P[i + 1] = w; sum += w;
    }
    P[0] = cv.cands.length * 1.1 * Math.pow(1 - sat(e), 1.2) + .05; sum += P[0];
    for (let i = 0; i < P.length; i++) { P[i] /= sum; cv.shown[i] += (P[i] - cv.shown[i]) * .12; }
  }

  /* ---------- 3D ---------- */
  const ROT = new Float32Array(9);
  function rotY(h, M) { const c = Math.cos(h), s = Math.sin(h); M[0] = c; M[1] = 0; M[2] = s; M[3] = 0; M[4] = 1; M[5] = 0; M[6] = -s; M[7] = 0; M[8] = c; return M; }
  function draw3d() {
    const fx = R.fx, V = S.V, scope = S.scopeK, frameN = game.frameN;
    // pass 1: what is on screen and how big, against one dot budget
    drawList.length = 0; let want = 0;
    for (const cv of vis.values()) {
      cv.px = 0;
      if (cv.state === 'track') continue;
      if (cv.state === 'lost' && S.clock - cv.tLost > 1.6) continue;
      if (cv.state === 'snap' && S.clock - cv.tSnap > 1.2) continue;
      const sig = cv.sig || sigOf(cv.c, cv.L);
      const cx = cv.ctr[0], cy = cv.ctr[1], cz = cv.ctr[2], ext = cv.L * .6 + sig * 2.4;
      if (!V.vis(cx, cy, cz, ext)) continue;
      const zc = Math.max(V.near, V.depth(cx, cy, cz)), px = ext * V.fl / zc;
      cv.px = px; cv.seenF = frameN;
      if (px < 5) { if (S.orb) crossW(S.W, V, cx, cy + 2, cz, 2.5, W1, .8 * (1 - .75 * scope)); else fx.dotXYZ(cx, cy + 2, cz, 2, WH[0], WH[1], WH[2], .9 * (1 - .75 * scope), 'max'); continue; }
      drawList.push(cv); want += Math.min(5000, px * 4 + 60);
    }
    // (in the radar view the scope's returns and gates stand for the clouds)
    // (the Orbital style: each return a short hairline along the line of sight, fewer of them)
    const kB = Math.min(1, BUDGET * (S.orb ? .4 : 1) * (1 - .6 * scope) / Math.max(1, want));
    if (scope < .6) for (let i = 0; i < drawList.length; i++) { const cv = drawList[i]; cloud(fx, V, cv, Math.max(50, Math.min(5000, cv.px * 4 + 60) * kB), scope); }
    // the 2-sigma ellipsoids of the biggest few (p5)
    if (scope < .5) {
      ellList.length = 0;
      for (let i = 0; i < drawList.length; i++) if (drawList[i].state === 'contact') ellList.push(drawList[i]);
      if (ellList.length > MAX_ELLIPSOIDS) { ellList.sort(byPx); ellList.length = MAX_ELLIPSOIDS; }
      for (let i = 0; i < ellList.length; i++) { const cv = ellList[i]; ellipsoid(fx, cv, V.fl / Math.max(V.near, V.depth(cv.ctr[0], cv.ctr[1], cv.ctr[2])), sat((S.clock - cv.born) / .5)); }
    }
    // pings: a return landing
    for (let i = 0; i < pings.length; i++) {
      const p = pings[i], k = (S.clock - p.t0) / (p.kind === 2 ? 1 : .7); if (k >= 1) continue;
      const zc = Math.max(V.near, V.depth(p.x, p.y, p.z)), mpp = zc / V.fl;
      const r0 = Math.max(p.L * .7, 14 * mpp) * (p.kind === 2 ? 1.6 : 1);
      const rr = r0 * (.25 + outCubic(k) * (p.kind === 2 ? 1.6 : 1));
      const o = S.dotOpt(p.kind === 2 ? LIME : WH, (1 - k) * (p.kind === 1 ? .45 : .85), 3, 1, 'over'); o.max = 400;
      S.ring(p.x, p.y + 1, p.z, rr, o);
    }
    // heard emitters: the bearing fans of the nearest few that are still only contacts
    if (scope < .9) {
      fanList.length = 0;
      const tg = game.camera.target;
      for (const cv of vis.values()) if (cv.c.emitting && cv.state === 'contact') { cv.fd = (cv.ctr[0] - tg[0]) ** 2 + (cv.ctr[2] - tg[2]) ** 2; fanList.push(cv); }
      if (fanList.length > MAX_FANS) { fanList.sort(byFd); fanList.length = MAX_FANS; }
      for (let i = 0; i < fanList.length; i++) fan(fanList[i], 1 - scope);
    }
  }
  const byPx = (a, b) => b.px - a.px, byFd = (a, b) => a.fd - b.fd;
  function cloud(fx, V, cv, dots, scope) {
    const u = cv.u, lost = cv.state === 'lost';
    if (!arrays(cv)) return;
    if (cv.dirty) {
      cv.sig = sigOf(cv.c, cv.L); losOf(cv);
      const key = cv.keyN || 7;
      for (let i = 0; i < cv.n; i++) resample(cv, i, cv.sig * (.8 + .4 * hsh(i, key + 9)), key * 3 + 11 + (i % 5), false, true);
      cv.dirty = false;
    }
    const fade = sat((S.clock - cv.born) / .5) * (lost ? 1 - sat((S.clock - cv.tLost) / 1.6) : 1);
    const al = fade * (1 - .75 * scope);
    const snapK = cv.state === 'snap' ? outCubic((S.clock - cv.tSnap) / .55) : 0;
    const snapOut = cv.state === 'snap' ? 1 - ss(.6, 1.2, S.clock - cv.tSnap) : 1;
    if (al * snapOut <= .01) return;
    // the true pose (the snap goes onto the hull)
    let TR = null, tx = 0, ty = 0, tz = 0;
    if (snapK > 0 && u.alive) {
      const p = game.unitPose(u); tx = p.pos[0]; ty = p.pos[1]; tz = p.pos[2];
      const d = game.drawn.get(u.id); TR = d && d.R ? d.R : rotY(p.hdg, ROT);
    }
    const cx = cv.ctr[0], cy = cv.ctr[1], cz = cv.ctr[2];
    const M = rotY(cv.hdg, cv.rot), s = cv.s, rest = s.rest, nrm = s.nrm, n = cv.n;
    const stride = Math.max(1, Math.round(n / dots));
    // close up, each sampled point stands for a small knot of returns (p5's cloud is dense)
    const mult = stride > 1 ? 1 : Math.min(3, Math.floor(dots / n)), jit = cv.sig * .07 + cv.L * .01;
    const sgn = Math.min(1, cv.sig / (cv.L * .25 + 2));
    const e = V.e, big = cv.px > 220, clock = S.clock, OP = cv.OP, ON = cv.ON, TU = cv.TU, FL = cv.FL;
    // the Orbital style: returns as short hairlines along the line of sight (the radar's range smear), ~3 px long
    const W = S.orb ? S.W : null, lx = cv.los[0], lz = cv.los[1], tick = W ? 1.6 * Math.max(V.near, V.depth(cx, cy, cz)) / V.fl : 0;
    const spread = lost ? 1 + 1.6 * sat((clock - cv.tLost) / 1.6) : 1;
    for (let i = (cv.id * 7) % stride; i < n; i += stride) {
      const j = i * 3;
      const uu = (clock - TU[i]) / .38, kk = uu >= 1 ? 1 : uu <= 0 ? 0 : 1 - (1 - uu) * (1 - uu) * (1 - uu);
      const ox = (OP[j] + (ON[j] - OP[j]) * kk) * spread, oy = (OP[j + 1] + (ON[j + 1] - OP[j + 1]) * kk) * spread, oz = (OP[j + 2] + (ON[j + 2] - OP[j + 2]) * kk) * spread;
      const px0 = rest[j], py0 = rest[j + 1], pz0 = rest[j + 2];
      let x = M[0] * px0 + M[2] * pz0 + cx + ox, y = py0 + cy + oy, z = M[6] * px0 + M[8] * pz0 + cz + oz;
      if (TR) {
        const hx = TR[0] * px0 + TR[1] * py0 + TR[2] * pz0 + tx, hy = TR[3] * px0 + TR[4] * py0 + TR[5] * pz0 + ty, hz = TR[6] * px0 + TR[7] * py0 + TR[8] * pz0 + tz;
        x += (hx - x) * snapK; y += (hy - y) * snapK; z += (hz - z) * snapK;
      }
      // resolved points light like a surface, unresolved ones are a soft cloud
      const nx = nrm[j], ny = nrm[j + 1], nz = nrm[j + 2];
      let lit = .62;
      if (nx || ny || nz) {
        const wx = M[0] * nx + M[2] * nz, wz = M[6] * nx + M[8] * nz;
        lit = (wx * (x - e[0]) + ny * (y - e[1]) + wz * (z - e[2]) > 0 ? .28 : .45) + .55 * Math.max(0, wx * -.45 + ny * .8 + wz * -.35);
      }
      let b = (lit + (.66 - lit) * sgn) * (1 - .12 * sgn) * (y < -.5 && cv.dom !== 'air' ? .45 : 1);
      let r = WH[0], g = WH[1], bl = WH[2];
      const fk = Math.min(clock - FL[i], clock - cv.flashT);
      if (fk < .5) { const w = Math.exp(-fk * 7); r += (LIME[0] - r) * w; g += (LIME[1] - g) * w; bl += (LIME[2] - bl) * w; b = Math.max(b, .9 * w); }
      const A = Math.min(1, b) * al * snapOut;
      if (W) { const fa = fk < .5 ? Math.exp(-fk * 7) : 0, aa = Math.min(1, A * .85 + .35 * fa); W.seg(x - lx * tick, y, z - lz * tick, x + lx * tick, y, z + lz * tick, W1[0], W1[1], W1[2], aa); continue; }
      fx.dotXYZ(x, y, z, big && (sgn < .5 || (i & 3) === 0) ? 2 : 1, r, g, bl, A, 'max');
      for (let m = 1; m < mult; m++) fx.dotXYZ(x + (hsh(i, m * 7) - .5) * 2 * jit, y + (hsh(i, m * 7 + 2) - .5) * jit, z + (hsh(i, m * 7 + 4) - .5) * 2 * jit, 1, r, g, bl, A * .85, 'max');
    }
  }
  const AX = [[0, 0, 0], [0, 0, 0], [0, 1, 0]], RADS = [0, 0, 0];
  function ellipsoid(fx, cv, pxm, al) {
    const sig = cv.sig, ea = sat((sig - cv.L * .12) / (cv.L * .3 + 10)) * al;
    if (ea < .02) return;
    const rad0 = sig * .84 + cv.L * .3, rad1 = sig * 2 + cv.L * .5, rad2 = (cv.dom === 'air' ? sig * .76 : Math.min(sig * .6, cv.L * .7 + 8)) + cv.L * .1;
    if (rad1 * pxm < 18 || rad1 * pxm > 2600) return;
    const lx = cv.los[0], lz = cv.los[1];
    AX[0][0] = lx; AX[0][2] = lz; AX[1][0] = lz; AX[1][2] = -lx;
    RADS[0] = rad0; RADS[1] = rad1; RADS[2] = rad2;
    const cy = cv.ctr[1] + (cv.dom === 'air' ? 0 : rad2 * .35);
    ering(fx, cv.ctr, cy, 0, 1, 0, 1, pxm, ea);
    ering(fx, cv.ctr, cy, 1, 2, 0, 1, pxm, ea);
    ering(fx, cv.ctr, cy, 0, 2, 0, 1, pxm, ea);
    ering(fx, cv.ctr, cy, 0, 1, -.55 * rad2, .835, pxm, ea);
    ering(fx, cv.ctr, cy, 0, 1, .55 * rad2, .835, pxm, ea);
  }
  function ering(fx, c, cy, i1, i2, off, sc, pxm, ea) {
    const A = AX[i1], B = AX[i2], r1 = RADS[i1] * sc, r2 = RADS[i2] * sc;
    const n = Math.round(clamp(TAU * Math.max(r1, r2) * pxm / 7, 36, 180));
    if (S.orb) {
      // the Orbital style: a dashed hairline ellipse
      const W = S.W; let px = 0, py = 0, pz = 0;
      for (let k = 0; k <= n; k++) {
        const th = k / n * TAU, ca = Math.cos(th), sa = Math.sin(th);
        const x = c[0] + A[0] * ca * r1 + B[0] * sa * r2, y = cy + off + A[1] * ca * r1 + B[1] * sa * r2, z = c[2] + A[2] * ca * r1 + B[2] * sa * r2;
        if (k && (k & 3) < 3) W.seg(px, py, pz, x, y, z, W1[0], W1[1], W1[2], ea * (y < 0 ? .22 : .55));
        px = x; py = y; pz = z;
      }
      return;
    }
    for (let k = 0; k < n; k++) {
      const th = k / n * TAU, ca = Math.cos(th), sa = Math.sin(th);
      const x = c[0] + A[0] * ca * r1 + B[0] * sa * r2, y = cy + off + A[1] * ca * r1 + B[1] * sa * r2, z = c[2] + A[2] * ca * r1 + B[2] * sa * r2;
      fx.dotXYZ(x, y, z, k % 2 ? 1 : 2, WH[0], WH[1], WH[2], ea * (y < 0 ? .3 : .75), 'max');
    }
  }
  /* the dotted coral bearing fan from the unit that hears the emitter */
  function fan(cv, k) {
    const c = cv.c;
    let best = null, bd = 1e18;
    for (const o of sim.alive(game.side)) {
      if (o.aboard) continue;
      const d = (o.pos[0] - c.pos[0]) ** 2 + (o.pos[2] - c.pos[2]) ** 2;
      if (d < bd) { bd = d; best = o; }
    }
    if (!best) return;
    const p = game.unitPose(best).pos, dist = Math.sqrt(bd); if (dist < 50) return;
    const brg = Math.atan2(c.pos[0] - p[0], c.pos[2] - p[2]), half = clamp(Math.atan2(c.err, dist), .6 * Math.PI / 180, .35);
    const len = dist + c.err, al = .55 * k * (.75 + .25 * Math.sin(S.clock * 5));
    // (the Orbital style: white hairlines; the emitter's tag carries the coral square)
    const o = S.dotOpt(S.orb ? WH : CORAL, al * (S.orb ? .8 : 1), 6, 1, 'over');
    o.max = 600;
    for (let s = -1; s <= 1; s += 2) {
      const b = brg + s * half;
      S.line(p[0], p[1] + 6, p[2], p[0] + Math.sin(b) * len, 6, p[2] + Math.cos(b) * len, o);
    }
    o.a = al * .5; o.step = 9;
    S.line(p[0], p[1] + 6, p[2], p[0] + Math.sin(brg) * len, 6, p[2] + Math.cos(brg) * len, o);
    // arcs across the fan at the estimate and its error bounds
    o.a = al * .8; o.step = 4;
    S.arc(p[0], 6, p[2], dist, brg - half, brg + half, o);
    o.a = al * .35; o.step = 6;
    S.arc(p[0], 6, p[2], Math.max(50, dist - c.err), brg - half, brg + half, o);
    S.arc(p[0], 6, p[2], dist + c.err, brg - half, brg + half, o);
  }

  /* ---------- 2D: tags for the contacts and tracks the player may see ---------- */
  const POOL = [];
  const byD = (a, b) => a.d - b.d;
  function draw2d(ov, TL) {
    const cam = R.camera, side = game.side, scope = S.scopeK;
    if (scope > .5) return;                          // the scope draws its own glyphs and tags
    const cxs = cam.W / 2, cys = cam.H / 2, k = ov.ui || 1;
    tagList.length = 0;
    const L = sim.list();
    for (let i = 0; i < L.length; i++) {
      const u = L[i];
      if (u.side === side || u.aboard) continue;
      const cv = vis.get(u.id);
      const v = sim.visible(side, u);
      if (!v && !(cv && cv.state === 'lost')) continue;
      if (S.scanOwns(u.id) || game.selection.has(u.id) || game.hover === u.id) continue;
      const asContact = !!cv && (cv.state === 'lost' || v === 'contact' || (cv.state === 'snap' && S.clock - cv.tSnap < .3));
      const P = asContact ? cv.ctr : game.unitPose(u).pos;
      if (!cam.project(P, q)) continue;
      if (q[0] < -60 || q[1] < -60 || q[0] > cam.W + 60 || q[1] > cam.H + 60) continue;
      let t = POOL[tagList.length]; if (!t) t = POOL[tagList.length] = { u: null, cv: null, x: 0, y: 0, z: 0, d: 0, contact: false };
      t.u = u; t.cv = cv; t.x = q[0]; t.y = q[1]; t.z = q[2]; t.contact = asContact;
      t.d = Math.hypot(q[0] - cxs, q[1] - cys) * (asContact ? .8 : 1);
      tagList.push(t);
    }
    tagList.sort(byD);
    let bars = MAX_BARS;
    for (let i = 0; i < tagList.length; i++) {
      const t = tagList[i], u = t.u, cv = t.cv, full = i < MAX_TAGS;
      const c = cv ? cv.c : sim.contact(side, u.id);
      const mpp = t.z / cam.fl, id = c ? c.track : 'TRK ' + pad2(u.id);
      if (t.contact) {
        const lost = cv.state === 'lost';
        const rpx = ((cv.sig || sigOf(cv.c, cv.L)) * 2 + cv.L * .5) / mpp;
        const fresh = S.clock - cv.born < 2.4, blink = fresh ? .7 + .3 * (Math.sin((S.clock - cv.born) * 16) > 0 ? 1 : 0) : 1;
        const a = (lost ? 1 - sat((S.clock - cv.tLost - .6) / 1.2) : sat((S.clock - cv.born) / .3)) * blink * (1 - 2 * scope);
        if (rpx < 4 || !full) ov.mark(t.x, t.y, 6, 'rgba(238,238,228,.9)', a * (full ? 1 : .7));
        if (!full) continue;
        const label = lost ? 'LOST' : cv.c.emitting && cv.conf < .3 ? '? · ESM' : '?', value = lost ? '' : cv.conf.toFixed(2);
        let B = null;
        if (!lost && bars > 0 && rpx > 12) { probsOf(cv); B = barsOf(cv); bars--; }
        // the anchor on the cloud's upper right edge, the tag beyond it (both on the left where the right runs out)
        const off = Math.min(rpx * .72, 160 * k), tw = Math.max(ov.tagSize(id, label, value, { size: 10.5 })[0], B ? barsW(B, k) : 0);
        const right = t.x + off + 14 * k + tw < cam.W - 8 * k, ax = right ? t.x + off : t.x - off, ay = t.y - Math.min(rpx * .3, 90 * k) - 4 * k;
        TL.add({ x: right ? ax + 14 * k : ax - 14 * k, align: right ? null : 'right', y: ay - 26 * k, ax, ay, id, label, value, kind: lost ? 'ghost' : 'white', a, size: 10.5, valCol: 'rgba(255,255,255,.72)', pri: 1, bars: B });
      } else {
        const e = R.models.has(u.def.model) ? R.models.get(u.def.model) : null;
        const rpx = e ? e.radius / mpp : 0;
        if (rpx < 3 || !full) ov.mark(t.x, t.y, 6, '#FF6A3D', full ? .95 : .7);
        if (!full) continue;
        const flash = cv && S.clock - cv.flashT < 1.1;
        const conf = c ? c.conf : 1;
        const value = !u.alive ? (u.def.domain === 'sea' ? 'SINKING' : 'KILLED') : conf.toFixed(2), label = TRACK[u.type] || (c && c.cls) || u.def.name;
        const off = Math.max(4 * k, rpx * .75), tw = ov.tagSize(id, label, value, { size: 10.5 })[0];
        const right = t.x + off + 14 * k + tw < cam.W - 8 * k, ax = right ? t.x + off : t.x - off, ay = t.y - Math.max(4 * k, rpx * .45);
        TL.add({ x: right ? ax + 14 * k : ax - 14 * k, align: right ? null : 'right', y: ay - 26 * k, ax, ay, id, label, value, kind: flash && Math.sin((S.clock - cv.flashT) * 22) > -.3 ? 'lime' : 'coral', a: (u.alive ? 1 : .6) * (1 - 2 * scope), size: 10.5, pri: 2 });
      }
    }
  }
  const BARS = new Map();
  const IDX = [];
  function barsOf(cv) {
    let b = BARS.get(cv.id);
    if (!b) { b = { rows: [['UNKNOWN', 0]], top: 0, wL: 62 }; BARS.set(cv.id, b); }
    if (BARS.size > 64) for (const k of BARS.keys()) if (!vis.has(k)) BARS.delete(k);
    const sh = cv.shown, cands = cv.cands;
    // unknown + the three most likely classes
    IDX.length = 0;
    for (let i = 0; i < cands.length; i++) IDX.push(i + 1);
    IDX.sort((a, c) => sh[c] - sh[a]);
    const k = Math.min(3, IDX.length);
    b.rows[0][1] = sh[0];
    let top = 0, tv = -1;
    for (let i = 0; i < k; i++) {
      const j = IDX[i];
      let row = b.rows[i + 1]; if (!row) row = b.rows[i + 1] = ['', 0];
      row[0] = cands[j - 1]; row[1] = sh[j];
      if (sh[j] > tv) { tv = sh[j]; top = i + 1; }
    }
    b.rows.length = k + 1;
    b.top = tv > sh[0] ? top : -1;
    return b;
  }

  return {
    vis, pings, update, draw3d, draw2d, ping,
    onEvent(e) {
      if (e.side !== game.side) return;
      if (e.type === 'detect' && e.unit !== undefined && e.pos && S.V.vis(e.pos[0], e.pos[1], e.pos[2], 200)) ping(e.pos[0], e.pos[1], e.pos[2], 40, 0);
    },
  };
}
