/* REFERENCE ONLY (not loaded by any page): the sea, wake, ship-motion and radar-pulse drawing techniques from
   the Orbital menus, lifted out so a film can reuse them. Wire = ../menus/common/wire.js (W.seg, W.seg2, W.ring),
   Cam = M3.Cam, D2R = Math.PI / 180. Adapt freely; keep everything a pure function of film time t. */

/* ---------- ship motion: gentle roll / pitch / heave about the waterline origin ---------- */
function shipXf(t) {
  const roll = 1.1 * D2R * Math.sin(t * .7), pitch = .35 * D2R * Math.sin(t * .9 + 1), heave = .3 * Math.sin(t * .8 + .4);
  return X.make(R.mul(R.z(roll), R.x(pitch)), [0, heave, 0]);
}

/* ---------- horizon line (flat sea, far away) ---------- */
function horizon(W, cam) {
  const fl = V.norm([cam.f[0], 0, cam.f[2]]), rt = V.norm(V.cross([0, 1, 0], fl)), hz = [];
  for (const sg of [-1, 1]) { const p = cam.project(V.add(cam.eye, V.add(V.mul(fl, 1e5), V.mul(rt, sg * 1.6e5)))); if (p) hz.push(p); }
  if (hz.length === 2) W.seg2(hz[0][0], hz[0][1], hz[1][0], hz[1][1], .34);
}

/* ---------- swell rows laid across the mean view direction, spacing growing with range ---------- */
// MEAN = mean camera heading; rows are rebuilt if the view heading changes a lot (or lay several fans).
const MEAN = 46 * D2R, FW = [Math.sin(MEAN), 0, Math.cos(MEAN)], RT = [Math.cos(MEAN), 0, -Math.sin(MEAN)];
const PC = V.mad([0, 0, 0], FW, -310);
const SEA = [];
for (let k = 0; k < 54; k++) {
  const d = 22 + 8.5 * Math.pow(k, 1.95), half = d * .85 + 160, n = 60, row = [];
  for (let i = 0; i <= n; i++) { const u = -1 + 2 * i / n; row.push(V.add(V.mad(PC, FW, d), V.mul(RT, u * half))); }
  SEA.push({ d, row });
}
const swellA = (x, z, t) => .75 * Math.sin(.042 * (x * .8 + (z + t * 8) * .6) - 1.05 * t) + .38 * Math.sin(.083 * (-x * .3 + (z + t * 8) * .95) - 1.6 * t + 1.3);
function drawSea(W, t) {
  for (const { d, row } of SEA) {
    const a = .22 * Math.pow(1 - d / 26000, 3) * (d < 60 ? d / 60 : 1);
    let prev = null;
    for (const q of row) {
      const inHull = Math.abs(q[0]) < 11.5 && Math.abs(q[2]) < 80;          // break the lines around the hull
      const p = inHull ? null : [q[0], swellA(q[0], q[2], t) * Math.min(1, 300 / d + .15), q[2]];
      if (prev && p) W.seg(prev, p, a);
      prev = p;
    }
  }
}

/* ---------- deep-water swell as a sum of gravity waves (dispersion w = sqrt(g k)) ---------- */
const WAVES = [
  { A: 1.3, L: 150, d: .25, ph: 0 }, { A: .75, L: 84, d: -.7, ph: 1.7 },
  { A: .42, L: 46, d: 1.1, ph: 4.1 }, { A: .22, L: 29, d: -.3, ph: 2.2 },
].map(w => { const k = 2 * Math.PI / w.L; return { A: w.A, kx: k * Math.sin(w.d), kz: k * Math.cos(w.d), w: Math.sqrt(9.81 * k), ph: w.ph }; });
function swellB(x, z, t) { let h = 0; for (const w of WAVES) h += w.A * Math.sin(w.kx * x + w.kz * z - w.w * t + w.ph); return h; }
// Earth curvature drop for far water: y -= d^2 / (2 R); a shrunken R (e.g. 450 km) pulls the horizon in so far
// ships sit on the curve. Grid lines seen from a fast camera: fade each point by how many pixels it smears in one
// 60 Hz frame (fl * speed / 60 * sin(angle to the view axis) / distance): near water blurs out, far water stays crisp.

/* ---------- wake: Kelvin arms (19.5 deg) off the stern, churned centreline, bow wave ---------- */
function drawWake(W, t) {                // ship frame, bow +Z, stern at z = -76
  for (const sg of [-1, 1]) {
    let pv = [sg * 5, 0, -76];
    for (let i = 1; i <= 24; i++) { const L = i * 30, q = [sg * (5 + L * Math.sin(19.5 * D2R)) + 1.2 * Math.sin(i * 1.7 + t * 2), 0, -76 - L * Math.cos(19.5 * D2R)]; W.seg(pv, q, .26 * (1 - i / 26)); pv = q; }
    W.seg([sg * 3, 0, 74], [sg * 13, 0, 44], .3); W.seg([sg * 13, 0, 44], [sg * 17, 0, 20], .14);
  }
  for (let i = 0; i < 30; i++) { const z0 = -80 - i * 18 - (t * 8) % 18, x0 = 2.5 * M3.noise(i * .7, t * .3); W.seg([x0, 0, z0], [x0 + .6, 0, z0 - 9], .2 * (1 - i / 32)); }
}

/* ---------- radar search pulses: patches of expanding spherical shell from an array face ----------
   Each pulse is an arc sector (bearing b0..b1 at elevation e) growing outward and fading; arcs only, tapered to
   nothing at the ends, so a pulse reads as a wavefront, not a frame. spy = array face centre in world space.
   A rotating search pattern: advance the sector centre bearing with time; stagger pulses every ~0.7 s. */
function drawPulses(W, spy, t, t0) {
  for (let k = Math.floor((t - t0) / .7); k >= 0; k--) {
    const age = t - t0 - k * .7; if (age > 1.8) break;
    const rad = 30 + 950 * age, al = .34 * Math.pow(1 - age / 1.8, 1.5);
    const c = (k * 37) % 360 * D2R, b0 = c - 30 * D2R, b1 = c + 30 * D2R, e1 = 12 * D2R;
    const at = (b, e) => [spy[0] + Math.sin(b) * Math.cos(e) * rad, spy[1] + Math.sin(e) * rad, spy[2] + Math.cos(b) * Math.cos(e) * rad];
    const n = 22;
    for (const [e, w] of [[0, 1], [e1 * .4, .4]]) { let pv = null; for (let i = 0; i <= n; i++) { const q = at(b0 + (b1 - b0) * i / n, e); if (pv) W.seg(pv, q, al * w * Math.sin(Math.PI * (i - .5) / n)); pv = q; } }
  }
}

/* ---------- whitecaps: seeded cells on a grid; foam where the swell crest is high, each a short streak ---------- */
// hash(i, j) -> [0,1); for each cell with hash < .3: x, z jittered inside the cell; crest = sat((swell + .1) / 1.3);
// draw a short segment along the flow with alpha .42 * crest, faded by distance.

/* ---------- menu-side calm: a left-to-right black gradient under the menu column ---------- */
// const lg = ctx.createLinearGradient(0, 0, 760, 0); lg.addColorStop(0, 'rgba(0,0,0,.9)'); lg.addColorStop(.62, 'rgba(0,0,0,.55)'); lg.addColorStop(1, 'rgba(0,0,0,0)');
