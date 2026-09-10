// Global browser API augmentations — Web Speech, PWA install prompt, boot flag.

interface Window {
  /** Set by App on first render; read by the index.html boot watchdog. */
  __veloraBooted?: boolean;
  SpeechRecognition?: new () => SpeechRecognitionInstance;
  webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
}

/** Minimal Web Speech API recognition instance (progressive enhancement). */
interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

interface SpeechRecognitionEvent extends Event {
  readonly results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

/** PWA `beforeinstallprompt` event (Chromium). */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
