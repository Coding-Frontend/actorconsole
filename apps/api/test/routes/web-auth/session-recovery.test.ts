import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ token: "", session: vi.fn() }));
vi.mock("@actorconsole/db", () => ({ db: { session: { findUnique: mocks.session } } }));
vi.mock("../../../src/lib/http-context.js", () => ({
  requestCookies: async () => ({ get: () => (mocks.token ? { value: mocks.token } : undefined) }),
}));
vi.mock("../../../src/lib/impersonation.js", () => ({
  ORIGINAL_SESSION_COOKIE: "actorconsole.original-session",
}));
import { canRecoverMimicSession } from "../../../src/lib/session-recovery.js";
const valid = {
  expires: new Date(Date.now() + 60_000),
  impersonatedById: null,
  user: { role: "ADMIN", suspendedAt: null },
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.token = "";
});
it("never queries the database for an anonymous recovery check", async () => {
  expect(await canRecoverMimicSession()).toBe(false);
  expect(mocks.session).not.toHaveBeenCalled();
});
it.each([
  null,
  { ...valid, expires: new Date(0) },
  { ...valid, impersonatedById: "other" },
  { ...valid, user: { role: "USER", suspendedAt: null } },
  { ...valid, user: { role: "ADMIN", suspendedAt: new Date() } },
])("rejects an invalid administrator session %#", async (session) => {
  mocks.token = "private-token";
  mocks.session.mockResolvedValue(session);
  expect(await canRecoverMimicSession()).toBe(false);
});
it("returns only recovery availability for a valid administrator", async () => {
  mocks.token = "private-token";
  mocks.session.mockResolvedValue(valid);
  expect(await canRecoverMimicSession()).toBe(true);
});
