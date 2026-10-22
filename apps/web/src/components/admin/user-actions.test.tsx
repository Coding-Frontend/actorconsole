import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/admin/api", () => ({ api: (...args: unknown[]) => mocks.api(...args) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }),
}));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));

import { UserActions } from "./user-actions";

describe("UserActions", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("assigns a validated plan to the selected workspace", async () => {
    mocks.api.mockResolvedValue({ ok: true, data: {} });
    render(
      <UserActions
        user={{
          id: "user_1",
          email: "owner@example.com",
          role: "USER",
          suspendedAt: null,
          businessProfiles: [{ id: "workspace_1", name: "Store team", plan: "FREE" }],
        }}
        canUseSuperAdminActions={false}
      />,
    );

    fireEvent.change(screen.getByLabelText("Access days"), { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText("Plan for Store team"), {
      target: { value: "PRO" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Assign plan for Store team" }));
    expect(mocks.api).not.toHaveBeenCalled();
    expect(screen.getByText("Store team will receive PRO access for 30 days.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Assign plan$/ }));

    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith("/admin/business-profiles/workspace_1/plan", {
        method: "PATCH",
        body: JSON.stringify({ plan: "PRO", days: 30 }),
      }),
    );

    fireEvent.change(screen.getByLabelText("Access days"), { target: { value: "0" } });
    expect(screen.getByRole("alert").textContent).toContain("between 1 and 3650");
    expect(
      (screen.getByRole("button", { name: "Assign plan for Store team" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("confirms before suspending a user", async () => {
    mocks.api.mockResolvedValue({ ok: true, data: {} });
    render(
      <UserActions
        user={{
          id: "user_1",
          email: "owner@example.com",
          role: "USER",
          suspendedAt: null,
          businessProfiles: [],
        }}
        canUseSuperAdminActions={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Suspend user" }));
    expect(mocks.api).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Suspend this user?" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Suspend user" }));
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith("/admin/users/user_1/suspend", {
        method: "POST",
      }),
    );
  });

  it("confirms before reinstating a suspended user", async () => {
    mocks.api.mockResolvedValue({ ok: true, data: {} });
    render(
      <UserActions
        user={{
          id: "user_1",
          email: "owner@example.com",
          role: "USER",
          suspendedAt: "2026-08-01T00:00:00.000Z",
          businessProfiles: [],
        }}
        canUseSuperAdminActions={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Reinstate user" }));
    expect(mocks.api).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Reinstate user" }));

    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith("/admin/users/user_1/reinstate", {
        method: "POST",
      }),
    );
  });

  it("returns to the user directory after permanent deletion", async () => {
    mocks.api.mockResolvedValue({ ok: true, data: {} });
    render(
      <UserActions
        user={{
          id: "user_1",
          email: "owner@example.com",
          role: "USER",
          suspendedAt: null,
          businessProfiles: [],
        }}
        canUseSuperAdminActions
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete user" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete user" }));

    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith("/admin/users/user_1?confirm=owner%40example.com", {
        method: "DELETE",
      }),
    );
    expect(mocks.push).toHaveBeenCalledWith("/admin/users");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
