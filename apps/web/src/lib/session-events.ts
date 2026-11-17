export const SESSION_CHANGED_EVENT = "actorconsole:session-changed";
export const ANONYMOUS_SESSION_KEY = "actorconsole:anonymous-session-until";

export function clearAnonymousSession() {
  try {
    window.localStorage.removeItem(ANONYMOUS_SESSION_KEY);
  } catch {
    // Session verification still works without browser storage.
  }
}

export function notifySessionChanged() {
  clearAnonymousSession();
  window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
}
