# UNIS WMS Dashboard

Extracted from `unis-wms-dashboard-code.md`.

## Files

- `index.html` — **safe hosted default**. This is a copy of the shareable build so static hosting never serves the credentialed/live build by default.
- `index-shareable.html` — self-contained shareable build for staff. No embedded credentials; users sign in themselves and it can fall back to a baked Wise snapshot.
- `index-live.html` — original full live build extracted from the markdown's `index.html`. Keep private; do not serve publicly because it may contain stored credential/session context.
- `serve-local.sh` — convenience script that serves `index-shareable.html` on a local network.

## Run locally

Safe/shareable hosted version:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080/` or `http://localhost:8080/index.html`.

For LAN sharing:

```bash
./serve-local.sh
```
