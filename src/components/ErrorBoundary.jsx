import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { reportClientError } from "../lib/api";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    reportClientError({
      message: error?.message || "React render error",
      stack: error?.stack || "",
      page: window.location.href,
      meta: {
        componentStack: errorInfo?.componentStack || "",
      },
    }).catch(() => {});
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
          <div className="max-w-md text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100">
              <AlertTriangle className="h-8 w-8 text-amber-600" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900">页面发生错误</h2>
            <p className="mt-2 text-sm text-slate-500">
              应用遇到了意外错误，请尝试刷新页面。如持续出现请联系管理员。
            </p>
            {this.state.error?.message && (
              <pre className="mt-3 max-h-24 overflow-auto rounded-lg bg-slate-100 px-3 py-2 text-left text-xs text-slate-600">
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={this.handleRetry}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              <RefreshCw className="h-4 w-4" />
              重试
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
