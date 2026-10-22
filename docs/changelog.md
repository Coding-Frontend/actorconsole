# Changelog articles

The public changelog at `/changelog` uses compact dated rows grouped into collapsible months. Category, product-area, year, month and page controls are reflected in the URL. Each update has its own `/changelog/[slug]` article. `/changelog/feed` serves the latest 50 published updates as RSS.

## Authoring

Use `/admin/changelog` to create or edit an update. The editor supports a title, URL slug, public category, detailed change type, product areas, summary, Markdown body, release date and version metadata. The article preview uses the same renderer as the public page. Markdown supports links, screenshots, lists, tables and fenced code blocks; raw HTML is not executed.

New titles generate an editable slug. Slugs become immutable after creation to preserve shared URLs. Duplicate and reserved slugs are rejected. Product areas use lowercase, hyphenated identifiers; up to 12 areas can be assigned to an update.

Save a draft before review, or select publication when saving. The existing publish/unpublish controls remain available. Only published updates are exposed by public listing, detail, related-update and feed queries. Admin request failures preserve the form for retry. Public responses and Next.js fetches keep the existing 60-second refresh policy; upstream caches may also serve stale content briefly.

## Deployment

The VPS receiver applies `packages/db/prisma/migrations/20261005020000_changelog_articles/migration.sql` before starting the matching Next.js and backend images. Follow [deployment.instructions.md](../deployment.instructions.md). For local development, the equivalent migration command is:

```powershell
pnpm --filter @actorconsole/db migrate:deploy
```

Use the backend environment's existing `DATABASE_URL`; database credentials remain outside the frontend. The migration adds article fields and a tag relation, backfills historical titles from existing text, and assigns stable `update-[id]` URLs. Existing entry text, version, date and publication status are preserved. Historical features become new releases; other types become improvements. Historical tags and richer article bodies can be assigned by an administrator.

The legacy `GET /changelog` API remains available with its original version-grouped response. New endpoints are `GET /changelog/entries`, `GET /changelog/entries/:slug` and `GET /changelog/feed`. The listing returns complete year and matching month metadata independently of pagination.

## Verification

API tests cover filters, pagination beyond 200 entries, full month counts, invalid inputs, draft visibility, related articles, legacy fallback, RSS sources, editor validation, immutable URLs and tag replacement. Web tests cover URL controls, filter-dialog focus, Markdown preview, editor payloads and RSS escaping. The local component preview uses illustrative data; it does not access a production database.
