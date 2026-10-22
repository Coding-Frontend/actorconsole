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
