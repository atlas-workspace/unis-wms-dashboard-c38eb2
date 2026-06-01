# UNIS WMS Dashboard

Extracted from `unis-wms-dashboard-code.md` into the three source files included in the original markdown:

- `index.html` — full live build
- `index-shareable.html` — self-contained shareable build
- `serve-local.sh` — convenience script that serves `index-shareable.html` on a local network

## Run locally

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080/index.html` or `http://localhost:8080/index-shareable.html`.

For LAN sharing:

```bash
./serve-local.sh
```
