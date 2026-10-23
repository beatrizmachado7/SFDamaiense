// Servidor estático mínimo para testes (equivalente ao Netlify: pasta site/, index.html por pasta).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const ROOT = new URL('../site/', import.meta.url).pathname;
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.json': 'application/json', '.pdf': 'application/pdf' };
const port = +process.env.PORT || 8888;
const youtube = (await import('../netlify/functions/youtube.mjs')).default; // igual ao Netlify: /api/youtube
createServer(async (req, res) => {
  let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  if (p === '/api/youtube') { const r = await youtube(); res.writeHead(r.status, Object.fromEntries(r.headers)); return res.end(await r.text()); }
  if (p === '/admin') { res.writeHead(301, { Location: '/admin/' }); return res.end(); }
  let f = join(ROOT, p);
  try { if ((await stat(f)).isDirectory()) f = join(f, 'index.html'); const b = await readFile(f); res.writeHead(200, { 'Content-Type': T[extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(b); }
  catch { res.writeHead(404); res.end('404'); }
}).listen(port, '127.0.0.1', () => console.log('a servir site/ em http://127.0.0.1:' + port));
