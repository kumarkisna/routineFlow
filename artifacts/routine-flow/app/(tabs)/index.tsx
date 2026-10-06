import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File as ExpoFile } from 'expo-file-system';
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
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePeople } from '@/context/PeopleContext';
import { useRoutines } from '@/context/RoutineContext';
import { usePlaylists } from '@/context/PlaylistContext';
import { useSkills } from '@/context/SkillContext';
import { useColors } from '@/hooks/useColors';
import { categoryKey, listRoutineCategories, MAX_CATEGORY_LENGTH } from '@/lib/routineCategories';
import { remapRoutineSkillIds } from '@/lib/skills';
import { remapPlaylistReferences } from '@/lib/playlists';
import { readPersonExportSnapshot } from '@/lib/personCopy';
import { MAX_ROUTINE_FILE_BYTES, parseRoutinesFile, serializePersonBackup, type RoutineBackup } from '@/lib/routineTransfer';
import type { Routine } from '@/types/routines';

function formatDate() {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());
}

export default function HomeScreen() {
  const colors = useColors();
  const { activePerson } = usePeople();
  const insets = useSafeAreaInsets();
  const { routines, progress: dailyProgress, loading, getCompletedCount, setRoutineHidden, moveRoutine, importRoutines, resetToday, renameCategory, removeCategory } = useRoutines();
  const { mergeImportedPlaylists } = usePlaylists();
  const { mergeImportedSkills, setRatingWindow } = useSkills();
  const [showHidden, setShowHidden] = React.useState(false);
  const [categoryFilter, setCategoryFilter] = React.useState<string | null>(null);
  const [renameDraft, setRenameDraft] = React.useState<string | null>(null);
  const [pendingCategoryRemoval, setPendingCategoryRemoval] = React.useState<string | null>(null);
  const [renameError, setRenameError] = React.useState('');
  const [renameBusy, setRenameBusy] = React.useState(false);
  const renameLock = React.useRef(false);
  const [reordering, setReordering] = React.useState(false);
  const [orderBusy, setOrderBusy] = React.useState(false);
  const [orderError, setOrderError] = React.useState('');
  const orderLock = React.useRef(false);
  const [visibilityBusyId, setVisibilityBusyId] = React.useState<string | null>(null);
  const [visibilityError, setVisibilityError] = React.useState('');
  const visibilityLock = React.useRef(false);
  const [transferBusy, setTransferBusy] = React.useState<'export' | 'import' | null>(null);
  const [transferStatus, setTransferStatus] = React.useState<{ message: string; error: boolean } | null>(null);
  const transferLock = React.useRef(false);
  const [includeHistory, setIncludeHistory] = React.useState(false);
  const [pendingBackup, setPendingBackup] = React.useState<RoutineBackup | null>(null);
  const visibleRoutines = loading ? [] : routines.filter((routine) => !routine.hidden);
  const categories = listRoutineCategories(routines);
  const activeCategory = categoryFilter !== null && categoryFilter !== '' &&
    !categories.some((name) => categoryKey(name) === categoryFilter) ? null : categoryFilter;
  const selectedCategory = categories.find((name) => categoryKey(name) === activeCategory);
  const displayedRoutines = (showHidden ? routines : visibleRoutines).filter((routine) =>
    activeCategory === null || categoryKey(routine.category) === activeCategory);
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

  async function saveCategoryRename() {
    if (!selectedCategory || renameDraft === null || renameLock.current) return;
    if (transferLock.current || visibilityLock.current || orderLock.current || pendingBackup || loading) {
      setRenameError('Wait for the current routine change to finish.');
      return;
    }
    renameLock.current = true;
    setRenameBusy(true);
    setRenameError('');
    try {
      const label = renameDraft.trim().replace(/\s+/g, ' ');
      if (!label) throw new Error('Enter a category name.');
      if (label.length > MAX_CATEGORY_LENGTH) throw new Error(`Use ${MAX_CATEGORY_LENGTH} characters or fewer.`);
      const existing = categories.find((name) =>
        categoryKey(name) === categoryKey(label) && categoryKey(name) !== categoryKey(selectedCategory));
      await renameCategory(selectedCategory, existing ?? label);
      setCategoryFilter(categoryKey(existing ?? label));
      setRenameDraft(null);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      setRenameError(error instanceof Error ? error.message : 'Could not rename the category. Please try again.');
    } finally {
      renameLock.current = false;
      setRenameBusy(false);
    }
  }

  async function confirmCategoryRemoval() {
    if (!pendingCategoryRemoval || renameLock.current) return;
    if (transferLock.current || visibilityLock.current || orderLock.current || pendingBackup || loading) {
      setRenameError('Wait for the current routine change to finish.');
      return;
    }
    renameLock.current = true;
    setRenameBusy(true);
    setRenameError('');
    try {
      await removeCategory(pendingCategoryRemoval);
      setCategoryFilter(null);
      setPendingCategoryRemoval(null);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      setRenameError(error instanceof Error ? error.message : 'Could not remove the category. Please try again.');
    } finally {
      renameLock.current = false;
      setRenameBusy(false);
    }
  }

  async function changeVisibility(routine: Routine) {
    if (visibilityLock.current || transferLock.current || orderLock.current || renameLock.current) return;
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

  async function changeOrder(index: number, direction: -1 | 1) {
    if (orderLock.current || visibilityLock.current || transferLock.current || renameLock.current || pendingBackup) return;
    const routine = displayedRoutines[index];
    const adjacent = displayedRoutines[index + direction];
    if (!routine || !adjacent) return;
    orderLock.current = true;
    setOrderBusy(true);
    setOrderError('');
    try {
      await moveRoutine(routine.id, adjacent.id);
      void Haptics.selectionAsync();
    } catch {
      setOrderError('Could not save the new order. Please try again.');
    } finally {
      orderLock.current = false;
      setOrderBusy(false);
    }
  }

  async function buildPersonBackupFile(includeProgress = includeHistory) {
    const filename = `routine-flow-person-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const personData = await readPersonExportSnapshot(activePerson.id);
    const contents = serializePersonBackup(
      personData.routines,
      {
        playlists: personData.playlists,
        schedules: personData.schedules,
        selectedThemeId: personData.selectedThemeId,
        skills: personData.skills,
        skillRatingWindow: personData.skillRatingWindow,
      },
      includeProgress ? personData.progress : undefined,
    );
    if (new Blob([contents]).size > MAX_ROUTINE_FILE_BYTES) {
      throw new Error('This person backup exceeds 5 MB. Try omitting daily progress or reducing the saved data.');
    }
    return { filename, personData, contents };
  }

  async function exportPersonFile() {
    if (transferLock.current || visibilityLock.current || orderLock.current || renameLock.current || loading) return;
    transferLock.current = true;
    setTransferBusy('export');
    setTransferStatus(null);
    try {
      const { filename, personData, contents } = await buildPersonBackupFile();
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
        await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: 'Export person backup' });
      }
      setTransferStatus({
        message: `Person backup ready: ${personData.routines.length} routines, ${personData.playlists.length} playlists, ${personData.schedules.length} schedules, ${personData.skills.length} skills with rating history, the shared average window, and the selected theme${includeHistory ? ' with daily progress' : ''}.`,
        error: false,
      });
    } catch (error) {
      setTransferStatus({ message: error instanceof Error ? error.message : 'Could not export routines.', error: true });
    } finally {
      transferLock.current = false;
      setTransferBusy(null);
    }
  }

  async function savePersonFileLocally() {
    if (Platform.OS !== 'android' || transferLock.current || visibilityLock.current || orderLock.current || renameLock.current || loading) return;
    transferLock.current = true;
    setTransferBusy('export');
    setTransferStatus(null);
    try {
      const { filename, personData, contents } = await buildPersonBackupFile();
      let directory: Directory;
      try {
        directory = await Directory.pickDirectoryAsync();
      } catch (error) {
        if (error instanceof Error && error.message.toLowerCase().includes('file picker was cancelled')) return;
        throw error;
      }
      const backupFile = directory.createFile(filename, 'application/json');
      backupFile.write(contents);
      setTransferStatus({
        message: `Person backup saved to the selected folder: ${personData.routines.length} routines, ${personData.playlists.length} playlists, ${personData.schedules.length} schedules, ${personData.skills.length} skills with rating history, the shared average window, and the selected theme${includeHistory ? ' with daily progress' : ''}.`,
        error: false,
      });
    } catch (error) {
      setTransferStatus({ message: error instanceof Error ? error.message : 'Could not save the backup to this device.', error: true });
    } finally {
      transferLock.current = false;
      setTransferBusy(null);
    }
  }

  async function importRoutinesFile() {
    if (transferLock.current || visibilityLock.current || orderLock.current || renameLock.current || loading || pendingBackup) return;
    transferLock.current = true;
    setTransferBusy('import');
    setTransferStatus(null);
    try {
      let contents: string;
      if (Platform.OS === 'web') {
        const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
        if (picked.canceled) return;
        const file = picked.assets[0];
        if (!file) throw new Error('No file was selected.');
        if (file.size && file.size > MAX_ROUTINE_FILE_BYTES) {
          throw new Error('This file is too large to import (5 MB maximum).');
        }
        contents = file.file ? await file.file.text() : await (await fetch(file.uri)).text();
      } else {
        const picked = await ExpoFile.pickFileAsync({ mimeTypes: '*/*' });
        if (picked.canceled) return;
        const file = picked.result;
        if (file.size > MAX_ROUTINE_FILE_BYTES) {
          throw new Error('This file is too large to import (5 MB maximum).');
        }
        try {
          contents = await file.text();
        } catch {
          throw new Error('Could not access that file. Save the JSON backup on this device and try selecting it again.');
        }
      }
      const imported = parseRoutinesFile(contents);
      if (imported.progress !== undefined) {
        setPendingBackup(imported);
      } else {
        await applyImport(imported, false);
      }
    } catch (error) {
      setTransferStatus({ message: error instanceof Error ? error.message : 'Could not import routines.', error: true });
    } finally {
      transferLock.current = false;
      setTransferBusy(null);
    }
  }

  async function applyImport(backup: RoutineBackup, restoreHistory: boolean) {
    const skillIdMap = await mergeImportedSkills(backup.skills ?? []);
    const remappedBackup = { ...backup, routines: remapRoutineSkillIds(backup.routines, skillIdMap) };
    const result = await importRoutines(remappedBackup, restoreHistory);
    const playlistResult = backup.personData
      ? await mergeImportedPlaylists(remapPlaylistReferences(
        backup.personData.playlists, result.routineIdMap, skillIdMap,
      ))
      : undefined;
    if (backup.personData) await setRatingWindow(backup.personData.skillRatingWindow);
    const details = [
      `${result.added} ${result.added === 1 ? 'routine' : 'routines'} imported`,
      result.skipped ? `${result.skipped} already present` : null,
      result.renamed ? `${result.renamed} kept as a separate copy` : null,
      playlistResult ? `${playlistResult.added} ${playlistResult.added === 1 ? 'playlist' : 'playlists'} imported` : null,
      playlistResult?.updated ? `${playlistResult.updated} existing playlist skill assignments merged` : null,
      playlistResult?.skipped ? `${playlistResult.skipped} playlists already present` : null,
      playlistResult?.renamed ? `${playlistResult.renamed} conflicting playlists kept as separate copies` : null,
      backup.skills?.length ? 'Skills merged' : null,
      backup.personData ? 'Shared skill-average window restored' : null,
      restoreHistory ? `${result.progressAdded} completed steps added${result.progressKept ? ` (${result.progressKept} local entries kept)` : ''}` : null,
      backup.personData ? 'Schedules and selected theme are not restored by Import JSON.' : null,
    ].filter(Boolean).join(' · ');
    setTransferStatus({ message: details, error: false });
    if (result.added || result.progressAdded || playlistResult?.added || playlistResult?.updated) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }

  async function confirmImport(restoreHistory: boolean) {
    if (!pendingBackup || transferLock.current || orderLock.current || renameLock.current) return;
    transferLock.current = true;
    setTransferBusy('import');
    setTransferStatus(null);
    try {
      await applyImport(pendingBackup, restoreHistory);
      setPendingBackup(null);
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
        data={loading ? [] : displayedRoutines}
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
              <Pressable
                testID="people-open"
                accessibilityRole="button"
                accessibilityLabel={`Active person: ${activePerson.name}. Open people`}
                onPress={() => router.push('/people')}
                style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: 150, minHeight: 44, paddingLeft: 6, paddingRight: 12, borderRadius: 22, backgroundColor: colors.coralSoft }, pressed && styles.pressed]}
              >
                <View style={[styles.avatar, { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.card }]}>
                  <Text style={[styles.avatarText, { color: colors.primary }]}>{activePerson.name.trim().charAt(0).toUpperCase() || 'M'}</Text>
                </View>
                <Text numberOfLines={1} style={[styles.avatarText, { color: colors.primary, fontSize: 13, flexShrink: 1 }]}>{activePerson.name}</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.primary} />
              </Pressable>
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
              <View style={styles.sectionActions}>
                {routines.length > 1 && !loading && activeCategory === null ? (
                  <Pressable
                    accessibilityLabel={reordering ? 'Done reordering routines' : 'Reorder routines'}
                    testID="toggle-reorder-routines"
                    disabled={orderBusy || transferBusy !== null || visibilityBusyId !== null || renameBusy || pendingBackup !== null}
                    onPress={() => {
                      setReordering((current) => !current);
                      setOrderError('');
                    }}
                    style={({ pressed }) => [styles.reorderToggle, pressed && styles.pressed]}
                  >
                    <Ionicons name={reordering ? 'checkmark' : 'swap-vertical-outline'} size={17} color={colors.primary} />
                    <Text style={[styles.reorderToggleText, { color: colors.primary }]}>{reordering ? 'Done' : 'Reorder'}</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  accessibilityLabel="Create new routine"
                  disabled={orderBusy || renameBusy}
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
            </View>
            {categories.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categoryFilters}
                style={styles.categoryFilterScroll}
              >
                {[
                  { key: null, label: 'All' },
                  { key: '', label: 'No category' },
                  ...categories.map((name) => ({ key: categoryKey(name), label: name })),
                ].map((option) => {
                  const selected = activeCategory === option.key;
                  return (
                    <Pressable
                      key={option.key ?? 'all'}
                      accessibilityRole="button"
                      accessibilityLabel={`Filter routines: ${option.label}`}
                      accessibilityState={{ selected }}
                      testID={`category-filter-${option.key ?? 'all'}`}
                      disabled={renameBusy}
                      onPress={() => {
                        setReordering(false);
                        setCategoryFilter(option.key);
                        setRenameDraft(null);
                        setPendingCategoryRemoval(null);
                        setRenameError('');
                      }}
                      style={({ pressed }) => [
                        styles.categoryFilter,
                        { backgroundColor: selected ? colors.primary : colors.card, borderColor: selected ? colors.primary : colors.border },
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={[styles.categoryFilterText, { color: selected ? colors.primaryForeground : colors.foreground }]}>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}
            {selectedCategory ? (
              <View style={styles.renameSection}>
                {pendingCategoryRemoval !== null ? (
                  <View style={[styles.renamePanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.renameTitle, { color: colors.foreground }]}>Remove “{pendingCategoryRemoval}”?</Text>
                    <Text style={[styles.renameHint, { color: colors.mutedForeground }]}>
                      Clears this label from all {routines.filter((routine) => categoryKey(routine.category) === categoryKey(pendingCategoryRemoval)).length} matching routines, including hidden routines. Your routines, steps, and progress will stay unchanged.
                    </Text>
                    {renameError ? <Text accessibilityRole="alert" style={[styles.renameError, { color: colors.destructive }]}>{renameError}</Text> : null}
                    <View style={styles.renameActions}>
                      <Pressable
                        accessibilityLabel="Cancel category removal"
                        testID="cancel-category-removal"
                        disabled={renameBusy}
                        onPress={() => { setPendingCategoryRemoval(null); setRenameError(''); }}
                        style={({ pressed }) => [styles.renameAction, pressed && styles.pressed]}
                      >
                        <Text style={[styles.renameActionText, { color: colors.mutedForeground }]}>Cancel</Text>
                      </Pressable>
                      <Pressable
                        accessibilityLabel="Confirm category removal"
                        testID="confirm-category-removal"
                        disabled={renameBusy}
                        onPress={() => void confirmCategoryRemoval()}
                        style={({ pressed }) => [styles.renameAction, { backgroundColor: colors.destructive, borderRadius: 12 }, pressed && styles.pressed]}
                      >
                        <Text style={[styles.renameActionText, { color: colors.primaryForeground }]}>{renameBusy ? 'Removing…' : 'Remove label'}</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : renameDraft === null ? (
                  <View style={styles.categoryManagementActions}>
                  <Pressable
                    accessibilityLabel={`Rename category ${selectedCategory}`}
                    testID="rename-category"
                    disabled={loading || renameBusy || transferBusy !== null || orderBusy || visibilityBusyId !== null || pendingBackup !== null}
                    onPress={() => { setRenameDraft(selectedCategory); setRenameError(''); }}
                    style={({ pressed }) => [styles.renameTrigger, pressed && styles.pressed]}
                  >
                    <Ionicons name="pencil-outline" size={15} color={colors.primary} />
                    <Text style={[styles.renameTriggerText, { color: colors.primary }]}>Rename category</Text>
                  </Pressable>
                  <Pressable
                    accessibilityLabel={`Remove category ${selectedCategory}`}
                    testID="remove-category"
                    disabled={loading || renameBusy || transferBusy !== null || orderBusy || visibilityBusyId !== null || pendingBackup !== null}
                    onPress={() => { setPendingCategoryRemoval(selectedCategory); setRenameError(''); }}
                    style={({ pressed }) => [styles.renameTrigger, pressed && styles.pressed]}
                  >
                    <Ionicons name="close-circle-outline" size={15} color={colors.destructive} />
                    <Text style={[styles.renameTriggerText, { color: colors.destructive }]}>Remove category</Text>
                  </Pressable>
                  </View>
                ) : (
                  <View style={[styles.renamePanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.renameTitle, { color: colors.foreground }]}>Rename “{selectedCategory}”</Text>
                    <Text style={[styles.renameHint, { color: colors.mutedForeground }]}>
                      Updates every routine in this category, including hidden routines.
                    </Text>
                    <TextInput
                      accessibilityLabel="New category name"
                      testID="rename-category-input"
                      autoFocus
                      maxLength={MAX_CATEGORY_LENGTH}
                      value={renameDraft}
                      editable={!renameBusy}
                      onChangeText={(text) => { setRenameDraft(text); setRenameError(''); }}
                      onSubmitEditing={() => void saveCategoryRename()}
                      returnKeyType="done"
                      style={[styles.renameInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                    />
                    {renameError ? <Text accessibilityRole="alert" style={[styles.renameError, { color: colors.destructive }]}>{renameError}</Text> : null}
                    <View style={styles.renameActions}>
                      <Pressable
                        accessibilityLabel="Cancel category rename"
                        testID="cancel-category-rename"
                        disabled={renameBusy || transferBusy !== null || orderBusy || visibilityBusyId !== null || pendingBackup !== null}
                        onPress={() => { setRenameDraft(null); setRenameError(''); }}
                        style={({ pressed }) => [styles.renameAction, pressed && styles.pressed]}
                      >
                        <Text style={[styles.renameActionText, { color: colors.mutedForeground }]}>Cancel</Text>
                      </Pressable>
                      <Pressable
                        accessibilityLabel="Save category rename"
                        testID="save-category-rename"
                        disabled={renameBusy}
                        onPress={() => void saveCategoryRename()}
                        style={({ pressed }) => [styles.renameAction, { backgroundColor: colors.primary, borderRadius: 12 }, pressed && styles.pressed]}
                      >
                        <Text style={[styles.renameActionText, { color: colors.primaryForeground }]}>{renameBusy ? 'Saving…' : 'Save name'}</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              </View>
            ) : null}
            {hiddenCount > 0 ? (
              <Pressable
                accessibilityLabel={showHidden ? 'Hide hidden routines' : `Show hidden routines (${hiddenCount})`}
                testID="toggle-hidden-routines"
                 disabled={orderBusy || renameBusy}
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
            {orderError ? <Text style={[styles.visibilityError, { color: colors.destructive }]}>{orderError}</Text> : null}

            {loading ? (
              <View style={styles.loading}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item, index }) => {
          const completed = getCompletedCount(item);
          const visibleStepCount = item.steps.filter((step) => !step.hidden).length;
          const itemProgress = visibleStepCount ? completed / visibleStepCount : 0;
          return (
            <View style={[styles.routineCard, { backgroundColor: item.hidden ? colors.secondary : colors.card, borderColor: colors.border }]}>
              <Pressable
                accessibilityLabel={`Open ${item.title}`}
                 disabled={reordering || renameBusy}
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
                  {item.category ? (
                    <Text style={[styles.routineCategory, { color: colors.primary }]} numberOfLines={1}>{item.category}</Text>
                  ) : null}
                  <View style={styles.routineBottom}>
                    <Text style={[styles.routineMeta, { color: colors.inkSoft }]}>{visibleStepCount} steps</Text>
                    <View style={[styles.miniTrack, { backgroundColor: colors.secondary }]}>
                      <View style={[styles.miniFill, { backgroundColor: colors.primary, width: `${itemProgress * 100}%` }]} />
                    </View>
                    <Text style={[styles.routineMeta, { color: colors.mutedForeground }]}>{completed}/{visibleStepCount}</Text>
                  </View>
                </View>
              </Pressable>
              {reordering ? (
                <View style={[styles.orderActions, { borderLeftColor: colors.border }]}>
                  <Pressable
                    accessibilityLabel={`Move ${item.title} up`}
                    testID={`move-routine-up-${item.id}`}
                     disabled={index === 0 || orderBusy || renameBusy}
                    onPress={() => void changeOrder(index, -1)}
                    style={({ pressed }) => [styles.orderButton, pressed && styles.pressed]}
                  >
                    <Ionicons name="chevron-up" size={20} color={index === 0 ? colors.border : colors.primary} />
                  </Pressable>
                  <Pressable
                    accessibilityLabel={`Move ${item.title} down`}
                    testID={`move-routine-down-${item.id}`}
                     disabled={index === displayedRoutines.length - 1 || orderBusy || renameBusy}
                    onPress={() => void changeOrder(index, 1)}
                    style={({ pressed }) => [styles.orderButton, pressed && styles.pressed]}
                  >
                    <Ionicons name="chevron-down" size={20} color={index === displayedRoutines.length - 1 ? colors.border : colors.primary} />
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  accessibilityLabel={`${item.hidden ? 'Show' : 'Hide'} ${item.title}`}
                  testID={`toggle-routine-visibility-${item.id}`}
                   disabled={visibilityBusyId !== null || transferBusy !== null || renameBusy || pendingBackup !== null}
                  onPress={() => void changeVisibility(item)}
                  style={({ pressed }) => [styles.visibilityButton, { borderLeftColor: colors.border }, pressed && styles.pressed]}
                >
                  <Ionicons name={item.hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.primary} />
                </Pressable>
              )}
            </View>
          );
        }}
        ListEmptyComponent={loading ? null : (
          <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="leaf-outline" size={32} color={colors.sage} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              {activeCategory !== null ? 'No routines in this category' : hiddenCount > 0 ? 'All routines are hidden' : 'Your library is ready'}
            </Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              {activeCategory !== null
                ? 'Try another category, show hidden routines, or add this category while editing a routine.'
                : hiddenCount > 0 ? 'Show hidden routines above to bring one back.' : 'Create a routine to give your day a little shape.'}
            </Text>
          </View>
        )}
        ListFooterComponent={
          <View style={styles.footer}>
            <View style={[styles.transferCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.transferTitle, { color: colors.foreground }]}>Back up {activePerson.name}</Text>
              <Text style={[styles.transferDescription, { color: colors.mutedForeground }]}>
                Export this person’s routines, playlists, schedules, and selected theme as one JSON file. Daily progress is optional. {Platform.OS === 'android' ? 'On Android, save to a folder on your device or share the backup with another app. ' : ''}Import JSON only restores routines and optional progress; it does not restore playlists, schedules, or theme.
              </Text>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: includeHistory }}
                accessibilityLabel="Include daily progress in export"
                testID="include-daily-progress"
                disabled={transferBusy !== null || renameBusy || pendingBackup !== null}
                onPress={() => setIncludeHistory((current) => !current)}
                style={styles.historyOption}
              >
                <Ionicons name={includeHistory ? 'checkbox' : 'square-outline'} size={22} color={colors.primary} />
                <Text style={[styles.historyLabel, { color: colors.foreground }]}>Include daily progress in export</Text>
              </Pressable>
              <View style={styles.transferActions}>
                {Platform.OS === 'android' ? (
                  <Pressable
                    accessibilityLabel={`Save all data for ${activePerson.name} on this device`}
                    testID="save-person-data"
                    disabled={loading || transferBusy !== null || visibilityBusyId !== null || orderBusy || renameBusy || pendingBackup !== null}
                    onPress={() => void savePersonFileLocally()}
                    style={({ pressed }) => [styles.transferButton, { borderColor: colors.border }, pressed && styles.pressed]}
                  >
                    <Ionicons name="download-outline" size={18} color={colors.primary} />
                    <Text style={[styles.transferButtonText, { color: colors.primary }]}>
                      {transferBusy === 'export' ? 'Saving…' : 'Save to device'}
                    </Text>
                  </Pressable>
                ) : (
                  <Pressable
                    accessibilityLabel={`Export all data for ${activePerson.name}`}
                    testID="export-person-data"
                    disabled={loading || transferBusy !== null || visibilityBusyId !== null || orderBusy || renameBusy || pendingBackup !== null}
                    onPress={() => void exportPersonFile()}
                    style={({ pressed }) => [styles.transferButton, { borderColor: colors.border }, pressed && styles.pressed]}
                  >
                    <Ionicons name="download-outline" size={18} color={colors.primary} />
                    <Text style={[styles.transferButtonText, { color: colors.primary }]}>
                      {transferBusy === 'export' ? 'Exporting…' : 'Export person backup'}
                    </Text>
                  </Pressable>
                )}
                <Pressable
                  accessibilityLabel="Import routines"
                  testID="import-routines"
                  disabled={loading || transferBusy !== null || visibilityBusyId !== null || orderBusy || renameBusy || pendingBackup !== null}
                  onPress={() => void importRoutinesFile()}
                  style={({ pressed }) => [styles.transferButton, { borderColor: colors.border }, pressed && styles.pressed]}
                >
                  <Ionicons name="cloud-upload-outline" size={18} color={colors.primary} />
                  <Text style={[styles.transferButtonText, { color: colors.primary }]}>
                    {transferBusy === 'import' ? 'Importing…' : 'Import JSON'}
                  </Text>
                </Pressable>
              </View>
              {Platform.OS === 'android' ? (
                <View style={[styles.transferActions, { marginTop: 8 }]}>
                  <Pressable
                    accessibilityLabel={`Share all data for ${activePerson.name}`}
                    testID="export-person-data"
                    disabled={loading || transferBusy !== null || visibilityBusyId !== null || orderBusy || renameBusy || pendingBackup !== null}
                    onPress={() => void exportPersonFile()}
                    style={({ pressed }) => [styles.transferButton, { borderColor: colors.border }, pressed && styles.pressed]}
                  >
                    <Ionicons name="share-outline" size={18} color={colors.primary} />
                    <Text style={[styles.transferButtonText, { color: colors.primary }]}>
                      {transferBusy === 'export' ? 'Preparing…' : 'Share backup with another app'}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
              {pendingBackup ? (
                <View style={[styles.importChoice, { borderTopColor: colors.border }]}>
                  <Text style={[styles.historyLabel, { color: colors.foreground }]}>This backup includes daily progress.</Text>
                  <Text style={[styles.transferDescription, { color: colors.mutedForeground }]}>
                    Restore completed steps too? Existing progress stays unchanged; only missing completions are added.
                  </Text>
                  {pendingBackup.personData ? (
                    <Text style={[styles.transferDescription, { color: colors.mutedForeground }]}>
                      This file also has playlists, schedules, and a selected theme; this import will not restore those sections.
                    </Text>
                  ) : null}
                  <View style={styles.transferActions}>
                    <Pressable
                      testID="import-with-progress"
                      accessibilityLabel="Import routines and daily progress"
                      disabled={transferBusy !== null}
                      onPress={() => void confirmImport(true)}
                      style={[styles.transferButton, { borderColor: colors.primary }]}
                    >
                      <Text style={[styles.transferButtonText, { color: colors.primary }]}>Include progress</Text>
                    </Pressable>
                    <Pressable
                      testID="import-without-progress"
                      accessibilityLabel="Import routines only"
                      disabled={transferBusy !== null}
                      onPress={() => void confirmImport(false)}
                      style={[styles.transferButton, { borderColor: colors.border }]}
                    >
                      <Text style={[styles.transferButtonText, { color: colors.foreground }]}>Routines only</Text>
                    </Pressable>
                  </View>
                  <Pressable
                    testID="cancel-import"
                    accessibilityLabel="Cancel import"
                    disabled={transferBusy !== null}
                    onPress={() => { setPendingBackup(null); setTransferStatus(null); }}
                    style={styles.cancelImport}
                  >
                    <Text style={[styles.transferButtonText, { color: colors.mutedForeground }]}>Cancel import</Text>
                  </Pressable>
                </View>
              ) : null}
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
  categoryFilterScroll: { marginHorizontal: -20, marginBottom: 14 },
  categoryFilters: { paddingHorizontal: 20, gap: 8, alignItems: 'center' },
  categoryFilter: { minHeight: 36, borderRadius: 18, borderWidth: 1, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' },
  categoryFilterText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  renameSection: { marginBottom: 12 },
  categoryManagementActions: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 18 },
  renameTrigger: { alignSelf: 'flex-start', minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 6 },
  renameTriggerText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  renamePanel: { borderWidth: 1, borderRadius: 16, padding: 15 },
  renameTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  renameHint: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginTop: 5 },
  renameInput: { marginTop: 12, borderWidth: 1, borderRadius: 12, minHeight: 44, paddingHorizontal: 12, fontFamily: 'Inter_500Medium', fontSize: 14 },
  renameError: { fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 8 },
  renameActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 },
  renameAction: { minHeight: 42, minWidth: 80, paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center' },
  renameActionText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  sectionActions: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  reorderToggle: { minHeight: 43, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 5 },
  reorderToggleText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  showHiddenButton: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, marginBottom: 8 },
  showHiddenText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  visibilityError: { fontFamily: 'Inter_500Medium', fontSize: 12, marginBottom: 12 },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 21 },
  sectionSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 5 },
  addButton: { width: 43, height: 43, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  routineCard: { minHeight: 98, borderRadius: 19, borderWidth: 1, flexDirection: 'row', alignItems: 'center', overflow: 'hidden', marginBottom: 10 },
  routineCardContent: { flex: 1, minWidth: 0, minHeight: 98, paddingLeft: 13, paddingVertical: 13, paddingRight: 8, flexDirection: 'row', alignItems: 'center' },
  visibilityButton: { width: 44, alignSelf: 'stretch', borderLeftWidth: 1, alignItems: 'center', justifyContent: 'center' },
  orderActions: { width: 44, alignSelf: 'stretch', borderLeftWidth: 1 },
  orderButton: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  routineIcon: { width: 54, height: 54, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginRight: 13 },
  routineCopy: { flex: 1, minWidth: 0 },
  routineTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  routineTitle: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  hiddenLabel: { fontFamily: 'Inter_500Medium', fontSize: 11, marginLeft: 5 },
  routineSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 4 },
  routineCategory: { fontFamily: 'Inter_600SemiBold', fontSize: 11, marginTop: 5 },
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
  historyOption: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 14, minHeight: 36 },
  historyLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12, flexShrink: 1 },
  importChoice: { borderTopWidth: 1, marginTop: 16, paddingTop: 15 },
  cancelImport: { alignSelf: 'center', padding: 12, marginTop: 4 },
  transferActions: { flexDirection: 'row', gap: 9, marginTop: 15 },
  transferButton: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 6 },
  transferButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  transferStatus: { fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 18, marginTop: 12 },
  resetButton: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8 },
  resetText: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  pressed: { opacity: 0.72 },
});