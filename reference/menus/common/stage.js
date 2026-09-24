/* Shared menu runtime: 1920x1080 stage scaled to the window, the game's five
   menu entries with keyboard + mouse, synthesized UI sounds, the frame loop
   (with ?t=SECONDS to freeze a moment and ?capture=1 to save a PNG through
   the kit server), and [ / ] to flip between the ten versions. */
(function () {
  const VERSIONS = [
    ['o1_ignition', 'Orbital 1', 'Ignition'],
    ['o2_seaskim', 'Orbital 2', 'Sea Skimmer'],
    ['o3_orbit', 'Orbital 3', 'From Orbit'],
    ['o4_chronograph', 'Orbital 4', 'Chronograph'],
    ['o5_terminal', 'Orbital 5', 'Terminal'],
    ['p1_strike', 'Point Cloud 1', 'Strike'],
    ['p2_clutter', 'Point Cloud 2', 'Clutter'],
    ['p3_coastline', 'Point Cloud 3', 'Coastline'],
    ['p4_track', 'Point Cloud 4', 'Track'],
    ['p5_confidence', 'Point Cloud 5', 'Confidence'],
  ];
  const ITEMS = ['Sandbox', 'Combat', 'Campaign', 'Settings', 'Quit'];
  const BLURBS = [
    'Free war sandbox. Everything unlocked; the red force stays passive until you wake it.',
    'Set up a fog-of-war battle: map, enemy fleet, armory and defenses.',
    'Six escalating battles. Ammunition carries over and every grade is kept.',
    'Graphics, display, interface and keybinds.',
    'Stand the battery down.',
  ];
  const Q = new URLSearchParams(location.search);
  const PAGE = (location.pathname.split('/').pop() || '').replace('.html', '');
  // frozen frames: no CSS fades, so a still shows every label at full strength
  if (Q.has('t')) { const s = document.createElement('style'); s.textContent = '*,*::after,*::before{transition:none!important;animation:none!important}'; document.head.appendChild(s); }

  /* ---------- stage fit ---------- */
  function fit() {
    const st = document.getElementById('stage'); if (!st) return;
    const s = Math.min(innerWidth / 1920, innerHeight / 1080);
    st.style.transform = `translate(${(innerWidth - 1920 * s) / 2}px, ${(innerHeight - 1080 * s) / 2}px) scale(${s})`;
    STAGE.scale = s;
  }
  addEventListener('resize', fit);

  /* ---------- sound ---------- */
  const SFX = {
    ac: null, on: true, kind: 'orb', master: null,
    unlock() {
      if (this.ac) return;
      try { this.ac = new (window.AudioContext || window.webkitAudioContext)(); this.master = this.ac.createGain(); this.master.gain.value = .9; this.master.connect(this.ac.destination); } catch (e) { this.ac = null; }
    },
    tone(f0, f1, dur, type, gain, when) {
      if (!this.ac || !this.on) return;
      const t = this.ac.currentTime + (when || 0), o = this.ac.createOscillator(), g = this.ac.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1 || f0, t + dur);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain || .05, t + .004); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + .02);
    },
    noise(dur, f, q, gain, attack, when) {
      if (!this.ac || !this.on) return;
      const t = this.ac.currentTime + (when || 0), n = Math.floor(this.ac.sampleRate * dur), b = this.ac.createBuffer(1, n, this.ac.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      const s = this.ac.createBufferSource(); s.buffer = b;
      const fl = this.ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = f || 400; fl.Q.value = q || .7;
      const g = this.ac.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain || .1, t + (attack || .01)); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      s.connect(fl); fl.connect(g); g.connect(this.master); s.start(t);
    },
    move() { if (this.kind === 'pc') this.tone(1500, 1500, .018, 'square', .018); else this.tone(2300, 1900, .03, 'sine', .045); },
    enter() {
      if (this.kind === 'pc') { this.tone(420, 840, .09, 'square', .02); this.tone(1260, 1260, .05, 'square', .015, .07); }
      else { this.tone(880, 880, .09, 'sine', .05); this.tone(1320, 1320, .16, 'sine', .04, .06); }
    },
    /* launch / impact bed */
    rumble(dur, gain) { this.noise(dur || 3, 140, 1, gain || .22, .05); this.noise((dur || 3) * .5, 900, .5, (gain || .22) * .25, .01); },
    crack() { this.noise(.5, 5000, .4, .12, .002); this.noise(1.6, 220, 1, .2, .01); },
  };
  ['pointerdown', 'keydown'].forEach(ev => addEventListener(ev, () => SFX.unlock(), { capture: true }));

  /* ---------- menu ---------- */
  function menu(o) {
    const el = o.el, items = [...el.querySelectorAll('[data-item]')];
    const m = { i: o.start || 0, busy: false, items, el };
    const set = (i, quiet) => {
      i = (i + items.length) % items.length;
      if (i === m.i && !quiet && items[i].classList.contains('on')) return;
      const prev = m.i; m.i = i;
      items.forEach((it, k) => it.classList.toggle('on', k === i));
      if (o.blurb) { o.blurb.textContent = BLURBS[i]; o.blurb.classList.remove('in'); void o.blurb.offsetWidth; o.blurb.classList.add('in'); }
      if (!quiet) SFX.move();
      o.onChange && o.onChange(i, prev);
    };
    const go = () => {
      if (m.busy) return; m.busy = true;
      SFX.enter();
      const it = items[m.i]; it.classList.add('go');
      const ms = (o.onEnter && o.onEnter(m.i)) || 1900;
      setTimeout(() => { it.classList.remove('go'); m.busy = false; o.onDone && o.onDone(m.i); }, ms);
    };
    items.forEach((it, k) => {
      it.addEventListener('mouseenter', () => { if (!m.busy) set(k); });
      it.addEventListener('click', () => { set(k, true); go(); });
    });
    const prevK = o.axis === 'h' ? ['ArrowLeft', 'a', 'A'] : ['ArrowUp', 'w', 'W'];
    const nextK = o.axis === 'h' ? ['ArrowRight', 'd', 'D'] : ['ArrowDown', 's', 'S'];
    addEventListener('keydown', e => {
      if (m.busy) return;
      if (prevK.includes(e.key)) { set(m.i - 1); e.preventDefault(); }
      else if (nextK.includes(e.key)) { set(m.i + 1); e.preventDefault(); }
      else if (e.key === 'Enter' || e.key === ' ') { go(); e.preventDefault(); }
      else if (e.key === 'Escape') set(4);
    });
    set(m.i, true);
    m.set = set; m.go = go;
    return m;
  }

  /* ---------- loop ---------- */
  function run(sc) {
    const trap = f => (...a) => { try { return f(...a); } catch (e) { STAGE.err = e.stack; console.error(e.stack); throw e; } };
    const scene = { update: trap(sc.update), render: trap(sc.render) };
    const seekT = Q.has('t') ? parseFloat(Q.get('t')) : null;
    const speed = Q.has('speed') ? parseFloat(Q.get('speed')) : 1;
    let t = 0, last = performance.now(), paused = false;
    // frame cost without rAF (hidden tabs never tick): STAGE.bench(120) -> ms per update+render
    STAGE.bench = (n, from) => {
      let tt = from === undefined ? t : from; const t0 = performance.now();
      for (let i = 0; i < (n || 60); i++) { scene.update(1 / 60, tt); tt += 1 / 60; scene.render(tt, 1 / 60); }
      return +((performance.now() - t0) / (n || 60)).toFixed(2);
    };
    STAGE.fps = 0; let fc = 0, ft = 0;
    if (seekT !== null) {
      const dt = 1 / 60;
      while (t < seekT - 1e-9) { scene.update(dt, t); t += dt; }
      scene.render(t, 0); paused = true;
      STAGE.time = t;
      STAGE.ready = true;
      if (Q.has('capture')) capture();
      if (!Q.has('play')) return;
      paused = false;
    }
    addEventListener('keydown', e => { if (e.key === 'p' || e.key === 'P') paused = !paused; });
    function frame(now) {
      let dt = Math.min(.05, (now - last) / 1000) * speed; last = now;
      fc++; ft += dt; if (ft > .5) { STAGE.fps = fc / ft; fc = 0; ft = 0; }
      if (!paused) { scene.update(dt, t); t += dt; }
      STAGE.time = t;
      scene.render(t, paused ? 0 : dt);
      requestAnimationFrame(frame);
    }
    STAGE.ready = true;
    requestAnimationFrame(frame);
  }

  async function capture() {
    const dir = location.pathname.split('/').slice(-2, -1)[0] || 'menus';
    const out = Q.get('out') || `${dir}/shots/${PAGE}${Q.has('tag') ? '_' + Q.get('tag') : ''}.png`;
    try {
      await document.fonts.ready;
      await new Promise(r => setTimeout(r, 250));
      const st = document.getElementById('stage');
      const cv = st.querySelectorAll('canvas');
      // flatten: canvases first, then the DOM layer rasterized through an SVG foreignObject is
      // unreliable for web fonts, so use html-to-image for the whole stage
      if (!window.htmlToImage) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
      const fontCss = await embedFonts();
      const url = await htmlToImage.toPng(st, { width: 1920, height: 1080, pixelRatio: 1, fontEmbedCSS: fontCss, style: { transform: 'none', left: '0', top: '0' } });
      const r = await fetch('/save?path=' + encodeURIComponent(out), { method: 'POST', body: url });
      document.title = (r.ok ? 'CAPTURED ' : 'CAPTURE FAILED ') + out;
    } catch (e) { console.error(e); document.title = 'CAPTURE FAILED ' + e; }
  }
  async function embedFonts() {
    const urls = [...document.querySelectorAll('link[href*="fonts.googleapis.com"]')].map(l => l.href);
    let css = '';
    for (const u of urls) css += await (await fetch(u)).text() + '\n';
    const found = [...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map(m => m[1]))];
    const map = {};
    await Promise.all(found.map(async u => { const b = await (await fetch(u)).blob(); map[u] = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); }); }));
    return css.replace(/url\((https:[^)]+)\)/g, (m, u) => `url(${map[u]})`);
  }

  /* ---------- version flip + label ---------- */
  addEventListener('keydown', e => {
    const k = VERSIONS.findIndex(v => v[0] === PAGE);
    // inside the gallery's big view: let the gallery flip / close instead of navigating the frame
    if (window !== top && [']', '[', 'Backspace'].includes(e.key)) {
      parent.postMessage({ oniks: e.key === ']' ? 'next' : e.key === '[' ? 'prev' : 'close' }, '*'); return;
    }
    if (e.key === 'm' || e.key === 'M') SFX.on = !SFX.on;
    if (e.key === ']' && k >= 0) location.href = VERSIONS[(k + 1) % VERSIONS.length][0] + '.html';
    else if (e.key === '[' && k >= 0) location.href = VERSIONS[(k + VERSIONS.length - 1) % VERSIONS.length][0] + '.html';
    else if (e.key === 'Backspace') location.href = 'index.html';
  });
  function tagVersion() {
    if (Q.has('t') || Q.has('clean')) return;
    const v = VERSIONS.find(v => v[0] === PAGE); if (!v) return;
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:50%;top:14px;transform:translateX(-50%);font:500 11px/1 Consolas,monospace;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.42);z-index:99;pointer-events:none;transition:opacity 1.2s;white-space:nowrap';
    d.textContent = `${v[1]} · ${v[2]}   [ ] switch · Backspace gallery · M sound`;
    document.body.appendChild(d);
    setTimeout(() => d.style.opacity = '0', 4500);
  }

  const STAGE = { VERSIONS, ITEMS, BLURBS, Q, PAGE, fit, menu, run, SFX, capture, scale: 1, time: 0, ready: false };
  window.STAGE = STAGE;
  addEventListener('DOMContentLoaded', () => { fit(); tagVersion(); });
})();
