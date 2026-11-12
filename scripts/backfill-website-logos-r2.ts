import { PrismaClient } from "@prisma/client";
import { verifyWebsiteLogoInR2 } from "../packages/logo-catalog/dist/index.js";

const [mode, ...extraArgs] = process.argv.slice(2);
if (extraArgs.length || (mode !== "--copy" && mode !== "--verify")) {
  throw new Error("Specify --copy to copy and verify, or --verify to check R2 only");
}

const db = new PrismaClient();

try {
  let cursor: string | undefined;
  let verified = 0;
  while (true) {
    const logos = await db.websiteLogo.findMany({
      select: { id: true, storagePath: true, checksum: true, byteSize: true },
      orderBy: { id: "asc" },
      take: 100,
      where: cursor ? { id: { gt: cursor } } : undefined,
    });
    if (!logos.length) break;

    for (let start = 0; start < logos.length; start += 8) {
      const results = await Promise.allSettled(
        logos.slice(start, start + 8).map(async (logo) => {
          try {
            await verifyWebsiteLogoInR2(logo, mode === "--copy");
          } catch (error) {
            throw new Error(`Failed to verify logo ${logo.id}`, { cause: error });
          }
        }),
      );
      const failures = results.filter((result) => result.status === "rejected");
      if (failures.length) {
        throw new AggregateError(
          failures.map(({ reason }) => reason),
          "R2 verification failed",
        );
      }
      verified += results.length;
    }
    cursor = logos[logos.length - 1]!.id;
    console.log(`Verified ${verified} website logos`);
  }
  console.log(`Verified all ${verified} website logos in R2`);
} finally {
  await db.$disconnect();
}
