/**
 * Top-level React error boundary.
 *
 * Without this any uncaught error in the tree shows a blank white screen on
 * the kiosk — disastrous if it lands at the entrance unattended. We surface
 * a friendly Russian message + a Refresh button that the manager can tap.
 *
 * The error itself is logged to console (Web Inspector) and shipped to
 * `window.__bekLastCrash__` so it can be inspected remotely.
 */

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

declare global {
  interface Window {
    __bekLastCrash__?: { message: string; stack?: string; ts: string };
  }
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }): void {
    // eslint-disable-next-line no-console
    console.error("[BEK_FaceID crash]", error, info);
    window.__bekLastCrash__ = {
      message: error.message,
      stack: error.stack,
      ts: new Date().toISOString(),
    };
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-bek-bg p-6">
        <div className="max-w-md w-full bg-bek-surface border border-bek-border rounded-2xl shadow-lg p-8 text-center">
          <div className="text-display-md mb-2">Что-то пошло не так</div>
          <p className="text-body-md text-bek-textMuted mb-6">
            Произошла внутренняя ошибка. Попробуйте обновить страницу.
            Если проблема повторяется — обратитесь к управляющему.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="h-11 px-5 rounded-xl bg-bek-indigo text-white font-medium hover:brightness-110 transition-all"
          >
            Обновить страницу
          </button>
          {import.meta.env.DEV && (
            <pre className="mt-4 text-left text-xs text-bek-red font-mono overflow-auto max-h-40 whitespace-pre-wrap">
              {this.state.error.message}
            </pre>
          )}
        </div>
      </div>
    );
  }
}
