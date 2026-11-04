import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ItemsPerPageSelect } from "./items-per-page";
const navigate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/client-navigation", () => ({ navigateInApp: navigate }));
afterEach(() => {
  cleanup();
  navigate.mockReset();
});
describe("bounded page-size selection", () => {
  it("offers only supported presets and custom values within the inbox limit", () => {
    const change = vi.fn();
    render(<ItemsPerPageSelect value={10} maxValue={100} onChange={change} />);
    expect(screen.queryByRole("option", { name: "200" })).toBeNull();
    expect(screen.queryByRole("option", { name: "500" })).toBeNull();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "50" } });
    expect(change).toHaveBeenLastCalledWith(50);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "custom" } });
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "72" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(change).toHaveBeenLastCalledWith(72);
    fireEvent.change(input, { target: { value: "200" } });
    fireEvent.blur(input);
    expect(change).toHaveBeenLastCalledWith(100);
  });
  it("keeps current filters and resets pagination when the size changes", () => {
    window.history.replaceState(
      {},
      "",
      "/dashboard/notifications?limit=25&page=3&source=actorconsole&type=security&unread=true",
    );
    render(<ItemsPerPageSelect value={25} maxValue={100} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "10" } });
    const target = new URL(navigate.mock.calls[0][0]);
    expect(target.searchParams.get("limit")).toBe("10");
    expect(target.searchParams.has("page")).toBe(false);
    expect(target.searchParams.get("source")).toBe("actorconsole");
    expect(target.searchParams.get("type")).toBe("security");
    expect(target.searchParams.get("unread")).toBe("true");
  });
});
