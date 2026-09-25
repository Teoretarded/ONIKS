/* Debrief: the film. Runs in the debrief frame (play.html?...&debrief=film): a second game built from the record's setup,
   its sim fed the recorded commands at their ticks, filmed as one continuous take.

   The sim is driven here, not by the game's clock: every frame the film's time rate (eased keys, FILM.warp) says how far
   the sim goes; the steps are taken here (the game's own step is held), the commands of each tick applied after it, the
   recorded state hashes checked as their ticks pass, the events dispatched to every system as usual, and the render
   interpolation set for the exact sim time. Anything else that would command the sim here (a key, a system) is held
   back: the recorded commands are the only ones.

   The take (plan.js picks the moments; each shot is built when it starts, from where things are then):
     launch    side-on at the launcher, the round off the rail at x0.4, the camera turning after it
     chase     behind the round (its heading frame), the rate up to x8-x32 over the long leg and back to x1 for the end
     hit       the hit replay's own X-ray moment (it takes the camera and the rate and gives them back); without it, a
               held look at the impact
     wreck     round the hull as she goes down (or the wreck burning)
     skip      up into the Orbital map while the sim runs ahead (the rate on screen: x200 and more), then down onto the
               next moment: the films' own way through a gap in time, never a cut
     approach  down onto the decisive round in flight, behind it to its impact (then hit and wreck)
     orbital   the climb out into the Orbital map, every round's track drawn on in launch order, the tally
   The shots hand over without a cut: each one starts from the view on screen. Captions 'Fig. N' bottom left, the
   readout top right (the subject, T+ the match clock, the rate: lime while it is not x1).

   Keys: Esc ends it (back to the end screen; during an X-ray moment it skips that, as its chip says) · P / Space pause · H captions · F8 a still · Shift F8 the film as a PNG
   sequence (the frame reloads and renders it at 30 fps into game/shots/debrief/<name>/) · V the replay viewer from here.
   role 'view' (debrief/viewer.js): the same match, free camera, the viewer's rate and a scrub bar. */
import { cursor } from '../record.js';
import { makePlan } from './plan.js';
import { createView, DEG, clamp } from './view.js';
import { rateAt, fmtRate } from '../filmmaker/path.js';
import * as DR from './draw.js';
import * as LB from '../labels.js';
import { createViewer } from './viewer.js';

const PRI = 127;
const HEAVY_REPLAY = { oniks: 1, tlam: 1, slam: 1 };
/* a chase camera's distance by the round's size (the 3M55 is 8.9 m long; the smaller ones not much closer: their fins fill the frame) */
const SIZE = { oniks: 1, tlam: .9, slam: .85, kalibr: .9, uran: .8, hellfire: .6 };
const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;
const ss = (a, b, v) => { const t = sat((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const NICE = [1, 2, 4, 8, 16, 32];
const pad2 = n => String(n).padStart(2, '0');
const pad4 = n => String(n).padStart(4, '0');
const V3 = (a, b, k) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

/* ------------------------------------------------------------------ rate schedules (rateAt eases key to key with a
   smoothstep: a ramp's mean is the mean of its ends, so the sim time a schedule covers is exact) */
function covered(rates, t) {
  if (!rates.length) return 0;
  let s = 0;
  if (t <= rates[0].t) return rates[0].rate * t;
  s += rates[0].rate * rates[0].t;
  for (let i = 0; i < rates.length - 1; i++) {
    const a = rates[i], b = rates[i + 1];
    if (t <= a.t) break;
    if (t >= b.t) { s += (a.rate + b.rate) / 2 * (b.t - a.t); continue; }
    // inside a ramp: integrate the smoothstep numerically (few steps)
    const n = 24, h = (t - a.t) / n;
    for (let k = 0; k < n; k++) s += rateAt(rates, a.t + (k + .5) * h) * h;
    return s;
  }
  const L = rates[rates.length - 1];
  if (t > L.t) s += L.rate * (t - L.t);
  return s;
}
/* the real time at which the schedule has covered `span` sim seconds */
function timeFor(rates, span, tMax) {
  let lo = 0, hi = tMax || 600;
  if (covered(rates, hi) < span) return hi;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (covered(rates, m) < span) lo = m; else hi = m; }
  return hi;
}
/* x r0 -> x R (over rin) -> hold -> x r1 (over rout), sized to cover `span`; R the largest nice rate at most `want` */
function fitRates(span, want, rin, rout, r0, r1) {
  r0 = r0 || 1; r1 = r1 || 1;
  for (let i = NICE.length - 1; i >= 0; i--) {
    const R = NICE[i];
    if (R > want * 1.25 && i > 0) continue;
    const fixed = (r0 + R) / 2 * rin + (R + r1) / 2 * rout;
    const dur = rin + rout + (span - fixed) / R;
    if (dur >= rin + rout + .2 || R === 1) {
      if (R === 1 || dur < rin + rout) return { rates: [{ t: 0, rate: 1 }], dur: Math.max(.5, span), R: 1 };
      return { rates: [{ t: 0, rate: r0 }, { t: rin, rate: R }, { t: dur - rout, rate: R }, { t: dur, rate: r1 }], dur, R };
    }
  }
  return { rates: [{ t: 0, rate: 1 }], dur: Math.max(.5, span), R: 1 };
}
const niceUnder = v => { let r = 1; for (const n of NICE) if (n <= v) r = n; return r; };
/* the Orbital map's draw-on of the tracks over the final shot's time (launch order, the whole match in 4.4 s) */
const TRACK_K = t => ss(3.6, 7.6, t);

export async function createPlayer(game, ctx, role) {
  const { sim, R } = game, cam = R.camera, bus = game.bus, DT = game.DT;
  const Q = new URLSearchParams(location.search);
  const SEQ = Q.get('seq') === '1';
  const VIEW = role === 'view';
  let viewer = null;
  const host = findHost();
  let rec = null;
  try { rec = host ? JSON.parse(host.json()) : JSON.parse(localStorage.getItem('oniks.lastRecord') || 'null'); } catch (e) { rec = null; }

  const F = {
    state: 'boot', err: '', shots: [], i: -1, cur: null, t: 0, paused: false, hideText: false,
    simT: 0, rateShown: 1, rateEff: 1, hold: true, fadeIn: 0, endT: 0, waitT: 0,
    checked: 0, bad: 0, firstBad: null, blocked: 0, capTxt: '', capFig: 0, capT0: 0, capA: 0,
    seqI: 0, seqGo: false, seqBase: '',
  };
  const D = { driving: 0, inStep: 0, applying: 0 };
  const view = createView(game);
  const cur = rec ? cursor(rec) : null;
  const HASH = new Map(rec ? rec.hashes : []);
  let plan = null, prep = null, tally = null;

  /* ------------------------------------------------------------------ the sim: held, fed only the record */
  const step0 = sim.step;
  sim.step = function () {
    if (!D.driving) return;
    D.inStep++;
    try { return step0.apply(this, arguments); } finally { D.inStep--; }
  };
  const gate = (name, none) => {
    const f = sim[name];
    sim[name] = function () {
      if (D.applying || D.inStep) return f.apply(this, arguments);
      F.blocked++;
      return none;
    };
  };
  gate('order', undefined); gate('buy', false);
  const units = sim.units, del0 = units.delete;
  units.delete = function (id) { if (D.applying || D.inStep) return del0.call(units, id); F.blocked++; return false; };
  function check() {
    const want = HASH.get(sim.tick);
    if (want === undefined) return;
    F.checked++;
    const h = sim.hash();
    if (h !== want) { F.bad++; if (!F.firstBad) { F.firstBad = { tick: sim.tick, want, got: h }; console.warn(`debrief: the replayed match left the record at tick ${sim.tick} (${want} != ${h})`); } }
  }
  function stepOne() {
    D.driving++;
    try { sim.step(); } finally { D.driving--; }
    D.applying++;
    try { cur.opsTo(sim, sim.tick); } finally { D.applying--; }
    check();
  }
  /* step until the sim reaches sim time `tgt` (or the budget runs out); events go to every system */
  function advance(tgt, budgetMs) {
    const t0 = performance.now();
    let n = 0;
    while (sim.t < tgt - 1e-9) {
      stepOne(); n++;
      if (sim.events.length > 256) game.dispatchEvents();
      if (budgetMs !== undefined && (n & 3) === 0 && performance.now() - t0 > budgetMs) break;
    }
    if (n) game.dispatchEvents();
    return n;
  }
  function setAlpha() {
    const a = clamp(1 - (sim.t - F.simT) / DT, 0, 1);
    game.alpha = a; game.t = sim.t - DT * (1 - a);
  }
  const audio = () => game.getSystem('audio');
  let muted = false;
  function mute(on) { if (on === muted) return; muted = on; const a = audio(); if (a && a.mute) try { a.mute(on); } catch (e) { /* */ } }

  /* ------------------------------------------------------------------ the hit replay: held back outside its moments */
  function holdReplays() {
    const real = game.inspect;
    game.inspect = new Proxy(real || {}, {
      get(t, k) { if (k === 'active') return F.hold || !!(t && t.active); const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; },
    });
  }
  /* the sensors' scan inset is part of the interface (hidden here), but its rect is still reported, and the Orbital
     map leaves a hole where it would be: here it has no rect */
  function noInset() {
    const ss0 = game.getSystem('sensors');
    if (!ss0 || !ss0.inset) return;
    const real = ss0.inset;
    try {
      ss0.inset = new Proxy(real, { get(t, k) { if (k === 'rect') return null; const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; } });
    } catch (e) { /* a getter-only property: left alone */ }
  }
  const RP = () => game.replay || null;
  const rpActive = () => { const r = RP(); return !!(r && r.active); };
  const rpState = () => { const r = RP(); return r && r.state; };

  /* ------------------------------------------------------------------ names, the clock */
  const T = tick => 'T+' + (game.fmtTime ? game.fmtTime(tick * DT) : Math.floor(tick * DT) + ' s');
  const unitName = (type, side) => (LB.SHORT && LB.SHORT[type]) || (game.UNITS[type] && game.UNITS[type].name) || type;
  /* a round's name; the guns that shoot rounds down are weapons, not rounds: their true names */
  const GUNS = { ciws: 'Phalanx CIWS', gun30: '2A38M 30 mm', gun5: 'Mk 45 5-inch' };
  const projName = k => (game.PROJ[k] && game.PROJ[k].name) || GUNS[k] || k;
  const fmtM = m => m >= 10000 ? (m / 1000).toFixed(0) + ' km' : m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m) + ' m';

  /* ------------------------------------------------------------------ geometry helpers */
  const up = [0, 1, 0];
  const fwdOf = h => [Math.sin(h), 0, Math.cos(h)];
  const rightOf = h => [Math.cos(h), 0, -Math.sin(h)];
  function blocked(a, b) {
    let worst = -1e9;
    for (let i = 1; i < 14; i++) {
      const u = i / 14, x = a[0] + (b[0] - a[0]) * u, z = a[2] + (b[2] - a[2]) * u, y = a[1] + (b[1] - a[1]) * u;
      worst = Math.max(worst, game.ground(x, z) - y);
    }
    return worst;
  }
  const lift = (p, h) => { const g = Math.max(0, game.ground(p[0], p[2])); if (p[1] < g + h) p[1] = g + h; return p; };
  /* a track's point at a tick (its samples spread evenly over its flight) */
  function trackAt(id, tick) {
    const T0 = rec.tracks && rec.tracks[id]; if (!T0 || T0.pts.length < 3) return null;
    const t1 = T0.end ? T0.end.tick : T0.t0 + 600, n = T0.pts.length / 3;
    const f = sat((tick - T0.t0) / Math.max(1, t1 - T0.t0)) * (n - 1), i = Math.min(n - 2, Math.floor(f)), u = f - i;
    if (n < 2) return T0.pts.slice(0, 3);
    const P = T0.pts;
    return [P[i * 3] + (P[i * 3 + 3] - P[i * 3]) * u, P[i * 3 + 1] + (P[i * 3 + 4] - P[i * 3 + 1]) * u, P[i * 3 + 2] + (P[i * 3 + 5] - P[i * 3 + 2]) * u];
  }

  /* ------------------------------------------------------------------ the shots */
  function startKey(t) { const v = view.current(); return { t: t || 0, eye: v.eye, look: v.look, fov: v.fov }; }

  function shotLaunch(b) {
    const L = b.round || b.launch, u = sim.units.get(L.from), d = u ? u.def : game.UNITS[L.ftype] || { size: [12, 3, 4], domain: 'land' };
    const S = u ? game.unitPose(u).pos.slice() : L.pos.slice();
    const tgt = sim.units.get(L.target);
    const hdg = tgt ? Math.atan2(tgt.pos[0] - S[0], tgt.pos[2] - S[2]) : L.hdg;
    const f = fwdOf(hdg), sea = d.domain === 'sea', Lh = d.size[0], H = Math.max(3, d.size[2] || 4);
    const Dd = sea ? Math.max(240, Lh * 2.2) : Math.max(58, Lh * 4.4), h = sea ? 14 : 5;
    const look0w = [S[0], S[1] + H * .55, S[2]];
    // the side: the open one (lower ground, a clear line to the launcher)
    let best = null;
    for (const sgn of [1, -1]) {
      const n = rightOf(hdg).map(v => v * sgn);
      const e = lift(V3(V3(S, n, Dd), f, -Dd * .12), h);
      const cost = Math.max(0, blocked(e, look0w) + 2) * 40 + Math.max(0, game.ground(e[0], e[2])) * .5;
      if (!best || cost < best.cost) best = { n, cost };
    }
    const n = best.n;
    const sAt = (o, at) => u ? { u: L.from, fr: 'w', o, at } : at;
    const look0 = sAt([0, H * .55, 0], look0w);
    const tL = Math.max(.4, L.tick * DT - sim.t);         // sim s to the launch
    const a = Math.max(0, tL - .98);
    const rates = [{ t: 0, rate: 1 }, { t: a, rate: 1 }, { t: a + 1.2, rate: .4 }, { t: a + 3.1, rate: .4 }, { t: a + 4.7, rate: 1 }];
    const tLr = timeFor(rates, tL, 60);
    const moving = !!(u && (d.domain === 'air' || u.speed > 15));
    const E = (kn, kf, kh) => {
      const o = [n[0] * Dd * kn + f[0] * Dd * kf, h * kh, n[2] * Dd * kn + f[2] * Dd * kf];
      if (moving) return { u: L.from, fr: 'w', o, at: [S[0] + o[0], S[1] + o[1], S[2] + o[2]] };
      return lift([S[0] + o[0], S[1] + o[1], S[2] + o[2]], h * .8);
    };
    const r = L.id;
    const first = F.i === 0;
    const keys = [];
    if (!first) keys.push(startKey(0));
    keys.push({ t: first ? 0 : 2.2, eye: E(1.25, -.32, 1), look: sAt([-f[0] * Dd * .05, H * .55, -f[2] * Dd * .05], [look0w[0] - f[0] * Dd * .05, look0w[1], look0w[2] - f[2] * Dd * .05]), fov: 38 });
    keys.push({ t: Math.max(first ? 1 : 2.6, tLr - .3), eye: E(1.02, -.12, 1.1), look: sAt([0, H * .65, 0], [look0w[0], look0w[1] + H * .1, look0w[2]]), fov: 38 });
    // after the round: the eye backs off and rises, the look rides a little under the round (the horizon stays in)
    const rp = at => ({ p: r, o: [0, 0, 0], fr: 'w', at });
    keys.push({ t: tLr + 2.2, eye: E(1.35, -.05, 3.2), look: { mid: [look0, rp([S[0], S[1] + 60, S[2]])], k: .62 }, fov: 42 });
    keys.push({ t: tLr + 4.4, eye: E(1.7, .25, 7), look: { mid: [look0, rp(V3([S[0], S[1] + 150, S[2]], f, 600))], k: .62 }, fov: 44 });
    return { k: 'launch', fig: b.fig, cap: `${b.cap} · ${T(L.tick)}`, keys, rates, dur: tLr + 4.4, subj: { u: L.from, type: L.ftype, side: L.side } };
  }

  function shotChase(b) {
    const L = b.launch, r = L.id, out = b.out;
    const xray = !!(out && out.k === 'hit' && HEAVY_REPLAY[out.kind]);
    const endTick = out ? out.tick : L.tick + Math.round(600 / DT);
    const lead = xray ? 2.6 : .3;                          // sim s left at x1 for the replay to start on the way in
    const span = Math.max(.5, endTick * DT - sim.t - lead);
    const fit = fitRates(span, Math.max(1, span / 5), 2.2, 2.4, 1, 1);
    const dur = Math.max(4.8, fit.dur);
    const k = SIZE[L.kind] || 1, o = (a, b2, c) => [a * k, b2 * k, c * k];
    const k0 = startKey(0);
    // the look is on the round within a second (the eye catches up behind it), so the round never leaves the frame
    const keys = [k0,
      { t: .9, eye: { mid: [k0.eye, { p: r, fr: 'b', o: o(15, 5, -56) }], k: .3 }, look: { p: r, fr: 'w', o: [0, 0, 0] }, fov: 39 },
      { t: 2.3, eye: { p: r, fr: 'b', o: o(15, 5, -56) }, look: { p: r, fr: 'b', o: o(0, 1.5, 300) }, fov: 39 },
      { t: Math.max(3.4, dur * .55), eye: { p: r, fr: 'b', o: o(-13, 6.5, -50) }, look: { p: r, fr: 'b', o: o(0, -1, 340) }, fov: 38 },
      { t: Math.max(4.6, dur), eye: { p: r, fr: 'b', o: o(-8, 8, -66) }, look: { p: r, fr: 'b', o: o(0, 0, 280) }, fov: 38 }];
    return {
      k: 'chase', fig: b.fig, cap: `${b.cap} · ${projName(L.kind)}`, keys, rates: fit.rates, dur, subj: { p: r, kind: L.kind },
      replayOk: out && out.k === 'hit' ? { target: out.target, from: endTick - Math.round(20 / DT) } : null,
      done(sh) {
        if (sh.gotReplay) return true;
        if (!out) return sh.t >= dur + 4;
        return sh.t >= dur && sim.tick >= endTick + (xray ? 4 : 10);
      },
    };
  }

  function shotHit(b) {
    const h = b.hit, tgt = h.target;
    const sh = { k: 'hit', fig: b.fig, cap: `Hit · ${unitName(h.ttype)} · ${T(h.tick)}`, keys: null, rates: [{ t: 0, rate: .5 }], dur: 1e9, subj: { u: tgt, type: h.ttype },
      replayOk: { target: tgt, from: 0 }, noReadout: true };
    sh.begin = () => {
      if (rpActive()) { sh.mode = 'replay'; return; }
      sh.mode = 'wait';
    };
    sh.tick = () => {
      if (sh.mode === 'replay') {
        if (!rpActive()) { sh.over = true; return; }
        // not the match's decisive hit: the film moves on once the X-ray has crossed the impact and the parts are named
        const S = rpState();
        if (!b.last && S && S.tHit >= 0 && S.t - S.tHit > 3.4) { try { RP().skip(); } catch (e) { /* */ } sh.over = true; }
        return;
      }
      if (sh.mode === 'wait') {
        // the replay did not start on its own (the setting is off, or it missed): J's replay of this hit, once it lands
        if (rpActive()) { sh.mode = 'replay'; return; }
        if (sim.tick >= h.tick) {
          const r = RP(), last = r && r.last;
          if (last && last.id === tgt && sim.t - last.t < 4) { F.hold = false; try { r.play(); } catch (e) { /* */ } }
          if (rpActive()) { sh.mode = 'replay'; return; }
          // a held look at the impact instead
          sh.mode = 'look';
          const p = h.pos, sea = !!(game.UNITS[h.ttype] && game.UNITS[h.ttype].domain === 'sea');
          const v = view.current(), dx = p[0] - v.eye[0], dz = p[2] - v.eye[2], L = Math.hypot(dx, dz) || 1;
          const Dd = sea ? 520 : 240, e = lift([p[0] - dx / L * Dd, p[1] + Dd * .3, p[2] - dz / L * Dd], 8);
          sh.keys = [startKey(0), { t: 1.2, eye: e, look: [p[0], p[1] + 8, p[2]], fov: 38 }, { t: 4.2, eye: [e[0], e[1] + 40, e[2]], look: [p[0], p[1] + 12, p[2]], fov: 38 }];
          sh.t = 0; sh.dur = 4.2; sh.rates = [{ t: 0, rate: .5 }, { t: 2, rate: .5 }, { t: 4.2, rate: 1 }];
          sh.noReadout = false;
        }
      }
    };
    sh.done = s => s.over || (s.mode === 'look' && s.t >= s.dur);
    return sh;
  }

  function shotWreck(b) {
    const id = b.unit, s = view.subject({ u: id });
    const d = game.UNITS[b.type] || { size: [20, 5, 5] }, Lh = d.size[0], H = Math.max(4, d.size[2] || 6);
    const C = s ? s.pos : (b.pos || [0, 0, 0]);
    const v = view.current();
    const a0 = Math.atan2(v.eye[0] - C[0], v.eye[2] - C[2]);
    const Rr = b.sea ? Math.max(320, Lh * 2.7) : Math.max(80, Lh * 7), h = b.sea ? 26 : 16;
    const at = (a, k, hh) => ({ u: id, fr: 'w', o: [Math.sin(a) * Rr * k, hh, Math.cos(a) * Rr * k], at: [C[0] + Math.sin(a) * Rr * k, C[1] + hh, C[2] + Math.cos(a) * Rr * k] });
    const lk = { u: id, fr: 'w', o: [0, H * .35, 0], at: [C[0], C[1] + H * .35, C[2]] };
    const keys = [startKey(0), { t: 2, eye: at(a0 + .22, 1, h), look: lk, fov: 38 }, { t: 5.4, eye: at(a0 + .7, 1.2, h * 1.7), look: lk, fov: 38 }];
    return { k: 'wreck', fig: b.fig, cap: `${b.cap} · ${unitName(b.type)} · ${T(b.tick)}`, keys, rates: [{ t: 0, rate: 1 }, { t: 2, rate: 4 }], dur: 5.4, subj: { u: id, type: b.type } };
  }

  /* the Orbital device: up into the map, the sim ahead to `goal`, then the next shot comes down */
  function shotSkip(b, next) {
    // where the next shot starts: the round's point at the start tick, else its launch
    const nl = next && next.launch;
    const leadSim = next && next.k === 'approach' ? covered(APPROACH_RATES, APPROACH_T) + 2.6 : 6;
    const goal = Math.max(sim.tick + 1, Math.round((b.to * DT - leadSim) / DT));
    const gTick = nl ? Math.max(goal, nl.tick + Math.round(1 / DT)) : goal;
    const dest = (nl && trackAt(nl.id, gTick)) || (next && next.hit && next.hit.pos) || [0, 0, 0];
    const v = view.current(), l0 = v.look;
    const M = [(l0[0] + dest[0]) / 2, 0, (l0[2] + dest[2]) / 2];
    const sep = Math.hypot(dest[0] - l0[0], dest[2] - l0[2]);
    const H = clamp(sep * 1.15 + 38000, 72000, 170000);
    // looking from the player's side of the map toward the enemy's (the Orbital films' oblique)
    const sp = game.map.spawns, own = sp && sp[game.side], en = sp && sp[game.enemy];
    let bx = own && en ? own.x - en.x : 0, bz = own && en ? own.z - en.z : -1; const bl = Math.hypot(bx, bz) || 1; bx /= bl; bz /= bl;
    const top = [M[0] + bx * H * .42, H, M[2] + bz * H * .42];
    const dx = l0[0] - v.eye[0], dz = l0[2] - v.eye[2], dl = Math.hypot(dx, dz) || 1;
    const k1 = [l0[0] - dx / dl * 1800, Math.max(v.eye[1], game.ground(l0[0], l0[2])) + 3200, l0[2] - dz / dl * 1800];
    const rot = (p, a) => { const x = p[0] - M[0], z = p[2] - M[2], c = Math.cos(a), s = Math.sin(a); return [M[0] + x * c - z * s, p[1], M[2] + x * s + z * c]; };
    const keys = [startKey(0), { t: 1.8, eye: k1, look: l0.slice(), fov: 40 }, { t: 4.2, eye: top, look: M, fov: 40 }, { t: 9, eye: rot(top, .06), look: M, fov: 40 }];
    // the climb's own rate: up to x32, less when the gap is short (time never stops on screen)
    const gapS = Math.max(0, gTick * DT - sim.t), rTop = Math.max(1, Math.min(32, niceUnder(gapS / 3)));
    const r0 = Math.min(rTop, F.rateShown > 1 ? niceUnder(F.rateShown) : 1);
    return { k: 'skip', fig: 0, cap: '', keys, rates: [{ t: 0, rate: r0 }, { t: 3.8, rate: rTop }], dur: 4.2, ff: gTick, subj: null,
      done: sh => sh.t >= 4.2 && sim.tick >= gTick };
  }
  const APPROACH_RATES = [{ t: 0, rate: 32 }, { t: 2.2, rate: 6 }, { t: 4, rate: 1.5 }, { t: 5, rate: 1 }];
  const APPROACH_T = 5;
  function shotApproach(b) {
    const L = b.launch, r = L.id, h = b.hit;
    const at = trackAt(r, sim.tick) || L.pos;
    const k = SIZE[L.kind] || 1, o = (a, b2, c) => [a * k, b2 * k, c * k];
    const keys = [startKey(0),
      { t: 2.2, eye: { p: r, fr: 'b', o: [0, 2600, -3800], at: [at[0], at[1] + 2600, at[2]] }, look: { p: r, fr: 'b', o: [0, 0, 700], at }, fov: 40 },
      { t: 4.4, eye: { p: r, fr: 'b', o: o(15, 5.5, -56), at }, look: { p: r, fr: 'b', o: o(0, 1.5, 300), at }, fov: 39 },
      { t: 7.5, eye: { p: r, fr: 'b', o: o(-12, 6.5, -48), at }, look: { p: r, fr: 'b', o: o(0, -1, 340), at }, fov: 38 }];
    const own = L.side === game.side;
    return { k: 'approach', fig: b.fig, cap: `${own ? 'Strike' : 'Inbound'} · ${projName(L.kind)}`, keys, rates: APPROACH_RATES, dur: 7.5, subj: { p: r, kind: L.kind },
      replayOk: { target: h.target, from: h.tick - Math.round(25 / DT) },
      done: sh => sh.gotReplay || (sim.tick >= h.tick + 4) };
  }

  function shotOrbital(b) {
    prep = prep || DR.prepTracks(rec, game.side, game.PROJ);
    const box = prep.box || [-20000, -20000, 20000, 20000];
    const C = [(box[0] + box[2]) / 2, 0, (box[1] + box[3]) / 2];
    const E = Math.max(30000, box[2] - box[0], (box[3] - box[1]) * 1.2);
    const sp = game.map.spawns, own = sp && sp[game.side], en = sp && sp[game.enemy];
    let bx = own && en ? own.x - en.x : 0, bz = own && en ? own.z - en.z : -1; const bl = Math.hypot(bx, bz) || 1; bx /= bl; bz /= bl;
    const Dd = E * 1.32;
    const top = [C[0] + bx * Dd * .45, Dd * .9, C[2] + bz * Dd * .45];
    const v = view.current(), l0 = v.look;
    const dx = l0[0] - v.eye[0], dz = l0[2] - v.eye[2], dl = Math.hypot(dx, dz) || 1;
    const k1 = [l0[0] - dx / dl * 2600, Math.max(v.eye[1], game.ground(l0[0], l0[2])) + 5200, l0[2] - dz / dl * 2600];
    const rot = (p, a) => { const x = p[0] - C[0], z = p[2] - C[2], c = Math.cos(a), s = Math.sin(a); return [C[0] + x * c - z * s, p[1], C[2] + x * s + z * c]; };
    const keys = [startKey(0), { t: 2.2, eye: k1, look: l0.slice(), fov: 40 }, { t: 5.8, eye: top, look: C, fov: 40 }, { t: 10.5, eye: rot(top, .055), look: C, fov: 40 }];
    // the tally: true counts from the record, heavy rounds first, the player's side first
    const rows = Object.values(plan.counts).sort((a, c) => (c.side === game.side) - (a.side === game.side) || (!!(game.PROJ[c.kind] || {}).threat) - (!!(game.PROJ[a.kind] || {}).threat) || c.fired - a.fired);
    tally = rows.slice(0, 7).map(c => {
      const own = c.side === game.side, heavy = !!(game.PROJ[c.kind] && game.PROJ[c.kind].threat);
      const bits = [`${c.fired} fired`]; if (c.hit) bits.push(`${c.hit} hit`); if (c.down) bits.push(`${c.down} down`); if (c.kills) bits.push(`${c.kills} intercept${c.kills > 1 ? 's' : ''}`);
      return { text: `${projName(c.kind)}  ·  ${bits.join(' · ')}`, col: own && heavy ? DR.C_HI : DR.C_W, a: own || heavy ? .92 : .6 };
    });
    const n = Object.values(plan.counts).reduce((s, c) => s + c.fired, 0);
    return { k: 'orbital', fig: b.fig, cap: `${b.cap} · ${n} fired · ${T(0)} – ${T(plan.tEnd)}`, keys, rates: [{ t: 0, rate: 1 }], dur: 10.5, subj: null, orbital: true };
  }

  function build(b, next) {
    switch (b.k) {
      case 'launch': return shotLaunch(b);
      case 'chase': return shotChase(b);
      case 'hit': return shotHit(b);
      case 'down': return shotDown(b);
      case 'wreck': return shotWreck(b);
      case 'skip': return shotSkip(b, next);
      case 'approach': return shotApproach(b);
      case 'orbital': return shotOrbital(b);
    }
    return null;
  }
  function shotDown(b) {
    const e = b.e, p = e.pos;
    const v = view.current(), dx = p[0] - v.eye[0], dz = p[2] - v.eye[2], L = Math.hypot(dx, dz) || 1;
    const Dd = 900, eye = lift([p[0] - dx / L * Dd, p[1] + 60, p[2] - dz / L * Dd], 10);
    const keys = [startKey(0), { t: 1.4, eye, look: p.slice(), fov: 38 }, { t: 3.6, eye: [eye[0], eye[1] + 60, eye[2]], look: [p[0], p[1] - 20, p[2]], fov: 38 }];
    const by = e.bykind ? projName(e.bykind) : '';
    return { k: 'down', fig: b.fig, cap: `${b.cap}${by ? ' · ' + by : ''} · ${T(e.tick)}`, keys, rates: [{ t: 0, rate: .5 }, { t: 2.2, rate: 1 }], dur: 3.6, subj: null };
  }

  /* ------------------------------------------------------------------ the take */
  function nextShot() {
    const prev = F.cur;
    F.i++;
    const b = plan.beats[F.i];
    if (!b) { endFilm(); return; }
    const sh = build(b, plan.beats[F.i + 1]);
    if (!sh) { nextShot(); return; }
    sh.t = 0; sh.beat = b; sh.gotReplay = false;
    // the hit replay waits a while between its automatic replays (real time); a film's moments are chosen: the wait goes
    if (sh.replayOk && F.i > 0) game.realT += 60;
    F.cur = sh;
    if (sh.begin) sh.begin();
    if (sh.cap && sh.cap !== F.capTxt) { F.capTxt = sh.cap; F.capFig = sh.fig; F.capT0 = F.t; }
    if (!sh.cap && prev) F.capOut = F.t;
  }
  function endFilm() {
    F.state = 'end'; F.endT = 0;
  }
  function close() {
    if (F.closed) return;
    F.closed = true;
    mute(true);
    if (F.bad || F.checked) console.log(`debrief: ${F.checked} state hashes checked on the way, ${F.bad ? F.bad + ' off the record' : 'all as recorded'}; ${F.blocked} commands from here held back`);
    if (host && host.close) { try { host.close(); } catch (e) { /* */ } }
  }

  /* ------------------------------------------------------------------ per frame */
  function frame(dt) {
    const sh = F.cur;
    if (!sh) return;
    if (F.paused) { dt = 0; }
    sh.t += dt; F.t += dt;
    if (sh.tick) sh.tick();
    // the hit replay: only where this shot wants it, and only on its hull
    const ok = sh.replayOk && sim.tick >= sh.replayOk.from;
    F.hold = !ok;
    let replaying = false;
    if (rpActive()) {
      const S = rpState();
      if (ok && S && S.id === sh.replayOk.target) { replaying = true; sh.gotReplay = true; }
      else { try { RP().skip(); } catch (e) { /* */ } }
    }
    // the rate and the sim
    let rate;
    if (replaying || (sh.k === 'hit' && sh.mode === 'replay')) rate = game.timeRate;
    else if (sh.ff !== undefined && sh.t >= sh.dur) rate = -1;
    else rate = rateAt(sh.rates, sh.t) || 1;
    const t0 = sim.t;
    if (rate < 0) {
      // the skip: as fast as the frame allows, never past the goal
      mute(true);
      const left = sh.ff * DT - sim.t;
      const want = Math.min(left, Math.max(64 * dt, left * dt / Math.max(dt, 2.2 - (sh.t - sh.dur), 1e-6)));   // paused late in a skip: 0, not 0 / 0
      F.simT = sim.t + want;
      advance(F.simT, 11);
      F.simT = Math.min(F.simT, sim.t);
    } else {
      if (muted && !F.paused && rate <= 8) mute(false);
      F.simT = Math.max(F.simT, sim.t - DT) + rate * dt;
      if (sh.ff !== undefined) F.simT = Math.min(F.simT, sh.ff * DT);
      advance(F.simT, 30);
      if (sim.t < F.simT - DT) F.simT = sim.t;
    }
    setAlpha();
    const eff = dt > 0 ? (sim.t - t0) / dt : 0;
    F.rateEff = rate < 0 ? F.rateEff + (eff - F.rateEff) * (1 - Math.exp(-dt * 3)) : rate;
    F.rateShown = rate < 0 ? Math.max(32, F.rateEff) : rate;
    game.timeRate = Math.max(.05, rate < 0 ? Math.min(1000, F.rateEff) : rate);
    // the camera
    if (replaying || (sh.k === 'hit' && sh.mode === 'replay')) { if (view.ov.on) view.release(); }
    else if (sh.keys) { const P = view.pathAt(sh.keys, sh.t); view.put(P.eye, P.look, P.fov); }
    // on
    if (sh.done ? sh.done(sh) : sh.t >= sh.dur) nextShot();
  }

  /* ------------------------------------------------------------------ boot: ready, pre-roll, wait for the curtain */
  function fail(msg) { F.state = 'fail'; F.err = msg; F.failT = 0; console.warn('debrief: ' + msg); }
  function setup() {
    if (!rec || !rec.setup || !rec.supported) return fail('No recorded match to debrief');
    if (sim.tick !== 0) return fail('The match here has already run');
    if (rec.setup.h0 !== sim.hash()) return fail('This match is not the recorded one (its setup differs)');
    // the stage: no end block or pause menu here, no automatic x1, no hands on the camera, no interface
    for (const n of ['menu', 'escape']) { const s = game.getSystem(n); if (s) game.removeSystem(s); }
    game.autoSlow = false;
    cam.keys = false; cam.edge = false;
    if (!game.ui.hidden) game.setUiHidden(true);
    noInset();
    plan = makePlan(rec, game.side);
    window.DEBRIEF = { plan, F, rec };
    if (VIEW) {
      viewer = createViewer(K);
      D.applying++; try { cur.opsTo(sim, 0); } finally { D.applying--; }
      check();
      viewer.setup(Math.max(0, +Q.get('dbt') || 0));
      window.DEBRIEF.viewer = viewer;
      F.state = 'wait';
      return;
    }
    holdReplays();
    if (!plan.beats.length) return fail('Nothing happened in this match to film');
    // commands given before the first tick, then ahead to the first shot (the systems see every event on the way)
    D.applying++; try { cur.opsTo(sim, 0); } finally { D.applying--; }
    check();
    const b0 = plan.beats[0];
    const lead = b0.k === 'launch' ? 3.4 : 2;
    const t0 = Math.max(0, (b0.k === 'orbital' ? plan.tEnd : b0.tick || 0) * DT - lead);
    mute(true);
    advance(t0);
    F.simT = sim.t; setAlpha();
    F.state = 'wait';
    nextShot();
    frame(0);
  }

  /* the sequence (Shift F8): the frame is reloaded with seq=1 and renders the film at 30 fps, one still a frame */
  async function runSequence() {
    const O = window.ONIKS;
    if (!O || !O.still) return;
    const d = new Date(), stamp = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
    const base = `debrief/${rec.setup.map}_${stamp}`;
    F.seqBase = base;
    let i = 0;
    while (F.state === 'play' || F.state === 'end') {
      if (F.state === 'end' && F.endT > 1.2) break;
      F.seqGo = true;
      // a save the server never answers must not stop the film (that frame is lost, the rest go on)
      const st = await Promise.race([O.still(`${base}/debrief_${pad4(++i)}`, i === 1 ? 0 : 1 / 30, i === 1 ? 3 : 0), new Promise(r => setTimeout(() => r('timeout'), 12000))]);
      F.seqI = i;
      if (st !== 200) { F.seqLost = (F.seqLost || 0) + 1; console.warn(`debrief: frame ${i} not saved (${st})`); }
      if (i > 30 * 150) break;
    }
    F.seqDone = true;
    console.log(`debrief: sequence of ${i} frames in game/shots/${base}/${F.seqLost ? ` (${F.seqLost} not saved)` : ""}`);
    close();
  }

  /* the frame again with another role or start (the sim only runs forward: back in time is a new build) */
  function reloadAt(tick, r) {
    const q = new URLSearchParams(location.search);
    q.set('debrief', r || role); q.delete('seq');
    if (tick > 0 && (r || role) === 'view') q.set('dbt', String(Math.round(tick))); else q.delete('dbt');
    location.replace(location.pathname + '?' + q.toString());
  }
  const K = { game, sim, rec, DT, F, advance, setAlpha, mute, close: () => close(), T, reloadAt, get plan() { return plan; } };

  const sys = {
    name: 'debrief', priority: PRI, always2d: true,
    init() {
      if (SEQ) {
        // only the sequencer's frames draw (the page's own loop would move the film on its own clock)
        const gf = game.frame;
        game.frame = function (dt) { if (F.state === 'play' || F.state === 'end') { if (!F.seqGo) return; F.seqGo = false; } return gf.call(this, dt); };
      }
      try { setup(); } catch (e) { console.error('debrief: setup', e); fail('The debrief could not start'); }
      // a sequence renders on its own clock (stills), not the page's frames: it starts when the loading screen goes
      if (SEQ && F.state === 'wait') {
        const iv = setInterval(() => {
          const boot = document.getElementById('boot');
          if (!window.ONIKS || !(!boot || boot.classList.contains('off') || boot.style.display === 'none')) return;
          clearInterval(iv);
          if (F.state !== 'wait') return;
          F.state = 'play'; mute(true);
          runSequence();
        }, 100);
      }
    },
    update(dt) {
      if (F.state === 'fail') { F.failT += dt; if (F.failT > 2.4) close(); return; }
      if (F.state === 'wait') {
        // the loading screen is going: the take starts under it
        const boot = document.getElementById('boot');
        const gone = !boot || boot.classList.contains('off') || boot.style.display === 'none';
        F.waitT = gone ? F.waitT + dt : 0;
        if (VIEW) setAlpha(); else frame(0);
        if (F.waitT > .35 && !SEQ) { F.state = 'play'; mute(false); }
        return;
      }
      if (F.state === 'play') { if (VIEW) viewer.frame(Math.min(dt, 1 / 20)); else frame(SEQ ? 1 / 30 : Math.min(dt, 1 / 20)); return; }
      if (F.state === 'end') {
        F.endT += SEQ ? 1 / 30 : dt;
        if (F.cur && F.cur.keys) { F.cur.t += dt; const P = view.pathAt(F.cur.keys, F.cur.t); view.put(P.eye, P.look, P.fov); }
        F.simT += dt; advance(F.simT, 8); setAlpha();
        if (F.endT > 1.1 && !SEQ) close();
      }
    },
    draw3d() {
      const sh = F.cur;
      if (sh && sh.orbital && prep) {
        const O = game.orbital, kA = O ? ss(.25, .9, O.k) : 1;
        DR.tracks3d(R.wire, prep, TRACK_K(sh.t), kA);
      }
    },
    draw2d(ov) {
      const s = DR.scaleOf(ov);
      if (F.state === 'fail') { DR.note(ov, F.err, '#FF6A3D'); return; }
      if (VIEW) { viewer.draw2d(ov); DR.fade(ov, F.state === 'wait' ? .85 : 0); return; }
      const sh = F.cur;
      if (!sh) return;
      if (sh.orbital && prep) {
        const O = game.orbital, kA = O ? ss(.25, .9, O.k) : 1;
        DR.tracks2d(ov, cam, prep, TRACK_K(sh.t), kA, sh.t > 6.4 ? tally.map(r => Object.assign({}, r, { a: r.a * ss(6.4, 7.8, sh.t) })) : null);
      }
      if (!F.hideText) {
        // the caption: in when it changes, out during the Orbital device
        const capA = sh.k === 'skip' ? 1 - ss(0, 1, sh.t) : 1;
        if (F.capTxt && capA > 0) DR.caption(ov, F.capFig, F.capTxt, F.t - F.capT0, capA);
        if (!(sh.noReadout || ((sh.k === 'hit' || sh.gotReplay) && rpActive()))) DR.readout(ov, readout(sh), 1, 1 - .8 * (game.orbital ? game.orbital.k : 0));
      }
      // black in (under the loading screen's own fade) and out
      const fin = F.state === 'end' ? ss(0, 1, F.endT) : 0;
      const fIn = F.state === 'wait' ? 1 : 1 - ss(0, .7, F.t);
      DR.fade(ov, Math.max(fin, fIn * .85));
      if (F.paused) DR.note(ov, 'Paused · P');
      // the last seconds of the take: what comes next (never in a sequence's frames)
      if (!SEQ && sh.orbital && !F.hideText) DR.chips(ov, [['V', 'Replay'], ['Esc', 'Back']], ss(7.6, 8.6, sh.t) * (1 - fin));
      void s;
    },
    onKey(e) {
      if (VIEW) {
        if (e.type === 'keydown' && e.code === 'F8' && !e.repeat) { still(); return true; }
        return viewer ? viewer.onKey(e) : true;
      }
      if (e.type !== 'keydown') return true;
      const k = e.code;
      if (k === 'F1') return false;
      // Esc: the X-ray moment on screen goes (as its own chip says), else the debrief ends
      if (k === 'Escape') { if (rpActive()) { try { RP().skip(); } catch (err) { /* */ } } else close(); return true; }
      if (k === 'KeyP' || k === 'Space') { if (!e.repeat) F.paused = !F.paused; return true; }
      if (k === 'KeyH') { F.hideText = !F.hideText; return true; }
      if (k === 'KeyV' && !SEQ) { reloadAt(sim.tick, 'view'); return true; }
      if (k === 'F8' && !e.repeat) {
        if (e.shiftKey) { if (!SEQ) location.replace(location.href.replace(/([?&])seq=1&?/, '$1') + '&seq=1'); }
        else still();
        return true;
      }
      return true;
    },
    onPointer(ev) { return VIEW ? (viewer ? viewer.onPointer(ev) : true) : true; },
    dispose() { view.dispose(); },
  };
  function still() {
    const O = window.ONIKS; if (!O || !O.still) return;
    const d = new Date(), stamp = `${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
    const name = `debrief/${rec.setup.map}_t${Math.round(sim.t)}_${stamp}`;
    const wasP = F.paused; F.paused = true;
    O.still(name, 0, 3).then(st => { F.paused = wasP; console.log(`debrief: still game/shots/${name}.png (${st})`); });
  }

  /* the readout: the subject (the launcher, the round, the hull), then the match clock and the rate */
  function readout(sh) {
    const parts = [], sj = sh.subj;
    if (sj && sj.p !== undefined) {
      const p = sim.projectiles.get(sj.p);
      parts.push([projName(sj.kind), '#fff']);
      if (p && p.alive) {
        const v = p.vel || [0, 0, 0], spd = Math.hypot(v[0], v[1], v[2]) || p.spd || 0;
        parts.push([fmtM(Math.max(0, p.pos[1])), '#fff']);
        parts.push([spd > 300 ? `M${(spd / 340).toFixed(1)}` : `${Math.round(spd)} m/s`, '#fff']);
      }
    } else if (sj && sj.u !== undefined) {
      const u = sim.units.get(sj.u);
      const own = sj.side ? sj.side === game.side : u ? u.side === game.side : true;
      let name = unitName(sj.type || (u && u.type));
      if (u && !own) { const c = sim.contact(game.side, u.id); if (c && c.track) name = `${c.track} · ${name}`; }
      parts.push([name, own ? '#fff' : '#FF6A3D']);
      if (u && !u.alive) parts.push([u.def.domain === 'sea' ? 'Sinking' : 'Destroyed', '#FF6A3D']);
      else if (u && u.def.domain === 'sea') parts.push([`${Math.round(u.speed * 1.944)} kn`, '#fff']);
    } else {
      const e = view.ov.eye, g = Math.max(0, game.ground(e[0], e[2]));
      parts.push([`Alt ${fmtM(Math.max(0, e[1] - g))}`, '#fff']);
    }
    parts.push([T(Math.round(sim.t / DT)), '#fff']);
    const r = F.paused ? 'Paused' : fmtRate(F.rateShown);
    parts.push([r, r === 'x1' || F.paused ? '#fff' : '#C6F432']);
    return parts;
  }

  game.debrief = { get state() { return F.state; }, F, get plan() { return plan; }, get viewer() { return viewer; }, close };
  { const iv = setInterval(() => { if (window.ONIKS) { window.ONIKS.debrief = game.debrief; clearInterval(iv); } }, 150); }
  return sys;
}

function findHost() {
  try {
    if (window.parent && window.parent !== window) {
      const P = window.parent.ONIKS;
      if (P && P.debrief) return P.debrief;
      if (P && P.game && P.game.debrief) return P.game.debrief;
    }
  } catch (e) { /* another origin */ }
  return null;
}
