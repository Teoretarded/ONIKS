/* Blast physics shared by the patch builder, the loads and the solver (the bench's model, game/concepts/blast):
   Kinney-Graham free-air shock, Rankine-Hugoniot reflection, arrival times from the shock Mach number (Hopkinson
   cube-root scaling), quasi-static gas pressure of a charge in a closed volume, the fireball's radius; the plate
   materials; the charges (TNT equivalent, public figures, coarse) and how their fuzes meet the plating.
   No DOM, no GL: used in the worker and on the main thread. */

export const P0 = 101325, G = 9.81;
export const S_GRID = .125;                 // the bench's converged grid (m)
export const TEAR_K = .06, EF_MESH = .6;    // share of the tearing work, mesh-scale fracture strain factor (bench)
export const V_CRACK = 600;                 // m/s, a running crack in ship steel
export const DIFF = .5;                     // a shock keeps half its strength through each hole it passes
export const MSC = 64;                      // mass scaling once only the slow gas load is left

export const MATS = {
  hsla: { rho: 7850, E: 207e9, sy: 550e6, ef: .16 },
  mild: { rho: 7850, E: 200e9, sy: 235e6, ef: .20 },
  alu:  { rho: 2660, E: 70e9,  sy: 228e6, ef: .10 },
};
export const MAT_I = { hsla: 0, mild: 1, alu: 2 };
export const MAT_L = [MATS.hsla, MATS.mild, MATS.alu];

export const kinneyPs = Z => { const a = Z / 4.5, b = Z / .048, c = Z / .32, d = Z / 1.35;
  return P0 * 808 * (1 + a * a) / Math.sqrt((1 + b * b) * (1 + c * c) * (1 + d * d)); };
export const kinneyIs = (Z, W) => .067 * Math.sqrt(1 + Math.pow(Z / .23, 4)) / (Z * Z * Math.cbrt(1 + Math.pow(Z / 1.55, 3))) * 100 * Math.cbrt(W);   // Pa s
export const reflect = Ps => 2 * Ps * (7 * P0 + 4 * Ps) / (7 * P0 + Ps);
const TA1 = new Float32Array(2001);          // arrival for 1 kg, Z from 0 to 40 in steps of .02
(() => { let t = 0; for (let k = 1; k <= 2000; k++) { const Z = k * .02; const U = 340 * Math.sqrt(1 + 6 * kinneyPs(Math.max(Z, .053)) / (7 * P0)); t += .02 / U; TA1[k] = t; } })();
export const arrival = (R, W) => { const Z = R / Math.cbrt(W), k = Math.min(1999, Z / .02); const i = Math.floor(k); return Math.cbrt(W) * (TA1[i] + (TA1[i + 1] - TA1[i]) * (k - i)); };
export const qsp = (W, V) => 2.25e6 * Math.pow(W / V, .72);
export const fireR = W => .5 * 3.86 * Math.pow(Math.max(W, .01), .32);   // fireball radius, m
/* the shock front's radius at time t (s) of a W kg charge */
export function shockR(t, W) { let R = 0; for (let r = .1; r < 80; r *= 1.04) { if (arrival(r, W) > t) break; R = r; } return R; }

/* the charges: explosive fill as TNT equivalent (kg; approximate public figures, rounded). The warhead masses are
   game/scars.js WH; these are what goes off (fill x relative effectiveness) */
export const TNT = {
  oniks: 120, kalibr: 100, tlam: 200, slam: 100, uran: 65, mk84: 450,
  hellfire: 5, kornet: 3, shell: 3.2, shell130: 3.6, shell57: .35, gun5: 3.2,
  sm6: 30, pdms: 15, sam: 6, sam48: 70, ram: 4, aam: 6,
  mk48: 290, mk54: 44, t53: 300,
  ciws: 0, gun30: .05, rws: 0,
};
export function tntOf(kind, whKg) { return TNT[kind] !== undefined ? TNT[kind] : Math.max(.05, (whKg || 10) * .45); }
/* the charge's radius (a sphere of cast explosive) */
export const chargeR = W => Math.cbrt(3 * Math.max(W, .01) / (4 * Math.PI * 1600));
