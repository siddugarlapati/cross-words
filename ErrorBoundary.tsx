import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

// ErrorBoundary MUST be a class component — hooks cannot catch render errors.
// Note: With useDefineForClassFields:false in tsconfig, we must declare
// state explicitly and use the React.Component constructor pattern.
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    (this as any).state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    (this as any).setState({ errorInfo });
    console.error('[ErrorBoundary] Uncaught render error:', {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
    });
  }

  handleReset(): void {
    (this as any).setState({ hasError: false, error: null, errorInfo: null });
  }

  render(): React.ReactNode {
    const s = (this as any).state as ErrorBoundaryState;
    const p = (this as any).props as ErrorBoundaryProps;

    if (s.hasError) {
      if (p.fallback) {
        return p.fallback;
      }

      return (
        <div className="min-h-screen bg-[#f8f9fc] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border border-red-200 p-8 rounded-3xl shadow-xl text-center space-y-4">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.07 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h2 className="text-2xl font-black text-[#002147]">Something Went Wrong</h2>
            <p className="text-slate-600 text-sm">
              An unexpected error occurred. Please try reloading the page.
            </p>
            {s.error && (
              <details className="text-left bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-mono text-slate-700">
                <summary className="cursor-pointer font-bold text-slate-500 uppercase tracking-wide text-[10px] mb-1">
                  Error Details
                </summary>
                <p className="mt-1 break-words">{s.error.message}</p>
              </details>
            )}
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => this.handleReset()}
                className="px-5 py-2.5 bg-[#b01c1e] hover:bg-[#851415] text-white font-bold rounded-xl text-sm transition-all shadow-sm cursor-pointer"
              >
                Try Again
              </button>
              <button
                onClick={() => { window.location.href = '/'; }}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm transition-all cursor-pointer border border-slate-200"
              >
                Return to Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return p.children;
  }
}

export default ErrorBoundary;
