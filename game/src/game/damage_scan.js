/* Damage scan: after a ship is hit, the films' lime scan reads out what the hit did, as the lightning scan reads a hull
   (ui/sensors/scan.js), all a pure function of the time since the hit:
     0.10-0.9 s  a lime front runs out over her own dots from the hit (white-lime at the front, a lime breath behind it)
     0.25-2.6 s  the X-ray flickers on (the shell thins, what is inside shows)
     0.35 s on   each system the hit knocked out (sim 'system' events, state 'out', within 1.5 s of it) gets a coral part box
                 that fits it, one after another, its placard decoding out of glyph noise: 01 MK 41 VLS · FWD  OUT
     4.5-5.5 s   it all fades
   Before it, the blast's own shock front (0-70 ms): a white band racing over her dots at the front's true radius
   (Kinney-Graham arrival, blast/phys.js), the plating it has passed glowing warm for a moment.
   Only for a hull the player can see (game.drawn) and big enough on screen to read (else one coral tag with the count).
   Setting: game.settings.damageScan === false turns it off. */
import { shipSpec } from '../sim/ship.js';
import { decode, flicker, seedOf } from '../ui/sensors/decode.js';
import { attitudeM } from './debris/math.js';
import { modelDots, eachInColumns } from '../blast/support.js';
import { tntOf, shockR } from '../blast/phys.js';

const LIME = [198, 244, 50], END = 5.5, BIG = 140;
const sat = x => x < 0 ? 0 : x > 1 ? 1 : x;
const outCubic = x => 1 - (1 - sat(x)) ** 3;

export function createDamageScan(game) {
  const sim = game.sim, R = game.R || game.renderer, cam = R.camera;
  const list = [], M = [1, 0, 0, 0, 1, 0, 0, 0, 1], q = [0, 0, 0], w = [0, 0, 0];
  const on = () => !(game.settings && game.settings.damageScan === false);
  const poseOf = u => { const p = game.unitPose(u); attitudeM(p.hdg, p.pitch || 0, p.roll || 0, M); return p.pos; };
  const toW = (P, x, y, z, o) => { o[0] = P[0] + M[0] * x + M[1] * y + M[2] * z; o[1] = P[1] + M[3] * x + M[4] * y + M[5] * z; o[2] = P[2] + M[6] * x + M[7] * y + M[8] * z; return o; };
  const toM = (P, x, y, z) => { const dx = x - P[0], dy = y - P[1], dz = z - P[2]; return [M[0] * dx + M[3] * dy + M[6] * dz, M[1] * dx + M[4] * dy + M[7] * dz, M[2] * dx + M[5] * dy + M[8] * dz]; };

  function onEvent(e) {
    if (!on()) return;
    if (e.type === 'hit' && e.pos && e.target !== undefined) {
      const u = sim.units.get(e.target); if (!u || !u.ship || u.def.domain !== 'sea') return;
      const W = tntOf(e.kind, null); if (!(W >= 2)) return;            // (missiles, bombs, heavy shells: not gun bursts)
      const P = poseOf(u), h = toM(P, e.pos[0], e.pos[1], e.pos[2]);
      // (a second hit within the window joins the scan already running on her)
      const cur = list.find(s => s.uid === u.id && sim.t - s.t0 < 1.2);
      if (cur) return;
      list.push({ uid: u.id, t0: sim.t, h, items: [], seed: (u.id * 37 + Math.round(sim.t * 10)) % 997, xr: false, W });
      if (list.length > 6) { const s = list.shift(); xrayOff(s); }
    } else if (e.type === 'system' && e.state === 'out' && e.node) {
      const s = list.find(x => x.uid === e.unit && sim.t - x.t0 < 1.5); if (!s || s.items.some(i => i.node === e.node)) return;
      s.items.push({ node: e.node, label: e.label || e.node, why: e.why || 'blast', t: sim.t - s.t0 });
    }
  }
  function xrayOff(s) { if (!s.xr) return; const d = game.drawn && game.drawn.get(s.uid); if (d) d.xray = 0; s.xr = false; }

  /* the lime front over her dots, and the X-ray */
  function draw3d(frame) {
    const sink = frame.sink; if (!sink || R.style === 'orbital') return;
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i], u = sim.units.get(s.uid), a = game.t - s.t0;
      if (!u || a > END) { xrayOff(s); list.splice(i, 1); continue; }
      if (a < 0) continue;
      const d = game.drawn && game.drawn.get(s.uid);
      // the X-ray: on while it reads her
      const xk = flicker(a, .25, 2.6);
      if (d && u.alive && xk > 0) { d.xray = Math.max(d.xray || 0, .8 * xk); s.xr = true; } else xrayOff(s);
      if (!d) continue;
      const ent = R.models.has(u.def.model) ? R.models.get(u.def.model) : null, Md = ent && modelDots(ent);
      if (!Md || !Md.n) continue;
      // her outer plating round the hit, once a hit, in shells by distance (each frame then draws only the band the front
      // is crossing: a few thousand dots, no scan of her whole cloud)
      if (!s.pts) s.pts = ring(Md, s.h);
      const P = poseOf(u), pts = s.pts;
      // the shock front: white where it is, a warm afterglow on what it passed
      if (a < .07 && s.W > .5) {
        const Rs = Math.min(30, shockR(a, s.W)), band = .35 + .02 * Rs, fade = 1 - a / .07;
        if (Rs > .3) span(pts, Rs - 3, Rs + band, (x, y, z, r, k) => { const e = Rs - r; toW(P, x, y, z, w);
          if (e < band) sink.add(w[0], w[1], w[2], 2, 255, 250, 238, .9 * (1 - Math.abs(e) / band) * fade);
          else if (k & 1) sink.add(w[0], w[1], w[2], 2, 255, 176, 92, .45 * (1 - e / 3) * fade); });
      }
      // the lime front: her dots in a band round a sphere growing from the hit, a breath of lime behind it
      if (a < .1 || a > 1.1) continue;
      const Rf = 3 + 15 * outCubic((a - .1) / .75), band = 1.1, fade = 1 - sat((a - .7) / .4);
      // (alpha over, as the lightning scan's tendrils: a max blend would lose lime under the fire's warm light)
      const over = sink.over || sink.dot;
      span(pts, Rf - 1.5, Rf + band, (x, y, z, r, k) => {
        const e = Rf - r; if (e > band && k & 3) return;
        const front = e < band ? 1 - Math.abs(e) / band : 0, al = (front > 0 ? Math.min(1, .4 + front) : .5 * (1 - e / 1.5)) * fade;
        if (al < .03) return;
        toW(P, x, y, z, w); const wk = front * front;
        over(w[0], w[1], w[2], front > .2 ? 3 : 2, LIME[0] + (255 - LIME[0]) * wk, LIME[1] + (255 - LIME[1]) * wk, LIME[2] + (230 - LIME[2]) * wk, al);
      });
      if (a < .35 && sink.light) { toW(P, s.h[0], s.h[1], s.h[2], w); sink.light(w[0], w[1], w[2], LIME[0] / 255, LIME[1] / 255, LIME[2] / 255, .6 * (1 - a / .35), Rf + 4); }
    }
  }
  /* the outer dots (they have a normal; the interior parts do not) within 20 m of h, lifted 0.2 m off the plating (not
     lost in its depth), in 0.5 m shells by distance: [Float32Array [x y z r] ...] (no sort: one pass, ~1-2 ms a hit) */
  const SH = .5, NSH = 40;
  function ring(Md, h) {
    const D = Md.D, B = Array.from({ length: NSH }, () => []);
    eachInColumns(Md, h[0] - 20, h[2] - 20, h[0] + 20, h[2] + 20, k => { const o = 7 * k; if (!D[o + 3] && !D[o + 4] && !D[o + 5]) return;
      const dx = D[o] - h[0], dy = D[o + 1] - h[1], dz = D[o + 2] - h[2], r = Math.sqrt(dx * dx + dy * dy + dz * dz); if (r >= 20) return;
      B[(r / SH) | 0].push(D[o] + D[o + 3] * .2, D[o + 1] + D[o + 4] * .2, D[o + 2] + D[o + 5] * .2, r); });
    return B.map(l => Float32Array.from(l));
  }
  /* each point with r0 <= r < r1 */
  function span(sh, r0, r1, f) {
    for (let b = Math.max(0, (r0 / SH) | 0), b1 = Math.min(NSH - 1, (r1 / SH) | 0); b <= b1; b++) { const p = sh[b];
      for (let j = 0; j < p.length; j += 4) { const r = p[j + 3]; if (r >= r0 && r < r1) f(p[j], p[j + 1], p[j + 2], r, j >> 2); } }
  }

  /* the part boxes and their placards */
  const C8 = [[0, 1, 2], [3, 1, 2], [0, 4, 2], [3, 4, 2], [0, 1, 5], [3, 1, 5], [0, 4, 5], [3, 4, 5]];
  function draw2d(ov) {
    if (!ov || R.style === 'orbital') return;
    for (const s of list) {
      const u = sim.units.get(s.uid), a = game.t - s.t0; if (!u || a < .3 || !s.items.length) continue;
      const d = game.drawn && game.drawn.get(s.uid); if (!d) continue;
      const P = poseOf(u), fade = 1 - sat((a - 4.5) / 1);
      if (!cam.project(P, q)) continue;
      const px = cam.fl * Math.max(u.def.size[0], u.def.size[1]) / q[2];
      const sp = shipSpec(u.type), byId = sp && sp.byId;
      if (px < BIG || !byId) {
        // too small to read her parts: one tag
        const k = sat((a - .3) / .4);
        ov.tag(q[0] + 14, q[1] - 30, String(s.items.length).padStart(2, '0'), decode('systems out', k, a, s.seed), '', { kind: 'coral', a: fade, anchor: [q[0], q[1]] });
        continue;
      }
      let y0 = null;
      s.items.forEach((it, i) => {
        const ta = Math.max(it.t, .35 + i * .18), b = a - ta; if (b < 0) return;
        const n = byId.get(it.node), B = n && n.box; if (!B) return;
        let x0 = 1e9, y0b = 1e9, x1 = -1e9, y1 = -1e9, ok = 0;
        for (const c of C8) { toW(P, B[c[0]], B[c[1]], B[c[2]], w); if (!cam.project(w, q)) continue; ok++; x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0b = Math.min(y0b, q[1]); y1 = Math.max(y1, q[1]); }
        if (ok < 4) return;
        // (the box pops: a flicker, then held)
        const al = flicker(b, 0, 9) * fade;
        ov.box([x0, y0b, x1, y1], 'rgba(255,106,61,.95)', al, [2, 3]);
        ov.bracket([x0, y0b, x1, y1], 'rgba(255,106,61,1)', al, 3, 8);
        const k = sat(b / .5), lab = decode(it.label.replace(/\s*·.*$/, '').slice(0, 26), k, a, seedOf(it.node) + s.seed);
        const why = it.why === 'fire' ? 'FIRE' : it.why === 'flood' ? 'FLOODED' : it.why === 'power' || it.why === 'supply' ? 'NO POWER' : 'OUT';
        const ty = y0 === null ? y0b - 26 : Math.min(y0b - 26, y0 + 22); y0 = ty;
        ov.tag(x1 + 10, ty, String(i + 1).padStart(2, '0'), lab, k >= 1 ? why : '', { kind: 'coral', a: al, anchor: [(x0 + x1) / 2, y0b], fit: true });
      });
    }
  }

  const sys = { name: 'dscan', priority: 13, onEvent, draw3d, draw2d, list };
  game.dscan = sys;
  return sys;
}
