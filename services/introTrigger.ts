/**
 * Global intro trigger service
 * Allows triggering the intro from anywhere in the app
 */

type IntroTriggerCallback = () => void;

let triggerCallback: IntroTriggerCallback | null = null;

export function registerIntroTrigger(callback: IntroTriggerCallback) {
  triggerCallback = callback;
}

export function unregisterIntroTrigger() {
  triggerCallback = null;
}

export function triggerIntro() {
  if (triggerCallback) {
    triggerCallback();
  } else {
    console.warn('[INTRO] No intro trigger registered');
  }
}

