import { describe, test, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import ErrorBoundary from "./ErrorBoundary";

// Suppress React error boundary logging in tests
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

function Buggy() {
  throw new Error("Test crash");
}

function Healthy() {
  return <p>一切正常</p>;
}

describe("ErrorBoundary", () => {
  test("renders children when no error", () => {
    render(
      <ErrorBoundary>
        <Healthy />
      </ErrorBoundary>
    );
    expect(screen.getByText("一切正常")).toBeInTheDocument();
  });

  test("shows fallback UI when child throws", () => {
    render(
      <ErrorBoundary>
        <Buggy />
      </ErrorBoundary>
    );
    expect(screen.getByText("页面发生错误")).toBeInTheDocument();
    expect(screen.getByText("重试")).toBeInTheDocument();
  });

  test("uses custom fallback if provided", () => {
    render(
      <ErrorBoundary fallback={<p>自定义错误页面</p>}>
        <Buggy />
      </ErrorBoundary>
    );
    expect(screen.getByText("自定义错误页面")).toBeInTheDocument();
  });
});
