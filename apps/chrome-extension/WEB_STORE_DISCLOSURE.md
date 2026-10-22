# Chrome Web Store disclosure draft

## Single purpose

Connect an authenticated Apify Console session to the ActorConsole workspace explicitly
selected by the user.

## Data handled

- Authentication information: the short-lived UI token in Apify Console's
  `/public/authentication/resume` response, observed transiently to identify the account, and
  the `ApifyRT` cookie from `console-backend.apify.com` after user approval.
- Account information: the resume request's viewed account ID, the signed-in Apify user ID,
  username, profile name, and picture URL, plus accessible organization IDs, names,
  usernames, and picture URLs for the sidebar account picker.
- Workspace connection metadata: names and IDs of the paired account's workspaces,
  saved Apify account IDs and usernames, credential presence and last known status,
  plus the one-time handoff ID, challenge, workspace name, and expiry. Secret credential
  values are not included in the workspace list.
- ActorConsole account pairing: account ID, name, email, and a scoped extension credential.
- A dedicated member API key when the user explicitly requests its creation or reuse for a
  selected workspace.

## Use and retention

The extension observes Apify Console's authentication resume request and response. It uses
the UI token once to request the signed-in person's profile and accessible organizations from
Apify, then discards the token. If the profile request fails, it tries Apify's public profile
endpoint. Only after a user chooses **Create API key for ActorConsole** does it read the
selected account's access-key list and, when needed, the key-creation response. The detected
identity and sanitized organization list are kept in Chrome session storage for at most 30 minutes.
Non-secret profile and organization display details are also cached in trusted local extension
storage until the ActorConsole pairing is disconnected.

Pairing starts from the sidebar and requires an authenticated ActorConsole browser session.
The web page receives a short-lived pairing code; the extension exchanges it for a scoped,
revocable credential. The credential is stored in trusted Chrome extension storage and is
not exposed to content scripts. It expires after 90 days. The extension checks the paired account before each handoff.
Disconnecting in the sidebar revokes this credential.
Disconnecting an individual workspace in either view removes that workspace's saved
Apify credential from ActorConsole after the user confirms the action.

The extension reads `ApifyRT` only after an explicit user action: a diagnostic check or a
workspace connection. The diagnostic stores only whether the cookie was available on each
Console domain, the check outcome, and its time in Chrome session storage. During a connection,
the extension relays the value once to the authenticated ActorConsole page and does not place
it in extension storage, browser storage, URLs, the clipboard, analytics, or logs. The optional
cookie permission is removed after each check or connection attempt. ActorConsole validates the session and stores the normalized
cookie encrypted for the selected workspace. ActorConsole checks the selected Apify account and
organization membership before saving it. No data is sold, used for advertising, or shared with
data brokers.

After the user requests an API key, the extension sends the newly created or reused key over
HTTPS to the paired ActorConsole account for the selected workspace. ActorConsole validates the
account and stores the key encrypted. The extension does not save the key in Chrome storage,
URLs, the clipboard, analytics, or logs. Disconnecting a workspace removes its saved key from
ActorConsole; the user can revoke the dedicated key separately in Apify Console.

The extension displays its connection flow in a Chrome side panel, with a default workspace
list and an optional connection map. It stores the chosen view mode locally. When the user
checks a saved connection, ActorConsole validates its stored credentials against Apify and
returns credential status and account access without returning secret values. Handoff metadata is kept only
in Chrome session storage until the connection completes or expires; cookie values and UI tokens
are never stored there.

## Requested access

- `cookies`, requested at runtime.
- `sidePanel`, to open the connector beside the active tab.
- `storage`, to retain the paired ActorConsole account and short-lived handoff.
- `scripting`, to create or reuse a dedicated member API key inside the user's open Apify
  Console tab after a sidebar action, then send it to the selected ActorConsole workspace.
- Required host access to `console.apify.com` and `console-backend.apify.com` to observe the resume
  request and response, and identify the signed-in account and accessible organizations.
- Required host access to `api.apify.com` to load the matching account's profile.
- Required host access to the web/API origins configured at build time for account pairing and the authenticated handoff bridge. Use the permissions in your generated manifest when preparing your own store listing.

Privacy policy: https://app.example.com/chrome-extension/privacy
