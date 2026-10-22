---
applyTo: "apps/web/**"
description: "Instructions for the React frontend and static Cloudflare Pages build."
---

# apps/web — React frontend on Cloudflare Pages

## Stack
- **React 19**, existing Next.js 15 page/component source compiled by Vite for static Pages production
- **Tailwind CSS** with CSS variables design system (light/dark mode via `.dark` class on `<html>`)
- **Radix UI** primitives + custom `components/ui/` wrappers (shadcn/ui pattern)
- **API-owned authentication** (passwords, recovery, two-factor challenges and database sessions on the VPS)
- **Firebase** for Google and GitHub identity verification in the browser
- **Recharts** for analytics charts
- **Sonner** for toast notifications (`<Toaster position="top-center" richColors />`)
- **react-markdown** + `remark-gfm` for rendering markdown
- **lucide-react** for icons

## General Conventions
- **TypeScript strict mode**, ES modules, React 19.
- **Production is static by default.** Async data-loading view functions are compiled into cancellable browser components by `vite.pages.config.ts`. Documentation HTML and fixed public metadata are generated at build time. One narrowly routed Worker renders canonical public builder, Actor, blog and changelog details with a 60-second anonymous HTML cache and retains the legacy extension proxy. All persisted operations go to the Node.js API. The Next.js build remains available for local development/rollback.
- **Import aliases:** `@/components/...`, `@/lib/...`, `@/hooks/...` (configured in `tsconfig.json`).
- **Import frontend packages** by name, such as `@actorconsole/shared`. Do not import `@actorconsole/db`, Prisma, Redis, or backend workspaces. All persisted data comes from the API.
- **No `console.log`** in production code.
- **Environment:** `apps/web/.env.local` for Next.js development. Pages bundles only `NEXT_PUBLIC_*` values; `NEXT_PUBLIC_API_BASE_URL=https://api.example.com`. Use `.env.pages.example`. Keep all secrets on the VPS.

## App Router structure
```
src/app/
  (marketing)/    — Public pages: /, /pricing, /blog, /docs, /changelog, /faq, /legal, etc.
  (dashboard)/    — Authenticated dashboard: /dashboard/actors, /dashboard/schedules, etc.
  admin/          — Admin panel (role-checked in layout.tsx): /admin/actors, /admin/blog, /admin/payments, etc.
  api/            — Thin HTTP proxy routes to the VPS API, including auth
  layout.tsx      — Root layout: Inter + JetBrains Mono fonts, <SessionProvider>, <Toaster>, <CookieConsent>
  page.tsx        — Marketing homepage
  globals.css     — CSS variables (HSL format), Tailwind @tailwind directives
  error.tsx       — Global error boundary
  loading.tsx     — Global loading state
  not-found.tsx   — 404 page
```

### Layout nesting
- `(marketing)/layout.tsx` — Marketing header/footer wrapper
- `(dashboard)/dashboard/` — Dashboard sidebar + topbar layout
- `admin/layout.tsx` — Admin sidebar layout with role check

## Components
- **`components/ui/`** — Primitive wrappers using `class-variance-authority` + `cn()` utility:
  `avatar.tsx`, `badge.tsx`, `button.tsx`, `card.tsx`, `dialog.tsx`, `fade-in.tsx`, `input.tsx`, `label.tsx`, `layout.tsx`, `panel.tsx`, `separator.tsx`, `skeleton.tsx`, `switch.tsx`, `table.tsx`, `tabs.tsx`
- **`components/marketing/`** — Marketing page sections (Hero, Features, PricingCards, Footer, etc.)
- **`components/dashboard/`** — Dashboard-specific components:
  `sidebar.tsx`, `topbar.tsx`, `actor-actions.tsx`, `schedule-form.tsx`, `schedule-dialog.tsx`, `copy-rewrite-dialog.tsx`, `image-gen-dialog.tsx`, `keyword-research.tsx`, `billing-card.tsx`, `pricing-dialog.tsx`, `apify-connect.tsx`, `github-install.tsx`, `github-pat-connect.tsx`, `code-review-list.tsx`, `sync-button.tsx`, `new-ticket-form.tsx`, `ticket-reply-box.tsx`, `mark-all-read-button.tsx`, `announcement-banner.tsx`
- **`components/auth/`** — Auth-related components (login forms, etc.)
- **`components/admin/`** — Admin panel components

### Button variants
```tsx
<Button variant="default" size="lg">      // brand-500 bg, white text
<Button variant="gradient">               // brand-gradient bg with glow shadow
<Button variant="destructive">
<Button variant="outline">
<Button variant="secondary">
<Button variant="ghost">
<Button variant="link">
```

## Key patterns

### `cn()` utility (`src/lib/utils.ts`)
Merges Tailwind classes with `clsx` + `tailwind-merge`:
```ts
import { cn } from "@/lib/utils";
<div className={cn("base-class", isActive && "active-class", className)} />
```

### Auth flow
1. Password registration/login, verification/recovery and two-factor challenges call `/api/auth/*`; the VPS API owns these flows.
2. Google/GitHub sign-in uses Firebase on the client, then sends its ID token to `/api/auth/firebase-session`.
3. The Pages request adapter sends existing `/api/*` fetch calls directly to the VPS. The API verifies identity, persists the session and sets HttpOnly cookies on its own host. Credentialed CORS permits only controlled origins.
4. Cookie names `authjs.session-token` / `__Secure-authjs.session-token` remain for compatibility. Auth.js is no longer a web dependency.
5. Client session state uses `lib/session-client.tsx`. The static `auth` adapter deduplicates only concurrent session reads and retains no previous identity. API cookies cannot be inspected by JavaScript.

### Middleware (`src/middleware.ts`)
This middleware belongs to the retained Next.js build, not Pages production. Static layout guards freshly validate the session and role with the API. In the Next.js build, cookie presence gates `/dashboard/*` and `/admin/*` navigation;
the API validates sessions and roles. Restricted dashboard paths also fetch
`/account/workspace-access` with the caller's cookie, remove browser-supplied
access headers, and redirect restricted workspaces to upgrade. Admin role
enforcement is in `admin/layout.tsx` and at the API layer.

### API calls from server components

Use `authenticatedServerFetch` from `@/lib/server-api` for protected reads. It
forwards the actual caller's cookie and disables caching. Server-side
`credentials: "include"` alone does not forward browser cookies. Never substitute
an admin/service API key for the user's session.

### API calls from client components
```ts
import { API_BASE_URL } from "@/lib/api-base";

const API_BASE = API_BASE_URL; // static build: absolute Node.js API origin
const res = await fetch(`${API_BASE}/actors`, { credentials: "include" });
const { ok, data } = await res.json();
```

### Fonts
- **Inter** (body) — `variable: "--font-sans"`
- **JetBrains Mono** (code) — `variable: "--font-mono"`

### Design system (CSS variables in `globals.css`)
HSL format, light + dark mode. Key tokens: `--background`, `--foreground`, `--primary` (brand-500: 252 87% 58%), `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--ring`, `--warning`, `--success`.

### Tailwind config
Extends `@actorconsole/config/tailwind/tailwind.config` base. Adds `tailwindcss-animate` plugin. Content: `./src/**/*.{js,ts,jsx,tsx,mdx}` + `@actorconsole/**/dist/**`.

## Hooks
- **`use-intersection.ts`** — IntersectionObserver hook. Returns `{ ref, isVisible }`. Options: `threshold`, `rootMargin`, `triggerOnce` (default true).

## Testing
- **Vitest** + `@testing-library/react` + `happy-dom`
- Tests in `test/components/*.test.tsx`

## Scripts
- `pnpm dev` — `next dev -p 8080`
- `pnpm build` — web boundary guard, then `next build`
- `pnpm lint` — `eslint . --max-warnings=0`
- `pnpm test` — `vitest run`

## Deployment

Cloudflare Pages serves static assets; API, worker, MCP and Redis run on the VPS.
Follow `deployment.instructions.md`. Build with `node scripts/build-pages.mjs`
and upload only `apps/web/dist-pages`. The static adapters replace Next.js
navigation, auth and server-read helpers. Only the reviewed public-detail and
extension Worker may be bundled separately; keep its `_routes.json` allowlist
narrow. Never include server secrets, database modules or backend business
logic in either browser assets or the Worker. Deploy
compatible API changes first. Never enable `web-fallback` for routine releases.
