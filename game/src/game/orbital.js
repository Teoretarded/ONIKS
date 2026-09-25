/* ORBITAL: the strategic layer. As the camera pulls out past ~40 km the Point Cloud picture cross-fades into the
   Orbital films' language (oa_scale, o3_orbit, Ring, Salvo): pure black, the coast and the contours of the map as
   white hairlines, a faint 10 km graticule and the map frame, range rings round your radars and batteries, units
   as small hairline glyphs with catalog labels (square + designation + barcode, DM Mono), your rounds in flight as
   yellow tracks, enemy tracks white with a thin coral mark only where hostility must read, place names in Inter.
   Zooming back in re-condenses the dots. The HUD stays as it is.

   Yellow is kept for one thing at a time: your salvo while one is in flight, else your selection.

   How the cross-fade works (no cut): k = smoothstep(from, to, camera distance). The engine draws the point frame as
   usual; after the sensors' own GPU passes this system darkens it toward black by the veil (R.veil) and draws the
   hairlines (R.wire, MAX blend) on top; on the overlay it fades the world tags drawn before it (the sensors'
   Point Cloud chips) the same way and draws its own labels. At k = 1 the engine skips the point passes entirely
   (R.pcOff): the strategic layer is cheaper than the picture it replaces. The EO inset (sensors) is left alone.

   The full Orbital render style (Settings, Graphics, Render style: getSettings().renderStyle 'pointcloud' | 'orbital',
   applied live; ?style=orbital overrides) is set here on the renderer (R.style): every model, the map and the sea are
   hairlines at every height (engine/wire_models.js, wire_sea.js); this system then draws the frame's second half
   after the sensors' passes (a veil over their point clutter first), paints the selection's models yellow, and keeps
   the rounds' tracks at every height. The strategic layer on top works the same in both styles.

   The map's own hairlines (coast, then contours and soundings, then the graticule) lead: they come in from mapFrom
   (22 km) over the dots, so the band where the dots go and the glyphs come (36-60 km) always has the chart in it.

   game.orbital = { k, kMap (the map hairlines' blend), from, to, mapFrom, map (the engine's OrbitalMap),
                    yellow: 'salvo' | 'selection', veil, stats }
   Registered from main.js (OPTIONAL: ./game/orbital.js, createOrbital). Also returns a tiny helper system at
   priority 14 (just under the sensors) that keeps a copy of the overlay drawn before the sensors (UI panels) so
   the fade only takes the world tags. While k > .5 it mutes the selection system's lime marks (see wrapSelection). */
import { getSettings, onSettings } from '../data/settings.js';

const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;
const ss = (a, b, v) => { const t = sat((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const TAU = Math.PI * 2;
const HI = [244 / 255, 210 / 255, 60 / 255], WH = [246 / 255, 245 / 255, 242 / 255], CO = [1, 106 / 255, 61 / 255];
const C_W = '#F6F5F2', C_HI = '#F4D23C', C_CO = '#FF6A3D';
const MONO = '"DM Mono", "Geist Mono", Consolas, monospace', SANS = 'Inter, Geist, "Segoe UI", sans-serif';
const KN = 1 / 0.5144;

/* ---------- catalog glyphs: barcode (reference/menus/common/orb.js, deterministic from the designation) ---------- */
function h32(s) { let h = 2166136261 >>> 0; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h || 1; }
function bars(code) {
  let s = h32(code);
  const r = () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return (s >>> 8) / 16777216; };
  const out = []; let x = 0;
  for (let i = 0; i < 10; i++) { const w = r() < .28 ? 2 : 1, short = r() < .18; out.push(x, w, short ? .55 : 1); x += w + (r() < .35 ? 2 : 1.5); }
  return { b: out, w: Math.ceil(x - 1) };
}

export function createOrbital(game) {
  const R = game.R, sim = game.sim, map = game.map, cam = game.camera, W = R.wire;
  if (!W) { console.warn('orbital: the renderer has no hairlines; the strategic layer is off'); return null; }
  const OM = R.orbitalMap();
  /* the full Orbital render style (Settings: renderStyle 'pointcloud' | 'orbital'; ?style=orbital overrides) */
  const styleOf = s => { const q = new URLSearchParams(location.search).get('style'); return q === 'orbital' || q === 'pointcloud' ? q : (s && s.renderStyle) || 'pointcloud'; };
  R.style = styleOf(getSettings());
  onSettings(s => { const v = styleOf(s); if (v !== R.style) { R.style = v; console.log('ONIKS: render style ' + v); } });
  // mapFrom: the map's hairlines (coast first, then the contours) come in from here, over the dots, before the veil
  // takes the dots: the band between the point picture and the strategic layer is never empty (the films' mixed layers)
  const O = game.orbital = { k: 0, kMap: 0, from: 36000, to: 60000, mapFrom: 22000, map: OM, yellow: 'selection', stats: { ms: 0, labels: 0 }, veil: 0, dissolve: .85 };
  W.auto = false;                     // this system flushes the hairlines itself, after the veil (draw2d)
  addFonts();

  let K = 0, sup = 1;                 // sup: 0 while the radar view or Inspect has the screen
  let inspecting = false;
  game.bus.on('inspect', d => { inspecting = !!(d && d.on); });

  /* ---------- rounds in flight: their flown tracks ---------- */
  const trails = new Map();           // proj id -> { pts, n, side, kind, P, alive, tEnd, aim, target, tk, why, step }
  const bursts = [];                  // { pos, t0, kind: 'hit' | 'intercept' | 'splash' | 'kill', own }
  const wrecks = [];                  // { pos, t0 }
  function record(pr) {
    let T = trails.get(pr.id);
    const p = game.projPose(pr).pos;
    if (!T) {
      const P = pr.P || game.PROJ[pr.kind] || {};
      T = { id: pr.id, pts: new Float32Array(3 * 512), n: 0, side: pr.side, kind: pr.kind, P, alive: true, tEnd: 0, aim: pr.aim, target: pr.target, tk: pr.tk,
        step: P.mode === 'ballistic' ? 60 : 120, from: pr.fromPos ? pr.fromPos.slice() : p.slice(), off: !!P.threat };
      trails.set(pr.id, T);
      push(T, T.from[0], T.from[1], T.from[2]);
    }
    const o = (T.n - 1) * 3, d = Math.hypot(p[0] - T.pts[o], p[2] - T.pts[o + 2], (p[1] - T.pts[o + 1]) * 2);
    if (d > T.step) push(T, p[0], p[1], p[2]);
    T.head = T.head || [0, 0, 0]; T.head[0] = p[0]; T.head[1] = p[1]; T.head[2] = p[2];
    T.spd = Math.hypot(pr.vel[0], pr.vel[1], pr.vel[2]);
  }
  function push(T, x, y, z) {
    if (T.n * 3 >= T.pts.length) {
      // full: keep every other point (the start and the latest stay), and space the next ones twice as far
      const P = T.pts; let m = 0;
      for (let i = 0; i < T.n; i += 2) { P[m * 3] = P[i * 3]; P[m * 3 + 1] = P[i * 3 + 1]; P[m * 3 + 2] = P[i * 3 + 2]; m++; }
      T.n = m; T.step *= 2;
    }
    const o = T.n * 3; T.pts[o] = x; T.pts[o + 1] = y; T.pts[o + 2] = z; T.n++;
  }

  /* ---------- labels ---------- */
  const widths = new Map();
  function tw(ctx, font, s) {
    const k = font + '|' + s;
    let w = widths.get(k);
    if (w === undefined) { ctx.font = font; w = ctx.measureText(s).width; if (widths.size > 3000) widths.clear(); widths.set(k, w); }
    return w;
  }
  if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => widths.clear());
  const F1 = `400 12.5px ${MONO}`, F2 = `400 12px ${MONO}`, FP = `400 13px ${SANS}`, FR = `400 11px ${MONO}`;

  /* a catalog label: [square][designation][barcode] / second line. sq: 'w' filled, 'o' outline, 'y' yellow, 'c' coral */
  function catSize(ctx, L) {
    const b = L._bars || (L._bars = bars(L.code || L.id));
    let w1 = 7 + 7 + tw(ctx, F1, L.id) + 7 + b.w, w2 = 0;
    if (L.s2) { for (const [t] of L.s2) w2 += tw(ctx, F2, t); w2 += 14; }
    return [Math.max(w1, w2), L.s2 ? 34 : 16];
  }
  function drawCat(ctx, x, y, L, a) {
    // y: the middle of the first line
    const b = L._bars || (L._bars = bars(L.code || L.id));
    ctx.globalAlpha = a;
    const sx = Math.round(x), sy = Math.round(y - 3.5);
    if (L.sq === 'o') { ctx.strokeStyle = C_W; ctx.lineWidth = 1; ctx.strokeRect(sx + .5, sy + .5, 6, 6); }
    else { ctx.fillStyle = L.sq === 'y' ? C_HI : L.sq === 'c' ? C_CO : C_W; ctx.fillRect(sx, sy, 7, 7); }
    ctx.fillStyle = C_W; ctx.font = F1; ctx.textBaseline = 'middle';
    ctx.fillText(L.id, x + 14, y + .5);
    let bx = Math.round(x + 14 + tw(ctx, F1, L.id) + 7);
    for (let i = 0; i < b.b.length; i += 3) { const hh = Math.round(9 * b.b[i + 2]); ctx.fillRect(bx + b.b[i], Math.round(y + 4.5) - hh, b.b[i + 1], hh); }
    if (L.s2) {
      let cx = x + 14;
      ctx.font = F2;
      for (const [t, hi] of L.s2) { ctx.globalAlpha = a * (hi ? 1 : .42); ctx.fillText(t, cx, y + 19); cx += tw(ctx, F2, t); }
    }
    ctx.globalAlpha = 1; ctx.textBaseline = 'alphabetic';
  }

  /* ---------- shared per-frame lists ---------- */
  const items = [];                   // glyph / label items this frame
  const placed = [];                  // placed label rects
  const q = [0, 0, 0];
  let snap = null, snapOK = false;    // the overlay as it was before the sensors drew (UI panels)

  function hudRects() { return game.hudRects || []; }
  function insetRect() { const s = game.getSystem('sensors'); const r = s && s.inset && s.inset.rect; return r || null; }
  function free(x0, y0, x1, y1, m) {
    m = m || 0;
    if (x0 < 12 || y0 < 12 || x1 > cam.W - 12 || y1 > cam.H - 12) return false;
    for (const r of hudRects()) if (x0 < r[2] + m && x1 > r[0] - m && y0 < r[3] + m && y1 > r[1] - m) return false;
    const ir = insetRect(); if (ir && x0 < ir[2] && x1 > ir[0] && y0 < ir[3] && y1 > ir[1]) return false;
    for (const r of placed) if (x0 < r[2] + 4 && x1 > r[0] - 4 && y0 < r[3] + 3 && y1 > r[1] - 3) return false;
    return true;
  }

  /* ---------- names and status lines (true values) ---------- */
  const shortName = d => (d.label || d.name || '').split(' · ')[0];
  const km = m => m >= 9950 ? String(Math.round(m / 1000)) : (m / 1000).toFixed(1);
  const grp = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  function s2Own(u) {
    const d = u.def, o = [];
    const add = (t, hi) => o.push([t, !!hi]);
    const kn = Math.round((u.speed || 0) * KN);
    switch (u.type) {
      case 'tel': {
        const s = u.reloader || (u.depotLoad && u.reloadP > 0) ? 'reloading' : u.elev >= 1.5 ? 'erect' : u.elevT > 0 ? 'erecting' : u.dep > 0 && u.depT > 0 ? 'on jacks' : u.dep > 0 ? 'stowing' : u.speed > .5 ? 'driving' : 'stowed';
        add('3M55 '); add('×' + (u.ammo.oniks || 0), 1); add(' · ' + s); break;
      }
      case 'radar': add(u.mast < 1 ? (u.mastT > 0 ? 'mast going up' : 'mast stowed') : u.radarOn ? 'radiating' : 'EMCON', 1); add(' · ' + (u.st && u.st.ant !== undefined && u.radarOn ? Math.round(60 / d.sensors.radar.period) + ' rpm' : 'surface search')); break;
      case 'pantsir': add('57E6 '); add('×' + (u.ammo.sam || 0), 1); add(' · ' + (u.radarOn ? 'radar on' : 'EMCON')); break;
      case 'transloader': add(u.reloadU > 0 ? 'reloading · ' : 'cargo · '); add((u.cargo || 0) + ' TLC', 1); break;
      case 'catapult': add('Orlan-10 '); add('×' + (u.drones || 0), 1); break;
      case 'hq': add('command post · '); add(u.radarOn === false ? 'quiet' : 'on the air', 0); break;
      case 'ddg': add(kn ? kn + ' kn' : 'stopped', 1); add(' · SM-6 ' + (u.ammo.sm6 || 0) + ' · TLAM ' + (u.ammo.strike || 0)); break;
      case 'carrier': add(kn ? kn + ' kn' : 'stopped', 1); add(' · air wing'); break;
      default:
        if (d.domain === 'air') { add(grp(Math.round(u.pos[1] / 10) * 10) + ' m', 1); add(' · ' + Math.round(u.speed) + ' m/s'); }
        else if (u.speed > .5) { add(kn + ' kn', 1); }
    }
    if (u.alive && u.hp < u.hpMax) add(' · ' + Math.round(100 * u.hp / u.hpMax) + '%', 0);
    return o;
  }
  function nearestPlace(x, z, maxD) {
    let best = null, bd = maxD * maxD;
    for (const p of map.places || []) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; best = p; } }
    return best;
  }
  function comp(list) {
    const cnt = new Map();
    for (const it of list) { const n = it.u ? (it.u.def.name || '').replace(/ launcher$/, ' rail') : ''; cnt.set(n, (cnt.get(n) || 0) + 1); }
    const parts = [];
    for (const [n, c] of cnt) parts.push(c > 1 ? `${n} ×${c}` : n);
    return parts.length > 4 ? parts.slice(0, 4).join(' · ') + ` · +${parts.length - 4}` : parts.join(' · ');
  }

  /* ---------- the frame's items: units, tracks, contacts ---------- */
  const RANK = { hq: 9, carrier: 9, ddg: 7, radar: 6, tel: 6, pantsir: 5, transloader: 3, catapult: 2, fighter: 4, helo: 3, drone: 2 };
  function gather() {
    items.length = 0;
    const me = game.side;
    for (const u of sim.list()) {
      if (u.aboard) continue;
      if (!u.alive && u.dying >= 1) continue;
      const v = game.vis(u);
      if (!v) continue;
      let pos, err = 0, c = null;
      if (v === 'contact') { c = sim.contact(me, u.id); if (!c) continue; pos = c.pos; err = c.err || 0; }
      else pos = game.unitPose(u).pos;
      if (!cam.project(pos, q)) continue;
      const on = q[0] > -40 && q[1] > -40 && q[0] < cam.W + 40 && q[1] < cam.H + 40;
      items.push({ u, v, pos, x: q[0], y: q[1], on, err, c, rank: RANK[u.type] || 1, a: u.alive ? 1 : 1 - u.dying });
    }
  }

  /* ---------- 3D: rings, leaders, paths, tracks ---------- */
  const ringLabels = [];              // { c: [x, z], r, a, rgb, txt }
  /* rings: the unit's radar reach and its weapons' reach. They are labelled with what reaches (the weapon's or the
     radar's designation), never a number: the game's ranges are scaled to the maps and would be false as figures */
  const wname = P => { const t = ((P && P.name) || '').split(' '); const last = t[t.length - 1]; return t.length > 1 && /^[A-Z]{2,}(-[A-Z0-9]+)?$/.test(last) ? last : t[0]; };
  function ringsOf(u, sel) {
    const d = u.def, out = [];
    const S = d.sensors || {}, Wp = d.weapons || {};
    if (S.radar) { const r = S.radar.surf || S.radar.air; if (r && (sel || u.type === 'radar')) out.push([r, u.radarOn ? .22 : .1, !u.radarOn, u.type === 'radar' ? d.name : d.name + ' radar']); }
    let off = 0, def = 0, offN = '', defN = '';
    for (const k in Wp) {
      const w = Wp[k]; if (w.gun) continue;
      const P = game.PROJ[w.proj];
      if (w.auto) { if (w.range > def) { def = w.range; defN = wname(P); } }
      else if (w.range > off) { off = w.range; offN = wname(P); }
    }
    if (off && (sel || u.type === 'tel')) out.push([off, .16, false, offN]);
    if (def && (sel || u.type === 'pantsir' || u.type === 'ddg')) out.push([def, .13, false, defN]);
    return out;
  }
  function draw3d() {
    const k = K, orbStyle = R.style === 'orbital';
    O.k = k;
    if (orbStyle) {
      styleModels();
      // the wire models give way to the glyphs as the strategic layer comes up
      const look = R.orbitalLook || (R.orbitalLook = { sea: 1, map: 1, models: 1 });
      look.models = 1 - ss(.3, .9, k);
    }
    if (!orbStyle && O.kMap > .001) OM.draw(O.kMap);
    if (k <= .001) { if (orbStyle) tracks(1); return; }
    beam(ss(.35, .9, k));
    const me = game.side, kA = ss(.35, .9, k), sel = game.selection;
    const yl = O.yellow === 'selection';
    // range rings: own radars and batteries (selected units: every ring, yellow while the selection has yellow)
    ringLabels.length = 0;
    const done = [];
    for (const it of items) {
      const u = it.u;
      if (it.v !== 'own' || !u.alive) continue;
      const isSel = sel.has(u.id);
      for (const [r, a0, dash, nm] of ringsOf(u, isSel)) {
        const p = it.pos;
        if (done.some(o => o[2] === r && Math.hypot(o[0] - p[0], o[1] - p[2]) < Math.max(1500, r * .12) && (o[3] || !isSel))) continue;
        done.push([p[0], p[2], r, isSel]);
        const rgb = isSel && yl ? HI : WH, a = (isSel ? (yl ? .42 : .3) : a0) * kA;
        W.ring(p[0], 0, p[2], r, { rgb, a, n: 256, dash: dash ? [3, 3] : null });
        ringLabels.push({ c: [p[0], p[2]], r, a, rgb: isSel && yl ? C_HI : C_W, txt: nm });
      }
    }
    // speed leaders (3 min of travel at sea and on land, 1 min in the air) and the planned paths of own units
    for (const it of items) {
      const u = it.u;
      if (!u.alive) continue;
      const p = it.pos, own = it.v === 'own', isSel = sel.has(u.id);
      const spd = it.v === 'contact' ? 0 : u.speed || 0;
      if (spd > 1 && it.v !== 'contact') {
        const t = u.def.domain === 'air' ? 60 : 180, s = Math.sin(u.hdg), c = Math.cos(u.hdg);
        const rgb = isSel && yl ? HI : WH;
        W.seg(p[0], p[1], p[2], p[0] + s * spd * t, p[1], p[2] + c * spd * t, rgb[0], rgb[1], rgb[2], (own ? .45 : .35) * kA);
      }
      if (own && u.path && u.wi < u.path.length) {
        const rgb = isSel && yl ? HI : WH, a = (isSel ? .5 : .2) * kA;
        let px = p[0], pz = p[2];
        for (let i = u.wi; i < u.path.length; i++) {
          const w = u.path[i];
          dashed(px, pz, w[0], w[1], rgb, a);
          px = w[0]; pz = w[1];
        }
      }
      // contacts: the uncertainty ring round the estimate
      if (it.v === 'contact' && it.err > 200) W.ring(p[0], 0, p[2], it.err, { rgb: WH, a: .3 * kA, n: 96, dash: [2, 2] });
    }
    // objectives: their ground as a faint dashed ring
    for (const ob of map.objectives || []) W.ring(ob.x, 0, ob.z, ob.r || 1500, { rgb: WH, a: .16 * kA, n: 64, dash: [2, 2] });
    if (me === 'fleet' && map.replenish) { const rp = map.replenish; W.ring(rp.x, 0, rp.z, rp.r || 3000, { rgb: WH, a: .14 * kA, n: 96, dash: [1, 2] }); }
    tracks(kA);
  }
  /* the radar's beam as hairlines (the Orbital films' search pulses): the leading edge and a fading afterglow, from
     the sweep the engine paints (R.sweep) */
  function beam(kA) {
    const sw = R.sweep;
    if (!sw || !(sw.amp > 0)) return;
    const o = sw.origin, rng = sw.range || 60000, ag = sw.afterglow || 1.2, amp = sw.amp;
    const n = 28, seg = 24;
    for (let i = 0; i < n; i++) {
      const db = i * ag / n, b = sw.bearing - db;
      const a = (i ? .14 * Math.exp(-3.5 * db / ag) : .42) * amp * kA;
      if (a < .006) continue;
      const sx = Math.sin(b), cz = Math.cos(b);
      for (let j = 0; j < seg; j++) {
        const r0 = rng * j / seg, r1 = rng * (j + 1) / seg;
        W.seg(o[0] + sx * r0, 1, o[1] + cz * r0, o[0] + sx * r1, 1, o[1] + cz * r1, WH[0], WH[1], WH[2], a);
      }
    }
  }
  /* rounds: the flown track (yours yellow, the interceptors and the enemy's white), the remaining leg to the aim */
  function tracks(kA) {
    const me = game.side, now = game.realT;
    for (const T of trails.values()) {
      if (T.n < 1 || !T.head) continue;
      const own = T.side === me, off = own && T.off;
      const age = T.alive ? 0 : now - T.tEnd, fade = T.alive ? 1 : 1 - ss(6, 18, age);
      if (fade <= 0) continue;
      const rgb = off ? HI : WH, a0 = (off ? .9 : own ? .3 : .55) * kA * fade;
      const P = T.pts;
      let px = P[0], py = P[1], pz = P[2];
      for (let i = 1; i < T.n; i++) {
        const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
        W.seg(px, py, pz, x, y, z, rgb[0], rgb[1], rgb[2], a0);
        px = x; py = y; pz = z;
      }
      if (T.alive) W.seg(px, py, pz, T.head[0], T.head[1], T.head[2], rgb[0], rgb[1], rgb[2], a0);
      // the leg still to fly, dashed
      if (T.alive && off && T.aim) dashed(T.head[0], T.head[2], T.aim[0], T.aim[2], HI, .3 * kA);
    }
  }
  /* the full Orbital style: your selection's models in yellow (while the selection has the yellow) */
  function styleModels() {
    const yl = O.yellow === 'selection', sel = game.selection;
    for (const [id, d] of game.drawn) d._orbRgb = yl && sel.has(id) ? HI : null;
  }
  function dashed(ax, az, bx, bz, rgb, a) {
    // world-fixed dashes, their length a fixed share of the view (about 6 px on and 5 off at the ground)
    const L = Math.hypot(bx - ax, bz - az); if (L < 1) return;
    const step = Math.max(30, cam.dist * .0075), n = Math.min(400, Math.ceil(L / step));
    for (let i = 0; i < n; i += 2) {
      const t0 = i / n, t1 = Math.min(1, (i + 1.1) / n);
      W.seg(ax + (bx - ax) * t0, 0, az + (bz - az) * t0, ax + (bx - ax) * t1, 0, az + (bz - az) * t1, rgb[0], rgb[1], rgb[2], a);
    }
  }

  /* ---------- 2D: glyphs ---------- */
  function glyph(ctx, it, col, a, big) {
    const u = it.u, d = u.def, x = Math.round(it.x) + .5, y = Math.round(it.y) + .5;
    ctx.globalAlpha = a; ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1;
    const own = it.v === 'own', s = big ? 1.35 : 1;
    if (it.v === 'contact') {
      ctx.beginPath(); ctx.moveTo(x, y - 4 * s); ctx.lineTo(x + 4 * s, y); ctx.lineTo(x, y + 4 * s); ctx.lineTo(x - 4 * s, y); ctx.closePath(); ctx.stroke();
      return;
    }
    // the heading on screen
    let dx = 0, dy = -1;
    if (d.domain !== 'land' || u.type === 'radar') {
      const h = u.type === 'radar' ? u.hdg + (u.st && u.st.ant || 0) : u.hdg;
      const p = it.pos, L = Math.max(50, cam.dist * .01);
      if (cam.project([p[0] + Math.sin(h) * L, p[1], p[2] + Math.cos(h) * L], q2)) { dx = q2[0] - it.x; dy = q2[1] - it.y; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l; }
    }
    if (d.domain === 'sea') {
      const L2 = (u.type === 'carrier' ? 8 : 6) * s, B2 = (u.type === 'carrier' ? 2.8 : 2.2) * s;
      ctx.beginPath();
      ctx.moveTo(x + dx * L2, y + dy * L2); ctx.lineTo(x - dy * B2, y + dx * B2); ctx.lineTo(x - dx * L2, y - dy * L2); ctx.lineTo(x + dy * B2, y - dx * B2);
      ctx.closePath();
      if (own) { ctx.globalAlpha = a * .35; ctx.fill(); ctx.globalAlpha = a; }
      ctx.stroke();
    } else if (d.domain === 'air') {
      const L = (u.type === 'drone' ? 3.5 : 5) * s, B = (u.type === 'drone' ? 3 : 4) * s;
      ctx.beginPath();
      ctx.moveTo(x + dx * L, y + dy * L); ctx.lineTo(x - dx * L * .7 - dy * B, y - dy * L * .7 + dx * B);
      ctx.lineTo(x - dx * L * .25, y - dy * L * .25); ctx.lineTo(x - dx * L * .7 + dy * B, y - dy * L * .7 - dx * B);
      ctx.closePath(); ctx.stroke();
      if (u.type === 'helo') { ctx.beginPath(); ctx.arc(x, y, 5.5 * s, 0, TAU); ctx.globalAlpha = a * .5; ctx.stroke(); ctx.globalAlpha = a; }
    } else {
      const r = 2.5 * s;
      switch (u.type) {
        case 'hq': if (own) ctx.fillRect(x - 3 * s, y - 3 * s, 6 * s, 6 * s); else ctx.strokeRect(x - 3 * s, y - 3 * s, 6 * s, 6 * s); break;
        case 'tel': ctx.strokeRect(x - r, y - r, 2 * r, 2 * r); if (own) { ctx.fillRect(x - .5, y - .5, 1, 1); } break;
        case 'radar':
          ctx.beginPath(); ctx.arc(x, y, 3 * s, 0, TAU); ctx.stroke();
          if (u.radarOn) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx * 7 * s, y + dy * 7 * s); ctx.stroke(); }
          break;
        case 'pantsir': ctx.beginPath(); ctx.moveTo(x, y - 3.5 * s); ctx.lineTo(x + 3.2 * s, y + 2.4 * s); ctx.lineTo(x - 3.2 * s, y + 2.4 * s); ctx.closePath(); ctx.stroke(); break;
        default: ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); ctx.stroke();
      }
    }
  }
  const q2 = [0, 0, 0];
  function bracket(ctx, x, y, r, col, a) {
    const c = Math.max(3, r * .45);
    ctx.globalAlpha = a; ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const px = Math.round(x + sx * r) + .5, py = Math.round(y + sy * r) + .5;
      ctx.moveTo(px - sx * c, py); ctx.lineTo(px, py); ctx.lineTo(px, py - sy * c);
    }
    ctx.stroke();
  }

  /* ---------- 2D: labels (clustered, placed like the films' callouts) ---------- */
  const OFFS = [[70, -60], [-70, -60], [70, 60], [-70, 60], [110, -28], [-110, -28], [44, -96], [-44, -96], [44, 96], [-44, 96]];
  function place(ctx, ax, ay, L, a, pad) {
    const [w, h] = catSize(ctx, L);
    for (const [dx, dy] of OFFS) {
      const ex = ax + dx, ey = ay + dy, hx = ex + (dx >= 0 ? 18 : -18);
      const x0 = dx >= 0 ? hx + 8 : hx - 8 - w, y0 = ey - 9, y1 = y0 + h;
      if (!free(x0, y0, x0 + w, y1, 6)) continue;
      // the leader must not run through a HUD panel either
      if (!free(Math.min(ax, hx) + (dx >= 0 ? 6 : -6) * 0, Math.min(ay, ey), Math.max(ax, hx), Math.max(ay, ey) + 1, 0) && Math.abs(dy) > 30) {
        // (a leader crossing another label is acceptable; a leader under a panel is not)
        let bad = false; for (const r of hudRects()) if (Math.min(ax, hx) < r[2] && Math.max(ax, hx) > r[0] && Math.min(ay, ey) < r[3] && Math.max(ay, ey) > r[1]) bad = true;
        if (bad) continue;
      }
      placed.push([x0, y0, x0 + w, y1]);
      // leader: diagonal, then along (films: .7 alpha), started just off the glyph
      const l = Math.hypot(ex - ax, ey - ay) || 1, s0 = pad || 6;
      ctx.globalAlpha = .7 * a; ctx.strokeStyle = C_W; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(ax + (ex - ax) / l * s0, ay + (ey - ay) / l * s0); ctx.lineTo(ex, ey); ctx.lineTo(hx, ey); ctx.stroke();
      drawCat(ctx, x0, ey, L, a);
      return true;
    }
    return false;
  }

  function labels(ctx, kL) {
    const me = game.side, sel = game.selection, hov = game.hover;
    const yl = O.yellow === 'selection';
    // clusters of units close on screen (a battery reads as one entry, like the films' 'Bastion-P · Krasnaya Kosa')
    const R2 = 58 * 58, groups = [];
    const list = items.filter(it => it.on && it.u.alive).sort((a, b) => b.rank - a.rank);
    for (const it of list) {
      const solo = sel.has(it.u.id) && sel.size <= 4 || it.u.id === hov;
      const side = it.v === 'own' ? 'own' : it.v === 'track' ? 'trk' : 'con';
      let g = null;
      if (!solo) for (const G of groups) if (!G.solo && G.side === side && (G.x - it.x) ** 2 + (G.y - it.y) ** 2 < R2) { g = G; break; }
      if (!g) groups.push(g = { side, x: it.x, y: it.y, lead: it, list: [], solo });
      g.list.push(it);
    }
    const out = [];
    for (const G of groups) {
      const it = G.lead, u = it.u, d = u.def, n = G.list.length;
      const isSel = G.list.some(x => sel.has(x.u.id));
      let L;
      if (G.side === 'own') {
        if (n === 1) L = { id: d.label || d.name, code: d.name, sq: isSel && yl ? 'y' : 'w', s2: s2Own(u) };
        else {
          let id;
          const pl = nearestPlace(it.pos[0], it.pos[2], 15000);
          if (me === 'coast') {
            const bat = G.list.some(x => x.u.type === 'hq' || x.u.type === 'tel');
            id = (bat ? 'Bastion-P' : d.name) + (pl ? ' · ' + pl.name : bat ? ' · battery' : '');
          } else {
            const cv = G.list.find(x => x.u.type === 'carrier');
            id = cv ? 'Carrier group · ' + shortName(cv.u.def) : d.domain === 'air' ? shortName(d) + ' flight' : 'Surface group';
          }
          L = { id, code: d.name + n, sq: isSel && yl ? 'y' : 'w', s2: [[comp(G.list), false]] };
        }
      } else if (G.side === 'trk') {
        // with the fog off there are no contacts: the class and the type name stand in for the track number
        const c = sim.contact(me, u.id);
        const cls = !c || c.conf >= game.CLASSIFY ? (d.cls || '?') : '?';
        const kn = Math.round((u.speed || 0) * KN);
        const spd = d.domain === 'air' ? Math.round(u.speed || 0) + ' m/s' : kn ? kn + ' kn' : d.domain === 'sea' ? 'stopped' : '';
        const one = [];
        if (c) one.push([shortName(d), false]);
        if (spd) one.push([(one.length ? ' · ' : ''), false], [spd, true]);
        if (c) one.push([' · ' + c.conf.toFixed(2), false]);
        L = { id: c ? `${c.track} · ${cls}` : `${cls} · ${shortName(d)}`, code: c ? c.track : d.name, sq: 'c',
          s2: n > 1 ? [[`${n} tracks · `, false], [comp(G.list), false]] : one.length ? one : null };
      } else {
        const c = it.c;
        L = { id: `${c ? c.track : 'TRK'} · ?`, code: c ? c.track : '?', sq: 'o', s2: [[(c ? c.conf.toFixed(2) : '') + ' · ±', false], [km(it.err || 0) + ' km', true]] };
      }
      const pri = (isSel ? 50 : 0) + (u.id === hov ? 60 : 0) + (G.side === 'trk' ? 20 : G.side === 'own' ? 10 : 0) + it.rank;
      out.push({ G, L, pri, ax: G.x, ay: G.y });
    }
    // salvos: your rounds in flight, grouped by kind (the leading round carries the label), and the inbound ones
    const sal = new Map();
    for (const T of trails.values()) {
      if (!T.alive || !T.head || !T.off) continue;
      const own = T.side === me, key = (own ? 'o' : 'e') + T.kind;
      let s = sal.get(key);
      if (!s) sal.set(key, s = { own, T, n: 0, lead: T, d: 1e18 });
      s.n++;
      const dd = T.aim ? (T.head[0] - T.aim[0]) ** 2 + (T.head[2] - T.aim[2]) ** 2 : 0;
      if (dd < s.d) { s.d = dd; s.lead = T; }
    }
    for (const s of sal.values()) {
      const T = s.lead, P = T.P || {}, nm = (P.name || T.kind).split(' ')[0];
      if (!cam.project(T.head, q)) continue;
      const mach = (T.spd || 0) / 340;
      const s2 = s.own
        ? [[mach >= 1 ? 'Mach ' : '', false], [mach >= 1 ? mach.toFixed(1) : Math.round(T.spd || 0) + ' m/s', true], [T.aim ? ' · ' + km(Math.sqrt(s.d)) + ' km to go' : '', false]]
        : [['inbound · ', false], [Math.round(T.spd || 0) + ' m/s', true]];
      out.push({ L: { id: `${nm} ×${s.n}`, code: nm, sq: s.own ? 'y' : 'c', s2 }, pri: s.own ? 100 : 80, ax: q[0], ay: q[1], salvo: true });
    }
    out.sort((a, b) => b.pri - a.pri);
    let n = 0;
    for (const o of out) {
      if (n >= 16) break;
      if (o.ax < -10 || o.ay < -10 || o.ax > cam.W + 10 || o.ay > cam.H + 10) continue;
      if (place(ctx, o.ax, o.ay, o.L, kL, o.salvo ? 8 : 7)) n++;
    }
    O.stats.labels = n;
  }

  function placeNames(ctx, a) {
    const pts = map.places || [];
    ctx.font = FP; ctx.textBaseline = 'middle';
    for (const p of pts) {
      const y = Math.max(0, map.h(p.x, p.z));
      if (!cam.project([p.x, y, p.z], q)) continue;
      const x = q[0], yy = q[1];
      const town = p.kind === 'town' || p.kind === 'port' || p.kind === 'village' || p.kind === 'city';
      const w = tw(ctx, FP, p.name);
      const x0 = x + (town ? 7 : -w / 2), y0 = yy - 8;
      if (!free(x0 - (town ? 8 : 0), y0, x0 + w, y0 + 16, 2)) continue;
      placed.push([x0 - (town ? 8 : 0), y0, x0 + w, y0 + 16]);
      ctx.fillStyle = C_W;
      if (town) {
        ctx.globalAlpha = a * .8;
        if (p.kind === 'port') { ctx.strokeStyle = C_W; ctx.lineWidth = 1; ctx.strokeRect(Math.round(x) - 1.5, Math.round(yy) - 1.5, 3, 3); }
        else ctx.fillRect(Math.round(x) - 1.5, Math.round(yy) - 1.5, 3, 3);
      } else if (p.kind === 'peak') {
        ctx.globalAlpha = a * .6; ctx.strokeStyle = C_W; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(Math.round(x) + .5, Math.round(yy) - 2.5 - 9); ctx.lineTo(Math.round(x) + 3.5, Math.round(yy) + 1.5 - 9); ctx.lineTo(Math.round(x) - 2.5, Math.round(yy) + 1.5 - 9); ctx.closePath(); ctx.stroke();
      }
      ctx.globalAlpha = a * (town ? .62 : .4);
      ctx.fillText(p.name, x0, town ? yy : yy + (p.kind === 'peak' ? 4 : 0));
    }
    // objectives: a small diamond and the name
    for (const ob of map.objectives || []) {
      const y = Math.max(0, map.h(ob.x, ob.z));
      if (!cam.project([ob.x, y, ob.z], q)) continue;
      const x = Math.round(q[0]) + .5, yy = Math.round(q[1]) + .5, nm = ob.name || ob.kind;
      const w = tw(ctx, FP, nm);
      if (!free(x - 5, yy - 8, x + 10 + w, yy + 8, 2)) continue;
      placed.push([x - 5, yy - 8, x + 10 + w, yy + 8]);
      ctx.globalAlpha = a * .7; ctx.strokeStyle = C_W; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, yy - 4); ctx.lineTo(x + 4, yy); ctx.lineTo(x, yy + 4); ctx.lineTo(x - 4, yy); ctx.closePath(); ctx.stroke();
      ctx.globalAlpha = a * .5; ctx.fillStyle = C_W; ctx.fillText(nm, x + 9, yy);
    }
    ctx.textBaseline = 'alphabetic';
  }

  function frameLabel(ctx, a) {
    // the map frame's catalog label at the first corner on screen (the films' 'Theatre 1337 · 600 × 600 km')
    const f = OM.frame, corners = [[f.x1, f.z1], [f.x0, f.z1], [f.x1, f.z0], [f.x0, f.z0]];
    for (const [x, z] of corners) {
      if (!cam.project([x, 0, z], q)) continue;
      if (q[0] < 30 || q[1] < 30 || q[0] > cam.W - 30 || q[1] > cam.H - 30) continue;
      const L = { id: `${map.name} · ${Math.round(map.W / 1000)} × ${Math.round(map.H / 1000)} km`, code: map.id, sq: 'o' };
      if (place(ctx, q[0], q[1], L, a, 4)) return;
    }
  }

  function ringText(ctx, a) {
    ctx.font = FR; ctx.textBaseline = 'alphabetic';
    const done = [];
    for (const r of ringLabels) {
      if (done.some(o => o.txt === r.txt && Math.hypot(o.c[0] - r.c[0], o.c[1] - r.c[1]) < r.r * .25)) continue;
      done.push(r);
      for (const db of [0, .35, -.35, .7, -.7, 1.05, -1.05, Math.PI]) {
        const b = cam.yaw + db, x = r.c[0] + Math.sin(b) * r.r, z = r.c[1] + Math.cos(b) * r.r;
        if (!cam.project([x, 0, z], q)) continue;
        const w = tw(ctx, FR, r.txt);
        if (!free(q[0] + 6, q[1] - 17, q[0] + 6 + w, q[1] - 4, 0)) continue;
        placed.push([q[0] + 6, q[1] - 17, q[0] + 6 + w, q[1] - 4]);
        ctx.globalAlpha = Math.min(.6, r.a * 2.6) * a; ctx.fillStyle = r.rgb;
        ctx.fillText(r.txt, q[0] + 6, q[1] - 6);
        break;
      }
    }
  }

  /* ---------- the systems ---------- */
  const pre = {
    name: 'orbital-pre', priority: 14, always2d: true,
    draw2d(ov) {
      snapOK = false;
      if (K <= .001) return;
      const cv = ov.cv;
      if (!snap) snap = document.createElement('canvas');
      if (snap.width !== cv.width || snap.height !== cv.height) { snap.width = cv.width; snap.height = cv.height; }
      const c = snap.getContext('2d');
      c.clearRect(0, 0, snap.width, snap.height);
      c.drawImage(cv, 0, 0);
      snapOK = true;
    },
  };

  /* the selection system marks its units in the Point Cloud way (lime squares, lime chips). While the strategic layer
     has the screen (k > .5) those marks are muted for the length of its draw2d (the overlay's mark / tag / bracket /
     text / leader do nothing), so the selection reads here as yellow glyphs and rings; its drag box stays. A cleaner
     hook for its owner: skip the marks while game.orbital.k > .5. */
  let selWrapped = false;
  const NOOP = () => null;
  function wrapSelection() {
    const s = game.getSystem('selection');
    selWrapped = true;
    if (!s || typeof s.draw2d !== 'function' || s._orbitalWrapped) return;
    const orig = s.draw2d;
    s._orbitalWrapped = true;
    s.draw2d = function (ov, f) {
      if (K <= .5 || !ov) return orig.call(this, ov, f);
      const keep = { mark: ov.mark, tag: ov.tag, bracket: ov.bracket, text: ov.text, leader: ov.leader };
      ov.mark = NOOP; ov.tag = NOOP; ov.bracket = NOOP; ov.text = NOOP; ov.leader = NOOP;
      try { return orig.call(this, ov, f); } finally { Object.assign(ov, keep); }
    };
  }

  const sys = {
    name: 'orbital', priority: 16, always2d: true, O, trails,
    update(dt) {
      if (!selWrapped) wrapSelection();
      // the blend: from the zoom (the camera's distance to its target), held off by the radar view and Inspect
      const sens = game.getSystem('sensors');
      const want = (sens && sens.scopeOn) || inspecting ? 0 : 1;
      sup += (want - sup) * (1 - Math.exp(-8 * Math.min(.1, dt)));
      if (want === 0 && sup < .002) sup = 0;
      if (want === 1 && sup > .998) sup = 1;
      K = ss(O.from, O.to, cam.dist) * sup;
      O.k = K;
      O.kMap = Math.max(K, ss(Math.min(O.mapFrom, O.from), O.to, cam.dist) * sup);
      R.pcOff = K >= .999;
      // rounds in flight: always recorded (their tracks are there when you pull out)
      for (const pr of sim.projectiles.values()) if (pr.alive && sim.projVisible(game.side, pr)) record(pr);
      const now = game.realT;
      for (const T of trails.values()) {
        if (T.alive && !sim.projectiles.has(T.id)) { T.alive = false; T.tEnd = now; }
        if (!T.alive && now - T.tEnd > 20) trails.delete(T.id);
      }
      O.yellow = [...trails.values()].some(T => T.alive && T.off && T.side === game.side) ? 'salvo' : 'selection';
      for (let i = bursts.length - 1; i >= 0; i--) if (now - bursts[i].t0 > 2) bursts.splice(i, 1);
      for (let i = wrecks.length - 1; i >= 0; i--) if (now - wrecks[i].t0 > 90) wrecks.splice(i, 1);
    },
    onEvent(e) {
      const now = game.realT, me = game.side;
      if (e.type === 'hit' || e.type === 'intercept' || e.type === 'splash') {
        const T = e.proj !== undefined ? trails.get(e.proj) : null;
        if (T) { T.alive = false; T.tEnd = now; T.why = e.type; if (e.pos) T.head = e.pos.slice(); }
        if (e.pos && (e.type !== 'splash' || (T && T.off))) bursts.push({ pos: e.pos.slice(), t0: now, kind: e.type, own: e.side === me });
      } else if (e.type === 'destroyed' && e.pos) {
        bursts.push({ pos: e.pos.slice(), t0: now, kind: 'kill', own: e.side === me });
        wrecks.push({ pos: e.pos.slice(), t0: now });
      }
    },
    draw3d() {
      const t0 = performance.now();
      if (K > .001) gather();
      draw3d();
      O.stats.cpu3 = performance.now() - t0;
    },
    draw2d(ov) {
      const t0 = performance.now();
      const k = K, ex = insetRect();
      if (R.style === 'orbital') {
        // the full Orbital style: the whole GL frame is hairlines. What point passes were drawn over it since R.end
        // (the sensors' sea clutter) go, then the hairlines, then the effect dots over them
        O.veil = ss(.12, .92, k);
        if (R._orbPending) {
          R.veil(1, ex);
          // the effect dots first, faded as the strategic layer comes up (as the point frame is), the hairlines over them
          R.drawFx(ex);
          if (O.veil > .001) R.veil(O.veil, ex);
          R.orbitalPost(ex, { fx: false });
        } else if (W.q.length || W.n) W.flush({ exclude: ex });
        if (k <= .001) { O.stats.ms = performance.now() - t0; return; }
      } else {
        if (k <= .001) { if (W.q.length || W.n) W.flush(); O.stats.ms = 0; return; }
        // GL: the point frame (and the sensors' passes over it) darkens toward black, then the hairlines
        O.veil = ss(.12, .92, k);
        R.veil(O.veil, ex, null, O.dissolve);
        W.flush({ exclude: ex });
      }
      const va = O.veil;
      // overlay: the world tags drawn so far fade the same way; the UI panels drawn before them come back
      const ctx = ov.ctx;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (ex) {
        const s = ov.dpr || 1;
        ctx.beginPath(); ctx.rect(0, 0, ov.cv.width, ov.cv.height); ctx.rect(ex[0] * s, ex[1] * s, (ex[2] - ex[0]) * s, (ex[3] - ex[1]) * s); ctx.clip('evenodd');
      }
      ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = va; ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, ov.cv.width, ov.cv.height);
      ctx.globalCompositeOperation = 'source-over';
      if (snapOK) { ctx.globalAlpha = va; ctx.drawImage(snap, 0, 0); }
      ctx.restore();
      ctx.save();
      placed.length = 0;
      const me = game.side, sel = game.selection, hov = game.hover, yl = O.yellow === 'selection';
      const kG = ss(.3, .85, k), kL = ss(.55, 1, k);
      // bursts: rings opening on hits and intercepts (o3_orbit), a cross where a unit was lost
      const now = game.realT;
      for (const b of bursts) {
        if (!cam.project(b.pos, q)) continue;
        const age = now - b.t0, big = b.kind === 'kill' || b.kind === 'hit';
        for (let r = 0; r < (big ? 2 : 1); r++) {
          const u = sat((age - r * .25) / 1.4); if (u <= 0 || u >= 1) continue;
          ctx.globalAlpha = .8 * (1 - u) * kG; ctx.strokeStyle = b.own && big ? C_W : C_W; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(q[0], q[1], (big ? 6 : 4) + (big ? 30 : 14) * (1 - (1 - u) ** 3), 0, TAU); ctx.stroke();
        }
      }
      for (const w of wrecks) {
        if (!cam.project(w.pos, q)) continue;
        const x = Math.round(q[0]) + .5, y = Math.round(q[1]) + .5, a = .45 * kG * (1 - ss(60, 90, now - w.t0));
        ctx.globalAlpha = a; ctx.strokeStyle = C_W; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x - 3, y - 3); ctx.lineTo(x + 3, y + 3); ctx.moveTo(x - 3, y + 3); ctx.lineTo(x + 3, y - 3); ctx.stroke();
      }
      // rounds: the heads (yours yellow, a ring; inbound threats with a coral tick)
      for (const T of trails.values()) {
        if (!T.alive || !T.head || !cam.project(T.head, q)) continue;
        const own = T.side === me, x = Math.round(q[0]) + .5, y = Math.round(q[1]) + .5;
        if (own && T.off) {
          ctx.globalAlpha = kG; ctx.strokeStyle = C_HI; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(x, y, 4, 0, TAU); ctx.stroke();
        } else {
          ctx.globalAlpha = (own ? .55 : .9) * kG; ctx.strokeStyle = C_W; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x - 2.5, y - 2.5); ctx.lineTo(x + 2.5, y + 2.5); ctx.moveTo(x - 2.5, y + 2.5); ctx.lineTo(x + 2.5, y - 2.5); ctx.stroke();
          if (!own && T.off) { ctx.globalAlpha = kG; ctx.strokeStyle = C_CO; ctx.beginPath(); ctx.moveTo(x - 3.5, y + 5.5); ctx.lineTo(x + 3.5, y + 5.5); ctx.stroke(); }
        }
      }
      // units
      for (const it of items) {
        if (!it.on) continue;
        const u = it.u, isSel = sel.has(u.id), isHov = u.id === hov;
        const own = it.v === 'own';
        const col = isSel && yl && own ? C_HI : C_W;
        const a = it.a * kG * (it.v === 'contact' ? .55 : own ? 1 : .9) * (isHov ? 1 : .92);
        glyph(ctx, it, col, a, isHov || isSel);
        if (isSel && !(yl && own)) bracket(ctx, it.x, it.y, 8, C_W, .8 * kG);
      }
      if (!game.ui.hidden) {
        // the glyphs keep labels and names off them
        for (const it of items) if (it.on) placed.push([it.x - 7, it.y - 7, it.x + 7, it.y + 7]);
        labels(ctx, kL);
        ringText(ctx, kL);
        placeNames(ctx, kL);
        frameLabel(ctx, kL * .9);
      }
      ctx.restore();
      ctx.globalAlpha = 1;
      O.stats.ms = performance.now() - t0 + (O.stats.cpu3 || 0);
      O.stats.segs = W.stats.segs;
    },
  };
  return [pre, sys];
}

function addFonts() {
  if (document.getElementById('oniks-orbital-fonts')) return;
  const l = document.createElement('link');
  l.id = 'oniks-orbital-fonts'; l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap';
  document.head.appendChild(l);
  if (document.fonts && document.fonts.load) { document.fonts.load('12.5px "DM Mono"').catch(() => {}); document.fonts.load('13px Inter').catch(() => {}); }
}
