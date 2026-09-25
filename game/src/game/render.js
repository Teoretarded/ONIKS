/* Render system: draws the sim as the player may see it. Units at their interpolated poses (land units on the
   drawn ground, ships riding the swell, aircraft banking, carrier aircraft parked on the deck), own units lime,
   enemy tracks coral (contacts below the track threshold are the SENSORS system's), fog off draws everything.
   Dying units: ships settle, list and sink (the sim's dying pose under the sea surface occluder); vehicles turn
   into wrecks and dissolve; aircraft fall. Projectiles with their models along their velocity. Ship wakes.
   The objective sites (port, depot, radar hill, airfield, lighthouse) as structures. Fills game.drawn.
   Submarines: surfaced, a boat is drawn like a ship. Submerged, the sea surface would hide it, so it shows as the
   films' X-ray ghost: the hull pressed flat just under the surface (fainter the deeper it runs), seen through the
   water; at periscope depth the boat is also drawn at its true depth, so only the raised masts break the surface. */
import { PRI } from './game.js';
import { Wake } from '../engine/fx.js';
import { attitude } from '../engine/renderer.js';
import { submerged, deep } from '../sim/subs.js';

const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;
const ss = (a, b, v) => { const t = sat((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const TAU = Math.PI * 2;

export function createRender(game, DM) {
  const sim = game.sim, R = game.R, T = R.terrain;
  const inst = new Map();         // unit id -> reusable draw instance
  const pinst = new Map();        // projectile id -> reusable draw instance
  const wakes = new Map();        // ship id -> Wake
  const wrecks = new Set();       // model keys with a registered wreck
  const deckSlots = new Map();    // carrier id -> Map(unit id -> slot)
  const sites = [];
  const ghosts = [];              // wrecks left after the sim removed the unit: { d, t0 }
  const GHOST_LIFE = 180;         // sim seconds a wreck stays on the ground
  let lastSweep = null, fxWakes = false, ownFxTrails = false;

  function wreckKey(key) {
    const k = key + '_wreck';
    if (wrecks.has(k)) return k;
    if (!DM || !DM.wreckOf || !R.models.has(key)) return null;
    R.models.registerModel(k, () => DM.wreckOf(R.models.get(key).model, { seed: key.length * 13 + 5 }));
    wrecks.add(k);
    return k;
  }

  /* objective sites: a structure on each (ports face the water) */
  function buildSites() {
    const kinds = { port: 'port', depot: 'depot', radar_hill: 'radar_hill', airfield: 'airfield', lighthouse: 'lighthouse' };
    for (const o of game.map.objectives || []) {
      const key = kinds[o.kind];
      if (!key || !R.models.has(key)) continue;
      // face: ports and lighthouses toward the lowest ground nearby (the water), others along the flattest line
      let best = 0, bh = 1e9, flat = 0, fv = 1e9;
      for (let k = 0; k < 16; k++) {
        const a = k / 16 * TAU, r = key === 'airfield' ? 1300 : 350;
        const h1 = game.map.h(o.x + Math.sin(a) * r, o.z + Math.cos(a) * r), h2 = game.map.h(o.x - Math.sin(a) * r, o.z - Math.cos(a) * r);
        if (h1 < bh) { bh = h1; best = a; }
        const v = Math.abs(h1 - h2) + Math.abs(h1 - game.map.h(o.x, o.z)) * .5;
        if (v < fv) { fv = v; flat = a; }
      }
      const hdg = key === 'port' || key === 'lighthouse' ? best : flat;
      const y = key === 'port' ? 0 : Math.max(0, T.heightAt(o.x, o.z));
      sites.push({ o, d: { key, T: [o.x, y, o.z], hdg, st: {}, tint: 'neutral', alpha: .85 } });
    }
  }

  function tintOf(v) { return v === 'own' ? 'own' : 'hostile'; }

  /* aircraft aboard a carrier: parked along the deck edge, nose in */
  function parkPose(u, cv, out) {
    let m = deckSlots.get(cv.id);
    if (!m) deckSlots.set(cv.id, m = new Map());
    if (!m.has(u.id)) { let s = 0; const used = new Set(m.values()); while (used.has(s)) s++; m.set(u.id, s); }
    const s = m.get(u.id), cp = game.unitPose(cv);
    // two rows aft of the island (starboard) and along the port bow, 22 m apart
    const row = s % 2, i = s >> 1;
    // the starboard row skips the island (z -50 .. -4): its 4th slot on park forward of it
    let lx = row ? -26 : 24, lz = -110 + i * 24 + (row ? 70 : !row && i >= 3 ? 48 : 0), yaw = row ? Math.PI / 2 : -Math.PI / 2, dy = 19.6;
    // an LHD: its helicopter spots down the flight deck (data/models.js LHD.SPOTS)
    const A = cv.def.well && DM && DM.LHD;
    if (A && A.SPOTS && A.SPOTS.length) { const q = A.SPOTS[s % A.SPOTS.length]; lx = q[0]; lz = q[1]; yaw = q[2] || 0; dy = A.DECK_Y + .1; }
    const c = Math.cos(cp.hdg), sn = Math.sin(cp.hdg);
    out.pos[0] = cp.pos[0] + c * lx + sn * lz; out.pos[2] = cp.pos[2] - sn * lx + c * lz; out.pos[1] = cp.pos[1] + dy + (u.type === 'aew' ? 2.0 : u.type === 'fighter' ? 1.41 : 0);   // the E-2D stands on its gear
    out.hdg = cp.hdg + yaw; out.pitch = cp.pitch; out.roll = cp.roll;
    return out;
  }

  /* a submerged boat. The sea surface hides everything under it, so the boat shows as the films' X-ray ghost: its
     hull sampled once into dots (GEO.sample, coarse), pressed flat onto the water and drawn as lime (own) / coral
     (hostile) effect dots, brighter where the hull faces up, fainter the deeper it runs. At periscope depth the
     boat itself is also drawn at its depth, so only the raised masts break the surface. */
  const ghosts3 = new Map();                                     // model key -> Float32Array [x, y, z, up] (model frame)
  function ghostOf(key) {
    let g = ghosts3.get(key);
    if (g) return g;
    const e = R.models.has(key) ? R.models.get(key) : null, GEO = window.GEO, X = window.M3.X;
    if (!e || !GEO) return null;
    const st = { mast: 0 }, out = [], sp = Math.max(.45, (e.L || 60) / 190);
    for (const s of GEO.sample(e.model, sp, 71, st, { fine: false })) {
      if (s.part.show && !s.part.show(st)) continue;
      const T = GEO.partXf(X.make(), s.part, st), P = s.pts;
      for (let i = 0; i < P.length; i += 6) {
        const q = X.ap(T, [P[i], P[i + 1], P[i + 2]]), n = X.dir(T, [P[i + 3], P[i + 4], P[i + 5]]);
        out.push(q[0], q[1], q[2], n[1]);
      }
    }
    g = new Float32Array(out);
    ghosts3.set(key, g);
    return g;
  }
  const LIME3 = [198, 244, 50], CORAL3 = [255, 106, 61];
  const mastInst = new Map();
  function drawBoat(u, d, p) {
    const d0 = u.def, G = ghostOf(d0.model), fx = R.fx, eye = game.camera.eye;
    const depthK = Math.min(1, Math.max(0, (u.depth - d0.draught) / 140));
    const a0 = (u.alive ? 1 : 1 - u.dying) * (.62 - .34 * depthK), rgb = d.tint === 'own' ? LIME3 : CORAL3;
    if (G && a0 > .01) {
      const c = Math.cos(p.hdg), s = Math.sin(p.hdg), x0 = p.pos[0], z0 = p.pos[2];
      const dist = Math.hypot(x0 - eye[0], eye[1], z0 - eye[2]);
      // thin like the X-ray: every few samples, more of them dropped the farther the camera (a fixed pattern, no flicker)
      const stride = Math.max(2, Math.min(40, Math.round(dist / 400))) * 4, size = dist < 1500 ? 1.4 : 1.2;
      for (let i = 0; i < G.length; i += stride) {
        const lx = G[i], lz = G[i + 2], up = G[i + 3];
        if (up < -.35) continue;                                  // the keel's underside: the flat picture keeps the top
        // the flattened sides make the outline: bright; the top between them a faint fill (the X-ray's thinned shell)
        const side = 1 - Math.max(0, up), k = (.2 + .8 * side * side) * a0;
        fx.dotXYZ(x0 + lx * c + lz * s, .25 + G[i + 1] * .006, z0 - lx * s + lz * c, size, rgb[0] * k, rgb[1] * k, rgb[2] * k, 1, 'max');
      }
    }
    // the unit's instance, pressed flat like the ghost and all but transparent: nothing of it is drawn (the renderer
    // skips parts under alpha .004), but it is picked and boxed where the ghost lies
    const R3 = attitude(p.hdg, 0, 0); R3[1] *= .006; R3[4] *= .006; R3[7] *= .006;
    d.R = R3; d.hdg = undefined; d.pitch = undefined; d.roll = undefined;
    d.T[0] = p.pos[0]; d.T[1] = .25; d.T[2] = p.pos[2]; d.alpha = .001;
    R.draw(d);
    if (u.alive && !deep(u) && u.mastUp > .02) {
      let m = mastInst.get(u.id);
      if (!m) { m = { key: d0.model, T: [0, 0, 0], hdg: 0, pitch: 0, roll: 0, st: null, tint: 'own', alpha: 1, id: u.id }; mastInst.set(u.id, m); }
      m.T[0] = p.pos[0]; m.T[1] = -(u.depth - d0.draught); m.T[2] = p.pos[2]; m.hdg = p.hdg;
      m.st = d.st; m.tint = d.tint; m.damage = d.damage;
      R.draw(m);
    }
  }

  const parked = { pos: [0, 0, 0], hdg: 0, pitch: 0, roll: 0 }, hostP = { pos: [0, 0, 0], hdg: 0, pitch: 0, roll: 0 };

  /* a carried unit (sim/amphib.js): an LCAC in its berth in the LHD's well, seen only with the stern gate down (it
     floats in the flooded well); a vehicle on an LCAC's cargo deck (not while that craft is shut in the well). On the
     LHD's vehicle decks nothing shows. false = not drawn */
  function carriedPose(u, h, out) {
    if (h.def.well && u.def.hover) {
      if ((h.well || 0) < .05) return false;
      const W = h.def.well, cp = game.unitPose(h), z = W.slots[u.slot >= 0 ? u.slot : 0], c = Math.cos(cp.hdg), s = Math.sin(cp.hdg);
      out.pos[0] = cp.pos[0] + s * z; out.pos[2] = cp.pos[2] + c * z; out.pos[1] = Math.max(0, cp.pos[1] + W.y);
      out.hdg = cp.hdg; out.pitch = cp.pitch; out.roll = cp.roll;
      return true;
    }
    if (h.def.hover) {
      let hp;
      if (h.aboard) { const hh = sim.units.get(h.aboard); if (!hh || !carriedPose(h, hh, hostP)) return false; hp = hostP; }
      else hp = game.unitPose(h);
      const A = DM && DM.LCAC, q = (A && A.SLOTS && A.SLOTS[u.slot > 0 ? 1 : 0]) || [0, u.slot > 0 ? -4.9 : 4.9];
      const y = A && A.deckY ? A.deckY(h.def.modelState(h, game.t)) : 2.3, c = Math.cos(hp.hdg), s = Math.sin(hp.hdg);
      out.pos[0] = hp.pos[0] + c * q[0] + s * q[1]; out.pos[2] = hp.pos[2] - s * q[0] + c * q[1]; out.pos[1] = hp.pos[1] + y;
      out.hdg = hp.hdg; out.pitch = hp.pitch; out.roll = hp.roll;
      return true;
    }
    return false;
  }

  function drawUnit(u) {
    const d0 = u.def;
    let v;
    if (u.aboard) {
      const cv = sim.units.get(u.aboard);
      if (!cv || !cv.alive) return;
      const cvv = u.side === game.side ? 'own' : sim.visible(game.side, cv);
      if (cvv !== 'own' && cvv !== 'track') return;
      if (cvv === 'track' && game.camera.dist > 4000) return;
      v = cvv;
    } else v = sim.visible(game.side, u);
    if (v !== 'own' && v !== 'track') return;
    let d = inst.get(u.id);
    if (!d) { d = { key: d0.model, T: [0, 0, 0], hdg: 0, pitch: 0, roll: 0, st: null, tint: 'own', id: u.id, alpha: 1, dissolve: 0, damage: null }; inst.set(u.id, d); }
    let p;
    if (u.aboard && d0.domain !== 'air') { if (!carriedPose(u, sim.units.get(u.aboard), parked)) { game.drawn.delete(u.id); return; } p = parked; }
    else p = u.aboard ? parkPose(u, sim.units.get(u.aboard), parked) : game.unitPose(u);
    d.T[0] = p.pos[0]; d.T[1] = p.pos[1]; d.T[2] = p.pos[2];
    d.hdg = p.hdg; d.pitch = p.pitch; d.roll = p.roll;
    d.tint = tintOf(v);
    // smooth spinners: the model state at the drawn time
    d.st = d0.modelState(u, game.t);
    if (u.type === 'transloader' && d.st.reload > 0 && DM && DM.TRANSLOADER) Object.assign(d.st, DM.TRANSLOADER.reloadPose(d.st.reload, { slot: d.st.slot }));
    d.key = d0.model; d.dissolve = 0; d.alpha = 1;
    d.damage = hasDamage(u) ? u.parts : null;
    if (d0.sub && submerged(u)) {
      if (!u.alive) d.damage = u.parts;
      drawBoat(u, d, p);
      game.drawn.set(u.id, d);
      return;
    }
    if (!u.alive) {
      const k = u.dying;
      if (d0.domain === 'land') {
        const wk = wreckKey(d0.model);
        if (wk) { d.key = wk; d.st = Object.assign(d.st, { wreck: ss(0, .25, k) }); }
        d.dissolve = .55 * ss(.5, 1, k);           // continues as a ghost wreck after removal
        d.tintK = .35;
      } else if (d0.domain === 'air') d.dissolve = ss(.7, 1, k);
      else d.dissolve = ss(.85, 1, k);
      d.damage = u.parts;
    } else d.tintK = undefined;
    // the debris system (game/debris.js): an aircraft coming apart is drawn there; parts that broke loose are masked
    if (game.debris && game.debris.unit(u, d) === false) return;
    R.draw(d);
    game.drawn.set(u.id, d);
    // wake behind a moving ship (unless the FX system lays its own); none for a hovercraft over the beach
    if (d0.domain === 'sea' && !fxWakes && !(d0.hover && game.map.h(p.pos[0], p.pos[2]) > 0)) {
      let w = wakes.get(u.id);
      if (!w) { w = new Wake({ L: d0.size[0], B: d0.size[1], seed: u.id, len: d0.size[0] > 300 ? 1500 : 1100 }); wakes.set(u.id, w); }
      w.update(p.pos, p.hdg, u.alive ? u.speed : u.speed * (1 - u.dying), game.t);
      if (u.speed > .8 || w.rows.length) w.draw(R.fx, Math.min(1, u.speed / 8 + .15) * (u.alive ? 1 : 1 - u.dying));
    }
  }
  function hasDamage(u) { for (const k in u.parts) if (u.parts[k] > 0) return true; return false; }

  /* Kh-35 and Kalibr: the FX system has no plume or smoke for these kinds yet, so they get a light one here: the
     booster's smoke for its burn, then the faint heat of the turbojet. Points laid every .12 s of sim time along the
     flight (a ring of 40), drawn as fading dots; kept a few seconds after the round is gone. */
  const OWN_TRAIL = { uran: 2, kalibr: 5 };                     // kind -> booster burn (s)
  const ptrails = new Map();                                    // proj id -> { x, y, z, a (age at laying), n, i, last, t0, gone }
  function layTrails() {
    const t = sim.t;
    for (const pr of sim.projectiles.values()) {
      const boost = OWN_TRAIL[pr.kind];
      if (boost === undefined || !pr.alive) continue;
      let tr = ptrails.get(pr.id);
      if (!tr) { tr = { x: new Float32Array(40), y: new Float32Array(40), z: new Float32Array(40), a: new Float32Array(40), n: 0, i: 0, last: -1e9, t0: pr.t0, gone: 0, side: pr.side, id: pr.id, boost }; ptrails.set(pr.id, tr); }
      if (t - tr.last < .12) continue;
      tr.last = t;
      const v = pr.vel, l = Math.hypot(v[0], v[1], v[2]) || 1, k = pr.kind === 'kalibr' ? 4.3 : 2.4;     // at the nozzle
      tr.x[tr.i] = pr.pos[0] - v[0] / l * k; tr.y[tr.i] = pr.pos[1] - v[1] / l * k; tr.z[tr.i] = pr.pos[2] - v[2] / l * k; tr.a[tr.i] = t - pr.t0;
      tr.i = (tr.i + 1) % 40; tr.n = Math.min(40, tr.n + 1);
    }
    for (const [id, tr] of ptrails) {
      const pr = sim.projectiles.get(id);
      if (!pr || !pr.alive) { tr.gone = tr.gone || t; if (t - tr.gone > 4 || t < tr.gone) ptrails.delete(id); }
    }
  }
  function drawTrails() {
    const t = game.t, fx = R.fx;
    for (const tr of ptrails.values()) {
      const pr = sim.projectiles.get(tr.id);
      if (tr.side !== game.side && !(pr && sim.projVisible(game.side, pr)) && !tr.gone) continue;
      for (let j = 0; j < tr.n; j++) {
        const born = tr.t0 + tr.a[j], age = t - born;
        if (age < 0) continue;
        const smoke = tr.a[j] < tr.boost, life = smoke ? 3.5 : 1.4;
        if (age > life) continue;
        const f = 1 - age / life, c = smoke ? 205 : 235, a = (smoke ? .55 : .3) * f;
        fx.dotXYZ(tr.x[j], tr.y[j] + age * (smoke ? 1.2 : 0), tr.z[j], smoke ? 1.6 + age * .9 : 1.2, c, c, c - 12, a, 'max');
      }
      if (pr && pr.alive) {
        // the nozzle: a hot point (the booster's brighter)
        const hot = pr.age < tr.boost, v = pr.vel, l = Math.hypot(v[0], v[1], v[2]) || 1, k = pr.kind === 'kalibr' ? 4.3 : 2.4;
        const p = [pr.pos[0] - v[0] / l * k, pr.pos[1] - v[1] / l * k, pr.pos[2] - v[2] / l * k];
        fx.glow(p, hot ? 6 : 3, [255, 220, 170], hot ? .7 : .35);
      }
    }
  }

  function drawProj(pr) {
    if (!pr.alive) return;
    if (!sim.projVisible(game.side, pr)) return;
    const P = pr.P || game.PROJ[pr.kind];
    const key = P && P.model;
    if (!key || !R.models.has(key)) return;
    let d = pinst.get(pr.id);
    if (!d) { d = { key, T: [0, 0, 0], hdg: 0, pitch: 0, roll: 0, st: null, tint: 'own', tintK: .45 }; pinst.set(pr.id, d); }
    const p = game.projPose(pr);
    d.T[0] = p.pos[0]; d.T[1] = p.pos[1]; d.T[2] = p.pos[2];
    d.hdg = p.hdg; d.pitch = p.pitch; d.roll = 0;
    d.st = pr.st || {};
    d.tint = pr.side === game.side ? 'own' : 'hostile';
    // a round out of control or broken up is drawn by the debris system (game/debris.js)
    if (game.debris && !game.debris.proj(pr, d)) return;
    R.draw(d);
  }

  /* the player's radar sweep paints the sea: the brightest own search radar in view */
  function sweep() {
    let best = null, bd = 1e18;
    const tgt = game.camera.target;
    for (const u of sim.alive(game.side)) {
      const S = u.def.sensors && u.def.sensors.radar;
      if (!S || !u.radarOn || !S.surf || u.aboard || u.off.radar) continue;
      if (S.needsMast && u.mast < 1) continue;
      const dd = (u.pos[0] - tgt[0]) ** 2 + (u.pos[2] - tgt[2]) ** 2;
      if (dd < bd) { bd = dd; best = u; }
    }
    if (!best) { if (lastSweep) { R.setSweep(null); lastSweep = null; } return; }
    const p = game.unitPose(best), st = best.st;
    const ant = best.type === 'radar' ? st.ant : best.type === 'ddg' ? st.sps : best.type === 'carrier' ? st.radar : (best.antA || 0);
    lastSweep = { origin: [p.pos[0], p.pos[2]], bearing: p.hdg + (ant || 0), amp: .85, afterglow: 1.3, range: best.def.sensors.radar.surf, edge: .03 };
    R.setSweep(lastSweep);
  }

  return {
    name: 'render', priority: PRI.render,
    wakes, inst,
    /* switch the built-in radar sweep off when the SENSORS system paints its own */
    ownSweep: true,
    init() { buildSites(); },
    onEvent(e) {
      if (e.type === 'removed') {
        // a burnt-out vehicle stays on the ground a while as a wreck, then the returns thin out
        const d = inst.get(e.unit);
        if (d && /_wreck$/.test(d.key)) ghosts.push({ d: { key: d.key, T: d.T.slice(), hdg: d.hdg, pitch: d.pitch, roll: d.roll, st: Object.assign({}, d.st, { wreck: 1 }), tint: 'neutral', dissolve: .55, damage: d.damage ? Object.assign({}, d.damage) : null, partAlpha: d.partAlpha }, t0: sim.t });
        inst.delete(e.unit); wakes.delete(e.unit); mastInst.delete(e.unit); for (const m of deckSlots.values()) m.delete(e.unit);
      }
      else if (e.type === 'takeoff') { for (const m of deckSlots.values()) m.delete(e.unit); }
    },
    update() {
      // the FX system draws the Kh-35U / Kalibr plumes and trails itself; this stop-gap only runs without it
      const fxs = game.getSystem('fx'); ownFxTrails = !!(fxs && fxs.ownTrails);
      if (!ownFxTrails) layTrails();
      // forget projectile instances that are gone
      if (pinst.size > sim.projectiles.size + 32) for (const id of pinst.keys()) if (!sim.projectiles.has(id)) pinst.delete(id);
    },
    draw3d() {
      const fx = game.getSystem('fx'); fxWakes = !!(fx && fx.wakes);
      for (const s of sites) R.draw(s.d);
      for (let i = ghosts.length - 1; i >= 0; i--) {
        const gh = ghosts[i], age = sim.t - gh.t0;
        if (age > GHOST_LIFE) { ghosts.splice(i, 1); continue; }
        gh.d.dissolve = .55 + .45 * ss(0, GHOST_LIFE, age);
        R.draw(gh.d);
      }
      const list = sim.list();
      for (let i = 0; i < list.length; i++) drawUnit(list[i]);
      for (const pr of sim.projectiles.values()) drawProj(pr);
      if (!ownFxTrails && ptrails.size) drawTrails();
      if (this.ownSweep && !game.getSystem('sensors')) sweep();
    },
  };
}
