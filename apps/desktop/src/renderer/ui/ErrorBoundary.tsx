import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Last line of defence: an uncaught render or effect error would otherwise unmount the
 * whole tree and leave a blank window. Shows the error and a reload instead.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ArchaDev UI crashed:', error, info.componentStack);
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="w-full max-w-[560px] space-y-3 rounded-2xl border border-line bg-panel p-5">
          <div className="text-[14px] font-semibold text-fg">Something went wrong in the interface</div>
          <p className="text-[12px] leading-relaxed text-fg-muted">Your documents are kept by the core process, so reloading the window does not lose them.</p>
          <pre className="max-h-[200px] overflow-auto whitespace-pre-wrap rounded-lg bg-panel-2 p-3 font-mono text-[11px] text-danger">{error.stack ?? error.message}</pre>
          <div className="flex gap-2">
            <button onClick={() => this.setState({ error: null })} className="h-8 rounded-lg bg-panel-2 px-3 text-[12px] hover:bg-panel-3">Try again</button>
            <button onClick={() => location.reload()} className="h-8 rounded-lg bg-accent px-3 text-[12px] text-white">Reload window</button>
          </div>
        </div>
      </div>
    );
  }
}
