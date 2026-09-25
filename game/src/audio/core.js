/* ONIKS audio core: one AudioContext (created on the first user gesture), the bus graph, shared noise buffers,
   one-shot voices with a cap and priorities, and long-lived loop slots. No audio files: everything is synthesized.

   Graph
     voice: sources -> filters -> envelopes -> v.out -> lowpass (distance) -> panner -> gain (distance) -> bus
                                                                               '-> send -> reverb
     world ─┐
     reverb ┤
     amb ───┼-> mix -> highpass 24 Hz -> glue compressor -> limiter -> soft clip -> trim -> volume -> out
     sig ───┤                                                              '-> out meter
     ui ────┘         (pre meter taps mix)

   Everything that creates a node goes through a Voice or a Slot so the live node count is known (`live`). */
import { getSettings, onSettings } from '../data/settings.js';

export const SOUND_SPEED = 343;                 // m/s
export const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/* seeded rng (mulberry32): the audio never needs Math.random either */
export function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* one attack / hold / exponential-decay envelope, the films' shape */
export function envelope(p, t, g, a, hold, dur) {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(g, t + a);
  const h = t + a + (hold || 0);
  if (hold > 0) p.setValueAtTime(g, h);
  p.exponentialRampToValueAtTime(1e-4, Math.max(h + .005, t + dur));
}

/* smooth parameter follow for loops; skips calls that would not change anything (keeps automation lists short) */
export function follow(p, v, now, tc) {
  const last = p._v;
  if (last !== undefined && Math.abs(v - last) <= Math.max(1e-4, Math.abs(last) * .004)) return;
  p._v = v;
  p.setTargetAtTime(v, now, tc || .05);
}

/* ------------------------------------------------------------------------------------------------------------ */

class Node_ {
  /* node factory mixed into Voice and Slot: every node is counted and kept for release */
  _k(n) { this.nodes.push(n); this.core.live++; this.core.made++; return n; }
  gain(v) { const g = this._k(this.core.ac.createGain()); g.gain.value = v === undefined ? 1 : v; return g; }
  filter(type, f, q) {
    const b = this._k(this.core.ac.createBiquadFilter());
    b.type = type; b.frequency.value = clamp(f, 10, 20000); b.Q.value = q === undefined ? .7 : q; return b;
  }
  osc(type, f) {
    const o = this._k(this.core.ac.createOscillator());
    if (type && typeof type === 'object') o.setPeriodicWave(type); else o.type = type || 'sine';
    o.frequency.value = f; this.srcs.push(o); return o;
  }
  src(buf, rate, loop) {
    const s = this._k(this.core.ac.createBufferSource());
    s.buffer = this.core.bufs[buf] || this.core.bufs.white; s.loop = loop !== false;
    if (rate && rate !== 1) s.playbackRate.value = rate;
    this.srcs.push(s); return s;
  }
  panner(v) { const p = this._k(this.core.ac.createStereoPanner()); p.pan.value = v || 0; return p; }
  _free() {
    for (const s of this.srcs) { try { s.stop(); } catch (e) { /* not started or already stopped */ } }
    for (const n of this.nodes) { try { n.disconnect(); } catch (e) { /* ok */ } }
    this.core.live -= this.nodes.length;
    this.nodes.length = 0; this.srcs.length = 0;
  }
}

/* A one-shot: a recipe fills it with layers (tone / noise / burst ...) that all end by `end`. */
export class Voice extends Node_ {
  constructor(core, cls, bus, prio, sp, name) {
    super();
    this.core = core; this.cls = cls; this.prio = prio; this.name = name; this.nodes = []; this.srcs = [];
    this.t = core.ac.currentTime + .015; this.end = this.t + .05; this.dead = false; this.loud = sp ? sp.gain : 1;
    this.out = this.gain(1);
    if (sp && sp.flat) {                         // pan only (sensor blips point toward what they are about)
      this.pan = this.panner(sp.pan);
      this.out.connect(this.pan); this.pan.connect(bus);
    } else if (sp) {                             // full spatial: distance lowpass, pan, distance gain, reverb send
      this.lp = this.filter('lowpass', sp.cut, .5);
      this.pan = this.panner(sp.pan);
      this.dg = this.gain(sp.gain);
      this.out.connect(this.lp); this.lp.connect(this.pan); this.pan.connect(this.dg); this.dg.connect(bus);
      if (sp.send > 0 && core.rev) { const s = this.gain(sp.send); this.dg.connect(s); s.connect(core.rev); }
    } else {
      this.out.connect(bus);
    }
  }
  until(t) { if (t > this.end) this.end = t; }

  /* oscillator layer: { type, f0, f1, at, dur, g, a, hold, glide: 'exp'|'lin', to } */
  tone(o) {
    const t = this.t + (o.at || 0), dur = o.dur, f0 = o.f0, f1 = o.f1 === undefined ? f0 : o.f1;
    const osc = this.osc(o.type || 'sine', f0), env = this.gain(0);
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) {
      if (o.glide === 'lin') osc.frequency.linearRampToValueAtTime(f1, t + dur);
      else osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    }
    envelope(env.gain, t, o.g === undefined ? .05 : o.g, o.a === undefined ? .004 : o.a, o.hold || 0, dur);
    osc.connect(env); env.connect(o.to || this.out);
    osc.start(t); osc.stop(t + dur + .03); this.until(t + dur + .03);
    return env;
  }

  /* filtered noise layer: { buf, at, dur, ft, f, f1 (sweep), q, g, a, hold, rate, ft2, f2, q2, to } */
  noise(o) {
    const t = this.t + (o.at || 0), dur = o.dur;
    const s = this.src(o.buf || 'white', o.rate || 1), fl = this.filter(o.ft || 'lowpass', o.f || 1000, o.q);
    if (o.f1) { fl.frequency.setValueAtTime(clamp(o.f, 10, 20000), t); fl.frequency.exponentialRampToValueAtTime(clamp(o.f1, 10, 20000), t + dur); }
    s.connect(fl); let last = fl;
    if (o.ft2) { const f2 = this.filter(o.ft2, o.f2, o.q2); fl.connect(f2); last = f2; }
    const env = this.gain(0);
    envelope(env.gain, t, o.g === undefined ? .05 : o.g, o.a === undefined ? .01 : o.a, o.hold || 0, dur);
    last.connect(env); env.connect(o.to || this.out);
    s.start(t, this.core.rand() * (s.buffer.duration - .01)); s.stop(t + dur + .03); this.until(t + dur + .03);
    return env;
  }

  /* an automatic cannon burst: noise gated by a pulse train at the rate of fire, plus a buzz body at the same
     rate. { rate (Hz), dur, f, q, g, duty, body (gain), bodyF, bodyType, at, rel } */
  burst(o) {
    const t = this.t + (o.at || 0), dur = o.dur, rel = o.rel || .06, W = this.core.pulseWave(o.duty || .25);
    const s = this.src(o.buf || 'white'), bp = this.filter('bandpass', o.f || 2000, o.q || .7);
    const gate = this.gain(o.duty || .25), lfo = this.osc(W.wave, o.rate), env = this.gain(0);
    lfo.connect(gate.gain);
    s.connect(bp); bp.connect(gate); gate.connect(env); env.connect(o.to || this.out);
    env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(o.g, t + .004);
    env.gain.setValueAtTime(o.g, t + dur); env.gain.exponentialRampToValueAtTime(1e-4, t + dur + rel);
    s.start(t, this.core.rand() * 2); lfo.start(t); s.stop(t + dur + rel + .03); lfo.stop(t + dur + rel + .03);
    if (o.body) {
      const b = this.osc(o.bodyType || 'sawtooth', o.bodyF || o.rate), lp = this.filter('lowpass', o.bodyLp || 420, .7), e2 = this.gain(0);
      b.connect(lp); lp.connect(e2); e2.connect(o.to || this.out);
      e2.gain.setValueAtTime(0, t); e2.gain.linearRampToValueAtTime(o.body, t + .006);
      e2.gain.setValueAtTime(o.body, t + dur); e2.gain.exponentialRampToValueAtTime(1e-4, t + dur + rel);
      b.start(t); b.stop(t + dur + rel + .03);
    }
    this.until(t + dur + rel + .03);
  }

  /* one noise source whose gain steps through a list of arrivals [[dt, gain, decay], ...] (rolling thunder, echoes) */
  roll(o) {
    const t = this.t + (o.at || 0), s = this.src(o.buf || 'brown', o.rate || 1), fl = this.filter(o.ft || 'lowpass', o.f || 160, o.q || .7);
    const env = this.gain(0), ev = [];
    let endT = t;
    for (const [dt, g, dec] of o.bumps) {
      ev.push([t + dt, g * o.g, .025]);
      ev.push([t + dt + .09, g * o.g * .22, dec / 3]);
      endT = Math.max(endT, t + dt + dec);
    }
    ev.sort((a, b) => a[0] - b[0]);
    env.gain.setValueAtTime(0, t);
    for (const [tt, v, tc] of ev) env.gain.setTargetAtTime(v, tt, tc);
    env.gain.setTargetAtTime(0, endT, (o.tail || 1.2) / 3);
    const stop = endT + (o.tail || 1.2) + .1;
    s.connect(fl); fl.connect(env); env.connect(o.to || this.out);
    s.start(t, this.core.rand() * 2); s.stop(stop); this.until(stop);
    return env;
  }

  kill() {
    if (this.dead) return;
    this.dead = true;
    const now = this.core.ac.currentTime;
    try { this.out.gain.cancelScheduledValues(now); this.out.gain.setTargetAtTime(0, now, .012); } catch (e) { /* ok */ }
    this.end = now + .07;
  }
  release() { this._free(); }
}

/* A long-lived loop voice (rotor, fire, sea ...): a patch drives its own nodes; the slot owns the spatial chain. */
export class Slot extends Node_ {
  constructor(core, bus, patch, spatial) {
    super();
    this.core = core; this.nodes = []; this.srcs = []; this.bus = bus; this.patch = patch; this.spatial = spatial !== false;
    this.key = null; this.idle = 0; this.built = false; this.p = null; this.st = {};
  }
  build() {
    const ac = this.core.ac;
    this.out = this.gain(1);
    if (this.spatial) {
      this.lp = this.filter('lowpass', 8000, .5); this.pan = this.panner(0); this.dg = this.gain(0);
      this.out.connect(this.lp); this.lp.connect(this.pan); this.pan.connect(this.dg); this.dg.connect(this.bus);
      if (this.core.rev) { this.send = this.gain(0); this.dg.connect(this.send); this.send.connect(this.core.rev); }
    } else { this.dg = this.gain(0); this.out.connect(this.dg); this.dg.connect(this.bus); }
    this.p = this.patch(this, ac.currentTime + .01);
    this.built = true;
  }
  /* sp: { gain, cut, pan, send }; params go to the patch */
  set(sp, params, now) {
    if (!this.built) this.build();
    this.idle = 0;
    if (this.spatial) {
      follow(this.lp.frequency, sp.cut, now, .06); follow(this.pan.pan, sp.pan, now, .06);
      if (this.send) follow(this.send.gain, sp.send, now, .1);
    }
    follow(this.dg.gain, sp.gain, now, sp.tc || .06);
    if (this.p && this.p.set) this.p.set(params || {}, now);
  }
  quiet(now) { if (this.built) follow(this.dg.gain, 0, now, .12); }
  dispose() { if (!this.built) return; this._free(); this.built = false; this.p = null; this.key = null; this.st = {}; }
}

/* ------------------------------------------------------------------------------------------------------------ */

export class Core {
  constructor() {
    this.ac = null; this.bus = null; this.rev = null; this.bufs = null;
    this.live = 0; this.made = 0;
    this.voices = [];
    this.cap = { world: 26, sig: 8, ui: 8 };
    this.settings = getSettings();
    this.muted = false; this.trimV = 1;
    this.rand = rng(0x51A7E);
    this.meter = { out: 0, pre: 0, gr: 0 };           // running maxima (reset with resetMeter)
    this.now = { out: 0, pre: 0, gr: 0 };             // last frame
    this.onUnlock = [];
    this._waves = new Map();
    const un = () => this.unlock();
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, un, { capture: true });
    onSettings(s => { this.settings = s; this.apply(); });
    document.addEventListener('visibilitychange', () => {
      if (!this.ac) return;
      if (document.hidden) this.ac.suspend().catch(() => {}); else this.ac.resume().catch(() => {});
    });
    this._timer = setInterval(() => this.sweep(), 250);
  }

  get ready() { return !!this.ac && this.ac.state === 'running'; }

  unlock() {
    if (this.ac) { if (this.ac.state === 'suspended' && !document.hidden) this.ac.resume().catch(() => {}); return; }
    let ac;
    try { ac = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' }); }
    catch (e) { console.warn('audio: no AudioContext', e); return; }
    this.ac = ac;
    this.bufs = makeBuffers(ac, this.rand);
    const G = v => { const g = ac.createGain(); g.gain.value = v; this.live++; return g; };
    // master chain
    this.mix = G(.62);
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 24; hp.Q.value = .6;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 10; comp.ratio.value = 2.5; comp.attack.value = .006; comp.release.value = .28;
    const lim = ac.createDynamicsCompressor();
    lim.threshold.value = -4; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = .001; lim.release.value = .09;
    const clip = ac.createWaveShaper(); clip.curve = softClip(); clip.oversample = 'none';
    this.trimG = G(this.trimV);
    this.vol = G(0);
    this.meterPre = ac.createAnalyser(); this.meterPre.fftSize = 4096;
    this.meterOut = ac.createAnalyser(); this.meterOut.fftSize = 4096;
    this._buf = new Float32Array(4096);
    this.mix.connect(hp); hp.connect(comp); comp.connect(lim); lim.connect(clip); clip.connect(this.trimG); this.trimG.connect(this.vol);
    // meters: before the chain, and after the limiter / clip but before trim and volume (volume <= 1 only lowers it)
    this.vol.connect(ac.destination); clip.connect(this.meterOut); this.mix.connect(this.meterPre);
    this.comp = comp; this.lim = lim; this.live += 6;
    // buses
    this.bus = { world: G(1.6), amb: G(1), sig: G(1), ui: G(.8) };
    for (const k in this.bus) this.bus[k].connect(this.mix);
    // shared reverb: a dark outdoor tail (terrain, sea) that far sounds lean on
    const conv = ac.createConvolver(); conv.buffer = makeIR(ac, rng(77)); this.live++;
    this.rev = G(1); const rOut = G(.42);
    this.rev.connect(conv); conv.connect(rOut); rOut.connect(this.mix);
    this.apply();
    console.log(`audio: context ${ac.sampleRate} Hz, ${ac.state}`);
    for (const fn of this.onUnlock) { try { fn(this); } catch (e) { console.error(e); } }
  }

  apply() {
    if (!this.ac) return;
    const s = this.settings, t = this.ac.currentTime;
    this.vol.gain.setTargetAtTime(this.muted ? 0 : s.volume * s.volume * .95 + 1e-4, t, .03);
    this.bus.ui.gain.setTargetAtTime(s.uiSound ? .8 : 0, t, .02);
  }
  mute(on) { this.muted = on === undefined ? !this.muted : !!on; this.apply(); return this.muted; }
  trim(v) { this.trimV = v; if (this.ac) this.trimG.gain.setTargetAtTime(v, this.ac.currentTime, .03); }

  /* band-limited pulse train (duty 0..1) for gun gates and blade slap: output is 1 on the pulse, 0 off it
     when added to a gain whose base value is `duty` */
  pulseWave(duty) {
    const k = Math.round(duty * 100);
    let w = this._waves.get(k);
    if (!w) {
      const N = 40, re = new Float32Array(N + 1), im = new Float32Array(N + 1);
      for (let n = 1; n <= N; n++) re[n] = 2 / (n * Math.PI) * Math.sin(n * Math.PI * duty) * (1 - n / (N + 1));   // Fejer taper: no ringing
      w = { wave: this.ac.createPeriodicWave(re, im, { disableNormalization: true }), duty };
      this._waves.set(k, w);
    }
    return w;
  }

  /* a one-shot voice, or null when the cap is full of more important sounds. cls: 'world' | 'sig' | 'ui'.
     sp: spatial { gain, cut, pan, send } or null (straight to the bus) */
  voice(cls, prio, sp, name) {
    if (!this.ac || this.ac.state !== 'running') return null;
    const now = this.ac.currentTime;
    let n = 0, victim = null, vr = 1e9;
    for (const v of this.voices) {
      if (v.cls !== cls || v.dead) continue;
      n++;
      const age = clamp((now - v.t) / Math.max(.05, v.end - v.t), 0, 1);
      const r = v.prio + 3 * v.loud - 4 * age;
      if (r < vr) { vr = r; victim = v; }
    }
    if (n >= this.cap[cls]) {
      const mine = prio + 3 * (sp ? sp.gain : 1);
      if (!victim || vr >= mine) return null;
      victim.kill();
    }
    const v = new Voice(this, cls, this.bus[cls === 'world' ? 'world' : cls], prio, sp || null, name);
    this.voices.push(v);
    return v;
  }

  sweep() {
    if (!this.ac) return;
    const now = this.ac.currentTime;
    for (let i = this.voices.length - 1; i >= 0; i--) {
      const v = this.voices[i];
      if (now > v.end + .05) { v.release(); this.voices.splice(i, 1); }
    }
  }

  /* peak meters: call once per frame (the analysers hold ~85 ms, longer than a frame) */
  measure() {
    if (!this.ac) return this.now;
    const b = this._buf;
    let m = 0;
    this.meterOut.getFloatTimeDomainData(b);
    for (let i = 0; i < b.length; i++) { const a = b[i] < 0 ? -b[i] : b[i]; if (a > m) m = a; }
    let p = 0;
    this.meterPre.getFloatTimeDomainData(b);
    for (let i = 0; i < b.length; i++) { const a = b[i] < 0 ? -b[i] : b[i]; if (a > p) p = a; }
    const gr = p > .03 ? -(this.lim.reduction || 0) : 0;      // the reading is only meaningful with signal present
    this.now.out = m; this.now.pre = p; this.now.gr = gr;
    if (m > this.meter.out) this.meter.out = m;
    if (p > this.meter.pre) this.meter.pre = p;
    if (gr > this.meter.gr) this.meter.gr = gr;
    return this.now;
  }
  resetMeter() { this.meter.out = 0; this.meter.pre = 0; this.meter.gr = 0; }

  counts() {
    const c = { world: 0, sig: 0, ui: 0 };
    for (const v of this.voices) if (!v.dead) c[v.cls]++;
    return c;
  }
}

/* ------------------------------------------------------------------------------------------------------------ */

/* soft clip: identity to 0.8, then a tanh knee that never passes 0.99 */
function softClip() {
  const n = 4096, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1) * 2 - 1, a = Math.abs(x);
    const y = a < .8 ? a : .8 + .19 * Math.tanh((a - .8) / .19);
    c[i] = Math.sign(x) * y;
  }
  return c;
}

/* shared noise: white, pink, brown, crackle (sparse impulses). RMS-normalized so layer gains are comparable. */
function makeBuffers(ac, r) {
  const sr = ac.sampleRate, mk = (sec, fill, rms) => {
    const n = Math.floor(sr * sec), x = Math.floor(sr * .03), tmp = new Float32Array(n + x);
    fill(tmp);
    // seamless loop: the 30 ms that would follow the end are crossfaded into the head, so d[n-1] -> d[0] is continuous
    const b = ac.createBuffer(1, n, sr), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = i < x ? tmp[i] * (i / x) + tmp[n + i] * (1 - i / x) : tmp[i];
    let s = 0; for (let i = 0; i < n; i++) s += d[i] * d[i];
    const k = (rms || .3) / Math.sqrt(s / n);
    for (let i = 0; i < n; i++) d[i] = clamp(d[i] * k, -1, 1);
    return b;
  };
  const white = mk(3, d => { for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1; });
  const pink = mk(4, d => {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = r() * 2 - 1;
      b0 = .99886 * b0 + w * .0555179; b1 = .99332 * b1 + w * .0750759; b2 = .969 * b2 + w * .153852;
      b3 = .8665 * b3 + w * .3104856; b4 = .55 * b4 + w * .5329522; b5 = -.7616 * b5 - w * .016898;
      d[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * .5362; b6 = w * .115926;
    }
  });
  const brown = mk(4, d => { let l = 0; for (let i = 0; i < d.length; i++) { l = (l + .02 * (r() * 2 - 1)) / 1.02; d[i] = l; } });
  const crackle = mk(3, d => {
    // sparse clicks of random size, each a short decaying ring: fire, electrical arcing, debris, droplets
    let ring = 0, amp = 0, ph = 0, f = 0;
    for (let i = 0; i < d.length; i++) {
      if (r() < 60 / sr) { amp = Math.pow(r(), 2.2) * (r() < .5 ? -1 : 1); ring = 1; f = .3 + r() * 1.2; ph = 0; }
      ring *= .93; ph += f;
      d[i] = amp * ring * Math.cos(ph) + (r() * 2 - 1) * .002;
    }
  }, .12);
  return { white, pink, brown, crackle };
}

/* outdoor impulse response: a few sparse early reflections (ground, water) then a diffuse tail that darkens */
function makeIR(ac, r) {
  const sr = ac.sampleRate, len = Math.floor(sr * 2.6), b = ac.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr, k = .12 + .7 * Math.exp(-t / .5);          // one-pole coefficient: bright early, dark late
      lp += k * ((r() * 2 - 1) - lp);
      d[i] = lp * Math.exp(-t / .62) * (t < .012 ? t / .012 : 1);
    }
    for (let j = 0; j < 7; j++) {                                    // early reflections, decorrelated per channel
      const at = Math.floor(sr * (.025 + r() * .14)), g = (.5 + r() * .5) * Math.exp(-at / sr / .2);
      for (let i = 0; i < 90 && at + i < len; i++) d[at + i] += g * (r() * 2 - 1) * Math.exp(-i / 18);
    }
  }
  return b;
}
