import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import {
  MAX_SPEECH_LINE_GAP_SECONDS,
  MIN_SPEECH_LINE_GAP_SECONDS,
  SPEECH_LINE_GAP_ADJUSTMENT_SECONDS,
  SPEECH_LINE_GAP_PRESETS_SECONDS,
} from '@/lib/speechGap';

function formatGap(value: number) {
  return `${Number(value.toFixed(2))} ${value === 1 ? 'second' : 'seconds'}`;
}

export function SpeechLineGapControl({
  value,
  defaultValue,
  onChange,
  disabled = false,
  allowInherit = false,
  label = 'Pause between spoken lines',
  hint,
  testID = 'speech-line-gap',
}: {
  value: number | undefined;
  defaultValue: number;
  onChange: (value: number | undefined) => void;
  disabled?: boolean;
  allowInherit?: boolean;
  label?: string;
  hint?: string;
  testID?: string;
}) {
  const colors = useColors();
  const inherited = allowInherit && value === undefined;
  const shownValue = value ?? defaultValue;
  const decrement = () => onChange(Math.max(
    MIN_SPEECH_LINE_GAP_SECONDS,
    Number((shownValue - SPEECH_LINE_GAP_ADJUSTMENT_SECONDS).toFixed(2)),
  ));
  const increment = () => onChange(Math.min(
    MAX_SPEECH_LINE_GAP_SECONDS,
    Number((shownValue + SPEECH_LINE_GAP_ADJUSTMENT_SECONDS).toFixed(2)),
  ));
  const choiceStyle = (selected: boolean) => [
    styles.choice,
    {
      backgroundColor: selected ? colors.primary : colors.secondary,
      borderColor: selected ? colors.primary : colors.border,
    },
  ];
  const choiceTextStyle = (selected: boolean) => [
    styles.choiceText,
    { color: selected ? colors.primaryForeground : colors.foreground },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.foreground }]}>{label}</Text>
      {hint ? <Text style={[styles.hint, { color: colors.mutedForeground }]}>{hint}</Text> : null}
      <Text testID={`${testID}-value`} accessibilityLiveRegion="polite"
        style={[styles.current, { color: colors.foreground }]}>
        {inherited ? `Use profile default · ${formatGap(defaultValue)}` : formatGap(shownValue)}
      </Text>
      <View style={styles.adjustRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Decrease pause by ${formatGap(SPEECH_LINE_GAP_ADJUSTMENT_SECONDS)}`}
          accessibilityState={{ disabled: disabled || shownValue <= MIN_SPEECH_LINE_GAP_SECONDS }}
          testID={`${testID}-decrease`}
          disabled={disabled || shownValue <= MIN_SPEECH_LINE_GAP_SECONDS}
          onPress={decrement}
          style={[styles.adjustButton, { borderColor: colors.border, backgroundColor: colors.secondary }]}
        >
          <Text style={[styles.adjustText, { color: colors.foreground }]}>−</Text>
        </Pressable>
        <Text style={[styles.adjustHint, { color: colors.mutedForeground }]}>Adjust by 0.25 seconds</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Increase pause by ${formatGap(SPEECH_LINE_GAP_ADJUSTMENT_SECONDS)}`}
          accessibilityState={{ disabled: disabled || shownValue >= MAX_SPEECH_LINE_GAP_SECONDS }}
          testID={`${testID}-increase`}
          disabled={disabled || shownValue >= MAX_SPEECH_LINE_GAP_SECONDS}
          onPress={increment}
          style={[styles.adjustButton, { borderColor: colors.border, backgroundColor: colors.secondary }]}
        >
          <Text style={[styles.adjustText, { color: colors.foreground }]}>+</Text>
        </Pressable>
      </View>
      <View style={styles.choices}>
        {allowInherit ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Use profile default"
            accessibilityState={{ selected: inherited, disabled }}
            testID={`${testID}-inherit`}
            disabled={disabled}
            onPress={() => onChange(undefined)}
            style={choiceStyle(inherited)}
          >
            <Text style={choiceTextStyle(inherited)}>Use profile default</Text>
          </Pressable>
        ) : null}
        {SPEECH_LINE_GAP_PRESETS_SECONDS.map(preset => {
          const selected = !inherited && shownValue === preset;
          return (
            <Pressable
              key={preset}
              accessibilityRole="button"
              accessibilityLabel={formatGap(preset)}
              accessibilityState={{ selected, disabled }}
              testID={`${testID}-preset-${String(preset).replace('.', '-')}`}
              disabled={disabled}
              onPress={() => onChange(preset)}
              style={choiceStyle(selected)}
            >
              <Text style={choiceTextStyle(selected)}>{formatGap(preset)}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={[styles.bounds, { color: colors.mutedForeground }]}>Choose from 0 to 5 seconds.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 7 },
  title: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  hint: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17 },
  current: { fontFamily: 'Inter_600SemiBold', fontSize: 15, marginTop: 2 },
  adjustRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  adjustButton: { width: 44, height: 40, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  adjustText: { fontFamily: 'Inter_600SemiBold', fontSize: 21 },
  adjustHint: { flex: 1, textAlign: 'center', fontFamily: 'Inter_400Regular', fontSize: 12 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  choice: { minHeight: 38, borderWidth: 1, borderRadius: 19, paddingHorizontal: 11, justifyContent: 'center' },
  choiceText: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  bounds: { fontFamily: 'Inter_400Regular', fontSize: 11 },
});
