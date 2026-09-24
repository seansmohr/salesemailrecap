/*
 * Minimal static server for hosting (e.g. Railway). No dependencies.
 * Serves index.html plus the css/ and js/ folders on $PORT.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIRS = ['css', 'js'];
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8'
};

function resolveFile(urlPath) {
  let p;
  try {
    p = decodeURIComponent(urlPath.split('?')[0]);
  } catch (e) {
    return null;
  }
  if (p === '/' || p === '/index.html') return path.join(ROOT, 'index.html');
  const full = path.normalize(path.join(ROOT, p));
  const top = path.relative(ROOT, full).split(path.sep)[0];
  if (!PUBLIC_DIRS.includes(top) || !full.startsWith(ROOT + path.sep)) return null;
  return full;
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end();
  }
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('ok');
  }
  const file = resolveFile(req.url);
  const type = file && TYPES[path.extname(file)];
  if (!type) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Not found');
  }
  fs.readFile(file, (err, body) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    res.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer'
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  });
});

server.listen(PORT, () => {
  console.log('Recap Email Generator listening on port ' + PORT);
});
