import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "../../src/components/ui/card";

describe("Card components", () => {
  it("renders Card with default variant", () => {
    render(<Card data-testid="card">Content</Card>);
    const card = screen.getByTestId("card");
    expect(card).toBeTruthy();
    expect(card.className).toContain("workbench-panel");
  });

  it("renders Card with hover variant", () => {
    render(
      <Card variant="hover" data-testid="card-hover">
        Hoverable
      </Card>,
    );
    expect(screen.getByTestId("card-hover").className).toContain("shadow-card-hover");
  });

  it("renders Card with stat variant", () => {
    render(
      <Card variant="stat" data-testid="card-stat">
        Stat
      </Card>,
    );
    expect(screen.getByTestId("card-stat").className).toContain("shadow-sm");
  });

  it("renders a full card layout", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Actor Overview</CardTitle>
          <CardDescription>Live stats from Apify</CardDescription>
        </CardHeader>
        <CardContent>
          <p>Runs today: 42</p>
        </CardContent>
        <CardFooter>
          <span>Last updated: 2 min ago</span>
        </CardFooter>
      </Card>,
    );
    expect(screen.getByText("Actor Overview")).toBeTruthy();
    expect(screen.getByText("Live stats from Apify")).toBeTruthy();
    expect(screen.getByText("Runs today: 42")).toBeTruthy();
    expect(screen.getByText("Last updated: 2 min ago")).toBeTruthy();
  });

  it("keeps standalone content padding at desktop sizes", () => {
    render(
      <Card>
        <CardContent className="p-5" data-testid="standalone-content">
          Progress
        </CardContent>
      </Card>,
    );

    const content = screen.getByTestId("standalone-content");
    expect(content.className).toContain("p-5");
    expect(content.className).not.toContain("pt-0");
    expect(content.className).not.toContain("sm:pt-0");
  });

  it("keeps the default content inset ready for a card header", () => {
    render(<CardContent data-testid="header-content">Details</CardContent>);

    const content = screen.getByTestId("header-content");
    expect(content.className).toContain("pb-5");
    expect(content.className).toContain("sm:pb-6");
    expect(content.className).not.toContain("pt-0");
  });
});
