/* Render poses per domain (the body of game.unitPose): what the sim's state looks like on the drawn world.

   Ships      ride the drawn swell: the hull's closed-form response (sim/sea.js hullMotion) to the terrain's own wave
              trains (T.waves / T.seaAmp: the sea exactly as drawn, on the swell clock game.seaT), so a carrier sits
              nearly still where a destroyer rolls, and short waves pass under long hulls; on top, the sim's heel in a
              turn, squat and trim with speed, list and trim from flooding, and the sinking (the swell fades as she dies).
   Vehicles   sit on the drawn ground (it carries metre-scale relief the sim's map does not): three wheel stations a
              side averaged into a plane (smooth over the relief, no jitter), plus the body on its springs (sim u.sp /
              u.sr: sitting back under power, diving under the brakes, rolling out of turns); a wreck settles onto its
              axles with a slight tilt.
   On a deck  an aircraft on a catapult, on the wires or set down on a spot (sim u.deck) is placed in the ship's frame
              on the ship's drawn pose, so it rides the deck exactly. */
import { hullMotion, hullOf } from '../sim/sea.js';
import { submerged } from '../sim/subs.js';

const HM = { heave: 0, pitch: 0, roll: 0 };

/* ship: y is the interpolated sim height (squat, a boat's depth, sinking); seaK = the ship's metres per second of the
   swell clock over her metres per sim second (the swell runs at min(rate, 2)) */
export function seaPose(u, x, z, hdg, y, T, seaT, seaK, out) {
  const d = u.def;
  let heave = 0, wp = 0, wr = 0;
  // (a boat under the water and a hovercraft up on the beach do not ride the swell)
  if (T && T.waves && !(d.sub && submerged(u)) && !(d.hover && T.mapH && T.mapH(x, z) > -.5)) {
    const v = u.speed * seaK;
    hullMotion(T.waves, T.seaAmp, x, z, hdg, Math.sin(hdg) * v, Math.cos(hdg) * v, hullOf(d), seaT, HM);
    heave = HM.heave; wp = HM.pitch; wr = HM.roll;
  }
  const k = u.alive ? 1 : 1 - u.dying;
  out.pos[0] = x; out.pos[1] = y + heave * k; out.pos[2] = z;
  out.hdg = hdg; out.pitch = (u.pitch || 0) + wp * k; out.roll = (u.roll || 0) + wr * k;
}

/* vehicle (and static sites) on the drawn ground */
export function landPose(u, x, z, hdg, T, out) {
  const d = u.def, s = Math.sin(hdg), c = Math.cos(hdg), L = Math.max(2, d.size[0] * .4), W = Math.max(1, d.size[1] * .5);
  const fx = x + s * L, fz = z + c * L, bx = x - s * L, bz = z - c * L, lx = -c * W, lz = s * W;
  const fl = T.heightAt(fx + lx, fz + lz), fr = T.heightAt(fx - lx, fz - lz);
  const ml = T.heightAt(x + lx, z + lz), mr = T.heightAt(x - lx, z - lz);
  const bl = T.heightAt(bx + lx, bz + lz), br = T.heightAt(bx - lx, bz - lz);
  let y = Math.max(0, (fl + fr + ml + mr + bl + br) / 6);
  let pitch = Math.atan2((fl + fr) - (bl + br), 4 * L) + (u.sp || 0);
  let roll = Math.atan2((fl + ml + bl) - (fr + mr + br), 6 * W) + (u.sr || 0);
  if (!u.alive && u.settle) { const k = u.settle / .4; y -= u.settle; pitch += (u.wtP || 0) * k; roll += (u.wtR || 0) * k; }
  out.pos[0] = x; out.pos[1] = y; out.pos[2] = z; out.hdg = hdg; out.pitch = pitch; out.roll = roll;
}

/* aircraft on a deck: k = u.deck (x, y, z its place in the ship's frame, px, py, pz last tick's, hd its heading off the
   ship's), cp = the ship's pose this frame, a = the interpolation between the last two ticks */
export function deckPose(k, cp, a, out) {
  const lx = k.px + (k.x - k.px) * a, ly = k.py + (k.y - k.py) * a, lz = k.pz + (k.z - k.pz) * a;
  const s = Math.sin(cp.hdg), c = Math.cos(cp.hdg);
  out.pos[0] = cp.pos[0] + lx * c + lz * s; out.pos[2] = cp.pos[2] - lx * s + lz * c;
  out.pos[1] = cp.pos[1] + ly + lz * Math.sin(cp.pitch) - lx * Math.sin(cp.roll);
  out.hdg = cp.hdg + k.hd; out.pitch = cp.pitch; out.roll = cp.roll;
}
