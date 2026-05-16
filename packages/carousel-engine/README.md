# `@zero-risk/carousel-engine`

Satori-powered carousel / social-image generator. Five platform templates ·
brand-injectable · returns PNG buffers ready to upload to Supabase Storage.

## What's inside

### Templates (5)

| Template | Size | Aspect | Use |
|---|---|---|---|
| `InstagramFeed`  | 1080 × 1350 | 4:5  | IG carousel feed posts |
| `InstagramReel`  | 1080 × 1920 | 9:16 | Reels cover + carousel slides |
| `TikTok`         | 1080 × 1920 | 9:16 | TikTok cover (safe-area aware) |
| `FacebookFeed`   | 1200 ×  630 | 1.91:1 | Facebook feed link-style |
| `TwitterCard`    | 1200 ×  675 | 16:9 | Twitter/X link preview |

Each template accepts a uniform `TemplateProps` shape:

```ts
{
  brand: {
    logo_url?: string | null
    colors: { primary, secondary?, accent?, text_on_primary?, text_on_surface?, surface? }
    fonts: { family, headline_family? }
    brand_handle?: string
  }
  content: { headline, body?, cta?, eyebrow?, background_image_url? }
  slide_index: number   // 1-based
  total_slides: number
}
```

### Render pipeline

```
TemplateProps → JSX → satori → SVG → @resvg/resvg-js → PNG Buffer
```

```ts
import { renderCarousel } from '@zero-risk/carousel-engine'

const rendered = await renderCarousel({
  platform: 'instagram-feed',
  brand,
  slides: [{ headline: '...' }, ...]
})
// rendered: RenderedSlide[] with { png, durationMs, width, height, slide_index, ... }
```

### Fonts

Inter (regular + bold) is auto-fetched from a jsdelivr-hosted GoogleFonts
mirror at first render and cached for the life of the process. Override
with:

```ts
import { registerFont } from '@zero-risk/carousel-engine'

registerFont({ name: 'Cabin', data: tffArrayBuffer, weight: 700, style: 'normal' })
```

Then set `brand.fonts.headline_family = 'Cabin'`.

To point the default loader at a local file (offline / CI), set:

```
CAROUSEL_FONT_INTER_REGULAR_URL=file:///abs/path/Inter-Regular.ttf
CAROUSEL_FONT_INTER_BOLD_URL=file:///abs/path/Inter-Bold.ttf
```

## API · `POST /api/carousel/generate`

The Next.js route at `src/app/api/carousel/generate/route.ts` wraps the
engine and handles Supabase Storage upload.

### Request

```json
{
  "client_slug": "naufrago",
  "platform": "instagram-feed",
  "brand": { /* BrandTokens */ },
  "slides": [ /* SlideContent[] */ ],
  "date": "2026-05-16",            // optional · YYYY-MM-DD · defaults to today UTC
  "carousel_id": "naufrago-v1-..." // optional · auto-derived if omitted
}
```

Headers · `x-api-key: <INTERNAL_API_KEY>` required.

### Response

```json
{
  "carousel_id": "cars-naufrago-abc123",
  "platform": "instagram-feed",
  "width": 1080,
  "height": 1350,
  "slide_urls": [
    "https://.../client-websites/naufrago/carousels/2026-05-16/slide-1.png",
    "..."
  ],
  "thumbnail_url": "https://.../slide-1.png",
  "timings_ms": [842, 76, 81, 78, 79]
}
```

Storage path · `client-websites/{client_slug}/carousels/{date}/slide-{n}.png`.

## Smoke

```powershell
# dry-run · validates fixture
node scripts/smoke-test/smoke-carousel.mjs --dry-run

# real run · requires INTERNAL_API_KEY in .env.local
node scripts/smoke-test/smoke-carousel.mjs
node scripts/smoke-test/smoke-carousel.mjs --platform=tiktok
# → scripts/smoke-test/out/carousel-<timestamp>.md
```

## Tests

```powershell
pnpm vitest run __tests__/carousel-engine.test.ts
# 42 tests · platform specs · template registry · JSX render · fixture
# shape · request validator parity
```

## Known limits

- Satori CSS subset · only flexbox, no grid, no `position: absolute` in
  most cases, no SVG masks · templates already comply
- Native binary · `@resvg/resvg-js` needs the right platform binary in
  `node_modules` · Vercel builds it cleanly · local Windows / WSL works
- Font cold-start · first render fetches Inter from jsdelivr (~1 MB) ·
  subsequent renders in the same process are cached
- Storage bucket · the API route expects `client-websites` bucket to
  exist with `service_role` upload allowed
