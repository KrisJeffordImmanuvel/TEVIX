'use strict';

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const MAX_BODY_BYTES = 16 * 1024;

const YEARS = ['', '1st year', '2nd year', '3rd year', '4th year'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json'
};

// ---------- Storage ----------

let db = { interestCount: 0, applications: [] };
let writeQueue = Promise.resolve();

function loadDb() {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    db = {
      interestCount: Number(parsed.interestCount) || 0,
      applications: Array.isArray(parsed.applications) ? parsed.applications : []
    };
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(`Could not read ${DB_FILE}, starting empty:`, err.message);
    }
  }
}

// Writes are serialised and atomic (write to temp file, then rename).
function saveDb() {
  const snapshot = JSON.stringify(db, null, 2);
  writeQueue = writeQueue
    .catch(() => {})
    .then(async () => {
      await fsp.mkdir(DATA_DIR, { recursive: true });
      const tmp = `${DB_FILE}.${process.pid}.tmp`;
      await fsp.writeFile(tmp, snapshot);
      await fsp.rename(tmp, DB_FILE);
    });
  return writeQueue;
}

// ---------- Helpers ----------

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request body too large.'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('Invalid JSON.'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function str(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function validateApplication(body) {
  const app = {
    name: str(body.name, 100),
    email: str(body.email, 254),
    year: str(body.year, 20),
    message: str(body.message, 2000)
  };
  if (!app.name) return { error: 'Please enter your name.' };
  if (!EMAIL_RE.test(app.email)) return { error: 'Please enter a valid email address.' };
  if (!YEARS.includes(app.year)) return { error: 'Please choose a valid year of study.' };
  return { app };
}

function isAdmin(req) {
  if (!ADMIN_TOKEN) return false;
  const header = req.headers.authorization || '';
  const given = Buffer.from(header.replace(/^Bearer\s+/i, ''));
  const expected = Buffer.from(ADMIN_TOKEN);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

// ---------- API ----------

async function handleApi(req, res, pathname) {
  if (pathname === '/api/health' && req.method === 'GET') {
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/interest') {
    if (req.method === 'GET') {
      return sendJson(res, 200, { count: db.interestCount });
    }
    if (req.method === 'POST') {
      db.interestCount += 1;
      await saveDb();
      return sendJson(res, 200, { count: db.interestCount });
    }
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  if (pathname === '/api/applications') {
    if (req.method === 'POST') {
      const { app, error } = validateApplication(await readJsonBody(req));
      if (error) return sendJson(res, 400, { error });

      const duplicate = db.applications.some(
        (a) => a.email.toLowerCase() === app.email.toLowerCase()
      );
      if (duplicate) {
        return sendJson(res, 409, { error: 'An application with this email has already been received.' });
      }

      const record = { id: crypto.randomUUID(), ...app, createdAt: new Date().toISOString() };
      db.applications.push(record);
      await saveDb();
      return sendJson(res, 201, { id: record.id });
    }
    if (req.method === 'GET') {
      if (!isAdmin(req)) return sendJson(res, 401, { error: 'Unauthorized.' });
      return sendJson(res, 200, { applications: db.applications });
    }
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  return sendJson(res, 404, { error: 'Not found.' });
}

// ---------- Static files ----------

async function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end();
  }

  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    res.writeHead(400);
    return res.end('Bad request');
  }

  let filePath = path.normalize(path.join(PUBLIC_DIR, decoded));
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  try {
    let stat = await fsp.stat(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
      stat = await fsp.stat(filePath);
    }
    const type = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': stat.size,
      'Cache-Control': type.startsWith('text/html') ? 'no-cache' : 'public, max-age=3600'
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

// ---------- Server ----------

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');

  let pathname;
  try {
    pathname = new URL(req.url, 'http://localhost').pathname;
  } catch {
    res.writeHead(400);
    return res.end('Bad request');
  }

  try {
    if (pathname.startsWith('/api/')) {
      await handleApi(req, res, pathname);
    } else {
      await serveStatic(req, res, pathname);
    }
  } catch (err) {
    const status = err.status || 500;
    if (status === 500) console.error(err);
    if (!res.headersSent) {
      sendJson(res, status, { error: status === 500 ? 'Internal server error.' : err.message });
    } else {
      res.end();
    }
  }
});

loadDb();

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`IEEE TEMS web app running at http://localhost:${PORT}`);
  });
}

module.exports = { server };
