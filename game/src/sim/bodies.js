/* ONIKS sim · physical bodies and collision tests. Pure geometry: no DOM, no randomness, no allocation in the tests.

   A unit is the union of its part boxes in its model frame (+Z forward, +Y up, +X starboard; origin on the ground for
   vehicles, at the waterline for ships and surfaced boats, mid-fuselage for aircraft). The boxes are the part bounds
   of the unit's HD model (data/models.js, default state) baked into BOX below; each box belongs to the sim part of the
   same name (UNITS[type].parts), or to the one ALIAS names ('~part': a sparse, multi-mount part that only takes
   spill-over damage; null: not part of the body). Where boxes overlap, a strike lands on the smallest that holds it.
   A munition is a capsule along its axis: PROJ[kind].body = [length m, diameter m, mass kg]; its model's part boxes
   (same table, nose +Z, origin mid-body) say which part a round or a burst struck.

   bodyOf(def)                                    the unit type's body (cached): boxes, their parts, aim point, radius
   segUnit(u, ax, ay, az, bx, by, bz, g, pen)     a segment (world axes, relative to the unit's origin) against the
                                                  unit's boxes grown by g -> entry 0..1 or -1; HIT.part (the smallest
                                                  box holding the point pen metres past the entry), HIT.x/y/z (the
                                                  entry, model frame), HIT.s
   distUnit(u, ax, ay, az, bx, by, bz, max)       least distance from the segment to the boxes (proximity fuzes), or
                                                  Infinity when more than max; HIT.s, HIT.part, HIT.x/y/z (the box
                                                  point nearest the segment, model frame)
   pointUnit(u, dx, dy, dz)                       least distance from a point (relative to the origin) to the boxes
   segAxis(ax, ay, az, bx, by, bz, fx, fy, fz, h) least distance from a segment to a capsule's axis (capsule at the
                                                  origin, unit axis f, half length h); HIT.s (segment), HIT.t (-h..h)
   partNear(def, x, y, z, not)                    the part holding (or nearest to) a model-frame point, other than not
   projPart(P, x, y, z)                           the munition part at a point of its model frame
   toWorld(u, x, y, z, out)                       a model-frame point of the unit -> world

   Regenerate BOX when a model changes: on game/models.html, for each model key, the part bounds at the default state
   (primitive points, lathe stations +- their radius, part.xf applied), rounded to cm. */

export const HIT = { s: 0, t: 0, d: 0, part: null, x: 0, y: 0, z: 0 };

/* model key -> [[model part, minX, minY, minZ, maxX, maxY, maxZ], ...] (metres, model frame) */
const BOX = {
  hq: [['truckA', -6.16, 0, -3.73, -2.84, 3.32, 5.11], ['shelterA', -5.76, 1.34, -3.83, -3.13, 3.67, 2.52], ['truckB', 3.07, 0, -5.92, 6.46, 3.32, 2.96], ['shelterB', 3.12, 1.34, -6.05, 5.93, 3.67, 0.38], ['container', -3.96, 0, -12.76, 3.2, 2.59, -10.28], ['generator', 9.41, 0, -9.67, 14.86, 2.7, -7.33], ['mast', -1.7, 0, 7.97, 1.7, 18.64, 10.45], ['guys', -9.68, 0, -1.65, 9.68, 0.3, 15.15], ['net', -11.55, 0, -7.55, 11.55, 5.3, 9.05]],
  tel: [['chassis', -1.85, 0.32, -7.18, 1.85, 3.7, 5.9], ['wheels', -1.61, 0, -5.69, 1.61, 1.48, 5.19], ['cab', -1.93, 0.72, 4.1, 1.93, 3.44, 6.64], ['launcher', -1.26, 1.35, -6.9, 1.26, 3.15, 2.65], ['capL', -1.21, 1.95, 2.65, -0.11, 3.05, 2.84], ['capR', 0.11, 1.95, 2.65, 1.21, 3.05, 2.84], ['ram', -0.22, 1.16, -2.62, 0.22, 1.72, 2.62], ['jacks', -2, 0, -6.8, 2, 0.86, 1.45], ['fans', -1.35, 1.8, 3.13, 1.35, 2.6, 3.92]],
  radar: [['chassis', -1.62, 0.32, -7.18, 1.62, 3.7, 5.9], ['wheels', -1.61, 0, -5.69, 1.61, 1.48, 5.19], ['cab', -1.93, 0.72, 4.1, 1.93, 3.44, 6.64], ['body', -1.43, 1.5, -6.46, 1.43, 3.85, 2.8], ['mast', -0.27, 1.6, -5.37, 0.27, 11, -4.83], ['array', -2.5, 10.18, -5.99, 2.5, 12.26, -5.04], ['fans', -1.35, 1.8, 1.55, 1.35, 3.84, 3.92]],
  pantsir: [['chassis', -1.34, 0.32, -5.38, 1.34, 2.62, 5.05], ['wheels', -1.33, 0, -3.92, 1.33, 1.24, 4.52], ['cab', -1.66, 0.62, 3.15, 1.66, 3.32, 5.56], ['turret', -1.02, 2.5, -3.63, 1.02, 3.85, -0.98], ['guns', -1.28, 2.63, -2.93, 1.28, 3.59, 0.95], ['missiles', -1.52, 2.58, -3.51, 1.52, 3.9, -0.3], ['searchRadar', -0.98, 3.85, -2.92, 0.98, 4.99, -2.52], ['trackRadar', -0.5, 2.8, -1.33, 0.5, 3.81, -1.04], ['eo', 0.3, 3.85, -1.9, 0.62, 4.16, -1.34]],
  catapult: [['trailer', -0.9, 0, -1.65, 0.9, 0.95, 2.49], ['rail', -0.49, 0.51, -2.05, 0.49, 2.17, 2.82], ['carriage', -0.14, 1.06, -1.93, 0.14, 1.26, -1.42]],
  drone: [['fuselage', -0.11, -0.12, -0.9, 0.11, 0.13, 0.86], ['wing', -1.55, 0.11, -0.14, 1.55, 0.23, 0.18], ['tail', -0.42, -0.12, -1, 0.42, 0.32, -0.74], ['prop', -0.23, -0.05, 0.86, 0.23, 0.06, 1], ['gimbal', -0.07, -0.27, 0.29, 0.07, -0.12, 0.43], ['antennas', -0.04, 0.12, -0.19, 0.04, 0.2, 0.26]],
  transloader: [['chassis', -1.75, 0.32, -7.18, 1.75, 3.75, 5.9], ['wheelsL', -1.61, 0, -5.69, -1, 1.48, 5.19], ['wheelsR', 1, 0, -5.69, 1.61, 1.48, 5.19], ['cab', -1.93, 0.72, 4.1, 1.93, 3.44, 6.64], ['bed', -1.34, 1.45, -6.8, 1.34, 3.22, 2.25], ['stabilisers', -2.05, 0, -6.6, 2.05, 1.3, 2.9], ['column', -0.85, 1.47, 1.53, 0.55, 3.7, 3.5], ['boom', -0.3, 3.22, -2.35, 0.3, 3.85, 3.35], ['jib', -0.18, 3.27, -2.5, 0.18, 3.77, 2.95], ['hook', -0.17, 2.23, -5.43, 0.17, 3.25, 0.93], ['tlcR', 0.19, 1.6, -7.4, 1.34, 2.79, 2.24], ['tlcL', -1.29, 1.6, -7.4, -0.14, 2.79, 2.24]],
  bal: [['chassis', -1.85, 0.32, -7.18, 1.85, 1.78, 5.9], ['wheelsL', -1.61, 0, -5.69, -1, 1.48, 5.19], ['wheelsR', 1, 0, -5.69, 1.61, 1.48, 5.19], ['cab', -1.93, 0.72, 4.1, 1.93, 3.44, 6.64], ['bay', -1.36, 1.45, 2.95, 1.36, 3.75, 4.1], ['cabin', -1.45, 0.72, 0.05, 1.45, 3.6, 2.9], ['pack', -1.34, 1.56, -6.7, 1.34, 3.12, -0.34], ['caps', -1.29, 1.69, -6.75, 1.29, 2.97, -6.65], ['ram', -0.18, 1.38, -3.76, 0.18, 1.76, -2.86], ['jacks', -2, 0, -6.8, 2, 0.86, 1.45]],
  ssk: [['bow', -4.4, -6.3, 26.5, 4.4, 2.5, 36.9], ['hull', -4.4, -6.3, -12, 4.4, 2.5, 26.5], ['stern', -4.4, -6.3, -34.6, 4.4, 2.5, -12], ['casing', -1.94, -0.25, -28.5, 1.94, 2.9, 35.2], ['sail', -1.24, 2.49, -5.2, 1.24, 7.76, 8.6], ['masts', -0.7, 7.75, -3.22, 0.7, 13.45, 5.82], ['bowPlanes', -5.11, 1.11, 28, 5.11, 1.39, 29.65], ['sternPlanes', -5.3, -6.9, -32.2, 5.3, 3, -26.5], ['prop', -1.55, -3.45, -36.9, 1.55, -0.35, -34.6]],
  kornet: [['body', -1.2, 0.45, -2.85, 1.2, 2.3, 2.85]],
  carrier: [['hull', -40.53, 0, -160.03, 36.84, 17.32, 165.6], ['below', -20.4, -11.3, -160, 20.4, 0, 162.5], ['props', -20.2, -10.6, -159.2, 20.2, 0.47, -92], ['deck', -40.6, 17.3, -166.4, 32.2, 19.57, 166.4], ['island', 21.7, 19.5, -47.2, 33.9, 40.22, -7.96], ['mast', 22.15, 36.34, -46.9, 33.45, 61.5, -10.9], ['radars', 24.22, 41.4, -44.59, 30.5, 52.85, -15.55], ['cats', -36.45, 19.48, -56.59, 12.28, 19.99, 163.01], ['wires', -42.21, 16.8, -112.35, 13.63, 22, -46.85], ['elevators', -36.2, 17.58, -132, 36.2, 19.51, 66], ['nssm', 30.36, 16.9, -138.72, 36.51, 20.23, 110.32], ['ram', -36.09, 16.9, -147.69, -26.6, 20.13, 115.11], ['ciws', -33.81, 16.9, -156.47, 33.77, 20.48, 123.27], ['boats', -42.37, 8.3, -156, 33.24, 17.76, 98.4], ['anchors', -12.25, 4.99, 143.54, 12.25, 10.41, 146.94]],
  destroyer: [['hull', -10, 0, -77.6, 10, 10.31, 77.6], ['super', -9.8, 5.7, -53, 9.8, 22.35, 35.5], ['mast', -6.89, 20.54, 14.9, 6.89, 44.8, 23.09], ['arms', -9.07, 6.13, -29.39, 9.07, 11.5, 72.2], ['spy', -7, 12.13, 9.1, 7, 15.7, 30], ['stacks', -2.6, 10.3, -21.6, 2.6, 23.45, 6.4], ['sps', -1.35, 28.2, 21.18, 1.35, 30, 22.82], ['gun', -2.05, 7.78, 46.15, 2.05, 10.23, 56.75], ['vlsF', -4.17, 7.03, 37.22, 4.17, 7.37, 40.58], ['vlsA', -4.17, 5.84, -32.78, 4.17, 6.18, -26.02], ['ciwsF', -1.02, 11, 31.63, 1.12, 14.36, 35], ['ciwsA', -1.12, 13.9, -49.6, 1.02, 17.26, -46.23], ['decoys', -5.54, 10.3, -17.5, 5.54, 12.15, 2.7], ['boats', -9.31, 6.36, -13.5, 9.31, 13.67, -6.63], ['hangar', -7, 5.77, -53.1, 7, 11.39, -53.05], ['deck', -8.86, 5.43, -75.09, 8.86, 5.88, -55.91]],
  helo: [['fuselage', -1.54, 0.55, -8.9, 1.54, 3.82, 5.5], ['rotor', -8.18, 3.51, -8.18, 8.18, 4.51, 8.18], ['tailrotor', -0.24, 2.08, -11.63, 0.91, 5.23, -8.27], ['tail', -2.2, 2.1, -10.55, 2.2, 4.59, -7.75], ['gear', -1.49, 0, -4.6, 1.49, 1.32, 3.1], ['sensors', -0.7, 0.26, -0.1, 0.7, 0.8, 5.23], ['pylons', -2.2, 0.99, -2.45, 2.2, 1.96, 0.25]],
  fighter: [['fuselage', -1.34, -0.86, -7.8, 1.34, 0.7, 9.15], ['lex', -2.08, 0.06, 0.5, 2.08, 0.24, 6.2], ['wings', -6.36, -0.14, -4.5, 6.36, 0.18, 0.9], ['tails', -2.06, 0.52, -7.6, 2.06, 3.38, -3.5], ['stabs', -3.55, -0.28, -8.55, 3.55, -0.03, -5.8], ['canopy', -0.47, 0.55, 2, 0.47, 1.14, 6.05], ['intakes', -1.68, -0.82, -0.1, 1.68, 0.07, 2.5], ['nozzles', -1.14, -0.64, -9, 1.14, 0.4, -7.35], ['pylons', -4.16, -1.2, -2.9, 4.16, 0.02, 0.3]],
  aew: [['fuselage', -1.18, -1.46, -8.8, 1.18, 1.52, 8.8], ['wing', -4.51, 0.87, -1.9, 4.51, 1.49, 1.7], ['outerL', -12.39, 1.05, -1.73, -4.44, 1.68, 1.31], ['outerR', 4.44, 1.05, -1.73, 12.39, 1.68, 1.31], ['nacelleL', -4.61, -0.86, -4.9, -3.08, 1.22, 4.1], ['nacelleR', 3.08, -0.86, -4.9, 4.61, 1.22, 4.1], ['propL', -5.78, -1.61, 4.1, -1.67, 2.51, 4.88], ['propR', 1.67, -1.61, 4.1, 5.78, 2.51, 4.88], ['pylon', -0.24, 1.1, -3.6, 0.24, 2.74, -0.7], ['dome', -3.66, 2.64, -5.76, 3.66, 3.48, 1.56], ['tail', -4.03, 0.77, -8.62, 4.03, 3.54, -6.39], ['hook', -0.18, 0.14, -9.05, 0.18, 0.62, -6.5]],
  ssn: [['bow', -5.2, -9.3, 44, 5.2, 1.1, 57.45], ['hull', -5.2, -9.3, -18, 5.2, 1.1, 44], ['stern', -5.2, -9.3, -52, 5.2, 1.1, -18], ['sail', -1.61, 0.88, 21.8, 1.61, 7.91, 36.2], ['masts', -0.76, 7.9, 23.95, 0.76, 13.16, 30.64], ['vpt', -1.28, 1.01, 41.32, 1.28, 1.27, 47.48], ['bowPlanes', -6.96, -2.36, 44.6, 6.96, -2.04, 46.6], ['sternPlanes', -6.7, -11, -48.4, 6.7, 2.8, -40.5], ['arrays', -5.32, -5.75, -15, 5.32, -2.45, 16.5], ['propulsor', -2.31, -6.41, -57.45, 2.31, -1.79, -50.9]],
  lhd: [['hull', -15.9, -8.1, -126.65, 15.9, 17.8, 116.65], ['deck', -16.1, 17.8, -128.65, 16.1, 18.3, 128.65], ['island', 10, 18.3, -40, 16, 40.3, 10], ['gate', -7.6, 1, -129.05, 7.6, 9.2, -128.65]],
  lcac: [['hull', -7.15, 1.4, -13.4, 7.15, 2.3, 13.4], ['sides', -7.15, 2.3, -13.4, 7.15, 5.4, 9]],
  acv: [['hull', -1.55, 0.5, -4.45, 1.55, 2.4, 4.45]],
  // munitions (origin mid-body, nose +Z)
  oniks: [['body', -0.45, -0.4, -4.5, 0.45, 0.41, 4.02], ['intake', -0.33, -0.33, 3.47, 0.33, 0.33, 4.4], ['wings', -0.88, 0, -0.62, 0.88, 0, 0.95], ['fins', -0.58, -0.58, -4.42, 0.58, 0.58, -3.52], ['nozzle', -0.3, -0.3, -4.5, 0.3, 0.3, -3.6], ['booster', -0.23, -0.23, -4.85, 0.23, 0.23, -3.9]],
  strike_missile: [['nose', -0.26, -0.26, 2.08, 0.26, 0.26, 2.78], ['body', -0.26, -0.26, -2.78, 0.26, 0.3, 2.08], ['wings', -1.33, -0.23, 0.15, 1.33, -0.14, 0.55], ['fins', -0.44, -0.44, -2.74, 0.44, 0.44, -2.28], ['inlet', -0.14, -0.44, -1.15, 0.14, -0.24, -0.55]],
  slam: [['nose', -0.17, -0.17, 1.74, 0.17, 0.17, 2.19], ['body', -0.17, -0.17, -2.19, 0.17, 0.17, 1.73], ['wings', -0.85, -0.85, -0.2, 0.85, 0.85, 0.55], ['fins', -0.37, -0.37, -2.19, 0.37, 0.37, -1.77]],
  hellfire: [['nose', -0.09, -0.09, 0.61, 0.09, 0.09, 0.81], ['body', -0.09, -0.09, -0.81, 0.09, 0.09, 0.61], ['wings', -0.12, -0.12, -0.72, 0.12, 0.12, -0.22], ['canards', -0.14, -0.14, 0.38, 0.14, 0.14, 0.5]],
  sm6: [['radome', -0.17, -0.17, 2.1, 0.17, 0.17, 3.27], ['body', -0.18, -0.18, -1.55, 0.18, 0.2, 2.1], ['fins', -0.38, -0.38, -1.5, 0.38, 0.38, -1.02], ['mk72', -0.56, -0.56, -3.45, 0.56, 0.56, -1.55]],
  essm: [['radome', -0.13, -0.13, 1.28, 0.13, 0.13, 1.83], ['body', -0.14, -0.14, -1.83, 0.14, 0.14, 1.28], ['fins', -0.23, -0.23, -1.83, 0.23, 0.23, -1.49]],
  pantsir_missile: [['nose', -0.04, -0.04, 1.24, 0.04, 0.04, 1.6], ['dart', -0.05, -0.05, -0.27, 0.05, 0.05, 1.24], ['finsD', -0.08, -0.08, -0.2, 0.08, 0.08, 0.1], ['booster', -0.09, -0.09, -1.65, 0.09, 0.09, -0.22], ['finsB', -0.22, -0.22, -1.58, 0.22, 0.22, -1.3]],
  aam: [['radome', -0.09, -0.09, 1.33, 0.09, 0.09, 1.83], ['body', -0.09, -0.09, -1.83, 0.09, 0.11, 1.33], ['wings', -0.16, -0.16, -0.12, 0.16, 0.16, 0.42], ['fins', -0.23, -0.23, -1.82, 0.23, 0.23, -1.49]],
  shell: [['ogive', -0.06, -0.06, 0.03, 0.06, 0.06, 0.36], ['body', -0.06, -0.06, -0.33, 0.06, 0.06, 0.03], ['band', -0.07, -0.07, -0.25, 0.07, 0.07, -0.21]],
  kh35: [['nose', -0.21, -0.21, 1.7, 0.21, 0.21, 2.2], ['body', -0.21, -0.21, -1.62, 0.21, 0.21, 1.7], ['wings', -0.47, -0.47, -0.2, 0.47, 0.47, 0.6], ['fins', -0.36, -0.36, -1.62, 0.36, 0.36, -1.1], ['inlet', -0.12, -0.27, -0.95, 0.12, -0.19, -0.2], ['booster', -0.36, -0.36, -2.2, 0.36, 0.36, -1.62]],
  kalibr: [['nose', -0.27, -0.27, 3.16, 0.27, 0.27, 4.11], ['terminal', -0.3, -0.3, 1.55, 0.3, 0.3, 3.16], ['body', -0.27, -0.27, -2.45, 0.27, 0.31, 1.55], ['wings', -1.55, -0.2, -0.61, 1.55, -0.17, 0.17], ['fins', -0.49, -0.49, -2.42, 0.49, 0.49, -1.9], ['inlet', -0.15, -0.43, -1.55, 0.15, -0.25, -0.85], ['booster', -0.34, -0.34, -4.11, 0.34, 0.34, -2.45]],
  kornet_msl: [['body', -0.08, -0.08, -0.6, 0.08, 0.08, 0.6]],
  torpedo533: [['nose', -0.27, -0.27, 2.68, 0.27, 0.27, 3.1], ['body', -0.27, -0.27, -2.15, 0.27, 0.27, 2.68], ['tail', -0.27, -0.27, -3.1, 0.27, 0.27, -2.15]],
  // the third wave (data/models_units3.js; tools/check_models.mjs --boxes)
cg: [['hull', -8.4, 0, -86.4, 8.4, 9.66, 86.4], ['houseF', -7.9, 6.13, 15, 7.9, 18.3, 42], ['houseM', -5.6, 6.03, -4, 5.6, 9.3, 15], ['houseA', -7.7, 5.86, -36, 7.7, 16.2, -4], ['spy', -6.53, 11.22, -29.63, 6.33, 15.38, 40.73], ['stacks', -2.3, 9.3, -4.2, 2.3, 22.85, 14.2], ['mastF', -5.2, 18.28, 35.04, 5.2, 40.7, 38.56], ['mastM', -4.2, 16.13, -13.6, 4.2, 33, -8], ['sps', -3.65, 33, -11.1, 3.65, 37.3, -7.2], ['gunF', -2, 7.66, 60.1, 2, 10.06, 70], ['gunA', -2, 5.72, -80.5, 2, 8.12, -70.6], ['vlsF', -4.19, 7.04, 47.62, 4.17, 7.28, 54.38], ['vlsA', -4.19, 5.82, -64.38, 4.17, 6.06, -57.62], ['ciwsF', 2.88, 15.4, 20.93, 5.02, 18.76, 24.3], ['ciwsA', -5.82, 11.3, -34.7, -3.68, 14.66, -31.33], ['harpoon', -5.57, 5.69, -80.9, 5.57, 10.31, -78.1], ['arms', -7.37, 6.11, -1.23, 7.37, 7.95, 1.87], ['boats', -8.15, 9.5, -1.32, 8.15, 10.85, 9], ['hangar', -5.95, 5.91, -36.06, 5.95, 11.06, -36.04]],
  lcs: [['hull', -7.17, 0, -63.7, 7.17, 10.41, 63.7], ['cross', -15.8, 3.4, -63.7, 15.8, 9.2, 26], ['outriggers', -14.5, 0, -63.7, 14.5, 3.4, -6], ['bridge', -10.5, 9.2, 0, 10.5, 29.8, 24], ['hangar', -9, 9.2, -26, 9, 15.6, 0], ['radar', -1.2, 30.2, 9.4, 1.2, 31.8, 10.1], ['gun', -1.45, 9.52, 38.2, 1.45, 11.42, 45.4], ['searam', -0.82, 15.6, -23.85, 0.95, 18.8, -21.85], ['jets', -3.6, -0.05, -64.65, 3.6, 1.2, -63.68]],
  s400: [['tractor', -1.62, 0.8, 4.35, 1.62, 3.5, 8.15], ['chassis', -1.55, 0.44, -8.35, 1.55, 2.02, 7.95], ['wheelsT', -1.28, 0, 0.89, 1.28, 1.32, 7.56], ['wheelsS', -1.35, 0, -7.56, 1.35, 1.32, -4.84], ['cabin', -1.25, 1.9, 0.3, 1.25, 3.85, 3.55], ['pack', -1.59, 1.83, -8, 1.59, 3.1, -0.45], ['caps', -1.52, 2.17, -0.45, 1.52, 2.93, -0.33], ['ram', -0.19, 1.55, -4.45, 0.19, 1.98, -1.25], ['jacks', -1.55, 0.62, -8.05, 1.55, 1.62, -0.6]],
  s400r: [['chassis', -1.62, 0.32, -7.18, 1.62, 1.59, 5.9], ['wheelsL', -1.55, 0, -5.69, -1, 1.48, 5.19], ['wheelsR', 1, 0, -5.69, 1.55, 1.48, 5.19], ['cab', -1.93, 0.72, 4.1, 1.93, 3.44, 6.64], ['bay', -1.36, 1.45, 2.95, 1.36, 2.95, 4.1], ['shelter', -1.35, 1.45, -4.2, 1.35, 3.7, 2.85], ['pedestal', -1.45, 0.76, -6.75, 1.45, 3.75, -2.85], ['array', -1.7, 3.75, -5.35, 1.7, 8.35, -4.67]],
  bereg: [['chassis', -1.55, 0.51, -5.85, 1.55, 1.6, 5.55], ['wheelsL', -1.54, 0, -4, -0.98, 1.5, 4.7], ['wheelsR', 0.98, 0, -4, 1.54, 1.5, 4.7], ['cabs', -1.55, 0.85, 3.95, 1.55, 2.95, 5.97], ['body', -1.5, 1.3, 0.6, 1.5, 3.2, 3.95], ['turret', -1.45, 1.55, -5.6, 1.45, 3.85, -0.7], ['gun', -0.62, 2.6, -1.8, 0.62, 3.6, 5.2], ['jacks', -1.53, 0.62, -5.53, 1.53, 1.35, 5.13]],
  s400_msl: [['radome', -0.26, -0.26, 2.5, 0.26, 0.26, 3.75], ['body', -0.26, -0.26, -3.75, 0.26, 0.26, 2.5], ['fins', -0.56, -0.56, -3.7, 0.56, 0.56, -3.15]],
  rim116: [['nose', -0.06, -0.06, 1.2, 0.06, 0.06, 1.4], ['body', -0.06, -0.06, -1.39, 0.06, 0.06, 1.19], ['fins', -0.21, -0.21, -1.37, 0.21, 0.21, 0.97]],
  shell130: [['ogive', -0.06, -0.06, 0.04, 0.07, 0.07, 0.34], ['body', -0.06, -0.06, -0.33, 0.07, 0.07, 0.04], ['band', -0.07, -0.07, -0.25, 0.07, 0.07, -0.21]],
  shell57: [['ogive', -0.03, -0.03, 0.02, 0.03, 0.03, 0.13], ['body', -0.03, -0.03, -0.12, 0.03, 0.03, 0.02], ['band', -0.03, -0.03, -0.09, 0.03, 0.03, -0.08]],
};
/* model part -> sim part: null = not a collision box (guy wires, the camouflage net, multi-mount parts whose bounds
   span the ship), '~part' = spill-over only (a thin, spread part: its box is not solid) */
const ALIAS = {
  hq: { guys: null, net: null },
  tel: { capL: 'launcher', capR: 'launcher', fans: 'chassis' },
  radar: { fans: 'chassis' },
  transloader: { hook: 'jib', tlcR: 'bed', tlcL: 'bed' },
  bal: { bay: 'cabin', caps: 'pack' },
  carrier: { below: 'hull', props: 'hull', anchors: 'hull', mast: 'island', wires: null, nssm: null, ram: null, ciws: null, boats: null, cats: '~cats', elevators: '~elevators' },
  destroyer: { arms: null, deck: 'hull' },
  cg: { deck: 'hull', rails: null },
  lcs: { deck: 'cross', rails: null },
  s400: { caps: 'pack' },
  s400r: { bay: 'chassis' },
};
/* boxes the model does not have: the carrier's parked air wing (aft deck and the starboard row) */
const EXTRA = { carrier: [['air', -12, 19.57, -150, 36, 24.5, -60]] };
const MUNITION = { tomahawk: 'strike_missile', sam57e6: 'pantsir_missile', aim120: 'aam' };

/* ---------------------------------------------------------------- bodies */
const BODIES = new Map();
export function bodyOf(def) {
  let b = BODIES.get(def.type);
  if (!b) { b = build(def); BODIES.set(def.type, b); }
  return b;
}
function build(def) {
  const key = def.model, A = ALIAS[key] || {};
  const main = [], sparse = [];
  const heavy = def.partNames.reduce((a, p) => def.parts[p].w > def.parts[a].w ? p : a, def.partNames[0]);
  const put = (name, b) => {
    let p = name in A ? A[name] : name;
    if (p === null) return;
    const sp = p[0] === '~'; if (sp) p = p.slice(1);
    if (!def.parts[p]) return;
    (sp ? sparse : main).push({ part: p, b });
  };
  for (const r of BOX[key] || []) put(r[0], r.slice(1));
  for (const r of EXTRA[key] || []) put(r[0], r.slice(1));
  const [L, W, H] = def.size;
  if (!main.length) {
    // no model bounds: the unit's overall size
    main.push({ part: heavy, b: def.domain === 'sea' ? [-W / 2, -(def.draught || 0), -L / 2, W / 2, Math.max(3, H * .3), L / 2]
      : def.domain === 'air' ? [-W / 2, -H / 2, -L / 2, W / 2, H / 2, L / 2] : [-W / 2, 0, -L / 2, W / 2, H, L / 2] });
  }
  // a surface ship's hull under the waterline (torpedoes run there) when the model stops at the waterline
  if (def.domain === 'sea' && !def.sub && !def.hover && def.draught && !main.some(m => m.b[1] < -1)) {
    const h = main.find(m => m.part === heavy) || main[0], b = h.b;
    main.push({ part: h.part, b: [b[0] * .85, -def.draught, b[2] * .9, b[3] * .85, 0, b[5] * .9] });
  }
  const pack = list => {
    const n = list.length, bx = new Float64Array(n * 6), vol = new Float64Array(n), part = [];
    list.forEach((m, i) => {
      for (let k = 0; k < 6; k++) bx[i * 6 + k] = m.b[k];
      part.push(m.part);
      vol[i] = Math.max(.05, m.b[3] - m.b[0]) * Math.max(.05, m.b[4] - m.b[1]) * Math.max(.05, m.b[5] - m.b[2]);
    });
    return { n, bx, vol, part };
  };
  const M = pack(main), S = pack(sparse);
  let R = 0;
  for (const m of main) for (const x of [m.b[0], m.b[3]]) for (const y of [m.b[1], m.b[4]]) for (const z of [m.b[2], m.b[5]]) R = Math.max(R, Math.hypot(x, y, z));
  // the aim point: the centre of the heaviest part's largest box (above the water for ships)
  let ai = 0, best = -1;
  for (let i = 0; i < M.n; i++) {
    if (def.domain === 'sea' && M.bx[i * 6 + 4] <= .5) continue;
    const w = def.parts[M.part[i]].w * 1e7 + M.vol[i];
    if (w > best) { best = w; ai = i; }
  }
  const o = ai * 6, aim = [(M.bx[o] + M.bx[o + 3]) / 2, (M.bx[o + 1] + M.bx[o + 4]) / 2, (M.bx[o + 2] + M.bx[o + 5]) / 2];
  if (def.domain === 'sea') aim[1] = Math.max(aim[1], Math.min(M.bx[o + 4] - .5, 1.5));
  return { n: M.n, bx: M.bx, vol: M.vol, part: M.part, sn: S.n, sb: S.bx, svol: S.vol, spart: S.part, R, aim, air: def.domain === 'air' };
}

/* ---------------------------------------------------------------- frames */
let fc = 1, fs = 0, fcp = 1, fsp = 0, fair = false;
const Q = new Float64Array(6);
function frame(u, b) {
  fc = Math.cos(u.hdg); fs = Math.sin(u.hdg);
  fair = b.air && !!u.pitch;
  if (fair) { fcp = Math.cos(u.pitch); fsp = Math.sin(u.pitch); }
}
/* world offset (relative to the unit origin) -> model frame, into Q[k..k+2] */
function toM(dx, dy, dz, k) {
  const x = dx * fc - dz * fs, z = dx * fs + dz * fc;
  if (fair) { Q[k] = x; Q[k + 1] = dy * fcp - z * fsp; Q[k + 2] = dy * fsp + z * fcp; }
  else { Q[k] = x; Q[k + 1] = dy; Q[k + 2] = z; }
}
/* a model-frame point of the unit -> world */
export function toWorld(u, x, y, z, out) {
  const b = bodyOf(u.def);
  if (b.air && u.pitch) { const c = Math.cos(u.pitch), s = Math.sin(u.pitch), y2 = y * c + z * s; z = -y * s + z * c; y = y2; }
  const c = Math.cos(u.hdg), s = Math.sin(u.hdg);
  out[0] = u.pos[0] + x * c + z * s; out[1] = u.pos[1] + y; out[2] = u.pos[2] - x * s + z * c;
  return out;
}

/* segment A + t D (t 0..1) against box bx[k..k+5] grown by g: entry t, or -1 */
function slab(x0, y0, z0, dx, dy, dz, bx, k, g) {
  let t0 = 0, t1 = 1, lo, hi, u0, u1;
  lo = bx[k] - g; hi = bx[k + 3] + g;
  if (dx > -1e-12 && dx < 1e-12) { if (x0 < lo || x0 > hi) return -1; }
  else { u0 = (lo - x0) / dx; u1 = (hi - x0) / dx; if (u0 > u1) { const w = u0; u0 = u1; u1 = w; } if (u0 > t0) t0 = u0; if (u1 < t1) t1 = u1; if (t0 > t1) return -1; }
  lo = bx[k + 1] - g; hi = bx[k + 4] + g;
  if (dy > -1e-12 && dy < 1e-12) { if (y0 < lo || y0 > hi) return -1; }
  else { u0 = (lo - y0) / dy; u1 = (hi - y0) / dy; if (u0 > u1) { const w = u0; u0 = u1; u1 = w; } if (u0 > t0) t0 = u0; if (u1 < t1) t1 = u1; if (t0 > t1) return -1; }
  lo = bx[k + 2] - g; hi = bx[k + 5] + g;
  if (dz > -1e-12 && dz < 1e-12) { if (z0 < lo || z0 > hi) return -1; }
  else { u0 = (lo - z0) / dz; u1 = (hi - z0) / dz; if (u0 > u1) { const w = u0; u0 = u1; u1 = w; } if (u0 > t0) t0 = u0; if (u1 < t1) t1 = u1; if (t0 > t1) return -1; }
  return t0;
}
/* squared distance from a point to box bx[k..k+5] */
function pbd2(x, y, z, bx, k) {
  let d = 0, v;
  v = bx[k] - x; if (v > 0) d += v * v; else { v = x - bx[k + 3]; if (v > 0) d += v * v; }
  v = bx[k + 1] - y; if (v > 0) d += v * v; else { v = y - bx[k + 4]; if (v > 0) d += v * v; }
  v = bx[k + 2] - z; if (v > 0) d += v * v; else { v = z - bx[k + 5]; if (v > 0) d += v * v; }
  return d;
}
/* squared distance from the origin to segment A + t D */
function seg0d2(x0, y0, z0, dx, dy, dz) {
  const dd = dx * dx + dy * dy + dz * dz;
  let t = dd > 1e-12 ? -(x0 * dx + y0 * dy + z0 * dz) / dd : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = x0 + dx * t, y = y0 + dy * t, z = z0 + dz * t;
  return x * x + y * y + z * z;
}
/* the smallest box (grown by g) holding a model-frame point; -1 if none */
function holder(b, x, y, z, g) {
  let bi = -1, bv = 1e18;
  for (let i = 0; i < b.n; i++) {
    const k = i * 6;
    if (x < b.bx[k] - g || x > b.bx[k + 3] + g || y < b.bx[k + 1] - g || y > b.bx[k + 4] + g || z < b.bx[k + 2] - g || z > b.bx[k + 5] + g) continue;
    if (b.vol[i] < bv) { bv = b.vol[i]; bi = i; }
  }
  return bi;
}

/* ---------------------------------------------------------------- tests */
/* pen: how far past the entry the part is judged (m): a round that enters the hull's box over the deck and goes on
   into the gun's box struck the gun */
export function segUnit(u, ax, ay, az, bx, by, bz, g, pen) {
  const b = bodyOf(u.def);
  frame(u, b); toM(ax, ay, az, 0); toM(bx, by, bz, 3);
  const x0 = Q[0], y0 = Q[1], z0 = Q[2], dx = Q[3] - x0, dy = Q[4] - y0, dz = Q[5] - z0;
  const rr = b.R + g;
  if (seg0d2(x0, y0, z0, dx, dy, dz) > rr * rr) return -1;
  let best = 2, bi = -1;
  for (let i = 0; i < b.n; i++) { const t = slab(x0, y0, z0, dx, dy, dz, b.bx, i * 6, g); if (t >= 0 && t < best) { best = t; bi = i; } }
  if (bi < 0) return -1;
  const x = x0 + dx * best, y = y0 + dy * best, z = z0 + dz * best;
  let hi = -1;
  if (pen > 0) {
    const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1, k = pen / l;
    hi = holder(b, x + dx * k, y + dy * k, z + dz * k, .05);
  }
  if (hi < 0) hi = holder(b, x, y, z, g + .05);
  HIT.s = best; HIT.x = x; HIT.y = y; HIT.z = z; HIT.part = b.part[hi >= 0 ? hi : bi]; HIT.d = 0;
  return best;
}
export function distUnit(u, ax, ay, az, bx, by, bz, max) {
  const b = bodyOf(u.def);
  frame(u, b); toM(ax, ay, az, 0); toM(bx, by, bz, 3);
  const x0 = Q[0], y0 = Q[1], z0 = Q[2], dx = Q[3] - x0, dy = Q[4] - y0, dz = Q[5] - z0;
  const rr = b.R + max;
  if (seg0d2(x0, y0, z0, dx, dy, dz) > rr * rr) return Infinity;
  let best = Infinity, bs = 0, bi = -1;
  for (let i = 0; i < b.n; i++) {
    const k = i * 6;
    if (slab(x0, y0, z0, dx, dy, dz, b.bx, k, max) < 0) continue;
    // the distance to a box along the segment is convex in t: a ternary search finds its least
    let lo = 0, hi = 1;
    for (let it = 0; it < 22; it++) {
      const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
      if (pbd2(x0 + dx * m1, y0 + dy * m1, z0 + dz * m1, b.bx, k) <= pbd2(x0 + dx * m2, y0 + dy * m2, z0 + dz * m2, b.bx, k)) hi = m2; else lo = m1;
    }
    const t = (lo + hi) / 2, d2 = pbd2(x0 + dx * t, y0 + dy * t, z0 + dz * t, b.bx, k);
    if (d2 < best || (d2 === best && bi >= 0 && b.vol[i] < b.vol[bi])) { best = d2; bs = t; bi = i; }
  }
  if (bi < 0) return Infinity;
  const k = bi * 6, px = x0 + dx * bs, py = y0 + dy * bs, pz = z0 + dz * bs;
  const cx = px < b.bx[k] ? b.bx[k] : px > b.bx[k + 3] ? b.bx[k + 3] : px;
  const cy = py < b.bx[k + 1] ? b.bx[k + 1] : py > b.bx[k + 4] ? b.bx[k + 4] : py;
  const cz = pz < b.bx[k + 2] ? b.bx[k + 2] : pz > b.bx[k + 5] ? b.bx[k + 5] : pz;
  const hi = holder(b, cx, cy, cz, .05);
  HIT.s = bs; HIT.x = cx; HIT.y = cy; HIT.z = cz; HIT.part = b.part[hi >= 0 ? hi : bi]; HIT.d = Math.sqrt(best);
  return HIT.d;
}
export function pointUnit(u, dx, dy, dz) {
  const b = bodyOf(u.def);
  frame(u, b); toM(dx, dy, dz, 0);
  let best = Infinity, bi = 0;
  for (let i = 0; i < b.n; i++) { const d2 = pbd2(Q[0], Q[1], Q[2], b.bx, i * 6); if (d2 < best) { best = d2; bi = i; } }
  const k = bi * 6, px = Q[0], py = Q[1], pz = Q[2];
  HIT.x = px < b.bx[k] ? b.bx[k] : px > b.bx[k + 3] ? b.bx[k + 3] : px;
  HIT.y = py < b.bx[k + 1] ? b.bx[k + 1] : py > b.bx[k + 4] ? b.bx[k + 4] : py;
  HIT.z = pz < b.bx[k + 2] ? b.bx[k + 2] : pz > b.bx[k + 5] ? b.bx[k + 5] : pz;
  HIT.part = b.part[bi]; HIT.d = Math.sqrt(best); HIT.s = 0;
  return HIT.d;
}
/* least distance between segment A..B and the capsule axis -h f .. +h f (Ericson, closest points of two segments) */
export function segAxis(ax, ay, az, bx, by, bz, fx, fy, fz, h) {
  const d1x = bx - ax, d1y = by - ay, d1z = bz - az, d2x = 2 * h * fx, d2y = 2 * h * fy, d2z = 2 * h * fz;
  const rx = ax + h * fx, ry = ay + h * fy, rz = az + h * fz;              // A - P2, P2 = -h f
  const a = d1x * d1x + d1y * d1y + d1z * d1z, e = d2x * d2x + d2y * d2y + d2z * d2z, f = d2x * rx + d2y * ry + d2z * rz;
  let s, t;
  if (a <= 1e-12 && e <= 1e-12) { s = 0; t = 0; }
  else if (a <= 1e-12) { s = 0; t = f / e; t = t < 0 ? 0 : t > 1 ? 1 : t; }
  else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= 1e-12) { t = 0; s = -c / a; s = s < 0 ? 0 : s > 1 ? 1 : s; }
    else {
      const bb = d1x * d2x + d1y * d2y + d1z * d2z, den = a * e - bb * bb;
      s = den > 1e-12 ? (bb * f - c * e) / den : 0; s = s < 0 ? 0 : s > 1 ? 1 : s;
      t = (bb * s + f) / e;
      if (t < 0) { t = 0; s = -c / a; s = s < 0 ? 0 : s > 1 ? 1 : s; }
      else if (t > 1) { t = 1; s = (bb - c) / a; s = s < 0 ? 0 : s > 1 ? 1 : s; }
    }
  }
  const x = rx + d1x * s - d2x * t, y = ry + d1y * s - d2y * t, z = rz + d1z * s - d2z * t;
  HIT.s = s; HIT.t = -h + 2 * h * t;
  HIT.d = Math.sqrt(x * x + y * y + z * z);
  return HIT.d;
}

/* the part holding (or nearest to) a model-frame point, other than `not` (spill-over: sparse parts count) */
export function partNear(def, x, y, z, not) {
  const b = bodyOf(def);
  let best = Infinity, bp = null, bv = 1e18;
  const scan = (n, bx, vol, part) => {
    for (let i = 0; i < n; i++) {
      if (part[i] === not) continue;
      const d = pbd2(x, y, z, bx, i * 6);
      if (d < best - 1e-9 || (d < best + 1e-9 && vol[i] < bv)) { best = d; bp = part[i]; bv = vol[i]; }
    }
  };
  scan(b.n, b.bx, b.vol, b.part); scan(b.sn, b.sb, b.svol, b.spart);
  return bp;
}

/* munition parts: the smallest box holding the point (grown 8 cm), else the nearest */
const MPARTS = new Map();
export function projPart(P, x, y, z) {
  const key = MUNITION[P.model] || P.model;
  let m = MPARTS.get(key);
  if (!m) {
    const rows = BOX[key] || [['body', -.5, -.5, -2, .5, .5, 2]];
    m = { n: rows.length, bx: new Float64Array(rows.length * 6), vol: new Float64Array(rows.length), part: rows.map(r => r[0]) };
    rows.forEach((r, i) => { for (let k = 0; k < 6; k++) m.bx[i * 6 + k] = r[k + 1]; m.vol[i] = Math.max(.02, r[4] - r[1]) * Math.max(.02, r[5] - r[2]) * Math.max(.02, r[6] - r[3]); });
    MPARTS.set(key, m);
  }
  const hi = holder(m, x, y, z, .08);
  if (hi >= 0) return m.part[hi];
  let best = Infinity, bi = 0;
  for (let i = 0; i < m.n; i++) { const d = pbd2(x, y, z, m.bx, i * 6); if (d < best) { best = d; bi = i; } }
  return m.part[bi];
}
