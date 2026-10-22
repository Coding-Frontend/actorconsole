import { afterEach, describe, expect, it, vi } from "vitest";
import AuthLayout from "@/app/(auth)/layout";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  usePathname: () => "/login",
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("AuthLayout", () => {
  it("redirects an authenticated user to the dashboard", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);

    await AuthLayout({ children: <div>Login form</div> });

    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("renders auth pages for anonymous visitors", async () => {
    vi.mocked(auth).mockResolvedValue(null);

    const result = await AuthLayout({ children: <div>Login form</div> });

    expect(result).toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });
});
