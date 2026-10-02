import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppearance } from '@/context/AppearanceContext';
import { useColors } from '@/hooks/useColors';
import { APP_THEMES, DEFAULT_THEME_ID, THEME_GROUPS, type AppTheme } from '@/lib/appThemes';

type Scheme = 'all' | 'light' | 'dark';

const ThemeCard = React.memo(function ThemeCard({ item, selected, disabled, onPress }: {
  item: AppTheme; selected: boolean; disabled: boolean; onPress: (id: string) => void;
}) {
  const c = item.colors;
  const ui = useColors();
  return (
    <Pressable
      testID={item.id}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${item.group}, ${item.scheme} theme`}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={() => onPress(item.id)}
      style={({ pressed }) => [styles.card, { backgroundColor: c.background, borderColor: selected ? ui.primary : c.border, borderWidth: selected ? 2.5 : 1, opacity: disabled && !selected ? 0.6 : 1 }, pressed && { opacity: 0.8 }]}
    >
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
      <View style={styles.nameRow}>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={[styles.name, { color: c.foreground }]}>{item.name}</Text>
          <Text style={[styles.meta, { color: c.mutedForeground }]}>{item.group} · {item.scheme}</Text>
        </View>
        {selected ? (
          <View style={[styles.check, { backgroundColor: c.primary }]}>
            <Ionicons name="checkmark" size={14} color={c.primaryForeground} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
});

export default function AppearanceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { theme, loading, saving, error, selectTheme } = useAppearance();
  const [query, setQuery] = React.useState('');
  const [group, setGroup] = React.useState<string>('All');
  const [scheme, setScheme] = React.useState<Scheme>('all');
  const [failed, setFailed] = React.useState('');
  const [lastId, setLastId] = React.useState<string | null>(null);
  const busy = loading || saving;

  const data = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return APP_THEMES.filter(t => (group === 'All' || t.group === group) &&
      (scheme === 'all' || t.scheme === scheme) && (!q || t.name.toLowerCase().includes(q)));
  }, [query, group, scheme]);

  const choose = React.useCallback(async (id: string) => {
    setFailed('');
    setLastId(id);
    try {
      await selectTheme(id);
      void Haptics.selectionAsync();
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'Could not save your theme.');
    }
  }, [selectTheme]);

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
        contentContainerStyle={{ paddingTop: (Platform.OS === 'web' ? 67 : insets.top) + 8, paddingBottom: (Platform.OS === 'web' ? 34 : insets.bottom) + 30, paddingHorizontal: 20, gap: 12 }}
        renderItem={({ item }) => (
          <ThemeCard item={item} selected={item.id === theme.id} disabled={busy} onPress={choose} />
        )}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <View style={styles.top}>
              <Pressable accessibilityRole="button" accessibilityLabel="Close appearance" testID="close-appearance"
                onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={styles.iconBtn}>
                <Ionicons name="close" size={24} color={colors.foreground} />
              </Pressable>
              <Text style={[styles.title, { color: colors.foreground }]}>Appearance</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Reset to Routine Flow default theme" testID="reset-theme"
                disabled={busy} onPress={() => void choose(DEFAULT_THEME_ID)}
                style={[styles.reset, { borderColor: colors.border, opacity: busy ? 0.5 : 1 }]}>
                <Text style={[styles.chipText, { color: colors.primary }]}>Reset</Text>
              </Pressable>
            </View>
            <Text style={[styles.sub, { color: colors.mutedForeground }]} testID="theme-summary">
              {APP_THEMES.length} themes · Active: <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>{theme.name}</Text>
              {saving ? ' · Saving…' : ''}
            </Text>
            {loading ? <ActivityIndicator color={colors.primary} /> : null}
            {message ? (
              <View accessibilityRole="alert" testID="appearance-error" style={[styles.errBox, { borderColor: colors.destructive, backgroundColor: colors.card }]}>
                <Text style={[styles.errText, { color: colors.destructive }]}>{message}</Text>
                {lastId ? (
                  <Pressable accessibilityRole="button" accessibilityLabel="Retry saving theme" testID="retry-theme" disabled={busy}
                    onPress={() => void choose(lastId)}>
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
              style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
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
  name: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  meta: { fontFamily: 'Inter_400Regular', fontSize: 11, textTransform: 'capitalize' },
  check: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
});
