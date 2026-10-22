# Security policy

Security fixes target the maintained default branch.

## Reporting

Use [Report a vulnerability](https://github.com/Coding-Frontend/actorconsole/security/advisories/new) for private reports. Include the affected revision, impact, minimal reproduction and sanitized evidence. Keep credentials, customer data and exploit details out of public issues.

## Maintainer setup

Keep private vulnerability reporting, Dependabot security updates, secret scanning and push protection enabled. Protect `main` with pull requests and the GitHub Actions checks `typecheck + test`, `build` and `scan`, require an up-to-date branch, and apply these controls to administrators. Block force pushes and branch deletion.

Store deployment secrets in the `production` environment restricted to `main`. Successful CI and secret scanning on a push to `main` trigger the VPS deployment automatically. Forks should configure their own repository controls, environment and deployment credentials.

Revoke exposed credentials at their issuers. Deleting local Git history does not revoke credentials or erase old remotes, clones, CI artifacts or backups. Follow [GitHub's cleanup guidance](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository).
