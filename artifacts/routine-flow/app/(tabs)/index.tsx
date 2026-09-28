import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoutines } from '@/context/RoutineContext';
import { useColors } from '@/hooks/useColors';
import { MAX_ROUTINE_FILE_BYTES, parseRoutinesFile, serializeRoutines } from '@/lib/routineTransfer';
import type { Routine } from '@/types/routines';

function formatDate() {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { routines, loading, getCompletedCount, setRoutineHidden, importRoutines, resetToday } = useRoutines();
  const [showHidden, setShowHidden] = React.useState(false);
  const [visibilityBusyId, setVisibilityBusyId] = React.useState<string | null>(null);
  const [visibilityError, setVisibilityError] = React.useState('');
  const visibilityLock = React.useRef(false);
  const [transferBusy, setTransferBusy] = React.useState<'export' | 'import' | null>(null);
  const [transferStatus, setTransferStatus] = React.useState<{ message: string; error: boolean } | null>(null);
  const transferLock = React.useRef(false);
  const visibleRoutines = loading ? [] : routines.filter((routine) => !routine.hidden);
  const hiddenCount = loading ? 0 : routines.length - visibleRoutines.length;
  const totalSteps = visibleRoutines.reduce((sum, routine) => sum + routine.steps.filter((step) => !step.hidden).length, 0);
  const completedSteps = visibleRoutines.reduce((sum, routine) => sum + getCompletedCount(routine), 0);
  const progress = totalSteps ? completedSteps / totalSteps : 0;
  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening';
  const todayLabel = formatDate();

  function openRoutine(routine: Routine) {
    void Haptics.selectionAsync();
    router.push({ pathname: '/routine/[id]', params: { id: routine.id } });
  }

  async function changeVisibility(routine: Routine) {
    if (visibilityLock.current || transferLock.current) return;
    visibilityLock.current = true;
    setVisibilityBusyId(routine.id);
    setVisibilityError('');
    try {
      await setRoutineHidden(routine.id, !routine.hidden);
      void Haptics.selectionAsync();
    } catch {
      setVisibilityError('Could not update routine visibility. Please try again.');
    } finally {
      visibilityLock.current = false;
      setVisibilityBusyId(null);
    }
  }

  async function exportRoutinesFile() {
    if (transferLock.current || visibilityLock.current || loading) return;
    transferLock.current = true;
    setTransferBusy('export');
    setTransferStatus(null);
    try {
      const filename = `routine-flow-routines-${new Date().toISOString().slice(0, 10)}.json`;
      const contents = serializeRoutines(routines);
      if (Platform.OS === 'web') {
        const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
      } else {
        if (!await Sharing.isAvailableAsync() || !FileSystem.cacheDirectory) {
          throw new Error('File sharing is unavailable on this device.');
        }
        const uri = `${FileSystem.cacheDirectory}${filename}`;
        await FileSystem.writeAsStringAsync(uri, contents, { encoding: FileSystem.EncodingType.UTF8 });
        await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: 'Export routines' });
      }
      setTransferStatus({ message: `${routines.length} routines ready to save or share.`, error: false });
    } catch (error) {
      setTransferStatus({ message: error instanceof Error ? error.message : 'Could not export routines.', error: true });
    } finally {
      transferLock.current = false;
      setTransferBusy(null);
    }
  }

  async function importRoutinesFile() {
    if (transferLock.current || visibilityLock.current || loading) return;
    transferLock.current = true;
    setTransferBusy('import');
    setTransferStatus(null);
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (picked.canceled) return;
      const file = picked.assets[0];
      if (!file) throw new Error('No file was selected.');
      if (file.size && file.size > MAX_ROUTINE_FILE_BYTES) {
        throw new Error('This file is too large to import (5 MB maximum).');
      }
      const contents = Platform.OS === 'web'
        ? file.file ? await file.file.text() : await (await fetch(file.uri)).text()
        : await FileSystem.readAsStringAsync(file.uri);
      const imported = parseRoutinesFile(contents);
      const result = await importRoutines(imported);
      const details = [
        `${result.added} ${result.added === 1 ? 'routine' : 'routines'} imported`,
        result.skipped ? `${result.skipped} already present` : null,
        result.renamed ? `${result.renamed} kept as a separate copy` : null,
      ].filter(Boolean).join(' · ');
      setTransferStatus({ message: details, error: false });
      if (result.added) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      setTransferStatus({ message: error instanceof Error ? error.message : 'Could not import routines.', error: true });
    } finally {
      transferLock.current = false;
      setTransferBusy(null);
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <FlatList
        data={loading ? [] : showHidden ? routines : visibleRoutines}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: Platform.OS === 'web' ? 67 : insets.top + 12,
          paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 30,
          paddingHorizontal: 20,
        }}
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <View>
                <Text style={[styles.date, { color: colors.mutedForeground }]}>{todayLabel}</Text>
                <Text style={[styles.greeting, { color: colors.foreground }]}>{greeting}, friend</Text>
              </View>
              <View style={[styles.avatar, { backgroundColor: colors.coralSoft }]}>
                <Text style={[styles.avatarText, { color: colors.primary }]}>RF</Text>
              </View>
            </View>

            <View style={[styles.todayCard, { backgroundColor: colors.hero }]}>
              <View style={styles.todayCopy}>
                <View style={[styles.overlinePill, { backgroundColor: colors.accent }]}>
                  <Ionicons name="sparkles" size={12} color={colors.accentForeground} />
                  <Text style={[styles.overlineText, { color: colors.accentForeground }]}>TODAY’S FLOW</Text>
                </View>
                <Text style={[styles.todayTitle, { color: colors.heroForeground }]}>
                  Small steps,{"\n"}steady days.
                </Text>
                <Text style={[styles.todaySubtitle, { color: colors.heroForeground }]}>
                  {completedSteps === 0 ? 'Choose a routine and get started.' : `${completedSteps} steps complete today.`}
                </Text>
              </View>
              <View style={[styles.progressCircle, { borderColor: colors.sage }]}>
                <Text style={[styles.progressValue, { color: colors.heroForeground }]}>{Math.round(progress * 100)}%</Text>
                <Text style={[styles.progressLabel, { color: colors.heroForeground }]}>done</Text>
              </View>
            </View>

            <View style={styles.sectionHeader}>
              <View>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Your routines</Text>
                <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground }]}>Keep the good things close</Text>
              </View>
              <Pressable
                accessibilityLabel="Create new routine"
                onPress={() => router.push('/new-routine')}
                style={({ pressed }) => [
                  styles.addButton,
                  { backgroundColor: colors.primary },
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons name="add" size={21} color={colors.primaryForeground} />
              </Pressable>
            </View>
            {hiddenCount > 0 ? (
              <Pressable
                accessibilityLabel={showHidden ? 'Hide hidden routines' : `Show hidden routines (${hiddenCount})`}
                testID="toggle-hidden-routines"
                onPress={() => setShowHidden((current) => !current)}
                style={({ pressed }) => [styles.showHiddenButton, pressed && styles.pressed]}
              >
                <Ionicons name={showHidden ? 'eye-off-outline' : 'eye-outline'} size={16} color={colors.primary} />
                <Text style={[styles.showHiddenText, { color: colors.primary }]}>
                  {showHidden ? 'Hide hidden routines' : `Show hidden routines (${hiddenCount})`}
                </Text>
              </Pressable>
            ) : null}
            {visibilityError ? <Text style={[styles.visibilityError, { color: colors.destructive }]}>{visibilityError}</Text> : null}

            {loading ? (
              <View style={styles.loading}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
          const completed = getCompletedCount(item);
          const visibleStepCount = item.steps.filter((step) => !step.hidden).length;
          const itemProgress = visibleStepCount ? completed / visibleStepCount : 0;
          return (
            <View style={[styles.routineCard, { backgroundColor: item.hidden ? colors.secondary : colors.card, borderColor: colors.border }]}>
              <Pressable
                accessibilityLabel={`Open ${item.title}`}
                onPress={() => openRoutine(item)}
                style={({ pressed }) => [styles.routineCardContent, pressed && styles.pressed]}
              >
                <View style={[styles.routineIcon, { backgroundColor: item.tone === 'coral' ? colors.coralSoft : item.tone === 'sage' ? colors.sageSoft : item.tone === 'lavender' ? colors.lavenderSoft : colors.secondary }]}>
                  <Ionicons
                    name={item.icon as keyof typeof Ionicons.glyphMap}
                    size={22}
                    color={item.tone === 'coral' ? colors.primary : item.tone === 'sage' ? colors.success : colors.inkSoft}
                  />
                </View>
                <View style={styles.routineCopy}>
                  <View style={styles.routineTitleRow}>
                    <Text style={[styles.routineTitle, { color: colors.foreground }]} numberOfLines={1}>{item.title}</Text>
                    {item.hidden ? <Text style={[styles.hiddenLabel, { color: colors.mutedForeground }]}>Hidden</Text> : null}
                  </View>
                  <Text style={[styles.routineSubtitle, { color: colors.mutedForeground }]} numberOfLines={1}>{item.subtitle}</Text>
                  <View style={styles.routineBottom}>
                    <Text style={[styles.routineMeta, { color: colors.inkSoft }]}>{visibleStepCount} steps</Text>
                    <View style={[styles.miniTrack, { backgroundColor: colors.secondary }]}>
                      <View style={[styles.miniFill, { backgroundColor: colors.primary, width: `${itemProgress * 100}%` }]} />
                    </View>
                    <Text style={[styles.routineMeta, { color: colors.mutedForeground }]}>{completed}/{visibleStepCount}</Text>
                  </View>
                </View>
              </Pressable>
              <Pressable
                accessibilityLabel={`${item.hidden ? 'Show' : 'Hide'} ${item.title}`}
                testID={`toggle-routine-visibility-${item.id}`}
                disabled={visibilityBusyId !== null || transferBusy !== null}
                onPress={() => void changeVisibility(item)}
                style={({ pressed }) => [styles.visibilityButton, { borderLeftColor: colors.border }, pressed && styles.pressed]}
              >
                <Ionicons name={item.hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.primary} />
              </Pressable>
            </View>
          );
        }}
        ListEmptyComponent={loading ? null : (
          <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="leaf-outline" size={32} color={colors.sage} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              {hiddenCount > 0 ? 'All routines are hidden' : 'Your library is ready'}
            </Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              {hiddenCount > 0 ? 'Show hidden routines above to bring one back.' : 'Create a routine to give your day a little shape.'}
            </Text>
          </View>
        )}
        ListFooterComponent={
          <View style={styles.footer}>
            <View style={[styles.transferCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.transferTitle, { color: colors.foreground }]}>Move your routines</Text>
              <Text style={[styles.transferDescription, { color: colors.mutedForeground }]}>
                Export or import routines and steps as JSON. Daily progress is not included.
              </Text>
              <View style={styles.transferActions}>
                <Pressable
                  accessibilityLabel="Export routines"
                  testID="export-routines"
                  disabled={loading || transferBusy !== null || visibilityBusyId !== null}
                  onPress={() => void exportRoutinesFile()}
                  style={({ pressed }) => [styles.transferButton, { borderColor: colors.border }, pressed && styles.pressed]}
                >
                  <Ionicons name="download-outline" size={18} color={colors.primary} />
                  <Text style={[styles.transferButtonText, { color: colors.primary }]}>
                    {transferBusy === 'export' ? 'Exporting…' : 'Export JSON'}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityLabel="Import routines"
                  testID="import-routines"
                  disabled={loading || transferBusy !== null || visibilityBusyId !== null}
                  onPress={() => void importRoutinesFile()}
                  style={({ pressed }) => [styles.transferButton, { borderColor: colors.border }, pressed && styles.pressed]}
                >
                  <Ionicons name="cloud-upload-outline" size={18} color={colors.primary} />
                  <Text style={[styles.transferButtonText, { color: colors.primary }]}>
                    {transferBusy === 'import' ? 'Importing…' : 'Import JSON'}
                  </Text>
                </Pressable>
              </View>
              {transferStatus ? (
                <Text accessibilityRole="alert" style={[styles.transferStatus, { color: transferStatus.error ? colors.destructive : colors.success }]}>
                  {transferStatus.message}
                </Text>
              ) : null}
            </View>
            <Pressable
              accessibilityLabel="Reset today's progress"
              onPress={() => {
                void resetToday();
                void Haptics.selectionAsync();
              }}
              style={({ pressed }) => [styles.resetButton, pressed && styles.pressed]}
            >
              <Ionicons name="refresh-outline" size={15} color={colors.mutedForeground} />
              <Text style={[styles.resetText, { color: colors.mutedForeground }]}>Reset today</Text>
            </Pressable>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 },
  date: { fontFamily: 'Inter_500Medium', fontSize: 12, letterSpacing: 0.3, marginBottom: 7 },
  greeting: { fontFamily: 'Inter_700Bold', fontSize: 27, letterSpacing: -0.7 },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 0.5 },
  todayCard: { minHeight: 204, borderRadius: 25, padding: 21, flexDirection: 'row', justifyContent: 'space-between', overflow: 'hidden', marginBottom: 31 },
  todayCopy: { flex: 1, paddingRight: 10 },
  overlinePill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 6, marginBottom: 20 },
  overlineText: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.8 },
  todayTitle: { fontFamily: 'Inter_700Bold', fontSize: 27, lineHeight: 32, letterSpacing: -0.5 },
  todaySubtitle: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, opacity: 0.68, marginTop: 13, maxWidth: 170 },
  progressCircle: { width: 86, height: 86, borderRadius: 43, borderWidth: 7, alignItems: 'center', justifyContent: 'center', marginTop: 34 },
  progressValue: { fontFamily: 'Inter_700Bold', fontSize: 21 },
  progressLabel: { fontFamily: 'Inter_500Medium', fontSize: 10, opacity: 0.65, marginTop: 1 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  showHiddenButton: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, marginBottom: 8 },
  showHiddenText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  visibilityError: { fontFamily: 'Inter_500Medium', fontSize: 12, marginBottom: 12 },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 21 },
  sectionSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 5 },
  addButton: { width: 43, height: 43, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  routineCard: { minHeight: 98, borderRadius: 19, borderWidth: 1, flexDirection: 'row', alignItems: 'center', overflow: 'hidden', marginBottom: 10 },
  routineCardContent: { flex: 1, minWidth: 0, minHeight: 98, paddingLeft: 13, paddingVertical: 13, paddingRight: 8, flexDirection: 'row', alignItems: 'center' },
  visibilityButton: { width: 44, alignSelf: 'stretch', borderLeftWidth: 1, alignItems: 'center', justifyContent: 'center' },
  routineIcon: { width: 54, height: 54, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginRight: 13 },
  routineCopy: { flex: 1, minWidth: 0 },
  routineTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  routineTitle: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  hiddenLabel: { fontFamily: 'Inter_500Medium', fontSize: 11, marginLeft: 5 },
  routineSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 4 },
  routineBottom: { flexDirection: 'row', alignItems: 'center', marginTop: 13 },
  routineMeta: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  miniTrack: { height: 5, borderRadius: 3, flex: 1, marginHorizontal: 9, overflow: 'hidden' },
  miniFill: { height: '100%', borderRadius: 3 },
  empty: { borderWidth: 1, borderRadius: 19, padding: 25, alignItems: 'center', marginBottom: 10 },
  emptyTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 16, marginTop: 11 },
  emptyText: { fontFamily: 'Inter_400Regular', fontSize: 13, textAlign: 'center', lineHeight: 19, marginTop: 6 },
  loading: { paddingVertical: 12 },
  footer: { alignItems: 'center', paddingTop: 17 },
  transferCard: { width: '100%', borderWidth: 1, borderRadius: 19, padding: 17 },
  transferTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  transferDescription: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginTop: 5 },
  transferActions: { flexDirection: 'row', gap: 9, marginTop: 15 },
  transferButton: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 6 },
  transferButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  transferStatus: { fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 18, marginTop: 12 },
  resetButton: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8 },
  resetText: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  pressed: { opacity: 0.72 },
});