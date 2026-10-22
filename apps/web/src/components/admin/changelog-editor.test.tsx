import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ChangelogEditor, newChangelogForm, type ChangelogForm } from "./changelog-editor";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
afterEach(cleanup);
const save = vi.fn();
function Editor({
  initial,
  editing = false,
}: {
  initial?: Partial<ChangelogForm>;
  editing?: boolean;
}) {
  const [form, setForm] = useState({ ...newChangelogForm(), ...initial });
  return (
    <ChangelogEditor
      form={form}
      setForm={setForm}
      editing={editing}
      saving={false}
      onSave={() => save(form)}
      onCancel={() => {}}
    />
  );
}
describe("Changelog authoring", () => {
  it("creates a headline slug and saves the complete draft payload", () => {
    save.mockClear();
    render(<Editor />);
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "New Dashboard Experience" },
    });
    expect((screen.getByLabelText("URL slug") as HTMLInputElement).value).toBe(
      "new-dashboard-experience",
    );
    fireEvent.change(screen.getByLabelText("Summary"), { target: { value: "A useful update" } });
    fireEvent.change(screen.getByLabelText("Article body (Markdown)"), {
      target: { value: "## What's new\n\nDetailed notes." },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Dashboard" }));
    fireEvent.submit(screen.getByRole("button", { name: "Save draft" }).closest("form")!);
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "New Dashboard Experience",
        slug: "new-dashboard-experience",
        tags: ["dashboard"],
        body: "## What's new\n\nDetailed notes.",
        isPublished: false,
      }),
    );
  });
  it("preserves a custom slug while the title changes and locks existing URLs", () => {
    const { unmount } = render(<Editor />);
    fireEvent.change(screen.getByLabelText("URL slug"), { target: { value: "stable-address" } });
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Changed title" } });
    expect((screen.getByLabelText("URL slug") as HTMLInputElement).value).toBe("stable-address");
    unmount();
    render(<Editor editing initial={{ slug: "existing" }} />);
    expect((screen.getByLabelText("URL slug") as HTMLInputElement).readOnly).toBe(true);
  });
  it("uses the public Markdown renderer for the article preview", () => {
    render(
      <Editor
        initial={{
          title: "Preview headline",
          text: "Summary",
          body: "## Example\n\n[Docs](https://actorconsole.com/docs)\n\n```js\nconst answer = 42;\n```",
        }}
      />,
    );
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Article preview" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(screen.getByRole("heading", { name: "Preview headline" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Example/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Docs" }).getAttribute("href")).toBe(
      "https://actorconsole.com/docs",
    );
    expect(screen.getByText("const answer = 42;")).toBeTruthy();
  });
});
