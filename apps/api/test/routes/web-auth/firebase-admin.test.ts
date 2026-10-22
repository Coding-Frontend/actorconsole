import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const joseMocks = vi.hoisted(() => ({
  jwtVerify: vi.fn(),
  remoteKeySet: vi.fn(),
}));

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => joseMocks.remoteKeySet),
  jwtVerify: joseMocks.jwtVerify,
}));

import { verifyIdToken } from "../../../src/lib/firebase-admin.js";

const originalProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const originalGoogleCloudProject = process.env.GOOGLE_CLOUD_PROJECT;
const originalGcloudProject = process.env.GCLOUD_PROJECT;

beforeEach(() => {
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "actorconsole-test";
  joseMocks.jwtVerify.mockReset();
});

afterEach(() => {
  if (originalProjectId === undefined) delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  else process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = originalProjectId;
  if (originalGoogleCloudProject === undefined) delete process.env.GOOGLE_CLOUD_PROJECT;
  else process.env.GOOGLE_CLOUD_PROJECT = originalGoogleCloudProject;
  if (originalGcloudProject === undefined) delete process.env.GCLOUD_PROJECT;
  else process.env.GCLOUD_PROJECT = originalGcloudProject;
});

describe("verifyIdToken", () => {
  it("verifies Firebase issuer, audience, and algorithm", async () => {
    joseMocks.jwtVerify.mockResolvedValue({
      payload: {
        sub: "firebase-user",
        auth_time: Math.floor(Date.now() / 1000) - 10,
        email: "builder@example.com",
      },
    });

    const decoded = await verifyIdToken("firebase-token");

    expect(decoded.email).toBe("builder@example.com");
    expect(joseMocks.jwtVerify).toHaveBeenCalledWith(
      "firebase-token",
      joseMocks.remoteKeySet,
      {
        algorithms: ["RS256"],
        audience: "actorconsole-test",
        issuer: "https://securetoken.google.com/actorconsole-test",
      },
    );
  });

  it("rejects an invalid subject", async () => {
    joseMocks.jwtVerify.mockResolvedValue({
      payload: { sub: "", auth_time: Math.floor(Date.now() / 1000) - 10 },
    });

    await expect(verifyIdToken("firebase-token")).rejects.toThrow("invalid subject");
  });

  it("rejects a future authentication time", async () => {
    joseMocks.jwtVerify.mockResolvedValue({
      payload: { sub: "firebase-user", auth_time: Math.floor(Date.now() / 1000) + 60 },
    });

    await expect(verifyIdToken("firebase-token")).rejects.toThrow(
      "invalid authentication time",
    );
  });

  it("requires a Firebase project ID", async () => {
    delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    delete process.env.GOOGLE_CLOUD_PROJECT;
    delete process.env.GCLOUD_PROJECT;

    await expect(verifyIdToken("firebase-token")).rejects.toThrow(
      "Firebase project ID is required",
    );
  });
});
