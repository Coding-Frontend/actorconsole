import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearConsent, CookieConsent, getConsent } from "./cookie-consent";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

// The component uses localStorage and document.cookie. happy-dom
// provides both. We reset them between tests.

const STORAGE_KEY = "actorconsole.cookie-consent";

beforeEach(() => {
  localStorage.clear();
  // Clear the consent cookie
  document.cookie = "actorconsole-consent=; Max-Age=0; Path=/";
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.cookie = "actorconsole-consent=; Max-Age=0; Path=/";
});

describe("CookieConsent", () => {
  it("renders the banner when no consent is stored", () => {
    render(<CookieConsent />);
    expect(screen.getByRole("dialog", { name: /cookie consent/i })).toBeTruthy();
    expect(screen.getByText(/we use cookies/i)).toBeTruthy();
  });

  it("renders both Accept and Essential-only buttons", () => {
    render(<CookieConsent />);
    expect(screen.getByRole("button", { name: /accept all/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /essential only/i })).toBeTruthy();
  });

  it("hides the banner after clicking 'Accept all'", () => {
    render(<CookieConsent />);
    fireEvent.click(screen.getByRole("button", { name: /accept all/i }));
    expect(screen.queryByRole("dialog", { name: /cookie consent/i })).toBeNull();
  });

  it("hides the banner after clicking 'Essential only'", () => {
    render(<CookieConsent />);
    fireEvent.click(screen.getByRole("button", { name: /essential only/i }));
    expect(screen.queryByRole("dialog", { name: /cookie consent/i })).toBeNull();
  });

  it("persists consent choice to localStorage", () => {
    render(<CookieConsent />);
    fireEvent.click(screen.getByRole("button", { name: /accept all/i }));
    const stored = localStorage.getItem(STORAGE_KEY);
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed.choice).toBe("all");
    expect(parsed.version).toBe(1);
    expect(typeof parsed.timestamp).toBe("number");
  });

  it("persists consent choice to document.cookie for SSR access", () => {
    render(<CookieConsent />);
    fireEvent.click(screen.getByRole("button", { name: /accept all/i }));
    expect(document.cookie).toContain("actorconsole-consent=all");
  });

  it("expands the details section when 'Show details' is clicked", () => {
    render(<CookieConsent />);
    const detailsButton = screen.getByRole("button", { name: /show details/i });
    fireEvent.click(detailsButton);
    expect(screen.getByText(/essential:/i)).toBeTruthy();
    expect(screen.getByText(/analytics:/i)).toBeTruthy();
    expect(screen.getByText(/marketing:/i)).toBeTruthy();
  });
});

describe("getConsent", () => {
  it("returns null when no consent is stored", () => {
    expect(getConsent()).toBeNull();
  });

  it("returns the stored consent choice", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, choice: "essential", timestamp: Date.now() }),
    );
    expect(getConsent()).toBe("essential");
  });

  it("returns null when stored consent has an outdated version", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 0, choice: "all", timestamp: Date.now() }),
    );
    expect(getConsent()).toBeNull();
  });

  it("returns null when stored consent is malformed JSON", () => {
    localStorage.setItem(STORAGE_KEY, "{not json}");
    expect(getConsent()).toBeNull();
  });
});

describe("clearConsent", () => {
  it("removes the stored record and the cookie", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, choice: "all", timestamp: Date.now() }),
    );
    document.cookie = "actorconsole-consent=all; Path=/";
    clearConsent();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(getConsent()).toBeNull();
  });
});
