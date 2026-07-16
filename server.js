const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { Pool } = require('pg');
const PORT = process.env.PORT || 8080;
const ROOT = __dirname;

const DATABASE_URL = process.env.DATABASE_URL || '';
let dbPool = null;
let dbReady = false;

if (DATABASE_URL) {
  dbPool = new Pool({ connectionString: DATABASE_URL });
  console.log('[database] DATABASE_URL configured; PostgreSQL connection pool enabled.');
} else {
  console.log('[database] DATABASE_URL not configured; using file fallback for shared requests.');
}

async function initDatabase() {
  if (!dbPool) return;
  try {
    const schemaPath = path.join(ROOT, 'db', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    await dbPool.query(schema);
    dbReady = true;
    console.log('[database] Schema ready.');
  } catch (e) {
    dbReady = false;
    console.error('[database] Schema initialization failed:', e.message);
  }
}

async function dbQuery(sql, params) {
  if (!dbPool || !dbReady) throw new Error('database unavailable');
  return dbPool.query(sql, params || []);
}


// Ticket API configuration
// Correct path: https://unisticket.item.com/api/item-tickets/v1/...
// The UI proxy base includes /api/item-tickets prefix before /v1/iam|staff|open
const TICKET_API_HOST = process.env.TICKET_API_HOST || 'unisticket.item.com';
const TICKET_API_BASE_PATH = process.env.TICKET_API_BASE_PATH || '/api/item-tickets';
const TICKET_API_KEY = process.env.TICKET_API_KEY || '';
const TICKET_TENANT_ID = process.env.TICKET_TENANT_ID || 'LT';

console.log('[ticket-proxy] Config: host=' + TICKET_API_HOST + ' basePath=' + TICKET_API_BASE_PATH + ' apiKey=' + (TICKET_API_KEY ? 'configured' : 'not set') + ' tenant=' + TICKET_TENANT_ID);

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

function ticketUpstream(method, apiPath, body, authHeader) {
  return new Promise((resolve) => {
    const fullPath = TICKET_API_BASE_PATH + apiPath;
    const payload = body == null || body === '' ? null : (typeof body === 'string' ? body : JSON.stringify(body));
    const hdrs = { 'Accept':'application/json', 'Content-Type':'application/json', 'X-Tenant-Id': TICKET_TENANT_ID, 'User-Agent':'UNIS-WMS-Dashboard/1.0' };
    if (payload) hdrs['Content-Length'] = Buffer.byteLength(payload);
    if (authHeader) hdrs['Authorization'] = authHeader;
    if (TICKET_API_KEY) hdrs['x-api-key'] = TICKET_API_KEY;
    console.log('[ticket-proxy] →', method, TICKET_API_HOST + fullPath, 'auth:', !!authHeader, 'apiKey:', !!TICKET_API_KEY);
    const req = https.request({ method, host: TICKET_API_HOST, path: fullPath, headers: hdrs }, r => {
      let raw='';
      r.on('data', c => raw += c);
      r.on('end', () => {
        let parsed = null;
        try { parsed = raw ? JSON.parse(raw) : null; } catch(_) {}
        if (r.statusCode >= 400) {
          console.log('[ticket-proxy] ← status:', r.statusCode, 'msg:', (parsed && (parsed.msg || parsed.message)) || raw.slice(0,150));
        } else {
          console.log('[ticket-proxy] ← status:', r.statusCode, 'ok');
        }
        resolve({ status: r.statusCode || 502, headers: r.headers, raw, json: parsed });
      });
    });
    req.on('error', e => {
      console.error('[ticket-proxy] Network error:', e.message);
      resolve({ status:502, json:{success:false,msg:'Ticket service unreachable: ' + e.message}, raw:'' });
    });
    req.setTimeout(15000, () => { req.destroy(); resolve({ status:504, json:{success:false,msg:'Ticket service timeout'}, raw:'' }); });
    if (payload) req.write(payload);
    req.end();
  });
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

    // Ticket API proxy routes
    if (url.pathname.startsWith('/api/proxy/auth/ticket/')) {
      const raw = await readBody(req);
      const ticketPath = url.pathname.replace('/api/proxy/auth/ticket', '');
      const authHeader = req.headers['authorization'] || '';
      const out = await ticketUpstream(req.method, '/v1/iam' + ticketPath, raw, authHeader);
      if (out.status === 405 || (out.raw && out.raw.includes('405 Not Allowed'))) {
        return send(res, 502, {success:false, msg:'Ticket API returned 405. Check server configuration.', _configError:true});
      }
      return send(res, out.status, out.json || {success:false, msg: out.raw ? out.raw.slice(0,200) : 'No response'});
    }
    if (url.pathname.startsWith('/api/proxy/auth/ticket-staff/')) {
      const raw = await readBody(req);
      const staffPath = url.pathname.replace('/api/proxy/auth/ticket-staff', '');
      const authHeader = req.headers['authorization'] || '';
      const out = await ticketUpstream(req.method, '/v1/staff' + staffPath, raw, authHeader);
      return send(res, out.status, out.json || {success:false, msg:'No response from ticket service'});
    }
    if (url.pathname.startsWith('/api/proxy/auth/ticket-open/')) {
      const raw = await readBody(req);
      const openPath = url.pathname.replace('/api/proxy/auth/ticket-open', '');
      const authHeader = req.headers['authorization'] || '';
      const out = await ticketUpstream(req.method, '/v1/open' + openPath, raw, authHeader);
      return send(res, out.status, out.json || {success:false, msg:'No response from ticket service'});
    }

    // Ticket health/diagnostic endpoint (non-mutating)
    if (url.pathname === '/api/proxy/auth/ticket-health') {
      // Validate by calling open departments
      const probe = await ticketUpstream('POST', '/v1/open/departments/page', JSON.stringify({page:1,size:1,input:{}}), '');
      const probeOk = probe.status < 300 && probe.json && (probe.json.success !== false);
      return send(res, 200, {
        status: probeOk ? 'READY' : 'ERROR',
        host: TICKET_API_HOST,
        basePath: TICKET_API_BASE_PATH,
        apiKeyPresent: !!TICKET_API_KEY,
        tenant: TICKET_TENANT_ID,
        probeStatus: probe.status,
        probeMessage: probeOk ? 'Departments endpoint reachable' : ((probe.json && (probe.json.msg || probe.json.message)) || 'Probe failed'),
      });
    }

    if (url.pathname === '/api/database/health') {
      if (!dbPool) return send(res, 200, {configured:false, ready:false});
      try { await dbQuery('SELECT 1'); return send(res, 200, {configured:true, ready:true}); }
      catch(e) { return send(res, 200, {configured:true, ready:false, msg:'Database not ready'}); }
    }

    if (url.pathname === '/api/database/facility-filter-test') {
      if (!dbPool || !dbReady) return send(res, 503, {success:false, msg:'Database not ready'});
      const runId = 'dbtest-' + Date.now();
      const a = { id: runId + '-LT_F1', facilityId: 'LT_F1', marker: runId, status: 'TEST_A' };
      const b = { id: runId + '-LT_F21', facilityId: 'LT_F21', marker: runId, status: 'TEST_B' };
      for (const rec of [a, b]) {
        await dbQuery(
          `INSERT INTO location_tag_requests (id, facility_code, payload, requested_by, status, requested_at, updated_at)
           VALUES ($1, $2, $3::jsonb, 'database-test', $4, now(), now())
           ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()`,
          [rec.id, rec.facilityId, JSON.stringify(rec), rec.status]
        );
      }
      const f1 = await dbQuery(
        `SELECT payload FROM location_tag_requests
         WHERE facility_code = $1 AND payload->>'marker' = $2
         ORDER BY id`,
        ['LT_F1', runId]
      );
      const f21 = await dbQuery(
        `SELECT payload FROM location_tag_requests
         WHERE facility_code = $1 AND payload->>'marker' = $2
         ORDER BY id`,
        ['LT_F21', runId]
      );
      const isolationPass = f1.rows.length === 1 && f21.rows.length === 1 && f1.rows[0].payload.facilityId === 'LT_F1' && f21.rows[0].payload.facilityId === 'LT_F21';
      return send(res, 200, {
        success: isolationPass,
        runId,
        write: 'ok',
        read: 'ok',
        facilityFiltering: isolationPass ? 'passed' : 'failed',
        ltF1Returned: f1.rows.map(r => r.payload.id),
        ltF21Returned: f21.rows.map(r => r.payload.id)
      });
    }

    return send(res, 404, {success:false,msg:'Unknown API route'});
  } catch (e) {
    return send(res, 500, {success:false,msg:e.message});
  }
}

// Email/SMTP configuration — all from env vars, never hardcoded
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_SECURE = process.env.SMTP_SECURE === 'true';
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || '';
const SMTP_REPLY_TO = process.env.SMTP_REPLY_TO || '';
const APP_PUBLIC_URL = process.env.APP_PUBLIC_URL || 'https://unis-wms-dashboard-c38eb2.coolify.item.pub';
const SMTP_CONFIGURED = !!(SMTP_HOST && SMTP_USER && SMTP_PASS && SMTP_FROM);
console.log('[email] SMTP configured:', SMTP_CONFIGURED, 'host:', SMTP_HOST ? 'set' : 'missing', 'from:', SMTP_FROM ? 'set' : 'missing');

let smtpTransport = null;
if (SMTP_CONFIGURED) {
  smtpTransport = nodemailer.createTransport({
    host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

const server = http.createServer((req,res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/api/notification/email-health') {
    return send(res, 200, {configured: SMTP_CONFIGURED, status: SMTP_CONFIGURED ? 'CONNECTED' : 'NOT_CONFIGURED', fromConfigured: !!SMTP_FROM});
  }
  if (req.method === 'POST' && url.pathname === '/api/notification/send-location-tag-request') {
    return handleSendNotification(req, res);
  }
  if (url.pathname.startsWith('/api/')) return handleApi(req,res,url);
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
initDatabase().finally(() => {
  server.listen(PORT, () => console.log(`UNIS WMS dashboard server listening on ${PORT}`));
});

async function handleSendNotification(req, res) {
  try {
    const raw = await readBody(req);
    let body;
    try { body = JSON.parse(raw); } catch(_) { return send(res, 400, {success:false, msg:'Invalid request body'}); }

    const emails = (body.emails || []).filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    if (emails.length === 0) return send(res, 400, {success:false, msg:'No valid email recipients provided'});

    if (!SMTP_CONFIGURED || !smtpTransport) {
      return send(res, 200, {success:true, status:'SAVED_ONLY', msg:'Email delivery is not configured. Recipients saved for reference.'});
    }

    const location = body.locationName || body.locationId || 'Unknown';
    const facility = body.facility || 'Unknown';
    const requester = body.requester || 'Unknown';
    const changes = body.changes || {};
    const createdDate = body.createdDate || new Date().toISOString();
    const changeLines = Object.entries(changes).map(([k,v]) => `  • ${k}: ${v}`).join('\n');
    const dashboardUrl = APP_PUBLIC_URL;

    const subject = `Location Tag Update Request — ${location} at ${facility}`;
    const text = `A location update request has been submitted and requires manager approval.\n\n` +
      `LOCATION: ${location}\n` +
      `FACILITY: ${facility}\n` +
      `REQUESTER: ${requester}\n` +
      `DATE: ${new Date(createdDate).toLocaleString('en-US', {timeZone:'America/Los_Angeles'})}\n\n` +
      `REQUESTED CHANGES:\n${changeLines || '  (none specified)'}\n\n` +
      `This request requires manager approval before any WMS changes are applied.\n` +
      `Review in dashboard: ${dashboardUrl}\n\n` +
      `— UNIS WMS Dashboard`;

    const mailOpts = {
      from: SMTP_FROM,
      to: emails.join(', '),
      subject,
      text,
    };
    if (SMTP_REPLY_TO) mailOpts.replyTo = SMTP_REPLY_TO;

    await smtpTransport.sendMail(mailOpts);
    console.log('[email] Sent notification to', emails.length, 'recipient(s) for location', location);
    return send(res, 200, {success:true, status:'SENT', msg:'Email sent to ' + emails.length + ' recipient(s)'});
  } catch(e) {
    console.error('[email] Send failed:', e.message);
    return send(res, 200, {success:true, status:'FAILED', msg:'Email delivery failed. Recipients saved for reference.'});
  }
}
