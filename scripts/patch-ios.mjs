// Runs after `npx cap add ios`. Applies game-specific iOS tweaks:
//  - full screen, hidden status bar, all orientations (Info.plist)
//  - keeps the screen awake while playing (AppDelegate)
//  - local-network permission text (needed for Wi-Fi multiplayer)
//  - neon app icon (Assets.xcassets/AppIcon.appiconset)
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const app = join(root, 'ios', 'App', 'App');
if (!existsSync(app)) {
  console.error('ios/ not found — run `npx cap add ios` first');
  process.exit(1);
}

// ---- Info.plist
const plistPath = join(app, 'Info.plist');
let plist = readFileSync(plistPath, 'utf8');
function setKey(key, valueXml) {
  const re = new RegExp(`\\s*<key>${key}</key>\\s*(<true\\s*/>|<false\\s*/>|<string>[\\s\\S]*?</string>|<array>[\\s\\S]*?</array>|<dict>[\\s\\S]*?</dict>)`);
  plist = plist.replace(re, '');
  const end = plist.lastIndexOf('</dict>');
  plist = `${plist.slice(0, end)}\t<key>${key}</key>\n\t${valueXml}\n${plist.slice(end)}`;
}
setKey('UIStatusBarHidden', '<true/>');
setKey('UIViewControllerBasedStatusBarAppearance', '<false/>');
setKey('UIRequiresFullScreen', '<true/>');
// landscape only (both directions) on iPhone and iPad
const orientations = '<array>\n\t\t<string>UIInterfaceOrientationLandscapeLeft</string>\n\t\t<string>UIInterfaceOrientationLandscapeRight</string>\n\t</array>';
setKey('UISupportedInterfaceOrientations', orientations);
setKey('UISupportedInterfaceOrientations~ipad', orientations);
setKey('NSLocalNetworkUsageDescription', '<string>Street Racing 3D connects to other players on your Wi-Fi for multiplayer races.</string>');
setKey('NSMotionUsageDescription', '<string>Tilt your phone to steer the car.</string>');
// allow plain ws:// / http:// to the multiplayer server on the local Wi-Fi
setKey('NSAppTransportSecurity', '<dict>\n\t\t<key>NSAllowsLocalNetworking</key>\n\t\t<true/>\n\t\t<key>NSAllowsArbitraryLoads</key>\n\t\t<true/>\n\t</dict>');
writeFileSync(plistPath, plist);

// ---- AppDelegate: keep the screen on
const delegatePath = join(app, 'AppDelegate.swift');
let delegate = readFileSync(delegatePath, 'utf8');
if (!delegate.includes('isIdleTimerDisabled')) {
  delegate = delegate.replace(/(didFinishLaunchingWithOptions[^{]*\{)/, '$1\n        UIApplication.shared.isIdleTimerDisabled = true');
  writeFileSync(delegatePath, delegate);
}

// ---- App icon (single 1024×1024 universal icon)
const iconDir = join(app, 'Assets.xcassets', 'AppIcon.appiconset');
const contentsPath = join(iconDir, 'Contents.json');
const contents = JSON.parse(readFileSync(contentsPath, 'utf8'));
let placed = false;
for (const img of contents.images || []) {
  if (img.size === '1024x1024') {
    img.filename = img.filename || 'AppIcon-1024.png';
    copyFileSync(join(root, 'ios-template', 'AppIcon-1024.png'), join(iconDir, img.filename));
    placed = true;
  }
}
if (!placed) {
  contents.images = [{ filename: 'AppIcon-1024.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }];
  copyFileSync(join(root, 'ios-template', 'AppIcon-1024.png'), join(iconDir, 'AppIcon-1024.png'));
}
writeFileSync(contentsPath, JSON.stringify(contents, null, 2));

console.log('iOS project patched for Street Racing 3D');
