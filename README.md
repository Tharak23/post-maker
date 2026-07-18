# Post maker - hawan

Full-resolution **Post** and **Banner** maker. Runs in your browser — no upload for normal use.

## Modes

| Mode | Use |
| --- | --- |
| **Post** | Square / portrait posts with branding overlays |
| **Banner** | 4:1 LinkedIn / X covers — pan photo, centered text |

### Post templates

| Template | File |
| --- | --- |
| **original** | `Original1.svg` |
| **original-black** | `Original-Black.svg` |
| **v1** | `hydrilla-post.svg` |
| **v1-black** | `version2.svg` |
| **logo-only** | `black.svg` |

### Banner text

| Option | File |
| --- | --- |
| **Hydrilla** | `Hydrilla-banner.svg` |
| **Hydrilla AI** | `Hydrilla-AI.svg` |

Export: LinkedIn `1584×396`, High quality `3168×792`, or Max from photo.

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
