/* The visibility concepts' shared scene (game/concepts/visibility*.html): one stretch of coast from the real map,
   an Arleigh Burke and the Nimitz steaming slowly offshore, an F/A-18E flying a low racetrack (150 m), two 3M55
   sea-skimmers from a K340P TEL on the shore (12 m over the water, 750 m/s), an SM-6 climbing off the destroyer's
   VLS every cycle. Real sizes and speeds; everything is a function of the scene time t (no state but the wakes).
   Own (fleet) lime, hostile (coast) coral, as in the game. Nothing here touches game/src: the renderer, models and
   terrain are the game's, imported read-only. */

const TAU = Math.PI * 2, DEG = Math.PI / 180;
const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;
const ss = v => { v = sat(v); return v * v * (3 - 2 * v); };

export const CYCLE = 16;              // s: the missiles' cycle (the ships and the jet run on continuous time)
const SKIM_V = 750, SKIM_Y = 12;      // 3M55: ~Mach 2.2 at sea level, 10-15 m cruise over the water
const JET_V = 190, JET_Y = 150;       // F/A-18E low pass
const SM6_T0 = 3.6;                   // s into the cycle

export function buildScene(R, map) {
  const T = R.terrain;
  // the sea direction: from the coast spawn toward the fleet spawn; the coast where a long run of water starts
  const cs = map.spawns.coast, fs = map.spawns.fleet;
  let ax = fs.x - cs.x, az = fs.z - cs.z; const al = Math.hypot(ax, az); ax /= al; az /= al;
  const px = az, pz = -ax;            // along the coast
  let C = [cs.x, 0, cs.z];
  for (let s = 0, run = 0; s < al; s += 25) {
    const x = cs.x + ax * s, z = cs.z + az * s;
    if (map.h(x, z) < -1) { run += 25; if (run > 3000) { C = [x - ax * run, 0, z - az * run]; break; } } else run = 0;
  }
  const at = (a, p) => [C[0] + ax * a + px * p, 0, C[2] + az * a + pz * p];
  const seaHdg = Math.atan2(ax, az), alongHdg = Math.atan2(px, pz);

  // the TEL: on firm ground behind the beach (search inland for a flat spot a little above the sea)
  let tel = at(-500, 0);
  for (let a = -300; a > -2500; a -= 50) {
    let ok = false;
    for (const p of [0, 200, -200, 400, -400]) {
      const q = at(a, p), h = map.h(q[0], q[2]);
      if (h > 4 && map.slope(q[0], q[2]) < .08) { tel = q; ok = true; break; }
    }
    if (ok) break;
  }
  tel[1] = T.heightAt(tel[0], tel[2]);

  // ships on slow circles (continuous time; a full circle takes ~15 minutes)
  const ddgC = at(4600, 0), cvnC = at(6600, -2600);
  const circ = (c, r, v, ph, dir) => t => {
    const w = v / r * dir, a = ph + w * t;
    return { x: c[0] + Math.sin(a) * r, z: c[2] + Math.cos(a) * r, hdg: a + dir * Math.PI / 2, v };
  };
  const ddgPath = circ(ddgC, 900, 8, alongHdg - Math.PI / 2, 1);
  const cvnPath = circ(cvnC, 1400, 7, alongHdg + Math.PI / 2, -1);

  // the jet's racetrack: two 5 km legs along the coast, 3.5 km turns, centred between the ships and the shore
  const RT = { c: at(3200, 1500), L: 5000, r: 3500 };
  const per = 2 * RT.L + TAU * RT.r;
  function jet(t) {
    let s = ((t * JET_V) % per + per) % per;
    // local frame: u along the coast, w toward the sea; leg 1 at w = -r going +u, turn round +u end, leg 2 at w = +r
    let u, w, h, bank;
    const turnL = Math.PI * RT.r, bankMax = Math.atan(JET_V * JET_V / (9.81 * RT.r));
    const edge = x => ss(x / 700);                        // roll in / out over ~3.7 s of flight
    if (s < RT.L) { u = -RT.L / 2 + s; w = -RT.r; h = 0; bank = bankMax * edge(s - RT.L + 700) + bankMax * (1 - edge(s)); }
    else if (s < RT.L + turnL) { const a = (s - RT.L) / RT.r; u = RT.L / 2 + Math.sin(a) * RT.r; w = -Math.cos(a) * RT.r; h = a; bank = bankMax; }
    else if (s < 2 * RT.L + turnL) { const q = s - RT.L - turnL; u = RT.L / 2 - q; w = RT.r; h = Math.PI; bank = bankMax * edge(q - RT.L + 700) + bankMax * (1 - edge(q)); }
    else { const a = (s - 2 * RT.L - turnL) / RT.r; u = -RT.L / 2 - Math.sin(a) * RT.r; w = Math.cos(a) * RT.r; h = Math.PI + a; bank = bankMax; }
    bank = Math.min(bank, bankMax);
    // turning toward -w (left in the local frame) on both turns: a left bank (negative roll = left wing down)
    const x = RT.c[0] + px * u + ax * w, z = RT.c[2] + pz * u + az * w;
    const dir = [Math.cos(h), Math.sin(h)];               // in (u, w)
    const dx = px * dir[0] + ax * dir[1], dz = pz * dir[0] + az * dir[1];
    return { x, y: JET_Y, z, hdg: Math.atan2(dx, dz), roll: -bank, v: JET_V };
  }

  // the skimmers: from 1.4 km inland (terrain-following, 15 m over the ground) across the beach, past the destroyer's
  // bow 350 m off, out to sea; the second 220 m to the side and 1.3 s behind
  function skimmer(t, i) {
    const tc = ((t - i * 1.3) % CYCLE + CYCLE) % CYCLE;
    const cyc = Math.floor((t - i * 1.3) / CYCLE);
    const d = ddgPath(cyc * CYCLE + i * 1.3);             // aim at where the destroyer was at launch
    const s0 = [tel[0] - ax * 900 + px * (i ? 220 : 0), tel[2] - az * 900 + pz * (i ? 220 : 0)];
    const aim = [d.x + px * (350 + i * 120), d.z + pz * (350 + i * 120)];
    let dx = aim[0] - s0[0], dz = aim[1] - s0[1]; const L = Math.hypot(dx, dz); dx /= L; dz /= L;
    const s = tc * SKIM_V, total = L + 3500;
    if (s > total) return null;
    const x = s0[0] + dx * s, z = s0[1] + dz * s;
    const g = Math.max(0, T.heightAt(x, z));
    // the height: 15 m over the ground (smoothed over the bluff by looking ahead), 12 m over the water
    let gy = g; for (const k of [60, 150, 300]) gy = Math.max(gy, Math.max(0, T.heightAt(x + dx * k, z + dz * k)) - k * .08);
    const y = (gy > .5 ? gy + 15 : SKIM_Y) ;
    return { x, y, z, hdg: Math.atan2(dx, dz), pitch: 0, v: SKIM_V, s, fade: sat((total - s) / 400) * sat(s / 60), dir: [dx, dz] };
  }

  // the SM-6: a vertical rise off the VLS, a long eased pitch-over toward the shore (never bending too soon), the Mk 72
  // burns ~6 s; precomputed path relative to the launch point
  const SM = (() => {
    const dt = .02, n = Math.round(14 / dt) + 1, P = new Float32Array(n * 4);
    let x = 0, y = 12, v = 0, th = Math.PI / 2;
    for (let i = 0; i < n; i++) {
      const tt = i * dt;
      P[i * 4] = x; P[i * 4 + 1] = y; P[i * 4 + 2] = th; P[i * 4 + 3] = v;
      const acc = tt < 6 ? 260 : tt < 11 ? 60 : -20;
      v = Math.max(0, Math.min(1250, v + acc * dt));
      // the rise stays vertical for 1.6 s, then eases over to ~32 degrees across ~7 s
      th = Math.PI / 2 - (Math.PI / 2 - 32 * DEG) * ss((tt - 1.6) / 7.5);
      x += Math.cos(th) * v * dt; y += Math.sin(th) * v * dt;
    }
    return { dt, n, P };
  })();
  function sm6(t) {
    const cyc = Math.floor(t / CYCLE), tc = t - cyc * CYCLE - SM6_T0;
    if (tc < 0 || tc > 12.5) return null;
    const d = ddgPath(cyc * CYCLE + SM6_T0);
    const f = tc / SM.dt, i = Math.min(SM.n - 2, Math.floor(f)), k = f - i, P = SM.P;
    const lx = P[i * 4] + (P[i * 4 + 4] - P[i * 4]) * k, ly = P[i * 4 + 1] + (P[i * 4 + 5] - P[i * 4 + 1]) * k, th = P[i * 4 + 2];
    // launched from the forward VLS (~40 m ahead of the ship's middle), flying toward the shore
    const hx = Math.sin(d.hdg), hz = Math.cos(d.hdg);
    const x0 = d.x + hx * 40, z0 = d.z + hz * 40;
    return { x: x0 - ax * lx, y: ly, z: z0 - az * lx, hdg: seaHdg + Math.PI, pitch: th, tc, booster: tc < 6.2, x0, z0, v: P[i * 4 + 3], lx };
  }
  function sm6At(t, tc) {       // the SM-6's position at cycle time tc (its smoke trail)
    const cyc = Math.floor(t / CYCLE), d = ddgPath(cyc * CYCLE + SM6_T0);
    const f = Math.max(0, tc) / SM.dt, i = Math.min(SM.n - 2, Math.floor(f)), k = f - i, P = SM.P;
    const lx = P[i * 4] + (P[i * 4 + 4] - P[i * 4]) * k, ly = P[i * 4 + 1] + (P[i * 4 + 5] - P[i * 4 + 1]) * k;
    const x0 = d.x + Math.sin(d.hdg) * 40, z0 = d.z + Math.cos(d.hdg) * 40;
    return [x0 - ax * lx, ly, z0 - az * lx];
  }

  // draw instances (reused), with the game's tints: own lime, hostile coral; projectiles tintK .45 as in the game
  const U = {
    ddg: { key: 'destroyer', T: [0, 0, 0], hdg: 0, pitch: 0, roll: 0, st: { sps: 0 }, tint: 'own', id: 1, name: 'DDG 51', cls: 'Arleigh Burke', side: 'own', kind: 'ship' },
    cvn: { key: 'carrier', T: [0, 0, 0], hdg: 0, pitch: 0, roll: 0, st: { radar: 0 }, tint: 'own', id: 2, name: 'CVN 68', cls: 'Nimitz', side: 'own', kind: 'ship' },
    jet: { key: 'fighter', T: [0, 0, 0], hdg: 0, pitch: 0, roll: 0, st: { fan: 0, nozzle: .4, ab: 0 }, tint: 'own', id: 3, name: 'F/A-18E', cls: 'Super Hornet', side: 'own', kind: 'air' },
    s1: { key: 'oniks', T: [0, 0, 0], hdg: 0, pitch: 0, roll: 0, st: { wing: 1, fin: 1, booster: false, cover: false }, tint: 'hostile', tintK: .45, id: 4, name: '3M55', cls: 'Oniks', side: 'hostile', kind: 'msl' },
    s2: { key: 'oniks', T: [0, 0, 0], hdg: 0, pitch: 0, roll: 0, st: { wing: 1, fin: 1, booster: false, cover: false }, tint: 'hostile', tintK: .45, id: 5, name: '3M55', cls: 'Oniks', side: 'hostile', kind: 'msl' },
    sm6: { key: 'sm6', T: [0, 0, 0], hdg: 0, pitch: 0, roll: 0, st: { booster: true }, tint: 'own', tintK: .45, id: 6, name: 'SM-6', cls: 'RIM-174', side: 'own', kind: 'msl' },
    tel: { key: 'tel', T: tel.slice(), hdg: seaHdg, pitch: 0, roll: 0, st: { elev: 0, dep: 1 }, tint: 'hostile', id: 7, name: 'K340P', cls: 'TEL · Bastion-P', side: 'hostile', kind: 'land' },
  };
  const LIST = [U.cvn, U.ddg, U.tel, U.jet, U.s1, U.s2, U.sm6];

  function shipPose(d, p, t) {
    const sea = T.seaAt ? T.seaAt(p.x, p.z, t) : { y: 0, gx: 0, gz: 0 };
    const sh = Math.sin(p.hdg), ch = Math.cos(p.hdg);
    d.T[0] = p.x; d.T[1] = sea.y * (d.key === 'carrier' ? .15 : .5); d.T[2] = p.z; d.hdg = p.hdg;
    d.pitch = -Math.atan(sea.gx * sh + sea.gz * ch) * (d.key === 'carrier' ? .1 : .35);
    d.roll = Math.atan(sea.gx * ch - sea.gz * sh) * (d.key === 'carrier' ? .1 : .4);
  }

  /* update every instance for time t; returns the list of live instances (with .live) */
  function update(t) {
    shipPose(U.ddg, ddgPath(t), t); U.ddg.st.sps = t * 2.1 % TAU; U.ddg.v = 8;
    shipPose(U.cvn, cvnPath(t), t); U.cvn.st.radar = t * 1.6 % TAU; U.cvn.v = 7;
    const j = jet(t); Object.assign(U.jet, { hdg: j.hdg, pitch: .03, roll: j.roll, v: j.v }); U.jet.T[0] = j.x; U.jet.T[1] = j.y; U.jet.T[2] = j.z; U.jet.st.fan = t * 40 % TAU; U.jet.live = true;
    for (const [d, i] of [[U.s1, 0], [U.s2, 1]]) {
      const s = skimmer(t, i);
      d.live = !!s;
      if (s) { d.T[0] = s.x; d.T[1] = s.y; d.T[2] = s.z; d.hdg = s.hdg; d.pitch = 0; d.roll = 0; d.v = s.v; d.alpha = s.fade; d.dir = s.dir; d.s = s.s; }
    }
    const m = sm6(t);
    U.sm6.live = !!m;
    if (m) { U.sm6.T[0] = m.x; U.sm6.T[1] = m.y; U.sm6.T[2] = m.z; U.sm6.hdg = m.hdg; U.sm6.pitch = m.pitch; U.sm6.roll = 0; U.sm6.st.booster = m.booster; U.sm6.tc = m.tc; U.sm6.v = m.v; }
    U.ddg.live = U.cvn.live = U.tel.live = true;
    return LIST;
  }

  const wakes = { ddg: null, cvn: null };
  /* the effects every look shares (the game has them too): wakes, the SM-6's plume and smoke, the TEL's idle */
  function drawFx(t, Wake) {
    const fx = R.fx;
    if (!wakes.ddg) { wakes.ddg = new Wake({ L: 155, B: 20, len: 1100, seed: 1 }); wakes.cvn = new Wake({ L: 333, B: 41, len: 1600, seed: 2 }); }
    wakes.ddg.update(U.ddg.T, U.ddg.hdg, 8, t); wakes.ddg.draw(fx, .9);
    wakes.cvn.update(U.cvn.T, U.cvn.hdg, 7, t); wakes.cvn.draw(fx, .9);
    if (U.sm6.live) {
      const tc = U.sm6.tc, m = U.sm6, burn = tc < 6.2;
      // the booster plume: a hot core at the nozzle, a light on the sea while low
      const th = m.pitch, hx = Math.sin(m.hdg), hz = Math.cos(m.hdg);
      const back = [m.T[0] - hx * Math.cos(th) * 4, m.T[1] - Math.sin(th) * 4, m.T[2] - hz * Math.cos(th) * 4];
      if (burn) {
        fx.glow(back, 14, [255, 226, 180], .9);
        fx.dot(back, 3, [255, 240, 210], 1, 'add');
        R.light(back, 220, [255, 210, 160], m.T[1] < 300 ? .9 : .45);
      } else fx.glow(back, 5, [255, 220, 170], .35);
      // the smoke: dots laid along the path every 1/40 s of flight, drifting and fading over ~9 s
      for (let k = 0; k < 520; k++) {
        const tt = tc - k / 40;
        if (tt < 0) break;
        const age = tc - tt;
        if (tt > 6.2) continue;                            // the sustainer leaves little smoke
        const p = sm6At(t, tt), h = ((k * 2654435761) >>> 0) / 4294967296, h2 = ((k * 2246822519 + 7) >>> 0) / 4294967296;
        const spread = 1.5 + age * 2.2;
        const a = Math.max(0, 1 - age / 9) * (tt < .5 ? .9 : .55);
        fx.dotXYZ(p[0] + (h - .5) * spread, p[1] + (h2 - .5) * spread + age * .8, p[2] + (h2 - h) * spread, 2, 225, 225, 215, a, 'max');
      }
    }
  }

  return { U, LIST, update, drawFx, tel, C, ax, az, px, pz, at, ddgPath, cvnPath, jet, skimmer, sm6 };
}
