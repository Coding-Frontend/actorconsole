import { isApifyResumeUrl, parseApifyResumeSession, parseResumeViewedUserId } from "./apify-resume";
import { APIFY_RESUME_SOURCE, APIFY_SESSION_CLEARED, APIFY_SESSION_DETECTED } from "./messages";

// Runs in Apify Console's MAIN world so it can observe the response body of
// the page's own authentication/resume fetch or XHR. No requests are modified.
const nativeFetch = window.fetch;
window.fetch = function (...args: Parameters<typeof fetch>): ReturnType<typeof fetch> {
  const request = args[0];
  const url =
    typeof request === "string" ? request : request instanceof URL ? request.href : request?.url;
  const promise = Reflect.apply(nativeFetch, window, args) as Promise<Response>;
  if (isApifyResumeUrl(url, window.location.href)) {
    let viewedUserId: Promise<string | null> = Promise.resolve(null);
    try {
      viewedUserId = args[1]?.body !== undefined
        ? Promise.resolve(parseResumeViewedUserId(args[1].body))
        : request instanceof Request
          ? request.clone().text().then(parseResumeViewedUserId).catch(() => null)
          : Promise.resolve(null);
    } catch {
      // A consumed Request body must never change the page's fetch behavior.
    }
    void promise
      .then(async (response) => {
        if (response.status === 401 || response.status === 403) {
          emitCleared();
        } else if (response.ok) {
          void response
            .clone()
            .json()
            .then(async (body) => emitSession(body, await viewedUserId))
            .catch(() => undefined);
        }
      })
      .catch(() => undefined);
  }
  return promise;
};

const observedXhrs = new WeakSet<XMLHttpRequest>();
const nativeOpen = XMLHttpRequest.prototype.open;
const nativeSend = XMLHttpRequest.prototype.send;

XMLHttpRequest.prototype.open = function (
  method: string,
  url: string | URL,
  ...rest: unknown[]
): void {
  if (isApifyResumeUrl(url, window.location.href)) observedXhrs.add(this);
  Reflect.apply(nativeOpen, this, [method, url, ...rest]);
};

XMLHttpRequest.prototype.send = function (...args: Parameters<XMLHttpRequest["send"]>): void {
  if (observedXhrs.has(this)) {
    this.addEventListener(
      "loadend",
      () => {
        if (this.status === 401 || this.status === 403) {
          emitCleared();
        } else if (this.status >= 200 && this.status < 300) {
          try {
            const body =
              this.responseType === "json" ? this.response : JSON.parse(this.responseText);
            emitSession(body, parseResumeViewedUserId(args[0]));
          } catch {
            // A malformed response cannot identify an account.
          }
        }
      },
      { once: true },
    );
  }
  Reflect.apply(nativeSend, this, args);
};

function emitSession(body: unknown, viewedUserId: string | null): void {
  const session = parseApifyResumeSession(body);
  if (!session) return;
  window.postMessage(
    { source: APIFY_RESUME_SOURCE, type: APIFY_SESSION_DETECTED, payload: { ...session, viewedUserId } },
    window.location.origin,
  );
}

function emitCleared(): void {
  window.postMessage(
    { source: APIFY_RESUME_SOURCE, type: APIFY_SESSION_CLEARED },
    window.location.origin,
  );
}
