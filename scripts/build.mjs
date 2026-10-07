import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const outfile = resolve(root, 'public/app.js');

await build({
  entryPoints: [resolve(root, 'src/app.js')],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  minify: true,
  outfile
});

// esbuild preserves whitespace at the ends of multiline HTML template lines.
// Trimming it keeps the checked-in generated bundle clean without changing markup.
const bundle = await readFile(outfile, 'utf8');
await writeFile(outfile, bundle.replace(/[\t ]+$/gm, ''), 'utf8');
