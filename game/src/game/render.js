/* Render system: draws the sim as the player may see it. Units at their interpolated poses (land units on the
   drawn ground, ships riding the swell, aircraft banking, carrier aircraft parked on the deck), own units lime,
   enemy tracks coral (contacts below the track threshold are the SENSORS system's), fog off draws everything.
   Dying units: ships settle, list and sink (the sim's dying pose under the sea surface occluder); vehicles turn
   into wrecks and dissolve; aircraft fall. Projectiles with their models along their velocity. Ship wakes.
   The objective sites (port, depot, radar hill, airfield, lighthouse) as structures. Fills game.drawn. */
import { PRI } from './game.js';
import { Wake } from '../engine/fx.js';

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
  let lastSweep = null, fxWakes = false;

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
    const lx = row ? -26 : 24, lz = -110 + i * 24 + (row ? 70 : 0), yaw = row ? Math.PI / 2 : -Math.PI / 2;
    const c = Math.cos(cp.hdg), sn = Math.sin(cp.hdg);
    out.pos[0] = cp.pos[0] + c * lx + sn * lz; out.pos[2] = cp.pos[2] - sn * lx + c * lz; out.pos[1] = cp.pos[1] + 19.6;
    out.hdg = cp.hdg + yaw; out.pitch = cp.pitch; out.roll = cp.roll;
    return out;
  }
  const parked = { pos: [0, 0, 0], hdg: 0, pitch: 0, roll: 0 };

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
    const p = u.aboard ? parkPose(u, sim.units.get(u.aboard), parked) : game.unitPose(u);
    d.T[0] = p.pos[0]; d.T[1] = p.pos[1]; d.T[2] = p.pos[2];
    d.hdg = p.hdg; d.pitch = p.pitch; d.roll = p.roll;
    d.tint = tintOf(v);
    // smooth spinners: the model state at the drawn time
    d.st = d0.modelState(u, game.t);
    if (u.type === 'transloader' && d.st.reload > 0 && DM && DM.TRANSLOADER) Object.assign(d.st, DM.TRANSLOADER.reloadPose(d.st.reload, { slot: d.st.slot }));
    d.key = d0.model; d.dissolve = 0; d.alpha = 1;
    d.damage = hasDamage(u) ? u.parts : null;
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
    R.draw(d);
    game.drawn.set(u.id, d);
    // wake behind a moving ship (unless the FX system lays its own)
    if (d0.domain === 'sea' && !fxWakes) {
      let w = wakes.get(u.id);
      if (!w) { w = new Wake({ L: d0.size[0], B: d0.size[1], seed: u.id, len: d0.size[0] > 300 ? 1500 : 1100 }); wakes.set(u.id, w); }
      w.update(p.pos, p.hdg, u.alive ? u.speed : u.speed * (1 - u.dying), game.t);
      if (u.speed > .8 || w.rows.length) w.draw(R.fx, Math.min(1, u.speed / 8 + .15) * (u.alive ? 1 : 1 - u.dying));
    }
  }
  function hasDamage(u) { for (const k in u.parts) if (u.parts[k] > 0) return true; return false; }

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
        if (d && /_wreck$/.test(d.key)) ghosts.push({ d: { key: d.key, T: d.T.slice(), hdg: d.hdg, pitch: d.pitch, roll: d.roll, st: Object.assign({}, d.st, { wreck: 1 }), tint: 'neutral', dissolve: .55, damage: d.damage ? Object.assign({}, d.damage) : null }, t0: sim.t });
        inst.delete(e.unit); wakes.delete(e.unit); for (const m of deckSlots.values()) m.delete(e.unit);
      }
      else if (e.type === 'takeoff') { for (const m of deckSlots.values()) m.delete(e.unit); }
    },
    update() {
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
      if (this.ownSweep && !game.getSystem('sensors')) sweep();
    },
  };
}
