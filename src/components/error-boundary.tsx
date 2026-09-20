"use client";

import React from "react";

/**
 * 全局错误边界：捕获 NotFoundError (removeChild 失败) 等客户端错误，
 * 防止应用白屏崩溃。
 */
interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  resetKey?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false, error: null });
    }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // 如果是 NotFoundError (removeChild 失败)，仅 console.warn，不中断
    if (error.name === "NotFoundError" && error.message.includes("removeChild")) {
      console.warn("[ErrorBoundary] Caught DOM removeChild error (likely Radix Portal race):", error.message);
      // 自动恢复：允许用户继续操作
      this.setState({ hasError: false, error: null });
      return;
    }

    // 其他错误：记录但让 fallback 显示
    console.error("[ErrorBoundary] Unhandled error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      const err = this.state.error;
      const isProd = process.env.NODE_ENV === "production";

      return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50 p-8">
          <div className="max-w-2xl w-full">
            <h2 className="mb-2 text-xl font-semibold text-gray-900">Something went wrong</h2>
            <p className="mb-4 text-sm text-gray-500">
              An unexpected error occurred. Please try refreshing the page.
            </p>

            {err && !isProd && (
              <details className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-left" open={!isProd}>
                <summary className="cursor-pointer text-sm font-medium text-red-800">
                  {err.name}: {err.message}
                </summary>
                {err.stack && (
                  <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs text-red-900">
                    {err.stack}
                  </pre>
                )}
              </details>
            )}

            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
              }}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
