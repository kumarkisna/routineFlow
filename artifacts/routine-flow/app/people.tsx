import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { usePeople } from '@/context/PeopleContext';
import { useColors } from '@/hooks/useColors';
import { DEFAULT_PERSON_ID } from '@/lib/personStorage';
import type { PersonSnapshot } from '@/types/people';

const msg = (e: unknown, fb: string) => (e instanceof Error && e.message ? e.message : fb);

function PersonEmailField({
  label,
  testID,
  value,
  editable,
  onChangeText,
}: {
  label: string;
  testID: string;
  value: string;
  editable: boolean;
  onChangeText: (value: string) => void;
}) {
  const colors = useColors();
  return (
    <View style={styles.emailField}>
      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <TextInput
        testID={testID}
        accessibilityLabel={label}
        placeholder={label}
        placeholderTextColor={colors.mutedForeground}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        maxLength={254}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
      />
    </View>
  );
}

export default function PeopleScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { people, activePerson, busy, notice, addPerson, updatePerson, switchPerson, loadPerson, copyFromPerson } = usePeople();
  const [name, setName] = React.useState('');
  const [newEmailFrom, setNewEmailFrom] = React.useState('');
  const [newEmailTo, setNewEmailTo] = React.useState('');
  const [editingPersonId, setEditingPersonId] = React.useState<string | null>(null);
  const [editingName, setEditingName] = React.useState('');
  const [editingEmailFrom, setEditingEmailFrom] = React.useState('');
  const [editingEmailTo, setEditingEmailTo] = React.useState('');
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

  function beginEdit(person: { id: string; name: string; backupEmailFrom?: string; backupEmailTo?: string }) {
    if (editingPersonId === person.id) {
      setEditingPersonId(null);
      setError('');
      return;
    }
    setEditingPersonId(person.id);
    setEditingName(person.name);
    setEditingEmailFrom(person.backupEmailFrom ?? '');
    setEditingEmailTo(person.backupEmailTo ?? '');
    setError('');
  }

  function submitAdd() {
    void run(async () => {
      await addPerson({ name, backupEmailFrom: newEmailFrom, backupEmailTo: newEmailTo });
      setName('');
      setNewEmailFrom('');
      setNewEmailTo('');
    }, 'Could not add person.');
  }

  function submitEdit(personId: string) {
    void run(async () => {
      await updatePerson(personId, {
        name: editingName,
        backupEmailFrom: editingEmailFrom,
        backupEmailTo: editingEmailTo,
      });
      setEditingPersonId(null);
    }, 'Could not update person.');
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
                        {p.backupEmailTo ? 'Backup recipient set' : 'No backup recipient'}
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
                </View>
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
                    <PersonEmailField
                      testID={`person-edit-email-to-${p.id}`}
                      label="Backup recipient email"
                      value={editingEmailTo}
                      editable={!disabled}
                      onChangeText={(value) => { setEditingEmailTo(value); setError(''); }}
                    />
                    <PersonEmailField
                      testID={`person-edit-email-from-${p.id}`}
                      label="Verified sender email"
                      value={editingEmailFrom}
                      editable={!disabled}
                      onChangeText={(value) => { setEditingEmailFrom(value); setError(''); }}
                    />
                    <Text style={[styles.sub, { color: colors.mutedForeground }]}>
                      These addresses belong to this profile. The sender domain must be verified in Resend; the Resend connection is shared by the app.
                    </Text>
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
          <PersonEmailField
            testID="person-new-email-to"
            label="Backup recipient email"
            value={newEmailTo}
            editable={!disabled}
            onChangeText={(value) => { setNewEmailTo(value); setError(''); }}
          />
          <PersonEmailField
            testID="person-new-email-from"
            label="Verified sender email"
            value={newEmailFrom}
            editable={!disabled}
            onChangeText={(value) => { setNewEmailFrom(value); setError(''); }}
          />
          <Text style={[styles.sub, { color: colors.mutedForeground }]}>
            New people start empty and become active right away. Sender and recipient are saved per person; both are needed to send a backup. The sender domain must be verified in Resend. The Resend connection is shared by the app.
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
  emailField: { width: '100%', gap: 5 },
  fieldLabel: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  profileEditor: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 },
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
