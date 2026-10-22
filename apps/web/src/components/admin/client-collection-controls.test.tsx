import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ClientCollectionControls } from "./client-collection-controls";

afterEach(cleanup);

describe("ClientCollectionControls", () => {
  it("exposes search, filter, sorting, page size, and pagination actions", () => {
    const onQueryChange = vi.fn();
    const onFilterChange = vi.fn();
    const onSortChange = vi.fn();
    const onOrderChange = vi.fn();
    const onLimitChange = vi.fn();
    const onPageChange = vi.fn();
    const onReset = vi.fn();

    render(
      <ClientCollectionControls
        query="maps"
        onQueryChange={onQueryChange}
        searchPlaceholder="Search records"
        filterLabel="Status"
        filterValue="active"
        onFilterChange={onFilterChange}
        filterOptions={[{ value: "active", label: "Active" }]}
        sortValue="title"
        onSortChange={onSortChange}
        sortOptions={[{ value: "title", label: "Title" }]}
        order="asc"
        onOrderChange={onOrderChange}
        limit={10}
        onLimitChange={onLimitChange}
        page={2}
        total={35}
        onPageChange={onPageChange}
        onReset={onReset}
      />,
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Search records" }), {
      target: { value: "scraper" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Sort records" }), {
      target: { value: "title" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Sort direction" }), {
      target: { value: "desc" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Rows per page" }), {
      target: { value: "25" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    fireEvent.click(screen.getByRole("button", { name: /Reset/ }));

    expect(onQueryChange).toHaveBeenCalledWith("scraper");
    expect(onFilterChange).toHaveBeenCalledWith("");
    expect(onSortChange).toHaveBeenCalledWith("title");
    expect(onOrderChange).toHaveBeenCalledWith("desc");
    expect(onLimitChange).toHaveBeenCalledWith(25);
    expect(onPageChange).toHaveBeenCalledWith(3);
    expect(onReset).toHaveBeenCalledOnce();
    expect(screen.getByText("Showing 11–20 of 35")).toBeTruthy();
  });
});
