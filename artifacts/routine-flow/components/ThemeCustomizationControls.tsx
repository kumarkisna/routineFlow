import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import {
  applyThemeCustomization, contrastRatio, defaultThemeCustomization, findAppTheme,
  themeColorSwatches, type AppTheme, type ThemeCustomization, type ThemeColorSwatch,
} from '@/lib/appThemes';

function ToneSlider({ value, disabled, onPreview, onCommit, colors, testID }: {
  value: number;
  disabled: boolean;
  onPreview: (value: number) => void;
  onCommit: (value: number) => void;
  colors: AppTheme['colors'];
  testID: string;
}) {
  const [width, setWidth] = React.useState(1);
  const [left, setLeft] = React.useState(0);
  const valueRef = React.useRef(value);
  const sliderRef = React.useRef<View>(null);
  React.useEffect(() => { valueRef.current = value; }, [value]);
  const update = React.useCallback((nextValue: number, commit = false) => {
    const next = Math.max(0, Math.min(100, Math.round(nextValue)));
    valueRef.current = next;
    onPreview(next);
    if (commit) onCommit(next);
  }, [onCommit, onPreview]);
  const updateFromX = React.useCallback((x: number) => {
    if (!Number.isFinite(x) || width <= 1) return;
    update((x / width) * 100);
  }, [update, width]);
  const panResponder = React.useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled,
    onMoveShouldSetPanResponder: () => !disabled,
    onPanResponderGrant: event => updateFromX(event.nativeEvent.locationX),
    onPanResponderMove: event => updateFromX(event.nativeEvent.locationX),
    onPanResponderRelease: () => onCommit(valueRef.current),
    onPanResponderTerminate: () => onCommit(valueRef.current),
  }), [disabled, onCommit, updateFromX]);
  const setFromWebEvent = (event: { nativeEvent: { locationX?: number; pageX?: number } }, commit: boolean) => {
    const x = Number.isFinite(event.nativeEvent.pageX)
      ? event.nativeEvent.pageX! - left
      : event.nativeEvent.locationX;
    if (typeof x !== 'number' || !Number.isFinite(x) || width <= 1) return;
    const next = Math.max(0, Math.min(100, Math.round((x / width) * 100)));
    update(next, commit);
  };
  const adjust = (amount: number) => update(valueRef.current + amount, true);
  return (
    <View style={styles.sliderBlock}>
      <View style={styles.sliderLabels}>
        <Text style={[styles.meta, { color: colors.mutedForeground }]}>Lighter</Text>
        <Text testID={`${testID}-value`} accessibilityLiveRegion="polite" style={[styles.meta, { color: colors.mutedForeground }]}>{value}%</Text>
        <Text style={[styles.meta, { color: colors.mutedForeground }]}>Deeper</Text>
      </View>
      <Pressable
        ref={sliderRef}
        testID={testID}
        accessibilityRole="adjustable"
        accessibilityLabel="Surface depth"
        accessibilityHint="Swipe to make the theme lighter or deeper."
        accessibilityValue={{ min: 0, max: 100, now: value, text: `${value}% depth` }}
        accessibilityActions={[{ name: 'increment', label: 'Make deeper' }, { name: 'decrement', label: 'Make lighter' }]}
        onAccessibilityAction={event => adjust(event.nativeEvent.actionName === 'increment' ? 5 : -5)}
        accessibilityState={{ disabled }}
        onLayout={event => {
          setWidth(event.nativeEvent.layout.width);
          sliderRef.current?.measureInWindow(x => setLeft(x));
        }}
        onPress={Platform.OS === 'web' ? event => setFromWebEvent(event, true) : undefined}
        onTouchStart={Platform.OS === 'web' ? event => setFromWebEvent(event, false) : undefined}
        onTouchMove={Platform.OS === 'web' ? event => setFromWebEvent(event, false) : undefined}
        {...(Platform.OS === 'web' ? {} : panResponder.panHandlers)}
        disabled={disabled}
        style={[styles.sliderTouch, disabled && { opacity: 0.55 }]}
      >
        <View style={[styles.sliderTrack, { backgroundColor: colors.border }]}>
          <View style={[styles.sliderFill, { width: `${value}%`, backgroundColor: colors.primary }]} />
          <View style={[styles.sliderThumb, { left: `${value}%`, borderColor: colors.primary, backgroundColor: colors.card }]} />
        </View>
      </Pressable>
    </View>
  );
}

function ColorSwatchRow({ label, id, swatches, value, disabled, onSelect, colors, testIDPrefix }: {
  label: string;
  id: string;
  swatches: ThemeColorSwatch[];
  value: string;
  disabled: boolean;
  onSelect: (color: string) => void;
  colors: AppTheme['colors'];
  testIDPrefix: string;
}) {
  return (
    <View style={styles.swatchSection}>
      <Text style={[styles.controlLabel, { color: colors.foreground }]}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.swatchChoices}>
        {swatches.map(swatch => {
          const selected = swatch.color.toLowerCase() === value.toLowerCase();
          const checkColor = contrastRatio(swatch.color, '#ffffff') > contrastRatio(swatch.color, '#101820')
            ? '#ffffff' : '#101820';
          return (
            <Pressable
              key={`${label}-${swatch.color}`}
              testID={`${testIDPrefix}-${id}-color-${swatch.name.toLowerCase().replace(/\s+/g, '-')}`}
              accessibilityRole="radio"
              accessibilityLabel={`${label}: ${swatch.name}, ${swatch.color}`}
              accessibilityState={{ selected, disabled }}
              disabled={disabled}
              onPress={() => onSelect(swatch.color)}
              style={styles.swatchChoice}
            >
              <View style={[
                styles.colorDot,
                { backgroundColor: swatch.color, borderColor: selected ? colors.foreground : colors.border },
                selected && styles.selectedDot,
              ]}>
                {selected ? <Ionicons name="checkmark" size={15} color={checkColor} /> : null}
              </View>
              <Text style={[styles.swatchName, { color: colors.foreground }]}>{swatch.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function ThemeCustomizationControls({ theme, customization, disabled, onPreview, onCommit, testIDPrefix }: {
  theme: AppTheme;
  customization: ThemeCustomization;
  disabled: boolean;
  onPreview: (value: ThemeCustomization) => void;
  onCommit: (value: ThemeCustomization) => void;
  testIDPrefix: string;
}) {
  const baseTheme = findAppTheme(theme.id) ?? theme;
  const update = (patch: Partial<ThemeCustomization>, commit = false) => {
    const next = { ...customization, ...patch };
    onPreview(next);
    if (commit) onCommit(next);
  };
  const reset = () => {
    const next = defaultThemeCustomization(baseTheme);
    onPreview(next);
    onCommit(next);
  };
  const preview = applyThemeCustomization(baseTheme, customization);
  return (
    <View testID={`${testIDPrefix}-customization`} style={[styles.customizer, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
      <View style={styles.heading}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[styles.customizerTitle, { color: theme.colors.foreground }]}>Customize {baseTheme.name}</Text>
          <Text style={[styles.meta, { color: theme.colors.mutedForeground }]}>Changes preview as you choose.</Text>
        </View>
        <Pressable testID={`${testIDPrefix}-reset`} accessibilityRole="button" accessibilityLabel={`Reset ${baseTheme.name} colors to preset`}
          disabled={disabled} onPress={reset} style={[styles.reset, { borderColor: theme.colors.border }]}>
          <Text style={[styles.resetText, { color: theme.colors.primary }]}>Reset</Text>
        </Pressable>
      </View>
      <View style={[styles.preview, { backgroundColor: preview.colors.background, borderColor: preview.colors.border }]}>
        <Text style={[styles.previewLabel, { color: preview.colors.foreground }]}>Preview</Text>
        <View style={styles.previewRow}>
          <View style={[styles.previewSwatch, { backgroundColor: preview.colors.primary }]}>
            <Text style={[styles.previewSwatchText, { color: preview.colors.primaryForeground }]}>Primary</Text>
          </View>
          <View style={[styles.previewSwatch, { backgroundColor: preview.colors.accent }]}>
            <Text style={[styles.previewSwatchText, { color: preview.colors.accentForeground }]}>Accent</Text>
          </View>
        </View>
      </View>
      <ToneSlider
        value={customization.tone}
        disabled={disabled}
        onPreview={tone => update({ tone })}
        onCommit={tone => update({ tone }, true)}
        colors={theme.colors}
        testID={`${testIDPrefix}-tone-slider`}
      />
      <ColorSwatchRow label="Primary color" id="primary" swatches={themeColorSwatches(baseTheme.scheme, baseTheme.colors.primary)}
        value={customization.primary} disabled={disabled} colors={theme.colors} testIDPrefix={testIDPrefix}
        onSelect={color => update({ primary: color }, true)} />
      <ColorSwatchRow label="Accent color" id="accent" swatches={themeColorSwatches(baseTheme.scheme, baseTheme.colors.accent)}
        value={customization.accent} disabled={disabled} colors={theme.colors} testIDPrefix={testIDPrefix}
        onSelect={color => update({ accent: color }, true)} />
    </View>
  );
}

const styles = StyleSheet.create({
  customizer: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 12 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  customizerTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 16 },
  meta: { fontFamily: 'Inter_400Regular', fontSize: 12 },
  reset: { minHeight: 36, minWidth: 64, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 18, paddingHorizontal: 11 },
  resetText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  preview: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 8 },
  previewLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  previewRow: { flexDirection: 'row', gap: 8 },
  previewSwatch: { flex: 1, minHeight: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 9, paddingHorizontal: 8 },
  previewSwatchText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  sliderBlock: { gap: 3 },
  sliderLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  sliderTouch: { height: 42, justifyContent: 'center', paddingHorizontal: 12 },
  sliderTrack: { height: 6, borderRadius: 3 },
  sliderFill: { height: 6, borderRadius: 3 },
  sliderThumb: { position: 'absolute', top: -9, marginLeft: -11, width: 22, height: 22, borderWidth: 2, borderRadius: 11 },
  swatchSection: { gap: 6 },
  controlLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  swatchChoices: { gap: 9 },
  swatchChoice: { minWidth: 52, minHeight: 58, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 4, borderRadius: 10 },
  colorDot: { width: 29, height: 29, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  selectedDot: { borderWidth: 2 },
  swatchName: { fontFamily: 'Inter_400Regular', fontSize: 10 },
});
