import { describe, it, expect } from "vitest";
import * as dbModule from "./index.js";

/**
 * Smoke tests for the @actorconsole/db barrel.
 *
 * Skipped if Prisma client hasn't been generated (CI first run before
 * `pnpm db:generate`). Run `pnpm --filter @actorconsole/db generate`
 * locally to enable.
 *
 * We detect availability by checking that the Prisma namespace exports
 * a real symbol (UserScalarFieldEnum is generated for any model named
 * User). If generation hasn't run, the namespace is empty.
 */

const prismaAvailable = (() => {
  try {
    const ns = dbModule.Prisma as unknown as Record<string, unknown>;
    return typeof ns === "object" && ns !== null && "UserScalarFieldEnum" in ns;
  } catch {
    return false;
  }
})();

describe.skipIf(!prismaAvailable)("@actorconsole/db", () => {
  it("re-exports Prisma namespace with model enums", () => {
    expect(dbModule.Prisma).toBeDefined();
    expect(
      (dbModule.Prisma as unknown as { UserScalarFieldEnum: unknown }).UserScalarFieldEnum,
    ).toBeDefined();
  });

  it("exports a PrismaClient instance", () => {
    expect(dbModule.db).toBeDefined();
    expect(typeof (dbModule.db as unknown as { $connect: unknown }).$connect).toBe(
      "function",
    );
  });

  it("re-exports Prisma model enums (Plan)", () => {
    expect(dbModule.Plan).toBeDefined();
  });
});
