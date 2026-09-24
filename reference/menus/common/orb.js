/* ORBITAL CATALOG helpers: per-object barcode ticks, highlighter swipes,
   catalog labels. Deterministic (hash of the designation), no randomness. */
(function () {
  function h32(s) {
    let h = 2166136261 >>> 0;
    for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
    return h || 1;
  }
  function rng(seed) {
    let s = h32(seed);
    return () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return (s >>> 8) / 16777216; };
  }
  // barcode ticks: identity glyph of a catalogued object
  function bars(id, o) {
    o = o || {};
    const H = o.h || 9, n = o.n || 11, r = rng(id);
    let x = 0, out = '';
    for (let i = 0; i < n; i++) {
      const w = r() < .28 ? 2 : 1, short = r() < .18;
      const hh = short ? Math.round(H * .55) : H;
      out += `<rect x="${x}" y="${H - hh}" width="${w}" height="${hh}"/>`;
      x += w + (r() < .35 ? 2 : 1.5);
    }
    x = Math.ceil(x - 1);
    return `<svg class="bars" width="${x}" height="${H}" viewBox="0 0 ${x} ${H}">${out}</svg>`;
  }
  // highlighter: chisel-tip ends, slightly wavy edges, a darker second pass
  function swipe(seed, o) {
    o = o || {};
    const r = rng('sw' + seed);
    const t0 = 2.5 + r() * 2, t1 = 1.5 + r() * 2.5, b0 = 17 + r() * 1.8, b1 = 16.5 + r() * 2.2;
    const m1 = (t0 + t1) / 2 - .8 - r(), m2 = (b0 + b1) / 2 + .6 + r();
    const p = `M1.6 ${t0.toFixed(2)} C28 ${(t0 - .6).toFixed(2)} 60 ${m1.toFixed(2)} 99.2 ${t1.toFixed(2)} L98.2 ${(t1 + 3).toFixed(2)} L99.4 ${b1.toFixed(2)} C64 ${(b1 + .4).toFixed(2)} 30 ${m2.toFixed(2)} .4 ${b0.toFixed(2)} L1.2 ${(b0 - 4).toFixed(2)} Z`;
    const p2 = `M3 ${(t0 + 1.2).toFixed(2)} C40 ${(m1 + 1.5).toFixed(2)} 70 ${(t1 + 2).toFixed(2)} 96 ${(t1 + 1.6).toFixed(2)} L96 ${(t1 + 4.5).toFixed(2)} C60 ${(t1 + 4).toFixed(2)} 30 ${(t0 + 4.8).toFixed(2)} 3 ${(t0 + 4.2).toFixed(2)} Z`;
    return `<svg class="sw" viewBox="0 0 100 20" preserveAspectRatio="none"><path d="${p}" fill-opacity="${o.a || .92}"/><path d="${p2}" fill-opacity=".35"/></svg>`;
  }
  function hl(text, seed, o) { return `<span class="hl">${swipe(seed || text, o)}<span class="tx">${text}</span></span>`; }
  // catalog label: square + designation + barcode (+ optional trailing text)
  function cat(id, o) {
    o = o || {};
    const sq = `<i class="sq ${o.sq || ''}"></i>`;
    const b = o.nobars ? '' : bars(o.code || id, { h: o.bh || 9, n: o.bn || 10 });
    const lead = o.barsFirst ? b + sq : sq;
    const tail = o.barsFirst ? '' : b;
    return `<span class="cat ${o.cls || ''}">${lead}<span>${id}</span>${tail}${o.after ? `<span class="aft">${o.after}</span>` : ''}</span>`;
  }
  window.ORB = { h32, rng, bars, swipe, hl, cat };
})();
