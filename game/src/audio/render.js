/* Offline renders of the audio (you cannot always listen: render, then look at the numbers).

   import { renderScene, analyze, wav, SCENES } from './src/audio/render.js';
   const r = await renderScene('launch_sm6', 50);    // a scene at 50 m from the camera -> { sr, L, R, pre }
   analyze(r)  -> { peakDb, preDb, rmsDb, maxRms100Db, crest, env (RMS dB per 100 ms), bands (octave dB, loudest 1 s),
                    flat (spectral flatness 100 Hz-8 kHz, 1 = noise), tonal (dB: strongest narrow peak over its
                    neighbourhood; > ~15 dB reads as a tone / blip), skew (waveform skewness: crackle is > 0) }
   wav(r)      -> a 16-bit stereo WAV Blob

   The scene runs the real system (createAudio with an OfflineAudioContext) against a small fake world like
   game/audio.html's: the camera 40 m up looking north, events at time 0, the world stepped and audio.update called
   every 32 ms of render time (OfflineAudioContext.suspend), so the tracked missile voices, their booster / sustainer
   phases, Doppler and sound travel are all heard. The ambience bus is cut. */
import { createAudio } from './index.js';

const DEG = Math.PI / 180;
const SPEEDS = { oniks: 750, sm6: 1100, sam: 900, aam: 1200, tlam: 245, hellfire: 400, slam: 240, pdms: 1000, uran: 270, kalibr: 280 };
const SEP = { oniks: 7, sm6: 6, sam: 2.4, aam: 3, tlam: 12, hellfire: 2.5, slam: 3, pdms: 3, uran: 2, kalibr: 5 };
const DEFS = {
  ssk: { domain: 'sea', draught: 6.2, speed: 8.7, sub: { pd: 16, deep: 150, rate: 1.2 } },
  ssn: { domain: 'sea', draught: 9.3, speed: 12.8, sub: { pd: 18, deep: 180, rate: 1.5 } },
  ddg: { domain: 'sea' }, helo: { domain: 'air' }, fighter: { domain: 'air' },
};

function world(audio) {
  const cam = { eye: [0, 40, 0], f: [0, -.14, .99], r: [1, 0, 0], u: [0, .99, .14], target: [0, 0, 285], followFn: null };
  const map = { weather: { kind: 'calm', wind: [0, 0], sea: .2 }, h: () => -20, water: () => true };
  const sim = { t: 0, units: new Map(), projectiles: new Map(), weather: { kind: 'calm', wind: [0, 0], sea: .2, squalls: [] } };
  const game = { camera: cam, sim, map, side: 'coast', timeRate: 1, paused: false, selection: new Set() };
  let id = 1000;
  const W = {
    game, sim,
    at: (d, brg, y) => [Math.sin(brg * DEG) * d, y === undefined ? 2 : y, Math.cos(brg * DEG) * d],
    air: (d, brg) => W.at(d, brg, Math.min(d * .35, 3000) + 40),
    ev: o => W.audio.onEvent({ t: sim.t, ...o }),
    unit(type, pos, o) { const u = { id: id++, type, side: 'fleet', alive: true, dying: 0, pos: pos.slice(), prev: pos.slice(), def: DEFS[type] || { domain: 'land' }, ...o }; sim.units.set(u.id, u); return u; },
    boat(type, pos, o) { const u = W.unit(type, pos, { side: 'coast', depth: 16, dive: 1, mastUp: 1, ...o }); u.pos[1] = -(u.depth - u.def.draught); return u; },
    proj(kind, pos, hdg, o) {
      const p = { id: id++, kind, side: 'coast', alive: true, pos: pos.slice(), prev: pos.slice(), vel: [0, 30, 0], t0: sim.t, age: 0, hdg, pitch: Math.PI / 2,
        P: { sepAt: SEP[kind], boost: SEP[kind], speed: SPEEDS[kind] || 600 }, vert: 1.4, life: 60, ...o };
      sim.projectiles.set(p.id, p); return p;
    },
    step(dt) {
      for (const p of sim.projectiles.values()) {
        p.prev = p.pos.slice(); p.age += dt;
        const spd = p.age < p.P.boost ? 30 + (p.P.speed - 30) * Math.min(1, p.age / p.P.boost) : p.P.speed;
        if (p.age > p.vert) p.pitch = Math.max(.02, p.pitch - dt * .45);
        p.vel = [spd * Math.sin(p.hdg) * Math.cos(p.pitch), spd * Math.sin(p.pitch), spd * Math.cos(p.hdg) * Math.cos(p.pitch)];
        for (let k = 0; k < 3; k++) p.pos[k] += p.vel[k] * dt;
        if (p.age >= p.P.sepAt && !p.sepDone) { p.sepDone = true; W.ev({ type: 'booster_sep', proj: p.id, kind: p.kind, pos: p.pos.slice() }); }
        if (p.age > p.life) p.alive = false;
      }
      for (const [k, p] of sim.projectiles) if (!p.alive) sim.projectiles.delete(k);
      sim.t += dt;
    },
  };
  return W;
}

/* scene(W, d): fires its events at t = 0 (and may return [[t, fn], ...] for later ones) */
const launch = (kind, y, hdg, o, from) => (W, d) => {
  const pos = W.at(d, 20, y), b = from ? W.boat(from, W.at(d, 20, 0)) : null;
  const p = W.proj(kind, pos, hdg * DEG, o);
  W.ev({ type: 'launch', kind, proj: p.id, pos, from: b ? b.id : undefined, side: 'coast' });
};
export const SCENES = {
  launch_oniks: { sec: 9, run: launch('oniks', 6, 20) },
  launch_sm6: { sec: 8, run: launch('sm6', 9, 200, { vert: 2 }) },
  launch_tlam: { sec: 14, run: launch('tlam', 9, 200, { vert: 2 }) },
  launch_sam: { sec: 5, run: launch('sam', 4, 20, { vert: 0, pitch: .5 }) },
  launch_aam: { sec: 6, run: (W, d) => { const pos = W.air(d, 20), p = W.proj('aam', pos, 20 * DEG, { vert: 0, pitch: 0 }); W.ev({ type: 'launch', kind: 'aam', proj: p.id, pos, side: 'fleet' }); } },
  launch_uran: { sec: 7, run: launch('uran', 5, 200, { vert: 0, pitch: .12 }) },
  launch_kalibr: { sec: 9, run: launch('kalibr', .5, 20, { vert: 1.6 }, 'ssk') },
  sep: { sec: 3, run: (W, d) => W.ev({ type: 'booster_sep', pos: W.air(d, 20), kind: 'oniks', proj: -1 }) },
  gun5: { sec: 5, run: (W, d) => W.ev({ type: 'launch', kind: 'shell', pos: W.at(d, 20, 12), proj: -2 }) },
  gun30: { sec: 4, run: (W, d) => W.ev({ type: 'gunfire', weapon: 'gun30', dur: 1, pos: W.at(d, 20, 4) }) },
  ciws: { sec: 4, run: (W, d) => W.ev({ type: 'gunfire', weapon: 'ciws', dur: 1, pos: W.at(d, 20, 16) }) },
  intercept: { sec: 6, run: (W, d) => W.ev({ type: 'intercept', pos: W.air(d, 20), kind: 'oniks', byKind: 'sm6' }) },
  intercept_small: { sec: 4, run: (W, d) => W.ev({ type: 'intercept', pos: W.air(d, 20), kind: 'oniks', byKind: 'ciws' }) },
  hit_ship: { sec: 8, run: (W, d) => { const u = W.unit('ddg', W.at(d, 20, 0)); W.ev({ type: 'hit', pos: W.at(d, 20, 6), kind: 'oniks', target: u.id }); } },
  hit_small: { sec: 3, run: (W, d) => W.ev({ type: 'hit', pos: W.air(d, 20), kind: 'gun30', target: -1 }) },
  airburst: { sec: 5, run: (W, d) => W.ev({ type: 'destroyed', pos: W.air(d, 20), unit: -1, unitType: 'fighter', side: 'fleet' }) },
  secondary: { sec: 9, run: (W, d) => W.ev({ type: 'destroyed', pos: W.at(d, 20, 0), unit: -1, unitType: 'ddg', side: 'fleet' }) },
  // 10 s among the launchers, camera 40 m up: 8 launches, interceptors and intercepts, hits, cannon, a ship kill
  salvo: { sec: 12, run: (W, d) => {
    const k = d / 50, L = (kind, x, z, y, hdg, o) => () => { const pos = [x * k, y, z * k], p = W.proj(kind, pos, hdg * DEG, o); W.ev({ type: 'launch', kind, proj: p.id, pos, side: 'coast' }); };
    const E = o => () => W.ev(o);
    return [
      [0, L('oniks', 60, 80, 6, 20)], [.4, L('oniks', -70, 120, 6, 10)], [1.1, L('uran', 120, 60, 5, 30, { vert: 0, pitch: .12 })], [1.6, L('oniks', 30, 200, 6, 0)],
      [2.2, L('sm6', -300, 900, 9, 200, { vert: 2 })], [2.5, L('sm6', -320, 920, 9, 200, { vert: 2 })], [3, L('sam', 90, 150, 4, 20, { vert: 0, pitch: .5 })],
      [3.4, L('sam', 95, 160, 4, 25, { vert: 0, pitch: .5 })], [4, L('pdms', -260, 700, 9, 200, { vert: 2 })], [4.5, L('sm6', -300, 900, 9, 200, { vert: 2 })],
      [5, L('uran', 140, 40, 5, 40, { vert: 0, pitch: .12 })], [5.6, L('oniks', -20, 90, 6, 5)],
      [3.8, E({ type: 'intercept', pos: [0, 900, 1500], kind: 'oniks', byKind: 'sm6' })], [4.6, E({ type: 'intercept', pos: [200, 700, 1300], kind: 'oniks', byKind: 'sm6' })],
      [6, E({ type: 'intercept', pos: [150, 300, 600], kind: 'oniks', byKind: 'sam' })], [6.5, E({ type: 'gunfire', weapon: 'ciws', dur: 1.2, pos: [-150, 16, 500] })],
      [7, E({ type: 'intercept', pos: [-100, 60, 700], kind: 'oniks', byKind: 'ciws' })], [7.2, E({ type: 'gunfire', weapon: 'gun30', dur: 1, pos: [100, 4, 130] })],
      [7.5, E({ type: 'hit', pos: [-200, 6, 900], kind: 'oniks', target: -1 })], [8, E({ type: 'hit', pos: [-260, 6, 950], kind: 'oniks', target: -1 })],
      [8.3, E({ type: 'launch', kind: 'shell', pos: [-280, 12, 880], proj: -2 })], [8.8, E({ type: 'hit', pos: [60, 2, 300], kind: 'tlam', target: -1 })],
      [9.5, E({ type: 'destroyed', pos: [-250, 0, 930], unit: -1, unitType: 'ddg', side: 'fleet' })],
    ];
  } },
  splash: { sec: 4, run: (W, d) => W.ev({ type: 'splash', pos: W.at(d, 20, 0), kind: 'oniks', water: true }) },
};

export async function renderScene(name, d, o) {
  const sc = typeof name === 'string' ? SCENES[name] : name;
  const sr = (o && o.sr) || 48000, sec = (o && o.sec) || sc.sec, delay = d / 343;
  const len = Math.ceil(sr * (sec + delay));
  const ac = new OfflineAudioContext({ numberOfChannels: 3, length: len, sampleRate: sr });
  const W = world();
  W.audio = createAudio(W.game, { ac });
  W.audio.init(W.game);
  W.audio.core.bus.amb.disconnect();
  const dt = 1536 / sr, later = [];
  const step = (i) => {
    if (i === 1) { const x = sc.run(W, d); if (Array.isArray(x)) later.push(...x); }
    for (let j = later.length - 1; j >= 0; j--) if (later[j][0] <= W.sim.t) { later[j][1](W); later.splice(j, 1); }
    W.step(dt); W.audio.update(dt, dt);
    const st = W.audio.stats(); peak.nodes = Math.max(peak.nodes, st.nodes); peak.voices = Math.max(peak.voices, st.voices); peak.loops = Math.max(peak.loops, st.loops);
  };
  const peak = { nodes: 0, voices: 0, loops: 0 };
  for (let i = 1; i * dt < len / sr - dt; i++) ac.suspend(i * dt).then(() => { step(i); ac.resume(); });
  const buf = await ac.startRendering();
  return { name: typeof name === 'string' ? name : 'scene', d, sr, peak, L: buf.getChannelData(0), R: buf.getChannelData(1), pre: buf.getChannelData(2) };
}

/* ---------------- analysis ---------------- */
const dB = x => x > 1e-9 ? 20 * Math.log10(x) : -180;

function fft(re, im) {                               // in place, radix 2
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const h = size >> 1, a = -2 * Math.PI / size;
    for (let i = 0; i < n; i += size) for (let k = 0; k < h; k++) {
      const c = Math.cos(a * k), s = Math.sin(a * k), xr = re[i + k + h] * c - im[i + k + h] * s, xi = re[i + k + h] * s + im[i + k + h] * c;
      re[i + k + h] = re[i + k] - xr; im[i + k + h] = im[i + k] - xi; re[i + k] += xr; im[i + k] += xi;
    }
  }
}

export function analyze(r) {
  const { L, R, pre, sr } = r, n = L.length, m = new Float32Array(n);
  let pk = 0, pp = 0, s2 = 0;
  for (let i = 0; i < n; i++) { const x = (L[i] + R[i]) * .5; m[i] = x; pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i])); pp = Math.max(pp, Math.abs(pre[i])); s2 += x * x; }
  const W = Math.floor(sr * .1), env = [];
  let best = 0, bi = 0;
  for (let i = 0; i + W <= n; i += W) {
    let s = 0; for (let j = i; j < i + W; j++) s += m[j] * m[j];
    const v = Math.sqrt(s / W); env.push(Math.round(dB(v))); if (v > best) { best = v; bi = i; }
  }
  // the loudest second: spectrum (Hann, 32768 points, averaged over 4 frames of 8192 hop)
  const N = 16384, st = Math.max(0, Math.min(n - N, bi - N / 4)), re = new Float64Array(N), im = new Float64Array(N), P = new Float64Array(N / 2);
  for (let f = 0; f < 3; f++) {
    const o = Math.min(n - N, st + f * 4096);
    for (let i = 0; i < N; i++) { re[i] = (m[o + i] || 0) * (.5 - .5 * Math.cos(2 * Math.PI * i / (N - 1))); im[i] = 0; }
    fft(re, im);
    for (let k = 0; k < N / 2; k++) P[k] += re[k] * re[k] + im[k] * im[k];
  }
  const hz = sr / N, bands = {};
  let tot = 0; for (let k = 1; k < N / 2; k++) tot += P[k];
  for (const fc of [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]) {
    let s = 0; for (let k = Math.ceil(fc / 1.414 / hz); k < Math.min(N / 2, fc * 1.414 / hz); k++) s += P[k];
    bands[fc] = Math.round(10 * Math.log10(s / tot + 1e-12));
  }
  let lg = 0, ar = 0, c = 0;
  for (let k = Math.ceil(100 / hz); k < 8000 / hz; k++) { lg += Math.log(P[k] + 1e-30); ar += P[k]; c++; }
  const flat = Math.exp(lg / c) / (ar / c);
  let tonal = 0, tonalHz = 0;
  for (let k = Math.ceil(40 / hz); k < 6000 / hz; k++) {           // a narrow peak against the median of its 1/3 octave
    const w = Math.max(4, Math.round(k * .11)), a = [];
    for (let j = k - w; j <= k + w; j++) if (j > 0 && j < N / 2 && Math.abs(j - k) > 2) a.push(P[j]);
    a.sort((x, y) => x - y);
    const v = 10 * Math.log10(P[k] / (a[a.length >> 1] + 1e-30));
    if (v > tonal) { tonal = v; tonalHz = k * hz; }
  }
  // skewness of the high-passed waveform in the loudest 100 ms (crackle > 0)
  let mu = 0, v2 = 0, v3 = 0, hp = 0, prev = 0;
  const seg = [];
  for (let i = bi; i < bi + W && i < n; i++) { const y = m[i] - prev; prev = m[i]; hp = y; seg.push(hp); mu += hp; }
  mu /= seg.length; for (const y of seg) { v2 += (y - mu) ** 2; v3 += (y - mu) ** 3; }
  v2 /= seg.length; v3 /= seg.length;
  return {
    name: r.name, d: r.d, peakDb: +dB(pk).toFixed(1), preDb: +dB(pp).toFixed(1), rmsDb: +dB(Math.sqrt(s2 / n)).toFixed(1),
    maxRms100Db: +dB(best).toFixed(1), crest: +(dB(pk) - dB(best)).toFixed(1), env, bands, flat: +flat.toFixed(3),
    tonal: +tonal.toFixed(1), tonalHz: Math.round(tonalHz), skew: +(v3 / Math.pow(v2, 1.5)).toFixed(2), ...(r.peak || {}),
  };
}

export function wav(r) {
  const n = r.L.length, b = new ArrayBuffer(44 + n * 4), v = new DataView(b), S = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  S(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); S(8, 'WAVE'); S(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
  v.setUint32(24, r.sr, true); v.setUint32(28, r.sr * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); S(36, 'data'); v.setUint32(40, n * 4, true);
  for (let i = 0, o = 44; i < n; i++, o += 4) {
    v.setInt16(o, Math.max(-1, Math.min(1, r.L[i])) * 32767, true); v.setInt16(o + 2, Math.max(-1, Math.min(1, r.R[i])) * 32767, true);
  }
  return new Blob([b], { type: 'audio/wav' });
}
