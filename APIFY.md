# Apify integration

The backend uses `packages/apify` with the [official Apify API](https://docs.apify.com/api/v2). Configure `APIFY_API_BASE_URL` and optional backend `APIFY_API_TOKEN`. Workspace credentials are entered through the application and stored encrypted.

```bash
curl --fail --silent --show-error https://api.apify.com/v2/users/me -H "Authorization: Bearer ${APIFY_API_TOKEN}"
```

Some features use separate Console endpoints, which may change independently. The optional extension lets users explicitly connect a session to a selected workspace.

Never commit browser captures, cookies, refresh tokens, HAR files or real account payloads. Use fabricated fixtures. `APIFY_UI_TOKEN` and `APIFY_COOKIES` belong only in private backend settings when administrative fallbacks are required.

See [credentials](docs/CREDENTIALS.md), [extension setup](apps/chrome-extension/README.md) and [API coverage](docs/APIFY_CONSOLE_API_COVERAGE.md).
