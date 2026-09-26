/* The bench's plate model on the GPU (game/concepts/blast/gpu.js), batched: several patches (hits) share one set of
   textures and every step is the same three passes for all of them (the per-step overhead dominates, so a second
   hit costs little more than the first). WebGL2 fragment passes on RGBA32F.

   Layout: node i of a patch -> texel ((n0 + i) % NW, (n0 + i) / NW) with n0 the patch's first row x NW; bond slot k
   of a node -> texel (x * K + k, y). Every bond is stored at both its ends and both ends compute it identically, so
   plastic flow and fracture stay consistent without scatter. Per step:
     1. slot pass  - bond strain, fracture (strain, torn-out node, running crack), elastic-plastic force + damping
     2. node pass  - gather the bond forces, ties, plastic bending, gas and shock loads (exact impulse per step, line of
                     sight through the torn cells with diffraction), tear-out, symplectic Euler, contact
     3. cell pass  - a cell is torn once any of its six bonds is (every 4th step)
   Per patch: its time, step, mass scaling and damping (uniform uPT[pid]), gas pressures (uGP), and a parameter row
   (texture uPar): plates, charge centre, crack starts and lines. A patch with h = 0 is frozen. */

const VS = `#version 300 es
void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
const HEAD = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
`;
export const MAXPATCH = 8;
const PARW = 64;

const SLOT_FS = HEAD + `
uniform sampler2D uPos, uVel, uSS, uSlot, uSlot2, uSlot3, uBend, uPar;
uniform int uK, uNW; uniform vec4 uPT[${MAXPATCH}], uP0[${MAXPATCH}], uCr[${MAXPATCH * 6}];
layout(location=0) out vec4 oSS; layout(location=1) out vec4 oF;
void main(){
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 si = texelFetch(uSlot, p, 0), ss = texelFetch(uSS, p, 0);
  oF = vec4(0.0); oSS = ss;
  if (si.x < 0.0 || ss.y > 0.5 || ss.z < 0.5) return;
  int nx = p.x / uK, j = int(si.x);
  ivec2 pi = ivec2(nx, p.y), pj = ivec2(j % uNW, j / uNW);
  int pid = int(texelFetch(uBend, pi, 0).y);
  vec4 PT = uPT[pid];
  if (PT.y <= 0.0) return;
  vec4 xi = texelFetch(uPos, pi, 0), xj = texelFetch(uPos, pj, 0);
  if (xi.w > 0.5 || xj.w > 0.5) { oSS.y = 1.0; return; }
  vec3 d = xj.xyz - xi.xyz; float L = length(d), L0 = si.y;
  vec4 s2 = texelFetch(uSlot2, p, 0);
  if (L - L0 > s2.x * L0) { oSS.y = 1.0; return; }
  int pl = int(s2.z);
  if (pl >= 0 && L > L0 * 1.004) {
    vec4 cr = uCr[pid * 6 + pl];
    if (cr.w > 0.0) {
      vec4 p0 = uP0[pid];
      vec2 dm = texelFetch(uSlot3, p, 0).xy - cr.xy; float r = length(dm), th = atan(dm.y, dm.x);
      float lim0 = cr.w + (PT.x - cr.z) * p0.z;
      for (int l = 0; l < 8; l++) {
        vec4 cl = texelFetch(uPar, ivec2(26 + pl * 4 + l / 2, pid), 0);
        vec2 ln = (l & 1) == 0 ? cl.xy : cl.zw;
        if (ln.y <= 0.0) break;
        float da = th - ln.x; da -= 6.2831853 * floor(da / 6.2831853 + 0.5);
        if (abs(da) * r < p0.y * 0.6 && r <= min(cr.w * ln.y, lim0)) { oSS.y = 1.0; return; }
      }
    }
  }
  float k = si.z, fy = si.w, f = k * (L - ss.x);
  if (f > fy) { oSS.x = L - fy / k; f = fy; } else if (f < -0.12 * fy) { oSS.x = L + 0.12 * fy / k; f = -0.12 * fy; }
  vec3 vi = texelFetch(uVel, pi, 0).xyz, vj = texelFetch(uVel, pj, 0).xyz;
  f += s2.y * dot(vj - vi, d) / L;
  oF = vec4(d * (f / L), 0.0);
}`;

const NODE_FS = HEAD + `
uniform sampler2D uPos, uVel, uAnc, uUB, uSF, uSS, uInfo, uInfo2, uR0, uLoad, uTie, uUmb, uBend, uCell, uPMap, uPar;
uniform int uK, uNW, uCW; uniform vec4 uPT[${MAXPATCH}], uGP[${MAXPATCH * 2}], uP0[${MAXPATCH}], uPC[${MAXPATCH}];
uniform vec4 uPl[${MAXPATCH * 6}], uPl2[${MAXPATCH * 6}], uPr[${MAXPATCH * 6}];
layout(location=0) out vec4 oPos; layout(location=1) out vec4 oVel; layout(location=2) out vec4 oAnc; layout(location=3) out vec4 oUB;
int PID; float S;
ivec2 NT(int j) { return ivec2(j % uNW, j / uNW); }
vec4 par(int x) { return x == 0 ? uP0[PID] : x == 1 ? uPC[PID] : x < 8 ? uPl[PID * 6 + x - 2] : x < 14 ? uPl2[PID * 6 + x - 8] : uPr[PID * 6 + x - 14]; }
float gp(int c) { return uGP[PID * 2 + c / 4][c % 4]; }
// 1 = intact cell, 0 = torn cell, -1 = outside the plate
float cellAt(int q, float u, float v) {
  vec4 pl2 = uPl2[PID * 6 + q]; int ci = int(floor((u - pl2.x) / S)), cj = int(floor((v - pl2.y) / S)), nu = int(pl2.z), nv = int(pl2.w);
  if (ci < 0 || cj < 0 || ci >= nu || cj >= nv) return -1.0;
  int c = int(uPr[PID * 6 + q].y) + cj * nu + ci; return texelFetch(uCell, ivec2(c % uCW, c / uCW), 0).x < 0.5 ? 1.0 : 0.0;
}
// how much of the shock reaches this node: 0 behind intact plating; through each hole it passes the wave diffracts
float seen(vec3 x, int own, int nPl, vec3 C, float diff) {
  vec3 d = x - C; float R = length(d); if (R < 1e-6) return 1.0; vec3 D = d / R; float len = R - 0.03, f = 1.0;
  for (int q = 0; q < 6; q++) {
    if (q >= nPl) break;
    if (q == own) continue;
    vec4 pl = uPl[PID * 6 + q]; int ax = int(pl.x), ua = int(pl.y), va = int(pl.z);
    float dd = D[ax]; if (abs(dd) < 1e-9) continue;
    float t = -(C[ax] - pl.w) / dd; if (t <= 1e-4 || t >= len) continue;
    float c = cellAt(q, C[ua] + D[ua] * t, C[va] + D[va] * t);
    if (c > 0.5) return 0.0;
    if (c > -0.5) f *= diff;
  }
  return f;
}
vec3 axisVec(float code) { float a = abs(code); vec3 n = a < 1.5 ? vec3(1,0,0) : a < 2.5 ? vec3(0,1,0) : vec3(0,0,1); return code < 0.0 ? -n : n; }
void main(){
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 pos = texelFetch(uPos, p, 0), vel = texelFetch(uVel, p, 0), anc = texelFetch(uAnc, p, 0), ub = texelFetch(uUB, p, 0);
  oPos = pos; oVel = vel; oAnc = anc; oUB = ub;
  vec4 info = texelFetch(uInfo, p, 0); float w = info.x;
  if (w <= 0.0) return;
  vec4 bd = texelFetch(uBend, p, 0);
  PID = int(bd.y);
  vec4 PT = uPT[PID];
  float uT = PT.x, uH = PT.y, uMsc = PT.z, uDamp = PT.w;
  if (uH <= 0.0) return;
  vec4 p0 = uP0[PID], p1 = uPC[PID];
  S = p0.y; int nPl = int(p0.x);
  vec3 x = pos.xyz, v = vel.xyz, F = vec3(0.0);
  int alive = 0;
  for (int k = 0; k < 24; k++) {
    if (k >= uK) break;
    ivec2 ps = ivec2(p.x * uK + k, p.y); vec4 ss = texelFetch(uSS, ps, 0);
    if (ss.z > 0.5 && ss.y < 0.5) { alive++; F += texelFetch(uSF, ps, 0).xyz; }
  }
  float fr = anc.w; if (alive == 0) fr = 1.0;
  vec4 tie = texelFetch(uTie, p, 0);
  if (tie.x > 0.0 && fr < 0.5) {
    vec3 d = x - anc.xyz; float dl = length(d);
    if (dl > 1e-9) { float f = tie.x * dl; if (f > tie.y) { anc.xyz = x - d * (tie.y / tie.x / dl); f = tie.y; } F -= d * (f / dl); }
  }
  if (tie.z > 0.0 && fr < 0.5) {
    vec4 um = texelFetch(uUmb, p, 0); vec3 m = vec3(0.0), mv = vec3(0.0); int n = 0; bool ok = true;
    for (int q = 0; q < 4; q++) {
      float e = um[q]; if (e < 0.0) continue;
      int j = int(e) / 32, kk = int(e) - j * 32;
      if (texelFetch(uSS, ivec2(p.x * uK + kk, p.y), 0).y > 0.5) { ok = false; break; }
      m += texelFetch(uPos, NT(j), 0).xyz; mv += texelFetch(uVel, NT(j), 0).xyz; n++;
    }
    if (ok && n >= 2) {
      vec3 e = m / float(n) - x - ub.xyz; float el = length(e), f = tie.z * el;
      if (f > tie.w) { ub.xyz += e * ((f - tie.w) / tie.z / el); f = tie.w; }
      if (el > 1e-12) F += e * (f / el);
      F += bd.x * (mv / float(n) - v);
    }
  }
  vec4 i2 = texelFetch(uInfo2, p, 0); vec4 r0 = texelFetch(uR0, p, 0); vec3 nrm = axisVec(r0.w);
  if (fr < 0.5) F += nrm * ((gp(int(i2.y)) - gp(int(i2.x))) * info.y);
  vec4 ld = texelFetch(uLoad, p, 0);
  if (ld.w > 0.5) {
    float a = uT - ld.y, b = a + uH, TD = ld.z;
    float sf = (b > 0.0 && a < TD) ? seen(pos.xyz, int(info.z), nPl, p1.xyz, p0.w) : 0.0;
    if (sf > 0.0) {
      a = max(a, 0.0); b = min(b, TD);
      float I = sf * ld.x * ((b - b * b / (2.0 * TD)) - (a - a * a / (2.0 * TD)));
      F += nrm * info.w * (I / uH * info.y); vel.w += I;
      if (pos.w < 0.5 && vel.w / i2.z > i2.w) pos.w = 1.0;
    }
  }
  float im = uH * w / uMsc;
  v = (v + F * im) * uDamp; if (fr > 0.5) v.y -= 9.81 * uH;
  x += v * uH;
  int own = int(info.z);
  for (int q = 0; q < 6; q++) {
    if (q >= nPl) break;
    if (q == own) continue;
    vec4 pl = uPl[PID * 6 + q], pl2 = uPl2[PID * 6 + q], pr = uPr[PID * 6 + q]; int ax = int(pl.x), ua = int(pl.y), va = int(pl.z);
    float rest = r0[ax] - pl.w; if (abs(rest) < 1e-3) continue;
    float cur = x[ax] - pl.w; if (cur * rest > 0.0 && abs(cur) > 1.5) continue;
    int ci = int(floor((x[ua] - pl2.x) / S)), cj = int(floor((x[va] - pl2.y) / S)), nu = int(pl2.z), nv = int(pl2.w);
    if (ci < 0 || cj < 0 || ci >= nu || cj >= nv) continue;
    int c = int(pr.y) + cj * nu + ci;
    if (texelFetch(uCell, ivec2(c % uCW, c / uCW), 0).x > 0.5) continue;
    int row = int(pr.x);
    int a0 = int(texelFetch(uPMap, ivec2(ci, row + cj), 0).x), a1 = int(texelFetch(uPMap, ivec2(ci + 1, row + cj), 0).x);
    int a2 = int(texelFetch(uPMap, ivec2(ci + 1, row + cj + 1), 0).x), a3 = int(texelFetch(uPMap, ivec2(ci, row + cj + 1), 0).x);
    float plane = (texelFetch(uPos, NT(a0), 0)[ax] + texelFetch(uPos, NT(a1), 0)[ax] + texelFetch(uPos, NT(a2), 0)[ax] + texelFetch(uPos, NT(a3), 0)[ax]) * 0.25;
    float sd = rest > 0.0 ? 1.0 : -1.0;
    if ((x[ax] - plane) * sd > 0.015) continue;
    x[ax] = plane + 0.015 * sd;
    float vc = (texelFetch(uVel, NT(a0), 0)[ax] + texelFetch(uVel, NT(a1), 0)[ax] + texelFetch(uVel, NT(a2), 0)[ax] + texelFetch(uVel, NT(a3), 0)[ax]) * 0.25;
    if ((v[ax] - vc) * sd < 0.0) v[ax] = vc;
  }
  oPos = vec4(x, pos.w); oVel = vec4(v, vel.w); oAnc = vec4(anc.xyz, fr); oUB = ub;
}`;

const CELL_FS = HEAD + `
uniform sampler2D uSS, uCS0, uCS1, uCS2, uCell;
out vec4 o;
bool br(vec2 a) { return texelFetch(uSS, ivec2(a), 0).y > 0.5; }
void main(){
  ivec2 p = ivec2(gl_FragCoord.xy); float t = texelFetch(uCell, p, 0).x;
  if (t < 0.5) {
    vec4 a = texelFetch(uCS0, p, 0), b = texelFetch(uCS1, p, 0), c = texelFetch(uCS2, p, 0);
    if (a.x >= 0.0 && (br(a.xy) || br(a.zw) || br(b.xy) || br(b.zw) || br(c.xy) || br(c.zw))) t = 1.0;
  }
  o = vec4(t, 0.0, 0.0, 0.0);
}`;

/* A range allocator over rows */
function rows(n) {
  const free = [[0, n]];
  return {
    alloc(k) { for (let i = 0; i < free.length; i++) { const f = free[i]; if (f[1] >= k) { const r = f[0]; f[0] += k; f[1] -= k; if (!f[1]) free.splice(i, 1); return r; } } return -1; },
    release(r, k) { free.push([r, k]); free.sort((a, b) => a[0] - b[0]); for (let i = free.length - 2; i >= 0; i--) if (free[i][0] + free[i][1] === free[i + 1][0]) { free[i][1] += free[i + 1][1]; free.splice(i + 1, 1); } },
    get largest() { return free.reduce((m, f) => Math.max(m, f[1]), 0); },
  };
}

/* createPool(gl, { rows: node rows (x 128 nodes), K: bond slots per node }) */
export function createPool(gl, o = {}) {
  if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('EXT_color_buffer_float missing');
  const NW = 128, NH = o.rows || 640, K = o.K || 16, SW = NW * K, CW = 128, CH = o.cellRows || NH, PMW = 256, PMH = o.pmRows || 2048;
  const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
  const prog = fs => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); p.u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); p.u[a.name.replace('[0]', '')] = gl.getUniformLocation(p, a.name); } return p; };
  const pSlot = prog(SLOT_FS), pNode = prog(NODE_FS), pCell = prog(CELL_FS);
  const vao = gl.createVertexArray();
  const tex = (w, h, fmt) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (fmt === 'rg') gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RG32F, w, h); else gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, w, h);
    t.w = w; t.h = h; t.fmt = fmt; return t; };
  const fbo = texs => { const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    texs.forEach((t, i) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0));
    gl.drawBuffers(texs.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('fbo incomplete');
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); f.texs = texs; return f; };
  const T = {
    info: tex(NW, NH), info2: tex(NW, NH), r0: tex(NW, NH), load: tex(NW, NH), tie: tex(NW, NH), bend: tex(NW, NH), umb: tex(NW, NH),
    slot: tex(SW, NH), slot2: tex(SW, NH), slot3: tex(SW, NH, 'rg'), cs: [tex(CW, CH), tex(CW, CH), tex(CW, CH)], pmap: tex(PMW, PMH), par: tex(PARW, MAXPATCH),
  };
  const mk = () => ({ pos: tex(NW, NH), vel: tex(NW, NH), anc: tex(NW, NH), ub: tex(NW, NH) });
  const nodeS = [mk(), mk()], slotS = [tex(SW, NH), tex(SW, NH)], force = tex(SW, NH), cellS = [tex(CW, CH), tex(CW, CH)];
  const fNode = nodeS.map(s => fbo([s.pos, s.vel, s.anc, s.ub])), fSlot = slotS.map(s => fbo([s, force])), fCell = cellS.map(s => fbo([s]));
  // clear everything once: empty slots (-1), inactive nodes (info.x = 0)
  const clearTex = (t, v) => { const f = fbo([t]); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.viewport(0, 0, t.w, t.h); gl.clearBufferfv(gl.COLOR, 0, v); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(f); };
  for (const k of ['info', 'info2', 'r0', 'load', 'tie', 'bend', 'umb', 'slot2', 'slot3', 'pmap', 'par']) clearTex(T[k], [0, 0, 0, 0]);
  clearTex(T.slot, [-1, 0, 0, 0]); for (const t of T.cs) clearTex(t, [-1, -1, -1, -1]);
  for (const s of nodeS) for (const k in s) clearTex(s[k], [0, 0, 0, 0]);
  for (const t of [...slotS, force, ...cellS]) clearTex(t, [0, 0, 0, 0]);
  let cur = 0, cc = 0, nstep = 0;
  const rN = rows(NH), rC = rows(CH), rM = rows(PMH), pids = new Array(MAXPATCH).fill(null);
  const PT = new Float32Array(MAXPATCH * 4), GPU = new Float32Array(MAXPATCH * 8);
  const U = { P0: new Float32Array(MAXPATCH * 4), PC: new Float32Array(MAXPATCH * 4), Pl: new Float32Array(MAXPATCH * 24), Pl2: new Float32Array(MAXPATCH * 24), Pr: new Float32Array(MAXPATCH * 24), Cr: new Float32Array(MAXPATCH * 24) };
  let uDirty = true;
  let gpDirty = true;
  const put = (t, x, y, w, h, data) => { gl.bindTexture(gl.TEXTURE_2D, t); gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, w, h, t.fmt === 'rg' ? gl.RG : gl.RGBA, gl.FLOAT, data); };
  const statics = () => {
    gl.useProgram(pSlot); gl.uniform1i(pSlot.u.uK, K); gl.uniform1i(pSlot.u.uNW, NW);
    gl.useProgram(pNode); gl.uniform1i(pNode.u.uK, K); gl.uniform1i(pNode.u.uNW, NW); gl.uniform1i(pNode.u.uCW, CW);
  };
  statics();

  /* a patch into the pool (P from buildPatch, loaded) -> handle, or null when there is no room */
  function add(P) {
    if (P.K > K) throw new Error('too many bonds per node: ' + P.K);
    const pid = pids.indexOf(null); if (pid < 0) return null;
    const nr = Math.ceil(P.N / NW), cr = Math.ceil(P.NC / CW);
    let mr = 0; for (const L of P.PL) mr += L.nv + 1;
    if (P.PL.some(L => L.nu + 1 > PMW)) throw new Error('plate too long');
    const r0 = rN.alloc(nr); if (r0 < 0) return null;
    const c0 = rC.alloc(cr); if (c0 < 0) { rN.release(r0, nr); return null; }
    const m0 = rM.alloc(mr); if (m0 < 0) { rN.release(r0, nr); rC.release(c0, cr); return null; }
    const H = { pid, P, r0, nr, c0, cr, m0, mr, n0: r0 * NW, cb0: c0 * CW };
    if (pids.every(x => !x)) nstep = 0;          // alone in the pool: its cell passes in the bench's phase (reproducible)
    pids[pid] = H;
    upload(H);
    return H;
  }
  function release(H) {
    if (!H || pids[H.pid] !== H) return;
    snapFree(H);
    // the rows go back empty: slots -1, nodes inactive
    const z = new Float32Array(NW * H.nr * 4);
    for (const k of ['info', 'bend']) put(T[k], 0, H.r0, NW, H.nr, z);
    const zs = new Float32Array(SW * H.nr * 4); for (let i = 0; i < zs.length; i += 4) zs[i] = -1;
    put(T.slot, 0, H.r0, SW, H.nr, zs);
    const zc = new Float32Array(CW * H.cr * 4).fill(-1); for (const t of T.cs) put(t, 0, H.c0, CW, H.cr, zc);
    const zz = new Float32Array(CW * H.cr * 4); for (const t of cellS) put(t, 0, H.c0, CW, H.cr, zz);
    rN.release(H.r0, H.nr); rC.release(H.c0, H.cr); rM.release(H.m0, H.mr);
    pids[H.pid] = null;
    PT[H.pid * 4 + 1] = 0;
  }
  const packN = (H, f) => { const a = new Float32Array(NW * H.nr * 4); for (let i = 0; i < H.P.N; i++) f(i, a, 4 * i); return a; };
  function upload(H) {
    const P = H.P, N = P.N, s = P.sim, n0 = H.n0, g = i => n0 + i;
    // bond slots: bond q sits in slot kA at node a and kB at node b
    const slotOf = H.slotOf = new Int32Array(2 * P.NS), fillK = new Int32Array(N);
    const w = SW * H.nr * 4, slot = new Float32Array(w).fill(-1), slot2 = new Float32Array(w), slot3 = new Float32Array(SW * H.nr * 2);
    for (let i = 0; i < slot.length; i += 4) { slot[i + 1] = slot[i + 2] = slot[i + 3] = 0; }
    const ss = new Float32Array(w);
    const crackPlate = q => { const a = P.SA[q], b = P.SB[q], p = P.SURF[a]; if (P.SURF[b] !== p) return -1; const L = P.PL[p];
      return Math.abs(P.R0[3 * a + L.ax] - L.val) < 1e-3 && Math.abs(P.R0[3 * b + L.ax] - L.val) < 1e-3 ? p : -1; };
    for (let q = 0; q < P.NS; q++) for (let e = 0; e < 2; e++) {
      const i = e ? P.SB[q] : P.SA[q], j = e ? P.SA[q] : P.SB[q];
      const k = fillK[i]++, x = (i % NW) * K + k, y = Math.floor(i / NW);
      slotOf[2 * q + e] = (y << 16) | x;
      const o = (y * SW + x) * 4;
      slot[o] = g(j); slot[o + 1] = P.SL0[q]; slot[o + 2] = P.SK[q]; slot[o + 3] = P.SFY[q];
      slot2[o] = P.SEF[q]; slot2[o + 1] = P.SC[q]; slot2[o + 2] = crackPlate(q);
      const a = P.SA[q], b = P.SB[q], L = P.PL[P.SURF[a]];
      slot3[(y * SW + x) * 2] = (P.R0[3 * a + L.ua] + P.R0[3 * b + L.ua]) / 2; slot3[(y * SW + x) * 2 + 1] = (P.R0[3 * a + L.va] + P.R0[3 * b + L.va]) / 2;
      ss[o] = P.SLP[q]; ss[o + 1] = P.SBRK[q]; ss[o + 2] = 1;
    }
    put(T.slot, 0, H.r0, SW, H.nr, slot); put(T.slot2, 0, H.r0, SW, H.nr, slot2); put(T.slot3, 0, H.r0, SW, H.nr, slot3);
    for (const t of slotS) put(t, 0, H.r0, SW, H.nr, ss);
    const sx = e => e & 0xffff, sy = e => e >>> 16;
    const dirSign = i => s.DIR[3 * i] * P.NRM[3 * i] + s.DIR[3 * i + 1] * P.NRM[3 * i + 1] + s.DIR[3 * i + 2] * P.NRM[3 * i + 2] < 0 ? -1 : 1;
    put(T.info, 0, H.r0, NW, H.nr, packN(H, (i, a, o) => { a[o] = P.WINV[i]; a[o + 1] = P.AREA[i]; a[o + 2] = P.SURF[i]; a[o + 3] = dirSign(i); }));
    put(T.info2, 0, H.r0, NW, H.nr, packN(H, (i, a, o) => { a[o] = P.NSP[i]; a[o + 1] = P.NSN[i]; a[o + 2] = P.RH[i]; a[o + 3] = P.VC[i]; }));
    put(T.r0, 0, H.r0, NW, H.nr, packN(H, (i, a, o) => { a[o] = P.R0[3 * i]; a[o + 1] = P.R0[3 * i + 1]; a[o + 2] = P.R0[3 * i + 2];
      const nx = P.NRM[3 * i], ny = P.NRM[3 * i + 1], nz = P.NRM[3 * i + 2]; a[o + 3] = nx ? 1 * Math.sign(nx) : ny ? 2 * Math.sign(ny) : 3 * Math.sign(nz); }));
    put(T.load, 0, H.r0, NW, H.nr, packN(H, (i, a, o) => { a[o] = s.PR[i]; a[o + 1] = s.TA[i]; a[o + 2] = s.TD[i]; a[o + 3] = s.PR[i] > 0 ? 1 : 0; }));
    put(T.tie, 0, H.r0, NW, H.nr, packN(H, (i, a, o) => { a[o] = P.TK[i]; a[o + 1] = P.TFY[i]; a[o + 2] = P.KB[i]; a[o + 3] = P.KBY[i]; }));
    put(T.bend, 0, H.r0, NW, H.nr, packN(H, (i, a, o) => { a[o] = P.KBC[i]; a[o + 1] = H.pid; }));
    put(T.umb, 0, H.r0, NW, H.nr, packN(H, (i, a, o) => { a[o] = a[o + 1] = a[o + 2] = a[o + 3] = -1; let n = 0;
      for (let k = P.UNB[i]; k < P.UNB[i + 1] && n < 4; k++) { const q = P.UN[k], j = P.SA[q] === i ? P.SB[q] : P.SA[q], e = P.SA[q] === i ? 0 : 1;
        a[o + n++] = g(j) * 32 + (sx(slotOf[2 * q + e]) - (i % NW) * K); } }));
    // dynamic state (both ping-pong copies)
    for (const st of nodeS) {
    put(st.pos, 0, H.r0, NW, H.nr, packN(H, (i, a, o) => { a[o] = P.X[3 * i]; a[o + 1] = P.X[3 * i + 1]; a[o + 2] = P.X[3 * i + 2]; a[o + 3] = P.DISC[i]; }));
    put(st.vel, 0, H.r0, NW, H.nr, packN(H, (i, a, o) => { a[o] = P.V[3 * i]; a[o + 1] = P.V[3 * i + 1]; a[o + 2] = P.V[3 * i + 2]; a[o + 3] = P.IMP[i]; }));
    put(st.anc, 0, H.r0, NW, H.nr, packN(H, (i, a, o) => { a[o] = P.TAN[3 * i]; a[o + 1] = P.TAN[3 * i + 1]; a[o + 2] = P.TAN[3 * i + 2]; a[o + 3] = P.FREE[i]; }));
    put(st.ub, 0, H.r0, NW, H.nr, packN(H, (i, a, o) => { a[o] = P.UB[3 * i]; a[o + 1] = P.UB[3 * i + 1]; a[o + 2] = P.UB[3 * i + 2]; }));
    }
    // cells: the slot addresses of their six bonds; torn state
    const cs = [0, 1, 2].map(() => new Float32Array(CW * H.cr * 4).fill(-1));
    for (let c = 0; c < P.NC; c++) for (let m = 0; m < 6; m++) { const e = slotOf[2 * P.CBOND[6 * c + m]]; cs[m >> 1][4 * c + (m & 1) * 2] = sx(e); cs[m >> 1][4 * c + (m & 1) * 2 + 1] = sy(e) + H.r0; }
    cs.forEach((d, k) => put(T.cs[k], 0, H.c0, CW, H.cr, d));
    const ct = new Float32Array(CW * H.cr * 4); for (let c = 0; c < P.NC; c++) ct[4 * c] = P.CTORN[c];
    for (const t of cellS) put(t, 0, H.c0, CW, H.cr, ct);
    // plate node maps
    const pm = new Float32Array(PMW * H.mr * 4); let row = 0; H.plRow = [];
    P.PL.forEach(L => { H.plRow.push(H.m0 + row); for (let j = 0; j <= L.nv; j++) for (let i = 0; i <= L.nu; i++) pm[4 * ((row + j) * PMW + i)] = g(L.at[j * (L.nu + 1) + i]); row += L.nv + 1; });
    put(T.pmap, 0, H.m0, PMW, H.mr, pm);
    params(H);
    GPU.fill(0, H.pid * 8, H.pid * 8 + 8); gpDirty = true;
    PT[H.pid * 4] = s.t; PT[H.pid * 4 + 1] = 0; PT[H.pid * 4 + 2] = 1; PT[H.pid * 4 + 3] = 1;
  }
  /* the patch's parameter row: plates, charge centre, cracks */
  function params(H) {
    const P = H.P, s = P.sim, a = new Float32Array(PARW * 4);
    a.set([P.nP, P.S, P.V_CRACK || 600, P.diff !== undefined ? P.diff : .5], 0);
    a.set([s.C[0], s.C[1], s.C[2], 9.81], 4);
    P.PL.forEach((L, q) => {
      a.set([L.ax, L.ua, L.va, L.val], 4 * (2 + q));
      a.set([L.u0, L.v0, L.nu, L.nv], 4 * (8 + q));
      a.set([H.plRow[q], H.cb0 + L.off, 0, 0], 4 * (14 + q));
    });
    const i = H.pid;
    U.P0.set(a.subarray(0, 4), 4 * i); U.PC.set(a.subarray(4, 8), 4 * i);
    U.Pl.fill(0, 24 * i, 24 * i + 24); U.Pl2.fill(0, 24 * i, 24 * i + 24); U.Pr.fill(0, 24 * i, 24 * i + 24); U.Cr.fill(0, 24 * i, 24 * i + 24);
    for (let q = 0; q < P.PL.length; q++) { U.Pl.set(a.subarray(4 * (2 + q), 4 * (3 + q)), 24 * i + 4 * q); U.Pl2.set(a.subarray(4 * (8 + q), 4 * (9 + q)), 24 * i + 4 * q); U.Pr.set(a.subarray(4 * (14 + q), 4 * (15 + q)), 24 * i + 4 * q); }
    for (const c of s.cracks) {
      if (!c) continue;
      a.set([c.u, c.v, c.t0, c.rb], 4 * (20 + c.p)); U.Cr.set([c.u, c.v, c.t0, c.rb], 24 * i + 4 * c.p);
      c.lines.slice(0, 8).forEach((l, k) => { a[4 * (26 + c.p * 4 + (k >> 1)) + (k & 1) * 2] = l.th; a[4 * (26 + c.p * 4 + (k >> 1)) + (k & 1) * 2 + 1] = l.lf; });
    }
    put(T.par, 0, H.pid, PARW, 1, a);
    uDirty = true;
  }
  const bind = (p, name, t, unit) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(p.u[name], unit); };
  /* one step of every patch: list of handles; each handle's P.sim gives t; per handle h, msc, damp set by setStep */
  function setStep(H, t, h, msc, damp) { const o = H.pid * 4; PT[o] = t; PT[o + 1] = h; PT[o + 2] = msc; PT[o + 3] = damp; }
  function freeze(H) { PT[H.pid * 4 + 1] = 0; }
  function setGas(H) { const G = H.P.GP; for (let c = 0; c < 8; c++) { const v = c < G.length - 1 ? G[c] : 0; if (GPU[H.pid * 8 + c] !== v) { GPU[H.pid * 8 + c] = v; gpDirty = true; } } }
  let rowLo = 0, rowHi = 0, cLo = 0, cHi = 0;
  function span(list) {
    rowLo = 1e9; rowHi = 0; cLo = 1e9; cHi = 0;
    for (const H of list) { rowLo = Math.min(rowLo, H.r0); rowHi = Math.max(rowHi, H.r0 + H.nr); cLo = Math.min(cLo, H.c0); cHi = Math.max(cHi, H.c0 + H.cr); }
  }
  function step(list) {
    if (!list.length) return;
    span(list);
    gl.bindVertexArray(vao); gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.enable(gl.SCISSOR_TEST);
    const nx = 1 - cur, s = nodeS[cur];
    // the rows of other (frozen / free) patches in the span keep their state: the passes copy them through
    // 1. bonds
    gl.useProgram(pSlot); gl.bindFramebuffer(gl.FRAMEBUFFER, fSlot[nx]); gl.viewport(0, 0, SW, NH); gl.scissor(0, rowLo, SW, rowHi - rowLo);
    bind(pSlot, 'uPos', s.pos, 0); bind(pSlot, 'uVel', s.vel, 1); bind(pSlot, 'uSS', slotS[cur], 2);
    bind(pSlot, 'uSlot', T.slot, 3); bind(pSlot, 'uSlot2', T.slot2, 4); bind(pSlot, 'uSlot3', T.slot3, 5); bind(pSlot, 'uBend', T.bend, 6); bind(pSlot, 'uPar', T.par, 7);
    gl.uniform4fv(pSlot.u.uPT, PT);
    if (uDirty) { gl.uniform4fv(pSlot.u.uP0, U.P0); gl.uniform4fv(pSlot.u.uCr, U.Cr); }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // 2. nodes
    gl.useProgram(pNode); gl.bindFramebuffer(gl.FRAMEBUFFER, fNode[nx]); gl.viewport(0, 0, NW, NH); gl.scissor(0, rowLo, NW, rowHi - rowLo);
    bind(pNode, 'uPos', s.pos, 0); bind(pNode, 'uVel', s.vel, 1); bind(pNode, 'uAnc', s.anc, 2); bind(pNode, 'uUB', s.ub, 3);
    bind(pNode, 'uSF', force, 4); bind(pNode, 'uSS', slotS[nx], 5); bind(pNode, 'uInfo', T.info, 6); bind(pNode, 'uInfo2', T.info2, 7);
    bind(pNode, 'uR0', T.r0, 8); bind(pNode, 'uLoad', T.load, 9); bind(pNode, 'uTie', T.tie, 10); bind(pNode, 'uUmb', T.umb, 11);
    bind(pNode, 'uBend', T.bend, 12); bind(pNode, 'uCell', cellS[cc], 13); bind(pNode, 'uPMap', T.pmap, 14); bind(pNode, 'uPar', T.par, 15);
    gl.uniform4fv(pNode.u.uPT, PT);
    if (gpDirty) { gl.uniform4fv(pNode.u.uGP, GPU); gpDirty = false; }
    if (uDirty) { gl.uniform4fv(pNode.u.uP0, U.P0); gl.uniform4fv(pNode.u.uPC, U.PC); gl.uniform4fv(pNode.u.uPl, U.Pl); gl.uniform4fv(pNode.u.uPl2, U.Pl2); gl.uniform4fv(pNode.u.uPr, U.Pr); uDirty = false; }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // 3. cells, every 4th step (feeds contact and line of sight)
    if ((++nstep & 3) === 0) cellPass(nx);
    gl.disable(gl.SCISSOR_TEST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    cur = nx;
  }
  function cellPass(nx = cur) {
    gl.useProgram(pCell); gl.bindFramebuffer(gl.FRAMEBUFFER, fCell[1 - cc]); gl.viewport(0, 0, CW, CH);
    gl.enable(gl.SCISSOR_TEST); gl.scissor(0, 0, CW, CH);
    bind(pCell, 'uSS', slotS[nx], 0);
    bind(pCell, 'uCS0', T.cs[0], 1); bind(pCell, 'uCS1', T.cs[1], 2); bind(pCell, 'uCS2', T.cs[2], 3); bind(pCell, 'uCell', cellS[cc], 4);
    gl.drawArrays(gl.TRIANGLES, 0, 3); cc = 1 - cc;
  }
  // read back
  const read = (f, i, x, y, w, h, out, fmt) => { gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.readBuffer(gl.COLOR_ATTACHMENT0 + i); gl.readPixels(x, y, w, h, fmt === 'rg' ? gl.RG : gl.RGBA, gl.FLOAT, out); gl.bindFramebuffer(gl.FRAMEBUFFER, null); return out; };
  let rbN = new Float32Array(0);
  const rb = n => { if (rbN.length < n) rbN = new Float32Array(n); return rbN; };
  /* positions, tear-outs, loose plate (and velocities) -> the patch's CPU arrays */
  function readNodes(H, withVel) {
    const P = H.P, f = fNode[cur], b = rb(NW * H.nr * 4);
    read(f, 0, 0, H.r0, NW, H.nr, b); for (let i = 0; i < P.N; i++) { P.X[3 * i] = b[4 * i]; P.X[3 * i + 1] = b[4 * i + 1]; P.X[3 * i + 2] = b[4 * i + 2]; P.DISC[i] = b[4 * i + 3] > .5 ? 1 : 0; }
    read(f, 2, 0, H.r0, NW, H.nr, b); for (let i = 0; i < P.N; i++) P.FREE[i] = b[4 * i + 3] > .5 ? 1 : 0;
    if (withVel) { read(f, 1, 0, H.r0, NW, H.nr, b); for (let i = 0; i < P.N; i++) { P.V[3 * i] = b[4 * i]; P.V[3 * i + 1] = b[4 * i + 1]; P.V[3 * i + 2] = b[4 * i + 2]; } }
  }
  /* the torn cells of one patch, now (blocking) -> Uint8Array(NC) */
  function readCells(H) {
    const P = H.P, b = rb(CW * H.cr * 4), out = new Uint8Array(P.NC);
    read(fCell[cc], 0, 0, H.c0, CW, H.cr, b); for (let c = 0; c < P.NC; c++) out[c] = b[4 * c] > .5 ? 1 : 0;
    return out;
  }
  /* the torn cells of every patch without stalling: the previous request's result if the GPU is done with it (else
     null), then a new request. -> Float32Array over the cell texture (rows 0 .. CH) */
  const pbo = gl.createBuffer(); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo); gl.bufferData(gl.PIXEL_PACK_BUFFER, CW * CH * 16, gl.STREAM_READ); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
  const rbC = new Float32Array(CW * CH * 4);
  let fence = null, fenceRows = 0;
  function readCellsAsync() {
    let out = null;
    if (fence) {
      const st = gl.clientWaitSync(fence, 0, 0);
      if (st === gl.TIMEOUT_EXPIRED) return null;
      gl.deleteSync(fence); fence = null;
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo); gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, rbC, 0, CW * fenceRows * 4); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null); out = rbC;
    }
    fenceRows = Math.max(1, cHi);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fCell[cc]); gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo); gl.readPixels(0, 0, CW, fenceRows, gl.RGBA, gl.FLOAT, 0); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); gl.flush();
    return out;
  }
  /* final: plastic rest lengths and broken bonds */
  function readBonds(H) {
    const P = H.P, b = new Float32Array(SW * H.nr * 4); read(fSlot[cur], 0, 0, H.r0, SW, H.nr, b);
    for (let q = 0; q < P.NS; q++) { const a = H.slotOf[2 * q], o = (((a >>> 16)) * SW + (a & 0xffff)) * 4; P.SLP[q] = b[o]; P.SBRK[q] = b[o + 1] > .5 ? 1 : 0; }
  }
  function refreshParams(H) { params(H); }
  /* a snapshot's readback without stalling: positions + tear-outs, loose plate, torn cells copied into pixel buffers
     now; snapTake(q) fills the patch's CPU arrays once the GPU is done with them (false until then) */
  function snapReq(H) {
    const q = H.snapQ || (H.snapQ = { pos: gl.createBuffer(), anc: gl.createBuffer(), cell: gl.createBuffer(), f: null, busy: false });
    if (q.busy) return null;
    const bn = NW * H.nr * 16, bc = CW * H.cr * 16, PB = gl.PIXEL_PACK_BUFFER;
    for (const [b, n] of [[q.pos, bn], [q.anc, bn], [q.cell, bc]]) { gl.bindBuffer(PB, b); if (b.size !== n) { gl.bufferData(PB, n, gl.STREAM_READ); b.size = n; } }
    gl.bindFramebuffer(gl.FRAMEBUFFER, fNode[cur]);
    gl.readBuffer(gl.COLOR_ATTACHMENT0); gl.bindBuffer(PB, q.pos); gl.readPixels(0, H.r0, NW, H.nr, gl.RGBA, gl.FLOAT, 0);
    gl.readBuffer(gl.COLOR_ATTACHMENT2); gl.bindBuffer(PB, q.anc); gl.readPixels(0, H.r0, NW, H.nr, gl.RGBA, gl.FLOAT, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fCell[cc]); gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.bindBuffer(PB, q.cell); gl.readPixels(0, H.c0, CW, H.cr, gl.RGBA, gl.FLOAT, 0);
    gl.bindBuffer(PB, null); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    q.f = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); gl.flush(); q.busy = true;
    return q;
  }
  function snapTake(H, q) {
    if (!q || !q.busy) return null;
    if (gl.clientWaitSync(q.f, 0, 0) === gl.TIMEOUT_EXPIRED) return null;
    gl.deleteSync(q.f); q.f = null; q.busy = false;
    const P = H.P, PB = gl.PIXEL_PACK_BUFFER, b = rb(NW * H.nr * 4);
    gl.bindBuffer(PB, q.pos); gl.getBufferSubData(PB, 0, b, 0, NW * H.nr * 4);
    for (let i = 0; i < P.N; i++) { P.X[3 * i] = b[4 * i]; P.X[3 * i + 1] = b[4 * i + 1]; P.X[3 * i + 2] = b[4 * i + 2]; P.DISC[i] = b[4 * i + 3] > .5 ? 1 : 0; }
    gl.bindBuffer(PB, q.anc); gl.getBufferSubData(PB, 0, b, 0, NW * H.nr * 4);
    for (let i = 0; i < P.N; i++) P.FREE[i] = b[4 * i + 3] > .5 ? 1 : 0;
    const c = new Float32Array(CW * H.cr * 4), out = new Uint8Array(P.NC);
    gl.bindBuffer(PB, q.cell); gl.getBufferSubData(PB, 0, c, 0, CW * H.cr * 4);
    for (let k = 0; k < P.NC; k++) out[k] = c[4 * k] > .5 ? 1 : 0;
    gl.bindBuffer(PB, null);
    return out;
  }
  function snapFree(H) { const q = H.snapQ; if (!q) return; if (q.f) gl.deleteSync(q.f); for (const b of [q.pos, q.anc, q.cell]) gl.deleteBuffer(b); H.snapQ = null; }
  /* a GPU fence the caller can poll (throttling: never more than a slice of work queued) */
  function fenceNow() { const f = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); gl.flush(); return f; }
  function fenceDone(f) { if (!f) return true; const st = gl.clientWaitSync(f, 0, 0); if (st === gl.TIMEOUT_EXPIRED) return false; gl.deleteSync(f); return true; }
  return { add, release, step, setStep, freeze, setGas, readNodes, readCells, readCellsAsync, readBonds, refreshParams, cellPass, fenceNow, fenceDone, snapReq, snapTake, snapFree,
    get room() { return rN.largest * NW; }, K, NW, NH, CW, CH, pids };
}
