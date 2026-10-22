import { afterEach, describe, expect, it } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Input, Textarea } from "../../src/components/ui/input";

afterEach(() => {
  cleanup();
});

describe("Input component", () => {
  it("renders with default props", () => {
    render(<Input placeholder="Enter text" />);
    const input = screen.getByPlaceholderText("Enter text");
    expect(input).toBeTruthy();
    expect(input.tagName).toBe("INPUT");
  });

  it("renders with correct type", () => {
    render(<Input type="password" placeholder="Password" />);
    const input = screen.getByPlaceholderText("Password") as HTMLInputElement;
    expect(input.type).toBe("password");
  });

  it("accepts and displays typed text", () => {
    render(<Input />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "hello" } });
    expect(input.value).toBe("hello");
  });

  it("can be disabled", () => {
    render(<Input disabled placeholder="Disabled" />);
    const input = screen.getByPlaceholderText("Disabled") as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });

  it("accepts custom className", () => {
    render(<Input className="my-custom" placeholder="Custom" />);
    const input = screen.getByPlaceholderText("Custom");
    expect(input.className).toContain("my-custom");
  });

  it("spreads additional HTML attributes", () => {
    render(<Input data-testid="test-input" aria-label="Email" />);
    const input = screen.getByTestId("test-input");
    expect(input.getAttribute("aria-label")).toBe("Email");
  });
});

describe("Textarea component", () => {
  it("renders with default props", () => {
    render(<Textarea placeholder="Enter text" />);
    const textarea = screen.getByPlaceholderText("Enter text");
    expect(textarea.tagName).toBe("TEXTAREA");
  });

  it("accepts and displays typed text", () => {
    render(<Textarea />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "hello world" } });
    expect(textarea.value).toBe("hello world");
  });

  it("can be disabled", () => {
    render(<Textarea disabled placeholder="Disabled" />);
    const textarea = screen.getByPlaceholderText("Disabled") as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(true);
  });

  it("accepts custom className", () => {
    render(<Textarea className="custom-textarea" placeholder="Custom" />);
    const textarea = screen.getByPlaceholderText("Custom");
    expect(textarea.className).toContain("custom-textarea");
  });
});
