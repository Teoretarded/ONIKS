/* Module Worker: generates one map off the main thread and transfers the heightfield back. */
import { DEF } from './defs.js';
import { generate } from './gen.js';

const GENS = {};
async function genFor(name) { return GENS[name] || (GENS[name] = (await import(`./gens/${name}.js`)).default); }

self.onmessage = async (e) => {
  const { req, id, opts } = e.data;
  try {
    const def = DEF[id];
    const r = await generate(def, await genFor(def.gen), opts);
    self.postMessage({ req, ok: true, r }, [r.heights.buffer]);
  } catch (err) {
    self.postMessage({ req, ok: false, err: String(err && err.stack || err) });
  }
};
