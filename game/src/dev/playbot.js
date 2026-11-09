/* Play-test helper, loaded only with ?playbot (main.js). It reads what a player sees (units and rounds on screen
   with their screen positions in CSS px, the selection, the time rate) and pumps frames while the tab is hidden
   (a hidden tab gets no requestAnimationFrame). It never changes the sim.
     ONIKS.bot.units('own' | 'enemy' | undefined) -> [{ id, type, side, x, y, px, hp, sel }]   on screen only
     ONIKS.bot.rounds() -> [{ id, type, x, y, age, v }]
     ONIKS.bot.pump(sec, fps)  real-time frames (default 30 fps), as the loop would draw them
     ONIKS.bot.state() -> { t, rate, sel, spec, camDist } */
export function attach(O) {
  const { game, sim, R } = O, cam = R.camera, q = [0, 0, 0];
  const onScreen = p => cam.project(p, q) && q[0] >= 0 && q[1] >= 0 && q[0] <= cam.W && q[1] <= cam.H;
  O.bot = {
    units(which) {
      const out = [];
      for (const u of sim.list()) {
        if (u.dead) continue;
        if (which === 'own' && u.side !== game.side) continue;
        if (which === 'enemy' && u.side === game.side) continue;
        const p = game.unitScreenPos ? game.unitScreenPos(u) : u.pos;
        if (!onScreen(p)) continue;
        const r = (u.def && (u.def.len || u.def.L)) || 10;
        out.push({ id: u.id, type: u.type, side: u.side, x: Math.round(q[0]), y: Math.round(q[1]), px: +(cam.fl * r / q[2]).toFixed(1), hp: u.hp, sel: game.selection.has(u.id) });
      }
      return out;
    },
    rounds() {
      const out = [];
      for (const p of sim.projectiles.values()) {
        if (!onScreen(p.pos)) continue;
        const v = p.vel ? Math.hypot(p.vel[0], p.vel[1], p.vel[2]) : 0;
        out.push({ id: p.id, type: p.kind, x: Math.round(q[0]), y: Math.round(q[1]), age: +(p.age || 0).toFixed(2), phase: p.phase, v: Math.round(v), alt: Math.round(p.pos[1]) });
      }
      return out;
    },
    pump(sec, fps) { const n = Math.max(1, Math.round(sec * (fps || 30))); return O.advance(sec, n); },
    state() { return { t: +sim.t.toFixed(1), rate: game.paused ? 0 : game.timeRate, sel: [...game.selection], selProj: game.selProj ? [...game.selProj] : [], camDist: Math.round(cam.dist) }; },
  };
  return O.bot;
}
