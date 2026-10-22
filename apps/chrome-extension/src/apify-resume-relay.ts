import { parseApifyResumeSession, parseResumeViewedUserId } from "./apify-resume";
import { APIFY_RESUME_SOURCE, APIFY_SESSION_CLEARED, APIFY_SESSION_DETECTED } from "./messages";

window.addEventListener("message", (event: MessageEvent) => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  const message = event.data as { source?: string; type?: string; payload?: unknown };
  if (message?.source !== APIFY_RESUME_SOURCE) return;

  if (message.type === APIFY_SESSION_CLEARED) {
    void chrome.runtime.sendMessage({ type: APIFY_SESSION_CLEARED });
    return;
  }
  if (message.type !== APIFY_SESSION_DETECTED) return;
  const session = parseApifyResumeSession(message.payload);
  if (!session) return;
  void chrome.runtime.sendMessage({
    type: APIFY_SESSION_DETECTED,
    payload: { ...session, viewedUserId: parseResumeViewedUserId(message.payload) },
  });
});
