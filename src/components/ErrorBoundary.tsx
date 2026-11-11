// If a screen crashes while drawing, show what went wrong with a way out — never a blank screen.
import { Component, type ErrorInfo, type ReactNode } from 'react';

const LAST_ERROR_KEY = 'db-last-screen-error';

export function lastScreenError(): string | null {
  try {
    return localStorage.getItem(LAST_ERROR_KEY);
  } catch {
    return null;
  }
}

type Props = { children: ReactNode; resetKey?: string; onHome?: () => void };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    try {
      const where = (info.componentStack || '').trim().split('\n').slice(0, 4).join(' | ');
      localStorage.setItem(LAST_ERROR_KEY, `${new Date().toISOString()} ${window.location.pathname} — ${error.message} — ${where}`.slice(0, 1500));
    } catch {
      /* storage unavailable */
    }
  }

  componentDidUpdate(prev: Props) {
    // moving to another screen clears the error
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="page-wrap relative z-10 mx-auto px-1 pb-32 pt-safe">
        <div className="glass mt-10 rounded-[20px] p-5 text-center">
          <p className="text-[18px] font-bold">This screen couldn’t open</p>
          <p className="mt-1.5 text-[13.5px] text-muted">Your data is safe. Go Home or reload the app. If it keeps happening, send a screenshot of this message.</p>
          <p className="mt-3 break-words rounded-[12px] bg-[var(--solid)] p-2.5 text-left font-mono text-[11.5px] text-muted">{error.message || String(error)}</p>
          <div className="mt-4 flex justify-center gap-2">
            <button
              type="button"
              className="press rounded-full bg-[var(--primary)] px-4 py-2 text-[14px] font-semibold text-[var(--on-primary,#fff)]"
              onClick={() => {
                this.setState({ error: null });
                if (this.props.onHome) this.props.onHome();
                else window.location.replace('/');
              }}
            >
              Go Home
            </button>
            <button type="button" className="glass press rounded-full px-4 py-2 text-[14px] font-semibold" onClick={() => window.location.reload()}>
              Reload app
            </button>
          </div>
        </div>
      </div>
    );
  }
}
