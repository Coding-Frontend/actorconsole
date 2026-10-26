# Dodo Payments configuration

Configure your own Dodo account, brand, products and webhook endpoints separately for test and live environments. Keep business, brand, product and endpoint IDs in private deployment settings or encrypted admin records. Prices come from the products verified in your own account.

## Admin settings

In **Admin → Payment gateways**, select the Dodo Payments environment. Configure its API key, webhook secret, brand ID, monthly and yearly product IDs, and callback URL. Save and test the selected profile before activating it for new checkouts.

The **Monthly Pro plan** and **Yearly Pro plan** each have an editable product ID and a **Verify and save** action. Verification checks the product's brand and billing interval and imports its price. Edit pricing in Dodo and verify the matching plan again to refresh it. New checkout requires an explicit monthly or yearly interval. Existing subscriptions retain their original environment for cancellation and webhook processing.

Optional backend environment fallbacks are listed in `.env.example`: `DODO_TEST_*` and `DODO_LIVE_*`. Real API keys and webhook signing secrets must remain outside Git.

## Webhooks

Configure endpoints on your own public API origin:

- Test: `https://api.example.com/billing/webhooks/dodo?mode=test`
- Live: `https://api.example.com/billing/webhooks/dodo?mode=live`

The handler supports `subscription.*`, `payment.succeeded`, `payment.failed`, and `refund.succeeded`. Configure signing secrets independently for both profiles. Validate a signed sample delivery in each environment before enabling live checkout.

Set each checkout callback to your own web origin, for example `https://app.example.com/dashboard/settings/billing`. Keep endpoint IDs and delivery payloads in private operator records.

## Retry and checkout recovery

Checkout creation now reserves one durable operation per workspace before calling a provider. A timeout or uncertain response retains that reservation; repeated checkout cannot silently create another subscription. Stripe receives the stable operation ID as its supported idempotency key. The installed Dodo SDK does not configure an idempotency header, so checkout creation disables automatic SDK retries and relies on the durable reservation. No unsupported Razorpay/Dodo idempotency header is invented.

A successfully verified webhook can reconcile the reservation to its provider subscription. Until that happens, an unknown outcome needs support review against the original operation ID and provider metadata. Do not clear the reservation just because it is old, or issue another create before resolving the first outcome. No automatic retry of an unknown create is supplied by this change.

Signed subscription notifications reconcile the provider's current state; a local revision guard rejects an older in-flight snapshot if another event, cancellation, or renewal changed the row. Failed/interrupted delivery attempts remain retryable, while completed delivery IDs are acknowledged as duplicates. These semantics require the additive billing-operation migration before the updated API and worker run.

Amounts and currencies are read from provider metadata using the shared minor-unit table. The change does not reprice products or rewrite historical payment records. Provisional-access and grace-period policy is preserved; provider sandbox acceptance remains an operator verification step.
