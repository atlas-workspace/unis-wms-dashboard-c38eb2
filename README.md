# UNIS WMS Dashboard

UNIS WMS operations dashboard with live service integrations.

## Files

- `index.html` — the dashboard UI; users sign in with their own access.
- `server.js` — the application server and constrained service proxies used by live integrations.

## Run locally

```bash
npm ci
PORT=8080 npm start
```

Then open `http://localhost:8080/`. The server listens on `0.0.0.0` for container and LAN access.

Run the automated checks with `npm test`.

## Warehouse Presence collection

The dashboard reports authenticated browser presence to the separately deployed Warehouse Presence service. Configure its public origin at runtime:

```bash
PRESENCE_TRACKER_BASE_URL=https://warehouse-active-users-5cf3ef.apps.itemonline.co npm start
```

`GET /api/runtime-config` exposes this non-secret origin to the browser, so it can change between deployments without rebuilding static assets. The server and browser both normalize and validate the URL. If the variable is unset or invalid, collection remains disabled and the WMS dashboard continues normally.

After IAM login or restored-session entry, the dashboard starts one presence session per browser tab after the selected facility is resolved. It sends a heartbeat every 30 seconds while visible, reports immediately after becoming visible again, updates the same session when the facility changes, and sends best-effort keepalive termination on logout or page exit. Repeated dashboard initialization reuses the singleton collector and does not create duplicate timers.

Presence requests use the current IAM access token as a bearer token and contain only `{sessionId, facilityId}`. No shared ingestion secret or bearer credential is bundled in browser source. Tracker failures and CORS/configuration problems are isolated from login, token refresh, facility switching, logout, and WMS operations; they produce only concise developer console warnings.

Verification:

```bash
npm test
node --check server.js
node --check public/assets/js/presence-collector.js
node --check public/assets/js/dashboard-runtime.js
```
