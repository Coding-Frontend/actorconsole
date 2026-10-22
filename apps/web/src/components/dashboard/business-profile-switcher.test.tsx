import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { route, navigate } = vi.hoisted(() => ({
  route: { path: "/dashboard/actors" },
  navigate: vi.fn(),
}));
vi.mock("next/navigation", () => ({ usePathname: () => route.path }));
vi.mock("@/lib/client-navigation", () => ({ navigateInApp: navigate }));

import { BusinessProfileSwitcher } from "./business-profile-switcher";

describe("BusinessProfileSwitcher", () => {
  beforeEach(() => {
    route.path = "/dashboard/actors";
    navigate.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            {
              id: "workspace-1",
              name: "Production",
              slug: "production",
              industry: null,
              website: null,
              plan: "PRO",
              actorCount: 4,
              apifyUsername: "crawlerbros",
              credentialStatus: "CONNECTED",
              active: true,
            },
            {
              id: "workspace-2",
              name: "Research",
              slug: "research",
              industry: null,
              website: null,
              plan: "FREE",
              actorCount: 1,
              apifyUsername: "research-team",
              credentialStatus: "ISSUE",
              active: false,
            },
          ],
        }),
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("refreshes the active workspace after an extension selection without remounting", async () => {
    render(<BusinessProfileSwitcher />);
    await waitFor(() => expect(screen.getAllByText("Production").length).toBeGreaterThan(0));
    const button = screen.getByRole("button", { name: "Select workspace" });
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({
        data: [
          {
            id: "workspace-2",
            name: "Research",
            slug: "research",
            active: true,
            plan: "FREE",
            actorCount: 1,
            credentialStatus: "ISSUE",
          },
        ],
      }),
    );
    await act(async () => window.dispatchEvent(new Event("actorconsole:workspace-changed")));
    await waitFor(() => expect(screen.getAllByText("Research").length).toBeGreaterThan(0));
    expect(screen.getByRole("button", { name: "Select workspace" })).toBe(button);
    expect(screen.queryByText("Production")).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("uses the topbar control as the workspace management surface", async () => {
    render(<BusinessProfileSwitcher />);

    await waitFor(() => expect(screen.getAllByText("Production").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("button", { name: /select workspace/i }));

    expect(screen.getByText("Choose the workspace you are operating")).toBeTruthy();
    expect(screen.getByText("Apify connected")).toBeTruthy();
    expect(screen.getByText("@crawlerbros")).toBeTruthy();
    expect(screen.getByText("Connection needs attention")).toBeTruthy();
    expect(screen.getByRole("button", { name: /create another workspace/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Manage current workspace" }));
    expect(screen.getByRole("button", { name: /rename workspace/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /delete workspace/i })).toBeTruthy();
  });

  it("offers All Workspaces only with multiple workspaces and enters it without a workspace mutation", async () => {
    render(<BusinessProfileSwitcher />);
    await waitFor(() => expect(screen.getAllByText("Production").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("button", { name: "Select workspace" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /All Workspaces/ }));
    expect(navigate).toHaveBeenCalledWith("/dashboard/default");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("hides All Workspaces when only one workspace remains", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({ data: [{ id: "w1", name: "Only workspace", active: true }] }),
    );
    render(<BusinessProfileSwitcher />);
    await waitFor(() => expect(screen.getAllByText("Only workspace").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("button", { name: "Select workspace" }));
    expect(screen.queryByRole("menuitem", { name: /All Workspaces/ })).toBeNull();
  });

  it.each(["/dashboard/default", "/dashboard/default/publishing"])(
    "shows All Workspaces as selected at %s and can return to the underlying active workspace",
    async (path) => {
      route.path = path;
      render(<BusinessProfileSwitcher />);
      await waitFor(() => expect(screen.getAllByText("All Workspaces").length).toBeGreaterThan(0));
      fireEvent.click(screen.getByRole("button", { name: "Select workspace" }));
      expect(screen.queryByRole("button", { name: "Manage current workspace" })).toBeNull();
      fireEvent.click(screen.getByRole("menuitem", { name: /Production/ }));
      expect(navigate).toHaveBeenCalledWith("/dashboard");
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it("selects another workspace from All Workspaces and returns to its overview", async () => {
    route.path = "/dashboard/default";
    render(<BusinessProfileSwitcher />);
    await waitFor(() => expect(screen.getAllByText("All Workspaces").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("button", { name: "Select workspace" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Research/ }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/dashboard"));
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/workspace-2/select"),
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });
});
