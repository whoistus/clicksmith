#!/usr/bin/env node
/**
 * Package script: zips the built Chrome extension for GitHub Release distribution.
 *
 * Run `npm run package` (which does `npm run build && node scripts/package-extension.js`).
 *
 * Output:
 *   clicksmith-extension-v<version>.zip at repo root
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, statSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
const version = pkg.version;
const zipName = `clicksmith-extension-v${version}.zip`;
const zipPath = join(root, zipName);
const extDist = join(root, 'dist', 'extension');

if (!existsSync(extDist)) {
  console.error(`✗ dist/extension/ not found. Run 'npm run build' first.`);
  process.exit(1);
}

// Sanity: manifest.json must exist and match version
const manifestPath = join(extDist, 'manifest.json');
if (!existsSync(manifestPath)) {
  console.error('✗ manifest.json not found in dist/extension/');
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
if (manifest.version !== version) {
  console.error(`✗ version mismatch: package.json=${version} manifest.json=${manifest.version}`);
  console.error('   Bump both in lockstep, then rebuild.');
  process.exit(1);
}

// Remove any stale zip at the target path
if (existsSync(zipPath)) rmSync(zipPath);

console.log(`Packaging extension v${version}...`);

// Zip from INSIDE dist/extension so the archive has files at top level
// (not nested under dist/extension/) — matches how Chrome expects load-unpacked dirs
try {
  execSync(`zip -r "${zipPath}" .`, { cwd: extDist, stdio: 'inherit' });
} catch {
  console.error('✗ zip failed. Install the `zip` command or use a platform equivalent.');
  process.exit(1);
}

const bytes = statSync(zipPath).size;
const kb = (bytes / 1024).toFixed(1);
console.log(`\n✓ Wrote ${zipName} (${kb} KB)`);
console.log(`   Attach this file to GitHub Release v${version}.`);
