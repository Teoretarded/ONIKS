/* Vehicle dynamics: how units move under the sim's fixed step (DT = 0.05 s). A few closed-form or one-step updates
   per unit and tick, no allocation in the per-tick paths, no randomness (deterministic from the state). Numbers per
   type come from the unit table (`UNITS[type].mot`, data/units.js), with defaults from the unit's size and speed.

   Ground vehicles  power to weight (mot.power kW, mot.mass t, 80 % at the wheels) against rolling resistance (road
                    1.2 %, off road 4.5 %) and the grade along the heading: full speed on the flat, a crawl up a 25 %
                    slope, stopped by traction beyond; the driver's comfortable acceleration (def.accel) and braking
                    (3.2 m/s2); he holds back on steep descents and across side slopes. Steering is a bicycle model:
                    curvature limited by the turning circle (mot.turnR, an 8x8 ~13.5 m) and by the grip he keeps
                    (~0.25 g), so trucks slow for bends and never pivot; the wheel turns at a finite rate. Suspension:
                    the body sits back under power, dives braking and rolls out of turns (a damped spring: u.sp / u.sr,
                    added to the ground's attitude in u.pitch / u.roll).
   Ships            surge: thrust holding the ordered speed (astern at 60 %) against drag ~ v^2 that grows with the drift
                    in a turn (a hard turn costs a third of her speed): a DDG takes ~3 min to 30 kn, the carrier ~6.
                    Yaw: Nomoto first order (she answers the rudder after T = mot.yawT L / v s) under a helmsman who
                    meets her with counter-rudder; turning circle mot.td ship lengths (tactical diameter). Heel out of
                    the turn after a brief lean into it as the rudder goes over (a lightly damped roll at her natural
                    period: she overshoots and settles); a submerged boat leans into the turn (snap roll). Squat and
                    trim by the stern with the Froude number, more in shallow water; the bow wave height (u.bow, m);
                    list and trim from flooding (u.list, u.trim). The swell is added by the render pose (sim/sea.js).
   Aircraft         bank to turn (turn rate g tan(bank) / v, the bank rate-limited, rolled out ahead of the heading);
                    energy: thrust against parasitic drag, the induced drag of a hard turn (load factor 1 / cos bank)
                    and the climb: the throttle holds the speed until it runs out of thrust, then the aircraft slows;
                    the climb rate is what the thrust has to spare at flying speed; pitch = flight path + angle of attack
                    (higher slow and low). The carrier: the catapult stroke (0 to mot.cat m/s in 94 m, ~2.5 s), the
                    approach down a 3.5 deg glide slope to the wires on the angled deck, the arrested roll-out (90 m).
                    Helicopters fly a velocity vector: the rotor tilts forward to accelerate and to hold speed against
                    drag, back to flare; they drift a little in the hover, and set down on a deck matching its motion.
   Separation       units of one domain keep clear of each other (hulls as capsules): the one with the other ahead gives
                    way (a ship to starboard in a crossing or head-on, otherwise away from it) and slows; a unit whose
                    goal is taken by a stopped one stops short; overlaps are pushed apart. Aircraft keep 150 m of height
                    from each other where their paths cross. */
import { DT } from './consts.js';
import { clamp, angTo, wrapPi, ground } from './util.js';
import { submerged } from './subs.js';
import { hullOf } from './sea.js';

const G = 9.81, TAU = Math.PI * 2, TAN_GS = Math.tan(3.5 * Math.PI / 180);

/* exact one-step update of a damped oscillator x'' = w^2 (x0 - x) - 2 z w x' with x0 held over the step: the matrix
   taking (x - x0, x') to the next step, computed once per (w, z) */
function oscK(w, z) {
  const a = z * w, wd = w * Math.sqrt(1 - z * z), e = Math.exp(-a * DT), c = Math.cos(wd * DT), s = Math.sin(wd * DT);
  return [e * (c + a * s / wd), e * s / wd, -e * w * w * s / wd, e * (c - a * s / wd)];
}

/* ================================================================== ground vehicles */
function landP(d) {
  let P = d._drv;
  if (P) return P;
  const m = d.mot || {}, mass = (m.mass || Math.max(4, d.size[0] * d.size[1] * .9)) * 1000;
  P = d._drv = {
    pw: (m.power || 25 * mass / 1000) * 1000 * .8 / mass,            // W per kg at the wheels
    turnR: m.turnR || Math.max(6, d.size[0]), aLat: m.aLat || 2.4, brake: m.brake || 3.2, mu: .6,
    kp: .012, kr: .02,                                                 // body pitch / roll per m/s2 (rad)
    sus: oscK(TAU * 1.1, .35),                                         // the springs: 1.1 Hz, damped
  };
  return P;
}
export const turnRadius = u => u.def.domain === 'land' ? landP(u.def).turnR : u.def.domain === 'sea' ? shipP(u.def).R : 0;

function driveLand(sim, u, vT, turnTo, dist) {
  const d = u.def, P = landP(d);
  let v = u.speed, kap = 0;
  if (turnTo === null && v === 0) { u.aLong = 0; u.aLat = 0; return; }             // parked
  if (turnTo !== null) {
    const e = wrapPi(angTo(u.hdg, turnTo) + (u.avH || 0)), se = Math.sin(e);
    // pure pursuit on the waypoint (looking at least two turning radii ahead); behind her: full lock
    kap = Math.abs(e) > Math.PI / 2 ? (e > 0 ? 1 : -1) / P.turnR : 2 * se / Math.max(dist, 2 * P.turnR);
    // a point inside the turning circle on its side cannot be reached turning toward it: straight on first
    if (dist < 2 * P.turnR * Math.abs(se)) kap = 0;
    // slow for the bend: the grip he keeps
    const kn = Math.abs(kap);
    if (kn > 1e-6) vT = Math.min(vT, Math.max(2.5, Math.sqrt(P.aLat / kn)));
    const kMax = Math.min(1 / P.turnR, P.aLat / Math.max(v * v, 1e-6));
    kap = clamp(kap, -kMax, kMax);
  }
  const dk = DT / (P.turnR * 1.5), k0 = u.kap || 0;                    // the wheel: lock to lock in ~3 s
  u.kap = k0 + clamp(kap - k0, -dk, dk);
  // the engine against the grade (speed it can hold), holding back downhill and across side slopes
  const grade = u.grade || 0, cross = Math.abs(u.cross || 0), res = G * ((u.onRoad ? .012 : .045) + grade);
  if (res > 1e-3) vT = Math.min(vT, P.pw / res);
  if (grade < -.08) vT *= clamp(1 - 2.5 * (-grade - .08), .4, 1);
  if (cross > .15) vT *= clamp(1 - 2 * (cross - .15), .3, 1);
  if (u.avS < 1) vT *= u.avS;
  const want = clamp((vT - v) / .8, -P.brake, d.accel || 1.2);
  // accelerating: what traction and power give over the resistance; braking: the brakes
  const a = want > 0 ? Math.min(want, Math.min(P.mu * G, P.pw / Math.max(v, .5)) - res) : want;
  v += a * DT;
  if (v < 0) v = 0;
  if (vT <= 0 && v < .05) v = 0;
  u.speed = v; u.aLong = a; u.aLat = v * v * u.kap;
  u.hdg += v * u.kap * DT;
}

/* the ground under the wheels (map heights; the render pose refines it on the drawn relief) and the body on its
   springs. Sets u.pos[1], u.pitch, u.roll, u.grade (along the heading, + uphill), u.cross (side slope). */
export function attitudeLand(sim, u) {
  // the ground under her, sampled again when she has moved a metre and a half or turned a degree (the map's heights
  // are smooth at that scale; the drawn relief is the render pose's)
  const mx = u.pos[0] - u._ax, mz = u.pos[2] - u._az, mh = u.hdg - u._ah, near = mx * mx + mz * mz < 2.25 && mh < .018 && mh > -.018;
  if (near && u._rest && u.speed === 0) return;                    // parked, settled
  const d = u.def, map = sim.map, P = landP(d);
  if (!near) {
    u._ax = u.pos[0]; u._az = u.pos[2]; u._ah = u.hdg;
    const x = u.pos[0], z = u.pos[2], s = Math.sin(u.hdg), c = Math.cos(u.hdg), L = d.size[0] * .4, W = d.size[1] * .5;
    const hf = map.h(x + s * L, z + c * L), hb = map.h(x - s * L, z - c * L), hr = map.h(x + c * W, z - s * W), hl = map.h(x - c * W, z + s * W);
    u.pos[1] = Math.max(0, map.h(x, z));
    u.grade = (hf - hb) / (2 * L); u.cross = (hl - hr) / (2 * W);
    u.tp = Math.atan(u.grade); u.tr = Math.atan(u.cross);
  }
  // springs: sits back accelerating, dives braking (+ pitch nose up), rolls out of a turn (right turn: port down, -)
  const pe = P.kp * (u.aLong || 0), re = -P.kr * (u.aLat || 0), K = P.sus;
  const sp = u.sp || 0, spv = u.spv || 0, sr = u.sr || 0, srv = u.srv || 0;
  if (pe !== 0 || re !== 0 || Math.abs(sp) + Math.abs(spv) + Math.abs(sr) + Math.abs(srv) > 1e-5) {
    let y = sp - pe; u.sp = pe + K[0] * y + K[1] * spv; u.spv = K[2] * y + K[3] * spv;
    y = sr - re; u.sr = re + K[0] * y + K[1] * srv; u.srv = K[2] * y + K[3] * srv;
  } else { u.sp = 0; u.spv = 0; u.sr = 0; u.srv = 0; }
  u.pitch = (u.tp || 0) + u.sp; u.roll = (u.tr || 0) + u.sr;
  if (u.speed === 0) { u.aLong = 0; u.aLat = 0; }
  u._rest = u.speed === 0 && u.sp === 0 && u.sr === 0;
}

/* ================================================================== ships */
function shipP(d) {
  let P = d._shp;
  if (P) return P;
  const m = d.mot || {}, L = d.size[0], hull = hullOf(d);
  P = d._shp = {
    L, R: (m.td || 3.5) * L / 2, yawT: m.yawT || 1.3, heelK: m.heelK || 1.6,
    roll: oscK(TAU / hull.Tr, m.rollZ || .12),
  };
  return P;
}

function driveShip(sim, u, vT, turnTo, dist, last) {
  const d = u.def, P = shipP(d), v0 = u.speed, a0 = d.accel || .1, cr = a0 / (d.speed * d.speed);
  let r = u.yawR || 0, rc = 0;
  const Tn = P.yawT * P.L / Math.max(v0, 3), rMax = Math.max(v0, .3) / P.R;
  if (turnTo !== null) {
    const e = wrapPi(angTo(u.hdg, turnTo) + (u.avH || 0));
    // the helmsman: rudder for the error, met with counter-rudder as she swings (critically damped on T / 3)
    rc = clamp(3 * e / Tn - 2.46 * r, -rMax, rMax);
    // the last point inside her turning circle: stand on, open out and come round to it
    if (last && dist < 2 * P.R * Math.abs(Math.sin(e)) && Math.abs(e) > .35) rc = 0;
    // she needs way on to turn
    if (Math.abs(e) > .5) vT = Math.max(vT, Math.min(d.speed * .35, 4));
  }
  if (u.avS < 1) vT *= u.avS;
  if (v0 === 0 && vT <= 0 && r === 0 && rc === 0) { u.rud = 0; return; }        // stopped, no orders
  r += (rc - r) * Math.min(1, DT / Tn);
  if (Math.abs(r) < 1e-7 && rc === 0) r = 0;
  u.yawR = r; u.rud = rc / rMax;
  u.hdg += r * DT;
  // surge: the thrust for the ordered speed (the shafts' revolutions), drag with the drift angle of the turn
  const rp = r * P.L / Math.max(v0, 1);
  const drag = cr * v0 * v0 * (1 + 4.3 * rp * rp);
  const thr = clamp(cr * vT * vT + (vT - v0) * .15, -.6 * a0, a0);
  let v = v0 + (thr - drag) * DT;
  if (v < 0) v = 0;
  if (vT <= 0 && v < .03) v = 0;
  u.speed = v;
}

/* heel, squat, trim, list: sets u.pos[1] (the waterline origin's height: - squat, - the boat's depth, - an LHD's
   ballast), u.pitch (+ bow up), u.roll (+ starboard down), u.bow (bow wave, m), u.list / u.trim (flooding) */
export function attitudeShip(sim, u) {
  const d = u.def, P = shipP(d), v = u.speed, r = u.yawR || 0, sub = !!d.sub && submerged(u);
  // stopped, settled, dry: nothing changes (a boat's depth and an LHD's ballast still do)
  if (v === 0 && r === 0 && !(u.flood > 0) && !d.sub && !d.well && u.squat < 1e-4 && Math.abs(u.heel) + Math.abs(u.heelV) < 1e-5) {
    u.pos[1] = -u.squat; u.pitch = u.trimS; u.roll = u.heel; u.bow = 0; u.list = 0; u.trim = 0;
    return;
  }
  // flooding while afloat (damage.js): a list toward the damaged side, trim by the damaged end; the pumps gain slowly
  let list = 0, trim = 0;
  if (u.flood > 0) {
    u.flood = Math.max(0, u.flood - .0006 * DT);
    list = (u.fSide || 0) * .14 * u.flood; trim = -(u.fEnd || 0) * .04 * u.flood;
  }
  // heel: out of the turn, after a brief lean into it as the rudder goes over; a submerged boat leans into it
  const aLat = v * r;
  let eq = sub ? .9 * P.heelK * aLat / G : -P.heelK * aLat / G + .22 * P.heelK * (u.rud || 0) * v * v / P.R / G;
  eq = clamp(eq, -.3, .3) + list;
  const K = P.roll, y = (u.heel || 0) - eq, hv = u.heelV || 0;
  u.heel = eq + K[0] * y + K[1] * hv; u.heelV = K[2] * y + K[3] * hv;
  if (sub) {
    u.pos[1] = -(u.depth - d.draught);
    // bow down diving, up rising (the depth rate over her speed)
    const vy = (u.pos[1] - u.prev[1]) / DT;
    u.pitch += (clamp(Math.atan2(vy, Math.max(v, 3)), -.15, .15) - u.pitch) * DT / 1.5;
    u.roll = u.heel; u.bow = 0;
  } else {
    // squat and trim by the stern with the Froude number, more in shallow water (depth under her / draught)
    if (u._dep === undefined || (sim.tick + u.id) % 10 === 0) u._dep = Math.max(1, -sim.map.h(u.pos[0], u.pos[2]));
    const Fn2 = v * v / (G * P.L), q = u._dep / (d.draught || 5), sh = 1 + 3 / Math.max(1.44, q * q);
    const sq = u.squat || 0, tS = u.trimS || 0;
    u.squat = sq + (.015 * P.L * Fn2 * sh - sq) * DT / 4;
    u.trimS = tS + (.06 * Fn2 * sh - tS) * DT / 4;
    u.bow = Math.min(.03 * P.L, .2 * v * v / (2 * G)) * (1 + (sh - 1) * .5);
    u.pos[1] = -u.squat - (d.sub ? u.depth - d.draught : 0) - (d.well ? d.well.ballast * (u.well || 0) : 0);
    u.pitch = u.trimS + trim; u.roll = u.heel;
  }
  u.list = list; u.trim = trim;
}

/* ================================================================== surface movers: the caller's hook */
/* speed and heading for a surface unit this tick; false when the unit keeps the plain kinematic rules (hovercraft,
   domains without a model) */
export function drive(sim, u, dom, vT, turnTo, dist, last) {
  if (u.def.hover) return false;
  if (dom === 'land') { driveLand(sim, u, vT, turnTo, dist); return true; }
  if (dom === 'sea') { driveShip(sim, u, vT, turnTo, dist, last); return true; }
  return false;
}

/* move on to the next waypoint early enough to turn onto the next leg (R tan(turn / 2) before the corner), or when
   this one lies inside the turning circle (a vehicle would circle it) */
export function passWaypoint(u, dist) {
  if (u.def.hover || !u.path || u.wi >= u.path.length - 1) return false;
  const R = turnRadius(u);
  if (R <= 0 || dist > 3 * R) return false;
  const wp = u.path[u.wi], nx = u.path[u.wi + 1];
  const ax = wp[0] - u.pos[0], az = wp[1] - u.pos[2], bx = nx[0] - wp[0], bz = nx[1] - wp[1];
  const la = Math.hypot(ax, az) || 1, lb = Math.hypot(bx, bz) || 1;
  const cth = clamp((ax * bx + az * bz) / (la * lb), -1, 1), th = Math.acos(cth);
  if (dist < Math.min(3 * R, R * Math.tan(Math.min(th, 2.6) / 2))) return true;
  const e = angTo(u.hdg, Math.atan2(ax, az));
  return dist < 2 * R * Math.abs(Math.sin(e)) && Math.abs(e) > 1;
}

/* ================================================================== aircraft */
function airP(d) {
  let P = d._fly;
  if (P) return P;
  const m = d.mot || {}, heli = d.type === 'helo' || !!m.rotor;
  P = d._fly = {
    heli, bank: m.bank || (heli ? .52 : .9), bankC: Math.min(m.bank || .9, m.bankC || 1.05), rollRate: m.rollRate || (heli ? .6 : 1), topK: m.top || 1.3,
    aoa: m.aoa || .03, app: m.app || 0, cat: m.cat || 0, ay: m.ay || 1.5, gear: m.gear || 0, yawRate: .5,
    F: { v: -1, c: 0, a: 0, top: 0, aT: 0, rs0: 1 },                   // perf(): the table's numbers, re-derived if changed
    vs: m.vs || d.speed * .3,                                            // stall speed (clean, equivalent airspeed)
    tanB: 0, tanBC: 0, topK2: 0, vMin: m.vMin || (d.type === 'fighter' ? 150 : d.type === 'aew' ? 95 : 0),
    low: d.type !== 'fighter' && d.type !== 'aew', ab: d.type === 'fighter',   // terrain following (helos, drones); afterburner
  };
  P.tanB = Math.tan(P.bank); P.tanBC = Math.tan(P.bankC); P.topK2 = P.topK * P.topK;
  return P;
}
/* performance at the current table values (balance experiments may change speed / climb): cruise v, top speed, and
   the full thrust aT (m/s2) that gives the table's climb rate at cruise */
function perf(d, P) {
  const F = P.F;
  if (F.v !== d.speed || F.c !== d.climb || F.a !== d.accel) {
    const v = d.speed;
    F.v = v; F.c = d.climb; F.a = d.accel; F.top = v * P.topK;
    F.aT = (d.climb || 5) * G / (v * Math.max(.2, 1 - 1 / (P.topK * P.topK)));
    F.rs0 = Math.exp(-(d.altDef || 0) / 18000);                      // sqrt of the air density ratio at the design height
  }
  return F;
}
const NAV = { want: 0, vT: 0, yT: 0, vyFF: 0, hold: false, hx: 0, hz: 0, hvx: 0, hvz: 0, hh: 0, down: false, low: false };

/* one tick of flight. Fuel and the map edge stay with the caller (movement.js). */
export function flyAir(sim, u) {
  const d = u.def, map = sim.map, P = airP(d);
  if (u.deck) { deckStep(sim, u, P); return; }
  if (!P.heli && catStart(sim, u, P)) { deckStep(sim, u, P); return; }
  if (!u.goal) u.goal = [u.pos[0] + Math.sin(u.hdg) * 2000, u.pos[2] + Math.cos(u.hdg) * 2000];
  const gx = u.goal[0], gz = u.goal[1], dx = gx - u.pos[0], dz = gz - u.pos[2], dist = Math.sqrt(dx * dx + dz * dz);
  const R = u.orbitR, N = NAV;
  let vT = d.speed;
  const sl = d._slowP || (d._slowP = d.partNames.filter(p => d.parts[p].slow));
  for (let i = 0; i < sl.length; i++) if (u.parts[sl[i]] >= 1) vT *= d.parts[sl[i]].slow;
  N.hold = false; N.vyFF = 0; N.down = false; N.low = false;
  if (R > 0 && dist < R * 1.6) {
    // orbit clockwise around the goal
    const b = Math.atan2(-dx, -dz);
    N.want = b + Math.PI / 2 + clamp((dist - R) / R, -1, 1) * .9;
    if (u.type === 'drone' || P.heli) vT *= .8;
  } else {
    N.want = Math.atan2(dx, dz);
    if (P.heli && R === 0) vT = Math.min(vT, Math.sqrt(2 * 2 * Math.max(0, dist - 8)));    // she stops over the point
    if (u.type === 'drone' && R === 0 && dist < 600) N.want = Math.atan2(dx, dz) + Math.PI / 2;
  }
  // altitude band: terrain following for helicopters and drones (they look ahead)
  let g = ground(map, u.pos[0], u.pos[2]);
  if (P.low) { const k = u.speed * 8; g = Math.max(g, ground(map, u.pos[0] + Math.sin(u.hdg) * k, u.pos[2] + Math.cos(u.hdg) * k)); }
  N.yT = g + u.altT + (u.sepY || 0);
  let floor = g + 10;
  // coming home to a deck
  const cv = u.landing ? sim.units.get(u.landing) : null;
  if (!u.landing) u.appr = 0;
  if (cv && cv.alive) {
    if (P.heli) { if (heliApproach(sim, u, P, cv, N)) floor = -1e9; vT = N.vT; }
    else if (cv.def.mot && cv.def.mot.trap && P.app) {
      const r = approach(sim, u, P, cv, N);
      if (r === 2) { deckStep(sim, u, P); return; }
      vT = N.vT; if (N.low) floor = -1e9;
    } else if (dist < 12000) N.yT = Math.max(cv.pos[1] + (cv.def.air ? cv.def.air.deckY : 10) + 30, g + 30) + (u.altT - 30) * clamp((dist - 1500) / 10500, 0, 1);
  }
  N.vT = vT;
  if (P.heli) heli(sim, u, P, N, floor);
  else wing(sim, u, P, N, floor, !!cv);
}

/* ------------------------------------------------ fixed wing */
function wing(sim, u, P, N, floor, homing) {
  const d = u.def, F = perf(d, P);
  let vT = N.vT;
  if ((!homing || !P.app) && u.speed < P.vMin) vT = Math.max(vT, P.vMin);
  const v = u.speed > 20 ? u.speed : 20;
  // equivalent airspeed (the air thins with height): what the wing and the drag feel; vc: cruise, at the design height
  const hA = u.pos[1] > 0 ? u.pos[1] : 0;
  if (!(Math.abs(hA - (u._rsH || -1e9)) < 40)) { u._rsH = hA; u._rs = Math.exp(-hA / 18000); }   // sqrt density ratio, per 40 m
  const ve = v * u._rs, vc = F.v * F.rs0;
  // lateral: the bank for the turn rate the heading error asks, rolled out ahead of the heading (no overshoot). The
  // bank he uses: routine turns at the cruise bank (fighters 60 deg, 2 g), the full bank in an attack or a reversal;
  // never more than the wing can lift at this speed (load factor (ve / stall)^2: tan^2 = n^2 - 1; flaps down on the
  // approach), and wings nearly level climbing away from the ship
  const e = angTo(u.hdg, N.want), o0 = u.orders[0];
  let tb = (e > 1.2 || e < -1.2 || (o0 !== undefined && o0.kind === 'attack')) ? P.tanB : P.tanBC;
  const vs = u.landing ? P.vs * .85 : P.vs, nL = (ve / vs) * (ve / vs);
  if (nL * nL - 1 < tb * tb) tb = nL > 1.03 ? Math.sqrt(nL * nL - 1) : .245;
  if (u.aboardOf && u.pos[1] < 300 && sim.t - u.born < 25 && tb > .267) tb = .267;
  const t0 = u._tr === undefined || u._trR !== u.roll ? Math.tan(u.roll) : u._tr;
  const lead = G * t0 / v * (u.roll < 0 ? -u.roll : u.roll) / P.rollRate * .5, oMax = G * tb / v;
  const oW = clamp((e - lead) / 2.5, -oMax, oMax), xT = oW * v / G, bT = Math.atan(xT), dR = P.rollRate * DT;
  let t1;
  if (bT - u.roll > dR) { u.roll += dR; t1 = Math.tan(u.roll); } else if (bT - u.roll < -dR) { u.roll -= dR; t1 = Math.tan(u.roll); } else { u.roll = bT; t1 = xT; }
  u._tr = t1; u._trR = u.roll;
  const t12 = t1 * t1;                                               // load factor n^2 = 1 + tan^2(bank)
  u.hdg += G * t1 / v * DT;
  // energy: parasitic drag (~ ve^2, up to the top speed at full thrust), a turn's induced drag (~ (n^2 - 1) / ve^2), the climb
  const qr = (vc / ve) * (vc / ve), Dt = .035 * G * t12 * qr, Dp = F.aT / (qr * P.topK2);
  // vertical: toward the band, with the feed-forward of a glide slope; the climb the thrust pays for at flying speed
  // (a profile he can stop on: sqrt(2 a h), a descent of at most a fifth of the speed, ~11 deg)
  const vy0 = u.vy || 0, eY = N.yT - u.pos[1], ay = u.speed < vT * .7 ? P.ay * .5 : P.ay, aeY = eY < 0 ? -eY : eY;
  let vyC = (eY > 0 ? 1 : -1) * (aeY > 9.8 * ay ? Math.sqrt(1.2 * ay * aeY) : aeY * .35) + N.vyFF;
  const climb = d.climb || 5, desc = climb * 1.3 < v * .2 ? climb * 1.3 : v * .2;
  vyC = vyC > climb ? climb : vyC < -desc ? -desc : vyC;
  const ex = F.aT - Dp - Dt;
  if (vyC > 0 && u.speed < vT * .9) vyC = Math.min(vyC, Math.max(0, ex * v / G));
  if (vyC > 0 && ve < vs * 1.25) vyC = 0;                          // near the stall: nose down first
  u.vy = vy0 + clamp(vyC - vy0, -ay * DT, ay * DT);
  const gr = u.vy / v, sg = gr > -.5 && gr < .5 ? gr * (1 - .5 * gr * gr) : gr / Math.sqrt(1 + gr * gr);   // sin of the flight path
  // speed: the throttle holds it; at full thrust a climb or a hard turn costs speed, a steep dive adds it
  const up = ex - G * sg, lo = -Dp - (v > 200 ? 4 : 1.2) - Dt - G * sg;
  const aC = clamp((vT - u.speed) / 3, lo, up);
  u.speed = Math.max(0, u.speed + aC * DT);
  if (P.ab) u.ab = sim.t - u.born < 6 || aC + Dp + Dt + G * sg > .62 * F.aT ? 1 : 0;   // past military thrust
  // pitch: flight path + angle of attack (it grows with the load factor and as the dynamic pressure falls)
  const fp = gr > -.4 && gr < .4 ? gr * (1 - gr * gr * (1 / 3 - gr * gr * .2)) : Math.atan(gr);
  u.pitch = fp + clamp(P.aoa * (t12 < .02 ? 1 + .5 * t12 : Math.sqrt(1 + t12)) * qr, -.05, .26);
  const s = Math.sin(u.hdg), c = Math.cos(u.hdg);
  u.pos[0] += s * u.speed * DT; u.pos[2] += c * u.speed * DT; u.pos[1] += u.vy * DT;
  if (u.pos[1] < floor) { u.pos[1] = floor; if (u.vy < 0) u.vy = 0; }
  u.odo += u.speed * DT;
}

/* the catapult: the first tick after the carrier put her on the launch spot (mech.carrierOps) she goes back to the
   shuttle and rides the stroke (deckStep) */
function catStart(sim, u, P) {
  if (!u.aboardOf || u.catFor === u.born || sim.t - u.born > DT * 1.5) return false;
  u.catFor = u.born;
  const cv = sim.units.get(u.aboardOf), C = cv && cv.alive && cv.def.mot && cv.def.mot.cat;
  if (!C || !P.cat) return false;
  const ax = C[0][0], az = C[0][1], bx = C[1][0], bz = C[1][1], len = Math.hypot(bx - ax, bz - az);
  const y = cv.def.air.deckY + .1 + P.gear, dx = (bx - ax) / len, dz = (bz - az) / len;
  u.deck = { cv: cv.id, mode: 'cat', ax, az, dx, dz, len, s: 0, v: 0, a: P.cat * P.cat / (2 * len), hd: Math.atan2(dx, dz), x: ax, y, z: az, px: ax, py: y, pz: az };
  u.roll = 0; u.vy = 0;
  deckPlace(u, cv); u.prev[0] = u.pos[0]; u.prev[1] = u.pos[1]; u.prev[2] = u.pos[2]; u.prevHdg = u.hdg;
  return true;
}

/* the deck's frame: catapult stroke, arrested roll-out, set down and held (waiting for the order to take her aboard) */
function deckStep(sim, u, P) {
  const k = u.deck, cv = sim.units.get(k.cv);
  if (!cv || !cv.alive) { u.deck = null; u.trapped = 0; return; }
  k.px = k.x; k.py = k.y; k.pz = k.z;
  if (k.mode === 'cat') {
    k.v += k.a * DT; k.s = Math.min(k.len, k.s + k.v * DT);
    if (u.type === 'fighter') u.ab = 1;
  } else if (k.mode === 'trap') {
    const v1 = Math.max(0, k.v - k.a * DT); k.s += (k.v + v1) * .5 * DT; k.v = v1;
    if (v1 <= 0) { k.mode = 'held'; u.trapped = cv.id; cv._foulT = sim.t + 8; }
    if (u.type === 'fighter') u.ab = 0;
  } else if (u.landing !== k.cv) {
    // held on deck but no longer ordered aboard this ship: park her; her order will ask for a launch
    u.deck = null; u.trapped = 0; u.aboard = cv.id; u.aboardOf = cv.id; u.speed = 0;
    return;
  }
  if (k.mode !== 'held') { k.x = k.ax + k.dx * k.s; k.z = k.az + k.dz * k.s; }
  deckPlace(u, cv);
  u.speed = cv.speed * Math.cos(k.hd) + k.v; u.vy = 0;
  if (k.mode === 'cat' && k.s >= k.len) {
    // off the end: the stroke's speed plus the ship's, a little sink before she climbs away
    u.deck = null; u.vy = -1.2; u.roll = 0; u.pitch = .06;
  }
}
function deckPlace(u, cv) {
  const k = u.deck, s = Math.sin(cv.hdg), c = Math.cos(cv.hdg);
  u.pos[0] = cv.pos[0] + k.x * c + k.z * s; u.pos[2] = cv.pos[2] - k.x * s + k.z * c; u.pos[1] = cv.pos[1] + k.y;
  u.hdg = cv.hdg + k.hd; u.pitch = cv.pitch; u.roll = cv.roll;
}

/* the carrier approach: to the start of the final 5 km astern on the angled deck's axis, then down the 3.5 deg glide
   slope to the wires (a pursuit point on the moving axis, the slope's sink rate fed forward); at the wires, on the
   line and low: the trap (returns 2); off the line, too high or the deck foul: wave off and go round */
function approach(sim, u, P, cv, N) {
  const T = cv.def.mot.trap, deckY = cv.def.air.deckY, s = Math.sin(cv.hdg), c = Math.cos(cv.hdg);
  const tx = cv.pos[0] + T.td[0] * c + T.td[1] * s, tz = cv.pos[2] - T.td[0] * s + T.td[1] * c, ty = cv.pos[1] + deckY + .1 + P.gear;
  const hA = cv.hdg + T.ang, sa = Math.sin(hA), ca = Math.cos(hA);
  const rx = u.pos[0] - tx, rz = u.pos[2] - tz, along = -(rx * sa + rz * ca), cross = rx * ca - rz * sa;
  const hi = u.pos[1] - ty - Math.max(0, along) * TAN_GS;           // height over the glide slope here
  const inCone = along > 300 && along < 12000 && Math.abs(cross) < 150 + along * .3 && hi < 120 + along * .04 && hi > -60;
  if (u.appr === 1 && (along < -60 || Math.abs(cross) > 400 + along * .5)) u.appr = 0;
  else if (inCone) u.appr = 1;
  if (u.appr === 1) {
    // the pursuit point on the axis, led by where the ship will have taken it by the time she gets there
    const closing = Math.max(5, u.speed - cv.speed * Math.cos(T.ang));
    const la = Math.max(0, along - Math.max(600, u.speed * 8)), tl = (along - la) / closing;
    N.want = Math.atan2(tx - sa * la + s * cv.speed * tl - u.pos[0], tz - ca * la + c * cv.speed * tl - u.pos[2]);
    N.yT = ty + Math.max(0, along) * TAN_GS;
    N.vyFF = -closing * TAN_GS; N.vT = P.app; N.low = along < 2500;
    if (along <= 0) {
      if (Math.abs(cross) < 14 && u.pos[1] - ty < 7 && !(cv._foulT > sim.t)) {
        const vRel = Math.max(15, closing), roll = T.roll || 90;
        u.deck = { cv: cv.id, mode: 'trap', ax: T.td[0], az: T.td[1], dx: Math.sin(T.ang), dz: Math.cos(T.ang), len: roll, s: 0, v: vRel, a: vRel * vRel / (2 * roll), hd: T.ang,
          x: T.td[0], y: deckY + .1 + P.gear, z: T.td[1], px: T.td[0], py: deckY + .1 + P.gear, pz: T.td[1] };
        u.appr = 0; u.roll = 0; cv._foulT = sim.t + 30;
        return 2;
      }
      u.appr = 0;                                                 // bolter / wave-off: full power, climb away
      N.vT = u.def.speed; N.yT = ty + 450;
    }
  } else {
    const ia = 5000;
    N.want = Math.atan2(tx - sa * ia - u.pos[0], tz - ca * ia - u.pos[2]);
    N.yT = ty + ia * TAN_GS + 80; N.vT = P.app * 1.4;
  }
  return 0;
}

/* ------------------------------------------------ helicopters */
/* to the deck spot (mot.spot on the ship, else aft), slowing to hold over it at the ship's speed, then down */
function heliApproach(sim, u, P, cv, N) {
  const sp = (cv.def.mot && cv.def.mot.spot) || [0, -cv.def.size[0] * .38];
  const s = Math.sin(cv.hdg), c = Math.cos(cv.hdg), deckY = cv.def.air ? cv.def.air.deckY : 8;
  const hx = cv.pos[0] + sp[0] * c + sp[1] * s, hz = cv.pos[2] - sp[0] * s + sp[1] * c, hy = cv.pos[1] + deckY + P.gear;
  const dx = hx - u.pos[0], dz = hz - u.pos[2], dist = Math.hypot(dx, dz);
  N.want = Math.atan2(dx, dz);
  N.vT = Math.min(u.def.speed, cv.speed + Math.sqrt(2 * 1.6 * Math.max(0, dist - 30)));
  N.yT = hy + 20 + Math.min(80, dist * .04);
  if (dist > 150) return false;
  N.hold = true; N.hx = hx; N.hz = hz; N.hvx = Math.sin(cv.hdg) * cv.speed; N.hvz = Math.cos(cv.hdg) * cv.speed; N.hh = cv.hdg;
  N.yT = hy + 12;
  const rvx = (u.hvx || 0) - N.hvx, rvz = (u.hvz || 0) - N.hvz;
  if (dist < 5 && rvx * rvx + rvz * rvz < 2.5 && Math.abs(angTo(u.hdg, cv.hdg)) < .25) { N.down = true; N.yT = hy; }
  if (u.pos[1] - hy < .35 && N.down) {
    // on the deck: held there in the ship's frame until her order takes her aboard
    const lx = (u.pos[0] - cv.pos[0]) * c - (u.pos[2] - cv.pos[2]) * s, lz = (u.pos[0] - cv.pos[0]) * s + (u.pos[2] - cv.pos[2]) * c, ly = deckY + P.gear;
    u.deck = { cv: cv.id, mode: 'held', ax: lx, az: lz, dx: 0, dz: 1, len: 0, s: 0, v: 0, a: 0, hd: wrapPi(u.hdg - cv.hdg), x: lx, y: ly, z: lz, px: lx, py: ly, pz: lz };
    u.trapped = cv.id; u.hvx = N.hvx; u.hvz = N.hvz;
  }
  return true;
}

function heli(sim, u, P, N, floor) {
  const d = u.def, t = sim.t;
  if (u._hb !== u.born || u.hvx === undefined) { u._hb = u.born; u.hvx = Math.sin(u.hdg) * u.speed; u.hvz = Math.cos(u.hdg) * u.speed; }
  if (u.deck) return;
  let cx, cz, hT;
  if (N.hold) {
    // station on the moving deck spot
    const ex = N.hx - u.pos[0], ez = N.hz - u.pos[2];
    cx = N.hvx + clamp(ex * .35, -8, 8); cz = N.hvz + clamp(ez * .35, -8, 8); hT = N.hh;
  } else {
    cx = Math.sin(N.want) * N.vT; cz = Math.cos(N.want) * N.vT; hT = N.want;
    if (N.vT < 3) {
      // the hover: she wanders a metre or two with the gusts
      const ph = u.id * 1.7;
      cx += .5 * Math.sin(t * .23 + ph) + .3 * Math.sin(t * .61 + ph * 2); cz += .5 * Math.cos(t * .19 + ph) + .3 * Math.sin(t * .47 + ph * 3);
    }
  }
  // lifting off a deck: straight up before she noses over
  const young = t - u.born < 12 && u.pos[1] - floor < 20;
  if (young) { const l = Math.hypot(cx, cz), m = u.speed + 1.5; if (l > m) { cx *= m / l; cz *= m / l; } }
  let ax = (cx - u.hvx) / 2.5, az = (cz - u.hvz) / 2.5;
  const al = Math.hypot(ax, az), am = d.accel || 3;
  if (al > am) { ax *= am / al; az *= am / al; }
  u.hvx += ax * DT; u.hvz += az * DT;
  const V = Math.hypot(u.hvx, u.hvz);
  // heading: along the flight path at speed, else toward the wanted heading (pedal turn)
  if (V > 12 && !N.hold) hT = Math.atan2(u.hvx, u.hvz);
  u.hdg += clamp(angTo(u.hdg, hT) * .8, -P.yawRate * DT, P.yawRate * DT);
  // the rotor tilt: forward to accelerate and to hold speed against drag, back to flare; into the lateral acceleration
  const s = Math.sin(u.hdg), c = Math.cos(u.hdg), dr = 1.75e-4 * V;
  const af = ax * s + az * c + dr * (u.hvx * s + u.hvz * c), ar = ax * c - az * s;
  const k = Math.min(1, DT * 3);
  u.pitch += (clamp(-Math.atan(af / G), -.35, .3) - u.pitch) * k;
  u.roll += (clamp(Math.atan(ar / G), -.55, .55) - u.roll) * k;
  u.speed = V;
  u.pos[0] += u.hvx * DT; u.pos[2] += u.hvz * DT;
  // vertical: climb 8 m/s, down gently over a deck
  const vy0 = u.vy || 0;
  const vyC = N.down ? Math.max(-1.3, (N.yT - u.pos[1]) * .6) : clamp((N.yT - u.pos[1]) * .5, -6, young ? 4 : d.climb || 8);
  u.vy = vy0 + clamp(vyC - vy0, -2 * DT, 2 * DT);
  u.pos[1] += u.vy * DT;
  if (u.pos[1] < floor) { u.pos[1] = floor; if (u.vy < 0) u.vy = 0; }
  u.odo += V * DT;
}

/* orders.return asks: is she aboard now? (trapped on the wires or set down on the spot) */
export function onDeck(sim, u, home, dist) {
  if (u.trapped === home.id) { u.trapped = 0; u.deck = null; u.appr = 0; u.vy = 0; return true; }
  const P = airP(u.def);
  if (P.heli || (home.def.mot && home.def.mot.trap && P.app)) return false;
  return dist < 1500 && u.pos[1] < home.pos[1] + 400;             // no deck model for this pair: as before
}

/* ================================================================== separation */
const SEP = { land: { gap: 5, soft: 3, win: 90 }, sea: { gap: 110, soft: 3.2, win: 3000 } }, SEP_EVERY = 4;
function massOf(u) {
  const m = u.def.mot && u.def.mot.mass;
  const k = m || u.def.size[0] * u.def.size[1] * (u.def.domain === 'sea' ? 12 : 1);
  return (u.speed < .1 && !u.path) || u.def.static ? k * 20 : k;
}
function okAt(sim, u, x, z) {
  const h = sim.map.h(x, z);
  if (u.def.domain === 'land') return h >= .3;
  if (u.def.sub) return h <= -u.def.sub.water;
  return h <= -((u.def.draught || 5) + 1.5);
}
/* the per-sim lists by domain, kept sorted by x from one pass to the next (insertion sort: nearly sorted already) */
function lists(sim) {
  let S = sim._sep;
  if (!S) S = sim._sep = { land: [], sea: [], air: [], stamp: 0 };
  const stamp = ++S.stamp, list = sim.list();
  for (let i = 0; i < list.length; i++) {
    const u = list[i];
    u.avH = 0; u.avS = 1;
    let g = null;
    if (u.alive && !u.aboard && !u.dockT && !u.def.hover) {
      const dom = u.def.domain;
      if (dom === 'air') { if (!u.deck) g = 'air'; else u.sepY = 0; }
      else if (SEP[dom] && !(u.def.sub && submerged(u))) g = dom;
    }
    u._sepG = g; u._sepS = stamp;
  }
  for (const g of ['land', 'sea', 'air']) {
    const A = S[g];
    let w = 0;
    for (let i = 0; i < A.length; i++) { const u = A[i]; if (u._sepS === stamp && u._sepG === g) { A[w++] = u; u._sepG = null; } }
    A.length = w;
  }
  for (let i = 0; i < list.length; i++) { const u = list[i]; if (u._sepS === stamp && u._sepG) { S[u._sepG].push(u); u._sepG = null; } }
  for (const g of ['land', 'sea', 'air']) {
    const A = S[g];
    for (let i = 1; i < A.length; i++) { const u = A[i], x = u.pos[0]; let j = i - 1; while (j >= 0 && A[j].pos[0] > x) { A[j + 1] = A[j]; j--; } A[j + 1] = u; }
  }
  return S;
}

export function separate(sim) {
  if (sim.tick % SEP_EVERY) return;                               // every 0.2 s: the steering holds in between
  const L = lists(sim);
  for (const dom of ['land', 'sea']) {
    const SA = L[dom], n = SA.length, S = SEP[dom];
    for (let i = 0; i < n; i++) {
      const a = SA[i], stillA = !a.path && a.speed < .1;
      const ha = Math.max(0, a.def.size[0] - a.def.size[1]) * .5, ra = a.def.size[1] * .5;
      let fax = 0, faz = 0, fa = false;
      for (let j = i + 1; j < n; j++) {
        const b = SA[j];
        if (b.pos[0] - a.pos[0] > S.win) break;
        if (stillA && !b.path && b.speed < .1) continue;           // two parked: nothing to do
        const hb = Math.max(0, b.def.size[0] - b.def.size[1]) * .5, rb = b.def.size[1] * .5;
        const reach = ha + hb + ra + rb + S.gap * S.soft;
        const rx = a.pos[0] - b.pos[0], rz = a.pos[2] - b.pos[2], r2 = rx * rx + rz * rz;
        if (dom === 'sea' && r2 < S.win * S.win) cpa(a, b, rx, rz, ha + hb + ra + rb);
        if (r2 > reach * reach) continue;
        if (!fa) { fax = Math.sin(a.hdg); faz = Math.cos(a.hdg); fa = true; }
        // closest points of the two hull axes
        const fbx = Math.sin(b.hdg), fbz = Math.cos(b.hdg), bb = fax * fbx + faz * fbz, cc = fax * rx + faz * rz, ff = fbx * rx + fbz * rz;
        const den = 1 - bb * bb;
        let s = den > 1e-6 ? clamp((bb * ff - cc) / den, -ha, ha) : 0;
        const tt = clamp(ff + s * bb, -hb, hb);
        s = clamp(tt * bb - cc, -ha, ha);
        const px = rx + fax * s - fbx * tt, pz = rz + faz * s - fbz * tt;          // from b's point to a's point
        const dd = Math.sqrt(px * px + pz * pz) || 1e-3, gapNow = dd - ra - rb;
        if (gapNow > S.gap * S.soft) continue;
        const nx = px / dd, nz = pz / dd;
        const q = clamp(1 - (gapNow - S.gap * .5) / (S.gap * S.soft - S.gap * .5), 0, 1);
        giveWay(a, b, -nx, -nz, q, dom);
        giveWay(b, a, nx, nz, q, dom);
        crowd(a, b, S); crowd(b, a, S);
        // overlap (never let hulls or bodies pass through each other): push apart, the lighter one more
        const pen = S.gap * .3 - gapNow;
        if (pen > 0) {
          const ma = massOf(a), mb = massOf(b), ka = mb / (ma + mb), kb = ma / (ma + mb);
          const ax = a.pos[0] + nx * pen * ka, az = a.pos[2] + nz * pen * ka, bx = b.pos[0] - nx * pen * kb, bz = b.pos[2] - nz * pen * kb;
          if (!a.def.static && okAt(sim, a, ax, az)) { a.pos[0] = ax; a.pos[2] = az; }
          if (!b.def.static && okAt(sim, b, bx, bz)) { b.pos[0] = bx; b.pos[2] = bz; }
        }
      }
    }
    for (let i = 0; i < n; i++) { const u = SA[i]; if (u.avH > 1.1) u.avH = 1.1; else if (u.avH < -1.1) u.avH = -1.1; }
  }
  separateAir(L.air);
}

/* ships look ahead, as the rules of the road ask: on courses that would pass inside a real clearance (60 % of their
   hull spans plus 300 m, centre to centre) within two and a half minutes, both give way early (to starboard meeting or
   crossing), the harder the nearer that moment and the closer the pass */
function cpa(a, b, rx, rz, span) {
  if (!a.path && !b.path) return;
  const wx = Math.sin(a.hdg) * a.speed - Math.sin(b.hdg) * b.speed, wz = Math.cos(a.hdg) * a.speed - Math.cos(b.hdg) * b.speed;
  const w2 = wx * wx + wz * wz;
  if (w2 < .25) return;
  const tc = -(rx * wx + rz * wz) / w2;
  if (tc <= 0 || tc > 150) return;
  const cx = rx + wx * tc, cz = rz + wz * tc, dc = Math.sqrt(cx * cx + cz * cz), clr = span * .6 + 300;
  if (dc > clr) return;
  const q = (1 - dc / clr) * Math.min(1, 1.3 - tc / 150);
  giveWay(a, b, -rx, -rz, q, 'sea'); giveWay(b, a, rx, rz, q, 'sea');
}

/* u has o toward (dx, dz): if o is ahead of her she gives way (ships: to starboard crossing or meeting, otherwise away
   from it; vehicles away from it) and slows the closer and the more ahead it is */
function giveWay(u, o, dx, dz, q, dom) {
  if (!u.path || q <= 0) return;
  const beta = angTo(u.hdg, Math.atan2(dx, dz)), ab = Math.abs(beta);
  if (ab > 1.75) return;                                         // o is abaft her beam: o gives way
  const side = beta >= 0 ? 1 : -1;
  if (dom === 'sea') {
    const crossing = o.speed > 1 && Math.abs(angTo(u.hdg, o.hdg)) > .5;
    u.avH += (crossing ? .7 : -.7 * side) * q;
    if (ab < .8) u.avS = Math.min(u.avS, 1 - .8 * q);
  } else {
    u.avH -= side * .9 * q;
    if (ab < .9) u.avS = Math.min(u.avS, Math.max(0, 1 - 1.15 * q));
  }
}
/* her goal is taken: o is stopped on it: she stops short, beside it */
function crowd(u, o, S) {
  if (!u.path || u.wi < u.path.length - 1 || o.path || o.speed > .3 || !u.goal) return;
  const gx = u.goal[0], gz = u.goal[1], r = S.gap * S.soft;
  const du = Math.hypot(gx - u.pos[0], gz - u.pos[2]), dO = Math.hypot(gx - o.pos[0], gz - o.pos[2]);
  if (dO < o.def.size[0] * .5 + r && du < dO + u.def.size[0] + r) u.path = null;
}

/* aircraft: where two paths cross within 350 m and 150 m of height, the later one climbs 150 m over the other */
function separateAir(AA) {
  const n = AA.length;
  for (let i = 0; i < n; i++) { const u = AA[i]; u._sepW = 0; }
  for (let i = 0; i < n; i++) {
    const a = AA[i];
    for (let j = i + 1; j < n; j++) {
      const b = AA[j];
      if (b.pos[0] - a.pos[0] > 400) break;
      const dz = b.pos[2] - a.pos[2], dy = b.pos[1] - a.pos[1];
      if (dz > 400 || dz < -400 || dy > 160 || dy < -160) continue;
      if (a.landing && a.appr === 1 || b.landing && b.appr === 1) continue;
      const hi = a.id > b.id ? a : b;
      hi._sepW = 1;
    }
  }
  for (let i = 0; i < n; i++) {
    const u = AA[i], s = u.sepY || 0;
    u.sepY = u._sepW ? Math.min(160, s + 6 * DT * SEP_EVERY) : Math.max(0, s - 2 * DT * SEP_EVERY);
  }
}
