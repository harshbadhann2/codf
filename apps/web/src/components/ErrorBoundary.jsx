import { Component } from 'react';

/**
 * Last line of defence. Without it, an unexpected render error leaves the user
 * looking at a blank white page with no idea what happened.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled UI error', error, info);
  }

  render() {
    const { error } = this.state;

    if (!error) return this.props.children;

    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Something broke on this page</h1>
        <p className="mt-2 text-sm text-[var(--ink-muted)]">
          Reloading usually fixes it. If it keeps happening, the details are in your browser console.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-xl border border-[var(--line)] bg-white/70 p-3 text-left font-mono text-xs dark:bg-[#101319]/60">
          {String(error.message || error)}
        </pre>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="btn-primary focus-ring mt-4"
        >
          Reload
        </button>
      </div>
    );
  }
}
