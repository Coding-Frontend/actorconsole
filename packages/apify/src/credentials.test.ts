import { describe, expect, it } from "vitest";

import { normalizeConsoleCookies, normalizeConsoleUiToken } from "./credentials.js";

const UI_TOKEN = `apify_ui_${"a1B2_c-D3".repeat(3)}`;

describe("normalizeConsoleUiToken", () => {
  it("accepts a raw Console UI token", () => {
    expect(normalizeConsoleUiToken(`  ${UI_TOKEN}  `)).toBe(UI_TOKEN);
  });

  it("extracts only the UI token from an Authorization header", () => {
    expect(normalizeConsoleUiToken(`Authorization: Bearer ${UI_TOKEN}`)).toBe(UI_TOKEN);
  });

  it("extracts only the UI token from copied cURL and ignores cookies", () => {
    const copiedRequest = `curl 'https://console-backend.apify.com/actor/example/basic-info' \\
      -H 'authorization: Bearer ${UI_TOKEN}' \\
      -b 'ApifyRT=must-not-be-stored; analytics=value'`;

    expect(normalizeConsoleUiToken(copiedRequest)).toBe(UI_TOKEN);
  });

  it("rejects cookie-only and unrelated pasted values with migration guidance", () => {
    expect(() => normalizeConsoleUiToken("ApifyRT=session-value; _ga=analytics")).toThrow(
      /ApifyRT cookie is not required/,
    );
  });
});

describe("normalizeConsoleCookies", () => {
  it("extracts cookies from the copied authentication/resume cURL format", () => {
    const copiedRequest = [
      "curl --location 'https://console-backend.apify.com/public/authentication/resume' \\",
      "--header 'accept: application/json' \\",
      "--header 'origin: https://console.apify.com' \\",
      "--header 'Cookie: ApifyRT=dummy-refresh-token; ApifyProdUserId=dummy-user;' \\",
      '--data \'{"viewedUserId":"","forceAdminToken":false}\'',
    ].join("\n");

    expect(normalizeConsoleCookies(copiedRequest)).toBe("ApifyRT=dummy-refresh-token");
  });

  it("extracts cookies from a Chrome copy-as-cURL request using --url and -b", () => {
    const copiedRequest = [
      "curl --url 'https://console-backend.apify.com/public/authentication/resume' \\",
      "  -H 'accept: application/json, text/plain, */*' \\",
      "  -b 'analytics=discard-me; ApifyRT=dummy-refresh-token; ApifyProdUserId=dummy-user' \\",
      '  --data-raw \'{"viewedUserId":"","forceAdminToken":false}\'',
    ].join("\n");

    expect(normalizeConsoleCookies(copiedRequest)).toBe("ApifyRT=dummy-refresh-token");
  });

  it("combines the Console and Console-backend domain exports", () => {
    expect(
      normalizeConsoleCookies(
        JSON.stringify({
          console: "ApifyProdUserId=dummy-user; analytics=console-value",
          consoleBackend: "ApifyRT=dummy-refresh-token; analytics=backend-value",
        }),
      ),
    ).toBe("ApifyRT=dummy-refresh-token");
  });

  it("merges extension exports from both Console domains", () => {
    const consoleCookies = JSON.stringify([
      { name: "ApifyProdUserId", value: "dummy-user", domain: "console.apify.com" },
    ]);
    const backendCookies = JSON.stringify([
      {
        name: "ApifyRT",
        value: "dummy-refresh-token",
        domain: "console-backend.apify.com",
      },
    ]);

    expect(
      normalizeConsoleCookies(JSON.stringify({ sources: [consoleCookies, backendCookies] })),
    ).toBe("ApifyRT=dummy-refresh-token");
  });

  it("rejects an ApifyRT cookie exported from the wrong domain", () => {
    const wrongDomainExport = JSON.stringify([
      { name: "ApifyRT", value: "dummy-refresh-token", domain: "console.apify.com" },
    ]);

    expect(() => normalizeConsoleCookies(wrongDomainExport)).toThrow(/console-backend\.apify\.com/);
  });

  it("rejects cookie cURL copied from a different endpoint", () => {
    expect(() =>
      normalizeConsoleCookies(
        "curl 'https://example.com/request' --header 'Cookie: ApifyRT=dummy-refresh'",
      ),
    ).toThrow(/authentication\/resume/);
  });
});
