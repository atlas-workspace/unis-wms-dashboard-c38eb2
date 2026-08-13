'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('collector loads before the dashboard runtime and all lifecycle hooks are wired', () => {
  const html = read('index.html');
  const runtime = read('public/assets/js/dashboard-runtime.js');
  assert.ok(html.indexOf('/assets/js/presence-collector.js') < html.indexOf('/assets/js/dashboard-runtime.js'));
  assert.match(runtime, /populateFacilitySwitcher\(\);\s*startPresenceCollection\(\);/);
  assert.match(runtime, /FACILITY_ID = fac\.id;[\s\S]{0,220}_presenceCollector\.facilityChanged\(\)/);
  assert.match(runtime, /function doLogout\(\) \{[\s\S]{0,120}stopPresenceCollection\(\)/);
});

test('browser source contains no embedded JWT fallback', () => {
  const browserSource = [
    read('public/assets/js/dashboard-runtime.js'),
    read('public/assets/js/dashboard-modules.js'),
    read('public/assets/js/presence-collector.js'),
  ].join('\n');
  assert.doesNotMatch(browserSource, /EMBEDDED_TOKEN|_embeddedTokenUsable/);
  assert.doesNotMatch(browserSource, /eyJ[A-Za-z0-9_-]{10,}\./);
});

test('runtime config exposes only the public tracker URL setting', () => {
  const server = read('server.js');
  assert.match(server, /PRESENCE_TRACKER_BASE_URL/);
  assert.match(server, /presenceTrackerBaseUrl: PRESENCE_TRACKER_BASE_URL/);
  assert.doesNotMatch(read('public/assets/js/presence-collector.js'), /shared.?secret|client_secret|api.?key/i);
});
