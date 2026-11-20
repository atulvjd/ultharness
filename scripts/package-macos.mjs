import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync, chmodSync, existsSync, readdirSync, lstatSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
if (process.platform !== 'darwin') throw new Error('Build the disk image on macOS with Xcode Command Line Tools installed.');
if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Packaging requires Node.js 24 or later.');
const outputOption = process.argv.indexOf('--out');
const output = path.resolve(outputOption >= 0 ? process.argv[outputOption + 1] : path.join(root, 'dist'));
if ([root, os.homedir(), '/'].includes(output)) throw new Error('Choose a dedicated build output directory.');
const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'x86_64' : null;
if (!arch) throw new Error('Only Apple Silicon and Intel macOS runtimes are supported.');
const minimum = '14.0';
const node = process.execPath;
const license = path.resolve(node, '../../LICENSE');
const npmRoot = path.resolve(node, '../../lib/node_modules/npm');
if (!existsSync(path.join(npmRoot, 'bin/npm-cli.js'))) throw new Error('npm is required beside the official Node installation to bundle project verification tools.');
const npmVersion = JSON.parse(readFileSync(path.join(npmRoot, 'package.json'), 'utf8')).version;
if (!existsSync(license)) throw new Error('Node runtime LICENSE not found next to its installation. Use an official Node distribution.');
const work = mkdtempSync(path.join(os.tmpdir(), 'ultharness-macos-build-'));
const app = path.join(output, 'Ultharness.app');
const contents = path.join(app, 'Contents');
const resources = path.join(contents, 'Resources');
const run = (command, args, env = {}) => {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });
  if (result.status !== 0) throw new Error(`${command} failed (${result.status ?? result.error?.message})`);
};
try {
  mkdirSync(output, { recursive: true });
  rmSync(app, { recursive: true, force: true });
  for (const dir of ['MacOS', 'Resources/app/public', 'Resources/app/desktop', 'Resources/app/scripts', 'Resources/runtime', 'Resources/licenses']) mkdirSync(path.join(contents, dir), { recursive: true });
  for (const file of ['server.mjs', 'preview.mjs', 'delivery.mjs', 'routing.mjs', 'package.json', 'README.md', 'public/index.html', 'public/app.js', 'public/style.css', 'desktop/server-entry.mjs', 'scripts/aim.mjs']) {
    cpSync(path.join(root, file), path.join(resources, 'app', file));
  }
  cpSync(node, path.join(resources, 'runtime/node'));
  chmodSync(path.join(resources, 'runtime/node'), 0o755);
  cpSync(npmRoot, path.join(resources, 'runtime/lib/node_modules/npm'), { recursive: true });
  symlinkSync('lib/node_modules/npm/bin/npm-cli.js', path.join(resources, 'runtime/npm'));
  symlinkSync('lib/node_modules/npm/bin/npx-cli.js', path.join(resources, 'runtime/npx'));
  cpSync(license, path.join(resources, 'licenses/Node-LICENSE.txt'));
  writeFileSync(path.join(contents, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>Ultharness</string>
<key>CFBundleDisplayName</key><string>Ultharness</string>
<key>CFBundleIdentifier</key><string>local.ultharness.desktop</string>
<key>CFBundleExecutable</key><string>Ultharness</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>${pkg.version}</string>
<key>CFBundleVersion</key><string>${pkg.version}</string>
<key>CFBundleIconFile</key><string>Ultharness.icns</string>
<key>LSMinimumSystemVersion</key><string>${minimum}</string>
<key>NSHighResolutionCapable</key><true/>
<key>NSPrincipalClass</key><string>NSApplication</string>
<key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
<key>NSHumanReadableCopyright</key><string>Ultharness</string>
</dict></plist>`);
  writeFileSync(path.join(contents, 'PkgInfo'), 'APPL????');
  const cache = path.join(work, 'module-cache'); mkdirSync(cache);
  console.log('Compiling native macOS window…');
  run('/usr/bin/xcrun', ['swiftc', '-parse-as-library', '-swift-version', '5', '-O', '-target', `${arch}-apple-macosx${minimum}`, '-module-cache-path', cache, '-framework', 'AppKit', '-framework', 'WebKit', path.join(root, 'desktop/Ultharness.swift'), '-o', path.join(contents, 'MacOS/Ultharness')]);
  const iconset = path.join(work, 'Ultharness.iconset');
  run('/usr/bin/xcrun', ['swift', '-module-cache-path', cache, path.join(root, 'desktop/make-icon.swift'), iconset]);
  run('/usr/bin/iconutil', ['-c', 'icns', iconset, '-o', path.join(resources, 'Ultharness.icns')]);
  // Leave the official Node binary's signature and JIT entitlements intact.
  run('/usr/bin/codesign', ['--force', '--sign', '-', app]);
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
  run(path.join(resources, 'runtime/node'), ['--version']);
  run(path.join(resources, 'runtime/node'), [path.join(resources, 'runtime/lib/node_modules/npm/bin/npm-cli.js'), '--version']);
  const forbidden = [];
  function check(dir) {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (name === '.env' || name.startsWith('.env.') || name === '.ultharness' || /\.(sqlite|sqlite-wal|sqlite-shm|log)$/.test(name)) forbidden.push(full);
      if (lstatSync(full).isDirectory()) check(full);
    }
  }
  check(app);
  if (forbidden.length) throw new Error('Private runtime data appeared in the package.');
  const image = path.join(work, 'image'); mkdirSync(image);
  run('/usr/bin/ditto', [app, path.join(image, 'Ultharness.app')]);
  symlinkSync('/Applications', path.join(image, 'Applications'));
  cpSync(path.join(root, 'desktop/INSTALL.txt'), path.join(image, 'Read Me.txt'));
  const name = `Ultharness-${pkg.version}-${process.arch === 'arm64' ? 'arm64' : 'x64'}.dmg`;
  const dmg = path.join(output, name);
  console.log('Creating drag-to-Applications disk image…');
  run('/usr/bin/hdiutil', ['create', '-volname', 'Ultharness', '-srcfolder', image, '-format', 'UDZO', '-imagekey', 'zlib-level=9', '-ov', dmg]);
  run('/usr/bin/hdiutil', ['verify', dmg]);
  const sha256 = createHash('sha256').update(readFileSync(dmg)).digest('hex');
  writeFileSync(`${dmg}.sha256`, `${sha256}  ${name}\n`);
  writeFileSync(path.join(output, 'build-info.json'), JSON.stringify({ version: pkg.version, architecture: arch, minimumMacOS: minimum, bundledNode: process.version, bundledNpm: npmVersion, signing: 'ad-hoc (not notarized)', privateDataIncluded: false, sha256, builtAt: new Date().toISOString() }, null, 2) + '\n');
  console.log(`Created ${dmg}`);
} finally { rmSync(work, { recursive: true, force: true }); }
