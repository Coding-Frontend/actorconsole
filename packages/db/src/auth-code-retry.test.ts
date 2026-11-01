import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  count: vi.fn(),
  create: vi.fn(),
  updateMany: vi.fn(),
}));
vi.mock("./client", () => ({
  db: {
    $transaction: mocks.transaction,
    authCode: { count: mocks.count, create: mocks.create, updateMany: mocks.updateMany },
  },
}));
import { issueAuthCode } from "./password-auth";
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("AUTH_SECRET", "isolated-auth-code-test-only");
  mocks.count.mockResolvedValue(0);
});
afterEach(() => vi.unstubAllEnvs());
describe("authentication code transaction recovery", () => {
  it("retries a rolled-back InnoDB deadlock and issues one usable code", async () => {
    mocks.transaction.mockRejectedValueOnce({ code: "P2034" }).mockResolvedValueOnce([]);
    const result = await issueAuthCode("new-user", "VERIFY_EMAIL");
    expect(result.code).toMatch(/^\d{6}$/);
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(mocks.create.mock.calls[0][0].data.tokenHash).toBe(
      mocks.create.mock.calls[1][0].data.tokenHash,
    );
    expect(mocks.create.mock.calls[0][0].data.tokenHash).not.toBe(result.code);
  });
  it("bounds retries when the database remains unavailable", async () => {
    mocks.transaction.mockRejectedValue({ code: "P2034" });
    await expect(issueAuthCode("new-user", "VERIFY_EMAIL")).rejects.toMatchObject({
      code: "P2034",
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(5);
  });
  it("does not retry other failures or bypass the issuance limit", async () => {
    mocks.transaction.mockRejectedValue(new Error("storage failure"));
    await expect(issueAuthCode("new-user", "VERIFY_EMAIL")).rejects.toThrow("storage failure");
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    mocks.count.mockResolvedValue(5);
    await expect(issueAuthCode("new-user", "VERIFY_EMAIL")).rejects.toThrow(
      "AUTH_CODE_RATE_LIMITED",
    );
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });
});
