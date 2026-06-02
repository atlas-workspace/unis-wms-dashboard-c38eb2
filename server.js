const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const PORT = process.env.PORT || 8080;
const ROOT = __dirname;

function send(res, code, body, headers={}) {
  const isBuf = Buffer.isBuffer(body);
  res.writeHead(code, Object.assign({
    'Content-Type': isBuf ? 'application/octet-stream' : 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  }, headers));
  res.end(isBuf ? body : (typeof body === 'string' ? body : JSON.stringify(body)));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data='';
    req.on('data', c => { data += c; if (data.length > 2_000_000) { req.destroy(); reject(new Error('body too large')); } });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
function upstreamJson(method, host, pathname, body, query='') {
  return new Promise((resolve) => {
    const payload = body == null ? null : (typeof body === 'string' ? body : JSON.stringify(body));
    const req = https.request({
      method, host, path: pathname + (query || ''),
      headers: Object.assign({ 'Accept':'application/json' }, payload ? { 'Content-Type':'application/json', 'Content-Length': Buffer.byteLength(payload) } : {})
    }, r => {
      let raw='';
      r.on('data', c => raw += c);
      r.on('end', () => {
        let parsed = null;
        try { parsed = raw ? JSON.parse(raw) : null; } catch(_) {}
        resolve({ status:r.statusCode || 502, headers:r.headers, raw, json:parsed });
      });
    });
    req.on('error', e => resolve({ status:502, json:{success:false,msg:e.message}, raw:'' }));
    if (payload) req.write(payload);
    req.end();
  });
}
function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  return ({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.ico':'image/x-icon'}[ext] || 'application/octet-stream');
}
async function handleApi(req, res, url) {
  try {
    if (req.method === 'POST' && url.pathname === '/api/proxy/auth/password-grant') {
      const raw = await readBody(req);
      const out = await upstreamJson('POST', 'atlas.item.com', '/api/auth/password-grant', raw);
      return send(res, out.status, out.json || out.raw || {success:false,msg:'empty upstream response'});
    }
    if (req.method === 'POST' && url.pathname === '/api/proxy/auth/refresh') {
      const raw = await readBody(req);
      const out = await upstreamJson('POST', 'atlas.item.com', '/api/auth/refresh', raw);
      return send(res, out.status, out.json || out.raw || {success:false,msg:'empty upstream response'});
    }
    return send(res, 404, {success:false,msg:'Unknown API route'});
  } catch (e) {
    return send(res, 500, {success:false,msg:e.message});
  }
}
const server = http.createServer((req,res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/proxy/')) return handleApi(req,res,url);
  let file = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  file = path.normalize(file).replace(/^([/\\])+/, '');
  const full = path.join(ROOT, file);
  if (!full.startsWith(ROOT)) return send(res, 403, 'Forbidden', {'Content-Type':'text/plain'});
  fs.readFile(full, (err, data) => {
    if (err) return send(res, 404, 'Not found', {'Content-Type':'text/plain'});
    res.writeHead(200, {'Content-Type': contentType(full), 'Cache-Control':'no-store'});
    res.end(data);
  });
});
server.listen(PORT, () => console.log(`UNIS WMS dashboard server listening on ${PORT}`));
