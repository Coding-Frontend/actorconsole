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

Apply pending migrations after restoring older data. Database commands run only on the backend. Follow [deployment instructions](../deployment.instructions.md); retain release source revisions and rebuild older images if needed. Roll back frontend bundles and compatible backend releases separately. Database restoration requires its own backup and validation of potential data loss/schema compatibility.

## Credentials and incidents

Follow [credential handling](CREDENTIALS.md). Revoke leaked tokens/sessions at their issuers, update dependent configuration and restart affected services. Changing `APP_ENCRYPTION_KEY` without migrating encrypted records makes them unreadable.

Preserve request/job IDs and sanitized error reports. Keep credentials and private customer data out of issues/logs. Policies are seeded as drafts for review. User deletion follows suspension and a grace period before worker cleanup; check worker health for overdue deletions.
