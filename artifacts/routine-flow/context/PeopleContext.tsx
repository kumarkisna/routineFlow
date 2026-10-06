import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { APP_THEMES, DEFAULT_THEME_ID, findAppTheme } from '@/lib/appThemes';
import { buildPersonCopy, readPersonSnapshot, repairPersonRoutineDurations } from '@/lib/personCopy';
import { createPersonStorage, DEFAULT_PERSON_ID, PEOPLE_KEY, PERSON_DATA_KEYS, personStorageKey, waitForPersonWrites } from '@/lib/personStorage';
import type { Person, PersonCopySelection, PersonCopySummary, PersonProfileInput, PersonSnapshot } from '@/types/people';

type Registry = { version: 1; people: Person[]; activePersonId: string };
type PeopleContextValue = {
  people: Person[];
  activePerson: Person;
  revision: number;
  busy: boolean;
  notice: string;
  addPerson: (profile: PersonProfileInput) => Promise<void>;
  updatePerson: (id: string, profile: PersonProfileInput) => Promise<void>;
  switchPerson: (id: string) => Promise<void>;
  loadPerson: (id: string) => Promise<PersonSnapshot>;
  copyFromPerson: (sourceId: string, selection: PersonCopySelection) => Promise<PersonCopySummary>;
};
const initialRegistry: Registry = { version: 1, people: [{ id: DEFAULT_PERSON_ID, name: 'Me' }], activePersonId: DEFAULT_PERSON_ID };
const PeopleContext = createContext<PeopleContextValue | null>(null);
const colors = APP_THEMES[0].colors;

function parseRegistry(raw: string): Registry {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object') throw new Error('Saved people are invalid.');
  const item = value as Partial<Registry>;
  if (item.version !== 1 || !Array.isArray(item.people) || !item.people.length
    || item.people.some(person => !person || typeof person.id !== 'string' || !person.id
      || typeof person.name !== 'string' || !person.name.trim())
    || new Set(item.people.map(person => person.id)).size !== item.people.length
    || !item.people.some(person => person.id === DEFAULT_PERSON_ID && person.name === 'Me')
    || !item.people.some(person => person.id === item.activePersonId)) {
    throw new Error('Saved people are invalid. Your data has not been replaced.');
  }
  return {
    version: 1,
    people: item.people.map(person => ({ id: person.id, name: person.name })),
    activePersonId: item.activePersonId!,
  };
}

async function saveRegistry(registry: Registry) {
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
  const [registry, setRegistry] = useState<Registry>(initialRegistry);
  const current = useRef(registry);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [repairPersonId, setRepairPersonId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const operationBusy = useRef(false);
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState('');

  const hydrate = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    setError('');
    setRepairPersonId(null);
    let activePersonId: string | null = null;
    try {
      const raw = await AsyncStorage.getItem(PEOPLE_KEY);
      const next = raw ? parseRegistry(raw) : initialRegistry;
      activePersonId = next.activePersonId;
      if (!raw || JSON.stringify(next) !== raw) await saveRegistry(next);
      await readPersonSnapshot(next.activePersonId);
      await validatePersonSettings(next.activePersonId);
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
  }, []);
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
    const next: Registry = { ...previous, activePersonId: id };
    await saveRegistry(next);
    router.replace('/');
    current.current = next;
    setNotice('');
    setRegistry(next);
  }), [runOperation]);

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
    };
    await AsyncStorage.multiSet([
      [personStorageKey(person.id, PERSON_DATA_KEYS.routines), '[]'],
      [personStorageKey(person.id, PERSON_DATA_KEYS.progress), '{}'],
      [personStorageKey(person.id, PERSON_DATA_KEYS.playlists), '[]'],
      [personStorageKey(person.id, PERSON_DATA_KEYS.schedules), '[]'],
      [personStorageKey(person.id, PERSON_DATA_KEYS.skills), '[]'],
      [personStorageKey(person.id, PERSON_DATA_KEYS.appearance), DEFAULT_THEME_ID],
    ]);
    const next: Registry = { version: 1, people: [...previous.people, person], activePersonId: person.id };
    await saveRegistry(next);
    router.replace('/');
    current.current = next;
    setNotice(`${trimmed} is now active. New people start with their own empty routines, playlists, and schedules.`);
    setRegistry(next);
  }), [runOperation]);

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
    };
    const next: Registry = {
      ...previous,
      people: previous.people.map(person => person.id === id ? updated : person),
    };
    await saveRegistry(next);
    current.current = next;
    setRegistry(next);
    setNotice(`${updated.name}’s profile was updated.`);
  }), [runOperation]);

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

  const activePerson = registry.people.find(person => person.id === registry.activePersonId)!;
  const canRepairDurations = repairPersonId !== null && /needs a valid duration|invalid legacy duration/.test(error);
  const value = useMemo(() => ({
    people: registry.people, activePerson, revision, busy, notice,
    addPerson, updatePerson, switchPerson, loadPerson, copyFromPerson,
  }), [registry.people, activePerson, revision, busy, notice, addPerson, updatePerson, switchPerson, loadPerson, copyFromPerson]);

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