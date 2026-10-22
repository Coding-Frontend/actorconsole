import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AuthEntryGuard } from "./public-layout";
import { NavigationProvider, usePathname } from "./navigation";

const { auth } = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("./auth", () => ({ auth }));
beforeEach(() => {
  auth.mockReset();
  window.history.replaceState({}, "", "/signup");
});
afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
});

function AccountEntry() {
  return usePathname() === "/dashboard" ? (
    <h1>Dashboard</h1>
  ) : (
    <AuthEntryGuard>
      <h1>Signup</h1>
    </AuthEntryGuard>
  );
}

it("shows the signup content only after an anonymous session check", async () => {
  let resolve!: (value: null) => void;
  auth.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  render(
    <NavigationProvider>
      <AccountEntry />
    </NavigationProvider>,
  );
  expect(screen.queryByRole("heading", { name: "Signup" })).toBeNull();
  await waitFor(() => expect(auth).toHaveBeenCalledOnce());
  resolve(null);
  expect(await screen.findByRole("heading", { name: "Signup" })).toBeTruthy();
});

it("preserves the existing authenticated account-entry redirect", async () => {
  auth.mockResolvedValue({ user: { id: "existing-user" } });
  render(
    <NavigationProvider>
      <AccountEntry />
    </NavigationProvider>,
  );
  expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Signup" })).toBeNull();
  expect(window.location.pathname).toBe("/dashboard");
});

it("keeps an authenticated extension callback instead of redirecting to the dashboard", async () => {
  auth.mockResolvedValue({ user: { id: "existing-user" } });
  render(
    <NavigationProvider>
      <AuthEntryGuard
        searchParams={Promise.resolve({ callbackUrl: "/extension/pair?challenge=abc&mode=poll" })}
      >
        <h1>Login</h1>
      </AuthEntryGuard>
    </NavigationProvider>,
  );
  await waitFor(() => expect(window.location.pathname).toBe("/extension/pair"));
  expect(window.location.search).toBe("?challenge=abc&mode=poll");
  expect(screen.queryByRole("heading", { name: "Login" })).toBeNull();
});
