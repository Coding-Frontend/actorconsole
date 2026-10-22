# Contributing

Follow [README.md](README.md) for setup. Use a branch and describe the problem, resulting behavior and validation in your pull request.

Run appropriate checks: `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm test:scripts`. Use mocks and isolated services; never point tests at production. Install with `pnpm install --frozen-lockfile` and update the lockfile for dependency changes.

Document new configuration in example files using harmless placeholders. Keep backend credentials out of frontend workspaces and `NEXT_PUBLIC_*`. Add meaningful behavioral tests and run `pnpm secrets:check` with Gitleaks installed. Optional local protection: install `pre-commit`, then run `pre-commit install` using the included configuration.

Exclude generated binaries, private screenshots, database dumps, real credentials and machine settings. Preserve third-party notices. Contributions use MIT. Report vulnerabilities privately through [SECURITY.md](SECURITY.md).
