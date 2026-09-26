/* (game/concepts/blast/gpu_wgpu.js at commit 200fe28, copied; the one change: gravity on free pieces along the patch's up
   axis, UPAX) The blast bench's structural model on WebGPU compute: the same physics as gpu.js (WebGL2) and the CPU reference in
   blast.js, pass for pass (hinges, cells, members, gather, contact scatter, nodes), with the state in three storage
   buffers:
     ST  statics (node, cell, hinge, member records; panels, cell map, adjacency, arrival table), read only
     DY  ping-pong state: nodes (u, v, anchor), cells (4 triangles' plastic state + cell state), hinges, members;
         which half is current is a per-step parameter, so one bind group serves every step
     SC  scratch: contact records, node forces, element forces, damage, impulse list, packed torn cells
   Many steps go into one command buffer (one submit per `batch` steps); per-step values (t, h, damping, parity) sit
   in a uniform buffer at a dynamic offset. Loads (sources, gas), impulses and damage are copied in between steps
   from an upload buffer, so they apply exactly where the CPU set them. Read backs are asynchronous (mapAsync):
   readNodes/readCells return the latest completed copy; flush() waits for everything submitted and refreshes it.
   Contact push-back: each node that hits a cell joins that cell's list (atomic exchange); the next step's gather
   sums each adjacent cell's list in node order, so the result doesn't depend on thread order (deterministic, like
   WebGL's in-order blending). Fragment impulses are summed per node on the CPU. */

export async function initWebGPU() {
  if (!navigator.gpu) return null;
  const ad = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!ad) return null;
  const req = {}; for (const k of ['maxStorageBufferBindingSize', 'maxBufferSize', 'maxStorageBuffersPerShaderStage', 'maxComputeWorkgroupsPerDimension']) req[k] = ad.limits[k];
  const dev = await ad.requestDevice({ requiredLimits: req });
  dev.lost.then(i => console.warn('WebGPU device lost', i.message));
  return dev;
}

const WGS = 64;
const HEAD = (c) => `
struct Kc { matA: array<vec4f, 8>, matB: array<vec4f, 8>, matC: array<vec4f, 8>, s0: vec4f, s1: vec4f }
struct Pp { t: f32, h: f32, alpha: f32, nimp: u32, par: u32, q0: u32, q1: u32, q2: u32 }
struct Ll { gp: array<vec4f, 32>, s0: array<vec4f, 32>, s1: array<vec4f, 32>, s2: array<vec4f, 32>, s3: array<vec4f, 32>, s4: array<vec4f, 32>, s5: array<vec4f, 32>, ns: vec4i }
@group(0) @binding(0) var<storage, read> ST: array<vec4f>;
@group(0) @binding(1) var<storage, read_write> DY: array<vec4f>;
@group(0) @binding(3) var<uniform> KC: Kc;
@group(0) @binding(4) var<uniform> PP: Pp;
@group(0) @binding(5) var<uniform> LL: Ll;
${Object.entries(c).map(([k, v]) => `const ${k}: i32 = ${v};`).join('\n')}
fn ndB(h: u32) -> i32 { return O_ND + i32(h) * 3 * N; }
fn UU(i: i32) -> vec3f { return DY[ndB(PP.par) + i].xyz; }
fn VV(i: i32) -> vec3f { return DY[ndB(PP.par) + N + i].xyz; }
fn XR(i: i32) -> vec3f { return ST[O_NS + 5 * i + 1].xyz + UU(i); }
fn clB(h: u32) -> i32 { return O_CL + i32(h) * 5 * NC; }
fn CST(c: i32, h: u32) -> vec4f { return DY[clB(h) + 4 * NC + c]; }
fn mbB(h: u32) -> i32 { return O_MB + i32(h) * NT; }
fn CSF(mi: i32, ed: f32, ep: f32) -> f32 { let b = KC.matB[mi]; let c = KC.matC[mi]; let f = min(1.0, ep / c.z); return 1.0 + pow(min(ed, 1e4) / mix(b.x, c.x, f), 1.0 / mix(b.y, c.y, f)); }
fn wrapA(a: f32) -> f32 { return a - 6.283185307 * floor(a / 6.283185307 + 0.5); }
`;
const SCV = `@group(0) @binding(2) var<storage, read_write> SC: array<vec4f>;\n`;

const HINGE = `
@compute @workgroup_size(${WGS}) fn main(@builtin(global_invocation_id) gid: vec3u) {
  let k = i32(gid.x); if (k >= NH) { return; }
  let v = PP.par; let w = 1u - v;
  let hb = O_HS + 9 * k;
  let h0 = ST[hb]; let h1 = ST[hb + 1]; let h2 = ST[hb + 2]; let h3 = ST[hb + 3]; let h4 = ST[hb + 4];
  let st = DY[O_HT + i32(v) * NH + k];
  var oSt = vec4f(st.x, 0.0, 0.0, 0.0); var oF0 = vec4f(0.0); var oF1 = vec4f(0.0); var oF2 = vec4f(0.0);
  loop {
    if (h0.x < 0.0) { break; }
    let c1 = i32(h1.z); let c2 = i32(h1.w);
    let s1 = CST(c1, v); let s2 = CST(c2, v);
    if (s1.x > 0.5 || s2.x > 0.5) { break; }
    let i3 = i32(h0.x); let i4 = i32(h0.y); let a1 = i32(h0.z); let b1 = i32(h0.w); let a2 = i32(h1.x); let b2 = i32(h1.y);
    let r0 = ST[hb + 5]; let r1 = ST[hb + 6]; let r2 = ST[hb + 7];
    let d3 = UU(i3);
    let E = r0.xyz + UU(i4) - d3; let lE = length(E); let e = E / lE;
    let p1 = vec3f(r0.w, r1.xy) + 0.5 * (UU(a1) + UU(b1)) - d3; let p2 = vec3f(r1.zw, r2.x) + 0.5 * (UU(a2) + UU(b2)) - d3;
    let N1 = cross(p1, p1 - E); let N2 = cross(p2 - E, p2);
    let l1 = dot(N1, N1); let l2 = dot(N2, N2);
    if (sqrt(l1) < 0.2 * h3.z * lE || sqrt(l2) < 0.2 * h3.z * lE) { break; }
    let n1 = N1 * inverseSqrt(l1); let n2 = N2 * inverseSqrt(l2);
    let d = wrapA(atan2(dot(cross(n2, n1), e), dot(n1, n2)) - h4.y);
    let s13 = dot(p1 - E, e); let s23 = dot(p2 - E, e); let s14 = dot(p1, e); let s24 = dot(p2, e);
    let u1 = (lE / l1) * N1; let u2 = (lE / l2) * N2; let u3 = s13 * N1 / l1 + s23 * N2 / l2; let u4 = -s14 * N1 / l1 - s24 * N2 / l2;
    let v1 = 0.5 * (VV(a1) + VV(b1)); let v2 = 0.5 * (VV(a2) + VV(b2));
    let thd = dot(u1, v1) + dot(u2, v2) + dot(u3, VV(i3)) + dot(u4, VV(i4));
    let mi = i32(h4.x);
    let edot = abs(thd) * h3.w / (2.0 * h3.z); let rf = CSF(mi, edot, abs(st.x) * h3.w / (2.0 * h3.z));
    let ut = min(1.0, 0.5 * (s1.w + s2.w));
    let kk = h2.x; let cap = h2.y * rf * (1.0 - ut * ut);
    var tp = st.x; var Mt = kk * (d - tp);
    if (Mt > cap) { tp = d - cap / kk; Mt = cap; } else if (Mt < -cap) { tp = d + cap / kk; Mt = -cap; }
    let Mm = Mt + KC.s0.x * kk * thd;
    oSt = vec4f(tp, d, 0.0, 0.0);
    let F3 = -Mm * u3; let F4 = -Mm * u4; let Fa = -Mm * u1; let Fb = -Mm * u2;
    oF0 = vec4f(F3, F4.x); oF1 = vec4f(F4.yz, Fa.xy); oF2 = vec4f(Fa.z, Fb);
    break;
  }
  DY[O_HT + i32(w) * NH + k] = oSt; SC[O_HF + k] = oF0; SC[O_HF + NH + k] = oF1; SC[O_HF + 2 * NH + k] = oF2;
}`;

const CELL = `
@group(0) @binding(6) var<storage, read_write> HD: array<i32>;
fn GPa(s: i32) -> f32 { return LL.gp[s >> 2u][s & 3]; }
fn kPs(Z: f32) -> f32 { let a = Z / 4.5; let b = Z / 0.048; let c = Z / 0.32; let d = Z / 1.35; return KC.s0.w * 808.0 * (1.0 + a * a) / sqrt((1.0 + b * b) * (1.0 + c * c) * (1.0 + d * d)); }
fn kIs(Z: f32) -> f32 { return 6.7 * sqrt(1.0 + pow(Z / 0.23, 4.0)) / (Z * Z * pow(1.0 + pow(Z / 1.55, 3.0), 1.0 / 3.0)); }
fn refl(Ps: f32) -> f32 { let p0 = KC.s0.w; return 2.0 * Ps * (7.0 * p0 + 4.0 * Ps) / (7.0 * p0 + Ps); }
fn arr1(Z: f32) -> f32 { let k = min(2046.0, Z / 0.02); let i = i32(floor(k)); let a = ST[O_AUX + i].x; let b = ST[O_AUX + i + 1].x; return a + (b - a) * (k - f32(i)); }
fn Fp(x: f32, tf: f32) -> f32 { if (x <= tf) { return 0.0; } return 1.0 - pow(tf / x, 4.0); }
fn retMap(sp: ptr<function, vec3f>, eb: f32, mA: vec4f, rf: f32) -> vec2f {
  let s = *sp;
  let E = mA.x; let nu = mA.y; let Gm = E / (2.0 * (1.0 + nu)); let c1 = E / (3.0 * (1.0 - nu)); let c2 = 2.0 * Gm;
  let s1 = (s.x + s.y) * 0.70710678; let s2 = (s.y - s.x) * 0.70710678; let s3 = s.z;
  let A1 = s1 * s1 / 3.0; let A2 = s2 * s2 + 2.0 * s3 * s3;
  let sY0 = (mA.z + mA.w * eb) * rf;
  if (1.5 * (A1 + A2) <= sY0 * sY0) { return vec2f(-1.0, sqrt(A1 + A2)); }
  var g = 0.0;
  for (var it = 0; it < 12; it++) {
    let d1 = 1.0 + c1 * g; let d2 = 1.0 + c2 * g; let fb2 = A1 / (d1 * d1) + A2 / (d2 * d2); let fb = sqrt(fb2);
    let e = eb + 0.81649658 * g * fb; let sY = (mA.z + mA.w * e) * rf;
    let phi = 0.5 * fb2 - sY * sY / 3.0;
    let dfb2 = -2.0 * A1 * c1 / (d1 * d1 * d1) - 2.0 * A2 * c2 / (d2 * d2 * d2); let dfb = dfb2 / (2.0 * fb);
    let de = 0.81649658 * (fb + g * dfb); let dphi = 0.5 * dfb2 - 2.0 / 3.0 * sY * mA.w * rf * de;
    let ng = g - phi / dphi; g = select(g * 0.5, ng, ng > 0.0);
    if (abs(phi) < 1e-10 * sY * sY) { break; }
  }
  let d1 = 1.0 + c1 * g; let d2 = 1.0 + c2 * g; let t1 = s1 / d1; let t2 = s2 / d2; let t3 = s3 / d2;
  *sp = vec3f((t1 - t2) * 0.70710678, (t1 + t2) * 0.70710678, t3);
  return vec2f(g, sqrt(t1 * t1 / 3.0 + t2 * t2 + 2.0 * t3 * t3));
}
@compute @workgroup_size(${WGS}) fn main(@builtin(global_invocation_id) gid: vec3u) {
  let c = i32(gid.x); if (c >= NC) { return; }
  let v = PP.par; let w = 1u - v; let cb = clB(v); let cw = clB(w);
  var T: array<vec4f, 4>; for (var k = 0; k < 4; k++) { T[k] = DY[cb + k * NC + c]; }
  let cs = DY[cb + 4 * NC + c];
  var o: array<vec4f, 4>; for (var k = 0; k < 4; k++) { o[k] = T[k]; }
  var oC = cs; var oF0 = vec4f(0.0); var oF1 = vec4f(0.0); var oF2 = vec4f(0.0);
  let sb = O_CS + 11 * c;
  let c0 = ST[sb];
  HD[i32(v) * NC + c] = -1;
  loop {
    if (c0.x < 0.0 || cs.x > 0.5) { break; }
    let r1 = ST[sb + 1]; let r2 = ST[sb + 2]; let r3 = ST[sb + 3];
    var tr: array<vec4f, 4>; tr[0] = ST[sb + 4]; tr[1] = ST[sb + 5]; tr[2] = ST[sb + 6]; tr[3] = ST[sb + 7];
    let hg = ST[sb + 8]; let c9 = ST[sb + 9]; let c10 = ST[sb + 10];
    var q: array<i32, 4>; q[0] = i32(c0.x); q[1] = i32(c0.y); q[2] = i32(c0.z); q[3] = i32(c0.w);
    let ua = UU(q[0]);
    var P: array<vec3f, 4>; P[0] = vec3f(0.0); P[1] = r1.xyz + UU(q[1]) - ua; P[2] = r2.xyz + UU(q[2]) - ua; P[3] = r3.xyz + UU(q[3]) - ua;
    var Vn: array<vec3f, 4>; for (var k = 0; k < 4; k++) { Vn[k] = VV(q[k]); }
    let mi = i32(r2.w); let mA = KC.matA[mi];
    let hh = 0.5 * r1.w; let fd = 1.0 - SC[O_DMG + c].x;
    let E = mA.x; let nu = mA.y; let Ep = E / (1.0 - nu * nu); let Gm = E / (2.0 * (1.0 + nu));
    var f: array<vec3f, 4>; for (var k = 0; k < 4; k++) { f[k] = vec3f(0.0); }
    var util = 0.0; var dDam = 0.0; var jmin = 9.0;
    var TRI = array<vec3i, 4>(vec3i(0, 1, 2), vec3i(0, 2, 3), vec3i(0, 1, 3), vec3i(1, 2, 3));
    for (var t = 0; t < 4; t++) {
      let I = TRI[t];
      let L12 = tr[t].x; let P3x = tr[t].y; let P3y = tr[t].z; let A0 = 0.5 * L12 * P3y;
      let a = P[I.y] - P[I.x]; let b = P[I.z] - P[I.x];
      let l12 = length(a); let e1 = a / l12; let n = normalize(cross(a, b)); let e2 = cross(n, e1);
      let p3x = dot(b, e1); let p3y = dot(b, e2);
      let F11 = l12 / L12; let F12 = (p3x - l12 * P3x / L12) / P3y; let F22 = max(p3y / P3y, 0.05);
      jmin = min(jmin, F11 * F22);
      let th = atan2(-F12, F11 + F22); let co = cos(th); let si = sin(th);
      let U11 = co * F11; let U22 = -si * F12 + co * F22; let U12 = 0.5 * ((co * F12 + si * F22) - si * F11);
      var ep = T[t];
      let ee11 = U11 - 1.0 - ep.x; let ee22 = U22 - 1.0 - ep.y; let ee12 = U12 - ep.z;
      var s = vec3f(Ep * (ee11 + nu * ee22), Ep * (ee22 + nu * ee11), 2.0 * Gm * ee12);
      let dv2 = Vn[I.y] - Vn[I.x]; let dv3 = Vn[I.z] - Vn[I.x];
      let w2x = dot(dv2, e1); let w2y = dot(dv2, e2); let w3x = dot(dv3, e1); let w3y = dot(dv3, e2);
      let Fd11 = w2x / L12; let Fd21 = w2y / L12; let Fd12 = -w2x * P3x / (L12 * P3y) + w3x / P3y; let Fd22 = -w2y * P3x / (L12 * P3y) + w3y / P3y;
      let i11 = 1.0 / F11; let i12 = -F12 / (F11 * F22); let i22 = 1.0 / F22;
      let D11 = Fd11 * i11; let D22 = Fd21 * i12 + Fd22 * i22; let D12 = 0.5 * ((Fd11 * i12 + Fd12 * i22) + Fd21 * i11);
      let edot = sqrt(2.0 / 3.0 * (D11 * D11 + D22 * D22 + (D11 + D22) * (D11 + D22) + 2.0 * D12 * D12));
      let vt = sqrt(s.x * s.x + s.y * s.y - s.x * s.y + 3.0 * s.z * s.z); var wc = 0.0; if (vt > 0.0) { wc = clamp(-(s.x + s.y) / vt, 0.0, 1.0); }
      var rmp = 1.0; if (c10.z > 0.0) { rmp = min(1.0, ep.w / c10.z); }
      let rf = CSF(mi, edot, ep.w) * (1.0 - (1.0 - c10.y) * wc * rmp);
      let rm = retMap(&s, ep.w, mA, rf);
      if (rm.x >= 0.0) {
        let g = rm.x; let de = vec3f(g * (2.0 * s.x - s.y) / 3.0, g * (2.0 * s.y - s.x) / 3.0, g * s.z);
        let deb = 0.81649658 * g * rm.y;
        ep = vec4f(ep.xyz + de, ep.w + deb);
        let vm0 = sqrt(s.x * s.x + s.y * s.y - s.x * s.y + 3.0 * s.z * s.z);
        if ((s.x + s.y) / (3.0 * vm0 + 1e-9) > -1.0 / 3.0) { dDam = max(dDam, deb); }
      }
      o[t] = ep;
      let vm = sqrt(s.x * s.x + s.y * s.y - s.x * s.y + 3.0 * s.z * s.z);
      util = max(util, vm / ((mA.z + mA.w * ep.w) * rf));
      let Dr11 = co * co * D11 + 2.0 * co * si * D12 + si * si * D22; let Dr22 = si * si * D11 - 2.0 * co * si * D12 + co * co * D22; let Dr12 = (co * co - si * si) * D12 + co * si * (D22 - D11);
      let bt = KC.s0.x;
      let S11 = s.x + bt * Ep * (Dr11 + nu * Dr22); let S22 = s.y + bt * Ep * (Dr22 + nu * Dr11); let S12 = s.z + bt * 2.0 * Gm * Dr12;
      let P11 = co * S11 - si * S12; let P12 = co * S12 - si * S22; let P21 = si * S11 + co * S12; let P22 = si * S12 + co * S22;
      let vol = A0 * hh * fd; let k1 = 1.0 / L12; let k2 = -P3x / (L12 * P3y); let k3 = 1.0 / P3y;
      let f2x = -vol * (P11 * k1 + P12 * k2); let f2y = -vol * (P21 * k1 + P22 * k2); let f3x = -vol * P12 * k3; let f3y = -vol * P22 * k3;
      let g2 = f2x * e1 + f2y * e2; let g3 = f3x * e1 + f3y * e2;
      f[I.y] += g2; f[I.z] += g3; f[I.x] -= g2 + g3;
    }
    let Dd = cs.z + dDam;
    // loads
    let xa = ST[O_NS + 5 * q[0] + 1].xyz + ua;
    let Av = 0.5 * cross(P[2] - P[0], P[3] - P[1]); let A = max(length(Av), 1e-12); let nn = Av / A;
    let sP = i32(tr[0].w); let sN = i32(tr[1].w);
    var L = (GPa(sN) - GPa(sP)) * Av;
    if (tr[2].w >= 0.0) {
      let so = select(-1.0, 1.0, sP == OUT);
      let vn = dot(0.25 * (Vn[0] + Vn[1] + Vn[2] + Vn[3]), nn) * so;
      let pr = max(KC.s0.z * vn, -(KC.s0.w + KC.s1.x * tr[2].w));
      L -= pr * A * nn * so;
    }
    let xc = xa + 0.25 * (P[0] + P[1] + P[2] + P[3]);
    let vis = i32(c10.x);
    let uT = PP.t; let uH = PP.h;
    for (var k = 0; k < 32; k++) {
      if (k >= LL.ns.x) { break; }
      let S0 = LL.s0[k]; let S1 = LL.s1[k]; let S2 = LL.s2[k]; let S3 = LL.s3[k];
      let cu = S3.w > 0.0 && S3.w >= uT && S3.w < uT + uH;
      let sp = i32(S1.z); var sg = 0.0;
      if (sN == sp) { sg = 1.0; } else if (sP == sp) { sg = -1.0; } else { continue; }
      let vb = i32(S3.y);
      if (vb >= 0 && ((vis >> u32(vb)) & 1) == 0) { continue; }
      if (S3.z > 0.5) { let pl = LL.s4[k]; if (abs(dot(c9.xyz, pl.xyz) - pl.w) < 0.3 * KC.s1.z + 0.02) { continue; } }
      let d = xc - S0.xyz; var R = max(length(d), 1e-6);
      let ca = abs(dot(d, nn)) / R; let c2 = ca * ca; var co = 1.0;
      let kind = i32(S1.w);
      if (kind == 3) {
        if (tr[2].w < 0.0) { continue; }
        let Rw = max(R, S3.x); let W3 = pow(S0.w, 1.0 / 3.0); let Xw = W3 / Rw;
        let Pw = (1.0 + ca) * 52.4e6 * pow(Xw, 1.13); let th = 0.084e-3 * W3 * pow(Xw, -0.23); let TAw = S1.y + Rw / 1500.0;
        let tc = min((sqrt(Rw * Rw + 4.0 * S2.x * tr[2].w) - Rw) / 1500.0, 10.0 * th);
        let a = select(clamp(uT - TAw, 0.0, tc), 0.0, cu); let b = clamp(uT + uH - TAw, 0.0, tc);
        let Iw = Pw * th * (exp(-a / th) - exp(-b / th)) * S2.w;
        if (Iw > 0.0) { L += (Iw / uH * A * sg) * nn; }
        continue;
      }
      if (kind == 1) { co = dot(d, S2.xyz) / R; if (co < 0.0) { continue; } co = max(co, 0.02); }
      R = max(R, S3.x);
      let Weq = select(S0.w, 4.0 * S0.w * co, kind == 1);
      var I = 0.0; var Iair = 0.0; var Pk = 0.0; var TA = 0.0;
      if (Weq > 1e-6) {
        let W3 = pow(Weq, 1.0 / 3.0); let Z = max(R / W3, 0.053);
        let Ps = kPs(Z); let Pr = refl(Ps); let is_ = kIs(Z) * W3; let ir = is_ * pow(Pr / Ps, 0.75);
        Pk = Ps + (Pr - Ps) * c2; Iair = is_ + (ir - is_) * c2; let TD = 2.0 * Iair / Pk; TA = S1.y + W3 * arr1(Z);
        var a = select(uT - TA, -1e9, cu); var b = uT - TA + uH;
        if (b > 0.0 && a < TD) { a = max(a, 0.0); b = min(b, TD); I += Pk * ((b - b * b / (2.0 * TD)) - (a - a * a / (2.0 * TD))); }
      }
      let S5 = LL.s5[k]; let Rd = S5.z + R;
      if (S5.x > 0.0 && Iair > 0.0) {
        let W3 = pow(S5.x, 1.0 / 3.0); let Z = max(Rd / W3, 0.053); let Ps = kPs(Z); let Pr = refl(Ps); let is_ = kIs(Z) * W3; let ir = is_ * pow(Pr / Ps, 0.75);
        let Pd = Ps + (Pr - Ps) * c2; let Id = is_ + (ir - is_) * c2;
        if (Id < Iair || Pd < Pk) { I = 0.0; Iair = min(Iair, Id); Pk = min(Pk, Pd); let TD = 2.0 * Iair / Pk;
          var a = select(uT - TA, -1e9, cu); var b = uT - TA + uH;
          if (b > 0.0 && a < TD) { a = max(a, 0.0); b = min(b, TD); I += Pk * ((b - b * b / (2.0 * TD)) - (a - a * a / (2.0 * TD))); } }
      }
      if (S1.x > 0.0) {
        var ip = S1.x * select(1.0 / 12.5663706, co / 3.14159265, kind == 1) * c2 / (R * R);
        if (S5.x > 0.0) { ip = min(ip, S5.y * c2 / (12.5663706 * Rd * Rd)); }
        let Ix = max(0.0, ip - Iair); let tf = R / KC.s0.y;
        if (Ix > 0.0) { I += Ix * (Fp(uT + uH - S1.y, tf) - select(Fp(uT - S1.y, tf), 0.0, cu)); }
      }
      I *= S2.w;
      if (I > 0.0) { L += (I / uH * A * sg) * nn; }
    }
    L *= 0.25;
    f[0] += L; f[1] += L; f[2] += L; f[3] += L;
    oF0 = vec4f(f[0], f[1].x); oF1 = vec4f(f[1].yz, f[2].xy); oF2 = vec4f(f[2].z, f[3]);
    // fracture
    var eb = 0.0; var H: array<i32, 4>; H[0] = i32(hg.x); H[1] = i32(hg.y); H[2] = i32(hg.z); H[3] = i32(hg.w);
    for (var k = 0; k < 4; k++) { if (H[k] >= 0) { let hs = DY[O_HT + i32(w) * NH + H[k]]; eb = max(eb, abs(hs.x) * r1.w / (2.0 * c9.w)); } }
    let torn = select(0.0, 1.0, Dd + eb >= r3.w || fd <= 0.0 || jmin < c10.w);
    oC = vec4f(torn, select(-1.0, uT, torn > 0.5), Dd, min(1.0, util));
    break;
  }
  for (var k = 0; k < 4; k++) { DY[cw + k * NC + c] = o[k]; }
  DY[cw + 4 * NC + c] = oC;
  SC[O_CF + c] = oF0; SC[O_CF + NC + c] = oF1; SC[O_CF + 2 * NC + c] = oF2;
}`;

const TRUSS = `
var<private> EX: vec3f;
fn ang(u0: vec3f, v0: vec3f) -> f32 { let u = u0 - dot(u0, EX) * EX; let v = v0 - dot(v0, EX) * EX; return atan2(dot(cross(u, v), EX), dot(u, v)); }
fn gr(v0: vec3f) -> vec3f { let v = v0 - dot(v0, EX) * EX; return cross(EX, v) / max(dot(v, v), 1e-30); }
fn dAe(u: vec3f, v: vec3f) -> vec3f { let cx = cross(u, v); let s = dot(EX, cx); let ue = dot(u, EX); let ve = dot(v, EX); let c = dot(u, v) - ue * ve; return (c * cx + s * (ve * u + ue * v)) / max(s * s + c * c, 1e-30); }
@compute @workgroup_size(${WGS}) fn main(@builtin(global_invocation_id) gid: vec3u) {
  let k = i32(gid.x); if (k >= NT) { return; }
  let v = PP.par; let w = 1u - v;
  let tb = O_TS + 7 * k;
  let t0 = ST[tb]; let t1 = ST[tb + 1]; let t2 = ST[tb + 2]; let t3 = ST[tb + 3]; let t4 = ST[tb + 4]; let t5 = ST[tb + 5];
  let st = DY[mbB(v) + k];
  var oSt = st; var F: array<vec3f, 9>; for (var z = 0; z < 9; z++) { F[z] = vec3f(0.0); }
  loop {
    if (t0.x < 0.0 || st.x < 0.0) { break; }
    let a = i32(t0.x); let b = i32(t0.y); let L0 = t0.z; let Ar = t0.w;
    let d = t3.xyz + UU(b) - UU(a); let L = length(d); let u = d / L;
    let mi = i32(t1.x); let mA = KC.matA[mi];
    let vr = dot(VV(b) - VV(a), u); let rf = CSF(mi, abs(vr) / L0, st.z);
    let kk = mA.x * Ar / L0; let fy = (mA.z + mA.w * st.z) * rf * Ar;
    var Lp = st.x; var eb = st.z; var fo = kk * (L - Lp);
    if (fo > fy) { let np = L - fy / kk; eb += abs(np - Lp) / L0; Lp = np; fo = fy; }
    else if (fo < -fy * t5.w) { let fc = fy * t5.w; let np = L + fc / kk; eb += abs(np - Lp) / L0; Lp = np; fo = -fc; }
    fo += KC.s0.x * kk * vr;
    F[0] = fo * u; F[1] = -fo * u;
    var tbp = st.w; var tsp = st.y;
    let cl = i32(t1.w); let cl2 = i32(t5.y); let A = i32(t2.x); let B = i32(t2.y); let C0 = i32(t4.x);
    var on = cl >= 0 && (A >= 0 || C0 >= 0);
    if (on) { on = CST(cl, w).x < 0.5; }
    if (on && cl2 >= 0) { on = CST(cl2, w).x < 0.5; }
    if (on) {
      let t6 = ST[tb + 6];
      let r1 = i32(t6.x); let r2 = i32(t6.y); let l1 = i32(t6.z); let l2 = i32(t6.w);
      let xa = XR(a); var xB = xa; if (B >= 0) { xB = XR(B); }
      let pv = i32(t4.y); var bOn = pv < 0; if (!bOn) { bOn = DY[mbB(v) + pv].x > 0.0; }
      if (A >= 0 && bOn) {
        let xA = XR(A); let D = XR(r1) - XR(l1); let t = xB - xA;
        let dd = dot(t, t); let Dd = dot(D, t); let P = D - t * (Dd / dd); let pl = length(P);
        if (pl > 0.3 * length(D)) {
          EX = -P / pl;
          let e1 = xa - xA; let e2 = xB - xa; let g1 = gr(e1); let g2 = gr(e2);
          let thd = dot(g2, VV(B) - VV(a)) - dot(g1, VV(a) - VV(A));
          let dth = wrapA(ang(e1, e2) - t3.w);
          let rfb = CSF(mi, abs(thd) * t1.z, abs(tbp) * t1.z); let cap = t2.w * rfb; let kb = t2.z;
          var Q = kb * (dth - tbp);
          if (Q > cap) { tbp = dth - cap / kb; Q = cap; } else if (Q < -cap) { tbp = dth + cap / kb; Q = -cap; }
          Q += KC.s0.x * kb * thd;
          F[3] -= Q * g2; F[2] -= Q * g1; F[0] += Q * (g1 + g2);
          let Ge = Q * dAe(e1, e2); let gP = -(Ge - dot(Ge, EX) * EX) / pl; let dg = dot(t, gP);
          let gD = gP - t * (dg / dd); let gt = -(Dd / dd) * gP - (dg / dd) * D + (2.0 * Dd * dg / (dd * dd)) * t;
          F[3] -= gt; F[2] += gt; F[5] -= gD; F[7] += gD;
        }
      }
      if (C0 >= 0) {
        let D = 0.5 * (XR(r1) + XR(r2) - XR(l1) - XR(l2));
        let dd = dot(d, d); let Dd = dot(D, d); let P = D - d * (Dd / dd); let pl = length(P);
        if (pl > 0.3 * length(D)) {
          EX = -P / pl;
          let c = xB - XR(C0); let gc = gr(c); let gs = gr(d);
          let gd = dot(gs, VV(b) - VV(a)) - dot(gc, VV(B) - VV(C0));
          let dgm = wrapA(ang(c, d) - t5.x);
          let cap = t4.w * rf; let ks = t4.z; var Q = ks * (dgm - tsp);
          if (Q > cap) { tsp = dgm - cap / ks; Q = cap; } else if (Q < -cap) { tsp = dgm + cap / ks; Q = -cap; }
          Q += KC.s0.x * ks * gd;
          F[1] -= Q * gs; F[0] += Q * gs; F[3] += Q * gc; F[4] -= Q * gc;
          let Ge = Q * dAe(c, d); let gP = -(Ge - dot(Ge, EX) * EX) / pl; let dg = dot(d, gP);
          let gD = gP - d * (dg / dd); let gt = -(Dd / dd) * gP - (dg / dd) * D + (2.0 * Dd * dg / (dd * dd)) * d;
          F[1] -= gt; F[0] += gt; F[5] -= 0.5 * gD; F[6] -= 0.5 * gD; F[7] += 0.5 * gD; F[8] += 0.5 * gD;
        }
      }
    }
    let nx = i32(t5.z); var tbn = 0.0; if (nx >= 0) { tbn = abs(DY[mbB(v) + nx].w); }
    let failed = max(0.0, log(Lp / L0)) + max(abs(st.w), tbn) * t1.z >= t1.y;
    oSt = vec4f(select(Lp, -Lp, failed), tsp, eb, tbp);
    break;
  }
  DY[mbB(w) + k] = oSt;
  SC[O_MF + k] = vec4f(F[0], F[1].x); SC[O_MF + NT + k] = vec4f(F[1].yz, F[2].xy); SC[O_MF + 2 * NT + k] = vec4f(F[2].z, F[3]); SC[O_MF + 3 * NT + k] = vec4f(F[4], F[5].x);
  SC[O_MF + 4 * NT + k] = vec4f(F[5].yz, F[6].xy); SC[O_MF + 5 * NT + k] = vec4f(F[6].z, F[7]); SC[O_MF + 6 * NT + k] = vec4f(F[8], 0.0);
}`;

const GATHER = `
@group(0) @binding(6) var<storage, read_write> HD: array<i32>;
fn ADJ(k: i32) -> i32 { return i32(ST[O_ADJ + (k >> 2u)][k & 3]); }
// the contact push-back on cell c's corners: the nodes that hit it last step (a list), summed in node order
fn contact(c: i32, hp: u32) -> vec3f {
  var js: array<i32, 8>; var n = 0; var j = HD[i32(hp) * NC + c];
  loop { if (j < 0 || n >= 8) { break; } js[n] = j; n++; j = HD[2 * NC + j]; }
  if (n == 0) { return vec3f(0.0); }
  for (var a = 1; a < n; a++) { let x = js[a]; var b = a - 1; loop { if (b < 0 || js[b] <= x) { break; } js[b + 1] = js[b]; b--; } js[b + 1] = x; }
  var f = vec3f(0.0); for (var a = 0; a < n; a++) { f += SC[O_CON + js[a]].yzw; }
  return f * (0.25 / PP.h);
}
@compute @workgroup_size(${WGS}) fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = i32(gid.x); if (i >= N) { return; }
  let w = 1u - PP.par;
  let g0 = ST[O_NS + 5 * i + 3]; let g1 = ST[O_NS + 5 * i + 4];
  var F = vec3f(0.0); var cnt = 0.0;
  let o0 = i32(g0.x); let n0 = i32(g0.y); let o1 = i32(g0.z); let n1 = i32(g0.w); let o2 = i32(g1.x); let n2 = i32(g1.y);
  for (var k = 0; k < n0; k++) {
    let e = ADJ(o0 + k); let c = e / 4; let r = e - 4 * c;
    if (r == 0) { F += SC[O_CF + c].xyz; }
    else if (r == 1) { F += vec3f(SC[O_CF + c].w, SC[O_CF + NC + c].xy); }
    else if (r == 2) { F += vec3f(SC[O_CF + NC + c].zw, SC[O_CF + 2 * NC + c].x); }
    else { F += SC[O_CF + 2 * NC + c].yzw; }
    F += contact(c, w);
    if (CST(c, w).x < 0.5) { cnt += 1.0; } }
  for (var k = 0; k < n1; k++) {
    let e = ADJ(o1 + k); let h = e / 8; let r = e - 8 * h;
    if (r == 0) { F += SC[O_HF + h].xyz; }
    else if (r == 1) { F += vec3f(SC[O_HF + h].w, SC[O_HF + NH + h].xy); }
    else if (r < 4) { F += 0.5 * vec3f(SC[O_HF + NH + h].zw, SC[O_HF + 2 * NH + h].x); }
    else { F += 0.5 * SC[O_HF + 2 * NH + h].yzw; } }
  for (var k = 0; k < n2; k++) {
    let e = ADJ(o2 + k); let t = e / 16; let r = e - 16 * t; let f = 3 * r;
    F += vec3f(SC[O_MF + (f >> 2u) * NT + t][f & 3], SC[O_MF + ((f + 1) >> 2u) * NT + t][(f + 1) & 3], SC[O_MF + ((f + 2) >> 2u) * NT + t][(f + 2) & 3]);
    if (r < 2 && DY[mbB(w) + t].x > 0.0) { cnt += 1.0; } }
  SC[O_FRC + i] = vec4f(F, cnt);
}`;

// after the node pass: each node that hit a cell joins that cell's list (the next step's gather sums the list)
const LINK = (c) => `
struct Pp { t: f32, h: f32, alpha: f32, nimp: u32, par: u32, q0: u32, q1: u32, q2: u32 }
@group(0) @binding(2) var<storage, read_write> SC: array<vec4f>;
@group(0) @binding(4) var<uniform> PP: Pp;
@group(0) @binding(6) var<storage, read_write> HA: array<atomic<i32>>;
${Object.entries(c).map(([k, v]) => `const ${k}: i32 = ${v};`).join('\n')}
@compute @workgroup_size(${WGS}) fn main(@builtin(global_invocation_id) gid: vec3u) {
  let j = i32(gid.x); if (j >= N) { return; }
  let cx = SC[O_CON + j].x; if (cx < 0.0) { return; }
  let old = atomicExchange(&HA[i32(PP.par) * NC + i32(cx)], j);
  atomicStore(&HA[2 * NC + j], old);
}`;
// fragment impulses: one entry per node (summed on the CPU), added to the gathered forces
const IMPULSE = (c) => `
struct Pp { t: f32, h: f32, alpha: f32, nimp: u32, par: u32, q0: u32, q1: u32, q2: u32 }
@group(0) @binding(2) var<storage, read_write> SC: array<vec4f>;
@group(0) @binding(4) var<uniform> PP: Pp;
${Object.entries(c).map(([k, v]) => `const ${k}: i32 = ${v};`).join('\n')}
@compute @workgroup_size(${WGS}) fn main(@builtin(global_invocation_id) gid: vec3u) {
  let k = i32(gid.x); if (u32(k) >= PP.nimp) { return; }
  let e = SC[O_IMP + k]; let j = i32(e.x);
  SC[O_FRC + j] = SC[O_FRC + j] + vec4f(e.yzw / PP.h, 0.0);
}`;
const NODE = `
@compute @workgroup_size(${WGS}) fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = i32(gid.x); if (i >= N) { return; }
  let v = PP.par; let w = 1u - v; let nb = ndB(v); let nw = ndB(w);
  let pos = DY[nb + i]; let vel = DY[nb + N + i]; var anc = DY[nb + 2 * N + i];
  let n0 = ST[O_NS + 5 * i]; let n1 = ST[O_NS + 5 * i + 1]; let n2 = ST[O_NS + 5 * i + 2];
  var oPos = pos; var oVel = vel; var oCon = vec4f(-1.0, 0.0, 0.0, 0.0);
  let uH = PP.h;
  if (n0.x > 0.0) {
    let fr = SC[O_FRC + i];
    var F = fr.xyz; var u = pos.xyz; var vv = vel.xyz;
    var free_ = pos.w;
    if (fr.w < 0.5 && n0.y <= 0.0) { free_ = 1.0; }
    if (n0.y > 0.0) {
      let d = u - anc.xyz; let dl = length(d);
      if (dl > 1e-12) { var f = n0.y * dl; if (f > n0.z) { anc = vec4f(u - d * (n0.z / n0.y / dl), anc.w); f = n0.z; } F -= d / dl * f; }
      F -= n0.w * vv;
    }
    vv = vv + F * (uH * n0.x);
    if (free_ > 0.5) { vv[UPAX] -= KC.s1.w * uH; } else { vv *= 1.0 - PP.alpha * uH; }
    u += vv * uH;
    // contact: the other panels near this node (planar maps); stop against an intact cell, push it back next step
    let x = n1.xyz + u; let r0 = n1.xyz;
    for (var k = 0; k < 4; k++) {
      let pq = i32(n2[k]); if (pq < 0) { break; }
      let pb = O_PAN + 5 * pq;
      let a0 = ST[pb]; let a1 = ST[pb + 1]; let a2 = ST[pb + 2]; let a3 = ST[pb + 3]; let a4 = ST[pb + 4];
      let o = a0.xyz; let U = a1.xyz; let Vv = a2.xyz; let n = a3.xyz;
      let rest = dot(r0 - o, n); let sd = select(-1.0, 1.0, rest > 0.0);
      let dx = x - o; let cur = dot(dx, n); if (cur * sd > 1.5) { continue; }
      let nu = i32(a0.w); let nv = i32(a4.x); let off = i32(a3.w);
      let ci = i32(floor(dot(dx, U) / a1.w * f32(nu))); let cj = i32(floor(dot(dx, Vv) / a2.w * f32(nv)));
      if (ci < 0 || cj < 0 || ci >= nu || cj >= nv) { continue; }
      let c = i32(ST[O_CMAP + off + cj * nu + ci].x);
      if (c < 0) { continue; }
      if (CST(c, w).x > 0.5) { continue; }
      let cc = ST[O_CS + 11 * c];
      var pl = 0.0; var vc = 0.0;
      for (var q = 0; q < 4; q++) { let j = i32(cc[q]); pl += dot(XR(j) - o, n); vc += dot(VV(j), n); }
      pl *= 0.25; vc *= 0.25;
      let gap = (cur - pl) * sd; if (gap > 0.015) { continue; }
      u += n * ((0.015 - gap) * sd);
      let rel = (dot(vv, n) - vc) * sd;
      if (rel < 0.0) { let dv = -rel * sd; vv += n * dv; oCon = vec4f(f32(c), -dv / n0.x * n); }
      break;
    }
    oPos = vec4f(u, free_); oVel = vec4f(vv, 0.0);
  }
  DY[nw + i] = oPos; DY[nw + N + i] = oVel; DY[nw + 2 * N + i] = anc; SC[O_CON + i] = oCon;
}`;

// torn cells packed to one word: flag in the top byte, erosion time (0 .. 1.67 s, 0.1 us steps) below
const PACK = (c) => `
struct Pp { t: f32, h: f32, alpha: f32, nimp: u32, par: u32, q0: u32, q1: u32, q2: u32 }
@group(0) @binding(1) var<storage, read_write> DY: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> SU: array<u32>;
@group(0) @binding(4) var<uniform> PP: Pp;
${Object.entries(c).map(([k, v]) => `const ${k}: i32 = ${v};`).join('\n')}
@compute @workgroup_size(${WGS}) fn main(@builtin(global_invocation_id) gid: vec3u) {
  let c = i32(gid.x); if (c >= NC) { return; }
  let s = DY[O_CL + i32(PP.par) * 5 * NC + 4 * NC + c];
  var o = 0u; if (s.x >= 0.5) { o = (u32(clamp(s.y, 0.0, 1.67) * 1e7) & 0xFFFFFFu) | 0xFF000000u; }
  SU[4 * O_PK + c] = o;
}`;

export function createWGPU(dev, M, opt = {}) {
  const { N, NC, NH, NT } = M;
  const batch = opt.batch || 100; let depth = opt.depth || 3;
  const one = n => Math.max(1, n);
  // local origin: the middle of the model (keeps float32 coordinates small)
  const O = [0, 0, 0]; { const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let i = 0; i < N; i++) for (let q = 0; q < 3; q++) { const v = M.R0[3 * i + q]; if (!Number.isFinite(v)) continue; lo[q] = Math.min(lo[q], v); hi[q] = Math.max(hi[q], v); } for (let q = 0; q < 3; q++) O[q] = (lo[q] + hi[q]) / 2; }
  const R = (i, q) => M.R0[3 * i + q] - O[q];
  // ---- statics (vec4 records, as the WebGL textures, linear)
  const adjL = [Array.from({ length: N }, () => []), Array.from({ length: N }, () => []), Array.from({ length: N }, () => [])];
  for (let c = 0; c < NC; c++) for (let k = 0; k < 4; k++) adjL[0][M.CN[4 * c + k]].push(c * 4 + k);
  for (let h = 0; h < NH; h++) for (let k = 0; k < 6; k++) adjL[1][M.HN[6 * h + k]].push(h * 8 + k);
  for (let t = 0; t < NT; t++) { adjL[2][M.TA[t]].push(t * 16); adjL[2][M.TB[t]].push(t * 16 + 1);
    if (M.TBA[t] >= 0) adjL[2][M.TBA[t]].push(t * 16 + 2); if (M.TBB[t] >= 0) adjL[2][M.TBB[t]].push(t * 16 + 3); if (M.TSC[t] >= 0) adjL[2][M.TSC[t]].push(t * 16 + 4);
    if (M.TCL[t] >= 0 && (M.TBA[t] >= 0 || M.TSC[t] >= 0)) for (let z = 0; z < 4; z++) adjL[2][M.TQN[4 * t + z]].push(t * 16 + 5 + z); }
  const adjOff = [new Int32Array(N), new Int32Array(N), new Int32Array(N)], flat = [];
  for (let q = 0; q < 3; q++) for (let i = 0; i < N; i++) { adjOff[q][i] = flat.length; for (const e of adjL[q][i]) flat.push(e); }
  const NP = Math.max(1, M.PAN.length), NCM = M.CMAP.length, NADJ = Math.ceil(flat.length / 4);
  const L = {}; let off = 0; const at = (k, n) => { L[k] = off; off += one(n); };
  at('O_NS', 5 * N); at('O_CS', 11 * NC); at('O_HS', 9 * NH); at('O_TS', 7 * NT); at('O_PAN', 5 * NP); at('O_CMAP', NCM); at('O_ADJ', NADJ); at('O_AUX', 2048);
  const nST = off;
  off = 0; at('O_ND', 6 * N); at('O_CL', 10 * NC); at('O_HT', 2 * NH); at('O_MB', 2 * NT); const nDY = off;
  const MAXIMP = N + 4096;
  off = 0; at('O_CON', N); at('O_FRC', N); at('O_CF', 3 * NC); at('O_HF', 3 * NH); at('O_MF', 7 * NT); at('O_DMG', NC); at('O_IMP', MAXIMP); at('O_PK', Math.ceil(NC / 4) + 1); const nSC = off;
  const CONST = { N, NC, NH, NT, OUT: M.OUT(), UPAX: M.UP === undefined ? 1 : M.UP, ...L };
  const stat = new Float32Array(4 * nST);
  const put = (base, i, T, t, v) => stat.set(v, 4 * (base + i * T + t));
  for (let i = 0; i < N; i++) { const p = (t, v) => put(L.O_NS, i, 5, t, v);
    p(0, [M.WINV[i], M.AK[i], M.AF[i], M.AC[i]]); p(1, [R(i, 0), R(i, 1), R(i, 2), 0]); p(2, [0, 1, 2, 3].map(k => M.NCC[4 * i + k]));
    p(3, [adjOff[0][i], adjL[0][i].length, adjOff[1][i], adjL[1][i].length]); p(4, [adjOff[2][i], adjL[2][i].length, 0, 0]); }
  const fillCS = () => { for (let c = 0; c < NC; c++) { const p = (t, v) => put(L.O_CS, c, 11, t, v);
    const q = [0, 1, 2, 3].map(k => M.CN[4 * c + k]), rv = k => [0, 1, 2].map(z => M.R0[3 * q[k] + z] - M.R0[3 * q[0] + z]);
    p(0, q); p(1, [...rv(1), M.CH[c]]); p(2, [...rv(2), M.CMAT[c]]); p(3, [...rv(3), M.CEF[c]]);
    const ex = [M.CSP[c], M.CSN[c], M.CWET[c], M.CAR[c]];
    for (let t = 0; t < 4; t++) p(4 + t, [M.CTR[12 * c + 3 * t], M.CTR[12 * c + 3 * t + 1], M.CTR[12 * c + 3 * t + 2], ex[t]]);
    p(8, [0, 1, 2, 3].map(k => M.CHG[4 * c + k])); p(9, [M.CRC[3 * c] - O[0], M.CRC[3 * c + 1] - O[1], M.CRC[3 * c + 2] - O[2], M.CDB[c]]);
    p(10, [M.CVIS()[c], M.CKC ? M.CKC[c] : 1, M.KCE || 0, M.JMN === undefined ? .25 : M.JMN]); } };
  fillCS();
  for (let k = 0; k < NH; k++) { const p = (t, v) => put(L.O_HS, k, 9, t, v);
    const rv = z => [0, 1, 2].map(q => M.R0[3 * M.HN[6 * k + z] + q] - M.R0[3 * M.HN[6 * k] + q]);
    const mid = (a, b) => [0, 1, 2].map(q => .5 * (rv(a)[q] + rv(b)[q])), E = rv(1), f1 = mid(2, 3), f2 = mid(4, 5);
    p(5, [E[0], E[1], E[2], f1[0]]); p(6, [f1[1], f1[2], f2[0], f2[1]]); p(7, [f2[2], 0, 0, 0]); p(0, [0, 1, 2, 3].map(z => M.HN[6 * k + z])); p(1, [M.HN[6 * k + 4], M.HN[6 * k + 5], M.HC[2 * k], M.HC[2 * k + 1]]);
    p(2, [M.HKP[k], M.HMP[k], M.HKS[k], M.HMS[k]]); p(3, [M.HTR[2 * k], M.HTR[2 * k + 1], M.HDB[k], M.HHP[k]]); p(4, [M.HMAT[k], M.HT0[k], M.HLN[k], 0]);
    p(8, [M.HTL0[k], M.HTR[2 * k] >= 0 ? M.TFIB[M.HTR[2 * k]] : 0, 0, 0]); }
  for (let k = 0; k < NT; k++) { const p = (t, v) => put(L.O_TS, k, 7, t, v), a = M.TA[k], b = M.TB[k];
    p(0, [a, b, M.TL0[k], M.TAR[k]]); p(1, [M.TMAT[k], M.TEF[k], M.TFIB[k], M.TCL[k]]);
    p(2, [M.TBA[k], M.TBB[k], M.TKB[k], M.TQB[k]]); p(3, [...[0, 1, 2].map(z => M.R0[3 * b + z] - M.R0[3 * a + z]), M.TB0[k]]);
    p(4, [M.TSC[k], M.TPRV[k], M.TKS[k], M.TQS[k]]); p(5, [M.TS0[k], M.TCL2[k], M.TNXT[k], M.TKC ? M.TKC[k] : 1]); p(6, [0, 1, 2, 3].map(z => M.TQN[4 * k + z])); }
  M.PAN.forEach((P, q) => stat.set([P.o[0] - O[0], P.o[1] - O[1], P.o[2] - O[2], P.nu, ...P.U, P.Lu, ...P.V, P.Lv, ...P.n, P.off, P.nv, 0, 0, 0], 4 * (L.O_PAN + 5 * q)));
  for (let k = 0; k < NCM; k++) stat[4 * (L.O_CMAP + k)] = M.CMAP[k];
  stat.set(flat, 4 * L.O_ADJ);
  for (let k = 0; k < 2048; k++) stat[4 * (L.O_AUX + k)] = M.TA1[k];
  // ---- buffers
  const U = GPUBufferUsage, bufs = [];
  const mk = (size, usage) => { const b = dev.createBuffer({ size: Math.ceil(size / 16) * 16, usage }); bufs.push(b); return b; };
  const bST = mk(16 * nST, U.STORAGE | U.COPY_DST), bDY = mk(16 * nDY, U.STORAGE | U.COPY_DST | U.COPY_SRC), bSC = mk(16 * nSC, U.STORAGE | U.COPY_DST | U.COPY_SRC);
  const bK = mk(416, U.UNIFORM | U.COPY_DST), bL = mk(3600, U.UNIFORM | U.COPY_DST);
  const PSTRIDE = 256, MAXSTEPS = 4096, bP = mk(PSTRIDE * (MAXSTEPS + 1), U.UNIFORM | U.COPY_DST);
  const UPSZ = 1 << 24, bUp = mk(UPSZ, U.COPY_SRC | U.COPY_DST);
  const bHD = mk(4 * (2 * NC + N), U.STORAGE | U.COPY_DST);             // contact lists: heads (2 halves) and links
  dev.queue.writeBuffer(bST, 0, stat);
  { const k = new Float32Array(104); M.MATS.forEach((m, i) => { k.set([m.E, m.nu, m.sy, m.H], 4 * i); k.set([m.D, m.q, m.rho, 0], 32 + 4 * i); k.set([m.Du, m.qu, m.eu, 0], 64 + 4 * i); });
    k.set([M.BETA(), M.U_MAX, M.RHO_W * M.C_W, M.P0, M.RHO_W * M.G, M.K_SHEAR, M.S, M.G], 96); dev.queue.writeBuffer(bK, 0, k); }
  // ---- pipelines (one layout for all)
  const bgl = dev.createBindGroupLayout({ entries: [
    { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
    { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
    { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 32 } },
    { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
    { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }] });
  const layout = dev.createPipelineLayout({ bindGroupLayouts: [bgl] });
  const errs = [];
  const pipe = (name, code) => { const m = dev.createShaderModule({ code, label: name });
    m.getCompilationInfo().then(i => { for (const e of i.messages) if (e.type === 'error') { errs.push(name + ': ' + e.lineNum + ': ' + e.message); console.error('WGSL', name, e.lineNum, e.message, code.split('\n')[e.lineNum - 1]); } });
    return dev.createComputePipeline({ layout, compute: { module: m, entryPoint: 'main' }, label: name }); };
  const head = HEAD(CONST) + SCV;
  const pH = pipe('hinges', head + HINGE), pC = pipe('cells', head + CELL), pT = pipe('members', head + TRUSS), pG = pipe('gather', head + GATHER);
  const pK = pipe('link', LINK(CONST)), pI = pipe('impulses', IMPULSE(CONST)), pN = pipe('nodes', head + NODE), pP = pipe('pack', PACK(CONST));
  const bg = dev.createBindGroup({ layout: bgl, entries: [
    { binding: 0, resource: { buffer: bST } }, { binding: 1, resource: { buffer: bDY } }, { binding: 2, resource: { buffer: bSC } },
    { binding: 3, resource: { buffer: bK } }, { binding: 4, resource: { buffer: bP, size: 32 } }, { binding: 5, resource: { buffer: bL } }, { binding: 6, resource: { buffer: bHD } }] });
  const wg = n => Math.ceil(Math.max(1, n) / WGS);
  // ---- encoding state
  let cur = 0, enc = null, pass = null, nsteps = 0, upOff = 0, nimp = 0;
  const par = new ArrayBuffer(PSTRIDE * (MAXSTEPS + 1)), parF = new Float32Array(par), parU = new Uint32Array(par);
  const loads = new Float32Array(900), loadsI = new Int32Array(loads.buffer); let loadsDirty = true;
  let inflight = 0; const waiters = [];
  const begin = () => { if (!enc) { enc = dev.createCommandEncoder(); nsteps = 0; upOff = 0; } };
  const endPass = () => { if (pass) { pass.end(); pass = null; } };
  const upload = (data, dst, dstOff) => {        // data -> dst at this point of the command stream
    const bytes = data.byteLength, sz = Math.ceil(bytes / 16) * 16;
    if (upOff + sz > UPSZ) submit();
    begin(); endPass();
    dev.queue.writeBuffer(bUp, upOff, data.buffer, data.byteOffset, bytes);
    enc.copyBufferToBuffer(bUp, upOff, dst, dstOff, Math.ceil(bytes / 4) * 4); upOff += sz; };
  function steps(n, t, h, alpha) {
    for (let s = 0; s < n; s++, t += h) {
      if (nsteps >= MAXSTEPS) submit();
      begin();
      if (loadsDirty) { upload(loads, bL, 0); loadsDirty = false; }
      if (!pass) pass = enc.beginComputePass();
      const o = nsteps * PSTRIDE / 4; parF[o] = t; parF[o + 1] = h; parF[o + 2] = alpha; parU[o + 3] = nimp; parU[o + 4] = cur;
      pass.setBindGroup(0, bg, [nsteps * PSTRIDE]);
      pass.setPipeline(pH); pass.dispatchWorkgroups(wg(NH));
      pass.setPipeline(pC); pass.dispatchWorkgroups(wg(NC));
      if (NT) { pass.setPipeline(pT); pass.dispatchWorkgroups(wg(NT)); }
      pass.setPipeline(pG); pass.dispatchWorkgroups(wg(N));
      if (nimp) { pass.setPipeline(pI); pass.dispatchWorkgroups(wg(nimp)); }
      pass.setPipeline(pN); pass.dispatchWorkgroups(wg(N));
      pass.setPipeline(pK); pass.dispatchWorkgroups(wg(N));
      nimp = 0; cur = 1 - cur; nsteps++;
      if (nsteps >= batch) submit();
    }
  }
  const step = (t, h, alpha) => steps(1, t, h, alpha);
  // ---- read backs: node u+v (current half) and packed torn cells, one set in flight at a time
  const nodeBytes = 32 * N, pkBytes = 4 * NC;
  const stN = dev.createBuffer({ size: Math.ceil(nodeBytes / 16) * 16, usage: U.MAP_READ | U.COPY_DST }), stC = dev.createBuffer({ size: Math.ceil(pkBytes / 16) * 16 + 16, usage: U.MAP_READ | U.COPY_DST });
  bufs.push(stN, stC);
  let reading = false, readSeq = 0, doneSeq = 0, nodeSeq = 0, cellSeq = 0, readWait = null;
  const lastN = new Float32Array(8 * N), lastPK = new Uint32Array(NC), rbC = new Float32Array(4 * NC);
  function addRead() {                                // encode the copies at the end of the current command buffer
    const o = nsteps * PSTRIDE / 4; parU[o + 4] = cur;   // the pack pass reads the current half
    if (!pass) pass = enc.beginComputePass();
    pass.setBindGroup(0, bg, [nsteps * PSTRIDE]); pass.setPipeline(pP); pass.dispatchWorkgroups(wg(NC)); endPass();
    enc.copyBufferToBuffer(bDY, 16 * (L.O_ND + cur * 3 * N), stN, 0, nodeBytes);
    enc.copyBufferToBuffer(bSC, 16 * L.O_PK, stC, 0, pkBytes);
    return true;
  }
  function submit(forceRead) {
    if (!enc) { if (!forceRead) return null; begin(); }
    const wantRead = !reading;
    if (wantRead) addRead();
    endPass();
    if (nsteps || wantRead) dev.queue.writeBuffer(bP, 0, par, 0, PSTRIDE * (nsteps + 1));
    dev.queue.submit([enc.finish()]); enc = null; pass = null; mapTagged();
    inflight++; dev.queue.onSubmittedWorkDone().then(() => { inflight--; while (waiters.length && inflight < depth) waiters.shift()(); });
    if (wantRead) {
      reading = true; const seq = ++readSeq;
      readWait = Promise.all([stN.mapAsync(GPUMapMode.READ), stC.mapAsync(GPUMapMode.READ)]).then(() => {
        lastN.set(new Float32Array(stN.getMappedRange(), 0, 8 * N)); lastPK.set(new Uint32Array(stC.getMappedRange(), 0, NC));
        stN.unmap(); stC.unmap(); reading = false; doneSeq = seq; return seq; });
      return readWait;
    }
    return null;
  }
  // at most `depth` command buffers queued: resolve when there is room
  const pace = () => inflight < depth ? Promise.resolve() : new Promise(r => waiters.push(r));
  const busy = () => inflight >= depth;
  async function flush() {                           // everything submitted, then a fresh read back of the final state
    if (reading) await readWait;
    const p = submit(true); if (p) await p;
  }
  function fillNodes(withVel, X, V, FREE) {
    for (let i = 0; i < N; i++) { X[3 * i] = M.R0[3 * i] + lastN[4 * i]; X[3 * i + 1] = M.R0[3 * i + 1] + lastN[4 * i + 1]; X[3 * i + 2] = M.R0[3 * i + 2] + lastN[4 * i + 2]; FREE[i] = lastN[4 * i + 3] > .5 ? 1 : 0; }
    if (withVel) { const b = 4 * N; for (let i = 0; i < N; i++) { V[3 * i] = lastN[b + 4 * i]; V[3 * i + 1] = lastN[b + 4 * i + 1]; V[3 * i + 2] = lastN[b + 4 * i + 2]; } }
  }
  const decode = () => { for (let c = 0; c < NC; c++) { const v = lastPK[c], o = 4 * c; if (v >>> 24) { rbC[o] = 1; rbC[o + 1] = (v & 0xFFFFFF) * 1e-7; } else { rbC[o] = 0; rbC[o + 1] = -1; } } return rbC; };
  function readNodes(withVel, X, V, FREE) { fillNodes(withVel, X, V, FREE); }
  // the latest completed copy, once each (a new one is taken at every submit while none is in flight)
  function readNodesAsync(X, V, FREE) { if (doneSeq === nodeSeq) return false; nodeSeq = doneSeq; fillNodes(true, X, V, FREE); return true; }
  function readCells() { return decode(); }
  function readCellsAsync() { if (doneSeq === cellSeq) return null; cellSeq = doneSeq; return decode(); }
  // end of run: everything the settle needs (plastic strain, damage, member and hinge state) of the current half
  async function readStateAsync(o) {
    await flush();
    const parts = [[16 * (L.O_CL + cur * 5 * NC), 16 * 5 * NC], [16 * (L.O_MB + cur * NT), 16 * one(NT)], [16 * (L.O_HT + cur * NH), 16 * one(NH)]];
    const tot = parts.reduce((a, p) => a + p[1], 0), sb = dev.createBuffer({ size: tot, usage: U.MAP_READ | U.COPY_DST });
    const e = dev.createCommandEncoder(); let q = 0; for (const [s, n] of parts) { e.copyBufferToBuffer(bDY, s, sb, q, n); q += n; }
    dev.queue.submit([e.finish()]); await sb.mapAsync(GPUMapMode.READ);
    const a = new Float32Array(sb.getMappedRange().slice(0)); sb.unmap(); sb.destroy();
    for (let k = 0; k < 4; k++) for (let c = 0; c < NC; c++) for (let z = 0; z < 4; z++) o.CEP[16 * c + 4 * k + z] = a[4 * (k * NC + c) + z];
    for (let c = 0; c < NC; c++) o.CDM[c] = a[4 * (4 * NC + c) + 2];
    const mb = 4 * 5 * NC; for (let k = 0; k < NT; k++) { o.TFL[k] = a[mb + 4 * k] < 0 ? 1 : 0; if (o.TBP) o.TBP[k] = a[mb + 4 * k + 3]; }
    const hb = mb + 4 * one(NT); for (let k = 0; k < NH; k++) { o.HTP[k] = a[hb + 4 * k]; if (o.HTH) o.HTH[k] = a[hb + 4 * k + 1]; if (o.HTPS) o.HTPS[k] = a[hb + 4 * k + 2]; }
    stateCache = o;
  }
  let stateCache = null;
  // tagged read-backs: copies of this step's torn cells / node motion, taken at this point of the command stream and
  // mapped after the submit; the run asks for them a fixed number of steps later (waiting if they aren't mapped yet)
  const tagged = new Map();
  const tagEntry = (key, buf, kind) => { const e = { buf, kind, submitted: false, ready: false, data: null }; e.promise = new Promise(r => { e.resolve = r; }); tagged.set(key, e); };
  function requestCells(tag) {
    begin(); endPass(); const o = nsteps * PSTRIDE / 4; parU[o + 4] = cur;
    pass = enc.beginComputePass(); pass.setBindGroup(0, bg, [nsteps * PSTRIDE]); pass.setPipeline(pP); pass.dispatchWorkgroups(wg(NC)); endPass();
    const b = dev.createBuffer({ size: Math.ceil(pkBytes / 16) * 16, usage: U.MAP_READ | U.COPY_DST });
    enc.copyBufferToBuffer(bSC, 16 * L.O_PK, b, 0, pkBytes); tagEntry('c' + tag, b, 'c');
  }
  function requestNodes(tag) {
    begin(); endPass(); const b = dev.createBuffer({ size: Math.ceil(nodeBytes / 16) * 16, usage: U.MAP_READ | U.COPY_DST });
    enc.copyBufferToBuffer(bDY, 16 * (L.O_ND + cur * 3 * N), b, 0, nodeBytes); tagEntry('n' + tag, b, 'n');
  }
  function mapTagged() { for (const e of tagged.values()) if (!e.submitted) { e.submitted = true;
    e.buf.mapAsync(GPUMapMode.READ).then(() => { const r = e.buf.getMappedRange(); e.data = e.kind === 'c' ? new Uint32Array(r.slice(0, 4 * NC)) : new Float32Array(r.slice(0, nodeBytes)); e.buf.unmap(); e.buf.destroy(); e.ready = true; e.resolve(); }); } }
  const has = (kind, tag) => { const e = tagged.get(kind + tag); return !e || e.ready; };
  const waitFor = (kind, tag) => { const e = tagged.get(kind + tag); if (!e) return Promise.resolve(); if (!e.submitted) submit(); return e.promise; };
  function cellsOf(tag) { const e = tagged.get('c' + tag); if (!e || !e.ready) return null; tagged.delete('c' + tag); lastPK.set(e.data); return decode(); }
  function nodesOf(tag, V, FREE) { const e = tagged.get('n' + tag); if (!e || !e.ready) return false; tagged.delete('n' + tag); const d = e.data, b = 4 * N;
    for (let i = 0; i < N; i++) { FREE[i] = d[4 * i + 3] > .5 ? 1 : 0; V[3 * i] = d[b + 4 * i]; V[3 * i + 1] = d[b + 4 * i + 1]; V[3 * i + 2] = d[b + 4 * i + 2]; } return true; }
  function readState(o) { if (stateCache && stateCache !== o) for (const k in o) if (stateCache[k] && o[k] && o[k] !== stateCache[k]) o[k].set(stateCache[k]); }
  function readCellsFull() { const a = decode(); return a; }
  // ---- initial state (detonation), loads, impulses, damage
  function upload0() {
    if (enc) submit();
    const z = new Float32Array(4 * nDY);
    for (let i = 0; i < N; i++) { /* pos, vel, anchor: zero */ }
    for (let c = 0; c < NC; c++) z[4 * (L.O_CL + cur * 5 * NC + 4 * NC + c) + 1] = -1;
    for (let k = 0; k < NT; k++) z[4 * (L.O_MB + cur * NT + k)] = M.TL0[k];
    dev.queue.writeBuffer(bDY, 0, z);
    const s = new Float32Array(4 * nSC); for (let i = 0; i < N; i++) s[4 * (L.O_CON + i)] = -1;
    dev.queue.writeBuffer(bSC, 0, s);
    dev.queue.writeBuffer(bHD, 0, new Int32Array(2 * NC + N).fill(-1));
    fillCS(); dev.queue.writeBuffer(bST, 16 * L.O_CS, stat, 4 * L.O_CS, 4 * 11 * NC);   // line-of-sight bits are known now
    loadsDirty = true; stateCache = null;
    lastN.fill(0); lastPK.fill(0); nodeSeq = cellSeq = doneSeq;
  }
  function setSources(list) {
    const n = Math.min(32, list.length), b = new Float32Array(6 * 128);
    for (let k = 0; k < n; k++) { const s = list[k], o = 4 * k;
      b.set([s.pos[0] - O[0], s.pos[1] - O[1], s.pos[2] - O[2], s.W], o); b.set([s.Pm, s.t0, s.space, s.kind], 128 + o);
      b.set([...(s.ax || [0, 0, 0]), s.gain], 256 + o); b.set([s.rc, s.vis, s.plane ? 1 : 0, s.tAdd || 0], 384 + o); b.set([s.Wf || 0, s.Pmf || 0, s.Df || 0, 0], 640 + o);
      if (s.plane) b.set([s.plane[0], s.plane[1], s.plane[2], s.plane[3] - (s.plane[0] * O[0] + s.plane[1] * O[1] + s.plane[2] * O[2])], 512 + o); }
    let same = loadsI[896] === n; for (let k = 0; k < 768 && same; k++) if (loads[128 + k] !== b[k]) same = false;
    if (same) return; loads.set(b, 128); loadsI[896] = n; loadsDirty = true;
  }
  function setGas(GP) { for (let k = 0; k < Math.min(128, GP.length); k++) if (loads[k] !== Math.fround(GP[k])) { loads[k] = GP[k]; loadsDirty = true; } }
  function setImpulses(list) {
    const m = new Map(); for (let k = 0; k < list.length; k += 4) { const i = list[k], e = m.get(i) || m.set(i, [0, 0, 0]).get(i); e[0] += list[k + 1]; e[1] += list[k + 2]; e[2] += list[k + 3]; }
    const n = Math.min(MAXIMP, m.size), a = new Float32Array(4 * n); let k = 0;
    for (const [i, e] of m) { if (k >= n) break; a.set([i, e[0], e[1], e[2]], 4 * k++); }
    if (n) { upload(a, bSC, 16 * L.O_IMP); nimp = n; }
  }
  function setDamage(CFD) { const a = new Float32Array(4 * NC); for (let c = 0; c < NC; c++) a[4 * c] = CFD[c]; upload(a, bSC, 16 * L.O_DMG); }
  function dispose() { for (const e of tagged.values()) { try { e.buf.destroy(); } catch (x) {} } tagged.clear(); if (enc) { endPass(); enc = null; } for (const b of bufs) try { b.destroy(); } catch (e) {} bufs.length = 0; }
  return { kind: 'webgpu', step, steps, requestCells, cellsOf, requestNodes, nodesOf, has, waitFor, submit, flush, pace, busy, upload: upload0, setSources, setGas, setImpulses, setDamage, readNodes, readNodesAsync, readCells, readCellsAsync,
    readCellsFull, readState, readStateAsync, dispose, profile: () => ({}), errors: errs, O, batch, setDepth: d => { depth = d; } };
}
