import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandPalette } from "./command-palette";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  push.mockReset();
});
describe("command palette keyboard navigation", () => {
  it("dismisses once when Escape is pressed in search", () => {
    const close = vi.fn();
    render(<CommandPalette open onClose={close} />);
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
    expect(close).toHaveBeenCalledOnce();
  });
  it("names the dialog, exposes the selected command and scrolls the actual row", () => {
    const scroll = vi.spyOn(HTMLElement.prototype, "scrollIntoView");
    const close = vi.fn();
    render(<CommandPalette open onClose={close} />);
    expect(screen.getByRole("dialog", { name: "Search workspace" })).toBeTruthy();
    const input = screen.getByRole("combobox", { name: "Search pages, actions and settings" });
    for (let n = 0; n < 14; n++) fireEvent.keyDown(input, { key: "ArrowDown" });
    const selected = screen.getByRole("option", { selected: true });
    expect(input.getAttribute("aria-activedescendant")).toBe(selected.id);
    expect(scroll.mock.instances.at(-1)).toBe(selected);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(push).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });
  it("recovers from an empty query result without an invalid active selection", () => {
    render(<CommandPalette open onClose={vi.fn()} />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "no-result-fixture" } });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(push).not.toHaveBeenCalled();
    expect(input.getAttribute("aria-activedescendant")).toBeNull();
    fireEvent.change(input, { target: { value: "" } });
    expect(screen.getAllByRole("option", { selected: true })).toHaveLength(1);
  });
});
