import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadCsv } from "./tool-actions";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("tool CSV export", () => {
  it("preserves negative numeric values, escapes text, and releases the download URL after clicking", async () => {
    vi.useFakeTimers();
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:scenario");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    let downloadName = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloadName = this.download;
      expect(this.isConnected).toBe(true);
    });
    downloadCsv("scenario.csv", [
      ["Profit", -12],
      ["=unsafe", 'Text with "quotes"'],
      ["Margin", null],
    ]);
    expect(downloadName).toBe("scenario.csv");
    const blob = create.mock.calls[0][0] as Blob;
    expect(await blob.text()).toBe(
      '"Profit",-12\r\n"\'=unsafe","Text with ""quotes"""\r\n"Margin",""',
    );
    expect(document.querySelector('a[download="scenario.csv"]')).toBeNull();
    expect(revoke).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(revoke).toHaveBeenCalledWith("blob:scenario");
  });
});
