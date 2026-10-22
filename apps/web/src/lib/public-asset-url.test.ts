import { describe, expect, it, vi } from "vitest";
const config = vi.hoisted(() => ({ base: "https://api.actorconsole.com" }));
vi.mock("./api-base", () => ({
  get API_BASE_URL() {
    return config.base;
  },
}));
import { publicAssetUrl } from "./public-asset-url";

describe("published catalog assets", () => {
  it("routes stored logo paths to the Node API on Pages and retains the Next dev proxy", () => {
    expect(publicAssetUrl("/api/website-logo-assets/logo_1")).toBe(
      "https://api.actorconsole.com/website-logo-assets/logo_1",
    );
    config.base = "/api";
    expect(publicAssetUrl("/api/website-logo-assets/logo_1")).toBe(
      "/api/website-logo-assets/logo_1",
    );
    config.base = "https://api.actorconsole.com";
  });
  it("preserves external images, frontend assets and missing sources", () => {
    for (const src of ["https://apify.com/image.png", "/avatar.png", new Blob(), undefined])
      expect(publicAssetUrl(src)).toBe(src);
  });
});
