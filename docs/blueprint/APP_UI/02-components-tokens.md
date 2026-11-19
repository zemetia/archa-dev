# App UI — 02: Components and Tokens

← [APP_UI.md](../APP_UI.md) | [Blueprint INDEX](../INDEX.md) | [03 — State →](./03-state.md)

**Phase:** 2. Code: `packages/ui/`, `apps/desktop/src/renderer/styles/app.css`. Follows the Zemetiash component rules.

---

## Component Layers

| Layer | Path | Constraints |
|---|---|---|
| Primitives | `packages/ui/src/<Name>/` | No core client, no stores, no app features |
| Feature components | `apps/desktop/src/renderer/features/<feature>/` | May use stores and the core client |
| Canvas overlays | `apps/desktop/src/renderer/canvas/overlays/` | Performance-critical; avoid React re-render per frame (draw on canvas) |

---

## Four-File Rule (`packages/ui`)

```
Name/
├── Name.tsx            implementation + displayName
├── Name.stories.tsx    Storybook, `satisfies Meta<typeof Name>`
├── Name.test.tsx       Vitest + Testing Library
└── index.ts            barrel only
```

Add `export * from './Name'` to `packages/ui/src/index.ts`. Import only from `@archa/ui`.

---

## CVA Pattern

```tsx
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

const buttonVariants = cva('inline-flex items-center gap-1.5 rounded-md text-sm transition-colors', {
  variants: {
    variant: { primary: 'bg-accent text-on-accent hover:bg-accent-hover', ghost: 'text-fg hover:bg-surface-2' },
    size: { sm: 'h-7 px-2', md: 'h-8 px-3' },
  },
  defaultVariants: { variant: 'ghost', size: 'md' },
});

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, ...props }, ref) => (
  <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
));
Button.displayName = 'Button';
```

Radix primitives for menus, dialogs, popovers, tooltips (one shared `Tooltip` with key caps, per Accent).

---

## UI Tokens

Defined once in `apps/desktop/src/renderer/styles/app.css` with Tailwind v4:

```css
@import 'tailwindcss';
@theme {
  --color-surface: oklch(0.99 0 0);
  --color-surface-2: oklch(0.96 0 0);
  --color-fg: oklch(0.21 0 0);
  --color-fg-muted: oklch(0.55 0 0);
  --color-accent: oklch(0.62 0.19 260);
  --color-on-accent: oklch(0.99 0 0);
  --color-border: oklch(0.9 0 0);
  --radius-md: 6px;
  --font-sans: 'Inter', system-ui, sans-serif;
}
[data-theme='dark'] { --color-surface: oklch(0.18 0 0); /* … */ }
```

| Rule | Detail |
|---|---|
| Colours | Token utilities only (`bg-surface`, `text-fg`). No raw hex/oklch, no Tailwind palette (`bg-gray-100`) — ESLint rule |
| Theme | `data-theme` on `<html>`: `light` \| `dark` \| `system` |
| Density | Compact (default) / comfortable via `--spacing` scale |
| Canvas colours | Selection, guides, agent cursors come from tokens too (`--color-selection`; session cursors `--color-persona-0..7`, picked by `personaColor(name)`) |
| Pickers | Themed `Dropdown` (`renderer/ui/Dropdown.tsx`): icon, description, note, disabled rows, keyboard (↑↓ Enter Esc), opens upward in the composer. No native `<select>` in new UI — Windows draws its popup outside the theme |

These are the **app's** tokens — not the user's document variables.
