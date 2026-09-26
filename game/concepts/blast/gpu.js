/* The same plate model as the explicit reference solver, run on the GPU (WebGL2 fragment passes, RGBA32F).

   Layout: node i -> texel (i % NW, i / NW); bond slot k of node i -> texel ((i % NW) * K + k, i / NW). Every bond is
   stored at both its ends and both ends compute it identically (same positions, same float ops), so plastic flow
   and fracture stay consistent without scatter. Per step:
     1. slot pass  - bond strain, fracture (strain, torn-out node, running crack), elastic-plastic force + damping
     2. node pass  - gather the bond forces, ties, plastic bending, gas and shock loads (exact impulse per step),
                     tear-out check, symplectic Euler, contact with the other plates' intact cells
     3. cell pass  - a cell is torn once any of its six bonds is
   The CPU syncs every few steps: reads the torn cells (gas vents, shock line of sight, cracks) and the tear-outs. */

const VS = `#version 300 es
void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

const HEAD = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
`;

const SLOT_FS = HEAD + `
uniform sampler2D uPos, uVel, uSS, uSlot, uSlot2, uSlot3;
uniform int uK, uNW; uniform float uT, uS, uVc;
uniform vec4 uCr[4]; uniform float uCrA[32], uCrL[32];
layout(location=0) out vec4 oSS; layout(location=1) out vec4 oF;
void main(){
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 si = texelFetch(uSlot, p, 0), ss = texelFetch(uSS, p, 0);
  oF = vec4(0.0); oSS = ss;
  if (si.x < 0.0 || ss.y > 0.5) return;
  int nx = p.x / uK, j = int(si.x);
  ivec2 pi = ivec2(nx, p.y), pj = ivec2(j % uNW, j / uNW);
  vec4 xi = texelFetch(uPos, pi, 0), xj = texelFetch(uPos, pj, 0);
  if (xi.w > 0.5 || xj.w > 0.5) { oSS.y = 1.0; return; }
  vec3 d = xj.xyz - xi.xyz; float L = length(d), L0 = si.y;
  vec4 s2 = texelFetch(uSlot2, p, 0);
  if (L - L0 > s2.x * L0) { oSS.y = 1.0; return; }
  int pl = int(s2.z);
  if (pl >= 0 && L > L0 * 1.004) {
    vec4 cr = uCr[pl];
    if (cr.w > 0.0) {
      vec2 dm = texelFetch(uSlot3, p, 0).xy - cr.xy; float r = length(dm), th = atan(dm.y, dm.x);
      float lim0 = cr.w + (uT - cr.z) * uVc;
      for (int l = 0; l < 8; l++) {
        float lf = uCrL[pl * 8 + l]; if (lf <= 0.0) break;
        float da = th - uCrA[pl * 8 + l]; da -= 6.2831853 * floor(da / 6.2831853 + 0.5);
        if (abs(da) * r < uS * 0.6 && r <= min(cr.w * lf, lim0)) { oSS.y = 1.0; return; }
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
uniform sampler2D uPos, uVel, uAnc, uUB, uSF, uSS, uInfo, uInfo2, uR0, uLoad, uTie, uUmb, uBend, uCell, uPMap;
uniform int uK, uNW, uCW; uniform float uT, uH, uMsc, uDamp, uG, uS;
uniform float uGP[5];
uniform vec4 uPl[4], uPl2[4]; uniform int uPlRow[4], uPlCell[4]; uniform vec3 uC;
layout(location=0) out vec4 oPos; layout(location=1) out vec4 oVel; layout(location=2) out vec4 oAnc; layout(location=3) out vec4 oUB;
ivec2 NT(int j) { return ivec2(j % uNW, j / uNW); }
bool intact(int q, float u, float v) {
  vec4 pl2 = uPl2[q]; int ci = int(floor((u - pl2.x) / uS)), cj = int(floor((v - pl2.y) / uS)), nu = int(pl2.z), nv = int(pl2.w);
  if (ci < 0 || cj < 0 || ci >= nu || cj >= nv) return false;
  int c = uPlCell[q] + cj * nu + ci; return texelFetch(uCell, ivec2(c % uCW, c / uCW), 0).x < 0.5;
}
// can the charge see this node? a ray stops at the first intact cell of any other plate (holes let it through)
bool seen(vec3 x, int own) {
  vec3 d = x - uC; float R = length(d); if (R < 1e-6) return true; vec3 D = d / R; float len = R - 0.03;
  for (int q = 0; q < 4; q++) {
    if (q == own) continue;
    vec4 pl = uPl[q]; int ax = int(pl.x), ua = int(pl.y), va = int(pl.z);
    float dd = D[ax]; if (abs(dd) < 1e-9) continue;
    float t = -(uC[ax] - pl.w) / dd; if (t <= 1e-4 || t >= len) continue;
    if (intact(q, uC[ua] + D[ua] * t, uC[va] + D[va] * t)) return false;
  }
  return true;
}
vec3 axisVec(float code) { float a = abs(code); vec3 n = a < 1.5 ? vec3(1,0,0) : a < 2.5 ? vec3(0,1,0) : vec3(0,0,1); return code < 0.0 ? -n : n; }
void main(){
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 pos = texelFetch(uPos, p, 0), vel = texelFetch(uVel, p, 0), anc = texelFetch(uAnc, p, 0), ub = texelFetch(uUB, p, 0);
  oPos = pos; oVel = vel; oAnc = anc; oUB = ub;
  vec4 info = texelFetch(uInfo, p, 0); float w = info.x;
  if (w <= 0.0) return;
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
  vec4 bd = texelFetch(uBend, p, 0);
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
  if (fr < 0.5) F += nrm * ((uGP[int(i2.y)] - uGP[int(i2.x)]) * info.y);
  vec4 ld = texelFetch(uLoad, p, 0);
  if (ld.w > 0.5) {
    float a = uT - ld.y, b = a + uH, TD = ld.z;
    if (b > 0.0 && a < TD && seen(pos.xyz, int(info.z))) {
      a = max(a, 0.0); b = min(b, TD);
      float I = ld.x * ((b - b * b / (2.0 * TD)) - (a - a * a / (2.0 * TD)));
      F += nrm * info.w * (I / uH * info.y); vel.w += I;
      if (pos.w < 0.5 && vel.w / i2.z > i2.w) pos.w = 1.0;
    }
  }
  float im = uH * w / uMsc;
  v = (v + F * im) * uDamp; if (fr > 0.5) v.y -= uG * uH;
  x += v * uH;
  int own = int(info.z);
  for (int q = 0; q < 4; q++) {
    if (q == own) continue;
    vec4 pl = uPl[q], pl2 = uPl2[q]; int ax = int(pl.x), ua = int(pl.y), va = int(pl.z);
    float rest = r0[ax] - pl.w; if (abs(rest) < 1e-3) continue;
    float cur = x[ax] - pl.w; if (cur * rest > 0.0 && abs(cur) > 1.5) continue;
    int ci = int(floor((x[ua] - pl2.x) / uS)), cj = int(floor((x[va] - pl2.y) / uS)), nu = int(pl2.z), nv = int(pl2.w);
    if (ci < 0 || cj < 0 || ci >= nu || cj >= nv) continue;
    int c = uPlCell[q] + cj * nu + ci;
    if (texelFetch(uCell, ivec2(c % uCW, c / uCW), 0).x > 0.5) continue;
    int row = uPlRow[q];
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

export function createGPU(gl, M) {
  if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('EXT_color_buffer_float missing');
  const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o) + '\n' + s.split('\n').map((l, i) => (i + 1) + ': ' + l).join('\n')); return o; };
  const prog = fs => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); p.u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); p.u[a.name.replace('[0]', '')] = gl.getUniformLocation(p, a.name); } return p; };
  const pSlot = prog(SLOT_FS), pNode = prog(NODE_FS), pCell = prog(CELL_FS);
  const vao = gl.createVertexArray();
  const tex = (w, h, data) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, data); t.w = w; t.h = h; return t; };
  const fbo = texs => { const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    texs.forEach((t, i) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0));
    gl.drawBuffers(texs.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('fbo incomplete');
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); f.texs = texs; return f; };

  const { N, NS, NC, SA, SB } = M;
  const NW = 128, NH = Math.ceil(N / NW);
  let K = 0; for (let i = 0; i < N; i++) K = Math.max(K, M.NADJ[i + 1] - M.NADJ[i]);
  if (K > 24) throw new Error('too many bonds per node: ' + K);
  const SW = NW * K, CW = 128, CH = Math.ceil(NC / CW);
  // bond q sits in slot kA at node a and kB at node b
  const slotOf = new Int32Array(2 * NS), fillK = new Int32Array(N);
  const slot = new Float32Array(SW * NH * 4).fill(-1), slot2 = new Float32Array(SW * NH * 4), slot3 = new Float32Array(SW * NH * 4);
  const saddr = (i, k) => ((Math.floor(i / NW) * SW) + (i % NW) * K + k) * 4;
  for (let q = 0; q < NS; q++) for (const [i, j, e] of [[SA[q], SB[q], 0], [SB[q], SA[q], 1]]) {
    const k = fillK[i]++; slotOf[2 * q + e] = (Math.floor(i / NW) << 16) | ((i % NW) * K + k);
    const o = saddr(i, k);
    slot[o] = j; slot[o + 1] = M.SL0[q]; slot[o + 2] = M.SK[q]; slot[o + 3] = M.SFY[q];
    slot2[o] = M.SEF[q]; slot2[o + 1] = M.SC[q]; slot2[o + 2] = M.crackPlate(q); slot2[o + 3] = 0;
    const uv = M.slotMid(q); slot3[o] = uv[0]; slot3[o + 1] = uv[1];
  }
  const sx = e => e & 0xffff, sy = e => e >>> 16;
  const pack = (n, f) => { const a = new Float32Array(NW * NH * 4); for (let i = 0; i < n; i++) f(i, a, 4 * i); return a; };
  // static node data
  const T = {};
  T.info = tex(NW, NH, pack(N, (i, a, o) => { a[o] = M.winv(i); a[o + 1] = M.AREA[i]; a[o + 2] = M.SURF[i]; a[o + 3] = 1; }));
  T.info2 = tex(NW, NH, pack(N, (i, a, o) => { a[o] = M.NSP[i]; a[o + 1] = M.NSN[i]; a[o + 2] = M.RH[i]; a[o + 3] = M.VC[i]; }));
  T.r0 = tex(NW, NH, pack(N, (i, a, o) => { a[o] = M.R0[3 * i]; a[o + 1] = M.R0[3 * i + 1]; a[o + 2] = M.R0[3 * i + 2];
    const nx = M.NRM[3 * i], ny = M.NRM[3 * i + 1], nz = M.NRM[3 * i + 2]; a[o + 3] = nx ? 1 * Math.sign(nx) : ny ? 2 * Math.sign(ny) : 3 * Math.sign(nz); }));
  T.load = tex(NW, NH, null);
  T.tie = tex(NW, NH, pack(N, (i, a, o) => { a[o] = M.TK[i]; a[o + 1] = M.TFY[i]; a[o + 2] = M.KB[i]; a[o + 3] = M.KBY[i]; }));
  T.bend = tex(NW, NH, pack(N, (i, a, o) => { a[o] = M.KBC[i]; }));
  T.umb = tex(NW, NH, pack(N, (i, a, o) => { a[o] = a[o + 1] = a[o + 2] = a[o + 3] = -1; let n = 0;
    for (let k = M.UNB[i]; k < M.UNB[i + 1] && n < 4; k++) { const q = M.UN[k], j = SA[q] === i ? SB[q] : SA[q], e = SA[q] === i ? 0 : 1;
      a[o + n++] = j * 32 + (sx(slotOf[2 * q + e]) - (i % NW) * K); } }));
  T.slot = tex(SW, NH, slot); T.slot2 = tex(SW, NH, slot2); T.slot3 = tex(SW, NH, slot3);
  // cells: the slot addresses of their six bonds
  const cs = [new Float32Array(CW * CH * 4).fill(-1), new Float32Array(CW * CH * 4).fill(-1), new Float32Array(CW * CH * 4).fill(-1)];
  for (let c = 0; c < NC; c++) { const qs = M.cellBonds(c); for (let m = 0; m < 6; m++) { const e = slotOf[2 * qs[m]]; cs[m >> 1][4 * c + (m & 1) * 2] = sx(e); cs[m >> 1][4 * c + (m & 1) * 2 + 1] = sy(e); } }
  T.cs = cs.map(d => tex(CW, CH, d));
  // plate node maps (atlas of the plates' node grids)
  let rows = 0, pw = 0; const PLR = []; for (const P of M.PL) { PLR.push(rows); rows += P.nv + 1; pw = Math.max(pw, P.nu + 1); }
  const pm = new Float32Array(pw * rows * 4);
  M.PL.forEach((P, p) => { for (let j = 0; j <= P.nv; j++) for (let i = 0; i <= P.nu; i++) pm[4 * ((PLR[p] + j) * pw + i)] = M.plateNode(p, i, j); });
  T.pmap = tex(pw, rows, pm);
  // dynamic, ping-pong
  const mk = () => ({ pos: tex(NW, NH, null), vel: tex(NW, NH, null), anc: tex(NW, NH, null), ub: tex(NW, NH, null) });
  const nodeS = [mk(), mk()], slotS = [tex(SW, NH, null), tex(SW, NH, null)], force = tex(SW, NH, null), cellS = [tex(CW, CH, null), tex(CW, CH, null)];
  const fNode = nodeS.map(s => fbo([s.pos, s.vel, s.anc, s.ub])), fSlot = slotS.map(s => fbo([s, force])), fCell = cellS.map(s => fbo([s]));
  let cur = 0, cc = 0, nstep = 0, force4 = false, crDirty = true;
  const statics = () => {
    gl.useProgram(pSlot); gl.uniform1i(pSlot.u.uK, K); gl.uniform1i(pSlot.u.uNW, NW); gl.uniform1f(pSlot.u.uS, M.S); gl.uniform1f(pSlot.u.uVc, M.V_CRACK);
    gl.useProgram(pNode); gl.uniform1i(pNode.u.uK, K); gl.uniform1i(pNode.u.uNW, NW); gl.uniform1i(pNode.u.uCW, CW); gl.uniform1f(pNode.u.uG, 9.81); gl.uniform1f(pNode.u.uS, M.S);
    gl.uniform3fv(pNode.u.uC, M.C()); gl.uniform4fv(pNode.u.uPl, plU); gl.uniform4fv(pNode.u.uPl2, pl2U); gl.uniform1iv(pNode.u.uPlRow, plRow); gl.uniform1iv(pNode.u.uPlCell, plCell);
    gpv.fill(NaN); crDirty = true; };

  function upload() {                       // the CPU state -> GPU (at detonation)
    const s = nodeS[cur];
    const put = (t, f) => { gl.bindTexture(gl.TEXTURE_2D, t); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, NW, NH, gl.RGBA, gl.FLOAT, pack(N, f)); };
    put(s.pos, (i, a, o) => { a[o] = M.X[3 * i]; a[o + 1] = M.X[3 * i + 1]; a[o + 2] = M.X[3 * i + 2]; a[o + 3] = M.DISC[i]; });
    put(s.vel, (i, a, o) => { a[o] = M.V[3 * i]; a[o + 1] = M.V[3 * i + 1]; a[o + 2] = M.V[3 * i + 2]; a[o + 3] = M.IMP[i]; });
    put(s.anc, (i, a, o) => { a[o] = M.TAN[3 * i]; a[o + 1] = M.TAN[3 * i + 1]; a[o + 2] = M.TAN[3 * i + 2]; a[o + 3] = M.FREE[i]; });
    put(s.ub, (i, a, o) => { a[o] = M.UB[3 * i]; a[o + 1] = M.UB[3 * i + 1]; a[o + 2] = M.UB[3 * i + 2]; });
    put(T.info, (i, a, o) => { a[o] = M.winv(i); a[o + 1] = M.AREA[i]; a[o + 2] = M.SURF[i]; a[o + 3] = M.dirSign(i); });
    loads();
    const ss = new Float32Array(SW * NH * 4);
    for (let q = 0; q < NS; q++) for (let e = 0; e < 2; e++) { const a = slotOf[2 * q + e], o = (sy(a) * SW + sx(a)) * 4; ss[o] = M.SLP[q]; ss[o + 1] = M.SBRK[q]; ss[o + 2] = 1; }
    gl.bindTexture(gl.TEXTURE_2D, slotS[cur]); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, SW, NH, gl.RGBA, gl.FLOAT, ss);
    const ct = new Float32Array(CW * CH * 4); for (let c = 0; c < NC; c++) ct[4 * c] = M.CTORN[c];
    gl.bindTexture(gl.TEXTURE_2D, cellS[cc]); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, CW, CH, gl.RGBA, gl.FLOAT, ct);
    statics();
  }
  function loads() {                        // shock parameters and line of sight
    gl.bindTexture(gl.TEXTURE_2D, T.load);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, NW, NH, gl.RGBA, gl.FLOAT, pack(N, (i, a, o) => { a[o] = M.PR(i); a[o + 1] = M.TA(i); a[o + 2] = M.TD(i); a[o + 3] = M.PR(i) > 0 ? 1 : 0; }));
  }
  const bind = (p, name, t, unit) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(p.u[name], unit); };
  const crA = new Float32Array(32), crL = new Float32Array(32), crV = new Float32Array(16), gpv = new Float32Array(5);
  const plU = new Float32Array(16), pl2U = new Float32Array(16);
  M.PL.forEach((P, p) => { plU.set([P.ax, P.ua, P.va, P.val], 4 * p); pl2U.set([P.u0, P.v0, P.nu, P.nv], 4 * p); });
  const plRow = new Int32Array(PLR), plCell = new Int32Array(M.PL.map(P => P.off));

  function step(t, h, msc, damp) {
    gl.bindVertexArray(vao); gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    const nx = 1 - cur, s = nodeS[cur];
    // 1. bonds
    gl.useProgram(pSlot); gl.bindFramebuffer(gl.FRAMEBUFFER, fSlot[nx]); gl.viewport(0, 0, SW, NH);
    bind(pSlot, 'uPos', s.pos, 0); bind(pSlot, 'uVel', s.vel, 1); bind(pSlot, 'uSS', slotS[cur], 2);
    bind(pSlot, 'uSlot', T.slot, 3); bind(pSlot, 'uSlot2', T.slot2, 4); bind(pSlot, 'uSlot3', T.slot3, 5);
    gl.uniform1f(pSlot.u.uT, t);
    if (crDirty) { gl.uniform4fv(pSlot.u.uCr, crV); gl.uniform1fv(pSlot.u.uCrA, crA); gl.uniform1fv(pSlot.u.uCrL, crL); crDirty = false; }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // 2. nodes
    const d = nodeS[nx];
    gl.useProgram(pNode); gl.bindFramebuffer(gl.FRAMEBUFFER, fNode[nx]); gl.viewport(0, 0, NW, NH);
    bind(pNode, 'uPos', s.pos, 0); bind(pNode, 'uVel', s.vel, 1); bind(pNode, 'uAnc', s.anc, 2); bind(pNode, 'uUB', s.ub, 3);
    bind(pNode, 'uSF', force, 4); bind(pNode, 'uSS', slotS[nx], 5); bind(pNode, 'uInfo', T.info, 6); bind(pNode, 'uInfo2', T.info2, 7);
    bind(pNode, 'uR0', T.r0, 8); bind(pNode, 'uLoad', T.load, 9); bind(pNode, 'uTie', T.tie, 10); bind(pNode, 'uUmb', T.umb, 11);
    bind(pNode, 'uBend', T.bend, 12); bind(pNode, 'uCell', cellS[cc], 13); bind(pNode, 'uPMap', T.pmap, 14);
    gl.uniform1f(pNode.u.uT, t); gl.uniform1f(pNode.u.uH, h); gl.uniform1f(pNode.u.uMsc, msc); gl.uniform1f(pNode.u.uDamp, damp);
    let gd = false; for (let c = 0; c < 5; c++) if (gpv[c] !== M.GP[c]) { gpv[c] = M.GP[c]; gd = true; }
    if (gd) gl.uniform1fv(pNode.u.uGP, gpv);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // 3. cells, every 4th step (feeds contact and line of sight; a quarter-step of lag is ~0.1 ms)
    if ((++nstep & 3) === 0 || force4) {
      gl.useProgram(pCell); gl.bindFramebuffer(gl.FRAMEBUFFER, fCell[1 - cc]); gl.viewport(0, 0, CW, CH);
      bind(pCell, 'uSS', slotS[nx], 0); bind(pCell, 'uCS0', T.cs[0], 1); bind(pCell, 'uCS1', T.cs[1], 2); bind(pCell, 'uCS2', T.cs[2], 3); bind(pCell, 'uCell', cellS[cc], 4);
      gl.drawArrays(gl.TRIANGLES, 0, 3); cc = 1 - cc; force4 = false;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    cur = nx;
  }
  // read back
  const rbN = new Float32Array(NW * NH * 4), rbC = new Float32Array(CW * CH * 4);
  const read = (f, i, w, h, out) => { gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.readBuffer(gl.COLOR_ATTACHMENT0 + i); gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, out); gl.bindFramebuffer(gl.FRAMEBUFFER, null); return out; };
  function readNodes(withVel) {             // positions, tear-outs, loose plate -> CPU arrays
    const f = fNode[cur];
    read(f, 0, NW, NH, rbN); for (let i = 0; i < N; i++) { M.X[3 * i] = rbN[4 * i]; M.X[3 * i + 1] = rbN[4 * i + 1]; M.X[3 * i + 2] = rbN[4 * i + 2]; M.DISC[i] = rbN[4 * i + 3] > .5 ? 1 : 0; }
    read(f, 2, NW, NH, rbN); for (let i = 0; i < N; i++) M.FREE[i] = rbN[4 * i + 3] > .5 ? 1 : 0;
    if (withVel) { read(f, 1, NW, NH, rbN); for (let i = 0; i < N; i++) { M.V[3 * i] = rbN[4 * i]; M.V[3 * i + 1] = rbN[4 * i + 1]; M.V[3 * i + 2] = rbN[4 * i + 2]; } }
  }
  function readCells() { return read(fCell[cc], 0, CW, CH, rbC); }
  const pbo = gl.createBuffer(); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo); gl.bufferData(gl.PIXEL_PACK_BUFFER, CW * CH * 16, gl.STREAM_READ); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
  let fence = null;
  function readCellsAsync() {               // returns the previous request's result if ready (else null), then queues a new one
    let out = null;
    if (fence) {
      const st = gl.clientWaitSync(fence, 0, 0);
      if (st === gl.TIMEOUT_EXPIRED) return null;
      gl.deleteSync(fence); fence = null;
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo); gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, rbC); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null); out = rbC;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, fCell[cc]); gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo); gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.FLOAT, 0); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); gl.flush();
    return out;
  }
  function readBonds() {                    // final: plastic rest lengths and broken bonds
    const b = new Float32Array(SW * NH * 4); read(fSlot[cur], 0, SW, NH, b);
    for (let q = 0; q < NS; q++) { const a = slotOf[2 * q], o = (sy(a) * SW + sx(a)) * 4; M.SLP[q] = b[o]; M.SBRK[q] = b[o + 1] > .5 ? 1 : 0; }
  }
  function cracks(list) {                   // [{p, u, v, t0, rb, lines:[{th, lf}]}]
    crV.fill(0); crA.fill(0); crL.fill(0); crDirty = true;
    for (const c of list) { crV.set([c.u, c.v, c.t0, c.rb], 4 * c.p); c.lines.slice(0, 8).forEach((l, k) => { crA[c.p * 8 + k] = l.th; crL[c.p * 8 + k] = l.lf; }); }
  }
  return { step, upload, loads, readNodes, readCells, readCellsAsync, readBonds, cracks, K, CW, CH };
}
