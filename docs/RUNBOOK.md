# Operations runbook

Run from your backend checkout with private `.env.production` and installation-specific hostnames/accounts.

## Health and logs

```bash
docker compose --env-file .env.production -f docker-compose.vps.yml ps
docker compose --env-file .env.production -f docker-compose.vps.yml logs --tail 100 api worker mcp web
curl --fail http://127.0.0.1:4200/health/ready
curl --fail http://127.0.0.1:4202/api/health
```

Adjust overridden ports. Verify worker consumption, email and a scoped workspace request. Use staging for browser tests (`E2E_BASE_URL`).

## Backups and rollback

Load `DATABASE_URL` into the backend environment without printing it. The backup script accepts `BACKUP_DIR` and `BACKUP_RETENTION_DAYS`. Keep backups outside the public checkout, restrict access, encrypt stored copies and test restoring to a separate database.

```bash
bash scripts/backup-db.sh
# Only against the intended database, after a fresh backup:
RESTORE_CONFIRM=YES bash scripts/restore-db.sh /private/path/backup.sql.gz
```

Apply pending migrations after restoring older data. Database commands run only on the backend. Follow [deployment instructions](../deployment.instructions.md); retain the previous release source and image tags. The receiver restores the previous frontend and backend images together if a release fails readiness checks after switching starts. Database restoration requires its own backup and validation of potential data loss/schema compatibility.

## Credentials and incidents

Follow [credential handling](CREDENTIALS.md). Revoke leaked tokens/sessions at their issuers, update dependent configuration and restart affected services. Changing `APP_ENCRYPTION_KEY` without migrating encrypted records makes them unreadable.

Preserve request/job IDs and sanitized error reports. Keep credentials and private customer data out of issues/logs. Policies are seeded as drafts for review. User deletion follows suspension and a grace period before worker cleanup; check worker health for overdue deletions.

## Billing and dispatch reconciliation

Apply `20261026120000_billing_operation_integrity` through the normal coordinated migration/release process before starting this billing API/worker version. It adds durable checkout reservations, subscription revisions, request idempotency for actor status operations, and dataset-count freshness. Coordinate API and worker cutover: old writers ignore the new reservations and revisions. This is a rollout prerequisite, not permission to deploy. All 74 migrations were rehearsed on an empty disposable MariaDB 10.11 instance; no production migration was performed by the audit.

`BillingCheckoutOperation` has one current reservation per workspace. `RESERVED` means a checkout is in flight or its response has not been persisted. `UNKNOWN` means the provider may have accepted it. Neither authorizes a second provider create. Preserve the operation ID, mode, product and provider metadata when investigating; reconcile the original remote subscription/checkout first. A matching verified subscription webhook can mark the reservation resolved. Confirmed provider rejections release the failed operation for a new attempt. There is no automated age-based release or operator UI in this batch; unresolved cases require a separately reviewed reconciliation action. Never invent a refund, settlement or access-period decision to clear a reservation.

A cancellation transport/server error similarly remains `cancellation_pending` unless a definitive rejection is known or a verified provider event reconciles it. Repeated cancellation is blocked while uncertain. Do not set it active merely because the request returned an error.

Actor status operations are persisted before Redis submission. A Redis timeout now returns HTTP 202 with the durable operation ID, stable job ID and `dispatchPending:true`; it does not falsely mark the action failed. The existing schedule tick (approximately 30–35 seconds) redrives `QUEUED` rows with the same job ID. Reusing an `Idempotency-Key` with the same body returns the existing operation; conflicting input returns 409. API and worker claims prevent a terminal operation from being silently restarted. A stuck `RUNNING` operation still requires investigation of its owning job; this change does not blindly resubmit an uncertain external mutation.

Subscription expiry reconciliation retains the existing daily retention cadence and period-access policy, but now covers the previously omitted provider terminal statuses and checks the scanned revision/period before downgrading. Run history synchronization rebuilds touched UTC days from stored run IDs. Dataset read failures retain previous counts; `resultCountSyncedAt:null` identifies a count never successfully verified. A truncated provider page is reported as requiring a complete backfill, rather than published as a complete day. Historical cost-source selection and frontend unknown-count presentation are unchanged.
