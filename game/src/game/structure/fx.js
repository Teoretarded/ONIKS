/* Structure effects: what a hull breaking shows (game/structure/index.js lays them, drawn here through R.fx).

   sparks   steel tearing along the break: a burst round the girth when the joint goes, then grinding sparks while the
            two halves still hang together (as many as the load on the hinge), white-hot, arcing down, out in the water
   foam     the water rushing into the open ends: a churning white band round the torn face where it meets the sea,
            a ring running out; as long as the open compartments are still filling
   steam    white puffs off hot steel going under at the tear
   slick    fuel oil spreading from the break for minutes, drifting downwind: a faint dim sheen of dots on the water
   faces    the torn face's inside (layout.js faceOf: shell, decks, inner bottom, girders), each dot on its own tear,
            glowing at first, then dark grey; seen where the two halves have opened
   Sparks live in a ring buffer (birth, place, velocity); the rest is analytic in time with seeded hashes (no
   Math.random, no allocation per frame). */
import { hsh } from './layout.js';

const TAU = Math.PI * 2;
const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;
const ss = (a, b, v) => { const t = sat((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const NSP = 3000, SPS = 7;

export function createBreakFx(game) {
  const R = game.R, cam = R.camera;
  const SP = new Float32Array(NSP * SPS);     // birth, x, y, z, vx, vy, vz
  let spN = 0, spHead = 0;
  const W = [0, 0, 0];

  function spark(t, x, y, z, vx, vy, vz) {
    const o = spHead * SPS;
    SP[o] = t; SP[o + 1] = x; SP[o + 2] = y; SP[o + 3] = z; SP[o + 4] = vx; SP[o + 5] = vy; SP[o + 6] = vz;
    spHead = (spHead + 1) % NSP; if (spN < NSP) spN++;
  }
  /* a burst of n sparks from world points given by at(k, out) (k 0..n-1), thrown out at up to spd m/s */
  function burst(t, n, at, spd, seed) {
    for (let k = 0; k < n; k++) {
      at(k, W);
      const a = hsh(k, seed) * TAU, e = .2 + .8 * hsh(k, seed + 1), s = spd * (.25 + .75 * hsh(k, seed + 2));
      spark(t + hsh(k, seed + 3) * .25, W[0], W[1], W[2], Math.cos(a) * s * (1 - e * .5), s * e, Math.sin(a) * s * (1 - e * .5));
    }
  }
  function drawSparks(t, seaY) {
    const fx = R.fx, e = cam.eye;
    let n = 0;
    for (let i = 0; i < spN; i++) {
      const o = i * SPS, a = t - SP[o];
      if (a < 0 || a > 1.6) continue;
      const k = Math.exp(-a * 1.2), x = SP[o + 1] + SP[o + 4] * (1 - k) / 1.2, z = SP[o + 3] + SP[o + 6] * (1 - k) / 1.2;
      const y = SP[o + 2] + (SP[o + 5] + 8.2) * (1 - k) / 1.2 - 8.2 * a;
      if (y < seaY(x, z)) continue;
      const d = Math.hypot(x - e[0], y - e[1], z - e[2]);
      if (d > 9000) continue;
      const h = 1 - a / 1.6;
      fx.dotXYZ(x, y, z, d < 400 ? 2 : 1.3, 255, 200 + 50 * h, 120 + 110 * h * h, Math.min(1, 1.3 * h), 'add');
      n++;
    }
    return n;
  }

  /* the churn and ring where the open end meets the water: c the point on the water, B the beam, k 0..1 how hard it
     rushes in, age since the break */
  function drawFoam(t, B, c, hdg, k, age, seed, sea) {
    const fx = R.fx, e = cam.eye, d = Math.hypot(c[0] - e[0], c[1] - e[1], c[2] - e[2]);
    if (d > 14000 || k < .02) return 0;
    const pxm = (cam.fl || 1000) / Math.max(1, d), q = Math.min(1, Math.max(.15, B * pxm / 60));
    const s = Math.sin(hdg), co = Math.cos(hdg);
    let n = 0;
    // the churn: short-lived white dots boiling up in a band across the break, wider as it opens
    const nc = Math.round(300 * q * k);
    for (let i = 0; i < nc; i++) {
      const per = .6 + .9 * hsh(i, seed), ph = t / per + hsh(i, seed + 1), cyc = Math.floor(ph), f = ph - cyc;
      const u = (hsh(i * 7 + cyc, seed + 2) - .5) * 2, v = (hsh(i * 11 + cyc, seed + 3) - .5);
      const ac = u * B * (.65 + .25 * sat(age / 20)), al = v * B * (.5 + .8 * sat(age / 30));
      const x = c[0] + s * al + co * ac, z = c[2] + co * al - s * ac;
      const y = sea(x, z) + .2 + 1.8 * Math.sin(f * Math.PI) * hsh(i, seed + 4) * k;
      fx.dotXYZ(x, y, z, pxm > 3 ? 2 : 1.2, 236, 240, 236, .85 * Math.sin(f * Math.PI) * k, 'max');
      n++;
    }
    // the ring running out from the break for the first seconds
    if (age < 14) {
      const Rr = B * .6 + age * (4 + B * .12), w = 1 - age / 14, nr = Math.round(Math.min(260, Rr * pxm * 2.2) * Math.max(.4, q));
      for (let i = 0; i < nr; i++) {
        const th = i / nr * TAU, rr = Rr * (.93 + .14 * hsh(i, seed + 5));
        const x = c[0] + Math.cos(th) * rr, z = c[2] + Math.sin(th) * rr;
        fx.dotXYZ(x, sea(x, z) + .25, z, 1.2, 230, 236, 232, .7 * w, 'max');
      }
      n += nr;
    }
    return n;
  }

  /* steam off hot steel at the waterline: puffs rising and spreading, blown downwind */
  function drawSteam(t, c, B, heat, seed, wind) {
    const fx = R.fx, e = cam.eye, d = Math.hypot(c[0] - e[0], c[1] - e[1], c[2] - e[2]);
    if (d > 12000 || heat < .03) return 0;
    const pxm = (cam.fl || 1000) / Math.max(1, d), np = Math.round(Math.min(160, 30 + B * 4) * Math.min(1, heat * 1.5));
    let n = 0;
    for (let i = 0; i < np; i++) {
      const per = 2.5 + 3 * hsh(i, seed), ph = t / per + hsh(i, seed + 1), cyc = Math.floor(ph), f = ph - cyc;
      const u = (hsh(i * 13 + cyc, seed + 2) - .5) * B * 1.1, rad = .8 + 5 * f;
      const j1 = hsh(i + cyc * 3, seed + 3) - .5, j2 = hsh(i + cyc * 5, seed + 4) - .5, j3 = hsh(i + cyc * 7, seed + 5) - .5;
      const x = c[0] + u * c[3] + j1 * rad + wind[0] * f * per * .6, z = c[2] + u * c[4] + j3 * rad + wind[1] * f * per * .6;
      const y = c[1] + 1 + 16 * f + j2 * rad * .5;
      fx.dotXYZ(x, y, z, pxm > 2.5 ? 2 : 1.2, 238, 240, 236, .5 * heat * (1 - f) * Math.min(1, f * 6), 'max');
      n++;
    }
    return n;
  }

  /* the slick: fuel spreading from o (world, on the water) since t0, drifting downwind */
  function drawSlick(t, o, t0, L, seed, wind, sea, fade) {
    const fx = R.fx, e = cam.eye, age = t - t0;
    if (age < 0) return 0;
    const cx = o[0] + wind[0] * age * .25, cz = o[2] + wind[1] * age * .25;
    const d = Math.hypot(cx - e[0], e[1], cz - e[2]);
    if (d > 16000) return 0;
    const pxm = (cam.fl || 1000) / Math.max(1, d), Rs = L * (.12 + .6 * sat(age / 240)) + 6;
    const ns = Math.round(Math.min(700, 80 + Rs * pxm * 5) * (pxm * Rs > 20 ? 1 : .35));
    const a0 = .3 * sat(age / 6) * fade;
    let n = 0;
    for (let i = 0; i < ns; i++) {
      const th = hsh(i, seed) * TAU, rr = Math.sqrt(hsh(i, seed + 1)), st = 1 + .8 * hsh(i, seed + 2);
      const x = cx + Math.cos(th) * rr * Rs * st, z = cz + Math.sin(th) * rr * Rs * .6;
      fx.dotXYZ(x, sea(x, z) + .15, z, 1, 196, 200, 190, a0 * (1 - rr * .6) * (.5 + .5 * hsh(i, seed + 3)), 'max');
      n++;
    }
    return n;
  }

  /* the torn face's inside: points F (model frame [x y z kind] x n) through a piece's model transform (Rm, Tm), heat
     0..1; only the dots above the water (the rest is under the sea's occluder anyway) */
  function drawFace(F, Rm, Tm, heat, d, seed, sp) {
    const fx = R.fx, n = F.length / 4;
    if (!n || d > 8000) return 0;
    // no closer than ~2.5 px on screen
    const pxm = (cam.fl || 1000) / Math.max(1, d), step = Math.max(1, Math.min(12, Math.ceil(2.5 / Math.max(.01, (sp || .5) * pxm))));
    let m = 0;
    for (let i = 0; i < n; i += step) {
      const x = F[i * 4], y = F[i * 4 + 1], z = F[i * 4 + 2], kind = F[i * 4 + 3];
      const wx = Tm[0] + Rm[0] * x + Rm[1] * y + Rm[2] * z, wy = Tm[1] + Rm[3] * x + Rm[4] * y + Rm[5] * z, wz = Tm[2] + Rm[6] * x + Rm[7] * y + Rm[8] * z;
      const h = heat * (.6 + .4 * hsh(i, seed));
      const g = kind === 1 ? 150 : kind === 2 ? 118 : 176, b = (g + (255 - g) * h) * (.75 + .25 * hsh(i, seed + 1));
      fx.dotXYZ(wx, wy, wz, pxm > 6 ? 2 : 1.4, b, g + (190 - g) * h, g * (1 - h) + 110 * h, 1, 'max');
      m++;
    }
    return m;
  }

  return { spark, burst, drawSparks, drawFoam, drawSteam, drawSlick, drawFace, get sparks() { return spN; } };
}
