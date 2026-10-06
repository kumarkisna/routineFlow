import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import { router, useFocusEffect } from 'expo-router';
import React from 'react';
import { ActivityIndicator, AppState, FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePeople } from '@/context/PeopleContext';
import { usePlaylists } from '@/context/PlaylistContext';
import { useRoutines } from '@/context/RoutineContext';
import { useSchedules } from '@/context/ScheduleContext';
import { useColors } from '@/hooks/useColors';
import { DEFAULT_PLAYLIST_REMINDER_SETTINGS, playablePlaylistIds } from '@/lib/playlists';
import { buildSchedulePrintHtml } from '@/lib/schedulePrint';
import { scheduledPlaylistSource, type RoutineSchedule } from '@/lib/schedules';
import { formatAlertOffset, scheduleAlertOffsets } from '@/lib/scheduleAlerts';

type Row = { kind: 'head'; key: string; label: string } | { kind: 'item'; key: string; item: RoutineSchedule };

export default function ScheduleScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { activePerson } = usePeople();
  const { schedules, loading, error, reload, deleteSchedule } = useSchedules();
  const { routines, loading: rLoading } = useRoutines();
  const { playlists, loading: pLoading } = usePlaylists();
  const [pending, setPending] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [printBusy, setPrintBusy] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const lock = React.useRef(false);
  const printLock = React.useRef(false);
  const [now, setNow] = React.useState(Date.now);
  useFocusEffect(React.useCallback(() => {
    const refresh = () => setNow(Date.now());
    refresh();
    const interval = setInterval(refresh, 10000);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') refresh();
    });
    return () => { clearInterval(interval); subscription.remove(); };
  }, []));
  const isLoading = loading || rLoading || pLoading;

  const rows = React.useMemo<Row[]>(() => {
    const sorted = [...schedules].sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
    const up = sorted.filter((s) => Date.parse(s.scheduledAt) > now);
    const past = sorted.filter((s) => Date.parse(s.scheduledAt) <= now).reverse();
    const out: Row[] = [];
    if (up.length) out.push({ kind: 'head', key: 'h-up', label: 'UPCOMING' }, ...up.map((item) => ({ kind: 'item' as const, key: item.id, item })));
    if (past.length) out.push({ kind: 'head', key: 'h-past', label: 'PAST' }, ...past.map((item) => ({ kind: 'item' as const, key: item.id, item })));
    return out;
  }, [schedules, now]);

  function source(s: RoutineSchedule) {
    if (s.targetType === 'routine') {
      const r = routines.find((x) => x.id === s.targetId);
      if (!r) return {
        title: null as string | null, ids: [] as string[], skillIds: [] as string[],
        rateSkillsAtPlaylistEnd: false, reminderSettings: DEFAULT_PLAYLIST_REMINDER_SETTINGS,
      };
      return {
        title: r.title, ids: r.hidden ? [] : playablePlaylistIds([r.id], routines), skillIds: [] as string[],
        rateSkillsAtPlaylistEnd: false, reminderSettings: DEFAULT_PLAYLIST_REMINDER_SETTINGS,
      };
    }
    const p = scheduledPlaylistSource(s, playlists);
    if (!p) return {
      title: null, ids: [], skillIds: [], rateSkillsAtPlaylistEnd: false,
      reminderSettings: DEFAULT_PLAYLIST_REMINDER_SETTINGS,
    };
    return { title: p.title, ids: playablePlaylistIds(p.routineIds, routines), skillIds: p.skillIds ?? [],
      rateSkillsAtPlaylistEnd: p.rateSkillsAtPlaylistEnd ?? false,
      reminderSettings: p.reminderSettings ?? DEFAULT_PLAYLIST_REMINDER_SETTINGS };
  }
  function start(s: RoutineSchedule) {
    const src = source(s);
    if (!src.ids.length) return;
    if (s.targetType === 'routine') router.push({ pathname: '/routine/[id]/run', params: { id: src.ids[0], autoStart: '1' } });
    else router.push({
      pathname: '/routine/[id]/run',
      params: { id: src.ids[0], queue: JSON.stringify(src.ids), cursor: '0',
        playlistId: s.targetId, playlistTitle: src.title ?? s.targetTitle,
        playlistSkills: JSON.stringify(src.skillIds),
        playlistRateSkillsAtEnd: src.rateSkillsAtPlaylistEnd ? '1' : '0',
         stepReminder: src.reminderSettings.stepCompletion ? '1' : '0',
         routineReminder: src.reminderSettings.routineCompletion ? '1' : '0',
        autoStart: '1' },
    });
  }
  async function remove(id: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage('');
    try { await deleteSchedule(id); setPending(null); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Could not remove the schedule.'); }
    finally { lock.current = false; setBusy(false); }
  }
  function fmt(iso: string) {
    const d = new Date(iso);
    return `${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  }

  async function printSchedule(s: RoutineSchedule) {
    if (printLock.current) return;
    const src = source(s);
    const printableRoutines = src.ids
      .map(id => routines.find(routine => routine.id === id))
      .filter((routine): routine is NonNullable<typeof routine> => routine !== undefined);
    if (!src.title || !printableRoutines.length) {
      setMessage('This schedule has no visible routines to print.');
      return;
    }

    printLock.current = true;
    setPrintBusy(true);
    setMessage('');
    try {
      const html = buildSchedulePrintHtml({
        personName: activePerson.name,
        scheduledAt: s.scheduledAt,
        title: src.title,
        targetType: s.targetType,
        routines: printableRoutines,
      });
      if (Platform.OS === 'web') {
        if (typeof window === 'undefined') throw new Error('Browser printing is unavailable.');
        const printWindow = window.open('', '_blank');
        if (!printWindow) throw new Error('Allow pop-ups in your browser to print this schedule.');
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.onafterprint = () => printWindow.close();
        printWindow.focus();
        printWindow.print();
      } else {
        await Print.printAsync({ html });
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not open the print dialog.');
    } finally {
      printLock.current = false;
      setPrintBusy(false);
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <FlatList
        data={isLoading || error ? [] : rows}
        keyExtractor={(r) => r.key}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: Platform.OS === 'web' ? 67 : insets.top + 12,
          paddingBottom: Platform.OS === 'web' ? 34 + 84 : insets.bottom + 100,
          paddingHorizontal: 20,
        }}
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.h1, { color: colors.foreground }]}>Schedule</Text>
                <Text style={[styles.sub, { color: colors.mutedForeground }]}>Plan routines for later</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="New schedule" testID="new-schedule"
                onPress={() => router.push('/schedule-editor')}
                style={({ pressed }) => [styles.add, { backgroundColor: colors.primary }, pressed && styles.pressed]}>
                <Ionicons name="add" size={21} color={colors.primaryForeground} />
              </Pressable>
            </View>
            <Text style={[styles.note, { color: colors.mutedForeground }]}>
              Schedules are stored on this device only and are not included in routine backups. Nothing plays in the background; tap Start when it is time. The web preview saves dates but reminders need the phone app.
            </Text>
            {message ? <Text accessibilityRole="alert" testID="schedule-message" style={[styles.msg, { color: colors.destructive, backgroundColor: colors.coralSoft }]}>{message}</Text> : null}
            {isLoading ? (
              <View accessibilityLabel="Loading schedules" style={styles.center}><ActivityIndicator color={colors.primary} /></View>
            ) : null}
            {!isLoading && error ? (
              <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text accessibilityRole="alert" style={[styles.emptyText, { color: colors.destructive }]}>{error}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Retry loading schedules" testID="retry-schedules" onPress={() => void reload()}
                  style={[styles.btn, { backgroundColor: colors.primary }]}>
                  <Text style={[styles.btnText, { color: colors.primaryForeground }]}>Retry</Text>
                </Pressable>
              </View>
            ) : null}
            {!isLoading && !error && schedules.length === 0 ? (
              <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="calendar-outline" size={28} color={colors.primary} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Nothing scheduled</Text>
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Pick a routine or playlist and a time that suits you.</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Schedule your first routine" onPress={() => router.push('/schedule-editor')}
                  style={[styles.btn, { backgroundColor: colors.primary }]}>
                  <Text style={[styles.btnText, { color: colors.primaryForeground }]}>New schedule</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item: row }) => {
          if (row.kind === 'head') return <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>{row.label}</Text>;
          const s = row.item;
          const src = source(s);
          const runnable = src.ids.length > 0;
          const past = Date.parse(s.scheduledAt) <= Date.now();
          const confirming = pending === s.id;
          return (
            <View testID={`schedule-${s.id}`} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, opacity: past ? 0.85 : 1 }]}>
              <View style={styles.titleRow}>
                <Ionicons name={s.targetType === 'playlist' ? 'list-outline' : 'sunny-outline'} size={18} color={colors.primary} />
                <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={2}>{src.title ?? s.targetTitle}</Text>
              </View>
              <Text style={[styles.meta, { color: colors.inkSoft }]}>{fmt(s.scheduledAt)}</Text>
              {s.reminder || s.alertOffsetsMinutes ? (
                <Text style={[styles.meta, { color: colors.mutedForeground }]} testID={`schedule-alerts-${s.id}`}>
                  {s.reminder ? 'Phone alerts' : 'Phone alerts off'} · {scheduleAlertOffsets(s).map(formatAlertOffset).join(', ')}
                </Text>
              ) : null}
              <View style={styles.badges}>
                <View style={[styles.badge, { backgroundColor: colors.secondary }]}>
                  <Text style={[styles.badgeText, { color: colors.inkSoft }]}>{s.targetType === 'playlist' ? 'Playlist' : 'Routine'}</Text>
                </View>
                {s.playlistOverride ? (
                  <View style={[styles.badge, { backgroundColor: colors.coralSoft }]}>
                    <Ionicons name="create-outline" size={12} color={colors.primary} />
                    <Text style={[styles.badgeText, { color: colors.primary }]}>Edited for this date</Text>
                  </View>
                ) : null}
                {s.reminder ? (
                  <View style={[styles.badge, { backgroundColor: colors.sageSoft }]}>
                    <Ionicons name="notifications-outline" size={12} color={colors.success} />
                    <Text style={[styles.badgeText, { color: colors.success }]}>
                      {scheduleAlertOffsets(s).length} {scheduleAlertOffsets(s).length === 1 ? 'alert' : 'alerts'}
                    </Text>
                  </View>
                ) : null}
              </View>
              {src.title === null ? <Text style={[styles.meta, { color: colors.mutedForeground }]}>Snapshot unavailable: this {s.targetType} was deleted.</Text>
                : !runnable ? <Text style={[styles.meta, { color: colors.mutedForeground }]}>Hidden or has no visible steps, so it cannot start.</Text> : null}
              {confirming ? (
                <View style={[styles.confirm, { backgroundColor: colors.coralSoft }]}>
                  <Text style={[styles.meta, { color: colors.foreground, marginTop: 0 }]}>Remove this schedule{s.reminder ? ' and all its alerts' : ''}? Your {s.targetType === 'playlist' ? 'playlist and routines' : 'routine'} stay untouched.</Text>
                  <View style={styles.row}>
                    <Pressable accessibilityRole="button" accessibilityLabel="Cancel removing schedule" testID={`cancel-delete-schedule-${s.id}`} disabled={busy} onPress={() => setPending(null)} style={styles.small}>
                      <Text style={[styles.btnText, { color: colors.mutedForeground }]}>Cancel</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Confirm remove schedule for ${s.targetTitle}`} testID={`confirm-delete-schedule-${s.id}`} disabled={busy} onPress={() => void remove(s.id)}
                      style={[styles.small, { backgroundColor: colors.destructive, borderRadius: 12 }]}>
                      <Text style={[styles.btnText, { color: colors.destructiveForeground }]}>{busy ? 'Removing…' : 'Remove'}</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View style={styles.row}>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Start ${s.targetTitle} now`} accessibilityState={{ disabled: !runnable }}
                    testID={`start-schedule-${s.id}`} disabled={!runnable} onPress={() => start(s)}
                    style={[styles.start, { backgroundColor: runnable ? colors.primary : colors.secondary }]}>
                    <Ionicons name="play" size={15} color={runnable ? colors.primaryForeground : colors.mutedForeground} />
                    <Text style={[styles.btnText, { color: runnable ? colors.primaryForeground : colors.mutedForeground }]}>{runnable ? 'Start' : 'Unavailable'}</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Reschedule ${src.title ?? s.targetTitle}`} testID={`edit-schedule-${s.id}`}
                    onPress={() => router.push({ pathname: '/schedule-editor', params: { id: s.id } })}
                    style={({ pressed }) => [styles.reschedule, { borderColor: colors.border }, pressed && styles.pressed]}>
                    <Ionicons name="calendar-outline" size={18} color={colors.primary} />
                    <Text style={[styles.btnText, { color: colors.primary }]}>Reschedule</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Remove schedule for ${s.targetTitle}`} testID={`delete-schedule-${s.id}`}
                    onPress={() => { setPending(s.id); setMessage(''); }} style={styles.icon}>
                    <Ionicons name="trash-outline" size={19} color={colors.destructive} />
                  </Pressable>
                </View>
              )}
              {!confirming ? (
                <Pressable accessibilityRole="button"
                  accessibilityLabel={`Copy ${src.title ?? s.targetTitle} from ${fmt(s.scheduledAt)} to a new date`}
                  testID={`copy-schedule-${s.id}`} accessibilityState={{ disabled: !runnable }}
                  disabled={!runnable}
                  onPress={() => router.push({ pathname: '/schedule-editor', params: { copyId: s.id } })}
                  style={({ pressed }) => [styles.editPl, { borderColor: colors.border, opacity: runnable ? 1 : 0.5 }, pressed && styles.pressed]}>
                  <Ionicons name="copy-outline" size={17} color={colors.primary} />
                  <Text style={[styles.btnText, { color: colors.primary }]}>Copy to new date</Text>
                </Pressable>
              ) : null}
              {!confirming && s.targetType === 'playlist' ? (
                <Pressable accessibilityRole="button" accessibilityLabel={`Edit playlist for this date: ${src.title ?? s.targetTitle}`} testID={`edit-scheduled-playlist-${s.id}`}
                  onPress={() => router.push({ pathname: '/playlist-editor', params: { scheduleId: s.id } })}
                  style={({ pressed }) => [styles.editPl, { borderColor: colors.primary, backgroundColor: colors.coralSoft }, pressed && styles.pressed]}>
                  <Ionicons name="create-outline" size={18} color={colors.primary} />
                  <Text style={[styles.btnText, { color: colors.primary }]}>Edit playlist for this date</Text>
                </Pressable>
              ) : null}
              {!confirming ? (
                <Pressable accessibilityRole="button"
                  accessibilityLabel={`Print ${src.title ?? s.targetTitle} for ${activePerson.name}`}
                  accessibilityState={{ disabled: !runnable || printBusy }}
                  testID={`print-schedule-${s.id}`}
                  disabled={!runnable || printBusy}
                  onPress={() => void printSchedule(s)}
                  style={({ pressed }) => [styles.editPl, { borderColor: colors.border, opacity: runnable && !printBusy ? 1 : 0.5 }, pressed && styles.pressed]}>
                  <Ionicons name="print-outline" size={18} color={colors.primary} />
                  <Text style={[styles.btnText, { color: colors.primary }]}>{printBusy ? 'Preparing print…' : 'Print plan'}</Text>
                </Pressable>
              ) : null}
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  h1: { fontFamily: 'Inter_700Bold', fontSize: 28 },
  sub: { fontFamily: 'Inter_400Regular', fontSize: 14, marginTop: 2 },
  add: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  note: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17, marginBottom: 14 },
  msg: { fontFamily: 'Inter_500Medium', fontSize: 13, padding: 12, borderRadius: 12, marginBottom: 12, overflow: 'hidden' },
  center: { paddingVertical: 40 },
  empty: { borderWidth: 1, borderRadius: 20, padding: 24, alignItems: 'center', gap: 8 },
  emptyTitle: { fontFamily: 'Inter_700Bold', fontSize: 17 },
  emptyText: { fontFamily: 'Inter_400Regular', fontSize: 14, textAlign: 'center' },
  btn: { paddingHorizontal: 18, minHeight: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  btnText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  eyebrow: { fontFamily: 'Inter_600SemiBold', fontSize: 11, letterSpacing: 1.1, marginTop: 10, marginBottom: 10 },
  card: { borderWidth: 1, borderRadius: 20, padding: 16, marginBottom: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { flex: 1, fontFamily: 'Inter_700Bold', fontSize: 17 },
  meta: { fontFamily: 'Inter_500Medium', fontSize: 13, marginTop: 5 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10 },
  badgeText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  row: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 6 },
  start: { flex: 1, minHeight: 44, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  reschedule: { minHeight: 44, paddingHorizontal: 10, borderRadius: 14, borderWidth: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  editPl: { minHeight: 44, marginTop: 8, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  confirm: { borderRadius: 14, padding: 12, marginTop: 12 },
  small: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.72 },
});
