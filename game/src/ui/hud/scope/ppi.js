/* The minimap's radar scope (its default mode; minimap.js keeps the header's Scope/Map switch and the input): the
   Picture and Confidence films' radar picture drawn top down, north up, round the player's main radar.
     - the radar: the Monolith-B, else the carrier, a destroyer, the E-2D, a helicopter, a Pantsir. A working radar of a
       better kind takes the scope over; one in EMCON keeps it (silent). The header's radar name steps through the
       side's radars (`next`). No radar at all: the command post / carrier, no sweep.
     - off centre, as a ship's display offsets its origin: the radar sits back from the middle, away from the open side
       of its reach (past the map's edge), so the scope looks into the map; its range rings are drawn round the radar
     - the range rings with their km, the display's compass ring (ticks, numbers every 30 deg), the map's coastline as
       faint dots and the land as a stipple (a raster of the height grid, rebuilt when the range changes or the radar
       moves far), the map's edge as a faint dotted line
     - the sweep at the antenna's true bearing and period (the sim's hdg + antA + antW (t - antT); the RPM and the time
       rate in the corner), an afterglow wedge behind it; too fast to follow at the rate: an even persistence
     - sea clutter speckle round the radar (densest near it, more in a higher sea) and the rain and storm cells
       (sim.weather.cells()) as clutter blobs: painted by the beam, fading through the turn, new every turn
     - contacts: "?" dot clouds as wide as their position error, reshuffled by every return; classified, they firm
       into coral ticks with a course leader and a tiny "TRK 41 · 0.99" (the few that matter most); tracks past the
       display sit on its rim; heard emitters: coral bearing lines from the unit that hears them; submarines heard by
       sonar: white rings (another opens at each sonar fix); the hostile rounds the side can see
     - own units lime, the sites by owner, the camera's view as a dotted outline, the minimap's pings
   The Orbital render style (hud.orbital): black, white hairlines, own units white, rounds and the selection yellow.
   Cost (~0.2-0.3 ms a draw at 30 Hz, 1080p): the rings, the coast and the wedge are cached canvases; the returns live
   on a phosphor layer that fades as the beam turns, and each draw paints only the sector swept since the last one
   (square dots batched by alpha into one path per level); nothing allocated in the loops. */
import { radarWorks } from '../../../sim/sensors.js';

const TAU = Math.PI * 2, DEG = Math.PI / 180;
const RANGES = [10, 20, 30, 40, 60, 80, 100, 120, 160, 200];      // km: the wheel's steps
const RING = [2.5, 5, 10, 10, 20, 20, 25, 30, 40, 50];             // km between the rings at each
const NAME = { radar: 'MONOLITH-B', carrier: 'CVN', ddg: 'DDG', aew: 'E-2D', helo: 'MH-60R', pantsir: 'PANTSIR' };
const RANK = { radar: 0, carrier: 1, ddg: 2, aew: 3, helo: 4, pantsir: 5 };
const PC = { orb: false, bg: '#0B0C0A', wh: '#EEEEE4', own: '#C6F432', sweep: '#C6F432', hot: '#FF6A3D', hotL: '#FF6A3D', rnd: '#C6F432', sel: '#FFFFFF',
  rgb: '198,244,50', font: "'Geist Mono', monospace", fw: 500, wedge: .1, ring: .3, rim: .5 };
// (the Orbital style: coral only for the marks of hostility; its lines and labels are white, the label a coral square)
const PO = { orb: true, bg: '#000000', wh: '#F6F5F2', own: '#F6F5F2', sweep: '#F6F5F2', hot: '#FF6A3D', hotL: '#F6F5F2', rnd: '#F4D23C', sel: '#FFFFFF',
  rgb: '246,245,242', font: "'DM Mono', monospace", fw: 400, wedge: .07, ring: .16, rim: .42 };
const NCL = 1600, NTAG = 48, OFFMAX = .42;

function hsh(a, b) {
  let h = Math.imul((a | 0) ^ 0x5bd1e995, 0x9E3779B1) ^ Math.imul((b | 0) + 0x7f4a7c15, 0x85EBCA77);
  h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12; h = Math.imul(h, 0x297A2D39); h ^= h >>> 15;
  return ((h >>> 0) + .5) / 4294967296;
}
const gH = (i, k) => Math.sqrt(-2 * Math.log(hsh(i, k))) * Math.cos(TAU * hsh(i, k + 1));
const rank = u => RANK[u.type] === undefined ? 6 : RANK[u.type];
const pad3 = n => String(n).padStart(3, '0');
const cl01 = v => v < 0 ? 0 : v > 1 ? 1 : v;

export function createPPI(game, hud) {
  const sim = game.sim, map = game.map;
  // the display (backing px): centre cx, cy, radius rho; the radar at rx, ry; s px per metre
  let ctx = null, bw = 0, bh = 0, k = 1, cx = 0, cy = 0, rho = 0, rx = 0, ry = 0, s = 1, pal = PC, d1 = 1;
  let cur = null, pickU = null, userR = 0, wheelAcc = 0, fastN = 0;
  const C = { x: 0, z: 0, on: false, ph: 0, fast: false, RM: 100000, ri: 6, def: 100000, name: '', rpm: '', rate: '', ux: 0, uz: 0, off: 0 };
  let lookKey = '', lookX = 0, lookZ = 0;
  const ringC = document.createElement('canvas'), coastC = document.createElement('canvas'), wedgeC = document.createElement('canvas');
  let ringKey = '', coastKey = '', coastX = 0, coastZ = 0, coastI0 = 0, coastJ0 = 0, coastN = 0, coastM = 1, wedgeKey = '', wedgeR = 0;
  let mask = null;
  // sea clutter: fixed scatterers round the radar (px from the radar, bearing, strength)
  const cdx = new Float32Array(NCL), cdy = new Float32Array(NCL), caz = new Float32Array(NCL), camp = new Float32Array(NCL);
  let ncl = 0, clKey = '', clX = 0, clZ = 0;
  // the hostile picture of this frame (pooled)
  const HL = []; let nH = 0;
  const TG = []; let nT = 0;
  const RECT = new Float32Array(4 * 64); let nR = 0;
  const QXY = new Float32Array(2 * 64); let nQ = 0;
  const BRG = new Float32Array(16); let nB = 0;
  const firm = new Map();               // unit id -> { v: last vis, t: realT it firmed into a track }
  const sonarRings = [];                // { x, z, r, t0 } where the side heard a boat
  const own = new Float32Array(2 * 256); let nOwn = 0;
  const DASH0 = [], DASH_S = [2, 1], DASH_D = [1, 3], DASH_F = [1, 2];
  let charW = 5, fontKey = '';
  const out = { ntr: 0, nct: 0 };

  game.bus.on('event', e => {
    if (e.type === 'sonar' && e.side === game.side && e.pos) {
      sonarRings.push({ x: e.pos[0], z: e.pos[2], r: e.r || 600, t0: game.realT });
      if (sonarRings.length > 24) sonarRings.shift();
    }
  });

  /* ---------------- the radar the scope is on ---------------- */
  const alive = (u, me) => !!u && u.alive && !u.aboard && u.side === me;
  function isRadar(u) { const R = u.def.sensors && u.def.sensors.radar; return !!R && !!(R.surf || R.air) && u.type !== 'fighter' && !u.aboard; }
  function pick() {
    const me = game.side;
    let best = null, bs = 1e9;
    for (const u of sim.alive(me)) {
      if (!isRadar(u)) continue;
      const sc = rank(u) + (radarWorks(u) ? 0 : 10);
      if (sc < bs) { bs = sc; best = u; }
    }
    let u = alive(pickU, me) ? pickU : null;
    if (!u) {
      pickU = null;
      u = alive(cur, me) ? cur : null;
      // a working radar of a better kind takes over (of the same kind, while this one is silent)
      if (u && best && best !== u && radarWorks(best)) { const rb = rank(best), ru = rank(u); if (rb < ru || (rb === ru && !radarWorks(u))) u = best; }
      if (!u) u = best;
    }
    cur = u;
    return u;
  }
  /* the side's next radar (the header's name) */
  function next() {
    const me = game.side;
    let first = null, after = null, seen = false;
    for (const u of sim.alive(me)) {
      if (!isRadar(u)) continue;
      if (!first) first = u;
      if (seen && !after) after = u;
      if (u === cur) seen = true;
    }
    pickU = after || first;
    return pickU;
  }
  let nmU = null, nmM = false, nmS = '', rpmW = NaN, rpmS = '', rateR = 0, rateS = '';
  const rpmOf = w => { if (w !== rpmW) { rpmW = w; rpmS = Math.round(60 * Math.abs(w) / TAU) + ' RPM'; } return rpmS; };
  const rateOf = r => { if (r !== rateR) { rateR = r; rateS = '×' + r; } return rateS; };
  function nameOf(u) {
    let n = 0; for (const o of sim.alive(u.side)) if (o.type === u.type) n++;
    if (u !== nmU || (n > 1) !== nmM) {
      const base = NAME[u.type] || u.def.cls || 'RADAR';
      nmU = u; nmM = n > 1; nmS = nmM ? base + ' ' + String(u.id).padStart(2, '0') : base;
    }
    return nmS;
  }
  function centre() {
    const me = game.side, u = pick();
    C.on = false; C.fast = false;
    let p = null;
    if (u) {
      const P = game.unitPose(u), R = u.def.sensors.radar;
      p = P.pos; C.name = nameOf(u); C.def = Math.max(R.surf || 0, R.air || 0);
      if (radarWorks(u) && u.antW) {
        C.on = true; C.ph = P.hdg + u.antA + u.antW * (game.t - u.antT);
        C.fast = Math.abs(u.antW) * (game.paused ? 0 : game.timeRate) > 11;
        C.rpm = u.type === 'ddg' ? 'SPY-1D' : rpmOf(u.antW);
      } else C.rpm = 'EMCON';
    } else {
      let h = sim.hq(me); if (!h) h = sim.alive(me)[0] || null;
      if (h) p = h.pos;
      C.name = 'NO RADAR'; C.rpm = 'NO RADAR'; C.def = 100000;
    }
    if (p) { C.x = p[0]; C.z = p[2]; }
    else { const sp = map.spawns && map.spawns[me]; if (sp) { C.x = sp.x; C.z = sp.z; } }
    C.rate = C.on && game.timeRate > 1 && !game.paused ? rateOf(game.timeRate) : '';
    const want = userR || C.def / 1000;
    let ri = RANGES.length - 1;
    for (let i = 0; i < RANGES.length; i++) if (RANGES[i] >= want * .98) { ri = i; break; }
    C.ri = ri; C.RM = RANGES[ri] * 1000;
    look();
    // the radar sits back from the middle, opposite the way it looks; its reach just meets the rim that way
    s = rho * (1 + C.off) / C.RM;
    rx = cx - C.ux * C.off * rho; ry = cy + C.uz * C.off * rho;
  }
  /* which way the scope looks: toward the part of the radar's reach that is map (the rest is past the edge) */
  function look() {
    const key = (cur ? cur.id : -1) + '|' + C.ri;
    if (key === lookKey && Math.abs(C.x - lookX) + Math.abs(C.z - lookZ) < C.RM * .1) return;
    lookKey = key; lookX = C.x; lookZ = C.z;
    const W2 = map.W / 2, H2 = map.H / 2;
    let sx = 0, sz = 0, n = 0;
    for (let i = 0; i < 48; i++) for (let j = 1; j <= 8; j++) {
      const a = i * TAU / 48, r = C.RM * (j - .5) / 8, x = C.x + Math.sin(a) * r, z = C.z + Math.cos(a) * r;
      if (x < -W2 || x > W2 || z < -H2 || z > H2) continue;
      sx += Math.sin(a) * r * r; sz += Math.cos(a) * r * r; n += r;          // area weighted (a ring's area goes as r)
    }
    const vx = n ? sx / n : 0, vz = n ? sz / n : 0, l = Math.hypot(vx, vz);
    C.off = l > C.RM * .06 ? Math.round(Math.min(OFFMAX, l / C.RM * 1.1) * 20) / 20 : 0;
    C.ux = C.off ? vx / l : 0; C.uz = C.off ? vz / l : 0;
  }

  /* ---------------- cached layers ---------------- */
  /* a layer afresh: resized only when its size changes (a canvas resize reallocates it through the GPU process, a
     stall behind a busy GPU); the same size is cleared and its state reset in place */
  function fresh(cv, w, h) {
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; return; }
    const c = cv.getContext('2d');
    if (c.reset) c.reset();
    else { c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.filter = 'none'; c.clearRect(0, 0, w, h); }
  }
  /* the compass ring of the display (rim, ticks, numbers), the range rings round the radar with their km */
  function rings() {
    const key = bw + '|' + bh + '|' + C.ri + '|' + pal.orb + '|' + rx + '|' + ry;
    if (key === ringKey) return;
    ringKey = key;
    fresh(ringC, bw, bh);
    const c = ringC.getContext('2d'), step = RING[C.ri] * 1000, RM = C.RM;
    c.clearRect(0, 0, bw, bh);
    c.lineCap = 'butt'; c.strokeStyle = pal.wh; c.fillStyle = pal.wh;
    c.lineWidth = pal.orb ? Math.max(1, k * .8) : d1;
    // the range rings, inside the display
    c.save(); c.beginPath(); c.arc(cx, cy, rho, 0, TAU); c.clip();
    DASH_D[0] = d1; DASH_D[1] = 3 * d1;
    c.setLineDash(pal.orb ? DASH0 : DASH_D); c.globalAlpha = pal.ring;
    for (let r = step; r < RM + 1; r += step) { c.beginPath(); c.arc(rx, ry, r * s, 0, TAU); c.stroke(); }
    c.setLineDash(DASH0);
    // their km, just inside each ring, a little off the way the scope looks (the last one says KM)
    const bl = (C.off ? Math.atan2(C.ux, C.uz) : 150 * DEG) + 24 * DEG, sn = Math.sin(bl), cs = -Math.cos(bl);
    c.font = `${pal.fw} ${Math.round(7 * k)}px ${pal.font}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.globalAlpha = .5;
    for (let r = step; r < RM + 1; r += step) {
      const R = r * s - 6 * k, x = rx + sn * R, y = ry + cs * R;
      if ((x - cx) ** 2 + (y - cy) ** 2 > (rho - 8 * k) ** 2) break;
      c.fillText(r + step > RM + 1 ? RANGES[C.ri] + ' KM' : String(r / 1000), Math.round(x), Math.round(y));
    }
    c.restore();
    // the display's rim and compass ring (north up)
    DASH_F[0] = d1; DASH_F[1] = d1;
    c.setLineDash(pal.orb ? DASH0 : DASH_F); c.globalAlpha = pal.rim;
    c.beginPath(); c.arc(cx, cy, rho, 0, TAU); c.stroke();
    c.setLineDash(DASH0);
    c.beginPath();
    for (let b = 0; b < 360; b += 10) {
      if (b % 30 === 0) continue;
      const a = b * DEG, sn2 = Math.sin(a), cs2 = -Math.cos(a), r0 = rho + 1.5 * k, r1 = r0 + 3 * k;
      c.moveTo(cx + sn2 * r0, cy + cs2 * r0); c.lineTo(cx + sn2 * r1, cy + cs2 * r1);
    }
    c.globalAlpha = .4; c.stroke();
    c.font = `${pal.fw} ${Math.round(7.5 * k)}px ${pal.font}`;
    c.globalAlpha = .55;
    for (let b = 0; b < 360; b += 30) {
      const a = b * DEG, R = rho + 9.5 * k;
      c.fillText(pad3(b), Math.round(cx + Math.sin(a) * R), Math.round(cy - Math.cos(a) * R));
    }
    c.globalAlpha = 1;
  }

  /* the coast and the land: a raster of the height grid in world-aligned cells of one css px, blitted every frame */
  function coast() {
    const OM = pal.orb && game.R && game.R.orbitalMap ? game.R.orbitalMap() : null;
    const lines = OM && OM.ready && OM.coast && OM.coast.lines ? OM.coast.lines : null;
    // the layer covers the display (its middle in the world: Dx, Dz) with a margin for a moving radar
    const Rw = rho / s, Dx = C.x + (cx - rx) / s, Dz = C.z - (cy - ry) / s;
    const key = s.toFixed(9) + '|' + k + '|' + pal.orb + '|' + !!lines + '|' + rho;
    if (key === coastKey && Math.abs(Dx - coastX) < Rw * .22 && Math.abs(Dz - coastZ) < Rw * .22) return;
    coastKey = key; coastX = Dx; coastZ = Dz;
    const m = k / s, L = Rw * 1.25, N = Math.ceil(2 * L / m);
    const i0 = Math.floor((Dx - L) / m), j0 = Math.floor((Dz + L) / m);
    coastI0 = i0; coastJ0 = j0; coastN = N; coastM = m;
    fresh(coastC, N, N);
    const c = coastC.getContext('2d');
    if (lines) {
      // the Orbital style: the engine's coast polylines as a hairline
      c.clearRect(0, 0, N, N); c.strokeStyle = pal.wh; c.lineWidth = .8; c.globalAlpha = .55; c.beginPath();
      for (const l of lines) { c.moveTo(l[0] / m - i0, j0 - l[1] / m); for (let i = 2; i < l.length; i += 2) c.lineTo(l[i] / m - i0, j0 - l[i + 1] / m); }
      c.stroke(); c.globalAlpha = 1;
      return;
    }
    const img = c.createImageData(N, N), D = new Uint32Array(img.data.buffer);
    const W2 = map.W / 2, H2 = map.H / 2, hs = map.heights, cols = map.cols, rows = map.rows, cell = map.cell;
    const M = N + 2;
    if (!mask || mask.length < M * M) mask = new Float32Array(M * M);
    // heights at the cell centres (a one-cell border; outside the map: NaN)
    for (let j = -1; j <= N; j++) {
      const z = (j0 - j - .5) * m, inZ = z >= -H2 && z <= H2, row = (j + 1) * M;
      let gj = Math.round((z + H2) / cell); gj = gj < 0 ? 0 : gj > rows - 1 ? rows - 1 : gj;
      for (let i = -1; i <= N; i++) {
        const x = (i0 + i + .5) * m;
        if (!inZ || x < -W2 || x > W2) { mask[row + i + 1] = NaN; continue; }
        let gi = Math.round((x + W2) / cell);
        if (gi > cols - 1) gi = cols - 1;
        mask[row + i + 1] = hs[gj * cols + gi];
      }
    }
    const R = pal.orb ? 246 : 238, G = pal.orb ? 245 : 238, B = pal.orb ? 242 : 228;
    const px = a => (((a * 255) | 0) << 24) | (B << 16) | (G << 8) | R;
    const cCoast = px(pal.orb ? .7 : .46), cEdge = px(.2);
    for (let j = 0; j < N; j++) {
      const row = (j + 1) * M, gj = j0 - j;
      for (let i = 0; i < N; i++) {
        const o = row + i + 1, h = mask[o], gi = i0 + i;
        if (h !== h) {
          // the map's edge: a faint dotted line just outside it
          const n4 = mask[o - 1] === mask[o - 1] || mask[o + 1] === mask[o + 1] || mask[o - M] === mask[o - M] || mask[o + M] === mask[o + M];
          if (n4 && ((gi + gj) & 1) === 0) D[j * N + i] = cEdge;
          continue;
        }
        if (h <= 0) continue;
        const l = mask[o - 1], r = mask[o + 1], u = mask[o - M], d = mask[o + M];
        if (l <= 0 || r <= 0 || u <= 0 || d <= 0) {                     // the coastline
          if (hsh(gi, gj) < (pal.orb ? .9 : .62)) D[j * N + i] = cCoast;
        } else if (!pal.orb) {                                           // the land: a stipple, denser and brighter up high
          const hk = h > 450 ? 1 : h / 450;
          if (hsh(gi * 3 + 1, gj) < .16 + .2 * hk) D[j * N + i] = px(.07 + .13 * hk);
        }
      }
    }
    c.putImageData(img, 0, 0);
  }

  /* the afterglow: a wedge trailing the beam (leading edge up; rotated to the beam every frame) */
  function wedge() {
    const R = Math.ceil(rho * (1 + C.off)) + 2, key = R + '|' + pal.orb;
    if (key === wedgeKey) return;
    wedgeKey = key; wedgeR = R;
    fresh(wedgeC, 2 * R, 2 * R);
    const c = wedgeC.getContext('2d'), WW = .85, f = WW / TAU;
    const g = c.createConicGradient(-Math.PI / 2 - WW, R, R);
    for (let j = 0; j <= 12; j++) { const t = j / 12; g.addColorStop(f * t, `rgba(${pal.rgb},${(pal.wedge * Math.pow(t, 3)).toFixed(4)})`); }
    g.addColorStop(Math.min(1, f + .0008), `rgba(${pal.rgb},0)`); g.addColorStop(1, `rgba(${pal.rgb},0)`);
    c.fillStyle = g; c.beginPath(); c.arc(R, R, R - 2, 0, TAU); c.fill();
  }

  /* sea clutter: scatterers round the radar, densest near it (out to the clutter's range, from the antenna's height),
     more in a higher sea; over water and on the display only */
  function seaState() { const w = sim.weather; return w && w.sea !== undefined ? cl01(w.sea) : .2; }
  function clutterRange() {
    const u = cur; if (!u || !u.def.sensors.radar) return 15000;
    const hAnt = Math.max(10, u.pos[1] + (u.def.sensors.radar.h || 10)), r = 18000 * Math.sqrt(hAnt / 70);
    return r < 5000 ? 5000 : r > 40000 ? 40000 : r;
  }
  function clutter() {
    const sea = seaState(), key = (cur ? cur.id : -1) + '|' + s.toFixed(9) + '|' + rx + '|' + ry + '|' + Math.round(sea * 10);
    if (key === clKey && Math.abs(C.x - clX) + Math.abs(C.z - clZ) < C.RM * .03) return;
    clKey = key; clX = C.x; clZ = C.z;
    const RM = C.RM, rc = Math.min(clutterRange(), RM * .22), N = Math.min(NCL, Math.round(520 + 700 * sea)), e = 1 - Math.exp(-RM / rc);
    const W2 = map.W / 2, H2 = map.H / 2, lim = rho * rho;
    let n = 0;
    for (let i = 0; i < N * 4 && n < N; i++) {
      const u1 = hsh(i, 11), a = hsh(i, 12) * TAU;
      const r = hsh(i, 13) < .8 ? -rc * Math.log(1 - u1 * e) : Math.sqrt(u1) * RM;
      if (r < RM * .01 || r > RM) continue;
      const sn = Math.sin(a), cs = Math.cos(a), x = C.x + sn * r, z = C.z + cs * r;
      const dx = sn * r * s, dy = -cs * r * s;
      if ((rx + dx - cx) ** 2 + (ry + dy - cy) ** 2 > lim) continue;              // off the display
      if (x > -W2 && x < W2 && z > -H2 && z < H2 && map.h(x, z) > -1) continue;    // land (past the map: open sea)
      cdx[n] = dx; cdy[n] = dy; caz[n] = a; camp[n] = .2 + .8 * Math.exp(-r / (rc * 1.4)); n++;
    }
    // by bearing: the beam paints a sector at a time
    const ord = new Array(n); for (let i = 0; i < n; i++) ord[i] = i;
    ord.sort((a, b) => caz[a] - caz[b]);
    const t1 = cdx.slice(0, n), t2 = cdy.slice(0, n), t3 = caz.slice(0, n), t4 = camp.slice(0, n);
    for (let i = 0; i < n; i++) { const j = ord[i]; cdx[i] = t1[j]; cdy[i] = t2[j]; caz[i] = t3[j]; camp[i] = t4[j]; }
    ncl = n; phValid = false;
  }
  /* the clutter's index ranges (RG, nRg) for the bearings a0 .. a0 + w (w < 2 pi; the array is sorted by bearing) */
  const RG = new Int32Array(4); let nRg = 0;
  function lb(a) { let lo = 0, hi = ncl; while (lo < hi) { const m = (lo + hi) >> 1; if (caz[m] < a) lo = m + 1; else hi = m; } return lo; }
  function arcIdx(a0, w) {
    a0 -= Math.floor(a0 / TAU) * TAU; const a1 = a0 + w;
    if (a1 <= TAU) { RG[0] = lb(a0); RG[1] = lb(a1); nRg = 1; }
    else { RG[0] = lb(a0); RG[1] = ncl; RG[2] = 0; RG[3] = lb(a1 - TAU); nRg = 2; }
  }

  /* the phosphor: the returns the beam paints (sea clutter, rain) on their own layer, fading as the beam turns on
     (e^-DECAY per rad); each frame paints only the sector swept since the last (a full repaint when the scope changes,
     time jumps, or 3 times a second while the beam is too fast to follow) */
  const phC = document.createElement('canvas'), DECAY = .55;
  let pctx = null, phKey = '', phPh = 0, phValid = false, phFast = -1, phAcc = 0;
  function phosphor() {
    const key = bw + '|' + bh + '|' + clKey + '|' + pal.orb;
    if (key !== phKey || !pctx) {
      // a new size reallocates the layer; a new clutter field (the radar moved) or palette only starts it afresh: a
      // canvas resize goes through the GPU process, and a moving radar changed the key every few seconds
      fresh(phC, bw, bh); if (!pctx) pctx = phC.getContext('2d');
      phKey = key; phValid = false;
    }
    if (C.fast) { if (!phValid || phFast !== fastN) { phFast = fastN; repaint(); } return; }
    const dA = C.ph - phPh;
    if (!phValid || phFast >= 0 || dA < 0 || dA >= TAU) { phFast = -1; repaint(); return; }
    if (dA < 1e-5) return;
    // fade in steps of a quarter radian or more (8-bit alpha would stall on smaller steps)
    phAcc += dA;
    if (phAcc >= .25) {
      pctx.globalCompositeOperation = 'destination-out'; pctx.globalAlpha = 1 - Math.exp(-DECAY * phAcc); pctx.fillRect(0, 0, bw, bh);
      pctx.globalCompositeOperation = 'source-over'; phAcc = 0;
    }
    arcIdx(phPh, dA);
    for (let r = 0; r < nRg; r++) paintClutter(RG[r * 2], RG[r * 2 + 1]);
    paintRain(dA);
    bflush(pctx, pal.wh, d1);
    phPh = C.ph;
  }
  function repaint() {
    pctx.globalCompositeOperation = 'source-over'; pctx.clearRect(0, 0, bw, bh);
    paintClutter(0, ncl); paintRain(TAU);
    bflush(pctx, pal.wh, d1);
    phPh = C.ph; phValid = true; phAcc = 0;
  }
  /* sea clutter i0 .. i1: this turn's return of each (new every turn), as bright as the time since the beam passed */
  function paintClutter(i0, i1) {
    for (let i = i0; i < i1; i++) {
      const d = since(caz[i]), A = hsh(i * 7 + 1, swN), th = .3 + .5 * camp[i];
      if (A > th) continue;
      const a = camp[i] * (C.fast ? .45 : Math.exp(-DECAY * d)) * (.5 + .5 * (1 - A / th));
      if (a < .02) continue;
      bdot(Math.round(rx + cdx[i]), Math.round(ry + cdy[i]), a);
    }
  }
  /* rain and storm cells: clutter blobs drifting with the cells; only the parts the beam swept (d < dA) */
  function paintRain(dA) {
    const W = sim.weather, cells = W && W.cells ? W.cells() : null;
    if (!cells) return;
    const RM = C.RM, rho2 = rho * rho;
    for (let ci = 0; ci < cells.length; ci++) {
      const cc = cells[ci], q = cc.q === undefined ? 1 : cc.q, rr = cc.r || 0;
      if (q < .02 || rr < 100 || Math.hypot(cc.x - C.x, cc.z - C.z) - rr > RM) continue;
      const px0 = X(cc.x), py0 = Z(cc.z), rpx = rr * s;
      if ((px0 - cx) ** 2 + (py0 - cy) ** 2 > (rho + rpx) ** 2) continue;
      const sg = rr * .5, sp = sg * s, R0 = Math.hypot(px0 - rx, py0 - ry);
      // the cell's bearings from the radar: skip it when the swept sector misses them
      const w = R0 > 2.6 * sp ? Math.asin(2.6 * sp / R0) : Math.PI, az0 = brgOf(px0, py0), d0 = since(az0);
      if (dA < TAU && w < Math.PI && d0 - w >= dA && d0 + w < TAU) continue;
      const rc = rpx / k, n = Math.max(20, Math.min(240, Math.round(rc * rc * .7 * q))), seed = (cc.seed | 0) & 0xfffff;
      const G = rainOf(seed), el = .75 + .25 * hsh(seed, 9), far = R0 > 6 * sp, cb = Math.cos(az0) / R0, sb = Math.sin(az0) / R0;
      for (let j = 0; j < n; j++) {
        const gx = G[j * 2], gz = G[j * 2 + 1] * el, ox = gx * sp, oy = -gz * sp, px = px0 + ox, py = py0 + oy;
        if ((px - cx) ** 2 + (py - cy) ** 2 > rho2) continue;
        const d = since(far ? az0 + ox * cb + oy * sb : brgOf(px, py));
        if (d >= dA) continue;
        const core = Math.exp(-.5 * (gx * gx + gz * gz)), A = hsh(seed + j * 5 + 1, swN);
        if (A > .3 + .6 * core) continue;
        const a = q * (C.fast ? .45 : Math.exp(-DECAY * d)) * (.3 + .7 * core);
        if (a < .02) continue;
        bdot(Math.round(px), Math.round(py), a > .95 ? .95 : a);
      }
    }
  }

  /* ---------------- drawing helpers (backing px) ---------------- */
  function sq(x, y, sz, col, a) { ctx.globalAlpha = a; ctx.fillStyle = col; ctx.fillRect(Math.round(x - sz / 2), Math.round(y - sz / 2), sz, sz); }
  function dashed(col, a, on, off) {
    ctx.strokeStyle = col; ctx.globalAlpha = a; ctx.lineCap = 'butt';
    if (pal.orb) { ctx.setLineDash(DASH0); ctx.lineWidth = Math.max(1, k * .8); return; }
    DASH_S[0] = on; DASH_S[1] = off; ctx.setLineDash(DASH_S); ctx.lineWidth = d1;
  }
  function circ(x, y, r, col, a, on, off) { dashed(col, a, on, off); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke(); }
  function seg(x0, y0, x1, y1, col, a, on, off) { dashed(col, a, on, off); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
  /* how long ago (rad of the turn) the beam passed a bearing, and which turn painted it (swN) */
  let swN = 0;
  function since(az) {
    if (C.fast) { swN = fastN; return 2.2; }
    let d = C.ph - az; const n = Math.floor(d / TAU); d -= n * TAU; swN = n; return d;
  }
  /* distance from (x, y) along the unit direction (dx, dy) to the display's rim */
  function toRim(x, y, dx, dy) {
    const ox = x - cx, oy = y - cy, b = ox * dx + oy * dy, c = ox * ox + oy * oy - rho * rho, D = b * b - c;
    return D > 0 ? -b + Math.sqrt(D) : 0;
  }
  /* a tag slot that does not overlap the ones placed (rect in backing px) */
  function free(x0, y0, x1, y1) {
    if (x0 < 1 || y0 < 1 || x1 > bw - 1 || y1 > bh - 1) return false;
    for (let i = 0; i < nR; i++) { const o = i * 4; if (x0 < RECT[o + 2] && RECT[o] < x1 && y0 < RECT[o + 3] && RECT[o + 1] < y1) return false; }
    if (nR < 64) { const o = nR * 4; RECT[o] = x0; RECT[o + 1] = y0; RECT[o + 2] = x1; RECT[o + 3] = y1; nR++; }
    return true;
  }
  function reserve(x0, y0, x1, y1) { if (nR < 64) { const o = nR * 4; RECT[o] = x0; RECT[o + 1] = y0; RECT[o + 2] = x1; RECT[o + 3] = y1; nR++; } }
  const X = x => rx + (x - C.x) * s, Z = z => ry - (z - C.z) * s;
  const brgOf = (x, y) => Math.atan2(x - rx, ry - y);
  /* square dots batched by alpha (16 levels, finer at the faint end): one path and one fill per level */
  const NBK = 16, BCAP = 3000, BK = new Int16Array(NBK * BCAP * 2), BN = new Int32Array(NBK);
  function bdot(x, y, a) {
    let b = (Math.sqrt(a > 1 ? 1 : a) * NBK) | 0; if (b >= NBK) b = NBK - 1;
    const n = BN[b]; if (n >= BCAP) return;
    const o = (b * BCAP + n) * 2; BK[o] = x; BK[o + 1] = y; BN[b] = n + 1;
  }
  function bflush(c, col, sz) {
    c.fillStyle = col;
    for (let b = 1; b < NBK; b++) {
      const n = BN[b]; if (!n) continue;
      const v = (b + .6) / NBK; c.globalAlpha = v * v;
      c.beginPath();
      for (let i = 0, o = b * BCAP * 2; i < n; i++, o += 2) c.rect(BK[o], BK[o + 1], sz, sz);
      c.fill();
    }
    BN.fill(0);
  }
  /* a rain cell's scatterers: unit gaussian offsets per cell seed (made once) */
  const RAIN = new Map();
  function rainOf(seed) {
    let a = RAIN.get(seed);
    if (!a) {
      if (RAIN.size > 48) RAIN.clear();
      a = new Float32Array(320 * 2);
      for (let j = 0; j < 320; j++) { a[j * 2] = gH(seed + j * 5, 3); a[j * 2 + 1] = gH(seed + j * 5, 7); }
      RAIN.set(seed, a);
    }
    return a;
  }

  /* ---------------- one frame ---------------- */
  function draw(c2, w, h, kk, fp, pings) {
    ctx = c2;
    if (w !== bw || h !== bh || kk !== k) {
      bw = w; bh = h; k = kk; d1 = Math.max(1, Math.round(k));
      cx = Math.round(bw / 2); cy = Math.round(bh / 2); rho = Math.floor(Math.min(bw - 46 * k, bh - 38 * k) / 2);     // room for the compass numbers
      ringKey = coastKey = wedgeKey = clKey = lookKey = '';
    }
    const npal = hud.orbital ? PO : PC;
    if (npal !== pal) { pal = npal; ringKey = coastKey = wedgeKey = ''; }
    const yl = pal.orb && game.orbital ? game.orbital.yellow || '' : '';
    const SEL = yl === 'selection' ? '#F4D23C' : pal.sel;
    fastN = Math.floor(game.realT * 3);
    centre();
    rings(); coast();
    const me = game.side, fog = sim.fog, realT = game.realT, RM = C.RM, rho2 = rho * rho, ds = d1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, bw, bh);
    ctx.drawImage(ringC, 0, 0);
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, rho + .5, 0, TAU); ctx.clip();
    // the coast
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(coastC, Math.round(rx + (coastI0 * coastM - C.x) * s), Math.round(ry - (coastJ0 * coastM - C.z) * s), coastN * k, coastN * k);
    ctx.imageSmoothingEnabled = true;

    // the beam: afterglow, the phosphor (clutter, rain), the lime edge, the edge line
    if (C.on) {
      wedge(); clutter();
      if (C.fast) { ctx.globalAlpha = pal.wedge * .35; ctx.fillStyle = pal.sweep; ctx.beginPath(); ctx.arc(rx, ry, RM * s, 0, TAU); ctx.fill(); }
      else { ctx.save(); ctx.translate(rx, ry); ctx.rotate(C.ph); ctx.globalAlpha = 1; ctx.drawImage(wedgeC, -wedgeR, -wedgeR); ctx.restore(); }
      phosphor();
      ctx.globalAlpha = 1; ctx.drawImage(phC, 0, 0);
      if (!C.fast) {
        // the leading edge lights the returns lime
        arcIdx(C.ph - .28, .28);
        for (let r = 0; r < nRg; r++) for (let i = RG[r * 2]; i < RG[r * 2 + 1]; i++) {
          let d = C.ph - caz[i]; d -= Math.floor(d / TAU) * TAU;
          bdot(Math.round(rx + cdx[i]), Math.round(ry + cdy[i]), Math.exp(-d * 11) * .95 * camp[i]);
        }
        bflush(ctx, pal.sweep, ds);
        // the beam's edge, to the rim
        const sn = Math.sin(C.ph), cs = -Math.cos(C.ph), L = Math.min(RM * s, toRim(rx, ry, sn, cs));
        seg(rx, ry, rx + sn * L, ry + cs * L, pal.sweep, .95, 2 * d1, d1);
        ctx.setLineDash(DASH0);
      }
    } else phValid = false;

    // the sites by owner
    for (const o of sim.objectives) {
      const x = X(o.x), y = Z(o.z), col = o.owner === me ? pal.own : o.owner ? pal.hot : pal.wh;
      circ(x, y, Math.max(3 * k, o.r * s), col, o.owner ? .5 : .26, d1, 2 * d1);
      ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(Math.PI / 4); ctx.globalAlpha = o.owner ? .9 : .5; ctx.fillStyle = col;
      const z = 3 * k; ctx.fillRect(-z / 2, -z / 2, z, z); ctx.restore();
    }
    ctx.setLineDash(DASH0);
    // the camera's view
    if (fp) {
      for (let i = 0; i < 4; i++) { const a = fp[i], b = fp[(i + 1) % 4]; seg(X(a[0]), Z(a[1]), X(b[0]), Z(b[1]), pal.own, pal.orb ? .55 : .75, d1, 2 * d1); }
      ctx.setLineDash(DASH0);
    }

    // own units' positions (the listeners of the bearing lines)
    nOwn = 0;
    for (const u of sim.alive(me)) {
      if (u.aboard || nOwn >= 256) continue;
      own[nOwn * 2] = u.pos[0]; own[nOwn * 2 + 1] = u.pos[2]; nOwn++;
    }

    // the hostile picture
    let ntr = 0, nct = 0;
    nH = 0;
    for (const u of sim.list()) {
      if (u.side === me || !u.alive || u.aboard) continue;
      const v = game.vis(u);
      if (!v) continue;
      const c = sim.contact(me, u.id), p = c && fog ? c.pos : u.pos;
      if (v === 'track') ntr++; else nct++;
      let f = firm.get(u.id);
      if (!f) { f = { v, t: -9 }; firm.set(u.id, f); }
      if (f.v === 'contact' && v === 'track') f.t = realT;
      f.v = v;
      let e = HL[nH]; if (!e) e = HL[nH] = { u: null, c: null, v: '', x: 0, y: 0, sub: false, f: null, in: true };
      e.u = u; e.c = c; e.v = v; e.x = X(p[0]); e.y = Z(p[2]); e.f = f; e.sub = !!c && c.dom === 'sub';
      e.in = (e.x - cx) ** 2 + (e.y - cy) ** 2 <= rho2;
      nH++;
    }
    if (firm.size > 160) for (const id of firm.keys()) { const u = sim.units.get(id); if (!u || !u.alive) firm.delete(id); }

    // heard emitters: coral bearing lines from the unit that hears each one, through the estimate to the rim
    nB = 0;
    for (let i = 0; i < nH && nB < 16; i++) {
      const e = HL[i], c = e.c;
      if (e.v !== 'contact' || !c || !c.emitting || e.sub) continue;
      let bd = 1e18, lx = 0, lz = 0;
      for (let j = 0; j < nOwn; j++) { const dx = own[j * 2] - c.pos[0], dz = own[j * 2 + 1] - c.pos[2], d = dx * dx + dz * dz; if (d < bd) { bd = d; lx = own[j * 2]; lz = own[j * 2 + 1]; } }
      if (bd === 1e18) continue;
      const L0x = X(lx), L0y = Z(lz), dx = e.x - L0x, dy = e.y - L0y, l = Math.hypot(dx, dy);
      if (l < 2 * k) continue;
      // one line per bearing (a raid heard on one bearing is one strobe)
      const b = Math.atan2(dx, -dy) + L0x * 7.3 + L0y * 3.1;
      let dup = false; for (let j = 0; j < nB; j++) if (Math.abs(BRG[j] - b) < .012) { dup = true; break; }
      if (dup) continue;
      BRG[nB++] = b;
      const ux = dx / l, uy = dy / l, far = Math.max(l, toRim(L0x, L0y, ux, uy)) + 2 * k;
      seg(L0x, L0y, L0x + ux * far, L0y + uy * far, pal.hotL, pal.orb ? .26 : .38, d1, 2 * d1);
    }
    ctx.setLineDash(DASH0);

    // contacts: "?" clouds; submarines: sonar rings; the firming of a new track
    ctx.font = `${pal.fw} ${Math.round(8 * k)}px ${pal.font}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    if (ctx.font !== fontKey) { fontKey = ctx.font; charW = ctx.measureText('0').width; }
    nR = 0; nQ = 0;
    // the corners' readouts keep the tags off
    reserve(0, 0, 64 * k, 26 * k); reserve(bw - 48 * k, 0, bw, 16 * k);
    for (let i = 0; i < nH; i++) {
      const e = HL[i], c = e.c, u = e.u;
      if (!e.in) continue;
      const P = C.on ? (C.fast ? .5 : Math.exp(-since(brgOf(e.x, e.y)) * 1.1)) : .35;
      const err = c ? c.err : 50, sig = Math.max(1.6 * k, Math.min(26 * k, err * s * .85));
      if (e.sub) {
        // a boat heard by sonar: a white ring round the fix
        circ(e.x, e.y, Math.max(3 * k, err * s), pal.wh, .6, d1, d1);
        if (e.v === 'contact') continue;
      }
      const fk = e.v === 'track' ? (realT - e.f.t) / .7 : -1;
      if (e.v === 'contact' || (fk >= 0 && fk < 1)) {
        // the cloud: dots scattered by the error, reshuffled by every return; collapsing onto the track as it firms
        const n = Math.max(6, Math.min(26, Math.round(5 + sig / k * 1.2))), key = c ? (c.hits & 1023) * 5 + 3 : 3, id = u.id * 131;
        const shrink = fk >= 0 ? 1 - fk * fk * (3 - 2 * fk) : 1, a0 = e.v === 'contact' ? .45 + .5 * P : .9 * shrink;
        ctx.fillStyle = e.v === 'contact' ? pal.wh : pal.sweep;
        for (let j = 0; j < n; j++) {
          ctx.globalAlpha = a0 * (.55 + .45 * hsh(id + j, key + 9));
          ctx.fillRect(Math.round(e.x + gH(id + j, key) * sig * .6 * shrink), Math.round(e.y + gH(id + j, key + 2) * sig * .6 * shrink), ds, ds);
        }
        if (e.v === 'contact') {
          const qx = e.x + sig * .7 + 2 * k, qy = e.y - sig * .7 - 2 * k;
          if (nQ < 64 && free(qx - k, qy - 5 * k, qx + charW + k, qy + 5 * k)) { QXY[nQ * 2] = qx; QXY[nQ * 2 + 1] = qy; nQ++; }
        } else { circ(e.x, e.y, (2 + 9 * fk) * k, pal.sweep, (1 - fk) * .9, d1, d1); ctx.setLineDash(DASH0); }
      }
    }
    ctx.setLineDash(DASH0);
    // tracks: coral ticks with a course leader, lit lime as the beam passes
    nT = 0;
    const sel = game.selection, hov = game.hover;
    for (let i = 0; i < nH; i++) {
      const e = HL[i], c = e.c, u = e.u;
      if (e.v !== 'track') continue;
      const dom = u.def.domain, z = (dom === 'sea' ? 3.6 : dom === 'air' ? 2.6 : 3) * k;
      if (!e.in) {
        // past the display: a tick on the rim, on its bearing from the radar
        const dx = e.x - rx, dy = e.y - ry, l = Math.hypot(dx, dy) || 1, L = toRim(rx, ry, dx / l, dy / l) - 2.5 * k;
        sq(rx + dx / l * L, ry + dy / l * L, 2 * d1, pal.hot, .75);
        continue;
      }
      const vx = c && fog ? c.vel[0] : 0, vz = c && fog ? c.vel[2] : 0, sp = Math.hypot(vx, vz);
      if (sp > 1) { const L = Math.max(3 * k, Math.min(14 * k, sp * 240 * s)); seg(e.x, e.y, e.x + vx / sp * L, e.y - vz / sp * L, pal.hotL, .7, d1, d1); ctx.setLineDash(DASH0); }
      const isSel = sel.has(u.id);
      sq(e.x, e.y, z, pal.hot, 1);
      if (C.on && !C.fast) { const d = since(brgOf(e.x, e.y)); if (d < .6) sq(e.x, e.y, z, pal.sweep, Math.exp(-d * 6)); }
      if (isSel) { ctx.globalAlpha = 1; ctx.strokeStyle = pal.hot; ctx.lineWidth = d1; ctx.strokeRect(Math.round(e.x - z) + .5, Math.round(e.y - z) + .5, Math.round(z * 2), Math.round(z * 2)); }
      if (nT < NTAG) {
        let g = TG[nT]; if (!g) g = TG[nT] = { e: null, pri: 0 };
        g.e = e; g.pri = (isSel ? 4e6 : 0) + (hov === u.id ? 2e6 : 0) + (dom === 'sea' ? 1e6 : 0) - Math.hypot(e.x - rx, e.y - ry);
        nT++;
      }
    }
    // heard boats: a ring opening at each sonar fix
    for (let i = sonarRings.length - 1; i >= 0; i--) {
      const R = sonarRings[i], a = (realT - R.t0) / 2.6;
      if (a >= 1 || a < 0) { sonarRings.splice(i, 1); continue; }
      circ(X(R.x), Z(R.z), Math.max(3 * k, R.r * s) * (.35 + .9 * a), pal.wh, (1 - a) * .8, d1, d1);
    }
    ctx.setLineDash(DASH0);
    // rounds in flight: own (the threats it tracks) and the hostile ones the side sees
    for (const p of sim.projectiles.values()) {
      if (!p.alive || !p.P || p.P.mode === 'ballistic') continue;
      const mine = p.side === me;
      if (!mine && !sim.projVisible(me, p)) continue;
      if (mine && !p.P.threat) continue;
      sq(X(p.pos[0]), Z(p.pos[2]), 2 * d1, mine ? pal.rnd : pal.hot, 1);
    }
    // own units
    for (const u of sim.alive(me)) {
      if (u.aboard) continue;
      const x = X(u.pos[0]), y = Z(u.pos[2]), isSel = sel.has(u.id);
      if ((x - cx) ** 2 + (y - cy) ** 2 > rho2) continue;
      const z = (u.def.domain === 'sea' ? 3.6 : u.def.domain === 'air' ? 2.2 : 2.8) * k * (u.def.hq ? 1.3 : 1);
      sq(x, y, z, isSel && SEL !== pal.sel ? SEL : pal.own, 1);
      if (isSel) { ctx.globalAlpha = .95; ctx.strokeStyle = SEL; ctx.lineWidth = Math.max(1, k * .8); ctx.strokeRect(Math.round(x - z) + .5, Math.round(y - z) + .5, Math.round(z * 2), Math.round(z * 2)); }
    }
    // pings (the minimap's)
    for (let i = pings.length - 1; i >= 0; i--) {
      const P = pings[i], a = (realT - P.t0) / P.dur;
      if (a >= 1) { pings.splice(i, 1); continue; }
      circ(X(P.x), Z(P.z), (3 + a * 14) * k, pal.orb && P.col === '#C6F432' ? pal.own : P.col, 1 - a, d1, d1);
    }
    ctx.setLineDash(DASH0);
    // the camera's aim
    sq(X(game.camera.target[0]), Z(game.camera.target[2]), 2 * d1, pal.own, 1);
    ctx.restore();

    // over the rim: the contacts' ? and the tracks' tags
    ctx.font = fontKey; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.globalAlpha = .9; ctx.fillStyle = pal.wh;
    for (let i = 0; i < nQ; i++) ctx.fillText('?', Math.round(QXY[i * 2]), Math.round(QXY[i * 2 + 1]));
    // their tags: TRK 41 · 0.99 (the most important few that find room)
    if (nT > 1) sortTags();
    let placed = 0;
    ctx.textAlign = 'left';
    for (let i = 0; i < nT && placed < 6; i++) {
      const e = TG[i].e, c = e.c, id = c ? c.track : 'TRK ' + String(e.u.id).padStart(2, '0'), val = c ? ' · ' + c.conf.toFixed(2) : '';
      const w = (id.length + val.length) * charW, hgt = 5 * k, y0 = e.y - 7 * k;
      let x0 = e.x + 5 * k;
      if (!free(x0, y0 - hgt, x0 + w, y0 + hgt)) { x0 = e.x - 5 * k - w; if (!free(x0, y0 - hgt, x0 + w, y0 + hgt)) continue; }
      if (pal.orb) { const q = Math.round(4 * k); ctx.globalAlpha = 1; ctx.fillStyle = pal.hot; ctx.fillRect(Math.round(x0 - q - 2 * k), Math.round(y0 - q / 2), q, q); }
      ctx.globalAlpha = .95; ctx.fillStyle = pal.hotL; ctx.fillText(id, Math.round(x0), Math.round(y0));
      ctx.globalAlpha = .75; ctx.fillStyle = pal.wh; ctx.fillText(val, Math.round(x0 + id.length * charW), Math.round(y0));
      placed++;
    }

    // the corners: the antenna's rate and the time rate it turns at on screen; the range
    ctx.textBaseline = 'top'; ctx.font = `${pal.fw} ${Math.round(8 * k)}px ${pal.font}`;
    ctx.textAlign = 'left'; ctx.globalAlpha = .9; ctx.fillStyle = C.on ? pal.own : pal.wh;
    ctx.fillText(C.rpm, Math.round(5 * k), Math.round(5 * k));
    if (C.rate) { ctx.globalAlpha = .5; ctx.fillStyle = pal.wh; ctx.fillText(C.rate, Math.round(5 * k), Math.round(15 * k)); }
    ctx.textAlign = 'right'; ctx.globalAlpha = .6; ctx.fillStyle = pal.wh;
    ctx.fillText(RANGES[C.ri] + ' KM', Math.round(bw - 5 * k), Math.round(5 * k));
    ctx.globalAlpha = 1;
    out.ntr = ntr; out.nct = nct;
    return out;
  }
  /* the live part of the tag pool by priority (insertion sort: a few dozen at most, nothing allocated) */
  function sortTags() {
    for (let i = 1; i < nT; i++) {
      const g = TG[i]; let j = i - 1;
      while (j >= 0 && TG[j].pri < g.pri) { TG[j + 1] = TG[j]; j--; }
      TG[j + 1] = g;
    }
  }

  return {
    draw,
    /* backing px -> world [x, z] (clamped to the map) */
    toWorld(px, py) {
      const x = C.x + (px - rx) / s, z = C.z - (py - ry) / s;
      return [Math.max(-map.W / 2, Math.min(map.W / 2, x)), Math.max(-map.H / 2, Math.min(map.H / 2, z))];
    },
    /* the wheel steps the range; true when it changed */
    wheel(dy) {
      wheelAcc += dy;
      if (Math.abs(wheelAcc) < 60) return false;
      const dir = wheelAcc > 0 ? 1 : -1, i0 = userR ? RANGES.indexOf(userR) : C.ri; wheelAcc = 0;
      const i = Math.max(0, Math.min(RANGES.length - 1, i0 + dir));
      if (i === i0) return false;
      userR = RANGES[i];
      return true;
    },
    next,
    get name() { return C.name; },
    get range() { return RANGES[C.ri]; },
    /* debug: the state of the scope */
    get debug() { return { radar: cur ? cur.id : null, name: C.name, on: C.on, fast: C.fast, range: RANGES[C.ri], off: C.off, look: [C.ux, C.uz], clutter: ncl, hostile: nH, rho, s }; },
  };
}
