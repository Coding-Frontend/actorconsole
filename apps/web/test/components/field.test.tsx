import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Field } from "../../src/components/ui/field";
import { Input } from "../../src/components/ui/input";

afterEach(cleanup);

function describedBy(element: HTMLElement) {
  return (element.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent);
}

describe("Field", () => {
  it("labels the control and links its hint", () => {
    render(
      <Field label="Actor name" hint="Shown on your public profile.">
        <Input />
      </Field>,
    );
    const input = screen.getByRole("textbox", { name: "Actor name" });
    expect(describedBy(input)).toEqual(["Shown on your public profile."]);
    expect(input.hasAttribute("aria-invalid")).toBe(false);
  });

  it("marks the control invalid and links the error after the hint", () => {
    render(
      <Field label="Email" hint="We never share it." error="Enter a valid email address.">
        <Input type="email" />
      </Field>,
    );
    const input = screen.getByRole("textbox", { name: "Email" });
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(describedBy(input)).toEqual(["We never share it.", "Enter a valid email address."]);
  });

  it("keeps the asterisk out of the accessible name and sets aria-required", () => {
    render(
      <Field label="Workspace" required>
        <Input />
      </Field>,
    );
    const input = screen.getByRole("textbox", { name: "Workspace" });
    expect(input.getAttribute("aria-required")).toBe("true");
    // Native `required` would trigger browser bubbles; callers opt in themselves.
    expect(input.hasAttribute("required")).toBe(false);
  });

  it("preserves an existing id and aria-describedby on the control", () => {
    render(
      <>
        <p id="external-note">Counts toward your quota.</p>
        <Field label="Runs" hint="Per day.">
          <Input id="runs-input" aria-describedby="external-note" />
        </Field>
      </>,
    );
    const input = screen.getByRole("textbox", { name: "Runs" });
    expect(input.id).toBe("runs-input");
    expect(describedBy(input)).toEqual(["Per day.", "Counts toward your quota."]);
  });

  it("gives every instance a unique id", () => {
    render(
      <>
        <Field label="First">
          <Input />
        </Field>
        <Field label="Second">
          <Input />
        </Field>
      </>,
    );
    const [first, second] = screen.getAllByRole("textbox");
    expect(first!.id).not.toBe(second!.id);
    expect(screen.getByRole("textbox", { name: "Second" })).toBe(second);
  });

  it("can hide the label visually while keeping it accessible", () => {
    render(
      <Field label="Search actors" hideLabel optional>
        <Input type="search" />
      </Field>,
    );
    expect(document.querySelector("label")?.className).toContain("sr-only");
    expect(screen.getByRole("searchbox", { name: /Search actors/ })).toBeTruthy();
  });
});
