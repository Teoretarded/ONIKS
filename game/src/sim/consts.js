/* shared constants (kept in their own module so the sim modules never import each other in a cycle at load) */
export const DT = 0.05;              // fixed sim step, s
export const SENSE_EVERY = 5;        // ticks between sensor updates (0.25 s)
export const SIDE_SCAN_CD = 30;      // s between two scans of one side
export const SCAN_DELAY = 1.6;       // s from the order to the strike of the scan
/* ESM cross-fix (sensors.esmTick): bearings to an emitter from listeners at least ESM_CROSS (sine of the angle
   between the bearing lines, ~12 deg) apart, taken within ESM_WINDOW s, fix it: error ~ range x ESM_BEARING / sine,
   confidence climbs at the listener's esm.gain per second up to ESM_CAP (classifies at CLASSIFY) */
export const ESM_CROSS = 0.2;
export const ESM_WINDOW = 180;       // s a bearing counts toward a cross-fix
export const ESM_BEARING = 0.02;     // rad, a listener's bearing error
export const ESM_CAP = 0.8;          // an ESM-only track never gets firmer than this (a scan identifies)
export const SHORE_D = 3000;         // m: a land unit this close to the water is "on the shore" (radar.shore)
