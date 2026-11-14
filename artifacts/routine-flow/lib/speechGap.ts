export const DEFAULT_SPEECH_LINE_GAP_SECONDS = 0.5;
export const MIN_SPEECH_LINE_GAP_SECONDS = 0;
export const MAX_SPEECH_LINE_GAP_SECONDS = 5;
export const SPEECH_LINE_GAP_ADJUSTMENT_SECONDS = 0.25;
export const SPEECH_LINE_GAP_PRESETS_SECONDS = [0, 0.25, 0.5, 1, 2] as const;

export function isValidSpeechLineGapSeconds(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value >= MIN_SPEECH_LINE_GAP_SECONDS
    && value <= MAX_SPEECH_LINE_GAP_SECONDS
    && Math.round(value * 100) === value * 100;
}

export function resolveSpeechLineGapSeconds(
  playlistGap?: number,
  routineGap?: number,
  profileGap: number = DEFAULT_SPEECH_LINE_GAP_SECONDS,
): number {
  if (isValidSpeechLineGapSeconds(playlistGap)) return playlistGap;
  if (isValidSpeechLineGapSeconds(routineGap)) return routineGap;
  return isValidSpeechLineGapSeconds(profileGap) ? profileGap : DEFAULT_SPEECH_LINE_GAP_SECONDS;
}

export function parsePlaylistSpeechLineGapParam(value?: string): number | undefined {
  if (value === undefined || value === 'profile') return undefined;
  const parsed = Number(value);
  return isValidSpeechLineGapSeconds(parsed) ? parsed : undefined;
}
