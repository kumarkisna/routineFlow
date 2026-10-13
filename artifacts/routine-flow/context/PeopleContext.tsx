import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { APP_THEMES, DEFAULT_THEME_ID, findAppTheme } from '@/lib/appThemes';
import {
  buildPersonCopy, readPersonExportSnapshot, readPersonSnapshot, repairPersonRoutineDurations,
} from '@/lib/personCopy';
import { initialPeopleRegistry, parsePeopleRegistry, type PeopleRegistry } from '@/lib/peopleRegistry';
import { createScheduleReminderService } from '@/lib/scheduleReminderService';
import { restoreScheduleReminders } from '@/lib/restoreScheduleReminders';
import { Notifications } from '@/lib/localNotifications';
import { persistScheduleChange, type RoutineSchedule } from '@/lib/schedules';
import { DEFAULT_SKILL_RATING_WINDOW } from '@/lib/skills';
import { createPersonStorage, DEFAULT_PERSON_ID, PEOPLE_KEY, PERSON_DATA_KEYS, personStorageKey, waitForPersonWrites } from '@/lib/personStorage';
import { mergePersonRestore, type PersonRestoreSnapshot } from '@/lib/personRestore';
import {
  cleanupOrphanedStepDetailAttachmentCopies, createStepDetailAttachmentCleanupRunner,
  type StepDetailAttachmentCleanupResult,
} from '@/lib/stepDetailAttachmentCleanup';
import type { AllPeopleBackup } from '@/lib/routineTransfer';
import type { Person, PersonCopySelection, PersonCopySummary, PersonProfileInput, PersonSnapshot } from '@/types/people';
import { DEFAULT_PLAYLIST_REMINDER_SETTINGS } from '@/lib/playlists';
import * as FileSystem from 'expo-file-system/legacy';
import { removePersonSavedData } from '@/lib/personRemoval';

export type AllProfilesRestoreSummary = {
  profilesAdded: number;
  profilesMerged: number;
  routinesAdded: number;
  playlistsAdded: number;
  skillsAdded: number;
  ratingsAdded: number;
  schedulesAdded: number;
  progressAdded: number;
  progressKept: number;
  remindersLeftOff: number;
};

export type AllProfilesRestoreName = {
  profileId: string;
  backupName: string;
  suggestedName: string;
};

type PeopleContextValue = {
  people: Person[];
  activePerson: Person;
  revision: number;
  busy: boolean;
  notice: string;
  addPerson: (profile: PersonProfileInput) => Promise<void>;
  updatePerson: (id: string, profile: PersonProfileInput) => Promise<void>;
  removePerson: (id: string) => Promise<void>;
  switchPerson: (id: string) => Promise<void>;
  loadPerson: (id: string) => Promise<PersonSnapshot>;
  copyFromPerson: (sourceId: string, selection: PersonCopySelection) => Promise<PersonCopySummary>;
  restoreAllProfiles: (
    backup: AllPeopleBackup,
    restoreHistory: boolean,
    profileNames?: Record<string, string>,
  ) => Promise<AllProfilesRestoreSummary>;
  attachmentCleanupPending: boolean;
  attachmentCleanupBusy: boolean;
  attachmentCleanupResult: StepDetailAttachmentCleanupResult | null;
  retryAttachmentCleanup: () => Promise<StepDetailAttachmentCleanupResult | null>;
  runAttachmentCleanup: () => Promise<StepDetailAttachmentCleanupResult | null>;
};
const PeopleContext = createContext<PeopleContextValue | null>(null);
const colors = APP_THEMES[0].colors;

function uniqueImportedName(name: string, usedNames: Set<string>) {
  const key = (value: string) => value.toLocaleLowerCase();
  if (!usedNames.has(key(name))) return name;
  const suffix = ' (imported)';
  const base = name.slice(0, 50 - suffix.length).trimEnd();
  let candidate = `${base}${suffix}`;
  let index = 2;
  while (usedNames.has(key(candidate))) {
    const numberedSuffix = ` (imported ${index++})`;
    candidate = `${name.slice(0, 50 - numberedSuffix.length).trimEnd()}${numberedSuffix}`;
  }
  return candidate;
}

export function getAllProfilesRestoreNamePlan(
  backup: AllPeopleBackup,
  localPeople: Person[],
): AllProfilesRestoreName[] {
  const localIds = new Set(localPeople.map(person => person.id));
  const usedNames = new Set(localPeople.map(person => person.name.toLocaleLowerCase()));
  return backup.people.flatMap(({ profile }) => {
    if (localIds.has(profile.id)) return [];
    const suggestedName = uniqueImportedName(profile.name, usedNames);
    usedNames.add(suggestedName.toLocaleLowerCase());
    return [{ profileId: profile.id, backupName: profile.name, suggestedName }];
  });
}

async function saveRegistry(registry: PeopleRegistry) {
  const serialized = JSON.stringify(registry);
  try {
    await AsyncStorage.setItem(PEOPLE_KEY, serialized);
  } catch {
    // Some storage drivers can reject after committing. Confirm before publishing.
    if (await AsyncStorage.getItem(PEOPLE_KEY) !== serialized) {
      throw new Error('The person change could not be saved. Please try again.');
    }
  }
}

async function validatePersonSettings(personId: string) {
  const store = createPersonStorage(personId);
  const [appearance, progress] = await Promise.all([
    store.getItem(PERSON_DATA_KEYS.appearance), store.getItem(PERSON_DATA_KEYS.progress),
  ]);
  if (!findAppTheme(appearance ?? DEFAULT_THEME_ID)) throw new Error('This person’s saved theme could not load.');
  if (progress) {
    const parsed: unknown = JSON.parse(progress);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
      || Object.values(parsed).some(day => !day || typeof day !== 'object' || Array.isArray(day))) {
      throw new Error('This person’s saved history could not load.');
    }
  }
}

export function PeopleProvider({ children }: { children: React.ReactNode }) {
  const [registry, setRegistry] = useState<PeopleRegistry>(initialPeopleRegistry);
  const current = useRef(registry);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [repairPersonId, setRepairPersonId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const operationBusy = useRef(false);
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState('');
  const [attachmentCleanupPending, setAttachmentCleanupPending] = useState(false);
  const [attachmentCleanupBusy, setAttachmentCleanupBusy] = useState(false);
  const [attachmentCleanupResult, setAttachmentCleanupResult] = useState<StepDetailAttachmentCleanupResult | null>(null);
  const runAttachmentCleanup = useMemo(() => createStepDetailAttachmentCleanupRunner(
    onProgress => cleanupOrphanedStepDetailAttachmentCopies(
      FileSystem.documentDirectory, AsyncStorage, FileSystem, onProgress,
    ),
    (status, progress) => {
      setAttachmentCleanupBusy(status === 'running');
      if (progress) setAttachmentCleanupResult(progress);
      if (status === 'complete') setAttachmentCleanupPending(false);
      if (status === 'retry') setAttachmentCleanupPending(true);
    },
    {
      getItem: key => AsyncStorage.getItem(key),
      setItem: (key, value) => AsyncStorage.setItem(key, value),
      removeItem: key => AsyncStorage.removeItem(key),
    },
  ), []);
  const retryAttachmentCleanup = useCallback(async () => {
    const result = await runAttachmentCleanup();
    if (result !== null) setAttachmentCleanupResult(result);
    return result;
  }, [runAttachmentCleanup]);

  const hydrate = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    setError('');
    setRepairPersonId(null);
    let activePersonId: string | null = null;
    try {
      const raw = await AsyncStorage.getItem(PEOPLE_KEY);
      const next = raw ? parsePeopleRegistry(raw) : initialPeopleRegistry;
      activePersonId = next.activePersonId;
      if (!raw || JSON.stringify(next) !== raw) await saveRegistry(next);
      await readPersonSnapshot(next.activePersonId);
      await validatePersonSettings(next.activePersonId);
      void runAttachmentCleanup();
      current.current = next;
      setRegistry(next);
      return true;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Your saved people could not load.';
      setError(message);
      if (activePersonId && /needs a valid duration|invalid legacy duration/.test(message)) {
        setRepairPersonId(activePersonId);
      }
      return false;
    } finally {
      setLoading(false);
    }
  }, [runAttachmentCleanup]);
  useEffect(() => { void hydrate(); }, [hydrate]);

  const repairDurations = useCallback(async () => {
    const personId = repairPersonId;
    if (!personId || loading) return;
    setLoading(true);
    setError('');
    try {
      const repairedSteps = await repairPersonRoutineDurations(personId);
      if (await hydrate()) {
        const noun = repairedSteps === 1 ? 'step duration' : 'step durations';
        setNotice(`Repaired ${repairedSteps} ${noun}. Valid times were kept, and the original routines are preserved in a recovery copy.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Saved routines could not be repaired.');
    } finally {
      setLoading(false);
    }
  }, [hydrate, loading, repairPersonId]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 12000);
    return () => clearTimeout(timer);
  }, [notice]);

  const runOperation = useCallback(async <T,>(operation: () => Promise<T>): Promise<T> => {
    if (operationBusy.current || loading || error) throw new Error('Wait for the current person operation to finish.');
    operationBusy.current = true;
    setBusy(true);
    try {
      await waitForPersonWrites(current.current.activePersonId);
      return await operation();
    } finally {
      operationBusy.current = false;
      setBusy(false);
    }
  }, [loading, error]);

  const switchPerson = useCallback((id: string) => runOperation(async () => {
    const previous = current.current;
    if (!previous.people.some(person => person.id === id)) throw new Error('Person not found.');
    if (previous.activePersonId === id) return;
    await waitForPersonWrites(id);
    await readPersonSnapshot(id);
    await validatePersonSettings(id);
    const next: PeopleRegistry = { ...previous, activePersonId: id };
    await saveRegistry(next);
    void runAttachmentCleanup();
    router.replace('/');
    current.current = next;
    setNotice('');
    setRegistry(next);
  }), [runOperation, runAttachmentCleanup]);

  const addPerson = useCallback((profile: PersonProfileInput) => runOperation(async () => {
    const trimmed = profile.name.trim();
    const previous = current.current;
    if (!trimmed || trimmed.length > 50) throw new Error('Enter a person’s name, up to 50 characters.');
    if (previous.people.some(person => person.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase())) {
      throw new Error('A person with this name already exists.');
    }
    const person: Person = {
      id: `person-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      name: trimmed,
      defaultRateSkillsAtPlaylistEnd: profile.defaultRateSkillsAtPlaylistEnd ?? true,
      defaultPlaylistReminderSettings: {
        stepCompletion: profile.defaultPlaylistReminderSettings?.stepCompletion
          ?? DEFAULT_PLAYLIST_REMINDER_SETTINGS.stepCompletion,
        routineCompletion: profile.defaultPlaylistReminderSettings?.routineCompletion
          ?? DEFAULT_PLAYLIST_REMINDER_SETTINGS.routineCompletion,
      },
    };
    await AsyncStorage.multiSet([
      [personStorageKey(person.id, PERSON_DATA_KEYS.routines), '[]'],
      [personStorageKey(person.id, PERSON_DATA_KEYS.progress), '{}'],
      [personStorageKey(person.id, PERSON_DATA_KEYS.playlists), '[]'],
      [personStorageKey(person.id, PERSON_DATA_KEYS.schedules), '[]'],
      [personStorageKey(person.id, PERSON_DATA_KEYS.skills), '[]'],
      [personStorageKey(person.id, PERSON_DATA_KEYS.skillRatingWindow), String(DEFAULT_SKILL_RATING_WINDOW)],
      [personStorageKey(person.id, PERSON_DATA_KEYS.appearance), DEFAULT_THEME_ID],
    ]);
    const next: PeopleRegistry = { version: 1, people: [...previous.people, person], activePersonId: person.id };
    await saveRegistry(next);
    void runAttachmentCleanup();
    router.replace('/');
    current.current = next;
    setNotice(`${trimmed} is now active. New people start with their own empty routines, playlists, and schedules.`);
    setRegistry(next);
  }), [runOperation, runAttachmentCleanup]);

  const updatePerson = useCallback((id: string, profile: PersonProfileInput) => runOperation(async () => {
    const previous = current.current;
    const existing = previous.people.find(person => person.id === id);
    if (!existing) throw new Error('Person not found.');
    await waitForPersonWrites(id);

    const trimmed = id === DEFAULT_PERSON_ID ? existing.name : profile.name.trim();
    if (!trimmed || trimmed.length > 50) throw new Error('Enter a person’s name, up to 50 characters.');
    if (previous.people.some(person => person.id !== id && person.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase())) {
      throw new Error('A person with this name already exists.');
    }

    const updated: Person = {
      ...existing,
      name: trimmed,
      defaultRateSkillsAtPlaylistEnd:
        profile.defaultRateSkillsAtPlaylistEnd ?? existing.defaultRateSkillsAtPlaylistEnd,
      defaultPlaylistReminderSettings: {
        stepCompletion: profile.defaultPlaylistReminderSettings?.stepCompletion
          ?? existing.defaultPlaylistReminderSettings?.stepCompletion
          ?? DEFAULT_PLAYLIST_REMINDER_SETTINGS.stepCompletion,
        routineCompletion: profile.defaultPlaylistReminderSettings?.routineCompletion
          ?? existing.defaultPlaylistReminderSettings?.routineCompletion
          ?? DEFAULT_PLAYLIST_REMINDER_SETTINGS.routineCompletion,
      },
    };
    const next: PeopleRegistry = {
      ...previous,
      people: previous.people.map(person => person.id === id ? updated : person),
    };
    await saveRegistry(next);
    void runAttachmentCleanup();
    current.current = next;
    setRegistry(next);
    setNotice(`${updated.name}’s profile was updated.`);
  }), [runOperation, runAttachmentCleanup]);

  const removePerson = useCallback((id: string) => runOperation(async () => {
    const previous = current.current;
    const existing = previous.people.find(person => person.id === id);
    if (!existing) throw new Error('Person not found.');
    if (id === DEFAULT_PERSON_ID) throw new Error('The default Me profile cannot be removed.');
    if (previous.people.length <= 1) throw new Error('Keep at least one profile.');
    await waitForPersonWrites(id);

    const reminders = createScheduleReminderService(id, Platform.OS, Notifications);
    await removePersonSavedData(id, AsyncStorage, reminders.cancel);
    await retryAttachmentCleanup();

    const next: PeopleRegistry = {
      version: 1,
      people: previous.people.filter(person => person.id !== id),
      activePersonId: previous.activePersonId === id ? DEFAULT_PERSON_ID : previous.activePersonId,
    };
    await saveRegistry(next);
    current.current = next;
    setRegistry(next);
    setRevision(value => value + 1);
    setNotice(`${existing.name}’s profile and saved data were removed.`);
    if (previous.activePersonId === id) router.replace('/');
  }), [runOperation, retryAttachmentCleanup]);

  const loadPerson = useCallback(async (id: string) => {
    if (!current.current.people.some(person => person.id === id)) throw new Error('Person not found.');
    await waitForPersonWrites(id);
    return readPersonSnapshot(id);
  }, []);

  const copyFromPerson = useCallback((sourceId: string, selection: PersonCopySelection) => runOperation(async () => {
    const destinationId = current.current.activePersonId;
    if (sourceId === destinationId) throw new Error('Choose another person to copy from.');
    if (!current.current.people.some(person => person.id === sourceId)) throw new Error('Source person not found.');
    await waitForPersonWrites(sourceId);
    const [source, destination] = await Promise.all([readPersonSnapshot(sourceId), readPersonSnapshot(destinationId)]);
    const result = buildPersonCopy(source, destination, selection);
    try {
      await AsyncStorage.multiSet([
        [personStorageKey(destinationId, PERSON_DATA_KEYS.routines), JSON.stringify(result.snapshot.routines)],
        [personStorageKey(destinationId, PERSON_DATA_KEYS.playlists), JSON.stringify(result.snapshot.playlists)],
        [personStorageKey(destinationId, PERSON_DATA_KEYS.schedules), JSON.stringify(result.snapshot.schedules)],
        [personStorageKey(destinationId, PERSON_DATA_KEYS.skills), JSON.stringify(result.snapshot.skills)],
        [personStorageKey(destinationId, PERSON_DATA_KEYS.skillRatingWindow), String(result.snapshot.skillRatingWindow)],
      ]);
    } catch {
      router.replace('/');
      setNotice('The copy could not be fully confirmed. Some items may have been added. Existing items were not removed; check them before copying again.');
      setRevision(value => value + 1);
      throw new Error('The copy could not be fully confirmed. Check this person’s items before trying again.');
    }
    setNotice(`Copied ${result.summary.routines} routines, ${result.summary.playlists} playlists, and ${result.summary.schedules} schedules. Copies have separate progress.${result.summary.schedules ? ' Enable phone reminders on copied schedules if needed.' : ''}`);
    router.replace('/');
    setRevision(value => value + 1);
    return result.summary;
  }), [runOperation]);

  const restoreAllProfiles = useCallback((
    backup: AllPeopleBackup,
    restoreHistory: boolean,
    profileNames?: Record<string, string>,
  ) => runOperation(async () => {
    const previous = current.current;
    const allIds = [...new Set([
      ...previous.people.map(person => person.id),
      ...backup.people.map(entry => entry.profile.id),
    ])];
    await Promise.all(allIds.map(waitForPersonWrites));

    const snapshots = new Map<string, PersonRestoreSnapshot>();
    await Promise.all(allIds.map(async id => {
      snapshots.set(id, await readPersonExportSnapshot(id));
    }));

    const namePlan = getAllProfilesRestoreNamePlan(backup, previous.people);
    const plannedNames = new Map(namePlan.map(item => [item.profileId, item.suggestedName]));
    const usedNames = new Set(previous.people.map(person => person.name.toLocaleLowerCase()));
    const addedProfileIds = new Set<string>();
    const mergedProfiles = backup.people.map(entry => {
      const local = previous.people.find(person => person.id === entry.profile.id);
      let name: string;
      if (!local) {
        const plannedName = plannedNames.get(entry.profile.id);
        const requestedName = profileNames?.[entry.profile.id];
        name = requestedName === undefined ? plannedName ?? '' : requestedName.trim();
        if (!name || name.length > 50) {
          throw new Error('Enter a name for each restored profile, up to 50 characters.');
        }
        const nameKey = name.toLocaleLowerCase();
        if (usedNames.has(nameKey)) {
          throw new Error('Each restored profile needs a unique name. Choose a name that is not already in use.');
        }
        usedNames.add(nameKey);
      } else {
        name = local.name;
      }
      const profile: Person = { ...entry.profile, name };
      if (!local) addedProfileIds.add(profile.id);
      if (!findAppTheme(entry.backup.personData?.selectedThemeId ?? '')) {
        throw new Error(`The saved theme for ${profile.name} is not supported by this version.`);
      }
      const snapshot = snapshots.get(profile.id);
      if (!snapshot) throw new Error(`The saved data for ${profile.name} could not be loaded.`);
      return mergePersonRestore(snapshot, profile, entry, restoreHistory);
    });

    const mergedById = new Map(mergedProfiles.map(result => [result.profile.id, result.profile]));
    const nextPeople = [
      ...previous.people.map(person => mergedById.get(person.id) ?? person),
      ...mergedProfiles.filter(result => addedProfileIds.has(result.profile.id)).map(result => result.profile),
    ];
    const expectedValues = new Map<string, string>();
    for (const result of mergedProfiles) {
      const { profile, snapshot } = result;
      expectedValues.set(personStorageKey(profile.id, PERSON_DATA_KEYS.routines), JSON.stringify(snapshot.routines));
      expectedValues.set(personStorageKey(profile.id, PERSON_DATA_KEYS.progress), JSON.stringify(snapshot.progress));
      expectedValues.set(personStorageKey(profile.id, PERSON_DATA_KEYS.playlists), JSON.stringify(snapshot.playlists));
      expectedValues.set(personStorageKey(profile.id, PERSON_DATA_KEYS.schedules), JSON.stringify(snapshot.schedules));
      expectedValues.set(personStorageKey(profile.id, PERSON_DATA_KEYS.skills), JSON.stringify(snapshot.skills));
      expectedValues.set(personStorageKey(profile.id, PERSON_DATA_KEYS.skillRatingWindow), String(snapshot.skillRatingWindow));
      expectedValues.set(personStorageKey(profile.id, PERSON_DATA_KEYS.appearance), snapshot.selectedThemeId);
    }

    try {
      await AsyncStorage.multiSet([...expectedValues.entries()]);
    } catch {
      let confirmed;
      try {
        confirmed = await AsyncStorage.multiGet([...expectedValues.keys()]);
      } catch {
        throw new Error('The all-profiles restore could not be confirmed. Existing data was not removed; retry the same backup.');
      }
      const actual = new Map(confirmed);
      if ([...expectedValues].some(([key, value]) => actual.get(key) !== value)) {
        throw new Error('The all-profiles restore could not be confirmed. Existing data was not removed; retry the same backup.');
      }
    }

    const next: PeopleRegistry = {
      version: 1,
      people: nextPeople,
      activePersonId: backup.activePersonId,
    };
    await saveRegistry(next);
    void runAttachmentCleanup();

    const remindersLeftOff = await restoreScheduleReminders({
      profiles: mergedProfiles,
      existingSchedules: [...snapshots.values()].flatMap(snapshot => snapshot.schedules),
      platform: Platform.OS,
      createStorage: createPersonStorage,
      createReminderService: personId => createScheduleReminderService(personId, Platform.OS, Notifications),
    });

    const summary = mergedProfiles.reduce<AllProfilesRestoreSummary>((total, result) => ({
      profilesAdded: total.profilesAdded + Number(addedProfileIds.has(result.profile.id)),
      profilesMerged: total.profilesMerged + Number(!addedProfileIds.has(result.profile.id)),
      routinesAdded: total.routinesAdded + result.counts.routinesAdded,
      playlistsAdded: total.playlistsAdded + result.counts.playlistsAdded,
      skillsAdded: total.skillsAdded + result.counts.skillsAdded,
      ratingsAdded: total.ratingsAdded + result.counts.ratingsAdded,
      schedulesAdded: total.schedulesAdded + result.counts.schedulesAdded,
      progressAdded: total.progressAdded + result.counts.progressAdded,
      progressKept: total.progressKept + result.counts.progressKept,
      remindersLeftOff: total.remindersLeftOff,
    }), {
      profilesAdded: 0,
      profilesMerged: 0,
      routinesAdded: 0,
      playlistsAdded: 0,
      skillsAdded: 0,
      ratingsAdded: 0,
      schedulesAdded: 0,
      progressAdded: 0,
      progressKept: 0,
      remindersLeftOff,
    });

    const noticeDetails = [
      `${summary.profilesAdded} new ${summary.profilesAdded === 1 ? 'profile' : 'profiles'} added`,
      `${summary.profilesMerged} matching ${summary.profilesMerged === 1 ? 'profile' : 'profiles'} merged`,
      `${summary.routinesAdded} routines and ${summary.playlistsAdded} playlists added`,
      `${summary.skillsAdded} skills and ${summary.ratingsAdded} ratings/reflections merged`,
      `${summary.schedulesAdded} schedules added`,
      restoreHistory ? `${summary.progressAdded} completed steps added` : 'Existing daily progress left unchanged',
      summary.remindersLeftOff
        ? `${summary.remindersLeftOff} imported schedule reminders left off`
        : null,
    ].filter(Boolean).join(' · ');
    current.current = next;
    setRegistry(next);
    setRevision(value => value + 1);
    setNotice(noticeDetails);
    router.replace('/');
    return summary;
  }), [runOperation, runAttachmentCleanup]);

  const activePerson = registry.people.find(person => person.id === registry.activePersonId)!;
  const canRepairDurations = repairPersonId !== null && /needs a valid duration|invalid legacy duration/.test(error);
  const value = useMemo(() => ({
    people: registry.people, activePerson, revision, busy, notice,
    attachmentCleanupPending, attachmentCleanupBusy, attachmentCleanupResult,
    retryAttachmentCleanup, runAttachmentCleanup,
    addPerson, updatePerson, removePerson, switchPerson, loadPerson, copyFromPerson, restoreAllProfiles,
  }), [registry.people, activePerson, revision, busy, notice, attachmentCleanupPending, attachmentCleanupBusy,
    attachmentCleanupResult, retryAttachmentCleanup, runAttachmentCleanup,
    addPerson, updatePerson, removePerson, switchPerson, loadPerson, copyFromPerson, restoreAllProfiles]);

  if (loading || error) {
    return <View style={styles.loading} testID="people-startup">
      {loading ? <ActivityIndicator color={colors.primary} /> : null}
      <Text style={{ color: colors.foreground }}>{error || 'Loading your people…'}</Text>
      {canRepairDurations ? <>
        <Text style={{ color: colors.foreground, textAlign: 'center' }}>
          Steps without a usable time will be set to 1 minute. Valid times are kept, and a backup of the original routines is saved before changes.
        </Text>
        <Pressable
          testID="repair-routine-durations"
          accessibilityRole="button"
          accessibilityLabel="Repair invalid routine durations using a one-minute default"
          accessibilityState={{ disabled: loading }}
          disabled={loading}
          onPress={() => void repairDurations()}
          style={styles.repairButton}
        >
          <Text style={styles.repairText}>Repair saved durations</Text>
        </Pressable>
      </> : null}
      {error ? <Pressable accessibilityRole="button" onPress={() => void hydrate()}><Text style={{ color: colors.primary }}>Retry loading</Text></Pressable> : null}
    </View>;
  }
  return <PeopleContext.Provider value={value}>
    {children}
    <Modal visible={busy} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.scrim}><View style={styles.operation}>
        <ActivityIndicator color={colors.primary} />
        <Text style={{ color: colors.foreground }}>Saving person changes…</Text>
      </View></View>
    </Modal>
  </PeopleContext.Provider>;
}

export function usePeople() {
  const context = useContext(PeopleContext);
  if (!context) throw new Error('usePeople must be used within PeopleProvider');
  return context;
}

export function usePersonStorage() {
  const { activePerson } = usePeople();
  return useMemo(() => createPersonStorage(activePerson.id), [activePerson.id]);
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', gap: 16, padding: 24 },
  repairButton: { minHeight: 46, paddingHorizontal: 20, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  repairText: { color: colors.primaryForeground, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  scrim: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background, padding: 24 },
  operation: { backgroundColor: colors.card, borderRadius: 16, padding: 24, gap: 16, alignItems: 'center' },
});