import { describe, test, expect, beforeEach, vi } from "vitest";

// Reset module-level state between tests
let api;
beforeEach(async () => {
  vi.resetModules();
  sessionStorage.clear();
  // Re-import to reset module-level authToken
  api = await import("../lib/api");
});

describe("api token management", () => {
  test("setAuthToken stores token in sessionStorage", () => {
    api.setAuthToken("test-token-123");
    expect(sessionStorage.getItem("income-session-token")).toBe("test-token-123");
  });

  test("setAuthToken with empty string clears token", () => {
    api.setAuthToken("test-token-123");
    api.setAuthToken("");
    expect(sessionStorage.getItem("income-session-token")).toBeNull();
  });

  test("getStoredUser returns null when empty", () => {
    expect(api.getStoredUser()).toBeNull();
  });

  test("setStoredUser persists and retrieves user", () => {
    const user = { id: "u1", name: "测试", role: "管理员" };
    api.setStoredUser(user);
    expect(api.getStoredUser()).toEqual(user);
  });

  test("setStoredUser with null clears storage", () => {
    api.setStoredUser({ id: "u1" });
    api.setStoredUser(null);
    expect(api.getStoredUser()).toBeNull();
  });

  test("apiEnabled is true when API_BASE_URL is configured", () => {
    expect(api.apiEnabled).toBe(true);
  });
});
