/* THE PICTURE (Point Cloud A): model adapters. HD kit when loaded, simple stand-ins
   otherwise, so the film always runs. Also the film's own cargo transport (TRK 22),
   which the kit does not provide. Geometry only; the film samples it into dots. */
(function () {
  const { V, R, X } = M3;
  const G = GEO;
  const has = k => !!(window.HD && typeof HD[k] === 'function');

  /* ---------- stand-ins until the sea/air kit lands ---------- */
  /* MH-60R: origin on the ground under the rotor mast, nose +Z. state rotor, trotor (rad) */
  function stubHelo() {
    const F = [], TL = [], GR = [], SN = [];
    F.push(G.lathe([0, 1.55, -3.1], [0, 0, 1], [[0, .55], [.6, .95], [2.2, 1.12], [4.8, 1.1], [6.2, .92], [7.1, .55], [7.55, .12]], { n: 22, gen: 10, caps: true }));
    F.push(G.box([-1.05, 1.05, -3.2], [1.05, 2.55, 2.8]));
    F.push(G.box([-.75, 2.5, -2.6], [.75, 3.35, 1.1]));                        // engine deck
    F.push(G.cyl([0, 3.3, 0], [0, 3.85, 0], .22, { n: 10, gen: 0 }));          // mast
    TL.push(G.lathe([0, 2.25, -3.2], [0, .08, -1], [[0, .62], [3.5, .38], [7.2, .24]], { n: 14, gen: 6 }));
    TL.push(G.box([-.14, 2.6, -10.6], [.14, 4.4, -9.6]));                      // pylon
    TL.push(G.panel([[-2.2, 2.5, -10.7], [2.2, 2.5, -10.7], [2.2, 2.5, -9.9], [-2.2, 2.5, -9.9]], { hatch: 3 }));
    for (const [x, z] of [[-1.35, 1.9], [1.35, 1.9]]) { GR.push(G.cyl([x, .45, z], [x * .7, 1.2, z], .06, { n: 6, gen: 0 })); GR.push(G.cyl([x - .1, .38, z], [x + .1, .38, z], .38, { n: 12, gen: 0 })); }
    GR.push(G.cyl([0, .25, -8.6], [0, 2.3, -8.9], .05, { n: 6, gen: 0 }));
    SN.push(G.lathe([0, .9, 3.2], [0, -1, 0], [[0, .28], [.3, .26], [.42, 0]], { n: 14, gen: 4 }));
    const rotor = st => [G.blades([0, 3.9, 0], [0, 1, 0], 4, .45, 8.18, { rot: st.rotor || 0, chord: 1.1, taper: 1, edge: .9 }),
      G.lathe([0, 3.75, 0], [0, 1, 0], [[0, .42], [.3, .42], [.45, .2]], { n: 14, gen: 0 })];
    const trot = st => [G.blades([.45, 3.55, -10.3], V.norm([1, .36, 0]), 4, .12, 1.67, { rot: st.trotor || 0, chord: .9, taper: 1, edge: .8 })];
    return {
      HUB: [0, 3.9, 0], TROTOR: [.45, 3.55, -10.3],
      parts: [
        { name: 'fuselage', label: 'MH-60R · fuselage', prims: F },
        { name: 'rotor', label: 'Main rotor · 4 blades · 16.4 m', prims: rotor({}), dyn: rotor },
        { name: 'tailrotor', label: 'Tail rotor · canted 20°', prims: trot({}), dyn: trot },
        { name: 'tail', label: 'Tail boom · pylon · stabilator', prims: TL },
        { name: 'gear', label: 'Landing gear', prims: GR },
        { name: 'sensors', label: 'Nose turret', prims: SN },
      ],
    };
  }

  /* cargo transport, ~180 m: long parallel hull, hatches and cranes forward, house aft */
  function transport() {
    const H = [{ t: 'hull', L: 178, B: 26, D: 13 }], S = [], C = [];
    const d = 13.05;
    S.push(G.box([-12, d, -80], [12, d + 17, -60], { ribs: { y: 5 } }));
    S.push(G.box([-9, d + 17, -76], [9, d + 21, -64]));
    S.push(G.box([-2.2, d + 12, -58], [2.2, d + 30, -54]));                    // funnel
    for (let k = 0; k < 5; k++) { const z = -44 + k * 25; C.push(G.box([-9, d, z], [9, d + 2.2, z + 17], { ribs: { x: 3 } })); }
    for (const z of [-32, 8, 48]) { C.push(G.cyl([0, d, z], [0, d + 18, z], .6, { n: 8, gen: 0 })); C.push(G.cyl([0, d + 16, z], [7, d + 9, z + 12], .3, { n: 6, gen: 0 })); }
    return {
      parts: [
        { name: 'hull', label: 'Hull', prims: H },
        { name: 'super', label: 'Accommodation', prims: S },
        { name: 'cargo', label: 'Hatches · cranes', prims: C },
      ],
    };
  }

  const MOD = {
    hdLand: () => !!(window.HD && HD.READY_LAND),
    hdSea: () => !!(window.HD && HD.READY_SEA_AIR),
    tel: () => has('tel') ? HD.tel() : G.tel(),
    radar: () => has('radar') ? HD.radar() : G.radarTruck(),
    pantsir: () => has('pantsir') ? HD.pantsir() : G.radarTruck(),
    destroyer: () => has('destroyer') ? HD.destroyer() : G.destroyer(),
    helo: () => has('helo') ? HD.helo() : stubHelo(),
    transport,
  };
  window.PA_MOD = MOD;
})();
