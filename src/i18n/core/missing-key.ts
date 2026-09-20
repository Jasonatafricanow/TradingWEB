import type { Locale } from "./locale";

export interface MissingTranslationEvent {
  locale: Locale;
  key: string;
}

export type MissingTranslationReporter = (event: MissingTranslationEvent) => void;

let reporter: MissingTranslationReporter = () => {};

export function setMissingTranslationReporter(next: MissingTranslationReporter): void {
  reporter = next;
}

export function reportMissingTranslation(event: MissingTranslationEvent): void {
  reporter(event);
}
