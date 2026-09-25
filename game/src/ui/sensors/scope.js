/* Radar view (V): the Picture films' scope. The world dims, the sea becomes the clutter height field of the
   radar (p2 / pa_picture: cells popping up as the beam paints them, settling through the rotation, lime at the
   leading edge, detections as stalks), the beam turns with its lime edge and curtain, range rings with their
   ranges, bearing ticks, tracks as glyphs with their gates, history and heading leaders and their tags, own
   units as lime marks. V again flies back. The change is a smooth fade both ways. */
import { LIME, CORAL, WH, TAU, DEG, sat, clamp, ss, hsh, gH, pad2, mix } from './core.js';
import { TRACK, SHORT } from '../../game/labels.js';
import { crossW, W1 } from './orb.js';

const RCS_DB = { carrier: 51, ddg: 40, helo: 12, fighter: 8, drone: -2, tel: 22, radar: 22, pantsir: 22, transloader: 22, catapult: 12, hq: 26 };

export function createScope(S) {
  const { game } = S, sim = game.sim, R = game.R, cam = R.camera;
  const st = { on: false, k: 0, radar: null, saved: null, base: null, touched: false };
  const hist = new Map();               // unit id -> { pts: Float32Array(3 * 12), n, i, t }
  const q = [0, 0, 0];

  function radarUnit() {
    if (S.mainRadar) return S.mainRadar.u;
    let best = null, bd = 1e18; const tg = cam.target;
    for (const u of sim.alive(game.side)) {
      const Rd = u.def.sensors && u.def.sensors.radar; if (!Rd || u.aboard) continue;
      const d = (u.pos[0] - tg[0]) ** 2 + (u.pos[2] - tg[2]) ** 2 + (Rd.surf ? 0 : 1e12);
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  }
  function rangeOf(u) { const Rd = u && u.def.sensors && u.def.sensors.radar; return Rd ? (Rd.surf || Rd.air) : 60000; }

  function toggle() {
    if (!st.on) {
      const u = radarUnit();
      st.on = true; st.radar = u; S.scopeRadar = u;
      const g = cam.goal;
      st.saved = { target: g.target.slice(), dist: g.dist, yaw: g.yaw, pitch: g.pitch };
      const c = u ? game.unitPose(u).pos : cam.target, RM = rangeOf(u);
      // look out toward the picture: the contacts, else the enemy's side of the map
      let dx = 0, dz = 0, n = 0;
      const S0 = sim.sides[game.side];
      if (S0) for (const ct of S0.contacts.values()) { const d = Math.hypot(ct.pos[0] - c[0], ct.pos[2] - c[2]); if (d < RM) { dx += (ct.pos[0] - c[0]) / (d + 1); dz += (ct.pos[2] - c[2]) / (d + 1); n++; } }
      if (!n) { const sp = game.map.spawns && game.map.spawns[game.enemy]; if (sp) { dx = sp.x - c[0]; dz = sp.z - c[2]; } }
      const yaw = Math.hypot(dx, dz) > 1e-6 ? Math.atan2(dx, dz) : cam.yaw, l = Math.hypot(dx, dz) || 1;
      cam.flyTo([c[0] + dx / l * RM * .3, 0, c[2] + dz / l * RM * .3], { dist: RM * .5, yaw, pitch: 13 * DEG, time: 1.5 });
      game.bus.emit('toast', { text: 'RADAR VIEW' });
    } else {
      st.on = false;
      if (st.saved) cam.flyTo(st.saved.target, { dist: st.saved.dist, yaw: st.saved.yaw, pitch: st.saved.pitch, time: 1.2 });
      S.scopeRadar = null;
    }
    game.bus.emit('scope', { on: st.on });
  }

  function update(dt) {
    const tgt = st.on ? 1 : 0;
    st.k += (tgt - st.k) * (1 - Math.exp(-dt * 4.5));
    if (Math.abs(st.k - tgt) < .002) st.k = tgt;
    S.scopeK = st.k;
    if (st.on && (!st.radar || !st.radar.alive)) { st.radar = radarUnit(); S.scopeRadar = st.radar; }
    // dim the world (and give it back exactly as it was)
    if (S.inspecting) return;
    if (st.k > 0) {
      if (!st.touched) { st.base = { world: R.worldBright, model: R.modelBright, vig: R.vignette }; st.touched = true; }
      R.worldBright = mix(st.base.world, st.base.world * .3, st.k);
      R.modelBright = mix(st.base.model, st.base.model * .62, st.k);
      R.vignette = mix(st.base.vig, Math.min(.85, st.base.vig + .15), st.k);
    } else if (st.touched) {
      R.worldBright = st.base.world; R.modelBright = st.base.model; R.vignette = st.base.vig; st.touched = false;
    }
    // track history (the estimate every few seconds)
    if (st.k > 0) {
      const S0 = sim.sides[game.side];
      if (S0) for (const c of S0.contacts.values()) {
        let h = hist.get(c.unitId);
        if (!h) { h = { pts: new Float32Array(36), n: 0, i: 0, t: -1e9 }; hist.set(c.unitId, h); }
        if (sim.t - h.t > 6) { h.t = sim.t; h.pts[h.i * 3] = c.pos[0]; h.pts[h.i * 3 + 1] = c.pos[1]; h.pts[h.i * 3 + 2] = c.pos[2]; h.i = (h.i + 1) % 12; h.n = Math.min(12, h.n + 1); }
      }
      if (hist.size > 200) for (const id of hist.keys()) if (!sim.units.has(id)) hist.delete(id);
    }
  }

  /* the radar the scope is on: where it is and its beam phase */
  const ro = { x: 0, y: 0, z: 0, ph: 0, RM: 60000, on: false, name: '' };
  function radarNow() {
    const u = st.radar;
    ro.on = false;
    if (!u) { ro.x = cam.target[0]; ro.y = 0; ro.z = cam.target[2]; ro.RM = 60000; ro.name = ''; return ro; }   // no radar left: NO RADAR, not the last one's name
    const p = game.unitPose(u).pos;
    ro.x = p[0]; ro.y = p[1]; ro.z = p[2]; ro.RM = rangeOf(u); ro.name = SHORT[u.type] || u.def.name;
    ro.on = !!(S.mainRadar && S.mainRadar.u === u);
    ro.ph = ro.on ? S.mainRadar.ph : 0;
    return ro;
  }

  function draw3d() {
    if (st.k <= .01) return;
    const fx = R.fx, V = S.V, k = st.k, r = radarNow(), RM = r.RM;
    // range rings and bearing ticks (sea level; the scope's frame)
    const step = ringStep(RM);
    for (let rr = step; rr < RM - step * .3; rr += step) S.ring(r.x, 2, r.z, rr, S.dotOpt(WH, .26 * k, 6, 1, 'max'));
    S.ring(r.x, 2, r.z, RM, S.dotOpt(WH, .45 * k, 4, 1, 'max'));
    for (let b = 0; b < 360; b += 10) {
      const a = b * DEG, sb = Math.sin(a), cb = Math.cos(a), L = b % 30 === 0 ? .05 : .025;
      S.line(r.x + sb * RM * 1.005, 2, r.z + cb * RM * 1.005, r.x + sb * RM * (1.005 + L), 2, r.z + cb * RM * (1.005 + L), S.dotOpt(WH, .4 * k, 3, 1, 'max'));
    }
    // the radar site: a stalk and a lime head
    S.line(r.x, r.y, r.z, r.x, r.y + RM * .012, r.z, S.dotOpt(WH, .8 * k, 3, 1, 'max'));
    if (S.orb) crossW(S.W, V, r.x, r.y + RM * .012, r.z, 4, W1, k);
    else fx.dotXYZ(r.x, r.y + RM * .012, r.z, 4, LIME[0], LIME[1], LIME[2], k, 'over');
    // returns of the contacts / tracks, and their gates, histories, leaders
    const side = game.side, S0 = sim.sides[side], HK = RM / 64000 * 45;
    RL.length = 0;
    const tg = cam.target;
    if (S0) for (const c of S0.contacts.values()) {
      const u = sim.units.get(c.unitId); if (!u || u.aboard) continue;
      const dx = c.pos[0] - r.x, dz = c.pos[2] - r.z, rg = Math.hypot(dx, dz);
      if (rg > RM * 1.02 || !V.vis(c.pos[0], 0, c.pos[2], Math.max(2000, c.err * 3))) continue;
      const trk = c.conf >= game.CLASSIFY, col = trk ? CORAL : WH;
      // the gate (3.5 sigma of the estimate) and the history
      const gr = Math.max(c.err * 2.2, RM * .004);
      S.ring(c.pos[0], 3, c.pos[2], gr, S.dotOpt(col, (trk ? .85 : .6) * k, trk ? 4 : 5, trk ? 2 : 1, 'max'));
      const h = hist.get(c.unitId);
      if (h) for (let j = 0; j < h.n; j++) {
        const i = (h.i - 1 - j + 24) % 12, al = k * (.7 - .5 * j / 12);
        if (S.orb) crossW(S.W, V, h.pts[i * 3], 3, h.pts[i * 3 + 2], 2, W1, al * .8);
        else fx.dotXYZ(h.pts[i * 3], 3, h.pts[i * 3 + 2], 2, col[0], col[1], col[2], al, 'max');
      }
      if (trk && Math.hypot(c.vel[0], c.vel[2]) > .5) S.line(c.pos[0], 3, c.pos[2], c.pos[0] + c.vel[0] * 120, 3, c.pos[2] + c.vel[2] * 120, S.dotOpt(col, .55 * k, 4, 1, 'max'));
      let e = RP[RL.length]; if (!e) e = RP[RL.length] = { c: null, d: 0 };
      e.c = c; e.d = (c.pos[0] - tg[0]) ** 2 + (c.pos[2] - tg[2]) ** 2;
      RL.push(e);
    }
    // the returns of the nearest few (the height-field pillars)
    if (RL.length > 30) { RL.sort((a, b) => a.d - b.d); RL.length = 30; }
    for (const e of RL) { const c = e.c, u = sim.units.get(c.unitId), dx = c.pos[0] - r.x, dz = c.pos[2] - r.z; returns(fx, V, c, u, r, Math.hypot(dx, dz), dx, dz, HK, k); }
    // own units: lime marks (the Orbital style: the overlay's marks only)
    if (!S.orb) for (const u of sim.alive(side)) {
      if (u.aboard) continue;
      const p = game.unitPose(u).pos;
      fx.dotXYZ(p[0], p[1] + 3, p[2], 3, LIME[0], LIME[1], LIME[2], k, 'over');
    }
  }
  /* a contact's returns in the height-field language: scatterers along the hull, smeared across range by the
     beam, taller and tighter than the clutter, painted by the beam and settling through the rotation */
  function returns(fx, V, c, u, r, rg, dx, dz, HK, k) {
    if (!r.on) return;
    const az = Math.atan2(dx, dz);
    let d = r.ph - az; const s = Math.floor(d / TAU); d -= s * TAU;
    const glow = Math.exp(-d * .75), rise = d < .5 ? 1 - Math.exp(-d * 16) : 1, lk = d < .6 ? Math.exp(-d * 7) : 0;
    const fresh = sim.t - c.lastSeen < 8;
    const snr = (RCS_DB[u.type] || 20) - 40 * Math.log10(Math.max(1, rg / 1000 * 64000 / r.RM) / 30) - 14 + (fresh ? 0 : -12);
    const n = Math.round(clamp(6 + 1.1 * snr, 4, 40)), ux = Math.sin(az), uz = Math.cos(az), cross = rg * 1.1 * DEG / 2.4, Lv = Math.max(u.def.size[0], 20) * 4;
    const hd = u.def.domain === 'air' ? 0 : (Math.hypot(c.vel[0], c.vel[2]) > 1 ? Math.atan2(c.vel[0], c.vel[2]) : hsh(u.id, 5) * TAU);
    const hx = Math.sin(hd), hz = Math.cos(hd), S10 = Math.pow(10, snr / 10), seed = u.id * 7919 + s * 31;
    for (let j = 0; j < n; j++) {
      const al = (hsh(seed, j) - .5) * Lv, cr = gH(seed + j, 11) * cross, rgn = gH(seed + j, 17) * 50;
      const x = c.pos[0] + hx * al + uz * cr + ux * rgn, z = c.pos[2] + hz * al - ux * cr + uz * rgn;
      const P = S10 * Math.exp(-.5 * (cr / cross) ** 2) * -Math.log(hsh(seed, j + 100)) - Math.log(hsh(seed, j + 200)), db = 4.343 * Math.log(Math.max(1e-6, P));
      if (db < 2) continue;
      const on = fresh && P > 8.2;
      const y = HK * (db - 2 + (on ? 12 : 0)) * rise * (.45 + .55 * glow);
      let b = clamp((db + 14) / 40, .16, 1) * (.36 + .64 * glow);
      if (on) b = Math.max(b, .55 + .45 * glow);
      const cr0 = WH[0] + (LIME[0] - WH[0]) * lk, cg = WH[1] + (LIME[1] - WH[1]) * lk, cb = WH[2] + (LIME[2] - WH[2]) * lk;
      // the Orbital style: every return a pillar of hairline (the height field in lines), brighter at the edge
      if (S.orb) { const W = S.W; W.seg(x, 1, z, x, Math.max(2, y), z, W1[0], W1[1], W1[2], Math.min(1, b * (on ? 1 : .6) + .3 * lk) * k); continue; }
      if (on) { RGB[0] = cr0; RGB[1] = cg; RGB[2] = cb; S.line(x, 1, z, x, y, z, S.dotOpt(RGB, b * .55 * k, 3, 1, 'max')); }
      fx.dotXYZ(x, y, z, 2, cr0, cg, cb, Math.min(1, b) * k, 'max');
    }
  }
  const RC = [0, 0, 0], RGB = [0, 0, 0], GL = [], GP = [], RL = [], RP = [];
  /* a round ring spacing for a range (km steps of 5, 10, 20, 25, 50) */
  function ringStep(RM) { const k = RM / 1000 / 4; for (const s of [5, 10, 20, 25, 50]) if (s >= k * .8) return s * 1000; return 50000; }

  function draw2d(ov, TL) {
    if (st.k <= .02) return;
    const k = st.k, r = radarNow(), RM = r.RM, K = ov.ui || 1;
    // ring ranges, on the right of the view
    const lb = cam.yaw + 38 * DEG, step = ringStep(RM);
    for (let rr = step; rr <= RM + 1; rr += step) {
      const last = rr + step > RM + 1, R0 = last ? RM : rr;
      RC[0] = r.x + Math.sin(lb) * R0; RC[1] = 2; RC[2] = r.z + Math.cos(lb) * R0;
      if (cam.project(RC, q)) ov.text(q[0] + 6 * K, q[1] - 5 * K, Math.round(R0 / 1000) + (last ? ' KM' : ''), { size: 10.5, col: 'rgba(255,255,255,.42)', a: k });
      if (last) break;
    }
    for (let b = 0; b < 360; b += 30) {
      const a = b * DEG;
      RC[0] = r.x + Math.sin(a) * RM * 1.085; RC[1] = 2; RC[2] = r.z + Math.cos(a) * RM * 1.085;
      if (cam.project(RC, q)) ov.text(q[0], q[1] + 4 * K, String(b).padStart(3, '0'), { size: 10, col: 'rgba(255,255,255,.45)', a: k, align: 'center' });
    }
    // the radar
    RC[0] = r.x; RC[1] = r.y + RM * .012; RC[2] = r.z;
    if (st.radar && cam.project(RC, q)) TL.add({ x: q[0] + 14 * K, y: q[1] - 9 * K, id: 'RDR', label: r.name, value: r.on ? (60 / Math.max(.1, TAU / Math.abs(st.radar.antW || 1e-6))).toFixed(0) + ' RPM' : 'EMCON', kind: 'lime', a: k, size: 10, pri: 9, lead: false });
    // tracks and contacts: every one a glyph, the ones nearest the middle of the screen a tag too
    let nT = 0, nC = 0;
    const S0 = sim.sides[game.side];
    GL.length = 0;
    if (S0) for (const c of S0.contacts.values()) {
      const u = sim.units.get(c.unitId); if (!u || u.aboard) continue;
      const rg = Math.hypot(c.pos[0] - r.x, c.pos[2] - r.z); if (rg > RM * 1.02) continue;
      const trk = c.conf >= game.CLASSIFY;
      if (trk) nT++; else nC++;
      RC[0] = c.pos[0]; RC[1] = 3; RC[2] = c.pos[2];
      if (!cam.project(RC, q)) continue;
      if (q[0] < -40 || q[1] < -40 || q[0] > cam.W + 40 || q[1] > cam.H + 40) continue;
      ov.mark(q[0], q[1], trk ? 8 : 6, trk ? '#FF6A3D' : 'rgba(238,238,228,.9)', k, trk);
      let g = GP[GL.length]; if (!g) g = GP[GL.length] = { c: null, u: null, x: 0, y: 0, d: 0, trk: false };
      g.c = c; g.u = u; g.x = q[0]; g.y = q[1]; g.trk = trk; g.d = Math.hypot(q[0] - cam.W / 2, q[1] - cam.H / 2);
      GL.push(g);
    }
    GL.sort((a, b) => a.d - b.d);
    for (let i = 0; i < GL.length && i < 22; i++) {
      const g = GL[i], c = g.c, u = g.u, trk = g.trk;
      const label = trk ? (TRACK[u.type] || c.cls || '?') : (c.emitting && c.conf < .3 ? 'ESM' : '');
      TL.add({ x: g.x + 16 * K, y: g.y - 30 * K, ax: g.x + 3 * K, ay: g.y - 3 * K, id: c.track, label, value: 'P ' + c.conf.toFixed(2), kind: trk ? 'coral' : 'white', a: k, size: 10, pri: trk ? 3 : 2, valCol: trk ? undefined : 'rgba(255,255,255,.72)' });
    }
    for (const u of sim.alive(game.side)) {
      if (u.aboard) continue;
      if (!cam.project(game.unitPose(u).pos, q)) continue;
      ov.mark(q[0], q[1], 5, '#C6F432', .9 * k, true);
    }
    // the readout under the clock
    const sweepN = r.on ? Math.floor(r.ph / TAU) : 0;
    const txt = `RADAR VIEW · ${r.name || 'NO RADAR'} · ${r.on ? 'SWEEP ' + (sweepN % 1000) : 'EMCON'} · ${nT} TRK · ${nC} UNK · V EXIT`;
    ov.text(cam.W / 2, 64 * K, txt, { size: 10.5, col: 'rgba(255,255,255,.7)', a: k, align: 'center' });
  }

  /* the GPU clutter field for this frame (drawn after the engine) */
  function clutterParams(gpu, weather) {
    if (st.k <= .01 || !st.radar) return null;
    const r = radarNow(); if (!r.on) return null;
    const L = gpu.lattice(st.radar.id, r.x, r.z, r.RM, game.map);
    if (!L) return null;
    return { L, radar: [r.x, r.z], phase: r.ph, alpha: st.k, scope: true, heightK: r.RM / 64000 * 45, wind: weather.windBrg(), rhor: rhorOf(st.radar, r.RM), squalls: weather.squalls() };
  }
  /* the clutter's critical range on the 64 km display scale: 18 km for a 70 m site, ~sqrt of the antenna height */
  function rhorOf(u, RM) {
    const Rd = u.def.sensors.radar, hAnt = Math.max(10, u.pos[1] + (Rd.h || 10));
    return clamp(18 * Math.sqrt(hAnt / 70), 5, 40) * 64 / (RM / 1000);
  }

  return { st, toggle, update, draw3d, draw2d, clutterParams, rhorOf };
}
