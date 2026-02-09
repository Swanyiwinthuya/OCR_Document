export {};

declare global {
  interface Window {
    cv: any;
    cvReady?: Promise<void>;
  }
}
