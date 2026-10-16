/* THERMAL: the fighting (stage B). Stage A calls these hooks every frame and leaves them empty.

   Order of a frame (pg_thermal_film.js render):
     1. camera; the sensor defaults for this shot (ctx.sensor: polarity + wipe, AGC lo/hi, noise, glare 0)
     2. PG.heatFx(T, ctx)       heat on the hero and the sensor's response, BEFORE anything is drawn:
                                ctx.hot.push({ p: [x, y, z] ship coords, r: m, h: heat added at the centre })
                                  (the hull glowing round the breach, the Phalanx's barrels, a hatch's cell);
                                ctx.partHeat[ctx.PID.ciwsA] += h  (a whole part warmer);
                                ctx.sensor.lo / .hi (AGC: raise hi and the scene darkens round a very hot source),
                                ctx.sensor.glare (0..1: a veil over the frame, white in white-hot, dark in black-hot),
                                ctx.sensor.noise (per-dot noise amplitude)
     3. the palette is built from ctx.sensor
     4. the hero (writes the occlusion tiles), its exhaust, the rounds with their trails, the interceptor paths
     5. PG.launchFx, PG.interceptFx, PG.ciwsFx, PG.hitFx (T, ctx): draw here. Anything small and hot should
        ctx.occMark(x, y, depth, pad) its tiles so the sea / sky behind it is cut away (the halo that makes hot
        things read as dark in black-hot); the sea and the sky are drawn after the hooks.
     6. the sky, the sea, the wake, the grain; ctx.sensor.glare; blit
     7. PG.fxOverlay(T, octx, tags, ctx): vector overlays and DOM tags (lime = own, coral = hostile only)
   PG.shipStateFx(st, T) edits the hero's state before it is drawn (vlsOpen, ciwsSpin; ciwsYaw/Pitch are stage A's
   PG.ciwsAim; the elevating mass is drawn with DW.elevX(pitch)). PG.shakeFx(T) -> px of camera shake.
   PG.fxCues: [[filmT, fn]] sounds (STAGE.SFX), fired only while playing forward.

   ctx: { T, cam, pb, DW, st (hero state), sensor, hot, partHeat, PID, pol (0 white-hot / 1 black-hot, this frame),
          hput(x, y, size, heat, alpha)   a heat dot at screen x, y through the palette (max blend)
          hglow(x, y, R, heat, alpha)     a soft bloom (adds light in white-hot, darkens the field in black-hot)
          P3(x, y, z) -> bool, q {x, y, z}  project a world point (earth drop included)
          occMark(x, y, z, pad), put / dset (coloured overlay dots), lum(heat, pol) }
   Heat scale: ~.03 clear sky, .15-.25 sea, .36 hull, .47 over the engine rooms, .7 stack casings, 1.0-1.15 exhaust
   mouths and ramjet jets; the palette saturates at ctx.sensor.hi (default .92), so a burst at 1.3 is white.

   Stage A's timeline (film seconds; world facts in pg_thermal_world.js, PG.EV):
     launches      I1 66.0 (cell 6, fwd Mk 41), I2 67.6 (cell 44, aft), I3 75.6 (cell 13, fwd)
     intercepts    I1 x round 41 at 80.0 (~15.8 km out), I2 x round 42 at 83.2 (~13.8 km)
     the miss      I3 passes ~120 m from the weaving round 44 at 89.3 (~9.9 km) and flies on to 90.9 (PG.SHOTS[2].tEnd)
     Phalanx       aft mount trains 92.4-94.0, tracks 43; opens fire ~99.1 (PG.CIWS.tOpen); 43 stopped 480 m out at
                   101.31 (PG.tStop[2]); swings onto 44 101.42-101.78; holds; back to stow 127.5-131.5
     the hit       round 44 into the starboard side at PG.HIT_L = [9.95, 4.6, -9] (ship coords) at T_HIT = 103.4
     rounds vanish at their stop times (stage A); cover each with a burst
     polarity      white-hot to 46.5, black-hot 46.5-90.5 (the launches and the far intercepts are in black-hot),
                   white-hot from 90.5 (the Phalanx and the hit)
     the lens      on the hero wide for the launches (64.5-70.5), up the climbs and out along I1 (70.5-80), on the
                   intercept points (80-84), with I3 onto the miss (84-91), the aft Phalanx close (93-97), wide with the
                   ship left and the rounds from the right (98.5-103.4), closing on the breach 104-119, off the ship
                   searching the horizon 124-146 (the far intercept points lie on that bearing), back on the hero ~148.
                   Any heat of the hit must have cooled away by ~146, so the ship is calm when the lens comes back:
                   the loop's first frame is the calm ship. */
(function () {
  'use strict';
  const PG = window.PG;
  PG.shipStateFx = (st, T) => st;
  PG.shakeFx = T => 0;
  PG.heatFx = function (T, ctx) {};
  PG.launchFx = function (T, ctx) {};
  PG.interceptFx = function (T, ctx) {};
  PG.ciwsFx = function (T, ctx) {};
  PG.hitFx = function (T, ctx) {};
  PG.fxOverlay = function (T, octx, tags, ctx) {};
  PG.fxCues = [];
})();
