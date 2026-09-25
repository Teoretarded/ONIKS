/* shared constants (kept in their own module so the sim modules never import each other in a cycle at load) */
export const DT = 0.05;              // fixed sim step, s
export const SENSE_EVERY = 5;        // ticks between sensor updates (0.25 s)
export const SIDE_SCAN_CD = 30;      // s between two scans of one side
export const SCAN_DELAY = 1.6;       // s from the order to the strike of the scan
