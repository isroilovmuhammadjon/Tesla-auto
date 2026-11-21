// Runs after `npx cap add android`. Applies game-specific Android tweaks:
//  - immersive full-screen MainActivity (hides system bars, keeps screen on)
//  - neon adaptive launcher icon
//  - hardware acceleration
//  - optional release signing driven by environment variables (used by CI)
import { cpSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const app = join(root, 'android', 'app');
if (!existsSync(app)) {
  console.error('android/ not found — run `npx cap add android` first');
  process.exit(1);
}

// 1. MainActivity
const pkgDir = join(app, 'src/main/java/com/streetracing3d/game');
mkdirSync(pkgDir, { recursive: true });
cpSync(join(root, 'android-template/MainActivity.java'), join(pkgDir, 'MainActivity.java'));

// 2. Icon resources (overwrites the default adaptive icon definitions)
cpSync(join(root, 'android-template/res'), join(app, 'src/main/res'), { recursive: true });

// 3. Manifest: hardware acceleration on the application
const manifestPath = join(app, 'src/main/AndroidManifest.xml');
let manifest = readFileSync(manifestPath, 'utf8');
if (!manifest.includes('android:hardwareAccelerated')) {
  manifest = manifest.replace('<application', '<application\n        android:hardwareAccelerated="true"');
}
writeFileSync(manifestPath, manifest);

// 4. Release signing from env vars (KEYSTORE_PATH, KEYSTORE_PASSWORD, KEY_ALIAS, KEY_PASSWORD)
const gradlePath = join(app, 'build.gradle');
let gradle = readFileSync(gradlePath, 'utf8');
if (!gradle.includes('streetRacingRelease')) {
  gradle += `
// --- added by scripts/patch-android.mjs ---
android {
    signingConfigs {
        streetRacingRelease {
            if (System.getenv("KEYSTORE_PATH")) {
                storeFile file(System.getenv("KEYSTORE_PATH"))
                storePassword System.getenv("KEYSTORE_PASSWORD")
                keyAlias System.getenv("KEY_ALIAS")
                keyPassword System.getenv("KEY_PASSWORD")
            }
        }
    }
    buildTypes {
        release {
            if (System.getenv("KEYSTORE_PATH")) {
                signingConfig signingConfigs.streetRacingRelease
            }
        }
    }
}
`;
  writeFileSync(gradlePath, gradle);
}
console.log('Android project patched for Street Racing 3D');
