import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React from 'react';
import { ActivityIndicator, FlatList, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppearance } from '@/context/AppearanceContext';
import { usePeople } from '@/context/PeopleContext';
import { useColors } from '@/hooks/useColors';
import { usePersistentDisclosure } from '@/hooks/usePersistentDisclosure';
import {
  APP_THEMES,
  DEFAULT_THEME_ID,
  THEME_GROUPS,
  findAppTheme,
  themeColorSwatches,
  type AppTheme,
  type ThemeCustomization,
  type ThemeColorSwatch,
} from '@/lib/appThemes';

type Scheme = 'all' | 'light' | 'dark';

const ThemeCard = React.memo(function ThemeCard({ item, selected, disabled, expanded, onPress, onToggle }: {
  item: AppTheme; selected: boolean; disabled: boolean; expanded: boolean; onPress: (id: string) => void; onToggle: (id: string) => void;
}) {
  const c = item.colors;
  const ui = useColors();
  return (
    <View style={[styles.card, { backgroundColor: c.background, borderColor: selected ? ui.primary : c.border, borderWidth: selected ? 2.5 : 1, opacity: disabled && !selected ? 0.6 : 1 }]}>
      {expanded ? (
        <>
          <View style={[styles.mini, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={[styles.miniIcon, { backgroundColor: c.coralSoft }]}>
              <View style={[styles.dot, { backgroundColor: c.primary }]} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <View style={[styles.line, { backgroundColor: c.foreground, width: '80%' }]} />
              <View style={[styles.track, { backgroundColor: c.secondary }]}>
                <View style={[styles.fill, { backgroundColor: c.primary }]} />
              </View>
            </View>
          </View>
          <View style={styles.swatches}>
            {[c.primary, c.accent, c.hero, c.sage, c.secondary].map((col, i) => (
              <View key={i} style={[styles.swatch, { backgroundColor: col, borderColor: c.border }]} />
            ))}
          </View>
        </>
      ) : null}
      <View style={styles.nameRow}>
        <Pressable
          testID={item.id}
          accessibilityRole="button"
          accessibilityLabel={`${item.name}, ${item.group}, ${item.scheme} theme`}
          accessibilityState={{ selected, disabled }}
          disabled={disabled}
          onPress={() => onPress(item.id)}
          style={({ pressed }) => [{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 }, pressed && { opacity: 0.8 }]}
        >
          <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={[styles.name, { color: c.foreground }]}>{item.name}</Text>
          <Text style={[styles.meta, { color: c.mutedForeground }]}>{item.group} · {item.scheme}</Text>
          </View>
          {selected ? (
            <View style={[styles.check, { backgroundColor: c.primary }]}>
              <Ionicons name="checkmark" size={14} color={c.primaryForeground} />
            </View>
          ) : null}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`${expanded ? 'Collapse' : 'Expand'} ${item.name} theme preview`}
          accessibilityState={{ expanded }} testID={`toggle-theme-${item.id}`} onPress={() => onToggle(item.id)} style={styles.expandTheme}>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={c.foreground} />
        </Pressable>
      </View>
    </View>
  );
});

function ToneSlider({ value, disabled, onChange, onCommit, colors }: {
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
  onCommit: (value: number) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const [width, setWidth] = React.useState(1);
  const valueRef = React.useRef(value);
  React.useEffect(() => { valueRef.current = value; }, [value]);
  const updateFromX = React.useCallback((x: number) => {
    const next = Math.max(0, Math.min(100, Math.round((x / width) * 100)));
    valueRef.current = next;
    onChange(next);
  }, [onChange, width]);
  const panResponder = React.useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled,
    onMoveShouldSetPanResponder: () => !disabled,
    onPanResponderGrant: event => updateFromX(event.nativeEvent.locationX),
    onPanResponderMove: event => updateFromX(event.nativeEvent.locationX),
    onPanResponderRelease: () => onCommit(valueRef.current),
    onPanResponderTerminate: () => onCommit(valueRef.current),
  }), [disabled, onCommit, updateFromX]);
  const adjust = (amount: number) => {
    const next = Math.max(0, Math.min(100, value + amount));
    valueRef.current = next;
    onChange(next);
    onCommit(next);
  };
  return (
    <View style={styles.sliderBlock}>
      <View style={styles.sliderLabels}>
        <Text style={[styles.meta, { color: colors.mutedForeground }]}>Lighter</Text>
        <Text style={[styles.meta, { color: colors.mutedForeground }]}>{value}%</Text>
        <Text style={[styles.meta, { color: colors.mutedForeground }]}>Deeper</Text>
      </View>
      <View
        {...panResponder.panHandlers}
        onLayout={event => setWidth(event.nativeEvent.layout.width)}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Surface depth"
        accessibilityHint="Swipe to make the theme lighter or deeper."
        accessibilityValue={{ min: 0, max: 100, now: value, text: `${value}% depth` }}
        accessibilityActions={[{ name: 'increment', label: 'Make deeper' }, { name: 'decrement', label: 'Make lighter' }]}
        onAccessibilityAction={event => adjust(event.nativeEvent.actionName === 'increment' ? 5 : -5)}
        accessibilityState={{ disabled }}
        style={[styles.sliderTouch, disabled && { opacity: 0.55 }]}
      >
        <View style={[styles.sliderTrack, { backgroundColor: colors.border }]}>
          <View style={[styles.sliderFill, { width: `${value}%`, backgroundColor: colors.primary }]} />
          <View style={[styles.sliderThumb, { left: `${value}%`, borderColor: colors.primary, backgroundColor: colors.card }]} />
        </View>
      </View>
    </View>
  );
}

function ColorSwatchRow({ label, swatches, value, disabled, onSelect, colors }: {
  label: string;
  swatches: ThemeColorSwatch[];
  value: string;
  disabled: boolean;
  onSelect: (color: string) => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.swatchSection}>
      <Text style={[styles.controlLabel, { color: colors.foreground }]}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.swatchChoices}>
        {swatches.map(swatch => {
          const selected = swatch.color.toLowerCase() === value.toLowerCase();
          return (
            <Pressable
              key={`${label}-${swatch.color}`}
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
              ]} />
              <Text style={[styles.swatchName, { color: colors.foreground }]}>{swatch.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function ThemeCustomizationControls({ theme, customization, disabled, onPreview, onCommit, colors }: {
  theme: AppTheme;
  customization: ThemeCustomization;
  disabled: boolean;
  onPreview: (value: ThemeCustomization) => void;
  onCommit: (value: ThemeCustomization) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const baseTheme = findAppTheme(theme.id) ?? theme;
  const update = (patch: Partial<ThemeCustomization>, commit = false) => {
    const next = { ...customization, ...patch };
    onPreview(next);
    if (commit) onCommit(next);
  };
  return (
    <View style={[styles.customizer, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.customizerTitle, { color: colors.foreground }]}>Customize {theme.name}</Text>
      <Text style={[styles.meta, { color: colors.mutedForeground }]}>Changes preview across the app as you adjust them.</Text>
      <Text style={[styles.meta, { color: colors.mutedForeground }]}>Primary colors are adjusted when needed for readable text.</Text>
      <ToneSlider
        value={customization.tone}
        disabled={disabled}
        onChange={tone => update({ tone })}
        onCommit={tone => update({ tone }, true)}
        colors={colors}
      />
      <ColorSwatchRow label="Primary color" swatches={themeColorSwatches(baseTheme.scheme, baseTheme.colors.primary)}
        value={customization.primary} disabled={disabled} colors={colors}
        onSelect={color => update({ primary: color }, true)} />
      <ColorSwatchRow label="Accent color" swatches={themeColorSwatches(baseTheme.scheme, baseTheme.colors.accent)}
        value={customization.accent} disabled={disabled} colors={colors}
        onSelect={color => update({ accent: color }, true)} />
    </View>
  );
}

export default function AppearanceScreen({ asTab = false }: { asTab?: boolean } = {}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { activePerson } = usePeople();
  const disclosure = usePersistentDisclosure('themes', activePerson.id);
  const {
    theme, loading, saving, error, selectTheme, customization,
    previewCustomization, saveCustomization, resetTheme,
  } = useAppearance();
  const [query, setQuery] = React.useState('');
  const [group, setGroup] = React.useState<string>('All');
  const [scheme, setScheme] = React.useState<Scheme>('all');
  const [failed, setFailed] = React.useState('');
  const [lastId, setLastId] = React.useState<string | null>(null);
  const [lastCustomization, setLastCustomization] = React.useState<ThemeCustomization | null>(null);
  const [lastReset, setLastReset] = React.useState(false);
  const busy = loading || saving;

  const data = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return APP_THEMES.filter(t => (group === 'All' || t.group === group) &&
      (scheme === 'all' || t.scheme === scheme) && (!q || t.name.toLowerCase().includes(q)));
  }, [query, group, scheme]);

  const choose = React.useCallback(async (id: string) => {
    setFailed('');
    setLastId(id);
    setLastCustomization(null);
    setLastReset(false);
    try {
      await selectTheme(id);
      void Haptics.selectionAsync();
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'Could not save your theme.');
    }
  }, [selectTheme]);
  const saveColors = React.useCallback(async (value: ThemeCustomization) => {
    setFailed('');
    setLastCustomization(value);
    setLastId(null);
    setLastReset(false);
    try {
      await saveCustomization(value);
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'Could not save custom colors.');
    }
  }, [saveCustomization]);
  const reset = React.useCallback(async () => {
    setFailed('');
    setLastCustomization(null);
    setLastId(DEFAULT_THEME_ID);
    setLastReset(true);
    try {
      await resetTheme();
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'Could not reset your theme.');
    }
  }, [resetTheme]);

  const message = failed || error;
  const chip = (label: string, active: boolean, onPress: () => void, id: string) => (
    <Pressable key={id} testID={id} accessibilityRole="button" accessibilityLabel={`Filter: ${label}`}
      accessibilityState={{ selected: active }} onPress={onPress}
      style={[styles.chip, { backgroundColor: active ? colors.primary : colors.card, borderColor: active ? colors.primary : colors.border }]}>
      <Text style={[styles.chipText, { color: active ? colors.primaryForeground : colors.foreground }]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <FlatList
        data={data}
        numColumns={2}
        keyExtractor={t => t.id}
        columnWrapperStyle={{ gap: 12 }}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={8}
        windowSize={7}
        contentContainerStyle={{ paddingTop: (Platform.OS === 'web' ? 67 : insets.top) + 8, paddingBottom: (Platform.OS === 'web' ? 34 : insets.bottom) + (asTab ? 100 : 30), paddingHorizontal: 20, gap: 12 }}
        renderItem={({ item }) => (
          <ThemeCard item={item.id === theme.id ? theme : item} selected={item.id === theme.id} disabled={busy} expanded={disclosure.isExpanded(item.id)}
            onPress={choose} onToggle={disclosure.toggle} />
        )}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <View style={styles.top}>
              {!asTab ? <Pressable accessibilityRole="button" accessibilityLabel="Close appearance" testID="close-appearance"
                onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={styles.iconBtn}>
                <Ionicons name="close" size={24} color={colors.foreground} />
              </Pressable> : null}
              <Text style={[styles.title, { color: colors.foreground }]}>{asTab ? 'Themes' : 'Appearance'}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Reset to Routine Flow default theme" testID="reset-theme"
                disabled={busy} onPress={() => void reset()}
                style={[styles.reset, { borderColor: colors.border, opacity: busy ? 0.5 : 1 }]}>
                <Text style={[styles.chipText, { color: colors.primary }]}>Reset</Text>
              </Pressable>
            </View>
            <Text style={[styles.sub, { color: colors.mutedForeground }]} testID="theme-summary">
              {APP_THEMES.length} themes · Active: <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>{theme.name}</Text>
              {saving ? ' · Saving…' : ''}
            </Text>
            <ThemeCustomizationControls
              theme={theme}
              customization={customization}
              disabled={busy}
              onPreview={previewCustomization}
              onCommit={value => { void saveColors(value); }}
              colors={colors}
            />
            {loading ? <ActivityIndicator color={colors.primary} /> : null}
            {message ? (
              <View accessibilityRole="alert" testID="appearance-error" style={[styles.errBox, { borderColor: colors.destructive, backgroundColor: colors.card }]}>
                <Text style={[styles.errText, { color: colors.destructive }]}>{message}</Text>
                {lastId || lastCustomization || lastReset ? (
                  <Pressable accessibilityRole="button" accessibilityLabel={lastCustomization ? 'Retry saving custom colors' : lastReset ? 'Retry resetting theme' : 'Retry saving theme'}
                    testID="retry-theme" disabled={busy}
                    onPress={() => { if (lastCustomization) void saveColors(lastCustomization); else if (lastReset) void reset(); else if (lastId) void choose(lastId); }}>
                    <Text style={[styles.chipText, { color: colors.primary }]}>Retry</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            <TextInput
              testID="theme-search"
              accessibilityLabel="Search themes by name"
              placeholder="Search themes"
              placeholderTextColor={colors.mutedForeground}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {chip('All', group === 'All', () => setGroup('All'), 'filter-group-all')}
              {THEME_GROUPS.map(g => chip(g, group === g, () => setGroup(g), `filter-group-${g.toLowerCase()}`))}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {chip('Any mode', scheme === 'all', () => setScheme('all'), 'filter-scheme-all')}
              {chip('Light', scheme === 'light', () => setScheme('light'), 'filter-scheme-light')}
              {chip('Dark', scheme === 'dark', () => setScheme('dark'), 'filter-scheme-dark')}
            </View>
            <Text style={[styles.sub, { color: colors.mutedForeground }]} testID="theme-count" accessibilityLiveRegion="polite">
              Showing {data.length} of {APP_THEMES.length}
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="color-palette-outline" size={28} color={colors.mutedForeground} />
            <Text style={[styles.sub, { color: colors.mutedForeground }]}>No themes match. Try another name or filter.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -10 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 20 },
  reset: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  sub: { fontFamily: 'Inter_400Regular', fontSize: 13 },
  customizer: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 12 },
  customizerTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 16 },
  controlLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  sliderBlock: { gap: 3 },
  sliderLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  sliderTouch: { height: 38, justifyContent: 'center', paddingHorizontal: 12 },
  sliderTrack: { height: 5, borderRadius: 3 },
  sliderFill: { height: 5, borderRadius: 3 },
  sliderThumb: { position: 'absolute', top: -9, marginLeft: -12, width: 24, height: 24, borderWidth: 2, borderRadius: 12 },
  swatchSection: { gap: 6 },
  swatchChoices: { gap: 9 },
  swatchChoice: { minWidth: 48, alignItems: 'center', gap: 4, paddingVertical: 4 },
  colorDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 1 },
  selectedDot: { borderWidth: 3 },
  swatchName: { fontFamily: 'Inter_400Regular', fontSize: 10 },
  errBox: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8 },
  errText: { fontFamily: 'Inter_500Medium', fontSize: 13 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, fontFamily: 'Inter_500Medium', fontSize: 15 },
  chip: { minHeight: 38, paddingHorizontal: 14, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 40 },
  card: { flex: 1, borderRadius: 16, padding: 10, gap: 8, maxWidth: '50%' },
  mini: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, padding: 8 },
  miniIcon: { width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  line: { height: 5, borderRadius: 3 },
  track: { height: 5, borderRadius: 3, overflow: 'hidden' },
  fill: { width: '55%', height: 5, borderRadius: 3 },
  swatches: { flexDirection: 'row', gap: 4 },
  swatch: { flex: 1, height: 16, borderRadius: 5, borderWidth: StyleSheet.hairlineWidth },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  expandTheme: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  meta: { fontFamily: 'Inter_400Regular', fontSize: 11, textTransform: 'capitalize' },
  check: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
});
