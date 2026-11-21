# STREET RACING 3D

Endless night-city highway racer built with HTML, CSS, JavaScript and Three.js r160.
Runs in any modern browser and builds into an Android APK with Capacitor + GitHub Actions.
Everything (Three.js, fonts) is bundled in `www/`, so the game and the APK work offline.

## Play in the browser
ES modules need a local web server (opening `index.html` directly won't work):

    python3 -m http.server 8765 -d www

then open http://localhost:8765

## Build the Android APK (GitHub Actions)
1. Push this folder to a GitHub repository (branch `main` or `master`).
2. The workflow `.github/workflows/android-apk.yml` runs automatically
   (or start it by hand: **Actions → Build Android APK → Run workflow**).
3. When it finishes, open the run and download the **StreetRacing3D-apk** artifact.
   It contains `StreetRacing3D-debug.apk` — install it on a phone
   (allow "install unknown apps" for your file manager / browser).
4. Push a tag like `v1.0.0` to also attach the APK to a GitHub Release.

Optional signed release APK: add these repository secrets and the workflow builds
`StreetRacing3D-release.apk` too:

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | your `.jks` keystore, base64-encoded (`base64 -i my.jks`) |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_ALIAS` | key alias |
| `ANDROID_KEY_PASSWORD` | key password |

Build locally instead (needs Node 18+, JDK 17 and the Android SDK):

    npm install
    npx cap add android && node scripts/patch-android.mjs
    npx cap sync android
    cd android && ./gradlew assembleDebug

The Android app runs full screen (system bars hidden), keeps the screen on, has a neon
launcher icon, and the Android back button pauses / goes back / exits.

## Controls
| Action | Keyboard | Phone |
| --- | --- | --- |
| Accelerate / brake | W ↑ / S ↓ | GAS / BRAKE |
| Steer | A D ← → | ◀ ▶ or **tilt** (toggle *STEER: TILT* in the menu or pause screen) |
| Nitro | Space | N₂O |
| Fly up / down (AERO ION) | E / Q (Shift / Ctrl) | ▲ ▼ |
| Pause / mute | P or Esc / M | ❚❚ / ♪, Android back button |

## Features
- 8 cars, including the flying **AERO ION** (wheels fold into hover discs).
- An **AI rival** races the same traffic: it scans every lane, picks the most open one,
  only changes lanes when the path is clear and saves nitro for open road.
  The HUD shows the gap; overtaking it is worth +1000 points.
- Realistic powertrain (`www/js/physics.js`): traction-limited launch, power-limited
  acceleration, v² aero drag, 6-speed automatic gearbox with shift cuts, ≈1 g brakes.
  Every car reaches exactly its listed top speed (e.g. VOLT GT: 0–100 km/h 3.3 s,
  0–200 km/h 9.2 s, 100–0 km/h in 34 m). The AI rival uses the same model.
- Ground and flying traffic, spring/damper suspension, tyre grip, aero drag,
  momentum-based bumps and rigid-body crashes with gravity.
- Adaptive resolution that targets the display's refresh rate (60/120/144 Hz).

## Code layout
- `www/index.html` – screens, HUD, import map (local Three.js)
- `www/css/style.css` – UI theme, phone portrait/landscape layouts
- `www/js/main.js` – renderer, game state machine, player physics, collisions
- `www/js/rival.js` – AI rival driver
- `www/js/traffic.js` – ground + air traffic, following, lane changes, wreck physics
- `www/js/carModels.js` – procedural sports cars, traffic and hover vehicles
- `www/js/world.js` – road, city, lamps (with real lights), gantries, sky
- `www/js/audio.js` – synthesized engine / EV hum / SFX / synthwave music
- `www/js/input.js` – keyboard, touch buttons, tilt steering
- `www/js/ui.js`, `www/js/effects.js`, `www/js/config.js`
- `www/lib/three/` – Three.js r160 (MIT), `www/fonts/` – Orbitron & Rajdhani (OFL)
- `capacitor.config.json`, `package.json`, `scripts/patch-android.mjs`,
  `android-template/` – Android packaging
