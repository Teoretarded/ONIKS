/* ONIKS sound recipes. Restrained, cinematic and mechanical, like the films: short square blips for the
   interface, sines and filtered noise for the world. Levels are set at the reference distance of each sound;
   the spatial chain (distance gain, air-absorption lowpass, pan, reverb send) is applied by index.js.

   SHOTS[name](v, P): one-shots. v = Voice (tone / noise / burst / roll layers, all at v.t + at),
     P = { d: metres from the listener, near: 1 inside ~60 m .. 0 beyond ~1.5 km, far: 0 under ~0.8 km .. 1 past
           ~9 km, o: options, r: rng }.
   SPEC[name]: { cls 'world'|'sig'|'ui', prio, ref (m), roll (distance exponent), floor (far gain floor for big
     sounds), max (m, inaudible beyond), rev (reverb send), gap (s, same-name retrigger merge), delay (false:
     no sound-travel delay), minCut (Hz, least air-absorption lowpass), lvl (level trim, from the 50 m level
     sweep in game/audio.html, after the master chain: at 50 m a 3M55 hit peaks near -3 dBFS, a 5" report
     and a booster ignition -5.5, the Phalanx -9, a splash -12; at 15 m a crane clank or end stop about -20;
     interface blips -35 to -40) }.
   LOOPS[name](slot, t0) -> { set(params, now) }: long-lived patches (rotor, jet, fire, sea ...). */
import { clamp, follow } from './core.js';

const W = { cls: 'world', prio: 5, ref: 50, roll: .75, floor: 0, max: 8000, rev: .25, gap: .03 };
const S = { cls: 'sig', prio: 5, gap: .05 };
const U = { cls: 'ui', prio: 5, gap: .03 };
const spec = (base, o) => Object.assign({}, base, o);

export const SPEC = {
  // interface (ui bus: switched by the UI sound setting)
  select: spec(U), order: spec(U), invalid: spec(U, { gap: .12 }), rate: spec(U, { gap: .06 }), pause: spec(U, { gap: .1 }),
  resume: spec(U, { gap: .1 }), move: spec(U), tick: spec(U), enter: spec(U), back: spec(U), deny: spec(U, { gap: .12 }),
  start: spec(U),
  // sensors and alerts (sig bus: always on)
  alert: spec(S, { prio: 8, gap: 1.2 }), alarm: spec(S, { prio: 9, gap: 2.6 }), contact: spec(S, { gap: .25 }),
  contact_esm: spec(S, { gap: .25 }), classify: spec(S, { prio: 6, gap: .2 }), lost: spec(S, { prio: 3, gap: .3 }),
  sweep: spec(S, { prio: 2, gap: .08 }), confirm: spec(S, { gap: .1 }), objective: spec(S, { prio: 7, gap: .5 }),
  objective_lost: spec(S, { prio: 7, gap: .5 }), reinforce: spec(S, { gap: .4 }), radar_on: spec(S, { gap: .15 }),
  radar_off: spec(S, { gap: .15 }), damage: spec(S, { prio: 6, gap: .6 }),
  // the lime lightning scan (own: an interface effect, heard wherever the camera is; enemy: physical)
  scan_charge: spec(W, { lvl: 0.77, prio: 9, delay: false, ref: 800, roll: .5, floor: .45, max: 1e9, rev: .2, gap: .1, minCut: 6000 }),
  scan_strike: spec(W, { lvl: 0.6, prio: 9, delay: false, ref: 800, roll: .5, floor: .45, max: 1e9, rev: .3, gap: .1, minCut: 6000 }),
  scan_far: spec(W, { lvl: 0.6, prio: 6, ref: 100, roll: .7, floor: .04, max: 20000, rev: .3, gap: .1 }),
  // launches
  cold_launch: spec(W, { prio: 8, ref: 40, roll: .72, floor: .06, max: 25000 }),
  ignition: spec(W, { prio: 8, ref: 50, roll: .68, floor: .09, max: 40000, rev: .3 }),
  vls_launch: spec(W, { prio: 8, ref: 50, roll: .68, floor: .08, max: 40000, rev: .3 }),
  tube_launch: spec(W, { prio: 7, ref: 40, roll: .72, floor: .06, max: 25000 }),
  rail_launch: spec(W, { lvl: 0.87, prio: 5, ref: 30, roll: .8, floor: .02, max: 8000 }),
  sep: spec(W, { prio: 5, ref: 40, roll: .78, floor: .03, max: 15000 }),
  sonic_boom: spec(W, { lvl: 1.5, prio: 8, ref: 40, roll: .7, floor: 0, max: 5000, rev: .3, gap: .08 }),
  // guns
  gun5: spec(W, { prio: 6, ref: 50, roll: .68, floor: .08, max: 35000, rev: .35 }),
  gun30: spec(W, { lvl: 1.9, prio: 6, ref: 40, roll: .74, floor: .04, max: 15000, gap: .1 }),
  ciws: spec(W, { lvl: 2.6, prio: 6, ref: 40, roll: .74, floor: .04, max: 15000, gap: .1 }),
  // intercepts, hits, splashes, kills
  intercept: spec(W, { prio: 8, ref: 60, roll: .68, floor: .1, max: 50000, rev: .35, gap: .05 }),
  intercept_small: spec(W, { lvl: 1.6, prio: 6, ref: 40, roll: .74, floor: .05, max: 20000, rev: .3, gap: .05 }),
  explosion: spec(W, { lvl: 1.1, prio: 9, ref: 60, roll: .68, floor: .12, max: 60000, rev: .35, gap: .04 }),
  secondary: spec(W, { lvl: 1.25, prio: 9, ref: 60, roll: .68, floor: .12, max: 60000, rev: .35, gap: .2 }),
  cookoff: spec(W, { lvl: 0.9, prio: 7, ref: 50, roll: .72, floor: .06, max: 25000, rev: .3, gap: .2 }),
  airburst: spec(W, { prio: 7, ref: 60, roll: .7, floor: .08, max: 40000, rev: .35, gap: .05 }),
  hit_small: spec(W, { prio: 4, ref: 30, roll: .8, floor: .03, max: 8000, gap: .08 }),
  splash: spec(W, { prio: 4, ref: 40, roll: .78, floor: .04, max: 15000, gap: .06 }),
  crash: spec(W, { prio: 6, ref: 50, roll: .74, floor: .06, max: 25000, gap: .1 }),
  // weather
  thunder: spec(W, { prio: 8, ref: 600, roll: .55, floor: .2, max: 30000, rev: .3, gap: .15 }),
  // machinery
  clank: spec(W, { lvl: 0.69, prio: 3, ref: 15, roll: .9, max: 1500, rev: .15, gap: .06 }),
  clunk: spec(W, { lvl: 0.47, prio: 3, ref: 15, roll: .9, max: 1500, rev: .15, gap: .1 }),
  jacks_down: spec(W, { lvl: 0.4, prio: 3, ref: 15, roll: .9, max: 2000, rev: .15, gap: .1 }),
  jacks_up: spec(W, { lvl: 0.41, prio: 3, ref: 15, roll: .9, max: 1500, rev: .15, gap: .1 }),
  erect_stop: spec(W, { lvl: 0.52, prio: 4, ref: 15, roll: .9, max: 2000, rev: .15, gap: .1 }),
  lower_stop: spec(W, { lvl: 0.46, prio: 3, ref: 15, roll: .9, max: 1500, rev: .15, gap: .1 }),
  mast_stop: spec(W, { lvl: 0.46, prio: 3, ref: 15, roll: .9, max: 1500, rev: .15, gap: .1 }),
  seat: spec(W, { lvl: 0.58, prio: 4, ref: 15, roll: .9, max: 2000, rev: .15, gap: .1 }),
  crane_start: spec(W, { lvl: 0.71, prio: 3, ref: 15, roll: .9, max: 1500, rev: .15, gap: .1 }),
  radar_motor: spec(W, { lvl: 1.0, prio: 2, ref: 15, roll: 1, max: 700, rev: .1, gap: .2 }),
  catapult_steam: spec(W, { lvl: 1.2, prio: 4, ref: 40, roll: .8, max: 6000, rev: .25, gap: .2 }),
  catapult_drone: spec(W, { lvl: 1.3, prio: 3, ref: 20, roll: .9, max: 1500, gap: .2 }),
  trap: spec(W, { lvl: 0.9, prio: 3, ref: 30, roll: .85, max: 3000, gap: .2 }),
};

/* ------------------------------------------------------------------------------------------------------------ */
/* one-shots */

const sq = 'square', saw = 'sawtooth', tri = 'triangle';

export const SHOTS = {
  /* ---------- interface: the films' Point Cloud blips ---------- */
  select(v) { v.tone({ type: sq, f0: 1650, dur: .03, g: .013 }); v.tone({ type: sq, f0: 2475, dur: .025, g: .006, at: .028 }); },
  order(v) { v.tone({ type: sq, f0: 980, dur: .04, g: .013 }); v.tone({ type: sq, f0: 1470, dur: .05, g: .011, at: .055 }); },
  invalid(v) { v.tone({ type: sq, f0: 220, f1: 200, dur: .08, g: .02 }); v.tone({ type: sq, f0: 180, f1: 170, dur: .09, g: .016, at: .1 }); },
  rate(v, P) {
    const r = P.o.rate || 1, up = P.o.up !== false, f = 700 * Math.pow(2, Math.log2(Math.max(1, r)) / 3);
    v.tone({ type: sq, f0: up ? f * .8 : f * 1.25, f1: f, dur: .05, g: .012 });
    if (r === 1 && !up) v.tone({ type: sq, f0: f, dur: .03, g: .01, at: .07 });     // the auto drop to x1: a second tick
  },
  pause(v) { v.tone({ type: sq, f0: 900, f1: 600, dur: .09, g: .012 }); v.tone({ type: sq, f0: 450, dur: .05, g: .008, at: .1 }); },
  resume(v) { v.tone({ type: sq, f0: 600, f1: 900, dur: .08, g: .012 }); },
  move(v) { v.tone({ type: sq, f0: 1500, dur: .018, g: .018 }); },
  tick(v) { v.tone({ type: sq, f0: 1900, dur: .014, g: .014 }); },
  enter(v) { v.tone({ type: sq, f0: 420, f1: 840, dur: .09, g: .02 }); v.tone({ type: sq, f0: 1260, dur: .05, g: .015, at: .07 }); },
  back(v) { v.tone({ type: sq, f0: 840, f1: 420, dur: .08, g: .016 }); },
  deny(v) { v.tone({ type: sq, f0: 220, f1: 200, dur: .08, g: .02 }); },
  start(v) {
    SHOTS.enter(v);
    v.noise({ buf: 'white', dur: 1.6, f: 150, q: 1, g: .16, a: .35, at: .05 });
    v.noise({ buf: 'white', dur: .8, f: 900, q: .5, g: .03, a: .2, at: .05 });
  },

  /* ---------- sensors ---------- */
  alert(v) {                            // lime: a new hostile contact
    v.tone({ type: sq, f0: 1500, dur: .03, g: .014 }); v.tone({ type: sq, f0: 1500, dur: .03, g: .014, at: .13 });
    v.tone({ type: sq, f0: 2250, dur: .04, g: .009, at: .26 });
  },
  alarm(v) {                            // incoming rounds: a restrained two-tone, four pulses
    for (let i = 0; i < 4; i++) v.tone({ type: sq, f0: i & 1 ? 885 : 1180, dur: .07, g: .012, a: .003, hold: .045, at: i * .13 });
    v.tone({ type: tri, f0: 590, dur: .5, g: .01, a: .01 });
  },
  contact(v) { v.tone({ type: sq, f0: 1650, dur: .05, g: .012 }); },
  contact_esm(v) { v.tone({ type: sq, f0: 980, dur: .04, g: .01 }); v.tone({ type: sq, f0: 980, dur: .04, g: .008, at: .09 }); },
  classify(v) { v.tone({ type: sq, f0: 1250, dur: .05, g: .014 }); v.tone({ type: sq, f0: 1875, dur: .06, g: .01, at: .08 }); },
  lost(v) { v.tone({ type: sq, f0: 840, f1: 420, dur: .08, g: .008 }); },
  sweep(v) { v.tone({ type: sq, f0: 2100, dur: .012, g: .01 }); },
  confirm(v) { v.tone({ type: sq, f0: 1650, dur: .05, g: .012 }); },
  objective(v) { v.tone({ type: sq, f0: 420, f1: 840, dur: .09, g: .018 }); v.tone({ type: sq, f0: 1260, dur: .06, g: .014, at: .07 }); v.tone({ type: sq, f0: 1680, dur: .08, g: .01, at: .15 }); },
  objective_lost(v) { v.tone({ type: sq, f0: 840, f1: 420, dur: .1, g: .018 }); v.tone({ type: sq, f0: 280, dur: .12, g: .014, at: .1 }); },
  reinforce(v) { v.tone({ type: sq, f0: 1260, dur: .04, g: .012 }); v.tone({ type: sq, f0: 1680, dur: .05, g: .01, at: .06 }); },
  radar_on(v) { v.tone({ type: sq, f0: 980, f1: 1470, dur: .08, g: .01 }); },
  radar_off(v) { v.tone({ type: sq, f0: 1470, f1: 980, dur: .08, g: .009 }); },
  damage(v) { v.tone({ type: sq, f0: 330, f1: 300, dur: .1, g: .014 }); v.tone({ type: sq, f0: 330, f1: 300, dur: .1, g: .012, at: .16 }); },

  /* ---------- the lime lightning scan ---------- */
  scan_charge(v, P) {                   // the bolt gathering: a rising electrical zap over the order-to-strike delay
    const T = clamp(P.o.dur || 1.6, .15, 2.5);
    v.tone({ type: saw, f0: 90, f1: 1500, dur: T + .05, g: .01, a: T * .85 });
    v.noise({ buf: 'crackle', dur: T + .05, ft: 'bandpass', f: 900, f1: 5200, q: .9, g: .09, a: T * .9 });
    v.tone({ f0: 38, f1: 62, dur: T + .05, g: .05, a: T * .8 });
  },
  scan_strike(v, P) {                   // the strike: a rising zap, electrical crackle, a sub thump, then the front sweeping out
    const n = P.near;
    v.tone({ type: saw, f0: 300, f1: 5200, dur: .07, g: .018, a: .06, glide: 'exp' });
    v.noise({ buf: 'crackle', at: .06, dur: .6, ft: 'highpass', f: 2200, q: .5, g: .5, a: .002 });
    v.noise({ buf: 'white', at: .06, dur: .1, ft: 'bandpass', f: 3800, q: .7, g: .12 * (.4 + .6 * n), a: .001 });
    v.tone({ type: saw, f0: 3000, f1: 160, dur: .18, g: .02, a: .001, at: .06 });
    v.tone({ f0: 58, f1: 29, dur: .8, g: .3, a: .004, at: .06 });
    v.noise({ buf: 'brown', at: .06, dur: 1, ft: 'lowpass', f: 190, q: .8, g: .35, a: .006 });
    v.tone({ type: sq, f0: 980, dur: .05, g: .012, at: .2 });
    v.noise({ buf: 'white', at: .16, dur: 1.4, ft: 'bandpass', f: 1300, f1: 4400, q: 1.3, g: .05, a: 1.0 });
  },

  /* ---------- launches ---------- */
  cold_launch(v, P) {                   // TLC gas-generator ejection: cap pop, gas slam, thump, venting hiss
    const n = P.near;
    if (n > .02) v.noise({ buf: 'white', dur: .05, ft: 'bandpass', f: 2400, q: .8, g: .16 * n, a: .001 });
    v.tone({ f0: 130, f1: 46, dur: .55, g: .22, a: .004 });
    v.noise({ buf: 'white', dur: .75, ft: 'lowpass', f: 1000, f1: 380, q: .8, g: .3, a: .005 });
    v.noise({ buf: 'brown', dur: .9, ft: 'lowpass', f: 260, q: .8, g: .3, a: .006 });
    v.noise({ buf: 'white', at: .05, dur: 1.8, ft: 'highpass', f: 2800, q: .5, g: .06 * (.3 + .7 * n), a: .03 });
  },
  ignition(v, P) {                      // the booster lights: a hard bang (the roar itself is the tracked missile voice)
    const n = P.near;
    if (n > .02) v.noise({ buf: 'white', dur: .16, ft: 'bandpass', f: 2800, q: .5, g: .2 * n, a: .002 });
    v.tone({ f0: 88, f1: 36, dur: 1, g: .2, a: .006 });
    v.noise({ buf: 'brown', dur: 1.4, ft: 'lowpass', f: 320, q: .8, g: .45, a: .01 });
    if (P.far > .05) v.noise({ buf: 'brown', at: .4, dur: 2.6, ft: 'lowpass', f: 150, g: .25 * P.far, a: .3 });
  },
  vls_launch(v, P) {                    // Mk 41: hatch, then the blast up the uptake
    const n = P.near;
    v.tone({ type: sq, f0: 170, f1: 95, dur: .14, g: .03 * (.3 + .7 * n) });
    v.noise({ buf: 'white', dur: .25, ft: 'lowpass', f: 700, q: .6, g: .05 * (.3 + .7 * n), a: .005 });
    if (n > .02) v.noise({ buf: 'white', at: .2, dur: .14, ft: 'bandpass', f: 3000, q: .5, g: .16 * n, a: .002 });
    v.noise({ buf: 'brown', at: .2, dur: 2.6, ft: 'lowpass', f: 280, q: .8, g: .45, a: .03 });
    v.noise({ buf: 'white', at: .2, dur: 1.8, ft: 'bandpass', f: 1300, q: .5, g: .09, a: .04 });
    v.tone({ f0: 56, f1: 34, dur: 2.6, g: .14, a: .02, at: .2 });
  },
  tube_launch(v, P) {                   // 57E6 off the Pantsir: a sharp bang and a short tearing whoosh
    const n = P.near;
    if (n > .02) v.noise({ buf: 'white', dur: .08, ft: 'bandpass', f: 3500, q: .5, g: .22 * n, a: .001 });
    v.noise({ buf: 'brown', dur: 1, ft: 'lowpass', f: 360, q: .8, g: .4, a: .004 });
    v.tone({ f0: 95, f1: 40, dur: .6, g: .16, a: .003 });
    v.noise({ buf: 'white', at: .03, dur: 1.1, ft: 'bandpass', f: 1900, f1: 800, q: .6, g: .08, a: .02 });
  },
  rail_launch(v, P) {                   // off an aircraft rail: a whoosh away
    v.noise({ buf: 'white', dur: 1.2, ft: 'bandpass', f: 1600, f1: 650, q: .6, g: .09, a: .03 });
    v.tone({ f0: 90, f1: 48, dur: .35, g: .06 });
    if (P.near > .05) v.noise({ buf: 'crackle', dur: .8, ft: 'highpass', f: 2000, g: .12 * P.near, a: .01 });
  },
  sep(v, P) {                           // booster separation: a crack and a short thud
    if (P.near > .02) v.noise({ buf: 'white', dur: .25, ft: 'bandpass', f: 4200, q: .45, g: .1 * P.near, a: .002 });
    v.noise({ buf: 'brown', dur: 1.2, ft: 'lowpass', f: 230, q: .9, g: .22, a: .01 });
    v.tone({ f0: 110, f1: 55, dur: .4, g: .05 });
  },
  sonic_boom(v) {                       // a supersonic round passing: the N-wave, a sharp double crack
    v.noise({ buf: 'white', dur: .07, ft: 'bandpass', f: 1800, q: .4, g: .34, a: .0008 });
    v.noise({ buf: 'white', at: .022, dur: .09, ft: 'bandpass', f: 1500, q: .4, g: .3, a: .0008 });
    v.tone({ f0: 66, f1: 34, dur: .35, g: .2, a: .002 });
    v.noise({ buf: 'brown', dur: .9, ft: 'lowpass', f: 260, g: .2, a: .004 });
  },

  /* ---------- guns ---------- */
  gun5(v, P) {                          // Mk 45 5"/62: crack, blast, thump, and the report rolling off the water
    const n = P.near, f = P.far;
    if (n > .02) v.noise({ buf: 'white', dur: .09, ft: 'bandpass', f: 3200, q: .45, g: .3 * n, a: .001 });
    v.noise({ buf: 'brown', dur: 1.2, ft: 'lowpass', f: 440, f1: 110, q: .8, g: .55, a: .003 });
    v.tone({ f0: 74, f1: 30, dur: .85, g: .24, a: .003 });
    v.roll({ at: .08, buf: 'pink', f: 300, q: .7, g: .07 + .1 * f, bumps: [[0, 1, 1.4], [.45 + .5 * f, .6, 1.6], [1.1 + f, .35, 1.8]], tail: 1.2 });
  },
  gun30(v, P) {                         // 2A38M pair: ~83 rounds a second, a tearing burst
    const d = clamp(P.o.dur || 1, .12, 3), n = P.near;
    v.burst({ rate: 83, dur: d, f: 1700, q: .75, g: .3, duty: .22, body: .06 * (.3 + .7 * n), bodyF: 83, bodyLp: 520 });
    if (n > .05) v.burst({ rate: 83, dur: d, f: 5200, q: .6, g: .12 * n, duty: .12 });
    v.noise({ buf: 'brown', at: d, dur: 1.5, ft: 'lowpass', f: 280, q: .7, g: .16, a: .03 });
  },
  ciws(v, P) {                          // Phalanx M61A1: 4,500 rounds a minute, the buzz
    const d = clamp(P.o.dur || 1, .12, 3), n = P.near;
    v.burst({ rate: 75, dur: d, f: 2300, q: .7, g: .26, duty: .35, body: .07, bodyF: 75, bodyLp: 600 });
    v.tone({ type: sq, f0: 150, f1: 146, dur: d, g: .014, a: .01, hold: d * .8 });
    if (n > .1) v.tone({ f0: 1500, f1: 1450, dur: d + .4, g: .006 * n, a: .05, hold: d });
    v.noise({ buf: 'brown', at: d, dur: 1.3, ft: 'lowpass', f: 300, q: .7, g: .12, a: .03 });
  },

  /* ---------- intercepts, hits, kills ---------- */
  intercept(v, P) {                     // an interceptor meets its round high up: crack, pop, fragments, roll
    const n = P.near, f = P.far;
    if (n > .02) v.noise({ buf: 'white', dur: .22, ft: 'bandpass', f: 4600, q: .5, g: .22 * n, a: .002 });
    v.noise({ buf: 'white', dur: 1.2, ft: 'lowpass', f: 450, q: .7, g: .3, a: .008 });
    v.noise({ buf: 'brown', dur: 1.6, ft: 'lowpass', f: 220, q: .8, g: .3, a: .01 });
    v.tone({ f0: 96, f1: 44, dur: 1, g: .14, a: .004 });
    if (n > .05) v.noise({ buf: 'crackle', at: .12, dur: 1.6, ft: 'highpass', f: 2200, q: .5, g: .25 * n, a: .15 });
    if (f > .05) v.roll({ at: .3, f: 150, g: .22 * f, bumps: [[0, 1, 1.6], [.7, .5, 2]], tail: 1.4 });
  },
  intercept_small(v, P) {               // a gun kill: a smaller, sharper pop
    const n = P.near;
    if (n > .02) v.noise({ buf: 'white', dur: .12, ft: 'bandpass', f: 4000, q: .5, g: .14 * n, a: .001 });
    v.noise({ buf: 'white', dur: .8, ft: 'lowpass', f: 520, q: .7, g: .18, a: .005 });
    v.tone({ f0: 120, f1: 60, dur: .5, g: .08 });
    if (n > .05) v.noise({ buf: 'crackle', at: .08, dur: 1, ft: 'highpass', f: 2500, g: .16 * n, a: .1 });
  },
  explosion(v, P) {                     // a hit: near = crack + blast + debris; far = the low boom, rolling
    const s = clamp(P.o.size === undefined ? .7 : P.o.size, .1, 1.2), n = P.near, f = P.far, L = .55 + .45 * s;
    if (n > .02) v.noise({ buf: 'white', dur: .3 * L, ft: 'bandpass', f: 4200, q: .5, g: .26 * s * n, a: .002 });
    v.noise({ buf: 'brown', dur: 5 * L, ft: 'lowpass', f: 170 + 260 * n, f1: 70, q: .9, g: .7 * (.45 + .55 * s), a: .012 });
    v.tone({ f0: 62, f1: 22, dur: 4.2 * L, g: .2 * (.4 + .6 * s), a: .01 });
    v.noise({ buf: 'pink', at: .15, dur: 4 * L, ft: 'lowpass', f: 700, q: .6, g: .12 * s, a: .5 });
    if (n > .05) v.noise({ buf: 'crackle', at: .25, dur: 2.8 * L, ft: 'bandpass', f: 2600, q: .6, g: .4 * s * n, a: .3 });
    if (P.o.metal && n > .1) {           // a hull: the steel rings
      v.tone({ f0: 312, f1: 296, dur: 1.1, g: .025 * n, a: .002 });
      v.tone({ f0: 471, f1: 452, dur: .8, g: .016 * n, a: .002, at: .01 });
      v.tone({ f0: 1133, f1: 1100, dur: .4, g: .008 * n, a: .001, at: .01 });
    }
    if (f > .05) v.roll({ at: .45, f: 140, g: .3 * f * s, bumps: [[0, 1, 2], [.6 + .8 * f, .55, 2.4], [1.7 + 1.5 * f, .3, 2.8]], tail: 1.8 });
  },
  secondary(v, P) {                     // a ship's magazine or fuel going: a bigger, longer blast with a second one
    SHOTS.explosion(v, { ...P, o: { size: 1.1, metal: true } });
    v.noise({ buf: 'brown', at: 1.3, dur: 4, ft: 'lowpass', f: 200, q: .8, g: .4, a: .05 });
    v.tone({ f0: 50, f1: 24, dur: 3.5, g: .14, at: 1.3 });
    if (P.near > .05) v.noise({ buf: 'crackle', at: 1.4, dur: 3, ft: 'bandpass', f: 1800, q: .6, g: .3 * P.near, a: .4 });
  },
  cookoff(v, P) {                       // a vehicle's own load going up: a blast and popping rounds
    SHOTS.explosion(v, { ...P, o: { size: .55 } });
    const r = P.r;
    if (P.near > .05) for (let i = 0; i < 5; i++) v.noise({ buf: 'white', at: .8 + r() * 2.8, dur: .12, ft: 'bandpass', f: 1400 + r() * 1400, q: .7, g: .1 * P.near, a: .001 });
  },
  airburst(v, P) {                      // an aircraft or drone hit in the air
    const s = clamp(P.o.size === undefined ? .6 : P.o.size, .1, 1);
    if (P.near > .02) v.noise({ buf: 'white', dur: .2, ft: 'bandpass', f: 4000, q: .5, g: .2 * s * P.near, a: .002 });
    v.noise({ buf: 'brown', dur: 2.6 * (.5 + .5 * s), ft: 'lowpass', f: 260, q: .8, g: .5 * s, a: .008 });
    v.tone({ f0: 80, f1: 34, dur: 1.6 * (.5 + .5 * s), g: .14 * s });
    if (P.near > .05) v.noise({ buf: 'crackle', at: .2, dur: 2, ft: 'highpass', f: 1800, g: .25 * s * P.near, a: .2 });
    if (P.far > .05) v.roll({ at: .4, f: 140, g: .2 * P.far * s, bumps: [[0, 1, 1.8], [.9, .5, 2.2]], tail: 1.4 });
  },
  hit_small(v, P) {                     // cannon rounds striking: a few pops and ricochets
    const r = P.r;
    for (let i = 0; i < 4; i++) v.noise({ buf: 'white', at: r() * .3, dur: .06, ft: 'bandpass', f: 1500 + r() * 1500, q: .8, g: .14, a: .001 });
    v.tone({ f0: 140, f1: 70, dur: .15, g: .05 });
    if (P.near > .05) v.noise({ buf: 'crackle', at: .1, dur: .7, ft: 'highpass', f: 2500, g: .15 * P.near, a: .05 });
  },
  splash(v, P) {                        // into the sea: a whump, the column of spray, the spray falling back
    const s = clamp(P.o.size === undefined ? .6 : P.o.size, .1, 1.2);
    v.tone({ f0: 76, f1: 38, dur: .5, g: .14 * s, a: .004 });
    v.noise({ buf: 'white', dur: 1.5 * (.6 + .4 * s), ft: 'bandpass', f: 950, f1: 420, q: .6, g: .2 * s, a: .015 });
    v.noise({ buf: 'brown', dur: 1, ft: 'lowpass', f: 300, g: .2 * s, a: .01 });
    if (P.near > .05) v.noise({ buf: 'crackle', at: .3, dur: 1.8, ft: 'highpass', f: 2600, g: .2 * s * P.near, a: .25 });
  },
  crash(v, P) {                         // an aircraft into the ground
    SHOTS.explosion(v, { ...P, o: { size: .5 } });
    v.noise({ buf: 'white', dur: .7, ft: 'lowpass', f: 700, q: .8, g: .14, a: .01 });
    if (P.near > .05) v.noise({ buf: 'crackle', dur: 1, ft: 'bandpass', f: 1300, q: .7, g: .25 * P.near, a: .01 });
  },

  /* ---------- weather ---------- */
  thunder(v, P) {                       // near: the tearing crack of the channel; always: the roll along its length
    const d = P.d, n = clamp(1 - (d - 400) / 3200, 0, 1), L = 4.5 + d / 3000;
    if (n > .02) {
      v.noise({ buf: 'crackle', dur: .5, ft: 'highpass', f: 1500, q: .5, g: .7 * n, a: .003 });
      v.noise({ buf: 'white', dur: .35, ft: 'bandpass', f: 2200, q: .5, g: .2 * n, a: .002 });
      v.noise({ buf: 'white', dur: 1, ft: 'lowpass', f: 1800, q: .6, g: .14 * n, a: .004 });
    }
    const bumps = P.o.roll && P.o.roll.length ? P.o.roll : [[0, 1, 2.5], [.8, .6, 3], [2, .4, 3.5]];
    v.roll({ buf: 'brown', f: 130 + 300 * n, q: .8, g: .8, bumps, tail: L * .5 });
    v.roll({ buf: 'pink', f: 380 + 800 * n, q: .6, g: .12, bumps, tail: L * .3 });
    v.tone({ f0: 38, f1: 26, dur: 3 + L * .3, g: .1, a: .08 });
  },

  /* ---------- machinery ---------- */
  clank(v, P) {                         // chain / crane / latch: inharmonic steel
    const r = P.r, f0 = 360 + r() * 420, g = P.o.g || 1;
    const ks = [1, 2.76 + r() * .2, 5.4 + r() * .3], gs = [.035, .02, .011];
    ks.forEach((k, i) => v.tone({ f0: f0 * k, f1: f0 * k * .995, dur: .55 - i * .13, g: gs[i] * g, a: .001 }));
    v.noise({ buf: 'white', dur: .04, ft: 'bandpass', f: 3000, q: 1, g: .08 * g, a: .001 });
    v.tone({ f0: 120, f1: 70, dur: .18, g: .06 * g });
  },
  clunk(v) {                            // a hydraulic end stop and latch
    v.tone({ f0: 110, f1: 68, dur: .25, g: .1 });
    v.noise({ buf: 'brown', dur: .3, ft: 'lowpass', f: 500, g: .22, a: .004 });
    v.tone({ type: sq, f0: 160, f1: 120, dur: .12, g: .018, at: .05 });
    v.noise({ buf: 'white', at: .08, dur: .8, ft: 'highpass', f: 3200, g: .025, a: .05 });
  },
  jacks_down(v) {                       // outriggers on the ground: the weight settles
    v.tone({ f0: 92, f1: 42, dur: .38, g: .14 });
    v.noise({ buf: 'brown', dur: .5, ft: 'lowpass', f: 300, g: .3, a: .005 });
    v.noise({ buf: 'white', at: .12, dur: .7, ft: 'highpass', f: 3000, g: .03, a: .05 });
    v.tone({ type: sq, f0: 160, f1: 120, dur: .12, g: .016, at: .25 });
  },
  jacks_up(v) { v.tone({ f0: 120, f1: 80, dur: .2, g: .08 }); v.noise({ buf: 'brown', dur: .25, ft: 'lowpass', f: 450, g: .16, a: .004 }); v.tone({ type: sq, f0: 160, f1: 120, dur: .12, g: .016, at: .1 }); },
  erect_stop(v) {                       // the launcher vertical: end stop, two latches, pressure release
    SHOTS.clunk(v);
    v.tone({ type: sq, f0: 170, f1: 125, dur: .1, g: .016, at: .2 });
    v.noise({ buf: 'white', at: .3, dur: 1.2, ft: 'highpass', f: 2800, g: .03, a: .1 });
  },
  lower_stop(v) { SHOTS.clunk(v); },
  mast_stop(v) { v.tone({ f0: 140, f1: 90, dur: .2, g: .07 }); v.noise({ buf: 'brown', dur: .2, ft: 'lowpass', f: 600, g: .14, a: .003 }); v.tone({ type: sq, f0: 190, f1: 150, dur: .08, g: .014, at: .06 }); },
  seat(v, P) {                          // a round seated in the launcher (the films' reload cue) and a clank
    v.tone({ f0: 110, f1: 70, dur: .25, g: .12 });
    v.noise({ buf: 'white', dur: .3, ft: 'lowpass', f: 500, q: 1, g: .14, a: .005 });
    v.t += .12; SHOTS.clank(v, { ...P, o: { g: .7 } }); v.t -= .12;
  },
  crane_start(v, P) { v.tone({ type: saw, f0: 120, f1: 210, dur: .6, g: .012, a: .2 }); SHOTS.clank(v, { ...P, o: { g: .6 } }); },
  radar_motor(v, P) {                   // antenna drive spinning up / down
    const on = P.o.on !== false;
    v.tone({ f0: on ? 140 : 620, f1: on ? 620 : 120, dur: on ? 1.4 : 1.8, g: .03, a: on ? .6 : .05 });
    v.tone({ type: sq, f0: 200, dur: .03, g: .02 });
  },
  catapult_steam(v) {                   // C-13 stroke: the hiss builds, the shuttle slams into the water brake
    v.noise({ buf: 'white', dur: 2.4, ft: 'highpass', f: 1600, f1: 3200, q: .5, g: .08, a: 1.9 });
    v.noise({ buf: 'brown', at: 2.2, dur: .7, ft: 'lowpass', f: 320, g: .3, a: .004 });
    v.tone({ f0: 62, f1: 34, dur: .5, g: .12, at: 2.2 });
  },
  catapult_drone(v) {                   // the Orlan-10 rail: a pneumatic rush and the carriage stop
    v.noise({ buf: 'white', dur: .45, ft: 'bandpass', f: 900, f1: 2400, q: .7, g: .1, a: .02 });
    v.noise({ buf: 'white', at: .42, dur: .07, ft: 'bandpass', f: 1400, q: .8, g: .12, a: .001 });
    v.tone({ f0: 160, f1: 80, dur: .2, g: .06, at: .42 });
  },
  trap(v) { v.tone({ f0: 70, f1: 40, dur: .4, g: .12 }); v.noise({ buf: 'white', dur: .9, ft: 'bandpass', f: 600, q: .8, g: .06, a: .01 }); },
};
SHOTS.scan_far = SHOTS.scan_strike;

/* ------------------------------------------------------------------------------------------------------------ */
/* loops: patch(slot, t0) builds into slot.out and returns { set(params, now) } */

const run = (s, t0, off) => { s.start(t0, off || 0); return s; };
const chain = (...n) => { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); return n[n.length - 1]; };

export const LOOPS = {
  /* a missile or rocket: booster roar + crackle, sustainer hiss; k = doppler factor */
  missile(S, t0) {
    const r = S.core.rand;
    const rs = run(S.src('brown'), t0, r() * 3), rl = S.filter('lowpass', 480, .6), rg = S.gain(0);
    const hs = run(S.src('white'), t0, r() * 2), hb = S.filter('bandpass', 1500, .55), hg = S.gain(0);
    const cs = run(S.src('crackle'), t0, r() * 2), ch = S.filter('highpass', 1800, .5), cg = S.gain(0);
    const js = run(S.src('white'), t0, r() * 2), jb = S.filter('bandpass', 2600, 1.2), jg = S.gain(0);
    const so = S.osc('sine', 44), sg = S.gain(0); so.start(t0);
    const wo = S.osc('triangle', 2900), wg = S.gain(0); wo.start(t0);                 // turbofan whine (Tomahawk, SLAM-ER)
    chain(rs, rl, rg, S.out); chain(hs, hb, hg, S.out); chain(cs, ch, cg, S.out); chain(js, jb, jg, S.out); chain(so, sg, S.out); chain(wo, wg, S.out);
    return {
      set(p, now) {
        const k = clamp(p.k || 1, .3, 2.5), b = p.boost || 0, s = p.sus || 0, ram = p.ram ? 1 : 0;
        follow(rg.gain, .5 * b + (.14 + .08 * ram) * s, now, .04); follow(rl.frequency, 480 * k, now, .04);
        follow(hg.gain, .16 * b + .06 * s, now, .04); follow(hb.frequency, 1500 * k, now, .04);
        follow(cg.gain, .5 * b, now, .04); follow(cs.playbackRate, k, now, .04);
        follow(jg.gain, (.22 + .14 * ram) * s + .02 * b, now, .04); follow(jb.frequency, (ram ? 2600 : 3400) * k, now, .04);
        follow(sg.gain, .08 * b, now, .04); follow(so.frequency, 44 * k, now, .04);
        follow(wg.gain, .014 * s * (1 - ram), now, .04); follow(wo.frequency, 2900 * k, now, .04);
      },
    };
  },

  /* F/A-18E: F414 roar, hiss, turbine whine; afterburner deepens the roar */
  jet(S, t0) {
    const r = S.core.rand;
    const rs = run(S.src('brown'), t0, r() * 3), rl = S.filter('lowpass', 700, .6), rg = S.gain(0);
    const hs = run(S.src('white'), t0, r() * 2), hb = S.filter('bandpass', 2600, 1), hg = S.gain(0);
    const wo = S.osc('triangle', 3100), wg = S.gain(0); wo.start(t0);
    chain(rs, rl, rg, S.out); chain(hs, hb, hg, S.out); chain(wo, wg, S.out);
    return {
      set(p, now) {
        const k = clamp(p.k || 1, .3, 2.5), ab = p.ab || 0;
        follow(rg.gain, .9 * (.75 + .45 * ab), now, .04); follow(rl.frequency, 720 * k * (1 - .25 * ab), now, .04);
        follow(hg.gain, .16, now, .04); follow(hb.frequency, 2600 * k, now, .04);
        follow(wg.gain, .012 * (1 - .5 * ab), now, .04); follow(wo.frequency, 3100 * k, now, .04);
      },
    };
  },

  /* MH-60R: blade slap (4 blades x 258 rpm = 17.2 Hz), turbine whine, tail rotor buzz */
  rotor(S, t0) {
    const r = S.core.rand, W = S.core.pulseWave(.16);
    const ps = S.osc(W.wave, 17.2); ps.start(t0);
    const bs = run(S.src('brown'), t0, r() * 3), bl = S.filter('lowpass', 300, .7), slap = S.gain(W.duty), sg = S.gain(0);
    const ws = run(S.src('white'), t0, r() * 2), wb = S.filter('bandpass', 900, .8), swish = S.gain(W.duty), swg = S.gain(0), pd = S.gain(.7);
    ps.connect(slap.gain); ps.connect(pd); pd.connect(swish.gain);
    chain(bs, bl, slap, sg, S.out); chain(ws, wb, swish, swg, S.out);
    const t1 = S.osc('sine', 1180), t2 = S.osc('sine', 2360), tg = S.gain(0); t1.start(t0); t2.start(t0);
    const t2g = S.gain(.4); t1.connect(tg); chain(t2, t2g, tg); tg.connect(S.out);
    const tr = S.osc('sawtooth', 79), tl = S.filter('lowpass', 450, .7), trg = S.gain(0); tr.start(t0);
    chain(tr, tl, trg, S.out);
    return {
      set(p, now) {
        const k = clamp(p.k || 1, .4, 2.2), on = p.on === undefined ? 1 : p.on;
        follow(ps.frequency, 17.2 * k * (.3 + .7 * on), now, .08);
        follow(sg.gain, .45 * on, now, .06); follow(swg.gain, .06 * on, now, .06); follow(wb.frequency, 900 * k, now, .06);
        follow(tg.gain, .004 * on, now, .06); follow(t1.frequency, 1180 * k * (.4 + .6 * on), now, .08); follow(t2.frequency, 2360 * k * (.4 + .6 * on), now, .08);
        follow(trg.gain, .015 * on, now, .06); follow(tr.frequency, 79 * k * (.3 + .7 * on), now, .08);
      },
    };
  },

  /* Orlan-10: a small piston engine and a two-blade prop */
  drone(S, t0) {
    const r = S.core.rand;
    const e1 = S.osc('sawtooth', 117), e2 = S.osc('square', 234), bp = S.filter('bandpass', 650, 1.1), eg = S.gain(0);
    const j = S.osc('sine', 5.5), jg = S.gain(2.5); j.connect(jg); jg.connect(e1.frequency); jg.connect(e2.frequency);
    const e2g = S.gain(.35); e1.connect(bp); chain(e2, e2g, bp); chain(bp, eg, S.out);
    const ns = run(S.src('white'), t0, r() * 2), nb = S.filter('bandpass', 3200, 1), ng = S.gain(0);
    chain(ns, nb, ng, S.out);
    e1.start(t0); e2.start(t0); j.start(t0);
    return {
      set(p, now) {
        const k = clamp(p.k || 1, .5, 2);
        follow(e1.frequency, 117 * k, now, .06); follow(e2.frequency, 234 * k, now, .06);
        follow(eg.gain, .05, now, .06); follow(ng.gain, .03, now, .06); follow(nb.frequency, 3200 * k, now, .06);
      },
    };
  },

  /* a burning vehicle or hull: crackle, pops, roar */
  fire(S, t0) {
    const r = S.core.rand;
    const c1 = run(S.src('crackle'), t0, r() * 2), b1 = S.filter('bandpass', 2200, .6), g1 = S.gain(0);
    const c2 = run(S.src('crackle', .45), t0, r() * 2), l2 = S.filter('lowpass', 900, .7), g2 = S.gain(0);
    const rs = run(S.src('brown'), t0, r() * 3), rl = S.filter('lowpass', 220, .7), g3 = S.gain(0);
    chain(c1, b1, g1, S.out); chain(c2, l2, g2, S.out); chain(rs, rl, g3, S.out);
    return {
      set(p, now) {
        const i = clamp(p.i || 0, 0, 1);
        follow(g1.gain, .15 * i, now, .2); follow(g2.gain, .15 * i, now, .2); follow(g3.gain, .12 * i, now, .2);
      },
    };
  },

  /* a hull going down: steel groaning, air venting, water rushing in */
  sink(S, t0) {
    const r = S.core.rand;
    const o1 = S.osc('sawtooth', 46), o2 = S.osc('sawtooth', 69.5), bp = S.filter('bandpass', 230, 2.5), am = S.gain(.5), gg = S.gain(0);
    const l1 = S.osc('sine', .13), l1g = S.gain(7), l2 = S.osc('sine', .071), l2g = S.gain(10), la = S.osc('sine', .09), lag = S.gain(.5);
    chain(l1, l1g); l1g.connect(o1.frequency); chain(l2, l2g); l2g.connect(o2.frequency); chain(la, lag); lag.connect(am.gain);
    o1.connect(bp); o2.connect(bp); chain(bp, am, gg, S.out);
    const hs = run(S.src('white'), t0, r() * 2), hh = S.filter('highpass', 2400, .5), hg = S.gain(0);
    const us = run(S.src('brown'), t0, r() * 3), ul = S.filter('lowpass', 380, .8), ua = S.gain(.5), ug = S.gain(0), lu = S.osc('sine', 2.3), lug = S.gain(.5);
    chain(lu, lug); lug.connect(ua.gain);
    chain(hs, hh, hg, S.out); chain(us, ul, ua, ug, S.out);
    for (const o of [o1, o2, l1, l2, la, lu]) o.start(t0);
    return {
      set(p, now) {
        const d = clamp(p.p || 0, 0, 1);
        follow(gg.gain, .09 * Math.sqrt(Math.sin(Math.PI * clamp(d * 1.1, 0, 1))), now, .3);
        follow(hg.gain, .05 * (1 - d) * (1 - d), now, .3);
        follow(ug.gain, .35 * clamp(d * 1.5, 0, 1) * (1 - d * .5), now, .3);
      },
    };
  },

  /* hydraulics (erector, jacks, mast) or an electric drive (turret, crane slew) */
  hyd(S, t0) {
    const r = S.core.rand;
    const w = S.osc('sawtooth', 180), wl = S.filter('lowpass', 1100, 2), wg = S.gain(0);
    const m = S.osc('sine', 98), mg = S.gain(0);
    const ps = run(S.src('pink'), t0, r() * 3), pb = S.filter('bandpass', 620, 1.5), pg = S.gain(0);
    chain(w, wl, wg, S.out); chain(m, mg, S.out); chain(ps, pb, pg, S.out);
    w.start(t0); m.start(t0);
    return {
      set(p, now) {
        const v = clamp(p.v || 0, 0, 1), el = p.elec ? 1 : 0, f = p.f || 180;
        follow(w.frequency, f, now, .1); follow(wl.frequency, el ? 2400 : 1100, now, .1);
        follow(wg.gain, (el ? .008 : .016) * v, now, .08); follow(mg.gain, .05 * v, now, .08); follow(pg.gain, (el ? .02 : .12) * v, now, .08);
      },
    };
  },

  /* ---------- ambience (non-positional slots on the ambience bus) ---------- */
  /* sea: a low swell (stereo), and a wash that surges like waves on a shore */
  sea(S, t0) {
    const r = S.core.rand, sg = S.gain(0);
    const mk = (pan, lf) => {
      const s = run(S.src('brown'), t0, r() * 3), l = S.filter('lowpass', 420, .6), a = S.gain(.7), p = S.panner(pan), o = S.osc('sine', lf), og = S.gain(.3);
      chain(o, og); og.connect(a.gain); chain(s, l, a, p, sg); o.start(t0); return l;
    };
    const la = mk(-.55, .11), lb = mk(.55, .089);
    sg.connect(S.out);
    // the wash: a reversed-saw gate (sharp rise, slow fall) like waves running up a shore
    const ws = run(S.src('white'), t0, r() * 2), wb = S.filter('bandpass', 1000, .6), wa = S.gain(.45), wo = S.osc('sawtooth', .085), wd = S.gain(-.4), wg = S.gain(0);
    chain(wo, wd); wd.connect(wa.gain); chain(ws, wb, wa, wg, S.out); wo.start(t0);
    return {
      set(p, now) {
        // k: open water around the camera (fades with height); low: closeness to the surface; surf: a shoreline in view
        const sea = clamp(p.sea === undefined ? .3 : p.sea, 0, 1), k = p.k || 0, low = p.low || 0, surf = p.surf || 0;
        follow(sg.gain, .085 * k * (.5 + .5 * sea), now, .3);
        follow(la.frequency, 360 + 320 * sea, now, .3); follow(lb.frequency, 360 + 320 * sea, now, .3);
        follow(wg.gain, low * (.07 * surf + .012 * sea * k), now, .3); follow(wo.frequency, .07 + .05 * sea, now, .5);
      },
    };
  },

  /* wind: gusting band noise; high up it thins and whistles */
  wind(S, t0) {
    const r = S.core.rand;
    const s = run(S.src('pink'), t0, r() * 3), bp = S.filter('bandpass', 480, 1.4), gust = S.gain(.6), p = S.panner(0), wg = S.gain(0);
    const a = S.osc('sine', .071), ag = S.gain(.24), b = S.osc('sine', .113), bg = S.gain(.16), af = S.gain(90);
    chain(a, ag); ag.connect(gust.gain); chain(b, bg); bg.connect(gust.gain); a.connect(af); af.connect(bp.frequency);
    chain(s, bp, gust, p, wg, S.out);
    const ws = run(S.src('white'), t0, r() * 2), wb = S.filter('bandpass', 2400, 7), wh = S.gain(0);
    chain(ws, wb, wh, S.out);
    a.start(t0); b.start(t0);
    return {
      set(q, now) {
        const w = clamp(q.w || 0, 0, 1.5), alt = clamp(q.alt || 0, 0, 1);
        follow(wg.gain, .15 * w * (.35 + .65 * alt), now, .4); follow(bp.frequency, 380 + 420 * alt + 120 * w, now, .5);
        follow(wh.gain, .012 * alt * w, now, .5); follow(wb.frequency, 1900 + 1200 * alt, now, .5); follow(p.pan, clamp(q.pan || 0, -.5, .5), now, .5);
      },
    };
  },

  /* rain: stereo hiss and droplet patter */
  rain(S, t0) {
    const r = S.core.rand;
    const mk = pan => { const s = run(S.src('white'), t0, r() * 2.5), h = S.filter('highpass', 2600, .5), l = S.filter('lowpass', 9000, .5), p = S.panner(pan); chain(s, h, l, p); return p; };
    const g = S.gain(0); mk(-.7).connect(g); mk(.7).connect(g); g.connect(S.out);
    const ds = run(S.src('crackle', 1.3), t0, r() * 2), dh = S.filter('highpass', 3500, .5), dg = S.gain(0);
    chain(ds, dh, dg, S.out);
    return {
      set(p, now) {
        const k = clamp(p.r || 0, 0, 1);
        follow(g.gain, .075 * k, now, .6); follow(dg.gain, .045 * k, now, .6);
      },
    };
  },
};
