import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getLogger } from "./logger.js";

/**
 * Tests for the shared structured logger.
 *
 * Pino is configured to write JSON in test mode (NODE_ENV=test). We
 * capture process.stdout.write to verify the output shape.
 */

describe("@actorconsole/shared/logger", () => {
  let spy: { mockRestore: () => void };
  let lines: string[];

  beforeEach(() => {
    lines = [];
    spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      lines.push(String(chunk));
      return true as unknown as boolean;
    });
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it("emits a JSON line with the service name", () => {
    const log = getLogger("api");
    log.info("hello world");
    const joined = lines.join("");
    expect(joined).toContain('"name":"api"');
    expect(joined).toContain('"level":30');
    expect(joined).toContain('"msg":"hello world"');
  });

  it("redacts known sensitive paths", () => {
    const log = getLogger("api");
    log.info({ user: { password: "hunter2" } }, "login");
    const joined = lines.join("");
    expect(joined).toContain("[REDACTED]");
    expect(joined).not.toContain("hunter2");
  });

  it("includes context bindings in JSON output", () => {
    const log = getLogger("api");
    log.info({ userId: "u_42", action: "deploy" }, "user did a thing");
    const joined = lines.join("");
    expect(joined).toContain('"userId":"u_42"');
    expect(joined).toContain('"action":"deploy"');
    expect(joined).toContain('"msg":"user did a thing"');
  });

  it("keeps distinct service identities in the same process", () => {
    const apiLog = getLogger("api");
    const workerLog = getLogger("worker");
    expect(workerLog).not.toBe(apiLog);
    workerLog.info("worker message");
    expect(lines.join("")).toContain('"name":"worker"');
  });
});
