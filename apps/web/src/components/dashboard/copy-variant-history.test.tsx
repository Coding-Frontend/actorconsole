import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CopyVariantHistory, groupCopyVariantHistory } from "./copy-variant-history";

const context = {
  title: "Maps Lead Extractor",
  description: "Extract leads from Maps.",
  seoTitle: "Maps Lead Extractor",
  seoDescription: "Extract structured Maps leads.",
  reasoning: "Matches the Actor use case.",
};

const records = Object.entries({
  title: context.title,
  description: context.description,
  seoTitle: context.seoTitle,
  seoDescription: context.seoDescription,
}).map(([field, value], index) => ({
  id: String(index),
  field,
  value,
  generatedBy: "ai",
  promptContext: context,
  createdAt: "2026-08-17T10:00:00.000Z",
}));

describe("CopyVariantHistory", () => {
  afterEach(cleanup);

  it("groups all generated fields into one complete variant", () => {
    const grouped = groupCopyVariantHistory(records);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toMatchObject({
      title: context.title,
      seoDescription: context.seoDescription,
    });
  });

  it("opens a working preview with all copy fields", () => {
    render(<CopyVariantHistory variants={records} />);
    expect(screen.getAllByRole("button", { name: /preview/i })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /preview/i }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(context.seoDescription)).toBeTruthy();
    expect(screen.queryByText("LEAD GENERATION")).toBeNull();
  });
});
