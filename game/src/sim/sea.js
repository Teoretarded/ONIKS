/* The swell: one wave model for the sea the renderer draws (engine/terrain.js builds its `waves` / `seaAmp` from the
   weather with the same formula as swellOf below) and for the hulls that ride it. Pure math, no DOM: the sim, the
   engine and the render poses all use it.

   const sw = swellOf({ wind: [3, -2], sea: .3 })        // { waves: [{ kx, kz, A, w, ph }], amp }
   seaAt(sw.waves, sw.amp, x, z, t)                        // surface height (m) at world x, z, time t (s)
   hullMotion(waves, amp, x, z, hdg, vx, vz, hull, t, out) // a hull's heave / pitch / roll on that surface

   A ship is a low-pass filter of the sea: the swell is a sum of long-crested sine trains, so its steady response is a
   sum of sines too, closed form per train (no state, exact at any time: scrubbing, stills and replays stay right):
   - the hull averages the surface over its waterplane: heave takes each train times sinc(k_l L/2) sinc(k_b B/2),
     pitch the least-squares slope along the length (3 (sin x - x cos x) / x^3, x = k_l L/2), roll the slope across
     the beam (the same over B) averaged along the length (sinc(k_l L/2));
   - each mode is a damped oscillator (natural period T, damping ratio zeta) driven at the encounter frequency
     (w_e = |w - k.v|: a ship steaming into the waves meets them faster): gain 1 / sqrt((1 - r^2)^2 + (2 zeta r)^2),
     phase lag atan2(2 zeta r, 1 - r^2), r = w_e / w_n.
   So a carrier (333 m, roll period ~20 s) sits nearly still on a swell that rolls a destroyer (155 m, ~11 s) 5 deg,
   short waves pass under long hulls, and a ship beam-on to a swell near her roll period rolls hardest. */

const G = 9.81;

/* the swell trains for a weather { wind: [dx, dz], sea: 0..1 }: identical to engine/terrain.js setWeather */
export function swellOf(w) {
  w = w || {};
  const wind = w.wind || [3, -2], ang = Math.atan2(wind[0], wind[1]), sea = w.sea !== undefined ? w.sea : .3;
  const Ls = .8 + .6 * sea;
  const comps = [[144 * Ls, .85, 0], [96 * Ls, .45, .55], [58 * Ls, .25, -.7], [31 * Ls, .12, 1.2]];
  const waves = comps.map(([L, A, da], k) => { const kk = 2 * Math.PI / L, a = ang + da; return { kx: Math.sin(a) * kk, kz: Math.cos(a) * kk, A, w: Math.sqrt(G * kk), ph: k * 1.7 + .3 }; });
  return { waves, amp: .45 + 1.7 * sea };
}

/* surface height at (x, z), time t */
export function seaAt(waves, amp, x, z, t) {
  let y = 0;
  for (let i = 0; i < waves.length; i++) { const w = waves[i]; y += w.A * Math.sin(w.kx * x + w.kz * z - w.w * t + w.ph); }
  return y * amp;
}

const sinc = x => { const a = Math.abs(x); return a < 1e-4 ? 1 : Math.sin(a) / a; };
/* least-squares slope of sin(k s) over s in [-a, a], per unit k: 3 (sin x - x cos x) / x^3 (1 at x -> 0) */
const slopeK = x => { const a = Math.abs(x); if (a < 1e-3) return 1; return 3 * (Math.sin(a) - a * Math.cos(a)) / (a * a * a); };

/* hull: { L, B, Th (heave/pitch natural period, s), Tr (roll period, s), zh, zr (damping ratios) }.
   vx, vz: the hull's velocity through the pattern in metres per unit of t (the caller scales it when the sea's clock
   runs slower than the ship's). out: { heave (m), pitch (rad, + bow up), roll (rad, + starboard down) } */
export function hullMotion(waves, amp, x, z, hdg, vx, vz, hull, t, out) {
  const s = Math.sin(hdg), c = Math.cos(hdg);                   // forward (s, c), starboard (c, -s) in (x, z)
  const L = hull.L, B = hull.B, wh = 2 * Math.PI / (hull.Th || 7), wr = 2 * Math.PI / (hull.Tr || 11);
  const zh = hull.zh || .45, zr = hull.zr || .1;
  let heave = 0, pitch = 0, roll = 0;
  for (let i = 0; i < waves.length; i++) {
    const w = waves[i], A = w.A * amp;
    const kl = w.kx * s + w.kz * c, kb = w.kx * c - w.kz * s;      // wavenumber along the hull and across it
    const we = Math.abs(w.w - (w.kx * vx + w.kz * vz)) + 1e-3;     // encounter frequency
    const ph = w.kx * x + w.kz * z - w.w * t + w.ph;
    const aL = sinc(kl * L * .5), aB = sinc(kb * B * .5);
    // heave: the waterplane's mean height, through the heave oscillator
    let r = we / wh, d1 = 1 - r * r, d2 = 2 * zh * r, g = 1 / Math.sqrt(d1 * d1 + d2 * d2), lag = Math.atan2(d2, d1);
    heave += A * aL * aB * g * Math.sin(ph - lag);
    // pitch: the slope along the length (same period and damping as heave)
    pitch += A * kl * slopeK(kl * L * .5) * aB * g * Math.cos(ph - lag);
    // roll: the slope across the beam, averaged along the length, through the lightly damped roll oscillator
    r = we / wr; d1 = 1 - r * r; d2 = 2 * zr * r; g = 1 / Math.sqrt(d1 * d1 + d2 * d2); lag = Math.atan2(d2, d1);
    roll -= A * kb * slopeK(kb * B * .5) * aL * g * Math.cos(ph - lag);
  }
  out.heave = heave;
  out.pitch = pitch > .2 ? .2 : pitch < -.2 ? -.2 : pitch;
  out.roll = roll > .35 ? .35 : roll < -.35 ? -.35 : roll;
  return out;
}

/* the hull a unit rides the swell with (natural periods from its size unless the unit table gives them) */
export function hullOf(def) {
  if (def._hull) return def._hull;
  const m = def.mot || {}, L = def.size[0], B = m.beam || def.size[1];
  // heave / pitch: ~1.9 sqrt(draught) + L / 90 s; roll: ~0.8 B / sqrt(GM) with GM ~ 0.07 B (the unit table's mot.rollT
  // / mot.heaveT win; mot.beam is the waterline beam where the deck overhangs it, as a carrier's does)
  const Th = m.heaveT || Math.max(4, Math.min(11, 1.9 * Math.sqrt(def.draught || 5) + L / 90));
  const Tr = m.rollT || Math.max(5, .8 * B / Math.sqrt(.07 * B));
  return (def._hull = { L, B, Th, Tr, zh: .45, zr: m.rollZ || .1 });
}
