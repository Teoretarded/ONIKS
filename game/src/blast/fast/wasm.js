/* The fast damage model's core in WebAssembly (built from rs/: `cargo build --release --target wasm32-unknown-unknown`,
   then copy rs/target/wasm32-unknown-unknown/release/fast_core.wasm here). loadCore() -> core(P, C) with the same output
   as core.js solveCore (plates indexed by their input order). */
const HDR = 16, PN = 12;
export async function loadCore(url = new URL('./fast_core.wasm', import.meta.url)) {
  const { instance } = await WebAssembly.instantiate(await (await fetch(url)).arrayBuffer(), {});
  const X = instance.exports;
  return function core(P, C) {
    const nP = P.length / PN, pp = X.alloc_f64(P.length), cp = X.alloc_f64(8);
    new Float64Array(X.memory.buffer, pp, P.length).set(P);
    new Float64Array(X.memory.buffer, cp, 8).set(C);
    const len = X.solve_wasm(pp, nP, cp);
    X.free_f64(pp, P.length); X.free_f64(cp, 8);
    const O = new Float32Array(X.memory.buffer, X.out_ptr(), len), plates = new Array(nP);
    let o = 0;
    const take = k => { const a = O.slice(o, o + k); o += k; return a; };
    for (let q = 0; q < nP; q++) {
      const h = O.subarray(o, o + HDR), n = h[15]; o += HDR;
      const L = { p: h[0], ax: h[1], val: h[2], ua: h[3], va: h[4], u0: h[5], v0: h[6], nu: h[7], nv: h[8], h: h[9], S: h[10], skin: h[11] > .5, sgn: h[12], cu: h[13], cv: h[14] };
      L.D = take(3 * n); L.TA = take(n); L.TR = take(n); L.Q = take(n); L.FL = Uint8Array.from(take(n)); L.SO = take(n); L.V = take(n);
      L.FA = take(n); L.FLn = take(n); L.HX = take(n); L.DN = take(n);
      plates[L.p] = L;
    }
    return { plates };
  };
}
