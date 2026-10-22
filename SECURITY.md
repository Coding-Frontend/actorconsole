# Security policy

Security fixes target the maintained default branch.

## Reporting

Use **Security → Advisories → Report a vulnerability** when maintainers enable private reporting. If unavailable, ask a maintainer for a private channel without posting vulnerability details. Include the affected revision, impact, minimal reproduction and sanitized evidence. Keep credentials, customer data and exploit details out of public issues.

## Maintainer setup

Enable private vulnerability reporting, secret scanning and push protection in the new repository. Require CI/secret-scan checks on the default branch. Store deployment secrets in a protected environment with required reviewers.

Revoke exposed credentials at their issuers. Deleting local Git history does not revoke credentials or erase old remotes, clones, CI artifacts or backups. Follow [GitHub's cleanup guidance](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository).
