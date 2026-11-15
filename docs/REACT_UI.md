# React UI components

This repository originally used plain TypeScript + Vite and custom CSS, with no
React, Tailwind or shadcn configuration. It now supports React TSX, Tailwind v4
through @tailwindcss/vite, and shadcn's components.json conventions.

Paths:
- Reusable UI: /components/ui (alias @/components/ui)
- Demo: /components/demo.tsx and /src/button-demo.tsx
- Shared class utility: /lib/utils.ts
- Component styles: /src/styles/ui.css
- Existing map styles: /src/styles/app.css and /src/styles/tokens.css

The /components/ui folder gives shadcn CLI and consumers a consistent location
for reusable primitives; it avoids mixing app-specific map controllers with UI
components. TypeScript and Vite both resolve @/ to the repository root.

Run npm ci and npm run dev, then open /buttons.html for the interactive demo.
The production build includes the same /buttons.html page. CSS is split per entry
and the UI entry deliberately omits Tailwind Preflight to preserve existing map
styles. No image assets, icons, providers, or external state manager are required.

Usage:

```tsx
import { LiquidButton } from '@/components/ui/liquid-glass-button';
<LiquidButton onClick={save}>Save</LiquidButton>
<LiquidButton asChild><a href="/">Map</a></LiquidButton>
```

Button accepts native button props, variant/size and asChild. LiquidButton adds
sizes xl/xxl, unique per-instance SVG filters, a CSS blur fallback, keyboard focus,
disabled styling and reduced-motion support. MetalButton preserves consumer
pointer handlers, resets on pointer cancellation/blur and supports six finishes.
SVG backdrop-filter support varies by browser; Safari gets a CSS blur fallback.

To add further shadcn primitives, run `npx shadcn@latest add <component>` from this
root, reviewing generated theme edits before merging. Do not reinitialize over
this project's existing configuration. For a fresh Vite project, install React,
TypeScript and Tailwind's Vite plugin, enable react-jsx and matching aliases,
then use `npx shadcn@latest init`. These steps have already been applied here.

The demo is a separate integration surface; applying these buttons to existing
map controls should be done at the specific control requested by the product owner.
