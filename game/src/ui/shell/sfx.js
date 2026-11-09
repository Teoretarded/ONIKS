/* UI sounds for the shell: the films' STAGE.SFX voices (pc: short square blips; orb: sine chimes), plus a bus the
   film iframes play through, so one master volume covers both. Silent until the first user gesture. */
import { getSettings, onSettings } from '../../data/settings.js';

export const sfx = {
  ac: null, master: null, ui: null, film: null, kind: 'pc', uiOn: true,
  unlock() {
    if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return; }
    try {
      this.ac = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ac.createGain(); this.master.connect(this.ac.destination);
      this.ui = this.ac.createGain(); this.ui.connect(this.master);
      this.film = this.ac.createGain(); this.film.gain.value = .9; this.film.connect(this.master);
      this.apply(getSettings());
      this.onUnlock && this.onUnlock();
    } catch (e) { this.ac = null; }
  },
  apply(s) {
    this.uiOn = !!s.uiSound;
    if (!this.ac) return;
    const t = this.ac.currentTime;
    this.master.gain.setTargetAtTime(s.volume * s.volume * .95 + .0001, t, .03);
    this.ui.gain.setTargetAtTime(s.uiSound ? 1 : 0, t, .02);
  },
  tone(f0, f1, dur, type, gain, when) {
    if (!this.ac || !this.uiOn) return;
    const t = this.ac.currentTime + (when || 0), o = this.ac.createOscillator(), g = this.ac.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1 || f0, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain || .05, t + .004); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(this.ui); o.start(t); o.stop(t + dur + .02);
  },
  noise(dur, f, q, gain, attack, when) {
    if (!this.ac || !this.uiOn) return;
    const t = this.ac.currentTime + (when || 0), n = Math.floor(this.ac.sampleRate * dur), b = this.ac.createBuffer(1, n, this.ac.sampleRate), d = b.getChannelData(0);
    let s = 1234567;
    for (let i = 0; i < n; i++) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; d[i] = (s >>> 8) / 8388608 - 1; }
    const src = this.ac.createBufferSource(); src.buffer = b;
    const fl = this.ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = f || 400; fl.Q.value = q || .7;
    const g = this.ac.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain || .1, t + (attack || .01)); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    src.connect(fl); fl.connect(g); g.connect(this.ui); src.start(t);
  },
  move() { if (this.kind === 'pc') this.tone(1500, 1500, .018, 'square', .018); else this.tone(2300, 1900, .03, 'sine', .045); },
  tick() { if (this.kind === 'pc') this.tone(1900, 1900, .014, 'square', .014); else this.tone(2600, 2400, .025, 'sine', .035); },
  enter() {
    if (this.kind === 'pc') { this.tone(420, 840, .09, 'square', .02); this.tone(1260, 1260, .05, 'square', .015, .07); }
    else { this.tone(880, 880, .09, 'sine', .05); this.tone(1320, 1320, .16, 'sine', .04, .06); }
  },
  back() {
    if (this.kind === 'pc') { this.tone(840, 420, .08, 'square', .016); }
    else { this.tone(1320, 1320, .07, 'sine', .035); this.tone(880, 880, .12, 'sine', .035, .05); }
  },
  deny() { if (this.kind === 'pc') this.tone(220, 200, .08, 'square', .02); else this.tone(330, 300, .1, 'sine', .05); },
  /* a launch into a match: the enter chirp over a low swell */
  start() { this.enter(); this.noise(1.6, 150, 1, .16, .35, .05); this.noise(.8, 900, .5, .03, .2, .05); },
};

onSettings(s => sfx.apply(s));
['pointerdown', 'keydown'].forEach(ev => addEventListener(ev, () => sfx.unlock(), { capture: true }));
