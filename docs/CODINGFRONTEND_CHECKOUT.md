# CodingFrontend Checkout for ActorConsole

CodingFrontend collects a one-time Razorpay payment for one calendar month or year of ActorConsole Pro. ActorConsole records the payment and activates the purchasing workspace after its signed notification arrives. The workspace returns to Free after the prepaid period. A full processed refund ends the matching period early. Partial refunds update the payment history and leave the access period intact. Test payments appear in billing history without granting live Pro access.

1. Release the CodingFrontend checkout changes and apply D1 migration `0006_signed_partner_checkout.sql`. Add `refund.processed` alongside `order.paid` on its Razorpay webhook.
2. Release the ActorConsole API, web app and worker with the ActorConsole database migration. The migration adds CodingFrontend Checkout with checkout disabled until its plans are configured. Dodo settings, existing subscription management and webhooks remain available.
3. In **CodingFrontend Admin → Checkout → Integrations**, create a separate plan for each desired billing period and environment. To keep the current live prices, use USD 19 monthly and USD 199 yearly. Enter the plan price and currency, enable **Require a signed checkout link from the partner**, and register these URLs using ActorConsole’s public `AUTH_URL` origin:
   - Return: `https://actorconsole.com/dashboard/settings/billing`
   - Webhook: `https://actorconsole.com/api/billing/webhooks/codingfrontend?mode=live` (use `mode=test` for the test integration)
4. In **ActorConsole Admin → Payment gateways → CodingFrontend Checkout**, choose the matching profile. Set the CodingFrontend HTTPS origin and paste the corresponding plan signing secrets. Use `https://codingfrontend.in` for live and a separate CodingFrontend test host for Razorpay Test Mode.
5. Verify and save each plan slug, use **Test connection**, and activate the profile. Run a test order from an ActorConsole staging deployment with the test profile active. Confirm it reaches the workspace payment history before enabling live checkout. The live switch verifies both plans and disables Dodo for new checkouts in the same database transaction. You can later re-enable Dodo from its admin tab.
6. Process refunds from the Razorpay account used by CodingFrontend. Razorpay’s confirmed refund event updates ActorConsole. If capture notification delivery fails, retry the partner webhook for the order from CodingFrontend's Orders screen.

Keep a plan’s signing secret available for late payment and refund notifications. For an interrupted checkout, select the same plan again to reopen the same order. If its price or plan was changed while payment was pending, reconcile the original order before replacing the reservation.
