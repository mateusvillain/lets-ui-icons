import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

/*
  Serve public/ para o Penpot carregar o plugin:
  http://localhost:4400/manifest.json no Plugin Manager (Ctrl + Alt + P).
*/

const PORT = Number(process.env.PORT) || 4400;
const ROOT = path.resolve(import.meta.dirname, '../public');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

// O Penpot roda em outra origem (penpot.app ou self-hosted)
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Private-Network': 'true',
  'Cache-Control': 'no-store',
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { ...CORS, 'Access-Control-Allow-Headers': '*' });
    return res.end();
  }

  const { pathname } = new URL(req.url, 'http://localhost');
  const file = path.join(ROOT, path.normalize(pathname));

  if (!file.startsWith(ROOT + path.sep)) {
    res.writeHead(403, CORS);
    return res.end();
  }

  try {
    const body = await fs.readFile(file);
    res.writeHead(200, {
      ...CORS,
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
    });
    res.end(body);
  } catch {
    res.writeHead(404, CORS);
    res.end();
  }
});

server.listen(PORT, () => {
  console.log(`\n🔌 Plugin em http://localhost:${PORT}/manifest.json`);
});
