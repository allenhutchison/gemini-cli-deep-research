import * as esbuild from 'esbuild';
import { rm } from 'fs/promises';
import { readFileSync } from 'fs';

// Read version from package.json for build-time injection
const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));

// Clean dist directory to avoid stale artifacts
await rm('dist', { recursive: true, force: true });

try {
  await esbuild.build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    platform: 'node',
    target: 'node20',
    outfile: 'dist/index.js',
    format: 'esm',
    sourcemap: true,
    minify: false, // Keep readable for debugging
    define: {
      PKG_VERSION: JSON.stringify(pkg.version),
    },
    banner: {
      // Fix for __dirname/__filename in ESM
      js: `
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
      `.trim(),
    },
  });
  console.log('Build complete: dist/index.js');
} catch (error) {
  console.error('Build failed:', error.message);
  process.exit(1);
}
