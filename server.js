'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const PORT = process.env.PORT || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

const SPA_ROUTES = new Set([
  '/', '/rules', '/purge', '/norm', '/rest', '/games',
  '/game-rules', '/guide', '/tokens', '/anonymous',
  '/updates', '/schedule', '/search'
]);

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': status === 200 && type.startsWith('image/') ? 'public, max-age=86400' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'SAMEORIGIN'
  });
  res.end(body);
}

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const normalized = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  const full = path.join(ROOT, normalized);
  if (!full.startsWith(ROOT)) return null;
  return full;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  let pathname = url.pathname.replace(/\/+$/, '') || '/';

  if (pathname === '/healthz') {
    return send(res, 200, 'ok');
  }

  // API-like JSON endpoints
  if (pathname === '/api/content') {
    try {
      const data = fs.readFileSync(path.join(ROOT, 'content.json'), 'utf8');
      return send(res, 200, data, 'application/json; charset=utf-8');
    } catch {
      return send(res, 500, JSON.stringify({ error: 'content.json unavailable' }), 'application/json');
    }
  }
  if (pathname === '/api/config') {
    try {
      const data = fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8');
      return send(res, 200, data, 'application/json; charset=utf-8');
    } catch {
      return send(res, 500, JSON.stringify({ error: 'config.json unavailable' }), 'application/json');
    }
  }
  if (pathname === '/api/updates') {
    try {
      const data = fs.readFileSync(path.join(ROOT, 'updates.json'), 'utf8');
      return send(res, 200, data, 'application/json; charset=utf-8');
    } catch {
      return send(res, 500, JSON.stringify({ error: 'updates.json unavailable' }), 'application/json');
    }
  }
  if (pathname === '/api/schedule') {
    try {
      const data = fs.readFileSync(path.join(ROOT, 'schedule.json'), 'utf8');
      return send(res, 200, data, 'application/json; charset=utf-8');
    } catch {
      return send(res, 500, JSON.stringify({ error: 'schedule.json unavailable' }), 'application/json');
    }
  }

  // Static files
  let filePath = safePath(pathname);
  if (filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    try {
      return send(res, 200, fs.readFileSync(filePath), type);
    } catch {
      return send(res, 500, 'Read error');
    }
  }

  // SPA fallback for known routes
  if (SPA_ROUTES.has(pathname) || pathname.startsWith('/updates/') || pathname.startsWith('/page/')) {
    const index = path.join(ROOT, 'index.html');
    try {
      return send(res, 200, fs.readFileSync(index), 'text/html; charset=utf-8');
    } catch {
      return send(res, 500, 'index.html missing');
    }
  }

  // 404
  const index = path.join(ROOT, 'index.html');
  if (fs.existsSync(index)) {
    return send(res, 200, fs.readFileSync(index), 'text/html; charset=utf-8');
  }
  send(res, 404, 'Not found');
});

server.listen(PORT, () => {
  console.log(`Justice Faite Portal 2.0 listening on http://localhost:${PORT}`);
});
