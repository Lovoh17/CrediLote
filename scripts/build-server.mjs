import { build } from 'esbuild';

await build({
  entryPoints: ['server/production.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: 'dist-server/production.mjs',
  external: [
    '@neondatabase/serverless',
    '@aws-sdk/client-s3',
    'sharp',
    'pdf-lib',
  ],
  banner: {
    js: `
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
`,
  },
});

console.log('✅ Server bundled to dist-server/production.mjs');
