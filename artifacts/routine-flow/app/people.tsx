import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { SpeechVoicePreference } from '@/components/SpeechVoicePreference';
import { usePeople } from '@/context/PeopleContext';
import { useColors } from '@/hooks/useColors';
import { usePersistentDisclosure } from '@/hooks/usePersistentDisclosure';
import { useAppearance } from '@/context/AppearanceContext';
import { APP_THEMES, DEFAULT_THEME_ID, THEME_GROUPS, type ThemeGroup } from '@/lib/appThemes';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { createPersonStorage, PERSON_DATA_KEYS } from '@/lib/personStorage';
import { DEFAULT_PERSON_ID } from '@/lib/personStorage';
import { DEFAULT_PLAYLIST_REMINDER_SETTINGS } from '@/lib/playlists';
import type { RoutineNotificationSettings } from '@/types/routines';
import type { Person, PersonSnapshot } from '@/types/people';

const msg = (e: unknown, fb: string) => (e instanceof Error && e.message ? e.message : fb);

export default function PeopleScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { people, activePerson, busy, notice, addPerson, updatePerson, removePerson, switchPerson, loadPerson, copyFromPerson, loadPersonTheme, savePersonTheme } = usePeople();
  const { theme, loading: appearanceLoading, selectTheme, backgroundImage, setBackgroundImage } = useAppearance();
  const themeDisclosure = usePersistentDisclosure('person-theme-settings', activePerson.id, false);
  const backgroundDisclosure = usePersistentDisclosure('person-background-settings', activePerson.id, false);
  const [name, setName] = React.useState('');
  const [newPersonPlaylistRatingDefault, setNewPersonPlaylistRatingDefault] = React.useState(true);
  const [newPersonSpeakRoutineDescription, setNewPersonSpeakRoutineDescription] = React.useState(true);
  const [newPersonSpeechVoiceId, setNewPersonSpeechVoiceId] = React.useState<string | null>(null);
  const [newPersonReminderSettings, setNewPersonReminderSettings] = React.useState<RoutineNotificationSettings>(
    { ...DEFAULT_PLAYLIST_REMINDER_SETTINGS },
  );
  const [editingPersonId, setEditingPersonId] = React.useState<string | null>(null);
  const [removingPersonId, setRemovingPersonId] = React.useState<string | null>(null);
  const [editingName, setEditingName] = React.useState('');
  const [editingPlaylistRatingDefault, setEditingPlaylistRatingDefault] = React.useState(true);
  const [editingSpeakRoutineDescription, setEditingSpeakRoutineDescription] = React.useState(true);
  const [personThemeIds, setPersonThemeIds] = React.useState<Record<string, string>>({});
  const [themeLoadingId, setThemeLoadingId] = React.useState<string | null>(null);
  const [themeSavingId, setThemeSavingId] = React.useState<string | null>(null);
  const [themeSearch, setThemeSearch] = React.useState('');
  const [themeGroup, setThemeGroup] = React.useState<ThemeGroup | 'All'>('All');
  const [themeScheme, setThemeScheme] = React.useState<'all' | 'light' | 'dark'>('all');
  const [themeError, setThemeError] = React.useState('');
  const [personBackgrounds, setPersonBackgrounds] = React.useState<Record<string, string | null>>({});
  const [backgroundLoadingId, setBackgroundLoadingId] = React.useState<string | null>(null);
  const [backgroundSavingId, setBackgroundSavingId] = React.useState<string | null>(null);
  const [backgroundError, setBackgroundError] = React.useState('');
  const [backgroundNotice, setBackgroundNotice] = React.useState('');
  const [editingSpeechVoiceId, setEditingSpeechVoiceId] = React.useState<string | null>(null);
  const [editingReminderSettings, setEditingReminderSettings] = React.useState<RoutineNotificationSettings>(
    { ...DEFAULT_PLAYLIST_REMINDER_SETTINGS },
  );
  const [error, setError] = React.useState('');
  const [working, setWorking] = React.useState(false);
  const [sourceId, setSourceId] = React.useState<string | null>(null);
  const [snapshot, setSnapshot] = React.useState<PersonSnapshot | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState('');
  const [copyError, setCopyError] = React.useState('');
  const [sel, setSel] = React.useState({ r: [] as string[], p: [] as string[], s: [] as string[] });
  const token = React.useRef(0);
  const lock = React.useRef(false);
  const disabled = busy || working;
  const others = people.filter((p) => p.id !== activePerson.id);
  const ordered = [...people].sort((a, b) => (a.id === 'me' || a.name === 'Me' ? -1 : b.id === 'me' || b.name === 'Me' ? 1 : 0));
  const sources = ordered.filter((p) => p.id !== activePerson.id);
  const filteredThemes = APP_THEMES.filter(item =>
    (themeGroup === 'All' || item.group === themeGroup)
    && (themeScheme === 'all' || item.scheme === themeScheme)
    && item.name.toLocaleLowerCase().includes(themeSearch.trim().toLocaleLowerCase()));

  async function togglePersonThemes(personId: string) {
    const opening = !themeDisclosure.isExpanded(personId);
    themeDisclosure.toggle(personId);
    setThemeError('');
    if (opening && !personThemeIds[personId]) {
      setThemeLoadingId(personId);
      try {
        const id = await loadPersonTheme(personId);
        setPersonThemeIds(current => ({ ...current, [personId]: id }));
      } catch (e) {
        setThemeError(msg(e, 'Could not load this person’s theme.'));
      } finally {
        setThemeLoadingId(null);
      }
    }
  }

  async function choosePersonTheme(personId: string, themeId: string) {
    setThemeSavingId(personId);
    setThemeError('');
    try {
      if (personId === activePerson.id) await selectTheme(themeId);
      else await savePersonTheme(personId, themeId);
      setPersonThemeIds(current => ({ ...current, [personId]: themeId }));
      void Haptics.selectionAsync();
    } catch (e) {
      setThemeError(msg(e, 'Could not save this theme.'));
    } finally {
      setThemeSavingId(null);
    }
  }

  async function togglePersonBackground(personId: string) {
    const opening = !backgroundDisclosure.isExpanded(personId);
    backgroundDisclosure.toggle(personId);
    setBackgroundError('');
    if (opening && !(personId in personBackgrounds)) {
      setBackgroundLoadingId(personId);
      try {
        const uri = await createPersonStorage(personId).getItem(PERSON_DATA_KEYS.backgroundImage);
        setPersonBackgrounds(current => ({ ...current, [personId]: uri }));
      } catch (e) {
        setBackgroundError(msg(e, 'Could not load this person’s background photo.'));
      } finally {
        setBackgroundLoadingId(null);
      }
    }
  }

  async function saveBackgroundAsset(personId: string, asset: ImagePicker.ImagePickerAsset) {
    const fit = Math.min(1200 / asset.width, 800 / asset.height, 1);
    const compressed = await ImageManipulator.manipulateAsync(
      asset.uri, [{ resize: { width: Math.round(asset.width * fit), height: Math.round(asset.height * fit) } }],
      { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    );
    if (!compressed.base64) throw new Error('The selected picture could not be prepared for saving.');
    const uri = `data:image/jpeg;base64,${compressed.base64}`;
    await createPersonStorage(personId).setItem(PERSON_DATA_KEYS.backgroundImage, uri);
    setPersonBackgrounds(current => ({ ...current, [personId]: uri }));
    if (personId === activePerson.id) await setBackgroundImage(uri);
    setBackgroundNotice('Background photo saved for this person.');
    void Haptics.selectionAsync();
  }

  async function choosePersonBackground(personId: string) {
    setBackgroundSavingId(personId);
    setBackgroundError('');
    setBackgroundNotice('');
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) throw new Error('Allow photo library access to choose a background picture.');
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], allowsEditing: false, quality: 0.8,
      });
      if (picked.canceled || !picked.assets[0]) return;
      await saveBackgroundAsset(personId, picked.assets[0]);
    } catch (e) {
      setBackgroundError(msg(e, 'Could not save this background picture.'));
    } finally {
      setBackgroundSavingId(null);
    }
  }

  async function takePersonBackgroundPhoto(personId: string) {
    setBackgroundSavingId(personId);
    setBackgroundError('');
    setBackgroundNotice('');
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) throw new Error('Allow camera access to take a background picture.');
      const captured = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.8 });
      if (captured.canceled || !captured.assets[0]) return;
      await saveBackgroundAsset(personId, captured.assets[0]);
    } catch (e) {
      setBackgroundError(msg(e, 'Could not take or save this background picture.'));
    } finally {
      setBackgroundSavingId(null);
    }
  }

  async function clearPersonBackground(personId: string) {
    setBackgroundSavingId(personId);
    setBackgroundError('');
    setBackgroundNotice('');
    try {
      await createPersonStorage(personId).removeItem(PERSON_DATA_KEYS.backgroundImage);
      setPersonBackgrounds(current => ({ ...current, [personId]: null }));
      if (personId === activePerson.id) await setBackgroundImage(null);
      setBackgroundNotice('No background picture is set for this person.');
    } catch (e) {
      setBackgroundError(msg(e, 'Could not remove this background picture.'));
    } finally {
      setBackgroundSavingId(null);
    }
  }

  const load = React.useCallback(async (id: string) => {
    const t = ++token.current;
    setSourceId(id); setSnapshot(null); setLoadError(''); setCopyError('');
    setSel({ r: [], p: [], s: [] }); setLoading(true);
    try {
      const data = await loadPerson(id);
      if (t === token.current) setSnapshot(data);
    } catch (e) {
      if (t === token.current) setLoadError(msg(e, 'Could not load this person.'));
    } finally {
      if (t === token.current) setLoading(false);
    }
  }, [loadPerson]);

  // Active person changed or source vanished: drop stale source state.
  React.useEffect(() => {
    token.current++;
    setSourceId(null); setSnapshot(null); setLoading(false); setLoadError('');
    setSel({ r: [], p: [], s: [] });
  }, [activePerson.id]);

  async function run(fn: () => Promise<void>, fail: string) {
    if (lock.current || busy) return;
    lock.current = true; setWorking(true); setError('');
    try { await fn(); void Haptics.selectionAsync(); } catch (e) { setError(msg(e, fail)); }
    finally { lock.current = false; setWorking(false); }
  }

  function beginEdit(person: Person) {
    if (editingPersonId === person.id) {
      setEditingPersonId(null);
      setError('');
      return;
    }
    setEditingPersonId(person.id);
    setEditingName(person.name);
    setEditingPlaylistRatingDefault(person.defaultRateSkillsAtPlaylistEnd ?? true);
    setEditingSpeakRoutineDescription(person.defaultSpeakRoutineDescription ?? true);
    setEditingSpeechVoiceId(person.speechVoiceId ?? null);
    setEditingReminderSettings({ ...person.defaultPlaylistReminderSettings });
    setError('');
  }

  function submitAdd() {
    void run(async () => {
      await addPerson({
        name,
        speechVoiceId: newPersonSpeechVoiceId,
        defaultRateSkillsAtPlaylistEnd: newPersonPlaylistRatingDefault,
        defaultPlaylistReminderSettings: { ...newPersonReminderSettings },
        defaultSpeakRoutineDescription: newPersonSpeakRoutineDescription,
      });
      setName('');
      setNewPersonSpeechVoiceId(null);
      setNewPersonPlaylistRatingDefault(true);
      setNewPersonSpeakRoutineDescription(true);
      setNewPersonReminderSettings({ ...DEFAULT_PLAYLIST_REMINDER_SETTINGS });
    }, 'Could not add person.');
  }

  function submitEdit(personId: string) {
    void run(async () => {
      await updatePerson(personId, {
        name: editingName,
        speechVoiceId: editingSpeechVoiceId,
        defaultRateSkillsAtPlaylistEnd: editingPlaylistRatingDefault,
        defaultPlaylistReminderSettings: { ...editingReminderSettings },
        defaultSpeakRoutineDescription: editingSpeakRoutineDescription,
      });
      setEditingPersonId(null);
    }, 'Could not update person.');
  }

  function confirmRemove(person: Person) {
    void run(async () => {
      await removePerson(person.id);
      setRemovingPersonId(null);
      setEditingPersonId(null);
    }, 'Could not remove this profile.');
  }

  const toggle = (k: 'r' | 'p' | 's', id: string) =>
    setSel((c) => ({ ...c, [k]: c[k].includes(id) ? c[k].filter((x) => x !== id) : [...c[k], id] }));
  const toggleAll = (k: 'r' | 'p' | 's', ids: string[]) =>
    setSel((c) => ({ ...c, [k]: ids.length > 0 && ids.every((i) => c[k].includes(i)) ? [] : ids }));
  const total = sel.r.length + sel.p.length + sel.s.length;

  async function submitCopy() {
    if (!sourceId || !snapshot || total === 0 || lock.current || busy) return;
    lock.current = true; setWorking(true); setCopyError('');
    try {
      await copyFromPerson(sourceId, { routineIds: sel.r, playlistIds: sel.p, scheduleIds: sel.s });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) { setCopyError(msg(e, 'Could not copy. Nothing was changed.')); }
    finally { lock.current = false; setWorking(false); }
  }

  const Group = <T extends { id: string }>(k: 'r' | 'p' | 's', label: string, items: T[], title: (i: T) => string, prefix: string) => {
    const ids = items.map((i) => i.id);
    const all = ids.length > 0 && ids.every((i) => sel[k].includes(i));
    return (
      <View style={{ gap: 8 }}>
        <View style={styles.row}>
          <Text style={[styles.h2, { color: colors.foreground, flex: 1 }]}>{label} ({items.length})</Text>
          {items.length > 0 ? (
            <Pressable testID={`${prefix}-all`} accessibilityRole="button" accessibilityLabel={`${all ? 'Clear' : 'Select all'} ${label}`}
              disabled={disabled} onPress={() => toggleAll(k, ids)} style={styles.link}>
              <Text style={[styles.linkText, { color: colors.primary }]}>{all ? 'Clear' : 'Select all'}</Text>
            </Pressable>
          ) : null}
        </View>
        {items.length === 0 ? <Text style={[styles.sub, { color: colors.mutedForeground }]}>None to copy.</Text> : null}
        {items.map((i) => {
          const on = sel[k].includes(i.id);
          return (
            <Pressable key={i.id} testID={`${prefix}-${i.id}`} accessibilityRole="checkbox" accessibilityLabel={`${label}: ${title(i)}`}
              accessibilityState={{ checked: on, disabled }} disabled={disabled} onPress={() => toggle(k, i.id)}
              style={[styles.item, { backgroundColor: on ? colors.coralSoft : colors.card, borderColor: on ? colors.primary : colors.border }]}>
              <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? colors.primary : colors.mutedForeground} />
              <Text numberOfLines={2} style={[styles.itemText, { color: colors.foreground }]}>{title(i)}</Text>
            </Pressable>
          );
        })}
      </View>
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <KeyboardAwareScrollViewCompat
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: (Platform.OS === 'web' ? 67 : insets.top) + 8, paddingBottom: (Platform.OS === 'web' ? 34 : insets.bottom) + 30, paddingHorizontal: 20, gap: 18 }}
      >
        <View style={styles.row}>
          <Pressable testID="close-people" accessibilityRole="button" accessibilityLabel="Close people"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={styles.iconBtn}>
            <Ionicons name="close" size={24} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.title, { color: colors.foreground }]}>People</Text>
        </View>
        <Text style={[styles.sub, { color: colors.mutedForeground }]} testID="active-person">
          Active: <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>{activePerson.name}</Text>. Each person keeps their own routines, playlists, schedules and progress. Themes stay per person.
        </Text>
        {notice ? <Text accessibilityLiveRegion="polite" style={[styles.sub, { color: colors.success }]}>{notice}</Text> : null}
        {error ? <Text accessibilityRole="alert" style={[styles.sub, { color: colors.destructive }]}>{error}</Text> : null}

        <View style={{ gap: 8 }}>
          {ordered.map((p) => {
            const active = p.id === activePerson.id;
            return (
              <View key={p.id} style={{ gap: 8 }}>
                <View style={[styles.item, { backgroundColor: colors.card, borderColor: active ? colors.primary : colors.border, borderWidth: active ? 2 : 1 }]}>
                  <Pressable testID={`person-switch-${p.id}`} accessibilityRole="button"
                    accessibilityLabel={active ? `${p.name}, active` : `Switch to ${p.name}`}
                    accessibilityState={{ selected: active, disabled: disabled || active }}
                    disabled={disabled || active}
                    onPress={() => void run(() => switchPerson(p.id), 'Could not switch person.')}
                    style={styles.personSelect}>
                    <View style={[styles.avatar, { backgroundColor: colors.coralSoft }]}>
                      <Text style={[styles.linkText, { color: colors.primary }]}>{p.name.trim().charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={[styles.itemText, { color: colors.foreground }]}>{p.name}</Text>
                      <Text numberOfLines={1} style={[styles.sub, { color: colors.mutedForeground }]}>
                        Personal routines and progress
                      </Text>
                    </View>
                    {active ? <Text style={[styles.linkText, { color: colors.primary }]}>Active</Text> : <Text style={[styles.linkText, { color: colors.mutedForeground }]}>Switch</Text>}
                  </Pressable>
                  <Pressable
                    testID={`person-edit-${p.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={`${editingPersonId === p.id ? 'Close' : 'Edit'} ${p.name} profile`}
                    disabled={disabled}
                    onPress={() => beginEdit(p)}
                    style={styles.editButton}
                  >
                    <Ionicons name={editingPersonId === p.id ? 'close' : 'create-outline'} size={18} color={colors.primary} />
                    <Text style={[styles.linkText, { color: colors.primary }]}>{editingPersonId === p.id ? 'Close' : 'Edit'}</Text>
                  </Pressable>
                  {p.id !== DEFAULT_PERSON_ID ? (
                    <Pressable
                      testID={`person-remove-${p.id}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${p.name} profile`}
                      disabled={disabled}
                      onPress={() => { setRemovingPersonId(p.id); setEditingPersonId(null); setError(''); }}
                      style={styles.editButton}
                    >
                      <Ionicons name="trash-outline" size={18} color={colors.destructive} />
                      <Text style={[styles.linkText, { color: colors.destructive }]}>Remove</Text>
                    </Pressable>
                  ) : null}
                </View>
                {removingPersonId === p.id ? (
                  <View style={[styles.profileEditor, { backgroundColor: colors.card, borderColor: colors.destructive }]}>
                    <Text style={[styles.h2, { color: colors.foreground }]}>Remove {p.name}?</Text>
                    <Text style={[styles.sub, { color: colors.mutedForeground }]}>
                      This permanently deletes their routines, playlists, schedules, skills, progress, and saved photos, and cancels their phone reminders. The Me profile is protected. If this is the active profile, the app switches to Me.
                    </Text>
                    <View style={styles.formActions}>
                      <Pressable
                        testID={`person-remove-cancel-${p.id}`}
                        accessibilityRole="button"
                        accessibilityLabel={`Cancel removing ${p.name}`}
                        disabled={disabled}
                        onPress={() => setRemovingPersonId(null)}
                        style={[styles.btnSecondary, { borderColor: colors.border }]}
                      >
                        <Text style={[styles.linkText, { color: colors.foreground }]}>Cancel</Text>
                      </Pressable>
                      <Pressable
                        testID={`person-remove-confirm-${p.id}`}
                        accessibilityRole="button"
                        accessibilityLabel={`Confirm remove ${p.name} and all saved data`}
                        disabled={disabled}
                        onPress={() => confirmRemove(p)}
                        style={[styles.btn, { backgroundColor: colors.destructive, opacity: disabled ? 0.5 : 1 }]}
                      >
                        <Text style={[styles.linkText, { color: colors.destructiveForeground }]}>{disabled ? 'Removing…' : 'Remove profile'}</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}
                {editingPersonId === p.id ? (
                  <View style={[styles.profileEditor, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.h2, { color: colors.foreground }]}>Edit {p.name}</Text>
                    {p.id === DEFAULT_PERSON_ID ? (
                      <Text style={[styles.sub, { color: colors.mutedForeground }]}>The default profile name stays “Me”.</Text>
                    ) : (
                      <TextInput
                        testID={`person-edit-name-${p.id}`}
                        accessibilityLabel="Person name"
                        placeholder="Name"
                        placeholderTextColor={colors.mutedForeground}
                        value={editingName}
                        onChangeText={(value) => { setEditingName(value); setError(''); }}
                        editable={!disabled}
                        maxLength={50}
                        style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                      />
                    )}
                    <SpeechVoicePreference
                      value={editingSpeechVoiceId}
                      onChange={setEditingSpeechVoiceId}
                      disabled={disabled}
                      testID={`person-speech-voice-${p.id}`}
                    />
                    <View style={[styles.themeSettings, { borderColor: colors.border }]}>
                      <Pressable
                        testID={`person-theme-toggle-${p.id}`}
                        accessibilityRole="button"
                        accessibilityLabel={`${themeDisclosure.isExpanded(p.id) ? 'Collapse' : 'Expand'} ${p.name} theme settings`}
                        accessibilityState={{ expanded: themeDisclosure.isExpanded(p.id) }}
                        onPress={() => void togglePersonThemes(p.id)}
                        style={styles.themeSettingsHeading}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.itemText, { color: colors.foreground }]}>Theme</Text>
                          <Text style={[styles.sub, { color: colors.mutedForeground }]}>
                            {personThemeIds[p.id] ? APP_THEMES.find(item => item.id === personThemeIds[p.id])?.name ?? 'Saved theme' : 'Choose this person’s colors'}
                          </Text>
                        </View>
                        <Ionicons name={themeDisclosure.isExpanded(p.id) ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
                      </Pressable>
                      {themeDisclosure.isExpanded(p.id) ? (
                        <View style={{ gap: 8 }}>
                          <TextInput
                            testID={`person-theme-search-${p.id}`}
                            accessibilityLabel={`Search ${p.name} themes`}
                            placeholder="Search themes"
                            placeholderTextColor={colors.mutedForeground}
                            value={themeSearch}
                            onChangeText={setThemeSearch}
                            style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                          />
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.themeFilterRow}>
                            {(['All', ...THEME_GROUPS] as const).map(group => {
                              const selected = themeGroup === group;
                              return (
                                <Pressable key={group} testID={`person-theme-group-${p.id}-${group.toLowerCase()}`}
                                  accessibilityRole="button" accessibilityState={{ selected }}
                                  onPress={() => setThemeGroup(group)}
                                  style={[styles.themeFilter, { backgroundColor: selected ? colors.primary : colors.card, borderColor: selected ? colors.primary : colors.border }]}>
                                  <Text style={[styles.themeFilterText, { color: selected ? colors.primaryForeground : colors.foreground }]}>{group}</Text>
                                </Pressable>
                              );
                            })}
                          </ScrollView>
                          <View style={styles.themeFilterRow}>
                            {([{ id: 'all', label: 'Any mode' }, { id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }] as const).map(option => {
                              const selected = themeScheme === option.id;
                              return (
                                <Pressable key={option.id} testID={`person-theme-scheme-${p.id}-${option.id}`}
                                  accessibilityRole="button" accessibilityState={{ selected }}
                                  onPress={() => setThemeScheme(option.id)}
                                  style={[styles.themeFilter, { backgroundColor: selected ? colors.primary : colors.card, borderColor: selected ? colors.primary : colors.border }]}>
                                  <Text style={[styles.themeFilterText, { color: selected ? colors.primaryForeground : colors.foreground }]}>{option.label}</Text>
                                </Pressable>
                              );
                            })}
                          </View>
                          <Text style={[styles.sub, { color: colors.mutedForeground }]}>
                            Showing {filteredThemes.length} of {APP_THEMES.length} themes
                          </Text>
                          {themeLoadingId === p.id ? <ActivityIndicator color={colors.primary} /> : null}
                          {themeError ? <Text accessibilityRole="alert" style={[styles.sub, { color: colors.destructive }]}>{themeError}</Text> : null}
                          <ScrollView nestedScrollEnabled style={styles.themeChoices}>
                            <View style={styles.themeChoiceGrid}>
                              {filteredThemes.map(item => {
                                const selected = (personThemeIds[p.id] ?? (p.id === activePerson.id ? theme.id : DEFAULT_THEME_ID)) === item.id;
                                return (
                                  <Pressable
                                    key={item.id}
                                    testID={`person-theme-choice-${p.id}-${item.id}`}
                                    accessibilityRole="button"
                                    accessibilityLabel={`${item.name}, ${item.group}, ${item.scheme} theme`}
                                    accessibilityState={{ selected, disabled: themeSavingId === p.id }}
                                    disabled={themeSavingId === p.id || themeLoadingId === p.id || (p.id === activePerson.id && appearanceLoading)}
                                    onPress={() => void choosePersonTheme(p.id, item.id)}
                                    style={[styles.themeChoice, { borderColor: selected ? colors.primary : colors.border, backgroundColor: colors.card }]}
                                  >
                                    <View style={[styles.themeSwatch, { backgroundColor: item.colors.primary }]} />
                                    <View style={{ flex: 1 }}>
                                      <Text numberOfLines={1} style={[styles.themeChoiceName, { color: colors.foreground }]}>{item.name}</Text>
                                      <Text style={[styles.sub, { color: colors.mutedForeground }]}>{item.scheme}</Text>
                                    </View>
                                    {selected ? <Ionicons name="checkmark-circle" size={18} color={colors.primary} /> : null}
                                  </Pressable>
                                );
                              })}
                            </View>
                          </ScrollView>
                        </View>
                      ) : null}
                    </View>
                    <View style={[styles.themeSettings, { borderColor: colors.border }]}>
                      <Pressable
                        testID={`person-background-toggle-${p.id}`}
                        accessibilityRole="button"
                        accessibilityLabel={`${backgroundDisclosure.isExpanded(p.id) ? 'Collapse' : 'Expand'} ${p.name} background photo settings`}
                        accessibilityState={{ expanded: backgroundDisclosure.isExpanded(p.id) }}
                        onPress={() => void togglePersonBackground(p.id)}
                        style={styles.themeSettingsHeading}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.itemText, { color: colors.foreground }]}>App background photo</Text>
                          <Text style={[styles.sub, { color: colors.mutedForeground }]}>
                            {personBackgrounds[p.id] === undefined ? 'Optional · choose none or a saved photo' : personBackgrounds[p.id] ? 'Photo selected' : 'No photo'}
                          </Text>
                        </View>
                        <Ionicons name={backgroundDisclosure.isExpanded(p.id) ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
                      </Pressable>
                      {backgroundDisclosure.isExpanded(p.id) ? (
                        <View style={{ gap: 8 }}>
                          <Text style={[styles.sub, { color: colors.mutedForeground }]}>
                            This picture is automatically fitted behind the app for this person. Choose a saved photo or take a new one; it stays on this device.
                          </Text>
                          {personBackgrounds[p.id] ? (
                            <Image source={{ uri: personBackgrounds[p.id] ?? undefined }} resizeMode="cover" style={styles.backgroundPreview} />
                          ) : null}
                          {backgroundLoadingId === p.id || backgroundSavingId === p.id ? <ActivityIndicator color={colors.primary} /> : null}
                          {backgroundError ? <Text accessibilityRole="alert" style={[styles.sub, { color: colors.destructive }]}>{backgroundError}</Text> : null}
                          {backgroundNotice ? <Text accessibilityLiveRegion="polite" style={[styles.sub, { color: colors.success }]}>{backgroundNotice}</Text> : null}
                          <View style={styles.backgroundActions}>
                            <Pressable
                              testID={`person-background-choose-${p.id}`}
                              accessibilityRole="button"
                              disabled={backgroundSavingId === p.id || backgroundLoadingId === p.id || (p.id === activePerson.id && appearanceLoading)}
                              onPress={() => void choosePersonBackground(p.id)}
                              style={[styles.backgroundAction, { backgroundColor: colors.primary }]}
                            >
                              <Text style={[styles.linkText, { color: colors.primaryForeground }]}>Choose photo</Text>
                            </Pressable>
                            <Pressable
                              testID={`person-background-camera-${p.id}`}
                              accessibilityRole="button"
                              disabled={backgroundSavingId === p.id || backgroundLoadingId === p.id || (p.id === activePerson.id && appearanceLoading)}
                              onPress={() => void takePersonBackgroundPhoto(p.id)}
                              style={[styles.backgroundAction, { borderColor: colors.border, borderWidth: 1 }]}
                            >
                              <Text style={[styles.linkText, { color: colors.foreground }]}>Take photo</Text>
                            </Pressable>
                            <Pressable
                              testID={`person-background-clear-${p.id}`}
                              accessibilityRole="button"
                              disabled={backgroundSavingId === p.id || backgroundLoadingId === p.id}
                              onPress={() => void clearPersonBackground(p.id)}
                              style={[styles.backgroundAction, { borderColor: colors.border, borderWidth: 1 }]}
                            >
                              <Text style={[styles.linkText, { color: colors.foreground }]}>No photo</Text>
                            </Pressable>
                          </View>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.profileRatingSetting}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.itemText, { color: colors.foreground }]}>Ask for skill ratings at playlist end</Text>
                        <Text style={[styles.sub, { color: colors.mutedForeground }]}>
                          New playlists use this value; you can change it per playlist.
                        </Text>
                      </View>
                      <Switch
                        testID={`person-playlist-rating-default-${p.id}`}
                        accessibilityLabel="Default to skill ratings after the full playlist"
                        disabled={disabled}
                        value={editingPlaylistRatingDefault}
                        onValueChange={setEditingPlaylistRatingDefault}
                        trackColor={{ true: colors.primary, false: colors.border }}
                      />
                    </View>
                    <View style={styles.profileRatingSetting}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.itemText, { color: colors.foreground }]}>Speak routine descriptions by default</Text>
                        <Text style={[styles.sub, { color: colors.mutedForeground }]}>
                          New routines use this setting. You can override it in each routine.
                        </Text>
                      </View>
                      <Switch
                        testID={`person-speak-routine-description-${p.id}`}
                        accessibilityLabel="Speak routine descriptions by default"
                        disabled={disabled}
                        value={editingSpeakRoutineDescription}
                        onValueChange={setEditingSpeakRoutineDescription}
                        trackColor={{ true: colors.primary, false: colors.border }}
                      />
                    </View>
                    <PlaylistReminderDefaults
                      settings={editingReminderSettings}
                      onChange={setEditingReminderSettings}
                      disabled={disabled}
                      testIDPrefix={`person-playlist-reminders-${p.id}`}
                    />
                    <View style={styles.formActions}>
                      <Pressable
                        testID={`person-edit-cancel-${p.id}`}
                        accessibilityRole="button"
                        disabled={disabled}
                        onPress={() => { setEditingPersonId(null); setError(''); }}
                        style={[styles.btnSecondary, { borderColor: colors.border }]}
                      >
                        <Text style={[styles.linkText, { color: colors.foreground }]}>Cancel</Text>
                      </Pressable>
                      <Pressable
                        testID={`person-edit-save-${p.id}`}
                        accessibilityRole="button"
                        disabled={disabled}
                        onPress={() => submitEdit(p.id)}
                        style={[styles.btn, { backgroundColor: colors.primary, opacity: disabled ? 0.5 : 1 }]}
                      >
                        <Text style={[styles.linkText, { color: colors.primaryForeground }]}>Save profile</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>

        <View style={{ gap: 8 }}>
          <Text style={[styles.h2, { color: colors.foreground }]}>Add a person</Text>
          <View style={styles.row}>
            <TextInput testID="person-name-input" accessibilityLabel="New person name" placeholder="Name" maxLength={50}
              placeholderTextColor={colors.mutedForeground} value={name} editable={!disabled}
              onChangeText={(t) => { setName(t); setError(''); }}
              onSubmitEditing={submitAdd}
              returnKeyType="done"
              style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground, flex: 1 }]} />
            <Pressable testID="person-add" accessibilityRole="button" accessibilityLabel="Add person"
              disabled={disabled || !name.trim()}
              onPress={submitAdd}
              style={[styles.btn, { backgroundColor: colors.primary, opacity: disabled || !name.trim() ? 0.5 : 1 }]}>
              <Text style={[styles.linkText, { color: colors.primaryForeground }]}>Add</Text>
            </Pressable>
          </View>
          <SpeechVoicePreference
            value={newPersonSpeechVoiceId}
            onChange={setNewPersonSpeechVoiceId}
            disabled={disabled}
            testID="new-person-speech-voice"
          />
          <View style={[styles.profileRatingSetting, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemText, { color: colors.foreground }]}>Ask for skill ratings at playlist end</Text>
              <Text style={[styles.sub, { color: colors.mutedForeground }]}>
                New playlists use this value; you can change it per playlist.
              </Text>
            </View>
            <Switch
              testID="new-person-playlist-rating-default"
              accessibilityLabel="Default to skill ratings after the full playlist"
              disabled={disabled}
              value={newPersonPlaylistRatingDefault}
              onValueChange={setNewPersonPlaylistRatingDefault}
              trackColor={{ true: colors.primary, false: colors.border }}
            />
          </View>
          <View style={[styles.profileRatingSetting, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemText, { color: colors.foreground }]}>Speak routine descriptions by default</Text>
              <Text style={[styles.sub, { color: colors.mutedForeground }]}>
                New routines use this setting. You can override it in each routine.
              </Text>
            </View>
            <Switch
              testID="new-person-speak-routine-description"
              accessibilityLabel="Speak routine descriptions by default"
              disabled={disabled}
              value={newPersonSpeakRoutineDescription}
              onValueChange={setNewPersonSpeakRoutineDescription}
              trackColor={{ true: colors.primary, false: colors.border }}
            />
          </View>
          <PlaylistReminderDefaults
            settings={newPersonReminderSettings}
            onChange={setNewPersonReminderSettings}
            disabled={disabled}
            testIDPrefix="new-person-playlist-reminders"
          />
          <Text style={[styles.sub, { color: colors.mutedForeground }]}>
            New people start empty and become active right away. Each person keeps separate routines, playlists, schedules, and progress.
          </Text>
        </View>

        <View style={{ gap: 10 }}>
          <Text style={[styles.h2, { color: colors.foreground }]}>Copy into {activePerson.name}</Text>
          <Text style={[styles.sub, { color: colors.mutedForeground }]}>
            Pick another person, then choose what to add. Copies are appended and the source stays untouched. Choosing a playlist or schedule automatically includes the routines and playlists it depends on. Copied items have their own fresh progress. Phone reminders on copied schedules are turned off; re-enable them after copying.
          </Text>
          {sources.length === 0 ? (
            <View style={[styles.empty, { borderColor: colors.border }]}>
              <Ionicons name="people-outline" size={26} color={colors.mutedForeground} />
              <Text style={[styles.sub, { color: colors.mutedForeground }]}>Add another person to copy from.</Text>
            </View>
          ) : (
            <View style={styles.chips}>
              {sources.map((p) => {
                const on = sourceId === p.id;
                return (
                  <Pressable key={p.id} testID={`copy-source-${p.id}`} accessibilityRole="button"
                    accessibilityLabel={`Copy from ${p.name}`} accessibilityState={{ selected: on, disabled }}
                    disabled={disabled} onPress={() => void load(p.id)}
                    style={[styles.chip, { backgroundColor: on ? colors.primary : colors.card, borderColor: on ? colors.primary : colors.border }]}>
                    <Text style={[styles.linkText, { color: on ? colors.primaryForeground : colors.foreground }]}>{p.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          {others.length > 0 && loading ? <ActivityIndicator color={colors.primary} /> : null}
          {loadError && sourceId ? (
            <View accessibilityRole="alert" style={[styles.empty, { borderColor: colors.destructive }]}>
              <Text style={[styles.sub, { color: colors.destructive }]}>{loadError}</Text>
              <Pressable testID="copy-retry" accessibilityRole="button" accessibilityLabel="Retry loading" onPress={() => void load(sourceId)} style={styles.link}>
                <Text style={[styles.linkText, { color: colors.primary }]}>Retry</Text>
              </Pressable>
            </View>
          ) : null}
          {snapshot ? (
            <View style={{ gap: 16 }}>
              {Group('r', 'Routines', snapshot.routines, (i) => i.title, 'copy-routine')}
              {Group('p', 'Playlists', snapshot.playlists, (i) => i.title, 'copy-playlist')}
              {Group('s', 'Schedules', snapshot.schedules, (i) => i.targetTitle, 'copy-schedule')}
              <Text accessibilityLiveRegion="polite" style={[styles.sub, { color: colors.mutedForeground }]}>{total} selected</Text>
              {copyError ? <Text accessibilityRole="alert" style={[styles.sub, { color: colors.destructive }]}>{copyError}</Text> : null}
              <Pressable testID="person-copy-submit" accessibilityRole="button" accessibilityLabel={`Copy ${total} selected items`}
                accessibilityState={{ disabled: disabled || total === 0 }} disabled={disabled || total === 0} onPress={() => void submitCopy()}
                style={[styles.btn, { backgroundColor: colors.primary, opacity: disabled || total === 0 ? 0.5 : 1, minHeight: 50 }]}>
                <Text style={[styles.linkText, { color: colors.primaryForeground }]}>{disabled ? 'Working…' : `Copy ${total} selected`}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

function PlaylistReminderDefaults({
  settings,
  onChange,
  disabled,
  testIDPrefix,
}: {
  settings: RoutineNotificationSettings;
  onChange: (settings: RoutineNotificationSettings) => void;
  disabled: boolean;
  testIDPrefix: string;
}) {
  const colors = useColors();
  const update = (key: keyof RoutineNotificationSettings, value: boolean) =>
    onChange({ ...settings, [key]: value });
  return (
    <View style={[styles.reminderDefaults, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.reminderDefaultsCopy}>
        <Text style={[styles.itemText, { color: colors.foreground }]}>Default routine and playlist reminders</Text>
        <Text style={[styles.sub, { color: colors.mutedForeground }]}>
          Direct routine runs and new playlists start with these choices. Playlist reminders remain editable.
        </Text>
      </View>
      <View style={[styles.reminderDefaultRow, { borderColor: colors.border }]}>
        <Text style={[styles.reminderDefaultLabel, { color: colors.foreground }]}>When a step finishes</Text>
        <Switch
          testID={`${testIDPrefix}-step-completion`}
          accessibilityLabel="Default reminder when a step finishes"
          disabled={disabled}
          value={settings.stepCompletion}
          onValueChange={(value) => update('stepCompletion', value)}
          trackColor={{ true: colors.primary, false: colors.border }}
        />
      </View>
      <View style={[styles.reminderDefaultRow, { borderColor: colors.border }]}>
        <Text style={[styles.reminderDefaultLabel, { color: colors.foreground }]}>When a routine finishes</Text>
        <Switch
          testID={`${testIDPrefix}-routine-completion`}
          accessibilityLabel="Default reminder when a routine finishes"
          disabled={disabled}
          value={settings.routineCompletion}
          onValueChange={(value) => update('routineCompletion', value)}
          trackColor={{ true: colors.primary, false: colors.border }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -10 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 22 },
  h2: { fontFamily: 'Inter_700Bold', fontSize: 16 },
  sub: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  itemText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, flex: 1 },
  personSelect: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, fontFamily: 'Inter_500Medium', fontSize: 15 },
  profileEditor: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 },
  themeSettings: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 8 },
  themeSettingsHeading: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 },
  themeChoices: { maxHeight: 260, borderRadius: 12 },
  themeFilterRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  themeFilter: { minHeight: 34, paddingHorizontal: 12, borderWidth: 1, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  themeFilterText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  themeChoiceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 2 },
  themeChoice: { width: '48%', minHeight: 52, borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 7 },
  themeSwatch: { width: 15, height: 15, borderRadius: 8 },
  themeChoiceName: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  backgroundPreview: { width: '100%', height: 120, borderRadius: 12 },
  backgroundActions: { flexDirection: 'row', gap: 8 },
  backgroundAction: { minHeight: 40, paddingHorizontal: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  profileRatingSetting: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 12 },
  reminderDefaults: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8 },
  reminderDefaultsCopy: { gap: 3, paddingBottom: 2 },
  reminderDefaultRow: { minHeight: 44, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 7 },
  reminderDefaultLabel: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 14 },
  editButton: { minHeight: 44, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  formActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  btnSecondary: { minHeight: 48, paddingHorizontal: 18, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  btn: { minHeight: 48, paddingHorizontal: 20, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  link: { minHeight: 40, paddingHorizontal: 8, justifyContent: 'center' },
  linkText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', gap: 8, padding: 20, borderWidth: 1, borderRadius: 16, borderStyle: 'dashed' },
});
