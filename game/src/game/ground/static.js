/* Ground detail · the static returns: roads and streets, bridges, power lines, fences, the added houses' lit windows,
   garden trees. Built once on the CPU (ground/plan.js), drawn by one instanced draw a frame.

   Every return carries a spacing s (m): the spacing of the sub-lattice of its primitive it belongs to (a line's
   index, a wall's two indices: the coarsest power of two they share; a crown's returns: the prefix of its sequence).
   It is drawn where s stays over the kind's on-screen spacing (px) at its distance, the last ones dissolving: whole
   sub-lattices survive (dotted lines and dotted walls stay orderly at any range), never random speckle.

   Storage: an RGBA32UI texture, one texel a return (x, y, z float bits, attributes), sorted by 500 m cell and within a
   cell by s, coarse first, in chunks of 64. A frame lists the chunks of the cells in view down to the chunk whose
   coarsest return is under the need at the cell's nearest point (a few thousand ints) and draws them all at once. */
import { program } from '../../engine/gl.js';
import { HEAD, FRAME, COMMON, CULL, GROUND_GLSL, bindGround } from './glsl.js';
import { FS_POINT } from '../../engine/shaders.js';

const CH = 64, TW = 4096, CELL = 500, R_EARTH = 6371000;

/* kinds: px (the returns' least on-screen spacing), b (brightness), shade (by the normal), night (only lit at night,
   warm, facing the lens), wMin / wMax (world width m, drawn while its on-screen width is over wMin px / under wMax px) */
export const KINDS = [
  { name: 'road-edge', px: 5.5, b: .6, w: 7, wMin: 4.5, line: 1 },
  { name: 'road-centre', px: 6, b: .52, w: 7, wMax: 7, line: 1 },
  { name: 'track-edge', px: 5.5, b: .42, w: 4, wMin: 5, line: 1 },
  { name: 'track-centre', px: 6.5, b: .36, w: 4, wMax: 7, line: 1 },
  { name: 'street-edge', px: 5.5, b: .42, w: 6, wMin: 5, line: 1 },
  { name: 'street', px: 6, b: .4, w: 6, wMax: 7, line: 1 },
  { name: 'lane', px: 6, b: .32, line: 1 },
  { name: 'bridge', px: 4.5, b: .62, shade: 1 },
  { name: 'wire', px: 5, b: .5, line: 2 },
  { name: 'pylon', px: 3.2, b: .62, line: 2 },
  { name: 'fence-post', px: 4, b: .55, line: 2 },
  { name: 'fence-wire', px: 5, b: .38, line: 2 },
  { name: 'wall', px: 3, b: .5, shade: 1 },
  { name: 'roof', px: 3, b: .64, shade: 1 },
  { name: 'window', px: 1, b: 1, night: 1 },
  { name: 'crown', px: 2.6, b: .95, shade: 1 },
  { name: 'trunk', px: 3, b: .3 },
  { name: 'lamp', px: 1, b: 1, night: 2 },
];
export const KIND = Object.fromEntries(KINDS.map((k, i) => [k.name, i]));

/* a growable buffer of returns: x, y, z, s, kind, normal */
export class Dots {
  constructor() { this.n = 0; this.cap = 1 << 16; this.P = new Float32Array(this.cap * 4); this.A = new Uint32Array(this.cap); }
  push(x, y, z, s, kind, nx, ny, nz) {
    if (this.n >= this.cap) { this.cap *= 2; const P = new Float32Array(this.cap * 4); P.set(this.P); this.P = P; const A = new Uint32Array(this.cap); A.set(this.A); this.A = A; }
    const i = this.n++, o = i * 4;
    this.P[o] = x; this.P[o + 1] = y; this.P[o + 2] = z; this.P[o + 3] = s;
    // normal, octahedral 8 + 8 bits; (0, 0, 0): none
    let ou = 128, ov = 128, has = 0;
    if (nx !== undefined && (nx || ny || nz)) {
      const l = Math.abs(nx) + Math.abs(ny) + Math.abs(nz);
      let a = nx / l, b = nz / l;
      if (ny < 0) { const a2 = (1 - Math.abs(b)) * Math.sign(a || 1), b2 = (1 - Math.abs(a)) * Math.sign(b || 1); a = a2; b = b2; }
      ou = Math.round((a * .5 + .5) * 254); ov = Math.round((b * .5 + .5) * 254); has = 1;
    }
    const q = Math.max(0, Math.min(255, Math.round((Math.log2(Math.max(1e-3, s)) + 4) * 16)));
    this.A[i] = q | (kind << 8) | (has << 15) | (ou << 16) | (ov << 24);
  }
}

const VS = HEAD + FRAME + COMMON + GROUND_GLSL + `
layout(location = 0) in uint aChunk;
uniform highp usampler2D uData;             // unit 3
uniform vec4 uKA[${KINDS.length}];          // px, brightness, shade, night mode
uniform vec4 uKB[${KINDS.length}];          // width (m), min px, max px, unused
out vec3 vCol;
void main() {
  int idx = int(aChunk) * ${CH} + gl_VertexID;
  uvec4 D = texelFetch(uData, ivec2(idx & ${TW - 1}, idx >> ${Math.log2(TW)}), 0);
  vec3 p = vec3(uintBitsToFloat(D.x), uintBitsToFloat(D.y), uintBitsToFloat(D.z)) - uEyeW.xyz;
  uint at = D.w;
  int kind = int((at >> 8u) & 127u);
  vec4 KA = uKA[kind], KB = uKB[kind];
  float d = max(1.0, length(p));
  float s = exp2(float(at & 255u) / 16.0 - 4.0);
  // keep the sub-lattices whose spacing stays over the kind's on-screen spacing; the last dissolve
  float keep = s * uNeed.w / (KA.x * d);
  float a = clamp((keep - 1.0) / 0.45, 0.0, 1.0);
  if (a <= 0.0) { ${CULL} return; }
  // a road: its two edges while it is wide on screen, its centre line when it is narrow
  if (KB.x > 0.0) {
    float wpx = KB.x * uNeed.w / d;
    if (KB.y > 0.0) a *= smoothstep(KB.y, KB.y * 1.35, wpx);
    if (KB.z > 0.0) a *= 1.0 - smoothstep(KB.z * 0.75, KB.z, wpx);
    if (a <= 0.0) { ${CULL} return; }
  }
  vec3 n = vec3(0.0);
  if (((at >> 15u) & 1u) == 1u) {
    vec2 e = vec2(float((at >> 16u) & 255u), float(at >> 24u)) / 254.0 * 2.0 - 1.0;
    n = vec3(e.x, 1.0 - abs(e.x) - abs(e.y), e.y);
    if (n.y < 0.0) n.xz = (1.0 - abs(n.zx)) * vec2(n.x >= 0.0 ? 1.0 : -1.0, n.z >= 0.0 ? 1.0 : -1.0);
    n = normalize(n);
  }
  vec3 base = WH;
  float b = KA.y;
  if (KA.w > 0.5) {
    // lit windows and lamps: at night only, warm; a window only on the wall facing the lens
    if (uLook.w < 0.05) { ${CULL} return; }
    if (KA.w < 1.5 && dot(n, p) > 0.0) { ${CULL} return; }
    base = vec3(1.0, 0.886, 0.72);
    b *= uLook.w * (0.55 + 0.45 * u01(hash1(uint(idx) * 2654435761u)));
  } else {
    if (KA.z > 0.5 && n.y > -2.0) b *= 0.4 + 0.6 * clamp((dot(n, uLit.xyz) + 0.25) / 1.25, 0.0, 1.0);
    b *= uLook.x;
    // lines on the ground (roads, streets) give way from far off: the coast stays the map's boldest line
    if (KB.w > 0.5 && KB.w < 1.5) b *= 1.0 - 0.45 * smoothstep(3000.0, 25000.0, d);
  }
  p.y -= curveDrop(p);
  vec4 c = toClip(p);
  if (c.w < uCam.w) { ${CULL} return; }
  gl_Position = c;
  vCol = finish(p, c, b * a, n, base);
  if (KA.w > 0.5) vCol = min(base * b * a * mix(0.4, 1.0, exp(-c.w / 60000.0)) * uFade.z, vec3(1.0));
  float pk = s * uNeed.w / d;
  float ps = KA.w > 0.5 ? (d < 2500.0 ? 2.0 : 1.0) : KB.w > 0.5 ? (d < 260.0 && pk > 4.5 ? 2.0 : 1.0) : pk > 13.0 ? 3.0 : pk > 4.5 ? 2.0 : 1.0;
  gl_PointSize = max(1.0, floor(ps * uCam.y + 0.5));
}
`;

export class StaticLayer {
  constructor(R, dots) {
    this.R = R;
    const gl = this.gl = R.gl, n = dots.n, P = dots.P, A = dots.A;
    const t0 = performance.now();
    // cells (500 m) over the returns' extent
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
    for (let i = 0; i < n; i++) { const x = P[i * 4], z = P[i * 4 + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
    if (!n) { x0 = z0 = 0; x1 = z1 = 1; }
    const cols = Math.floor((x1 - x0) / CELL) + 1, rows = Math.floor((z1 - z0) / CELL) + 1, NC = cols * rows;
    const cellOf = new Int32Array(n), cnt = new Int32Array(NC);
    for (let i = 0; i < n; i++) { const c = Math.floor((P[i * 4 + 2] - z0) / CELL) * cols + Math.floor((P[i * 4] - x0) / CELL); cellOf[i] = c; cnt[c]++; }
    // counting sort by cell, then by s (the spacing byte, descending) within each cell
    const cst = new Int32Array(NC + 1);
    for (let c = 0; c < NC; c++) cst[c + 1] = cst[c] + cnt[c];
    const byCell = new Int32Array(n), fillC = cst.slice(0, NC);
    for (let i = 0; i < n; i++) byCell[fillC[cellOf[i]]++] = i;
    const order = new Int32Array(n), qc = new Int32Array(257);
    const cells = [];                    // { c, cx, cz, lo, hi, chunks: [first chunk, n], sMax: Float32Array per chunk }
    let outN = 0, chunkN = 0;
    const chunkS = [];                   // per chunk: the spacing of its coarsest return
    for (let c = 0; c < NC; c++) {
      const a = cst[c], b = cst[c + 1];
      if (a === b) continue;
      qc.fill(0);
      for (let k = a; k < b; k++) qc[255 - (A[byCell[k]] & 255)]++;
      let acc = 0; for (let q = 0; q < 256; q++) { const v = qc[q]; qc[q] = acc; acc += v; }
      const base = outN;
      let lo = 1e9, hi = -1e9;
      for (let k = a; k < b; k++) { const i = byCell[k]; order[base + qc[255 - (A[i] & 255)]++] = i; const y = P[i * 4 + 1]; if (y < lo) lo = y; if (y > hi) hi = y; }
      outN += b - a;
      // pad the cell to whole chunks (the padding repeats its last, finest return: dropped by the per-return test)
      const nch = Math.ceil((b - a) / CH);
      const cell = { cx: x0 + (c % cols + .5) * CELL, cz: z0 + (Math.floor(c / cols) + .5) * CELL, lo, hi, first: chunkN, n: nch, base, count: b - a };
      cells.push(cell);
      for (let k = 0; k < nch; k++) chunkS.push(P[order[base + k * CH] * 4 + 3]);
      chunkN += nch;
    }
    // the texture: chunk-aligned
    const texN = chunkN * CH, trows = Math.max(1, Math.ceil(texN / TW)), data = new Uint32Array(TW * trows * 4), F = new Float32Array(data.buffer);
    for (const cell of cells) {
      for (let k = 0; k < cell.n * CH; k++) {
        const src = order[cell.base + Math.min(k, cell.count - 1)], o = (cell.first * CH + k) * 4;
        F[o] = P[src * 4]; F[o + 1] = P[src * 4 + 1]; F[o + 2] = P[src * 4 + 2];
        data[o + 3] = k < cell.count ? A[src] : (A[src] & ~255);        // padding: spacing byte 0 (never kept)
      }
    }
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32UI, TW, trows, 0, gl.RGBA_INTEGER, gl.UNSIGNED_INT, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this.cells = cells; this.chunkS = new Float32Array(chunkS); this.n = n; this.chunks = chunkN;
    this.P = program(gl, VS, FS_POINT, 'ground.static');
    this.list = new Uint32Array(Math.max(1024, chunkN));
    this.buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, this.list.byteLength, gl.DYNAMIC_DRAW);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribIPointer(0, 1, gl.UNSIGNED_INT, 4, 0);
    gl.vertexAttribDivisor(0, 1);
    gl.bindVertexArray(null);
    this.KA = new Float32Array(KINDS.length * 4); this.KB = new Float32Array(KINDS.length * 4);
    KINDS.forEach((k, i) => {
      this.KA.set([k.px, k.b, k.shade ? 1 : 0, k.night || 0], i * 4);
      this.KB.set([k.w || 0, k.wMin || 0, k.wMax || 0, k.line || 0], i * 4);
    });
    this.pxMin = Math.min(...KINDS.map(k => k.px));
    this.nList = 0; this.key = '';
    this.stats = { chunks: 0, returns: n, cells: cells.length, texMB: +(data.byteLength / 1048576).toFixed(1), build: Math.round(performance.now() - t0) };
    this._pl = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  }

  /* the chunks to draw for this view (kept while the view holds) */
  collect(cam, fl, pxScale) {
    const e = cam.eye, f = cam.f, K = this._k || (this._k = new Float64Array(10));
    const hg = Math.max(15, e[1] - Math.max(0, this.R.terrain.heightAt(e[0], e[2]))), mv = Math.hypot(e[0] - K[0], e[1] - K[1], e[2] - K[2]);
    if (K[9] && mv < .015 * hg && f[0] * K[3] + f[1] * K[4] + f[2] * K[5] > .9992 && K[6] === cam.W && K[7] === cam.H && K[8] === pxScale) return;
    K[0] = e[0]; K[1] = e[1]; K[2] = e[2]; K[3] = f[0]; K[4] = f[1]; K[5] = f[2]; K[6] = cam.W; K[7] = cam.H; K[8] = pxScale; K[9] = 1;
    const r = cam.r, u = cam.u, tx = (cam.W / 2) / cam.fl * 1.06 + .045, ty = (cam.H / 2) / cam.fl * 1.06 + .045, PL = this._pl;
    const setP = (P, a, b, c, d) => { P[0] = a; P[1] = b; P[2] = c; P[3] = d; };
    setP(PL[0], f[0], f[1], f[2], -cam.near);
    setP(PL[1], r[0] + f[0] * tx, r[1] + f[1] * tx, r[2] + f[2] * tx, 0);
    setP(PL[2], -r[0] + f[0] * tx, -r[1] + f[1] * tx, -r[2] + f[2] * tx, 0);
    setP(PL[3], u[0] + f[0] * ty, u[1] + f[1] * ty, u[2] + f[2] * ty, 0);
    setP(PL[4], -u[0] + f[0] * ty, -u[1] + f[1] * ty, -u[2] + f[2] * ty, 0);
    const ex = e[0], ey = e[1], ez = e[2], H = CELL / 2, L = this.list, S = this.chunkS, k0 = this.pxMin * pxScale / fl * .9;
    let m = 0;
    for (const c of this.cells) {
      const bx0 = c.cx - H - ex, bx1 = c.cx + H - ex, bz0 = c.cz - H - ez, bz1 = c.cz + H - ez;
      const fx = Math.max(Math.abs(bx0), Math.abs(bx1)), fz = Math.max(Math.abs(bz0), Math.abs(bz1));
      const by0 = c.lo - 1 - ey - (fx * fx + fz * fz) / (2 * R_EARTH), by1 = c.hi + 1 - ey;
      let vis = true;
      for (let k = 0; k < 5; k++) {
        const P = PL[k];
        if (P[0] * (P[0] > 0 ? bx1 : bx0) + P[1] * (P[1] > 0 ? by1 : by0) + P[2] * (P[2] > 0 ? bz1 : bz0) + P[3] < 0) { vis = false; break; }
      }
      if (!vis) continue;
      const qx = bx0 > 0 ? bx0 : bx1 < 0 ? -bx1 : 0, qz = bz0 > 0 ? bz0 : bz1 < 0 ? -bz1 : 0, qy = by0 > 0 ? by0 : by1 < 0 ? -by1 : 0;
      const need = Math.max(1, Math.hypot(qx, qy, qz)) * k0;
      for (let q = 0; q < c.n; q++) { const ci = c.first + q; if (S[ci] < need) break; L[m++] = ci; }
    }
    this.nList = m;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, L, 0, m);
    this.stats.chunks = m;
  }

  draw(o) {
    if (!this.nList) return;
    const gl = this.gl, P = this.P, u = P.u;
    gl.useProgram(P.p);
    bindGround(gl, P, this.R.terrain, o);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.tex); gl.uniform1i(u.uData, 3);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform4fv(u.uKA, this.KA); gl.uniform4fv(u.uKB, this.KB);
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.POINTS, 0, CH, this.nList);
    gl.bindVertexArray(null);
  }
}
