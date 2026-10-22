export const SESSION_CHANGED_EVENT = "actorconsole:session-changed";
export function notifySessionChanged() {
  window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
}
