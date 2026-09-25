/* Weather: rain squalls are discs drifting with the wind that cut detection inside them; storms add lightning
   strikes (events) that briefly reveal every unit near the flash to both sides. Haze shortens camera range. */
import { flashReveal } from './sensors.js';
import { ground } from './util.js';

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
    // speed of the cells: the wind (m/s), at least a slow drift
    const w = Math.hypot(this.wind[0], this.wind[1]);
    this.vx = w > .1 ? this.wind[0] * 1.5 : 2; this.vz = w > .1 ? this.wind[1] * 1.5 : 1;
  }
  step(dt) {
    if (!this.squalls.length) return;
    const W = this.sim.map.W / 2, H = this.sim.map.H / 2;
    for (const s of this.squalls) {
      s.x += this.vx * dt; s.z += this.vz * dt;
      if (s.x > W + s.r) s.x = -W - s.r; else if (s.x < -W - s.r) s.x = W + s.r;
      if (s.z > H + s.r) s.z = -H - s.r; else if (s.z < -H - s.r) s.z = H + s.r;
    }
    const sim = this.sim;
    if (sim.t >= this.nextFlash) {
      const r = sim.rng.wx;
      this.nextFlash = sim.t + 3 + r() * 9;
      const s = this.squalls[Math.floor(r() * this.squalls.length)];
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * s.r * .8;
      const x = s.x + Math.sin(a) * d, z = s.z + Math.cos(a) * d;
      sim.emit('lightning', { pos: [x, ground(sim.map, x, z), z], top: [x, 3500, z], r: 3000 });
      flashReveal(sim, x, z, 3000);
    }
  }
  /* multiplier on radar / camera range at a point */
  radar(x, z) {
    let f = 1;
    for (let i = 0; i < this.squalls.length; i++) {
      const s = this.squalls[i], dx = x - s.x, dz = z - s.z;
      if (dx * dx + dz * dz < s.r * s.r) f *= s.k;
    }
    return f;
  }
  camera(x, z) {
    let f = this.kind === 'haze' ? .7 : 1;
    for (let i = 0; i < this.squalls.length; i++) {
      const s = this.squalls[i], dx = x - s.x, dz = z - s.z;
      if (dx * dx + dz * dz < s.r * s.r) f *= .35;
    }
    return f;
  }
}
