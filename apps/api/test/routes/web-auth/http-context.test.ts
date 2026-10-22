import { describe, expect, it } from "vitest";
import { JsonResponse, requestCookies, withRequestContext } from "../../../src/lib/http-context.js";

describe("backend cookie context", () => {
  it("isolates simultaneous requests and preserves multiple cookie headers", async () => {
    const responses = await Promise.all(["one", "two"].map((token) => withRequestContext(
      new Request("https://api.example.test", { headers: { cookie: `authjs.session-token=${token}` } }),
      async () => {
        const store = await requestCookies();
        await Promise.resolve();
        store.set("session-copy", store.get("authjs.session-token")!.value, { path: "/", httpOnly: true });
        const response = JsonResponse.json({ ok: true });
        response.cookies.set("original", token, { path: "/", expires: new Date(Date.now() + 86_400_000) });
        return response;
      },
    )));
    for (const [index, response] of responses.entries()) {
      const token = index ? "two" : "one";
      expect(response.headers.getSetCookie()).toHaveLength(2);
      expect(response.headers.getSetCookie().every((cookie) => cookie.includes(`=${token};`))).toBe(true);
    }
  });
});
