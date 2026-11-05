---
name: Cinematic Obsidian
colors:
  surface: '#121319'
  surface-dim: '#121319'
  surface-bright: '#38393f'
  surface-container-lowest: '#0d0e13'
  surface-container-low: '#1a1b21'
  surface-container: '#1e1f25'
  surface-container-high: '#292a30'
  surface-container-highest: '#33343b'
  on-surface: '#e3e1ea'
  on-surface-variant: '#c1c6d7'
  inverse-surface: '#e3e1ea'
  inverse-on-surface: '#2f3036'
  outline: '#8b90a0'
  outline-variant: '#414754'
  surface-tint: '#adc6ff'
  primary: '#adc6ff'
  on-primary: '#002e69'
  primary-container: '#4c8eff'
  on-primary-container: '#00285c'
  inverse-primary: '#005ac1'
  secondary: '#a7c8ff'
  on-secondary: '#003060'
  secondary-container: '#3491fc'
  on-secondary-container: '#002a54'
  tertiary: '#ffb595'
  on-tertiary: '#571e00'
  tertiary-container: '#ef671a'
  on-tertiary-container: '#4c1a00'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#d8e2ff'
  primary-fixed-dim: '#adc6ff'
  on-primary-fixed: '#001a41'
  on-primary-fixed-variant: '#004494'
  secondary-fixed: '#d5e3ff'
  secondary-fixed-dim: '#a7c8ff'
  on-secondary-fixed: '#001c3b'
  on-secondary-fixed-variant: '#004787'
  tertiary-fixed: '#ffdbcc'
  tertiary-fixed-dim: '#ffb595'
  on-tertiary-fixed: '#351000'
  on-tertiary-fixed-variant: '#7c2e00'
  background: '#121319'
  on-background: '#e3e1ea'
  surface-variant: '#33343b'
typography:
  display-hero:
    fontFamily: Inter
    fontSize: 56px
    fontWeight: '700'
    lineHeight: 64px
    letterSpacing: -0.03em
  display-hero-mobile:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 42px
    letterSpacing: -0.025em
  headline-lg:
    fontFamily: Inter
    fontSize: 40px
    fontWeight: '600'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 34px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
    letterSpacing: -0.01em
  body-md:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-badge:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 12px
    letterSpacing: 0.04em
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 0.75rem
  margin: 3rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system delivers a luxury cinematic entertainment experience tailored for an ultra-fast IPTV Progressive Web App. Blending deep spatial glassmorphism with Cupertino-level restraint, the visual environment emulates modern native streaming interfaces found on high-end hardware.

The interface prioritizes immersion, hyper-legibility in low-light environments, and high-performance tactile micro-interactions. Surfaces layer over absolute deep voids to allow high-contrast 4K/HDR artwork, posters, and preview players to command focus without distraction.

### Key Aesthetic Tenets
- **Cinematic Void:** A primary base anchored in near-pitch tones (#06070C) that makes high-definition imagery and dynamic glows pop with dimensional depth.
- **Precision Glass:** Translucent backdrop-filtered structural panels with ultra-fine, hairline borders reproducing the tactile optical density of polished sapphire glass.
- **Electric Luminescence:** Directed use of pure electric cobalt blue accents (#0F7BFF), employed purposefully to guide intent, playback states, and conversion cues.
- **Engineered Micro-Detail:** Razor-sharp typographic hierarchy, compact micro-badges, pill buttons, and responsive streaming cards built with tactile elevation.

## Colors

The palette is engineered around pure visual clarity and extreme contrast against a night sky canvas. Color is treated functionally rather than decoratively:

- **Deep Surfaces:** 
  - Base Canvas: `#06070C`
  - Surface Card (Low): `#0E111A`
  - Surface Elevated (Mid): `#141824`
  - Floating Panels & Modals: `rgba(20, 24, 36, 0.75)` with 24px backdrop blur.
- **Hairline Dividers & Outlines:** 
  - Subdued Edge: `rgba(255, 255, 255, 0.08)`
  - Active/Hover Edge: `rgba(255, 255, 255, 0.2)`
  - Focus Ring: `rgba(15, 123, 255, 0.6)`
- **Accents:**
  - Primary Electric Cobalt: `#0F7BFF`
  - Hover / Luminescent Blue: `#3894FF`
  - Glow Hue: `rgba(15, 123, 255, 0.25)`
- **Typography & Icons:**
  - Dominant / Crisp Title: `#F8FAFC`
  - Secondary Muted / Metadata: `#94A3B8`
  - Tertiary / Ghost: `#64748B`
- **Utility / Badges:**
  - 4K / UHD Badge: `#10B981` (Emerald Ultra)
  - Live Indicator: `#EF4444` (Pulse Red)

## Typography

The type hierarchy utilizes **Inter** (backed by native SF Pro fallback stacks) to maintain an authoritative, technical, and clean aesthetic.

- Large hero headlines feature negative tracking (`-0.02em` to `-0.03em`) for a condensed, cinematic posture.
- Technical information, streaming specs (e.g., `4K HDR`, `DOLBY ATMOS`, `60 FPS`), and UI pills use `label-badge` with uppercase transformation and slight positive letter-spacing (`+0.04em`) to ensure legibility on small-form screens.
- Portuguese copy must prioritize crisp line heights to prevent descender collision on accented characters (e.g., `ç`, `ã`, `é`).

## Layout & Spacing

Layouts follow a fluid 12-column grid system bounded by a max container width of `1280px` for optimal TV/desktop preview scanning, dropping to an 8-column layout on tablet and a single/dual-column fluid grid on mobile devices.

- **Breakpoints:**
  - Mobile: `< 640px` (Margin: `1rem`, Gutter: `0.75rem`)
  - Tablet: `640px - 1024px` (Margin: `2rem`, Gutter: `1rem`)
  - Desktop: `> 1024px` (Margin: `3rem`, Gutter: `1.5rem`)
- **Horizontal Carousels:** Streaming categories break the main canvas margin on mobile, displaying bleed/peek edges with `space-sm` offsets to encourage fluid finger-swiping.
- **Section Rhythm:** Standard landing page section blocks are divided by vertical gaps of `space-xl` (desktop: 6rem to 8rem) with subtle radial glow dividers centered at top.

## Elevation & Depth

Visual hierarchy operates on physical light dissipation across dark crystal layers:

- **Tier 0 (Backdrop):** `#06070C` with subtle radial gradient spotlights (`rgba(15, 123, 255, 0.08)` blur 120px) positioned behind featured hero hardware mockups.
- **Tier 1 (Base Cards):** `#0E111A` with a singular `1px` border of `rgba(255, 255, 255, 0.08)`. No directional shadow.
- **Tier 2 (Elevated Interactive Surfaces & Floating Navigation):** `#141824` at 70% opacity, paired with `backdrop-filter: blur(20px)` and an ambient bottom drop shadow: `0 12px 32px -4px rgba(0, 0, 0, 0.7)`.
- **Tier 3 (Active Focus / Modals):** Hairline rim light border of `rgba(255, 255, 255, 0.2)`, electric blue underglow: `0 0 24px -2px rgba(15, 123, 255, 0.35)`.

## Shapes

The design system incorporates **Pill-shaped (Level 3)** geometry balanced against refined curved cards:

- **Action Buttons & Micro-Badges:** Complete capsules with full rounded radii (`9999px`) creating an ergonomic, mobile-native touch profile.
- **Content Cards & Mockup Viewports:** `rounded-xl` (`1.5rem` / 24px) for master media containers and device shells; `rounded-lg` (`1rem` / 16px) for channel cards and feature tiles.
- **Inputs & Glass Rows:** `rounded-lg` (12px to 16px) matching the contour of the inner card containers.

## Components

### Buttons
- **Primary Pill:** Full pill capsule (`border-radius: 9999px`), background `#0F7BFF`, text `#FFFFFF`, font-weight 600. Hover transitions to `#3894FF` with an outer soft glow of `0 0 20px rgba(15, 123, 255, 0.45)`. Active scale `0.98`.
- **Glass / Secondary:** Full pill capsule, background `rgba(255, 255, 255, 0.06)`, border `1px solid rgba(255, 255, 255, 0.12)`, text `#F8FAFC`. Hover brings background to `rgba(255, 255, 255, 0.12)`.
- **Ghost:** Transparent background with `#94A3B8` label, turning `#F8FAFC` on hover.

### Badges & Micro-Pills
- Spec Tags (`4K`, `FHD`, `AO VIVO`, `DOLBY 5.1`): `padding: 2px 8px`, border radius `4px` or full pill, font `label-badge`. Background `rgba(255, 255, 255, 0.06)`, border `1px solid rgba(255, 255, 255, 0.1)`.
- Live Indicator: Incorporates an animated pulsating dot (`#EF4444`) with high-contrast uppercase lettering.

### Channel & Media Cards
- Aspect ratio `16:9` (landscape stream) or `2:3` (poster cover).
- Surface `#0E111A`, border `1px solid rgba(255, 255, 255, 0.08)`, border-radius `1rem`.
- Gradient overlay from bottom (`rgba(6, 7, 12, 0.9)` to transparent 60%) to preserve title legibility.
- On hover: card elevates smoothly (`translateY(-4px)`), hairline shifts to `rgba(255, 255, 255, 0.25)`, subtle blue ambient glow behind artwork.

### Interactive Mockup Tokens (Streaming PWA)
- Top Navigation Bar: Floating glass island with frosted blur (`backdrop-blur: 24px`), embedded search capsule, and category tabs (`Ao Vivo`, `Filmes`, `Séries`, `Infantil`, `Esportes`).
- Player Timeline: Hairline progress bar with filled electric blue bar (`#0F7BFF`), buffered tail (`rgba(255,255,255,0.2)`), and glowing playhead.

### Form Inputs
- Background `#0E111A`, border `1px solid rgba(255, 255, 255, 0.12)`, placeholder text `#64748B`, text `#F8FAFC`.
- Focus state: border color `#0F7BFF`, outline none, box-shadow `0 0 0 3px rgba(15, 123, 255, 0.2)`.