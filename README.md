# Post maker - hawan

Full-resolution **Post**, **Banner**, and **Video** maker.

## Modes

| Mode | Use |
| --- | --- |
| **Post** | Square / portrait posts with branding overlays |
| **Banner** | 4:1 LinkedIn / X covers — pan photo, centered text |
| **Video** | Upload video, type/move DM Sans Bold text, tune spacing, export MP4 or GIF |

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

### Video export

| Option | Use |
| --- | --- |
| **MP4** | Source frame size with DM Sans Bold text composited by ffmpeg |
| **GIF** | ffmpeg palette-based GIF output, sized for reliable sharing |
| **Medium quality** | Smaller output, high visual quality |
| **Max quality** | Lossless H.264 MP4 stream; GIF up to 1280px wide |

Video controls include size, position, letter spacing, line spacing, color,
trim start, clip length, GIF FPS, GIF width, and export quality. Browser export
uses FFmpeg.wasm first; the Node/ffmpeg API remains as a fallback.

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

- Post output matches the source image pixels
- Banner PNG export is lossless, with SVG overlays rasterized at final size
- Video MP4 max quality uses source dimensions and lossless H.264 encoding
- GIF export uses palette generation and GIF-safe dimensions; GIF itself is limited to 256 colors

## Optional API

`POST /api/render` with `template=original-black` (or `v1`, `v1-black`, `logo-only`). No auth.
