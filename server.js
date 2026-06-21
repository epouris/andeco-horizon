/**
 * Local server for single-file storage (e.g. OneDrive).
 * Serves the app and andeco_data.json; POST /api/save writes the shared JSON file.
 * Run: node server.js   then open http://localhost:3000
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'andeco_data.json');

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2'
};

function readDataFile() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    if (e.code === 'ENOENT') return {};
    throw e;
  }
}

function ensureDataFile() {
  try {
    fs.accessSync(DATA_FILE);
  } catch (e) {
    if (e.code === 'ENOENT') {
      fs.writeFileSync(DATA_FILE, JSON.stringify({
        invoices: [],
        receipts: [],
        clients: [],
        companySettings: {},
        products: [],
        fleet: {
          vessels: [],
          vesselPhotos: [],
          documents: [],
          maintenance: [],
          drydock: [],
          inventory: [],
          logbooks: [],
          crew: []
        },
        crew: {
          crewMembers: [],
          crewDocuments: [],
          crewAssignments: []
        }
      }, null, 2), 'utf8');
    }
  }
}

function writeDataFile(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];

  // POST /api/save — write full state to andeco_data.json
  if (req.method === 'POST' && url === '/api/save') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        writeDataFile(data);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // GET /andeco_data.json — read shared data file
  if (req.method === 'GET' && (url === '/andeco_data.json' || url === '/api/data')) {
    const data = readDataFile();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
    return;
  }

  // Favicon (browsers always request /favicon.ico)
  if (req.method === 'GET' && (url === '/favicon.ico' || url === '/favicon.svg')) {
    const favPath = path.join(__dirname, 'favicon.svg');
    fs.readFile(favPath, (err, content) => {
      if (err) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=86400'
      });
      res.end(content);
    });
    return;
  }

  // Static files
  const filePath = path.join(__dirname, url === '/' ? 'index.html' : url);
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end();
    return;
  }
  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('Not found');
      } else {
        res.writeHead(500);
        res.end('Server error');
      }
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  });
});

ensureDataFile();

server.listen(PORT, () => {
  console.log('Andeco Horizon server running at http://localhost:' + PORT);
  console.log('Single-file data: andeco_data.json (GET /andeco_data.json, POST /api/save)');
});
