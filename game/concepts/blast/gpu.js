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
precision highp float; precision highp int; precision highp sampler2D;
const int W = 256;
ivec2 AT(int i) { return ivec2(i % W, i / W); }
ivec2 ATW(int i, int T, int t) { return ivec2((i % W) * T + t, i / W); }
uniform sampler2D uPos, uVel, uNS;              // displacement + free flag, velocity, node static (winv, anchor; R0; contact panels)
vec3 XR(int i) { return texelFetch(uNS, ATW(i, 5, 1), 0).xyz + texelFetch(uPos, AT(i), 0).xyz; }
vec3 UU(int i) { return texelFetch(uPos, AT(i), 0).xyz; }
vec3 VV(int i) { return texelFetch(uVel, AT(i), 0).xyz; }
uniform vec4 uMatA[8], uMatB[8], uMatC[8];      // (E, nu, sy, H), (D, q, rho, -), (D, q at large strain, strain for them, -)
float CSF(int mi, float ed, float ep) { vec4 b = uMatB[mi], c = uMatC[mi]; float f = min(1.0, ep / c.z); return 1.0 + pow(min(ed, 1e4) / mix(b.x, c.x, f), 1.0 / mix(b.y, c.y, f)); }
uniform float uBeta, uT, uH;
`;

const HINGE_FS = HEAD + `
uniform sampler2D uHS, uHSt, uCSt;
layout(location=0) out vec4 oSt; layout(location=1) out vec4 oF0; layout(location=2) out vec4 oF1; layout(location=3) out vec4 oF2;
void main(){
  ivec2 p = ivec2(gl_FragCoord.xy); int k = p.y * W + p.x;
  vec4 h0 = texelFetch(uHS, ATW(k, 9, 0), 0), h1 = texelFetch(uHS, ATW(k, 9, 1), 0), h2 = texelFetch(uHS, ATW(k, 9, 2), 0),
       h3 = texelFetch(uHS, ATW(k, 9, 3), 0), h4 = texelFetch(uHS, ATW(k, 9, 4), 0);
  vec4 st = texelFetch(uHSt, p, 0);
  oSt = vec4(st.x, 0.0, 0.0, 0.0); oF0 = vec4(0.0); oF1 = vec4(0.0); oF2 = vec4(0.0);
  if (h0.x < 0.0) return;
  int c1 = int(h1.z), c2 = int(h1.w);
  vec4 s1 = texelFetch(uCSt, AT(c1), 0), s2 = texelFetch(uCSt, AT(c2), 0);
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
uniform sampler2D uCS, uT0, uT1, uT2, uT3, uCSt, uHSt, uDmg, uAux;
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
  vec4 T[4]; T[0] = texelFetch(uT0, p, 0); T[1] = texelFetch(uT1, p, 0); T[2] = texelFetch(uT2, p, 0); T[3] = texelFetch(uT3, p, 0);
  vec4 cs = texelFetch(uCSt, p, 0);
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
    float rf = CSF(mi, edot, ep.w);
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
    int sp = int(S1.z); float sg;
    if (sN == sp) sg = 1.0; else if (sP == sp) sg = -1.0; else continue;
    int vb = int(S3.y);
    if (vb >= 0 && ((vis >> vb) & 1) == 0) continue;
    if (S3.z > 0.5) { vec4 pl = uS4[k]; if (abs(dot(c9.xyz, pl.xyz) - pl.w) < 0.3 * uS + 0.02) continue; }
    vec3 d = xc - S0.xyz; float R = max(length(d), 1e-6);
    float ca = abs(dot(d, nn)) / R, c2 = ca * ca, co = 1.0;
    int kind = int(S1.w);
    if (kind == 1) { co = dot(d, S2.xyz) / R; if (co < 0.0) continue; co = max(co, 0.02); }
    R = max(R, S3.x);
    float Weq = kind == 1 ? 4.0 * S0.w * co : S0.w;
    float I = 0.0, Iair = 0.0, Pk = 0.0, TA = 0.0;
    if (Weq > 1e-6) {
      float W3 = pow(Weq, 1.0 / 3.0), Z = max(R / W3, 0.053);
      float Ps = kPs(Z), Pr = refl(Ps), is = kIs(Z) * W3, ir = is * pow(Pr / Ps, 0.75);
      Pk = Ps + (Pr - Ps) * c2; Iair = is + (ir - is) * c2; float TD = 2.0 * Iair / Pk; TA = S1.y + W3 * arr1(Z);
      float a = uT - TA, b = a + uH;
      if (b > 0.0 && a < TD) { a = max(a, 0.0); b = min(b, TD); I += Pk * ((b - b * b / (2.0 * TD)) - (a - a * a / (2.0 * TD))); }
    }
    vec4 S5 = uS5[k]; float Rd = S5.z + R;
    if (S5.x > 0.0 && Iair > 0.0) {       // capped by the feeding source over the full path (an opening cannot focus)
      float W3 = pow(S5.x, 1.0 / 3.0), Z = max(Rd / W3, 0.053), Ps = kPs(Z), Pr = refl(Ps), is = kIs(Z) * W3, ir = is * pow(Pr / Ps, 0.75);
      float Pd = Ps + (Pr - Ps) * c2, Id = is + (ir - is) * c2;
      if (Id < Iair || Pd < Pk) { I = 0.0; Iair = min(Iair, Id); Pk = min(Pk, Pd); float TD = 2.0 * Iair / Pk;
        float a = uT - TA, b = a + uH;
        if (b > 0.0 && a < TD) { a = max(a, 0.0); b = min(b, TD); I += Pk * ((b - b * b / (2.0 * TD)) - (a - a * a / (2.0 * TD))); } }
    }
    if (S1.x > 0.0) {
      float ip = S1.x * (kind == 1 ? co / 3.14159265 : 1.0 / 12.5663706) * c2 / (R * R);
      if (S5.x > 0.0) ip = min(ip, S5.y * c2 / (12.5663706 * Rd * Rd));
      float Ix = max(0.0, ip - Iair), tf = R / uUmax;
      if (Ix > 0.0) I += Ix * (Fp(uT + uH - S1.y, tf) - Fp(uT - S1.y, tf));
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
  float torn = (Dd + eb >= r3.w || fd <= 0.0 || jmin < 0.25) ? 1.0 : 0.0;
  oC = vec4(torn, torn > 0.5 ? uT : -1.0, Dd, min(1.0, util));
}`;

const TRUSS_FS = HEAD + `
uniform sampler2D uTS, uTSt, uTSt2, uCS, uCSt;
layout(location=0) out vec4 oSt; layout(location=1) out vec4 oSt2;
layout(location=2) out vec4 oF0; layout(location=3) out vec4 oF1; layout(location=4) out vec4 oF2; layout(location=5) out vec4 oF3;
vec3 EX;
// angle from u to v about EX (both projected off EX)
float ang(vec3 u, vec3 v) { u -= dot(u, EX) * EX; v -= dot(v, EX) * EX; return atan(dot(cross(u, v), EX), dot(u, v)); }
vec3 gr(vec3 v) { v -= dot(v, EX) * EX; return cross(EX, v) / max(dot(v, v), 1e-30); }
void main(){
  ivec2 p = ivec2(gl_FragCoord.xy); int k = p.y * W + p.x;
  vec4 t0 = texelFetch(uTS, ATW(k, 6, 0), 0), t1 = texelFetch(uTS, ATW(k, 6, 1), 0), t2 = texelFetch(uTS, ATW(k, 6, 2), 0), t3 = texelFetch(uTS, ATW(k, 6, 3), 0),
       t4 = texelFetch(uTS, ATW(k, 6, 4), 0), t5 = texelFetch(uTS, ATW(k, 6, 5), 0);
  vec4 st = texelFetch(uTSt, p, 0), st2 = texelFetch(uTSt2, p, 0);
  oSt = st; oSt2 = st2; oF0 = vec4(0.0); oF1 = vec4(0.0); oF2 = vec4(0.0); oF3 = vec4(0.0);
  if (t0.x < 0.0 || st.y > 0.5) return;
  int a = int(t0.x), b = int(t0.y); float L0 = t0.z, Ar = t0.w;
  vec3 d = t3.xyz + UU(b) - UU(a); float L = length(d); vec3 u = d / L;
  int mi = int(t1.x); vec4 mA = uMatA[mi];
  float vr = dot(VV(b) - VV(a), u), rf = CSF(mi, abs(vr) / L0, st.z);
  float kk = mA.x * Ar / L0, fy = (mA.z + mA.w * st.z) * rf * Ar;
  float Lp = st.x, eb = st.z, fo = kk * (L - Lp);
  if (fo > fy) { float np = L - fy / kk; eb += abs(np - Lp) / L0; Lp = np; fo = fy; }
  else if (fo < -fy) { float np = L + fy / kk; eb += abs(np - Lp) / L0; Lp = np; fo = -fy; }
  fo += uBeta * kk * vr;
  // roles: 0 a, 1 b, 2 bending node A (m back), 3 node m ahead (bending and chord end), 4 chord start
  vec3 F0 = fo * u, F1 = -fo * u, F2 = vec3(0.0), F3 = vec3(0.0), F4 = vec3(0.0);
  float tbp = st.w, tsp = st2.x;
  int cl = int(t1.w), A = int(t2.x), B = int(t2.y), C0 = int(t4.x);
  if (cl >= 0 && texelFetch(uCSt, AT(cl), 0).x < 0.5 && (A >= 0 || C0 >= 0)) {
    vec4 cc = texelFetch(uCS, ATW(cl, 11, 0), 0);
    vec3 nC = cross(XR(int(cc.z)) - XR(int(cc.x)), XR(int(cc.w)) - XR(int(cc.y)));
    EX = cross(nC, d); float exl = length(EX); bool ok = exl > 0.3 * length(nC) * L; EX /= max(exl, 1e-30);
    vec3 xa = XR(a), xB = B >= 0 ? XR(B) : xa;
    if (ok && A >= 0) {
      vec3 xA = XR(A), e1 = xa - xA, e2 = xB - xa, g1 = gr(e1), g2 = gr(e2);
      float thd = dot(g2, VV(B) - VV(a)) - dot(g1, VV(a) - VV(A));
      float dth = ang(e1, e2) - t3.w; dth -= 6.283185307 * floor(dth / 6.283185307 + 0.5);
      float rfb = CSF(mi, abs(thd) * t1.z, abs(tbp) * t1.z), cap = t2.w * rfb, kb = t2.z;
      float Q = kb * (dth - tbp);
      if (Q > cap) { tbp = dth - cap / kb; Q = cap; } else if (Q < -cap) { tbp = dth + cap / kb; Q = -cap; }
      Q += uBeta * kb * thd;
      F3 -= Q * g2; F2 -= Q * g1; F0 += Q * (g1 + g2);
    }
    if (ok && C0 >= 0) {
      vec3 c = xB - XR(C0), gc = gr(c), gs = gr(d);
      float gd = dot(gs, VV(b) - VV(a)) - dot(gc, VV(B) - VV(C0));
      float dg = ang(c, d) - t5.x; dg -= 6.283185307 * floor(dg / 6.283185307 + 0.5);
      float cap = t4.w * rf, ks = t4.z, Q = ks * (dg - tsp);
      if (Q > cap) { tsp = dg - cap / ks; Q = cap; } else if (Q < -cap) { tsp = dg + cap / ks; Q = -cap; }
      Q += uBeta * ks * gd;
      F1 -= Q * gs; F0 += Q * gs; F3 += Q * gc; F4 -= Q * gc;
    }
  }
  float failed = max(0.0, log(Lp / L0)) + abs(tbp) * t1.z >= t1.y ? 1.0 : 0.0;
  oSt = vec4(Lp, failed, eb, tbp); oSt2 = vec4(tsp, 0.0, 0.0, 0.0);
  oF0 = vec4(F0, F1.x); oF1 = vec4(F1.yz, F2.xy); oF2 = vec4(F2.z, F3); oF3 = vec4(F4, 0.0);
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
uniform sampler2D uAdj, uCF0, uCF1, uCF2, uHF0, uHF1, uHF2, uMF0, uMF1, uMF2, uMF3, uCSt, uTSt;
out vec4 o;
int ADJ(int k) { return int(texelFetch(uAdj, AT(k >> 2), 0)[k & 3]); }
void main(){
  ivec2 p = ivec2(gl_FragCoord.xy); int i = p.y * W + p.x;
  vec4 g0 = texelFetch(uNS, ATW(i, 5, 3), 0), g1 = texelFetch(uNS, ATW(i, 5, 4), 0);
  vec3 F = vec3(0.0); float cnt = 0.0;
  int o0 = int(g0.x), n0 = int(g0.y), o1 = int(g0.z), n1 = int(g0.w), o2 = int(g1.x), n2 = int(g1.y);
  for (int k = 0; k < 256; k++) { if (k >= n0) break;
    int e = ADJ(o0 + k), c = e / 4, r = e - 4 * c; ivec2 q = AT(c);
    if (r == 0) F += texelFetch(uCF0, q, 0).xyz;
    else if (r == 1) { F += vec3(texelFetch(uCF0, q, 0).w, texelFetch(uCF1, q, 0).xy); }
    else if (r == 2) { F += vec3(texelFetch(uCF1, q, 0).zw, texelFetch(uCF2, q, 0).x); }
    else F += texelFetch(uCF2, q, 0).yzw;
    if (texelFetch(uCSt, q, 0).x < 0.5) cnt += 1.0; }
  for (int k = 0; k < 512; k++) { if (k >= n1) break;
    int e = ADJ(o1 + k), h = e / 8, r = e - 8 * h; ivec2 q = AT(h);
    if (r == 0) F += texelFetch(uHF0, q, 0).xyz;
    else if (r == 1) F += vec3(texelFetch(uHF0, q, 0).w, texelFetch(uHF1, q, 0).xy);
    else if (r < 4) F += 0.5 * vec3(texelFetch(uHF1, q, 0).zw, texelFetch(uHF2, q, 0).x);
    else F += 0.5 * texelFetch(uHF2, q, 0).yzw; }
  for (int k = 0; k < 128; k++) { if (k >= n2) break;
    int e = ADJ(o2 + k), t = e / 8, r = e - 8 * t; ivec2 q = AT(t);
    if (r == 0) F += texelFetch(uMF0, q, 0).xyz;
    else if (r == 1) F += vec3(texelFetch(uMF0, q, 0).w, texelFetch(uMF1, q, 0).xy);
    else if (r == 2) F += vec3(texelFetch(uMF1, q, 0).zw, texelFetch(uMF2, q, 0).x);
    else if (r == 3) F += texelFetch(uMF2, q, 0).yzw;
    else F += texelFetch(uMF3, q, 0).xyz;
    if (r < 2 && texelFetch(uTSt, q, 0).y < 0.5) cnt += 1.0; }
  o = vec4(F, cnt);
}`;

// torn cells packed to bytes for a fast read back: flag in alpha, erosion time (0 .. 1.67 s, 0.1 us steps) in rgb
const PACK_FS = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
uniform sampler2D uCSt; out vec4 o;
void main(){ vec4 c = texelFetch(uCSt, ivec2(gl_FragCoord.xy), 0);
  if (c.x < 0.5) { o = vec4(0.0); return; }
  int q = int(clamp(c.y, 0.0, 1.67) * 1e7);
  o = vec4(float(q & 255), float((q >> 8) & 255), float((q >> 16) & 255), 255.0) / 255.0; }`;

const NODE_FS = HEAD + `
uniform sampler2D uAnc, uFrc, uImp, uCSt, uCS, uPan, uCMap;
uniform float uAlpha, uG; uniform int uUseImp;
layout(location=0) out vec4 oPos; layout(location=1) out vec4 oVel; layout(location=2) out vec4 oAnc; layout(location=3) out vec4 oCon;
void main(){
  ivec2 p = ivec2(gl_FragCoord.xy); int i = p.y * W + p.x;
  vec4 pos = texelFetch(uPos, p, 0), vel = texelFetch(uVel, p, 0), anc = texelFetch(uAnc, p, 0);
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
    if (c < 0 || texelFetch(uCSt, AT(c), 0).x > 0.5) continue;
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
  const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o) + '\n' + s.split('\n').map((l, i) => (i + 1) + ': ' + l).join('\n')); return o; };
  const prog = (vs, fs) => { const p = gl.createProgram(), a = sh(gl.VERTEX_SHADER, vs), b = sh(gl.FRAGMENT_SHADER, fs); gl.attachShader(p, a); gl.attachShader(p, b); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); gl.deleteShader(a); gl.deleteShader(b); objs.push(['deleteProgram', p]);
    p.u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); for (let i = 0; i < n; i++) { const u = gl.getActiveUniform(p, i); p.u[u.name.replace('[0]', '')] = gl.getUniformLocation(p, u.name); } return p; };
  const pH = prog(VS, HINGE_FS), pC = prog(VS, CELL_FS), pT = prog(VS, TRUSS_FS), pN = prog(VS, NODE_FS);
  const pG = prog(VS, GATHER_FS), sK = prog(SC_CONTACT, SCAT_FS), pP = prog(VS, PACK_FS);
  const vao = gl.createVertexArray(); objs.push(['deleteVertexArray', vao]);
  const tex = (w, h, data) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, data); t.w = w; t.h = h; objs.push(['deleteTexture', t]); return t; };
  const fbo = texs => { const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    texs.forEach((t, i) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0));
    gl.drawBuffers(texs.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('fbo incomplete');
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); f.w = texs[0].w; f.h = texs[0].h; objs.push(['deleteFramebuffer', f]); return f; };
  const Wd = 256, rows = n => Math.max(1, Math.ceil(n / Wd));
  const { N, NC, NH, NT } = M;
  const NHr = rows(N), CHr = rows(NC), HHr = rows(NH), THr = rows(NT);
  // local origin: the middle of the model (keeps float32 coordinates small)
  const O = [0, 0, 0]; { const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let i = 0; i < N; i++) for (let q = 0; q < 3; q++) { const v = M.R0[3 * i + q]; if (!Number.isFinite(v)) continue; lo[q] = Math.min(lo[q], v); hi[q] = Math.max(hi[q], v); } for (let q = 0; q < 3; q++) O[q] = (lo[q] + hi[q]) / 2; }
  const wide = (n, T, f) => { const a = new Float32Array(Wd * T * rows(n) * 4).fill(-1); const o = (i, t) => (((i / Wd | 0) * Wd * T) + (i % Wd) * T + t) * 4;
    for (let i = 0; i < n; i++) f(i, (t, v) => a.set(v, o(i, t))); return tex(Wd * T, rows(n), a); };
  const R = (i, q) => M.R0[3 * i + q] - O[q];
  const T = {};
  // adjacency (CSR): for every node, its (cell, corner), (hinge, role) and (member, end) entries
  const adjL = [Array.from({ length: N }, () => []), Array.from({ length: N }, () => []), Array.from({ length: N }, () => [])];
  for (let c = 0; c < NC; c++) for (let k = 0; k < 4; k++) adjL[0][M.CN[4 * c + k]].push(c * 4 + k);
  for (let h = 0; h < NH; h++) for (let k = 0; k < 6; k++) adjL[1][M.HN[6 * h + k]].push(h * 8 + k);
  for (let t = 0; t < NT; t++) { adjL[2][M.TA[t]].push(t * 8); adjL[2][M.TB[t]].push(t * 8 + 1);
    if (M.TBA[t] >= 0) adjL[2][M.TBA[t]].push(t * 8 + 2); if (M.TBB[t] >= 0) adjL[2][M.TBB[t]].push(t * 8 + 3); if (M.TSC[t] >= 0) adjL[2][M.TSC[t]].push(t * 8 + 4); }
  const adjOff = [new Int32Array(N), new Int32Array(N), new Int32Array(N)], flat = [];
  for (let q = 0; q < 3; q++) for (let i = 0; i < N; i++) { adjOff[q][i] = flat.length; for (const e of adjL[q][i]) flat.push(e); }
  { const nt = Math.ceil(flat.length / 4), a = new Float32Array(Wd * rows(nt) * 4); a.set(flat); T.adj = tex(Wd, rows(nt), a); }
  T.ns = wide(N, 5, (i, put) => { put(0, [M.WINV[i], M.AK[i], M.AF[i], M.AC[i]]); put(1, [R(i, 0), R(i, 1), R(i, 2), 0]); put(2, [0, 1, 2, 3].map(k => M.NCC[4 * i + k]));
    put(3, [adjOff[0][i], adjL[0][i].length, adjOff[1][i], adjL[1][i].length]); put(4, [adjOff[2][i], adjL[2][i].length, 0, 0]); });
  const mkCS = () => wide(NC, 11, (c, put) => {
    const q = [0, 1, 2, 3].map(k => M.CN[4 * c + k]), rv = k => [0, 1, 2].map(z => M.R0[3 * q[k] + z] - M.R0[3 * q[0] + z]);
    put(0, q); put(1, [...rv(1), M.CH[c]]); put(2, [...rv(2), M.CMAT[c]]); put(3, [...rv(3), M.CEF[c]]);
    const ex = [M.CSP[c], M.CSN[c], M.CWET[c], M.CAR[c]];
    for (let t = 0; t < 4; t++) put(4 + t, [M.CTR[12 * c + 3 * t], M.CTR[12 * c + 3 * t + 1], M.CTR[12 * c + 3 * t + 2], ex[t]]);
    put(8, [0, 1, 2, 3].map(k => M.CHG[4 * c + k])); put(9, [M.CRC[3 * c] - O[0], M.CRC[3 * c + 1] - O[1], M.CRC[3 * c + 2] - O[2], M.CDB[c]]);
    put(10, [M.CVIS()[c], 0, 0, 0]);
  });
  T.cs = mkCS();
  T.hs = wide(NH, 9, (k, put) => { const rv = z => [0, 1, 2].map(q => M.R0[3 * M.HN[6 * k + z] + q] - M.R0[3 * M.HN[6 * k] + q]);
    const mid = (a, b) => [0, 1, 2].map(q => .5 * (rv(a)[q] + rv(b)[q])), E = rv(1), f1 = mid(2, 3), f2 = mid(4, 5);
    put(5, [E[0], E[1], E[2], f1[0]]); put(6, [f1[1], f1[2], f2[0], f2[1]]); put(7, [f2[2], 0, 0, 0]); put(0, [0, 1, 2, 3].map(z => M.HN[6 * k + z])); put(1, [M.HN[6 * k + 4], M.HN[6 * k + 5], M.HC[2 * k], M.HC[2 * k + 1]]);
    put(2, [M.HKP[k], M.HMP[k], M.HKS[k], M.HMS[k]]); put(3, [M.HTR[2 * k], M.HTR[2 * k + 1], M.HDB[k], M.HHP[k]]); put(4, [M.HMAT[k], M.HT0[k], M.HLN[k], 0]);
    put(8, [M.HTL0[k], M.HTR[2 * k] >= 0 ? M.TFIB[M.HTR[2 * k]] : 0, 0, 0]); });
  T.ts = wide(NT, 6, (k, put) => { const a = M.TA[k], b = M.TB[k]; put(0, [a, b, M.TL0[k], M.TAR[k]]); put(1, [M.TMAT[k], M.TEF[k], M.TFIB[k], M.TCL[k]]);
    put(2, [M.TBA[k], M.TBB[k], M.TKB[k], M.TQB[k]]); put(3, [...[0, 1, 2].map(z => M.R0[3 * b + z] - M.R0[3 * a + z]), M.TB0[k]]);
    put(4, [M.TSC[k], 0, M.TKS[k], M.TQS[k]]); put(5, [M.TS0[k], 0, 0, 0]); });
  const pan = new Float32Array(5 * Math.max(1, M.PAN.length) * 4);
  M.PAN.forEach((P, q) => pan.set([P.o[0] - O[0], P.o[1] - O[1], P.o[2] - O[2], P.nu, ...P.U, P.Lu, ...P.V, P.Lv, ...P.n, P.off, P.nv, 0, 0, 0], 20 * q));
  T.pan = tex(5 * Math.max(1, M.PAN.length), 1, pan);
  { const n = M.CMAP.length, a = new Float32Array(Wd * rows(n) * 4).fill(-1); for (let k = 0; k < n; k++) a[4 * k] = M.CMAP[k]; T.cmap = tex(Wd, rows(n), a); }
  const aux = new Float32Array(2048 * 4); for (let k = 0; k < 2048; k++) aux[4 * k] = M.TA1[k]; T.aux = tex(2048, 1, aux);
  T.dmg = tex(Wd, CHr, null); T.imp = tex(Wd, NHr, null);
  // dynamic, ping-pong
  const nodeS = [0, 1].map(() => ({ pos: tex(Wd, NHr, null), vel: tex(Wd, NHr, null), anc: tex(Wd, NHr, null) }));
  const con = tex(Wd, NHr, null), frc = tex(Wd, NHr, null);
  const cellS = [0, 1].map(() => ({ t: [0, 1, 2, 3].map(() => tex(Wd, CHr, null)), s: tex(Wd, CHr, null) }));
  const cF = [0, 1, 2].map(() => tex(Wd, CHr, null));
  const hS = [tex(Wd, HHr, null), tex(Wd, HHr, null)], hF = [0, 1, 2].map(() => tex(Wd, HHr, null));
  const tS = [tex(Wd, THr, null), tex(Wd, THr, null)], tS2 = [tex(Wd, THr, null), tex(Wd, THr, null)], mF = [0, 1, 2, 3].map(() => tex(Wd, THr, null));
  const fNode = nodeS.map(s => fbo([s.pos, s.vel, s.anc, con])), fFrc = fbo([frc]);
  const fCell = cellS.map(s => fbo([...s.t, s.s, ...cF])), fHinge = hS.map(s => fbo([s, ...hF])), fTruss = tS.map((s, i) => fbo([s, tS2[i], ...mF]));
  let cur = 0, useImp = 0;
  const TQ = gl.getExtension('EXT_disjoint_timer_query_webgl2'); let prof = null; const pending = [];
  const tq = name => { if (!prof || !TQ) return; if (prof.q) gl.endQuery(TQ.TIME_ELAPSED_EXT); const q = gl.createQuery(); gl.beginQuery(TQ.TIME_ELAPSED_EXT, q); prof.q = q; pending.push([name, q]); };
  const tqEnd = () => { if (prof && prof.q) { gl.endQuery(TQ.TIME_ELAPSED_EXT); prof.q = null; } };
  const matA = new Float32Array(32), matB = new Float32Array(32), matC = new Float32Array(32);
  M.MATS.forEach((m, i) => { matA.set([m.E, m.nu, m.sy, m.H], 4 * i); matB.set([m.D, m.q, m.rho, 0], 4 * i); matC.set([m.Du, m.qu, m.eu, 0], 4 * i); });
  const S0 = new Float32Array(128), S1 = new Float32Array(128), S2 = new Float32Array(128), S3 = new Float32Array(128), S4 = new Float32Array(128), S5 = new Float32Array(128);
  let nsrc = 0; const gpu4 = new Float32Array(128);
  // sampler units are set once per program; material constants once; loads only when they change
  const units = new Array(16).fill(null);
  const bind = (p, name, t, unit) => { if (units[unit] !== t) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); units[unit] = t; }
    const key = '_s' + name; if (p[key] !== unit) { gl.uniform1i(p.u[name], unit); p[key] = unit; } };
  const unbindAll = () => units.fill(null);
  const common = (p, t, h) => {
    if (!p._const) { if (p.u.uMatA) gl.uniform4fv(p.u.uMatA, matA); if (p.u.uMatB) gl.uniform4fv(p.u.uMatB, matB); if (p.u.uMatC) gl.uniform4fv(p.u.uMatC, matC);
      if (p.u.uBeta) gl.uniform1f(p.u.uBeta, M.BETA()); p._const = true; }
    if (p.u.uT && p._t !== t) { gl.uniform1f(p.u.uT, t); p._t = t; } if (p.u.uH && p._h !== h) { gl.uniform1f(p.u.uH, h); p._h = h; } };
  let loadsDirty = true;

  function upload() { unbindAll();
    const s = nodeS[cur];
    const z = n => new Float32Array(Wd * rows(n) * 4);
    for (const t of [s.pos, s.vel, s.anc, con]) { gl.bindTexture(gl.TEXTURE_2D, t); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, Wd, NHr, gl.RGBA, gl.FLOAT, z(N)); }
    { const c = z(N); for (let i = 0; i < N; i++) c[4 * i] = -1; gl.bindTexture(gl.TEXTURE_2D, con); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, Wd, NHr, gl.RGBA, gl.FLOAT, c); }
    for (const t of [...cellS[cur].t, cellS[cur].s, T.dmg]) { gl.bindTexture(gl.TEXTURE_2D, t); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, Wd, CHr, gl.RGBA, gl.FLOAT, z(NC)); }
    { const c = z(NC); for (let k = 0; k < NC; k++) c[4 * k + 1] = -1; gl.bindTexture(gl.TEXTURE_2D, cellS[cur].s); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, Wd, CHr, gl.RGBA, gl.FLOAT, c); }
    gl.bindTexture(gl.TEXTURE_2D, hS[cur]); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, Wd, HHr, gl.RGBA, gl.FLOAT, z(NH));
    { const c = z(NT); for (let k = 0; k < NT; k++) c[4 * k] = M.TL0[k]; gl.bindTexture(gl.TEXTURE_2D, tS[cur]); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, Wd, THr, gl.RGBA, gl.FLOAT, c);
      gl.bindTexture(gl.TEXTURE_2D, tS2[cur]); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, Wd, THr, gl.RGBA, gl.FLOAT, z(NT)); }
    // line-of-sight bits are known now (detonation): refresh the cell statics
    gl.deleteTexture(T.cs); T.cs = mkCS();
  }
  function setSources(list) {
    loadsDirty = true; nsrc = Math.min(32, list.length); S0.fill(0); S1.fill(0); S2.fill(0); S3.fill(0); S4.fill(0); S5.fill(0);
    for (let k = 0; k < nsrc; k++) { const s = list[k];
      S0.set([s.pos[0] - O[0], s.pos[1] - O[1], s.pos[2] - O[2], s.W], 4 * k); S1.set([s.Pm, s.t0, s.space, s.kind], 4 * k);
      S2.set([...(s.ax || [0, 0, 0]), s.gain], 4 * k); S3.set([s.rc, s.vis, s.plane ? 1 : 0, 0], 4 * k); S5.set([s.Wf || 0, s.Pmf || 0, s.Df || 0, 0], 4 * k);
      if (s.plane) S4.set([s.plane[0], s.plane[1], s.plane[2], s.plane[3] - (s.plane[0] * O[0] + s.plane[1] * O[1] + s.plane[2] * O[2])], 4 * k); }
  }
  function setGas(GP) { loadsDirty = true; gpu4.fill(0); for (let k = 0; k < Math.min(128, GP.length); k++) gpu4[k] = GP[k]; }
  function setImpulses(list) { unbindAll();
    const a = new Float32Array(Wd * NHr * 4);
    for (let k = 0; k < list.length; k += 4) { const i = list[k]; a[4 * i] += list[k + 1]; a[4 * i + 1] += list[k + 2]; a[4 * i + 2] += list[k + 3]; }
    gl.bindTexture(gl.TEXTURE_2D, T.imp); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, Wd, NHr, gl.RGBA, gl.FLOAT, a); useImp = 1;
  }
  function setDamage(CFD) { unbindAll(); const a = new Float32Array(Wd * CHr * 4); for (let c = 0; c < NC; c++) a[4 * c] = CFD[c];
    gl.bindTexture(gl.TEXTURE_2D, T.dmg); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, Wd, CHr, gl.RGBA, gl.FLOAT, a); }

  function step(t, h, alpha) {
    gl.bindVertexArray(vao); gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    const nx = 1 - cur, s = nodeS[cur], d = nodeS[nx];
    // 1. hinges
    tq('hinges');
    gl.useProgram(pH); gl.bindFramebuffer(gl.FRAMEBUFFER, fHinge[nx]); gl.viewport(0, 0, Wd, HHr); common(pH, t, h);
    bind(pH, 'uPos', s.pos, 0); bind(pH, 'uVel', s.vel, 1); bind(pH, 'uNS', T.ns, 2); bind(pH, 'uHS', T.hs, 3); bind(pH, 'uHSt', hS[cur], 4);
    bind(pH, 'uCSt', cellS[cur].s, 5);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // 2. cells
    tq('cells');
    gl.useProgram(pC); gl.bindFramebuffer(gl.FRAMEBUFFER, fCell[nx]); gl.viewport(0, 0, Wd, CHr); common(pC, t, h);
    bind(pC, 'uPos', s.pos, 0); bind(pC, 'uVel', s.vel, 1); bind(pC, 'uNS', T.ns, 2); bind(pC, 'uCS', T.cs, 3);
    for (let k = 0; k < 4; k++) bind(pC, 'uT' + k, cellS[cur].t[k], 4 + k);
    bind(pC, 'uCSt', cellS[cur].s, 8); bind(pC, 'uHSt', hS[nx], 9); bind(pC, 'uDmg', T.dmg, 10); bind(pC, 'uAux', T.aux, 11);
    if (loadsDirty) { gl.uniform4fv(pC.u.uGP, gpu4); gl.uniform4fv(pC.u.uS0, S0); gl.uniform4fv(pC.u.uS1, S1); gl.uniform4fv(pC.u.uS2, S2); gl.uniform4fv(pC.u.uS3, S3); gl.uniform4fv(pC.u.uS4, S4); gl.uniform4fv(pC.u.uS5, S5);
      gl.uniform1i(pC.u.uNS_, nsrc); loadsDirty = false; }
    if (!pC._c2) { gl.uniform1i(pC.u.uOUT, M.OUT()); gl.uniform1f(pC.u.uUmax, M.U_MAX); gl.uniform1f(pC.u.uRhoWC, M.RHO_W * M.C_W);
      gl.uniform1f(pC.u.uP0, M.P0); gl.uniform1f(pC.u.uRhoWg, M.RHO_W * M.G); if (pC.u.uKs) gl.uniform1f(pC.u.uKs, M.K_SHEAR); gl.uniform1f(pC.u.uS, M.S); pC._c2 = true; }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // 3. trusses
    tq('members');
    if (NT) { gl.useProgram(pT); gl.bindFramebuffer(gl.FRAMEBUFFER, fTruss[nx]); gl.viewport(0, 0, Wd, THr); common(pT, t, h);
      bind(pT, 'uPos', s.pos, 0); bind(pT, 'uVel', s.vel, 1); bind(pT, 'uNS', T.ns, 2); bind(pT, 'uTS', T.ts, 3); bind(pT, 'uTSt', tS[cur], 4); bind(pT, 'uTSt2', tS2[cur], 5); bind(pT, 'uCS', T.cs, 6); bind(pT, 'uCSt', cellS[nx].s, 7);
      gl.drawArrays(gl.TRIANGLES, 0, 3); }
    // 4. gather the element forces at the nodes; add last step's contact push-back
    tq('gather');
    gl.useProgram(pG); gl.bindFramebuffer(gl.FRAMEBUFFER, fFrc); gl.viewport(0, 0, Wd, NHr);
    bind(pG, 'uNS', T.ns, 0); bind(pG, 'uAdj', T.adj, 1); bind(pG, 'uCF0', cF[0], 2); bind(pG, 'uCF1', cF[1], 3); bind(pG, 'uCF2', cF[2], 4);
    for (let z = 0; z < 3; z++) bind(pG, 'uHF' + z, hF[z], 5 + z); for (let z = 0; z < 4; z++) bind(pG, 'uMF' + z, mF[z], 8 + z); bind(pG, 'uCSt', cellS[nx].s, 12); bind(pG, 'uTSt', tS[nx], 13);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    tq('contact');
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(sK); bind(sK, 'uCon', con, 0); bind(sK, 'uCS', T.cs, 1); if (!sK._c) { gl.uniform1i(sK.u.uN, N); gl.uniform1i(sK.u.uNH, NHr); sK._c = true; } if (sK._h !== h) { gl.uniform1f(sK.u.uH, h); sK._h = h; }
    gl.drawArrays(gl.POINTS, 0, 4 * N);
    gl.disable(gl.BLEND);
    // 5. nodes
    tq('nodes');
    gl.useProgram(pN); gl.bindFramebuffer(gl.FRAMEBUFFER, fNode[nx]); gl.viewport(0, 0, Wd, NHr); common(pN, t, h);
    bind(pN, 'uPos', s.pos, 0); bind(pN, 'uVel', s.vel, 1); bind(pN, 'uNS', T.ns, 2); bind(pN, 'uAnc', s.anc, 3); bind(pN, 'uFrc', frc, 4);
    bind(pN, 'uImp', T.imp, 5); bind(pN, 'uCSt', cellS[nx].s, 6); bind(pN, 'uCS', T.cs, 7); bind(pN, 'uPan', T.pan, 8); bind(pN, 'uCMap', T.cmap, 9);
    if (pN._a !== alpha) { gl.uniform1f(pN.u.uAlpha, alpha); pN._a = alpha; } if (!pN._g) { gl.uniform1f(pN.u.uG, M.G); pN._g = true; } if (pN._i !== useImp) { gl.uniform1i(pN.u.uUseImp, useImp); pN._i = useImp; }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    useImp = 0; tqEnd();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    cur = nx;
  }
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
  function readCells() { unbindAll();                    // -> rbC as (torn, time) per cell, like the float state
    gl.bindVertexArray(vao); gl.disable(gl.BLEND); gl.useProgram(pP); gl.bindFramebuffer(gl.FRAMEBUFFER, f8); gl.viewport(0, 0, Wd, CHr);
    bind(pP, 'uCSt', cellS[cur].s, 0); gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.readPixels(0, 0, Wd, CHr, gl.RGBA, gl.UNSIGNED_BYTE, rb8); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    for (let c = 0; c < NC; c++) { const o = 4 * c; if (rb8[o + 3]) { rbC[o] = 1; rbC[o + 1] = (rb8[o] | (rb8[o + 1] << 8) | (rb8[o + 2] << 16)) * 1e-7; } else { rbC[o] = 0; rbC[o + 1] = -1; } }
    return rbC;
  }
  function readCellsFull() { return read(fCell[cur], 4, Wd, CHr, rbC); }
  const pbo = gl.createBuffer(); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo); gl.bufferData(gl.PIXEL_PACK_BUFFER, Wd * CHr * 16, gl.STREAM_READ); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
  objs.push(['deleteBuffer', pbo]);
  let fence = null;
  function readCellsAsync() {
    let out = null;
    if (fence) {
      const r = gl.clientWaitSync(fence, 0, 0);
      if (r === gl.TIMEOUT_EXPIRED) return null;
      gl.deleteSync(fence); fence = null;
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo); gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, rbC); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null); out = rbC;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, fCell[cur]); gl.readBuffer(gl.COLOR_ATTACHMENT4);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo); gl.readPixels(0, 0, Wd, CHr, gl.RGBA, gl.FLOAT, 0); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
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
  function readState(o) { unbindAll();                   // end of run: plastic strain, damage, member failures, hinge sets
    const tmp = new Float32Array(Wd * CHr * 4);
    for (let k = 0; k < 4; k++) { read(fCell[cur], k, Wd, CHr, tmp); for (let c = 0; c < NC; c++) for (let z = 0; z < 4; z++) o.CEP[16 * c + 4 * k + z] = tmp[4 * c + z]; }
    read(fCell[cur], 4, Wd, CHr, tmp); for (let c = 0; c < NC; c++) o.CDM[c] = tmp[4 * c + 2];
    if (NT) { const a = new Float32Array(Wd * THr * 4); read(fTruss[cur], 0, Wd, THr, a); for (let k = 0; k < NT; k++) { o.TFL[k] = a[4 * k + 1] > .5 ? 1 : 0; if (o.TBP) o.TBP[k] = a[4 * k + 3]; } }
    if (NH) { const a = new Float32Array(Wd * HHr * 4); read(fHinge[cur], 0, Wd, HHr, a); for (let k = 0; k < NH; k++) { o.HTP[k] = a[4 * k]; if (o.HTH) o.HTH[k] = a[4 * k + 1]; if (o.HTPS) o.HTPS[k] = a[4 * k + 2]; } }
  }
  function dispose() { if (fence) gl.deleteSync(fence); if (fenceN) gl.deleteSync(fenceN); for (const [f, o] of objs) try { gl[f](o); } catch (e) {} objs.length = 0; }
  return { step, profile, readCellsFull, readNodesAsync, upload, setSources, setGas, setImpulses, setDamage, readNodes, readCells, readCellsAsync, readState, dispose, O };
}
