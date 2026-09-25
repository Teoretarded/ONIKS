/* Film maker (F9): compose one continuous camera take over the live match, like the reference films, and play it clean.

   Edit (F9 opens the panel; the game's own interface steps back so the frame is the film's):
     K                set a key at the head from the current view (eye, look point, fov); a key already at the head is
                      set again. The head then moves on by the take's gap, so K, fly, K, fly... builds a take.
     Shift K          a follow key: the selected unit (or the round nearest the middle of the view) carries the key; the
                      camera keeps its offset from it (world axes, or the subject's heading: 'body'). A row's Follow value
                      cycles: the unit, the unit's heading, the next round, none.
     the timeline     click or drag to preview the take at that moment (the camera goes there; any camera input takes it
                      back); drag a key tick or a rate mark to retime it; , . go from key to key.
     rows             each key's time, fov and caption ('Fig. N' line at the bottom); ↺ sets a key to the view, × removes.
     time rate        rate keys eased into each other (FILM.warp): x1 -> x0.25 -> x8, always on screen while it plays.
     take             loop (the path closes back to the first key), start now or at the next launch (armed: the game and
                      its interface are the player's until a heavy round leaves the rail, then the take glides in from
                      wherever the camera is), sky (the map's, dusk, night, day), a hand on the camera, ease (clamped: a
                      look held by two keys holds and nothing overshoots; film: FILM.path's tangents as they are), the
                      gap, a caption for the whole take. Fold hides the rows (the timeline and the chips stay).
     in the world     the path as a lime dotted line, each key's eye as a lime dot with its number (never in a still).
     Save / Takes     localStorage 'oniks.films' (the take being worked on is kept per map across reloads), three built-in
                      takes for any map and side (a slow low orbit of the battery at dusk, a chase of the next round, a
                      climb from the sea to 60 km). Export / Import: the take as one line of JSON.
   Play (Enter; Shift Enter from the head; Shift F9 with the panel closed): the interface goes, the sim runs on under the
     take's camera (cubic Hermite through the keys as FILM.path: no cuts, no jumps at keys) and its rate ramps; keys that
     follow track their unit or round. Move the mouse for the films' timeline bar. Esc stop · P / Space pause · J L ±5 s
     (Shift ±1 s; the camera and the rate: the sim does not go back) · , . key to key · H captions · T pin the bar.
   F8 a still of the frame at full resolution (ONIKS.still -> game/shots/film/...png), Shift F8 the take as a PNG sequence
     at 30 fps (game/shots/film/<take>_<time>/). Both from the panel too.

   The camera: while a take plays (or previews) the film maker writes the RTS camera's orbit state from the path and
   then sets the exact view after the camera's own update (eye, look, fov, roll: any angle, up or down), so everything
   drawn and every overlay projects with the take's view. Priority 125: above the pause menu, below Help.

   createFilmmaker(game) -> the 'filmmaker' system. game.film = { open(on?), play(fromHead?), stop(), still(), sequence(),
     get take, load(take | json), get playing }. */
import { evalPath, rateAt, fmtRate, fmtT, lengthOf } from './filmmaker/path.js';
import * as TK from './filmmaker/takes.js';
import { createPanel } from './filmmaker/panel.js';
import { injectStyle } from './filmmaker/style.js';
import * as LB from './labels.js';

const PRI_FILM = 125;
const DEG = Math.PI / 180, TAU = Math.PI * 2, R_EARTH = 6371000;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;
const ease = u => u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
const wrapPi = a => a - TAU * Math.floor((a + Math.PI) / TAU);
const pad2 = n => String(n).padStart(2, '0');
const pad4 = n => String(n).padStart(4, '0');
const slug = s => String(s || 'take').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'take';
const CAM_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyQ', 'KeyE', 'PageUp', 'PageDown']);
const SWALLOW = /^(Key|Digit|Arrow|Space|Tab|Enter|NumpadEnter|Backspace|Delete|Page|Home|End|Minus|Equal|Numpad|Bracket|Comma|Period|Slash|Semicolon|Quote|Backquote|Backslash|Insert)/;
/* a round follow key with no round to measure from: behind and a little above, looking ahead */
const CHASE_OFF = { eye: [16, 8, -64], look: [0, 0, 420] };

export function createFilmmaker(game) {
  injectStyle();
  const { sim, R } = game, cam = R.camera, bus = game.bus;
  const mapId = game.map.id;
  let take = TK.loadDraft(mapId) || TK.blank(game);
  let open = false, head = 0, preview = false, uiWas = false, play = null, stillBusy = false, draftTimer = 0, clean = false;
  const skyBase = { time: R.terrain.time };
  let skyOn = '';
  const fovBase = cam.fov;

  /* ------------------------------------------------------------ the camera: exact view after the camera's own update */
  const ov = { on: false, eye: [0, 0, 0], look: [0, 0, 100], fov: fovBase, roll: 0 };
  const guard = { on: false, x: 0, z: 0, yaw: 0, pitch: 0, dist: 0 };
  const hadOwn = Object.prototype.hasOwnProperty.call(cam, 'update');
  const baseUpdate = cam.update;
  cam.update = function (dt) {
    if (guard.on) snapGoal();
    const r = baseUpdate.call(this, dt);
    // the camera moved its goal itself (keys, screen edge): a preview hands the camera back
    if (guard.on && preview && goalMoved()) endPreview();
    if (ov.on) exact(this);
    return r;
  };
  function snapGoal() { const g = cam.goal; guard.x = g.target[0]; guard.z = g.target[2]; guard.yaw = g.yaw; guard.pitch = g.pitch; guard.dist = g.dist; }
  function goalMoved() { const g = cam.goal; return Math.abs(g.target[0] - guard.x) + Math.abs(g.target[2] - guard.z) > .01 * Math.max(1, guard.dist) || Math.abs(g.yaw - guard.yaw) > 1e-4 || Math.abs(g.pitch - guard.pitch) > 1e-4 || Math.abs(g.dist - guard.dist) > guard.dist * 1e-4; }
  function exact(c) {
    const e = ov.eye, l = ov.look;
    let fx = l[0] - e[0], fy = l[1] - e[1], fz = l[2] - e[2];
    const D = Math.hypot(fx, fy, fz) || 1; fx /= D; fy /= D; fz /= D;
    let rx = fz, rz = -fx, rl = Math.hypot(rx, rz);
    if (rl < 1e-6) { rx = Math.cos(c.yaw); rz = -Math.sin(c.yaw); rl = 1; }
    rx /= rl; rz /= rl;
    let ux = fy * rz, uy = fz * rx - fx * rz, uz = -fy * rx;
    let r0 = rx, r1 = 0, r2 = rz;
    if (ov.roll) {
      const cs = Math.cos(ov.roll), sn = Math.sin(ov.roll);
      const nr0 = r0 * cs + ux * sn, nr1 = r1 * cs + uy * sn, nr2 = r2 * cs + uz * sn;
      ux = ux * cs - r0 * sn; uy = uy * cs - r1 * sn; uz = uz * cs - r2 * sn;
      r0 = nr0; r1 = nr1; r2 = nr2;
    }
    c.eye = [e[0], e[1], e[2]]; c.f = [fx, fy, fz]; c.r = [r0, r1, r2]; c.u = [ux, uy, uz];
    c.fov = ov.fov; c.fl = (c.H / 2) / Math.tan(ov.fov / 2); c.tilt = 0;
    c.dist = clamp(D, c.minDist, c.maxDist);
    const g = Math.max(0, c.ground(e[0], e[2])), clear = Math.max(.5, e[1] - g);
    c.clearance = clear;
    c.near = clamp(Math.min(D * .02, clear * .4), .03, 200);
    c.far = Math.max(60000, Math.sqrt(2 * R_EARTH * Math.max(1, e[1])) * 1.25 + D * 3);
  }
  /* the orbit state that shows (about) this view: the camera stays consistent, and hands over without a jump */
  function orbitTo(eye, look) {
    const dx = look[0] - eye[0], dy = look[1] - eye[1], dz = look[2] - eye[2];
    const h = Math.max(1e-6, Math.hypot(dx, dz)), L = Math.max(1, Math.hypot(h, dy));
    const yaw = Math.atan2(dx, dz), mp = cam.minPitch;
    let el = Math.atan2(-dy, h), T = look, D = L;
    if (el < mp) {
      // a level or upward look: the camera's look-up tilt (the eye stays, the orbit target goes on the floor ray ahead)
      el = Math.max(el, mp - (cam.lookUp || 0) + .6 * DEG);
      const g = Math.max(0, cam.ground(eye[0], eye[2])), clear = Math.max(2, eye[1] - g);
      D = clamp(Math.min(L, clear * 80), Math.max(cam.minDist, 20), (cam.lookUpNear || 2500) * .96);
      const c = Math.cos(mp);
      T = [eye[0] + Math.sin(yaw) * c * D, eye[1] - Math.sin(mp) * D, eye[2] + Math.cos(yaw) * c * D];
    }
    cam.fly = null; cam.followFn = null; cam.followOff = [0, 0, 0];
    const b = cam.bounds, tx = b ? clamp(T[0], b[0], b[2]) : T[0], tz = b ? clamp(T[2], b[1], b[3]) : T[2];
    cam.target[0] = cam.goal.target[0] = tx; cam.target[1] = cam.goal.target[1] = T[1]; cam.target[2] = cam.goal.target[2] = tz;
    const d = clamp(D, cam.minDist, cam.maxDist);
    cam.dist = cam.goal.dist = d;
    cam.yaw = cam.goal.yaw = cam.yaw + wrapPi(yaw - cam.yaw);
    cam.pitch = cam.goal.pitch = clamp(el, cam.pitchMin ? cam.pitchMin(d) : mp, cam.maxPitch);
  }
  /* the view now: exact while the film maker has the camera, else the orbit's (its look point on the ground) */
  function currentView() {
    if (ov.on) return { eye: ov.eye.slice(), look: ov.look.slice(), fov: ov.fov / DEG };
    const e = cam.eye.slice(), f = cam.f;
    const look = cam.tilt > 0 ? [e[0] + f[0] * cam.dist, e[1] + f[1] * cam.dist, e[2] + f[2] * cam.dist] : cam.target.slice();
    return { eye: e, look, fov: cam.fov / DEG };
  }

  /* ------------------------------------------------------------ subjects (what follow keys ride on) */
  const subj = new Map();
  function projHdg(p) {
    const v = p.vel;
    if (v) { const h = Math.hypot(v[0], v[2]), s = Math.hypot(h, v[1]); if (s > 1 && h > .3 * s) return Math.atan2(v[0], v[2]); }
    if (Number.isFinite(p.hdg)) return p.hdg;
    const a = p.aim, f = p.fromPos;
    return a && f ? Math.atan2(a[0] - f[0], a[2] - f[2]) : 0;
  }
  function roundId() { return play ? play.roundId : preview || open ? lastRound : 0; }
  let lastRound = 0;    // the latest heavy round seen (a round key previews on it while editing)
  function subject(f) {
    let key, live = null, raw = 0, isProj = false;
    if (f.kind === 'unit') {
      key = 'u' + f.id;
      const u = sim.units.get(f.id);
      if (u && !u.aboard) { const p = game.unitPose(u); live = p.pos; raw = p.hdg; }
    } else {
      const id = f.kind === 'round' ? roundId() : f.id;
      if (!id) return null;
      key = 'p' + id; isProj = true;
      const p = sim.projectiles.get(id);
      if (p && p.alive) { live = game.projPose(p).pos; raw = projHdg(p); }
    }
    let s = subj.get(key);
    if (live) {
      if (!s) { s = { pos: live.slice(), hdg: raw, f: game.frameN }; subj.set(key, s); }
      else if (s.f !== game.frameN) {
        s.pos[0] = live[0]; s.pos[1] = live[1]; s.pos[2] = live[2];
        s.hdg = isProj ? s.hdg + wrapPi(raw - s.hdg) * (1 - Math.exp(-Math.max(game.dtReal, 1 / 60) * 2.4)) : raw;
        s.f = game.frameN;
      }
    }
    return s || null;
  }
  function toLocal(S, frame, w) {
    const dx = w[0] - S.pos[0], dy = w[1] - S.pos[1], dz = w[2] - S.pos[2];
    if (frame !== 'body') return [dx, dy, dz];
    const s = Math.sin(S.hdg), c = Math.cos(S.hdg);
    return [dx * c - dz * s, dy, dx * s + dz * c];
  }
  function resolveKey(k, out) {
    out.t = k.t; out.fov = k.fov; out.roll = k.roll || 0;
    const f = k.follow, S = f ? subject(f) : null;
    if (!S) { for (let c = 0; c < 3; c++) { out.eye[c] = k.eye[c]; out.look[c] = k.look[c]; } return out; }
    if (f.frame === 'body') { TK.local(S.pos, S.hdg, f.eye, out.eye); TK.local(S.pos, S.hdg, f.look, out.look); }
    else for (let c = 0; c < 3; c++) { out.eye[c] = S.pos[c] + f.eye[c]; out.look[c] = S.pos[c] + f.look[c]; }
    return out;
  }
  const RK = [];
  function resolved() {
    const keys = take.keys;
    while (RK.length < keys.length) RK.push({ t: 0, eye: [0, 0, 0], look: [0, 0, 0], fov: 40, roll: 0 });
    RK.length = keys.length;
    for (let i = 0; i < keys.length; i++) resolveKey(keys[i], RK[i]);
    return RK;
  }
  const len = () => lengthOf(take.keys, take.loop, take.gap);
  const P = { eye: [0, 0, 0], look: [0, 0, 0], fov: 40, roll: 0, i: 0, u: 0 };
  const POPT = { loop: false, gap: 6, ease: 'clamped' };
  /* the take's view at take time t (resolved against the live subjects), eye kept off the ground and the swell */
  function poseAt(t, out) {
    if (!take.keys.length) return null;
    POPT.loop = take.loop && take.keys.length > 1; POPT.gap = take.gap; POPT.ease = take.ease;
    evalPath(resolved(), t, POPT, out);
    if (take.hand) {
      const e = out.eye, l = out.look, hk = e[1] < 600 ? 1 : .3;
      const dy = (.0042 * Math.sin(t * .63) + .0028 * Math.sin(t * 1.37 + 1.1)) * hk, dp = (.0026 * Math.sin(t * .81 + 2.3) + .0016 * Math.sin(t * 1.9)) * hk;
      const dx = l[0] - e[0], dyy = l[1] - e[1], dz = l[2] - e[2], h = Math.hypot(dx, dz), L = Math.hypot(h, dyy);
      if (h > 1e-3) {
        const yaw = Math.atan2(dx, dz) + dy, el = Math.atan2(dyy, h) - dp, c = Math.cos(el);
        l[0] = e[0] + Math.sin(yaw) * c * L; l[1] = e[1] + Math.sin(el) * L; l[2] = e[2] + Math.cos(yaw) * c * L;
      }
    }
    const g = game.ground(out.eye[0], out.eye[2]), lo = g > .5 ? g + 1.6 : 2.6;
    if (out.eye[1] < lo) out.eye[1] = lo;
    return out;
  }
  /* the loop-wrapped take time */
  const wrapT = t => { const L = len(); return take.loop && L > 0 ? ((t % L) + L) % L : clamp(t, 0, L); };

  /* ------------------------------------------------------------ captions and the readout */
  function captionAt(t) {
    t = wrapT(t);
    // the take's own caption is Fig. 1 until the first key caption (numbered on from it)
    const first = take.keys.find(k => k.cap), base = take.caption && (!first || first.t > take.keys[0].t + 1e-6) ? 1 : 0;
    let n = base, cap = '', N = 0;
    for (const k of take.keys) { if (k.cap) { n++; if (k.t <= t + 1e-6) { cap = k.cap; N = n; } } }
    if (!cap && take.caption) { cap = take.caption; N = 1; }
    if (!cap) return { fig: '', text: '', full: '' };
    const own = /^fig\.?\s*\d/i.test(cap);
    return { fig: own ? '' : `Fig. ${N}`, text: cap, full: own ? cap : `Fig. ${N} · ${cap}` };
  }
  function subjectOfSegment() {
    const n = take.keys.length; if (!n) return null;
    const k = take.keys[P.u < .5 ? P.i : (P.i + 1) % n];
    const f = k && k.follow;
    if (!f) return null;
    if (f.kind === 'unit') { const u = sim.units.get(f.id); return u ? { u } : null; }
    const id = f.kind === 'round' ? roundId() : f.id, p = id ? sim.projectiles.get(id) : null;
    return p ? { p } : null;
  }
  function unitLabel(u) {
    if (u.side === game.side) return (LB.SHORT && LB.SHORT[u.type]) || u.def.name;
    const t = LB.unitTag ? LB.unitTag(game, u) : null;
    return t ? `${t.id} · ${t.label}` : u.def.name;
  }
  const fmtM = m => m >= 10000 ? (m / 1000).toFixed(0) + ' km' : m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m) + ' m';
  function readoutParts() {
    const parts = [];
    const s = subjectOfSegment();
    if (s && s.p) {
      const p = s.p, P0 = game.PROJ[p.kind] || {}, v = p.vel || [0, 0, 0], spd = Math.hypot(v[0], v[1], v[2]) || p.spd || 0;
      parts.push([P0.name || p.kind, '#fff']);
      if (p.alive) { parts.push([`${fmtM(Math.max(0, p.pos[1]))}`, '#fff']); parts.push([spd > 300 ? `M${(spd / 340).toFixed(1)}` : `${Math.round(spd)} m/s`, '#fff']); }
      else parts.push(['Gone', 'rgba(255,255,255,.5)']);
    } else if (s && s.u) {
      const u = s.u, d = u.def;
      parts.push([unitLabel(u), u.side === game.side ? '#fff' : '#FF6A3D']);
      if (!u.alive) parts.push([d.domain === 'sea' ? 'Sinking' : 'Destroyed', '#FF6A3D']);
      else if (d.domain === 'sea') parts.push([`${Math.round(u.speed * 1.944)} kn`, '#fff']);
      else if (d.domain === 'air') { parts.push([fmtM(u.pos[1]), '#fff']); parts.push([`${Math.round(u.speed)} m/s`, '#fff']); }
      else if (u.speed > .5) parts.push([`${Math.round(u.speed * 3.6)} km/h`, '#fff']);
    } else {
      const e = ov.eye, g = Math.max(0, game.ground(e[0], e[2]));
      parts.push([`Alt ${fmtM(Math.max(0, e[1] - g))}`, '#fff']);
    }
    parts.push([`T+${game.fmtTime ? game.fmtTime(sim.t) : Math.floor(sim.t)}`, '#fff']);
    const rs = game.paused ? 'Paused' : fmtRate(game.timeRate);
    parts.push([rs, rs === 'x1' || game.paused ? '#fff' : '#C6F432']);          // lime while time is compressed or slowed
    return parts;
  }

  /* ------------------------------------------------------------ edit */
  let dirty = false;
  function persist() { dirty = true; clearTimeout(draftTimer); draftTimer = setTimeout(flushDraft, 350); }
  function flushDraft() { if (!dirty) return; dirty = false; clearTimeout(draftTimer); TK.saveDraft(take, mapId); }
  function changed(what) { panel.render(what || 'all'); persist(); }
  const snd = name => { const a = game.getSystem('audio'); if (a && a.ui) try { a.ui(name); } catch (e) { /* */ } };
  function msg(text, bad) { panel.msg(text, bad); if (bad) snd('invalid'); if (!open && !play) bus.emit('toast', { text: text.toUpperCase(), bad }); }
  const curKey = () => { for (let i = 0; i < take.keys.length; i++) if (Math.abs(take.keys[i].t - head) < .05) return i; return -1; };
  function sortKeys() {
    take.keys.sort((a, b) => a.t - b.t);
    for (let i = 1; i < take.keys.length; i++) if (take.keys[i].t < take.keys[i - 1].t + .1) take.keys[i].t = Math.round((take.keys[i - 1].t + .1) * 100) / 100;
    take.rates.sort((a, b) => a.t - b.t);
  }
  /* who a follow key would ride on now: the selected unit, else the round nearest the middle of the view */
  function pickSubject() {
    for (const id of game.selection) {
      const u = sim.units.get(id);
      if (u && u.alive && !u.aboard) return { kind: 'unit', id: u.id, name: unitLabel(u), frame: 'world' };
    }
    let best = null, bd = Math.min(cam.W, cam.H) * .3;
    const q = [0, 0, 0];
    for (const p of sim.projectiles.values()) {
      if (!p.alive || !sim.projVisible(game.side, p)) continue;
      const s = cam.project(game.projPose(p).pos, q);
      if (!s) continue;
      const d = Math.hypot(s[0] - cam.W / 2, s[1] - cam.H / 2);
      if (d < bd) { bd = d; best = p; }
    }
    if (best) return { kind: 'proj', id: best.id, name: (game.PROJ[best.kind] || {}).name || best.kind, frame: 'body' };
    return null;
  }
  function followFrom(s, eye, look) {
    const f = { kind: s.kind, id: s.kind === 'round' ? 0 : s.id, frame: s.frame, name: s.name || '', eye: [0, 0, 0], look: [0, 0, 0] };
    const S = subject(f);
    if (!S) { f.eye = CHASE_OFF.eye.slice(); f.look = CHASE_OFF.look.slice(); return f; }
    f.eye = toLocal(S, f.frame, eye).map(v => Math.round(v * 100) / 100);
    f.look = toLocal(S, f.frame, look).map(v => Math.round(v * 100) / 100);
    return f;
  }
  function addKey(follow) {
    if (play) return;
    const v = currentView();
    let s = null;
    if (follow) {
      s = pickSubject();
      if (!s) { const ck = take.keys[curKey()] || take.keys[take.keys.length - 1]; if (ck && ck.follow) s = { kind: ck.follow.kind, id: ck.follow.id, name: ck.follow.name, frame: ck.follow.frame }; }
      if (!s) { msg('Select a unit, or put a round in the middle of the view', true); return; }
    }
    const t = Math.max(0, Math.round(head * 100) / 100);
    let i = curKey(), k;
    if (i >= 0) { k = take.keys[i]; k.eye = v.eye; k.look = v.look; k.fov = Math.round(v.fov * 10) / 10; }
    else { k = { t, eye: v.eye, look: v.look, fov: Math.round(v.fov * 10) / 10, roll: 0, cap: '', follow: null }; take.keys.push(k); }
    k.follow = s ? followFrom(s, v.eye, v.look) : (i >= 0 ? k.follow && followFrom(k.follow, v.eye, v.look) : null);
    sortKeys();
    i = take.keys.indexOf(k);
    const lastKey = i === take.keys.length - 1;
    msg(`Key ${pad2(i + 1)} at ${fmtT(k.t)}${k.follow ? ' · ' + (k.follow.kind === 'round' ? 'next round' : k.follow.name) : ''}`);
    snd('tick');
    if (lastKey) head = k.t + take.gap;
    endPreview(true);
    changed('keys');
  }
  function recordKey(i) {
    const k = take.keys[i]; if (!k) return;
    head = k.t;
    const v = currentView();
    k.eye = v.eye; k.look = v.look; k.fov = Math.round(v.fov * 10) / 10;
    if (k.follow) k.follow = followFrom(k.follow, v.eye, v.look);
    msg(`Key ${pad2(i + 1)} set to the view`); snd('tick');
    changed('keys');
  }
  function removeKey(i) {
    if (!take.keys[i]) return;
    take.keys.splice(i, 1);
    msg(`Key ${pad2(i + 1)} removed`); snd('back');
    changed('keys');
  }
  function setKey(i, f, v, quiet) {
    const k = take.keys[i]; if (!k) return;
    if (f === 't') { if (!Number.isFinite(v)) return changed('keys'); k.t = Math.max(0, Math.round(v * 100) / 100); sortKeys(); head = k.t; }
    else if (f === 'fov') { if (!Number.isFinite(v)) return changed('keys'); k.fov = clamp(v, 5, 100); }
    else if (f === 'cap') k.cap = String(v).slice(0, 64);
    if (quiet) { panel.render('track'); persist(); } else changed('keys');
    if (preview) poseTick();
  }
  /* a row's Follow value: none -> the selected unit (world) -> its heading (body) -> the next round -> none */
  function cycleFollow(i) {
    const k = take.keys[i]; if (!k) return;
    const R0 = resolveKey(k, { t: 0, eye: [0, 0, 0], look: [0, 0, 0], fov: 40, roll: 0 });
    const eye = R0.eye.slice(), look = R0.look.slice(), f = k.follow;
    if (!f) {
      const s = pickSubject();
      k.follow = s ? followFrom(s, eye, look) : followFrom({ kind: 'round', frame: 'body', name: 'Next round' }, eye, look);
    } else if ((f.kind === 'unit' || f.kind === 'proj') && f.frame === 'world') k.follow = followFrom(Object.assign({}, f, { frame: 'body' }), eye, look);
    else if (f.kind !== 'round') k.follow = followFrom({ kind: 'round', frame: 'body', name: 'Next round' }, eye, look);
    else { k.follow = null; k.eye = eye; k.look = look; }
    snd('tick');
    changed('keys');
  }
  function gotoKey(i) {
    const k = take.keys[i]; if (!k) return;
    setHead(k.t, true);
    snd('tick');
  }
  function setHead(t, pv) {
    head = clamp(Math.round(t * 100) / 100, 0, 3600);
    if (pv && take.keys.length) startPreview();
  }
  function addRate() {
    const t = Math.round(head * 10) / 10, cur = rateAt(take.rates, t);
    const r = take.rates.find(x => Math.abs(x.t - t) < .05);
    if (r) { msg('A rate is already at the head', true); return; }
    take.rates.push({ t, rate: cur === null ? (game.timeRate || 1) : +cur.toFixed(2) });
    sortKeys(); snd('tick');
    changed('rates');
  }
  function setRate(i, f, v) {
    const r = take.rates[i]; if (!r) return;
    if (Number.isFinite(v)) { if (f === 't') r.t = Math.max(0, v); else r.rate = clamp(v, .05, 64); }
    sortKeys(); changed('rates');
  }
  function removeRate(i) { if (!take.rates[i]) return; take.rates.splice(i, 1); snd('back'); changed('rates'); }
  function setOpt(k, v, quiet) {
    if (k === 'gap') { if (Number.isFinite(v)) take.gap = clamp(v, .5, 60); }
    else if (k === 'caption') take.caption = String(v).slice(0, 64);
    else if (k === 'loop' || k === 'hand') take[k] = !!v;
    else if (k === 'start') take.start = v === 'launch' ? 'launch' : 'now';
    else if (k === 'ease') take.ease = v === 'film' ? 'film' : 'clamped';
    else if (k === 'sky') { take.sky = v; applySky(open || play ? take.sky : ''); }
    if (quiet) { persist(); return; }
    snd('tick'); changed('opts');
    if (preview) poseTick();
  }
  function lookName(k) {
    if (k.follow) { const f = k.follow; return `+${fmtM(Math.hypot(f.look[0], f.look[1], f.look[2]))}${f.frame === 'body' ? ' ahead' : ''}`; }
    const L = k.look, rng = Math.hypot(L[0] - k.eye[0], L[1] - k.eye[1], L[2] - k.eye[2]);
    let best = null, bd = Math.max(40, rng * .12);
    for (const u of sim.list()) {
      if (!u.alive || u.aboard || !game.vis(u)) continue;
      const d = Math.hypot(u.pos[0] - L[0], u.pos[2] - L[2]);
      if (d < bd) { bd = d; best = u; }
    }
    if (best) return unitLabel(best);
    const g = game.ground(L[0], L[2]);
    return L[1] > g + 400 ? 'Sky' : g > .5 ? 'Ground' : 'Sea';
  }

  /* ------------------------------------------------------------ the sky (a take may set its own time of day) */
  function applySky(kind) {
    kind = kind || '';
    if (kind === skyOn) return;
    skyOn = kind;
    const T = R.terrain;
    T.time = kind || skyBase.time;
    try { T.setWeather({}); } catch (e) { /* */ }
  }

  /* ------------------------------------------------------------ preview (the head's moment, the camera there) */
  function startPreview() {
    if (play || !take.keys.length) return;
    if (!preview) { preview = true; }
    applySky(take.sky);
    poseTick();
  }
  function poseTick() {
    if (!poseAt(head, P)) return;
    ov.eye[0] = P.eye[0]; ov.eye[1] = P.eye[1]; ov.eye[2] = P.eye[2];
    ov.look[0] = P.look[0]; ov.look[1] = P.look[1]; ov.look[2] = P.look[2];
    ov.fov = clamp(P.fov, 5, 100) * DEG; ov.roll = (P.roll || 0) * DEG;
    ov.on = true;
    orbitTo(ov.eye, ov.look);
    guard.on = true; snapGoal();
  }
  function endPreview(keepView) {
    if (!preview) return;
    preview = false; guard.on = false;
    if (ov.on && !play) { ov.on = false; if (keepView) orbitTo(ov.eye, ov.look); cam.fov = fovBase; }
  }

  /* ------------------------------------------------------------ the panel */
  function setOpen(on) {
    on = on === undefined ? !open : !!on;
    if (on === open) return;
    open = on;
    if (on) {
      uiWas = game.ui.hidden;
      if (!game.ui.hidden) game.setUiHidden(true);
      aside = busy();
      panel.show(!aside);
      applySky(take.sky);
      snd('tick');
    } else {
      endPreview(true);
      panel.show(false);
      if (!play) { game.setUiHidden(uiWas); applySky(''); }
      snd('back');
    }
  }

  /* ------------------------------------------------------------ play */
  function startPlay(o) {
    o = o || {};
    if (play) stopPlay();
    if (!take.keys.length) { msg('No keys yet · K sets one at the head', true); return false; }
    endPreview(false);
    play = { t: 0, from: o.fromHead ? wrapT(head) : 0, paused: false, armed: take.start === 'launch' && !o.noArm, roundId: 0, seq: o.seq || null,
      saved: null, blend: null, hideText: false, capTxt: '', capT0: 0, panel: open };
    if (open) panel.show(false);
    panel.playing(true);
    if (play.armed) {
      // the game is the player's until the launch: its interface comes back meanwhile
      if (open && game.ui.hidden !== uiWas) game.setUiHidden(uiWas);
      bus.emit('toast', { text: 'FILM ARMED · THE TAKE STARTS AT THE NEXT LAUNCH' }); snd('tick');
      return true;
    }
    begin(false);
    return true;
  }
  /* the take proper: the interface goes, the camera is the take's */
  function begin(glide) {
    const p = play;
    p.armed = false; p.t = p.from;
    if (game.inspect && game.inspect.active) try { game.inspect.close(); } catch (e) { /* */ }
    if (game.replay && game.replay.active) try { game.replay.skip(); } catch (e) { /* */ }
    const dir = game.getSystem('director'); if (dir && dir.on) dir.set(false);
    // saved after those hand back what they held (the director's cam.edge, Inspect's keys and time), not their values
    p.saved = { ui: game.ui.hidden, rate: game.timeRate, paused: game.paused, autoSlow: game.autoSlow, sel: [...game.selection], keys: cam.keys, edge: cam.edge };
    if (game.follow) game.follow(null);
    if (game.selection.size) game.clearSelection();
    if (game.paused && !p.seq) game.pause(false);
    game.autoSlow = false;
    cam.keys = false; cam.edge = false;
    if (!game.ui.hidden) game.setUiHidden(true);
    applySky(take.sky);
    subj.clear();
    if (glide) { const v = currentView(); p.blend = { eye: v.eye, look: v.look, fov: v.fov, dur: 1.5 }; }
    stepPlay(0);
    snd('tick');
  }
  function stopPlay() {
    const p = play; if (!p) return;
    play = null;
    panel.playing(false);
    if (p.saved) {
      const S = p.saved;
      if (ov.on) { orbitTo(ov.eye, ov.look); ov.on = false; }
      cam.fov = fovBase; cam.keys = S.keys; cam.edge = S.edge;
      if (take.rates.length) game.timeRate = S.rate;
      game.autoSlow = S.autoSlow;
      if (game.paused !== S.paused) game.pause(S.paused);
      bus.emit('rate', { rate: game.timeRate, paused: game.paused, why: 'film' });
      const sel = S.sel.filter(id => { const u = sim.units.get(id); return u && u.alive; });
      if (sel.length) game.select(sel);
      game.setUiHidden(p.panel ? true : S.ui);
    }
    if (p.panel && !open) { open = true; }
    if (open) { if (!game.ui.hidden) game.setUiHidden(true); panel.show(!busy()); applySky(take.sky); } else applySky('');
    snd('back');
  }
  /* another system has the screen (Inspect, the hit replay, the pause menu or the end block): the panel steps aside */
  function busy() {
    return !!((game.inspect && game.inspect.active) || (game.replay && game.replay.active) || document.body.classList.contains('oniks-veiled'));
  }
  let aside = false;
  function seek(t) {
    if (!play || play.armed) return;
    const L = len();
    play.t = take.loop ? ((t % L) + L) % L : clamp(t, 0, L);
    play.blend = null;
    panel.wake();
  }
  function stepPlay(dt) {
    const p = play;
    if (p.armed) return;
    if (game.replay && game.replay.active) try { game.replay.skip(); } catch (e) { /* */ }
    let d = p.paused ? 0 : dt;
    if (p.seq) { d = p.seq.step || 0; p.seq.step = 0; }
    p.t += d;
    const L = len();
    if (p.t > L) {
      if (take.loop && L > 0 && !p.seq) p.t %= L;
      else { p.t = L; if (!p.seq) { stopPlay(); return; } }
    }
    // the rate ramps
    if (take.rates.length && !p.paused) game.timeRate = Math.max(.05, rateAt(take.rates, p.t));
    // the view
    if (!poseAt(p.t, P)) return;
    let fov = P.fov;
    if (p.blend) {
      const k = ease(sat(p.t - p.from < 0 ? 1 : (p.t - p.from) / p.blend.dur)), B = p.blend;
      for (let c = 0; c < 3; c++) { P.eye[c] = B.eye[c] + (P.eye[c] - B.eye[c]) * k; P.look[c] = B.look[c] + (P.look[c] - B.look[c]) * k; }
      fov = B.fov + (fov - B.fov) * k;
      if (k >= 1) p.blend = null;
    }
    for (let c = 0; c < 3; c++) { ov.eye[c] = P.eye[c]; ov.look[c] = P.look[c]; }
    ov.fov = clamp(fov, 5, 100) * DEG; ov.roll = (P.roll || 0) * DEG;
    ov.on = true;
    orbitTo(ov.eye, ov.look);
    // the caption types in when it changes
    const cap = captionAt(p.t).full;
    if (cap !== p.capTxt) { p.capTxt = cap; p.capT0 = game.realT; }
  }
  function togglePause() {
    const p = play; if (!p || p.armed) return;
    p.paused = !p.paused;
    if (!p.seq) game.pause(p.paused);
    panel.wake();
  }
  function jumpKey(dir) {
    const ks = take.keys; if (!ks.length) return;
    const t = play ? wrapT(play.t) : head;
    let tt = null;
    if (dir > 0) { for (const k of ks) if (k.t > t + .05) { tt = k.t; break; } if (tt === null) tt = ks[0].t; }
    else { for (let i = ks.length - 1; i >= 0; i--) if (ks[i].t < t - (play ? 1.2 : .05)) { tt = ks[i].t; break; } if (tt === null) tt = ks[ks.length - 1].t; }
    if (play) seek(tt); else setHead(tt, true);
  }

  /* ------------------------------------------------------------ stills and sequences (ONIKS.still -> game/shots) */
  function fullRes() {
    const G = R.G, rs0 = R.renderScale;
    const want = Math.min(2, Math.max(rs0, 1, 1080 / Math.max(1, G.cssH * G.dpr)));
    if (want > rs0 + 1e-3) R.renderScale = want;
    return () => { if (Math.abs(R.renderScale - rs0) > 1e-6) R.renderScale = rs0; };
  }
  const stamp = () => { const d = new Date(); return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`; };
  function still() {
    const O = window.ONIKS;
    if (!O || !O.still) { msg('Stills need the game page', true); return; }
    if (stillBusy || (play && play.seq)) return;
    stillBusy = true;
    const name = `film/${slug(take.name)}_${play && !play.armed ? 't' + wrapT(play.t).toFixed(1) + '_' : ''}${stamp()}`;
    const restore = fullRes();
    let pr;
    clean = true;                              // the path and the key numbers are the editor's, not the picture's
    try { pr = O.still(name, 0, 3); } finally { restore(); clean = false; }
    Promise.resolve(pr).then(st => { stillBusy = false; if (st && st !== 200) msg(`Still not saved (${st})`, true); else if (!play) msg(`Still · game/shots/${name}.png`); })
      .catch(() => { stillBusy = false; msg('Still not saved', true); });
    if (play) panel.wake();
    snd('tick');
  }
  async function sequence() {
    const O = window.ONIKS;
    if (!O || !O.still) { msg('Sequences need the game page', true); return; }
    if (play && play.seq) return;
    if (!take.keys.length) { msg('No keys yet · K sets one at the head', true); return; }
    const fps = 30, base = `film/${slug(take.name)}_${stamp()}`;
    const seq = { i: 0, n: 0, step: 0, fps };
    if (!startPlay({ seq })) return;
    while (play && play.seq === seq && play.armed) await new Promise(r => setTimeout(r, 100));
    if (!play || play.seq !== seq) return;
    const n = Math.max(1, Math.ceil(len() * fps) + 1);
    seq.n = n;
    const restore = fullRes();
    const paused0 = play.saved ? play.saved.paused : false;
    let ok = 0;
    clean = true;
    try {
      for (let i = 0; i < n; i++) {
        if (!play || play.seq !== seq) break;
        seq.i = i + 1;
        game.paused = false;
        seq.step = i === 0 ? 0 : 1 / fps;
        const pr = O.still(`${base}/${slug(take.name)}_${pad4(i + 1)}`, seq.step, i === 0 ? 4 : 0);
        if (play && play.seq === seq) game.paused = true;
        const st = await pr;
        if (st === 200) ok++;
      }
    } finally {
      restore(); clean = false;
      game.paused = paused0;
      const was = !!(play && play.seq === seq);
      if (was) { if (play.saved) play.saved.paused = paused0; stopPlay(); }
      msg(`Sequence · ${ok} frames · game/shots/${base}/`, ok === 0);
    }
  }

  /* ------------------------------------------------------------ takes */
  function loadTake(t, what) {
    if (!t) return false;
    if (play) stopPlay();
    endPreview(false);
    take = t; head = 0; subj.clear();
    applySky(open ? take.sky : '');
    changed('all');
    if (take.keys.length && open) setHead(0, true);
    msg(what || `Loaded · ${take.name}`);
    return true;
  }
  const fm = {
    get take() { return take; }, get head() { return head; }, get preview() { return preview; }, get playing() { return !!play; },
    len, trackLen: () => Math.max(12, len() + take.gap + 2, head + 2), curKey, lookName,
    playInfo() {
      const p = play;
      return { t: p ? wrapT(p.t) : 0, len: len(), paused: !!(p && p.paused), armed: !!(p && p.armed), seq: p && p.seq && p.seq.n ? `${pad4(p.seq.i)} / ${pad4(p.seq.n)}` : p && p.seq ? 'waiting' : '',
        cap: p ? captionAt(p.t).full : '' };
    },
    setHead, addKey, recordKey, removeKey, setKey, cycleFollow, gotoKey,
    moveKey(i, t) { const k = take.keys[i]; if (k) k.t = Math.max(0, t); },
    moveRate(i, t) { const r = take.rates[i]; if (r) r.t = Math.max(0, t); },
    commitMove() { sortKeys(); changed('keys'); changed('rates'); if (preview) poseTick(); },
    addRate, setRate, removeRate, setOpt,
    setName(v) { take.name = String(v).slice(0, 40) || 'Take'; persist(); },
    play(fromHead) { startPlay({ fromHead }); }, still, sequence, seek,
    save() { if (!take.keys.length) { msg('Nothing to save yet', true); return; } if (TK.save(take)) { msg(`Saved · ${take.name}`); snd('tick'); } else msg('Could not save (storage full?)', true); },
    newTake() { const n = TK.listSaved().length + 1; loadTake(TK.blank(game, `Take ${n}`), 'New take'); },
    builtins: () => TK.BUILTIN,
    saved: () => TK.listSaved(),
    loadBuiltin(id) { const b = TK.BUILTIN.find(x => x.id === id); if (!b) return; let t = null; try { t = b.make(game); } catch (e) { console.error('filmmaker: built-in ' + id, e); } if (!t) { msg('Nothing of yours on the map to film', true); return; } loadTake(t); },
    loadSaved(name) { const t = TK.listSaved().find(x => x.name === name); if (!t) return; loadTake(t, t.map && t.map !== mapId ? `Loaded · made on ${t.map}: its world keys may miss` : undefined); },
    deleteSaved(name) { TK.remove(name); msg(`Deleted · ${name}`); snd('back'); },
    exportJSON: () => TK.toJSON(take),
    importJSON(txt) { const t = TK.fromJSON(txt); if (!t || !t.keys.length) { msg('That is not a take', true); return false; } return loadTake(t, `Imported · ${t.name}`); },
    msg, snd, close: () => setOpen(false),
  };
  const panel = createPanel(game, fm);

  /* ------------------------------------------------------------ 3D and 2D */
  const PATH = [];
  function drawPath() {
    const n = take.keys.length; if (!n) return;
    const t0 = take.keys[0].t, span = take.keys[n - 1].t - t0 + (take.loop ? Math.max(.5, take.gap) : 0);
    const step = Math.max(.1, span / 240), rk = resolved();
    PATH.length = 0;
    if (n > 1) {
      POPT.loop = take.loop; POPT.gap = take.gap; POPT.ease = take.ease;
      const Q = { eye: [0, 0, 0], look: [0, 0, 0], fov: 40, roll: 0, i: 0, u: 0 };
      for (let t = t0; t <= t0 + span + 1e-6; t += step) { evalPath(rk, t, POPT, Q); PATH.push(Q.eye.slice()); }
      R.fx.path(PATH, { rgb: [198, 244, 50], a: .8, step: 6, size: 2, mode: 'top' });
    }
    for (let i = 0; i < n; i++) {
      const k = rk[i];
      R.fx.dot(k.eye, 6, [198, 244, 50], 1, 'top');
      R.fx.line(k.eye, k.look, { rgb: [255, 255, 255], a: .35, step: 7, size: 1.5, mode: 'top' });
    }
  }
  function drawCalm(ctx, x, y, rx, ry, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
    g.addColorStop(0, `rgba(11,12,10,${.72 * a})`); g.addColorStop(.55, `rgba(11,12,10,${.38 * a})`); g.addColorStop(1, 'rgba(11,12,10,0)');
    ctx.save(); ctx.translate(x, y); ctx.scale(1, ry / rx); ctx.translate(-x, -y);
    ctx.fillStyle = g; ctx.fillRect(x - rx, y - rx, rx * 2, rx * 2); ctx.restore();
  }
  function draw2dPlay(ov2) {
    const p = play, ctx = ov2.ctx, W = ov2.W, H = ov2.H, s = Math.max(.8, Math.min(1.6, Math.min(W / 1920, H / 1080)));
    if (p.hideText) return;
    // the readout: top right, the films' mono line, the rate in lime when it is not x1
    const parts = readoutParts(), px = 13 * s, sp = px * .05;
    ctx.save();
    ctx.font = `400 ${px}px 'Geist Mono', Consolas, monospace`; ctx.textBaseline = 'alphabetic';
    const sep = '  ·  ';
    const txt = parts.map(q => q[0].toUpperCase());
    const wOf = t => ctx.measureText(t).width + sp * t.length;
    let w = 0; txt.forEach((t, i) => { w += wOf(t) + (i ? wOf(sep) : 0); });
    const x1 = W - 56 * s, y = 58 * s;
    drawCalm(ctx, W - 40 * s, 30 * s, Math.max(360 * s, w + 120 * s), 150 * s, 1);
    let x = x1 - w;
    ctx.fillStyle = '#C6F432'; ctx.fillRect(Math.round(x - 20 * s), Math.round(y - 9 * s), Math.round(8 * s), Math.round(8 * s));
    const put = (t, col) => { ctx.fillStyle = col; if ('letterSpacing' in ctx) ctx.letterSpacing = sp + 'px'; ctx.fillText(t, x, y); x += wOf(t); };
    txt.forEach((t, i) => { if (i) put(sep, 'rgba(255,255,255,.36)'); put(t, parts[i][1]); });
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    // the caption: bottom left, 'Fig. N' then the line, typing in
    const c = captionAt(p.t);
    // the caption steps up out of the way of the timeline bar while it shows
    const lift = panel.barOn ? 1 : 0, kl = 1 - Math.exp(-Math.max(game.dtReal, 1 / 60) * 10);
    p.lift = (p.lift || 0) + (lift - (p.lift || 0)) * kl;
    if (c.text) {
      const age = game.realT - p.capT0, full = c.fig ? c.fig + '    ' + c.text : c.text;
      const nShow = Math.min(full.length, Math.floor(full.length * sat(age / .5) + .999));
      const bx = 56 * s, by = H - (54 + 46 * (clean ? 0 : p.lift)) * s, fpx = 16 * s;   // stills and sequences: at rest
      drawCalm(ctx, 0, H, 700 * s, 170 * s, 1);
      ctx.font = `500 ${fpx}px 'Geist', 'Segoe UI', sans-serif`;
      let xx = bx;
      if (c.fig) {
        const f = c.fig.slice(0, nShow);
        ctx.fillStyle = '#fff'; ctx.fillText(f, xx, by); xx += ctx.measureText(c.fig + '    ').width;
      }
      const rest = c.fig ? Math.max(0, nShow - (c.fig.length + 4)) : nShow;
      ctx.font = `400 ${fpx}px 'Geist', 'Segoe UI', sans-serif`; ctx.fillStyle = 'rgba(255,255,255,.66)';
      ctx.fillText(c.text.slice(0, rest), xx, by);
    }
    ctx.restore();
  }
  function draw2dEdit(ov2) {
    // key numbers at their eyes (the path is drawn in 3D)
    const n = take.keys.length; if (!n || preview) return;
    const q = [0, 0, 0], rk = RK.length === n ? RK : resolved(), cur = curKey();
    for (let i = 0; i < n; i++) {
      const s = cam.project(rk[i].eye, q);
      if (!s || s[0] < -20 || s[1] < -20 || s[0] > ov2.W + 20 || s[1] > ov2.H + 20) continue;
      ov2.text(s[0] + 8, s[1] - 7, pad2(i + 1), { size: 10.5, col: i === cur ? '#C6F432' : 'rgba(255,255,255,.8)' });
    }
  }

  /* ------------------------------------------------------------ the system */
  const sys = {
    name: 'filmmaker', priority: PRI_FILM, always2d: true,
    init() {
      game.film = {
        open: on => setOpen(on), play: fromHead => startPlay({ fromHead }), stop: stopPlay, still, sequence,
        get take() { return take; }, get playing() { return !!play; }, get state() { return play; },
        load: t => loadTake(typeof t === 'string' ? TK.fromJSON(t) : TK.normalize(t)),
        builtin: id => fm.loadBuiltin(id), panel: fm,
      };
      // the cinematic camera takes over from a preview (keys can then be set from its shots)
      bus.on('cinematic', d => { if (d && d.on) endPreview(false); });
      // the last edit is kept even when the page goes before the draft's timer
      addEventListener('pagehide', flushDraft);
    },
    onKey(e) {
      const down = e.type === 'keydown', k = e.code, mod = e.ctrlKey || e.metaKey || e.altKey;
      if (play && !play.armed) {
        if (!down) return false;
        if (mod) return false;
        switch (k) {
          case 'Escape': case 'F9': stopPlay(); return true;
          case 'KeyP': case 'Space': case 'KeyK': if (!e.repeat) togglePause(); return true;
          case 'KeyJ': seek(play.t - (e.shiftKey ? 1 : 5)); return true;
          case 'KeyL': seek(play.t + (e.shiftKey ? 1 : 5)); return true;
          case 'Comma': jumpKey(-1); panel.wake(); return true;
          case 'Period': jumpKey(1); panel.wake(); return true;
          case 'KeyH': play.hideText = !play.hideText; return true;
          case 'KeyT': panel.pin(); return true;
          case 'F8': if (!e.repeat && !e.shiftKey) still(); return true;
        }
        return SWALLOW.test(k);
      }
      if (play && play.armed) {
        if (down && (k === 'Escape' || k === 'F9') && !mod) { stopPlay(); bus.emit('toast', { text: 'FILM DISARMED' }); return true; }
        return false;
      }
      if (!down || mod) return false;
      if (busy() || document.body.classList.contains('oniks-helping')) return false;   // their keys, while they have the screen
      if (k === 'F9') { if (!e.repeat) { if (e.shiftKey) startPlay({}); else setOpen(); } return true; }
      if (k === 'F8') { if (!e.repeat) { if (e.shiftKey) sequence(); else still(); } return true; }
      if (!open) return false;
      if (CAM_KEYS.has(k)) { endPreview(true); return false; }
      switch (k) {
        case 'KeyK': if (!e.repeat) addKey(e.shiftKey); return true;
        case 'Enter': case 'NumpadEnter': if (!e.repeat) startPlay({ fromHead: e.shiftKey }); return true;
        case 'Escape': if (preview) endPreview(true); else if (!panel.closeIO()) setOpen(false); return true;
        case 'Comma': jumpKey(-1); return true;
        case 'Period': jumpKey(1); return true;
      }
      return false;
    },
    onPointer(ev) {
      if (play && !play.armed) {
        if (ev.type === 'move') { panel.wake(); return false; }
        return true;
      }
      if (preview && ((ev.type === 'down' && (ev.button === 1 || ev.button === 2)) || ev.type === 'wheel')) endPreview(true);
      return false;
    },
    onEvent(e) {
      if (e.type !== 'launch' || !TK.HEAVY[e.kind]) return;
      const q = sim.projectiles.get(e.proj);
      if (!q || (e.side !== game.side && !sim.projVisible(game.side, q))) return;
      lastRound = e.proj;
      if (!play || play.roundId) return;
      play.roundId = e.proj;
      if (play.armed) begin(true);
    },
    update(dt) {
      panel.tick();
      if (play) { stepPlay(dt); return; }
      if (open) {
        const b = busy();
        if (b !== aside) { aside = b; if (b) endPreview(false); panel.show(!b); }
      }
      if (preview) poseTick();
    },
    draw3d() {
      if (open && !play && !clean) drawPath();
    },
    draw2d(ov2) {
      if (play && !play.armed && ov.on) draw2dPlay(ov2);
      else if (open && !play && !clean) draw2dEdit(ov2);
    },
    dispose() {
      if (play) stopPlay();
      if (hadOwn) cam.update = baseUpdate; else delete cam.update;
      applySky('');
      panel.dispose();
      flushDraft();
      removeEventListener('pagehide', flushDraft);
    },
  };
  return sys;
}
