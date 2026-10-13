import * as Speech from 'expo-speech';
import React from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

type SpeechVoice = Awaited<ReturnType<typeof Speech.getAvailableVoicesAsync>>[number];

export function SpeechVoicePreference({
  value,
  onChange,
  disabled,
  testID,
}: {
  value: string | null;
  onChange: (voiceId: string | null) => void;
  disabled?: boolean;
  testID: string;
}) {
  const colors = useColors();
  const [visible, setVisible] = React.useState(false);
  const [voices, setVoices] = React.useState<SpeechVoice[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const request = React.useRef(0);
  const selectedVoice = voices.find((voice) => voice.identifier === value);
  const summary = value === null
    ? 'Device default'
    : selectedVoice
      ? `${selectedVoice.name} · ${selectedVoice.language}`
      : 'Saved voice is unavailable on this device';

  React.useEffect(() => {
    if (!visible) return;
    let mounted = true;
    const currentRequest = ++request.current;
    setLoading(true);
    setError('');
    void Speech.getAvailableVoicesAsync()
      .then((available) => {
        if (mounted && request.current === currentRequest) {
          const uniqueVoices = new Map(available.map((voice) => [voice.identifier, voice]));
          setVoices([...uniqueVoices.values()].sort((a, b) =>
            `${a.language} ${a.name}`.localeCompare(`${b.language} ${b.name}`),
          ));
        }
      })
      .catch(() => {
        if (mounted && request.current === currentRequest) {
          setError('Could not load voices from this device. You can still use the device default.');
        }
      })
      .finally(() => {
        if (mounted && request.current === currentRequest) setLoading(false);
      });
    return () => {
      mounted = false;
      request.current += 1;
    };
  }, [visible]);

  return (
    <>
      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.copy}>
          <Text style={[styles.label, { color: colors.foreground }]}>Speech voice</Text>
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            Choose a voice installed on this device for spoken routines, playlists, and ratings.
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Speech voice: ${summary}`}
          accessibilityHint="Opens the list of voices available on this device"
          testID={testID}
          disabled={disabled}
          onPress={() => setVisible(true)}
          style={[styles.chooseButton, { borderColor: colors.border, opacity: disabled ? 0.5 : 1 }]}
        >
          <Text numberOfLines={2} style={[styles.selected, { color: colors.foreground }]}>{summary}</Text>
          <Text style={[styles.change, { color: colors.primary }]}>Change</Text>
        </Pressable>
      </View>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <View style={[styles.backdrop, { backgroundColor: `${colors.foreground}66` }]}>
          <View style={[styles.dialog, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.foreground }]}>Choose speech voice</Text>
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>
              Voice options come from your device’s text-to-speech service.
            </Text>
            {loading ? (
              <View style={styles.loading}>
                <ActivityIndicator color={colors.primary} />
                <Text style={[styles.hint, { color: colors.mutedForeground }]}>Loading device voices…</Text>
              </View>
            ) : null}
            {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
            <ScrollView style={styles.voiceList} keyboardShouldPersistTaps="handled">
              <VoiceOption
                testID={`${testID}-system-default`}
                label="Device default"
                detail="Follow the voice selected in device settings"
                selected={value === null}
                disabled={disabled}
                onPress={() => { onChange(null); setVisible(false); }}
                colors={colors}
              />
              {!loading && !error && voices.length === 0 ? (
                <Text style={[styles.empty, { color: colors.mutedForeground }]}>
                  No other voices are available from this device.
                </Text>
              ) : null}
              {voices.map((voice) => (
                <VoiceOption
                  key={voice.identifier}
                  testID={`${testID}-voice-${voice.identifier}`}
                  label={voice.name}
                  detail={`${voice.language} · ${voice.quality.toLowerCase()}`}
                  selected={value === voice.identifier}
                  disabled={disabled}
                  onPress={() => { onChange(voice.identifier); setVisible(false); }}
                  colors={colors}
                />
              ))}
            </ScrollView>
            <Pressable
              accessibilityRole="button"
              onPress={() => setVisible(false)}
              style={[styles.closeButton, { borderColor: colors.border }]}
            >
              <Text style={[styles.closeText, { color: colors.foreground }]}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

function VoiceOption({
  testID,
  label,
  detail,
  selected,
  disabled,
  onPress,
  colors,
}: {
  testID: string;
  label: string;
  detail: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      style={[styles.voiceOption, { borderColor: colors.border, opacity: disabled ? 0.5 : 1 }]}
    >
      <View style={[styles.radio, { borderColor: selected ? colors.primary : colors.border }]}>
        {selected ? <View style={[styles.radioDot, { backgroundColor: colors.primary }]} /> : null}
      </View>
      <View style={styles.copy}>
        <Text style={[styles.optionLabel, { color: colors.foreground }]}>{label}</Text>
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>{detail}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 10 },
  copy: { flex: 1 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  hint: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, marginTop: 3 },
  chooseButton: { minHeight: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  selected: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 12 },
  change: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  backdrop: { flex: 1, padding: 20, justifyContent: 'center' },
  dialog: { maxHeight: '82%', borderWidth: 1, borderRadius: 18, padding: 16 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 18 },
  loading: { minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  error: { fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 17, marginTop: 12 },
  voiceList: { flexGrow: 0, marginTop: 12, marginBottom: 12 },
  empty: { fontFamily: 'Inter_400Regular', fontSize: 12, padding: 14 },
  voiceOption: { minHeight: 58, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 11 },
  optionLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  radio: { width: 20, height: 20, borderWidth: 2, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  closeButton: { minHeight: 44, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
});
