# Purser brand pack

Mark 01, **Hold** — a change arrives, and stops. The other four candidates are in `marks/` if you change your mind; everything composed here uses Hold.

## Where each file goes

### Avatars — same image everywhere

| File | Upload to |
| --- | --- |
| `avatar/avatar-400.png` | **X** (`@purser_sh`) — profile photo |
| `avatar/avatar-512.png` | **Discord** server icon · **GitHub** org avatar · **npm** org (`purser-sh`) |
| `avatar/avatar-512.png` | **LinkedIn** company page logo |
| `avatar/avatar-512-light.png` | Anywhere the dark square sits badly on a dark page |

All are cropped safe for a circle — the mark sits inside the inscribed circle, so nothing clips on X or Discord.

### Banners

| File | Upload to |
| --- | --- |
| `social/github-social-1280x640.png` | GitHub repo → Settings → General → **Social preview** |
| `social/x-header-1500x500.png` | X profile header. Content sits right of the avatar overlap. |
| `social/linkedin-cover-1128x191.png` | LinkedIn company page cover |
| `social/og-image-1200x630.png` | `purser.sh` — `<meta property="og:image">` and `twitter:image` |

### Website

| File | Use |
| --- | --- |
| `favicon/favicon.svg` | `<link rel="icon" type="image/svg+xml" href="/favicon.svg">` |
| `favicon/favicon.ico` | Root of the site, for old browsers |
| `favicon/favicon-180.png` | `<link rel="apple-touch-icon" href="/apple-touch-icon.png">` |
| `wordmark/lockup-light.svg` | Site header, light theme |
| `wordmark/lockup-dark.svg` | Site header, dark theme |

### README

Put the mark above the title. Use the GitHub theme-switch so it flips automatically:

```html
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/brand/hold-256-dark.png">
    <img src="docs/brand/hold-256.png" width="88" alt="Purser">
  </picture>
</p>
```

### Terminal

`apps/runner/src/brand.ts` (moved from `terminal/brand.ts`) is wired into the CLI. Three tiers:

- `banner(version)` — first run, `--help`, `--version`. **Not on every command.**
- `header(version, workspace)` — one line, top of a run.
- `gate(message)` and `glyph.*` — the approval prompt.

The third one is the point. `❯│` appears at the exact moment a change is held waiting for a human, so the mark shows up doing the product's actual job rather than decorating a splash screen.

It handles `NO_COLOR`, non-TTY pipes, and 256-colour and 16-colour terminals, and falls back to `>|` where block characters won't render. `terminal/banner.txt` shows every state.

## Colours

| Token | Hex | Use |
| --- | --- | --- |
| Ink | `#1A1613` | Dark ground, structural strokes on light |
| Copper | `#C2560F` | Accent **on light grounds only** |
| Copper | `#F0743A` | Accent **on dark grounds only** |
| Paper | `#F7F4F1` | Light ground, structural strokes on dark |
| Line | `#E4DDD6` | Hairlines, borders |
| Pass | `#2E7D5B` | Approved state |

The two coppers are one colour doing two jobs. `#C2560F` on a dark ground goes muddy; `#F0743A` on a light ground fails contrast. Always pair them with the right ground.

## Rules

- **Never recolour the mark.** Copper accent, ink or paper structure. That is the whole system.
- **Never put the mark on a busy background.** Ink or paper, nothing else.
- **Clear space:** keep the width of the bar clear on all four sides.
- **Minimum size:** 16 px. Below that use the bar alone.
- The mark never appears stretched, rotated, outlined, or with a shadow.
