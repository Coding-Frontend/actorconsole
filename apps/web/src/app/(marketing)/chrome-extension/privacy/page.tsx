import type { Metadata } from "next";
import { Container, Section } from "@/components/ui/layout";
import { PageHero } from "@/components/marketing/page-hero";
import { ChromeExtensionLink } from "@/components/chrome-extension-link";

export const metadata: Metadata = {
  title: "Chrome Extension Privacy — ActorConsole",
  description:
    "How the ActorConsole Apify Connector detects an Apify account and handles the ApifyRT cookie during a workspace connection.",
  robots: { index: true, follow: true },
};

export default function ChromeExtensionPrivacyPage() {
  return (
    <main className="marketing-page flex-1">
      <PageHero
        tone="fog"
        kicker="Chrome extension / privacy"
        title="A single-purpose connection"
        description="The ActorConsole Apify Connector identifies your Apify sign-in and available organizations, then connects your chosen account to a workspace after you approve cookie access."
      />

      <Section variant="muted">
        <Container className="max-w-4xl">
          <div className="mb-6">
            <ChromeExtensionLink />
          </div>
          <article className="prose prose-slate dark:prose-invert border-border bg-card max-w-none border p-6 sm:p-9">
            <h2>What the extension does</h2>
            <p>
              The extension connects an authenticated Apify Console session to an ActorConsole
              workspace. After a workspace is connected, you can also ask the extension to create
              or reuse a dedicated member API key for that workspace. You can enter an API key
              manually in ActorConsole instead.
            </p>

            <h2>Data accessed</h2>
            <p>
              Pairing requires you to sign in to ActorConsole in a browser tab. The extension
              stores a scoped ActorConsole device credential in trusted Chrome extension storage,
              along with the paired account ID, username, name, email, and profile image URL. It checks that pairing before
              each Apify workspace connection. Disconnecting in the sidebar revokes the credential.
              The pairing expires after 90 days unless revoked sooner.
            </p>
            <p>
              While paired, the extension requests that account&apos;s workspace names and Apify
              connection status from ActorConsole. You may select a workspace or create a new one
              from the sidebar. A new workspace is owned by the paired ActorConsole account and
              receives Apify credentials only after the connection completes.
            </p>
            <p>
              On Apify Console pages, the extension observes only the request and response for
              <code>console-backend.apify.com/public/authentication/resume</code>. It reads the
              returned user ID and short-lived UI token, and the request&apos;s viewed account ID
              when present. It uses the token once to request the signed-in person&apos;s profile
              from <code>api.apify.com</code> and accessible organizations from
              <code>console-backend.apify.com</code>, then discards the token. If the authenticated
              profile lookup fails, it tries Apify&apos;s public profile endpoint.
            </p>
            <p>
              After you request a diagnostic check or start a connection and approve Chrome&apos;s
              permission request, the extension checks <code>console.apify.com</code> and{" "}
              <code>console-backend.apify.com</code> for a cookie named <code>ApifyRT</code>. The
              first domain is checked only to provide a useful diagnostic. Only a live cookie
              available to the Console Backend domain is sent.
            </p>
            <p>
              The detected user ID, username, account name, picture URL, selected account ID, and
              available organization IDs, names, usernames, and picture URLs are kept in Chrome
              session storage for up to 30 minutes. Non-secret profile and organization display
              details are also kept in trusted local extension storage so the account list can be
              shown after Chrome restarts. They are cleared when you disconnect the ActorConsole
              pairing. The extension keeps the last cookie check&apos;s availability flags,
              outcome, and time for that detected Apify user in session storage. The sidebar asks
              for a recheck after ten minutes. Cookie values and UI tokens are never stored in
              Chrome storage.
            </p>
            <p>
              The extension also handles a short-lived handoff ID, random challenge, workspace name,
              and expiration time supplied by ActorConsole. This handoff metadata is kept in Chrome
              session storage until the connection completes or expires, so the sidebar can recover
              if Chrome restarts the extension service worker.
            </p>

            <h2>Use, transmission, and retention</h2>
            <p>
              The selected <code>ApifyRT</code> value is relayed once through the authenticated
              ActorConsole page over HTTPS. The extension does not write it to Chrome storage,
              localStorage, the clipboard, URLs, analytics, or logs. ActorConsole validates the
              session, reduces it to the required cookie, encrypts it, and stores it only for the
              selected workspace.
            </p>
            <p>
              If you choose to create an ActorConsole API key, the extension uses the current
              Apify Console session to find an existing dedicated key for that workspace or create
              a new member key in the selected personal account or organization. The key is sent
              directly over HTTPS to the paired ActorConsole account, which verifies that it
              belongs to the workspace&apos;s selected Apify account and stores it encrypted with
              that workspace&apos;s credentials. The extension does not retain the key in Chrome
              storage, URLs, the clipboard, analytics, or logs. Removing the workspace connection
              deletes ActorConsole&apos;s saved key, but does not revoke the key in Apify Console;
              you can manage or revoke it there.
            </p>

            <h2>Data not accessed</h2>
            <p>
              The extension does not inspect browsing history, arbitrary website content, other
              network responses outside the Apify authentication and user-initiated API key flow,
              complete cookie exports, unrelated cookies, cURL data, payment information, or
              advertising identifiers. It does not use the debugger or webRequest APIs and
              contains no third-party tracking or remotely hosted code.
            </p>

            <h2>Sharing and sale</h2>
            <p>
              Authentication data is used only to provide the workspace connection requested by the
              user. It is not sold, used for advertising, shared with data brokers, or used to
              determine creditworthiness.
            </p>

            <h2>User control</h2>
            <p>
              Cookie access is requested at runtime and can be denied or revoked in Chrome. You can
              use ActorConsole&apos;s manual cookie or cURL instructions instead. The extension
              removes its optional cookie permission after each check or connection attempt.
              Disconnecting Apify from the workspace removes its saved credentials from
              ActorConsole. A dedicated API key remains in Apify until you revoke it there.
            </p>

            <h2>Contact</h2>
            <p>
              Questions about the extension or this disclosure can be sent through the ActorConsole
              contact page. The general ActorConsole privacy policy also applies to account and
              workspace data.
            </p>
          </article>
        </Container>
      </Section>
    </main>
  );
}
