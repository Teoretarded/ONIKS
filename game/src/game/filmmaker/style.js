/* Film maker CSS (injected once; Point Cloud tokens from styles/game.css). Sizes are px at 1080p: the panel's root is
   zoomed to the window like the HUD. Mono rows, key chips, the films' timeline bar; no boxes, no radii, no shadows. */
const CSS = `
.oniks-film { position: absolute; left: 0; top: 0; pointer-events: none; color: #fff; font-family: var(--sans); -webkit-font-smoothing: antialiased; }
.oniks-film .fm-panel { position: absolute; left: 56px; right: 56px; bottom: 34px; z-index: 0; pointer-events: auto; text-shadow: 0 0 2px #0B0C0A, 0 0 5px rgba(11,12,10,.9); }
.oniks-film .fm-panel::before { content: ''; position: absolute; left: -56px; right: -56px; top: -150px; bottom: -34px; pointer-events: none; z-index: -1;
  background: linear-gradient(to top, rgba(11,12,10,.93) 0%, rgba(11,12,10,.86) 58%, rgba(11,12,10,.5) 80%, rgba(11,12,10,0) 100%); }
.oniks-film b { font-weight: 400; color: #fff; }
.oniks-film .l { color: var(--lime); }
.oniks-film .c { color: var(--coral); }
.oniks-film .fm-mono, .oniks-film .fm-lbl { font: 400 11.5px/1 var(--mono); letter-spacing: .05em; text-transform: uppercase; color: var(--faint); font-variant-numeric: tabular-nums; white-space: nowrap; }

/* header: the kick with the take's name, the game's clock, the close chip */
.oniks-film .fm-hd { display: flex; align-items: center; gap: 18px; height: 26px; margin-bottom: 16px; }
.oniks-film .fm-hd .kick { flex: none; }
.oniks-film .fm-hd .kick i { background: var(--lime); }
.oniks-film .fm-name { width: 330px; font: 500 18px/1 var(--sans); letter-spacing: -.02em; }
.oniks-film .fm-hd .sp { flex: 1; }
.oniks-film .fm-hd .ro { display: flex; gap: 12px; align-items: center; font: 400 12px/1 var(--mono); letter-spacing: .05em; text-transform: uppercase; color: var(--faint); font-variant-numeric: tabular-nums; white-space: nowrap; }

/* inputs: bare text on a dotted rule */
.oniks-film input { background: transparent; border: 0; border-bottom: 1px dotted rgba(255,255,255,.3); color: #fff; font: 400 11.5px/1 var(--mono); letter-spacing: .04em;
  padding: 3px 0 3px; outline: none; border-radius: 0; min-width: 0; text-shadow: inherit; }
.oniks-film input:focus { border-bottom: 1px solid var(--lime); }
.oniks-film input::placeholder { color: rgba(255,255,255,.26); text-transform: uppercase; }
.oniks-film input.fm-name { font: 500 18px/1 var(--sans); letter-spacing: -.02em; padding-bottom: 4px; }
.oniks-film input.num { text-align: right; font-variant-numeric: tabular-nums; }

/* the timeline (film.js's bar): a hairline, key ticks with their captions, rate marks, the lime head */
.oniks-film .fm-row { display: flex; gap: 18px; align-items: baseline; margin-bottom: 9px; }
.oniks-film .fm-row .tt { color: #fff; font: 400 11.5px/1 var(--mono); font-variant-numeric: tabular-nums; }
.oniks-film .fm-row .ch { color: var(--lime); font: 400 11.5px/1 var(--mono); letter-spacing: .05em; text-transform: uppercase; }
.oniks-film .fm-row .sp { flex: 1; }
.oniks-film .fm-track { position: relative; height: 40px; cursor: pointer; margin-bottom: 14px; }
.oniks-film .fm-track .line { position: absolute; left: 0; right: 0; top: 13px; height: 1px; background: rgba(255,255,255,.28); }
.oniks-film .fm-track .done { position: absolute; left: 0; top: 13px; height: 1px; background: var(--lime); }
.oniks-film .fm-track .end { position: absolute; top: 9px; width: 1px; height: 9px; background: rgba(255,255,255,.3); }
.oniks-film .fm-track .tick { position: absolute; top: 7px; width: 1px; height: 13px; background: rgba(255,255,255,.62); cursor: ew-resize; }
.oniks-film .fm-track .tick::after { content: ''; position: absolute; left: -5px; right: -5px; top: -4px; bottom: -4px; }
.oniks-film .fm-track .tick span { position: absolute; left: 5px; top: -3px; white-space: nowrap; font: 400 10.5px/1 var(--mono); letter-spacing: .05em; text-transform: uppercase; color: rgba(255,255,255,.42); pointer-events: none; }
.oniks-film .fm-track .tick.cur { background: var(--lime); }
.oniks-film .fm-track .tick.cur span { color: #fff; }
.oniks-film .fm-track .tick.fol span { color: rgba(198,244,50,.62); }
.oniks-film .fm-track .rt { position: absolute; top: 25px; width: 5px; height: 5px; margin-left: -2px; background: rgba(198,244,50,.7); cursor: ew-resize; }
.oniks-film .fm-track .rt span { position: absolute; left: 8px; top: -2px; white-space: nowrap; font: 400 10px/1 var(--mono); letter-spacing: .05em; text-transform: uppercase; color: rgba(198,244,50,.7); pointer-events: none; }
.oniks-film .fm-track .head { position: absolute; top: 6px; width: 3px; height: 15px; margin-left: -1px; background: var(--lime); pointer-events: none; }

/* body: keys on the left, rates and the take on the right (folded: the timeline and the chips only) */
.oniks-film .fm-body { display: grid; grid-template-columns: 1fr 460px; column-gap: 56px; }
.oniks-film .fm-panel.fold .fm-body, .oniks-film .fm-panel.fold .fm-io { display: none; }
.oniks-film .fm-panel.fold .fm-track { margin-bottom: 0; }
.oniks-film .fm-panel.fold::before { top: -90px; }
.oniks-film .fm-sec { display: flex; align-items: baseline; gap: 14px; margin-bottom: 8px; }
.oniks-film .fm-sec .fm-lbl { color: var(--dim); }
.oniks-film .fm-keys .list { max-height: 188px; overflow-y: auto; overflow-x: hidden; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.25) transparent; }
.oniks-film .fm-k { display: grid; grid-template-columns: 26px 60px 200px minmax(150px, 1fr) 44px 186px minmax(170px, 1.3fr) 44px; column-gap: 14px; align-items: center; height: 27px;
  font: 400 11.5px/1 var(--mono); letter-spacing: .05em; text-transform: uppercase; color: var(--dim); font-variant-numeric: tabular-nums; white-space: nowrap; }
.oniks-film .fm-k.hd { height: 20px; color: rgba(255,255,255,.3); font-size: 10.5px; }
.oniks-film .fm-k > * { overflow: hidden; text-overflow: ellipsis; }
.oniks-film .fm-k .n { position: relative; color: rgba(255,255,255,.36); cursor: pointer; padding-left: 11px; }
.oniks-film .fm-k .n::before { content: ''; position: absolute; left: 0; top: 50%; margin-top: -3px; width: 6px; height: 6px; background: var(--lime); transform: scale(0); transition: transform .18s cubic-bezier(.3,1.6,.5,1); }
.oniks-film .fm-k.cur .n { color: var(--lime); }
.oniks-film .fm-k.cur .n::before { transform: scale(1); }
.oniks-film .fm-k.cur { color: #fff; }
.oniks-film .fm-k:not(.hd):hover .n { color: #fff; }
.oniks-film .fm-k .go { cursor: pointer; }
.oniks-film .fm-k .go:hover { color: #fff; }
.oniks-film .fm-k .x, .oniks-film .fm-r .x { cursor: pointer; color: rgba(255,255,255,.34); text-align: right; }
.oniks-film .fm-k .x:hover, .oniks-film .fm-r .x:hover { color: var(--coral); }
.oniks-film .fm-k .x i, .oniks-film .fm-k .re { font-style: normal; cursor: pointer; }
.oniks-film .fm-k .re { color: rgba(255,255,255,.34); margin-right: 10px; }
.oniks-film .fm-k .re:hover { color: var(--lime); }
.oniks-film .fm-empty { height: 27px; display: flex; align-items: center; gap: 10px; }

/* a value you click to change (dotted underline, lime on hover) */
.oniks-film .fm-cyc { cursor: pointer; color: #fff; padding-bottom: 1px; border-bottom: 1px dotted rgba(255,255,255,.34); }
.oniks-film .fm-cyc.off { color: rgba(255,255,255,.4); }
.oniks-film .fm-cyc.on { color: var(--lime); border-bottom-color: rgba(198,244,50,.5); }
.oniks-film .fm-cyc:hover { color: var(--lime); border-bottom-color: var(--lime); }

.oniks-film .fm-r { display: grid; grid-template-columns: 26px 70px 70px 1fr 20px; column-gap: 12px; align-items: center; height: 25px;
  font: 400 11.5px/1 var(--mono); letter-spacing: .05em; text-transform: uppercase; color: var(--dim); font-variant-numeric: tabular-nums; white-space: nowrap; }
.oniks-film .fm-r .n { color: rgba(255,255,255,.36); }
.oniks-film .fm-r .v { color: var(--lime); }
.oniks-film .fm-opts { display: grid; grid-template-columns: 70px 1fr; row-gap: 8px; column-gap: 12px; margin-top: 16px; align-items: center;
  font: 400 11.5px/1 var(--mono); letter-spacing: .05em; text-transform: uppercase; color: var(--faint); white-space: nowrap; }
.oniks-film .fm-opts .vals { display: flex; gap: 14px; align-items: center; }
.oniks-film .fm-opts .vals .fm-cyc { border-bottom-color: transparent; color: rgba(255,255,255,.4); }
.oniks-film .fm-opts .vals .fm-cyc.on { color: var(--lime); border-bottom-color: rgba(198,244,50,.5); }
.oniks-film .fm-opts .vals .fm-cyc:hover { color: #fff; }
.oniks-film .fm-opts input { width: 100%; }
.oniks-film .fm-opts input.num { width: 56px; }

/* footer: the films' key chips */
.oniks-film .fm-ft { display: flex; align-items: center; gap: 8px; margin-top: 18px; font: 500 11px/1 var(--mono); letter-spacing: .05em; text-transform: uppercase; color: var(--faint); white-space: nowrap; }
.oniks-film .fm-ft .sp { flex: 1; }
.oniks-film .fm-ch { display: inline-flex; align-items: center; gap: 8px; padding: 6px 10px 5px 6px; border: 1px solid var(--hair); cursor: pointer; color: var(--dim);
  font: 500 11px/1 var(--mono); letter-spacing: .05em; text-transform: uppercase; white-space: nowrap; }
.oniks-film .fm-ch.nk { padding-left: 10px; }
.oniks-film .fm-ch b { color: #0B0C0A; background: rgba(255,255,255,.78); padding: 3px 5px 2px; font-weight: 500; text-shadow: none; }
.oniks-film .fm-ch:hover { color: #fff; border-color: rgba(255,255,255,.34); }
.oniks-film .fm-ch:hover b { background: var(--lime); }
.oniks-film .fm-ch.on { color: var(--lime); border-color: rgba(198,244,50,.45); }
.oniks-film .fm-ch.go b { background: var(--lime); }
.oniks-film .fm-msg { margin-left: 8px; color: var(--lime); font: 400 11px/1 var(--mono); letter-spacing: .05em; text-transform: uppercase; transition: opacity .4s; }
.oniks-film .fm-msg.bad { color: var(--coral); }
.oniks-film .fm-msg.out { opacity: 0; }

/* the takes list / the JSON row */
.oniks-film .fm-io { margin-top: 14px; display: none; }
.oniks-film .fm-io.on { display: block; }
.oniks-film .fm-io .grp { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 8px; margin-bottom: 8px; font: 500 11px/1 var(--mono); letter-spacing: .05em; text-transform: uppercase; color: var(--faint); }
.oniks-film .fm-io .grp .fm-lbl { width: 70px; }
.oniks-film .fm-io .fm-ch i { font-style: normal; color: rgba(255,255,255,.34); margin-left: 4px; }
.oniks-film .fm-io .fm-ch i:hover { color: var(--coral); }
.oniks-film .fm-io .json { display: flex; align-items: center; gap: 12px; }
.oniks-film .fm-io .json input { flex: 1; font-size: 11px; color: rgba(255,255,255,.8); }

/* playing: the films' timeline bar, over the clean frame, on mouse move */
.oniks-film-bar { position: absolute; left: 0; right: 0; bottom: 0; padding: 26px 28px 14px; font: 400 11.5px/1 var(--mono); letter-spacing: .02em; color: rgba(255,255,255,.62);
  background: linear-gradient(to top, rgba(0,0,0,.82), rgba(0,0,0,0)); opacity: 0; transition: opacity .35s; user-select: none; pointer-events: none; }
.oniks-film-bar.on { opacity: 1; pointer-events: auto; }
.oniks-film-bar .row { display: flex; gap: 18px; align-items: baseline; margin-bottom: 10px; white-space: nowrap; }
.oniks-film-bar .tt { color: #fff; font-variant-numeric: tabular-nums; }
.oniks-film-bar .ch { color: var(--lime); text-transform: uppercase; letter-spacing: .05em; }
.oniks-film-bar .sp { flex: 1; }
.oniks-film-bar .track { position: relative; height: 18px; cursor: pointer; }
.oniks-film-bar .line { position: absolute; left: 0; right: 0; top: 8px; height: 1px; background: rgba(255,255,255,.28); }
.oniks-film-bar .done { position: absolute; left: 0; top: 8px; height: 1px; background: var(--lime); }
.oniks-film-bar .tick { position: absolute; top: 3px; width: 1px; height: 11px; background: rgba(255,255,255,.5); }
.oniks-film-bar .tick span { position: absolute; left: 5px; top: -1px; white-space: nowrap; font-size: 10.5px; color: rgba(255,255,255,.42); pointer-events: none; text-transform: uppercase; letter-spacing: .05em; }
.oniks-film-bar .tick.cur span { color: #fff; }
.oniks-film-bar .head { position: absolute; top: 3px; width: 3px; height: 11px; margin-left: -1px; background: var(--lime); }
/* armed: the game is the player's until the launch; one lime line at the top, nothing in the way */
.oniks-film-bar.armed { top: 20px; bottom: auto; padding: 0; background: none; pointer-events: none !important; }
.oniks-film-bar.armed .row { justify-content: center; margin: 0; }
.oniks-film-bar.armed .row > span:not(.tt) { display: none; }
.oniks-film-bar.armed .tt { color: var(--lime); text-transform: uppercase; letter-spacing: .06em; text-shadow: 0 0 2px #0B0C0A, 0 0 5px rgba(11,12,10,.9); }
.oniks-film-bar.armed .track { display: none; }
body.fm-playing.fm-idle #gl { cursor: none; }
`;

export function injectStyle() {
  if (document.getElementById('oniks-film-css')) return;
  const s = document.createElement('style');
  s.id = 'oniks-film-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}
