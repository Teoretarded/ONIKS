/* Module Worker: generates one map off the main thread and transfers the heightfield (and the ice grids) back. */
import { DEF } from './defs.js';
import { generate } from './gen.js';

const GENS = {};
async function genFor(name) { return GENS[name] || (GENS[name] = (await import(`./gens/${name}.js`)).default); }

self.onmessage = async (e) => {
  const { req, id, opts } = e.data;
  try {
    const def = DEF[id];
    const r = await generate(def, await genFor(def.gen), opts);
    const tr = [r.heights.buffer];
    if (r.iceCls) tr.push(r.iceCls.data.buffer);
    if (r.ice) for (const k of ['ds', 'ld', 'ef', 'fl', 'ep', 'em']) if (r.ice[k]) tr.push(r.ice[k].buffer);
    self.postMessage({ req, ok: true, r }, tr);
  } catch (err) {
    self.postMessage({ req, ok: false, err: String(err && err.stack || err) });
  }
};
