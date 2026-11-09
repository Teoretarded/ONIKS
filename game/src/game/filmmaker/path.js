/* Film maker: the camera path and the time-rate ramps, the same maths as the films' runtime
   (reference/films/common/film.js FILM.path and FILM.warp).

   evalPath(keys, t, o, out)  keys: resolved [{ t, eye: [x, y, z], look: [x, y, z], fov (deg), roll (deg) }], sorted by t.
                              Time-parameterised cubic Hermite, tangents from the neighbours over their time span (uneven
                              keys stay smooth: position and velocity are continuous through every key). Without loop the
                              ends ease in and out (zero tangents); with o.loop the path closes from the last key back to the
                              first over o.gap seconds (the take's length is last.t - first.t + gap). o.ease 'film' uses
                              FILM.path's tangents as they are; the default clamps them: the look point, fov and roll never
                              overshoot a key (a subject held by two keys stays held), the eye flies through its keys with
                              its speed there kept within 3x the slower neighbouring leg (a held eye holds).
                              -> out { eye, look, fov (deg), roll (deg), i (segment), u (0..1 in it) }
   rateAt(rates, t)           [{ t, rate }] sorted: the rate eased (smoothstep) from key to key, as FILM.warp; null if none.
   fmtRate(r), fmtT(s)        'x0.25' 'x1' 'x2.5' 'x8' / '00:12.3' */

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const ss = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

function hermite(p0, p1, m0, m1, u, dt) {
  const u2 = u * u, u3 = u2 * u;
  return p0 * (2 * u3 - 3 * u2 + 1) + m0 * dt * (u3 - 2 * u2 + u) + p1 * (-2 * u3 + 3 * u2) + m1 * dt * (u3 - u2);
}

/* the take's length (s): up to the last key (a first key after 0 holds until its time); a loop is its keys' span plus
   the closing span, with no start of its own */
export function lengthOf(keys, loop, gap) {
  if (!keys.length) return 0;
  const n = keys.length;
  return loop && n > 1 ? keys[n - 1].t - keys[0].t + Math.max(.5, gap || 0) : keys[n - 1].t;
}

const TE = [[0, 0, 0], [0, 0, 0]];      // the two eye tangents of the segment (no allocation per call)
export function evalPath(keys, t, o, out) {
  const n = keys.length;
  out = out || { eye: [0, 0, 0], look: [0, 0, 0], fov: 40, roll: 0, i: 0, u: 0 };
  if (!n) return out;
  if (n === 1) {
    const k = keys[0];
    for (let c = 0; c < 3; c++) { out.eye[c] = k.eye[c]; out.look[c] = k.look[c]; }
    out.fov = k.fov; out.roll = k.roll || 0; out.i = 0; out.u = 0;
    return out;
  }
  const loop = !!(o && o.loop), t0 = keys[0].t;
  const L = loop ? keys[n - 1].t - t0 + Math.max(.5, (o && o.gap) || 0) : 0;
  // index i -> key (wrapped) and its time (shifted by whole loops)
  const kAt = i => loop ? keys[((i % n) + n) % n] : keys[clamp(i, 0, n - 1)];
  const tAt = i => loop ? keys[((i % n) + n) % n].t + Math.floor(i / n) * L : keys[clamp(i, 0, n - 1)].t;
  const segs = loop ? n : n - 1;
  if (loop) t = ((t - t0) % L + L) % L + t0;
  else t = clamp(t, t0, keys[n - 1].t);
  let i = 0; while (i < segs - 1 && tAt(i + 1) <= t) i++;
  const a = kAt(i), b = kAt(i + 1), ta = tAt(i), tb = tAt(i + 1), dt = (tb - ta) || 1;
  const u = clamp((t - ta) / dt, 0, 1);
  const clampT = !(o && o.ease === 'film');
  /* what the camera looks at, the fov and the roll: clamped per value (the default) never overshoot. A key at a turn
     of a value (or on a hold: two equal keys) gets a flat tangent there; elsewhere the films' tangent, limited to 3x the
     gentler neighbouring slope (Fritsch-Carlson), so a subject held by two keys stays exactly in place */
  const tang = (j, v) => {
    if (!loop && (j <= 0 || j >= n - 1)) return 0;
    const p = kAt(j - 1), c = kAt(j), q = kAt(j + 1), t0 = tAt(j - 1), t1 = tAt(j), t2 = tAt(j + 1);
    const m = (v(q) - v(p)) / ((t2 - t0) || 1);
    if (!clampT) return m;
    const d0 = (v(c) - v(p)) / ((t1 - t0) || 1), d1 = (v(q) - v(c)) / ((t2 - t1) || 1);
    if (d0 * d1 <= 0) return 0;
    const lim = 3 * Math.min(Math.abs(d0), Math.abs(d1));
    return Math.max(-lim, Math.min(lim, m));
  };
  /* the eye: the films' tangent as a vector (the camera flies through its keys, never stopping on one because a
     coordinate turns there); clamped, its speed is limited to 3x the slower neighbouring leg, so a held eye (two equal
     keys) holds and a slow leg next to a fast one does not balloon out */
  const tangEye = (j, o3) => {
    o3[0] = o3[1] = o3[2] = 0;
    if (!loop && (j <= 0 || j >= n - 1)) return o3;
    const p = kAt(j - 1), c = kAt(j), q = kAt(j + 1), t0 = tAt(j - 1), t1 = tAt(j), t2 = tAt(j + 1), s = (t2 - t0) || 1;
    for (let k = 0; k < 3; k++) o3[k] = (q.eye[k] - p.eye[k]) / s;
    if (!clampT) return o3;
    const d0 = Math.hypot(c.eye[0] - p.eye[0], c.eye[1] - p.eye[1], c.eye[2] - p.eye[2]) / ((t1 - t0) || 1);
    const d1 = Math.hypot(q.eye[0] - c.eye[0], q.eye[1] - c.eye[1], q.eye[2] - c.eye[2]) / ((t2 - t1) || 1);
    const lim = 3 * Math.min(d0, d1), m = Math.hypot(o3[0], o3[1], o3[2]);
    if (m > lim) { const k = m > 1e-9 ? lim / m : 0; o3[0] *= k; o3[1] *= k; o3[2] *= k; }
    return o3;
  };
  const ma = tangEye(i, TE[0]), mb = tangEye(i + 1, TE[1]);
  for (let c = 0; c < 3; c++) {
    const vl = k => k.look[c];
    out.eye[c] = hermite(a.eye[c], b.eye[c], ma[c], mb[c], u, dt);
    out.look[c] = hermite(a.look[c], b.look[c], tang(i, vl), tang(i + 1, vl), u, dt);
  }
  const vf = k => k.fov, vr = k => k.roll || 0;
  out.fov = hermite(a.fov, b.fov, tang(i, vf), tang(i + 1, vf), u, dt);
  out.roll = hermite(a.roll || 0, b.roll || 0, tang(i, vr), tang(i + 1, vr), u, dt);
  out.i = i % n; out.u = u;
  return out;
}

/* the time rate at take time t: eased from rate key to rate key (FILM.warp's rate()) */
export function rateAt(rates, t) {
  if (!rates || !rates.length) return null;
  if (rates.length === 1 || t <= rates[0].t) return rates[0].rate;
  let i = 0; while (i < rates.length - 2 && rates[i + 1].t <= t) i++;
  const a = rates[i], b = rates[i + 1];
  if (t >= b.t) return b.rate;
  const k = ss(a.t, b.t, t);
  return a.rate + (b.rate - a.rate) * k;
}

export function fmtRate(r) {
  if (!(r > 0)) return 'x0';
  if (r >= 9.5) return 'x' + Math.round(r);
  if (r >= .97) return Math.abs(r - Math.round(r)) < .05 ? 'x' + Math.round(r) : 'x' + r.toFixed(1);
  return 'x' + String(+r.toFixed(2)).replace(/^0\./, '0.');
}
export function fmtT(s) {
  s = Math.max(0, s || 0);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`;
}
