/* The salvo board (the Salvo and Ring films): while two or more heavy rounds of one salvo are in the air, a thin strip
   opens above the command card, in the engagement log's type (hairline rule, mono labels, no panel):

     SALVO 03 · 6 × 3M55 · TRK 22 · DDG                                    4 IN THE AIR · 1 HIT · 1 DOWN
     ─────────────────────────────────────────────────────────────────────────────────────────────────────
     R1  3M55   ·······■──────────────────────────┤   T–0:42  M 2.2  16.4 KM
     R2  3M55   ·····×                            ┤    04:09  SM-6    9.8 KM  DOWN

   One lane per round. The lanes share the salvo's time axis: the right end is the impact and a round's mark sits at
   its time to go, so rounds that will arrive together stand in one column and a ripple reads as a stagger. Interceptor
   attempts aimed at a round (SM-6, ESSM, 57E6 launches; Phalanx and 30 mm bursts) rise as ticks under its mark,
   closing as the interceptor closes, and stay as short stubs where they missed. A lane ends in HIT, DOWN (who took it,
   how far out), MISS (wide: the target moved, the ground) or SPENT (flown out to its aim point with the target already
   sunk or destroyed, or out of fuel). A finished salvo shows its outcomes for a moment, then collapses to one summary
   line (SALVO 01 · 6 × 3M55 · TRK 22 · DDG ··· 2 HIT · 1 DOWN · 3 MISS) that fades.
   It never buries the picture: at most two groups are on it, your newest salvo and the nearest raid (the others fly
   on, counted in the raid's header: "+2 raids"), each with at most four lanes (the rounds nearest their impact) and
   a "+7" line for the rest. Under a faint graphite calm. While the cinematic camera has the picture, while the hit
   replay hands back and in the radar view (V) it shrinks to a one-line strip on the bottom edge (the two headers and
   the nearest time to go); a replay itself runs with the HUD away.
   Own salvos (SALVO nn): white labels, lime marks, the enemy's interceptors coral. Raids on the player's units
   (RAID nn): coral, each lane with its target (→ TEL 03), the player's interceptors lime; a raid's round shows once
   the side's sensors see it (dead reckoning, faint, while they lose it). HIT / DOWN take the colour of the side that
   scored. Time to go is sim time; the rate is on the top bar.
   Click a lane: the camera follows that round (click it again: let go). The hit replay takes the first impact of a
   salvo (its own trigger; if its cooldown held it back, the board asks for it once per salvo). While a replay runs the
   HUD is away and the board's clock stands still (the outcomes wait for the player); it dims while the replay hands
   back.

   createSalvo(game, hud, bc) -> its own system 'salvo' (priority 69, under the HUD). The element sits at the top of the
   command card, so the toasts and the mission lines stay above it and the card's mask covers it; the board is wider
   than the card, so it also keeps its own rect in game.hudRects while it is up. game.salvo = { groups, stats, open }.
   Text is patched only when it changes; the lanes are one small canvas, redrawn while the board is up. */
import { PNAME, WNAME, unitRef, trackRef, clock, pad2, esc, LIME, CORAL } from './fmt.js';

const HEAVY = { oniks: 1, tlam: 1, slam: 1, uran: 1, kalibr: 1 };
const NAME = Object.assign({}, PNAME, { oniks: '3M55', uran: 'Kh-35U', kalibr: 'Kalibr', tlam: 'TLAM', slam: 'SLAM-ER' });
const BY = Object.assign({}, WNAME, PNAME, { ciws: 'Phalanx', gun30: '2A38M', sm6: 'SM-6', pdms: 'ESSM', sam: '57E6', aam: 'AIM-120D' });
const JOIN = 15, SPAN = 40; // sim s: a heavy launch this soon after the salvo's last one (and this soon after its first) joins it
const HOLD = 6, FADE = 1;  // board s (real; stopped while a replay runs or the game is paused) a finished salvo stays
const LANES = 4;           // lanes a group shows (the rest: the "+7" line)
const SUM = 1.8;           // board s after its last outcome a finished group collapses to its summary line
const SOUND = 340;         // m/s at sea level (the Mach readout)
const OPEN = .45;          // s: the lanes draw out
const DEG = Math.PI / 180;
const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;
const c6 = v => v < 63 ? v : 63;   // a count in a text key
const W55 = 'rgba(255,255,255,.55)', W16 = 'rgba(255,255,255,.16)', C60 = 'rgba(255,106,61,.6)', WHITE = '#FFFFFF';

const fmtD = d => d < 1000 ? Math.round(d / 10) * 10 + ' m' : (d < 10000 ? (d / 1000).toFixed(1) : Math.round(d / 1000)) + ' km';
const dKey = d => d < 1000 ? Math.round(d / 10) : d < 10000 ? 1000 + Math.round(d / 100) : 10000 + Math.round(d / 1000);
const mss = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + pad2(s % 60); };

export function createSalvo(game, hud, bc) {
  const { sim } = game, cam = game.camera;
  const el = document.createElement('div');
  el.className = 'h-salvo';
  el.style.display = 'none';
  el.innerHTML = '<div class="bd"></div><canvas></canvas>';
  const body = el.firstChild, cv = el.lastChild, cx = cv.getContext('2d');
  let host = null, strip = false;   // strip: the one-line form on the bottom edge (cinematic, replay hand-back, radar view)
  /* at the top of the command card (put back if the card was rebuilt); the strip on the HUD's root */
  function place() {
    if (strip) { if (el.parentNode !== hud.root) { hud.root.appendChild(el); host = null; } return; }
    if (host && el.parentNode === host && host.isConnected) return;
    host = bc.querySelector('.h-cmd');
    if (host) host.insertBefore(el, host.firstChild); else if (el.parentNode !== bc) bc.appendChild(el);
  }
  place();
  // the rows move only when the board changes size (rows come and go, the card widens): measured then, after layout
  if (window.ResizeObserver) new ResizeObserver(() => { if (open && !game.ui.hidden) geometry(); }).observe(el);

  const lanes = new Map();       // round (proj) id -> lane
  const ticks = new Map();       // interceptor proj id -> tick
  const groups = [];             // salvos and raids, oldest first
  let gid = 0, nOwn = 0, nIn = 0, dirty = false, pickAt = -1, anyCut = false;
  let open = false, dim = false, clockT = 0, geoAt = -1, cw = 0, ch = 0, dpr = 1, cvDpr = 0, calmRy = 0, calmRx = 0;
  let followId = 0, followT = -1, pendingReplay = null, replayEnd = -1e9, sens = null;
  const lastF = [0, 0, 0];
  const stats = { ms: 0, draw: 0, lanes: 0, asked: 0 };
  const rect = [0, 0, 0, 0];     // the board in view px while it is up (game.hudRects)

  /* ------------------------------------------------------------------ bookkeeping */
  function reset() {
    for (const g of groups) if (g.el) g.el.remove();
    groups.length = 0; lanes.clear(); ticks.clear(); nOwn = nIn = 0; followId = 0; pendingReplay = null;
    setOpen(false);
  }
  function newGroup(own, side) {
    const g = { id: ++gid, own, side, lanes: [], t0: sim.t, tLast: sim.t, quota: 0, cut: 0, nSeen: 0, air: 0, seen: 0, shown: false, n: 0, T0: 0, T0d: 0, tShown: 0,
      doneAt: -1, replayed: false, removed: false, el: null, lt: null, rt: null, multi: false, op: 1,
      ver: 0, verL: -1, ltAt: -1, rtK: -1,
      vis: false, col: false, ttgMin: 1e9, more: null, moreK: '', others: 0 };   // on the board now; collapsed; nearest time to go; the "+7" line; raids not shown
    groups.push(g);
    return g;
  }
  /* which groups the board shows: your newest salvo (the newest still flying, else the newest) and the nearest raid
     (the one whose next impact comes first, else the newest finished) -> true when that changed */
  function pick() {
    let own = null, ownAir = null, raid = null, raidAir = null, ch = false;
    for (const g of groups) {
      if (!g.shown || g.removed) continue;
      if (g.own) { own = g; if (g.air) ownAir = g; }
      else { if (!raid || g.id > raid.id) raid = g; if (g.air && (!raidAir || g.ttgMin < raidAir.ttgMin)) raidAir = g; }
    }
    const a = ownAir || own, b = raidAir || raid;
    let others = 0;
    for (const g of groups) {
      const v = g === a || g === b;
      if (!v && g.shown && !g.removed && !g.own && g.air) others++;
      if (v !== g.vis) { g.vis = v; ch = true; }
    }
    if (b && b.others !== others) { b.others = others; b.rtK = -1; }
    return ch;
  }
  function airIn(g) { for (const L of g.lanes) if (L.st === 'air') return true; return false; }
  function onLaunch(e) {
    const me = game.side;
    if (e.tk === 'proj') {
      // an interceptor at a round on the board: a tick rises under its mark
      const L = lanes.get(e.target);
      if (!L || L.st !== 'air') return;
      const k = { by: e.proj, kind: e.kind, own: e.side === me, gun: false, k: 0, d0: 0, st: 'fly', ttg: -1, t0: clockT, hit: false, L };
      L.ticks.push(k); ticks.set(e.proj, k);
      if (L.ticks.length > 14) L.ticks.splice(0, L.ticks.length - 14);
      return;
    }
    if (!HEAVY[e.kind] || e.tk !== 'unit') return;
    const own = e.side === me, tu = sim.units.get(e.target);
    if (!own && (!tu || tu.side !== me)) return;
    let g = null;
    for (let i = groups.length - 1; i >= 0; i--) {
      const q = groups[i];
      if (q.own === own && q.side === e.side && !q.removed && q.doneAt < 0 && sim.t - q.tLast < JOIN && sim.t - q.t0 < SPAN && airIn(q)) { g = q; break; }
    }
    if (!g) g = newGroup(own, e.side);
    g.tLast = sim.t; g.ver++;
    // (dom: the target's domain, kept for when it is gone: a round spent on a sunk ship reads SUNK, on a truck DESTROYED)
    const L = { id: e.proj, kind: e.kind, name: NAME[e.kind] || e.kind, own, g, i: 0, target: e.target, dom: tu ? tu.def.domain : '',
      tgt: tu ? (own ? trackRef(game, tu, false) : '→ ' + unitRef(tu)) : '?',
      st: 'air', seen: own, vis: own, ttg: 0, ttg0: -1, d: 0, mach: 0, spd: 0, tSeen: sim.t, ttgSeen: 0, dSeen: 0, goneR: -1,
      xTtg: 0, endAt: 0, endC: 0, by: '', why: '', byOwn: false, dEnd: 0, endPos: null, ticks: [], row: null,
      nT: -1, nM: -1, nD: -1, nS: '', nF: false, nV: true };
    g.lanes.push(L); lanes.set(e.proj, L);
    if (own) { L.i = ++g.seen; measure(L, sim.projectiles.get(e.proj)); }
    dirty = true;
  }
  function onGun(e) {
    if (e.tk !== 'proj') return;
    const L = lanes.get(e.target);
    if (!L || L.st !== 'air') return;
    // bursts close together are one tick (a Phalanx walks its fire in)
    const last = L.ticks[L.ticks.length - 1];
    if (last && last.gun && clockT - last.t0 < .6 && last.kind === e.weapon) { if (e.hit) { last.hit = true; last.st = 'fly'; } return; }
    L.ticks.push({ by: 0, kind: e.weapon, own: e.side === game.side, gun: true, k: 0, d0: 0, st: e.hit ? 'fly' : 'miss', ttg: L.ttg, t0: clockT, hit: !!e.hit });
    if (L.ticks.length > 14) L.ticks.splice(0, L.ticks.length - 14);
  }
  function end(L, st, o) {
    if (L.st !== 'air') return;
    L.st = st; L.endAt = sim.t; L.endC = clockT; L.g.ver++;
    L.xTtg = st === 'hit' ? 0 : L.ttg;
    L.dEnd = L.d;
    if (o && o.pos) L.endPos = o.pos.slice();
    if (o && o.why !== undefined) L.why = o.why;
    if (st === 'down') {
      L.by = BY[o.byKind] || o.byKind || '';
      L.byOwn = o.side !== undefined ? o.side === game.side : !L.own;
      // the tick that took it
      // (a missile's `by` is its own id; a gun's is its unit's: the newest burst of that gun then)
      let tk = o.by !== undefined && game.PROJ[o.byKind] ? ticks.get(o.by) : null;
      if (!tk) for (let i = L.ticks.length - 1; i >= 0; i--) if (L.ticks[i].gun && L.ticks[i].kind === o.byKind) { tk = L.ticks[i]; break; }
      if (tk) { tk.st = 'kill'; tk.k = 1; tk.ttg = L.ttg; }
    }
    for (const k of L.ticks) if (k.st === 'fly') { k.st = 'miss'; if (k.ttg < 0) k.ttg = L.ttg; }
  }

  /* where a round is on its lane: time to go, Mach, the distance to what it flies at (own: its aim point, which is
     what the side knows; a raid's: the unit it is after) */
  function measure(L, p) {
    if (!p || !p.alive) return false;
    let tx = p.aim[0], tz = p.aim[2];
    if (!L.own) { const u = sim.units.get(L.target); if (u && u.alive) { tx = u.pos[0]; tz = u.pos[2]; } }
    const d = Math.hypot(tx - p.pos[0], tz - p.pos[2]), P = p.P || game.PROJ[p.kind] || {};
    const spd = p.spd || 0;
    L.d = d; L.spd = spd; L.mach = spd / SOUND;
    L.ttg = d / Math.max(spd, (P.speed || 250) * .95, 50);
    L.tSeen = sim.t; L.ttgSeen = L.ttg; L.dSeen = d;
    if (L.ttg0 < 0) L.ttg0 = L.ttg;
    return true;
  }

  /* ------------------------------------------------------------------ per frame */
  function update(dt) {
    const t0 = performance.now();
    place();
    const R = game.replay;
    if (!(R && R.active) && !game.paused) clockT += dt;
    if (pendingReplay) firstImpact(R);
    if (!groups.length) {
      if (open) setOpen(false);
      stats.ms = stats.ms * .95 + (performance.now() - t0) * .05;
      return;
    }
    const me = game.side;
    for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi];
      let air = 0, allEnded = true, T0 = 0, tmin = 1e9;
      for (let li = 0; li < g.lanes.length; li++) {
        const L = g.lanes[li];
        if (L.st === 'air') {
          allEnded = false;
          const p = sim.projectiles.get(L.id);
          if (p && p.alive) {
            L.goneR = -1;
            const vis = L.own || sim.projVisible(me, p);
            if (!L.seen && vis) { L.seen = true; L.i = ++g.seen; g.ver++; dirty = true; }
            if (L.seen) {
              L.vis = vis;
              if (vis) measure(L, p);
              else {
                // lost by the side's sensors: dead reckoning from the last fix
                const e = sim.t - L.tSeen;
                L.ttg = Math.max(0, L.ttgSeen - e); L.d = Math.max(0, L.dSeen - L.spd * e);
              }
              air++;
              if (L.ttg < tmin) tmin = L.ttg;
              for (let ki = 0; ki < L.ticks.length; ki++) {
                const k = L.ticks[ki];
                if (k.st !== 'fly' || k.gun) continue;
                const q = sim.projectiles.get(k.by);
                if (q && q.alive) {
                  const di = Math.hypot(q.pos[0] - p.pos[0], q.pos[1] - p.pos[1], q.pos[2] - p.pos[2]);
                  if (!k.d0) k.d0 = Math.max(1, di);
                  k.k = Math.max(k.k, sat(1 - di / k.d0));
                } else { k.st = 'miss'; k.ttg = L.ttg; }
              }
            }
          } else if (L.goneR < 0) L.goneR = game.realT;
          else if (game.realT - L.goneR > .6) end(L, 'lost');       // gone without a word
        }
        if (L.seen && L.ttg0 > T0) T0 = L.ttg0;
      }
      if (air !== g.air) { g.air = air; }
      g.ttgMin = tmin;
      if (T0 > 0) { g.T0 = T0; g.T0d = g.T0d ? g.T0d + (T0 - g.T0d) * (1 - Math.exp(-dt * 5)) : T0; }
      if (!g.shown && air >= 2) { g.shown = true; g.n = g.own ? ++nOwn : ++nIn; g.tShown = clockT; dirty = true; }
      if (allEnded) { if (g.doneAt < 0) g.doneAt = clockT; } else g.doneAt = -1;
      // finished: the outcomes for a moment, then the one summary line
      const col = g.doneAt >= 0 && clockT - g.doneAt > SUM;
      if (col !== g.col) { g.col = col; g.rtK = -1; dirty = true; }
      if (g.doneAt >= 0 && (!g.shown || clockT - g.doneAt > HOLD + FADE)) { g.removed = true; dirty = true; }
      else if (g.shown) {
        const op = g.doneAt >= 0 ? 1 - sat((clockT - g.doneAt - HOLD) / FADE) : 1;
        if (Math.abs(op - g.op) > .01 || (op === 1 && g.op !== 1)) { g.op = op; if (g.el) g.el.style.opacity = op < 1 ? op.toFixed(2) : ''; }
      }
    }
    if (pick()) dirty = true;
    // the strip: the cinematic camera, the replay handing back, the radar view
    if (sens === null || (!sens && game.frameN % 60 === 0)) sens = game.getSystem('sensors') || 0;
    const sw = !!(game.cinematic || (R && R.state) || (sens && sens.scopeOn));
    if (sw !== strip) { strip = sw; el.classList.toggle('strip', sw); if (cw) { cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, cw, ch); } place(); geoAt = -1; marg = 1e9; el.style.marginLeft = el.style.marginRight = ''; for (const g of groups) { g.rtK = -1; g.verL = -1; } dirty = true; }
    if (dirty || (anyCut && game.realT - pickAt > .5)) restructure();
    // the board is up while a salvo is on it
    let any = false, n = 0;
    for (let gi = 0; gi < groups.length; gi++) { const g = groups[gi]; if (g.shown && g.vis) { any = true; for (const L of g.lanes) if (L.row) n++; } }
    if (any !== open) setOpen(any);
    stats.lanes = n;
    if (open) {
      const d = !!(R && R.state);
      if (d !== dim) { dim = d; el.classList.toggle('dim', d); }
      text();
      if (!game.ui.hidden) { if (geoAt < 0 || game.realT - geoAt > 2) geometry(); if (!strip) draw(); keepRect(); }
    }
    stats.ms = stats.ms * .95 + (performance.now() - t0) * .05;
  }

  function setOpen(on) {
    open = on;
    el.style.display = on ? '' : 'none';
    if (!on) dropRect();             // (the canvas keeps its size: the next board draws into it without a resize)
    geoAt = -1;
  }

  /* groups and rows in the DOM, added and removed one at a time (a new row types in; the others stay put). A group on
     the board (pick()) shows at most LANES lanes: all, or the ones nearest their impact (a fresh HIT / DOWN keeps its
     row a few seconds first) and a "+7" line for the rest; a collapsed group, a group off the board, none */
  function restructure() {
    dirty = false; pickAt = game.realT;
    let changed = false;
    for (let i = groups.length - 1; i >= 0; i--) {
      const g = groups[i];
      if (!g.removed) continue;
      if (g.el) g.el.remove();
      changed = true;
      for (const L of g.lanes) { lanes.delete(L.id); for (const k of L.ticks) if (k.by) ticks.delete(k.by); if (L.id === followId) followId = 0; }
      groups.splice(i, 1);
    }
    // the lanes each group may show
    const shown = groups.filter(g => g.shown);
    anyCut = false;
    for (const g of shown) { g.nSeen = 0; for (const L of g.lanes) if (L.seen) g.nSeen++; g.quota = g.vis && !g.col ? Math.min(LANES, g.nSeen) : 0; }
    for (const g of shown) {
      if (!g.el) {
        const ge = g.el = document.createElement('div');
        ge.className = 'g' + (g.own ? '' : ' in') + ' new';
        ge.innerHTML = '<div class="hd"><span class="lt"></span><span class="rt"></span></div><div class="more"></div>';
        g.lt = ge.firstChild.firstChild; g.rt = ge.firstChild.lastChild; g.more = ge.lastChild;
        ge.style.order = g.own ? '0' : '1';          // your salvo above the raid
        body.appendChild(ge);
        setTimeout(() => ge.classList.remove('new'), 700);
        changed = true;
      }
      // off the board (another salvo / raid is the one shown), collapsed to its summary line
      const dsp = g.vis ? '' : 'none';
      if (g.el.style.display !== dsp) { g.el.style.display = dsp; changed = true; }
      if (g.el.classList.contains('sum') !== g.col) { g.el.classList.toggle('sum', g.col); changed = true; }
      const seen = g.lanes.filter(l => l.seen);
      const multi = !g.own || new Set(seen.map(l => l.target)).size > 1;
      if (multi !== g.multi) { g.multi = multi; g.el.classList.toggle('tg', multi); changed = true; }
      // which lanes: all, or the nearest to impact (fresh outcomes first, then in the air by time to go, then the
      // latest to end)
      if (seen.length > g.quota) {
        const rank = L => L.st === 'air' ? L.ttg : clockT - L.endC < 4 ? -1 : 1e6 - L.endC;
        seen.sort((a, b) => rank(a) - rank(b));
      }
      for (let j = 0; j < seen.length; j++) seen[j].want = j < g.quota;
      const cut = g.quota ? seen.length - g.quota : 0;
      if (cut !== g.cut) { g.cut = cut; g.moreK = ''; changed = true; }
      if (cut > 0) anyCut = true;
      seen.sort((a, b) => a.i - b.i);
      for (const L of seen) {
        if (!L.want) { if (L.row) { L.row.el.remove(); L.row = null; changed = true; } continue; }
        if (L.row) continue;
        changed = true;
        const r = document.createElement('div');
        r.className = 'r hit new';
        r.dataset.p = L.id;
        r.innerHTML = `<span class="n">R${L.i}</span><span class="k">${esc(L.name)}</span><span class="tg">${esc(L.tgt)}</span><i class="ln"></i><span class="tt"></span><span class="m"></span><span class="d"></span><span class="e"></span>`;
        const c = r.children;
        L.row = { el: r, tt: c[4], m: c[5], d: c[6], e: c[7], ln: c[3], x0: 0, x1: 0, y: 0, yb: 0 };
        L.nT = L.nM = L.nD = -1; L.nS = '';
        // in lane order (a raid's rounds are numbered as they are seen), above the "+7" line
        let before = g.more;
        for (const o of seen) if (o.i > L.i && o.row && o.row.el.parentNode === g.el) { before = o.row.el; break; }
        g.el.insertBefore(r, before);
        setTimeout(() => r.classList.remove('new'), 700);
      }
      if (changed) g.verL = -1;
    }
    if (changed) geoAt = -1;
  }

  /* ------------------------------------------------------------------ text (patched when it changes) */
  function header(g) {
    // SALVO 03 · 6 × 3M55 · TRK 22 · DDG (the counts change as rounds join; the track as it is classified)
    const kinds = {}, tg = new Set();
    let L0 = null, kk = '', tl = '';
    for (const L of g.lanes) {
      if (!L.seen) continue;
      if (!L0) L0 = L;
      kinds[L.name] = (kinds[L.name] || 0) + 1; tg.add(L.target);
    }
    for (const n in kinds) kk += (kk ? ' · ' : '') + kinds[n] + ' × ' + n;
    if (tg.size === 1) {
      // (a target gone keeps the name it had: TRK 22 · DDG on the summary line, not the dropped track)
      const u = sim.units.get(L0.target);
      tl = u && u.alive ? (g.own ? trackRef(game, u, true) : '→ ' + unitRef(u)) : g.tlLast || L0.tgt;
      g.tlLast = tl;
    } else if (tg.size > 1) tl = tg.size + ' targets';
    // (the strip: the name and the target only)
    const html = `<b${g.own ? '' : ' class="c"'}>${g.own ? 'Salvo' : 'Raid'} ${pad2(g.n)}</b>${strip ? '' : ' · ' + esc(kk)}${tl ? ' · ' + esc(tl) : ''}`;
    if (html !== g.ltH) { g.ltH = html; g.lt.innerHTML = html; }
  }
  function text() {
    for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi];
      if (!g.shown || !g.el || !g.vis) continue;
      if (g.ver !== g.verL || game.realT - g.ltAt > 1) { g.verL = g.ver; g.ltAt = game.realT; header(g); }
      let hit = 0, down = 0, miss = 0, spent = 0, cAir = 0, cHit = 0, cDown = 0, cEnd = 0;
      for (const L of g.lanes) {
        if (!L.seen) continue;
        // the lanes the "+7" line stands for
        if (!L.row && g.cut > 0) { if (L.st === 'air') cAir++; else if (L.st === 'hit') cHit++; else if (L.st === 'down') cDown++; else cEnd++; }
        if (L.st === 'air') continue;
        if (L.st === 'hit') hit++; else if (L.st === 'down') down++; else if (L.st === 'spent') spent++; else miss++;
      }
      // the strip leads with the nearest time to go (its lanes are away)
      const tn = strip && g.air ? Math.max(0, Math.ceil(g.ttgMin)) : -1;
      // (the keys are numbers: nothing allocated per frame)
      const rk = (((((c6(g.air) * 64 + c6(hit)) * 64 + c6(down)) * 64 + c6(miss)) * 64 + c6(spent)) * 16 + Math.min(g.others, 15)) * 8192 + Math.min(tn + 1, 8191);
      if (rk !== g.rtK) {
        g.rtK = rk;
        let s = '';
        const add = x => { s += (s ? ' · ' : '') + x; };
        if (tn >= 0) add(`<b>T–${mss(tn)}</b>`);
        if (g.air) add(`<b>${g.air}</b> ${g.own ? 'in the air' : 'inbound'}`);
        if (hit) add(`<b class="${g.own ? 'l' : 'c'}">${hit} hit</b>`);
        if (down) add(`<b class="${g.own ? 'c' : 'l'}">${down} down</b>`);
        if (miss) add(`${miss} miss`);
        if (spent) add(`${spent} spent`);
        if (g.others) add(`<i>+${g.others} ${g.others === 1 ? 'raid' : 'raids'}</i>`);
        g.rt.innerHTML = s;
      }
      // "+7 · 5 in the air · 2 down": the rounds without a lane
      const mk = g.cut > 0 ? (((c6(g.cut) * 64 + c6(cAir)) * 64 + c6(cHit)) * 64 + c6(cDown)) * 64 + c6(cEnd) : 0;
      if (mk !== g.moreK) {
        g.moreK = mk;
        let s = '';
        if (mk) {
          s = `<b>+${g.cut}</b>`;
          if (cAir) s += ` · ${cAir} ${g.own ? 'in the air' : 'inbound'}`;
          if (cHit) s += ` · <span class="${g.own ? 'l' : 'c'}">${cHit} hit</span>`;
          if (cDown) s += ` · <span class="${g.own ? 'c' : 'l'}">${cDown} down</span>`;
          if (cEnd) s += ` · ${cEnd} ended`;
        }
        g.more.innerHTML = s;
        g.more.style.display = s ? '' : 'none';
      }
      for (let li = 0; li < g.lanes.length; li++) {
        const L = g.lanes[li], R = L.row;
        if (!R) continue;
        const fo = L.id === followId;
        if (L.st === 'air') {
          const nT = Math.max(0, Math.ceil(L.ttg)), nM = Math.round(L.mach * 10), nD = dKey(L.d);
          if (nT !== L.nT) { L.nT = nT; R.tt.textContent = 'T–' + mss(nT); }
          if (nM !== L.nM) { L.nM = nM; R.m.textContent = 'M ' + (nM / 10).toFixed(1); }
          if (nD !== L.nD) { L.nD = nD; R.d.textContent = fmtD(L.d); }
          if (L.nS !== 'air' || L.nF !== fo || L.nV !== L.vis) { L.nS = 'air'; L.nF = fo; L.nV = L.vis; R.el.className = 'r hit' + (L.vis ? '' : ' q') + (fo ? ' fo' : ''); R.e.textContent = ''; }
        } else if (L.nS !== L.st || L.nF !== fo) {
          L.nS = L.st; L.nF = fo; L.nT = L.nM = L.nD = -1;
          R.tt.textContent = clock(L.endAt);
          R.m.textContent = L.st === 'down' ? L.by : L.why;
          R.d.textContent = L.st === 'down' ? fmtD(L.dEnd) : '';
          R.e.textContent = L.st === 'hit' ? 'Hit' : L.st === 'down' ? 'Down' : L.st === 'miss' ? 'Miss' : L.st === 'spent' ? 'Spent' : 'Lost';
          const good = L.st === 'hit' ? L.own : L.st === 'down' ? L.byOwn : null;
          // a long reason (DESTROYED) takes the empty distance column too
          const w2 = L.st !== 'down' && String(L.why || '').length > 6;
          R.el.className = 'r hit end ' + (good === null ? 'w' : good ? 'gl' : 'gc') + (fo ? ' fo' : '') + (w2 ? ' w2' : '');
        }
      }
    }
  }

  /* ------------------------------------------------------------------ the lanes (canvas) */
  /* as wide as the room between the selection panel and the minimap allows (800 px at 1080p; narrower on a small
     window), centred on the card: the overhang is a negative margin (the board never widens the card: its CSS
     contains its inline size). The strip sizes itself. */
  let selEl = null, mapEl = null, marg = 1e9;
  function fitWidth() {
    const k = hud.scale || 1, c = host && host.getBoundingClientRect();
    if (strip || !c || c.width < 2) return;
    if (!selEl || !selEl.isConnected) selEl = hud.root.querySelector('.h-sel');
    if (!mapEl || !mapEl.isConnected) mapEl = hud.root.querySelector('.h-br');
    const mid = c.left + c.width / 2;
    let half = 400 * k;
    const a = selEl && selEl.getBoundingClientRect(), m = mapEl && mapEl.getBoundingClientRect();
    if (a && a.width > 2) half = Math.min(half, mid - a.right - 24 * k);
    if (m && m.width > 2) half = Math.min(half, m.left - mid - 24 * k);
    const w = Math.max(420 * k, 2 * half) / k;                    // css px (the HUD's 1080p units)
    const mg = Math.round((w - c.width / k) / 2);
    if (mg !== marg) { marg = mg; el.style.marginLeft = el.style.marginRight = (-mg) + 'px'; }
  }
  function geometry() {
    geoAt = game.realT;
    fitWidth();
    const b = el.getBoundingClientRect();
    if (b.width < 2) return;
    dpr = window.devicePixelRatio || 1;
    // the lanes' canvas only grows, in steps of 96 device px, and is sized in CSS to its own pixels (not the board's):
    // a canvas resize reallocates its surface through the GPU process, and every lane that came or went was one
    // (up to ~0.9 s behind a busy GPU in a big battle). The rows are drawn at their own offsets either way.
    const w = Math.round(b.width * dpr), h = Math.round(b.height * dpr);
    if (w > cw || h > ch || dpr !== cvDpr) {
      const W2 = Math.max(cw, Math.ceil(w / 96) * 96), H2 = Math.max(ch, Math.ceil(h / 96) * 96);
      cv.width = cw = W2; cv.height = ch = H2; cvDpr = dpr;
      cv.style.width = (W2 / dpr) + 'px'; cv.style.height = (H2 / dpr) + 'px';
    }
    rect[0] = Math.floor(b.left) - 10; rect[1] = Math.floor(b.top) - 10; rect[2] = Math.ceil(b.right) + 10; rect[3] = Math.ceil(b.bottom) + 4;
    // the calm under it grows with the board (1080p px)
    const ry = Math.round(b.height / (hud.scale || 1) * .5 + (strip ? 26 : 70)), rx = Math.round(b.width / (hud.scale || 1) * .5 + (strip ? 160 : 190));
    if (ry !== calmRy || rx !== calmRx) { calmRy = ry; calmRx = rx; el.style.setProperty('--sb-ry', ry + 'px'); el.style.setProperty('--sb-rx', rx + 'px'); }
    if (strip) return;
    for (const g of groups) for (const L of g.lanes) {
      const R = L.row; if (!R) continue;
      const a = R.ln.getBoundingClientRect(), r = R.el.getBoundingClientRect();
      R.x0 = a.left - b.left; R.x1 = a.right - b.left;
      R.y = Math.round(r.top + r.height * .5 - b.top) + .5; R.yb = Math.round(r.bottom - b.top) - 1;
    }
  }
  function draw() {
    const t0 = performance.now();
    if (!cw) return;
    const c = cx, s = hud.scale || 1, orb = !!hud.orbital, LIMEo = orb ? '#F6F5F2' : LIME;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cw / dpr, ch / dpr);
    c.lineWidth = 1;
    const ms = Math.round(5 * s), mh = ms / 2;
    for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi];
      if (!g.shown || !g.el || g.removed || g.op <= .01) continue;
      const T0 = Math.max(1, g.T0d || g.T0 || 1), grow = sat((clockT - g.tShown) / OPEN), ga = g.op;
      // (the Orbital style: your rounds in the one yellow while they fly, the side's interceptors white)
      const own = g.own, col = own ? (orb ? '#F4D23C' : LIME) : CORAL;
      for (let li = 0; li < g.lanes.length; li++) {
        const L = g.lanes[li], R = L.row;
        if (!R || R.x1 <= R.x0) continue;
        const x0 = R.x0, x1 = R.x1, w = x1 - x0, y = R.y, yb = R.yb;
        const ended = L.st !== 'air';
        // the lane: a hairline to the target, drawn out as the board opens; the target's bar at the end
        c.globalAlpha = ga; c.fillStyle = W16; c.fillRect(x0, y - .5, w * grow, 1);
        if (grow < 1) continue;
        c.fillStyle = own ? CORAL : WHITE; c.globalAlpha = ga * .75;
        c.fillRect(Math.round(x1) - 1, Math.round(y - 4 * s), 1, Math.round(8 * s) + 1);
        const xm = x1 - w * sat((ended ? L.xTtg : L.ttg) / T0), xs = x1 - w * sat((L.ttg0 < 0 ? L.ttg : L.ttg0) / T0);
        // the flown part, dotted (the round's own track)
        c.globalAlpha = ga * (ended ? .6 : L.vis ? 1 : .5);
        c.strokeStyle = own ? W55 : C60;
        c.setLineDash([1.5 * s, 2.5 * s]);
        c.beginPath(); c.moveTo(xs, y); c.lineTo(Math.max(xs, xm - 5 * s), y); c.stroke();
        c.setLineDash([]);
        // the interceptors: ticks rising under the mark while they fly; stubs where they missed
        const xr = Math.round(xm);
        for (let ki = 0; ki < L.ticks.length; ki++) {
          const k = L.ticks[ki];
          c.fillStyle = k.own ? LIMEo : CORAL;
          if (k.st === 'fly' && !ended) {
            const kk = k.gun ? sat((clockT - k.t0) / .3) : k.k, top = yb - kk * (yb - y - 3);
            c.globalAlpha = ga;
            if (k.gun) { for (let j = 0; j < 3; j++) c.fillRect(xr - 1 - j * 2, top + j * 2.5 * s, 1, 1.5 * s); }
            else { c.fillRect(xr - 1, top, 1, yb - top + 1); c.fillRect(xr - 2, top - 1, 3, 3); }
          } else if (k.st === 'miss') {
            const xk = Math.round(x1 - w * sat((k.ttg < 0 ? L.ttg : k.ttg) / T0));
            c.globalAlpha = ga * .5;
            if (k.gun) { c.fillRect(xk - 1, yb - 3 * s, 1, 1.5 * s); c.fillRect(xk - 3, yb - 1.5 * s, 1, 1.5 * s); }
            else c.fillRect(xk - 1, yb - 4 * s, 1, 4 * s + 1);
          }
        }
        // the mark
        if (!ended) {
          c.globalAlpha = ga;
          if (L.vis) { c.fillStyle = col; c.fillRect(Math.round(xm - mh), Math.round(y - mh), ms, ms); }
          else { c.strokeStyle = col; c.strokeRect(Math.round(xm - mh) + .5, Math.round(y - mh) + .5, ms - 1, ms - 1); }
          // the round the camera follows: the films' corner brackets round its mark
          if (L.id === followId) {
            const b = 6 * s, q = 3 * s;
            c.strokeStyle = WHITE; c.beginPath();
            c.moveTo(xm - b, y - b + q); c.lineTo(xm - b, y - b); c.lineTo(xm - b + q, y - b);
            c.moveTo(xm + b - q, y - b); c.lineTo(xm + b, y - b); c.lineTo(xm + b, y - b + q);
            c.moveTo(xm + b, y + b - q); c.lineTo(xm + b, y + b); c.lineTo(xm + b - q, y + b);
            c.moveTo(xm - b + q, y + b); c.lineTo(xm - b, y + b); c.lineTo(xm - b, y + b - q);
            c.stroke();
          }
        } else if (L.st === 'hit') {
          // the impact: short spokes flash out, then a steady square on the target's bar
          const a = clockT - L.endC, f = 1 - sat(a / 1.2);
          c.globalAlpha = ga; c.fillStyle = col;
          c.fillRect(Math.round(x1 - mh), Math.round(y - mh), ms, ms);
          if (f > 0) {
            c.globalAlpha = ga * f; c.strokeStyle = col;
            const r0 = 5 * s, r1 = r0 + 7 * s * (1 - f * .6);
            c.beginPath();
            for (let j = 0; j < 8; j++) { const an = j * Math.PI / 4, cs = Math.cos(an), sn = Math.sin(an); c.moveTo(x1 + cs * r0, y + sn * r0); c.lineTo(x1 + cs * r1, y + sn * r1); }
            c.stroke();
          }
        } else if (L.st === 'down') {
          // taken down: a cross in the colour of the side that took it, and the tick that got there
          const kc = L.byOwn ? LIMEo : CORAL, r = 3.5 * s;
          c.globalAlpha = ga; c.strokeStyle = kc; c.lineWidth = 1.5;
          c.beginPath(); c.moveTo(xm - r, y - r); c.lineTo(xm + r, y + r); c.moveTo(xm - r, y + r); c.lineTo(xm + r, y - r); c.stroke();
          c.lineWidth = 1;
          c.fillStyle = kc; c.globalAlpha = ga * .8; c.fillRect(xr - 1, y + r + 1, 1, Math.max(0, yb - y - r));
        } else {
          c.globalAlpha = ga * .5; c.strokeStyle = WHITE;
          c.strokeRect(Math.round(xm - mh) + .5, Math.round(y - mh) + .5, ms - 1, ms - 1);
        }
      }
    }
    c.globalAlpha = 1;
    stats.draw = stats.draw * .95 + (performance.now() - t0) * .05;
  }

  /* the board's ground stays clear of world tags (the card's rect is the mask's; the board is wider than the card) */
  function keepRect() {
    const H = game.hudRects;
    if (!H || !rect[2]) return;
    const i = H.indexOf(rect), veiled = hud.root.classList.contains('veil');   // the pause menu / end block: no board
    if (veiled) { if (i >= 0) H.splice(i, 1); }
    else if (i < 0) H.push(rect);
  }
  function dropRect() {
    const H = game.hudRects;
    if (H) { const i = H.indexOf(rect); if (i >= 0) H.splice(i, 1); }
    rect[0] = rect[1] = rect[2] = rect[3] = 0;
  }

  /* ------------------------------------------------------------------ the first impact: the hit replay */
  function firstImpact(R) {
    const pr = pendingReplay;
    pendingReplay = null;
    // the replay's own trigger had its chance on the same event (it runs first); only if its cooldown held it back
    if (!R || R.active || !R.auto || game.paused || game.ui.hidden || (game.inspect && game.inspect.active)) return;
    if (game.realT - pr.rt > .5 || game.realT - replayEnd < 12) return;
    const last = R.last;
    if (last && last.id === pr.id && Math.abs(last.t - pr.t) < .6) { stats.asked++; R.play(); }
  }

  /* ------------------------------------------------------------------ input: a lane follows its round */
  const followFn = () => {
    const p = sim.projectiles.get(followId);
    if (p && p.alive) { lastF[0] = p.pos[0]; lastF[1] = p.pos[1]; lastF[2] = p.pos[2]; followT = game.realT; return lastF; }
    if (followId && game.realT - followT < 2.5) return lastF;       // a moment on where it ended
    followId = 0;
    return null;
  };
  function followLane(L) {
    if (followId === L.id && cam.followFn === followFn) { cam.follow(null); followId = 0; hud.click(); return; }
    const dir = game.getSystem('director'); if (dir && dir.on && dir.set) dir.set(false);
    if (game.follow) game.follow(null);
    const p = sim.projectiles.get(L.id);
    if (p && p.alive && L.st === 'air') {
      followId = L.id; followT = game.realT;
      cam.follow(followFn, false);
      const G = cam.goal;
      // close behind and to one side, a little above: the round and the sea it runs over
      G.dist = 240;
      G.yaw = p.hdg + .42;
      G.pitch = Math.max(cam.minPitch || 0, 7 * DEG);
    } else {
      followId = 0;
      const u = sim.units.get(L.target), at = L.endPos || (u && u.pos);
      if (at) cam.flyTo([at[0], undefined, at[2]], { dist: 2200 });
    }
    hud.click();
  }
  el.addEventListener('mousedown', e => {
    const r = e.target.closest('.r');
    if (!r) return;
    e.stopPropagation(); e.preventDefault();
    if (e.button !== 0) return;
    const L = lanes.get(+r.dataset.p);
    if (L) followLane(L);
  });

  /* ------------------------------------------------------------------ events */
  function onEvent(e) {
    switch (e.type) {
      case 'launch': onLaunch(e); break;
      case 'gunfire': onGun(e); break;
      case 'hit': {
        const L = lanes.get(e.proj);
        if (!L) break;
        end(L, 'hit', { pos: e.pos });
        if (L.g.shown && !L.g.replayed && L.seen) { L.g.replayed = true; pendingReplay = { id: e.target, t: sim.t, rt: game.realT }; }
        break;
      }
      case 'intercept': {
        const L = lanes.get(e.proj);
        if (!L) break;
        const by = sim.units.get(e.unit);
        end(L, 'down', { byKind: e.byKind, by: e.by, side: by ? by.side : undefined, pos: e.pos });
        break;
      }
      case 'splash': {
        const L = lanes.get(e.proj);
        if (L) {
          // wide of a target that moved or behind a hill (MISS); flown out to the aim point with the target already
          // gone, or out of fuel (SPENT): the reason in the by-column
          // (a target already removed from the sim: its domain as it was at the launch)
          const u = sim.units.get(L.target), gone = !u || !u.alive, dom = u ? u.def.domain : L.dom;
          const spent = e.why === 'lost' || e.why === 'selfdestruct';
          const why = e.why === 'selfdestruct' ? 'Fuel' : e.why === 'lost' ? (gone ? (dom === 'sea' || dom === 'sub' ? 'Sunk' : 'Destroyed') : 'No trk')
            : e.why === 'moved' ? 'Moved' : e.why === 'terrain' ? 'Ground' : '';
          end(L, spent ? 'spent' : 'miss', { pos: e.pos, why });
        }
        else { const k = ticks.get(e.proj); if (k && k.st === 'fly') { k.st = 'miss'; k.ttg = k.L.ttg; } }
        break;
      }
    }
  }

  game.bus.on('side', reset);
  game.bus.on('replay', d => { if (d && !d.on) replayEnd = game.realT; });

  const sys = {
    name: 'salvo', priority: 69,
    update, onEvent,
    get open() { return open; },
    dispose() { el.remove(); dropRect(); },
  };
  game.salvo = { get groups() { return groups; }, stats, get open() { return open; }, sys };
  game.addSystem(sys);
  return sys;
}
