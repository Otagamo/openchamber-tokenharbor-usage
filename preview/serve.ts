// Throwaway static server for the preview harness: localhost only, one folder.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

createServer(async (req, res) => {
  const requested = (req.url ?? '/').split('?')[0] ?? '/';
  const file = resolve(join(dir, requested === '/' ? 'index.html' : requested.replace(/^\/+/, '')));
  if (file !== dir && !file.startsWith(dir + sep)) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
}).listen(8791, '127.0.0.1', () => process.stdout.write('preview on http://127.0.0.1:8791/\n'));
