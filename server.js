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
      let body;
      try { body = JSON.parse(raw); } catch(_) { body = {}; }
      const iamPayload = JSON.stringify({grant_type:'password', username: body.username || '', password: body.password || ''});
      const out = await upstreamJson('POST', 'id.item.com', '/auth/exchange-token', iamPayload);
      if (out.json && String(out.json.code) === '0' && out.json.data) {
        return send(res, 200, out.json);
      }
      const out2 = await upstreamJson('POST', 'atlas.item.com', '/api/auth/password-grant', raw);
      if (out2.status < 500 && out2.json) {
        return send(res, out2.status, out2.json);
      }
      return send(res, out.status || 401, out.json || {success:false, msg: 'Authentication failed. Please check your credentials.'});
    }
    if (req.method === 'POST' && url.pathname === '/api/proxy/auth/refresh') {
      const raw = await readBody(req);
      let body;
      try { body = JSON.parse(raw); } catch(_) { body = {}; }
      const rt = body.refreshToken || body.refresh_token || '';
      const iamPayload = JSON.stringify({grant_type:'refresh_token', refresh_token: rt});
      const out = await upstreamJson('POST', 'id.item.com', '/auth/exchange-token', iamPayload);
      if (out.json && String(out.json.code) === '0' && out.json.data) {
        return send(res, 200, out.json);
      }
      const out2 = await upstreamJson('POST', 'atlas.item.com', '/api/auth/refresh', raw);
      return send(res, out2.status, out2.json || out2.raw || {success:false,msg:'Refresh failed'});
    }
    // Ticket API proxy — routed under /api/proxy/auth/ prefix so Coolify nginx forwards them
    if (url.pathname.startsWith('/api/proxy/auth/ticket/')) {
      const raw = await readBody(req);
      const ticketPath = url.pathname.replace('/api/proxy/auth/ticket', '');
      const authHeader = req.headers['authorization'] || '';
      console.log('[ticket-proxy] IAM →', req.method, '/v1/iam' + ticketPath);
      const out = await upstreamJsonWithAuth(req.method, 'unisticket.item.com', '/v1/iam' + ticketPath, raw, authHeader);
      console.log('[ticket-proxy] response:', out.status, (out.json && out.json.msg) || '');
      return send(res, out.status, out.json || out.raw || {success:false,msg:'No response from ticket service'});
    }
    if (url.pathname.startsWith('/api/proxy/auth/ticket-staff/')) {
      const raw = await readBody(req);
      const staffPath = url.pathname.replace('/api/proxy/auth/ticket-staff', '');
      const authHeader = req.headers['authorization'] || '';
      console.log('[ticket-proxy] Staff →', req.method, '/v1/staff' + staffPath);
      const out = await upstreamJsonWithAuth(req.method, 'unisticket.item.com', '/v1/staff' + staffPath, raw, authHeader);
      console.log('[ticket-proxy] response:', out.status);
      return send(res, out.status, out.json || out.raw || {success:false,msg:'No response from ticket service'});
    }
    if (url.pathname.startsWith('/api/proxy/auth/ticket-open/')) {
      const raw = await readBody(req);
      const openPath = url.pathname.replace('/api/proxy/auth/ticket-open', '');
      const authHeader = req.headers['authorization'] || '';
      console.log('[ticket-proxy] Open →', req.method, '/v1/open' + openPath);
      const out = await upstreamJsonWithAuth(req.method, 'unisticket.item.com', '/v1/open' + openPath, raw, authHeader);
      console.log('[ticket-proxy] response:', out.status);
      return send(res, out.status, out.json || out.raw || {success:false,msg:'No response from ticket service'});
    }
    return send(res, 404, {success:false,msg:'Unknown API route'});
  } catch (e) {
    return send(res, 500, {success:false,msg:e.message});
  }
}
function upstreamJsonWithAuth(method, host, pathname, body, authHeader) {
  return new Promise((resolve) => {
    const payload = body == null || body === '' ? null : (typeof body === 'string' ? body : JSON.stringify(body));
    const hdrs = { 'Accept':'application/json', 'User-Agent':'UNIS-WMS-Dashboard/1.0', 'X-Tenant-Id':'LT' };
    if (payload) { hdrs['Content-Type'] = 'application/json'; hdrs['Content-Length'] = Buffer.byteLength(payload); }
    if (authHeader) {
      hdrs['Authorization'] = authHeader;
    } else {
      console.warn('[ticket-proxy] WARNING: No Authorization header provided for', method, pathname);
    }
    if (process.env.TICKET_API_KEY) hdrs['x-api-key'] = process.env.TICKET_API_KEY;
    console.log('[ticket-proxy] upstream:', method, host, pathname, 'auth:', !!authHeader, 'apiKey:', !!process.env.TICKET_API_KEY);
    const req = https.request({ method, host, path: pathname, headers: hdrs }, r => {
      let raw='';
      r.on('data', c => raw += c);
      r.on('end', () => {
        let parsed = null;
        try { parsed = raw ? JSON.parse(raw) : null; } catch(_) {}
        if (r.statusCode >= 400) {
          console.error('[ticket-proxy] Upstream error:', method, pathname, 'status:', r.statusCode, 'msg:', parsed && (parsed.msg || parsed.message) || raw.slice(0, 200));
        }
        resolve({ status: r.statusCode || 502, headers: r.headers, raw, json: parsed });
      });
    });
    req.on('error', e => {
      console.error('[ticket-proxy] Network error:', method, pathname, e.message);
      resolve({ status:502, json:{success:false, msg:'Ticket service unreachable. Please try again.'}, raw:'' });
    });
    if (payload) req.write(payload);
    req.end();
  });
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
