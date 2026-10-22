import { afterEach, describe, expect, it } from "vitest";
import { getAppBaseUrl } from "./urls";

const originalNodeEnv = process.env.NODE_ENV;
const originalAuthUrl = process.env.AUTH_URL;

afterEach(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  if (originalAuthUrl === undefined) delete process.env.AUTH_URL;
  else process.env.AUTH_URL = originalAuthUrl;
});

describe("getAppBaseUrl", () => {
  it("uses the development origin when AUTH_URL is absent outside production", () => {
    process.env.NODE_ENV = "test";
    delete process.env.AUTH_URL;
    expect(getAppBaseUrl()).toBe("http://localhost:8080");
  });

  it("normalizes a configured origin", () => {
    process.env.NODE_ENV = "test";
    process.env.AUTH_URL = "https://console.example.com/";
    expect(getAppBaseUrl()).toBe("https://console.example.com");
  });

  it("requires AUTH_URL in production", () => {
    process.env.NODE_ENV = "production";
    delete process.env.AUTH_URL;
    expect(() => getAppBaseUrl()).toThrow("AUTH_URL must be configured");
  });

  it("requires HTTPS in production", () => {
    process.env.NODE_ENV = "production";
    process.env.AUTH_URL = "http://console.example.com";
    expect(() => getAppBaseUrl()).toThrow("AUTH_URL must use HTTPS");
  });

  it("rejects URLs with a path", () => {
    process.env.NODE_ENV = "test";
    process.env.AUTH_URL = "https://console.example.com/app";
    expect(() => getAppBaseUrl()).toThrow("AUTH_URL must be an origin");
  });
});
