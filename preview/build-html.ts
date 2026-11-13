// Builds `index.html` next to this file from the shipped panel page, pointing it
// at the preview bundle instead of the panel bundle. Keeps the CSS under review
// byte-identical to the one that ships.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(here, '..', 'panel', 'index.html'), 'utf8');
const marker = 'src="main.js"';
if (!html.includes(marker)) throw new Error('panel/index.html no longer loads main.js');

const out = join(here, 'index.html');
await writeFile(out, html.replace(marker, 'src="preview.js"'), 'utf8');
process.stdout.write(`wrote ${out}\n`);
