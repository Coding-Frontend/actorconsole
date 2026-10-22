import {
  ACTORCONSOLE_ORIGIN,
  DELIVER_COOKIE,
  EXTENSION_PING,
  EXTENSION_READY,
  EXTENSION_SOURCE,
  HANDOFF_COOKIE,
  HANDOFF_RESULT,
  HANDOFF_REGISTERED,
  HANDOFF_START,
  PAIR_COMPLETE,
  PAIR_RESULT,
  REGISTER_HANDOFF,
  WEB_SOURCE,
  type ExtensionHandoff,
  isExtensionHandoff,
} from "./messages";

if (window.location.origin === ACTORCONSOLE_ORIGIN) {
  let activeHandoff: ExtensionHandoff | null = null;

  function postReady() {
    window.postMessage({ source: EXTENSION_SOURCE, type: EXTENSION_READY }, ACTORCONSOLE_ORIGIN);
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== ACTORCONSOLE_ORIGIN) return;
    const message = event.data as { source?: string; type?: string; payload?: unknown };
    if (message.source !== WEB_SOURCE) return;

    if (message.type === EXTENSION_PING) {
      postReady();
      return;
    }

    if (message.type === PAIR_COMPLETE && window.location.pathname === "/extension/pair") {
      void chrome.runtime.sendMessage({ type: PAIR_COMPLETE, payload: message.payload }).then(
        (result: { ok?: boolean; error?: string }) => {
          window.postMessage(
            {
              source: EXTENSION_SOURCE,
              type: PAIR_RESULT,
              payload: { ok: result.ok === true, error: result.error ?? null, challenge: (message.payload as { challenge?: string })?.challenge },
            },
            ACTORCONSOLE_ORIGIN,
          );
        },
        () => {
          window.postMessage(
            {
              source: EXTENSION_SOURCE,
              type: PAIR_RESULT,
              payload: { ok: false, error: "The extension could not finish pairing.", challenge: (message.payload as { challenge?: string })?.challenge },
            },
            ACTORCONSOLE_ORIGIN,
          );
        },
      );
      return;
    }

    if (message.type === HANDOFF_START && isExtensionHandoff(message.payload)) {
      const handoff = message.payload;
      activeHandoff = handoff;
      void chrome.runtime.sendMessage({ type: REGISTER_HANDOFF, payload: handoff }).then(
        (result: { ok?: boolean; error?: string }) => {
          window.postMessage(
            {
              source: EXTENSION_SOURCE,
              type: HANDOFF_REGISTERED,
              payload: { handoffId: handoff.handoffId, ok: result.ok === true, error: result.error ?? null },
            },
            ACTORCONSOLE_ORIGIN,
          );
          if (!result.ok && activeHandoff?.handoffId === handoff.handoffId) activeHandoff = null;
        },
        () => {
          window.postMessage(
            {
              source: EXTENSION_SOURCE,
              type: HANDOFF_REGISTERED,
              payload: { handoffId: handoff.handoffId, ok: false, error: "The extension could not authorize this handoff." },
            },
            ACTORCONSOLE_ORIGIN,
          );
          if (activeHandoff?.handoffId === handoff.handoffId) activeHandoff = null;
        },
      );
      return;
    }

    if (message.type === HANDOFF_RESULT && isResult(message.payload)) {
      if (activeHandoff?.handoffId !== message.payload.handoffId) return;
      void chrome.runtime.sendMessage({ type: HANDOFF_RESULT, payload: message.payload });
      activeHandoff = null;
    }
  });

  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!message || typeof message !== "object") return;
    const input = message as {
      type?: string;
      payload?: {
        handoffId?: string;
        challenge?: string;
        apifyRt?: string;
        expectedApifyUserId?: string;
      };
    };
    if (input.type !== DELIVER_COOKIE || !activeHandoff) return;
    if (
      input.payload?.handoffId !== activeHandoff.handoffId ||
      input.payload.challenge !== activeHandoff.challenge ||
      typeof input.payload.apifyRt !== "string" ||
      !input.payload.apifyRt ||
      typeof input.payload.expectedApifyUserId !== "string" ||
      !/^[A-Za-z0-9]{8,64}$/.test(input.payload.expectedApifyUserId)
    ) {
      sendResponse({ ok: false, error: "The handoff does not match this ActorConsole page." });
      return;
    }

    window.postMessage(
      { source: EXTENSION_SOURCE, type: HANDOFF_COOKIE, payload: input.payload },
      ACTORCONSOLE_ORIGIN,
    );
    sendResponse({ ok: true });
  });

  postReady();
}

function isResult(value: unknown): value is { handoffId: string; ok: boolean; message: string } {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { handoffId?: unknown; ok?: unknown; message?: unknown };
  return (
    typeof candidate.handoffId === "string" &&
    typeof candidate.ok === "boolean" &&
    typeof candidate.message === "string"
  );
}
