import type { BrowserState } from '@archa/protocol';

export type BrowserUiAction = 'navigate' | 'back' | 'forward' | 'reload' | 'stop' | 'devtools' | 'new' | 'switch' | 'close';

declare global {
  interface Window {
    archa: {
      platform: string;
      showOpenDialog(): Promise<string | null>;
      showSaveDialog(suggested: string): Promise<string | null>;
      showExportDialog(suggested: string, ext: string): Promise<string | null>;
      exportPdf(args: { pages: Array<{ html: string; width: number; height: number }>; path: string }): Promise<string | null>;
      embedScreenshot(webContentsId: number, mode: 'wide' | 'object'): Promise<{ path?: string | null; error?: string }>;
      segment(rgb: Uint8Array): Promise<{ mask?: Uint8Array; error?: string }>;
      onModelProgress(cb: (p: { received: number; total: number }) => void): () => void;
      pickFolder(title: string): Promise<string | null>;
      openFolder(path: string): Promise<string>;
      onOpenIntent(cb: (intent: { kind: string; path?: string }) => void): void;
      browser: {
        setBounds(r: { x: number; y: number; width: number; height: number } | null): void;
        getState(): Promise<BrowserState>;
        ui(action: BrowserUiAction, arg?: string): Promise<string | null>;
        onState(cb: (state: BrowserState) => void): () => void;
        onReveal(cb: () => void): () => void;
        onToggle(cb: () => void): () => void;
      };
    };
  }
}
