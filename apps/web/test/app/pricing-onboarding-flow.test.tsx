import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  router: { replace: vi.fn() },
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));
vi.mock("sonner", () => ({
  toast: { success: mocks.success, error: mocks.error, warning: mocks.warning },
}));
vi.mock("@/components/dashboard/apify-connect", () => ({
  ApifyConnect: () => <div>Connection setup</div>,
}));
import OnboardingPage from "../../src/app/(dashboard)/dashboard/onboarding/page";
const data = {
  currentStep: "workspace",
  plan: "FREE",
  workspace: null,
  credentials: { apiKeyConfigured: false, uiTokenConfigured: false, cookiesConfigured: false },
};
const workspace = {
  id: "workspace-1",
  name: "New workspace",
  slug: "new-workspace",
  industry: null,
  website: null,
};
function response(value: unknown) {
  return new Response(JSON.stringify({ data: value }));
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/");
});
describe("pricing to workspace setup", () => {
  it.each(["/dashboard/billing", "/dashboard/billing?interval=year"])(
    "returns to %s after creating the required workspace without requiring Apify credentials",
    async (destination) => {
      window.history.replaceState(
        null,
        "",
        `/dashboard/onboarding?callbackUrl=${encodeURIComponent(destination)}`,
      );
      const navigate = vi.spyOn(window.location, "assign").mockImplementation(() => {});
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(response(data))
        .mockResolvedValueOnce(response({}))
        .mockResolvedValueOnce(response({ ...data, currentStep: "credentials", workspace }));
      vi.stubGlobal("fetch", fetchMock);
      render(<OnboardingPage />);
      await screen.findByLabelText("Workspace name");
      fireEvent.change(screen.getByLabelText("Workspace name"), {
        target: { value: "New workspace" },
      });
      fireEvent.submit(screen.getByLabelText("Workspace name").closest("form")!);
      await waitFor(() => expect(navigate).toHaveBeenCalledWith(destination));
      expect(fetchMock.mock.calls[1][0]).toMatch(/account\/business-profiles$/);
      expect(mocks.error).not.toHaveBeenCalled();
    },
  );
  it.each(["/dashboard/billing", "/dashboard/billing?interval=year", "https://evil.example.com"])(
    "completes onboarding with a safe destination %s",
    async (destination) => {
      window.history.replaceState(
        null,
        "",
        `/dashboard/onboarding?callbackUrl=${encodeURIComponent(destination)}`,
      );
      const navigate = vi.spyOn(window.location, "assign").mockImplementation(() => {});
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(response({ ...data, currentStep: "complete", workspace })),
      );
      render(<OnboardingPage />);
      if (destination.startsWith("/dashboard/billing"))
        await waitFor(() => expect(navigate).toHaveBeenCalledWith(destination));
      else await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith("/dashboard"));
    },
  );
});
