import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePlaylists } from '@/context/PlaylistContext';
import { usePeople } from '@/context/PeopleContext';
import { useRoutines } from '@/context/RoutineContext';
import { useColors } from '@/hooks/useColors';
import { usePersistentDisclosure } from '@/hooks/usePersistentDisclosure';
import { SkillTagList } from '@/components/SkillPicker';
import { RoutinePdfExportButton } from '@/components/RoutinePdfExportButton';
import { createPlaylistRunLaunch, playablePlaylistIds, type RoutinePlaylist } from '@/lib/playlists';
import { formatDuration, getStepSeconds } from '@/types/routines';

export default function PlaylistsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { activePerson } = usePeople();
  const { playlists, loading, error, reload, deletePlaylist } = usePlaylists();
  const { routines, loading: routinesLoading } = useRoutines();
  const disclosure = usePersistentDisclosure('playlists', activePerson.id);
  const [pendingDelete, setPendingDelete] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const lock = React.useRef(false);

  function seconds(ids: string[]) {
    return playablePlaylistIds(ids, routines).reduce((sum, id) => {
      const r = routines.find((x) => x.id === id);
      return sum + (r ? r.steps.filter((s) => !s.hidden).reduce((a, s) => a + getStepSeconds(s), 0) : 0);
    }, 0);
  }
  function title(id: string) {
    const r = routines.find((x) => x.id === id);
    return r && !r.hidden ? r.title : 'Unavailable routine';
  }
  function start(p: RoutinePlaylist) {
    const launch = createPlaylistRunLaunch(p, routines);
    if (!launch) return;
    const skipped = p.routineIds.length - launch.ids.length;
    setMessage(skipped ? `${skipped} hidden or missing ${skipped === 1 ? 'routine was' : 'routines were'} skipped in “${p.title}”.` : '');
    router.push({
      pathname: '/routine/[id]/run',
      params: launch.params,
    });
  }
  async function remove(id: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage('');
    try {
      await deletePlaylist(id);
      setPendingDelete(null);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not delete the playlist.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  const isLoading = loading || routinesLoading;
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <FlatList
        data={isLoading || error ? [] : playlists}
        keyExtractor={(p) => p.id}
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
                <Text style={[styles.h1, { color: colors.foreground }]}>Playlists</Text>
                <Text style={[styles.sub, { color: colors.mutedForeground }]}>Chain routines into one flow</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Create playlist" testID="create-playlist"
                onPress={() => router.push('/playlist-editor')}
                style={({ pressed }) => [styles.add, { backgroundColor: colors.primary }, pressed && styles.pressed]}>
                <Ionicons name="add" size={21} color={colors.primaryForeground} />
              </Pressable>
            </View>
            <Text style={[styles.note, { color: colors.mutedForeground }]}>
              Playlists are stored on this device. Routine backups do not include playlists.
            </Text>
            {message ? <Text accessibilityRole="alert" testID="playlist-message" style={[styles.msg, { color: colors.inkSoft, backgroundColor: colors.accent + '33' }]}>{message}</Text> : null}
            {isLoading ? <View style={styles.center}><ActivityIndicator color={colors.primary} /></View> : null}
            {!isLoading && error ? (
              <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text accessibilityRole="alert" style={[styles.emptyText, { color: colors.destructive }]}>{error}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Retry loading playlists" testID="retry-playlists" onPress={() => void reload()}
                  style={[styles.btn, { backgroundColor: colors.primary }]}>
                  <Text style={[styles.btnText, { color: colors.primaryForeground }]}>Retry</Text>
                </Pressable>
              </View>
            ) : null}
            {!isLoading && !error && playlists.length === 0 ? (
              <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="list-outline" size={28} color={colors.primary} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No playlists yet</Text>
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Line up your routines and run them back to back.</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Create your first playlist" onPress={() => router.push('/playlist-editor')}
                  style={[styles.btn, { backgroundColor: colors.primary }]}>
                  <Text style={[styles.btnText, { color: colors.primaryForeground }]}>Create playlist</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
          const playable = playablePlaylistIds(item.routineIds, routines);
          const confirming = pendingDelete === item.id;
          const expanded = disclosure.isExpanded(item.id);
          return (
            <View testID={`playlist-${item.id}`} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cardHeading}>
                <Text style={[styles.cardTitle, { color: colors.foreground, flex: 1 }]} numberOfLines={2}>{item.title}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel={`${expanded ? 'Collapse' : 'Expand'} playlist ${item.title}`}
                  accessibilityState={{ expanded }} testID={`toggle-playlist-${item.id}`} onPress={() => disclosure.toggle(item.id)} style={styles.icon}>
                  <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.inkSoft} />
                </Pressable>
              </View>
              {expanded ? <>
                <SkillTagList skillIds={item.skillIds} />
                <Text style={[styles.meta, { color: colors.inkSoft }]}>
                  {playable.length} {playable.length === 1 ? 'routine' : 'routines'} · {formatDuration(seconds(item.routineIds))}
                  {playable.length < item.routineIds.length ? ` · ${item.routineIds.length - playable.length} unavailable` : ''}
                </Text>
                <View style={{ marginTop: 8 }}>
                  {item.routineIds.slice(0, 4).map((id, i) => (
                    <Text key={`${id}-${i}`} style={[styles.preview, { color: colors.mutedForeground }]} numberOfLines={1}>{i + 1}. {title(id)}</Text>
                  ))}
                  {item.routineIds.length > 4 ? <Text style={[styles.preview, { color: colors.mutedForeground }]}>+{item.routineIds.length - 4} more</Text> : null}
                </View>
              </> : null}
              {confirming ? (
                <View style={[styles.confirm, { backgroundColor: colors.coralSoft }]}>
                  <Text style={[styles.meta, { color: colors.foreground }]}>Delete “{item.title}”? Your routines stay untouched.</Text>
                  <View style={styles.row}>
                    <Pressable accessibilityRole="button" accessibilityLabel="Cancel delete" testID={`cancel-delete-${item.id}`} disabled={busy} onPress={() => setPendingDelete(null)} style={styles.small}>
                      <Text style={[styles.btnText, { color: colors.mutedForeground }]}>Cancel</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Confirm delete ${item.title}`} testID={`confirm-delete-${item.id}`} disabled={busy} onPress={() => void remove(item.id)}
                      style={[styles.small, { backgroundColor: colors.destructive, borderRadius: 12 }]}>
                      <Text style={[styles.btnText, { color: colors.destructiveForeground }]}>{busy ? 'Deleting…' : 'Delete'}</Text>
                    </Pressable>
                  </View>
                </View>
              ) : expanded ? (
                <View style={styles.row}>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Start playlist ${item.title}`} accessibilityState={{ disabled: !playable.length }}
                    testID={`start-playlist-${item.id}`} disabled={!playable.length} onPress={() => start(item)}
                    style={[styles.start, { backgroundColor: playable.length ? colors.primary : colors.secondary }]}>
                    <Ionicons name="play" size={15} color={playable.length ? colors.primaryForeground : colors.mutedForeground} />
                    <Text style={[styles.btnText, { color: playable.length ? colors.primaryForeground : colors.mutedForeground }]}>
                      {playable.length ? 'Start' : 'Nothing playable'}
                    </Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Schedule ${item.title}`} accessibilityState={{ disabled: !playable.length }}
                    testID={`schedule-playlist-${item.id}`} disabled={!playable.length}
                    onPress={() => router.push({ pathname: '/schedule-editor', params: { targetType: 'playlist', targetId: item.id } })} style={styles.icon}>
                    <Ionicons name="calendar-outline" size={19} color={playable.length ? colors.primary : colors.border} />
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${item.title}`} testID={`edit-playlist-${item.id}`}
                    onPress={() => router.push({ pathname: '/playlist-editor', params: { id: item.id } })} style={styles.icon}>
                    <Ionicons name="pencil-outline" size={19} color={colors.primary} />
                  </Pressable>
                  <RoutinePdfExportButton
                    title={item.title}
                    kind="playlist"
                    routines={item.routineIds.map(routineId => routines.find(routine => routine.id === routineId))}
                    personName={activePerson.name}
                    personId={activePerson.id}
                    testID={`print-playlist-${item.id}`}
                    buttonStyle={styles.icon}
                    iconColor={colors.primary}
                  />
                  <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${item.title}`} testID={`delete-playlist-${item.id}`}
                    onPress={() => { setPendingDelete(item.id); setMessage(''); }} style={styles.icon}>
                    <Ionicons name="trash-outline" size={19} color={colors.destructive} />
                  </Pressable>
                </View>
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
  card: { borderWidth: 1, borderRadius: 20, padding: 16, marginBottom: 12 },
  cardHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontFamily: 'Inter_700Bold', fontSize: 18 },
  meta: { fontFamily: 'Inter_500Medium', fontSize: 13, marginTop: 4 },
  preview: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19 },
  row: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 6 },
  start: { flex: 1, minHeight: 44, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  confirm: { borderRadius: 14, padding: 12, marginTop: 12 },
  small: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.72 },
});
