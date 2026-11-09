/* Voxel ships (prototype): phase A of a hit on the graphics card (WebGPU compute, in the worker). The same model as
   vox/solver.js's CPU loop (bondsStep, bendStep, integrate): per step one pass over the bonds (elastic-plastic, they
   tear past their failure strain: each node's tear time and bond count kept with atomics), one over the bending
   triplets (plastic hinges), one over the free nodes (each gathers its bonds' and triplets' forces through its own
   lists, the gas on its space's walls, its blast impulse at its arrival time, then steps). Up to 256 steps a command
   buffer; positions read back at the frames' times.

   Eight storage buffers (WebGPU's default limit), packed:
     state  2 vec4 a node: position (w 0), velocity (w inverse mass)
     nodeS  3 vec4 a node: rest normal (w gas sign), impulse (w arrival s), (x shatter time s)
     atom   2 u32 a node (atomic): bonds left, tear time (f32 bits)
     bondS  vec4<u32> a bond: a, b, stiffness (f32 bits), damping (f32 bits)
     bondW  2 vec4 a bond: L0 LR EY EF, force on a (w 1 alive / 0 torn)
     tripS  2 vec4<u32> a triplet: a i b (bond a-i), (bond i-b, yield (f32 bits))
     tripW  2 vec4 a triplet: plastic offset (w kb), force (xyz)
     csr    the free nodes' bond lists and triplet lists (offsets, then entries; bases in the uniform)

   createGpu() -> Promise<G | null>;  runPhaseA(G, M, o) -> Promise<{ x, v (Float32 4 nl), alive (Uint8 nb), deg, edgeT, steps }> */

const WG = 128;
const WGSL = /* wgsl */`
struct U { t: f32, dt: f32, kd: f32, vmax2: f32, gasP: f32, s2: f32, nFree: u32, nb: u32, nt: u32, nlB: u32, toB: u32, tlB: u32, ox: f32, oy: f32, oz: f32, cell: f32, gn: u32, occB: u32, pad0: u32, pad1: u32 };
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var<storage, read_write> state: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> nodeS: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> atom: array<atomic<u32>>;
@group(0) @binding(4) var<storage, read> bondS: array<vec4<u32>>;
@group(0) @binding(5) var<storage, read_write> bondW: array<vec4<f32>>;
@group(0) @binding(6) var<storage, read> tripS: array<vec4<u32>>;
@group(0) @binding(7) var<storage, read_write> tripW: array<vec4<f32>>;
@group(0) @binding(8) var<storage, read> csr: array<u32>;

/* the region's occupancy (a bit a cell of the lattice's grid, after the nodes' counts in atom): a node that comes
   loose leaves its cell empty, a loose node entering a full cell (not its own neighbourhood) is stopped in it */
fn cellIx(p: vec3<f32>) -> i32 {
  let g = vec3<i32>(floor((p - vec3<f32>(u.ox, u.oy, u.oz)) / u.cell));
  let n = i32(u.gn);
  if (any(g < vec3<i32>(0)) || any(g >= vec3<i32>(n))) { return -1; }
  return g.x + n * (g.y + n * g.z);
}
fn freeCell(a: u32) {
  let c = bitcast<i32>(bitcast<u32>(nodeS[3u * a + 2u].y));
  if (c < 0) { return; }
  atomicAnd(&atom[u.occB + u32(c) / 32u], ~(1u << (u32(c) % 32u)));
}
fn tear(q: u32, a: u32, b: u32) {
  bondW[2u * q + 1u] = vec4<f32>(0.0);
  if (atomicSub(&atom[2u * a], 1u) == 1u) { freeCell(a); }
  if (atomicSub(&atom[2u * b], 1u) == 1u) { freeCell(b); }
  let tb = bitcast<u32>(u.t);
  atomicMin(&atom[2u * a + 1u], tb); atomicMin(&atom[2u * b + 1u], tb);
}

@compute @workgroup_size(${WG})
fn bondsK(@builtin(global_invocation_id) id: vec3<u32>) {
  let q = id.x; if (q >= u.nb) { return; }
  if (bondW[2u * q + 1u].w == 0.0) { return; }
  let B = bondS[q]; let a = B.x; let b = B.y;
  if (nodeS[3u * a + 2u].x <= u.t || nodeS[3u * b + 2u].x <= u.t) { tear(q, a, b); return; }
  let d = state[2u * b].xyz - state[2u * a].xyz;
  let L = length(d) + 1e-12;
  var P = bondW[2u * q];
  let ey = P.z * P.y;
  if (L - P.x > ey) { P.x = L - ey; } else if (P.x - L > ey) { P.x = L + ey; }
  bondW[2u * q] = P;
  if (P.x - P.y > P.w * P.y) { tear(q, a, b); return; }
  let un = d / L;
  let rv = dot(state[2u * b + 1u].xyz - state[2u * a + 1u].xyz, un);
  let f = bitcast<f32>(B.z) * (L - P.x) + bitcast<f32>(B.w) * rv;
  bondW[2u * q + 1u] = vec4<f32>(un * f, 1.0);
}

@compute @workgroup_size(${WG})
fn tripsK(@builtin(global_invocation_id) id: vec3<u32>) {
  let q = id.x; if (q >= u.nt) { return; }
  let T = tripS[2u * q]; let T2 = tripS[2u * q + 1u];
  if (bondW[2u * T.w + 1u].w == 0.0 || bondW[2u * T2.x + 1u].w == 0.0) { tripW[2u * q + 1u] = vec4<f32>(0.0); return; }
  var D = tripW[2u * q];
  var e = state[2u * T.y].xyz - 0.5 * (state[2u * T.x].xyz + state[2u * T.z].xyz) - D.xyz;
  let lim = bitcast<f32>(T2.y);
  let e2 = dot(e, e);
  if (e2 > lim * lim) { let k = 1.0 - lim / sqrt(e2); D = vec4<f32>(D.xyz + e * k, D.w); e = e * (1.0 - k); tripW[2u * q] = D; }
  tripW[2u * q + 1u] = vec4<f32>(e * D.w, 0.0);
}

@compute @workgroup_size(${WG})
fn nodesK(@builtin(global_invocation_id) id: vec3<u32>) {
  let a = id.x; if (a >= u.nFree) { return; }
  var F = vec3<f32>(0.0);
  for (var k = csr[a]; k < csr[a + 1u]; k++) { let e = csr[u.nlB + k]; let f = bondW[2u * (e >> 1u) + 1u].xyz; if ((e & 1u) == 0u) { F += f; } else { F -= f; } }
  for (var k = csr[u.toB + a]; k < csr[u.toB + a + 1u]; k++) { let e = csr[u.tlB + k]; let f = tripW[2u * (e >> 1u) + 1u].xyz; if ((e & 1u) == 0u) { F -= f; } else { F += 0.5 * f; } }
  let dg = atomicLoad(&atom[2u * a]);
  let N = nodeS[3u * a];
  if (N.w != 0.0 && dg > 0u) { F += N.xyz * (N.w * u.gasP * u.s2); }
  var V = state[2u * a + 1u];
  let I = nodeS[3u * a + 1u];
  var v3 = V.xyz;
  if (I.w > u.t - u.dt && I.w <= u.t) { v3 += I.xyz; }
  v3 += F * (V.w * u.dt);
  if (dg >= 3u) { v3 *= u.kd; }
  let s2 = dot(v3, v3); if (s2 > u.vmax2) { v3 *= sqrt(u.vmax2 / s2); }
  var pn = state[2u * a].xyz + v3 * u.dt;
  if (dg == 0u) {
    // a loose cell: the sea stops it within a few metres; plating in its way (two cells or more from where it came
    // loose) stops it where it struck
    if (pn.y < 0.0) { v3 *= exp(-u.dt * 150.0); }
    let c = cellIx(pn);
    let c0 = bitcast<i32>(bitcast<u32>(nodeS[3u * a + 2u].y));
    if (c >= 0 && c0 >= 0 && c != c0) {
      let n = i32(u.gn);
      let g = vec3<i32>(c % n, (c / n) % n, c / (n * n));
      let g0 = vec3<i32>(c0 % n, (c0 / n) % n, c0 / (n * n));
      let dd = abs(g - g0);
      if (max(dd.x, max(dd.y, dd.z)) >= 2 && (atomicLoad(&atom[u.occB + u32(c) / 32u]) & (1u << (u32(c) % 32u))) != 0u) {
        v3 = vec3<f32>(0.0); pn = state[2u * a].xyz;
      }
    }
  }
  state[2u * a + 1u] = vec4<f32>(v3, V.w);
  state[2u * a] = vec4<f32>(pn, 0.0);
}
`;

export async function createGpu() {
  try {
    if (!self.navigator || !navigator.gpu) return null;
    const ad = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }); if (!ad) return null;
    const device = await ad.requestDevice({ requiredLimits: { maxStorageBufferBindingSize: ad.limits.maxStorageBufferBindingSize, maxBufferSize: ad.limits.maxBufferSize } });
    const mod = device.createShaderModule({ code: WGSL });
    const info = await mod.getCompilationInfo(); const bad = info.messages.filter(m => m.type === 'error'); if (bad.length) { console.error('vox gpu', bad.map(m => m.lineNum + ': ' + m.message).join('\n')); return null; }
    const ro = { type: 'read-only-storage' }, rw = { type: 'storage' }, C = GPUShaderStage.COMPUTE;
    const bgl = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: C, buffer: { type: 'uniform' } }, ...[rw, ro, rw, ro, rw, ro, rw, ro].map((b, i) => ({ binding: i + 1, visibility: C, buffer: b }))] });
    const layout = device.createPipelineLayout({ bindGroupLayouts: [bgl] });
    const mk = e => device.createComputePipeline({ layout, compute: { module: mod, entryPoint: e } });
    const G = { device, bgl, P: { bonds: mk('bondsK'), trips: mk('tripsK'), nodes: mk('nodesK') }, lost: false };
    device.lost.then(() => { G.lost = true; });
    return G;
  } catch (e) { console.warn('vox gpu: none', e); return null; }
}

const f2u = (() => { const f = new Float32Array(1), u = new Uint32Array(f.buffer); return v => { f[0] = v; return u[0]; }; })();

export async function runPhaseA(G, M, o) {
  const d = G.device, nl = M.nl, nb = M.nb, nt = M.nt;
  const S = GPUBufferUsage.STORAGE, CD = GPUBufferUsage.COPY_DST, CS = GPUBufferUsage.COPY_SRC;
  const bufs = [];
  const buf = (data, usage = S | CD | CS) => { const b = d.createBuffer({ size: Math.max(16, (data.byteLength + 15) & ~15), usage, mappedAtCreation: true }); new data.constructor(b.getMappedRange(0, data.byteLength)).set(data); b.unmap(); bufs.push(b); return b; };
  const st = new Float32Array(nl * 8);
  for (let i = 0; i < nl; i++) { for (let k = 0; k < 3; k++) { st[8 * i + k] = M.x[3 * i + k]; st[8 * i + 4 + k] = M.v[3 * i + k]; } st[8 * i + 7] = M.w[i]; }
  const ns = new Float32Array(nl * 12);
  const nsU = new Uint32Array(ns.buffer);       // (int bits written through an integer view: a float view would turn a NaN pattern canonical)
  for (let i = 0; i < nl; i++) { for (let k = 0; k < 3; k++) ns[12 * i + k] = M.nrm[3 * i + k]; ns[12 * i + 3] = M.gasSign[i]; ns[12 * i + 7] = -1; ns[12 * i + 8] = 1e9; }
  for (const [t, a, ax, ay, az] of M.imp) { ns[12 * a + 4] = ax; ns[12 * a + 5] = ay; ns[12 * a + 6] = az; ns[12 * a + 7] = Math.max(t, 1e-9); }
  for (const [t, a] of M.blow) ns[12 * a + 8] = Math.min(ns[12 * a + 8], Math.max(t, 0));
  // the region's occupancy grid (a cube round the charge, the lattice's cell), after the nodes' counts
  const gc = M.S, gn = Math.min(160, Math.ceil(2 * (M.R + 2) / gc)), go = [M.C[0] - gn * gc / 2, M.C[1] - gn * gc / 2, M.C[2] - gn * gc / 2];
  const words = Math.ceil(gn * gn * gn / 32), occB = nl * 2;
  const at = new Uint32Array(nl * 2 + words); for (let i = 0; i < nl; i++) { at[2 * i] = M.deg[i]; at[2 * i + 1] = f2u(1e9); }
  const cellOfP = (x, y, z) => { const a = Math.floor((x - go[0]) / gc), b = Math.floor((y - go[1]) / gc), c = Math.floor((z - go[2]) / gc); return a < 0 || b < 0 || c < 0 || a >= gn || b >= gn || c >= gn ? -1 : a + gn * (b + gn * c); };
  const nodeCell = new Int32Array(nl);
  for (let i = 0; i < nl; i++) { const c = cellOfP(M.x[3 * i], M.x[3 * i + 1], M.x[3 * i + 2]); nodeCell[i] = c; if (c >= 0 && (i >= M.nFree || M.deg[i] > 0)) at[occB + (c >>> 5)] |= 1 << (c & 31); }
  // (other cells of the ship inside the cube: the occupancy the caller adds, M.occ: world points of the rest of the lattice)
  if (M.occ) for (let k = 0; k < M.occ.length; k += 3) { const c = cellOfP(M.occ[k], M.occ[k + 1], M.occ[k + 2]); if (c >= 0) at[occB + (c >>> 5)] |= 1 << (c & 31); }
  for (let i = 0; i < nl; i++) nsU[12 * i + 9] = nodeCell[i] >>> 0;
  const bs = new Uint32Array(Math.max(1, nb) * 4), bw = new Float32Array(Math.max(1, nb) * 8);
  for (let q = 0; q < nb; q++) { bs[4 * q] = M.BI[q]; bs[4 * q + 1] = M.BJ[q]; bs[4 * q + 2] = f2u(M.BK[q]); bs[4 * q + 3] = f2u(M.BC[q]); bw[8 * q] = M.L0[q]; bw[8 * q + 1] = M.LR[q]; bw[8 * q + 2] = M.EY[q]; bw[8 * q + 3] = M.EF[q]; bw[8 * q + 7] = M.ALIVE[q] ? 1 : 0; }
  const ts = new Uint32Array(Math.max(1, nt) * 8), tw = new Float32Array(Math.max(1, nt) * 8);
  for (let q = 0; q < nt; q++) { ts[8 * q] = M.TA[q]; ts[8 * q + 1] = M.TI[q]; ts[8 * q + 2] = M.TB[q]; ts[8 * q + 3] = M.TQA[q]; ts[8 * q + 4] = M.TQB[q]; ts[8 * q + 5] = f2u(M.TEY[q]); for (let k = 0; k < 3; k++) tw[8 * q + k] = M.TD[3 * q + k]; tw[8 * q + 3] = M.TKB[q]; }
  // the free nodes' lists (CSR): bonds q * 2 + (1: the node is b), triplets q * 2 + (1: the node is an end)
  const nOff = new Uint32Array(nl + 1), tOff = new Uint32Array(nl + 1);
  for (let q = 0; q < nb; q++) { nOff[M.BI[q] + 1]++; nOff[M.BJ[q] + 1]++; }
  for (let q = 0; q < nt; q++) { tOff[M.TI[q] + 1]++; tOff[M.TA[q] + 1]++; tOff[M.TB[q] + 1]++; }
  for (let i = 0; i < nl; i++) { nOff[i + 1] += nOff[i]; tOff[i + 1] += tOff[i]; }
  const NL = nOff[nl], TL = tOff[nl], csr = new Uint32Array(nl + 1 + NL + nl + 1 + TL), nlB = nl + 1, toB = nlB + NL, tlB = toB + nl + 1;
  csr.set(nOff, 0); csr.set(tOff, toB);
  { const fn = nOff.slice(0, nl), ft = tOff.slice(0, nl);
    for (let q = 0; q < nb; q++) { csr[nlB + fn[M.BI[q]]++] = q * 2; csr[nlB + fn[M.BJ[q]]++] = q * 2 + 1; }
    for (let q = 0; q < nt; q++) { csr[tlB + ft[M.TI[q]]++] = q * 2; csr[tlB + ft[M.TA[q]]++] = q * 2 + 1; csr[tlB + ft[M.TB[q]]++] = q * 2 + 1; } }
  const B = { state: buf(st), nodeS: buf(ns), atom: buf(at), bondS: buf(bs), bondW: buf(bw), tripS: buf(ts), tripW: buf(tw), csr: buf(csr) };
  const BATCH = 256;
  const ub = d.createBuffer({ size: 256 * BATCH, usage: GPUBufferUsage.COPY_SRC | CD }); bufs.push(ub);
  const uc = d.createBuffer({ size: 256, usage: GPUBufferUsage.UNIFORM | CD }); bufs.push(uc);
  const bg = d.createBindGroup({ layout: G.bgl, entries: [{ binding: 0, resource: { buffer: uc, size: 80 } }, ...['state', 'nodeS', 'atom', 'bondS', 'bondW', 'tripS', 'tripW', 'csr'].map((k, i) => ({ binding: i + 1, resource: { buffer: B[k] } }))] });
  const stage = size => { const s = d.createBuffer({ size, usage: GPUBufferUsage.MAP_READ | CD }); bufs.push(s); return s; };
  const sSt = stage(nl * 32), sAt = stage(nl * 8);
  async function readBack() {
    const enc = d.createCommandEncoder();
    enc.copyBufferToBuffer(B.state, 0, sSt, 0, nl * 32); enc.copyBufferToBuffer(B.atom, 0, sAt, 0, nl * 8);
    d.queue.submit([enc.finish()]);
    await Promise.all([sSt.mapAsync(GPUMapMode.READ), sAt.mapAsync(GPUMapMode.READ)]);
    const P = new Float32Array(sSt.getMappedRange().slice(0)), A = sAt.getMappedRange().slice(0);
    sSt.unmap(); sAt.unmap();
    const Au = new Uint32Array(A), Af = new Float32Array(A), deg = new Uint32Array(nl), edgeT = new Float32Array(nl);
    for (let i = 0; i < nl; i++) { deg[i] = Au[2 * i]; edgeT[i] = Af[2 * i + 1]; }
    return { P, deg, edgeT };
  }
  const UA = new ArrayBuffer(256 * BATCH), UF = new Float32Array(UA), UU = new Uint32Array(UA);
  const DT = o.DT, kd = Math.exp(-DT / .05), vmax2 = 1500 * 1500, s2 = M.S * M.S;
  const nbG = Math.max(1, Math.ceil(nb / WG)), ntG = Math.max(1, Math.ceil(nt / WG)), nnG = Math.max(1, Math.ceil(M.nFree / WG));
  let t = 0, steps = 0, fk = 0, gas = o.gasAt ? o.gasAt(0, null) : { P: 0, k: 0 };
  const FT = o.FT, total = Math.round(o.tEnd / DT);
  for (;;) {
    if (G.lost) throw new Error('vox gpu: device lost');
    if (fk < FT.length && steps >= Math.round(FT[fk] / DT)) {
      const R = await readBack();
      o.frame(FT[fk], R);
      if (o.gasAt) gas = o.gasAt(t, R.deg);
      fk++; continue;
    }
    if (steps >= total) break;
    const next = fk < FT.length ? Math.round(FT[fk] / DT) : total, n = Math.max(1, Math.min(BATCH, next - steps, total - steps));
    for (let k = 0; k < n; k++) {
      const o2 = 64 * k;
      UF[o2] = t + k * DT; UF[o2 + 1] = DT; UF[o2 + 2] = kd; UF[o2 + 3] = vmax2; UF[o2 + 4] = gas.P * Math.exp(-k * DT * gas.k); UF[o2 + 5] = s2;
      UU[o2 + 6] = M.nFree; UU[o2 + 7] = nb; UU[o2 + 8] = nt; UU[o2 + 9] = nlB; UU[o2 + 10] = toB; UU[o2 + 11] = tlB;
      UF[o2 + 12] = go[0]; UF[o2 + 13] = go[1]; UF[o2 + 14] = go[2]; UF[o2 + 15] = gc; UU[o2 + 16] = gn; UU[o2 + 17] = occB;
    }
    d.queue.writeBuffer(ub, 0, UA, 0, 256 * n);
    const enc = d.createCommandEncoder();
    for (let k = 0; k < n; k++) {
      enc.copyBufferToBuffer(ub, 256 * k, uc, 0, 80);
      const p = enc.beginComputePass();
      p.setBindGroup(0, bg);
      p.setPipeline(G.P.bonds); p.dispatchWorkgroups(nbG);
      p.setPipeline(G.P.trips); p.dispatchWorkgroups(ntG);
      p.setPipeline(G.P.nodes); p.dispatchWorkgroups(nnG);
      p.end();
    }
    d.queue.submit([enc.finish()]);
    t += n * DT; steps += n;
    if (gas.P) gas = { P: gas.P * Math.exp(-n * DT * gas.k), k: gas.k };
  }
  // the end state for the CPU: positions, velocities, bonds alive, counts, tear times
  const sBw = stage(Math.max(1, nb) * 32);
  { const enc = d.createCommandEncoder(); enc.copyBufferToBuffer(B.bondW, 0, sBw, 0, Math.max(1, nb) * 32); d.queue.submit([enc.finish()]); }
  const R = await readBack();
  await sBw.mapAsync(GPUMapMode.READ);
  const BW = new Float32Array(sBw.getMappedRange().slice(0)); sBw.unmap();
  const alive = new Uint8Array(nb), L0 = new Float32Array(nb); for (let q = 0; q < nb; q++) { alive[q] = BW[8 * q + 7] !== 0 ? 1 : 0; L0[q] = BW[8 * q]; }
  for (const b of bufs) b.destroy();
  return { P: R.P, alive, L0, deg: R.deg, edgeT: R.edgeT, steps, t };
}
