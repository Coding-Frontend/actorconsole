import { afterEach, describe, expect, it } from "vitest";
import { render, cleanup } from "@testing-library/react";
import {
  Skeleton,
  SkeletonActorsPage,
  SkeletonAvatar,
  SkeletonCard,
  SkeletonChart,
  SkeletonDashboardPage,
  SkeletonList,
  SkeletonPageHeader,
  SkeletonRow,
  SkeletonStatCard,
  SkeletonTable,
  SkeletonTableSurface,
  SkeletonText,
} from "../../src/components/ui/skeleton";

afterEach(() => {
  cleanup();
});

describe("Skeleton component", () => {
  it("renders a div element", () => {
    const { container } = render(<Skeleton />);
    expect(container.firstChild).toBeTruthy();
    expect(container.firstChild!.nodeName).toBe("DIV");
  });

  it("applies custom className", () => {
    const { container } = render(<Skeleton className="h-4 w-20" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("h-4");
    expect(el.className).toContain("w-20");
  });

  it("spreads additional HTML attributes", () => {
    const { container } = render(<Skeleton data-testid="skeleton" role="presentation" />);
    const el = container.firstChild as HTMLElement;
    expect(el.getAttribute("data-testid")).toBe("skeleton");
    expect(el.getAttribute("role")).toBe("presentation");
  });
});

describe("SkeletonText component", () => {
  it("renders default 3 lines", () => {
    const { container } = render(<SkeletonText />);
    // SkeletonText wraps lines in a div.space-y-2 with Skeleton divs as children
    const wrapper = container.firstChild as HTMLElement;
    const skeletonDivs = wrapper.children;
    expect(skeletonDivs.length).toBe(3);
  });

  it("renders custom number of lines", () => {
    const { container } = render(<SkeletonText lines={5} />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.children.length).toBe(5);
  });

  it("applies custom className to wrapper", () => {
    const { container } = render(<SkeletonText className="custom-wrapper" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain("custom-wrapper");
  });
});

describe("composed skeleton surfaces", () => {
  it("renders card placeholders and preserves authored children", () => {
    const placeholders = render(<SkeletonCard lines={4} />);
    expect(placeholders.container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(5);
    placeholders.unmount();

    const authored = render(
      <SkeletonCard className="custom-card">
        <span>Loading activity</span>
      </SkeletonCard>,
    );
    expect(authored.getByText("Loading activity")).toBeTruthy();
    expect(authored.container.firstElementChild?.className).toContain("custom-card");
  });

  it("renders the reusable stat, row, table, list, chart, and avatar variants", () => {
    const { container } = render(
      <>
        <SkeletonStatCard className="stat" />
        <SkeletonRow columns={3} />
        <SkeletonTable rows={2} columns={3} />
        <SkeletonList items={2} />
        <SkeletonChart className="chart" />
        <SkeletonAvatar size={48} />
      </>,
    );

    expect(container.querySelector(".stat")).toBeTruthy();
    expect(container.querySelector(".chart")).toBeTruthy();
    expect(container.querySelector('[style*="width: 48px"]')).toBeTruthy();
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(40);
  });

  it("renders page-level dashboard placeholders and optional header actions", () => {
    const { container } = render(
      <>
        <SkeletonPageHeader action titleWidth="w-52" descriptionWidth="w-72" />
        <SkeletonTableSurface columns={5} rows={2} className="surface" />
        <SkeletonDashboardPage />
        <SkeletonActorsPage />
      </>,
    );

    expect(container.querySelector(".surface")).toBeTruthy();
    expect(container.querySelector(".w-52")).toBeTruthy();
    expect(container.querySelector(".w-72")).toBeTruthy();
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(100);
  });
});
