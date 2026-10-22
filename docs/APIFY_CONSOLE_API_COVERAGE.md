# Apify Console API coverage

Verified on 2026-08-12 against an authenticated Apify Console organization. This document records
the contracts ActorConsole uses or has verified. It intentionally contains no credentials, cookie
values, user IDs, organization IDs, or payment-method data.

Apify's public REST API is the authoritative surface for Actor ownership and writes. Console
backend endpoints and Socket.IO publications are internal Console contracts and may change without
versioning, so every Console feature must fail independently and must never hide working REST data.

## Authentication boundaries

| Credential     | Use in ActorConsole                                                                  | Must not be used as                                 |
| -------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------- |
| Apify API key  | Owned Actors, builds, runs, datasets, key-value stores, request queues, Store writes | A substitute for Console account analytics          |
| Apify UI token | Console organizations, owner analytics, proxy/billing context, notifications         | Proof that the token owns an Actor or may write it  |
| ApifyRT cookie | Exchanged at `/public/authentication/resume` for a short-lived UI token              | A permanent credential or an Actor write credential |

ActorConsole validates an API key with both `/v2/users/me` and a small owned-Actor inventory
request. Console-only credentials are validated through Store search plus organization access. When
both Console methods exist, a healthy UI token is preferred and a failed UI token no longer shadows
healthy cookies. Publication and schedule execution remain API-key operations.

An Actor-specific Console `403 insufficient-permissions` can mean the UI token is scoped to a
different organization. ActorConsole falls back to the workspace API key for that Actor and does
not mark the UI token or cookies invalid. If the API key cannot read the Actor either, the user must
connect an API key from the Actor's owning Apify user or organization.

## Verified surfaces

| Console page  | Verified transport/contracts                                                                                                                                                                                                                                                                                                                                                                                                                                      | ActorConsole coverage                                                                                                                                           |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| My Actors     | `/actor/search`, `/actors/generateNewActorName`, `/actor-analytics/monthly-marketing`, `myActorsPub`                                                                                                                                                                                                                                                                                                                                                              | Owned Actor sync and the `/apify/operations` Actor count use the public REST API. Actor writes always use the owning API key.                                   |
| Runs          | `runsPub`, `/users/has-run-and-suggestion`; public REST `/v2/actor-runs` and Actor run lists                                                                                                                                                                                                                                                                                                                                                                      | Run sync, current run status, and operations count are implemented.                                                                                             |
| Insights      | `/actor-analytics/actor-breakdown`, `/actor-analytics/export`, `/actor-analytics/shared-runs`, `/actors/find-users-owned-actors-by-text`, `/actor-analytics/costs-per-thousand-results`, `/actor-analytics/costs-per-thousand-results/last-30-days`, `/actor-analytics/profit-margin`, `/actor-analytics/run-statistics/monthly/all-users`, `/actor-analytics/user-count-statistics`                                                                              | Actor analytics, daily chart metrics, quality, costs, users, runs, and profit-margin reads are implemented with independent fallbacks.                          |
| Proxy         | `/billing/monthly-usage-cycles`, `/users/proxy-stats/daily`, `/users/proxy-stats/domains`, `/users/proxy-stats/groups`                                                                                                                                                                                                                                                                                                                                            | Billing-cycle availability is shown in the Apify operations summary. Detailed traffic/domain/group UI remains a future product surface.                         |
| Storage       | `datasetsPub`, `keyValueStoresPub`, `requestQueuesPub`; public REST `/v2/datasets`, `/v2/key-value-stores`, `/v2/request-queues`                                                                                                                                                                                                                                                                                                                                  | Independent dataset, key-value-store, and request-queue totals are implemented in the operations summary.                                                       |
| Organizations | `/organizations`, `/iam-access-keys`, `/iam-access-keys/organization-access-keys`                                                                                                                                                                                                                                                                                                                                                                                 | Available organization count is implemented. Access-key payloads are deliberately not copied or exposed.                                                        |
| Billing       | `/billing/actor-usage-breakdown`, `/billing/monthly-usage-cycles`, `/billing/rental-actor-usage-stats`, `ownInvoicesPub`, `/users/billing-info`, `/invoices/unpaid-info`, `/users/current-service-usage`, `/users/current-billing-cycle/billing-cycle-full-info`, `/users/current-billing-cycle/paid-actor-usage-breakdown`, `/users/current-billing-cycle/service-breakdown`, `/users/current-billing-cycle/plan-usage-info`, `/users/calendar-month-usage-info` | Usage/cost reporting and current service-group availability are implemented. Payment methods and 3-D Secure payloads are intentionally excluded.                |
| Notifications | Socket.IO `userUiNotificationsPub`; PUT mark displayed/read/read-all endpoints                                                                                                                                                                                                                                                                                                                                                                                    | Console notifications are merged into the ActorConsole notification center, labelled by source, linked only to safe Apify Console URLs, and can be marked read. |

## Notification contract

The initial `userUiNotificationsPub` snapshot is normalized to:

```text
{ _id, userId, kind, createdAt, subject, body, url?, channels?.ui,
  deliveryStatus?.ui?.displayedAt/readAt }
```

ActorConsole disconnects after the initial snapshot. A feed failure falls back to local workspace
notifications. Read operations use:

- `PUT /user-notifications/mark-notification-as-displayed-in-ui/:id`
- `PUT /user-notifications/mark-notification-as-read-in-ui/:id`
- `PUT /user-notifications/mark-all-notifications-as-read-in-ui`

## Reliability rules

1. API-key and Console availability are reported separately.
2. One failed resource does not erase successful resources.
3. Credential values are never returned after storage or written to logs.
4. Actor writes require an API key that owns the Actor.
5. Console-only endpoints remain read-only except notification acknowledgement calls.
6. Internal Console contract failures degrade to an unavailable section instead of failing the
   complete Apify connection page.
