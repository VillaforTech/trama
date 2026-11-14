export {};

declare global {
  interface Window {
    tramaDesktop?: {
      readonly platform: string;
      selectFolder(): Promise<string | null>;
      onOpenFolder(callback: (path: string) => void): () => void;
      onNavigate(callback: (destination: 'search' | 'settings' | 'library') => void): () => void;
    };
  }
}
