import * as Speech from 'expo-speech';
import React from 'react';
import { resolveSpeechVoiceId } from '@/lib/speechVoice';

let availableVoiceIdsRequest: Promise<Set<string>> | null = null;

function loadAvailableVoiceIds() {
  if (!availableVoiceIdsRequest) {
    availableVoiceIdsRequest = Speech.getAvailableVoicesAsync()
      .then((voices) => {
        const ids = new Set(voices.map((voice) => voice.identifier));
        if (ids.size === 0) availableVoiceIdsRequest = null;
        return ids;
      })
      .catch(() => {
        availableVoiceIdsRequest = null;
        return new Set<string>();
      });
  }
  return availableVoiceIdsRequest;
}

export function useSpeechVoice(voiceId: string | null | undefined) {
  const [availableVoiceIds, setAvailableVoiceIds] = React.useState<Set<string> | null>(null);

  React.useEffect(() => {
    let mounted = true;
    void loadAvailableVoiceIds().then((voiceIds) => {
      if (mounted) setAvailableVoiceIds(voiceIds);
    });
    return () => {
      mounted = false;
    };
  }, []);

  return availableVoiceIds ? resolveSpeechVoiceId(voiceId, availableVoiceIds) : undefined;
}
