// Shared constants and car definitions.

export const LANES = [-6, -2, 2, 6];   // lane centre x positions (4 lanes, 4 m wide)
export const ROAD_HALF = 9;            // half width of the asphalt incl. shoulders
export const PLAYER_LIMIT = 7.75;      // max |x| of the player before scraping the barrier
export const PLAYER_HALF_W = 0.9;      // collision half extents (slightly forgiving)
export const PLAYER_HALF_L = 2.1;

export const CARS = [
  {
    id: 'volt', name: 'VOLT GT', tagline: 'Balanced grand tourer with a neon soul',
    style: 'gt', color: 0x0d6bff, accent: 0x00d4ff, caliper: 0x00d4ff,
    maxSpeed: 290, accel: 1.0, handling: 1.0, nitro: 1.0,
  },
  {
    id: 'phantom', name: 'PHANTOM R', tagline: 'Low-slung hypercar built for top speed',
    style: 'hyper', color: 0xc8102e, accent: 0xff2bd6, caliper: 0xffd166,
    maxSpeed: 330, accel: 0.92, handling: 0.85, nitro: 1.15,
  },
  {
    id: 'viper', name: 'VIPER X', tagline: 'Track weapon — razor-sharp handling',
    style: 'track', color: 0xf2b705, accent: 0x9dff00, caliper: 0xff3b2e,
    maxSpeed: 275, accel: 1.18, handling: 1.28, nitro: 0.95,
  },
  {
    id: 'aero', name: 'AERO ION', tagline: 'Electric flying sedan — E / Q to fly over traffic',
    style: 'ev', color: 0xe9edf3, accent: 0x00e5ff, caliper: 0x00e5ff,
    maxSpeed: 300, accel: 1.1, handling: 1.1, nitro: 1.0, flying: true,
  },
  {
    id: 'storm', name: 'STORM RS', tagline: 'Muscle car — brutal launch, twin stripes, hood scoop',
    style: 'muscle', color: 0x15171c, accent: 0xff7a00, caliper: 0xff7a00, stripe: 0xff7a00,
    maxSpeed: 285, accel: 1.28, handling: 0.82, nitro: 1.2,
  },
  {
    id: 'aurora', name: 'AURORA', tagline: 'Concept hypercar with neon side skirts',
    style: 'concept', color: 0x5a16c9, accent: 0xff2bd6, caliper: 0xff2bd6,
    maxSpeed: 340, accel: 1.0, handling: 1.0, nitro: 1.08,
  },
  {
    id: 'rally', name: 'RALLY ZX', tagline: 'Raised rally machine with a roof light bar',
    style: 'rally', color: 0xd4d8df, accent: 0x00ff9c, caliper: 0x00ff9c, stripe: 0x00c97a,
    maxSpeed: 262, accel: 1.12, handling: 1.35, nitro: 0.92,
  },
  {
    id: 'shadow', name: 'SHADOW 9', tagline: 'Matte stealth racer — fast and quiet',
    style: 'stealth', color: 0x14161b, accent: 0xff2033, caliper: 0xff2033, matte: true,
    maxSpeed: 318, accel: 1.06, handling: 1.12, nitro: 1.1,
  },
];

export const PLAYER_MASS = 1.6;   // tonnes
export const GRAVITY = 9.81;
export const MAX_ALTITUDE = 18;
// Fixed obstacles in the air (only matter for the flying car)
export const GANTRY_Y = [7.75, 8.65];
export const LAMP_ARM_Y = [8.7, 9.2];
export const LAMP_ARM_X = 6.3;    // lamp arms reach over the road beyond this |x|

export const STORAGE = { best: 'sr3d_best', car: 'sr3d_car', muted: 'sr3d_muted', tilt: 'sr3d_tilt' };

export function storageGet(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

export function storageSet(key, value) {
  try { localStorage.setItem(key, String(value)); } catch (e) { /* storage unavailable */ }
}
