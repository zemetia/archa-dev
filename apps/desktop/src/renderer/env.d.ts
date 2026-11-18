export {};

declare global {
  interface Window {
    archa: {
      platform: string;
      showOpenDialog(): Promise<string | null>;
      showSaveDialog(suggested: string): Promise<string | null>;
      showExportDialog(suggested: string, ext: string): Promise<string | null>;
      onOpenIntent(cb: (intent: { kind: string; path?: string }) => void): void;
    };
  }
}
