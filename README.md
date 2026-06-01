# UNIS WMS Dashboard

Single-file, shareable UNIS WMS dashboard.

## Files

- `index.html` — the only dashboard build. It is the shareable/no-embedded-credentials version; users sign in with their own access and the page can fall back to baked Wise snapshot data when live API calls are blocked.
- `serve-local.sh` — optional convenience script that serves `index.html` on a local network.

## Run locally

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080/` or `http://localhost:8080/index.html`.

For LAN sharing:

```bash
./serve-local.sh
```
