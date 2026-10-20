# Kizashi Inc. — Design System

## Mission
Create implementation-ready, token-driven UI guidance for Kizashi Inc. that is optimized for consistency, accessibility, and fast delivery.

## Brand
- Product/brand: Kizashi Inc.
- Audience: Japanese business owners and teams considering brand, EC, operations, or AI projects
- Visual inspiration: Igloo Inc. — minimal, architectural, premium

## Style Foundations
- Visual style: minimal, utility-first, accessibility-prioritized
- Main font: Hiragino Kaku Gothic ProN / system-ui sans-serif
- Mono font: Geist Mono / monospace
- Base font size: 16px
- Base font weight: 400
- Line height: 1.6

## Color Palette
- `color.text.primary` = #000000
- `color.text.inverse` = #ffffff
- `color.surface.base` = #a0a5b1
- `color.surface.dark` = #0a0a0a
- `color.surface.light` = #f5f5f3
- `color.accent` = #c8ab82  (warm gold)
- `color.border.subtle` = rgba(255,255,255,0.15)

## Typography Scale
- xs: 12px
- sm: 14px
- base: 16px
- lg: 18px
- xl: 20px
- 2xl: 24px
- 3xl: 32px
- 4xl: 48px
- 5xl: 64px
- 6xl: 80px

## Spacing
- Generous whitespace is a core brand value
- Section padding: 120px vertical minimum on desktop
- Hero padding: 48px

## Motion
- Entrance: fade-in + translateY(20px → 0), ease-out, 0.8s
- Stagger delay: 0.15s between elements
- Hover transitions: 0.3s ease

## Accessibility
- WCAG 2.2 AA
- Keyboard-first interactions
- Focus-visible indicators required
- Minimum contrast ratio: 4.5:1

## Rules: Do
- Use large, confident typography
- Use monospace for labels, captions, metadata
- Let whitespace breathe — never crowd elements
- Full-bleed dark 3D chapters with an unframed reading column

## Rules: Don't
- No decorative SVG illustrations
- No busy patterns or textures
- No low-contrast text
- No more than 2 typeface families

## Refinement (2026-09-14)
- Keep the seven current chapters and their CG subjects. Improve framing, hierarchy, and interaction in place.
- `tokens.css` is the shared palette and type source; `app/globals.css` exposes the Tailwind v4 theme.
- English display headings are paired with readable Japanese summaries. Use zero letter-spacing.
- Desktop: reserve the left column for copy and compose CG to the right. Perspective reverses this arrangement.
- Portrait: compose CG above the text. The scene selector and controls remain reachable at the bottom.
- Use real loading readiness, not simulated technical logs or invented progress percentages.
- Intro skip, scene index, keyboard navigation, motion pause, and native modal focus handling are required.
- Respect reduced-motion preferences. No automatic sound. Stop continuous rendering while motion is paused.
- Validate all seven scenes, initial load, repeat visits, and widths 320 / 375 / 414 / 768 / 1440.
- Calligraphic glyphs and the existing founder signatures are artwork exceptions to the two UI font families.
