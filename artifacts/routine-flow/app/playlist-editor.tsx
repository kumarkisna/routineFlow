import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { usePlaylists } from '@/context/PlaylistContext';
import { useRoutines } from '@/context/RoutineContext';
import { useSchedules } from '@/context/ScheduleContext';
import { useSkills } from '@/context/SkillContext';
import { usePeople } from '@/context/PeopleContext';
import { SkillPicker } from '@/components/SkillPicker';
import { useColors } from '@/hooks/useColors';
import { playablePlaylistIds, resolvePlaylistReminderSettings } from '@/lib/playlists';
import { scheduledPlaylistSource } from '@/lib/schedules';
import { formatLocalDateTime } from '@/lib/localDateTime';
import { formatDuration, getStepSeconds } from '@/types/routines';
import type { RoutineNotificationSettings } from '@/types/routines';

export default function PlaylistEditor() {
  const { id, scheduleId } = useLocalSearchParams<{ id?: string; scheduleId?: string }>();
  const colors = useColors();
  const { activePerson } = usePeople();
  const { playlists, loading, error } = usePlaylists();
  const { loading: rLoading } = useRoutines();
  const { schedules, loading: sLoading, error: sError } = useSchedules();
  const existing = id ? playlists.find((p) => p.id === id) : undefined;
  const schedule = scheduleId ? schedules.find((s) => s.id === scheduleId) : undefined;
  const hasOverride = !!schedule?.playlistOverride;
  const scheduled = scheduleId ? (schedule && schedule.targetType === 'playlist' ? scheduledPlaylistSource(schedule, playlists) : null) : undefined;
  const busyLoad = loading || rLoading || (!!scheduleId && sLoading);
  const problem = scheduleId
    ? (sError || (!busyLoad && !schedule ? 'Scheduled playlist not found' : '') || (!busyLoad && !hasOverride && error ? error : '') || (!busyLoad && !scheduled ? 'The original playlist is unavailable.' : ''))
    : (error || (id && !existing ? 'Playlist not found' : ''));
  if (busyLoad || problem) {
    return (
      <View style={[styles.screen, styles.missing, { backgroundColor: colors.background }]}>
        <Text accessibilityRole={problem ? 'alert' : undefined} style={{ color: colors.foreground, fontFamily: 'Inter_500Medium', textAlign: 'center', paddingHorizontal: 24 }}>
          {busyLoad ? 'Loading…' : problem}
        </Text>
        {!busyLoad ? <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()}><Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>Go back</Text></Pressable> : null}
      </View>
    );
  }
  const origOk = !!schedule && !!playlists.find((p) => p.id === schedule.targetId) && !error;
  const src = scheduled ?? existing;
  return <Editor key={scheduleId ? `s-${scheduleId}` : id ?? 'new'} editId={existing?.id} scheduleId={scheduleId} hasOverride={hasOverride} canReset={origOk}
    initialTitle={src?.title ?? ''} initialIds={src?.routineIds ?? []} initialSkillIds={src?.skillIds ?? []}
    initialRateSkillsAtPlaylistEnd={src
      ? src.rateSkillsAtPlaylistEnd ?? true
      : activePerson.defaultRateSkillsAtPlaylistEnd}
    initialReminderSettings={resolvePlaylistReminderSettings(activePerson.defaultPlaylistReminderSettings, src?.reminderSettings)} />;
}

function Editor({ editId, scheduleId, hasOverride, canReset, initialTitle, initialIds, initialSkillIds,
  initialRateSkillsAtPlaylistEnd, initialReminderSettings }: {
  editId?: string; scheduleId?: string; hasOverride: boolean; canReset: boolean;
  initialTitle: string; initialIds: string[]; initialSkillIds: string[]; initialRateSkillsAtPlaylistEnd: boolean;
  initialReminderSettings: RoutineNotificationSettings;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { savePlaylist } = usePlaylists();
  const { schedules, savePlaylistForSchedule, resetScheduledPlaylist } = useSchedules();
  const appointment = scheduleId ? schedules.find(item => item.id === scheduleId) : undefined;
  const { routines } = useRoutines();
  const { skills } = useSkills();
  const [confirmReset, setConfirmReset] = React.useState(false);
  const [title, setTitle] = React.useState(initialTitle);
  const [ids, setIds] = React.useState<string[]>(initialIds);
  const [skillIds, setSkillIds] = React.useState<string[]>(initialSkillIds);
  const [rateSkillsAtPlaylistEnd, setRateSkillsAtPlaylistEnd] = React.useState(initialRateSkillsAtPlaylistEnd);
  const [reminderSettings, setReminderSettings] = React.useState<RoutineNotificationSettings>({ ...initialReminderSettings });
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const lock = React.useRef(false);
  const addable = routines.filter((r) => playablePlaylistIds([r.id], routines).length > 0);

  function info(rid: string) {
    const r = routines.find((x) => x.id === rid);
    if (!r || r.hidden || !playablePlaylistIds([rid], routines).length) return null;
    return { title: r.title, secs: r.steps.filter((s) => !s.hidden).reduce((a, s) => a + getStepSeconds(s), 0) };
  }
  function move(i: number, d: -1 | 1) {
    setIds((cur) => {
      const n = [...cur];
      [n[i], n[i + d]] = [n[i + d], n[i]];
      return n;
    });
    setError('');
    void Haptics.selectionAsync();
  }
  async function save() {
    if (lock.current) return;
    if (!title.trim()) return setError('Give your playlist a name.');
    if (!ids.length) return setError('Add at least one routine.');
    lock.current = true;
    setBusy(true);
    setError('');
    Keyboard.dismiss();
    try {
      const availableSkills = new Set(skills.map(skill => skill.id));
      const savedSkillIds = skillIds.filter(id => availableSkills.has(id));
      if (scheduleId) await savePlaylistForSchedule(scheduleId, title, ids, savedSkillIds, reminderSettings);
      else await savePlaylist(title, ids, editId, savedSkillIds, rateSkillsAtPlaylistEnd, reminderSettings);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the playlist. Please try again.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function reset() {
    if (lock.current || !scheduleId) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await resetScheduledPlaylist(scheduleId);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not restore the original playlist.');
      setConfirmReset(false);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.top, { paddingTop: (Platform.OS === 'web' ? 67 : insets.top) + 8 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" testID="close-playlist-editor" disabled={busy} onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="close" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.topTitle, { color: colors.foreground }]}>{scheduleId ? 'Edit for this date' : editId ? 'Edit playlist' : 'New playlist'}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={scheduleId ? 'Save playlist for this date only' : 'Save playlist'} testID={scheduleId ? 'save-scheduled-playlist' : 'save-playlist'} disabled={busy} onPress={() => void save()}
          style={({ pressed }) => [styles.save, { backgroundColor: busy ? colors.secondary : colors.primary }, pressed && { opacity: 0.72 }]}>
          <Text style={[styles.saveText, { color: busy ? colors.mutedForeground : colors.primaryForeground }]}>{busy ? 'Saving…' : 'Save'}</Text>
        </Pressable>
      </View>
      <KeyboardAwareScrollViewCompat contentContainerStyle={[styles.content, { paddingBottom: (Platform.OS === 'web' ? 34 : insets.bottom) + 40 }]} showsVerticalScrollIndicator={false}>
        {scheduleId ? (
          <View style={[styles.notice, { backgroundColor: colors.coralSoft }]}>
            {appointment ? (
              <Text style={[styles.saveText, { color: colors.foreground, marginBottom: 6 }]}>
                {formatLocalDateTime(new Date(appointment.scheduledAt), {
                  weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                })}
              </Text>
            ) : null}
            <Text style={[styles.count, { color: colors.foreground, fontSize: 13 }]}>
              Changes apply to this scheduled date and time only. The original saved playlist is unchanged.
            </Text>
          </View>
        ) : null}
        <Text style={[styles.label, { color: colors.inkSoft }]}>Name</Text>
        <TextInput accessibilityLabel="Playlist name" testID="playlist-name-input" placeholder="Name your playlist" placeholderTextColor={colors.mutedForeground}
          value={title} maxLength={100} editable={!busy} returnKeyType="done" onSubmitEditing={() => void save()}
          onChangeText={(t) => { setTitle(t); setError(''); }}
          style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
        <SkillPicker selectedIds={skillIds} onChange={setSkillIds} disabled={busy} testIDPrefix="playlist-skill" />
        {!scheduleId ? (
          <View style={[styles.ratingSetting, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.ratingSettingCopy}>
              <Text style={[styles.ratingSettingTitle, { color: colors.foreground }]}>Rate skills after the full playlist</Text>
              <Text style={[styles.ratingSettingHint, { color: colors.mutedForeground }]}>
                When on, ask once after the last routine instead of after each routine. New playlists use the person default; you can change it here.
              </Text>
            </View>
            <Switch
              accessibilityLabel="Ask for skill ratings after the full playlist"
              testID="playlist-rate-skills-at-end"
              disabled={busy}
              value={rateSkillsAtPlaylistEnd}
              onValueChange={setRateSkillsAtPlaylistEnd}
              trackColor={{ true: colors.primary, false: colors.border }}
            />
          </View>
        ) : null}
        {!scheduleId ? (
          <View style={[styles.reminderSettings, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.ratingSettingCopy}>
              <Text style={[styles.ratingSettingTitle, { color: colors.foreground }]}>Reminders</Text>
              <Text style={[styles.ratingSettingHint, { color: colors.mutedForeground }]}>
                {editId
                  ? 'These apply to runs started from this playlist. Changing them will not change the person defaults.'
                  : 'Starts with the person defaults. You can change these for this playlist.'}
              </Text>
            </View>
            <View style={[styles.reminderRow, { borderColor: colors.border }]}>
              <Text style={[styles.reminderLabel, { color: colors.foreground }]}>When a step finishes</Text>
              <Switch
                accessibilityLabel="Remind when a step finishes"
                testID="playlist-step-completion-reminder"
                disabled={busy}
                value={reminderSettings.stepCompletion}
                onValueChange={(value) => setReminderSettings(current => ({ ...current, stepCompletion: value }))}
                trackColor={{ true: colors.primary, false: colors.border }}
              />
            </View>
            <View style={[styles.reminderRow, { borderColor: colors.border }]}>
              <Text style={[styles.reminderLabel, { color: colors.foreground }]}>When a routine finishes</Text>
              <Switch
                accessibilityLabel="Remind when a routine finishes"
                testID="playlist-routine-completion-reminder"
                disabled={busy}
                value={reminderSettings.routineCompletion}
                onValueChange={(value) => setReminderSettings(current => ({ ...current, routineCompletion: value }))}
                trackColor={{ true: colors.primary, false: colors.border }}
              />
            </View>
          </View>
        ) : null}

        <View style={styles.hdr}>
          <Text style={[styles.label, { color: colors.inkSoft, marginBottom: 0 }]}>Order</Text>
          <Text style={[styles.count, { color: colors.mutedForeground }]}>{ids.length} added</Text>
        </View>
        {ids.length === 0 ? <Text style={[styles.count, { color: colors.mutedForeground, marginBottom: 12 }]}>Tap a routine below to add it. Repeats are fine.</Text> : null}
        {ids.map((rid, i) => {
          const r = info(rid);
          const name = r?.title ?? 'Unavailable routine';
          return (
            <View key={`${rid}-${i}`} testID={`playlist-entry-${i}`} style={[styles.entry, { backgroundColor: r ? colors.card : colors.secondary, borderColor: colors.border }]}>
              <View style={[styles.num, { backgroundColor: r ? colors.sageSoft : colors.border }]}>
                <Text style={[styles.numText, { color: r ? colors.success : colors.mutedForeground }]}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.entryTitle, { color: r ? colors.foreground : colors.mutedForeground }]} numberOfLines={2}>{name}</Text>
                <Text style={[styles.count, { color: colors.mutedForeground }]}>{r ? formatDuration(r.secs) : 'Hidden or missing · skipped when run'}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={`Move ${name} up`} testID={`move-playlist-up-${i}`} disabled={i === 0 || busy} onPress={() => move(i, -1)} style={styles.act}>
                <Ionicons name="chevron-up" size={20} color={i === 0 ? colors.border : colors.primary} />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Move ${name} down`} testID={`move-playlist-down-${i}`} disabled={i === ids.length - 1 || busy} onPress={() => move(i, 1)} style={styles.act}>
                <Ionicons name="chevron-down" size={20} color={i === ids.length - 1 ? colors.border : colors.primary} />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${name} at position ${i + 1}`} testID={`remove-playlist-entry-${i}`} disabled={busy}
                onPress={() => { setIds((c) => c.filter((_, k) => k !== i)); setError(''); }} style={styles.act}>
                <Ionicons name="close-circle-outline" size={20} color={colors.mutedForeground} />
              </Pressable>
            </View>
          );
        })}

        <Text style={[styles.label, { color: colors.inkSoft, marginTop: 18 }]}>Add routines</Text>
        {addable.length === 0 ? <Text style={[styles.count, { color: colors.mutedForeground }]}>No visible routines with visible steps yet.</Text> : null}
        {addable.map((r) => (
          <Pressable key={r.id} accessibilityRole="button" accessibilityLabel={`Add ${r.title}`} testID={`add-routine-${r.id}`} disabled={busy || ids.length >= 100}
            onPress={() => { setIds((c) => [...c, r.id]); setError(''); void Haptics.selectionAsync(); }}
            style={({ pressed }) => [styles.entry, { backgroundColor: colors.card, borderColor: colors.border }, pressed && { opacity: 0.72 }]}>
            <View style={[styles.num, { backgroundColor: colors.coralSoft }]}><Ionicons name="add" size={17} color={colors.primary} /></View>
            <Text style={[styles.entryTitle, { flex: 1, color: colors.foreground }]} numberOfLines={1}>{r.title}</Text>
          </Pressable>
        ))}
        {error ? <Text accessibilityRole="alert" testID="playlist-error" style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
        {scheduleId && hasOverride ? (
          confirmReset ? (
            <View style={[styles.notice, { backgroundColor: colors.coralSoft, marginTop: 18 }]}>
              <Text style={[styles.count, { color: colors.foreground, fontSize: 13 }]}>Discard this date's version and use the original playlist? Your edits for this date will be lost.</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <Pressable accessibilityRole="button" accessibilityLabel="Keep date version" testID="cancel-reset-scheduled-playlist" disabled={busy} onPress={() => setConfirmReset(false)} style={styles.rbtn}>
                  <Text style={[styles.saveText, { color: colors.mutedForeground }]}>Keep</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Confirm use original playlist" testID="confirm-reset-scheduled-playlist" disabled={busy} onPress={() => void reset()} style={[styles.rbtn, { backgroundColor: colors.destructive }]}>
                  <Text style={[styles.saveText, { color: colors.destructiveForeground }]}>{busy ? 'Restoring…' : 'Use original'}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={{ marginTop: 18 }}>
              <Pressable accessibilityRole="button" accessibilityLabel="Use original playlist for this date" accessibilityState={{ disabled: !canReset || busy }} testID="reset-scheduled-playlist" disabled={!canReset || busy}
                onPress={() => setConfirmReset(true)} style={[styles.rbtn, { borderWidth: 1, borderColor: colors.border }]}>
                <Text style={[styles.saveText, { color: canReset ? colors.primary : colors.mutedForeground }]}>Use original playlist for this date</Text>
              </Pressable>
              {!canReset ? <Text style={[styles.count, { color: colors.mutedForeground, marginTop: 6 }]}>The original playlist is missing or unavailable, so this date's version is kept.</Text> : null}
            </View>
          )
        ) : null}
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { borderRadius: 14, padding: 12, marginBottom: 14 },
  ratingSetting: { borderWidth: 1, borderRadius: 15, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  reminderSettings: { borderWidth: 1, borderRadius: 15, padding: 13, gap: 8, marginBottom: 10 },
  reminderRow: { minHeight: 42, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 7, flexDirection: 'row', alignItems: 'center', gap: 12 },
  reminderLabel: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 14 },
  ratingSettingCopy: { flex: 1, gap: 4 },
  ratingSettingTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  ratingSettingHint: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17 },
  rbtn: { flex: 1, minHeight: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  screen: { flex: 1 },
  missing: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 14 },
  topTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 17 },
  iconBtn: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  save: { paddingHorizontal: 15, paddingVertical: 9, borderRadius: 18 },
  saveText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  content: { paddingHorizontal: 20, paddingTop: 10 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 13, letterSpacing: 0.3, marginBottom: 9 },
  input: { minHeight: 52, borderWidth: 1, borderRadius: 15, paddingHorizontal: 16, fontFamily: 'Inter_500Medium', fontSize: 16, marginBottom: 11 },
  hdr: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 9 },
  count: { fontFamily: 'Inter_400Regular', fontSize: 12 },
  entry: { minHeight: 60, borderWidth: 1, borderRadius: 15, paddingLeft: 12, paddingRight: 4, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  num: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  numText: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  entryTitle: { fontFamily: 'Inter_500Medium', fontSize: 14, lineHeight: 19 },
  act: { width: 34, height: 40, alignItems: 'center', justifyContent: 'center' },
  error: { fontFamily: 'Inter_500Medium', fontSize: 13, marginTop: 10 },
});
