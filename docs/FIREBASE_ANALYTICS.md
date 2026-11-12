# Firebase / GA4 measurement

The web app uses the modular Firebase Analytics SDK. `FirebaseAnalytics` in the
root layout records one manual `page_view` for each pathname navigation, including
the current page when a visitor opts into analytics. Product events go through
`apps/web/src/lib/analytics-events.ts`; Firebase loading, consent, delivery, and
debug configuration live in `apps/web/src/lib/firebase.ts`.

## Implementation review

- Firebase initialization, route views, and several activation events already
  existed. There is one Analytics component and no separate gtag or GTM snippet
  in the application source.
- Local web Firebase configuration, including the measurement ID, is present in
  `apps/web/.env.local`. Production configuration and the linked GA4 property
  were inspected on 2026-11-05; deployment and delivery results are recorded below.
- Email registration returns the same response for new and existing addresses.
  It now records `sign_up_requested`; `sign_up` is recorded after successful
  email verification. This avoids counting accepted requests as new accounts.
- Social authentication now distinguishes newly created ActorConsole accounts
  from returning accounts and from linking an existing email account. The
  backend supplies `isNewUser`; Firebase account creation alone is not used as
  proof of an ActorConsole signup. Pending two-factor challenges do not count
  as completed logins.
- Checkout starts at “Upgrade to Pro,” before billing address entry. Provider
  redirects and failures have separate events. Events capture their originating
  route before asynchronous SDK loading or navigation.
- Browser configuration and source code can be reviewed here; the available
  Firebase connector does not provide GA4 reporting or property administration.
  Traffic totals have not been audited. Purchase and refund delivery in the live
  property was verified through Chrome DebugView on 2026-11-05.

## Collection and parameters

Analytics loads only after the existing cookie choice is `all`. Consent is
checked again after asynchronous initialization and before logging. Revocation
disables collection immediately through the GA disable flag and updates SDK
consent. Advertising storage, advertising user data, advertising personalization,
and Google signals remain disabled.

Every browser event includes `page_path`, `page_location`, `page_title`,
`page_referrer`, and `page_group`. Routes use an allowlist of templates; dynamic
segments become `_`, unknown paths become `/_`, and query strings/fragments are
removed. Titles are the constant `ActorConsole`; referrers are blank. This means
the implementation intentionally does not report detailed referrer or query-based
campaign attribution. `page_group` is `marketing`, `auth`, `dashboard`, or `admin`.

Do not send email addresses, account/workspace IDs, Actor IDs/names, search terms,
API keys, tokens, support text, billing addresses, checkout URLs, CSV contents,
or arbitrary error messages. Product parameters are bounded choices, counts,
public SEO scores, and the advertised subscription price/currency. The client
does not set Analytics User-ID. For consented checkout only, the GA client ID,
an optional session ID, and a revocation capability are passed to the backend
so signed payment webhooks can be associated with that browser. The capability
is hashed in the database and is never sent to Google. Payment transaction IDs
sent to GA4 are hashed; application account and payment IDs are not sent.

## Event catalog

| Event                          | Trigger                                                                    | Product parameters                                                                  |
| ------------------------------ | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `page_view`                    | Initial consented route and pathname changes                               | Sanitized page context                                                              |
| `sign_up_requested`            | Email registration request accepted                                        | `method=email`                                                                      |
| `sign_up`                      | Successful email verification or newly created social account/session      | `method=email/google/github`                                                        |
| `email_verified`               | Email verification succeeds                                                | `method=email`                                                                      |
| `login`                        | Returning email/social session established, after any two-factor challenge | `method`                                                                            |
| `generate_lead`                | Contact request delivered                                                  | `form=contact`                                                                      |
| `newsletter_signup_requested`  | Newsletter request accepted, before inbox confirmation                     | None                                                                                |
| `select_plan`                  | Free/Pro pricing CTA or billing upgrade selected                           | `plan`, `source`, optional `billing_interval`                                       |
| `begin_checkout`               | Billing upgrade selected and address form opened                           | `gateway`, `payment_mode`, `billing_interval`, `items`, optional `currency`/`value` |
| `checkout_redirected`          | Provider returns a checkout URL, immediately before navigation             | `gateway`, `payment_mode`, `billing_interval`                                       |
| `checkout_failed`              | Checkout request fails or returns no usable URL                            | Checkout context plus `reason=network/provider/invalid_response`                    |
| `subscription_cancelled`       | API accepts cancellation of future renewals                                | `payment_mode`                                                                      |
| `workspace_created`            | Workspace creation succeeds                                                | None                                                                                |
| `onboarding_step_completed`    | Workspace created or credential/plan step saved                            | `step=workspace/credentials/plan`                                                   |
| `onboarding_completed`         | Final onboarding save succeeds                                             | None                                                                                |
| `apify_connected`              | Apify connection succeeds                                                  | `method=api_key/console/extension`                                                  |
| `actor_optimization_started`   | Optimization request accepted                                              | `kind`                                                                              |
| `actor_optimization_approved`  | Reviewed changes queued                                                    | `queued_count`                                                                      |
| `actor_copy_generated`         | Copy generation succeeds                                                   | None                                                                                |
| `actor_copy_applied`           | Generated copy applied                                                     | None                                                                                |
| `publishing_schedule_created`  | Publishing schedule saved                                                  | `actor_count`, `enabled`                                                            |
| `bulk_actor_operation_started` | Bulk operation accepted                                                    | `actor_count`                                                                       |
| `financial_sync_started`       | Financial sync accepted                                                    | `scope=usage/costs/revenue`                                                         |
| `keyword_search`               | Latest keyword search succeeds                                             | `result_count`; no search text                                                      |
| `watchlist_updated`            | Actor/keyword saved or removed, or Actor alerts changed                    | `item_type`, `action`, optional `alerts_enabled`                                    |
| `seo_audit_completed`          | Valid SEO audit result displayed                                           | `score`                                                                             |
| `seo_audit_failed`             | SEO audit fails, excluding unmount cancellation                            | `reason=timeout/request_failed`                                                     |
| `data_exported`                | Pricing scenario, SEO audit, or watchlist CSV download initiated           | `format=csv`, `export_type`, `row_count`                                            |
| `support_ticket_created`       | Ticket creation confirmed                                                  | Allowlisted `category`                                                              |

`begin_checkout` uses the selected interval's full charge, not a yearly plan's
monthly equivalent. Each `items` entry has `item_id=pro`, `item_name=Pro`, the
interval as `item_variant`, `quantity=1`, and a price when available. `value` and
`currency` are supplied together. `payment_mode` distinguishes test, live, and
unknown configurations; filter revenue-funnel reports to live checkouts.

`checkout_redirected` waits for the GA event callback within a maximum 300 ms
delivery window, including SDK loading. Delivery is best effort; analytics
failures never block a workflow. It is a handoff event, not a confirmed payment.
Address validation/save failures do not emit `checkout_failed` because no provider
checkout request was attempted. `subscription_cancelled` means cancellation at
period end, not a refund or immediate loss of access.

## GA4 console setup

These property settings require access to the linked Google Analytics property;
the code changes do not apply them automatically.

1. Confirm the Firebase web app is linked to the intended GA4 web stream and
   that its measurement ID matches `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` in the
   web **build** environment. Next.js bundles public variables at build time.
2. Turn **Enhanced measurement off** for that stream. This app explicitly emits
   sanitized page views and product outcomes. In particular, automatic history
   page views can duplicate manual views, and automatic site-search, form,
   outbound-click, or file-download tracking can include dynamic URLs or fields
   outside the application's parameter allowlist.
3. Mark `sign_up`, `onboarding_completed`, and `generate_lead` as key events if
   these represent your business conversions. Keep `sign_up_requested` and
   `newsletter_signup_requested` as request-level diagnostics.
4. Register the event-scoped custom dimensions needed for reports:
   `page_group`, `method`, `form`, `plan`, `source`, `billing_interval`, `gateway`,
   `payment_mode`, `step`, `kind`, `scope`, `item_type`, `action`, `export_type`,
   `reason`, `category`, `enabled`, and `alerts_enabled`.
   Register `actor_count`, `queued_count`, `result_count`, `row_count`, and
   `score` as custom metrics with standard numeric units. Built-in ecommerce
   fields such as `currency`, `value`, and `items` use GA4's standard schema.
5. Build funnel explorations for `sign_up_requested → sign_up → apify_connected
→ onboarding_completed` and `select_plan → begin_checkout →
checkout_redirected`. Use `method`, `billing_interval`, and `payment_mode`
   for breakdowns. Keep email request-to-verification funnels separate from
   social signups, which do not emit `sign_up_requested`.

`purchase` and `refund` are sent by the worker from verified payment webhooks,
using the consented checkout's client identity. They are never inferred from a
return URL, a Pro plan, or checkout creation. Existing internal API billing/audit
events remain separate from Firebase Analytics.

## Purchase and refund webhooks

| Provider | Purchase source                                | Settled refund source                                                                                                     |
| -------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Stripe   | `invoice.paid`, `invoice.payment_succeeded`    | `charge.refunded`, `refund.created`, `refund.updated`, legacy `charge.refund.updated`; pending/failed refunds are ignored |
| Razorpay | `subscription.charged` with a captured payment | `refund.processed`                                                                                                        |
| Dodo     | `payment.succeeded`                            | `refund.succeeded`                                                                                                        |

Enable these event types on the existing provider webhook endpoints. Their
existing signatures, mode isolation, and delivery leases remain in force.
Stripe refunds reconcile all successful refunds across the invoice's payment
intents, including current InvoicePayment links and paginated results. Razorpay
refunds reconcile all processed refunds for the payment. Dodo uses its current
payment/refund snapshot. An absent payment ledger causes a retry rather than
silently losing an out-of-order refund confirmation.

Purchase values are the persisted captured amounts in major currency units,
including zero- and three-decimal currency handling. Zero-value invoices and
uncaptured authorizations do not generate purchases. Renewals use a separate
transaction for each new payment. Stripe paid invoice topics share an invoice
key; legacy invoice ledger identifiers are retained when already present.

Refund values are the increase in confirmed cumulative refunds, not a repeated
full total. A payment row lock and database transaction commit the outbox and
confirmation checkpoint together. The checkpoint is independent of
`Payment.refundedAmount`, because admin refund requests can update that ledger
before provider settlement. Repeated or older snapshots do not generate another
refund; a sequence of 3, 3, 8, 2 produces refund events of 3 and 5.

Both events contain a stable hashed `transaction_id`, a deterministic `event_id`,
`currency`, `value`, `gateway`, `payment_mode`, and `billing_interval`. Purchases
include the Pro item with `quantity=1`. Refunds omit item quantities so partial
amounts do not falsely count an entire subscription item as returned. Values
reflect the existing **gross payment ledger**; that ledger has no separate
tax/shipping breakdown, so this integration does not invent one. Reconcile this
gross-value definition with any tax-exclusive finance reports.

### Consent and attribution

The checkout body carries Analytics context only after opt-in and the API also
requires `actorconsole-consent=all`. It validates the numeric GA client/session
IDs and matches the measurement ID to the server's configured stream. SDK
identity collection has a 750 ms deadline; missing identity, blocked analytics,
or unavailable browser storage leaves checkout usable without attribution.

Each checkout stores a fresh browser revocation token before sending its
request. `PaymentAnalyticsAttribution` retains only the token hash, consented
client/session IDs, stream, interval, and ownership association. Captured payments
retain that immutable attribution even if the subscription is replaced later.
Attribution expires after one year, and retention deletes it and its associated
outbox. Account deletion also removes it through database cascades.

On opt-out, the app posts tokens to `/api/billing/analytics/revoke`. This endpoint
is public, rate-limited, and can only disable the matching attribution; it works
after sign-out. It creates a revoked tombstone if checkout has not arrived yet,
so an in-flight request cannot re-enable tracking. GA IDs are erased on
revocation. Failed requests keep their tokens for retry on the next app mount,
navigation, or consent notification. A request already in flight to Google
cannot be recalled. Clearing browser storage without sending revocation cannot
notify the server; account deletion still removes attribution.

### Durable delivery and operations

`PaymentAnalyticsEvent` is a database outbox scanned by an independent 30-second
worker tick in Redis and database modes. No Google request runs inside the
payment webhook or its financial transaction. Concurrent workers claim leased
rows; duplicate webhook topics and delivery replays upsert deterministic event
IDs. Pending refunds wait until the original purchase has been delivered.

Purchases retry transport errors/server errors with exponential backoff and the
same transaction ID. HTTP 429 retries both event types. A refund transport error,
server error, or interrupted sending lease is marked **`uncertain`**: Google may
already have accepted it, and purchase-style deduplication is not assumed for
multiple partial refunds. Reconcile these rows with the GA4 export using
`event_id` before deciding whether to retry; do not blindly reset them. Permanent
HTTP failures are `discarded`. A `sent` status means Google returned HTTP success,
not that GA4 validated every parameter; use its validation endpoint and reports.

Delivery rechecks consent, ownership, stream, expiry, and test/live mode.
Events older than 72 hours are discarded rather than moved into current revenue.
Session IDs are attached only within 24 hours of session start; later renewals
and refunds use client identity without extending the original browser session.
Ad user data and ad personalization are explicitly denied. API-secret-bearing
request URLs and transport error strings are never logged.
Automatic OpenTelemetry HTTP/fetch tracing is suppressed for Measurement Protocol
requests because the protocol places its API secret in the query string.

### Rollout

1. Apply `20261105133000_payment_analytics` through the normal database migration
   deployment before starting the new API and worker. Generate the Prisma client
   and build the database package. This implementation does not apply migrations
   to a live database.
2. Set server `GA4_MEASUREMENT_ID` on the API and worker to the same web stream as
   `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`. Set `GA4_API_SECRET` on the worker using a
   Measurement Protocol API secret created for that stream. Never put the secret
   in a `NEXT_PUBLIC_*` variable or the frontend environment.
3. Restart the API/worker and deploy the updated browser bundle together. Leave
   `GA4_INCLUDE_TEST_PAYMENTS=false` for production. To validate a test gateway,
   use a separate GA4 test property and explicitly enable the flag on API/worker;
   its payment events include `debug_mode=true`.
4. Complete a consented test checkout, then partial and full refunds through
   the provider. Inspect the captured ledger, outbox, and GA4 DebugView/export.
   Verify the original transaction ID, incremental refund values, replay
   deduplication, and opt-out before dispatch. Check `uncertain`/`discarded` rows.

With no API secret, outbox events remain pending until configured or expired;
payment processing remains independent of Google's availability. Existing
subscriptions/payments without consented checkout attribution are not backfilled.

## Verification

For local testing, set `NEXT_PUBLIC_FIREBASE_ANALYTICS_DEBUG=true` in
`apps/web/.env.local` and restart Next.js. The flag adds `debug_mode=true` to
application events only when explicitly enabled. Leave it unset or `false` for
normal builds. For a deployed build, the Google Analytics Debugger browser
extension is another way to enable DebugView without rebuilding.

1. Open Firebase Analytics **DebugView**, then the app in a browser with a clean
   consent record. Confirm that optional Analytics is not loaded before consent
   or with “Essential only.”
2. Accept analytics and confirm one sanitized `page_view`. Navigate between
   routes, including two different Actor detail pages; each navigation should
   record one view with dynamic identifiers replaced by `_`.
3. Exercise registration, verification, login/2FA, onboarding, plan selection,
   checkout errors and handoff, SEO, keyword search, watchlists, exports, and
   support. Inspect the event parameters; credentials and entered text must be
   absent. Use a test gateway and inspect `payment_mode=test` for checkout.
4. Revoke consent and repeat an action; no application event should be sent.
   Check cross-tab revocation as well.
5. Configure a developer-traffic data filter in GA4 as appropriate. Debug mode
   alone should not be treated as a guarantee that test traffic is excluded
   from reporting or BigQuery exports.

Regression tests cover consent races, unsupported browsers, route sanitization,
originating-page attribution, navigation delivery bounds, social account
classification, signup verification, and checkout outcomes.

## Production verification — 2026-11-05

Release `883b5902721ba3f608239cd4b6b4b0eb591660c7` was deployed through
[PR #83](https://github.com/Coding-Frontend/actorconsole/pull/83) after CI,
secret scanning, build, and authenticated browser checks passed. API, worker,
web, and MCP image revisions and public health were verified.

- The linked Firebase project is `actor-console`, GA4 property `548436142`, web
  stream `15378401611`, measurement ID `G-NQ8L75Y117`.
- A Measurement Protocol secret was created for that stream and configured in
  the private server environment. Its value is not recorded in this document.
  Both API and worker were checked after deployment.
- Migration `20261105133000_payment_analytics` was applied after a database
  backup. Backup gzip integrity, file permissions, and migration checksum passed.
- Event dimensions `gateway`, `payment_mode`, and `billing_interval` were
  registered in the GA4 property for payment reporting.
- A dedicated fixture completed a Dodo sandbox checkout with an official test
  card, followed by a settled full refund. Actual signed `payment.succeeded` and
  `refund.succeeded` provider webhooks were processed. The ledger and outbox
  contained one USD 19 purchase and one USD 19 refund; the worker sent each once.
  Both events appeared in DebugView with the same transaction ID, currency, and
  value.
- Each webhook was replayed with a new signed delivery ID, then repeated with
  that same ID. Responses were HTTP 200, repeated delivery IDs were acknowledged
  as duplicates, and the analytics outbox remained at exactly two events.
- The public consent-revocation endpoint returned HTTP 200, the attribution's
  client/session IDs were cleared, the test subscription was cancelled at Dodo,
  and the fixture account was suspended. API and worker were restored to
  `GA4_INCLUDE_TEST_PAYMENTS=false`; the selected Dodo checkout mode remains live.

This explicit end-to-end check sent the two sandbox events to the linked
production stream with `payment_mode=test` and `debug_mode=true`. It made no live
charge. The verification transaction ID is
`ac_fd5eb9775295e415e261d83dccaa7b1f5b9e2ceb9c51139d8b8d7c9ea9a44fb3`.
Use that ID or payment-mode reporting to distinguish this fixture from customer
revenue; debug mode alone does not guarantee exclusion from reports. Stripe and
Razorpay handlers passed automated tests, but those disabled/unconfigured
gateways were not exercised against their provider sandboxes.

## References

- [Firebase web Analytics setup](https://firebase.google.com/docs/analytics/web/get-started)
- [Firebase web event logging](https://firebase.google.com/docs/analytics/web/events)
- [GA4 recommended event schema](https://developers.google.com/analytics/devguides/collection/ga4/reference/events)
- [Manual page views and enhanced measurement](https://developers.google.com/analytics/devguides/collection/ga4/views)
- [Firebase Analytics JavaScript API](https://firebase.google.com/docs/reference/js/analytics)
- [DebugView](https://firebase.google.com/docs/analytics/debugview)
- [GA4 Measurement Protocol](https://developers.google.com/analytics/devguides/collection/protocol/ga4)
- [Measurement Protocol validation](https://developers.google.com/analytics/devguides/collection/protocol/ga4/validating-events)
- [Stripe invoice payments](https://docs.stripe.com/api/invoice-payment/list)
- [Stripe refunds](https://docs.stripe.com/api/refunds/list)
- [Razorpay refund webhook events](https://razorpay.com/docs/webhooks/refunds)
