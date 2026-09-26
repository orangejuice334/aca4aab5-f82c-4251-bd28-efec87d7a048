#!/usr/bin/env node
// Minimal static file server for the end-to-end suite: serves the tracker/
// folder so the scenarios exercise the working-tree track.html (not the
// deployed Pages copy). Started by playwright.config.mjs `webServer`.
//
// Usage: node e2e/support/static-server.mjs [port]

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const trackerRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const port = Number(process.argv[2] || process.env.E2E_PORT || 4173);

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

const server = createServer(async (request, response) => {
  try {
    const requestPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const relativePath = requestPath === '/' ? 'track.html' : requestPath.replace(/^\/+/, '');
    const filePath = normalize(join(trackerRoot, relativePath));
    if (!filePath.startsWith(trackerRoot + sep) && filePath !== trackerRoot) {
      response.writeHead(403).end('forbidden');
      return;
    }
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      response.writeHead(404).end('not found');
      return;
    }
    const body = await readFile(filePath);
    response.writeHead(200, {
      'Content-Type': contentTypes[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    response.end(body);
  } catch (error) {
    response.writeHead(404).end('not found');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`tracker static server on http://127.0.0.1:${port}/ serving ${trackerRoot}`);
});
