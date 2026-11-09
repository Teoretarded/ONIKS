/* ONIKS LAB (dev): strike any model in the game with any round and take the hit apart frame by frame.
   lab.html (play.html with ?mode=lab): an empty range, a calm sea, the game's own systems (the blast solver, scars,
   fx, debris, structure, Inspect) and this system's panels. Built for a person at the screen and for an agent at the
   console (window.LAB, below): every control has a call, every view a still, every run a report.

   Left: the target (any unit type), the round (every munition and gun, its charge as the game takes it, overrides),
   the aim (presets cast on the model, the blast QA battery's cases, or a click on the model: the round then comes in
   along the line of sight), direct or mission (a real shooter at range, the sim's own flight), FIRE / RE-RUN.
   Right: tau and the solver's state, the numbers (solved tear, flaps, set, steps, the sim's holes, flooding, systems),
   graphs against tau (ms and s on one axis), the solver's plates as maps (displacement, normal, flags, soot; hover a
   texel), the sim's state and the events.
   Bottom: the clock. Frame steps (0.25 ms .. 1 s) hold until the GPU solve has reached the time shown; a step back is
   a re-run of the same shot to that tau (deterministic: the sim's damage rolls reseeded, the steel's scatter seeded by
   the impact). Play at x1 .. x0.01. CAPTURE records a schedule of taus from chosen views (a filmstrip in memory: scrub
   it both ways, contact sheets, saved with the report under game/shots/lab/<name>/).

   Keys: Space play / pause · . , step forward / back · [ ] rate · F fire · R re-run · T aim by click · 1-8 views
   (wide, close, detail, macro, square-on, along the hull, top, inside) · V lab camera on / off (W S zoom, A D orbit,
   Q E pitch, drag to orbit, shift-drag / middle-drag to pan, wheel to zoom, double-click to centre on a point) ·
   X x-ray · G ghost hull · C capture · P four views now · K QA check · Home tau 0 · ← → recorded frames · H panels ·
   Shift H overlays · Esc leaves aim / playback.

   Console (window.LAB; every call returns a Promise or a value, numbers in metres, seconds, kg TNT):
     await LAB.target('ddg')                      a fresh target (any key of data/units.js UNITS); waits for its model
     LAB.aim('side') / LAB.aim('qa:ddg_mid') / LAB.aim({ loc: [x, y, z], from: [dx, dy, dz] })   model frame: +X stbd, +Y up, +Z bow
     LAB.munition('oniks', { tnt: 120, fuze: 'in', delay: 1.6, standoff: 0, speed: 750, dmg: 80 })
     await LAB.fire()                             lands after the preroll; LAB.fire({ preroll: 0 }) lands now
     await LAB.step(0.001) / await LAB.to(0.25)   tau in s (to() back = a re-run)
     LAB.view('detail') / LAB.view({ yaw, pitch, dist, focus })
     await LAB.still('name')                      -> game/shots/lab/name.png (the view, overlays on)
     await LAB.quad('name')                       four views of now in one image
     await LAB.capture({ views: ['detail', 'macro'], to: 3, name: 'ddg_mid', save: 'sheets' })   -> sheets + report.json
     LAB.report() / await LAB.save('name')        the run as JSON (charge, patch, sim, compare, qa, perf, timeline, events)
     await LAB.qa() · LAB.plates() · LAB.state() · await LAB.mission({ range: 24000, bearing: 90, defend: false })
   URL: lab.html?target=cg&kind=uran&aim=qa:cg_side&view=detail&fire=1 (or ?case=ddg_mid: a battery case). */
import { createCore } from './core.js';
import { createDraw } from './draw.js';
import { createCapture, tauTxt } from './capture.js';
import { munitions } from '../../ui/inspect/impact.js';
import { CASES } from '../blast_qa.js';
import { exportHit, hitTables } from './export.js';
import { probe as probeNow, record as recordRun, drawVectors, field as fieldNow, deformStats } from './probe.js';

const STEPS = [[.00025, '0.25 MS'], [.001, '1 MS'], [1 / 240, '1/240'], [1 / 60, '1/60'], [.01, '10 MS'], [.05, '50 MS'], [.1, '0.1 S'], [1, '1 S']];
const RATES = [1, .5, .25, .1, .05, .02, .01];
const VIEWS = [['wide', 'Wide 300 m'], ['close', 'Close 60 m'], ['detail', 'Detail 25 m'], ['macro', 'Macro 12 m'], ['square', 'Square-on'], ['graze', 'Along the hull'], ['top', 'Top'], ['inside', 'Inside']];
const OVL = [['aim', 'Aim / hit'], ['patch', 'Patch'], ['ruler', 'Rule'], ['holes', 'Holes'], ['pieces', 'Pieces'], ['qa', 'QA flags'], ['vectors', 'Vectors']];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const f1 = v => (Math.round(v * 10) / 10).toFixed(1), f2 = v => (Math.round(v * 100) / 100).toFixed(2);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export async function createLab(game, ctx) {
  if (game.mode !== 'lab') return null;
  const sim = game.sim, R = game.R, cam = R.camera, Q = new URLSearchParams(location.search);
  // (window.ONIKS is set once the loop runs: the frame calls go through it then)
  const O = { get game() { return game; }, get R() { return R; }, get sim() { return sim; },
    advance: (s, n) => { if (window.ONIKS) return window.ONIKS.advance(s, n); n = n || 1; for (let i = 0; i < n; i++) game.frame(s / n); return sim.t; } };
  const core = createCore(game, O), L = core.L, draw = createDraw(core, game);
  const MUN = munitions(game.UNITS, game.PROJ);
  const st = {
    step: 2, rate: 3, panels: true, ovOn: true, aimMode: false, play: null, playV: null, rec: null,
    ov: { aim: true, patch: true, ruler: true, holes: true, pieces: true, qa: true, vectors: false },
    // (clean by default: no smoke, fire, fireball or sparks over the plating, so the damage itself is what is seen)
    disp: { neutral: true, ghost: 0, xray: 0, fxOff: true, defo: false, hold: true, sunAz: null, sunEl: null },
    probe: null, probeT: 0,
    mode: 'direct', mapMode: 'disp', hover: null, capOn: false, capViews: ['detail'], capTo: 3, msg: '', msgT: 0,
  };
  const cams = createCams();
  const cap = createCapture(core, game, O, cams);
  const sun0 = R.sun ? R.sun.slice() : null;

  /* ------------------------------------------------------------ the lab camera (an exact view in the target's frame) */
  function createCams() {
    const C = { on: true, focus: [0, 4, 0], yaw: Math.PI / 2 + .45, pitch: .16, dist: 60, name: 'close', chase: false, inside: null };
    function hitFrame() {
      const s = L.shot, u = core.unit();
      const at = s && s.landed ? s.landed.at : s && s.loc ? s.loc : L.aim.loc;
      let n = s && s.landed ? s.landed.n : null;
      if (!n) { const f = s && s.from ? s.from : L.aim.from; n = Math.abs(f[1]) > .7 ? [0, 1, 0] : [Math.sign(f[0]) || 1, 0, 0]; }
      const deck = n[1] > .7, yN = deck ? (at[0] >= 0 ? Math.PI / 2 : -Math.PI / 2) : Math.atan2(n[0], n[2]);
      return { at: at.slice(), n, deck, yN, u };
    }
    function apply(name) {
      if (typeof name === 'object') { Object.assign(C, name); C.on = true; C.inside = null; C.chase = false; return; }
      const H = hitFrame(), { at, n, deck, yN } = H;
      C.focus = at.slice(); C.name = name; C.on = true; C.chase = false; C.inside = null;
      const set = (d, y, p) => { C.dist = d; C.yaw = y; C.pitch = p; };
      switch (name) {
        case 'wide': set(300, yN + .35, .3); break;
        case 'close': set(60, yN + .45, deck ? .8 : .16); break;
        case 'detail': set(25, yN + .2, deck ? .75 : .1); break;
        case 'macro': set(12, yN + .08, deck ? 1.1 : .06); break;
        case 'square': set(30, yN, deck ? 1.5 : .02); break;
        case 'graze': set(40, yN + 1.25, deck ? .3 : .08); break;
        case 'top': set(60, yN + .01, 1.5); break;
        case 'inside': C.inside = { n: n.slice() }; set(7, yN + Math.PI, 0); break;
        case 'chase': C.chase = true; break;
        default: break;
      }
    }
    /* this frame's exact view */
    function view() {
      const u = core.unit(); if (!u || !C.on) return null;
      if (game.inspect && game.inspect.active) return null;
      if (C.chase && L.shot && L.shot.proj !== null && L.shot.proj !== undefined) {
        const p = sim.projectiles.get(L.shot.proj);
        if (p && p.alive) {
          const P = game.projPose(p), v = p.vel, l = Math.hypot(v[0], v[1], v[2]) || 1;
          const eye = [P.pos[0] - v[0] / l * 45 + 6, P.pos[1] - v[1] / l * 45 + 7, P.pos[2] - v[2] / l * 45];
          return { eye, look: [P.pos[0] + v[0] / l * 60, P.pos[1] + v[1] / l * 60, P.pos[2] + v[2] / l * 60] };
        }
      }
      const F = core.frameOf(u), a = C.focus;
      let e;
      if (C.inside) { const n = C.inside.n; e = [a[0] - n[0] * C.dist, a[1] - n[1] * C.dist + (Math.abs(n[1]) > .7 ? 0 : .4), a[2] - n[2] * C.dist]; }
      else { const cp = Math.cos(C.pitch); e = [a[0] + C.dist * cp * Math.sin(C.yaw), a[1] + C.dist * Math.sin(C.pitch), a[2] + C.dist * cp * Math.cos(C.yaw)]; }
      const eye = core.toWorld(u, e, F), look = core.toWorld(u, a, F);
      if (!C.inside) eye[1] = Math.max(eye[1], .8);
      if (![...eye, ...look].every(Number.isFinite)) return null;
      return { eye, look, near: C.inside ? .05 : undefined };
    }
    const save = () => JSON.parse(JSON.stringify(C));
    const restore = s => { Object.assign(C, s); };
    return { C, apply, view, save, restore };
  }

  /* ------------------------------------------------------------ the panels */
  addStyle();
  const root = document.createElement('div');
  root.id = 'lab'; root.className = 'always';
  (game.uiRoot || document.body).appendChild(root);
  const play = document.createElement('canvas');
  play.id = 'lab-play';
  (game.uiRoot ? game.uiRoot.parentNode : document.body).insertBefore(play, game.uiRoot || null);
  const types = Object.keys(game.UNITS).sort((a, b) => (DOM(a) - DOM(b)) || a.localeCompare(b));
  function DOM(t) { const d = game.UNITS[t]; return { sea: 0, land: 1, air: 2 }[d.domain] ?? 3; }
  root.innerHTML = `
  <div class="lb-l lb-p">
    <div class="lb-h"><b>ONIKS</b><span>LAB</span></div>
    <section><h4>Target</h4>
      <div class="lb-row"><select data-k="type">${types.map(t => `<option value="${t}">${esc(t.toUpperCase())} · ${esc(game.UNITS[t].name || t)}</option>`).join('')}</select><button data-a="spawn">New</button></div>
      <div class="lb-ro" data-o="tgt"></div>
      <div class="lb-row"><button data-a="model" data-v="dots" class="on" title="The game's model dots and the GPU blast patch">Dots (game)</button><button data-a="model" data-v="vox" title="The voxel ship prototype (src/vox)">Voxels (prototype)</button></div>
    </section>
    <section><h4>Round</h4>
      <div class="lb-row"><select data-k="kind">${MUN.map(m => `<option value="${m.key}">${esc(m.cls)} · ${esc(m.name)}</option>`).join('')}</select></div>
      <div class="lb-ro" data-o="kind"></div>
      <div class="lb-grid">
        <label>TNT kg<input data-ov="tnt" type="number" step="any" placeholder="auto"></label>
        <label>Warhead kg<input data-ov="wh" type="number" step="any" placeholder="auto"></label>
        <label>Fuze<select data-ov="fuze"><option value="">auto</option><option value="in">in (delayed)</option><option value="out">out (contact)</option><option value="frag">frag (proximity)</option></select></label>
        <label>Delay m<input data-ov="delay" type="number" step="any" placeholder="1.6"></label>
        <label>Standoff m<input data-ov="standoff" type="number" step="any" placeholder="0"></label>
        <label>Speed m/s<input data-ov="speed" type="number" step="any" placeholder="auto"></label>
        <label>Sim damage<input data-ov="dmg" type="number" step="any" placeholder="auto"></label>
        <label class="lb-ck"><input data-ov="simDmg" type="checkbox" checked>Sim takes it</label>
      </div>
      <div class="lb-row"><button data-a="ovreset">Game values</button></div>
    </section>
    <section><h4>Aim</h4>
      <div class="lb-row"><button data-a="side" data-v="stbd">Stbd</button><button data-a="side" data-v="port">Port</button><button data-a="aimclick" title="T">Click the model</button></div>
      <div class="lb-chips" data-o="presets"></div>
      <div class="lb-grid lb-g3">
        <label>x<input data-aim="0" type="number" step=".1"></label><label>y<input data-aim="1" type="number" step=".1"></label><label>z<input data-aim="2" type="number" step=".1"></label>
        <label>from x<input data-from="0" type="number" step=".05"></label><label>from y<input data-from="1" type="number" step=".05"></label><label>from z<input data-from="2" type="number" step=".05"></label>
      </div>
      <div class="lb-grid"><label>Preroll s<input data-k="preroll" type="number" step=".02" value="${L.preroll}"></label></div>
    </section>
    <section><h4>Shot</h4>
      <div class="lb-row"><button data-a="mode" data-v="direct" class="on">Direct</button><button data-a="mode" data-v="mission">Mission</button></div>
      <div class="lb-mis" data-o="mis" hidden>
        <div class="lb-row"><select data-k="shooter"></select></div>
        <div class="lb-grid"><label>Range km<input data-m="range" type="number" step="1"></label><label>Bearing °<input data-m="bearing" type="number" step="5" value="90"></label>
        <label>Lead s<input data-m="lead" type="number" step=".5" value="2.5"></label><label class="lb-ck"><input data-m="defend" type="checkbox">Target defends</label></div>
      </div>
      <div class="lb-row lb-big"><button data-a="fire" class="lb-fire" title="F">Fire</button><button data-a="rerun" title="R">Re-run</button></div>
    </section>
    <section><h4>View</h4>
      <div class="lb-chips">${VIEWS.map(([k, n], i) => `<button data-a="view" data-v="${k}" title="${i + 1}">${i + 1} ${n}</button>`).join('')}<button data-a="view" data-v="chase">Chase round</button></div>
      <div class="lb-row"><button data-a="labcam" class="on" title="V">Lab camera</button><button data-a="inspect">Inspect</button></div>
      <h5>Overlays</h5>
      <div class="lb-chips">${OVL.map(([k, n]) => `<button data-a="ovl" data-v="${k}" class="on">${n}</button>`).join('')}</div>
      <h5>Display</h5>
      <div class="lb-chips"><button data-a="disp" data-v="neutral" class="on">Neutral tint</button><button data-a="disp" data-v="ghost" title="G">Ghost hull</button><button data-a="disp" data-v="xray" title="X">X-ray</button><button data-a="disp" data-v="fxOff" class="on" title="Smoke, fire, fireball and sparks hidden: the plating seen bare">Clean (no smoke / fire)</button><button data-a="disp" data-v="defo" title="Colour by how far the plating moved (B): pushed out lime to white to coral (3 cm, 25 cm, 1 m, 3 m), pushed in blue; loose pieces coral; untouched grey">Deformation</button><button data-a="disp" data-v="hold" class="on">Full quality</button></div>
      <div class="lb-grid"><label>Light az °<input data-sun="az" type="range" min="0" max="360" step="5"></label><label>Light el °<input data-sun="el" type="range" min="3" max="88" step="1"></label></div>
    </section>
  </div>
  <div class="lb-r lb-p">
    <div class="lb-tau"><div data-o="tau">—</div><span data-o="state"></span></div>
    <div class="lb-nums" data-o="nums"></div>
    <h4>Against τ</h4><canvas class="lb-graph" data-o="graph"></canvas>
    <h4>Solver plates <span class="lb-tabs">${['disp', 'normal', 'flags', 'soot'].map(m => `<button data-a="map" data-v="${m}"${m === 'disp' ? ' class="on"' : ''}>${m}</button>`).join('')}</span></h4>
    <canvas class="lb-map" data-o="map"></canvas><div class="lb-ro lb-hov" data-o="hov"></div>
    <h4>Damage check <span class="lb-tabs"><button data-a="probe">Probe</button><button data-a="record" title="Every tau to 3 s, saved as data.json">Record</button><button data-a="compare" title="The same shot with both pictures, recorded">Compare</button></span></h4><div class="lb-ro" data-o="probe">FIRE, THEN PROBE · THE VECTORS OVERLAY SHOWS THE PIECES, FRAGMENTS AND PLATING MOVING</div>
    <h4>Sim</h4><div class="lb-ro" data-o="sim"></div>
    <h4>Events</h4><div class="lb-ev" data-o="ev"></div>
    <div class="lb-row lb-acts"><button data-a="qa" title="K">QA check</button><button data-a="still">Still</button><button data-a="quad" title="P">4 views</button><button data-a="report">Report</button></div>
  </div>
  <div class="lb-b lb-p">
    <div class="lb-tr">
      <button data-a="t0" title="Home">τ 0</button><button data-a="back" title=",">◀ Step</button><button data-a="play" class="lb-pl" title="Space">Play</button><button data-a="fwd" title=".">Step ▶</button>
      <span class="lb-k">Step</span><select data-k="step">${STEPS.map(([v, n], i) => `<option value="${i}"${i === 2 ? ' selected' : ''}>${n}</option>`).join('')}</select>
      <span class="lb-k">Rate</span><select data-k="rate">${RATES.map((r, i) => `<option value="${i}"${i === 3 ? ' selected' : ''}>×${r}</option>`).join('')}</select>
      <span class="lb-k">Go to</span><input data-k="goto" type="number" step="any" placeholder="ms"><button data-a="goto">Go</button>
      <span class="lb-sep"></span>
      <span class="lb-k">Capture</span><span class="lb-chips lb-in">${['wide', 'close', 'detail', 'macro', 'square', 'inside'].map(v => `<button data-a="capv" data-v="${v}"${v === 'detail' ? ' class="on"' : ''}>${v}</button>`).join('')}</span>
      <span class="lb-k">to s</span><input data-k="capto" type="number" step="any" value="3"><button data-a="capture" title="C">● Rec</button><span class="lb-k" data-o="capst"></span>
    </div>
    <div class="lb-film" data-o="film" hidden><input type="range" data-k="scrub" min="0" max="0" value="0"><span data-o="filmt"></span><span class="lb-chips lb-in" data-o="filmv"></span><button data-a="save">Save</button><button data-a="live">Live</button></div>
  </div>
  <div class="lb-msg" data-o="msg"></div>`;
  const $ = s => root.querySelector(s), out = k => root.querySelector(`[data-o="${k}"]`);

  const say = (m, bad) => { st.msg = m; st.msgT = performance.now(); const el = out('msg'); el.textContent = m; el.classList.toggle('bad', !!bad); el.classList.add('on'); };
  const busy = () => L.busy > 0;
  async function guard(fn, label) {
    if (busy()) { say('BUSY · ' + (label || '')); return null; }
    try { return await fn(); } catch (e) { console.error('lab', e); say(String(e && e.message || e).toUpperCase(), true); return null; }
  }

  /* ------------------------------------------------------------ actions */
  async function setModel(m) {
    m = m === 'vox' ? 'vox' : 'dots';
    const u = core.unit();
    if (m === 'vox' && !game.vox) { say('NO VOXEL SYSTEM (src/vox)', true); return L.model; }
    if (m === 'vox' && u) { say('BUILDING THE VOXEL SHIP'); const r = await game.vox.enable(u.id); say(`VOXELS · ${r.n.toLocaleString()} CELLS OF ${r.S} M · BUILT IN ${r.ms} MS`); }
    if (m === 'dots' && u && game.vox) game.vox.disable(u.id);
    // (the voxel picture: the sim's damage off by default, its break-up and cook-offs would draw the hidden model)
    if (m !== L.model) { L.ov.simDmg = m === 'dots'; refreshInputs(); }
    L.model = m;
    for (const x of root.querySelectorAll('[data-a="model"]')) x.classList.toggle('on', x.dataset.v === m);
    st.probe = null;
    return m;
  }
  async function target(type, o = {}) {
    type = type || L.type;
    core.spawn(type, o);
    $('[data-k="type"]').value = type;
    cams.C.focus = [0, (game.UNITS[type].size || [0, 0, 10])[2] * .3 || 4, 0];
    cams.apply('close');
    game.pause(true);
    // the model sampled (it is drawn from here): picking and the presets need its dots
    const t0 = performance.now();
    while (!core.ready() && performance.now() - t0 < 8000) await core.nextFrame();
    if (!core.ready()) say('MODEL NOT SAMPLED YET · AIM BY NUMBERS', true);
    presetsUI();
    if (L.model === 'vox') await setModel('vox');
    const P = core.presets(type).find(p => !p.qa);
    if (o.aim !== false && P) aim(P.id);
    cams.apply('close');
    refreshInputs();
    return core.unit();
  }
  function aim(a) {
    if (typeof a === 'string') { if (!core.aimPreset(a)) say('NO SUCH AIM ' + a, true); else if (L.aim.preset && L.aim.preset.startsWith('qa:')) { $('[data-k="kind"]').value = L.kind; } }
    else if (a) L.aim = { loc: a.loc.slice(), from: (a.from || L.aim.from).slice(), preset: null, part: a.part };
    if (!L.shot || !L.shot.pending) cams.C.focus = L.aim.loc.slice();
    refreshInputs();
    return L.aim;
  }
  function munition(kind, ov) {
    if (kind) { L.kind = kind; $('[data-k="kind"]').value = kind; }
    if (ov) Object.assign(L.ov, ov);
    shooterUI(); refreshInputs();
    return core.chargeInfo();
  }
  async function fire(o = {}) {
    if (!core.unit()) await target(L.type);
    if (o.mode === 'mission' || (o.mode === undefined && st.mode === 'mission')) return mission(o);
    st.play && livePlay(false);
    const s = core.fire(o);
    cams.C.focus = s.loc.slice();
    say(`FIRED · ${s.C.name.toUpperCase()} · LANDS IN ${f2(s.preroll)} S${game.paused ? ' · PLAY OR STEP · HOME JUMPS TO THE HIT' : ''}`);
    if (o.wait !== false && s.preroll > 0 && game.paused) await core.to(0);
    return s;
  }
  async function mission(o = {}) {
    say('MISSION · LAUNCHING');
    const s = await core.mission(Object.assign({}, readMission(), o));
    if (s.err) { say('MISSION · ' + s.err.toUpperCase(), true); return s; }
    say(`MISSION · ${s.shooter.type.toUpperCase()} AT ${s.shooter.km} KM · RUN AHEAD ${f1(s.ffTo || 0)} S`);
    // the round's side, from the target: the camera there, the round coming into the frame
    const u = core.unit(), p = sim.projectiles.get(s.proj);
    if (u && p) { const m = core.toModel(u, p.pos); cams.apply({ focus: [0, 5, 0], yaw: Math.atan2(m[0], m[2]) + .5, pitch: .1, dist: 160 }); }
    L.onImpact = e => {
      game.pause(true);
      say(L.shot.outcome === 'hit' ? 'IMPACT · STEP THROUGH IT' : 'NO HIT · ' + (L.shot.outcome || '').toUpperCase(), L.shot.outcome !== 'hit');
      if (L.shot.outcome === 'hit') setTimeout(() => cams.apply('close'), 0);
      L.onImpact = null;
    };
    core.setRate(RATES[st.rate]);
    return s;
  }
  /* frame steps queue up (a held key scrubs): forward and back summed while one runs; back is a re-run */
  let pend = 0, stepping = false;
  async function step(dt) {
    if (busy() && !stepping) { say('BUSY'); return; }
    pend += dt; if (stepping) return;
    stepping = true;
    try {
      while (Math.abs(pend) > 1e-9) {
        const d = pend; pend = 0;
        if (d > 0) await core.step(d);
        else { const t = core.tau(); if (t === null) break; say('RE-RUN TO ' + tauTxt(t + d)); await core.to(t + d); }
      }
    } catch (e) { console.error('lab', e); say(String(e && e.message || e).toUpperCase(), true); pend = 0; }
    finally { stepping = false; }
  }
  const back = dt => step(-dt);
  function livePlay(on) {
    if (on === undefined) on = game.paused;
    if (on) { if (st.play) leavePlayback(); core.setRate(RATES[st.rate]); } else game.pause(true);
  }
  function setRate(i) { st.rate = clamp(i, 0, RATES.length - 1); $('[data-k="rate"]').value = st.rate; if (!game.paused) core.setRate(RATES[st.rate]); else game.timeRate = RATES[st.rate]; }

  /* stills: the view with the overlays (the lab's panels are not in it) */
  async function still(name, o = {}) {
    name = name || `${L.type}_${L.kind}_${Date.now().toString(36)}`;
    if (o.view) cams.apply(o.view);
    O.advance(0, 1); O.advance(0, 1);
    const cv = cap.grab(1, o.overlay !== false, null);
    const p = await cap.saveCanvas(cv, name);
    say(p ? 'SAVED ' + p : 'SAVE FAILED (tools/serve_game.py)', !p);
    return p;
  }
  async function quad(name, views) {
    const cv = await cap.views4(views);
    showCanvas(cv);
    if (name !== false) { const p = await cap.saveCanvas(cv, name || `${L.type}_${L.kind}_quad_${Date.now().toString(36)}`); say(p ? 'SAVED ' + p : 'SAVE FAILED', !p); return p; }
    return cv;
  }
  async function capture(o = {}) {
    if (!L.shot) { say('FIRE FIRST', true); return null; }
    st.capOn = true;
    const views = o.views || st.capViews.slice();
    const rec = await guard(() => cap.capture(Object.assign({ views, to: st.capTo, onProgress: (i, n, t) => { out('capst').textContent = `${i}/${n} · τ ${tauTxt(t)}`; } }, o, { views })), 'capture');
    st.capOn = false;
    if (!rec) return null;
    out('capst').textContent = `${rec.frames.length} FRAMES`;
    enterPlayback(rec);
    if (o.save) { const r = await cap.save(rec, o.save); say(`SAVED ${r.files.length} FILES · ${r.dir}`); }
    return { name: rec.name, frames: rec.frames.length, views: rec.views, saved: rec.saved || null, taus: rec.frames.map(f => +f.tau.toFixed(5)) };
  }

  /* ------------------------------------------------------------ the damage check (dev/lab/probe.js) */
  function probeWithField() {
    const P = probeNow(core, game, {});
    try { const F = fieldNow(core, game); P.field = F; P.deform = deformStats(F, L.shot && L.shot.loc ? L.shot.loc[0] : 0); } catch (e) { console.error('lab field', e); }
    return P;
  }
  function showProbe() {
    const P = st.probe, el = out('probe'); if (!P) { el.textContent = 'NO PROBE'; return; }
    if (!P.mode) { el.textContent = 'FIRE FIRST'; return; }
    const D = P.defects, bad = (k, v, u = '') => `<span${v > 0 ? ' class="lb-bad"' : ''}>${k} <b>${v}${u}</b></span>`;
    const atRest = P.pieces.filter(p => p.rest).length, inSea = P.pieces.filter(p => p.sea).length;
    const fast = P.frags.reduce((a, f) => Math.max(a, Math.hypot(f[3], f[4], f[5])), 0);
    el.innerHTML = `${P.mode === 'vox' ? 'VOXELS' : 'DOTS'} · τ ${tauTxt(P.tau)}<br>` +
      [bad('VANISHED', D.vanished), bad('FLOATING', D.floating), bad('HANGING', D.hanging), bad('HOVERING', D.hovering), bad('RESTING ON AIR', D.restingAir), bad('FAR SIDE', D.farSide, ' M²')].join(' · ') +
      `<br>PIECES ${P.pieces.length} (${atRest} AT REST · ${inSea} IN THE SEA) · FRAGMENTS ${P.frags.length} · FASTEST ${f1(fast)} M/S` +
      (P.plating ? `<br>PLATING MOVING ${P.plating.moved} CELLS · ${f1(P.plating.vmax)} M/S MAX` : '') +
      (P.mode === 'vox' && P.numbers.metrics ? `<br>SOLVE ${P.numbers.solve.wallMs} MS · ${P.numbers.metrics.steps || 0} STEPS · ${P.numbers.metrics.nFree || 0} CELLS FREE · SHELL OPENED ${f1(P.numbers.metrics.shellOpenedM2 || 0)} M² · TORN CELLS ${P.numbers.metrics.torn || 0}` : '') +
      (P.mode === 'dots' && P.numbers.dots ? `<br>MODEL DOTS DROPPED ${P.numbers.dots.dropped} · CARRIED BY PIECES ${P.numbers.dots.carried}` : '') +
      (P.deform ? `<br>MOVED &gt;5 CM <b>${f1(P.deform.moved[0])} M²</b> · &gt;20 CM ${f1(P.deform.moved[1])} · &gt;50 CM ${f1(P.deform.moved[2])} · &gt;1 M ${f1(P.deform.moved[3])} · LOOSE ${f1(P.deform.loose)} M²` +
        `<br>AWAY FROM THE CHARGE ${f1(P.deform.away)} M² · ${bad('TOWARD IT', P.deform.toward, ' M²')} · OUT ${f1(P.deform.outward)} / IN ${f1(P.deform.inward)} M² · REACH ${f1(P.deform.reach)} M · MAX ${f2(P.deform.maxM)} M` : '');
  }
  /* the same shot with both pictures, each recorded (data.json) with a still from the detail view at the end */
  async function compare(o = {}) {
    if (!L.shot) { say('FIRE FIRST', true); return null; }
    const shot = { kind: L.shot.kind, loc: L.shot.loc.slice(), from: L.shot.from.slice(), ov: Object.assign({}, L.shot.ov), seed: L.shot.seed };
    const tag = o.name || `${L.type}_${L.kind}_cmp_${Date.now().toString(36)}`, outR = {};
    for (const m of ['dots', 'vox']) {
      await target(L.type, { aim: false }); await setModel(m);
      L.kind = shot.kind; L.aim = Object.assign({}, L.aim, { loc: shot.loc.slice(), from: shot.from.slice(), preset: null }); L.ov = Object.assign({}, shot.ov, { simDmg: m === 'dots' ? shot.ov.simDmg : false });
      game.pause(true); core.fire({ seed: shot.seed }); await core.to(0);
      const r = await recordRun(core, game, { name: `${tag}/${m}`, to: o.to || 3, onStep: t => say(`COMPARE · ${m.toUpperCase()} · τ ${tauTxt(t)}`) });
      cams.apply('detail');
      await still(`${tag}/${m}_detail_end`);
      outR[m] = r;
    }
    say(`COMPARED · game/shots/lab/${tag}/`);
    st.probe = probeNow(core, game, {}); showProbe();
    return outR;
  }

  /* ------------------------------------------------------------ playback (the recorded frames over the view) */
  async function showFrame(i) {
    const rec = st.play; if (!rec) return;
    i = clamp(i | 0, 0, rec.frames.length - 1); st.playI = i;
    const fr = rec.frames[i], v = st.playV && fr.img[st.playV] ? st.playV : rec.views[0];
    const bmp = await cap.bmp(fr.img[v]);
    drawPlay(bmp);
    $('[data-k="scrub"]').value = i;
    out('filmt').textContent = `${i + 1}/${rec.frames.length} · τ ${tauTxt(fr.tau)} · TORN ${f1(fr.tele ? fr.tele.torn : 0)} M² · SET ${Math.round((fr.tele ? fr.tele.set : 0) * 1000)} MM`;
    st.playTau = fr.tau;
  }
  function drawPlay(img) {
    const dpr = window.devicePixelRatio || 1, W = innerWidth, H = innerHeight;
    play.width = Math.round(W * dpr); play.height = Math.round(H * dpr);
    const c = play.getContext('2d'); c.fillStyle = '#0B0C0A'; c.fillRect(0, 0, play.width, play.height);
    const k = Math.min(play.width / img.width, play.height / img.height), w = img.width * k, h = img.height * k;
    c.drawImage(img, (play.width - w) / 2, (play.height - h) / 2, w, h);
    play.classList.add('on');
  }
  function showCanvas(cv) { st.play = st.play || null; drawPlay(cv); st.still = true; out('film').hidden = false; out('filmt').textContent = 'STILL · LIVE (ESC) TO GO BACK'; }
  function enterPlayback(rec) {
    st.play = rec; st.playV = rec.views[0]; st.still = false;
    const sc = $('[data-k="scrub"]'); sc.max = rec.frames.length - 1;
    out('film').hidden = false;
    out('filmv').innerHTML = rec.views.map(v => `<button data-a="filmv" data-v="${v}"${v === st.playV ? ' class="on"' : ''}>${v}</button>`).join('');
    showFrame(0);
  }
  function leavePlayback() { st.play = null; st.still = false; play.classList.remove('on'); out('film').hidden = !cap.rec; out('filmt').textContent = cap.rec ? 'LIVE · SCRUB TO PLAY BACK' : ''; }

  /* ------------------------------------------------------------ UI wiring */
  function presetsUI() {
    const P = core.presets(L.type);
    out('presets').innerHTML = P.map(p => `<button data-a="aim" data-v="${p.id}"${L.aim.preset === p.id ? ' class="on"' : ''} title="${esc(p.label)}">${esc(p.qa ? p.id.slice(3) : p.label)}</button>`).join('');
  }
  function shooterUI() {
    const sel = $('[data-k="shooter"]'), list = core.shootersOf(L.kind);
    sel.innerHTML = list.length ? list.map(c => `<option value="${c.type}">${esc(c.type.toUpperCase())} · ${esc(c.name)} · ${c.w}</option>`).join('') : '<option value="">nothing fires it</option>';
    if (L.mission.shooter && list.some(c => c.type === L.mission.shooter)) sel.value = L.mission.shooter;
    const ri = $('[data-m="range"]'); if (!ri.value || ri.dataset.auto) { ri.value = Math.round(core.rangeFor(L.kind) / 1000); ri.dataset.auto = '1'; }
  }
  function readMission() {
    const g = k => $(`[data-m="${k}"]`);
    return { shooter: $('[data-k="shooter"]').value || null, range: (+g('range').value || core.rangeFor(L.kind) / 1000) * 1000, bearing: +g('bearing').value || 0, lead: +g('lead').value || 2.5, defend: g('defend').checked };
  }
  function refreshInputs() {
    for (let k = 0; k < 3; k++) { const a = $(`[data-aim="${k}"]`), f = $(`[data-from="${k}"]`); if (document.activeElement !== a) a.value = f2(L.aim.loc[k]); if (document.activeElement !== f) f.value = f2(L.aim.from[k]); }
    for (const el of root.querySelectorAll('[data-ov]')) { const k = el.dataset.ov, v = L.ov[k]; if (el.type === 'checkbox') el.checked = v !== false; else if (document.activeElement !== el) el.value = v === null || v === undefined ? '' : v; }
    for (const b of root.querySelectorAll('[data-a="aim"]')) b.classList.toggle('on', b.dataset.v === L.aim.preset);
    for (const b of root.querySelectorAll('[data-a="side"]')) b.classList.toggle('on', b.dataset.v === L.side);
    const C = core.chargeInfo();
    out('kind').innerHTML = `${esc(C.cls)} · ${Math.round(C.speed)} M/S · WARHEAD ${f1(C.wh)} KG · <b>${f1(C.W)} KG TNT</b> · FUZE <b>${C.fz.toUpperCase()}</b>${C.fz === 'in' ? ' ' + f1(C.delay) + ' M IN' : ''} · FIREBALL R ${f1(C.fireR)} M`;
  }
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const a = b.dataset.a, v = b.dataset.v;
    if (a === 'spawn') guard(() => target($('[data-k="type"]').value), 'spawn');
    else if (a === 'model') guard(() => setModel(v), 'model');
    else if (a === 'probe') { st.probe = probeWithField(); showProbe(); }
    else if (a === 'record') guard(async () => { const r = await recordRun(core, game, { onStep: t => say('RECORDING · τ ' + tauTxt(t)) }); say(r.saved ? 'SAVED ' + r.saved : 'RECORDED (SAVE FAILED)', !r.saved); st.probe = probeNow(core, game, {}); showProbe(); }, 'record');
    else if (a === 'compare') guard(() => compare(), 'compare');
    else if (a === 'ovreset') { Object.assign(L.ov, { tnt: null, wh: null, fuze: null, delay: null, standoff: null, speed: null, dmg: null, simDmg: true }); refreshInputs(); }
    else if (a === 'side') { L.side = v; if (L.aim.preset && !L.aim.preset.startsWith('qa:')) aim(L.aim.preset); refreshInputs(); }
    else if (a === 'aim') aim(v);
    else if (a === 'aimclick') setAimMode(!st.aimMode);
    else if (a === 'mode') { st.mode = v; for (const x of root.querySelectorAll('[data-a="mode"]')) x.classList.toggle('on', x.dataset.v === v); out('mis').hidden = v !== 'mission'; shooterUI(); }
    else if (a === 'fire') guard(() => fire({ wait: false }), 'fire');
    else if (a === 'rerun') guard(async () => { await core.rerun(); if (game.paused) await core.to(0); }, 'rerun');
    else if (a === 'view') { cams.apply(v); setLabCam(true); }
    else if (a === 'labcam') setLabCam(!cams.C.on);
    else if (a === 'inspect') { if (game.inspect && core.unit()) { setLabCam(false); game.inspect.open(L.id); } }
    else if (a === 'ovl') { st.ov[v] = !st.ov[v]; b.classList.toggle('on', st.ov[v]); }
    else if (a === 'disp') toggleDisp(v);
    else if (a === 'map') { st.mapMode = v; for (const x of root.querySelectorAll('[data-a="map"]')) x.classList.toggle('on', x.dataset.v === v); }
    else if (a === 'qa') guard(async () => { const r = await core.qa(); say(r.ok ? 'QA OK' : 'QA · ' + (r.err || (r.flags || []).map(f => f.kind).join(' ')).toUpperCase(), !r.ok); }, 'qa');
    else if (a === 'still') guard(() => still(), 'still');
    else if (a === 'quad') guard(() => quad(), 'quad');
    else if (a === 'report') guard(async () => { const n = `${L.type}_${L.kind}_${Date.now().toString(36)}`, p = await cap.saveReport(n); try { await navigator.clipboard.writeText(JSON.stringify(core.report(), null, 1)); } catch (err) { /* */ } say(p ? 'REPORT ' + p + ' (AND COPIED)' : 'REPORT COPIED', !p); }, 'report');
    else if (a === 't0') guard(() => core.to(0), 't0');
    else if (a === 'back') back(STEPS[st.step][0]);
    else if (a === 'fwd') step(STEPS[st.step][0]);
    else if (a === 'play') livePlay();
    else if (a === 'goto') { const ms = +$('[data-k="goto"]').value; if (Number.isFinite(ms)) guard(() => core.to(ms / 1000), 'goto'); }
    else if (a === 'capv') { const i = st.capViews.indexOf(v); if (i >= 0 && st.capViews.length > 1) st.capViews.splice(i, 1); else if (i < 0) st.capViews.push(v); for (const x of root.querySelectorAll('[data-a="capv"]')) x.classList.toggle('on', st.capViews.includes(x.dataset.v)); }
    else if (a === 'capture') capture();
    else if (a === 'filmv') { st.playV = v; for (const x of root.querySelectorAll('[data-a="filmv"]')) x.classList.toggle('on', x.dataset.v === v); if (st.play) showFrame(st.playI || 0); }
    else if (a === 'save') guard(async () => { const r = await cap.save(cap.rec, 'sheets'); say(r ? `SAVED ${r.files.length} FILES · ${r.dir}` : 'NOTHING TO SAVE', !r); }, 'save');
    else if (a === 'live') leavePlayback();
  });
  root.addEventListener('change', e => {
    const el = e.target, k = el.dataset.k;
    if (k === 'kind') munition(el.value);
    else if (k === 'step') st.step = +el.value;
    else if (k === 'rate') setRate(+el.value);
    else if (k === 'preroll') L.preroll = Math.max(0, +el.value || 0);
    else if (k === 'capto') st.capTo = Math.max(.01, +el.value || 3);
    else if (k === 'shooter') L.mission.shooter = el.value;
    else if (el.dataset.ov) { const o = el.dataset.ov; L.ov[o] = el.type === 'checkbox' ? el.checked : el.tagName === 'SELECT' ? (el.value || null) : el.value === '' ? null : +el.value; refreshInputs(); }
    else if (el.dataset.aim !== undefined) { L.aim.loc[+el.dataset.aim] = +el.value; L.aim.preset = null; refreshInputs(); }
    else if (el.dataset.from !== undefined) { L.aim.from[+el.dataset.from] = +el.value; L.aim.preset = null; refreshInputs(); }
    else if (el.dataset.m === 'range') delete el.dataset.auto;
  });
  root.addEventListener('input', e => {
    const el = e.target;
    if (el.dataset.k === 'scrub' && st.play) showFrame(+el.value);
    else if (el.dataset.k === 'scrub' && cap.rec) { enterPlayback(cap.rec); showFrame(+el.value); }
    else if (el.dataset.sun) setSun(el.dataset.sun, +el.value);
  });
  const mapCv = out('map');
  mapCv.addEventListener('mousemove', e => { const b = mapCv.getBoundingClientRect(); st.hover = draw.plateAt(e.clientX - b.left, e.clientY - b.top); });
  mapCv.addEventListener('mouseleave', () => { st.hover = null; });
  // (the panels never pass a key on to the game while a field has the focus: game.attachInput skips typing)

  function setAimMode(on) { st.aimMode = on; $('[data-a="aimclick"]').classList.toggle('on', on); document.body.classList.toggle('lab-aim', on); if (on) say('CLICK THE MODEL · THE ROUND COMES IN ALONG THE LINE OF SIGHT'); }
  function setLabCam(on) {
    if (!on && cams.C.on) { const V = cams.view(); if (V) { const d = Math.hypot(V.eye[0] - V.look[0], V.eye[1] - V.look[1], V.eye[2] - V.look[2]); cam.set({ target: V.look, dist: d, yaw: Math.atan2(V.look[0] - V.eye[0], V.look[2] - V.eye[2]), pitch: Math.asin(clamp((V.eye[1] - V.look[1]) / Math.max(1, d), -1, 1)) }); } }
    cams.C.on = on; cam.keys = !on; $('[data-a="labcam"]').classList.toggle('on', on);
  }
  function toggleDisp(v) {
    const D = st.disp;
    if (v === 'ghost') D.ghost = D.ghost ? 0 : .3; else if (v === 'xray') D.xray = D.xray ? 0 : 1; else D[v] = !D[v];
    if (v === 'hold' && game.quality) game.quality.hold = !!D.hold;
    if (v === 'fxOff') fxSwitch(D.fxOff);
    if (v === 'defo') R.models.defo = !!D.defo;
    const b = root.querySelector(`[data-a="disp"][data-v="${v}"]`); if (b) b.classList.toggle('on', !!D[v]);
  }
  let fxDraw = null;
  function fxSwitch(off) {
    const s = game.getSystem && game.getSystem('fx'); if (!s) return;
    if (off && !fxDraw) { fxDraw = s.draw3d; s.draw3d = function () {}; }
    else if (!off && fxDraw) { s.draw3d = fxDraw; fxDraw = null; }
  }
  function setSun(k, v) {
    if (!R.sun) return;
    const D = st.disp; if (k === 'az') D.sunAz = v; else D.sunEl = v;
    const az0 = Math.atan2(sun0[0], sun0[2]) * 57.3, el0 = Math.asin(sun0[1]) * 57.3;
    const az = (D.sunAz ?? az0) / 57.3, el = (D.sunEl ?? el0) / 57.3;
    R.sun[0] = Math.cos(el) * Math.sin(az); R.sun[1] = Math.sin(el); R.sun[2] = Math.cos(el) * Math.cos(az);
  }
  if (sun0) { $('[data-sun="az"]').value = ((Math.atan2(sun0[0], sun0[2]) * 57.3) + 360) % 360; $('[data-sun="el"]').value = Math.asin(sun0[1]) * 57.3; }

  /* ------------------------------------------------------------ the readouts */
  let lastUI = 0, lastMap = 0;
  function refresh(now) {
    if (now - lastUI < 110) return; lastUI = now;
    const s = L.shot, t = st.play && !st.still ? st.playTau : core.tau(), S = core.solverState(), sm = core.sample() || {};
    out('tau').textContent = 'τ ' + tauTxt(t);
    const rate = game.paused ? 'PAUSED' : '×' + (+game.timeRate.toFixed(3));
    out('state').innerHTML = `<i class="${S.state}">${S.state.toUpperCase()}${S.state === 'solving' ? ' · ' + f1(S.behind * 1000) + ' MS BEHIND' : ''}</i> ${rate}${busy() ? ' · WORKING' : ''}${st.play ? ' · PLAYBACK' : ''}`;
    $('[data-a="play"]').textContent = game.paused ? 'Play' : 'Pause';
    const u = core.unit();
    out('tgt').innerHTML = u ? `${esc(u.def.name || u.type)} · ${u.def.size ? u.def.size.map(v => Math.round(v)).join(' × ') + ' M' : ''} · HP <b>${Math.round(u.hp)}</b>/${u.hpMax}${u.alive ? '' : ' · <em>LOST</em>'}` : 'NO TARGET';
    // the numbers
    const P = core.patches(), B = P[0];
    const rows = [];
    if (s) {
      rows.push(['SHOT', `${s.mode.toUpperCase()} · ${(s.C && s.C.name || s.kind).toUpperCase()}`]);
      if (s.landed) rows.push(['LANDED', `${s.landed.zone.toUpperCase()} ${s.landed.tmm} MM · ${s.landed.at.map(f1).join(' ')}`]);
      if (s.outcome && s.mode === 'mission') rows.push(['OUTCOME', s.outcome.toUpperCase()]);
      if (s.err) rows.push(['ERROR', s.err.toUpperCase()]);
    }
    if (core.voxOn()) {
      const V = game.vox.state(L.id), m = V.metrics || {}, M = V.meta || {};
      rows.push(['PICTURE', `VOXELS · ${(V.n || 0).toLocaleString()} CELLS OF 0.25 M`]);
      if (s && s.vox) {
        rows.push(['SOLVE', `${String(V.state).toUpperCase()} · ${Math.round(V.wall || 0)} MS WALL (WORKER) · STARTED ${f2(V.lead || 0)} S BEFORE IMPACT${V.err ? ' · ' + V.err.slice(0, 80) : ''}`]);
        if (M.nFree) rows.push(['REGION', `${M.nFree} CELLS FREE · ${M.nAnchor} ANCHORS · ${M.bonds} BONDS · R ${f1(M.R)} M · DT ${Math.round((M.dt || 0) * 1e6)} US${M.gas ? ` · GAS ${M.gas.id} ${Math.round(M.gas.P0 / 1000)} KPA` : ''}`]);
        if (m.steps) rows.push(['DAMAGE', `SHELL OPENED <b>${f1(m.shellOpenedM2 || 0)} M²</b> · TORN CELLS ${m.torn} · BROKEN BONDS ${m.broken} · PIECES ${m.bodies} · FRAGMENTS ${m.fragments}`]);
      }
    }
    if (B) {
      rows.push(['SOLVER', `${(B.spec.solver || '').toUpperCase()} · ${B.state.toUpperCase()}${B.err ? ' · ' + B.err : ''}`]);
      rows.push(['SOLVED TO', `${f2((B.tSolve || 0) * 1000)} MS · ${B.steps || 0} STEPS · ${Math.round(B.wallMs || 0)} MS GPU WALL`]);
      rows.push(['TORN', `<b>${f2(sm.torn)} M²</b> · FLAPS ${f2(sm.open)} · UNDER WL ${f2(sm.below)}`]);
      rows.push(['SET', `<b>${Math.round(sm.set * 1000)} MM</b> MAX · FRAMES TORN ${B.res && B.res.framesTorn !== undefined ? B.res.framesTorn : '—'}`]);
      rows.push(['PIECES', `${sm.bodies} (${sm.bodyDots} DOTS) · FX DOTS ${sm.fxDots}`]);
      if (P.length > 1) rows.push(['PATCHES', P.map(b => `#${b.id} ${b.state} ${f1(b.torn || 0)}`).join(' · ')]);
    } else if (s && s.landed && !s.landed.solved) rows.push(['MARK', `ANALYTIC ${String(s.landed.mark || '').toUpperCase()} R ${f1(s.landed.r)} M (NO GPU SOLVE FOR THIS HIT)`]);
    const SS = core.simState(u);
    if (SS && SS.holes) rows.push(['PICTURE / SIM', `${f1(sm.torn || 0)} / ${f1(SS.holeA)} M²${SS.holeA > 0 ? ' · ×' + f2((sm.torn || 0) / SS.holeA) : ''}`]);
    rows.push(['FRAME', `${f1(L.frameMs || 0)} MS REAL · SOLVER SHARE ${f1(sm.budget || 0)} MS`]);
    out('nums').innerHTML = rows.map(([k, v]) => `<div><span>${k}</span><em>${v}</em></div>`).join('');
    out('sim').innerHTML = SS ? `HP ${SS.hp}/${SS.hpMax} · FLOOD ${f2(SS.flood)}${SS.holes ? ` · WATER ${SS.water} M³ · SINK ${f2(SS.sink)} M · LIST ${f1(SS.list)}° · TRIM ${f1(SS.trim)}°` : ''}` +
      (SS.holes && SS.holes.length ? `<br>HOLES ${SS.holes.map(h => `${h.space} ${f1(h.A)}${h.sea ? ' SEA' : ''}`).join(' · ')}` : '') +
      (SS.wet && SS.wet.length ? `<br>WET ${SS.wet.map(w => `${w[0]} ${w[1]}%`).join(' · ')}` : '') +
      (SS.fires && SS.fires.length ? `<br><em>FIRE</em> ${SS.fires.join(' · ')}` : '') +
      (SS.out && SS.out.length ? `<br><em>OUT</em> ${SS.out.join(' · ')}` : '') : '—';
    const ev = L.ev.slice(-60).reverse();
    out('ev').innerHTML = ev.map(x => `<div><span>${x.tau === null ? '—' : tauTxt(x.tau)}</span><b>${esc(x.type)}</b> ${esc(Object.entries(x.e).filter(([k]) => !['pos', 'vel', 'side'].includes(k)).slice(0, 6).map(([k, v]) => k + ' ' + (Array.isArray(v) ? v.join(',') : v)).join(' · '))}</div>`).join('');
    const h = st.hover; out('hov').textContent = h ? `P${h.plate} [${h.i},${h.j}] U ${h.u} V ${h.v} M · |D| ${h.dmm} MM · NORMAL ${h.nmm} MM${h.flags.length ? ' · ' + h.flags.join(' ').toUpperCase() : ''}${h.soot ? ' · SOOT ' + h.soot : ''}` : 'HOVER A PLATE: ONE TEXEL OF THE SOLVE';
    draw.graphs(out('graph'), t);
    if (now - lastMap > 220) { lastMap = now; draw.plateMaps(mapCv, st.mapMode); }
    if (st.msg && now - st.msgT > 6000) { st.msg = ''; out('msg').classList.remove('on'); }
    // the overlays keep out of the panels
    const rr = el => { const b = el.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; };
    game.hudRects = st.panels ? [rr($('.lb-l')), rr($('.lb-r')), rr($('.lb-b'))] : [];
  }

  /* ------------------------------------------------------------ the system */
  let drag = null, lastF = 0;
  const sys = {
    name: 'lab', priority: 140, always2d: true,
    init() {
      // (nothing else takes the clock or the camera: no automatic hit replay, no bullet time on a break-up)
      const rp = game.getSystem && game.getSystem('replay'); if (rp) game.removeSystem(rp);
      if (game.bulletTime) game.bulletTime.want = () => false;
      if (game.quality) game.quality.hold = true;
      cam.keys = false;
      if (st.disp.fxOff) fxSwitch(true);
      game.timeRate = RATES[st.rate];
    },
    update() {
      const now = performance.now(); if (lastF) L.frameMs = now - lastF; lastF = now;
      core.tick();
      const V = cams.view(); if (V) cam.view = V;
      refresh(performance.now());
    },
    onEvent(e) { core.onEvent(e); },
    draw3d(frame) {
      const u = core.unit(), d = u && game.drawn.get(u.id), D = st.disp;
      if (d) {
        if (D.neutral) { d._rgb = null; d._k = 0; d._face = 0; }
        if (D.ghost) d.alpha = D.ghost;
        if (D.xray) d.xray = D.xray;
      }
      // the round on its line in before it lands (direct shots: the sim has no round; drawn at its true speed)
      const s = L.shot;
      if (u && s && s.mode === 'direct' && s.pending) {
        const t = game.t - s.tHit;
        if (t < 0 && t > -s.preroll - .05) {
          const P = game.PROJ[s.kind], key = P && P.model, f = s.from, k = -t * s.speed;
          const p = core.toWorld(u, [s.loc[0] + f[0] * k, s.loc[1] + f[1] * k, s.loc[2] + f[2] * k]);
          const vw = core.dirToWorld(u, f), hdg = Math.atan2(-vw[0], -vw[2]), pitch = Math.atan2(-vw[1], Math.hypot(vw[0], vw[2]));
          if (key && R.models.has(key)) R.draw({ key, T: p, hdg, pitch, roll: 0, st: {}, tint: 'hostile', tintK: .45 });
          const sk = frame.sink; if (sk) for (let i = 1; i < 14; i++) { const q = i * .6; sk.add(p[0] + vw[0] * q * 3, p[1] + vw[1] * q * 3, p[2] + vw[2] * q * 3, 2, 255, 190 - i * 8, 120 - i * 7, .5 * (1 - i / 14)); }
        }
      }
    },
    draw2d(ov) {
      if (!st.ovOn || st.play) return;
      const W = cam.W, H = cam.H;
      const l = st.panels ? $('.lb-l').getBoundingClientRect() : { right: 0 }, r = st.panels ? $('.lb-r').getBoundingClientRect() : { left: W }, b = st.panels ? $('.lb-b').getBoundingClientRect() : { top: H };
      draw.overlay(ov.ctx, Object.assign({ safe: [l.right, 0, r.left, b.top] }, st.ov));
      if (st.ov.vectors && L.shot) {
        const now = performance.now();
        if (!st.probe || now - st.probeT > 400 || st.probe.tau !== core.tau()) { try { st.probe = probeWithField(); st.probeT = now; showProbe(); } catch (e) { console.error('lab probe', e); } }
        drawVectors(ov.ctx, st.probe, core, game);
      }
    },
    onKey(e) {
      const c = codeOf(e), down = e.type === 'keydown';
      const K = ['Space', 'Period', 'Comma', 'BracketLeft', 'BracketRight', 'KeyF', 'KeyR', 'KeyT', 'KeyV', 'KeyH', 'KeyC', 'KeyP', 'KeyK', 'KeyX', 'KeyG', 'KeyB', 'KeyM', 'KeyN', 'KeyJ', 'Home', 'ArrowLeft', 'ArrowRight'];
      const camK = cams.C.on && ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE'].includes(c);
      const view = /^Digit[1-8]$/.test(c);
      if (c === 'Escape') { if (!down) return st.aimMode || st.play; if (st.aimMode) { setAimMode(false); return true; } if (st.play || st.still) { leavePlayback(); return true; } return false; }
      if (!K.includes(c) && !camK && !view) return false;
      if (!down) return true;
      if (camK) { const C = cams.C, k = e.shiftKey ? 3 : 1; if (c === 'KeyW') C.dist = Math.max(1.5, C.dist / 1.1 ** k); else if (c === 'KeyS') C.dist = Math.min(20000, C.dist * 1.1 ** k); else if (c === 'KeyA') C.yaw -= .06 * k; else if (c === 'KeyD') C.yaw += .06 * k; else if (c === 'KeyQ') C.pitch = clamp(C.pitch + .05 * k, -1.2, 1.55); else C.pitch = clamp(C.pitch - .05 * k, -1.2, 1.55); C.inside = null; return true; }
      if (view) { cams.apply(VIEWS[+c.slice(5) - 1][0]); setLabCam(true); return true; }
      switch (c) {
        case 'Space': livePlay(); break;
        case 'Period': step(STEPS[st.step][0] * (e.shiftKey ? 10 : 1)); break;
        case 'Comma': back(STEPS[st.step][0] * (e.shiftKey ? 10 : 1)); break;
        case 'BracketLeft': setRate(st.rate + 1); break;
        case 'BracketRight': setRate(st.rate - 1); break;
        case 'KeyF': guard(() => fire({ wait: false }), 'fire'); break;
        case 'KeyR': guard(async () => { await core.rerun(); if (game.paused) await core.to(0); }, 'rerun'); break;
        case 'KeyT': setAimMode(!st.aimMode); break;
        case 'KeyV': setLabCam(!cams.C.on); break;
        case 'KeyH': if (e.shiftKey) st.ovOn = !st.ovOn; else { st.panels = !st.panels; root.classList.toggle('lb-off', !st.panels); } break;
        case 'KeyC': capture(); break;
        case 'KeyP': guard(() => quad(), 'quad'); break;
        case 'KeyK': guard(async () => { const r = await core.qa(); say(r.ok ? 'QA OK' : 'QA · ' + (r.flags || []).map(f => f.kind).join(' ').toUpperCase(), !r.ok); }, 'qa'); break;
        case 'KeyX': toggleDisp('xray'); break;
        case 'KeyG': toggleDisp('ghost'); break;
        case 'KeyB': toggleDisp('defo'); break;
        // the debug render style (engine/solid.js): M solid on / off, N its mode, J export the hit's data
        case 'KeyM': { const r = LAB.solid({ on: game.R.style !== 'debug' }); say(r && r.style === 'debug' ? 'SOLID · ' + SOLID_MODES[r.mode] : 'DOTS'); break; }
        case 'KeyN': { const S = game.R._solid && game.R._solid(); if (S) { if (game.R.style !== 'debug') game.R.style = 'debug'; S.mode = (S.mode + 1) % SOLID_MODES.length; say('SOLID · ' + SOLID_MODES[S.mode]); } break; }
        case 'KeyJ': guard(async () => { const r = await LAB.export(); say('EXPORTED · ' + r.dir); }, 'export'); break;
        case 'Home': guard(() => core.to(0), 't0'); break;
        case 'ArrowLeft': case 'ArrowRight': if (st.play) showFrame((st.playI || 0) + (c === 'ArrowLeft' ? -1 : 1)); else if (c === 'ArrowLeft') back(STEPS[st.step][0]); else step(STEPS[st.step][0]); break;
        default: break;
      }
      return true;
    },
    onPointer(ev) {
      if (game.inspect && game.inspect.active) return false;
      const C = cams.C;
      if (ev.type === 'wheel') { if (!C.on) return false; C.dist = clamp(C.dist * Math.pow(1.0015, ev.deltaY), 1.5, 20000); return true; }
      if (ev.type === 'down') { drag = { x: ev.x, y: ev.y, b: ev.button, pan: ev.button === 1 || ev.shift }; return C.on || st.aimMode; }
      if (ev.type === 'move' && drag && ev.raw.buttons) {
        if (!C.on) return false;
        const dx = ev.x - drag.x, dy = ev.y - drag.y; drag.x = ev.x; drag.y = ev.y;
        if (drag.pan) {
          // (pan in the view plane, model frame)
          const u = core.unit(); if (!u) return true;
          const k = C.dist * 2 * Math.tan(cam.fov / 2) / Math.max(1, cam.H), r = core.dirToModel(u, cam.r), up = core.dirToModel(u, cam.u);
          for (let i = 0; i < 3; i++) C.focus[i] += (-r[i] * dx + up[i] * dy) * k;
        } else { C.yaw += dx * .006; C.pitch = clamp(C.pitch + dy * .005, -1.2, 1.55); C.inside = null; }
        return true;
      }
      if (ev.type === 'up') { const was = drag; drag = null; return !!was && (C.on || st.aimMode); }
      if (ev.type === 'click' && ev.button === 0 && st.aimMode) {
        const h = core.pickScreen(ev.x, ev.y);
        if (!h) { say('NOTHING OF THE MODEL THERE', true); return true; }
        aim({ loc: h.p, from: h.from, part: h.part });
        say(`AIMED · ${String(h.part).toUpperCase()} · ${h.p.map(f1).join(' ')}`);
        if (!ev.shift) setAimMode(false);
        return true;
      }
      if (ev.type === 'dblclick' && C.on) { const h = core.pickScreen(ev.x, ev.y); if (h) { C.focus = h.p.slice(); C.inside = null; } return true; }
      return C.on && (ev.type === 'click' || ev.type === 'dblclick');
    },
    dispose() { root.remove(); play.remove(); fxSwitch(false); R.models.defo = false; if (sun0 && R.sun) R.sun.splice(0, 3, ...sun0); },
  };

  /* ------------------------------------------------------------ the console */
  const LAB = window.LAB = {
    core, draw, cap, cams, st,
    help() { return HELP; },
    state() { const s = L.shot; return { type: L.type, id: L.id, kind: L.kind, aim: L.aim, ov: L.ov, tau: core.tau(), solver: core.solverState(), sample: core.sample(), shot: s && { mode: s.mode, pending: s.pending, landed: s.landed, outcome: s.outcome, err: s.err } }; },
    target, aim, munition, fire, mission,
    model: setModel, probe: () => (st.probe = probeWithField(), showProbe(), st.probe), field: () => fieldNow(core, game), deform: () => deformStats(fieldNow(core, game), L.shot && L.shot.loc ? L.shot.loc[0] : 0), record: o => recordRun(core, game, o || {}), compare,
    clean(on = true) { if (!!st.disp.fxOff !== !!on) toggleDisp('fxOff'); return st.disp.fxOff; },
    side(s) { L.side = s === 'port' ? 'port' : 'stbd'; if (L.aim.preset && !L.aim.preset.startsWith('qa:')) aim(L.aim.preset); return L.side; },
    overrides(o) { Object.assign(L.ov, o); refreshInputs(); return core.chargeInfo(); },
    reset() { Object.assign(L.ov, { tnt: null, wh: null, fuze: null, delay: null, standoff: null, speed: null, dmg: null, simDmg: true }); refreshInputs(); return core.chargeInfo(); },
    step: dt => core.step(dt === undefined ? STEPS[st.step][0] : dt), to: (T, o) => core.to(T, o), rerun: T => core.rerun(T).then(() => core.to(T === undefined ? 0 : T)),
    play(rate) { if (rate) { const i = RATES.indexOf(rate); if (i >= 0) st.rate = i; else game.timeRate = rate; } if (st.play) leavePlayback(); core.setRate(rate || RATES[st.rate]); },
    pause() { game.pause(true); },
    tau: () => core.tau(),
    view(v) { cams.apply(v); setLabCam(true); return JSON.parse(JSON.stringify(cams.C)); },
    overlays(o) { if (o === false || o === true) st.ovOn = o; else Object.assign(st.ov, o); return st.ov; },
    display(o) { for (const k in o) if (!!st.disp[k] !== !!o[k]) toggleDisp(k); return st.disp; },
    still, quad, capture,
    live: leavePlayback, frame: i => showFrame(i),
    report: o => core.report(o), qa: () => core.qa(),
    save: name => cap.saveReport(name || `${L.type}_${L.kind}_${Date.now().toString(36)}`),
    plates() { return core.patches().map(B => ({ id: B.id, state: B.state, plates: B.rects.map(r => { let mx = 0, torn = 0, gone = 0; for (let i = 0; i < r.cpu.length; i += 4) { mx = Math.max(mx, Math.hypot(r.cpu[i], r.cpu[i + 1], r.cpu[i + 2])); const f = Math.floor(r.cpu[i + 3]); if (f & 1) torn++; if (f & 2) gone++; } return { p: r.p, ax: r.ax, nu: r.nu, nv: r.nv, maxMm: Math.round(mx * 1000), tornTexels: torn, goneTexels: gone }; }) })); },
    // hit data as files (report.json, plates.csv, texels.csv, pieces.csv, mesh.obj): dev/lab/export.js
    export: name => { const un = core.unit(); return exportHit(core, game, name || `${L.type}_${L.kind}_${Date.now().toString(36)}`, un && un.def ? un.def.model : null); },
    tables: () => hitTables(core, game),
    // the debug render style (engine/solid.js): mode 0 shaded, 1 deformation, 2 parts, 3 normals, 4 damage flags; grid 0..1
    solid(o) { const R = game.R; if (o && o.on !== undefined) R.style = o.on ? 'debug' : 'pointcloud'; const S = R._solid ? R._solid() : null; if (S && o) { if (o.mode !== undefined) S.mode = o.mode; if (o.grid !== undefined) S.grid = o.grid; if (o.key !== undefined) S.key = o.key; } return S ? { style: R.style, mode: S.mode, grid: S.grid, stats: S.stats } : null; },
    presets: () => core.presets(L.type).map(p => p.id), types: () => types, munitions: () => MUN.map(m => m.key), shooters: k => core.shootersOf(k || L.kind),
  };
  const SOLID_MODES = ['SHADED', 'DEFORMATION', 'PARTS', 'NORMALS', 'DAMAGE FLAGS'];
  const HELP = 'ONIKS LAB · window.LAB: ' + Object.keys(LAB).join(', ') + ' · usage in game/src/dev/lab/index.js (header) and game/src/dev/lab/README.md';

  // the first target, and the URL's shot
  game.bus.on('ready', () => {
    setTimeout(async () => {
      try {
        for (let i = 0; i < 400 && !window.ONIKS; i++) await new Promise(r => setTimeout(r, 25));
        const cs = Q.get('case') && CASES.find(c => c.id === Q.get('case'));
        const type = cs ? cs.type : Q.get('target') || 'ddg';
        if (Q.get('kind') || cs) munition(cs ? cs.kind || L.kind : Q.get('kind'));
        await target(game.UNITS[type] ? type : 'ddg');
        if (cs) aim('qa:' + cs.id); else if (Q.get('aim')) aim(Q.get('aim'));
        cams.apply(Q.get('view') || 'close');
        presetsUI(); shooterUI(); refreshInputs();
        if (Q.get('fire') === '1') await fire();
      } catch (e) { console.error('lab: start', e); say(String(e && e.message || e).toUpperCase(), true); }
    }, 400);
  });
  shooterUI(); refreshInputs();
  return sys;
}

/* the key's code (e.code; from e.key when a synthetic or remapped event has none) */
function codeOf(e) {
  if (e.code) return e.code;
  const k = e.key || '';
  if (/^[a-z]$/i.test(k)) return 'Key' + k.toUpperCase();
  if (/^[0-9]$/.test(k)) return 'Digit' + k;
  return { ' ': 'Space', '.': 'Period', '>': 'Period', ',': 'Comma', '<': 'Comma', '[': 'BracketLeft', ']': 'BracketRight', Escape: 'Escape', Home: 'Home', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight' }[k] || k;
}

function addStyle() {
  if (document.getElementById('lab-css')) return;
  const s = document.createElement('style'); s.id = 'lab-css';
  s.textContent = `
  #lab { position: absolute; inset: 0; pointer-events: none; font: 500 10.5px/1.45 var(--mono, 'Geist Mono', monospace); letter-spacing: .04em; color: rgba(255,255,255,.72); text-transform: uppercase; }
  #lab [hidden] { display: none !important; }
  #lab .lb-p { position: absolute; pointer-events: auto; background: rgba(11,12,10,.86); border: 1px solid rgba(255,255,255,.08); backdrop-filter: blur(6px); }
  #lab.lb-off .lb-p { display: none; }
  #lab .lb-l { left: 12px; top: 12px; bottom: 96px; width: 300px; overflow: auto; padding: 12px 14px; }
  #lab .lb-r { right: 12px; top: 12px; bottom: 96px; width: 340px; overflow: auto; padding: 12px 14px; }
  #lab .lb-b { left: 12px; right: 12px; bottom: 12px; padding: 9px 12px; display: flex; flex-direction: column; gap: 7px; }
  #lab .lb-h { display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px; }
  #lab .lb-h b { font: 600 16px var(--sans, 'Geist', sans-serif); letter-spacing: .02em; color: #fff; }
  #lab .lb-h span { color: #C6F432; letter-spacing: .14em; }
  #lab section { border-top: 1px solid rgba(255,255,255,.07); padding: 9px 0 6px; }
  #lab h4 { font: 500 10px var(--mono, monospace); letter-spacing: .12em; color: rgba(255,255,255,.38); margin: 8px 0 6px; font-weight: 500; display: flex; justify-content: space-between; align-items: center; }
  #lab h5 { font: 500 9.5px var(--mono, monospace); letter-spacing: .12em; color: rgba(255,255,255,.3); margin: 8px 0 4px; font-weight: 500; }
  #lab section h4 { margin-top: 0; }
  #lab button, #lab select, #lab input { font: inherit; letter-spacing: inherit; text-transform: inherit; color: rgba(255,255,255,.78); background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1); padding: 3px 7px; border-radius: 0; outline: none; }
  #lab select option { background: #151714; text-transform: none; }
  #lab button { cursor: pointer; }
  #lab button:hover { color: #fff; border-color: rgba(255,255,255,.3); }
  #lab button.on { color: #0B0C0A; background: #C6F432; border-color: #C6F432; }
  #lab input[type=number] { width: 100%; }
  #lab input:focus, #lab select:focus { border-color: rgba(198,244,50,.6); }
  #lab .lb-row { display: flex; gap: 5px; margin: 4px 0; flex-wrap: wrap; align-items: center; }
  #lab .lb-row select { flex: 1; min-width: 0; text-transform: none; }
  #lab .lb-chips { display: flex; flex-wrap: wrap; gap: 4px; margin: 4px 0; }
  #lab .lb-chips.lb-in { display: inline-flex; margin: 0; }
  #lab .lb-chips button { padding: 2px 6px; font-size: 10px; }
  #lab .lb-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px 8px; margin: 6px 0; }
  #lab .lb-g3 { grid-template-columns: 1fr 1fr 1fr; }
  #lab .lb-grid label { display: flex; flex-direction: column; gap: 2px; color: rgba(255,255,255,.42); font-size: 9.5px; }
  #lab .lb-grid label.lb-ck { flex-direction: row; align-items: center; gap: 6px; }
  #lab input[type=checkbox] { accent-color: #C6F432; width: auto; }
  #lab input[type=range] { accent-color: #C6F432; padding: 0; border: 0; background: none; }
  #lab .lb-ro { color: rgba(255,255,255,.55); margin: 4px 0; text-transform: uppercase; font-variant-numeric: tabular-nums; }
  #lab .lb-ro b, #lab .lb-nums b { color: #C6F432; font-weight: 500; }
  #lab .lb-ro .lb-bad b { color: #FF6A3D; }
  #lab .lb-ro em, #lab .lb-nums em i { font-style: normal; }
  #lab .lb-ro em { color: #FF6A3D; }
  #lab .lb-big button { flex: 1; padding: 7px; font-size: 12px; letter-spacing: .14em; }
  #lab .lb-fire { color: #0B0C0A !important; background: #FF6A3D !important; border-color: #FF6A3D !important; }
  #lab .lb-tau div { font: 500 26px var(--mono, monospace); color: #fff; letter-spacing: .02em; font-variant-numeric: tabular-nums; }
  #lab .lb-tau span { color: rgba(255,255,255,.5); }
  #lab .lb-tau i { font-style: normal; padding: 1px 5px; margin-right: 4px; background: rgba(255,255,255,.08); }
  #lab .lb-tau i.solving { background: #FF6A3D; color: #0B0C0A; }
  #lab .lb-tau i.synced, #lab .lb-tau i.done { background: #C6F432; color: #0B0C0A; }
  #lab .lb-tau i.failed { background: #7a1d0b; color: #fff; }
  #lab .lb-nums { margin: 10px 0 2px; font-variant-numeric: tabular-nums; }
  #lab .lb-nums div { display: grid; grid-template-columns: 96px 1fr; gap: 6px; padding: 2px 0; border-bottom: 1px dotted rgba(255,255,255,.06); }
  #lab .lb-nums span { color: rgba(255,255,255,.36); }
  #lab .lb-nums em { font-style: normal; color: rgba(255,255,255,.82); }
  #lab .lb-graph { width: 100%; height: 150px; display: block; background: rgba(255,255,255,.02); }
  #lab .lb-map { width: 100%; display: block; background: rgba(255,255,255,.02); }
  #lab .lb-tabs { display: inline-flex; gap: 3px; }
  #lab .lb-tabs button { padding: 1px 5px; font-size: 9.5px; }
  #lab .lb-hov { min-height: 15px; color: rgba(255,255,255,.5); }
  #lab .lb-ev { max-height: 180px; overflow: auto; font-size: 9.5px; color: rgba(255,255,255,.5); text-transform: none; }
  #lab .lb-ev div { padding: 1px 0; border-bottom: 1px dotted rgba(255,255,255,.05); }
  #lab .lb-ev span { color: rgba(255,255,255,.35); display: inline-block; min-width: 76px; }
  #lab .lb-ev b { color: #C6F432; font-weight: 500; margin-right: 4px; }
  #lab .lb-acts { margin-top: 10px; }
  #lab .lb-tr, #lab .lb-film { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  #lab .lb-tr input[type=number] { width: 72px; }
  #lab .lb-k { color: rgba(255,255,255,.36); margin-left: 6px; }
  #lab .lb-sep { width: 1px; height: 18px; background: rgba(255,255,255,.12); margin: 0 6px; }
  #lab .lb-pl { min-width: 64px; color: #0B0C0A !important; background: #C6F432 !important; border-color: #C6F432 !important; }
  #lab .lb-film input[type=range] { flex: 1; min-width: 240px; }
  #lab .lb-film span { color: rgba(255,255,255,.6); font-variant-numeric: tabular-nums; }
  #lab .lb-msg { position: absolute; left: 50%; top: 14px; transform: translateX(-50%); padding: 5px 12px; background: rgba(11,12,10,.9); border-left: 2px solid #C6F432; color: #fff; opacity: 0; transition: opacity .2s; max-width: 46vw; }
  #lab .lb-msg.on { opacity: 1; }
  #lab .lb-msg.bad { border-left-color: #FF6A3D; color: #FF6A3D; }
  #lab-play { position: absolute; inset: 0; width: 100%; height: 100%; display: none; pointer-events: none; }
  #lab-play.on { display: block; }
  body.lab-aim #gl { cursor: crosshair; }
  `;
  document.head.appendChild(s);
}
