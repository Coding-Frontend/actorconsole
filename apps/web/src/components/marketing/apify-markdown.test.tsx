import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ApifyMarkdown } from "./apify-markdown";

afterEach(cleanup);

describe("ApifyMarkdown", () => {
  it("renders public README HTML tables while removing executable HTML", () => {
    const { container } = render(
      <ApifyMarkdown markdown={'<table><tr><td><a href="https://apify.com/clockworks/tiktok-scraper">TikTok Scraper</a></td></tr></table>\n\n<script>alert("bad")</script><img src="https://example.com/image.png" onerror="alert(1)"><a href="javascript:alert(1)">Unsafe link</a>'} />,
    );
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByRole("cell", { name: "TikTok Scraper" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "TikTok Scraper" }).getAttribute("href")).toBe(
      "https://apify.com/clockworks/tiktok-scraper",
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("[onerror]")).toBeNull();
    expect(screen.getByText("Unsafe link").getAttribute("href")).toBeNull();
    expect(container.textContent).not.toContain("<table>");
  });

  it("renders the Markdown structures used by Apify Actor READMEs", () => {
    const { container } = render(
      <ApifyMarkdown
        markdown={`## Input options

| Field | Type |
| --- | --- |
| query | \`string\` |

- [x] Supports completed tasks

![Actor workflow](https://images.apifyusercontent.com/workflow.png)

[Apify docs](https://docs.apify.com/)`}
      />,
    );

    expect(screen.getByRole("heading", { name: /input options/i }).id).toBe("input-options");
    expect(container.querySelector("table")).toBeTruthy();
    expect(screen.getByText("string").tagName).toBe("CODE");
    expect(screen.getByRole("checkbox")).toHaveProperty("disabled", true);
    expect(screen.getByRole("img", { name: "Actor workflow" })).toHaveProperty(
      "loading",
      "lazy",
    );
    expect(screen.getByRole("link", { name: "Apify docs" })).toHaveProperty(
      "target",
      "_blank",
    );
  });
});
