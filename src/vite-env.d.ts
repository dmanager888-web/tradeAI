/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPENAI_API_KEY?: string;
  readonly VITE_ANTHROPIC_API_KEY?: string;
  readonly VITE_GEMINI_API_KEY?: string;
  readonly VITE_ADMOB_APP_ID?: string;
  readonly VITE_ADMOB_BANNER?: string;
  readonly VITE_ADMOB_INTERSTITIAL?: string;
  readonly VITE_ADSENSE_CLIENT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

interface Window {
  deferredPwa?: BeforeInstallPromptEvent;
}
