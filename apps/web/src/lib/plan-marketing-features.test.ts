import { beforeEach, describe, expect, it, vi } from "vitest";
const { load } = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("./backend-data", () => ({ backendData: load }));
import { getPlanMarketingFeatures } from "./plan-marketing-features";
describe("getPlanMarketingFeatures", () => {
  beforeEach(() => { load.mockReset(); });
  it("uses backend plan content including customized empty lists", async () => {
    load.mockResolvedValue({ FREE: [], PRO: ["Priority support"] });
    await expect(getPlanMarketingFeatures()).resolves.toEqual({ FREE: [], PRO: ["Priority support"] });
    expect(load).toHaveBeenCalledWith("plan-features");
  });
  it("uses shared defaults when the API is unavailable", async () => {
    load.mockRejectedValue(new Error("API unavailable"));
    const result = await getPlanMarketingFeatures();
    expect(result.FREE.length).toBeGreaterThan(0);
    expect(result.PRO.length).toBeGreaterThan(0);
  });
});
