/* Film runtime for the extended menu cutscenes. A film is one continuous take
   of `duration` seconds that loops without a cut. The scene renders as a pure
   function of film time T (trajectories precomputed at load, smoke and sparks
   analytic in their age), so any moment can be scrubbed to, frozen with
   ?t=SECONDS, or captured with ?t=SECONDS&capture=1 exactly.
   Loads after menus/common/stage.js (stage fit, menu, sounds, capture).

   FILM.run({ duration, chapters: [{t, title, sub}], render(T, info), update?(dt, T),
              onChapter?(ch, quiet), cues?: [[t, fn]] })
   Keys: P/K pause · J/L -5/+5 s (Shift ±1 s) · , . chapter · 0-9 jump · H hide UI
         T pin timeline · [ ] other films · Backspace gallery · M sound */
(function () {
  const FILMS = [
    ['oa_scale', 'Orbital A', 'Scale'],
    ['ob_long_exposure', 'Orbital B', 'Long Exposure'],
    ['oc_underway', 'Orbital C', 'Underway'],
    ['pa_picture', 'Point Cloud A', 'The Picture'],
    ['pb_survey', 'Point Cloud B', 'Survey'],
    ['pc_anatomy', 'Point Cloud C', 'Anatomy'],
    ['od_salvo', 'Defence O1', 'Salvo'],
    ['oe_ring', 'Defence O2', 'Ring'],
    ['of_task_force', 'Defence O3', 'Task Force'],
    ['og_bullet_time', 'Defence O4', 'Bullet Time'],
    ['oh_storm', 'Defence O5', 'Storm'],
    ['pd_engagement', 'Defence P1', 'Engagement'],
    ['pe_aegis', 'Defence P2', 'Aegis'],
    ['pf_gun_camera', 'Defence P3', 'Gun Camera'],
    ['pg_thermal', 'Defence P4', 'Thermal'],
    ['ph_damage_scan', 'Defence P5', 'Damage Scan'],
    ['oa_strike', 'Combat edition', 'Scale · Strike'],
    ['ob_barrage', 'Combat edition', 'Long Exposure · Barrage'],
    ['pa_raid', 'Combat edition', 'The Picture · Raid'],
    ['pb_battle', 'Combat edition', 'Survey · Battle'],
    ['pc_anatomy_ship', 'Anatomy', 'Ship'],
    ['pc_anatomy_battery', 'Anatomy', 'Battery'],
  ];
  const Q = STAGE.Q, PAGE = STAGE.PAGE;
  const FROZEN = Q.has('t'), CLEAN = Q.has('clean') || Q.has('capture');
  const fmt = s => { s = Math.max(0, s); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`; };

  const FILM = {
    FILMS, T: 0, duration: 1, chapters: [], chapter: null, playing: false, seeking: false, uiHidden: false,
    /* deterministic camera shake: [dx, dy] px, amp px, f Hz */
    shake(T, amp, f) { f = f || 18; return [amp * M3.noise(T * f, 3.7, .5), amp * M3.noise(T * f, 9.1, 1.5)]; },
    /* 0..1 inside [a, b] of film time, eased; handy for chapter-local choreography */
    k(T, a, b) { return M3.E.sat((T - a) / (b - a)); },
  };

  /* ---------- timeline bar (outside the stage, never captured) ---------- */
  let bar = null, barPinned = false, barTimer = 0;
  function buildBar() {
    if (CLEAN) return;
    const css = document.createElement('style');
    css.textContent = `
      #filmbar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 50; padding: 26px 28px 14px; font: 400 11.5px/1 Consolas, 'DM Mono', monospace; color: rgba(255,255,255,.62);
        background: linear-gradient(to top, rgba(0,0,0,.82), rgba(0,0,0,0)); opacity: 0; transition: opacity .35s; user-select: none; }
      #filmbar.on { opacity: 1; }
      #filmbar .row { display: flex; gap: 18px; align-items: baseline; margin-bottom: 10px; }
      #filmbar .tt { color: #fff; font-variant-numeric: tabular-nums; }
      #filmbar .ch { color: var(--film-accent, #fff); }
      #filmbar .sp { flex: 1; }
      #filmbar .track { position: relative; height: 18px; cursor: pointer; }
      #filmbar .line { position: absolute; left: 0; right: 0; top: 8px; height: 1px; background: rgba(255,255,255,.28); }
      #filmbar .done { position: absolute; left: 0; top: 8px; height: 1px; background: var(--film-accent, #fff); }
      #filmbar .tick { position: absolute; top: 3px; width: 1px; height: 11px; background: rgba(255,255,255,.5); }
      #filmbar .tick span { position: absolute; left: 5px; top: -1px; white-space: nowrap; font-size: 10.5px; color: rgba(255,255,255,.42); pointer-events: none; }
      #filmbar .tick.cur span { color: #fff; }
      #filmbar .head { position: absolute; top: 3px; width: 3px; height: 11px; margin-left: -1px; background: var(--film-accent, #fff); }`;
    document.head.appendChild(css);
    bar = document.createElement('div'); bar.id = 'filmbar';
    bar.innerHTML = `<div class="row"><span class="tt" id="fbT"></span><span class="ch" id="fbC"></span><span class="sp"></span>
      <span>P pause · J L ±5 s · , . chapter · H hide UI · T pin · [ ] films · Backspace gallery</span></div>
      <div class="track" id="fbTrack"><div class="line"></div><div class="done" id="fbDone"></div><div id="fbTicks"></div><div class="head" id="fbHead"></div></div>`;
    document.body.appendChild(bar);
    const accent = document.querySelector('link[href*="orbital.css"]') ? 'var(--hi)' : 'var(--lime)';
    document.documentElement.style.setProperty('--film-accent', accent);
    const track = bar.querySelector('#fbTrack');
    let drag = false;
    const at = e => { const r = track.getBoundingClientRect(); return M3.E.sat((e.clientX - r.left) / r.width) * FILM.duration; };
    track.addEventListener('pointerdown', e => { drag = true; track.setPointerCapture(e.pointerId); FILM.seek(at(e)); });
    track.addEventListener('pointermove', e => { if (drag) FILM.seek(at(e)); });
    track.addEventListener('pointerup', () => { drag = false; });
    addEventListener('mousemove', () => { if (bar) { bar.classList.add('on'); barTimer = performance.now(); } });
  }
  function ticks() {
    if (!bar) return;
    bar.querySelector('#fbTicks').innerHTML = FILM.chapters.map((c, i) =>
      `<div class="tick" data-i="${i}" style="left:${(c.t / FILM.duration * 100).toFixed(3)}%"><span>${c.title}</span></div>`).join('');
  }
  function updateBar() {
    if (!bar) return;
    const f = FILM.T / FILM.duration;
    bar.querySelector('#fbT').textContent = `${fmt(FILM.T)} / ${fmt(FILM.duration)}${FILM.playing ? '' : ' · paused'}`;
    bar.querySelector('#fbC').textContent = FILM.chapter ? FILM.chapter.title : '';
    bar.querySelector('#fbDone').style.width = (f * 100).toFixed(3) + '%';
    bar.querySelector('#fbHead').style.left = (f * 100).toFixed(3) + '%';
    const ci = FILM.chapters.indexOf(FILM.chapter);
    bar.querySelectorAll('.tick').forEach(t => t.classList.toggle('cur', +t.dataset.i === ci));
    if (!barPinned && performance.now() - barTimer > 2600) bar.classList.remove('on');
  }

  /* ---------- run ---------- */
  function run(sc) {
    const D = sc.duration;
    FILM.duration = D;
    FILM.chapters = (sc.chapters || []).slice().sort((a, b) => a.t - b.t);
    const cues = (sc.cues || []).slice();
    FILM.cue = (t, fn) => cues.push([t, fn]);
    const trap = f => f && ((...a) => { try { return f(...a); } catch (e) { STAGE.err = e.stack; console.error(e.stack); throw e; } });
    const render = trap(sc.render), update = trap(sc.update), onChapter = trap(sc.onChapter);
    const chapterAt = t => { let c = FILM.chapters[0] || null; for (const ch of FILM.chapters) if (ch.t <= t + 1e-9) c = ch; return c; };
    function draw(dt) {
      STAGE.time = FILM.T;
      const c = chapterAt(FILM.T);
      if (c !== FILM.chapter) { FILM.chapter = c; onChapter && onChapter(c, FILM.seeking || !FILM.playing); }
      render(FILM.T, { dt, playing: FILM.playing, seeking: FILM.seeking });
      updateBar();
    }
    FILM.seek = t => {
      FILM.T = ((t % D) + D) % D; FILM.seeking = true;
      sc.onSeek && sc.onSeek(FILM.T);
      draw(0); FILM.seeking = false;
    };
    // cues fire only while playing forward in real time, never on a seek
    function crossed(a, b) {
      const hit = [];
      for (const [t, fn] of cues) { if (b >= a ? (t > a && t <= b) : (t > a || t <= b)) hit.push(fn); }
      return hit;
    }
    FILM.bench = (n, from) => {
      n = n || 60; const t0 = performance.now(), keep = FILM.T;
      for (let i = 0; i < n; i++) { FILM.T = ((from === undefined ? keep : from) + i / 60) % D; render(FILM.T, { dt: 1 / 60, playing: true, seeking: false }); }
      FILM.T = keep; return +((performance.now() - t0) / n).toFixed(2);
    };
    buildBar(); ticks();

    if (FROZEN) {
      FILM.playing = false; FILM.seek(parseFloat(Q.get('t')));
      STAGE.ready = true;
      if (Q.has('capture')) STAGE.capture();
      if (!Q.has('play')) return;
    }
    FILM.playing = true;
    const speed = Q.has('speed') ? parseFloat(Q.get('speed')) : 1;
    let last = performance.now();
    function frame(now) {
      const dt = Math.min(.05, (now - last) / 1000) * speed; last = now;
      if (FILM.playing) {
        const a = FILM.T; FILM.T = (FILM.T + dt) % D;
        update && update(dt, FILM.T);
        for (const fn of crossed(a, FILM.T)) { try { fn(); } catch (e) { console.error(e); } }
      }
      draw(FILM.playing ? dt : 0);
      requestAnimationFrame(frame);
    }
    STAGE.ready = true;
    requestAnimationFrame(frame);
  }
  FILM.run = run;

  /* ---------- keys ---------- */
  addEventListener('keydown', e => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const k = e.key, D = FILM.duration;
    const ci = () => FILM.chapters.indexOf(FILM.chapter);
    if (k === 'p' || k === 'P' || k === 'k' || k === 'K') FILM.playing = !FILM.playing;
    else if (k === 'j' || k === 'J') FILM.seek(FILM.T - (e.shiftKey ? 1 : 5));
    else if (k === 'l' || k === 'L') FILM.seek(FILM.T + (e.shiftKey ? 1 : 5));
    else if (k === ',') { const i = ci(), c = FILM.chapters[i]; FILM.seek(c && FILM.T - c.t > 1.5 ? c.t : (FILM.chapters[(i - 1 + FILM.chapters.length) % FILM.chapters.length] || { t: 0 }).t); }
    else if (k === '.') FILM.seek((FILM.chapters[(ci() + 1) % FILM.chapters.length] || { t: 0 }).t);
    else if (/^[0-9]$/.test(k)) FILM.seek(+k / 10 * D);
    else if (k === 'h' || k === 'H') {
      FILM.uiHidden = !FILM.uiHidden;
      document.querySelectorAll('#stage .ui').forEach(el => el.style.visibility = FILM.uiHidden ? 'hidden' : '');
    }
    else if (k === 't' || k === 'T') { barPinned = !barPinned; if (bar) bar.classList.toggle('on', barPinned); }
    else if ((k === ']' || k === '[') && window === top) {
      const i = FILMS.findIndex(f => f[0] === PAGE);
      if (i >= 0) location.href = FILMS[(i + (k === ']' ? 1 : FILMS.length - 1)) % FILMS.length][0] + '.html';
    } else return;
    if (bar && k !== 't' && k !== 'T') { bar.classList.add('on'); barTimer = performance.now(); }
  });

  /* version tag, like the menus */
  addEventListener('DOMContentLoaded', () => {
    if (FROZEN || Q.has('clean')) return;
    const v = FILMS.find(f => f[0] === PAGE); if (!v) return;
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:50%;top:14px;transform:translateX(-50%);font:500 11px/1 Consolas,monospace;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.42);z-index:99;pointer-events:none;transition:opacity 1.2s;white-space:nowrap';
    d.textContent = `${v[1]} · ${v[2]}   move the mouse for the timeline · H hide UI · [ ] films · Backspace gallery`;
    document.body.appendChild(d);
    setTimeout(() => d.style.opacity = '0', 5000);
  });


  /* ---------- camera + time helpers ----------
     FILM.path(keys, {loop}) -> f(t) = {eye, target, fov (rad), roll (rad)}
       keys: [{t, eye:[x,y,z], target:[x,y,z], fov: deg, roll: deg}] sorted by t. Time-parameterised
       cubic Hermite (tangents from neighbours over their time span): uneven keys stay smooth.
       With loop, the last key's t is the loop length and the last key must equal the first.
     FILM.apply(cam, shot, extra?) copies a shot into an M3.Cam and updates it.
     FILM.drift(t, amp, seed) -> [dx, dy, dz] smooth handheld drift (metres).
     FILM.beat(t, a, b) -> 0..1 smoothstep progress of a beat window.
     FILM.warp(segments) -> f(filmT) = simT, eased speed ramps:
       segments [{t: filmT, rate: simSecondsPerFilmSecond}]; f.rate(t), f.total. */
  const { V, E } = M3;
  function hermite(p0, p1, m0, m1, u, dt) {
    const u2 = u * u, u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
    return p0 * h00 + m0 * dt * h10 + p1 * h01 + m1 * dt * h11;
  }
  function path(keys, o) {
    o = o || {};
    const n = keys.length, L = keys[n - 1].t - keys[0].t;
    const fields = ['eye', 'target', 'fov', 'roll'];
    const val = (k, f) => f === 'fov' ? (k.fov === undefined ? 40 : k.fov) : f === 'roll' ? (k.roll || 0) : k[f];
    const at = i => {
      if (!o.loop) return keys[Math.max(0, Math.min(n - 1, i))];
      const m = n - 1, j = ((i % m) + m) % m, cyc = Math.floor(i / m);
      return Object.assign({}, keys[j], { t: keys[j].t + cyc * L });
    };
    const tang = (i, f, c) => {
      const a = at(i - 1), b = at(i + 1);
      if (!o.loop && (i === 0 || i === n - 1)) return 0;
      const va = val(a, f), vb = val(b, f), dt = b.t - a.t || 1;
      return Array.isArray(va) ? (vb[c] - va[c]) / dt : (vb - va) / dt;
    };
    return function (t) {
      if (o.loop) t = ((t - keys[0].t) % L + L) % L + keys[0].t;
      else t = E.clamp(t, keys[0].t, keys[n - 1].t);
      let i = 0; while (i < n - 2 && keys[i + 1].t <= t) i++;
      const a = keys[i], b = keys[i + 1], dt = b.t - a.t || 1, u = E.clamp((t - a.t) / dt, 0, 1);
      const out = {};
      for (const f of fields) {
        const va = val(a, f), vb = val(b, f);
        if (Array.isArray(va)) out[f] = [0, 1, 2].map(c => hermite(va[c], vb[c], tang(i, f, c), tang(i + 1, f, c), u, dt));
        else out[f] = hermite(va, vb, tang(i, f), tang(i + 1, f), u, dt);
      }
      out.fov *= Math.PI / 180; out.roll *= Math.PI / 180;
      return out;
    };
  }
  function apply(cam, s, extra) {
    cam.eye = s.eye.slice(); cam.target = s.target.slice(); cam.fov = s.fov; cam.roll = s.roll || 0;
    if (extra) { cam.eye = V.add(cam.eye, extra); cam.target = V.add(cam.target, V.mul(extra, .6)); }
    return cam.update();
  }
  function drift(t, amp, seed) {
    const s = (seed || 1) * 17.3, n = M3.noise;
    return [amp * n(t * .31 + s, 1.7), amp * .7 * n(t * .27 + s, 5.1), amp * n(t * .23 + s, 9.3)];
  }
  const beat = (t, a, b) => E.ss(a, b, t);
  function warp(seg) {
    // integrate the eased rate once into a lookup so f(t) is exact and cheap
    const T1 = seg[seg.length - 1].t, N = Math.max(200, Math.ceil(T1 * 60)), acc = new Float64Array(N + 1);
    const rate = t => { let i = 0; while (i < seg.length - 2 && seg[i + 1].t <= t) i++; const a = seg[i], b = seg[i + 1]; return E.mix(a.rate, b.rate, E.ss(a.t, b.t, t)); };
    for (let k = 1; k <= N; k++) { const t0 = (k - 1) / N * T1, t1 = k / N * T1; acc[k] = acc[k - 1] + (rate(t0) + rate(t1)) * .5 * (t1 - t0); }
    const f = t => { const x = E.clamp(t / T1, 0, 1) * N, k = Math.min(N - 1, Math.floor(x)); return acc[k] + (acc[k + 1] - acc[k]) * (x - k); };
    f.rate = rate; f.total = acc[N];
    return f;
  }
  Object.assign(FILM, { path, apply, drift, beat, warp });

  window.FILM = FILM;
})();
