/* The blast bench's structural model on the GPU (WebGL2, RGBA32F), the same physics as the CPU reference in
   blast.js, pass for pass:
     0. clear the node force accumulator; scatter last step's contact push-back into it
     1. hinges   - dihedral bending (plate + stiffeners), elastic-plastic, rate factor, membrane interaction
     2. cells    - 4 crossed CST membranes (corotational, plane-stress J2, hardening, Cowper-Symonds), gas, water,
                   blast sources (air shock, products, holes, images), fracture (GL ductile strain)
     3. trusses  - stiffener axial members, elastic-plastic, failure
     4. gather   - each node sums its elements' forces (adjacency lists); contact push-back is added by a scatter
     5. nodes    - anchors, damping, fragment impulses, symplectic Euler, contact against other panels' cells
   Positions are stored as displacements from the rest shape (float32 absolute coordinates would round the strain),
   element rest vectors are uploaded exactly. */

const VS = `#version 300 es
void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
const HEAD = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D; precision highp sampler2DArray;
const int W = 256;
ivec2 AT(int i) { return ivec2(i % W, i / W); }
ivec2 ATW(int i, int T, int t) { return ivec2((i % W) * T + t, i / W); }
uniform sampler2DArray uNd, uCA; uniform sampler2D uNS;              // displacement + free flag, velocity, node static (winv, anchor; R0; contact panels)
vec3 XR(int i) { return texelFetch(uNS, ATW(i, 5, 1), 0).xyz + texelFetch(uNd, ivec3(AT(i), 0), 0).xyz; }
vec3 UU(int i) { return texelFetch(uNd, ivec3(AT(i), 0), 0).xyz; }
vec3 VV(int i) { return texelFetch(uNd, ivec3(AT(i), 1), 0).xyz; }
vec4 CST(ivec2 q) { return texelFetch(uCA, ivec3(q, 4), 0); }
uniform vec4 uMatA[8], uMatB[8], uMatC[8];      // (E, nu, sy, H), (D, q, rho, -), (D, q at large strain, strain for them, -)
float CSF(int mi, float ed, float ep) { vec4 b = uMatB[mi], c = uMatC[mi]; float f = min(1.0, ep / c.z); return 1.0 + pow(min(ed, 1e4) / mix(b.x, c.x, f), 1.0 / mix(b.y, c.y, f)); }
uniform float uBeta, uT, uH;
`;

const HINGE_FS = HEAD + `
uniform sampler2D uHS, uHSt;
layout(location=0) out vec4 oSt; layout(location=1) out vec4 oF0; layout(location=2) out vec4 oF1; layout(location=3) out vec4 oF2;
void main(){
  ivec2 p = ivec2(gl_FragCoord.xy); int k = p.y * W + p.x;
  vec4 h0 = texelFetch(uHS, ATW(k, 9, 0), 0), h1 = texelFetch(uHS, ATW(k, 9, 1), 0), h2 = texelFetch(uHS, ATW(k, 9, 2), 0),
       h3 = texelFetch(uHS, ATW(k, 9, 3), 0), h4 = texelFetch(uHS, ATW(k, 9, 4), 0);
  vec4 st = texelFetch(uHSt, p, 0);
  oSt = vec4(st.x, 0.0, 0.0, 0.0); oF0 = vec4(0.0); oF1 = vec4(0.0); oF2 = vec4(0.0);
  if (h0.x < 0.0) return;
  int c1 = int(h1.z), c2 = int(h1.w);
  vec4 s1 = CST(AT(c1)), s2 = CST(AT(c2));
  if (s1.x > 0.5 || s2.x > 0.5) return;
  int i3 = int(h0.x), i4 = int(h0.y), a1 = int(h0.z), b1 = int(h0.w), a2 = int(h1.x), b2 = int(h1.y);
  // current vectors from x3 = exact rest vectors + displacement differences (no float32 cancellation)
  vec4 r0 = texelFetch(uHS, ATW(k, 9, 5), 0), r1 = texelFetch(uHS, ATW(k, 9, 6), 0), r2 = texelFetch(uHS, ATW(k, 9, 7), 0), r3 = texelFetch(uHS, ATW(k, 9, 8), 0);
  vec3 d3 = UU(i3);
  vec3 E = r0.xyz + UU(i4) - d3; float lE = length(E); vec3 e = E / lE;
  vec3 p1 = vec3(r0.w, r1.xy) + 0.5 * (UU(a1) + UU(b1)) - d3, p2 = vec3(r1.zw, r2.x) + 0.5 * (UU(a2) + UU(b2)) - d3;
  vec3 N1 = cross(p1, p1 - E), N2 = cross(p2 - E, p2);
  float l1 = dot(N1, N1), l2 = dot(N2, N2);
  if (sqrt(l1) < 0.2 * h3.z * lE || sqrt(l2) < 0.2 * h3.z * lE) return;
  vec3 n1 = N1 * inversesqrt(l1), n2 = N2 * inversesqrt(l2);
  float d = atan(dot(cross(n2, n1), e), dot(n1, n2)) - h4.y; d -= 6.283185307 * floor(d / 6.283185307 + 0.5);
  float s13 = dot(p1 - E, e), s23 = dot(p2 - E, e), s14 = dot(p1, e), s24 = dot(p2, e);
  vec3 u1 = (lE / l1) * N1, u2 = (lE / l2) * N2, u3 = s13 * N1 / l1 + s23 * N2 / l2, u4 = -s14 * N1 / l1 - s24 * N2 / l2;
  vec3 v1 = 0.5 * (VV(a1) + VV(b1)), v2 = 0.5 * (VV(a2) + VV(b2));
  float thd = dot(u1, v1) + dot(u2, v2) + dot(u3, VV(i3)) + dot(u4, VV(i4));
  int mi = int(h4.x); vec4 mB = uMatB[mi];
  float edot = abs(thd) * h3.w / (2.0 * h3.z), rf = CSF(mi, edot, abs(st.x) * h3.w / (2.0 * h3.z));
  float ut = min(1.0, 0.5 * (s1.w + s2.w));
  float kk = h2.x, cap = h2.y * rf * (1.0 - ut * ut);
  float tp = st.x, Mt = kk * (d - tp);
  if (Mt > cap) { tp = d - cap / kk; Mt = cap; } else if (Mt < -cap) { tp = d + cap / kk; Mt = -cap; }
  float Mm = Mt + uBeta * kk * thd;
  oSt = vec4(tp, d, 0.0, 0.0);
  vec3 F3 = -Mm * u3, F4 = -Mm * u4, Fa = -Mm * u1, Fb = -Mm * u2;
  oF0 = vec4(F3, F4.x); oF1 = vec4(F4.yz, Fa.xy); oF2 = vec4(Fa.z, Fb);
}`;

const CELL_FS = HEAD + `
uniform sampler2D uCS, uHSt, uDmg, uAux, uNLH, uNL; uniform float uEr;
uniform vec4 uGP[32];
uniform vec4 uS0[32], uS1[32], uS2[32], uS3[32], uS4[32], uS5[32]; uniform int uNS_;
uniform int uOUT; uniform float uUmax, uRhoWC, uP0, uRhoWg, uKs, uS;
layout(location=0) out vec4 o0; layout(location=1) out vec4 o1; layout(location=2) out vec4 o2; layout(location=3) out vec4 o3;
layout(location=4) out vec4 oC; layout(location=5) out vec4 oF0; layout(location=6) out vec4 oF1; layout(location=7) out vec4 oF2;
float GPa(int s) { return uGP[s >> 2][s & 3]; }
float kPs(float Z) { float a = Z / 4.5, b = Z / 0.048, c = Z / 0.32, d = Z / 1.35; return uP0 * 808.0 * (1.0 + a * a) / sqrt((1.0 + b * b) * (1.0 + c * c) * (1.0 + d * d)); }
float kIs(float Z) { return 6.7 * sqrt(1.0 + pow(Z / 0.23, 4.0)) / (Z * Z * pow(1.0 + pow(Z / 1.55, 3.0), 1.0 / 3.0)); }
float refl(float Ps) { return 2.0 * Ps * (7.0 * uP0 + 4.0 * Ps) / (7.0 * uP0 + Ps); }
float arr1(float Z) { float k = min(2046.0, Z / 0.02); int i = int(floor(k)); float a = texelFetch(uAux, ivec2(i, 0), 0).x, b = texelFetch(uAux, ivec2(i + 1, 0), 0).x; return a + (b - a) * (k - float(i)); }
float Fp(float x, float tf) { return x <= tf ? 0.0 : 1.0 - pow(tf / x, 4.0); }
// J2 plane-stress return map; s in/out (s11, s22, s12); returns (dgamma, fbar) or (-1) when elastic
vec2 retMap(inout vec3 s, float eb, vec4 mA, float rf) {
  float E = mA.x, nu = mA.y, Gm = E / (2.0 * (1.0 + nu)), c1 = E / (3.0 * (1.0 - nu)), c2 = 2.0 * Gm;
  float s1 = (s.x + s.y) * 0.70710678, s2 = (s.y - s.x) * 0.70710678, s3 = s.z;
  float A1 = s1 * s1 / 3.0, A2 = s2 * s2 + 2.0 * s3 * s3;
  float sY0 = (mA.z + mA.w * eb) * rf;
  if (1.5 * (A1 + A2) <= sY0 * sY0) return vec2(-1.0, sqrt(A1 + A2));
  float g = 0.0;
  for (int it = 0; it < 12; it++) {
    float d1 = 1.0 + c1 * g, d2 = 1.0 + c2 * g, fb2 = A1 / (d1 * d1) + A2 / (d2 * d2), fb = sqrt(fb2);
    float e = eb + 0.81649658 * g * fb, sY = (mA.z + mA.w * e) * rf;
    float phi = 0.5 * fb2 - sY * sY / 3.0;
    float dfb2 = -2.0 * A1 * c1 / (d1 * d1 * d1) - 2.0 * A2 * c2 / (d2 * d2 * d2), dfb = dfb2 / (2.0 * fb);
    float de = 0.81649658 * (fb + g * dfb), dphi = 0.5 * dfb2 - 2.0 / 3.0 * sY * mA.w * rf * de;
    float ng = g - phi / dphi; g = ng > 0.0 ? ng : g * 0.5;
    if (abs(phi) < 1e-10 * sY * sY) break;
  }
  float d1 = 1.0 + c1 * g, d2 = 1.0 + c2 * g, t1 = s1 / d1, t2 = s2 / d2, t3 = s3 / d2;
  s = vec3((t1 - t2) * 0.70710678, (t1 + t2) * 0.70710678, t3);
  return vec2(g, sqrt(t1 * t1 / 3.0 + t2 * t2 + 2.0 * t3 * t3));
}
void main(){
  ivec2 p = ivec2(gl_FragCoord.xy); int c = p.y * W + p.x;
  vec4 T[4]; for (int k = 0; k < 4; k++) T[k] = texelFetch(uCA, ivec3(p, k), 0);
  vec4 cs = CST(p);
  o0 = T[0]; o1 = T[1]; o2 = T[2]; o3 = T[3]; oC = cs; oF0 = vec4(0.0); oF1 = vec4(0.0); oF2 = vec4(0.0);
  vec4 c0 = texelFetch(uCS, ATW(c, 11, 0), 0);
  if (c0.x < 0.0 || cs.x > 0.5) return;
  vec4 r1 = texelFetch(uCS, ATW(c, 11, 1), 0), r2 = texelFetch(uCS, ATW(c, 11, 2), 0), r3 = texelFetch(uCS, ATW(c, 11, 3), 0);
  vec4 tr[4]; tr[0] = texelFetch(uCS, ATW(c, 11, 4), 0); tr[1] = texelFetch(uCS, ATW(c, 11, 5), 0); tr[2] = texelFetch(uCS, ATW(c, 11, 6), 0); tr[3] = texelFetch(uCS, ATW(c, 11, 7), 0);
  vec4 hg = texelFetch(uCS, ATW(c, 11, 8), 0), c9 = texelFetch(uCS, ATW(c, 11, 9), 0), c10 = texelFetch(uCS, ATW(c, 11, 10), 0);
  int q[4]; q[0] = int(c0.x); q[1] = int(c0.y); q[2] = int(c0.z); q[3] = int(c0.w);
  vec3 ua = UU(q[0]);
  vec3 P[4]; P[0] = vec3(0.0); P[1] = r1.xyz + UU(q[1]) - ua; P[2] = r2.xyz + UU(q[2]) - ua; P[3] = r3.xyz + UU(q[3]) - ua;
  vec3 Vn[4]; for (int k = 0; k < 4; k++) Vn[k] = VV(q[k]);
  int mi = int(r2.w); vec4 mA = uMatA[mi], mB = uMatB[mi];
  float hh = 0.5 * r1.w, fd = 1.0 - texelFetch(uDmg, p, 0).x;
  float E = mA.x, nu = mA.y, Ep = E / (1.0 - nu * nu), Gm = E / (2.0 * (1.0 + nu));
  vec3 f[4]; for (int k = 0; k < 4; k++) f[k] = vec3(0.0);
  float util = 0.0, dDam = 0.0, jmin = 9.0;
  ivec3 TRI[4]; TRI[0] = ivec3(0, 1, 2); TRI[1] = ivec3(0, 2, 3); TRI[2] = ivec3(0, 1, 3); TRI[3] = ivec3(1, 2, 3);
  vec4 Tn[4];
  for (int t = 0; t < 4; t++) {
    ivec3 I = TRI[t];
    float L12 = tr[t].x, P3x = tr[t].y, P3y = tr[t].z, A0 = 0.5 * L12 * P3y;
    vec3 a = P[I.y] - P[I.x], b = P[I.z] - P[I.x];
    float l12 = length(a); vec3 e1 = a / l12, n = normalize(cross(a, b)), e2 = cross(n, e1);
    float p3x = dot(b, e1), p3y = dot(b, e2);
    float F11 = l12 / L12, F12 = (p3x - l12 * P3x / L12) / P3y, F22 = max(p3y / P3y, 0.05);
    jmin = min(jmin, F11 * F22);
    float th = atan(-F12, F11 + F22), co = cos(th), si = sin(th);
    float U11 = co * F11, U22 = -si * F12 + co * F22, U12 = 0.5 * ((co * F12 + si * F22) - si * F11);
    vec4 ep = T[t];
    float ee11 = U11 - 1.0 - ep.x, ee22 = U22 - 1.0 - ep.y, ee12 = U12 - ep.z;
    vec3 s = vec3(Ep * (ee11 + nu * ee22), Ep * (ee22 + nu * ee11), 2.0 * Gm * ee12);
    vec3 dv2 = Vn[I.y] - Vn[I.x], dv3 = Vn[I.z] - Vn[I.x];
    float w2x = dot(dv2, e1), w2y = dot(dv2, e2), w3x = dot(dv3, e1), w3y = dot(dv3, e2);
    float Fd11 = w2x / L12, Fd21 = w2y / L12, Fd12 = -w2x * P3x / (L12 * P3y) + w3x / P3y, Fd22 = -w2y * P3x / (L12 * P3y) + w3y / P3y;
    float i11 = 1.0 / F11, i12 = -F12 / (F11 * F22), i22 = 1.0 / F22;
    float D11 = Fd11 * i11, D22 = Fd21 * i12 + Fd22 * i22, D12 = 0.5 * ((Fd11 * i12 + Fd12 * i22) + Fd21 * i11);
    float edot = sqrt(2.0 / 3.0 * (D11 * D11 + D22 * D22 + (D11 + D22) * (D11 + D22) + 2.0 * D12 * D12));
    float vt = sqrt(s.x * s.x + s.y * s.y - s.x * s.y + 3.0 * s.z * s.z), wc = vt > 0.0 ? clamp(-(s.x + s.y) / vt, 0.0, 1.0) : 0.0;
    float rmp = c10.z > 0.0 ? min(1.0, ep.w / c10.z) : 1.0;
    float rf = CSF(mi, edot, ep.w) * (1.0 - (1.0 - c10.y) * wc * rmp);
    vec2 rm = retMap(s, ep.w, mA, rf);
    if (rm.x >= 0.0) {
      float g = rm.x; vec3 de = vec3(g * (2.0 * s.x - s.y) / 3.0, g * (2.0 * s.y - s.x) / 3.0, g * s.z);
      float deb = 0.81649658 * g * rm.y;
      ep = vec4(ep.xyz + de, ep.w + deb);
      float vm0 = sqrt(s.x * s.x + s.y * s.y - s.x * s.y + 3.0 * s.z * s.z);
      if ((s.x + s.y) / (3.0 * vm0 + 1e-9) > -1.0 / 3.0) dDam = max(dDam, deb);
    }
    Tn[t] = ep;
    float vm = sqrt(s.x * s.x + s.y * s.y - s.x * s.y + 3.0 * s.z * s.z);
    util = max(util, vm / ((mA.z + mA.w * ep.w) * rf));
    float Dr11 = co * co * D11 + 2.0 * co * si * D12 + si * si * D22, Dr22 = si * si * D11 - 2.0 * co * si * D12 + co * co * D22, Dr12 = (co * co - si * si) * D12 + co * si * (D22 - D11);
    float S11 = s.x + uBeta * Ep * (Dr11 + nu * Dr22), S22 = s.y + uBeta * Ep * (Dr22 + nu * Dr11), S12 = s.z + uBeta * 2.0 * Gm * Dr12;
    float P11 = co * S11 - si * S12, P12 = co * S12 - si * S22, P21 = si * S11 + co * S12, P22 = si * S12 + co * S22;
    float vol = A0 * hh * fd, k1 = 1.0 / L12, k2 = -P3x / (L12 * P3y), k3 = 1.0 / P3y;
    float f2x = -vol * (P11 * k1 + P12 * k2), f2y = -vol * (P21 * k1 + P22 * k2), f3x = -vol * P12 * k3, f3y = -vol * P22 * k3;
    vec3 g2 = f2x * e1 + f2y * e2, g3 = f3x * e1 + f3y * e2;
    f[I.y] += g2; f[I.z] += g3; f[I.x] -= g2 + g3;
  }
  o0 = Tn[0]; o1 = Tn[1]; o2 = Tn[2]; o3 = Tn[3];
  float Dd = cs.z + dDam;
  // loads
  vec3 xa = texelFetch(uNS, ATW(q[0], 5, 1), 0).xyz + ua;
  vec3 Av = 0.5 * cross(P[2] - P[0], P[3] - P[1]); float A = max(length(Av), 1e-12); vec3 nn = Av / A;
  int sP = int(tr[0].w), sN = int(tr[1].w);
  vec3 L = (GPa(sN) - GPa(sP)) * Av;
  if (tr[2].w >= 0.0) {
    float so = sP == uOUT ? 1.0 : -1.0;
    float vn = dot(0.25 * (Vn[0] + Vn[1] + Vn[2] + Vn[3]), nn) * so;
    float pr = max(uRhoWC * vn, -(uP0 + uRhoWg * tr[2].w));
    L -= pr * A * nn * so;
  }
  vec3 xc = xa + 0.25 * (P[0] + P[1] + P[2] + P[3]);
  int vis = int(c10.x);
  for (int k = 0; k < 32; k++) {
    if (k >= uNS_) break;
    vec4 S0 = uS0[k], S1 = uS1[k], S2 = uS2[k], S3 = uS3[k];
    bool cu = S3.w > 0.0 && S3.w >= uT && S3.w < uT + uH;     // new source: its first step delivers what it owed
    int sp = int(S1.z); float sg;
    if (sN == sp) sg = 1.0; else if (sP == sp) sg = -1.0; else continue;
    int vb = int(S3.y);
    if (vb >= 0 && ((vis >> vb) & 1) == 0) continue;
    if (S3.z > 0.5) { vec4 pl = uS4[k]; if (abs(dot(c9.xyz, pl.xyz) - pl.w) < 0.3 * uS + 0.02) continue; }
    vec3 d = xc - S0.xyz; float R = max(length(d), 1e-6);
    float ca = abs(dot(d, nn)) / R, c2 = ca * ca, co = 1.0;
    int kind = int(S1.w);
    if (kind == 3) {                     // water shock (Cole), wet plating only, cut off by the free surface's relief
      if (tr[2].w < 0.0) continue;
      float Rw = max(R, S3.x), W3 = pow(S0.w, 1.0 / 3.0), Xw = W3 / Rw;
      float Pw = (1.0 + ca) * 52.4e6 * pow(Xw, 1.13), th = 0.084e-3 * W3 * pow(Xw, -0.23), TAw = S1.y + Rw / 1500.0;
      float tc = min((sqrt(Rw * Rw + 4.0 * S2.x * tr[2].w) - Rw) / 1500.0, 10.0 * th);
      float a = cu ? 0.0 : clamp(uT - TAw, 0.0, tc), b = clamp(uT + uH - TAw, 0.0, tc);
      float Iw = Pw * th * (exp(-a / th) - exp(-b / th)) * S2.w;
      if (Iw > 0.0) L += (Iw / uH * A * sg) * nn;
      continue;
    }
    if (kind == 1) { co = dot(d, S2.xyz) / R; if (co < 0.0) continue; co = max(co, 0.02); }
    R = max(R, S3.x);
    float Weq = kind == 1 ? 4.0 * S0.w * co : S0.w;
    float I = 0.0, Iair = 0.0, Pk = 0.0, TA = 0.0;
    if (Weq > 1e-6) {
      float W3 = pow(Weq, 1.0 / 3.0), Z = max(R / W3, 0.053);
      float Ps = kPs(Z), Pr = refl(Ps), is = kIs(Z) * W3, ir = is * pow(Pr / Ps, 0.75);
      Pk = Ps + (Pr - Ps) * c2; Iair = is + (ir - is) * c2; float TD = 2.0 * Iair / Pk; TA = S1.y + W3 * arr1(Z);
      float a = cu ? -1e9 : uT - TA, b = uT - TA + uH;
      if (b > 0.0 && a < TD) { a = max(a, 0.0); b = min(b, TD); I += Pk * ((b - b * b / (2.0 * TD)) - (a - a * a / (2.0 * TD))); }
    }
    vec4 S5 = uS5[k]; float Rd = S5.z + R;
    if (S5.x > 0.0 && Iair > 0.0) {       // capped by the feeding source over the full path (an opening cannot focus)
      float W3 = pow(S5.x, 1.0 / 3.0), Z = max(Rd / W3, 0.053), Ps = kPs(Z), Pr = refl(Ps), is = kIs(Z) * W3, ir = is * pow(Pr / Ps, 0.75);
      float Pd = Ps + (Pr - Ps) * c2, Id = is + (ir - is) * c2;
      if (Id < Iair || Pd < Pk) { I = 0.0; Iair = min(Iair, Id); Pk = min(Pk, Pd); float TD = 2.0 * Iair / Pk;
        float a = cu ? -1e9 : uT - TA, b = uT - TA + uH;
        if (b > 0.0 && a < TD) { a = max(a, 0.0); b = min(b, TD); I += Pk * ((b - b * b / (2.0 * TD)) - (a - a * a / (2.0 * TD))); } }
    }
    if (S1.x > 0.0) {
      float ip = S1.x * (kind == 1 ? co / 3.14159265 : 1.0 / 12.5663706) * c2 / (R * R);
      if (S5.x > 0.0) ip = min(ip, S5.y * c2 / (12.5663706 * Rd * Rd));
      float Ix = max(0.0, ip - Iair), tf = R / uUmax;
      if (Ix > 0.0) I += Ix * (Fp(uT + uH - S1.y, tf) - (cu ? 0.0 : Fp(uT - S1.y, tf)));
    }
    I *= S2.w;
    if (I > 0.0) L += (I / uH * A * sg) * nn;
  }
  L *= 0.25;
  f[0] += L; f[1] += L; f[2] += L; f[3] += L;
  oF0 = vec4(f[0], f[1].x); oF1 = vec4(f[1].yz, f[2].xy); oF2 = vec4(f[2].z, f[3]);
  // fracture
  float eb = 0.0; int H[4]; H[0] = int(hg.x); H[1] = int(hg.y); H[2] = int(hg.z); H[3] = int(hg.w);
  vec4 hs[4];
  for (int k = 0; k < 4; k++) { hs[k] = H[k] >= 0 ? texelFetch(uHSt, AT(H[k]), 0) : vec4(0.0); if (H[k] >= 0) eb = max(eb, abs(hs[k].x) * r1.w / (2.0 * c9.w)); }
  // non-local failure: the ratio averaged over the cell's neighbours (last step's ratios of the intact ones)
  float rat = (Dd + eb) / r3.w; vec4 nh = texelFetch(uNLH, p, 0); int no = int(nh.x), nc = int(nh.y);
  float ws = nh.z, acc = nh.z * rat;
  for (int k = 0; k < 512; k++) { if (k >= nc) break; vec4 e = texelFetch(uNL, AT(no + k), 0); vec4 sj = CST(AT(int(e.x))); if (sj.x < 0.5) { acc += e.y * sj.y; ws += e.y; } }
  float torn = uEr > 0.5 && (acc >= ws || fd <= 0.0 || jmin < c10.w) ? 1.0 : 0.0;
  oC = vec4(torn, torn > 0.5 ? uT : rat, Dd, min(1.0, util));
}`;

const TRUSS_FS = HEAD + `
uniform sampler2D uTS, uCS; uniform sampler2DArray uMA;
// state (Lp, negative once failed; shear set; accumulated strain; bending set); forces on 9 nodes: a, b, A (m back),
// B (m ahead), C0 (chord start), the plating nodes across a and b on either side (the angles' axes run between them)
layout(location=0) out vec4 oSt;
layout(location=1) out vec4 oF0; layout(location=2) out vec4 oF1; layout(location=3) out vec4 oF2; layout(location=4) out vec4 oF3;
layout(location=5) out vec4 oF4; layout(location=6) out vec4 oF5; layout(location=7) out vec4 oF6;
vec3 EX;
// angle from u to v about EX (both projected off EX)
float ang(vec3 u, vec3 v) { u -= dot(u, EX) * EX; v -= dot(v, EX) * EX; return atan(dot(cross(u, v), EX), dot(u, v)); }
vec3 gr(vec3 v) { v -= dot(v, EX) * EX; return cross(EX, v) / max(dot(v, v), 1e-30); }
// d(angle from u to v)/d(axis)
vec3 dAe(vec3 u, vec3 v) { vec3 cx = cross(u, v); float s = dot(EX, cx), ue = dot(u, EX), ve = dot(v, EX), c = dot(u, v) - ue * ve; return (c * cx + s * (ve * u + ue * v)) / max(s * s + c * c, 1e-30); }
void main(){
  ivec2 p = ivec2(gl_FragCoord.xy); int k = p.y * W + p.x;
  vec4 t0 = texelFetch(uTS, ATW(k, 7, 0), 0), t1 = texelFetch(uTS, ATW(k, 7, 1), 0), t2 = texelFetch(uTS, ATW(k, 7, 2), 0), t3 = texelFetch(uTS, ATW(k, 7, 3), 0),
       t4 = texelFetch(uTS, ATW(k, 7, 4), 0), t5 = texelFetch(uTS, ATW(k, 7, 5), 0);
  vec4 st = texelFetch(uMA, ivec3(p, 0), 0);
  oSt = st; oF0 = vec4(0.0); oF1 = vec4(0.0); oF2 = vec4(0.0); oF3 = vec4(0.0); oF4 = vec4(0.0); oF5 = vec4(0.0); oF6 = vec4(0.0);
  if (t0.x < 0.0 || st.x < 0.0) return;
  int a = int(t0.x), b = int(t0.y); float L0 = t0.z, Ar = t0.w;
  vec3 d = t3.xyz + UU(b) - UU(a); float L = length(d); vec3 u = d / L;
  int mi = int(t1.x); vec4 mA = uMatA[mi];
  float vr = dot(VV(b) - VV(a), u), rf = CSF(mi, abs(vr) / L0, st.z);
  float kk = mA.x * Ar / L0, fy = (mA.z + mA.w * st.z) * rf * Ar;
  float Lp = st.x, eb = st.z, fo = kk * (L - Lp);
  if (fo > fy) { float np = L - fy / kk; eb += abs(np - Lp) / L0; Lp = np; fo = fy; }
  else if (fo < -fy * t5.w) { float fc = fy * t5.w, np = L + fc / kk; eb += abs(np - Lp) / L0; Lp = np; fo = -fc; }
  fo += uBeta * kk * vr;
  vec3 F[9]; for (int z = 0; z < 9; z++) F[z] = vec3(0.0);
  F[0] = fo * u; F[1] = -fo * u;
  float tbp = st.w, tsp = st.y;
  int cl = int(t1.w), cl2 = int(t5.y), A = int(t2.x), B = int(t2.y), C0 = int(t4.x);
  if (cl >= 0 && CST(AT(cl)).x < 0.5 && (cl2 < 0 || CST(AT(cl2)).x < 0.5) && (A >= 0 || C0 >= 0)) {
    vec4 t6 = texelFetch(uTS, ATW(k, 7, 6), 0);
    int r1 = int(t6.x), r2 = int(t6.y), l1 = int(t6.z), l2 = int(t6.w);
    vec3 xa = XR(a), xB = B >= 0 ? XR(B) : xa;
    int pv = int(t4.y); bool bOn = pv < 0 || texelFetch(uMA, ivec3(AT(pv), 0), 0).x > 0.0;
    if (A >= 0 && bOn) {
      // bending at a, about the axis across a (between the plating nodes across a), t = B - A
      vec3 xA = XR(A), D = XR(r1) - XR(l1), t = xB - xA;
      float dd = dot(t, t), Dd = dot(D, t); vec3 P = D - t * (Dd / dd); float pl = length(P);
      if (pl > 0.3 * length(D)) {
        EX = -P / pl;
        vec3 e1 = xa - xA, e2 = xB - xa, g1 = gr(e1), g2 = gr(e2);
        float thd = dot(g2, VV(B) - VV(a)) - dot(g1, VV(a) - VV(A));
        float dth = ang(e1, e2) - t3.w; dth -= 6.283185307 * floor(dth / 6.283185307 + 0.5);
        float rfb = CSF(mi, abs(thd) * t1.z, abs(tbp) * t1.z), cap = t2.w * rfb, kb = t2.z;
        float Q = kb * (dth - tbp);
        if (Q > cap) { tbp = dth - cap / kb; Q = cap; } else if (Q < -cap) { tbp = dth + cap / kb; Q = -cap; }
        Q += uBeta * kb * thd;
        F[3] -= Q * g2; F[2] -= Q * g1; F[0] += Q * (g1 + g2);
        vec3 Ge = Q * dAe(e1, e2), gP = -(Ge - dot(Ge, EX) * EX) / pl; float dg = dot(t, gP);
        vec3 gD = gP - t * (dg / dd), gt = -(Dd / dd) * gP - (dg / dd) * D + (2.0 * Dd * dg / (dd * dd)) * t;
        F[3] -= gt; F[2] += gt; F[5] -= gD; F[7] += gD;
      }
    }
    if (C0 >= 0) {
      // shear of a-b, about the axis between the far corners of the cells on either side, t = b - a
      vec3 D = 0.5 * (XR(r1) + XR(r2) - XR(l1) - XR(l2));
      float dd = dot(d, d), Dd = dot(D, d); vec3 P = D - d * (Dd / dd); float pl = length(P);
      if (pl > 0.3 * length(D)) {
        EX = -P / pl;
        vec3 c = xB - XR(C0), gc = gr(c), gs = gr(d);
        float gd = dot(gs, VV(b) - VV(a)) - dot(gc, VV(B) - VV(C0));
        float dgm = ang(c, d) - t5.x; dgm -= 6.283185307 * floor(dgm / 6.283185307 + 0.5);
        float cap = t4.w * rf, ks = t4.z, Q = ks * (dgm - tsp);
        if (Q > cap) { tsp = dgm - cap / ks; Q = cap; } else if (Q < -cap) { tsp = dgm + cap / ks; Q = -cap; }
        Q += uBeta * ks * gd;
        F[1] -= Q * gs; F[0] += Q * gs; F[3] += Q * gc; F[4] -= Q * gc;
        vec3 Ge = Q * dAe(c, d), gP = -(Ge - dot(Ge, EX) * EX) / pl; float dg = dot(d, gP);
        vec3 gD = gP - d * (dg / dd), gt = -(Dd / dd) * gP - (dg / dd) * D + (2.0 * Dd * dg / (dd * dd)) * d;
        F[1] -= gt; F[0] += gt; F[5] -= 0.5 * gD; F[6] -= 0.5 * gD; F[7] += 0.5 * gD; F[8] += 0.5 * gD;
      }
    }
  }
  int nx = int(t5.z); float tbn = nx >= 0 ? abs(texelFetch(uMA, ivec3(AT(nx), 0), 0).w) : 0.0;
  float failed = max(0.0, log(Lp / L0)) + max(abs(st.w), tbn) * t1.z >= t1.y ? 1.0 : 0.0;
  oSt = vec4(failed > 0.5 ? -Lp : Lp, tsp, eb, tbp);
  oF0 = vec4(F[0], F[1].x); oF1 = vec4(F[1].yz, F[2].xy); oF2 = vec4(F[2].z, F[3]); oF3 = vec4(F[4], F[5].x);
  oF4 = vec4(F[5].yz, F[6].xy); oF5 = vec4(F[6].z, F[7]); oF6 = vec4(F[8], 0.0);
}`;

// scatter: one point per (element, node); the fragment adds the force (and an element count in w)
const SCAT_HEAD = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
const int W = 256;
ivec2 AT(int i) { return ivec2(i % W, i / W); }
ivec2 ATW(int i, int T, int t) { return ivec2((i % W) * T + t, i / W); }
uniform int uNH; out vec4 vF;
void put(int node, vec4 f) { vec2 xy = (vec2(AT(node)) + 0.5) / vec2(float(W), float(uNH)); gl_Position = vec4(xy * 2.0 - 1.0, 0.0, 1.0); gl_PointSize = 1.0; vF = f; }
void none() { gl_Position = vec4(-2.0, -2.0, 0.0, 1.0); gl_PointSize = 1.0; vF = vec4(0.0); }
`;
const SCAT_FS = `#version 300 es
precision highp float; in vec4 vF; out vec4 o; void main(){ o = vF; }`;
const SC_CONTACT = SCAT_HEAD + `
uniform sampler2D uCon, uCS; uniform int uN; uniform float uH;
void main(){
  int i = gl_VertexID / 4, k = gl_VertexID - i * 4;
  if (i >= uN) { none(); return; }
  vec4 cn = texelFetch(uCon, AT(i), 0);
  if (cn.x < 0.0) { none(); return; }
  vec4 c0 = texelFetch(uCS, ATW(int(cn.x), 11, 0), 0);
  put(int(c0[k]), vec4(cn.yzw * (0.25 / uH), 0.0));
}`;

// gather: each node sums the forces its elements computed for it (adjacency lists), and counts the intact ones
const GATHER_FS = HEAD + `
uniform sampler2D uAdj; uniform sampler2DArray uCF, uHF, uMF, uMA;
out vec4 o;
int ADJ(int k) { return int(texelFetch(uAdj, AT(k >> 2), 0)[k & 3]); }
void main(){
  ivec2 p = ivec2(gl_FragCoord.xy); int i = p.y * W + p.x;
  vec4 g0 = texelFetch(uNS, ATW(i, 5, 3), 0), g1 = texelFetch(uNS, ATW(i, 5, 4), 0);
  vec3 F = vec3(0.0); float cnt = 0.0;
  int o0 = int(g0.x), n0 = int(g0.y), o1 = int(g0.z), n1 = int(g0.w), o2 = int(g1.x), n2 = int(g1.y);
  for (int k = 0; k < 256; k++) { if (k >= n0) break;
    int e = ADJ(o0 + k), c = e / 4, r = e - 4 * c; ivec2 q = AT(c);
    if (r == 0) F += texelFetch(uCF, ivec3(q, 0), 0).xyz;
    else if (r == 1) { F += vec3(texelFetch(uCF, ivec3(q, 0), 0).w, texelFetch(uCF, ivec3(q, 1), 0).xy); }
    else if (r == 2) { F += vec3(texelFetch(uCF, ivec3(q, 1), 0).zw, texelFetch(uCF, ivec3(q, 2), 0).x); }
    else F += texelFetch(uCF, ivec3(q, 2), 0).yzw;
    if (CST(q).x < 0.5) cnt += 1.0; }
  for (int k = 0; k < 512; k++) { if (k >= n1) break;
    int e = ADJ(o1 + k), h = e / 8, r = e - 8 * h; ivec2 q = AT(h);
    if (r == 0) F += texelFetch(uHF, ivec3(q, 0), 0).xyz;
    else if (r == 1) F += vec3(texelFetch(uHF, ivec3(q, 0), 0).w, texelFetch(uHF, ivec3(q, 1), 0).xy);
    else if (r < 4) F += 0.5 * vec3(texelFetch(uHF, ivec3(q, 1), 0).zw, texelFetch(uHF, ivec3(q, 2), 0).x);
    else F += 0.5 * texelFetch(uHF, ivec3(q, 2), 0).yzw; }
  for (int k = 0; k < 256; k++) { if (k >= n2) break;
    int e = ADJ(o2 + k), t = e / 16, r = e - 16 * t; ivec2 q = AT(t);
    int f = 3 * r; F += vec3(texelFetch(uMF, ivec3(q, f >> 2), 0)[f & 3], texelFetch(uMF, ivec3(q, (f + 1) >> 2), 0)[(f + 1) & 3], texelFetch(uMF, ivec3(q, (f + 2) >> 2), 0)[(f + 2) & 3]);
    if (r < 2 && texelFetch(uMA, ivec3(q, 0), 0).x > 0.0) cnt += 1.0; }
  o = vec4(F, cnt);
}`;

// torn cells packed to bytes for a fast read back: flag in alpha, erosion time (0 .. 1.67 s, 0.1 us steps) in rgb
const PACK_FS = `#version 300 es
precision highp float; precision highp int; precision highp sampler2DArray;
uniform sampler2DArray uCA; out vec4 o;
void main(){ vec4 c = texelFetch(uCA, ivec3(ivec2(gl_FragCoord.xy), 4), 0);
  if (c.x < 0.5) { o = vec4(0.0); return; }
  int q = int(clamp(c.y, 0.0, 1.67) * 1e7);
  o = vec4(float(q & 255), float((q >> 8) & 255), float((q >> 16) & 255), 255.0) / 255.0; }`;

const NODE_FS = HEAD + `
uniform sampler2D uFrc, uImp, uCS, uPan, uCMap;
uniform float uAlpha, uG; uniform int uUseImp;
layout(location=0) out vec4 oPos; layout(location=1) out vec4 oVel; layout(location=2) out vec4 oAnc; layout(location=3) out vec4 oCon;
void main(){
  ivec2 p = ivec2(gl_FragCoord.xy); int i = p.y * W + p.x;
  vec4 pos = texelFetch(uNd, ivec3(p, 0), 0), vel = texelFetch(uNd, ivec3(p, 1), 0), anc = texelFetch(uNd, ivec3(p, 2), 0);
  vec4 n0 = texelFetch(uNS, ATW(i, 5, 0), 0), n1 = texelFetch(uNS, ATW(i, 5, 1), 0), n2 = texelFetch(uNS, ATW(i, 5, 2), 0);
  oPos = pos; oVel = vel; oAnc = anc; oCon = vec4(-1.0, 0.0, 0.0, 0.0);
  if (n0.x <= 0.0) return;
  vec4 fr = texelFetch(uFrc, p, 0);
  vec3 F = fr.xyz, u = pos.xyz, v = vel.xyz;
  float free_ = pos.w;
  if (fr.w < 0.5 && n0.y <= 0.0) free_ = 1.0;
  if (uUseImp == 1) F += texelFetch(uImp, p, 0).xyz / uH;
  if (n0.y > 0.0) {
    vec3 d = u - anc.xyz; float dl = length(d);
    if (dl > 1e-12) { float f = n0.y * dl; if (f > n0.z) { anc.xyz = u - d * (n0.z / n0.y / dl); f = n0.z; } F -= d / dl * f; }
    F -= n0.w * v;
  }
  v = v + F * (uH * n0.x);
  if (free_ > 0.5) v.y -= uG * uH; else v *= 1.0 - uAlpha * uH;
  u += v * uH;
  // contact: the other panels near this node (planar maps); stop against an intact cell, push it back next step
  vec3 x = n1.xyz + u, r0 = n1.xyz;
  for (int k = 0; k < 4; k++) {
    int pq = int(n2[k]); if (pq < 0) break;
    vec4 a0 = texelFetch(uPan, ivec2(5 * pq, 0), 0), a1 = texelFetch(uPan, ivec2(5 * pq + 1, 0), 0), a2 = texelFetch(uPan, ivec2(5 * pq + 2, 0), 0),
         a3 = texelFetch(uPan, ivec2(5 * pq + 3, 0), 0), a4 = texelFetch(uPan, ivec2(5 * pq + 4, 0), 0);
    vec3 o = a0.xyz, U = a1.xyz, Vv = a2.xyz, n = a3.xyz;
    float rest = dot(r0 - o, n), sd = rest > 0.0 ? 1.0 : -1.0;
    vec3 dx = x - o; float cur = dot(dx, n); if (cur * sd > 1.5) continue;
    int nu = int(a0.w), nv = int(a4.x), off = int(a3.w);
    int ci = int(floor(dot(dx, U) / a1.w * float(nu))), cj = int(floor(dot(dx, Vv) / a2.w * float(nv)));
    if (ci < 0 || cj < 0 || ci >= nu || cj >= nv) continue;
    int c = int(texelFetch(uCMap, AT(off + cj * nu + ci), 0).x);
    if (c < 0 || CST(AT(c)).x > 0.5) continue;
    vec4 cc = texelFetch(uCS, ATW(c, 11, 0), 0);
    float pl = 0.0, vc = 0.0;
    for (int q = 0; q < 4; q++) { int j = int(cc[q]); pl += dot(XR(j) - o, n); vc += dot(VV(j), n); }
    pl *= 0.25; vc *= 0.25;
    float gap = (cur - pl) * sd; if (gap > 0.015) continue;
    u += n * ((0.015 - gap) * sd);
    float rel = (dot(v, n) - vc) * sd;
    if (rel < 0.0) { float dv = -rel * sd; v += n * dv; oCon = vec4(float(c), -dv / n0.x * n); }
    break;
  }
  oPos = vec4(u, free_); oVel = vec4(v, 0.0); oAnc = anc;
}`;

export function createGPU(gl, M) {
  if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('EXT_color_buffer_float missing');
  if (!gl.getExtension('EXT_float_blend')) throw new Error('EXT_float_blend missing');
  const objs = [];
  // every texture sits on its own unit for the whole run and every program's samplers point at fixed units (the
  // ping-pong halves have an even and an odd program), so a step is only useProgram / bindFramebuffer / draw
  const U = { ns: 0, cs: 1, hs: 2, ts: 3, aux: 4, dmg: 5, imp: 6, pan: 7, cmap: 8, adj: 9, nd: 10, con: 12, frc: 13, ca: 14, cf: 16, hst: 17, hf: 19, ma: 20, mf: 22, nlh: 23, nl: 24 };
  const SCR = Math.min(31, gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS) - 1);
  if (SCR < 25) throw new Error('too few texture units');
  gl.activeTexture(gl.TEXTURE0 + SCR);
  const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o) + '\n' + s.split('\n').map((l, i) => (i + 1) + ': ' + l).join('\n')); return o; };
  const prog = (vs, fs, units) => { const p = gl.createProgram(), a = sh(gl.VERTEX_SHADER, vs), b = sh(gl.FRAGMENT_SHADER, fs); gl.attachShader(p, a); gl.attachShader(p, b); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); gl.deleteShader(a); gl.deleteShader(b); objs.push(['deleteProgram', p]);
    p.u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); for (let i = 0; i < n; i++) { const u = gl.getActiveUniform(p, i); p.u[u.name.replace('[0]', '')] = gl.getUniformLocation(p, u.name); }
    gl.useProgram(p);
    for (const k in units) if (p.u[k]) gl.uniform1i(p.u[k], units[k]);
    return p; };
  const stat = { uNS: U.ns, uCS: U.cs, uHS: U.hs, uTS: U.ts, uAux: U.aux, uDmg: U.dmg, uImp: U.imp, uPan: U.pan, uCMap: U.cmap, uAdj: U.adj, uCon: U.con, uFrc: U.frc, uCF: U.cf, uHF: U.hf, uMF: U.mf, uNLH: U.nlh, uNL: U.nl };
  const V2 = f => [f(0, 1), f(1, 0)];                                   // (current half, next half)
  const pH = V2((v, w) => prog(VS, HINGE_FS, { ...stat, uNd: U.nd + v, uCA: U.ca + v, uHSt: U.hst + v }));
  const pC = V2((v, w) => prog(VS, CELL_FS, { ...stat, uNd: U.nd + v, uCA: U.ca + v, uHSt: U.hst + w }));
  const pT = V2((v, w) => prog(VS, TRUSS_FS, { ...stat, uNd: U.nd + v, uCA: U.ca + w, uMA: U.ma + v }));
  const pG = V2((v, w) => prog(VS, GATHER_FS, { ...stat, uNd: U.nd + v, uCA: U.ca + w, uMA: U.ma + w }));
  const pN = V2((v, w) => prog(VS, NODE_FS, { ...stat, uNd: U.nd + v, uCA: U.ca + w }));
  const pP = V2(v => prog(VS, PACK_FS, { uCA: U.ca + v }));
  const sK = prog(SC_CONTACT, SCAT_FS, stat);
  const vao = gl.createVertexArray(); objs.push(['deleteVertexArray', vao]);
  const par = tg => { gl.texParameteri(tg, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(tg, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(tg, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(tg, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); };
  const tex = (w, h, data) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); par(gl.TEXTURE_2D);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, data); t.w = w; t.h = h; objs.push(['deleteTexture', t]); return t; };
  const texA = (w, h, n) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D_ARRAY, t); par(gl.TEXTURE_2D_ARRAY);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA32F, w, h, n); t.w = w; t.h = h; t.arr = true; objs.push(['deleteTexture', t]); return t; };
  // an FBO from (texture, layer) pairs
  const fbo = list => { const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    list.forEach(([t, l], i) => t.arr ? gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, t, 0, l) : gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0));
    gl.drawBuffers(list.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('fbo incomplete');
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); f.w = list[0][0].w; f.h = list[0][0].h; objs.push(['deleteFramebuffer', f]); return f; };
  const Ly = (t, n) => Array.from({ length: n }, (_, k) => [t, k]);
  const Wd = 256, rows = n => Math.max(1, Math.ceil(n / Wd));
  const { N, NC, NH, NT } = M;
  const NHr = rows(N), CHr = rows(NC), HHr = rows(NH), THr = rows(NT);
  // local origin: the middle of the model (keeps float32 coordinates small)
  const O = [0, 0, 0]; { const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let i = 0; i < N; i++) for (let q = 0; q < 3; q++) { const v = M.R0[3 * i + q]; if (!Number.isFinite(v)) continue; lo[q] = Math.min(lo[q], v); hi[q] = Math.max(hi[q], v); } for (let q = 0; q < 3; q++) O[q] = (lo[q] + hi[q]) / 2; }
  const wideA = (n, T, f) => { const a = new Float32Array(Wd * T * rows(n) * 4).fill(-1); const o = (i, t) => (((i / Wd | 0) * Wd * T) + (i % Wd) * T + t) * 4;
    for (let i = 0; i < n; i++) f(i, (t, v) => a.set(v, o(i, t))); return a; };
  const wide = (n, T, f) => tex(Wd * T, rows(n), wideA(n, T, f));
  const R = (i, q) => M.R0[3 * i + q] - O[q];
  const T = {};
  // adjacency (CSR): for every node, its (cell, corner), (hinge, role) and (member, role) entries
  const adjL = [Array.from({ length: N }, () => []), Array.from({ length: N }, () => []), Array.from({ length: N }, () => [])];
  for (let c = 0; c < NC; c++) for (let k = 0; k < 4; k++) adjL[0][M.CN[4 * c + k]].push(c * 4 + k);
  for (let h = 0; h < NH; h++) for (let k = 0; k < 6; k++) adjL[1][M.HN[6 * h + k]].push(h * 8 + k);
  for (let t = 0; t < NT; t++) { adjL[2][M.TA[t]].push(t * 16); adjL[2][M.TB[t]].push(t * 16 + 1);
    if (M.TBA[t] >= 0) adjL[2][M.TBA[t]].push(t * 16 + 2); if (M.TBB[t] >= 0) adjL[2][M.TBB[t]].push(t * 16 + 3); if (M.TSC[t] >= 0) adjL[2][M.TSC[t]].push(t * 16 + 4);
    if (M.TCL[t] >= 0 && (M.TBA[t] >= 0 || M.TSC[t] >= 0)) for (let z = 0; z < 4; z++) adjL[2][M.TQN[4 * t + z]].push(t * 16 + 5 + z); }
  const adjOff = [new Int32Array(N), new Int32Array(N), new Int32Array(N)], flat = [];
  for (let q = 0; q < 3; q++) for (let i = 0; i < N; i++) { adjOff[q][i] = flat.length; for (const e of adjL[q][i]) flat.push(e); }
  { const nt = Math.ceil(flat.length / 4), a = new Float32Array(Wd * rows(nt) * 4); a.set(flat); T.adj = tex(Wd, rows(nt), a); }
  T.ns = wide(N, 5, (i, put) => { put(0, [M.WINV[i], M.AK[i], M.AF[i], M.AC[i]]); put(1, [R(i, 0), R(i, 1), R(i, 2), 0]); put(2, [0, 1, 2, 3].map(k => M.NCC[4 * i + k]));
    put(3, [adjOff[0][i], adjL[0][i].length, adjOff[1][i], adjL[1][i].length]); put(4, [adjOff[2][i], adjL[2][i].length, 0, 0]); });
  const csData = () => wideA(NC, 11, (c, put) => {
    const q = [0, 1, 2, 3].map(k => M.CN[4 * c + k]), rv = k => [0, 1, 2].map(z => M.R0[3 * q[k] + z] - M.R0[3 * q[0] + z]);
    put(0, q); put(1, [...rv(1), M.CH[c]]); put(2, [...rv(2), M.CMAT[c]]); put(3, [...rv(3), M.CEF[c]]);
    const ex = [M.CSP[c], M.CSN[c], M.CWET[c], M.CAR[c]];
    for (let t = 0; t < 4; t++) put(4 + t, [M.CTR[12 * c + 3 * t], M.CTR[12 * c + 3 * t + 1], M.CTR[12 * c + 3 * t + 2], ex[t]]);
    put(8, [0, 1, 2, 3].map(k => M.CHG[4 * c + k])); put(9, [M.CRC[3 * c] - O[0], M.CRC[3 * c + 1] - O[1], M.CRC[3 * c + 2] - O[2], M.CDB[c]]);
    put(10, [M.CVIS()[c], M.CKC ? M.CKC[c] : 1, M.KCE || 0, M.JMN === undefined ? .25 : M.JMN]);
  });
  T.cs = tex(Wd * 11, CHr, csData());
  T.hs = wide(NH, 9, (k, put) => { const rv = z => [0, 1, 2].map(q => M.R0[3 * M.HN[6 * k + z] + q] - M.R0[3 * M.HN[6 * k] + q]);
    const mid = (a, b) => [0, 1, 2].map(q => .5 * (rv(a)[q] + rv(b)[q])), E = rv(1), f1 = mid(2, 3), f2 = mid(4, 5);
    put(5, [E[0], E[1], E[2], f1[0]]); put(6, [f1[1], f1[2], f2[0], f2[1]]); put(7, [f2[2], 0, 0, 0]); put(0, [0, 1, 2, 3].map(z => M.HN[6 * k + z])); put(1, [M.HN[6 * k + 4], M.HN[6 * k + 5], M.HC[2 * k], M.HC[2 * k + 1]]);
    put(2, [M.HKP[k], M.HMP[k], M.HKS[k], M.HMS[k]]); put(3, [M.HTR[2 * k], M.HTR[2 * k + 1], M.HDB[k], M.HHP[k]]); put(4, [M.HMAT[k], M.HT0[k], M.HLN[k], 0]);
    put(8, [M.HTL0[k], M.HTR[2 * k] >= 0 ? M.TFIB[M.HTR[2 * k]] : 0, 0, 0]); });
  T.ts = wide(NT, 7, (k, put) => { const a = M.TA[k], b = M.TB[k]; put(0, [a, b, M.TL0[k], M.TAR[k]]); put(1, [M.TMAT[k], M.TEF[k], M.TFIB[k], M.TCL[k]]);
    put(2, [M.TBA[k], M.TBB[k], M.TKB[k], M.TQB[k]]); put(3, [...[0, 1, 2].map(z => M.R0[3 * b + z] - M.R0[3 * a + z]), M.TB0[k]]);
    put(4, [M.TSC[k], M.TPRV[k], M.TKS[k], M.TQS[k]]); put(5, [M.TS0[k], M.TCL2[k], M.TNXT[k], M.TKC ? M.TKC[k] : 1]); put(6, [0, 1, 2, 3].map(z => M.TQN[4 * k + z])); });
  const pan = new Float32Array(5 * Math.max(1, M.PAN.length) * 4);
  M.PAN.forEach((P, q) => pan.set([P.o[0] - O[0], P.o[1] - O[1], P.o[2] - O[2], P.nu, ...P.U, P.Lu, ...P.V, P.Lv, ...P.n, P.off, P.nv, 0, 0, 0], 20 * q));
  T.pan = tex(5 * Math.max(1, M.PAN.length), 1, pan);
  { const n = M.CMAP.length, a = new Float32Array(Wd * rows(n) * 4).fill(-1); for (let k = 0; k < n; k++) a[4 * k] = M.CMAP[k]; T.cmap = tex(Wd, rows(n), a); }
  const aux = new Float32Array(2048 * 4); for (let k = 0; k < 2048; k++) aux[4 * k] = M.TA1[k]; T.aux = tex(2048, 1, aux);
  T.dmg = tex(Wd, CHr, null); T.imp = tex(Wd, NHr, null);
  { const a = new Float32Array(Wd * CHr * 4); if (M.NLH) a.set(M.NLH); else for (let c = 0; c < NC; c++) a[4 * c + 2] = 1; T.nlh = tex(Wd, CHr, a);
    const ne = M.NLE ? M.NLE.length / 2 : 0, b = new Float32Array(Wd * rows(ne) * 4); for (let k = 0; k < ne; k++) { b[4 * k] = M.NLE[2 * k]; b[4 * k + 1] = M.NLE[2 * k + 1]; } T.nl = tex(Wd, rows(ne), b); }
  // dynamic, ping-pong halves: nodes (u, v, anchor), cells (4 triangles' plastic state, cell state), hinges, members (2)
  const nodeA = [texA(Wd, NHr, 3), texA(Wd, NHr, 3)], con = tex(Wd, NHr, null), frc = tex(Wd, NHr, null);
  const cellA = [texA(Wd, CHr, 5), texA(Wd, CHr, 5)], cF = texA(Wd, CHr, 3);
  const hS = [tex(Wd, HHr, null), tex(Wd, HHr, null)], hF = texA(Wd, HHr, 3);
  const memA = [texA(Wd, THr, 1), texA(Wd, THr, 1)], mF = texA(Wd, THr, 7);
  const fNode = nodeA.map(a => fbo([...Ly(a, 3), [con, 0]])), fFrc = fbo([[frc, 0]]);
  const fCell = cellA.map(a => fbo([...Ly(a, 5), ...Ly(cF, 3)])), fHinge = hS.map(s => fbo([[s, 0], ...Ly(hF, 3)])), fTruss = memA.map(a => fbo([[a, 0], ...Ly(mF, 7)]));
  const UNITS = [[U.ns, T.ns], [U.cs, T.cs], [U.hs, T.hs], [U.ts, T.ts], [U.aux, T.aux], [U.dmg, T.dmg], [U.imp, T.imp], [U.pan, T.pan], [U.cmap, T.cmap], [U.adj, T.adj],
    [U.nd, nodeA[0]], [U.nd + 1, nodeA[1]], [U.con, con], [U.frc, frc], [U.ca, cellA[0]], [U.ca + 1, cellA[1]], [U.cf, cF], [U.hst, hS[0]], [U.hst + 1, hS[1]], [U.hf, hF],
    [U.ma, memA[0]], [U.ma + 1, memA[1]], [U.mf, mF], [U.nlh, T.nlh], [U.nl, T.nl]];
  function bindAll() { for (const [u, t] of UNITS) { gl.activeTexture(gl.TEXTURE0 + u); gl.bindTexture(t.arr ? gl.TEXTURE_2D_ARRAY : gl.TEXTURE_2D, t); } gl.activeTexture(gl.TEXTURE0 + SCR); }
  bindAll();
  let cur = 0, useImp = 0;
  const TQ = gl.getExtension('EXT_disjoint_timer_query_webgl2'); let prof = null; const pending = [];
  const tq = name => { if (!prof || !TQ) return; if (prof.q) gl.endQuery(TQ.TIME_ELAPSED_EXT); const q = gl.createQuery(); gl.beginQuery(TQ.TIME_ELAPSED_EXT, q); prof.q = q; pending.push([name, q]); };
  const tqEnd = () => { if (prof && prof.q) { gl.endQuery(TQ.TIME_ELAPSED_EXT); prof.q = null; } };
  const matA = new Float32Array(32), matB = new Float32Array(32), matC = new Float32Array(32);
  M.MATS.forEach((m, i) => { matA.set([m.E, m.nu, m.sy, m.H], 4 * i); matB.set([m.D, m.q, m.rho, 0], 4 * i); matC.set([m.Du, m.qu, m.eu, 0], 4 * i); });
  const SRC = [0, 1, 2, 3, 4, 5].map(() => new Float32Array(128)), SRCn = [0, 1, 2, 3, 4, 5].map(() => new Float32Array(128));
  let nsrc = 0; const gpu4 = new Float32Array(128);
  const dirty = [true, true];                          // the cell programs' load uniforms (sources, gas) need an upload
  // material constants once per program; time and step only when they change
  const common = (p, t, h) => {
    if (!p._const) { if (p.u.uMatA) gl.uniform4fv(p.u.uMatA, matA); if (p.u.uMatB) gl.uniform4fv(p.u.uMatB, matB); if (p.u.uMatC) gl.uniform4fv(p.u.uMatC, matC);
      if (p.u.uBeta) gl.uniform1f(p.u.uBeta, M.BETA()); p._const = true; }
    if (p.u.uT && p._t !== t) { gl.uniform1f(p.u.uT, t); p._t = t; } if (p.u.uH && p._h !== h) { gl.uniform1f(p.u.uH, h); p._h = h; } };

  const sub2 = (t, w, h, a) => { gl.bindTexture(gl.TEXTURE_2D, t); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGBA, gl.FLOAT, a); };
  const subA = (t, l, h, a) => { gl.bindTexture(gl.TEXTURE_2D_ARRAY, t); gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, l, Wd, h, 1, gl.RGBA, gl.FLOAT, a); };
  function upload() { bindAll();
    const z = n => new Float32Array(Wd * rows(n) * 4);
    const zN = z(N); for (let l = 0; l < 3; l++) subA(nodeA[cur], l, NHr, zN);
    { const c = z(N); for (let i = 0; i < N; i++) c[4 * i] = -1; sub2(con, Wd, NHr, c); }
    const zC = z(NC); for (let l = 0; l < 4; l++) subA(cellA[cur], l, CHr, zC); sub2(T.dmg, Wd, CHr, zC);
    subA(cellA[cur], 4, CHr, zC);   // state: intact, failure ratio 0
    sub2(hS[cur], Wd, HHr, z(NH));
    { const c = z(NT); for (let k = 0; k < NT; k++) c[4 * k] = M.TL0[k]; subA(memA[cur], 0, THr, c); }
    // line-of-sight bits are known now (detonation): refresh the cell statics
    sub2(T.cs, Wd * 11, CHr, csData());
    dirty[0] = dirty[1] = true;
  }
  function setSources(list) {
    const n = Math.min(32, list.length); for (const a of SRCn) a.fill(0);
    const [S0, S1, S2, S3, S4, S5] = SRCn;
    for (let k = 0; k < n; k++) { const s = list[k];
      S0.set([s.pos[0] - O[0], s.pos[1] - O[1], s.pos[2] - O[2], s.W], 4 * k); S1.set([s.Pm, s.t0, s.space, s.kind], 4 * k);
      S2.set([...(s.ax || [0, 0, 0]), s.gain], 4 * k); S3.set([s.rc, s.vis, s.plane ? 1 : 0, s.tAdd || 0], 4 * k); S5.set([s.Wf || 0, s.Pmf || 0, s.Df || 0, 0], 4 * k);
      if (s.plane) S4.set([s.plane[0], s.plane[1], s.plane[2], s.plane[3] - (s.plane[0] * O[0] + s.plane[1] * O[1] + s.plane[2] * O[2])], 4 * k); }
    let same = n === nsrc; for (let q = 0; q < 6 && same; q++) for (let k = 0; k < 4 * n; k++) if (SRC[q][k] !== SRCn[q][k]) { same = false; break; }
    if (same) return;
    nsrc = n; for (let q = 0; q < 6; q++) SRC[q].set(SRCn[q]); dirty[0] = dirty[1] = true;
  }
  function setGas(GP) { let ch = false; for (let k = 0; k < Math.min(128, GP.length); k++) if (gpu4[k] !== Math.fround(GP[k])) { gpu4[k] = GP[k]; ch = true; } if (ch) dirty[0] = dirty[1] = true; }
  function setImpulses(list) {
    const a = new Float32Array(Wd * NHr * 4);
    for (let k = 0; k < list.length; k += 4) { const i = list[k]; a[4 * i] += list[k + 1]; a[4 * i + 1] += list[k + 2]; a[4 * i + 2] += list[k + 3]; }
    sub2(T.imp, Wd, NHr, a); useImp = 1;
  }
  function setDamage(CFD) { const a = new Float32Array(Wd * CHr * 4); for (let c = 0; c < NC; c++) a[4 * c] = CFD[c]; sub2(T.dmg, Wd, CHr, a); }

  let vpH = -1;
  const pass = (p, f) => { gl.useProgram(p); gl.bindFramebuffer(gl.FRAMEBUFFER, f); if (vpH !== f.h) { gl.viewport(0, 0, Wd, f.h); vpH = f.h; } };
  // n steps of h from t; the GL state other code may have changed is set once per call
  function steps(n, t, h, alpha, er = true) {
    gl.bindVertexArray(vao); gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); vpH = -1;
    for (let s = 0; s < n; s++, t += h) {
      const v = cur, w = 1 - cur;
      // 1. hinges
      tq('hinges'); let p = pH[v]; pass(p, fHinge[w]); common(p, t, h); gl.drawArrays(gl.TRIANGLES, 0, 3);
      // 2. cells
      tq('cells'); p = pC[v]; pass(p, fCell[w]); common(p, t, h);
      if (dirty[v]) { const u = p.u; gl.uniform4fv(u.uGP, gpu4); gl.uniform4fv(u.uS0, SRC[0]); gl.uniform4fv(u.uS1, SRC[1]); gl.uniform4fv(u.uS2, SRC[2]); gl.uniform4fv(u.uS3, SRC[3]);
        gl.uniform4fv(u.uS4, SRC[4]); gl.uniform4fv(u.uS5, SRC[5]); gl.uniform1i(u.uNS_, nsrc); dirty[v] = false; }
      if (p._er !== er) { gl.uniform1f(p.u.uEr, er ? 1 : 0); p._er = er; }
      if (!p._c2) { gl.uniform1i(p.u.uOUT, M.OUT()); gl.uniform1f(p.u.uUmax, M.U_MAX); gl.uniform1f(p.u.uRhoWC, M.RHO_W * M.C_W);
        gl.uniform1f(p.u.uP0, M.P0); gl.uniform1f(p.u.uRhoWg, M.RHO_W * M.G); if (p.u.uKs) gl.uniform1f(p.u.uKs, M.K_SHEAR); gl.uniform1f(p.u.uS, M.S); p._c2 = true; }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // 3. members
      tq('members');
      if (NT) { p = pT[v]; pass(p, fTruss[w]); common(p, t, h); gl.drawArrays(gl.TRIANGLES, 0, 3); }
      // 4. gather the element forces at the nodes; add last step's contact push-back
      tq('gather'); pass(pG[v], fFrc); gl.drawArrays(gl.TRIANGLES, 0, 3);
      tq('contact');
      gl.enable(gl.BLEND); gl.useProgram(sK);
      if (!sK._c) { gl.uniform1i(sK.u.uN, N); gl.uniform1i(sK.u.uNH, NHr); sK._c = true; } if (sK._h !== h) { gl.uniform1f(sK.u.uH, h); sK._h = h; }
      gl.drawArrays(gl.POINTS, 0, 4 * N);
      gl.disable(gl.BLEND);
      // 5. nodes
      tq('nodes'); p = pN[v]; pass(p, fNode[w]); common(p, t, h);
      if (p._a !== alpha) { gl.uniform1f(p.u.uAlpha, alpha); p._a = alpha; } if (!p._g) { gl.uniform1f(p.u.uG, M.G); p._g = true; } if (p._i !== useImp) { gl.uniform1i(p.u.uUseImp, useImp); p._i = useImp; }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      useImp = 0; tqEnd();
      cur = w;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  const step = (t, h, alpha, er = true) => steps(1, t, h, alpha, er);
  function profile(on) { if (on) { prof = { q: null }; pending.length = 0; return; }
    const out = {}; for (const [n, q] of pending) { if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) out[n] = (out[n] || 0) + gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6; gl.deleteQuery(q); }
    pending.length = 0; prof = null; return out; }
  // read back
  const rb = new Float32Array(Wd * NHr * 4), rbC = new Float32Array(Wd * CHr * 4);
  const read = (f, i, w, h, out) => { gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.readBuffer(gl.COLOR_ATTACHMENT0 + i); gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, out); gl.bindFramebuffer(gl.FRAMEBUFFER, null); return out; };
  function readNodes(withVel, X, V, FREE) {
    read(fNode[cur], 0, Wd, NHr, rb);
    for (let i = 0; i < N; i++) { X[3 * i] = M.R0[3 * i] + rb[4 * i]; X[3 * i + 1] = M.R0[3 * i + 1] + rb[4 * i + 1]; X[3 * i + 2] = M.R0[3 * i + 2] + rb[4 * i + 2]; FREE[i] = rb[4 * i + 3] > .5 ? 1 : 0; }
    if (withVel) { read(fNode[cur], 1, Wd, NHr, rb); for (let i = 0; i < N; i++) { V[3 * i] = rb[4 * i]; V[3 * i + 1] = rb[4 * i + 1]; V[3 * i + 2] = rb[4 * i + 2]; } }
  }
  // a byte texture for the torn-cell read back
  const t8 = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t8); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, Wd, CHr); objs.push(['deleteTexture', t8]);
  const f8 = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f8); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t8, 0); gl.bindFramebuffer(gl.FRAMEBUFFER, null); objs.push(['deleteFramebuffer', f8]);
  const rb8 = new Uint8Array(Wd * CHr * 4);
  const pack = () => { gl.bindVertexArray(vao); gl.disable(gl.BLEND); gl.useProgram(pP[cur]); gl.bindFramebuffer(gl.FRAMEBUFFER, f8); gl.viewport(0, 0, Wd, CHr); gl.drawArrays(gl.TRIANGLES, 0, 3); };
  const unpack = () => { for (let c = 0; c < NC; c++) { const o = 4 * c; if (rb8[o + 3]) { rbC[o] = 1; rbC[o + 1] = (rb8[o] | (rb8[o + 1] << 8) | (rb8[o + 2] << 16)) * 1e-7; } else { rbC[o] = 0; rbC[o + 1] = -1; } } return rbC; };
  function readCells() {                                  // -> rbC as (torn, time) per cell, like the float state
    pack(); gl.readPixels(0, 0, Wd, CHr, gl.RGBA, gl.UNSIGNED_BYTE, rb8); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return unpack();
  }
  function readCellsFull() { return read(fCell[cur], 4, Wd, CHr, rbC); }
  // the same bytes through a pixel buffer and a fence (never stalls; the data is one request old)
  const pbo = gl.createBuffer(); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo); gl.bufferData(gl.PIXEL_PACK_BUFFER, Wd * CHr * 4, gl.STREAM_READ); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
  objs.push(['deleteBuffer', pbo]);
  let fence = null;
  function readCellsAsync() {
    let out = null;
    if (fence) {
      const r = gl.clientWaitSync(fence, 0, 0);
      if (r === gl.TIMEOUT_EXPIRED) return null;
      gl.deleteSync(fence); fence = null;
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo); gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, rb8); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null); out = unpack();
    }
    pack(); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo); gl.readPixels(0, 0, Wd, CHr, gl.RGBA, gl.UNSIGNED_BYTE, 0); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); gl.flush();
    return out;
  }
  // velocities (and positions) without stalling: the previous request's data if its fence has passed
  const pboN = gl.createBuffer(); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pboN); gl.bufferData(gl.PIXEL_PACK_BUFFER, Wd * NHr * 32, gl.STREAM_READ); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
  objs.push(['deleteBuffer', pboN]);
  let fenceN = null;
  function readNodesAsync(X, V, FREE) {
    let got = false;
    if (fenceN) {
      if (gl.clientWaitSync(fenceN, 0, 0) === gl.TIMEOUT_EXPIRED) return false;
      gl.deleteSync(fenceN); fenceN = null;
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pboN); gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, rb);
      for (let i = 0; i < N; i++) { X[3 * i] = M.R0[3 * i] + rb[4 * i]; X[3 * i + 1] = M.R0[3 * i + 1] + rb[4 * i + 1]; X[3 * i + 2] = M.R0[3 * i + 2] + rb[4 * i + 2]; FREE[i] = rb[4 * i + 3] > .5 ? 1 : 0; }
      gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, Wd * NHr * 16, rb);
      for (let i = 0; i < N; i++) { V[3 * i] = rb[4 * i]; V[3 * i + 1] = rb[4 * i + 1]; V[3 * i + 2] = rb[4 * i + 2]; }
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null); got = true;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, fNode[cur]); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pboN);
    gl.readBuffer(gl.COLOR_ATTACHMENT0); gl.readPixels(0, 0, Wd, NHr, gl.RGBA, gl.FLOAT, 0);
    gl.readBuffer(gl.COLOR_ATTACHMENT1); gl.readPixels(0, 0, Wd, NHr, gl.RGBA, gl.FLOAT, Wd * NHr * 16);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    fenceN = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); gl.flush();
    return got;
  }
  // tagged read-backs: a copy of this step's torn cells / node motion into a pixel buffer now, read when asked for
  // (blocking if the GPU hasn't got there yet), so the run uses them at a fixed step whatever the timing
  const tagged = new Map();
  function requestCells(tag) {
    pack(); const b = gl.createBuffer(); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, b); gl.bufferData(gl.PIXEL_PACK_BUFFER, Wd * CHr * 4, gl.STREAM_READ);
    gl.readPixels(0, 0, Wd, CHr, gl.RGBA, gl.UNSIGNED_BYTE, 0); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    tagged.set('c' + tag, { b, f: gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) }); gl.flush();
  }
  function cellsOf(tag) { const e = tagged.get('c' + tag); if (!e) return null; tagged.delete('c' + tag);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, e.b); gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, rb8); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null); gl.deleteBuffer(e.b); gl.deleteSync(e.f);
    return unpack(); }
  function requestNodes(tag) {
    const b = gl.createBuffer(); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, b); gl.bufferData(gl.PIXEL_PACK_BUFFER, Wd * NHr * 32, gl.STREAM_READ);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fNode[cur]); gl.readBuffer(gl.COLOR_ATTACHMENT0); gl.readPixels(0, 0, Wd, NHr, gl.RGBA, gl.FLOAT, 0);
    gl.readBuffer(gl.COLOR_ATTACHMENT1); gl.readPixels(0, 0, Wd, NHr, gl.RGBA, gl.FLOAT, Wd * NHr * 16);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    tagged.set('n' + tag, { b, f: gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) }); gl.flush();
  }
  function nodesOf(tag, V, FREE) { const e = tagged.get('n' + tag); if (!e) return false; tagged.delete('n' + tag);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, e.b); gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, rb); for (let i = 0; i < N; i++) FREE[i] = rb[4 * i + 3] > .5 ? 1 : 0;
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, Wd * NHr * 16, rb); for (let i = 0; i < N; i++) { V[3 * i] = rb[4 * i]; V[3 * i + 1] = rb[4 * i + 1]; V[3 * i + 2] = rb[4 * i + 2]; }
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null); gl.deleteBuffer(e.b); gl.deleteSync(e.f); return true; }
  function readState(o) {                                 // end of run: plastic strain, damage, member failures, hinge sets
    const tmp = new Float32Array(Wd * CHr * 4);
    for (let k = 0; k < 4; k++) { read(fCell[cur], k, Wd, CHr, tmp); for (let c = 0; c < NC; c++) for (let z = 0; z < 4; z++) o.CEP[16 * c + 4 * k + z] = tmp[4 * c + z]; }
    read(fCell[cur], 4, Wd, CHr, tmp); for (let c = 0; c < NC; c++) o.CDM[c] = tmp[4 * c + 2];
    if (NT) { const a = new Float32Array(Wd * THr * 4); read(fTruss[cur], 0, Wd, THr, a); for (let k = 0; k < NT; k++) { o.TFL[k] = a[4 * k] < 0 ? 1 : 0; if (o.TBP) o.TBP[k] = a[4 * k + 3]; } }
    if (NH) { const a = new Float32Array(Wd * HHr * 4); read(fHinge[cur], 0, Wd, HHr, a); for (let k = 0; k < NH; k++) { o.HTP[k] = a[4 * k]; if (o.HTH) o.HTH[k] = a[4 * k + 1]; if (o.HTPS) o.HTPS[k] = a[4 * k + 2]; } }
  }
  function dispose() { for (const e of tagged.values()) { try { gl.deleteBuffer(e.b); gl.deleteSync(e.f); } catch (x) {} } tagged.clear(); if (fence) gl.deleteSync(fence); if (fenceN) gl.deleteSync(fenceN); for (const [f, o] of objs) try { gl[f](o); } catch (e) {} objs.length = 0; }
  return { step, steps, requestCells, cellsOf, requestNodes, nodesOf, has: () => true, waitFor: () => Promise.resolve(), profile, readCellsFull, readNodesAsync, upload, setSources, setGas, setImpulses, setDamage, readNodes, readCells, readCellsAsync, readState, dispose, O };
}
