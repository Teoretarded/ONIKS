/* Weather: rain squalls are discs drifting with the wind that cut detection inside them; storms add lightning
   strikes (events) that briefly reveal every unit near the flash to both sides. Haze shortens camera range.

   Squall lines (fronts): the rhythm of a battle. In Combat (always) and in the sandbox when the weather is rain or
   storm, every 8-12 game-minutes a line of thunderstorm cells forms upwind of the fight, sweeps across it with the
   wind (13-24 m/s, a real squall line's speed; bowed forward in the middle like a bow echo) and dies downwind, each
   cell growing in (~2.5 min), holding, and collapsing (~3 min); the line lives 11-14 min. Inside a cell:
     - radars and cameras see less (radar range x .45, cameras x .35 at the core, soft toward the edge),
     - cloud-to-ground strikes flash every unit within 3 km for both sides (flashReveal),
     - a SCAN reaches farther (scanBoost: radius x 1.5 at the core; the scan code multiplies its radius by it),
   and intra-cloud flashes light the cloud (event 'lightning_ic', no game effect).
   Events: 'lightning' { pos, top, r, seed, s, cell?, unit? (the strike took the mast of that unit) },
           'lightning_ic' { pos (in the cloud), r (m lit), seed, s, cell },
           'weather' { what: 'front', phase: 'arrive' (the cells are up) | 'leave' (the line has died), front, pos
                       (the line's centre now), hdg (rad, the way it moves), speed (m/s), cells, len (m) }.
   Everything from the seeded stream sim.rng.wx, in a fixed order: deterministic. */
import { flashReveal } from './sensors.js';
import { ground } from './util.js';
import { submerged } from './subs.js';

const FRONT = {
  first: [150, 300],        // s into the match the first line forms
  every: [480, 720],        // s between lines forming (8-12 min)
  life: [660, 840],         // s a line lives (growth and collapse included)
  grow: 150, fade: 190,     // s a cell takes to build / to collapse
  cells: [5, 8],            // cells in the line
  gap: [7000, 9500],        // m between cells along the line
  r: [3800, 5800],          // m core radius of a mature cell
  cg: [22, 50],             // s between cloud-to-ground strikes of a mature cell
  ic: [7, 18],              // s between intra-cloud flashes of a mature cell
};
const ss = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (r, a) => a[0] + r() * (a[1] - a[0]);
/* the core of a cell and its soft edge (1 inside .7 r, 0 at r) */
const prof = (dx, dz, r) => { const d2 = dx * dx + dz * dz; if (d2 >= r * r) return 0; if (d2 <= .49 * r * r) return 1; return 1 - ss(.7, 1, Math.sqrt(d2) / r); };

export class Weather {
  constructor(sim, spec) {
    this.sim = sim;
    this.kind = spec.kind || 'calm';
    this.wind = (spec.wind || [0, 0]).slice();
    this.sea = spec.sea !== undefined ? spec.sea : .2;
    this.squalls = [];
    this.nextFlash = 0;
    const r = sim.rng.wx, W = sim.map.W, H = sim.map.H;
    const n = this.kind === 'rain' ? 4 : this.kind === 'storm' ? 6 : 0;
    for (let i = 0; i < n; i++) {
      this.squalls.push({
        x: (r() - .5) * W * .9, z: (r() - .5) * H * .9,
        r: (this.kind === 'storm' ? 8000 : 5000) + r() * (this.kind === 'storm' ? 10000 : 8000),
        k: this.kind === 'storm' ? .45 : .55,        // radar range factor inside
      });
    }
    this.nextFlash = this.kind === 'storm' ? 4 + r() * 6 : 1e18;
    this.nextIC = sim.t + 2 + r() * 5;
    // speed of the cells: the wind (m/s), at least a slow drift
    const w = Math.hypot(this.wind[0], this.wind[1]);
    this.vx = w > .1 ? this.wind[0] * 1.5 : 2; this.vz = w > .1 ? this.wind[1] * 1.5 : 1;
    // squall lines: Combat always, the sandbox in rain or a storm; never in a scripted mission
    const mode = sim.mode || 'sandbox';
    this.fronts = [];
    this.frontsOn = spec.fronts !== undefined ? !!spec.fronts : mode === 'combat' || (mode === 'sandbox' && (this.kind === 'rain' || this.kind === 'storm'));
    this.frontN = 0;
    this.nextFront = this.frontsOn ? sim.t + lerp(r, FRONT.first) : 1e18;
    this._cells = [];
  }

  step(dt) {
    const sim = this.sim;
    if (this.squalls.length) {
      const W = sim.map.W / 2, H = sim.map.H / 2;
      for (const s of this.squalls) {
        s.x += this.vx * dt; s.z += this.vz * dt;
        if (s.x > W + s.r) s.x = -W - s.r; else if (s.x < -W - s.r) s.x = W + s.r;
        if (s.z > H + s.r) s.z = -H - s.r; else if (s.z < -H - s.r) s.z = H + s.r;
      }
      if (sim.t >= this.nextFlash) {
        const r = sim.rng.wx;
        this.nextFlash = sim.t + 3 + r() * 9;
        const s = this.squalls[Math.floor(r() * this.squalls.length)];
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * s.r * .8;
        this.strike(s.x + Math.sin(a) * d, s.z + Math.cos(a) * d, 3500, null, r);
      }
      // the storm's cells flicker inside between the strikes
      if (this.kind === 'storm' && sim.t >= this.nextIC) {
        const r = sim.rng.wx;
        this.nextIC = sim.t + 2.5 + r() * 6;
        const i = Math.floor(r() * this.squalls.length), s = this.squalls[i];
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * s.r * .7;
        sim.emit('lightning_ic', { pos: [s.x + Math.sin(a) * d, 2600 + r() * 3200, s.z + Math.cos(a) * d], r: 4000 + r() * 3500, seed: (r() * 1e9) | 0, s: .6 + .4 * r(), cell: -1 - i });
      }
    }
    if (this.frontsOn) this.stepFronts();
  }

  /* a cloud-to-ground strike at (x, z): a unit's mast close by takes it; everything within 3 km is seen by both sides */
  strike(x, z, topY, cell, r) {
    const sim = this.sim;
    let best = null, bd = 380;
    for (const u of sim.list()) {
      if (!u.alive || u.aboard || u.def.domain === 'air' || submerged(u)) continue;
      const d = Math.hypot(u.pos[0] - x, u.pos[2] - z);
      if (d < bd) { bd = d; best = u; }
    }
    let pos;
    if (best) pos = [best.pos[0], best.pos[1] + Math.max(4, best.def.size[2] || 6), best.pos[2]];
    else pos = [x, ground(sim.map, x, z), z];
    const ev = { pos, top: [pos[0] + (r() - .5) * 900, topY, pos[2] + (r() - .5) * 900], r: 3000, seed: (r() * 1e9) | 0, s: .75 + .25 * r() };
    if (cell) ev.cell = cell.id;
    if (best) ev.unit = best.id;
    sim.emit('lightning', ev);
    flashReveal(sim, pos[0], pos[2], 3000);
  }

  /* ---------- squall lines ---------- */
  stepFronts() {
    const sim = this.sim, t = sim.t;
    if (t >= this.nextFront) { this.spawnFront(); this.nextFront = t + lerp(sim.rng.wx, FRONT.every); }
    for (let f = this.fronts.length - 1; f >= 0; f--) {
      const F = this.fronts[f], a = t - F.t0, vx = F.dx * F.v, vz = F.dz * F.v;
      let nUp = 0;
      for (const c of F.cells) {
        c.q = ss(c.dl, c.dl + FRONT.grow, a) * (1 - ss(F.life - FRONT.fade + c.dl * .4, F.life + c.dl * .4, a));
        c.r = c.r0 * (.55 + .45 * c.q);
        const s = F.v * a + c.b;
        c.x = F.x0 + F.dx * s + F.px * c.u; c.z = F.z0 + F.dz * s + F.pz * c.u;
        c.vx = vx; c.vz = vz;
        if (c.q > .5) nUp++;
        if (c.q < .55) continue;
        const r = sim.rng.wx;
        if (t >= c.nCG) {
          c.nCG = t + lerp(r, FRONT.cg) / c.q;
          const th = r() * Math.PI * 2, d = Math.sqrt(r()) * c.r * .75;
          this.strike(c.x + Math.sin(th) * d, c.z + Math.cos(th) * d, c.base + 2400 + r() * 1400, c, r);
        }
        if (t >= c.nIC) {
          c.nIC = t + lerp(r, FRONT.ic) / c.q;
          const th = r() * Math.PI * 2, d = Math.sqrt(r()) * c.r * .8;
          sim.emit('lightning_ic', { pos: [c.x + Math.sin(th) * d, c.base + 1600 + r() * (c.top - c.base) * .55, c.z + Math.cos(th) * d], r: 3500 + r() * 3500, seed: (r() * 1e9) | 0, s: .55 + .45 * r(), cell: c.id });
        }
      }
      if (!F.arrived && nUp >= Math.ceil(F.cells.length / 2)) { F.arrived = true; this.frontEvent(F, 'arrive'); }
      if (a > F.life + 60) { this.frontEvent(F, 'leave'); this.fronts.splice(f, 1); }
    }
  }
  frontEvent(F, phase) {
    const a = this.sim.t - F.t0, s = F.v * a;
    this.sim.emit('weather', { what: 'front', phase, front: F.id, pos: [F.x0 + F.dx * s, 0, F.z0 + F.dz * s], hdg: Math.atan2(F.dx, F.dz), speed: F.v, cells: F.cells.length, len: F.len });
  }
  /* where a line will pass: in turn over one side's force, the other's, and the water between them (the centroid
     of the units round each side's command unit), else the map's middle */
  frontTarget(k) {
    const sim = this.sim, c = [];
    for (const side of ['coast', 'fleet']) {
      const all = sim.alive(side), hq = sim.hq(side) || all.find(u => !u.aboard);
      if (!hq) continue;
      let x = 0, z = 0, n = 0;
      for (const u of all) { if (u.aboard || Math.hypot(u.pos[0] - hq.pos[0], u.pos[2] - hq.pos[2]) > 25000) continue; x += u.pos[0]; z += u.pos[2]; n++; }
      c.push(n ? [x / n, z / n] : [hq.pos[0], hq.pos[2]]);
    }
    if (!c.length) return [0, 0];
    if (c.length === 1) return c[0];
    const m = k % 3;
    return m === 2 ? [(c[0][0] + c[1][0]) / 2, (c[0][1] + c[1][1]) / 2] : c[m];
  }
  spawnFront() {
    const sim = this.sim, r = sim.rng.wx, W = sim.map.W / 2, H = sim.map.H / 2;
    const w = Math.hypot(this.wind[0], this.wind[1]);
    let dx, dz;
    if (w > .5) { dx = this.wind[0] / w; dz = this.wind[1] / w; } else { const a = r() * Math.PI * 2; dx = Math.sin(a); dz = Math.cos(a); }
    // a little veer off the surface wind (lines move with the wind aloft)
    { const va = (r() - .5) * .5, c = Math.cos(va), s = Math.sin(va), nx = dx * c + dz * s, nz = -dx * s + dz * c; dx = nx; dz = nz; }
    const px = dz, pz = -dx;
    const v = Math.min(24, Math.max(13, 7 + 1.4 * w + r() * 4));                // m/s (a squall line: 13-24)
    const life = lerp(r, FRONT.life);
    // the line crosses its target at mid-life, a little off it (in turn: one side, the other, the water between)
    if (this.frontK === undefined) this.frontK = Math.floor(r() * 3);
    const ac = this.frontTarget(this.frontK++);
    const cx = Math.max(-W + 8000, Math.min(W - 8000, ac[0] + px * (r() - .5) * 9000 + dx * (r() - .5) * 5000));
    const cz = Math.max(-H + 8000, Math.min(H - 8000, ac[1] + pz * (r() - .5) * 9000 + dz * (r() - .5) * 5000));
    const s0 = v * life * .5;
    const n = Math.round(lerp(r, FRONT.cells)), gap = lerp(r, FRONT.gap), half = (n - 1) / 2 * gap, bow = 1800 + r() * 2600;
    const F = { id: ++this.frontN, t0: sim.t, life, v, dx, dz, px, pz, x0: cx - dx * s0, z0: cz - dz * s0, cells: [], arrived: false, len: 2 * half + 2 * FRONT.r[1] };
    for (let i = 0; i < n; i++) {
      const u = (i - (n - 1) / 2) * gap + (r() - .5) * gap * .35, k = half > 0 ? u / half : 0;
      const dl = r() * 70 + Math.abs(k) * 40;          // the line builds from its middle outward
      const c = {
        id: F.id * 100 + i, fr: F.id, u, b: bow * (1 / 3 - k * k) + (r() - .5) * 1200, dl,       // bowed ahead in the middle
        r0: lerp(r, FRONT.r), r: 0, k: .45, q: 0, x: 0, z: 0, vx: 0, vz: 0, ltg: true,
        seed: (r() * 1e9) | 0, base: 1050 + r() * 400, top: 8600 + r() * 2800,
        nCG: 0, nIC: 0,
      };
      c.nCG = sim.t + dl + FRONT.grow * .7 + r() * 25;
      c.nIC = sim.t + dl + FRONT.grow * .45 + r() * 12;
      F.cells.push(c);
    }
    this.fronts.push(F);
  }

  /* every cell to draw: the preset's squalls (while it rains or storms) and the lines' cells. The same objects every
     frame (the preset's squalls are annotated in place: seed, base, top, q, ltg); do not keep the array. */
  cells() {
    const out = this._cells; out.length = 0;
    const wet = this.kind === 'rain' || this.kind === 'storm', storm = this.kind === 'storm';
    if (wet) for (let i = 0; i < this.squalls.length; i++) {
      const s = this.squalls[i];
      if (s.seed === undefined) { s.seed = 7919 * (i + 1) + 131; s.base = storm ? 1150 + (i % 3) * 150 : 1500 + (i % 3) * 120; s.top = storm ? 9000 + (i % 4) * 700 : 4200 + (i % 3) * 500; s.id = -1 - i; }
      s.q = 1; s.ltg = storm; s.vx = this.vx; s.vz = this.vz;
      out.push(s);
    }
    for (const F of this.fronts) for (const c of F.cells) if (c.q > .002) out.push(c);
    return out;
  }

  /* multiplier on radar / camera range at a point */
  radar(x, z) {
    let f = 1;
    for (let i = 0; i < this.squalls.length; i++) {
      const s = this.squalls[i], dx = x - s.x, dz = z - s.z;
      if (dx * dx + dz * dz < s.r * s.r) f *= s.k;
    }
    for (const F of this.fronts) for (const c of F.cells) {
      if (c.q <= 0) continue;
      const p = prof(x - c.x, z - c.z, c.r);
      if (p > 0) f *= 1 - (1 - c.k) * c.q * p;
    }
    return f;
  }
  camera(x, z) {
    let f = this.kind === 'haze' ? .7 : 1;
    for (let i = 0; i < this.squalls.length; i++) {
      const s = this.squalls[i], dx = x - s.x, dz = z - s.z;
      if (dx * dx + dz * dz < s.r * s.r) f *= .35;
    }
    for (const F of this.fronts) for (const c of F.cells) {
      if (c.q <= 0) continue;
      const p = prof(x - c.x, z - c.z, c.r);
      if (p > 0) f *= 1 - .65 * c.q * p;
    }
    return f;
  }
  /* how much farther a SCAN reaches when it is fired into a thunderstorm cell (1 outside, 1.5 at a mature core):
     the scan's lightning runs through the charged cloud. The scan code multiplies its radius by it. */
  scanBoost(x, z) {
    let b = 1;
    if (this.kind === 'storm') for (let i = 0; i < this.squalls.length; i++) {
      const s = this.squalls[i], p = prof(x - s.x, z - s.z, s.r);
      if (p > 0) b = Math.max(b, 1 + .5 * p);
    }
    for (const F of this.fronts) for (const c of F.cells) {
      if (c.q <= 0) continue;
      const p = prof(x - c.x, z - c.z, c.r);
      if (p > 0) b = Math.max(b, 1 + .5 * c.q * p);
    }
    return b;
  }
  /* 0..1: how deep in rain a point is (the view uses it for the rain round the lens) */
  rainAt(x, z) {
    let k = 0;
    if (this.kind === 'rain' || this.kind === 'storm') for (let i = 0; i < this.squalls.length; i++) {
      const s = this.squalls[i], p = prof(x - s.x, z - s.z, s.r * 1.05);
      if (p > k) k = p;
    }
    for (const F of this.fronts) for (const c of F.cells) {
      if (c.q <= 0) continue;
      const p = prof(x - c.x, z - c.z, c.r * 1.05) * c.q;
      if (p > k) k = p;
    }
    return k;
  }
}
