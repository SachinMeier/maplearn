import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeOfflineManifest } from './offline-manifest.mjs';

const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
const files = (await readdir(root)).filter(name =>
  /\.(html|css|js)$/.test(name) && !name.endsWith('.config.js'));

// The app uses native ES modules: validate syntax, then package static files.
for (const name of files.filter(name => name.endsWith('.js'))) {
  execFileSync(process.execPath, ['--check', fileURLToPath(new URL(name, root))], { stdio: 'inherit' });
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const name of [...files, 'assets', 'data', 'title-demo', 'CNAME']) {
  await cp(new URL(name, root), new URL(name, output), {
    recursive: true,
    filter: source => source !== fileURLToPath(new URL('assets/maps/sources', root)),
  });
}
await writeOfflineManifest(output);
await writeFile(new URL('.nojekyll', output), '');
console.log('Static site built in dist/');
