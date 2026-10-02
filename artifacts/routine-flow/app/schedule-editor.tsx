import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Keyboard, Linking, Platform, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { usePlaylists } from '@/context/PlaylistContext';
import { useRoutines } from '@/context/RoutineContext';
import { useSchedules } from '@/context/ScheduleContext';
import { useColors } from '@/hooks/useColors';
import { playablePlaylistIds } from '@/lib/playlists';
import { localDateString, scheduleDate, type ScheduleTargetType } from '@/lib/schedules';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const pad = (n: number) => String(n).padStart(2, '0');

export default function ScheduleEditor() {
  const { id, copyId, targetType, targetId } = useLocalSearchParams<{ id?: string; copyId?: string; targetType?: string; targetId?: string }>();
  const colors = useColors();
  const { schedules, loading, error, reload } = useSchedules();
  const { loading: rLoading } = useRoutines();
  const { loading: pLoading } = usePlaylists();
  const referenceId = copyId ?? id;
  const existing = referenceId ? schedules.find((s) => s.id === referenceId) : undefined;
  if (loading || rLoading || pLoading || error || (referenceId && !existing)) {
    const busy = loading || rLoading || pLoading;
    return (
      <View style={[styles.screen, styles.missing, { backgroundColor: colors.background }]}>
        <Text accessibilityRole={error ? 'alert' : undefined} style={{ color: colors.foreground, fontFamily: 'Inter_500Medium', textAlign: 'center', paddingHorizontal: 24 }}>
          {busy ? 'Loading…' : error || 'Schedule not found'}
        </Text>
        {!busy && error ? <Pressable accessibilityRole="button" accessibilityLabel="Retry loading schedules" testID="retry-schedules" onPress={() => void reload()}><Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>Retry</Text></Pressable> : null}
        {!busy ? <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()}><Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>Go back</Text></Pressable> : null}
      </View>
    );
  }
  const pre = targetType === 'routine' || targetType === 'playlist' ? { type: targetType as ScheduleTargetType, id: targetId ?? '' } : null;
  return <Editor key={copyId ? `copy-${copyId}` : id ?? 'new'} editId={copyId ? undefined : existing?.id} copyId={copyId}
    initial={existing ? { type: existing.targetType, id: existing.targetId, at: copyId ? null : new Date(existing.scheduledAt),
      reminder: existing.reminder, override: existing.playlistOverride, copiedAt: copyId ? existing.scheduledAt : undefined,
      title: existing.targetTitle } : { type: pre?.type ?? 'routine', id: pre?.id ?? '', at: null, reminder: false, override: undefined }} />;
}

function Editor({ editId, copyId, initial }: { editId?: string; copyId?: string; initial: { type: ScheduleTargetType; id: string; at: Date | null; reminder: boolean; override?: { title: string; routineIds: string[] }; copiedAt?: string; title?: string } }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { saveSchedule, copySchedule } = useSchedules();
  const { routines } = useRoutines();
  const { playlists } = usePlaylists();
  const isWeb = Platform.OS === 'web';
  const start = React.useMemo(() => {
    if (initial.at) return initial.at;
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const clock = initial.copiedAt ? new Date(initial.copiedAt) : null;
    d.setHours(clock?.getHours() ?? 9, clock?.getMinutes() ?? 0, 0, 0);
    if (clock && localDateString(d) === localDateString(clock)) d.setDate(d.getDate() + 1);
    return d;
  }, [initial.at, initial.copiedAt]);
  const [type, setType] = React.useState<ScheduleTargetType>(initial.type);
  const [targetId, setTargetId] = React.useState(initial.id);
  const [date, setDate] = React.useState(localDateString(start));
  const initialClock = initial.copiedAt ? new Date(initial.copiedAt) : start;
  const [time, setTime] = React.useState(`${pad(initialClock.getHours())}:${pad(initialClock.getMinutes())}`);
  const [month, setMonth] = React.useState({ y: start.getFullYear(), m: start.getMonth() });
  const [reminder, setReminder] = React.useState(isWeb ? false : initial.reminder);
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const lock = React.useRef(false);

  const routineOpts = routines.filter((r) => !r.hidden && playablePlaylistIds([r.id], routines).length > 0).map((r) => ({ id: r.id, title: r.title }));
  const ov = initial.override && initial.type === 'playlist' && playablePlaylistIds(initial.override.routineIds, routines).length > 0 ? initial.override : null;
  const playlistOpts = playlists.filter((p) => (ov && p.id === initial.id) || playablePlaylistIds(p.routineIds, routines).length > 0)
    .map((p) => ov && p.id === initial.id ? { id: p.id, title: `${ov.title} (This date version)` } : { id: p.id, title: p.title });
  if (ov && !playlistOpts.some((o) => o.id === initial.id)) playlistOpts.unshift({ id: initial.id, title: `${ov.title} (This date version)` });
  const opts = type === 'routine' ? routineOpts : playlistOpts;
  const needsSettings = !isWeb && /settings/i.test(error);

  const today = localDateString(new Date());
  const first = new Date(month.y, month.m, 1);
  const daysIn = new Date(month.y, month.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(first.getDay()).fill(null), ...Array.from({ length: daysIn }, (_, i) => i + 1)];
  function shift(d: number) {
    setMonth((c) => { const n = new Date(c.y, c.m + d, 1); return { y: n.getFullYear(), m: n.getMonth() }; });
  }

  async function save() {
    if (lock.current) return;
    if (!targetId || !opts.some((o) => o.id === targetId)) {
      return setError(copyId ? 'The source is unavailable. Choose a different schedule to copy.' : 'Choose an available routine or playlist.');
    }
    let iso: string;
    try { iso = scheduleDate(date.trim(), time.trim()); }
    catch (e) { return setError(e instanceof Error ? e.message : 'Choose a valid date and time.'); }
    lock.current = true;
    setBusy(true);
    setError('');
    Keyboard.dismiss();
    try {
      const draft = { targetType: type, targetId, scheduledAt: iso, reminder: isWeb ? false : reminder };
      if (copyId) await copySchedule(copyId, draft);
      else await saveSchedule(draft, editId);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the schedule. Please try again.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  const input = [styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }];
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.top, { paddingTop: (isWeb ? 67 : insets.top) + 8 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" testID="close-schedule-editor" disabled={busy} onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="close" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.topTitle, { color: colors.foreground }]}>{copyId ? 'Copy schedule' : editId ? 'Reschedule' : 'New schedule'}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={copyId ? 'Save copied schedule' : editId ? 'Save rescheduled date and time' : 'Save schedule'} testID="schedule-save" disabled={busy} onPress={() => void save()}
          style={({ pressed }) => [styles.save, { backgroundColor: busy ? colors.secondary : colors.primary }, pressed && { opacity: 0.72 }]}>
          <Text style={[styles.saveText, { color: busy ? colors.mutedForeground : colors.primaryForeground }]}>{busy ? 'Saving…' : copyId ? 'Save copy' : editId ? 'Save changes' : 'Save'}</Text>
        </Pressable>
      </View>
      <KeyboardAwareScrollViewCompat keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: (isWeb ? 34 : insets.bottom) + 40 }]} showsVerticalScrollIndicator={false}>
        {copyId && initial.copiedAt ? (
          <View style={[styles.copyNotice, { backgroundColor: colors.coralSoft }]}>
            <Text style={[styles.entryTitle, { color: colors.foreground, marginBottom: 6 }]}>
              From {new Date(initial.copiedAt).toLocaleString(undefined, {
                weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
              })}
            </Text>
            <Text style={[styles.hint, { color: colors.foreground, marginBottom: 0 }]}>
              Choose a new future date and time. The previous entry stays unchanged.
              {initial.override ? ' Its date-only playlist edits and repeats will be copied too.' : ''}
            </Text>
          </View>
        ) : null}
        {editId ? (
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            Choose a new date and time. Saving updates this schedule without adding another.
          </Text>
        ) : null}
        <Text style={[styles.label, { color: colors.inkSoft }]}>What to run</Text>
        {copyId ? (
          <View style={[styles.entry, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.entryTitle, { color: colors.foreground }]}>{opts.find(o => o.id === targetId)?.title ?? initial.title}</Text>
            <Ionicons name={type === 'playlist' ? 'list-outline' : 'sunny-outline'} size={20} color={colors.primary} />
          </View>
        ) : <>
        <View style={styles.seg}>
          {(['routine', 'playlist'] as const).map((t) => (
            <Pressable key={t} accessibilityRole="button" accessibilityLabel={`Schedule a ${t}`} accessibilityState={{ selected: type === t }} testID={`schedule-type-${t}`} disabled={busy}
              onPress={() => { setType(t); setTargetId(''); setError(''); }}
              style={[styles.segBtn, { backgroundColor: type === t ? colors.primary : colors.card, borderColor: colors.border }]}>
              <Text style={[styles.segText, { color: type === t ? colors.primaryForeground : colors.inkSoft }]}>{t === 'routine' ? 'Routine' : 'Playlist'}</Text>
            </Pressable>
          ))}
        </View>
        {opts.length === 0 ? <Text style={[styles.hint, { color: colors.mutedForeground }]}>No visible {type}s with visible steps are available.</Text> : null}
        {opts.map((o) => {
          const sel = o.id === targetId;
          return (
            <Pressable key={o.id} accessibilityRole="button" accessibilityLabel={`${o.title}${sel ? ', selected' : ''}`} accessibilityState={{ selected: sel }} testID={`schedule-target-${o.id}`} disabled={busy}
              onPress={() => { setTargetId(o.id); setError(''); }}
              style={[styles.entry, { backgroundColor: sel ? colors.coralSoft : colors.card, borderColor: sel ? colors.primary : colors.border }]}>
              <Text style={[styles.entryTitle, { color: colors.foreground }]} numberOfLines={1}>{o.title}</Text>
              <Ionicons name={sel ? 'checkmark-circle' : 'ellipse-outline'} size={21} color={sel ? colors.primary : colors.border} />
            </Pressable>
          );
        })}
        </>}

        <Text style={[styles.label, { color: colors.inkSoft, marginTop: 18 }]}>Date</Text>
        <View style={[styles.cal, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.calHead}>
            <Pressable accessibilityRole="button" accessibilityLabel="Previous month" testID="schedule-prev-month" onPress={() => shift(-1)} style={styles.iconBtn}>
              <Ionicons name="chevron-back" size={20} color={colors.primary} />
            </Pressable>
            <Text accessibilityRole="header" style={[styles.calTitle, { color: colors.foreground }]}>{first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Next month" testID="schedule-next-month" onPress={() => shift(1)} style={styles.iconBtn}>
              <Ionicons name="chevron-forward" size={20} color={colors.primary} />
            </Pressable>
          </View>
          <View style={styles.grid}>
            {DOW.map((d, i) => <Text key={i} style={[styles.dow, { color: colors.mutedForeground }]}>{d}</Text>)}
            {cells.map((d, i) => {
              if (d === null) return <View key={`b${i}`} style={styles.cell} />;
              const s = `${month.y}-${pad(month.m + 1)}-${pad(d)}`;
              const past = s < today;
              const sel = s === date;
              return (
                <Pressable key={s} accessibilityRole="button" accessibilityLabel={new Date(month.y, month.m, d).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                  accessibilityState={{ selected: sel, disabled: past }} testID={`schedule-day-${s}`} disabled={past || busy}
                  onPress={() => { setDate(s); setError(''); }} style={styles.cell}>
                  <View style={[styles.day, sel && { backgroundColor: colors.primary }]}>
                    <Text style={[styles.dayText, { color: sel ? colors.primaryForeground : past ? colors.border : colors.foreground }]}>{d}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.two}>
          <View style={{ flex: 3 }}>
            <Text style={[styles.label, { color: colors.inkSoft }]}>Date (YYYY-MM-DD)</Text>
            <TextInput accessibilityLabel="Date, year-month-day" testID="schedule-date-input" value={date} editable={!busy} maxLength={10}
              placeholder="2025-01-31" placeholderTextColor={colors.mutedForeground} autoCapitalize="none" autoCorrect={false}
              keyboardType={isWeb ? 'default' : 'numbers-and-punctuation'}
              onChangeText={(t) => {
                setDate(t); setError('');
                const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(t);
                if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) setMonth({ y: Number(m[1]), m: Number(m[2]) - 1 });
              }} style={input} />
          </View>
          <View style={{ flex: 2 }}>
            <Text style={[styles.label, { color: colors.inkSoft }]}>Time (HH:MM)</Text>
            <TextInput accessibilityLabel="Time, 24-hour hours and minutes" testID="schedule-time-input" value={time} editable={!busy} maxLength={5}
              placeholder="09:00" placeholderTextColor={colors.mutedForeground} autoCapitalize="none" autoCorrect={false}
              keyboardType={isWeb ? 'default' : 'numbers-and-punctuation'}
              onChangeText={(t) => { setTime(t); setError(''); }} onSubmitEditing={() => void save()} style={input} />
          </View>
        </View>

        <View style={[styles.remind, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.entryTitle, { color: colors.foreground }]}>Phone reminder</Text>
            <Text style={[styles.hint, { color: colors.mutedForeground, marginBottom: 0 }]}>
              {isWeb ? 'Reminders need the phone app. In the web preview the date is saved without one.' : 'Reminds you when it is time. Phone settings and battery saving can delay delivery. Tap Start; nothing plays on its own.'}
            </Text>
          </View>
          <Switch accessibilityLabel="Phone reminder" testID="schedule-reminder" value={reminder} disabled={busy || isWeb}
            onValueChange={(v) => { setReminder(v); setError(''); }} trackColor={{ true: colors.primary, false: colors.border }} />
        </View>
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          Date and time use your device’s current time zone.
        </Text>

        {error ? <Text accessibilityRole="alert" testID="schedule-error" style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
        {needsSettings ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Open phone settings" testID="schedule-open-settings"
            onPress={() => { Linking.openSettings().catch(() => setError('Open your phone settings and enable notifications for this app.')); }}
            style={[styles.settingsBtn, { borderColor: colors.primary }]}>
            <Text style={[styles.segText, { color: colors.primary }]}>Open Settings</Text>
          </Pressable>
        ) : null}
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  copyNotice: { padding: 12, borderRadius: 14, marginBottom: 16 },
  missing: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 14 },
  topTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 17 },
  iconBtn: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  save: { paddingHorizontal: 15, paddingVertical: 9, borderRadius: 18 },
  saveText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  content: { paddingHorizontal: 20, paddingTop: 10 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 13, letterSpacing: 0.3, marginBottom: 9 },
  seg: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  segBtn: { flex: 1, minHeight: 44, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  segText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  hint: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17, marginBottom: 10 },
  entry: { minHeight: 52, borderWidth: 1, borderRadius: 15, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 10 },
  entryTitle: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 14, lineHeight: 19 },
  cal: { borderWidth: 1, borderRadius: 18, padding: 10, marginBottom: 14 },
  calHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  calTitle: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dow: { width: '14.2857%', textAlign: 'center', fontFamily: 'Inter_600SemiBold', fontSize: 11, paddingVertical: 6 },
  cell: { width: '14.2857%', height: 42, alignItems: 'center', justifyContent: 'center' },
  day: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontFamily: 'Inter_500Medium', fontSize: 14 },
  two: { flexDirection: 'row', gap: 10 },
  input: { minHeight: 52, borderWidth: 1, borderRadius: 15, paddingHorizontal: 16, fontFamily: 'Inter_500Medium', fontSize: 16, marginBottom: 11 },
  remind: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 15, padding: 14, marginTop: 4 },
  error: { fontFamily: 'Inter_500Medium', fontSize: 13, marginTop: 12 },
  settingsBtn: { minHeight: 44, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
});
