/* The maps: identity, size, resolution, seed, weather and time. Generators live in gens/<gen>.js.
   DOM-free (imported by the Worker too). */

// bump whenever a change in world/ changes what the generators produce (invalidates the IndexedDB cache)
export const GEN_VERSION = 'w26';

export const DEFS = [
  {
    id: 'krasnaya_kosa', gen: 'krasnaya', name: 'Krasnaya Kosa', blurb: 'The real coast · bluff battery',
    size: [140000, 150000], cell: 100, seed: 1337,
    weather: { kind: 'calm', wind: [3.5, -2.0], sea: 0.3 }, time: 'night',
  },
  {
    id: 'fjord', gen: 'fjord', name: 'Dolgaya Guba', blurb: 'Fjord · cliffs · deep channels',
    size: [140000, 120000], cell: 100, seed: 4111,
    weather: { kind: 'haze', wind: [1.5, 0.8], sea: 0.12 }, time: 'dusk',
  },
  {
    id: 'strait', gen: 'strait', name: 'Proliv Uzky', blurb: 'Strait · two coasts · island',
    size: [120000, 140000], cell: 100, seed: 2207,
    weather: { kind: 'rain', wind: [-6.0, 4.0], sea: 0.5 }, time: 'day',
  },
  {
    id: 'archipelago', gen: 'archipelago', name: 'Belye Shkhery', blurb: 'Archipelago · skerries · radar shadow',
    size: [140000, 140000], cell: 100, seed: 9013,
    weather: { kind: 'calm', wind: [2.0, 3.0], sea: 0.25 }, time: 'day',
  },
  {
    id: 'delta', gen: 'delta', name: 'Ust-Solyonaya', blurb: 'Delta · channels · shallow shelf',
    size: [130000, 110000], cell: 100, seed: 6421,
    weather: { kind: 'haze', wind: [4.0, 1.0], sea: 0.2 }, time: 'dusk',
  },
  {
    id: 'caldera', gen: 'caldera', name: 'Chyortova Past', blurb: 'Caldera · one gap · lagoon',
    size: [100000, 100000], cell: 100, seed: 7717,
    weather: { kind: 'storm', wind: [-9.0, -5.0], sea: 0.75 }, time: 'night',
  },
  // polar night over the sea ice: an offshore wind (from the land, toward the north) keeps the flaw lead open; ice damps
  // the swell to nothing in the leads; light snow (weather.snow, drawn by the landmarks) in the haze
  {
    id: 'arctic', gen: 'arctic', name: 'Guba Ledyanaya', blurb: 'Sea ice · leads · naval base',
    size: [120000, 120000], cell: 100, seed: 8821,
    weather: { kind: 'haze', wind: [2.0, 5.5], sea: 0.05, snow: 0.55 }, time: 'night',
  },
  {
    id: 'harbour', gen: 'harbour', name: 'Bukhta Svetlaya', blurb: 'Port city · breakwaters · bridges',
    size: [120000, 120000], cell: 100, seed: 5309,
    weather: { kind: 'calm', wind: [1.5, -2.5], sea: 0.22 }, time: 'night',
  },
];

export const DEF = Object.fromEntries(DEFS.map(d => [d.id, d]));
