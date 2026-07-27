export const CHARACTER_GENERATION_WATCHDOG_MS = 5 * 60 * 1000;
export const CHARACTER_GENERATION_TIMEOUT_MESSAGE = 'Generation timed out after 5 minutes. Try again.';

export function getStaleCharacterGenerationCutoff(nowMs = Date.now()) {
  return new Date(nowMs - CHARACTER_GENERATION_WATCHDOG_MS).toISOString();
}
