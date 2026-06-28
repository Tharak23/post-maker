# Post maker - hawan

Full-resolution post image maker. Everything runs in your browser — no upload until you choose to use the optional API.

## Templates

| Template | Description |
| --- | --- |
| **original** (default) | Top banner — left, center, or right |
| **v1** | Logo left + wordmark right |
| **version2** | Logo left + wordmark right (v2) |
| **logo-only** | Logo only — left, center, or right |

## Run locally

```bash
npm install
npm run dev
```

## Deploy

```bash
npm run build
vercel --prod
```

Works on Vercel with zero configuration.

## Network & performance

| Action | Server requests | Notes |
| --- | --- | --- |
| Open site | 1 page load + static assets (cached) | Templates load once |
| Upload image | **0** | Stays on your device |
| Drag / sliders | **0** | Canvas redraws locally |
| Download / Copy | **0** | PNG created in browser |
| `/api/render` | 1 per call | Optional automation only |

CPU usage only spikes on your device during drag or export — the server stays idle for normal use.

## Supported formats

PNG, JPG, and **iPhone HEIC** photos.

## Optional API

`POST /api/render` — same result as the UI, for scripts. No auth required.

```bash
curl -X POST "http://localhost:3000/api/render?template=original&horizontal=center" \
  -F "image=@./photo.heic" \
  --output hawan-post.png
```
