export function resolveSpeechVoiceId(
  preferredVoiceId: string | null | undefined,
  availableVoiceIds: ReadonlySet<string>,
): string | undefined {
  return preferredVoiceId && availableVoiceIds.has(preferredVoiceId)
    ? preferredVoiceId
    : undefined;
}
