const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT       = 3000;
const STATIC_DIR = __dirname;
const DATA_DIR   = path.join(__dirname, 'data');
const QUOTES_FILE     = path.join(DATA_DIR, 'quotes.json');
const CUSTOMERS_FILE  = path.join(DATA_DIR, 'customers.json');
const SETTINGS_FILE   = path.join(DATA_DIR, 'settings.json');

// Ensure data dir + files exist
if (!fs.existsSync(DATA_DIR))       fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(QUOTES_FILE))    fs.writeFileSync(QUOTES_FILE,    '[]', 'utf8');
if (!fs.existsSync(CUSTOMERS_FILE)) fs.writeFileSync(CUSTOMERS_FILE, '[]', 'utf8');
if (!fs.existsSync(SETTINGS_FILE))  fs.writeFileSync(SETTINGS_FILE,  '{}', 'utf8');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
};

http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // ── GET /api/quotes ──────────────────────────────────────────
  if (req.method === 'GET' && url.pathname === '/api/quotes') {
    try {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(fs.readFileSync(QUOTES_FILE, 'utf8'));
    } catch (e) {
      res.writeHead(500); res.end('[]');
    }
    return;
  }

  // ── POST /api/quotes ─────────────────────────────────────────
  if (req.method === 'POST' && url.pathname === '/api/quotes') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        JSON.parse(body); // validate before writing
        fs.writeFileSync(QUOTES_FILE, body, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      } catch (e) {
        res.writeHead(400); res.end('{"error":"Invalid JSON"}');
      }
    });
    return;
  }

  // ── GET /api/settings ────────────────────────────────────────
  if (req.method === 'GET' && url.pathname === '/api/settings') {
    try {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    } catch (e) {
      res.writeHead(500); res.end('{}');
    }
    return;
  }

  // ── POST /api/settings ───────────────────────────────────────
  if (req.method === 'POST' && url.pathname === '/api/settings') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        JSON.parse(body);
        fs.writeFileSync(SETTINGS_FILE, body, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      } catch (e) {
        res.writeHead(400); res.end('{"error":"Invalid JSON"}');
      }
    });
    return;
  }

  // ── GET /api/customers ───────────────────────────────────────
  if (req.method === 'GET' && url.pathname === '/api/customers') {
    try {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(fs.readFileSync(CUSTOMERS_FILE, 'utf8'));
    } catch (e) {
      res.writeHead(500); res.end('[]');
    }
    return;
  }

  // ── POST /api/customers ──────────────────────────────────────
  if (req.method === 'POST' && url.pathname === '/api/customers') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        JSON.parse(body);
        fs.writeFileSync(CUSTOMERS_FILE, body, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      } catch (e) {
        res.writeHead(400); res.end('{"error":"Invalid JSON"}');
      }
    });
    return;
  }

  // ── Static files ─────────────────────────────────────────────
  let filePath = url.pathname === '/' ? '/LNL3D_Quote.html' : url.pathname;
  filePath = path.normalize(path.join(STATIC_DIR, filePath));

  // Prevent directory traversal
  if (!filePath.startsWith(STATIC_DIR + path.sep) && filePath !== STATIC_DIR) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  } catch (e) {
    res.writeHead(404); res.end('Not found');
  }

}).listen(PORT, () => console.log(`LNL3D Quote server → http://localhost:${PORT}`));
