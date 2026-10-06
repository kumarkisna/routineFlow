import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSkills } from '@/context/SkillContext';
import { useColors } from '@/hooks/useColors';
import { MAX_SKILL_NAME } from '@/lib/skills';
import { getSkillAverage } from '@/lib/skills';
import { SkillRatingChart } from '@/components/SkillRatingChart';

export default function SkillsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { skills, ratingWindow, loading, error, reload, createSkill, updateSkill, deleteSkill, setRatingWindow } = useSkills();
  const [draft, setDraft] = React.useState('');
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editingDraft, setEditingDraft] = React.useState('');
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [windowDraft, setWindowDraft] = React.useState(String(ratingWindow));
  const [windowSaving, setWindowSaving] = React.useState(false);
  const [windowMessage, setWindowMessage] = React.useState('');
  const lock = React.useRef(false);
  const windowLock = React.useRef(false);

  React.useEffect(() => { setWindowDraft(String(ratingWindow)); }, [ratingWindow]);

  async function saveRatingWindow() {
    if (windowLock.current) return;
    windowLock.current = true;
    setWindowSaving(true);
    setWindowMessage('');
    try {
      await setRatingWindow(Number(windowDraft));
    } catch (e) {
      setWindowMessage(e instanceof Error ? e.message : 'Could not save this setting.');
    } finally {
      windowLock.current = false;
      setWindowSaving(false);
    }
  }

  async function addSkill() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage('');
    try {
      await createSkill(draft);
      setDraft('');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not create this skill.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!editingId || lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage('');
    try {
      await updateSkill(editingId, editingDraft);
      setEditingId(null);
      setEditingDraft('');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not update this skill.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function removeSkill() {
    if (!pendingDeleteId || lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage('');
    try {
      await deleteSkill(pendingDeleteId);
      setPendingDeleteId(null);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not delete this skill.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <FlatList
        data={loading || error ? [] : skills}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: Platform.OS === 'web' ? 67 : insets.top + 12,
          paddingBottom: Platform.OS === 'web' ? 34 + 84 : insets.bottom + 100,
          paddingHorizontal: 20,
        }}
        ListHeaderComponent={
          <View>
            <Text style={[styles.title, { color: colors.foreground }]}>Skills</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              Create reusable labels for routines, steps, and playlists.
            </Text>
            <View style={[styles.createCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Rating average</Text>
              <Text style={[styles.averageDescription, { color: colors.mutedForeground }]}>
                Each skill’s chart uses its latest N ratings. Choose one shared N from 1 to 100.
              </Text>
              <View style={styles.windowRow}>
                <TextInput
                  accessibilityLabel="Number of ratings in the average"
                  testID="skill-rating-window-input"
                  value={windowDraft}
                  onChangeText={value => { setWindowDraft(value); setWindowMessage(''); }}
                  keyboardType="number-pad"
                  maxLength={3}
                  editable={!windowSaving && !loading && !error}
                  style={[styles.windowInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                />
                <Text style={[styles.windowUnit, { color: colors.inkSoft }]}>ratings</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Save rating average window"
                  testID="save-skill-rating-window"
                  disabled={windowSaving || loading || Boolean(error)}
                  onPress={() => void saveRatingWindow()}
                  style={({ pressed }) => [
                    styles.windowButton,
                    { backgroundColor: windowSaving || loading || error ? colors.secondary : colors.primary },
                    pressed && styles.pressed,
                  ]}
                >
                  {windowSaving
                    ? <ActivityIndicator size="small" color={colors.primaryForeground} />
                    : <Text style={[styles.buttonText, { color: windowSaving || loading || error ? colors.mutedForeground : colors.primaryForeground }]}>Save</Text>}
                </Pressable>
              </View>
              {windowMessage ? <Text accessibilityRole="alert" testID="skill-rating-window-error" style={[styles.message, { color: colors.destructive }]}>{windowMessage}</Text> : null}
            </View>
            <View style={[styles.createCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>New skill</Text>
              <View style={styles.createRow}>
                <TextInput
                  accessibilityLabel="New skill name"
                  testID="new-skill-input"
                  value={draft}
                  onChangeText={value => { setDraft(value); setMessage(''); }}
                  placeholder="e.g. Focus, Mobility, Mindfulness"
                  placeholderTextColor={colors.mutedForeground}
                  maxLength={MAX_SKILL_NAME}
                  editable={!busy && !loading && !error}
                  returnKeyType="done"
                  onSubmitEditing={() => void addSkill()}
                  style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Create skill"
                  testID="create-skill"
                  disabled={busy || loading || Boolean(error)}
                  onPress={() => void addSkill()}
                  style={({ pressed }) => [
                    styles.addButton,
                    { backgroundColor: busy || loading || error ? colors.secondary : colors.primary },
                    pressed && styles.pressed,
                  ]}
                >
                  {busy && !editingId && !pendingDeleteId
                    ? <ActivityIndicator size="small" color={colors.primaryForeground} />
                    : <Ionicons name="add" size={21} color={busy || loading || error ? colors.mutedForeground : colors.primaryForeground} />}
                </Pressable>
              </View>
            </View>
            {message ? (
              <Text accessibilityRole="alert" testID="skills-message" style={[styles.message, { color: colors.destructive }]}>{message}</Text>
            ) : null}
            {loading ? <View style={styles.center}><ActivityIndicator color={colors.primary} /></View> : null}
            {!loading && error ? (
              <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text accessibilityRole="alert" style={[styles.emptyText, { color: colors.destructive }]}>{error}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Retry loading skills" testID="retry-skills" onPress={() => void reload()}
                  style={[styles.retryButton, { backgroundColor: colors.primary }]}>
                  <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Retry</Text>
                </Pressable>
              </View>
            ) : null}
            {!loading && !error && skills.length === 0 ? (
              <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="sparkles-outline" size={28} color={colors.primary} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No skills yet</Text>
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                  Skills are optional. Add one, then assign it to any routine, step, or playlist.
                </Text>
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
          const editing = editingId === item.id;
          const confirming = pendingDeleteId === item.id;
          const average = getSkillAverage(item, ratingWindow);
          return (
            <View testID={`skill-${item.id}`} style={[styles.skillCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {editing ? (
                <>
                  <TextInput
                    accessibilityLabel={`Edit skill ${item.name}`}
                    testID={`edit-skill-input-${item.id}`}
                    value={editingDraft}
                    onChangeText={value => { setEditingDraft(value); setMessage(''); }}
                    maxLength={MAX_SKILL_NAME}
                    editable={!busy}
                    returnKeyType="done"
                    onSubmitEditing={() => void saveEdit()}
                    style={[styles.input, styles.editInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                  />
                  <View style={styles.actions}>
                    <Pressable accessibilityRole="button" accessibilityLabel="Cancel skill edit" testID={`cancel-edit-skill-${item.id}`} disabled={busy}
                      onPress={() => { setEditingId(null); setEditingDraft(''); setMessage(''); }} style={styles.actionButton}>
                      <Text style={[styles.actionText, { color: colors.mutedForeground }]}>Cancel</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Save skill ${item.name}`} testID={`save-skill-${item.id}`} disabled={busy}
                      onPress={() => void saveEdit()} style={[styles.actionButton, { backgroundColor: colors.primary }]}>
                      <Text style={[styles.actionText, { color: colors.primaryForeground }]}>{busy ? 'Saving…' : 'Save'}</Text>
                    </Pressable>
                  </View>
                </>
              ) : confirming ? (
                <View style={[styles.confirm, { backgroundColor: colors.coralSoft }]}>
                  <Text style={[styles.skillName, { color: colors.foreground }]}>Delete “{item.name}”?</Text>
                  <Text style={[styles.emptyText, { color: colors.inkSoft }]}>
                    This removes the skill and unassigns it from routines, steps, playlists, and date-specific playlist versions. Those items stay saved.
                  </Text>
                  <View style={styles.actions}>
                    <Pressable accessibilityRole="button" accessibilityLabel="Cancel skill deletion" testID={`cancel-delete-skill-${item.id}`} disabled={busy}
                      onPress={() => { setPendingDeleteId(null); setMessage(''); }} style={styles.actionButton}>
                      <Text style={[styles.actionText, { color: colors.mutedForeground }]}>Keep skill</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Confirm delete skill ${item.name}`} testID={`confirm-delete-skill-${item.id}`} disabled={busy}
                      onPress={() => void removeSkill()} style={[styles.actionButton, { backgroundColor: colors.destructive }]}>
                      <Text style={[styles.actionText, { color: colors.destructiveForeground }]}>{busy ? 'Removing…' : 'Delete'}</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <>
                  <View style={styles.skillRow}>
                    <View style={[styles.skillIcon, { backgroundColor: colors.sageSoft }]}>
                      <Ionicons name="sparkles-outline" size={17} color={colors.success} />
                    </View>
                    <Text style={[styles.skillName, { color: colors.foreground }]}>{item.name}</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Edit skill ${item.name}`} testID={`edit-skill-${item.id}`} disabled={busy}
                      onPress={() => { setEditingId(item.id); setEditingDraft(item.name); setMessage(''); }}
                      style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
                      <Ionicons name="pencil-outline" size={18} color={colors.primary} />
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Delete skill ${item.name}`} testID={`delete-skill-${item.id}`} disabled={busy}
                      onPress={() => { setPendingDeleteId(item.id); setMessage(''); }}
                      style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
                      <Ionicons name="trash-outline" size={18} color={colors.destructive} />
                    </Pressable>
                  </View>
                  {average.average === null ? (
                    <Text style={[styles.ratingSummary, { color: colors.mutedForeground }]}>No ratings yet</Text>
                  ) : (
                    <Text style={[styles.ratingSummary, { color: colors.inkSoft }]}>
                      Average {average.average.toFixed(1)} / 10 · {average.count} recent {average.count === 1 ? 'rating' : 'ratings'}
                    </Text>
                  )}
                  <SkillRatingChart skill={item} windowSize={ratingWindow} />
                </>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 28 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20, marginTop: 3, marginBottom: 18 },
  createCard: { borderWidth: 1, borderRadius: 18, padding: 14, marginBottom: 14 },
  sectionTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14, marginBottom: 9 },
  averageDescription: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17, marginTop: -4, marginBottom: 10 },
  windowRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  windowInput: { width: 66, height: 44, borderWidth: 1, borderRadius: 12, textAlign: 'center', fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  windowUnit: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 13 },
  windowButton: { minWidth: 82, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  createRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, fontFamily: 'Inter_400Regular', fontSize: 14 },
  addButton: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  skillCard: { borderWidth: 1, borderRadius: 17, padding: 12, marginBottom: 9 },
  skillRow: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 5 },
  skillIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: 5 },
  skillName: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  ratingSummary: { fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 7 },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 },
  actionButton: { minWidth: 86, minHeight: 42, paddingHorizontal: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  editInput: { width: '100%', marginBottom: 2 },
  confirm: { borderRadius: 12, padding: 12 },
  empty: { borderWidth: 1, borderRadius: 18, padding: 22, alignItems: 'center', gap: 8, marginTop: 6 },
  emptyTitle: { fontFamily: 'Inter_700Bold', fontSize: 17 },
  emptyText: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 18, textAlign: 'center' },
  retryButton: { minHeight: 42, borderRadius: 13, paddingHorizontal: 18, justifyContent: 'center', alignItems: 'center', marginTop: 4 },
  buttonText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  center: { paddingVertical: 36 },
  message: { fontFamily: 'Inter_500Medium', fontSize: 13, marginBottom: 12 },
  pressed: { opacity: 0.72 },
});
