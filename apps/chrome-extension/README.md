# ActorConsole Apify Connector

Manifest V3 extension for connecting the current Apify Console session to a selected
ActorConsole workspace. The unpaired sidebar opens on a dedicated ActorConsole sign-in
screen. After pairing is verified, it opens the workspace list by default.
The ActorConsole account, username (when set), email, and **Sign out** action remain
visible above both the workspace list and connection map. Signing out revokes the
extension credential and returns to the welcome screen. If verification is temporarily
unavailable, the welcome screen identifies the saved sign-in and offers sign-out.
Verification failures show the API or network error; retry keeps the saved pairing
unless the API explicitly reports that it expired or was revoked.
Session diagnostics align labels and status values and show **Not checked** for
cookies until an explicit check is requested.
Pending connections show **Allow cookie access and finish** beside the status above
both views. A new request brings that approval into view and closes any open
connection dialog. Older sidebar refreshes cannot overwrite a newer request.
If the website does not receive an extension acknowledgement within 20 seconds,
it offers a retry with instructions to reload the page after installing or updating
the extension. Once approval is submitted, the server controls session expiry while
validating the replacement credential.

Select a workspace, choose an Apify personal account or organization, then review its connection.
Use the connection map icon at the end of the toolbar to see both endpoints, their
account branches, and saved cross links. The view choice is saved in extension storage. Both views
use the same workspace data and connection actions. The map uses curved links and supports
panning, zooming, and fitting the graph to the viewport.
Workspace cards keep their connection action beside the status so each graph row has
clear space around it.
Connection lines have no center labels: green means a current check verified the
Console session and API key, gray means a saved link has not been checked, and
amber means the session or key needs attention.
The connection dialog shows the selected workspace and Apify account, their current status,
one recommended action, and a small recheck icon beside the status. Refresh, manual API key entry,
and disconnect remain under More actions.
Opening a workspace, Apify Console, or the connection handoff from the paired sidebar
uses the active browser tab.
Once a browser session is connected, **Create ActorConsole API key** creates a
dedicated member API key in Apify Console
for the selected workspace, or reuses its existing dedicated key after a retry.
The import accepts either the direct or `data`-wrapped Console response format and
stops before creating a key if the existing-key list has an unknown shape.
A manual ActorConsole input remains available.

After pairing, sign in to Apify Console and reload it. The extension observes the
`/public/authentication/resume` request and response, then shows the signed-in person in
its Chrome side panel. It uses the transient UI token to load the personal profile and
available organizations. Select the Apify personal account or an organization to connect.
The extension saves only the profile and organization names, IDs, and images in
trusted local extension storage. The account list remains visible when Apify Console
is closed or the browser restarts. It is marked as saved until a fresh Apify session
confirms access; connecting and API key import still require that live session.
The workspace list shows every workspace for the paired ActorConsole account. A saved
link and its last known browser-session health appear on each row. The account picker
opens after a workspace is selected. A linked workspace reconnects to its own saved
account. The sidebar automatically checks saved connections on opening and every ten
minutes while open. The recheck icon repeats that request immediately. Each check reports
the browser session, API key, and access to the saved account. A saved link alone is
never displayed as a live confirmation.
Use **Refresh Apify accounts and workspaces** to reload Apify Console and read the
current personal account, organizations, and ActorConsole workspaces again. Connect
an unconfigured workspace or create a new one, then approve cookie access to finish
the handoff.
ActorConsole username, name, and email are shown after pairing; set a username in
ActorConsole profile settings if one has not been configured.
If you start from the dashboard's extension button, the handoff is bound to the
account currently selected in the sidebar when the extension authorizes it.
If a workspace has an API key with an unidentified target, the sidebar opens that
workspace's ActorConsole settings so you can update the key before connecting it.
Expired or missing browser sessions can be reconnected from the connection review.
The connection map supports selecting a workspace and Apify account to connect, selecting a
saved line to check or reconnect, and disconnecting a workspace. Disconnect removes
that workspace's saved Apify credentials, including its API key, after confirmation.
The **Add workspace** action works with or without an Apify session; the optional
connect-after-create choice opens the ActorConsole handoff.

## Security boundary

- Unpacked and published builds can connect with any Chrome extension ID. No
  extension registration or Chrome Web Store publication is required.
- Browser sign-in shows the signed-in account and requires **Authorize browser**.
  The extension polls with a private verifier; only its SHA-256 challenge appears
  in the browser URL. The approval page confirms success after the credential is
  claimed. Pending approvals expire after five minutes; start a new sign-in from
  the sidebar if the connection expires. Older builds retain the one-time bridge
  handoff. The extension API allows every valid `chrome-extension://` origin;
  workspace operations still require a scoped device credential.
- Pairing starts from the sidebar and finishes in an authenticated ActorConsole tab.
  The server issues a scoped, revocable extension credential that is stored only in
  trusted extension storage. The sidebar shows the paired ActorConsole account.
- A workspace handoff must be authorized by that paired extension account before
  ActorConsole accepts the Apify cookie. A different ActorConsole login cannot use
  the paired extension to connect its workspace.
- The Console page observer captures the resume response's user ID and short-lived UI token,
  plus the request's selected account ID when available. It uses the token once to ask
  Apify for the person's profile and accessible organizations, then discards it.
  Public profile lookup is used if the authenticated profile request does not return the account.
- Cookie access is optional and requested when the user checks `ApifyRT` or finishes a
  workspace handoff. The diagnostic check does not connect a workspace.
- Only `ApifyRT` returned for `https://console-backend.apify.com/` is relayed.
- The extension does not persist or log Apify cookies, UI tokens, API keys, cURL text,
  browsing history, or complete network responses. ActorConsole stores the selected cookie
  and any imported API key encrypted in the same workspace credential.
- API key creation runs only after a sidebar action for a workspace with a matching saved
  Console connection. It resumes the selected personal or organization account in an
  open Apify Console tab, creates or finds that workspace's dedicated member key, and
  sends it directly to the paired ActorConsole API. The server verifies that the key
  belongs to the workspace's saved Apify account before encrypting it. The extension
  does not retain the key. Disconnecting a workspace removes ActorConsole's saved key;
  manage or revoke the key itself in Apify Console.
- The extension calls ActorConsole directly to claim, verify, revoke, and authorize its
  scoped pairing, and to list, create, or disconnect workspaces owned by that paired account. The ApifyRT value is relayed through the authenticated web page using a
  five-minute, one-time challenge.
- ActorConsole checks that the cookie resumes the same Apify user displayed in the sidebar
  and that this person can access the selected organization before saving the encrypted
  workspace credential. An existing API key must belong to that same selected account.
- Handoff metadata and the detected account identity are kept in Chrome session storage
  so the side panel can recover if the extension service worker restarts. The detected identity
  expires after 30 minutes. The last cookie check's presence flags, outcome, and time
  are also kept for that Apify user; the sidebar asks for a recheck after ten minutes.
  No cookie value or UI token is stored there.
- Non-secret Apify profile and organization display details are also kept in trusted
  local extension storage. They are cleared when the ActorConsole extension pairing is
  removed. A saved account list never authorizes a workspace connection.
- The sidebar shows the observed Console and backend resume status. A backend request
  made from the Console page counts as an observed Console session. Cookie availability
  is shown after the user explicitly checks it or approves access during a handoff.
  The optional cookie permission is removed after either action.

## Build

```bash
pnpm --filter @actorconsole/chrome-extension build
pnpm --filter @actorconsole/chrome-extension package:store
```

Load `dist/` as an unpacked extension for testing. The Web Store archive is written to
`dist/actorconsole-chrome-extension.zip`.

For a self-hosted build, copy the root `.env.extension.example` to
`apps/chrome-extension/.env.local` and set your website and API origins. The build
uses those values in JavaScript, the manifest permissions, content-script matches,
and the privacy link. HTTPS is required except for localhost development.
Rebuild and reload the extension after changing origins. Publish a separate listing
for your own build and set `NEXT_PUBLIC_CHROME_EXTENSION_URL` on the website.

Deploy the `ApifyExtensionSession` account-target migration and the API/web changes before
installing or publishing extension 0.6.6. The sidebar sends an account target with
each handoff and calls the workspace-scoped check and disconnect routes, so older server
code cannot complete organization connections, verify them, or disconnect a workspace
from the extension. Version 0.6.6 also requires the API's workspace-scoped API key
import route before its import action can complete.

The connection map shows the saved account list after Apify Console closes and labels it
as saved. A fresh Apify session is needed to confirm access before connecting an account.
