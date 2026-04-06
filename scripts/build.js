#!/usr/bin/env node
/**
 * Build script: compiles TypeScript host code and copies extension files.
 *
 * Output:
 *   dist/host/     — compiled MCP server + bridge (Node.js)
 *   dist/extension/ — Chrome extension files (load unpacked from here)
 */

import { execSync } from 'child_process';
import { cpSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

console.log('Building Chrome Like a Human...\n');

// Step 1: Compile TypeScript (host + shared)
console.log('1. Compiling TypeScript...');
try {
  execSync('npx tsc', { cwd: root, stdio: 'inherit' });
  console.log('   ✓ TypeScript compiled to dist/host/\n');
} catch {
  console.error('   ✗ TypeScript compilation failed');
  process.exit(1);
}

// Step 2: Copy extension files
console.log('2. Copying extension files...');
const extSrc = join(root, 'src', 'extension');
const extDist = join(root, 'dist', 'extension');

mkdirSync(extDist, { recursive: true });

const extensionFiles = ['manifest.json', 'background.js', 'content.js', 'network-capture.js', 'console-capture.js'];
for (const file of extensionFiles) {
  const src = join(extSrc, file);
  const dest = join(extDist, file);
  if (existsSync(src)) {
    cpSync(src, dest);
    console.log(`   ✓ ${file}`);
  } else {
    console.warn(`   ⚠ ${file} not found`);
  }
}

console.log(`\n✓ Build complete!\n`);
console.log('Next steps:');
console.log('  1. Load extension: chrome://extensions → Load unpacked → select dist/extension/');
console.log('  2. Copy extension ID from chrome://extensions');
console.log('  3. Run: node scripts/install.js <extension-id>');
console.log('  4. Add MCP config to Claude Desktop/Code');
