# Post maker - hawan

Full-resolution post image maker. Everything runs in your browser — no upload for normal use.

## Templates

| Template | File | Description |
| --- | --- | --- |
| **original** (default) | `Original1.svg` | White top banner |
| **original-black** | `Original-Black.svg` | Black top banner |
| **v1** | `hydrilla-post.svg` | White logo + wordmark |
| **v1-black** | `version2.svg` | Black logo + wordmark |
| **logo-only** | `black.svg` | Logo only |

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

## Quality

- Your photo is never resized — output matches input pixels
- SVG overlays are rasterized at **exact on-image size** (not upscaled from a tiny bitmap)
- Export is lossless PNG

## Optional API

`POST /api/render` with `template=original-black` (or `v1`, `v1-black`, `logo-only`). No auth.
