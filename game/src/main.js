/* play.html boot: read URL params, load the map, start the renderer and the loop.
   For now a static showcase (the vertical slice): at the coast spawn a TEL erected, a TEL stowed, the Monolith-B
   radar turning, a Pantsir, the drone catapult and an Orlan-10 circling; at sea a destroyer under way with its
   Kelvin wake, the carrier, an MH-60R hovering and two F/A-18E passing. The camera starts on the battery.
   URL: ?map=<id> (default krasnaya_kosa; 'stub' = the engine's procedural coast), ?scale=<render scale>,
   ?bench=1 (logs the average frame after 5 s), ?t=<s> (freeze time), ?cam=x,z,dist,yawDeg,pitchDeg, ?ui=0. */
import { Renderer, LIME, CORAL, WH } from './engine/renderer.js';
import { stubMap } from './engine/stubmap.js';
import { Wake } from './engine/fx.js';

const Q = new URLSearchParams(location.search);
const $ = id => document.getElementById(id);
const DEG = Math.PI / 180, TAU = Math.PI * 2;

async function getMap() {
  const id = Q.get('map') || 'krasnaya_kosa';
  if (id !== 'stub') {
    try {
      const mod = await import('./world/maps.js');
      const m = await mod.loadMap(id);
      if (m && m.heights && m.cols && m.rows) return m;
      console.warn('main: loadMap returned no heightfield; using the stub map');
    } catch (e) { console.warn('main: world/maps.js unavailable (' + (e && e.message) + '); using the stub map'); }
  }
  return stubMap();
}

async function boot() {
  $('bootmsg').textContent = 'Loading map';
  const t0 = performance.now();
  const map = await getMap();
  const tMap = performance.now() - t0;
  $('bootmsg').textContent = 'Building the picture';
  await new Promise(r => setTimeout(r, 0));
  const R = new Renderer({ canvas: $('gl'), overlay: $('ov'), map, renderScale: +(Q.get('scale') || 1) });
  const T = R.terrain, cam = R.camera;
  cam.attach($('gl'));
  // the game's own models (command post, transloader, depot, ...), when data/models.js is there
  try {
    const DM = await import('./data/models.js');
    R.models.registerAll(DM.EXTRA_MODELS, DM.MODEL_INFO);
    R.models.registerAll(DM.CUT_MODELS, DM.MODEL_INFO);
  } catch (e) { console.warn('main: data/models.js not registered (' + (e && e.message) + ')'); }
  const S = showcase(R, map);
  // warm the model caches at the levels the opening shot needs
  for (const k of ['tel', 'radar', 'pantsir', 'catapult', 'drone', 'destroyer', 'carrier', 'helo', 'fighter']) R.models.warm(k);
  console.log(`ONIKS: map ${map.id} ${map.cols}x${map.rows} in ${Math.round(tMap)} ms; renderer ${Math.round(performance.now() - t0 - tMap)} ms`);
  $('boot').classList.add('off');

  // camera: on the battery, looking out to sea
  const c = map.spawns.coast;
  cam.set({ target: [c.x, T.heightAt(c.x, c.z), c.z], dist: 170, yaw: c.hdg - .5, pitch: 16 * DEG });
  if (Q.get('cam')) {
    const [x, z, d, y, p] = Q.get('cam').split(',').map(Number);
    cam.set({ target: [x, T.heightAt(x, z), z], dist: d || 500, yaw: (y || 0) * DEG, pitch: (p || 30) * DEG });
  }
  // debug: number keys fly to the showcase pieces
  window.addEventListener('keydown', e => {
    const n = +e.key; if (!(n >= 1 && n <= 9)) return;
    const u = S.units[n - 1]; if (!u) return;
    const e0 = R.models.get(u.key);
    cam.flyTo(u.T, { dist: e0.radius * 5 + 12 });
    cam.follow(() => u.T);
  });

  const freeze = Q.has('t') ? +Q.get('t') : null;
  const bench = Q.get('bench') === '1';
  const perf = $('perf'), showUI = Q.get('ui') !== '0';
  let last = performance.now(), fAcc = 0, fN = 0, cpuAcc = 0, pTxt = 0;
  const benchS = { t0: 0, frames: [], cpu: [] };
  /* stills: ONIKS.shot(name[, crop]) composites the GL frame and the overlay and saves game/shots/<name>.png */
  const shots = [];
  function takeShot(s) {
    const g = $('gl'), o = $('ov'), [x, y, w, h] = s.crop || [0, 0, g.width, g.height];
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const cx = cv.getContext('2d');
    cx.drawImage(g, x, y, w, h, 0, 0, w, h);
    if (s.overlay !== false) cx.drawImage(o, x * o.width / g.width, y * o.height / g.height, w * o.width / g.width, h * o.height / g.height, 0, 0, w, h);
    fetch('/save?path=game/shots/' + s.name + '.png', { method: 'POST', body: cv.toDataURL('image/png') }).then(r => s.done && s.done(r.status));
  }
  window.ONIKS = { R, map, S, cam, shot: (name, crop, overlay) => new Promise(done => shots.push({ name, crop, overlay, done })) };

  let simT = 0;
  /* one frame: camera, scene, render, overlay (also called directly for stills and the synchronous bench) */
  function step(now, dtOver) {
    const dt = dtOver !== undefined ? dtOver : Math.min(.1, (now - last) / 1000); last = now;
    const c0 = performance.now();
    simT += dt;
    const t = freeze !== null ? freeze : simT;
    R.frame(dt, t);
    S.update(t, dt);
    S.draw(t);
    R.end();
    if (showUI) S.overlay(t);
    const cpu = performance.now() - c0;
    if (shots.length) takeShot(shots.shift());
    return { dt, cpu };
  }
  function loop(now) {
    requestAnimationFrame(loop);
    const { dt, cpu } = step(now);
    fAcc += dt; fN++; cpuAcc += cpu;
    if (now - pTxt > 250) {
      const fps = fN / Math.max(1e-3, fAcc), st = T.stats;
      perf.innerHTML = `<b>${fps.toFixed(0)}</b> FPS · <b>${(1000 * fAcc / Math.max(1, fN)).toFixed(1)}</b> MS · CPU <b>${(cpuAcc / Math.max(1, fN)).toFixed(1)}</b>
` +
        `${R.G.W}×${R.G.H} · ${(st.dots / 1e6).toFixed(2)} M GROUND · ${(R.stats.points / 1e6).toFixed(2)} M MODEL · L${st.levels}`;
      fAcc = 0; fN = 0; cpuAcc = 0; pTxt = now;
    }
    if (bench) {
      if (!benchS.t0) benchS.t0 = now;
      const el = now - benchS.t0;
      if (el > 1000 && el < 6000) { benchS.frames.push(dt * 1000); benchS.cpu.push(cpu); }
      else if (el >= 6000 && !benchS.done) {
        benchS.done = true;
        const avg = a => a.reduce((s, v) => s + v, 0) / a.length, p95 = a => a.slice().sort((x, y) => x - y)[Math.floor(a.length * .95)];
        const r = { frames: benchS.frames.length, frameMs: +avg(benchS.frames).toFixed(2), frameP95: +p95(benchS.frames).toFixed(2), cpuMs: +avg(benchS.cpu).toFixed(2), cpuP95: +p95(benchS.cpu).toFixed(2), res: `${R.G.W}x${R.G.H}`, ground: T.stats.dots, model: R.stats.points };
        console.log('BENCH ' + JSON.stringify(r));
        window.BENCH = r;
      }
    }
  }
  requestAnimationFrame(loop);
  /* render n frames back to back, each waited for on the GPU (works with the page hidden): average ms */
  window.ONIKS.benchSync = (n, dt) => {
    const gl = R.gl, px = new Uint8Array(4), ms = [];
    for (let i = 0; i < (n || 60); i++) {
      const a = performance.now();
      step(a, dt === undefined ? 1 / 60 : dt);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      ms.push(performance.now() - a);
    }
    ms.sort((x, y) => x - y);
    return { avg: +(ms.reduce((s, v) => s + v, 0) / ms.length).toFixed(2), p50: +ms[ms.length >> 1].toFixed(2), p95: +ms[Math.floor(ms.length * .95)].toFixed(2), res: `${R.G.W}x${R.G.H}`, ground: T.stats.dots, model: R.stats.points };
  };
  /* advance the scene by `sec` seconds in `n` steps (without waiting for animation frames) */
  window.ONIKS.advance = (sec, n) => { n = n || Math.max(1, Math.ceil(sec * 10)); for (let i = 0; i < n; i++) step(performance.now(), sec / n); return simT; };
  /* render one frame now and save it */
  window.ONIKS.still = (name, dt, warm) => new Promise(done => {
    for (let i = 0; i < (warm === undefined ? 30 : warm); i++) step(performance.now(), 0);
    shots.push({ name, done }); step(performance.now(), dt === undefined ? 0 : dt);
  });
}

/* ---------- the showcase ---------- */
function showcase(R, map) {
  const T = R.terrain, c = map.spawns.coast;
  const fw = [Math.sin(c.hdg), Math.cos(c.hdg)], rt = [Math.cos(c.hdg), -Math.sin(c.hdg)];
  const at = (f, r) => [c.x + fw[0] * f + rt[0] * r, c.z + fw[1] * f + rt[1] * r];
  const units = [];
  /* a land vehicle sits on the drawn ground, pitched and rolled to it */
  function land(key, f, r, hdg, st, tint, label) {
    const [x, z] = at(f, r);
    const u = { key, T: [x, 0, z], hdg, st, tint, label, id: units.length };
    settle(u);
    units.push(u);
    return u;
  }
  function settle(u) {
    const [x, , z] = u.T, e = R.models.get(u.key), L = Math.max(4, e.L * .4);
    const s = Math.sin(u.hdg), co = Math.cos(u.hdg);
    const hf = T.heightAt(x + s * L, z + co * L), hb = T.heightAt(x - s * L, z - co * L);
    const hr = T.heightAt(x + co * L * .5, z - s * L * .5), hl = T.heightAt(x - co * L * .5, z + s * L * .5);
    u.T[1] = Math.max(0, (hf + hb + hr + hl) / 4);
    u.pitch = Math.atan2(hf - hb, 2 * L); u.roll = Math.atan2(hl - hr, L);
  }
  const H0 = c.hdg;
  const tel1 = land('tel', 0, -9, H0 + .05, { elev: 1.535, dep: 1 }, 'own', ['01', 'K340P TEL', 'ERECT']);
  const tel2 = land('tel', -14, 11, H0 - .08, { elev: 0, dep: 0 }, 'own', ['02', 'K340P TEL', 'STOWED']);
  const rad = land('radar', -70, -44, H0 + .4, { ant: 0, mast: 1 }, 'own', ['04', 'MONOLITH-B', '']);
  const pan = land('pantsir', -38, 58, H0 - .5, { yaw: 0, pitch: .12, sAnt: 0 }, 'own', ['03', 'PANTSIR-S1', '']);
  const cat = land('catapult', -26, -78, H0 + .15, { carriage: 0 }, 'own', ['05', 'ORLAN-10 CATAPULT', '']);

  // sea: find open water in front of the battery
  const seaAt = (d0) => { for (let d = d0; d < 60000; d += 250) { const [x, z] = at(d, 0); if (T.mapH(x, z) < -25 && T.mapH(x + 900, z) < -25 && T.mapH(x - 900, z) < -25 && T.mapH(x, z + 900) < -25 && T.mapH(x, z - 900) < -25) return d; } return 20000; };
  const dSea = seaAt(3500);
  const ddgC = at(dSea + 3200, -1500), ddgR = 2800, ddgV = 15.4;
  const cvnC = at(dSea + 11000, 5000), cvnR = 4200, cvnV = 10;
  const ddg = { key: 'destroyer', T: [0, 0, 0], hdg: 0, st: { sps: 0 }, tint: 'hostile', label: ['TRK 21', 'DDG · ARLEIGH BURKE', '0.89'], id: 5 };
  const cvn = { key: 'carrier', T: [0, 0, 0], hdg: 0, st: {}, tint: 'hostile', label: ['TRK 22', 'CVN · NIMITZ', '0.93'], id: 6 };
  const helo = { key: 'helo', T: [0, 0, 0], hdg: 0, st: { rotor: 0, trotor: 0, droop: 0 }, tint: 'hostile', label: ['TRK 23', 'MH-60R', '0.71'], id: 7 };
  const f1 = { key: 'fighter', T: [0, 0, 0], hdg: 0, st: { fan: 0, nozzle: .4, ab: 0 }, tint: 'hostile', label: ['TRK 24', 'F/A-18E', '0.66'], id: 8 };
  const f2 = { key: 'fighter', T: [0, 0, 0], hdg: 0, st: { fan: 0, nozzle: .4, ab: 0 }, tint: 'hostile', label: ['TRK 25', 'F/A-18E', '0.64'], id: 9 };
  const drone = { key: 'drone', T: [0, 0, 0], hdg: 0, st: { prop: 0, gimYaw: 0, gimPitch: -.6 }, tint: 'own', label: ['06', 'ORLAN-10', ''], id: 10 };
  const heloAt = at(dSea + 600, 900);
  units.push(ddg, cvn, helo, f1, f2, drone);
  // a model registered from data/models.js: the K342P transloader parked by the stowed TEL
  if (R.models.has('transloader')) land('transloader', -22, 26, H0 - .12, { dep: 0 }, 'own', ['07', 'K342P TRANSLOADER', '']);
  const wakeD = new Wake({ L: 155, B: 20, seed: 1 }), wakeC = new Wake({ L: 333, B: 41, seed: 2, len: 1400 });

  /* a ship steaming round a circle, riding the swell */
  function ship(u, C, r, v, t, L, B) {
    const w = v / r, a = w * t;
    u.T[0] = C[0] + Math.sin(a) * r; u.T[2] = C[1] + Math.cos(a) * r;
    u.hdg = a + Math.PI / 2;
    const s = Math.sin(u.hdg), co = Math.cos(u.hdg);
    const sb = T.seaAt(u.T[0] + s * L * .35, u.T[2] + co * L * .35, t).y, ss = T.seaAt(u.T[0] - s * L * .35, u.T[2] - co * L * .35, t).y;
    const sp = T.seaAt(u.T[0] - co * B * .5, u.T[2] + s * B * .5, t).y, sst = T.seaAt(u.T[0] + co * B * .5, u.T[2] - s * B * .5, t).y;
    const k = Math.min(1, 60 / L);
    u.T[1] = (sb + ss + sp + sst) / 4 * k;
    u.pitch = Math.atan2(sb - ss, L * .7) * k; u.roll = Math.atan2(sp - sst, B) * k * 1.5 - .035 * (v / 15);   // heel into the turn
  }
  const fighterC = at(dSea + 6000, 2000), fR = 14000, fV = 230, fAlt = 1400;
  const droneC = at(420, -40), dR = 650, dV = 30;
  return {
    units,
    update(t) {
      tel1.st.fan = t * 11; tel2.st.fan = t * 11; rad.st.fan = t * 14;
      rad.st.ant = t * TAU / 5;
      pan.st.sAnt = t * TAU / 1.1; pan.st.yaw = .6 * Math.sin(t * .21);
      ship(ddg, ddgC, ddgR, ddgV, t, 155, 20);
      ddg.st.sps = t * TAU / 2.5;
      ship(cvn, cvnC, cvnR, cvnV, t + 900, 333, 77);
      wakeD.update(ddg.T, ddg.hdg, ddgV, t);
      wakeC.update(cvn.T, cvn.hdg, cvnV, t + 900);
      helo.T = [heloAt[0] + 3 * Math.sin(t * .31), 32 + 1.2 * Math.sin(t * .5), heloAt[1] + 2 * Math.cos(t * .23)];
      helo.hdg = c.hdg + Math.PI + .2 * Math.sin(t * .05); helo.pitch = .03; helo.roll = .01 * Math.sin(t * .7);
      helo.st.rotor = t * TAU * 258 / 60; helo.st.trotor = t * TAU * 1190 / 60;
      for (const [u, off, lat] of [[f1, 0, 0], [f2, -90, 45]]) {
        const w = fV / fR, a = w * t + off / fR;
        const rr = fR + lat;
        u.T = [fighterC[0] + Math.sin(a) * rr, fAlt + (lat ? 25 : 0), fighterC[1] + Math.cos(a) * rr];
        u.hdg = a + Math.PI / 2; u.pitch = 0; u.roll = Math.atan(fV * fV / (9.81 * fR));
        u.st.fan = t * 9;
      }
      {
        const w = dV / dR, a = -w * t;
        drone.T = [droneC[0] + Math.sin(a) * dR, T.heightAt(droneC[0], droneC[1]) + 320, droneC[1] + Math.cos(a) * dR];
        drone.hdg = a - Math.PI / 2; drone.roll = -Math.atan(dV * dV / (9.81 * dR)); drone.pitch = .02;
        drone.st.prop = t * 47;
        drone.st.gimYaw = Math.PI / 2 + .2 * Math.sin(t * .3);
      }
    },
    draw(t) {
      for (const u of units) R.draw(u);
      wakeD.draw(R.fx, .9); wakeC.draw(R.fx, .8);
      // the Monolith-B paints the sea: its beam sweeps with the array
      R.setSweep({ origin: [rad.T[0], rad.T[2]], bearing: rad.hdg + rad.st.ant, amp: .9, afterglow: 1.3, range: 45000, edge: .03 });
    },
    overlay(t) {
      const O = R.overlay; if (!O) return;
      const cam = R.camera, q = [0, 0, 0];
      for (const u of units) {
        if (!u.label || !cam.project(u.T, q)) continue;
        if (q[0] < -50 || q[1] < -50 || q[0] > cam.W + 50 || q[1] > cam.H + 50) continue;
        const e = R.models.get(u.key), rpx = cam.fl * e.radius / q[2];
        const own = u.tint === 'own' || (Array.isArray(u.tint) && u.tint[0] < .9);
        const col = own ? '#C6F432' : '#FF6A3D';
        if (rpx > 18) {
          const b = R.screenBox(u);
          if (b) { O.bracket(b, col, .9, 5, 12); O.tag(b[0] - 5, b[1] - 5 - 21, u.label[0], u.label[1], u.label[2], { kind: own ? 'lime' : 'coral', size: 10.5 }); }
        } else {
          O.mark(q[0], q[1], 7, col, .95);
          O.leader(q[0] + 4, q[1] - 4, q[0] + 18, q[1] - 18, 'rgba(255,255,255,.7)', .8);
          O.tag(q[0] + 18, q[1] - 18 - 19, u.label[0], u.label[1], u.label[2], { kind: own ? 'lime' : 'coral', size: 10.5 });
        }
      }
    },
  };
}

boot().catch(e => { console.error(e); const b = $('bootmsg'); if (b) b.textContent = 'Error: ' + e.message; });
