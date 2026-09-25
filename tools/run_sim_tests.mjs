/* Node runner for the sim tests (game/src/sim/tests.js, written for game/tests.html).
   Shims the few browser globals the tests touch (window, location, document), evaluates the classic script
   reference/menus/common/m3.js into the global scope, imports the tests and waits for window.__done.
   Usage: node tools/run_sim_tests.mjs [--only=<substring>] [--long=1] [--map=<id>]
   Exit code 0 when every test passed. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2).filter(a => a.startsWith('--')).map(a => a.slice(2).split('='));
const search = args.length ? '?' + args.map(([k, v]) => `${k}=${encodeURIComponent(v === undefined ? '1' : v)}`).join('&') : '';

globalThis.window = globalThis;
globalThis.location = { search, href: 'file:///game/tests.html' + search };
const strip = s => String(s).replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
function el(id) {
  return {
    id, className: '', style: {}, children: [], _html: '', textContent: '',
    set innerHTML(h) { this._html = h; if (id !== 'out' && id !== 'sum') { const t = strip(h); process.stdout.write(`${/^\s*l fail/.test(this.className) || this.className.includes('fail') ? '\x1b[31m' : '\x1b[32m'}${t}\x1b[0m\n`); } },
    get innerHTML() { return this._html; },
    appendChild(c) { this.children.push(c); return c; },
  };
}
const els = {};
globalThis.document = {
  title: '',
  getElementById: id => els[id] || (els[id] = el(id)),
  createElement: () => el('div'),
};
vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'reference/menus/common/m3.js'), 'utf8'), { filename: 'm3.js' });

const t0 = Date.now();
await import(pathToFileURL(path.join(ROOT, 'game/src/sim/tests.js')).href);
await new Promise((res, rej) => {
  const iv = setInterval(() => { if (globalThis.__done) { clearInterval(iv); res(); } }, 50);
  setTimeout(() => { clearInterval(iv); rej(new Error('tests did not finish in 30 min')); }, 30 * 60 * 1000);
});
const { pass, total } = globalThis.__done;
console.log(`\n${pass}/${total} passed · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(pass === total ? 0 : 1);
