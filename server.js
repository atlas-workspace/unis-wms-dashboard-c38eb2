const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const PORT = process.env.PORT || 8080;
const ROOT = __dirname;

// Ticket API configuration — MUST point to the Ticket API server, NOT the UI host.
// unisticket.item.com is the UI/frontend and returns nginx 405 for API paths.
// The correct API host should be set via TICKET_API_HOST env var.
const TICKET_API_HOST = process.env.TICKET_API_HOST || 'ticket-api.item.com';
const TICKET_API_KEY = process.env.TICKET_API_KEY || '';
const TICKET_TENANT_ID = process.env.TICKET_TENANT_ID || 'LT';

if (TICKET_API_HOST === 'unisticket.item.com') {
  console.warn('[ticket-proxy] WARNING: TICKET_API_HOST is set to unisticket.item.com (the UI host). Ticket API calls will fail with 405. Set TICKET_API_HOST to the correct Ticket API server.');
}
if (!TICKET_API_KEY) {
  console.warn('[ticket-proxy] WARNING: TICKET_API_KEY is not configured. Ticket API calls will likely fail with 401/403. Set TICKET_API_KEY env var.');
}
console.log('[ticket-proxy] Config: host=' + TICKET_API_HOST + ' apiKey=' + (TICKET_API_KEY ? 'configured' : 'MISSING') + ' tenant=' + TICKET_TENANT_ID);

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
      console.log('[ticket-proxy] IAM →', req.method, '/v1/iam' + ticketPath, 'host=' + TICKET_API_HOST, 'auth=' + !!authHeader, 'apiKey=' + !!TICKET_API_KEY);
      if (!TICKET_API_KEY) return send(res, 503, {success:false, msg:'Ticket service is not configured. Server missing TICKET_API_KEY.', _configError:true});
      const out = await ticketUpstream(req.method, '/v1/iam' + ticketPath, raw, authHeader);
      console.log('[ticket-proxy] response:', out.status, (out.json && (out.json.msg || out.json.message)) || '');
      if (out.status === 405 || (out.raw && out.raw.includes('405 Not Allowed'))) {
        return send(res, 502, {success:false, msg:'Ticket service returned 405. The configured host (' + TICKET_API_HOST + ') may be incorrect. Contact administrator.', _configError:true, _host:TICKET_API_HOST});
      }
      return send(res, out.status, out.json || {success:false, msg: out.raw ? 'Unexpected response from ticket service' : 'No response from ticket service'});
    }
    if (url.pathname.startsWith('/api/proxy/auth/ticket-staff/')) {
      const raw = await readBody(req);
      const staffPath = url.pathname.replace('/api/proxy/auth/ticket-staff', '');
      const authHeader = req.headers['authorization'] || '';
      console.log('[ticket-proxy] Staff →', req.method, '/v1/staff' + staffPath, 'host=' + TICKET_API_HOST);
      if (!TICKET_API_KEY) return send(res, 503, {success:false, msg:'Ticket service is not configured. Server missing TICKET_API_KEY.', _configError:true});
      const out = await ticketUpstream(req.method, '/v1/staff' + staffPath, raw, authHeader);
      console.log('[ticket-proxy] response:', out.status);
      if (out.status === 405 || (out.raw && out.raw.includes('405 Not Allowed'))) {
        return send(res, 502, {success:false, msg:'Ticket service returned 405. Host may be incorrect.', _configError:true});
      }
      return send(res, out.status, out.json || {success:false, msg:'No response from ticket service'});
    }
    if (url.pathname.startsWith('/api/proxy/auth/ticket-open/')) {
      const raw = await readBody(req);
      const openPath = url.pathname.replace('/api/proxy/auth/ticket-open', '');
      const authHeader = req.headers['authorization'] || '';
      console.log('[ticket-proxy] Open →', req.method, '/v1/open' + openPath, 'host=' + TICKET_API_HOST);
      if (!TICKET_API_KEY) return send(res, 503, {success:false, msg:'Ticket service is not configured. Server missing TICKET_API_KEY.', _configError:true});
      const out = await ticketUpstream(req.method, '/v1/open' + openPath, raw, authHeader);
      console.log('[ticket-proxy] response:', out.status);
      if (out.status === 405 || (out.raw && out.raw.includes('405 Not Allowed'))) {
        return send(res, 502, {success:false, msg:'Ticket service returned 405. Host may be incorrect.', _configError:true});
      }
      return send(res, out.status, out.json || {success:false, msg:'No response from ticket service'});
    }
    // Ticket health/diagnostic endpoint (non-mutating)
    if (url.pathname === '/api/proxy/auth/ticket-health') {
      return send(res, 200, {
        configured: !!TICKET_API_KEY,
        host: TICKET_API_HOST,
        hostIsUI: TICKET_API_HOST === 'unisticket.item.com',
        apiKeyPresent: !!TICKET_API_KEY,
        tenant: TICKET_TENANT_ID,
        status: (!TICKET_API_KEY || TICKET_API_HOST === 'unisticket.item.com') ? 'NOT_READY' : 'CONFIGURED',
      });
    }
    return send(res, 404, {success:false,msg:'Unknown API route'});
  } catch (e) {
    return send(res, 500, {success:false,msg:e.message});
  }
}
function ticketUpstream(method, pathname, body, authHeader) {
  return new Promise((resolve) => {
    const payload = body == null || body === '' ? null : (typeof body === 'string' ? body : JSON.stringify(body));
    const hdrs = { 'Accept':'application/json', 'Content-Type':'application/json', 'X-Tenant-Id': TICKET_TENANT_ID, 'User-Agent':'UNIS-WMS-Dashboard/1.0' };
    if (payload) { hdrs['Content-Length'] = Buffer.byteLength(payload); }
    if (authHeader) hdrs['Authorization'] = authHeader;
    if (TICKET_API_KEY) hdrs['x-api-key'] = TICKET_API_KEY;
    const req = https.request({ method, host: TICKET_API_HOST, path: pathname, headers: hdrs }, r => {
      let raw='';
      r.on('data', c => raw += c);
      r.on('end', () => {
        let parsed = null;
        try { parsed = raw ? JSON.parse(raw) : null; } catch(_) {}
        resolve({ status: r.statusCode || 502, headers: r.headers, raw, json: parsed });
      });
    });
    req.on('error', e => resolve({ status:502, json:{success:false,msg:e.message}, raw:'' }));
    req.setTimeout(15000, () => { req.destroy(); resolve({ status:504, json:{success:false,msg:'Ticket service timeout'}, raw:'' }); });
    if (payload) req.write(payload);
    req.end();
  });
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
