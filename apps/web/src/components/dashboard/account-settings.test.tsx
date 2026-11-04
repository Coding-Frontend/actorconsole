import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProfilePage from "@/app/(dashboard)/dashboard/settings/profile/page";
import NotificationPrefsPage from "@/app/(dashboard)/dashboard/settings/notifications/page";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const ok = (data: object) => new Response(JSON.stringify({ ok: true, data }));
const fail = () =>
  new Response(JSON.stringify({ ok: false, error: { message: "Service unavailable" } }), {
    status: 503,
  });
const profile = {
  id: "fixture",
  email: "fixture@example.test",
  name: "Fixture User",
  username: null,
  image: null,
  bio: null,
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  refresh.mockReset();
});

describe("account settings", () => {
  it("does not expose a blank editable profile after a failed load, and preserves edits after failed save", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(fail())
      .mockResolvedValueOnce(ok(profile))
      .mockResolvedValueOnce(fail())
      .mockResolvedValueOnce(ok({ ...profile, name: "Updated Fixture" }));
    vi.stubGlobal("fetch", fetcher);
    render(<ProfilePage />);
    await screen.findByText("Your profile could not be loaded");
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Retry|Try again/i }));
    await screen.findByLabelText("Display name");
    expect(
      (screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "Updated Fixture" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByText("Service unavailable");
    expect((screen.getByLabelText("Display name") as HTMLInputElement).value).toBe(
      "Updated Fixture",
    );
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByText("Profile updated.");
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("focuses actionable field errors without sending an invalid profile", async () => {
    const fetcher = vi.fn().mockResolvedValue(ok(profile));
    vi.stubGlobal("fetch", fetcher);
    render(<ProfilePage />);
    await screen.findByLabelText("Display name");
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "bad name!" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByRole("alert");
    expect(document.activeElement).toBe(screen.getByRole("alert"));
    expect(screen.getByLabelText("Username").getAttribute("aria-invalid")).toBe("true");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("requires real saved preference booleans; retry and failed-save recovery retain the chosen switches", async () => {
    const prefs = { marketing: false, product: true, billing: true, security: true };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(ok({ marketing: null }))
      .mockResolvedValueOnce(ok(prefs))
      .mockResolvedValueOnce(fail())
      .mockResolvedValueOnce(ok({ ...prefs, marketing: true }));
    vi.stubGlobal("fetch", fetcher);
    render(<NotificationPrefsPage />);
    await screen.findByText("Notification preferences could not be loaded");
    expect(screen.queryByRole("switch")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Retry|Try again/i }));
    const marketing = await screen.findByRole("switch", { name: "Marketing & offers" });
    expect(marketing.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(marketing);
    fireEvent.click(screen.getByRole("button", { name: "Save preferences" }));
    await screen.findByRole("alert");
    expect(marketing.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Save preferences" }));
    await screen.findByText("Preferences saved.");
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Save preferences" }) as HTMLButtonElement).disabled,
      ).toBe(true),
    );
  });
});
