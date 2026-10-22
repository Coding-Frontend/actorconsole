# Credential handling

Keep real values in ignored environment files or hosting secrets. Version only example names and harmless placeholders.

| Configuration | Placement |
| --- | --- |
| Auth/admin/encryption keys, database and Redis credentials | Backend only |
| Payment/webhook keys, email credentials, Apify fallback cookies/tokens, metrics/tracing authentication | Backend environment or encrypted integration records |
| Workspace Apify and dynamic AI provider credentials | Encrypted database records |
| Firebase browser config, public site/API origins, extension origins | Public build settings |
| Firebase project ID for token verification | Backend, matching the frontend project |
| Deployment SSH key and verified host entry | Protected deployment secrets |
| Sentry upload token | Build environment only |

Generate core secrets independently with `openssl rand -hex 32`. Never reuse admin credentials for workspace MCP access. Clear `ADMIN_SEED_PASSWORD` after bootstrap.

## Rotation

Revoke exposed provider tokens and browser sessions at their issuers. Change database passwords through user management, update dependent configuration and restart affected processes. Replacing `AUTH_SECRET` invalidates pending verification/recovery codes; issue fresh codes afterward.

Preserve `APP_ENCRYPTION_KEY` when moving configuration. It protects integration, workspace, AI and two-factor records. To rotate it, inventory every encrypted field and salt/key identifier, decrypt with the old key, re-encrypt in a controlled maintenance migration, verify records, then switch all backend processes. Keep a protected rollback backup until verified. No automatic key migration is provided.

## Before publication

Confirm revocation of the historical database password, authentication signing values and captured Apify credentials/session identified in the private audit. Review the old remote, releases and CI artifacts. A fresh local repository prevents old commits entering the new repository; it does not affect the old remote.

Scan the files being published, enable push protection and verify fresh local credentials. Keep `.cache` audit/recovery files private and configure production credentials separately.
