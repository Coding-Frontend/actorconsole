import { describe, expect, it } from "vitest";
import { getFirebaseSocialIdentity } from "../../../src/lib/firebase-social.js";

describe("Firebase social identity", () => {
  it("accepts Google and GitHub provider identities", () => {
    expect(
      getFirebaseSocialIdentity({
        sub: "firebase-user",
        firebase: { sign_in_provider: "google.com", identities: { "google.com": ["g-1"] } },
      }),
    ).toEqual({ provider: "firebase-google", providerAccountId: "g-1" });
    expect(
      getFirebaseSocialIdentity({
        sub: "firebase-user",
        firebase: { sign_in_provider: "github.com", identities: { "github.com": ["gh-1"] } },
      }),
    ).toEqual({ provider: "firebase-github", providerAccountId: "gh-1" });
  });

  it("rejects Firebase password and anonymous identities", () => {
    expect(
      getFirebaseSocialIdentity({
        sub: "firebase-user",
        firebase: { sign_in_provider: "password" },
      }),
    ).toBeNull();
    expect(
      getFirebaseSocialIdentity({
        sub: "firebase-user",
        firebase: { sign_in_provider: "anonymous" },
      }),
    ).toBeNull();
  });
});
