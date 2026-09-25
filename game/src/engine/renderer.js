/* The frame: graphite vignette, the occluder, seabed, sky, terrain and sea dots, models, effect dots (max,
   then additive glows, then alpha-over lines), the flash lift; the 2D overlay on top.

   const R = new Renderer({ canvas, overlay, map });
   loop: R.frame(dt, t)            // camera + begin
         R.draw({ key: 'tel', T: [x, y, z], hdg, st: { elev: 1.2 }, tint: 'own' })
         R.fx.dot(...), R.light(...), R.setScan(...)
         R.end()                   // renders; then draw on R.overlay */
import { createGL, program } from './gl.js';
import { HEAD } from './shaders.js';
import { RTSCamera } from './camera.js';
import { Terrain } from './terrain.js';
import { ModelLib, attitude } from './models.js';
import { FX, LIME, CORAL, WH } from './fx.js';
import { Overlay } from './overlay.js';
import { Wire } from './wire.js';

const R_EARTH = 6371000;
export const TINT = { own: [198 / 255, 244 / 255, 50 / 255], hostile: [1, 106 / 255, 61 / 255], unknown: [1, 1, 1], neutral: [1, 1, 1] };

const VS_BG = HEAD + `
out vec2 vUv;
void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }
`;
const FS_BG = HEAD + `
in vec2 vUv; out vec4 o;
uniform vec4 uBg;          // rgb, vignette
void main() {
  vec2 d = vUv * 2.0 - 1.0;
  float v = 1.0 - uBg.w * min(1.0, (d.x * d.x * 0.6 + d.y * d.y * 0.9) * 0.7);
  o = vec4(uBg.rgb * v, 1.0);
}
`;

export class Renderer {
  constructor(o) {
    this.G = createGL(o.canvas, { renderScale: o.renderScale || 1, maxDpr: o.maxDpr || 2 });
    const gl = this.gl = this.G.gl;
    this.map = o.map;
    this.terrain = new Terrain(this.G, o.map, o.terrain);
    this.camera = new RTSCamera(Object.assign({ ground: (x, z) => this.terrain.heightAt(x, z), bounds: [-o.map.W / 2 - 20000, -o.map.H / 2 - 20000, o.map.W / 2 + 20000, o.map.H / 2 + 20000] }, o.camera || {}));
    this.models = new ModelLib(this.G);
    this.fx = new FX(this.G, this);
    // GPU hairlines (the Orbital language), flushed at the end of the frame; a failure here never takes the points down
    try { this.wire = new Wire(this.G, this); } catch (e) { console.error('renderer: hairlines unavailable', e); this.wire = null; }
    this.pcOff = false;                        // skip the point passes (a hairline picture covers the whole frame)
    this.overlay = o.overlay ? new Overlay(o.overlay) : null;
    this.pBg = program(gl, VS_BG, FS_BG, 'bg');
    this.bg = [11 / 255, 12 / 255, 10 / 255]; this.vignette = .62;
    this.sun = norm([-.5, .62, -.6]);          // low moon from the south-west (films)
    this.worldBright = 1; this.modelBright = 1.3; this.skyBright = 1;
    this.seaOcclude = true;                    // the sea surface hides what is below it (Inspect turns it off)
    this.fadeScale = 1;
    this.queue = []; this.lights = [];
    this.scans = [{ mode: 0 }, { mode: 0 }];
    this.sweep = null;
    this.t = 0;
    this.stats = { ms: 0, draws: 0, points: 0 };
    // frame uniform block
    this.ubo = gl.createBuffer();
    this.uboData = new Float32Array(16 + 4 * 6 + 4 * 6 + 4 * 32 + 4 * 3);
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.ubo);
    gl.bufferData(gl.UNIFORM_BUFFER, this.uboData.byteLength, gl.DYNAMIC_DRAW);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, this.ubo);
    this.frameInfo = { fl1080: 1, sphereVisible: () => true };
  }

  /* camera update + begin, the usual per-frame call */
  frame(dt, t) { this.resize(); this.camera.update(dt); this.begin(t); }
  resize() {
    const G = this.G;
    G.resize();
    this.camera.setViewport(G.cssW, G.cssH);
    if (this.overlay) this.overlay.resize(G.cssW, G.cssH, G.dpr);
  }
  set renderScale(v) { this.G.renderScale = v; this.resize(); }
  get renderScale() { return this.G.renderScale; }

  begin(t) {
    this.t = t;
    const cam = this.camera, G = this.G;
    this.queue.length = 0; this.lights.length = 0;
    this.fx.begin(cam.eye);
    if (this.wire) this.wire.begin(cam.eye);
    this.models.begin();
    this.terrain.prepare(cam, t);
    const fl1080 = 540 / Math.tan(cam.fov / 2);
    const f = cam.f, r = cam.r, u = cam.u, tx = (cam.W / 2) / cam.fl * 1.02, ty = (cam.H / 2) / cam.fl * 1.02;
    const planes = [
      [f[0], f[1], f[2], -cam.near],
      [r[0] + f[0] * tx, r[1] + f[1] * tx, r[2] + f[2] * tx, 0],
      [-r[0] + f[0] * tx, -r[1] + f[1] * tx, -r[2] + f[2] * tx, 0],
      [u[0] + f[0] * ty, u[1] + f[1] * ty, u[2] + f[2] * ty, 0],
      [-u[0] + f[0] * ty, -u[1] + f[1] * ty, -u[2] + f[2] * ty, 0],
    ];
    this.frameInfo = {
      fl1080,
      /* dv: centre relative to the eye; the curvature drop is applied to the test */
      sphereVisible(dv, rad) {
        const dy = dv[1] - (dv[0] * dv[0] + dv[2] * dv[2]) / (2 * R_EARTH);
        for (const P of planes) if (P[0] * dv[0] + P[1] * dy + P[2] * dv[2] + P[3] < -rad) return false;
        return true;
      },
    };
    if (this.overlay) this.overlay.clear();
  }

  /* ---------- scene API ---------- */
  /* queue a model instance. d: { key, T: [x, y, z] (world), R (3x3 row-major) or hdg / pitch / roll, st,
     tint: 'own' | 'hostile' | 'unknown' | 'neutral' | [r, g, b] 0..1, tintK, alpha, xray, damage {part: 0..1},
     partAlpha, partXray, partX {part: {R, T}}, explode 0..1, bright, dissolve, noBack, id } */
  draw(d) {
    if (d.hdg !== undefined || d.pitch !== undefined || d.roll !== undefined || !d.R) d.R = attitude(d.hdg || 0, d.pitch || 0, d.roll || 0);
    // resolved tint (the caller's fields are left as they are)
    const k = d.tint;
    if (typeof k === 'string') {
      d._rgb = TINT[k] || TINT.unknown;
      d._face = d.tintFace !== undefined ? d.tintFace : k === 'hostile' ? .16 : k === 'own' ? .04 : 0;
      d._k = d.tintK !== undefined ? d.tintK : (k === 'unknown' || k === 'neutral') ? 0 : .6;
    } else if (k) { d._rgb = k; d._face = d.tintFace !== undefined ? d.tintFace : .08; d._k = d.tintK !== undefined ? d.tintK : .6; }
    else { d._rgb = null; d._face = 0; d._k = 0; }
    this.queue.push(d);
    return d;
  }
  /* a dynamic light for this frame: p world, radius m, rgb 0..255, intensity (1 ~ a strong flash) */
  light(p, radius, rgb, intensity) {
    if (this.lights.length >= 16) {
      let mi = 0; for (let i = 1; i < 16; i++) if (this.lights[i].i < this.lights[mi].i) mi = i;
      if (this.lights[mi].i >= intensity) return;
      this.lights.splice(mi, 1);
    }
    this.lights.push({ p, r: radius, c: rgb || WH, i: intensity === undefined ? 1 : intensity });
  }
  /* lime scan front i (0 or 1): { mode: 'plane' | 'sphere' | 'off', origin [x,y,z], normal [x,y,z] (plane),
     front (m along the normal from the origin, or the sphere radius), width (m), decay (m of afterglow), amp,
     rgb (0..255), reveal (0..1 tint left behind the front) } */
  setScan(i, s) { this.scans[i] = s && s.mode !== 'off' ? s : { mode: 0 }; }
  /* the radar sweep painting the sea and the land: { origin [x, z], bearing (rad), amp, afterglow (rad), range (m), edge (rad) } or null */
  setSweep(s) { this.sweep = s; }
  /* darken the finished frame toward black by a (0..1), leaving the CSS px rect `exclude` as it is (a cross-fade
     into the hairline picture; call after end()). dissolve 0..1: the returns go out one by one instead of dimming */
  veil(a, exclude, rgb, dissolve) { if (this.wire) this.wire.veil(a, rgb, exclude, dissolve); }
  /* screen box of a queued/drawn instance (tight, from its points); null off screen */
  screenBox(d) { if (d.hdg !== undefined || !d.R) d.R = attitude(d.hdg || 0, d.pitch || 0, d.roll || 0); return this.models.screenBox(d, this.camera); }
  /* the instance under a screen point (CSS px) among the instances drawn this frame (those with an id) */
  pick(sx, sy) {
    const cam = this.camera, q = [0, 0, 0];
    let best = null, bd = 1e9;
    for (const d of this.queue) {
      if (d.id === undefined) continue;
      const e = this.models.get(d.key), c = d.T;
      if (!cam.project(c, q)) continue;
      const rpx = Math.max(8, cam.fl * e.radius / q[2]);
      const dd = Math.hypot(q[0] - sx, q[1] - sy);
      if (dd < rpx && dd / rpx < bd) { bd = dd / rpx; best = d; }
    }
    return best;
  }

  /* ---------- render ---------- */
  _ubo() {
    const cam = this.camera, G = this.G, D = this.uboData, e = cam.eye;
    const sx = cam.fl / (cam.W / 2), sy = cam.fl / (cam.H / 2), f = cam.f, r = cam.r, u = cam.u;
    // uVP, column-major: clip = (sx r.p, sy u.p, f.p, f.p)
    D.set([sx * r[0], sy * u[0], f[0], f[0], sx * r[1], sy * u[1], f[1], f[1], sx * r[2], sy * u[2], f[2], f[2], 0, 0, 0, 0], 0);
    D.set([e[0], e[1], e[2], this.t], 16);
    const fl1080 = 540 / Math.tan(cam.fov / 2);
    D.set([fl1080, G.H / 1080, 2 / Math.log2(cam.far + 1), cam.near], 20);
    D.set([f[0], f[1], f[2], cam.fl * G.H / cam.H], 24);
    D.set([this.sun[0], this.sun[1], this.sun[2], 1 / (2 * R_EARTH)], 28);
    const fadeD = (3000 + cam.dist * 3.2 + cam.clearance * 4) * this.fadeScale;
    D.set([fadeD, .42, this.worldBright, this.lights.length], 32);
    for (let i = 0; i < 2; i++) {
      const s = this.scans[i], o = 36 + i * 4, ob = 44 + i * 4, oc = 52 + i * 4;
      if (!s || !s.mode) { D.set([0, 0, 0, 0], o); D.set([0, 1, 1, 0], ob); D.set([0, 0, 0, 0], oc); continue; }
      const c = s.rgb || LIME;
      if (s.mode === 'plane') {
        const n = norm(s.normal || [0, 0, 1]), og = s.origin || e;
        // front plane: n.(p - origin) = front  ->  n.p_rte = front + n.(origin - eye)
        D.set([n[0], n[1], n[2], 1], o);
        D.set([s.front + n[0] * (og[0] - e[0]) + n[1] * (og[1] - e[1]) + n[2] * (og[2] - e[2]), s.width || 2, s.decay || 6, s.amp === undefined ? 1 : s.amp], ob);
      } else {
        const og = s.origin || e;
        D.set([og[0] - e[0], og[1] - e[1], og[2] - e[2], 2], o);
        D.set([s.front, s.width || 2, s.decay || 6, s.amp === undefined ? 1 : s.amp], ob);
      }
      D.set([c[0] / 255, c[1] / 255, c[2] / 255, s.reveal || 0], oc);
    }
    for (let i = 0; i < 16; i++) {
      const L = this.lights[i], op = 60 + i * 4, oc = 124 + i * 4;
      if (!L) { D.set([0, 0, 0, 1], op); D.set([0, 0, 0, 0], oc); continue; }
      D.set([L.p[0] - e[0], L.p[1] - e[1], L.p[2] - e[2], L.r], op);
      D.set([L.c[0] / 255 * L.i, L.c[1] / 255 * L.i, L.c[2] / 255 * L.i, 0], oc);
    }
    const sw = this.sweep;
    if (sw) {
      D.set([sw.origin[0] - e[0], sw.origin[1] - e[2], sw.bearing, sw.amp === undefined ? 1 : sw.amp], 188);
      D.set([sw.afterglow || 1.2, sw.range || 60000, sw.edge || .035, 0], 192);
    } else { D.set([0, 0, 0, 0], 188); D.set([1, 1, 1, 0], 192); }
    D.set([this.terrain.seaAmp, 0, this.modelBright, Math.max(25000, fadeD * 4)], 196);
    const gl = this.gl;
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.ubo);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, D);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, this.ubo);
  }

  /* the units on screen the world dims round (terrain.subjectDim): the biggest queued instances, up to 12 */
  _subjects() {
    const cam = this.camera, e = cam.eye, f = cam.f, r = cam.r, u = cam.u, fl = 540 / Math.tan(cam.fov / 2);
    const list = this._subjList || (this._subjList = []), pool = this._subjPool || (this._subjPool = []);
    list.length = 0;
    if (this.terrain.subjectDim > 0 && this.worldBright > 0) for (const d of this.queue) {
      if ((d.alpha !== undefined && d.alpha < .3) || !d.T) continue;
      const m = this.models.has ? (this.models.has(d.key) ? this.models.get(d.key) : null) : this.models.get(d.key);
      if (!m || !m.radius) continue;
      const R = d.R, c0 = m.center || [0, 0, 0];
      const cx = d.T[0] - e[0] + (R ? R[0] * c0[0] + R[1] * c0[1] + R[2] * c0[2] : c0[0]);
      const cy = d.T[1] - e[1] + (R ? R[3] * c0[0] + R[4] * c0[1] + R[5] * c0[2] : c0[1]);
      const cz = d.T[2] - e[2] + (R ? R[6] * c0[0] + R[7] * c0[1] + R[8] * c0[2] : c0[2]);
      const cyd = cy - (cx * cx + cz * cz) / (2 * R_EARTH);
      const zc = cx * f[0] + cyd * f[1] + cz * f[2];
      if (zc < cam.near) continue;
      const sr = fl * m.radius / zc;
      if (sr < 2.5) continue;
      const sx = fl * (cx * r[0] + cyd * r[1] + cz * r[2]) / zc, sy = fl * (cx * u[0] + cyd * u[1] + cz * u[2]) / zc;
      if (Math.abs(sy) > 540 + 3 * sr || Math.abs(sx) > 540 * cam.W / Math.max(1, cam.H) + 3 * sr) continue;
      const s = pool[list.length] || (pool[list.length] = { c: [0, 0, 0] });
      s.c[0] = cx; s.c[1] = cy; s.c[2] = cz; s.sx = sx; s.sy = sy; s.sr = sr; s.z = zc;
      // the pool round it: a few radii, and never under ~34 px on screen
      s.r = Math.max(m.radius * 2.4, 34 * zc / fl);
      list.push(s);
      if (list.length >= 64) break;
    }
    list.sort((a, b) => b.sr - a.sr);
    this.terrain.setSubjects(list);
  }

  end() {
    const gl = this.gl, G = this.G, t0 = performance.now();
    this._ubo();
    gl.viewport(0, 0, G.W, G.H);
    gl.disable(gl.CULL_FACE);
    // background (pure black under a hairline picture)
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.disable(gl.BLEND);
    gl.useProgram(this.pBg.p);
    if (this.pcOff) gl.uniform4f(this.pBg.u.uBg, 0, 0, 0, 0);
    else gl.uniform4f(this.pBg.u.uBg, this.bg[0], this.bg[1], this.bg[2], this.vignette);
    gl.bindVertexArray(null);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.depthMask(true); gl.clearDepth(1); gl.clear(gl.DEPTH_BUFFER_BIT);
    if (this.pcOff) { this._endWire(t0); return; }
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    // occluder: land envelope with the seabed
    gl.colorMask(false, false, false, false);
    this.terrain.drawDepth(0);
    gl.colorMask(true, true, true, true);
    // dots: max blend, depth-tested, no depth writes
    gl.depthMask(false);
    gl.enable(gl.BLEND); gl.blendEquation(gl.MAX); gl.blendFunc(gl.ONE, gl.ONE);
    this.terrain.drawSeabed();
    // occluder: the sea surface
    gl.depthMask(true); gl.colorMask(false, false, false, false); gl.disable(gl.BLEND);
    if (this.seaOcclude !== false) this.terrain.drawDepth(1);     // false: the Inspect x-ray sees below the waterline
    gl.colorMask(true, true, true, true); gl.depthMask(false);
    gl.enable(gl.BLEND); gl.blendEquation(gl.MAX);
    this.terrain.drawSky(this.skyBright);
    this._subjects();
    this.terrain.drawSurface();
    // models
    let pts = 0, draws = 0;
    const cam = this.camera;
    for (const d of this.queue) {
      const n = this.models.draw(d, cam, this.frameInfo);
      pts += n; if (n) draws++;
      if (d.speck) {
        // too small to resolve: one return, tinted
        const c = d._rgb && d._k > 0 ? [d._rgb[0] * 255, d._rgb[1] * 255, d._rgb[2] * 255] : WH;
        this.fx.dot(d.T, 1, c, (d.alpha === undefined ? 1 : d.alpha) * .9);
      }
    }
    this.fx.drawMax();
    // additive: glows, flashes
    gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE);
    this.fx.drawAdd();
    // alpha over (lime that must read over bright dots)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this.fx.drawOver();
    gl.disable(gl.DEPTH_TEST);
    gl.blendFunc(gl.ONE, gl.ONE);
    this.fx.drawLift();
    gl.disable(gl.BLEND); gl.depthMask(true);
    gl.bindVertexArray(null);
    this.stats.draws = draws; this.stats.points = pts;
    this._endWire(t0);
  }
  /* the hairlines queued this frame (unless their owner flushes them itself: wire.auto = false) */
  _endWire(t0) {
    if (this.pcOff) { this.stats.draws = 0; this.stats.points = 0; }
    if (this.wire && this.wire.auto && !this.wire.flushed) this.wire.flush();
    this.gl.bindVertexArray(null);
    this.stats.ms = performance.now() - t0;
  }
}

function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
export { LIME, CORAL, WH, attitude };
