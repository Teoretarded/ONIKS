/* Tests for the motion physics (sim/dynamics.js, sim/sea.js, the sinking in damage.js), run by tests.js:
   physicsTests({ test, run, ok, fmt, map }) */
import { Sim, DT } from './sim.js';
import { UNITS } from '../data/units.js';
import { applyDamage } from './damage.js';
import { swellOf, seaAt, hullMotion, hullOf } from './sea.js';

const KN = .5144;

/* a flat plain to the west of x = 0, a ramp rising east of it (grade g), for the vehicle tests */
function rampMap(g) {
  const W = 40000, H = 40000;
  const h = (x, z) => 20 + (x > 0 ? x * g : 0);
  return {
    id: 'ramp', name: 'Ramp', W, H, cell: 200, h, water: () => false, slope: (x, z) => x > 0 ? g : 0,
    roads: [], objectives: [], places: [],
    spawns: { coast: { x: -5000, z: 0, r: 1000, hdg: 0 }, fleet: { x: -15000, z: 0, r: 1000, hdg: 0 } },
    replenish: { x: -15000, z: 0, r: 10 }, weather: { kind: 'calm', wind: [0, 0], sea: .1 }, time: 'night',
  };
}
const hullGap = (a, b) => {
  // distance between the two hull axes (capsules) minus their half beams
  const ha = Math.max(0, a.def.size[0] - a.def.size[1]) / 2, hb = Math.max(0, b.def.size[0] - b.def.size[1]) / 2;
  let best = 1e9;
  for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) {
    const sa = -ha + 2 * ha * i / 8, sb = -hb + 2 * hb * j / 8;
    const ax = a.pos[0] + Math.sin(a.hdg) * sa, az = a.pos[2] + Math.cos(a.hdg) * sa, bx = b.pos[0] + Math.sin(b.hdg) * sb, bz = b.pos[2] + Math.cos(b.hdg) * sb;
    best = Math.min(best, Math.hypot(ax - bx, az - bz));
  }
  return best - a.def.size[1] / 2 - b.def.size[1] / 2;
};

export async function physicsTests({ test, run, ok, fmt, map }) {
  await test('physics: ships gather way over minutes (DDG ~3 min to 28 kn, the carrier longer)', async () => {
    const sim = new Sim(map(), { seed: 3, fog: false });
    const ddg = sim.spawn('ddg', 'fleet', -52000, -30000, { hdg: 0 }), cv = sim.spawn('carrier', 'fleet', -40000, -30000, { hdg: 0 });
    sim.order([ddg.id], { kind: 'move', x: -52000, z: 30000 });
    sim.order([cv.id], { kind: 'move', x: -40000, z: 30000 });
    let tD = 0, tC = 0, v60 = 0;
    await run(sim, 20 * 900, s => {
      if (!tD && ddg.speed >= 28 * KN) tD = s.t;
      if (!tC && cv.speed >= 28 * KN) tC = s.t;
      if (Math.abs(s.t - 60) < DT / 2) v60 = ddg.speed;
      return tD && tC;
    });
    ok(tD > 90 && tD < 300, `DDG took ${fmt(tD)} s to 28 kn (want 1.5-5 min)`);
    ok(tC > tD * 1.5, `carrier ${fmt(tC)} s vs DDG ${fmt(tD)} s: the carrier should answer slowest`);
    ok(v60 > 5 && v60 < 14, `DDG at 60 s: ${fmt(v60 / KN)} kn`);
    return `28 kn: DDG ${fmt(tD / 60, 1)} min (${fmt(v60 / KN)} kn at 1 min), CVN ${fmt(tC / 60, 1)} min`;
  });

  await test('physics: turning circles by ship length, heel out of the turn, speed lost in it', async () => {
    const out = {};
    for (const type of ['ddg', 'carrier']) {
      const sim = new Sim(map(), { seed: 5, fog: false });
      const u = sim.spawn(type, 'fleet', -50000, -38000, { hdg: 0 });
      u.speed = 30 * KN;
      sim.order([u.id], { kind: 'move', x: -50000, z: 38000 });
      await run(sim, 20 * 30);
      // hard over: a point well astern
      const x0 = u.pos[0], v0 = u.speed;
      sim.order([u.id], { kind: 'move', x: -50000, z: -60000 });
      let maxOff = 0, heelOut = 0, heelIn = 0, vMin = 1e9, t180 = 0, badSign = 0, turning = 0;
      const t0 = sim.t;
      await run(sim, 20 * 900, s => {
        maxOff = Math.max(maxOff, Math.abs(u.pos[0] - x0));
        const r = u.yawR || 0;
        if (Math.abs(r) > .6 * u.speed / (UNITS[type].mot.td * UNITS[type].size[0] / 2) && s.t - t0 > 25) {
          turning++;
          if (u.roll * r > 0) badSign++;                  // outward heel: roll opposite to the yaw rate
          heelOut = Math.max(heelOut, Math.abs(u.roll));
        }
        if (s.t - t0 < 6 && u.roll * r > 0) heelIn = Math.max(heelIn, Math.abs(u.roll));
        vMin = Math.min(vMin, u.speed);
        if (!t180 && Math.cos(u.hdg) < -.999) t180 = s.t - t0;
        return t180 > 0;
      });
      out[type] = { td: maxOff / UNITS[type].size[0], heel: heelOut, heelIn, loss: 1 - vMin / v0, t180, bad: badSign / Math.max(1, turning) };
    }
    const D = out.ddg, C = out.carrier;
    ok(D.td > 2.6 && D.td < 5, `DDG tactical diameter ${fmt(D.td, 2)} lengths (want ~3-4.5)`);
    ok(C.td > 3.5 && C.td < 6.5, `CVN tactical diameter ${fmt(C.td, 2)} lengths (want ~4-6)`);
    ok(C.td * UNITS.carrier.size[0] > 2 * D.td * UNITS.ddg.size[0], 'the carrier turns in a much wider circle');
    ok(D.heel > .05 && D.heel < .25, `DDG heel ${fmt(D.heel * 57.3)} deg (want 3-14)`);
    ok(D.bad < .1, `DDG heeled into the turn ${fmt(D.bad * 100)} % of the steady turn`);
    ok(C.heel < D.heel * 1.2 && C.heel > .02, `CVN heel ${fmt(C.heel * 57.3)} deg`);
    ok(D.loss > .15 && D.loss < .55, `DDG lost ${fmt(D.loss * 100)} % of her speed in the turn (want 15-55)`);
    return `tactical diameter DDG ${fmt(D.td, 2)} L (${fmt(D.td * 155 / 1000, 2)} km), CVN ${fmt(C.td, 2)} L (${fmt(C.td * 332.8 / 1000, 2)} km) · heel out DDG ${fmt(D.heel * 57.3)} deg (in first ${fmt(D.heelIn * 57.3, 1)} deg), CVN ${fmt(C.heel * 57.3)} deg · speed lost DDG ${fmt(D.loss * 100)} %, CVN ${fmt(C.loss * 100)} % · 180 deg in DDG ${fmt(D.t180)} s, CVN ${fmt(C.t180)} s`;
  });

  await test('physics: trucks crawl up grades, turn on their circle (never pivot), springs', async () => {
    const res = {};
    for (const g of [0, .2]) {
      const sim = new Sim(rampMap(g), { seed: 1, fog: false });
      const tel = sim.spawn('tel', 'coast', -3000, 0, { hdg: Math.PI / 2 });
      sim.order([tel.id], { kind: 'move', x: 2500, z: 0 });
      let vFlat = 0, vRamp = 0, n = 0, pitchMax = 0;
      await run(sim, 20 * 1200, s => {
        if (tel.pos[0] < -500 && tel.pos[0] > -2000) vFlat = Math.max(vFlat, tel.speed);
        if (tel.pos[0] > 600 && tel.pos[0] < 2000) { vRamp += tel.speed; n++; }
        pitchMax = Math.max(pitchMax, Math.abs(tel.sp || 0));
        return !tel.path && tel.pos[0] > 2000;
      });
      res[g] = { vFlat, vRamp: vRamp / Math.max(1, n), pitchMax };
    }
    ok(res[0].vFlat > 7 && res[0].vFlat <= UNITS.tel.speed + .01, `flat off-road ${fmt(res[0].vFlat)} m/s`);
    ok(res[.2].vRamp > 1.8 && res[.2].vRamp < 4.5, `20 % grade ${fmt(res[.2].vRamp)} m/s (want ~3: power against weight)`);
    ok(res[0].pitchMax > .005, 'the body does not sit back under power');
    // turning: a point behind her; the path's radius never tighter than the turning circle, she keeps moving round it
    const sim = new Sim(rampMap(0), { seed: 1, fog: false });
    const tel = sim.spawn('tel', 'coast', -8000, 0, { hdg: 0 });
    sim.order([tel.id], { kind: 'move', x: -8000, z: -150 });
    let rMin = 1e9, pivot = 0, prev = [tel.pos[0], tel.pos[2], tel.hdg];
    await run(sim, 20 * 300, () => {
      const ds = Math.hypot(tel.pos[0] - prev[0], tel.pos[2] - prev[1]), dh = Math.abs(tel.hdg - prev[2]);
      if (dh > 1e-5) { if (ds < 1e-4) pivot++; else rMin = Math.min(rMin, ds / dh); }
      prev = [tel.pos[0], tel.pos[2], tel.hdg];
      return !tel.path && tel.speed === 0;
    });
    ok(pivot === 0, `turned on the spot ${pivot} ticks`);
    ok(rMin > UNITS.tel.mot.turnR * .95, `tightest radius ${fmt(rMin)} m (turning circle ${UNITS.tel.mot.turnR} m)`);
    ok(Math.hypot(tel.pos[0] + 8000, tel.pos[2] + 150) < 40, `ended ${fmt(Math.hypot(tel.pos[0] + 8000, tel.pos[2] + 150))} m from the point behind her`);
    return `off-road flat ${fmt(res[0].vFlat)} m/s · 20 % grade ${fmt(res[.2].vRamp)} m/s · body pitch under power ${fmt(res[0].pitchMax * 57.3, 2)} deg · point 150 m astern: tightest radius ${fmt(rMin)} m, no pivot`;
  });

  await test('physics: aircraft bank to turn within their limits and pay for hard turns in speed', async () => {
    const sim = new Sim(map(), { seed: 2, fog: false });
    const f = sim.spawn('fighter', 'fleet', -40000, -20000, { hdg: 0, alt: 6000 });
    f.speed = 250;
    sim.order([f.id], { kind: 'move', x: -40000, z: 20000 });
    await run(sim, 20 * 20);
    const v0 = f.speed;
    sim.order([f.id], { kind: 'move', x: -40000, z: -60000 });               // reverse course
    let bankMax = 0, vMin = 1e9, rateErr = 0, prevH = f.hdg, t180 = 0;
    const t0 = sim.t;
    await run(sim, 20 * 120, s => {
      bankMax = Math.max(bankMax, Math.abs(f.roll));
      vMin = Math.min(vMin, f.speed);
      const w = angle(f.hdg - prevH) / DT; prevH = f.hdg;
      if (Math.abs(f.roll) > .3) rateErr = Math.max(rateErr, Math.abs(w - 9.81 * Math.tan(f.roll) / Math.max(20, f.speed)) / Math.abs(w));
      if (!t180 && Math.cos(f.hdg) < -.99) t180 = s.t - t0;
      return t180 > 0 && s.t - t0 > t180 + 20;
    });
    ok(bankMax <= UNITS.fighter.mot.bank + 1e-6 && bankMax > .9, `bank ${fmt(bankMax * 57.3)} deg (limit ${fmt(UNITS.fighter.mot.bank * 57.3)})`);
    ok(rateErr < .2, `turn rate off g tan(bank) / v by ${fmt(rateErr * 100)} %`);
    ok(vMin < v0 - 8, `kept ${fmt(vMin)} m/s of ${fmt(v0)} through a ${fmt(1 / Math.cos(bankMax), 1)} g turn: a hard turn costs energy`);
    ok(t180 > 10 && t180 < 60, `180 deg in ${fmt(t180)} s`);
    return `180 deg in ${fmt(t180)} s at up to ${fmt(bankMax * 57.3)} deg bank (${fmt(1 / Math.cos(bankMax), 1)} g) · speed ${fmt(v0)} -> ${fmt(vMin)} m/s · turn rate = g tan(bank)/v within ${fmt(rateErr * 100)} %`;
  });

  await test('physics: catapult launch, approach and arrested landing on the carrier; a helicopter sets down on a DDG', async () => {
    const sim = new Sim(map(), { seed: 11, fog: false });
    const cv = sim.spawn('carrier', 'fleet', -45000, -20000, { hdg: 0 });
    const ddg = sim.spawn('ddg', 'fleet', -52000, -20000, { hdg: 0 });
    const f = sim.spawn('fighter', 'fleet', cv.pos[0], cv.pos[2], { aboard: cv.id });
    const h = sim.spawn('helo', 'fleet', ddg.pos[0], ddg.pos[2], { aboard: ddg.id });
    sim.order([cv.id], { kind: 'move', x: -45000, z: 40000 });
    sim.order([ddg.id], { kind: 'move', x: -52000, z: 40000 });
    await run(sim, 20 * 120);
    sim.order([f.id], { kind: 'move', x: -30000, z: 0 });
    sim.order([h.id], { kind: 'move', x: -56000, z: -14000 });
    // the stroke
    let cat = null, strokeT = 0, vEnd = 0;
    await run(sim, 20 * 60, () => {
      if (f.deck && f.deck.mode === 'cat') { cat = f.deck; strokeT += DT; vEnd = f.deck.v; }
      return cat && !f.deck;
    });
    ok(cat, 'no catapult stroke');
    ok(strokeT > 1.8 && strokeT < 3.5 && vEnd > 70, `stroke ${fmt(strokeT, 2)} s to ${fmt(vEnd)} m/s (C-13: ~2.5 s to ~75 m/s)`);
    await run(sim, 20 * 90);
    sim.order([f.id], { kind: 'return' });
    sim.order([h.id], { kind: 'return' });
    let trap = null, trapV = 0, trapS = 0, landF = 0, landH = 0, hLow = 1e9, onGlide = 0, gsErr = 0;
    await run(sim, 20 * 1500, s => {
      for (const e of s.drainEvents()) if (e.type === 'land') { if (e.unit === f.id) landF = s.t; if (e.unit === h.id) landH = s.t; }
      if (f.deck && f.deck.mode === 'trap') { if (!trap) { trap = f.deck; trapV = f.deck.v; } trapS = f.deck.s; }
      if (f.appr === 1 && !f.deck) {
        // on final: height over the deck against the glide slope at this range
        const T = cv.def.mot.trap, c = Math.cos(cv.hdg), sn = Math.sin(cv.hdg), tx = cv.pos[0] + T.td[0] * c + T.td[1] * sn, tz = cv.pos[2] - T.td[0] * sn + T.td[1] * c;
        const along = Math.hypot(f.pos[0] - tx, f.pos[2] - tz);
        if (along > 400 && along < 2500) { onGlide++; gsErr = Math.max(gsErr, Math.abs(f.pos[1] - (cv.pos[1] + 19.6 + along * Math.tan(3.5 * Math.PI / 180)))); }
      }
      if (!h.aboard && h.landing) hLow = Math.min(hLow, Math.hypot((h.hvx || 0) - Math.sin(ddg.hdg) * ddg.speed, (h.hvz || 0) - Math.cos(ddg.hdg) * ddg.speed) + (h.pos[1] - ddg.pos[1] - 8 < 3 ? 0 : 100));
      return landF && landH;
    });
    ok(landF, 'the fighter never landed');
    ok(trap && trapV > 40 && trapV < 70, `engaged the wires at ${fmt(trapV)} m/s over the deck`);
    ok(Math.abs(trapS - cv.def.mot.trap.roll) < 5, `rolled out ${fmt(trapS)} m`);
    ok(onGlide > 20 && gsErr < 40, `glide slope: ${onGlide} ticks on final, worst ${fmt(gsErr)} m off the 3.5 deg line`);
    ok(landH && hLow < 1.5, `helicopter: landed ${!!landH}, closing speed over the deck at touchdown ${fmt(hLow, 2)} m/s`);
    return `catapult ${fmt(strokeT, 2)} s to ${fmt(vEnd)} m/s · wires at ${fmt(trapV)} m/s, ${fmt(trapS)} m roll-out (${fmt(trapV * trapV / (2 * trapS) / 9.81, 1)} g) · on the glide slope within ${fmt(gsErr, 2)} m · fighter aboard ${fmt((landF - 210) / 60, 1)} min after the order · MH-60R on the DDG at ${fmt(hLow, 2)} m/s`;
  });

  await test('physics: units keep clear of each other (ships meeting head-on both alter to starboard, trucks never overlap)', async () => {
    const sim = new Sim(map(), { seed: 21, fog: false });
    const a = sim.spawn('ddg', 'fleet', -50000, -6000, { hdg: 0 }), b = sim.spawn('ddg', 'fleet', -50000, 6000, { hdg: Math.PI });
    a.speed = b.speed = 12;
    sim.order([a.id], { kind: 'move', x: -50000, z: 16000 });
    sim.order([b.id], { kind: 'move', x: -50000, z: -16000 });
    let gapMin = 1e9, ax = 0, bx = 0;
    await run(sim, 20 * 1200, () => {
      gapMin = Math.min(gapMin, hullGap(a, b));
      if (Math.abs(a.pos[2] - b.pos[2]) < 400) { ax = a.pos[0] + 50000; bx = b.pos[0] + 50000; }
      return !a.path && !b.path;
    });
    ok(gapMin > 60, `the destroyers came within ${fmt(gapMin)} m hull to hull`);
    ok(ax > 0 && bx < 0, `abeam: north-bound ${fmt(ax)} m east, south-bound ${fmt(bx)} m (both should have turned to starboard)`);
    // five trucks told to the same point
    const s2 = new Sim(rampMap(0), { seed: 1, fog: false });
    const T = [];
    for (let i = 0; i < 5; i++) T.push(s2.spawn('tel', 'coast', -9000 + i * 40, -600 - i * 30, { hdg: 0 }));
    for (const t of T) s2.order([t.id], { kind: 'move', x: -8900, z: 0 });
    let over = 1e9;
    await run(s2, 20 * 400, () => {
      for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) over = Math.min(over, hullGap(T[i], T[j]));
      return T.every(t => !t.path && t.speed === 0);
    });
    ok(over > -.5, `trucks overlapped by ${fmt(-over, 2)} m`);
    const spread = Math.max(...T.map(t => Math.hypot(t.pos[0] + 8900, t.pos[2])));
    ok(spread < 120, `they stopped up to ${fmt(spread)} m from the point`);
    return `DDGs meeting: closest ${fmt(gapMin)} m hull to hull, passing ${fmt(ax)} / ${fmt(bx)} m either side · 5 TELs to one point: closest ${fmt(over, 1)} m, all within ${fmt(spread)} m of it`;
  });

  await test('physics: a ship hit on the starboard bow lists to starboard, goes down by the bow; a wreck slides off a steep slope', async () => {
    const sim = new Sim(map(), { seed: 8, fog: false });
    const u = sim.spawn('ddg', 'fleet', -50000, 0, { hdg: 0 });
    // a hit on the starboard bow, as weapons.js reports it, then the killing damage
    const p = [u.pos[0] + 9, 4, u.pos[2] + 55];
    sim.emit('hit', { pos: p, target: u.id, kind: 'oniks', side: 'coast' });
    applyDamage(sim, u, u.hp * .6, null);
    let listA = 0;
    await run(sim, 20 * 30, () => { listA = Math.max(listA, u.list || 0); });
    ok(u.alive && listA > .02, `afloat and hit: list ${fmt(listA * 57.3, 1)} deg (want a few degrees to starboard)`);
    sim.emit('hit', { pos: p, target: u.id, kind: 'oniks', side: 'coast' });
    applyDamage(sim, u, u.hp + 40, null);
    ok(!u.alive, 'not sunk');
    let roll = 0, pitch = 0, yEnd = 0, gone = false;
    await run(sim, 20 * 70, () => {
      if (!sim.units.has(u.id)) { gone = true; return true; }
      if (u.dying < .5) { roll = Math.max(roll, u.roll); pitch = Math.min(pitch, u.pitch); }
      yEnd = u.pos[1];
    });
    ok(roll > .05, `listed ${fmt(roll * 57.3)} deg to starboard while settling`);
    ok(pitch < -.02, `trim ${fmt(pitch * 57.3, 1)} deg (want down by the bow)`);
    ok(yEnd < -45 && gone, `went under: ${fmt(yEnd)} m, removed ${gone}`);
    // a burnt-out truck on a 60 % slope slides down it; on the flat it stays
    const s2 = new Sim(rampMap(.6), { seed: 1, fog: false });
    const t1 = s2.spawn('tel', 'coast', 2000, 0, { hdg: 0 }), t2 = s2.spawn('tel', 'coast', -3000, 0, { hdg: 0 });
    applyDamage(s2, t1, 999, null); applyDamage(s2, t2, 999, null);
    await run(s2, 20 * 15);
    ok(t1.pos[0] < 1990 && Math.abs(t2.pos[0] + 3000) < .01, `wreck on the slope moved ${fmt(2000 - t1.pos[0])} m downhill, on the flat ${fmt(Math.abs(t2.pos[0] + 3000), 2)} m`);
    ok(Math.abs(t1.settle - .4) < 1e-6, 'the wreck did not settle on its axles');
    return `hit, afloat: list ${fmt(listA * 57.3, 1)} deg · sinking: list ${fmt(roll * 57.3)} deg to starboard, ${fmt(-pitch * 57.3, 1)} deg by the bow, down to ${fmt(yEnd)} m · wreck slid ${fmt(2000 - t1.pos[0])} m down a 60 % slope`;
  });

  await test('physics: hulls ride the shared swell (long waves followed, short ones averaged, a carrier steadier than a destroyer)', () => {
    const sw = swellOf({ wind: [3, -2], sea: .5 }), W = sw.waves;
    ok(W.length === 4 && sw.amp > 1, 'swell trains');
    // a point hull with short natural periods follows the surface exactly
    const pt = { L: .5, B: .5, Th: .05, Tr: .05, zh: .5, zr: .5 }, o = { heave: 0, pitch: 0, roll: 0 };
    let e = 0;
    for (let t = 0; t < 60; t += 1.3) { hullMotion(W, sw.amp, 100, 200, 0, 0, 0, pt, t, o); e = Math.max(e, Math.abs(o.heave - seaAt(W, sw.amp, 100, 200, t))); }
    ok(e < .02, `a point hull is ${fmt(e, 3)} m off the surface`);
    // rms roll beam-on to the main train, over two minutes: the carrier rolls far less than the destroyer
    const rms = (def, hdg) => { let s = 0, n = 0; for (let t = 0; t < 120; t += .5) { hullMotion(W, sw.amp, 0, 0, hdg, 0, 0, hullOf(def), t, o); s += o.roll * o.roll; n++; } return Math.sqrt(s / n); };
    const beam = Math.atan2(W[0].kx, W[0].kz) + Math.PI / 2;
    const rD = rms(UNITS.ddg, beam), rC = rms(UNITS.carrier, beam), rDh = rms(UNITS.ddg, beam - Math.PI / 2);
    ok(rC < rD * .5, `rms roll beam-on: CVN ${fmt(rC * 57.3, 2)} deg vs DDG ${fmt(rD * 57.3, 2)} deg`);
    ok(rDh < rD * .5, `DDG head to the sea rolls ${fmt(rDh * 57.3, 2)} deg rms, beam-on ${fmt(rD * 57.3, 2)}`);
    ok(rD > .01 && rD < .2, `DDG beam-on roll ${fmt(rD * 57.3, 2)} deg rms in a moderate sea`);
    return `point hull on the surface within ${fmt(e, 3)} m · rms roll beam-on DDG ${fmt(rD * 57.3, 2)} deg, CVN ${fmt(rC * 57.3, 2)} deg; DDG head-on ${fmt(rDh * 57.3, 2)} deg`;
  });
}

const angle = a => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };
