import { z } from "zod";
import { isIP } from "node:net";

const originList = z.string().superRefine((value, ctx) => {
  const origins = value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (origins.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "at least one origin is required" });
    return;
  }
  for (const origin of origins) {
    try {
      const parsed = new URL(origin);
      if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== origin) {
        throw new Error("not an origin");
      }
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `invalid origin: ${origin}` });
    }
  }
});

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_HOST: z.string().min(1).default("0.0.0.0"),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    DATABASE_URL: z.string().min(1).optional(),
    REDIS_URL: z.string().min(1).optional(),
    AUTH_URL: z.string().url().optional(),
    SUPPORT_EMAIL: z.string().email().optional(),
    CORS_ORIGINS: originList.default("http://localhost:8080,http://localhost:3001"),
    TRUSTED_PROXY_IPS: z.string().default("").refine(
      (value) => value.split(",").every((entry) => !entry.trim() || Boolean(isIP(entry.trim()))),
      "TRUSTED_PROXY_IPS must contain exact comma-separated IP addresses",
    ),
    AUTH_SECRET: z.string().optional(),
    ADMIN_API_KEY: z.string().optional(),
    APP_ENCRYPTION_KEY: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return;
    for (const key of ["DATABASE_URL", "REDIS_URL", "AUTH_URL", "SUPPORT_EMAIL"] as const) {
      if (!env[key]) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `${key} is required` });
      }
    }
    for (const key of ["AUTH_SECRET", "ADMIN_API_KEY", "APP_ENCRYPTION_KEY"] as const) {
      if (!env[key] || env[key]!.length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} must contain at least 32 characters`,
        });
      }
    }
    if (env.AUTH_URL && !env.AUTH_URL.startsWith("https://")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AUTH_URL"],
        message: "AUTH_URL must use HTTPS in production",
      });
    }
    for (const origin of env.CORS_ORIGINS.split(",")) {
      if (!origin.trim().startsWith("https://")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["CORS_ORIGINS"],
          message: "production CORS origins must use HTTPS",
        });
      }
    }
  });

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
    .join("; ");
  throw new Error(`Invalid API environment: ${details}`);
}

export const apiEnv = parsed.data;
