/* INTERCEPT · scenario (window.ISCN): the numbers the sea host and the act share, loaded before both.
   Ship frame (the sea host's world): metres, origin midships on the waterline, +Z the ship's head (north), +X
   starboard (east), +Y up; a bearing b is the direction [sin b, 0, cos b].
     AZ, EL   the mount's lay: the predicted intercept point (PIP) seen from the ship, bearing 290 (train -70 deg, to
              port) at 70 deg elevation, 380 km up. The round flies a straight line there (drag and gravity along it;
              the ~1 km of sag across it is left out).
     V0       muzzle speed: 7.8 km/s (fiction; a 2 m long-rod round of ~19 kg, stated on screen).
     tgtAE    the target's bearing (as a train angle, rad) and elevation (rad) from the ship, set each frame by the act.
     tgtW     the target's position in the ship frame, set each frame by the act (the director and the radar look there). */
(function () {
  const DEG = Math.PI / 180;
  window.ISCN = {
    AZ: -70 * DEG, EL: 70 * DEG, V0: 7800, ALT: 380000, K_DRAG: 1.3e-5, MASS: 19.4, ROUND_L: 2.0,
    HEADING: 110 * DEG,                    // the target's ground track at the PIP (it comes in from the west-north-west)
    tgtAE: [-60 * DEG, 28 * DEG], tgtW: [-600000, 330000, 220000],
  };
})();
