import http from 'node:http';
import { writeFileSync } from 'node:fs';
const dir = process.argv[2];
http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.end(); return; }
  const name = new URL(req.url, 'http://x').searchParams.get('name');
  if (!/^[a-z0-9._-]+$/i.test(name ?? '')) { res.statusCode = 400; res.end('bad'); return; }
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => { writeFileSync(dir + '/' + name, Buffer.concat(chunks)); console.log('saved', name); res.end('ok'); });
}).listen(8799, '127.0.0.1');
