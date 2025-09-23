import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  resetKeys?: Array<string | number>;
  resetOnPropsChange?: boolean;
  isolate?: boolean;
  name?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorCount: number;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0
    };
  }

  static getDerivedStateFromError(error: Error): State {
    // Check if this is an extension-related error
    const isExtensionError = error.message?.includes('MetaMask') ||
                            error.message?.includes('ethereum') ||
                            error.message?.includes('chrome-extension') ||
                            error.stack?.includes('chrome-extension');

    if (isExtensionError) {
      console.debug('[VideoMix Pro] Extension error caught by boundary:', error.message);
      // Don't show error UI for extension conflicts, just continue normally
      return {
        hasError: false,
        error: null,
        errorInfo: null,
        errorCount: 0
      };
    }

    console.error('[ErrorBoundary] Error caught:', error);

    // Log detailed error info
    if (error && typeof error === 'object') {
      console.error('[ErrorBoundary] Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
        keys: Object.keys(error)
      });
    }

    return {
      hasError: true,
      error,
      errorInfo: null,
      errorCount: 0
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { onError, name } = this.props;

    // Check if this is an extension-related error
    const isExtensionError = error.message?.includes('MetaMask') ||
                            error.message?.includes('ethereum') ||
                            error.message?.includes('chrome-extension') ||
                            error.stack?.includes('chrome-extension');

    if (isExtensionError) {
      console.debug('[VideoMix Pro] Extension error suppressed in componentDidCatch');
      // Increment error counter for tracking
      (window as any).__extensionErrorCount = ((window as any).__extensionErrorCount || 0) + 1;
      // Don't set error state, continue normal operation
      return;
    }

    console.error(`[ErrorBoundary${name ? ` - ${name}` : ''}] componentDidCatch:`, {
      error: error,
      errorMessage: error?.message,
      errorStack: error?.stack,
      componentStack: errorInfo?.componentStack,
      errorBoundaryProps: this.props,
      errorState: this.state
    });

    // Log if this is the "object with keys {value, reason}" error
    if (error?.message?.includes('object with keys')) {
      console.error('[ErrorBoundary] FOUND THE ISSUE - Object rendering error!');
      console.error('[ErrorBoundary] Error Info:', errorInfo);
      console.error('[ErrorBoundary] Component Stack:', errorInfo.componentStack);
    }

    this.setState({
      errorInfo,
      errorCount: this.state.errorCount + 1
    });

    if (onError) {
      onError(error, errorInfo);
    }
  }

  componentDidUpdate(prevProps: Props) {
    const { resetKeys, resetOnPropsChange } = this.props;
    const { hasError } = this.state;

    if (hasError) {
      // Reset on prop change if enabled
      if (resetOnPropsChange) {
        const hasPropsChanged = Object.keys(this.props).some(
          key => key !== 'children' && this.props[key as keyof Props] !== prevProps[key as keyof Props]
        );

        if (hasPropsChanged) {
          this.resetErrorBoundary();
        }
      }

      // Reset on specific key changes
      if (resetKeys) {
        const hasResetKeyChanged = resetKeys.some(
          key => this.props[key as keyof Props] !== prevProps[key as keyof Props]
        );

        if (hasResetKeyChanged) {
          this.resetErrorBoundary();
        }
      }
    }
  }

  resetErrorBoundary = () => {
    console.log('[ErrorBoundary] Resetting error boundary');
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0
    });
  };

  render() {
    const { hasError, error, errorInfo, errorCount } = this.state;
    const { children, fallback, isolate, name } = this.props;

    if (hasError && error) {
      // Log render attempt with error
      console.log(`[ErrorBoundary${name ? ` - ${name}` : ''}] Rendering error fallback`);

      // Default fallback UI
      const defaultFallback = (
        <div className="p-4 m-4 border-2 border-red-500 rounded-lg bg-red-50">
          <h2 className="text-lg font-semibold text-red-700 mb-2">
            ⚠️ Component Error {name ? `in ${name}` : ''}
          </h2>
          <details className="cursor-pointer">
            <summary className="text-sm text-red-600 hover:text-red-800">
              Click for error details (Development Only)
            </summary>
            <div className="mt-2 p-2 bg-white rounded border border-red-200">
              <p className="text-xs text-gray-700 mb-2">
                <strong>Error:</strong> {error.message}
              </p>
              {errorInfo && (
                <pre className="text-xs text-gray-600 overflow-auto max-h-40">
                  {errorInfo.componentStack}
                </pre>
              )}
              <button
                onClick={this.resetErrorBoundary}
                className="mt-2 px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
              >
                Try Again
              </button>
            </div>
          </details>
          {errorCount > 1 && (
            <p className="text-xs text-red-500 mt-2">
              Error occurred {errorCount} times
            </p>
          )}
        </div>
      );

      // Use provided fallback or default
      return fallback || defaultFallback;
    }

    // Wrap in isolate div if requested (helps with styling isolation)
    if (isolate) {
      return <div data-error-boundary={name || 'isolated'}>{children}</div>;
    }

    return children;
  }
}

export default ErrorBoundary;