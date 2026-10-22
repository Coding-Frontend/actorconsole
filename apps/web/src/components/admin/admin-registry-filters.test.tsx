import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AdminRegistryFilters } from "./admin-registry-filters";

afterEach(cleanup);

describe("AdminRegistryFilters", () => {
  it("renders persisted search, filter, sort, direction, page-size, and clear controls", () => {
    render(
      <AdminRegistryFilters
        path="/admin/errors"
        params={{
          q: "timeout",
          severity: "fatal",
          sort: "fingerprint",
          order: "asc",
          limit: "100",
        }}
        searchPlaceholder="Message, stack, or fingerprint"
        filters={[
          {
            name: "severity",
            label: "Severities",
            options: [{ value: "fatal", label: "Fatal" }],
          },
        ]}
        sorts={[
          { value: "createdAt", label: "Newest" },
          { value: "fingerprint", label: "Fingerprint" },
        ]}
        defaultSort="createdAt"
      />,
    );

    expect(screen.getByDisplayValue("timeout")).toBeTruthy();
    expect((screen.getByRole("combobox", { name: "Severities" }) as HTMLSelectElement).value).toBe(
      "fatal",
    );
    expect(
      (screen.getByRole("combobox", { name: "Sort registry" }) as HTMLSelectElement).value,
    ).toBe("fingerprint");
    expect(
      (screen.getByRole("combobox", { name: "Sort direction" }) as HTMLSelectElement).value,
    ).toBe("asc");
    expect(
      (screen.getByRole("combobox", { name: "Rows per page" }) as HTMLSelectElement).value,
    ).toBe("100");
    expect(screen.getByRole("link", { name: "Clear" }).getAttribute("href")).toBe("/admin/errors");
  });
});
